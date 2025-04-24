import { v4 as uuidv4 } from 'uuid';
import { Circuit, WireGuardConfig } from '../types/index.js';
import circuitBuilder from './circuitBuilder.js';
import connectionHandler from '../vpn/connectionHandler.js';
import logger from '../utils/logger.js';
import { EventEmitter } from 'events';
import { execSync } from 'child_process';
import wireguardManager from '../vpn/wireguardManager.js';
import tpnClient from '../api/tpnClient.js';
import { getConfig } from '../utils/config.js';

/**
 * Class to manage routing through TPN VPN
 */
export class RouteManager extends EventEmitter {
  private activeCircuit: Circuit | null = null;
  private circuitRefreshTimer: NodeJS.Timeout | null = null;
  
  constructor() {
    super();
  }
  
  /**
   * Create and activate a new VPN route
   * @param length Number of hops in the circuit (for advanced mode)
   * @param countries Optional specific countries for each hop
   * @param simple Use simple mode (direct connection) if true
   * @returns Promise resolving to boolean indicating success
   */
  async createRoute(length?: number, countries?: string[], simple: boolean = true): Promise<boolean> {
    try {
      // Clean up existing wireguard interfaces
      logger.info('Cleaning up existing WireGuard interfaces...');
      wireguardManager.cleanupAllInterfaces();
      
      // Stop any existing route
      await this.stopRoute();
      
      // Simple mode - just a direct VPN connection (recommended)
      if (simple || !length || length === 1) {
        logger.info('Using simple mode (direct VPN connection)');
        
        // Get the country for the connection
        const country = countries && countries.length > 0 ? countries[0] : 'any';
        
        // Connect directly using connectionHandler
        const connected = await connectionHandler.connectDirect(country, getConfig().defaultLeaseDuration);
        
        if (!connected) {
          logger.error('Failed to establish VPN connection');
          return false;
        }
        
        // Create a "circuit" with a single node for compatibility with existing code
        const config = connectionHandler.getActiveConfig();
        if (!config) {
          logger.error('Connection established but no active configuration found');
          return false;
        }
        
        // Create a circuit with one node
        const currentTime = Date.now();
        this.activeCircuit = {
          id: uuidv4(),
          nodes: [{
            id: uuidv4(),
            config,
            index: 0
          }],
          createdAt: new Date(currentTime),
          expiresAt: new Date(config.expiresAt),
          active: true
        };
        
        logger.success('VPN route created successfully');
        this.emit('route:created', this.activeCircuit);
        return true;
      }
      // Advanced mode - multi-hop circuit (experimental)
      else {
        logger.warn('Using advanced mode (multi-hop circuit) - this is experimental');
        
        // Build a circuit
        logger.info('Building a multi-hop routing circuit...');
        const circuit = await circuitBuilder.buildCircuit(length, countries);
        
        // Validate the circuit
        if (!circuitBuilder.validateCircuit(circuit)) {
          logger.error('Invalid circuit, cannot create route');
          return false;
        }
        
        // Get the entry node configuration
        const entryConfig = circuitBuilder.getEntryNodeConfig(circuit);
        
        // Connect to the entry node
        logger.info(`Connecting to entry node in ${entryConfig.country || 'unknown country'}...`);
        const connected = await connectionHandler.connect(entryConfig);
        
        if (!connected) {
          logger.error('Failed to connect to entry node');
          return false;
        }
        
        // Set the active circuit
        this.activeCircuit = circuit;
        if (this.activeCircuit) {
          this.activeCircuit.active = true;
        }
        
        // Set up circuit refresh timer
        this.setupRefreshTimer();
        
        logger.success('Multi-hop route created successfully');
        this.emit('route:created', circuit);
        return true;
      }
    } catch (error) {
      logger.error(`Failed to create route: ${(error as Error).message}`);
      return false;
    }
  }
  
  /**
   * Set up a timer to refresh the route before it expires
   */
  private setupRefreshTimer(): void {
    if (!this.activeCircuit) return;
    
    // Clear any existing timer
    if (this.circuitRefreshTimer) {
      clearTimeout(this.circuitRefreshTimer);
      this.circuitRefreshTimer = null;
    }
    
    // Calculate refresh time (1 minute before expiry)
    const refreshTime = this.activeCircuit.expiresAt.getTime() - Date.now() - 60000;
    
    if (refreshTime > 0) {
      logger.debug(`Setting up route refresh in ${Math.floor(refreshTime/60000)} minutes`);
      this.circuitRefreshTimer = setTimeout(() => {
        logger.info('Route is about to expire, refreshing...');
        this.refreshRoute().catch(err => {
          logger.error(`Failed to refresh route: ${err.message}`);
        });
      }, refreshTime);
    } else {
      logger.warn('Route expiry time is in the past, not setting refresh timer');
    }
  }
  
