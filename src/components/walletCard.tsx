import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Disc, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardFooter } from '@/components/ui/card';
import { parseAssetMetadata, getIPFSImageUrlSync, getIPFSImageUrl } from '@/app/utils/metadataParser';

export interface Asset {
  assetId: string;
  policyId: string;
  assetName: string;
  displayName: string;
  quantity: number;
  fingerprint: string;
  metadata_json: any;
}

export interface WalletAssetCardProps {
  asset: Asset;
  onClick?: () => void;
}

const WalletAssetCard: React.FC<WalletAssetCardProps> = ({ asset, onClick }) => {
  const [imageSrc, setImageSrc] = useState<string>('/default.png');
  const [isImageLoading, setIsImageLoading] = useState<boolean>(true);
  const [imageError, setImageError] = useState<boolean>(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const metadata = parseAssetMetadata(asset);

  // Cleanup blob URL on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (blobUrl && blobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  const loadImage = useCallback(async () => {
    setIsImageLoading(true);
    setImageError(false);

    try {
      // First try synchronous resolution for immediate display
      const syncUrl = getIPFSImageUrlSync(metadata.imageSource);
      
      if (syncUrl && syncUrl !== '/default.png') {
        setImageSrc(syncUrl);
        
        // If it's not a data URL or blob URL, try to get verified content
        if (!syncUrl.startsWith('data:') && !syncUrl.startsWith('blob:') && metadata.imageSource) {
          try {
            // Use verified fetch to get the actual content
            const verifiedUrl = await getIPFSImageUrl(metadata.imageSource);
            
            if (verifiedUrl && verifiedUrl !== syncUrl && verifiedUrl !== '/default.png') {
              // Clean up previous blob URL
              if (blobUrl && blobUrl.startsWith('blob:')) {
                URL.revokeObjectURL(blobUrl);
              }
              
              setBlobUrl(verifiedUrl.startsWith('blob:') ? verifiedUrl : null);
              setImageSrc(verifiedUrl);
            }
          } catch (verifiedError) {
            console.warn('Verified fetch failed, using sync URL:', verifiedError);
            // Keep using the sync URL if verified fetch fails
          }
        }
      } else {
        setImageSrc('/default.png');
      }
    } catch (error) {
      console.error('Error loading image for asset:', asset.assetId, error);
      setImageError(true);
      setImageSrc('/default.png');
    } finally {
      setIsImageLoading(false);
    }
  }, [metadata.imageSource, asset.assetId, blobUrl]);

  useEffect(() => {
    loadImage();
  }, [loadImage]);

  const truncateId = (id: string): string => 
    `${id.slice(0, 8)}...${id.slice(-8)}`;

  const handleImageError = useCallback(() => {
    if (!imageError) {
      console.warn('Image failed to load for asset:', asset.assetId, 'URL:', imageSrc);
      setImageError(true);
      setImageSrc('/default.png');
    }
  }, [imageError, asset.assetId, imageSrc]);

  const handleCardClick = useCallback(() => {
    if (onClick) {
      onClick();
    }
  }, [onClick]);

  // Prevent propagation for external links
  const handleLinkClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <Card 
      key={asset.assetId} 
      className="bg-slate-800/50 border-slate-700 overflow-hidden hover:border-purple-500/50 transition-all duration-300 cursor-pointer"
      onClick={handleCardClick}
    >
      <div className="flex flex-col md:flex-row">
        <div className="relative h-40 w-full md:w-40 bg-black">
          {isImageLoading ? (
            <div className="flex items-center justify-center h-full w-full bg-slate-700">
              <Loader2 className="h-8 w-8 text-slate-400 animate-spin" />
              <span className="ml-2 text-xs text-slate-400">Loading...</span>
            </div>
          ) : imageSrc && imageSrc !== '/default.png' && !imageError ? (
            <Image 
              src={imageSrc}
              alt={metadata.name}
              fill
              className="object-cover"
              unoptimized={imageSrc.startsWith('data:') || imageSrc.startsWith('blob:') || imageSrc.includes('/api/')}
              sizes="(max-width: 768px) 100vw, 160px"
              onError={handleImageError}
              priority={false}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full w-full bg-slate-700">
              <Disc className="h-12 w-12 text-slate-500 mb-1" />
              <span className="text-xs text-slate-500">No Image</span>
            </div>
          )}
        </div>
        
        <div className="p-4 flex-1">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-bold text-white text-lg leading-tight">
              {metadata.name}
            </h3>
          </div>
          
          {metadata.description && (
            <p className="text-sm text-zinc-400 mb-3 line-clamp-2">
              {metadata.description}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400 mb-4">
            <div>
              <span className="block text-zinc-300 font-medium">Asset ID</span>
              <span className="font-mono">{truncateId(asset.assetId)}</span>
            </div>
            
            {asset.quantity > 1 && (
              <div>
                <span className="block text-zinc-300 font-medium">Quantity</span>
                <span className="font-mono">{asset.quantity.toLocaleString()}</span>
              </div>
            )}
            
            {asset.fingerprint && (
              <div className="col-span-2">
                <span className="block text-zinc-300 font-medium">Fingerprint</span>
                <span className="font-mono text-xs">{truncateId(asset.fingerprint)}</span>
              </div>
            )}
          </div>

  
        </div>
      </div>
      
      <CardFooter className="bg-black/30 border-t border-slate-700 p-3 flex justify-between items-center">
        <div className="text-xs text-zinc-500">
          Policy: <span className="font-mono text-zinc-400">{truncateId(asset.policyId)}</span>
        </div>
        
        <div className="flex gap-2">
          <Link 
            href={`https://cardanoscan.io/token/${asset.policyId}.${asset.assetName}`}
            target="_blank" 
            rel="noopener noreferrer"
            onClick={handleLinkClick}
          >
            <Button 
              size="sm" 
              variant="outline"
              className="bg-black/20 border-slate-700 hover:bg-black/40 text-zinc-300 text-xs"
            >
              <ExternalLink className="mr-1 h-3 w-3" />
              Explorer
            </Button>
          </Link>

    
        </div>
      </CardFooter>
    </Card>
  );
};

export default WalletAssetCard;