import { v4 as uuidv4 } from 'uuid';
import { Circuit, CircuitNode, WireGuardConfig } from '../types';
import tpnClient from '../api/tpnClient';
import wireguardManager from '../vpn/wireguardManager';
import { getConfig } from '../utils/config';
import logger from '../utils/logger';

/**
 * Class to build and manage Tor-like circuits through multiple VPN nodes
 */
export class CircuitBuilder {
  /**
   * Build a new circuit with multiple hops
   * @param length Number of hops in the circuit (default: from config)
   * @param countries Optional specific countries for each hop
   * @returns Promise resolving to the created circuit
   */
  async buildCircuit(
    length?: number,
    countries?: string[]
  ): Promise<Circuit> {
    const { defaultCircuitLength, defaultLeaseDuration } = getConfig();
    const circuitLength = length || defaultCircuitLength;
    
    logger.info(`Building a new circuit with ${circuitLength} hops`);
    
    // Create the circuit structure
    const circuit: Circuit = {
      id: uuidv4(),
      nodes: [],
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + defaultLeaseDuration * 60 * 1000),
      active: false
    };
    
    try {
      // Get configs for each hop in the circuit
      for (let i = 0; i < circuitLength; i++) {
        const country = countries && countries[i] ? countries[i] : 'any';
        logger.debug(`Getting configuration for hop ${i + 1}, country: ${country}`);
        
        // Get a random validator for this hop
        const validator = tpnClient.getRandomValidator();
        
        // Get a new configuration
        const configResponse = await tpnClient.getNewConfig(
          validator,
          country,
          defaultLeaseDuration
        );
        
        // Parse the configuration
        const config = wireguardManager.parseTpnResponse(configResponse, country);
        
        // Add this node to the circuit
        const node: CircuitNode = {
          id: uuidv4(),
          config,
          index: i
        };
        
        circuit.nodes.push(node);
      }
      
      // Set the expiration to the earliest expiration among all nodes
      circuit.expiresAt = new Date(Math.min(
        ...circuit.nodes.map(node => node.config.expiresAt)
      ));
      
      logger.success(`Built circuit with ${circuit.nodes.length} hops, expires at ${circuit.expiresAt.toISOString()}`);
      return circuit;
    } catch (error) {
      logger.error(`Failed to build circuit: ${(error as Error).message}`);
      throw new Error(`Circuit build failed: ${(error as Error).message}`);
    }
  }
  
  /**
   * Validate a circuit to ensure it's properly formed
   * @param circuit Circuit to validate
   * @returns Boolean indicating if circuit is valid
   */
  validateCircuit(circuit: Circuit): boolean {
    // Check if circuit has nodes
    if (!circuit.nodes || circuit.nodes.length === 0) {
      logger.error('Invalid circuit: No nodes');
      return false;
    }
    
    // Check if all nodes have configs
    for (const node of circuit.nodes) {
      if (!node.config) {
        logger.error(`Invalid circuit: Node ${node.id} has no config`);
        return false;
      }
    }
    
    // Check if circuit has expired
    if (circuit.expiresAt < new Date()) {
      logger.error('Invalid circuit: Circuit has expired');
      return false;
    }
    
    return true;
  }
  
  /**
   * Extract the entry node (first hop) configuration
   * @param circuit Circuit to extract from
   * @returns WireGuard configuration for the entry node
   */
  getEntryNodeConfig(circuit: Circuit): WireGuardConfig {
    if (!this.validateCircuit(circuit)) {
      throw new Error('Cannot get entry node for invalid circuit');
    }
    
    // Sort nodes by index and get the first one
    const sortedNodes = [...circuit.nodes].sort((a, b) => a.index - b.index);
    return sortedNodes[0].config;
  }
  
  /**
   * Extract the exit node (last hop) configuration
   * @param circuit Circuit to extract from
   * @returns WireGuard configuration for the exit node
   */
  getExitNodeConfig(circuit: Circuit): WireGuardConfig {
    if (!this.validateCircuit(circuit)) {
      throw new Error('Cannot get exit node for invalid circuit');
    }
    
    // Sort nodes by index and get the last one
    const sortedNodes = [...circuit.nodes].sort((a, b) => a.index - b.index);
    return sortedNodes[sortedNodes.length - 1].config;
  }
}

// Export singleton instance
export default new CircuitBuilder();