"use client"

import { useState, useEffect, useRef } from 'react';
import { useWallet } from '@/app/providers/walletProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { CreditCard, Wallet2, Loader2, Wallet, ExternalLink, SendHorizontal } from 'lucide-react';
import WalletAssetCard from '@/components/walletCard';
import TransactionComponent from '@/components/transaction';
import GameChangerWalletIntegration from '@/components/walletInfo';

type AssetMetadata = {
  name?: string;
  description?: string;
  image?: string;
  genres?: string[];
  duration?: string;
  releaseTitle?: string;
  [key: string]: unknown;
};

type Asset = {
  assetId: string;
  policyId: string;
  assetName: string;
  displayName: string;
  quantity: number;
  fingerprint: string;
  metadata_json: AssetMetadata;
};

export default function WalletPage() {
  const { isConnected, walletData, refreshBalance } = useWallet();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isBalanceLoading, setIsBalanceLoading] = useState<boolean>(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<string>("all-assets");
  const balanceRefreshAttempted = useRef<boolean>(false);

  const hexToUtf8 = (hex: string): string => {
    try {
      const bytes = new Uint8Array(
        hex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
      );
      return new TextDecoder().decode(bytes);
    } catch {
      return hex;
    }
  };

  useEffect(() => {
    const fetchAssets = async () => {
      if (!isConnected || !walletData?.data.address) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setFetchError(null);

      try {
        if (!balanceRefreshAttempted.current) {
          setIsBalanceLoading(true);
          await refreshBalance();
          balanceRefreshAttempted.current = true;
          setIsBalanceLoading(false);
        }

        const timestamp = Date.now();
        const requestUrl = `/api/wallet/assets?address=${encodeURIComponent(walletData.data.address)}&_t=${timestamp}`;

        const response = await fetch(requestUrl, {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          }
        });

        if (!response.ok) {
          if (response.status === 404 || response.status === 405) {
            setAssets([]);
            setIsLoading(false);
            return;
          }

          setFetchError(`Unable to fetch wallet assets (Status: ${response.status})`);
          setAssets([]);
          setIsLoading(false);
          return;
        }

        const data = await response.json();

        if (data.assets && Object.keys(data.assets).length > 0) {
          const processedAssets: Asset[] = Object.entries(data.assets).map(([assetId, info]) => {
            const quantity = walletData.data.assets?.[assetId] || 1;
            
            // Safe type assertion with proper checks
            const assetInfo = info as Record<string, unknown>;
            const metadata = (assetInfo.metadata || {}) as AssetMetadata;
            const policyId = assetInfo.policyId as string || '';
            const assetName = assetInfo.assetName as string || '';
            const fingerprint = assetInfo.fingerprint as string || '';
            
            return {
              assetId,
              policyId,
              assetName,
              displayName: metadata.name || hexToUtf8(assetName),
              quantity,
              fingerprint,
              metadata_json: metadata
            };
          });

          setAssets(processedAssets);
        } else {
          setAssets([]);
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Error fetching assets:', error);
          setAssets([]);
          setFetchError(error.message || 'Failed to load assets');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchAssets();
  }, [isConnected, walletData?.data.address, refreshBalance, refreshTrigger, walletData?.data.assets]);

  const formatAda = (amount: number | null | undefined): string => {
    if (amount === null || amount === undefined || isNaN(amount)) {
      return '0 ₳';
    }
    return `${amount.toLocaleString()} ₳`;
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Wallet Not Connected</h1>
          <p className="mt-4 text-white">Please connect your wallet to view your assets.</p>
        </div>
      </div>
    );
  }

  const renderEmptyState = () => (
    <Card className="bg-neutral-800/50 border-neutral-700 p-8 text-center">
      <div className="flex flex-col items-center">
        <div className="w-16 h-16 rounded-full bg-neutral-700/50 flex items-center justify-center mb-4">
          <Wallet className="h-8 w-8 text-neutral-500" />
        </div>
        <h3 className="text-xl font-medium text-white mb-3">No Assets Found</h3>
        <p className="text-white mb-6 max-w-md mx-auto">
          This wallet doesn&apos;t have any native tokens or NFTs. Asset tokens will appear here once you receive them.
        </p>
      </div>
    </Card>
  );

  const renderErrorState = () => (
    <Card className="bg-neutral-800/50 border-neutral-700 p-8 text-center">
      <div className="flex flex-col items-center">
        <div className="w-16 h-16 rounded-full bg-red-900/30 flex items-center justify-center mb-4">
          <ExternalLink className="h-8 w-8 text-red-400" />
        </div>
        <h3 className="text-xl font-medium text-white mb-3">Could Not Load Assets</h3>
        <p className="text-white mb-6 max-w-md mx-auto">
          {fetchError || "There was an issue retrieving your assets. Please try again later."}
        </p>
        <Button
          onClick={() => {
            setIsLoading(true);
            setFetchError(null);
            setRefreshTrigger(prev => prev + 1);
          }}
          className="bg-neutral-700 hover:bg-neutral-600 text-white"
        >
          Retry
        </Button>
      </div>
    </Card>
  );

  return (
    <div className="container mx-auto py-6">
      <h1 className="text-3xl font-bold text-white mb-6">Wallet Details</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card className="bg-neutral-800/50 border-neutral-700 hover:border-neutral-600 transition-colors">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg">Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <CreditCard className="h-8 w-8 text-amber-400 mr-3" />
              <div className="text-3xl font-bold text-white">
                {isBalanceLoading ? (
                  <div className="h-8 w-24 bg-neutral-700 animate-pulse rounded"></div>
                ) : (
                  formatAda(walletData?.data.balance)
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-neutral-800/50 border-neutral-700 hover:border-neutral-600 transition-colors">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg">Assets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <Wallet2 className="h-8 w-8 text-purple-400 mr-3" />
              <div className="text-3xl font-bold text-white">
                {isLoading ? (
                  <div className="h-8 w-12 bg-neutral-700 animate-pulse rounded"></div>
                ) : (
                  assets.length
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="all-assets" className="w-full" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 mb-6 bg-neutral-800/70">
        <TabsTrigger value="all-assets" className="bg-slate-700 data-[state=active]:bg-neutral-300">Assets</TabsTrigger>
          <TabsTrigger value="transactions" className="bg-slate-700 data-[state=active]:bg-neutral-300">Send</TabsTrigger>
          <TabsTrigger value="wallet-info" className="bg-slate-700 data-[state=active]:bg-neutral-300">Wallet Details</TabsTrigger>
        </TabsList>

        <TabsContent value="all-assets" className="space-y-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-white">
              All Assets ({isLoading ? '...' : assets.length})
            </h2>
            <Button
              
              className="bg-black/50 border-neutral-700 hover:bg-black/40 text-neutral-00"
              onClick={() => {
                setIsLoading(true);
                setFetchError(null);
                balanceRefreshAttempted.current = false;
                setRefreshTrigger(prev => prev + 1);
              }}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
          
                <path d="M19 4.5l2-2.5v6h-6l2.5-2" />
           
                <path d="M12 3a9 9 0 0 1 7 3.5" />
                <path d="M3 12a9 9 0 0 1 9-9" />
                
             
                <path d="M5 19.5l-2 2.5v-6h6l-2.5 2" />
                
       
                <path d="M12 21a9 9 0 0 1-7-3.5" />
                <path d="M21 12a9 9 0 0 1-9 9" />
              </svg>
              )}
              Refresh Assets
            </Button>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[1, 2].map((_, index) => (
                <Card key={index} className="bg-neutral-800/50 border-neutral-700 overflow-hidden">
                  <div className="flex flex-col md:flex-row">
                    <div className="h-40 w-full md:w-40 bg-neutral-700 animate-pulse"></div>
                    <div className="p-4 flex-1">
                      <div className="h-6 w-3/4 mb-2 bg-neutral-700 animate-pulse"></div>
                      <div className="h-4 w-1/2 mb-4 bg-neutral-700 animate-pulse"></div>
                      <div className="h-4 w-full mb-2 bg-neutral-700 animate-pulse"></div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : fetchError ? (
            renderErrorState()
          ) : assets.length === 0 ? (
            renderEmptyState()
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {assets.map(asset => (
                <WalletAssetCard
                  key={asset.assetId}
                  asset={asset}
                  onClick={() => {}}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="transactions" className="space-y-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <SendHorizontal className="h-5 w-5 text-amber-400" />
              Send Transaction
            </h2>
          </div>
          
          <TransactionComponent 
            isWalletConnected={isConnected} 
            walletAddress={walletData?.data.address || ''} 
          />
        </TabsContent>

        <TabsContent value="wallet-info" className="space-y-6">
          <GameChangerWalletIntegration />
        </TabsContent>
      </Tabs>
    </div>
  );
}