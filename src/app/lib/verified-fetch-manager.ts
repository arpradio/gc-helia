import { createHelia, type Helia } from 'helia';
import { verifiedFetch } from '@helia/verified-fetch';
import { createLibp2p, type Libp2pInit } from 'libp2p';
import { bootstrap } from '@libp2p/bootstrap';
import { mdns } from '@libp2p/mdns';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { tcp } from '@libp2p/tcp';
import { webSockets } from '@libp2p/websockets';
import { trustlessGateway } from '@helia/block-brokers';
import { MemoryBlockstore } from 'blockstore-core/memory';
import { MemoryDatastore } from 'datastore-core/memory';
import type { Multiaddr } from '@multiformats/multiaddr';
import { useWallet, type WalletContextType } from '@/app/providers/walletProvider';

const walletContext: WalletContextType = useWallet();
const { isConnected } = walletContext;

interface TrustlessGateway {
  id: string;
  url: string;
  name: string;
  status: 'online' | 'offline' | 'testing' | 'unknown';
  isEnabled: boolean;
  isDefault?: boolean;
  latency?: number;
  lastTested?: Date;
}

interface PeerInfo {
  id: string;
  multiaddr: string;
  name: string;
  status: 'connected' | 'connecting' | 'failed' | 'unknown';
  isBootstrap: boolean;
  isCustom: boolean;
  latency?: number;
  lastSeen?: Date;
}

interface PeerManagerConfig {
  gateways: TrustlessGateway[];
  customPeers: PeerInfo[];
  bootstrapPeers: PeerInfo[];
  timeout: number;
  retries: number;
  autoBootstrap: boolean;
  maxConnections: number;
  enableMdns: boolean;
  preferredGateway?: string;
}

interface VerifiedFetchOptions {
  signal?: AbortSignal;
  headers?: HeadersInit;
  method?: string;
  body?: BodyInit;
}

class HeliaVerifiedFetchManager {
  private helia?: Helia;
  private config: PeerManagerConfig;

  constructor(config: PeerManagerConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (isConnected) {
      const libp2pConfig = this.buildLibp2pConfig();
      const heliaConfig = this.buildHeliaConfig(libp2pConfig);
      this.helia = await createHelia(heliaConfig);
    }
  }

  private buildLibp2pConfig(): Libp2pInit {
    const bootstrapAddresses = this.config.bootstrapPeers
      .filter(peer => peer.isBootstrap)
      .map(peer => peer.multiaddr);

    const customPeerAddresses = this.config.customPeers
      .filter(peer => peer.isBootstrap)
      .map(peer => peer.multiaddr);

    const allBootstrapAddresses = [...bootstrapAddresses, ...customPeerAddresses];

    return {
      addresses: {
        listen: ['/ip4/0.0.0.0/tcp/0']
      },
      transports: [
        tcp(),
        webSockets()
      ],
      streamMuxers: [
        yamux()
      ],
      connectionEncrypters: [
        noise()
      ],
      peerDiscovery: [
        bootstrap({
          list: allBootstrapAddresses
        }),
        ...(this.config.enableMdns ? [mdns()] : [])
      ],
      connectionManager: {
        maxConnections: this.config.maxConnections
      }
    };
  }

  private buildHeliaConfig(libp2pConfig: Libp2pInit) {
    return {
      libp2p: libp2pConfig,
      blockstore: new MemoryBlockstore(),
      datastore: new MemoryDatastore(),
      blockBrokers: [trustlessGateway()],
      start: this.config.autoBootstrap
    };
  }

  private getEnabledGateways(): string[] {
    return this.config.gateways
      .filter(gateway => gateway.isEnabled && gateway.status === 'online')
      .sort((a, b) => {
        if (a.isDefault) return -1;
        if (b.isDefault) return 1;
        if (this.config.preferredGateway) {
          if (a.id === this.config.preferredGateway) return -1;
          if (b.id === this.config.preferredGateway) return 1;
        }
        return (a.latency || Infinity) - (b.latency || Infinity);
      })
      .map(gateway => gateway.url);
  }

  private getDhtRouters(): string[] {
    return this.config.customPeers
      .filter(peer => peer.status === 'connected' && !peer.isBootstrap)
      .map(peer => peer.multiaddr);
  }

  async fetch(
    resource: string, 
    options: VerifiedFetchOptions = {}
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(), 
      this.config.timeout
    );

    try {
      const combinedSignal = options.signal 
        ? this.combineAbortSignals([options.signal, controller.signal])
        : controller.signal;

      const response = await verifiedFetch(resource, {
        ...options,
        signal: combinedSignal
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout: IPFS content retrieval took too long');
      }
      
      throw error;
    }
  }

  async fetchWithRetry(
    resource: string, 
    options: VerifiedFetchOptions = {}
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      try {
        return await this.fetch(resource, options);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < this.config.retries) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }

    throw lastError;
  }

  async updatePeerConfig(newConfig: Partial<PeerManagerConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    
    if (this.helia) {
      await this.shutdown();
      await this.initialize();
    }
  }

  async addCustomPeer(peer: Omit<PeerInfo, 'id' | 'status'>): Promise<void> {
    const newPeer: PeerInfo = {
      ...peer,
      id: `custom-${Date.now()}`,
      status: 'unknown'
    };

    await this.updatePeerConfig({
      customPeers: [...this.config.customPeers, newPeer]
    });
  }

  async addTrustlessGateway(gateway: Omit<TrustlessGateway, 'id' | 'status'>): Promise<void> {
    const newGateway: TrustlessGateway = {
      ...gateway,
      id: `gateway-${Date.now()}`,
      status: 'unknown'
    };

    await this.updatePeerConfig({
      gateways: [...this.config.gateways, newGateway]
    });
  }

  async testGatewayConnectivity(gatewayId: string): Promise<boolean> {
    const gateway = this.config.gateways.find(g => g.id === gatewayId);
    if (!gateway) return false;

    const testCid = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
    const testUrl = `${gateway.url}/ipfs/${testCid}`;
    
    try {
      const startTime = Date.now();
      const response = await fetch(testUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(this.config.timeout)
      });
      
      const latency = Date.now() - startTime;
      const isOnline = response.ok || response.status === 404;
      
      gateway.status = isOnline ? 'online' : 'offline';
      gateway.latency = isOnline ? latency : undefined;
      gateway.lastTested = new Date();
      
      return isOnline;
    } catch (error) {
      gateway.status = 'offline';
      gateway.lastTested = new Date();
      return false;
    }
  }

  getConnectedPeers(): PeerInfo[] {
    return this.config.customPeers.filter(peer => peer.status === 'connected');
  }

  getActiveGateways(): TrustlessGateway[] {
    return this.config.gateways.filter(
      gateway => gateway.isEnabled && gateway.status === 'online'
    );
  }

  private combineAbortSignals(signals: AbortSignal[]): AbortSignal {
    const controller = new AbortController();

    const cleanup = () => {
      signals.forEach(signal => {
        signal.removeEventListener('abort', onAbort);
      });
    };

    const onAbort = () => {
      controller.abort();
      cleanup();
    };

    signals.forEach(signal => {
      if (signal.aborted) {
        controller.abort();
        return;
      }
      signal.addEventListener('abort', onAbort);
    });

    return controller.signal;
  }

  async shutdown(): Promise<void> {
    if (this.helia) {
      await this.helia.stop();
    }
    this.helia = undefined;
  }
}

export { 
  HeliaVerifiedFetchManager,
  type TrustlessGateway,
  type PeerInfo,
  type PeerManagerConfig,
  type VerifiedFetchOptions
};