  /**
   * Stop the current routing circuit
   * @returns Promise resolving to boolean indicating success
   */
  async stopRoute(): Promise<boolean> {
    if (!this.activeCircuit) {
      // No active circuit, nothing to stop
      wireguardManager.cleanupAllInterfaces();
      return true;
    }
    
    try {
      // Clear any refresh timer
      if (this.circuitRefreshTimer) {
        clearTimeout(this.circuitRefreshTimer);
        this.circuitRefreshTimer = null;
      }
      
      // Disconnect from the VPN
      await connectionHandler.disconnect();
      
      // Ensure all interfaces are cleaned up
      wireguardManager.cleanupAllInterfaces();
      
      // Mark the circuit as inactive
      this.activeCircuit.active = false;
      
      logger.info('Route stopped successfully');
      this.emit('route:stopped', this.activeCircuit);
      
      // Clear the active circuit
      this.activeCircuit = null;
      
      return true;
    } catch (error) {
      logger.error(`Failed to stop route: ${(error as Error).message}`);
      // Try to clean up anyway
      wireguardManager.cleanupAllInterfaces();
      this.activeCircuit = null;
      return false;
    }
  }
  
  /**
   * Refresh the current route
   * @returns Promise resolving to boolean indicating success
   */
  async refreshRoute(): Promise<boolean> {
    if (!this.activeCircuit) {
      logger.warn('No active route to refresh');
      return false;
    }
    
    try {
      // If simple mode (one node)
      if (this.activeCircuit.nodes.length === 1) {
        const country = this.activeCircuit.nodes[0].config.country || 'any';
        return await connectionHandler.connectDirect(country, getConfig().defaultLeaseDuration);
      } 
      // If advanced mode (multi-hop)
      else {
        // Get the current circuit length and countries
        const length = this.activeCircuit.nodes.length;
        const countries = this.activeCircuit.nodes.map(node => node.config.country || 'any');
        
        // Create a new route with the same parameters
        return await this.createRoute(length, countries, false);
      }
    } catch (error) {
      logger.error(`Failed to refresh route: ${(error as Error).message}`);
      return false;
    }
  }
  
  /**
   * Get the current active circuit
   * @returns The active circuit or null if none
   */
  getActiveCircuit(): Circuit | null {
    return this.activeCircuit;
  }
  
  /**
   * Check if a route is currently active
   * @returns Boolean indicating if route is active
   */
  isRouteActive(): boolean {
    // Check if the circuit is considered active
    if (this.activeCircuit !== null && this.activeCircuit.active) {
      // Also check if the VPN connection is actually active
      return connectionHandler.isConnected();
    }
    return false;
  }
  
  /**
   * Change the exit node of the current circuit (advanced mode only)
   * @returns Promise resolving to boolean indicating success
   */
  async changeExitNode(): Promise<boolean> {
    if (!this.activeCircuit) {
      logger.warn('No active circuit to change exit node');
      return false;
    }
    
    try {
      // If simple mode (one node), just refresh with a new country
      if (this.activeCircuit.nodes.length === 1) {
        logger.info('In simple mode, changing exit node means creating a new connection');
        const country = this.activeCircuit.nodes[0].config.country || 'any';
        return await connectionHandler.connectDirect(country, getConfig().defaultLeaseDuration);
      }
      
      // For multi-hop implementation (advanced mode)
      logger.info('Changing exit node by refreshing the entire route');
      return await this.refreshRoute();
    } catch (error) {
      logger.error(`Failed to change exit node: ${(error as Error).message}`);
      return false;
    }
  }
  
  /**
   * Create a direct VPN connection to a specific country
   * @param country Country code or 'any'
   * @returns Promise resolving to boolean indicating success
   */
  async createDirectConnection(country: string = 'any'): Promise<boolean> {
    try {
      // Clean up existing connections
      await this.stopRoute();
      
      // Create a direct connection
      const success = await connectionHandler.connectDirect(country, getConfig().defaultLeaseDuration);
      
      if (success) {
        // Create a "circuit" with a single node for compatibility
        const config = connectionHandler.getActiveConfig();
        if (config) {
          const currentTime = Date.now();
          this.activeCircuit = {
            id: uuidv4(),
            nodes: [{
              id: uuidv4(),
              config,
              index: 0
            }],
            createdAt: new Date(currentTime),
            expiresAt: new Date(config.expiresAt),
            active: true
          };
        }
      }
      
      return success;
    } catch (error) {
      logger.error(`Failed to create direct connection: ${(error as Error).message}`);
      return false;
    }
  }
}

// Export singleton instance
export default new RouteManager();