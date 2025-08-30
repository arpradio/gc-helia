// utils/verified-fetch-utils.ts
import { verifiedFetch } from '@helia/verified-fetch';

const MAX_FIELD_LENGTH = 64;
const FETCH_TIMEOUT = 30000; // 30 seconds

export type IPFSSource = string | string[] | null | undefined;

export interface UrlChunks {
  chunks: string[];
  totalLength: number;
  isValid: boolean;
}

export function chunkUrl(url: string, maxLength: number = MAX_FIELD_LENGTH): string[] {
  if (url.length <= maxLength) {
    return [url];
  }

  const chunks: string[] = [];
  let remaining = url;
  
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }
    
    chunks.push(remaining.substring(0, maxLength));
    remaining = remaining.substring(maxLength);
  }
  
  return chunks;
}

export function reconstructUrl(src: IPFSSource): UrlChunks {
  if (!src) {
    return { chunks: [], totalLength: 0, isValid: false };
  }

  let processedSrc: string;
  let chunks: string[];

  if (Array.isArray(src)) {
    chunks = src.filter(chunk => chunk && typeof chunk === 'string');
    
    if (chunks.length === 0) {
      return { chunks: [], totalLength: 0, isValid: false };
    }
    
    processedSrc = chunks.join('');
  } else if (typeof src === 'string') {
    processedSrc = src;
    chunks = [src];
  } else {
    return { chunks: [], totalLength: 0, isValid: false };
  }

  const totalLength = processedSrc.length;
  const isValid = totalLength > 0 && (
    processedSrc.startsWith('ipfs://') ||
    processedSrc.startsWith('ar://') ||
    processedSrc.startsWith('http://') ||
    processedSrc.startsWith('https://') ||
    processedSrc.startsWith('data:') ||
    /^[a-zA-Z0-9]+\.ipfs\./.test(processedSrc) ||
    /^Qm[1-9A-HJ-NP-Za-km-z]{44,}/.test(processedSrc) ||
    /^bafy[a-zA-Z0-9]{44,}/.test(processedSrc)
  );

  return {
    chunks,
    totalLength,
    isValid
  };
}

export function normalizeIPFSUrl(src: IPFSSource): string | null {
  const urlData = reconstructUrl(src);
  
  if (!urlData.isValid) {
    return null;
  }

  const processedSrc = Array.isArray(src) ? src.join('') : src as string;

  // Handle data URLs directly
  if (processedSrc.startsWith('data:')) {
    return processedSrc;
  }

  // Convert various IPFS formats to ipfs:// protocol
  if (processedSrc.includes('.ipfs.')) {
    const match = processedSrc.match(/^(https?:\/\/)?([a-zA-Z0-9]+)\.ipfs\./);
    if (match && match[2]) {
      return `ipfs://${match[2]}`;
    }
  }

  if (/^[a-zA-Z0-9]+\.ipfs\.localhost/.test(processedSrc)) {
    const cid = processedSrc.split('.ipfs.localhost')[0];
    return `ipfs://${cid}`;
  }

  if (processedSrc.startsWith('ipfs://')) {
    return processedSrc;
  }

  if (/^Qm[1-9A-HJ-NP-Za-km-z]{44,}/.test(processedSrc) || /^bafy[a-zA-Z0-9]{44,}/.test(processedSrc)) {
    return `ipfs://${processedSrc}`;
  }

  // Handle HTTP URLs that contain IPFS paths
  if (processedSrc.includes('/ipfs/')) {
    const match = processedSrc.match(/\/ipfs\/([a-zA-Z0-9]+)/);
    if (match && match[1]) {
      return `ipfs://${match[1]}`;
    }
  }

  // Return other URLs as-is (http, https, ar://)
  return processedSrc;
}

export async function fetchIPFSContent(src: IPFSSource): Promise<Response> {
  const normalizedUrl = normalizeIPFSUrl(src);
  
  if (!normalizedUrl) {
    throw new Error('Invalid IPFS source provided');
  }

  // Handle data URLs directly
  if (normalizedUrl.startsWith('data:')) {
    const response = new Response(normalizedUrl);
    return response;
  }

  // Handle non-IPFS URLs with regular fetch
  if (!normalizedUrl.startsWith('ipfs://')) {
    try {
      const response = await fetch(normalizedUrl, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT)
      });
      return response;
    } catch (error) {
      throw new Error(`Failed to fetch ${normalizedUrl}: ${error}`);
    }
  }

  // Use verified fetch for IPFS URLs
  try {
    const response = await verifiedFetch(normalizedUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT)
    });

    if (!response.ok) {
      throw new Error(`Verified fetch failed: ${response.status} ${response.statusText}`);
    }

    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout: IPFS content retrieval took too long');
    }
    throw error;
  }
}

export async function getIPFSImageBlob(src: IPFSSource): Promise<Blob | null> {
  try {
    const response = await fetchIPFSContent(src);
    
    if (!response.ok) {
      console.warn('Failed to fetch IPFS content:', response.status, response.statusText);
      return null;
    }

    const blob = await response.blob();
    
    // Verify it's an image
    if (!blob.type.startsWith('image/')) {
      console.warn('Fetched content is not an image:', blob.type);
      return null;
    }

    return blob;
  } catch (error) {
    console.error('Error fetching IPFS image:', error);
    return null;
  }
}

export async function getIPFSImageUrl(src: IPFSSource): Promise<string> {
  const normalizedUrl = normalizeIPFSUrl(src);
  
  if (!normalizedUrl) {
    return '/default.png';
  }

  // Return data URLs directly
  if (normalizedUrl.startsWith('data:')) {
    return normalizedUrl;
  }

  try {
    const blob = await getIPFSImageBlob(src);
    
    if (!blob) {
      return '/default.png';
    }

    // Create blob URL for the image
    const blobUrl = URL.createObjectURL(blob);
    return blobUrl;
  } catch (error) {
    console.error('Error getting IPFS image URL:', error);
    return '/default.png';
  }
}

export function getUrlInfo(src: IPFSSource): {
  reconstructed: string;
  chunks: string[];
  totalLength: number;
  isValid: boolean;
  requiresChunking: boolean;
  normalizedUrl: string | null;
} {
  const urlData = reconstructUrl(src);
  const reconstructed = Array.isArray(src) ? src.join('') : (src || '');
  const normalizedUrl = normalizeIPFSUrl(src);
  
  return {
    reconstructed,
    chunks: urlData.chunks,
    totalLength: urlData.totalLength,
    isValid: urlData.isValid,
    requiresChunking: urlData.totalLength > MAX_FIELD_LENGTH,
    normalizedUrl
  };
}

export function splitUrlForDatabase(url: string, maxLength: number = MAX_FIELD_LENGTH): string[] {
  return chunkUrl(url, maxLength);
}

export function validateReconstructedUrl(chunks: string[]): boolean {
  const reconstructed = chunks.join('');
  return reconstructUrl(reconstructed).isValid;
}

export function extractCidFromIpfsUrl(url: string): string | null {
  const normalized = normalizeIPFSUrl(url);
  
  if (!normalized || !normalized.startsWith('ipfs://')) {
    return null;
  }

  const path = normalized.replace('ipfs://', '');
  return path.split('/')[0];
}

export function isLikelyImage(src: string): boolean {
  if (!src) return false;
  
  if (src.startsWith('data:image/')) return true;
  
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
  const lowerSrc = src.toLowerCase();
  if (imageExtensions.some(ext => lowerSrc.endsWith(ext))) return true;
  
  const audioExtensions = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac'];
  if (audioExtensions.some(ext => lowerSrc.endsWith(ext))) return false;
  
  return true; 
}