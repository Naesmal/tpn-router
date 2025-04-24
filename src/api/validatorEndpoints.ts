import axios from 'axios';
import { ValidatorEndpoint } from '../types';
import { getConfig, updateValidatorStatus, addValidator } from '../utils/config';
import logger from '../utils/logger';

/**
 * Class for managing TPN validator endpoints
 */
export class ValidatorEndpointManager {
  /**
   * Check if a validator is reachable
   * @param validator Validator to check
   * @returns Promise resolving to boolean indicating if validator is active
   */
  async checkValidator(validator: ValidatorEndpoint): Promise<boolean> {
    try {
      const url = `http://${validator.ip}:${validator.port}/api/config/countries`;
      logger.debug(`Checking validator at ${url}`);
      
      const response = await axios.get(url, { timeout: 5000 });
      const isActive = response.status === 200;
      
      // Update the validator status in config
      updateValidatorStatus(validator.ip, isActive);
      
      return isActive;
    } catch (error) {
      logger.warn(`Validator ${validator.ip}:${validator.port} is not reachable`, error);
      updateValidatorStatus(validator.ip, false);
      return false;
    }
  }

  /**
   * Check all configured validators
   * @returns Promise resolving to number of active validators
   */
  async checkAllValidators(): Promise<number> {
    const { validators } = getConfig();
    let activeCount = 0;
    
    logger.info(`Checking ${validators.length} validators...`);
    
    const checkPromises = validators.map(async (validator) => {
      const isActive = await this.checkValidator(validator);
      if (isActive) activeCount++;
    });
    
    await Promise.all(checkPromises);
    
    logger.info(`Found ${activeCount} active validators out of ${validators.length}`);
    return activeCount;
  }

  /**
   * Add a new validator to the configuration
   * @param ip IP address of the validator
   * @param port Port number (default: 3000)
   * @returns Promise resolving to boolean indicating if validator was added successfully
   */
  async addNewValidator(ip: string, port: number = 3000): Promise<boolean> {
    const newValidator: ValidatorEndpoint = {
      ip,
      port,
      isActive: false,
    };
    
    // Check if the validator is reachable before adding
    const isActive = await this.checkValidator(newValidator);
    
    if (isActive) {
      newValidator.isActive = true;
      newValidator.lastChecked = new Date();
      addValidator(newValidator);
      logger.success(`Added new validator: ${ip}:${port}`);
      return true;
    } else {
      logger.error(`Could not add validator: ${ip}:${port} - Not reachable`);
      return false;
    }
  }

  /**
   * Discover new validators (could integrate with a discovery service in the future)
   * @returns Promise resolving to number of new validators discovered
   */
  async discoverValidators(): Promise<number> {
    // In a real implementation, this would query a discovery service
    // For now, we'll just return 0 as we're not implementing this yet
    logger.info('Validator discovery not implemented yet');
    return 0;
  }
}

// Export singleton instance
export default new ValidatorEndpointManager();