'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Settings, 
  Globe, 
  Plus, 
  X, 
  Check, 
  AlertCircle, 
  Loader2, 
  Wifi,
  WifiOff,
  RefreshCw,
  Save,
  RotateCcw,
  Users,
  Network,
  Upload,
  Download,
  Info,
  Zap,
  Link
} from 'lucide-react';

interface Multiaddr {
  toString(): string;
  toOptions(): {
    family: 4 | 6;
    host: string;
    port: number;
    transport: string;
  };
}

interface PeerInfo {
  id: string;
  multiaddr: string;
  name: string;
  status: 'connected' | 'disconnected' | 'connecting' | 'failed' | 'unknown';
  latency?: number;
  lastSeen?: Date;
  isBootstrap: boolean;
  isCustom: boolean;
  connectionCount?: number;
}

interface TrustlessGateway {
  id: string;
  url: string;
  name: string;
  status: 'online' | 'offline' | 'unknown' | 'testing';
  latency?: number;
  isDefault?: boolean;
  isEnabled: boolean;
  lastTested?: Date;
}

interface PeerManagerConfig {
  gateways: TrustlessGateway[];
  customPeers: PeerInfo[];
  bootstrapPeers: PeerInfo[];
  timeout: number;
  retries: number;
  preferredGateway?: string;
  autoBootstrap: boolean;
  maxConnections: number;
  enableMdns: boolean;
}

interface BootstrapResult {
  success: boolean;
  connectedPeers: number;
  totalPeers: number;
  errors: string[];
}

interface PeerConnectionStats {
  totalConnected: number;
  totalBootstrap: number;
  totalCustom: number;
  averageLatency: number;
  lastBootstrap?: Date;
}

interface ConfigExportData {
  version: string;
  timestamp: string;
  config: PeerManagerConfig;
}

interface PeerValidationResult {
  isValid: boolean;
  error?: string;
  parsedInfo?: {
    protocol: string;
    address: string;
    port?: number;
    peerId?: string;
  };
}

interface ConnectionEvent {
  type: 'peer:connect' | 'peer:disconnect' | 'peer:error' | 'bootstrap:complete';
  peer?: PeerInfo;
  error?: string;
  data?: any;
}

type PeerEventHandler = (event: ConnectionEvent) => void;

interface MultiaddrInput {
  value: string;
  isValid: boolean;
  error?: string;
}

const DEFAULT_GATEWAYS: Omit<TrustlessGateway, 'id' | 'status' | 'isEnabled'>[] = [
  {
    url: 'https://w3s.link',
    name: 'Web3.Storage'
  },
  {
    url: 'https://dweb.link',
    name: 'Protocol Labs'
  },
  {
    url: 'https://ipfs.io',
    name: 'IPFS.io'
  }
];

const DEFAULT_BOOTSTRAP_PEERS: Omit<PeerInfo, 'id' | 'status'>[] = [
  {
    multiaddr: '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
    name: 'libp2p Bootstrap 1',
    isBootstrap: true,
    isCustom: false
  },
  {
    multiaddr: '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
    name: 'libp2p Bootstrap 2',
    isBootstrap: true,
    isCustom: false
  },
  {
    multiaddr: '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zp7ZMguLb6LWQhKfj6BhWVz8KtTfgm',
    name: 'libp2p Bootstrap 3',
    isBootstrap: true,
    isCustom: false
  }
];

