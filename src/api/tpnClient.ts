import axios from 'axios';
import { TpnConfigResponse, ValidatorEndpoint } from '../types';
import logger from '../utils/logger';
import { getActiveValidators } from '../utils/config';

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
      
      const response = await axios.get<string[]>(url);
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
   * @returns TPN configuration response
   */
  async getNewConfig(
    validator: ValidatorEndpoint,
    country: string = 'any',
    leaseMinutes: number = 5
  ): Promise<TpnConfigResponse> {
    try {
      const url = `http://${validator.ip}:${validator.port}/api/config/new`;
      logger.debug(`Fetching new config from ${url} for country: ${country}`);
      
      const response = await axios.get<TpnConfigResponse>(url, {
        params: {
          format: 'json',
          geo: country,
          lease_minutes: leaseMinutes
        }
      });
      
      return response.data;
    } catch (error) {
      logger.error(`Failed to get new config from ${validator.ip}:${validator.port}`, error);
      throw new Error(`Failed to get new config: ${(error as Error).message}`);
    }
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
        }
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
   * @returns Random validator endpoint
   */
  getRandomValidator(): ValidatorEndpoint {
    const validators = getActiveValidators();
    
    if (validators.length === 0) {
      throw new Error('No active validators available');
    }
    
    const randomIndex = Math.floor(Math.random() * validators.length);
    return validators[randomIndex];
  }
}

// Export singleton instance
export default new TpnClient();