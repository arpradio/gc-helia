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
  RotateCcw
} from 'lucide-react';

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
  timeout: number;
  retries: number;
  preferredGateway?: string;
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

const IPFSPeerManager: React.FC = () => {
  const [config, setConfig] = useState<PeerManagerConfig>({
    gateways: [],
    timeout: 10000,
    retries: 2
  });
  
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [newGateway, setNewGateway] = useState<{ url: string; name: string }>({
    url: '',
    name: ''
  });
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [testingAll, setTestingAll] = useState<boolean>(false);

  useEffect(() => {
    initializeGateways();
  }, []);

  const initializeGateways = useCallback(() => {
    const gateways: TrustlessGateway[] = DEFAULT_GATEWAYS.map((gateway, index) => ({
      ...gateway,
      id: `gateway-${index}`,
      status: 'unknown' as const,
      isEnabled: true
    }));

    setConfig(prev => ({
      ...prev,
      gateways,
      preferredGateway: gateways.find(g => g.isDefault)?.id
    }));
  }, []);

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

  const removeGateway = (gatewayId: string): void => {
    setConfig(prev => ({
      ...prev,
      gateways: prev.gateways.filter(g => g.id !== gatewayId),
      preferredGateway: prev.preferredGateway === gatewayId 
        ? prev.gateways.find(g => g.isDefault && g.id !== gatewayId)?.id 
        : prev.preferredGateway
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

  const resetToDefaults = (): void => {
    initializeGateways();
  };

  const exportConfig = (): void => {
    const configJson = JSON.stringify(config, null, 2);
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

  const getStatusIcon = (status: TrustlessGateway['status']) => {
    switch (status) {
      case 'online':
        return <Wifi className="w-4 h-4 text-green-500" />;
      case 'offline':
        return <WifiOff className="w-4 h-4 text-red-500" />;
      case 'testing':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: TrustlessGateway['status']) => {
    switch (status) {
      case 'online': return 'border-green-200 bg-green-50';
      case 'offline': return 'border-red-200 bg-red-50';
      case 'testing': return 'border-blue-200 bg-blue-50';
      default: return 'border-gray-200 bg-gray-50';
    }
  };

  const onlineGateways = config.gateways.filter(g => g.status === 'online' && g.isEnabled);
  const averageLatency = onlineGateways.length > 0 
    ? onlineGateways.reduce((sum, g) => sum + (g.latency || 0), 0) / onlineGateways.length 
    : 0;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors duration-200"
      >
        <Settings className="w-4 h-4 mr-2" />
        IPFS Peers ({onlineGateways.length} online)
      </button>

      {isOpen && (
        <div className="absolute top-12 right-0 w-96 bg-white rounded-lg shadow-xl border z-50 max-h-96 overflow-hidden">
          <div className="p-4 border-b bg-slate-50">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-slate-800">IPFS Peer Manager</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-500 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="grid grid-cols-3 gap-2 text-sm text-slate-600">
              <div className="text-center">
                <div className="font-semibold text-slate-800">{onlineGateways.length}</div>
                <div>Online</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-slate-800">{averageLatency.toFixed(0)}ms</div>
                <div>Avg Latency</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-slate-800">{config.gateways.length}</div>
                <div>Total</div>
              </div>
            </div>

            <div className="flex gap-2 mt-3">
              <button
                onClick={testAllGateways}
                disabled={testingAll}
                className="flex items-center px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${testingAll ? 'animate-spin' : ''}`} />
                Test All
              </button>
              
              <button
                onClick={exportConfig}
                className="flex items-center px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded"
              >
                <Save className="w-3 h-3 mr-1" />
                Export
              </button>
              
              <button
                onClick={resetToDefaults}
                className="flex items-center px-3 py-1 bg-slate-600 hover:bg-slate-700 text-white text-sm rounded"
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Reset
              </button>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {config.gateways.map((gateway) => (
              <div
                key={gateway.id}
                className={`p-3 border-b border-l-4 transition-colors ${getStatusColor(gateway.status)}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {getStatusIcon(gateway.status)}
                      <span className="font-medium text-slate-800 truncate">
                        {gateway.name}
                      </span>
                      {gateway.isDefault && (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded">
                          Default
                        </span>
                      )}
                      {config.preferredGateway === gateway.id && (
                        <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded">
                          Preferred
                        </span>
                      )}
                    </div>
                    
                    <div className="text-sm text-slate-600 truncate mb-1">
                      {gateway.url}
                    </div>
                    
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      {gateway.latency && (
                        <span>{gateway.latency}ms</span>
                      )}
                      {gateway.lastTested && (
                        <span>
                          Tested: {gateway.lastTested.toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={() => testSingleGateway(gateway.id)}
                      disabled={gateway.status === 'testing'}
                      className="p-1 hover:bg-slate-200 rounded text-slate-600 disabled:opacity-50"
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
          </div>

          <div className="p-3 border-t bg-slate-50">
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
    </div>
  );
};

export default IPFSPeerManager;