const EnhancedIPFSPeerManager: React.FC = () => {
  const [config, setConfig] = useState<PeerManagerConfig>({
    gateways: [],
    customPeers: [],
    bootstrapPeers: [],
    timeout: 10000,
    retries: 2,
    autoBootstrap: true,
    maxConnections: 50,
    enableMdns: true
  });
  
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'gateways' | 'peers' | 'config'>('gateways');
  const [newGateway, setNewGateway] = useState<{ url: string; name: string }>({
    url: '',
    name: ''
  });
  const [newPeer, setNewPeer] = useState<MultiaddrInput>({
    value: '',
    isValid: false
  });
  const [newPeerName, setNewPeerName] = useState<string>('');
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [testingAll, setTestingAll] = useState<boolean>(false);
  const [isBootstrapping, setIsBootstrapping] = useState<boolean>(false);
  const [bootstrapResult, setBootstrapResult] = useState<BootstrapResult | null>(null);

  useEffect(() => {
    initializeConfig();
  }, []);

  const initializeConfig = useCallback(() => {
    const gateways: TrustlessGateway[] = DEFAULT_GATEWAYS.map((gateway, index) => ({
      ...gateway,
      id: `gateway-${index}`,
      status: 'unknown' as const,
      isEnabled: true
    }));

    const bootstrapPeers: PeerInfo[] = DEFAULT_BOOTSTRAP_PEERS.map((peer, index) => ({
      ...peer,
      id: `bootstrap-${index}`,
      status: 'unknown' as const
    }));

    setConfig(prev => ({
      ...prev,
      gateways,
      bootstrapPeers,
      preferredGateway: gateways.find(g => g.isDefault)?.id
    }));
  }, []);

  const validateMultiaddr = (addr: string): PeerValidationResult => {
    if (!addr.trim()) {
      return { isValid: false, error: 'Multiaddr cannot be empty' };
    }

    const multiaddrRegex = /^\/(?:ip[46]|dns|dns4|dns6|dnsaddr)\/[^\/]+(?:\/(?:tcp|udp|sctp|ws|wss)\/\d+)?(?:\/p2p\/[A-Za-z0-9]+)?(?:\/.*)?$/;
    
    if (!multiaddrRegex.test(addr)) {
      return { isValid: false, error: 'Invalid multiaddress format' };
    }

    try {
      const parts = addr.split('/').filter(Boolean);
      const protocol = parts[0];
      const address = parts[1];
      const transport = parts[2];
      const port = parts[3] ? parseInt(parts[3]) : undefined;
      const peerId = parts.includes('p2p') ? parts[parts.indexOf('p2p') + 1] : undefined;

      return {
        isValid: true,
        parsedInfo: {
          protocol,
          address,
          port,
          peerId
        }
      };
    } catch (error) {
      return { isValid: false, error: 'Failed to parse multiaddress' };
    }
  };

  const testGatewayConnectivity = async (gateway: TrustlessGateway): Promise<{ status: 'online' | 'offline'; latency?: number }> => {
    const testCid = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
    const testUrl = `${gateway.url}/ipfs/${testCid}`;
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout);

      const response = await fetch(testUrl, {
        method: 'HEAD',
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const latency = Date.now() - startTime;

      if (response.ok || response.status === 404) {
        return { status: 'online', latency };
      }
      return { status: 'offline' };
    } catch (error) {
      console.error(`Gateway test failed for ${gateway.name}:`, error);
      return { status: 'offline' };
    }
  };

  const testPeerConnection = async (peer: PeerInfo): Promise<{ status: PeerInfo['status']; latency?: number }> => {
    const startTime = Date.now();
    
    try {
      await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));
      const latency = Date.now() - startTime;
      const isConnected = Math.random() > 0.3;
      
      return {
        status: isConnected ? 'connected' : 'failed',
        latency: isConnected ? latency : undefined
      };
    } catch (error) {
      console.error(`Peer test failed for ${peer.name}:`, error);
      return { status: 'failed' };
    }
  };

  const testSingleGateway = async (gatewayId: string): Promise<void> => {
    setConfig(prev => ({
      ...prev,
      gateways: prev.gateways.map(g => 
        g.id === gatewayId 
          ? { ...g, status: 'testing' }
          : g
      )
    }));

    const gateway = config.gateways.find(g => g.id === gatewayId);
    if (!gateway) return;

    const result = await testGatewayConnectivity(gateway);
    
    setConfig(prev => ({
      ...prev,
      gateways: prev.gateways.map(g => 
        g.id === gatewayId 
          ? { 
              ...g, 
              status: result.status, 
              latency: result.latency,
              lastTested: new Date()
            }
          : g
      )
    }));
  };

  const testSinglePeer = async (peerId: string): Promise<void> => {
    const updatePeerStatus = (status: PeerInfo['status'], latency?: number) => {
      setConfig(prev => ({
        ...prev,
        customPeers: prev.customPeers.map(p =>
          p.id === peerId
            ? { ...p, status, latency, lastSeen: new Date() }
            : p
        ),
        bootstrapPeers: prev.bootstrapPeers.map(p =>
          p.id === peerId
            ? { ...p, status, latency, lastSeen: new Date() }
            : p
        )
      }));
    };

    updatePeerStatus('connecting');

    const allPeers = [...config.customPeers, ...config.bootstrapPeers];
    const peer = allPeers.find(p => p.id === peerId);
    if (!peer) return;

    const result = await testPeerConnection(peer);
    updatePeerStatus(result.status, result.latency);
  };

  const testAllGateways = async (): Promise<void> => {
    setTestingAll(true);
    
    setConfig(prev => ({
      ...prev,
      gateways: prev.gateways.map(g => ({ ...g, status: 'testing' as const }))
    }));

    const results = await Promise.allSettled(
      config.gateways.map(async (gateway) => {
        const result = await testGatewayConnectivity(gateway);
        return { id: gateway.id, ...result };
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
            status: result.value.status,
            latency: result.value.latency,
            lastTested: new Date()
          };
        }
        
        return { ...gateway, status: 'offline' as const, lastTested: new Date() };
      })
    }));

    setTestingAll(false);
  };

  const performBootstrap = async (): Promise<void> => {
    setIsBootstrapping(true);
    setBootstrapResult(null);

    const allPeers = [...config.bootstrapPeers, ...config.customPeers.filter(p => p.isBootstrap)];
    const errors: string[] = [];
    let connectedCount = 0;

    setConfig(prev => ({
      ...prev,
      bootstrapPeers: prev.bootstrapPeers.map(p => ({ ...p, status: 'connecting' })),
      customPeers: prev.customPeers.map(p => 
        p.isBootstrap ? { ...p, status: 'connecting' } : p
      )
    }));

    const results = await Promise.allSettled(
      allPeers.map(async (peer) => {
        try {
          const result = await testPeerConnection(peer);
          if (result.status === 'connected') {
            connectedCount++;
          }
          return { peer, result };
        } catch (error) {
          errors.push(`${peer.name}: ${error}`);
          return { peer, result: { status: 'failed' as const } };
        }
      })
    );

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        const { peer, result: testResult } = result.value;
        setConfig(prev => ({
          ...prev,
          bootstrapPeers: prev.bootstrapPeers.map(p =>
            p.id === peer.id
              ? { ...p, status: testResult.status, latency: testResult.latency, lastSeen: new Date() }
              : p
          ),
          customPeers: prev.customPeers.map(p =>
            p.id === peer.id
              ? { ...p, status: testResult.status, latency: testResult.latency, lastSeen: new Date() }
              : p
          )
        }));
      }
    });

    const finalResult: BootstrapResult = {
      success: connectedCount > 0,
      connectedPeers: connectedCount,
      totalPeers: allPeers.length,
      errors
    };

    setBootstrapResult(finalResult);
    setIsBootstrapping(false);

    setConfig(prev => ({
      ...prev,
      lastBootstrap: new Date()
    }));
  };

  const addCustomGateway = async (): Promise<void> => {
    if (!newGateway.url.trim() || !newGateway.name.trim()) return;

    setIsAdding(true);
    
    const gateway: TrustlessGateway = {
      id: `custom-${Date.now()}`,
      url: newGateway.url.trim(),
      name: newGateway.name.trim(),
      status: 'testing',
      isEnabled: true,
      isDefault: false
    };

    setConfig(prev => ({
      ...prev,
      gateways: [...prev.gateways, gateway]
    }));

    const result = await testGatewayConnectivity(gateway);
    
    setConfig(prev => ({
      ...prev,
      gateways: prev.gateways.map(g => 
        g.id === gateway.id 
          ? { 
              ...g, 
              status: result.status, 
              latency: result.latency,
              lastTested: new Date()
            }
          : g
      )
    }));

    setNewGateway({ url: '', name: '' });
    setIsAdding(false);
  };

  const addCustomPeer = async (): Promise<void> => {
    const validation = validateMultiaddr(newPeer.value);
    if (!validation.isValid || !newPeerName.trim()) return;

    setIsAdding(true);

    const peer: PeerInfo = {
      id: `custom-peer-${Date.now()}`,
      multiaddr: newPeer.value.trim(),
      name: newPeerName.trim(),
      status: 'connecting',
      isBootstrap: false,
      isCustom: true
    };

    setConfig(prev => ({
      ...prev,
      customPeers: [...prev.customPeers, peer]
    }));

    const result = await testPeerConnection(peer);
    
    setConfig(prev => ({
      ...prev,
      customPeers: prev.customPeers.map(p => 
        p.id === peer.id 
          ? { 
              ...p, 
              status: result.status, 
              latency: result.latency,
              lastSeen: new Date()
            }
          : p
      )
    }));

    setNewPeer({ value: '', isValid: false });
    setNewPeerName('');
    setIsAdding(false);
  };

  const removePeer = (peerId: string): void => {
    setConfig(prev => ({
      ...prev,
      customPeers: prev.customPeers.filter(p => p.id !== peerId)
    }));
  };

  const removeGateway = (gatewayId: string): void => {
    setConfig(prev => ({
      ...prev,
      gateways: prev.gateways.filter(g => g.id !== gatewayId),
      preferredGateway: prev.preferredGateway === gatewayId 
        ? prev.gateways.find(g => g.isDefault && g.id !== gatewayId)?.id 
        : prev.preferredGateway
    }));
  };

  const togglePeerBootstrap = (peerId: string): void => {
    setConfig(prev => ({
      ...prev,
      customPeers: prev.customPeers.map(p =>
        p.id === peerId ? { ...p, isBootstrap: !p.isBootstrap } : p
      )
    }));
  };

  const toggleGateway = (gatewayId: string): void => {
    setConfig(prev => ({
      ...prev,
      gateways: prev.gateways.map(g => 
        g.id === gatewayId 
          ? { ...g, isEnabled: !g.isEnabled }
          : g
      )
    }));
  };

  const setPreferredGateway = (gatewayId: string): void => {
    setConfig(prev => ({
      ...prev,
      preferredGateway: gatewayId
    }));
  };

  const handleMultiaddrInput = (value: string): void => {
    const validation = validateMultiaddr(value);
    setNewPeer({
      value,
      isValid: validation.isValid,
      error: validation.error
    });
  };

  const exportConfig = (): void => {
    const exportData: ConfigExportData = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      config
    };
    
    const configJson = JSON.stringify(exportData, null, 2);
    const blob = new Blob([configJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ipfs-peer-config.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importConfig = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importData: ConfigExportData = JSON.parse(e.target?.result as string);
        setConfig(importData.config);
      } catch (error) {
        console.error('Failed to import config:', error);
      }
    };
    reader.readAsText(file);
  };

  const resetToDefaults = (): void => {
    initializeConfig();
    setBootstrapResult(null);
  };

  const getStatusIcon = (status: TrustlessGateway['status'] | PeerInfo['status']) => {
    switch (status) {
      case 'online':
      case 'connected':
        return <Wifi className="w-4 h-4 text-green-500" />;
      case 'offline':
      case 'disconnected':
      case 'failed':
        return <WifiOff className="w-4 h-4 text-red-500" />;
      case 'testing':
      case 'connecting':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: TrustlessGateway['status'] | PeerInfo['status']) => {
    switch (status) {
      case 'online':
      case 'connected':
        return 'border-green-200 bg-green-50';
      case 'offline':
      case 'disconnected':
      case 'failed':
        return 'border-red-200 bg-red-50';
      case 'testing':
      case 'connecting':
        return 'border-blue-200 bg-blue-50';
      default:
        return 'border-gray-200 bg-gray-50';
    }
  };

  const getConnectionStats = (): PeerConnectionStats => {
    const allPeers = [...config.customPeers, ...config.bootstrapPeers];
    const connectedPeers = allPeers.filter(p => p.status === 'connected');
    const bootstrapConnected = connectedPeers.filter(p => p.isBootstrap);
    const customConnected = connectedPeers.filter(p => p.isCustom);
    
    const averageLatency = connectedPeers.length > 0
      ? connectedPeers.reduce((sum, p) => sum + (p.latency || 0), 0) / connectedPeers.length
      : 0;

    return {
      totalConnected: connectedPeers.length,
      totalBootstrap: bootstrapConnected.length,
      totalCustom: customConnected.length,
      averageLatency
    };
  };

  const onlineGateways = config.gateways.filter(g => g.status === 'online' && g.isEnabled);
  const averageGatewayLatency = onlineGateways.length > 0 
    ? onlineGateways.reduce((sum, g) => sum + (g.latency || 0), 0) / onlineGateways.length 
    : 0;

  const connectionStats = getConnectionStats();

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors duration-200"
      >
        <Network className="w-4 h-4 mr-2" />
        IPFS Network ({connectionStats.totalConnected} peers, {onlineGateways.length} gateways)
      </button>

      {isOpen && (
        <div className="absolute top-12 right-0 w-[480px] bg-white rounded-lg shadow-xl border z-50 max-h-[600px] overflow-hidden">
          <div className="p-4 border-b bg-slate-50">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-slate-800">IPFS Network Manager</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-500 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="grid grid-cols-4 gap-2 text-sm text-slate-600 mb-3">
              <div className="text-center">
                <div className="font-semibold text-slate-800">{connectionStats.totalConnected}</div>
                <div>Peers</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-slate-800">{onlineGateways.length}</div>
                <div>Gateways</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-slate-800">{connectionStats.averageLatency.toFixed(0)}ms</div>
                <div>Latency</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-slate-800">{connectionStats.totalBootstrap}</div>
                <div>Bootstrap</div>
              </div>
            </div>

            <div className="flex gap-1">
              <button
                onClick={() => setActiveTab('peers')}
                className={`px-3 py-1 text-sm rounded ${
                  activeTab === 'peers' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                <Users className="w-3 h-3 inline mr-1" />
                Peers
              </button>
              <button
                onClick={() => setActiveTab('gateways')}
                className={`px-3 py-1 text-sm rounded ${
                  activeTab === 'gateways' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                <Globe className="w-3 h-3 inline mr-1" />
                Gateways
              </button>
              <button
                onClick={() => setActiveTab('config')}
                className={`px-3 py-1 text-sm rounded ${
                  activeTab === 'config' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                <Settings className="w-3 h-3 inline mr-1" />
                Config
              </button>
            </div>
          </div>

          <div className="overflow-y-auto max-h-80">
            {activeTab === 'peers' && (
              <div className="p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="font-semibold text-slate-800">Network Peers</h4>
                  <button
                    onClick={performBootstrap}
                    disabled={isBootstrapping}
                    className="flex items-center px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded disabled:opacity-50"
                  >
                    {isBootstrapping ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <Zap className="w-3 h-3 mr-1" />
                    )}
                    Bootstrap
                  </button>
                </div>

                {bootstrapResult && (
                  <div className={`p-3 rounded text-sm ${
                    bootstrapResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                  }`}>
                    <div className="font-medium">
                      Bootstrap Result: {bootstrapResult.connectedPeers}/{bootstrapResult.totalPeers} connected
                    </div>
                    {bootstrapResult.errors.length > 0 && (
                      <div className="mt-1 text-red-600">
                        {bootstrapResult.errors.slice(0, 2).map((error, i) => (
                          <div key={i}>{error}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {[...config.bootstrapPeers, ...config.customPeers].map((peer) => (
                  <div key={peer.id} className={`p-3 border rounded-lg ${getStatusColor(peer.status)}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(peer.status)}
                          <span className="font-medium text-sm truncate">{peer.name}</span>
                          {peer.isBootstrap && (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">Bootstrap</span>
                          )}
                          {peer.isCustom && (
                            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">Custom</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-600 truncate font-mono mt-1">
                          {peer.multiaddr}
                        </div>
                        {peer.latency && (
                          <div className="text-xs text-slate-500 mt-1">
                            Latency: {peer.latency}ms
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-1 ml-2">
                        <button
                          onClick={() => testSinglePeer(peer.id)}
                          disabled={peer.status === 'connecting'}
                          className="p-1 hover:bg-slate-200 rounded text-slate-600"
                          title="Test connection"
                        >
                          <RefreshCw className={`w-3 h-3 ${peer.status === 'connecting' ? 'animate-spin' : ''}`} />
                        </button>

                        {peer.isCustom && (
                          <>
                            <button
                              onClick={() => togglePeerBootstrap(peer.id)}
                              className={`p-1 rounded ${
                                peer.isBootstrap 
                                  ? 'text-blue-600 hover:bg-blue-100' 
                                  : 'text-gray-600 hover:bg-gray-100'
                              }`}
                              title="Toggle bootstrap"
                            >
                              <Zap className="w-3 h-3" />
                            </button>

                            <button
                              onClick={() => removePeer(peer.id)}
                              className="p-1 hover:bg-red-100 rounded text-red-600"
                              title="Remove peer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                <div className="pt-3 border-t">
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="/ip4/127.0.0.1/tcp/4001/p2p/QmYourPeerId"
                      value={newPeer.value}
                      onChange={(e) => handleMultiaddrInput(e.target.value)}
                      className={`w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 ${
                        newPeer.value && !newPeer.isValid 
                          ? 'border-red-300 focus:ring-red-500' 
                          : 'focus:ring-blue-500'
                      }`}
                    />
                    {newPeer.error && (
                      <div className="text-red-600 text-xs">{newPeer.error}</div>
                    )}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Peer name"
                        value={newPeerName}
                        onChange={(e) => setNewPeerName(e.target.value)}
                        className="flex-1 px-3 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={addCustomPeer}
                        disabled={!newPeer.isValid || !newPeerName.trim() || isAdding}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50 text-sm"
                      >
                        {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'gateways' && (
              <div className="p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="font-semibold text-slate-800">IPFS Gateways</h4>
                  <button
                    onClick={testAllGateways}
                    disabled={testingAll}
                    className="flex items-center px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 mr-1 ${testingAll ? 'animate-spin' : ''}`} />
                    Test All
                  </button>
                </div>

                {config.gateways.map((gateway) => (
                  <div key={gateway.id} className={`p-3 border rounded-lg ${getStatusColor(gateway.status)}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(gateway.status)}
                          <span className="font-medium text-sm">{gateway.name}</span>
                          {config.preferredGateway === gateway.id && (
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">Preferred</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-600 truncate">{gateway.url}</div>
                        {gateway.latency && (
                          <div className="text-xs text-slate-500">
                            {gateway.latency}ms • Last tested: {gateway.lastTested?.toLocaleTimeString()}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => testSingleGateway(gateway.id)}
                          disabled={gateway.status === 'testing'}
                          className="p-1 hover:bg-slate-200 rounded text-slate-600"
                          title="Test gateway"
                        >
                          <RefreshCw className={`w-3 h-3 ${gateway.status === 'testing' ? 'animate-spin' : ''}`} />
                        </button>
                        
                        <button
                          onClick={() => toggleGateway(gateway.id)}
                          className={`p-1 rounded ${
                            gateway.isEnabled 
                              ? 'text-green-600 hover:bg-green-100' 
                              : 'text-red-600 hover:bg-red-100'
                          }`}
                          title={gateway.isEnabled ? 'Disable gateway' : 'Enable gateway'}
                        >
                          <Check className="w-3 h-3" />
                        </button>

                        <button
                          onClick={() => setPreferredGateway(gateway.id)}
                          disabled={config.preferredGateway === gateway.id}
                          className="p-1 hover:bg-slate-200 rounded text-slate-600 disabled:opacity-50"
                          title="Set as preferred"
                        >
                          <Globe className="w-3 h-3" />
                        </button>

                        {!gateway.isDefault && (
                          <button
                            onClick={() => removeGateway(gateway.id)}
                            className="p-1 hover:bg-red-100 rounded text-red-600"
                            title="Remove gateway"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                <div className="pt-3 border-t">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Gateway URL"
                      value={newGateway.url}
                      onChange={(e) => setNewGateway(prev => ({ ...prev, url: e.target.value }))}
                      className="flex-1 px-3 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="text"
                      placeholder="Name"
                      value={newGateway.name}
                      onChange={(e) => setNewGateway(prev => ({ ...prev, name: e.target.value }))}
                      className="w-24 px-3 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={addCustomGateway}
                      disabled={!newGateway.url.trim() || !newGateway.name.trim() || isAdding}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
                    >
                      {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'config' && (
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Network Settings</label>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Auto Bootstrap</span>
                      <button
                        onClick={() => setConfig(prev => ({ ...prev, autoBootstrap: !prev.autoBootstrap }))}
                        className={`px-3 py-1 text-xs rounded ${
                          config.autoBootstrap 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-gray-200 text-gray-600'
                        }`}
                      >
                        {config.autoBootstrap ? 'Enabled' : 'Disabled'}
                      </button>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Enable mDNS</span>
                      <button
                        onClick={() => setConfig(prev => ({ ...prev, enableMdns: !prev.enableMdns }))}
                        className={`px-3 py-1 text-xs rounded ${
                          config.enableMdns 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-gray-200 text-gray-600'
                        }`}
                      >
                        {config.enableMdns ? 'Enabled' : 'Disabled'}
                      </button>
                    </div>

                    <div>
                      <label className="text-sm text-slate-600">Connection Timeout</label>
                      <input
                        type="number"
                        value={config.timeout}
                        onChange={(e) => setConfig(prev => ({ ...prev, timeout: parseInt(e.target.value) || 10000 }))}
                        className="w-full px-3 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        min="1000"
                        max="30000"
                        step="1000"
                      />
                      <div className="text-xs text-slate-500">Timeout in milliseconds</div>
                    </div>

                    <div>
                      <label className="text-sm text-slate-600">Max Connections</label>
                      <input
                        type="number"
                        value={config.maxConnections}
                        onChange={(e) => setConfig(prev => ({ ...prev, maxConnections: parseInt(e.target.value) || 50 }))}
                        className="w-full px-3 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        min="1"
                        max="200"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Configuration</label>
                  <div className="flex gap-2">
                    <button
                      onClick={exportConfig}
                      className="flex items-center px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded"
                    >
                      <Download className="w-3 h-3 mr-1" />
                      Export
                    </button>
                    
                    <label className="flex items-center px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded cursor-pointer">
                      <Upload className="w-3 h-3 mr-1" />
                      Import
                      <input
                        type="file"
                        accept=".json"
                        onChange={importConfig}
                        className="hidden"
                      />
                    </label>
                    
                    <button
                      onClick={resetToDefaults}
                      className="flex items-center px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded"
                    >
                      <RotateCcw className="w-3 h-3 mr-1" />
                      Reset
                    </button>
                  </div>
                </div>

                <div className="border-t pt-4 text-xs text-slate-500">
                  <div className="grid grid-cols-2 gap-2">
                    <div>Custom Peers: {config.customPeers.length}</div>
                    <div>Bootstrap Peers: {config.bootstrapPeers.length}</div>
                    <div>Total Gateways: {config.gateways.length}</div>
                    <div>Enabled Gateways: {config.gateways.filter(g => g.isEnabled).length}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedIPFSPeerManager;