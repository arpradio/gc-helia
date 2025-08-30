import { NextRequest, NextResponse } from 'next/server';
import { verifiedFetch } from '@helia/verified-fetch';
import { extractCidFromIpfsUrl, isLikelyImage } from '@/app/utils/ipfs-utils';

interface ErrorResponse {
  error: string;
  details?: string;
}

interface SuccessResponse {
  success: boolean;
  contentType?: string;
  size?: number;
}

interface IPFSRequestValidation {
  cid: string;
  path?: string;
}

type RouteResponse = ErrorResponse | SuccessResponse;

const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg', 
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp'
]);

const DEFAULT_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=31536000, immutable',
  'X-Content-Type-Options': 'nosniff',
} as const;

async function validateIPFSRequest(searchParams: URLSearchParams): Promise<IPFSRequestValidation | { error: string }> {
  const cidParam = searchParams.get('cid');
  const pathParam = searchParams.get('path') || '';
  
  if (!cidParam) {
    return { error: 'Missing required parameter: cid' };
  }

  const extractedCid = extractCidFromIpfsUrl(cidParam);
  if (!extractedCid) {
    return { error: 'Invalid CID format' };
  }

  return {
    cid: extractedCid,
    path: pathParam || undefined
  };
}

async function fetchIPFSContent(cid: string, path?: string): Promise<Response> {
  const ipfsPath = path ? `ipfs://${cid}/${path}` : `ipfs://${cid}`;
  
  try {
    const response = await verifiedFetch(ipfsPath, {
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      throw new Error(`IPFS fetch failed: ${response.status} ${response.statusText}`);
    }

    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout: IPFS content retrieval took too long');
    }
    throw error;
  }
}

function determineContentType(response: Response, cid: string, path?: string): string {
  const responseContentType = response.headers.get('content-type');
  
  if (responseContentType) {
    return responseContentType;
  }

  if (path) {
    const extension = path.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'svg':
        return 'image/svg+xml';
      case 'bmp':
        return 'image/bmp';
      case 'json':
        return 'application/json';
      case 'txt':
        return 'text/plain';
      case 'html':
        return 'text/html';
      case 'css':
        return 'text/css';
      case 'js':
        return 'application/javascript';
      default:
        return 'application/octet-stream';
    }
  }

  return isLikelyImage(cid) ? 'image/jpeg' : 'application/octet-stream';
}

function createErrorResponse(error: string, details?: string, status: number = 400): NextResponse<RouteResponse> {
  return NextResponse.json(
    { error, details },
    { status }
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);

  try {
    const validation = await validateIPFSRequest(searchParams);
    
    if ('error' in validation) {
      return createErrorResponse(validation.error);
    }

    const { cid, path } = validation;

    const response = await fetchIPFSContent(cid, path);
    const contentType = determineContentType(response, cid, path);
    
    const format = searchParams.get('format');
    if (format === 'json') {
      return NextResponse.json({
        success: true,
        contentType,
        size: parseInt(response.headers.get('content-length') || '0', 10)
      });
    }

    if (!SUPPORTED_IMAGE_TYPES.has(contentType.split(';')[0]) && contentType !== 'application/octet-stream') {
      return createErrorResponse(
        'Unsupported content type',
        `Content type "${contentType}" is not supported`,
        415
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    
    const headers = new Headers({
      'Content-Type': contentType,
      'Content-Length': arrayBuffer.byteLength.toString(),
      ...DEFAULT_CACHE_HEADERS
    });

    response.headers.forEach((value, key) => {
      if (key.startsWith('x-ipfs-') || key === 'etag') {
        headers.set(key, value);
      }
    });

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers
    });

  } catch (error) {
    console.error('IPFS GET error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    if (errorMessage.includes('timeout')) {
      return createErrorResponse(
        'Request timeout',
        'The IPFS content could not be retrieved within the timeout period',
        408
      );
    }

    if (errorMessage.includes('not found') || errorMessage.includes('404')) {
      return createErrorResponse(
        'Content not found',
        'The requested IPFS content could not be found',
        404
      );
    }

    return createErrorResponse(
      'IPFS fetch failed',
      errorMessage,
      500
    );
  }
}

export async function POST(): Promise<NextResponse> {
  return createErrorResponse(
    'Method not implemented',
    'POST method is not currently supported for this endpoint',
    501
  );
}

export async function PUT(): Promise<NextResponse> {
  return createErrorResponse(
    'Method not implemented',
    'PUT method is not currently supported for this endpoint',
    501
  );
}

export async function DELETE(): Promise<NextResponse> {
  return createErrorResponse(
    'Method not implemented',
    'DELETE method is not currently supported for this endpoint',
    501
  );
}