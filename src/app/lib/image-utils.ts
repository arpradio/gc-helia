import { getIPFSUrl } from '@/actions/ipfs';

export type ImageSource = string | null | undefined;

const ipfsCache = new Map<string, string>();

const isIPFSUrl = (src: string): boolean => {
  return (
    src.startsWith('ipfs://') ||
    /^Qm[1-9A-HJ-NP-Za-km-z]{44,}/.test(src) ||
    /^bafy[a-zA-Z0-9]{44,}/.test(src) ||
    src.includes('.ipfs.')
  );
};

const resolveArrayToString = (src: string | string[]): string => {
  if (Array.isArray(src)) {
    return src.join('');
  }
  return src;
};

export const extractImage = async (metadata: any): Promise<string> => {
  const imageRaw = metadata?.image || metadata?.files?.[0]?.src;
  if (!imageRaw) return '/default.png';

  const image = resolveArrayToString(imageRaw);

  if (typeof image === 'string') {
    if (image.startsWith('data:')) {
      return image;
    }

    if (ipfsCache.has(image)) {
      return ipfsCache.get(image)!;
    }

    try {
      const timeout = new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('IPFS URL resolution timeout')), 5000)
      );

      const url = await Promise.race([getIPFSUrl(image), timeout]);
      ipfsCache.set(image, url);
      return url;
    } catch (error) {
      console.error('Error getting IPFS URL:', error);
      return '/default.png';
    }
  }

  return '/default.png';
};

export const normalizeImageSrc = async (src: ImageSource | string[]): Promise<string> => {
  if (!src) return '/default.png';

  const normalizedSrc = resolveArrayToString(src);

  if (normalizedSrc.startsWith('data:')) {
    return normalizedSrc;
  }

  if (ipfsCache.has(normalizedSrc)) {
    return ipfsCache.get(normalizedSrc)!;
  }

  try {
    const url = await getIPFSUrl(normalizedSrc);
    ipfsCache.set(normalizedSrc, url);
    return url;
  } catch (error) {
    console.error('Error normalizing image source:', error);
    return '/default.png';
  }
};

export const extractImageWithCallback = (
  metadata: any,
  callback: (url: string) => void
): string => {
  const imageRaw = metadata?.image || metadata?.files?.[0]?.src;
  if (!imageRaw) return '/default.png';

  const image = resolveArrayToString(imageRaw);

  if (image.startsWith('data:')) {
    return image;
  }

  if (ipfsCache.has(image)) {
    const cachedUrl = ipfsCache.get(image)!;
    setTimeout(() => callback(cachedUrl), 0);
    return cachedUrl;
  }

  const immediateDisplay = isIPFSUrl(image)
    ? `https://ipfs.io/ipfs/${image.replace('ipfs://', '')}`
    : '/default.png';

  getIPFSUrl(image)
    .then(url => {
      ipfsCache.set(image, url);
      callback(url);
    })
    .catch(error => {
      console.error('Error getting IPFS URL:', error);
      callback('/default.png');
    });

  return immediateDisplay;
};

export const normalizeImageSrcWithCallback = (
  src: ImageSource | string[],
  callback: (url: string) => void
): string => {
  if (!src) return '/default.png';

  const normalizedSrc = resolveArrayToString(src);

  if (normalizedSrc.startsWith('data:')) {
    return normalizedSrc;
  }

  if (ipfsCache.has(normalizedSrc)) {
    const cachedUrl = ipfsCache.get(normalizedSrc)!;
    setTimeout(() => callback(cachedUrl), 0);
    return cachedUrl;
  }

  const immediateDisplay = isIPFSUrl(normalizedSrc)
    ? `https://ipfs.io/ipfs/${normalizedSrc.replace('ipfs://', '')}`
    : '/default.png';

  getIPFSUrl(normalizedSrc)
    .then(url => {
      ipfsCache.set(normalizedSrc, url);
      callback(url);
    })
    .catch(error => {
      console.error('Error normalizing image source:', error);
      callback('/default.png');
    });

  return immediateDisplay;
};
