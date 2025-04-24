import { WireGuardConfig } from '../types/index.js';
import wireguardManager from './wireguardManager.js';
import logger from '../utils/logger.js';
import { getConfig } from '../utils/config.js';
import tpnClient from '../api/tpnClient.js';

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
    try {
      // Disconnect from any existing connection first
      await this.disconnect();
      
      // Check if WireGuard is installed
      if (!wireguardManager.isWireGuardInstalled()) {
        logger.error('WireGuard is not installed on your system.');
        return false;
      }
      
      // Log the country we're connecting to
      if (config.country) {
        logger.info(`Connecting to VPN server in ${config.country}...`);
      } else {
        logger.info(`Connecting to VPN server at ${config.endpoint}...`);
      }
      
      // Obtenir l'IP d'origine pour comparaison
      let originalIp = 'unknown';
      try {
        originalIp = await wireguardManager.getCurrentPublicIp();
        logger.info(`Original public IP: ${originalIp}`);
      } catch (error) {
        logger.warn(`Could not determine original IP: ${(error as Error).message}`);
      }
      
      // Save the configuration to disk
      this.configPath = await wireguardManager.saveConfig(config);
      
      // Activate the configuration
      const success = wireguardManager.activateConfig(this.configPath);
      
      if (success) {
        this.activeConfig = config;
        
        // Attendre que la connexion s'établisse
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Vérifier que la connexion fonctionne réellement en comparant l'IP
        try {
          const newIp = await wireguardManager.getCurrentPublicIp();
          
          if (newIp === originalIp) {
            logger.warn(`VPN connection might not be working: IP unchanged (${newIp})`);
            // On continue quand même car parfois l'API peut être incohérente
          } else {
            logger.success(`Connected to VPN. New public IP: ${newIp}`);
          }
        } catch (error) {
          logger.warn(`Could not verify VPN connection: ${(error as Error).message}`);
        }
        
        // Set up automatic refresh based on expiration
        const expiryTime = config.expiresAt - Date.now();
        if (expiryTime > 0) {
          const refreshTime = Math.max(0, expiryTime - 60000); // Refresh 1 minute before expiry
          logger.debug(`Setting up connection refresh in ${Math.floor(refreshTime/60000)} minutes`);
          
          this.connectionTimer = setTimeout(async () => {
            logger.info('Connection is about to expire, refreshing...');
            await this.refreshConnection();
          }, refreshTime);
        } else {
          logger.warn('Connection expiry time is in the past, not setting refresh timer');
        }
        
        return true;
      } else {
        logger.error('Failed to activate WireGuard configuration');
        // En cas d'échec, nettoyer
        wireguardManager.cleanupAllInterfaces();
        return false;
      }
    } catch (error) {
      logger.error(`Connection failed: ${(error as Error).message}`);
      // En cas d'erreur, nettoyer
      wireguardManager.cleanupAllInterfaces();
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
      // Nettoyage de sécurité même si nous pensons qu'il n'y a pas de connexion active
      wireguardManager.cleanupAllInterfaces();
      return true;
    }
    
    try {
      // Log the country we're disconnecting from
      if (this.activeConfig.country) {
        logger.info(`Disconnecting from VPN server in ${this.activeConfig.country}...`);
      } else {
        logger.info(`Disconnecting from VPN server at ${this.activeConfig.endpoint}...`);
      }
      
      // Cancel the refresh timer if it exists
      if (this.connectionTimer) {
        clearTimeout(this.connectionTimer);
        this.connectionTimer = null;
      }
      
      // Deactivate the configuration
      const success = wireguardManager.deactivateConfig(this.configPath);
      
      // En cas d'échec, tenter un nettoyage complet
      if (!success) {
        logger.warn('Failed to disconnect normally, attempting full cleanup');
        wireguardManager.cleanupAllInterfaces();
      }
      
      logger.success(`Disconnected from VPN server: ${this.activeConfig.endpoint}`);
      this.activeConfig = null;
      this.configPath = null;
      return true;
    } catch (error) {
      logger.error(`Disconnect failed: ${(error as Error).message}`);
      // En cas d'erreur, tentative de nettoyage complet
      wireguardManager.cleanupAllInterfaces();
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
      
      const newConfig = wireguardManager.parseTpnResponse(configResponse, configResponse.country || country);
      
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
    return this.activeConfig !== null && this.configPath !== null && wireguardManager.isVpnActive();
  }
  
  /**
   * Get the current active configuration
   * @returns Active WireGuard configuration or null if not connected
   */
  getActiveConfig(): WireGuardConfig | null {
    return this.activeConfig;
  }
  
  /**
   * Create and establish a simple direct VPN connection
   * @param country Country code or 'any'
   * @param leaseMinutes Lease duration in minutes
   * @returns Promise resolving to boolean indicating success
   */
  async connectDirect(country: string = 'any', leaseMinutes: number = 5): Promise<boolean> {
    try {
      // Disconnect any existing connection
      await this.disconnect();
      
      // Get a random validator
      const validator = tpnClient.getRandomValidator();
      
      // Get a configuration for the specified country
      const configResponse = await tpnClient.getNewConfig(
        validator,
        country,
        leaseMinutes
      );
      
      // Parse the configuration
      const config = wireguardManager.parseTpnResponse(configResponse, configResponse.country || country);
      
      // Connect using the configuration
      return await this.connect(config);
    } catch (error) {
      logger.error(`Direct connection failed: ${(error as Error).message}`);
      return false;
    }
  }
}

// Export singleton instance
export default new ConnectionHandler();