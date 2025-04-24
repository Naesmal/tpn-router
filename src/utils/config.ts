import { AppConfig, ValidatorEndpoint } from '../types/index.js';

// Default validator endpoints - these are examples and would be updated
const DEFAULT_VALIDATORS: ValidatorEndpoint[] = [
  { ip: '185.189.44.166', port: 3000, isActive: true },
  // Add more known validators here
];

// Default application configuration
const DEFAULT_CONFIG: AppConfig = {
  defaultCircuitLength: 3,
  refreshInterval: 60000, // 1 minute in milliseconds
  defaultLeaseDuration: 5, // 5 minutes
  preferredCountries: [], // No preference by default
  validators: DEFAULT_VALIDATORS,
  logLevel: 'info',
};

// Importation correcte de conf avec ESM
import Conf from 'conf';

const configStore = new Conf({
  projectName: 'tpn-router',
  defaults: DEFAULT_CONFIG,
});

/**
 * Get the current application configuration
 */
export function getConfig(): AppConfig {
  return configStore.store as AppConfig;
}

/**
 * Update the application configuration
 */
export function updateConfig(partialConfig: Partial<AppConfig>): AppConfig {
  const currentConfig = getConfig();
  const updatedConfig = { ...currentConfig, ...partialConfig };
  configStore.store = updatedConfig;
  return updatedConfig;
}

/**
 * Reset configuration to defaults
 */
export function resetConfig(): void {
  configStore.clear();
}

/**
 * Add a validator to the list
 */
export function addValidator(validator: ValidatorEndpoint): ValidatorEndpoint[] {
  const config = getConfig();
  // Check if validator already exists
  const existingIndex = config.validators.findIndex((v: ValidatorEndpoint) => v.ip === validator.ip);
  
  if (existingIndex >= 0) {
    // Update existing validator
    config.validators[existingIndex] = validator;
  } else {
    // Add new validator
    config.validators.push(validator);
  }
  
  updateConfig({ validators: config.validators });
  return config.validators;
}

/**
 * Get active validators
 */
export function getActiveValidators(): ValidatorEndpoint[] {
  const config = getConfig();
  return config.validators.filter((v: ValidatorEndpoint) => v.isActive);
}

/**
 * Mark a validator as active or inactive
 */
export function updateValidatorStatus(ip: string, isActive: boolean): void {
  const config = getConfig();
  const validator = config.validators.find((v: ValidatorEndpoint) => v.ip === ip);
  
  if (validator) {
    validator.isActive = isActive;
    validator.lastChecked = new Date();
    updateConfig({ validators: config.validators });
  }
}