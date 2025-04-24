import { Circuit } from '../types/index.js';
import circuitBuilder from './circuitBuilder.js';
import connectionHandler from '../vpn/connectionHandler.js';
import logger from '../utils/logger.js';
import { EventEmitter } from 'events';

/**
 * Class to manage dynamic routing through TPN circuits
 */
export class RouteManager extends EventEmitter {
  private activeCircuit: Circuit | null = null;
  private circuitRefreshTimer: NodeJS.Timeout | null = null;
  
  constructor() {
    super();
  }
  
  /**
   * Create and activate a new routing circuit
   * @param length Number of hops in the circuit
   * @param countries Optional specific countries for each hop
   * @returns Promise resolving to boolean indicating success
   */
  async createRoute(length?: number, countries?: string[]): Promise<boolean> {
    try {
      // Stop any existing route
      await this.stopRoute();
      
      // Build a new circuit
      logger.info('Building a new routing circuit...');
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
      const refreshTime = circuit.expiresAt.getTime() - Date.now() - 60000; // 1 minute before expiry
      if (refreshTime > 0) {
        this.circuitRefreshTimer = setTimeout(() => {
          logger.info('Circuit is about to expire, refreshing...');
          this.refreshRoute().catch(err => {
            logger.error(`Failed to refresh route: ${err.message}`);
          });
        }, refreshTime);
      }
      
      logger.success('Route created and activated successfully');
      this.emit('route:created', circuit);
      return true;
    } catch (error) {
      logger.error(`Failed to create route: ${(error as Error).message}`);
      return false;
    }
  }
  
  /**
   * Stop the current routing circuit
   * @returns Promise resolving to boolean indicating success
   */
  async stopRoute(): Promise<boolean> {
    if (!this.activeCircuit) {
      return true; // No active circuit to stop
    }
    
    try {
      // Clear any refresh timer
      if (this.circuitRefreshTimer) {
        clearTimeout(this.circuitRefreshTimer);
        this.circuitRefreshTimer = null;
      }
      
      // Disconnect from the VPN
      await connectionHandler.disconnect();
      
      // Mark the circuit as inactive
      this.activeCircuit.active = false;
      
      logger.info('Route stopped successfully');
      this.emit('route:stopped', this.activeCircuit);
      
      // Clear the active circuit
      this.activeCircuit = null;
      
      return true;
    } catch (error) {
      logger.error(`Failed to stop route: ${(error as Error).message}`);
      return false;
    }
  }
  
  /**
   * Refresh the current route with a new circuit
   * @returns Promise resolving to boolean indicating success
   */
  async refreshRoute(): Promise<boolean> {
    if (!this.activeCircuit) {
      logger.warn('No active route to refresh');
      return false;
    }
    
    try {
      // Get the current circuit length and countries
      const length = this.activeCircuit.nodes.length;
      const countries = this.activeCircuit.nodes.map((node: any) => node.config.country || 'any');
      
      // Create a new route with the same parameters
      return await this.createRoute(length, countries);
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
    return this.activeCircuit !== null && this.activeCircuit.active;
  }
  
  /**
   * Change the exit node of the current circuit
   * @returns Promise resolving to boolean indicating success
   */
  async changeExitNode(): Promise<boolean> {
    if (!this.activeCircuit) {
      logger.warn('No active circuit to change exit node');
      return false;
    }
    
    try {
      // For a proper implementation, we would need to:
      // 1. Get a new configuration for the exit node
      // 2. Update the routing rules to use the new exit node
      // 3. Connect to the new exit node
      
      // For now, we'll just refresh the entire route
      logger.info('Changing exit node by refreshing the entire route');
      return await this.refreshRoute();
    } catch (error) {
      logger.error(`Failed to change exit node: ${(error as Error).message}`);
      return false;
    }
  }
}

// Export singleton instance
export default new RouteManager();