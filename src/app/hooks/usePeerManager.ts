import { useState, useCallback, useEffect } from 'react';
import { HeliaVerifiedFetchManager, type PeerManagerConfig, type TrustlessGateway, type PeerInfo } from '../lib/verified-fetch-manager';
import { CID } from 'multiformats/cid';

interface UsePeerManagerReturn {
  fetchManager: HeliaVerifiedFetchManager | null;
  config: PeerManagerConfig;
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  fetchIPFS: (cid: string, path?: string) => Promise<Response>;
  addCustomPeer: (peer: Omit<PeerInfo, 'id' | 'status'>) => Promise<void>;
  addTrustlessGateway: (gateway: Omit<TrustlessGateway, 'id' | 'status'>) => Promise<void>;
  testGateway: (gatewayId: string) => Promise<boolean>;
  testAllGateways: () => Promise<void>;
  updateConfig: (newConfig: Partial<PeerManagerConfig>) => Promise<void>;
  getActiveGateways: () => TrustlessGateway[];
  getConnectedPeers: () => PeerInfo[];
  reinitialize: () => Promise<void>;
  shutdown: () => Promise<void>;
}

export function usePeerManager(initialConfig: PeerManagerConfig): UsePeerManagerReturn {
  const [fetchManager, setFetchManager] = useState<HeliaVerifiedFetchManager | null>(null);
  const [config, setConfig] = useState<PeerManagerConfig>(initialConfig);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialize = useCallback(async () => {
    if (fetchManager) return;
    
    setIsLoading(true);
    setError(null);

    try {
      const manager = new HeliaVerifiedFetchManager(config);
      await manager.initialize();
      setFetchManager(manager);
      setIsInitialized(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize peer manager';
      setError(errorMessage);
      console.error('Peer manager initialization failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [config, fetchManager]);

  useEffect(() => {
    initialize();
    
    return () => {
      if (fetchManager) {
        fetchManager.shutdown().catch(console.error);
      }
    };
  }, []);

  const fetchIPFS = useCallback(async (cid: string, path?: string): Promise<Response> => {
    if (!fetchManager) {
      throw new Error('Peer manager not initialized');
    }

    const ipfsPath = path ? `ipfs://${cid}/${path}` : `ipfs://${cid}`;
    return await fetchManager.fetchWithRetry(ipfsPath);
  }, [fetchManager]);

  const addCustomPeer = useCallback(async (peer: Omit<PeerInfo, 'id' | 'status'>) => {
    if (!fetchManager) {
      throw new Error('Peer manager not initialized');
    }

    await fetchManager.addCustomPeer(peer);
    
    setConfig(prev => ({
      ...prev,
      customPeers: [...prev.customPeers, {
        ...peer,
        id: `custom-${Date.now()}`,
        status: 'unknown' as const
      }]
    }));
  }, [fetchManager]);

  const addTrustlessGateway = useCallback(async (gateway: Omit<TrustlessGateway, 'id' | 'status'>) => {
    if (!fetchManager) {
      throw new Error('Peer manager not initialized');
    }

    await fetchManager.addTrustlessGateway(gateway);
    
    setConfig(prev => ({
      ...prev,
      gateways: [...prev.gateways, {
        ...gateway,
        id: `gateway-${Date.now()}`,
        status: 'unknown' as const
      }]
    }));
  }, [fetchManager]);

  const testGateway = useCallback(async (gatewayId: string): Promise<boolean> => {
    if (!fetchManager) {
      throw new Error('Peer manager not initialized');
    }

    const result = await fetchManager.testGatewayConnectivity(gatewayId);
    
    setConfig(prev => ({
      ...prev,
      gateways: prev.gateways.map(g => 
        g.id === gatewayId 
          ? { ...g, status: result ? 'online' as const : 'offline' as const, lastTested: new Date() }
          : g
      )
    }));

    return result;
  }, [fetchManager]);

  const testAllGateways = useCallback(async () => {
    if (!fetchManager) {
      throw new Error('Peer manager not initialized');
    }

    setIsLoading(true);
    
    try {
      const results = await Promise.allSettled(
        config.gateways.map(async (gateway) => {
          const isOnline = await fetchManager.testGatewayConnectivity(gateway.id);
          return { id: gateway.id, isOnline };
        })
      );

      setConfig(prev => ({
        ...prev,
        gateways: prev.gateways.map(gateway => {
          const result = results.find(r => 
            r.status === 'fulfilled' && r.value.id === gateway.id
          );
          
          if (result && result.status === 'fulfilled') {
            return {
              ...gateway,
              status: result.value.isOnline ? 'online' as const : 'offline' as const,
              lastTested: new Date()
            };
          }
          
          return { ...gateway, status: 'offline' as const, lastTested: new Date() };
        })
      }));
    } catch (err) {
      console.error('Failed to test gateways:', err);
    } finally {
      setIsLoading(false);
    }
  }, [fetchManager, config.gateways]);

  const updateConfig = useCallback(async (newConfig: Partial<PeerManagerConfig>) => {
    if (!fetchManager) {
      throw new Error('Peer manager not initialized');
    }

    const updatedConfig = { ...config, ...newConfig };
    await fetchManager.updatePeerConfig(newConfig);
    setConfig(updatedConfig);
  }, [fetchManager, config]);

  const getActiveGateways = useCallback((): TrustlessGateway[] => {
    if (!fetchManager) return [];
    return fetchManager.getActiveGateways();
  }, [fetchManager]);

  const getConnectedPeers = useCallback((): PeerInfo[] => {
    if (!fetchManager) return [];
    return fetchManager.getConnectedPeers();
  }, [fetchManager]);

  const reinitialize = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (fetchManager) {
        await fetchManager.shutdown();
      }
      
      const manager = new HeliaVerifiedFetchManager(config);
      await manager.initialize();
      setFetchManager(manager);
      setIsInitialized(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to reinitialize peer manager';
      setError(errorMessage);
      console.error('Peer manager reinitialization failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [config, fetchManager]);

  const shutdown = useCallback(async () => {
    if (fetchManager) {
      await fetchManager.shutdown();
      setFetchManager(null);
      setIsInitialized(false);
    }
  }, [fetchManager]);

  return {
    fetchManager,
    config,
    isInitialized,
    isLoading,
    error,
    fetchIPFS,
    addCustomPeer,
    addTrustlessGateway,
    testGateway,
    testAllGateways,
    updateConfig,
    getActiveGateways,
    getConnectedPeers,
    reinitialize,
    shutdown
  };
}

export function useIPFSFetch(cid: string, path?: string, enabled: boolean = true) {
  const [data, setData] = useState<ArrayBuffer | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const defaultConfig: PeerManagerConfig = {
    gateways: [
      {
        id: 'web3-storage',
        url: 'https://w3s.link',
        name: 'Web3.Storage',
        status: 'unknown',
        isEnabled: true,
        isDefault: true
      }
    ],
    customPeers: [],
    bootstrapPeers: [],
    timeout: 30000,
    retries: 2,
    autoBootstrap: true,
    maxConnections: 50,
    enableMdns: false
  };

  const { fetchIPFS, isInitialized } = usePeerManager(defaultConfig);

  const fetch = useCallback(async () => {
    if (!enabled || !cid || !isInitialized) return;

    setIsLoading(true);
    setError(null);
    setProgress(0);

    try {
      const response = await fetchIPFS(cid, path);
      const reader = response.body?.getReader();
      
      if (!reader) {
        const arrayBuffer = await response.arrayBuffer();
        setData(arrayBuffer);
        setProgress(100);
        return;
      }

      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      let loaded = 0;
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        chunks.push(value);
        loaded += value.length;
        
        if (total > 0) {
          setProgress((loaded / total) * 100);
        }
      }

      const arrayBuffer = new Uint8Array(loaded);
      let offset = 0;
      for (const chunk of chunks) {
        arrayBuffer.set(chunk, offset);
        offset += chunk.length;
      }

      setData(arrayBuffer.buffer);
      setProgress(100);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch IPFS content';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [cid, path, enabled, isInitialized, fetchIPFS]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const refetch = useCallback(() => {
    fetch();
  }, [fetch]);

  return {
    data,
    isLoading,
    error,
    progress,
    refetch
  };
}