import axios from 'axios';
import { TpnConfigResponse, ValidatorEndpoint } from '../types/index.js';
import logger from '../utils/logger.js';
import { getActiveValidators } from '../utils/config.js';

/**
 * TPN Client to interact with TPN network validators
 */
export class TpnClient {
  /**
   * Get available country codes from a validator
   * @param validator Validator endpoint to query
   * @returns Array of available country codes
   */
  async getAvailableCountries(validator: ValidatorEndpoint): Promise<string[]> {
    try {
      const url = `http://${validator.ip}:${validator.port}/api/config/countries`;
      logger.debug(`Fetching available countries from ${url}`);
      
      const response = await axios.get<string[]>(url, {
        timeout: 10000 // 10 secondes de timeout
      });
      return response.data;
    } catch (error) {
      logger.error(`Failed to get available countries from ${validator.ip}:${validator.port}`, error);
      throw new Error(`Failed to get available countries: ${(error as Error).message}`);
    }
  }

  /**
   * Get a new VPN configuration from a specific country
   * @param validator Validator endpoint to query
   * @param country Country code, or 'any' for any country
   * @param leaseMinutes Lease duration in minutes
   * @param retryCount Number of retry attempts
   * @returns TPN configuration response
   */
  async getNewConfig(
    validator: ValidatorEndpoint,
    country: string = 'any',
    leaseMinutes: number = 5,
    retryCount: number = 3
  ): Promise<TpnConfigResponse> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < retryCount; attempt++) {
      try {
        const url = `http://${validator.ip}:${validator.port}/api/config/new`;
        logger.debug(`Attempt ${attempt + 1}/${retryCount}: Fetching config from ${url} for country: ${country}`);
        
        const response = await axios.get<TpnConfigResponse>(url, {
          params: {
            format: 'json',
            geo: country,
            lease_minutes: leaseMinutes
          },
          timeout: 15000 // 15 secondes de timeout
        });
        
        logger.debug(`Successfully got config from ${validator.ip}:${validator.port}`);
        return response.data;
      } catch (error) {
        lastError = error as Error;
        logger.warn(`Attempt ${attempt + 1}/${retryCount} failed: ${(error as Error).message}`);
        
        // Si ce n'est pas la dernière tentative, attendez un peu avant de réessayer
        if (attempt < retryCount - 1) {
          const delay = 1000 * (attempt + 1); // Délai progressif (1s, 2s, 3s...)
          logger.info(`Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // Essayer avec un autre validateur aléatoire pour les tentatives suivantes
          if (attempt > 0) {
            try {
              validator = this.getRandomValidator(validator.ip); // Exclut le validateur actuel
              logger.info(`Switching to validator: ${validator.ip}:${validator.port}`);
            } catch (e) {
              logger.warn(`Could not find another validator, retrying with the same one`);
            }
          }
        }
      }
    }
    
    // Si toutes les tentatives ont échoué, lancez l'erreur
    logger.error(`Failed to get new config after ${retryCount} attempts`);
    throw new Error(`Failed to get new config: ${lastError?.message}`);
  }

  /**
   * Get a new VPN configuration as raw text
   * @param validator Validator endpoint to query
   * @param country Country code, or 'any' for any country
   * @param leaseMinutes Lease duration in minutes
   * @returns Raw WireGuard configuration as string
   */
  async getNewConfigText(
    validator: ValidatorEndpoint,
    country: string = 'any',
    leaseMinutes: number = 5
  ): Promise<string> {
    try {
      const url = `http://${validator.ip}:${validator.port}/api/config/new`;
      logger.debug(`Fetching new config text from ${url} for country: ${country}`);
      
      const response = await axios.get<string>(url, {
        params: {
          format: 'text',
          geo: country,
          lease_minutes: leaseMinutes
        },
        timeout: 15000 // 15 secondes de timeout
      });
      
      return response.data;
    } catch (error) {
      logger.error(`Failed to get new config text from ${validator.ip}:${validator.port}`, error);
      throw new Error(`Failed to get new config text: ${(error as Error).message}`);
    }
  }

  /**
   * Find a validator that has a specific country available
   * @param country Country code to look for
   * @returns Validator that has the requested country, or undefined if none found
   */
  async findValidatorForCountry(country: string): Promise<ValidatorEndpoint | undefined> {
    const validators = getActiveValidators();
    
    for (const validator of validators) {
      try {
        const countries = await this.getAvailableCountries(validator);
        if (countries.includes(country)) {
          return validator;
        }
      } catch (error) {
        logger.warn(`Validator ${validator.ip} does not have country ${country} available`);
      }
    }
    
    return undefined;
  }

  /**
   * Get a random active validator
   * @param excludeIp Optional IP to exclude from selection
   * @returns Random validator endpoint
   */
  getRandomValidator(excludeIp?: string): ValidatorEndpoint {
    let validators = getActiveValidators();
    
    if (excludeIp) {
      validators = validators.filter((v: ValidatorEndpoint) => v.ip !== excludeIp);
    }
    
    if (validators.length === 0) {
      throw new Error('No active validators available');
    }
    
    const randomIndex = Math.floor(Math.random() * validators.length);
    return validators[randomIndex];
  }
}

// Export singleton instance
export default new TpnClient();