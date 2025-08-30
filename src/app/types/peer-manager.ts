import type { CID } from 'multiformats/cid';

export interface TrustlessGateway {
  id: string;
  url: string;
  name: string;
  status: 'online' | 'offline' | 'testing' | 'unknown';
  isEnabled: boolean;
  isDefault?: boolean;
  latency?: number;
  lastTested?: Date;
}

export interface PeerInfo {
  id: string;
  multiaddr: string;
  name: string;
  status: 'connected' | 'connecting' | 'failed' | 'unknown';
  isBootstrap: boolean;
  isCustom: boolean;
  latency?: number;
  lastSeen?: Date;
}

export interface PeerManagerConfig {
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

export interface VerifiedFetchOptions {
  signal?: AbortSignal;
  headers?: HeadersInit;
  method?: string;
  body?: BodyInit;
  gateways?: string[];
  onProgress?: (bytes: number) => void;
}

export interface BootstrapResult {
  success: boolean;
  connectedPeers: number;
  totalPeers: number;
  errors: string[];
}

export interface PeerValidationResult {
  isValid: boolean;
  error?: string;
  parsedInfo?: {
    protocol: string;
    address: string;
    port?: number;
    peerId?: string;
  };
}

export interface ConnectionEvent {
  type: 'peer:connect' | 'peer:disconnect' | 'peer:error' | 'bootstrap:complete';
  peer?: PeerInfo;
  error?: string;
  data?: unknown;
}

export interface ConfigExportData {
  version: string;
  timestamp: string;
  config: PeerManagerConfig;
}

export interface MultiaddrInput {
  value: string;
  isValid: boolean;
  error?: string;
}

export type PeerEventHandler = (event: ConnectionEvent) => void;
export type IPFSResource = string | CID;