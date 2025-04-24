import fs from 'fs';
import path from 'path';
import { promises as fsPromises } from 'fs';
import { execSync, spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { WireGuardConfig, TpnConfigResponse } from '../types/index.js';
import logger from '../utils/logger.js';
import os from 'os';

/**
 * Class for managing WireGuard configurations and connections
 */
export class WireGuardManager {
  private configDir: string;
  
  constructor() {
    this.configDir = path.join(os.homedir(), '.tpn-router', 'configs');
    this.ensureConfigDirExists();
  }
  
  /**
   * Ensure the configuration directory exists
   */
  private ensureConfigDirExists(): void {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
      logger.debug(`Created config directory: ${this.configDir}`);
    }
  }
  
  /**
   * Parse a WireGuard configuration string into structured object
   * @param configText Raw WireGuard configuration text
   * @param expiresAt Expiration timestamp
   * @param country Optional country code
   * @returns Parsed WireGuard configuration object
   */
  parseConfig(configText: string, expiresAt: number, country?: string): WireGuardConfig {
    // Generate a unique ID for this configuration
    const id = uuidv4();
    
    // Default values
    const config: WireGuardConfig = {
      id,
      privateKey: '',
      publicKey: '',
      presharedKey: '',
      endpoint: '',
      allowedIPs: ['0.0.0.0/0', '::/0'],
      listenPort: 51820,
      raw: configText,
      expiresAt,
      country
    };
    
    // Parse the configuration text
    const lines = configText.split('\n');
    let currentSection = '';
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip empty lines
      if (!trimmedLine) continue;
      
      // Check if this is a section header
      if (trimmedLine.startsWith('[') && trimmedLine.endsWith(']')) {
        currentSection = trimmedLine.slice(1, -1);
        continue;
      }
      
      // Skip lines that are not in a section
      if (!currentSection) continue;
      
      // Parse key-value pairs
      const match = trimmedLine.match(/^(\w+)\s*=\s*(.+)$/);
      if (!match) continue;
      
      const [, key, value] = match;
      
      switch (currentSection) {
        case 'Interface':
          if (key === 'PrivateKey') config.privateKey = value;
          if (key === 'ListenPort') config.listenPort = parseInt(value, 10);
          break;
        case 'Peer':
          if (key === 'PublicKey') config.publicKey = value;
          if (key === 'PresharedKey') config.presharedKey = value;
          if (key === 'Endpoint') config.endpoint = value;
          if (key === 'AllowedIPs') config.allowedIPs = value.split(',').map((ip: any) => ip.trim());
          break;
      }
    }
    
    return config;
  }
  
  /**
   * Parse a TPN API response into a WireGuard config
   * @param response TPN API configuration response
   * @param country Optional country code
   * @returns Parsed WireGuard configuration
   */
  parseTpnResponse(response: TpnConfigResponse, country?: string): WireGuardConfig {
    return this.parseConfig(response.peer_config, response.expires_at, country);
  }
  
  /**
   * Save a WireGuard configuration to disk
   * @param config WireGuard configuration to save
   * @returns Path to the saved configuration file
   */
  async saveConfig(config: WireGuardConfig): Promise<string> {
    const configPath = path.join(this.configDir, `${config.id}.conf`);
    await fsPromises.writeFile(configPath, config.raw);
    logger.debug(`Saved WireGuard config to ${configPath}`);
    return configPath;
  }
  
  /**
   * Check if WireGuard is installed on the system
   * @returns Boolean indicating if WireGuard is available
   */
  isWireGuardInstalled(): boolean {
    try {
      execSync('which wg', { stdio: 'ignore' });
      return true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Activate a WireGuard configuration
   * @param configPath Path to the configuration file
   * @returns Boolean indicating success
   */
  activateConfig(configPath: string): boolean {
    try {
      execSync(`wg-quick up ${configPath}`, { stdio: 'inherit' });
      logger.success(`Activated WireGuard config: ${path.basename(configPath)}`);
      return true;
    } catch (error) {
      logger.error(`Failed to activate WireGuard config: ${(error as Error).message}`);
      return false;
    }
  }
  
  /**
   * Deactivate a WireGuard configuration
   * @param configPath Path to the configuration file
   * @returns Boolean indicating success
   */
  deactivateConfig(configPath: string): boolean {
    try {
      execSync(`wg-quick down ${configPath}`, { stdio: 'inherit' });
      logger.success(`Deactivated WireGuard config: ${path.basename(configPath)}`);
      return true;
    } catch (error) {
      logger.error(`Failed to deactivate WireGuard config: ${(error as Error).message}`);
      return false;
    }
  }
  
  /**
   * Check if a configuration is active
   * @param configId ID of the configuration to check
   * @returns Boolean indicating if configuration is active
   */
  isConfigActive(configId: string): boolean {
    try {
      const output = execSync('wg show').toString();
      // Extract interface names
      const interfaces = output.split('\n')
        .filter((line: any) => line.includes('interface:'))
        .map((line: any) => line.split(' ')[1]);
      
      // Check if our config ID is in one of the interfaces
      return interfaces.some(iface => iface.includes(configId));
    } catch (error) {
      logger.error(`Failed to check WireGuard status: ${(error as Error).message}`);
      return false;
    }
  }
  
  /**
   * Get the current public IP address
   * @returns Promise resolving to the current public IP
   */
  async getCurrentPublicIp(): Promise<string> {
    try {
      const { stdout } = spawn('curl', ['icanhazip.com']);
      let ip = '';
      
      for await (const chunk of stdout) {
        ip += chunk;
      }
      
      return ip.trim();
    } catch (error) {
      logger.error(`Failed to get public IP: ${(error as Error).message}`);
      throw error;
    }
  }
}

// Export singleton instance
export default new WireGuardManager();