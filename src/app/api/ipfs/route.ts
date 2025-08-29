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

type APIResponse = ErrorResponse | SuccessResponse;

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

async function validateIPFSRequest(searchParams: URLSearchParams): Promise<{ cid: string; path?: string } | { error: string }> {
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
      default:
        break;
    }
  }

  return 'application/octet-stream';
}

async function handleImageOptimization(
  response: Response, 
  contentType: string,
): Promise<{ data: ArrayBuffer; headers: Record<string, string> }> {
  const data = await response.arrayBuffer();
  const size = data.byteLength;
  
  const headers = {
    'Content-Type': contentType,
    'Content-Length': size.toString(),
    'Accept-Ranges': 'bytes',
    ...DEFAULT_CACHE_HEADERS
  };




  return { data, headers };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const validation = await validateIPFSRequest(searchParams);
    
    if ('error' in validation) {
      return NextResponse.json<ErrorResponse>(
        { error: validation.error },
        { status: 400 }
      );
    }

    const { cid, path } = validation;
    
    const ipfsResponse = await fetchIPFSContent(cid, path);
    const contentType = determineContentType(ipfsResponse, cid, path);
    
    if (!SUPPORTED_IMAGE_TYPES.has(contentType) && !isLikelyImage(path || cid)) {
      return NextResponse.json<ErrorResponse>(
        { error: 'Unsupported content type for image processing' },
        { status: 415 }
      );
    }

    const { data, headers } = await handleImageOptimization(
      ipfsResponse,
      contentType,
    );

    return new NextResponse(data, {
      status: 200,
      headers
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    console.error('IPFS API Error:', {
      message: errorMessage,
      url: request.url,
      timestamp: new Date().toISOString()
    });

    if (errorMessage.includes('timeout') || errorMessage.includes('AbortError')) {
      return NextResponse.json<ErrorResponse>(
        { 
          error: 'Request timeout',
          details: 'IPFS content retrieval took too long'
        },
        { status: 408 }
      );
    }

    if (errorMessage.includes('not found') || errorMessage.includes('404')) {
      return NextResponse.json<ErrorResponse>(
        { error: 'Content not found on IPFS' },
        { status: 404 }
      );
    }

    return NextResponse.json<ErrorResponse>(
      { 
        error: 'Failed to retrieve IPFS content',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      },
      { status: 500 }
    );
  }
}

export async function HEAD(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const validation = await validateIPFSRequest(searchParams);
    
    if ('error' in validation) {
      return new NextResponse(null, { status: 400 });
    }

    const { cid, path } = validation;
    const ipfsResponse = await fetchIPFSContent(cid, path);
    const contentType = determineContentType(ipfsResponse, cid, path);
    
    if (!SUPPORTED_IMAGE_TYPES.has(contentType) && !isLikelyImage(path || cid)) {
      return new NextResponse(null, { status: 415 });
    }

    const contentLength = ipfsResponse.headers.get('content-length');
    
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      ...DEFAULT_CACHE_HEADERS
    };
    
    if (contentLength) {
      headers['Content-Length'] = contentLength;
    }

    return new NextResponse(null, {
      status: 200,
      headers
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('timeout') || errorMessage.includes('AbortError')) {
      return new NextResponse(null, { status: 408 });
    }

    if (errorMessage.includes('not found') || errorMessage.includes('404')) {
      return new NextResponse(null, { status: 404 });
    }

    return new NextResponse(null, { status: 500 });
  }
}