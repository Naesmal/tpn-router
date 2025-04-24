import { WireGuardConfig } from '../types';
import wireguardManager from './wireguardManager';
import logger from '../utils/logger';
import { getConfig } from '../utils/config';
import tpnClient from '../api/tpnClient';

/**
 * Class to handle VPN connections
 */
export class ConnectionHandler {
  private activeConfig: WireGuardConfig | null = null;
  private configPath: string | null = null;
  private connectionTimer: NodeJS.Timeout | null = null;
  
  /**
   * Connect to a VPN using the given WireGuard configuration
   * @param config WireGuard configuration to use
   * @returns Promise resolving to boolean indicating success
   */
  async connect(config: WireGuardConfig): Promise<boolean> {
    // Disconnect from any existing connection first
    if (this.activeConfig) {
      await this.disconnect();
    }
    
    // Check if WireGuard is installed
    if (!wireguardManager.isWireGuardInstalled()) {
      logger.error('WireGuard is not installed on your system.');
      return false;
    }
    
    try {
      // Save the configuration to disk
      this.configPath = await wireguardManager.saveConfig(config);
      
      // Log the original IP address
      const originalIp = await wireguardManager.getCurrentPublicIp();
      logger.info(`Original public IP: ${originalIp}`);
      
      // Activate the configuration
      const success = wireguardManager.activateConfig(this.configPath);
      
      if (success) {
        this.activeConfig = config;
        
        // Set up automatic refresh based on expiration
        const expiryTime = config.expiresAt - Date.now();
        const refreshTime = Math.max(0, expiryTime - 60000); // Refresh 1 minute before expiry
        
        this.connectionTimer = setTimeout(async () => {
          logger.info('Connection is about to expire, refreshing...');
          await this.refreshConnection();
        }, refreshTime);
        
        // Get the new IP address after connection
        const newIp = await wireguardManager.getCurrentPublicIp();
        logger.success(`Connected to VPN. New public IP: ${newIp}`);
        
        return true;
      } else {
        logger.error('Failed to activate WireGuard configuration');
        return false;
      }
    } catch (error) {
      logger.error(`Connection failed: ${(error as Error).message}`);
      return false;
    }
  }
  
  /**
   * Disconnect from the current VPN
   * @returns Promise resolving to boolean indicating success
   */
  async disconnect(): Promise<boolean> {
    if (!this.activeConfig || !this.configPath) {
      logger.info('No active VPN connection to disconnect');
      return true;
    }
    
    try {
      // Cancel the refresh timer if it exists
      if (this.connectionTimer) {
        clearTimeout(this.connectionTimer);
        this.connectionTimer = null;
      }
      
      // Deactivate the configuration
      const success = wireguardManager.deactivateConfig(this.configPath);
      
      if (success) {
        logger.success(`Disconnected from VPN server: ${this.activeConfig.endpoint}`);
        this.activeConfig = null;
        this.configPath = null;
        return true;
      } else {
        logger.error('Failed to disconnect from VPN');
        return false;
      }
    } catch (error) {
      logger.error(`Disconnect failed: ${(error as Error).message}`);
      return false;
    }
  }
  
  /**
   * Refresh the current connection with a new one
   * @returns Promise resolving to boolean indicating success
   */
  async refreshConnection(): Promise<boolean> {
    if (!this.activeConfig) {
      logger.warn('No active connection to refresh');
      return false;
    }
    
    try {
      // Get a new configuration from the same country
      const validator = tpnClient.getRandomValidator();
      const { defaultLeaseDuration } = getConfig();
      const country = this.activeConfig.country || 'any';
      
      logger.info(`Refreshing connection using country: ${country}`);
      
      const configResponse = await tpnClient.getNewConfig(
        validator,
        country,
        defaultLeaseDuration
      );
      
      const newConfig = wireguardManager.parseTpnResponse(configResponse, country);
      
      // Connect with the new configuration
      return await this.connect(newConfig);
    } catch (error) {
      logger.error(`Failed to refresh connection: ${(error as Error).message}`);
      return false;
    }
  }
  
  /**
   * Check if there is an active connection
   * @returns Boolean indicating if connection is active
   */
  isConnected(): boolean {
    return this.activeConfig !== null && this.configPath !== null;
  }
  
  /**
   * Get the current active configuration
   * @returns Active WireGuard configuration or null if not connected
   */
  getActiveConfig(): WireGuardConfig | null {
    return this.activeConfig;
  }
}

// Export singleton instance
export default new ConnectionHandler();