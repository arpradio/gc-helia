import { getIPFSUrl, getUrlInfo, type IPFSSource } from '@/app/utils/ipfs-utils';

export interface TokenomicsInfo {
    totalSupply?: number;
    royaltyPercentage?: number;
}

export interface CopyrightInfo {
    master?: string;
    composition?: string;
}

export interface AssetMetadata {
    name: string;
    description?: string;
    image?: string;
    imageSource?: IPFSSource;
    imageInfo?: {
        reconstructed: string;
        chunks: string[];
        totalLength: number;
        isValid: boolean;
        requiresChunking: boolean;
    };
}

export interface ParsedImageSource {
    url: string;
    isValid: boolean;
    requiresChunking: boolean;
    chunks: string[];
    source: IPFSSource;
}

function extractImageSource(metadata: any): IPFSSource {
    if (metadata?.image) {
        return metadata.image;
    }
    
    if (metadata?.files?.[0]?.src) {
        return metadata.files[0].src;
    }
    
    if (Array.isArray(metadata?.image_array)) {
        return metadata.image_array;
    }
    
    if (Array.isArray(metadata?.src_array)) {
        return metadata.src_array;
    }
    
    return null;
}

function parseImageSource(source: IPFSSource): ParsedImageSource {
    if (!source) {
        return {
            url: '/default.png',
            isValid: false,
            requiresChunking: false,
            chunks: [],
            source: null
        };
    }

    const urlInfo = getUrlInfo(source);
    
    return {
        url: urlInfo.isValid ? urlInfo.reconstructed : '/default.png',
        isValid: urlInfo.isValid,
        requiresChunking: urlInfo.requiresChunking,
        chunks: urlInfo.chunks,
        source
    };
}

export function parseAssetMetadata(asset: any): AssetMetadata {
    const metadata = asset?.metadata_json || {};
    const result: AssetMetadata = {
        name: '',       
    };

    try {
        result.name = typeof metadata.name === 'string' ? metadata.name :
            (typeof asset.displayName === 'string' ? asset.displayName :
                (typeof asset.assetName === 'string' ? asset.assetName : 'Unknown'));

        result.description = typeof metadata.description === 'string' ? 
            metadata.description : undefined;

        const imageSource = extractImageSource(metadata);
        const parsedImage = parseImageSource(imageSource);
        
        result.image = parsedImage.url;
        result.imageSource = parsedImage.source;
        result.imageInfo = {
            reconstructed: parsedImage.url,
            chunks: parsedImage.chunks,
            totalLength: parsedImage.url.length,
            isValid: parsedImage.isValid,
            requiresChunking: parsedImage.requiresChunking
        };

    } catch (error) {
        console.error('Error parsing asset metadata:', error);
        result.image = '/default.png';
        result.imageSource = null;
    }

    return result;
}

export async function getIPFSImageUrl(src: IPFSSource): Promise<string> {
    if (!src) return '/default.png';
    
    try {
        const url = await getIPFSUrl(src);
        return url || '/default.png';
    } catch (error) {
        console.error('Error getting IPFS image URL:', error);
        return '/default.png';
    }
}

export function getIPFSImageUrlSync(src: IPFSSource): string {
    if (!src) return '/default.png';
    
    const urlInfo = getUrlInfo(src);
    return urlInfo.isValid ? urlInfo.reconstructed : '/default.png';
}

export function validateImageMetadata(metadata: any): {
    hasValidImage: boolean;
    imageSource: IPFSSource;
    requiresArrayHandling: boolean;
    parsedInfo?: {
        url: string;
        chunks: string[];
        totalLength: number;
    };
} {
    const imageSource = extractImageSource(metadata);
    
    if (!imageSource) {
        return {
            hasValidImage: false,
            imageSource: null,
            requiresArrayHandling: false
        };
    }

    const parsedImage = parseImageSource(imageSource);
    
    return {
        hasValidImage: parsedImage.isValid,
        imageSource,
        requiresArrayHandling: parsedImage.requiresChunking,
        parsedInfo: parsedImage.isValid ? {
            url: parsedImage.url,
            chunks: parsedImage.chunks,
            totalLength: parsedImage.url.length
        } : undefined
    };
}

export function hexToUtf8(hex: string): string {
    try {
        const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
        const bytes = new Uint8Array(
            cleanHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
        );
        return new TextDecoder().decode(bytes);
    } catch {
        return hex;
    }
}

export function extractMetadataFields(metadata: any): {
    name?: string;
    description?: string;
    image?: IPFSSource;
    attributes?: any[];
    properties?: any;
    files?: any[];
} {
    if (!metadata || typeof metadata !== 'object') {
        return {};
    }

    return {
        name: typeof metadata.name === 'string' ? metadata.name : undefined,
        description: typeof metadata.description === 'string' ? metadata.description : undefined,
        image: extractImageSource(metadata),
        attributes: Array.isArray(metadata.attributes) ? metadata.attributes : undefined,
        properties: typeof metadata.properties === 'object' ? metadata.properties : undefined,
        files: Array.isArray(metadata.files) ? metadata.files : undefined
    };
}

export function prepareMetadataForStorage(metadata: AssetMetadata): {
    metadata: Omit<AssetMetadata, 'imageSource' | 'imageInfo'>;
    imageChunks?: string[];
    requiresArrayStorage: boolean;
} {
    const { imageSource, imageInfo, ...baseMetadata } = metadata;
    
    if (!imageInfo || !imageInfo.requiresChunking) {
        return {
            metadata: baseMetadata,
            requiresArrayStorage: false
        };
    }
    
    return {
        metadata: baseMetadata,
        imageChunks: imageInfo.chunks,
        requiresArrayStorage: true
    };
}