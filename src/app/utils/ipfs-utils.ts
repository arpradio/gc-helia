// ipfs-utils.ts (Client-side utilities)
const MAX_FIELD_LENGTH = 64;

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

export async function getIPFSUrl(src: IPFSSource): Promise<string> {
  const urlData = reconstructUrl(src);
  
  if (!urlData.isValid) {
    console.warn('Invalid or empty IPFS source:', src);
    return '';
  }

  const processedSrc = Array.isArray(src) ? src.join('') : src as string;

  if (processedSrc.includes('.ipfs.')) {
    const match = processedSrc.match(/^(https?:\/\/)?([a-zA-Z0-9]+)\.ipfs\./);
    if (match && match[2]) {
      return `https://ipfs.io/ipfs/${match[2]}`;
    }
  }

  if (/^[a-zA-Z0-9]+\.ipfs\.localhost/.test(processedSrc)) {
    const cid = processedSrc.split('.ipfs.localhost')[0];
    return `https://ipfs.io/ipfs/${cid}`;
  }

  if (processedSrc.startsWith('ipfs://')) {
    const cid = processedSrc.replace('ipfs://', '');
    return `https://ipfs.io/ipfs/${cid}`;
  }

  if (/^Qm[1-9A-HJ-NP-Za-km-z]{44,}/.test(processedSrc) || /^bafy[a-zA-Z0-9]{44,}/.test(processedSrc)) {
    return `https://ipfs.io/ipfs/${processedSrc}`;
  }

  if (processedSrc.startsWith('ar://')) {
    return `https://permagate.io/${processedSrc.replace('ar://', '')}`;
  }

  return processedSrc;
}

export function splitUrlForDatabase(url: string, maxLength: number = MAX_FIELD_LENGTH): string[] {
  return chunkUrl(url, maxLength);
}

export function validateReconstructedUrl(chunks: string[]): boolean {
  const reconstructed = chunks.join('');
  return reconstructUrl(reconstructed).isValid;
}

export function getUrlInfo(src: IPFSSource): {
  reconstructed: string;
  chunks: string[];
  totalLength: number;
  isValid: boolean;
  requiresChunking: boolean;
} {
  const urlData = reconstructUrl(src);
  const reconstructed = Array.isArray(src) ? src.join('') : (src || '');
  
  return {
    reconstructed,
    chunks: urlData.chunks,
    totalLength: urlData.totalLength,
    isValid: urlData.isValid,
    requiresChunking: urlData.totalLength > MAX_FIELD_LENGTH
  };
}

export function extractCidFromIpfsUrl(url: string): string | null {
  if (!url) return null;

  if (url.startsWith('ipfs://')) {
    const path = url.replace('ipfs://', '');
    return path.split('/')[0]; 
  }
  
  if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44,}|bafy[a-zA-Z0-9]{44,})/.test(url)) {
    return url.split('/')[0];
  }
  
  const ipfsDomainMatch = url.match(/([a-zA-Z0-9-_]+)\.ipfs\./i);
  if (ipfsDomainMatch && ipfsDomainMatch[1]) {
    return ipfsDomainMatch[1];
  }
  
  const gatewayMatch = url.match(/\/ipfs\/([a-zA-Z0-9-_]+)/i);
  if (gatewayMatch && gatewayMatch[1]) {
    return gatewayMatch[1];
  }
  
  return null;
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