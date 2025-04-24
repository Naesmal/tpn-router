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
      country,
      dns: '10.13.13.1'  // Valeur DNS par défaut
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
          if (key === 'Address') {
            // Extraire l'adresse sans le masque si présent
            const addrMatch = value.match(/(\d+\.\d+\.\d+\.\d+)/);
            if (addrMatch) config.address = addrMatch[1];
          }
          if (key === 'DNS') config.dns = value;
          break;
        case 'Peer':
          if (key === 'PublicKey') config.publicKey = value;
          if (key === 'PresharedKey') config.presharedKey = value;
          if (key === 'Endpoint') config.endpoint = value;
          if (key === 'AllowedIPs') config.allowedIPs = value.split(',').map((ip: string) => ip.trim());
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
    // Check if the response has country information
    const countryCode = response.country || country;
    return this.parseConfig(response.peer_config, response.expires_at, countryCode);
  }
  
  /**
   * Save a WireGuard configuration to disk
   * @param config WireGuard configuration to save
   * @returns Path to the saved configuration file
   */
  async saveConfig(config: WireGuardConfig): Promise<string> {
    const interfaceName = `wg-${config.id.substring(0, 8)}`;
    const configPath = path.join(this.configDir, `${interfaceName}.conf`);
    
    // Vérifier et modifier la configuration WireGuard si nécessaire
    let modifiedConfig = config.raw;
    
    // 1. S'assurer qu'elle contient une adresse IP (Address)
    if (!modifiedConfig.includes('Address =')) {
      const randomLast = Math.floor(Math.random() * 254) + 1;
      // Ajouter la ligne Address juste après [Interface]
      modifiedConfig = modifiedConfig.replace(
        '[Interface]',
        `[Interface]\nAddress = 10.13.13.${randomLast}/32`
      );
    }
    
    // 2. S'assurer qu'elle contient une ligne DNS
    if (!modifiedConfig.includes('DNS =')) {
      // Ajouter DNS après la dernière ligne de la section Interface mais avant Peer
      modifiedConfig = modifiedConfig.replace(
        /\[Interface\]([\s\S]*?)(?=\[Peer\])/,
        `[Interface]$1DNS = 10.13.13.1\n\n`
      );
    }
    
    // 3. S'assurer que AllowedIPs est correctement configuré pour tout le trafic
    if (!modifiedConfig.includes('AllowedIPs = 0.0.0.0/0') && 
        !modifiedConfig.includes('AllowedIPs = 0.0.0.0/0, ::/0')) {
      modifiedConfig = modifiedConfig.replace(
        /AllowedIPs\s*=\s*[^\n]*/,
        'AllowedIPs = 0.0.0.0/0, ::/0'
      );
    }
    
    // Logger la configuration finale pour le débogage
    logger.debug(`Configuration WireGuard finale: \n${modifiedConfig}`);
    
    await fsPromises.writeFile(configPath, modifiedConfig);
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
      // S'assurer que les interfaces existantes sont nettoyées d'abord
      this.cleanupAllInterfaces();
      
      // Utiliser wg-quick pour activer la configuration
      execSync(`wg-quick up ${configPath}`, { stdio: 'inherit' });
      logger.success(`Activated WireGuard config: ${path.basename(configPath)}`);
      
      // Vérifier que l'interface est bien créée
      const interfaceName = path.basename(configPath, '.conf');
      try {
        execSync(`ip link show ${interfaceName}`, { stdio: 'ignore' });
        logger.debug(`Interface ${interfaceName} is up`);
        return true;
      } catch (e) {
        logger.warn(`Interface check failed for ${interfaceName}`);
        // Continuer quand même car wg-quick a peut-être utilisé un autre nom
        return true;
      }
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
      // Essayer de nettoyer manuellement en cas d'échec
      this.cleanupAllInterfaces();
      return false;
    }
  }
  
  /**
   * Get the current public IP address
   * @returns Promise resolving to the current public IP
   */
  async getCurrentPublicIp(): Promise<string> {
    try {
      // Tester plusieurs services d'IP
      const ipServices = [
        'icanhazip.com',
        'ifconfig.me',
        'api.ipify.org',
        'ipinfo.io/ip'
      ];
      
      // Essayer chaque service jusqu'à ce qu'un fonctionne
      for (const service of ipServices) {
        try {
          logger.debug(`Trying to get IP from ${service}`);
          const result = execSync(`curl -s ${service}`, { timeout: 5000 }).toString().trim();
          
          // Vérifier que c'est bien une adresse IP
          if (/^\d+\.\d+\.\d+\.\d+$/.test(result)) {
            return result;
          }
          logger.debug(`Invalid IP from ${service}: ${result}`);
        } catch (err) {
          logger.debug(`Failed to get IP from ${service}: ${err}`);
          continue;
        }
      }
      
      // Utiliser spawn comme méthode de secours
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
  
  /**
   * Clean up all WireGuard interfaces
   * @returns Boolean indicating success
   */
  cleanupAllInterfaces(): boolean {
    try {
      // Tenter d'abord de trouver les interfaces WireGuard
      let interfaces: string[] = [];
      
      try {
        const output = execSync('ip link | grep -E "wg[0-9]|wg-"').toString();
        interfaces = output.split('\n')
          .filter(line => line.trim())
          .map(line => {
            const match = line.match(/\d+:\s+([^:@]+)[@:]?/);
            return match ? match[1].trim() : null;
          })
          .filter((iface): iface is string => iface !== null);
      } catch (error) {
        // Si grep ne trouve rien, c'est normal
        if ((error as any).status === 1 && (error as any).stderr.toString().trim() === '') {
          logger.debug('No WireGuard interfaces to clean up');
          return true;
        }
        logger.warn(`Error listing interfaces: ${(error as Error).message}`);
      }
      
      if (interfaces.length === 0) {
        logger.debug('No WireGuard interfaces found');
        return true;
      }
      
      // Supprimer chaque interface trouvée
      for (const iface of interfaces) {
        try {
          logger.info(`Removing interface: ${iface}`);
          
          // Essayer d'abord avec wg-quick si possible
          try {
            const configPath = path.join(this.configDir, `${iface}.conf`);
            if (fs.existsSync(configPath)) {
              execSync(`wg-quick down ${configPath}`, { stdio: 'inherit' });
              continue;
            }
          } catch (e) {
            logger.debug(`Could not use wg-quick, falling back to ip command: ${e}`);
          }
          
          // Utiliser directement la commande ip
          execSync(`ip link delete ${iface}`, { stdio: 'inherit' });
        } catch (error) {
          logger.warn(`Failed to clean up interface ${iface}: ${(error as Error).message}`);
        }
      }
      
      logger.success("All WireGuard interfaces cleaned up");
      return true;
    } catch (error) {
      logger.error(`Failed to clean up WireGuard interfaces: ${(error as Error).message}`);
      return false;
    }
  }
  
  /**
   * Vérifier si une connexion VPN est active
   * @returns Boolean indiquant si une connexion VPN est active
   */
  isVpnActive(): boolean {
    try {
      // Vérifier si des interfaces WireGuard sont actives
      const output = execSync('wg show', { stdio: 'pipe' }).toString();
      return output.includes('interface:');
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Get a simple direct WireGuard configuration from TPN
   * @param country Country code or 'any'
   * @param leaseMinutes Lease duration in minutes
   * @returns Promise resolving to a path to the config file
   */
  async getDirectConfig(country: string = 'any', leaseMinutes: number = 5): Promise<string> {
    try {
      // Récupérer un validateur aléatoire
      const validator = { ip: '185.189.44.166', port: 3000, isActive: true };
      logger.info(`Getting direct VPN config for country: ${country}`);
      
      // Récupérer la configuration
      const url = `http://${validator.ip}:${validator.port}/api/config/new`;
      const response = await fetch(url + `?format=text&geo=${country}&lease_minutes=${leaseMinutes}`);
      
      if (!response.ok) {
        throw new Error(`Failed to get config: ${response.status} ${response.statusText}`);
      }
      
      const configText = await response.text();
      
      // Sauvegarder dans un fichier temporaire
      const fileName = `tpn-direct-${Date.now()}.conf`;
      const configPath = path.join(this.configDir, fileName);
      
      await fsPromises.writeFile(configPath, configText);
      logger.success(`Saved direct VPN config to ${configPath}`);
      return configPath;
    } catch (error) {
      logger.error(`Failed to get direct config: ${(error as Error).message}`);
      throw error;
    }
  }
  /**
 * Get information about active WireGuard interfaces
 * @returns Object containing information about the active interface, or null if none
 */
async getActiveInterfaceInfo(): Promise<{
  name: string;
  endpoint?: string;
  publicKey?: string;
  allowedIPs?: string;
  lastHandshake?: string;
} | null> {
  try {
    // Vérifier d'abord si des interfaces WireGuard sont actives
    let interfaces: string[] = [];
    
    try {
      const output = execSync('ip link | grep -E "wg[0-9]|wg-"').toString();
      interfaces = output.split('\n')
        .filter(line => line.trim())
        .map(line => {
          const match = line.match(/\d+:\s+([^:@]+)[@:]?/);
          return match ? match[1].trim() : null;
        })
        .filter((iface): iface is string => iface !== null);
    } catch (error) {
      // Si grep ne trouve rien, c'est normal
      return null;
    }
    
    if (interfaces.length === 0) {
      return null;
    }
    
    // Prendre la première interface active (normalement il ne devrait y en avoir qu'une)
    const interfaceName = interfaces[0];
    
    // Obtenir des informations détaillées sur cette interface
    try {
      const output = execSync(`wg show ${interfaceName}`).toString();
      
      // Extraire les informations pertinentes
      const result: {
        name: string;
        endpoint?: string;
        publicKey?: string;
        allowedIPs?: string;
        lastHandshake?: string;
      } = { name: interfaceName };
      
      // Analyser la sortie ligne par ligne
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.includes('endpoint:')) {
          result.endpoint = line.split('endpoint:')[1].trim();
        } else if (line.includes('public key:')) {
          result.publicKey = line.split('public key:')[1].trim();
        } else if (line.includes('allowed ips:')) {
          result.allowedIPs = line.split('allowed ips:')[1].trim();
        } else if (line.includes('latest handshake:')) {
          result.lastHandshake = line.split('latest handshake:')[1].trim();
        }
      }
      
      return result;
    } catch (error) {
      logger.warn(`Failed to get detailed info for interface ${interfaceName}: ${(error as Error).message}`);
      // Retourner au moins le nom de l'interface
      return { name: interfaceName };
    }
  } catch (error) {
    logger.error(`Failed to get active interface info: ${(error as Error).message}`);
    return null;
  }
}
}

// Export singleton instance
export default new WireGuardManager();