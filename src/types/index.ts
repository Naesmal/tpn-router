/**
 * TPN API response types
 */
export interface TpnConfigResponse {
    peer_config: string;
    expires_at: number;
  }
  
  export interface ValidatorEndpoint {
    ip: string;
    port: number;
    isActive: boolean;
    lastChecked?: Date;
  }
  
  /**
   * WireGuard configuration types
   */
  export interface WireGuardConfig {
    id: string;
    privateKey: string;
    publicKey: string;
    presharedKey: string;
    endpoint: string;
    allowedIPs: string[];
    listenPort: number;
    raw: string;
    expiresAt: number;
    country?: string;
    dns?: string; 
  }
  
  /**
   * Circuit routing types
   */
  export interface CircuitNode {
    id: string;
    config: WireGuardConfig;
    index: number;
  }
  
  export interface Circuit {
    id: string;
    nodes: CircuitNode[];
    createdAt: Date;
    expiresAt: Date;
    active: boolean;
  }
  
  /**
   * Application configuration
   */
  export interface AppConfig {
    defaultCircuitLength: number;
    refreshInterval: number;
    defaultLeaseDuration: number;
    preferredCountries: string[];
    validators: ValidatorEndpoint[];
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  }