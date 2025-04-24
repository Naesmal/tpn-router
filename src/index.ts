#!/usr/bin/env node
import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import { ValidatorEndpoint } from './types/index.js';

import routeManager from './routing/routeManager.js';
import circuitBuilder from './routing/circuitBuilder.js';
import validatorEndpoints from './api/validatorEndpoints.js';
import tpnClient from './api/tpnClient.js';
import wireguardManager from './vpn/wireguardManager.js';
import { getConfig, updateConfig, getActiveValidators } from './utils/config.js';
import logger from './utils/logger.js';

// Create CLI program
const program = new Command();

program
  .name('tpn-router')
  .description('Dynamic routing client for TPN VPN network')
  .version('0.1.0');

// Start command - creates and starts a new VPN connection
program
  .command('start')
  .description('Start a new VPN connection')
  .option('-m, --mode <mode>', 'Connection mode: simple or circuit', 'simple')
  .option('-l, --length <number>', 'Number of hops in circuit mode', parseInt)
  .option('-c, --countries <list>', 'Comma-separated list of country codes')
  .option('-i, --interactive', 'Choose countries interactively')
  .action(async (options) => {
    const spinner = ora('Creating VPN connection...').start();
    
    try {
      // Check if WireGuard is installed
      if (!wireguardManager.isWireGuardInstalled()) {
        spinner.fail('WireGuard is not installed on your system');
        console.log('Please install WireGuard:');
        console.log('  - Mac: brew install wireguard-tools');
        console.log('  - Linux: sudo apt install -y wireguard wireguard-tools resolvconf');
        process.exit(1);
      }
      
      // Check validators
      spinner.text = 'Checking TPN validators...';
      const activeCount = await validatorEndpoints.checkAllValidators();
      
      if (activeCount === 0) {
        spinner.fail('No active TPN validators found');
        process.exit(1);
      }
      
      // Determine mode
      const isSimpleMode = options.mode !== 'circuit';
      
      if (options.mode === 'circuit' && (!options.length || options.length < 2)) {
        spinner.info('Circuit mode requires at least 2 hops, defaulting to 3');
        options.length = 3;
      }
      
      // Handle country selection
      let countries: string[] | undefined;
      
      // Use interactive mode if specified
      if (options.interactive) {
        spinner.stop();
        
        // Get available countries from a random validator
        const validator = tpnClient.getRandomValidator();
        const availableCountries = await tpnClient.getAvailableCountries(validator);
        
        if (availableCountries.length === 0) {
          console.log('No countries available from the selected validator');
          process.exit(1);
        }
        
        // Sort countries for better display
        const sortedCountries = [...availableCountries].sort();
        
        // Add "any" option at the top
        sortedCountries.unshift('any');
        
        if (isSimpleMode) {
          // Simple mode - just select one country
          const answer = await inquirer.prompt([
            {
              type: 'list',
              name: 'country',
              message: 'Select country for VPN connection:',
              choices: sortedCountries
            }
          ]);
          
          countries = [answer.country];
          spinner.start(`Creating VPN connection to ${answer.country}...`);
        } else {
          // Circuit mode - select country for each hop
          const circuitLength = options.length || getConfig().defaultCircuitLength;
          
          // Create prompts for each hop
          const countryPrompts = [];
          for (let i = 0; i < circuitLength; i++) {
            countryPrompts.push({
              type: 'list',
              name: `hop${i}`,
              message: `Select country for hop ${i + 1}:`,
              choices: sortedCountries
            });
          }
          
          // Prompt for country selection
          const answers = await inquirer.prompt(countryPrompts);
          
          // Extract selected countries
          countries = Object.values(answers).map((country: any) => 
            country === 'any' ? 'any' : country
          );
          
          spinner.start('Building circuit with selected countries...');
        }
      } else if (options.countries) {
        // Parse countries if provided via command line
        countries = options.countries.split(',').map((c: string) => c.trim().toUpperCase());
        
        if (isSimpleMode) {
          spinner.text = `Creating VPN connection to ${countries && countries.length > 0 ? countries[0] : 'any'}...`;
        } else {
          spinner.text = `Building circuit with countries: ${countries?.join(', ') || 'any'}`;
        }
      } else {
        // Use preferred countries from config if available
        const { preferredCountries } = getConfig();
        if (preferredCountries && preferredCountries.length > 0) {
          countries = [...preferredCountries];
          
          if (isSimpleMode) {
            spinner.text = `Creating VPN connection to ${countries[0]}...`;
          } else {
            spinner.text = `Building circuit with preferred countries: ${countries.join(', ')}`;
          }
        } else {
          if (isSimpleMode) {
            spinner.text = 'Creating VPN connection with random country...';
          } else {
            spinner.text = 'Building circuit with random countries...';
          }
        }
      }
      
      // Start the route
      let success;
      if (isSimpleMode) {
        // Simple mode - direct VPN connection
        success = await routeManager.createRoute(1, countries, true);
      } else {
        // Circuit mode - multi-hop routing
        success = await routeManager.createRoute(options.length, countries, false);
      }
      
      if (success) {
        const circuit = routeManager.getActiveCircuit();
        
        if (isSimpleMode) {
          spinner.succeed('VPN connection established successfully');
        } else {
          spinner.succeed(`Routing circuit created with ${circuit?.nodes.length || 0} hops`);
        }
        
        // Show connection information
        if (circuit) {
          if (isSimpleMode) {
            console.log('\nVPN Connection Information:');
          } else {
            console.log('\nCircuit Information:');
          }
          
          console.log(`  - ID: ${circuit.id}`);
          console.log(`  - Created at: ${circuit.createdAt.toLocaleString()}`);
          console.log(`  - Expires at: ${circuit.expiresAt.toLocaleString()}`);
          
          // Show country information
          if (isSimpleMode && circuit.nodes.length > 0) {
            const node = circuit.nodes[0];
            console.log(`\nCountry: ${node.config.country || 'Unknown'}`);
            console.log(`Endpoint: ${node.config.endpoint}`);
          } else {
            // Show node information for each hop in circuit mode
            console.log('\nCircuit Path:');
            circuit.nodes.sort((a, b) => a.index - b.index).forEach((node, idx) => {
              console.log(`  - Hop ${idx + 1}: ${node.config.country || 'Unknown'} (${node.config.endpoint})`);
            });
            
            // Show exit node information
            const exitConfig = circuitBuilder.getExitNodeConfig(circuit);
            console.log('\nExit Node:');
            console.log(`  - Country: ${exitConfig.country || 'Unknown'}`);
            console.log(`  - Endpoint: ${exitConfig.endpoint}`);
          }
          
          // Show the new public IP
          try {
            const ip = await wireguardManager.getCurrentPublicIp();
            console.log(`\nNew Public IP: ${ip}`);
          } catch (err) {
            console.log('\nNew Public IP: Unable to determine');
          }
        }
      } else {
        if (isSimpleMode) {
          spinner.fail('Failed to establish VPN connection');
        } else {
          spinner.fail('Failed to create routing circuit');
        }
        process.exit(1);
      }
    } catch (error) {
      spinner.fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Direct connect command - simple direct connection to a country
program
  .command('connect')
  .description('Connect directly to a VPN server in a specific country')
  .option('-c, --country <code>', 'Country code to connect to', 'any')
  .action(async (options) => {
    const spinner = ora(`Connecting to VPN server in ${options.country}...`).start();
    
    try {
      // Check if WireGuard is installed
      if (!wireguardManager.isWireGuardInstalled()) {
        spinner.fail('WireGuard is not installed on your system');
        console.log('Please install WireGuard:');
        console.log('  - Mac: brew install wireguard-tools');
        console.log('  - Linux: sudo apt install -y wireguard wireguard-tools resolvconf');
        process.exit(1);
      }
      
      // Get original IP
      let originalIp = 'unknown';
      try {
        originalIp = await wireguardManager.getCurrentPublicIp();
        spinner.info(`Original public IP: ${originalIp}`);
      } catch (err) {
        spinner.warn('Could not determine original IP');
      }
      
      // Create direct connection
      spinner.text = `Connecting to VPN server in ${options.country}...`;
      const success = await routeManager.createDirectConnection(options.country);
      
      if (success) {
        spinner.succeed('VPN connection established successfully');
        
        // Show connection information
        const circuit = routeManager.getActiveCircuit();
        
        if (circuit && circuit.nodes.length > 0) {
          const config = circuit.nodes[0].config;
          console.log('\nVPN Connection:');
          console.log(`  - Country: ${config.country || 'Unknown'}`);
          console.log(`  - Endpoint: ${config.endpoint}`);
          console.log(`  - Expires at: ${new Date(config.expiresAt).toLocaleString()}`);
          
          // Show the new IP
          try {
            const newIp = await wireguardManager.getCurrentPublicIp();
            console.log(`\nNew Public IP: ${newIp}`);
            
            if (newIp === originalIp) {
              console.log('\nWARNING: Your IP address has not changed. The VPN might not be working properly.');
            }
          } catch (err) {
            console.log('\nNew Public IP: Unable to determine');
          }
        }
      } else {
        spinner.fail('Failed to establish VPN connection');
        process.exit(1);
      }
    } catch (error) {
      spinner.fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Stop command - stops the current VPN connection
program
  .command('stop')
  .description('Stop the current VPN connection')
  .action(async () => {
    const spinner = ora('Stopping VPN connection...').start();
    
    try {
      const success = await routeManager.stopRoute();
      
      if (success) {
        spinner.succeed('VPN connection stopped');
        
        // Show original IP
        try {
          const ip = await wireguardManager.getCurrentPublicIp();
          console.log(`\nCurrent Public IP: ${ip}`);
        } catch (err) {
          console.log('\nCurrent Public IP: Unable to determine');
        }
      } else {
        spinner.fail('Failed to stop VPN connection');
        process.exit(1);
      }
    } catch (error) {
      spinner.fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Status command - shows the current VPN status
program
  .command('status')
  .description('Show the current VPN status')
  .action(async () => {
    try {
      const isActive = routeManager.isRouteActive();
      
      if (isActive) {
        const circuit = routeManager.getActiveCircuit();
        console.log('VPN Status: Active');
        
        if (circuit) {
          if (circuit.nodes.length === 1) {
            // Simple mode display
            const config = circuit.nodes[0].config;
            console.log('\nVPN Connection:');
            console.log(`  - Country: ${config.country || 'Unknown'}`);
            console.log(`  - Endpoint: ${config.endpoint}`);
            console.log(`  - Created at: ${circuit.createdAt.toLocaleString()}`);
            console.log(`  - Expires at: ${circuit.expiresAt.toLocaleString()}`);
            
            // Check time remaining
            const timeRemaining = circuit.expiresAt.getTime() - Date.now();
            console.log(`  - Time remaining: ${Math.floor(timeRemaining / 60000)} minutes`);
          } else {
            // Circuit mode display
            console.log('\nCircuit Information:');
            console.log(`  - Circuit ID: ${circuit.id}`);
            console.log(`  - Number of hops: ${circuit.nodes.length}`);
            console.log(`  - Created at: ${circuit.createdAt.toLocaleString()}`);
            console.log(`  - Expires at: ${circuit.expiresAt.toLocaleString()}`);
            
            // Check time remaining
            const timeRemaining = circuit.expiresAt.getTime() - Date.now();
            console.log(`  - Time remaining: ${Math.floor(timeRemaining / 60000)} minutes`);
            
            // Show all hops in the circuit with their countries
            console.log('\nCircuit Path:');
            circuit.nodes.sort((a, b) => a.index - b.index).forEach((node, idx) => {
              console.log(`  - Hop ${idx + 1}: ${node.config.country || 'Unknown'} (${node.config.endpoint})`);
            });
            
            // Show exit node information
            const exitConfig = circuitBuilder.getExitNodeConfig(circuit);
            console.log('\nExit Node:');
            console.log(`  - Country: ${exitConfig.country || 'Unknown'}`);
            console.log(`  - Endpoint: ${exitConfig.endpoint}`);
          }
          
          // Show current IP
          try {
            const ip = await wireguardManager.getCurrentPublicIp();
            console.log(`\nCurrent Public IP: ${ip}`);
          } catch (err) {
            console.log('\nCurrent Public IP: Unable to determine');
          }
        }
      } else {
        console.log('VPN Status: Not active');
        
        // Show original IP
        try {
          const ip = await wireguardManager.getCurrentPublicIp();
          console.log(`\nCurrent Public IP: ${ip}`);
        } catch (err) {
          console.log('\nCurrent Public IP: Unable to determine');
        }
      }
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Refresh command - refreshes the current VPN connection
program
  .command('refresh')
  .description('Refresh the current VPN connection')
  .action(async () => {
    const spinner = ora('Refreshing VPN connection...').start();
    
    try {
      if (!routeManager.isRouteActive()) {
        spinner.fail('No active VPN connection to refresh');
        process.exit(1);
      }
      
      const success = await routeManager.refreshRoute();
      
      if (success) {
        const circuit = routeManager.getActiveCircuit();
        if (circuit && circuit.nodes.length === 1) {
          spinner.succeed('VPN connection refreshed successfully');
        } else {
          spinner.succeed(`Circuit refreshed with ${circuit?.nodes.length || 0} hops`);
        }
      } else {
        spinner.fail('Failed to refresh VPN connection');
        process.exit(1);
      }
    } catch (error) {
      spinner.fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Change exit command - changes the exit node or creates a new connection
program
  .command('exit')
  .description('Change the exit node of the circuit or create a new connection')
  .option('-c, --country <code>', 'Specific country to use')
  .action(async (options) => {
    const spinner = ora('Changing VPN exit point...').start();
    
    try {
      if (!routeManager.isRouteActive()) {
        spinner.fail('No active VPN connection');
        process.exit(1);
      }
      
      const circuit = routeManager.getActiveCircuit();
      
      // If a specific country is requested, create a new direct connection
      if (options.country) {
        spinner.text = `Creating new connection to ${options.country}...`;
        const success = await routeManager.createDirectConnection(options.country);
        
        if (success) {
          spinner.succeed(`VPN connection changed to ${options.country}`);
          
          // Show new exit information
          const newCircuit = routeManager.getActiveCircuit();
          if (newCircuit && newCircuit.nodes.length > 0) {
            const config = newCircuit.nodes[0].config;
            console.log('\nNew VPN Connection:');
            console.log(`  - Country: ${config.country || 'Unknown'}`);
            console.log(`  - Endpoint: ${config.endpoint}`);
            
            // Show the new IP
            try {
              const ip = await wireguardManager.getCurrentPublicIp();
              console.log(`\nNew Public IP: ${ip}`);
            } catch (err) {
              console.log('\nNew Public IP: Unable to determine');
            }
          }
        } else {
          spinner.fail(`Failed to change connection to ${options.country}`);
          process.exit(1);
        }
        return;
      }
      
      // Otherwise, use the routeManager's changeExitNode method
      const success = await routeManager.changeExitNode();
      
      if (success) {
        const newCircuit = routeManager.getActiveCircuit();
        
        if (newCircuit && newCircuit.nodes.length === 1) {
          // Simple mode
          const config = newCircuit.nodes[0].config;
          spinner.succeed('VPN connection refreshed successfully');
          console.log('\nNew VPN Connection:');
          console.log(`  - Country: ${config.country || 'Unknown'}`);
          console.log(`  - Endpoint: ${config.endpoint}`);
        } else {
          // Circuit mode
          const exitConfig = newCircuit ? circuitBuilder.getExitNodeConfig(newCircuit) : null;
          spinner.succeed('Exit node changed successfully');
          
          if (exitConfig) {
            console.log('\nNew Exit Node:');
            console.log(`  - Country: ${exitConfig.country || 'Unknown'}`);
            console.log(`  - Endpoint: ${exitConfig.endpoint}`);
          }
        }
        
        // Show the new IP
        try {
          const ip = await wireguardManager.getCurrentPublicIp();
          console.log(`\nNew Public IP: ${ip}`);
        } catch (err) {
          console.log('\nNew Public IP: Unable to determine');
        }
      } else {
        spinner.fail('Failed to change exit node');
        process.exit(1);
      }
    } catch (error) {
      spinner.fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Configure command - configure the application settings
program
  .command('configure')
  .description('Configure the application settings')
  .action(async () => {
    try {
      const config = getConfig();
      
      const answers = await inquirer.prompt([
        {
          type: 'number',
          name: 'defaultCircuitLength',
          message: 'Default circuit length (number of hops):',
          default: config.defaultCircuitLength,
        },
        {
          type: 'number',
          name: 'defaultLeaseDuration',
          message: 'Default lease duration (minutes):',
          default: config.defaultLeaseDuration,
        },
        {
          type: 'input',
          name: 'preferredCountries',
          message: 'Preferred countries (comma-separated country codes):',
          default: config.preferredCountries.join(','),
          filter: (input: string) => input ? input.split(',').map((c: any) => c.trim().toUpperCase()) : [],
        },
        {
          type: 'list',
          name: 'logLevel',
          message: 'Log level:',
          choices: ['debug', 'info', 'warn', 'error'],
          default: config.logLevel,
        }
      ]);
      
      updateConfig(answers);
      console.log('Configuration updated successfully');
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Validator commands
const validatorCommand = program.command('validator')
  .description('Manage validator endpoints');

// List validators
validatorCommand
  .command('list')
  .description('List all validators')
  .action(() => {
    const { validators } = getConfig();
    
    console.log('\nConfigured Validators:');
    if (validators.length === 0) {
      console.log('  No validators configured');
    } else {
      validators.forEach((validator: any, index: any) => {
        console.log(`  ${index + 1}. ${validator.ip}:${validator.port} - ${validator.isActive ? 'Active' : 'Inactive'}`);
      });
    }
  });

// Add validator
validatorCommand
  .command('add')
  .description('Add a new validator')
  .requiredOption('-i, --ip <address>', 'Validator IP address')
  .option('-p, --port <port>', 'Validator port', '3000')
  .action(async (options) => {
    const spinner = ora(`Adding validator ${options.ip}:${options.port}...`).start();
    
    try {
      const success = await validatorEndpoints.addNewValidator(options.ip, parseInt(options.port, 10));
      
      if (success) {
        spinner.succeed(`Validator ${options.ip}:${options.port} added successfully`);
      } else {
        spinner.fail(`Failed to add validator ${options.ip}:${options.port}`);
      }
    } catch (error) {
      spinner.fail(`Error: ${(error as Error).message}`);
    }
  });

// Check validators
validatorCommand
  .command('check')
  .description('Check all validators')
  .action(async () => {
    const spinner = ora('Checking validators...').start();
    
    try {
      const activeCount = await validatorEndpoints.checkAllValidators();
      spinner.succeed(`Found ${activeCount} active validators`);
    } catch (error) {
      spinner.fail(`Error: ${(error as Error).message}`);
    }
  });

// Countries command - list available countries
program
  .command('countries')
  .description('List available countries')
  .option('-a, --all', 'Show all countries from all validators')
  .action(async (options) => {
    const spinner = ora('Fetching available countries...').start();
    
    try {
      if (options.all) {
        // Récupérer les pays de tous les validateurs actifs
        const validators = getActiveValidators();
        
        if (validators.length === 0) {
          spinner.fail('No active validators found');
          return;
        }
        
        spinner.text = `Fetching countries from ${validators.length} validators...`;
        
        // Map pour stocker les pays par validateur
        const countryMap = new Map<string, string[]>();
        
        // Récupérer les pays de chaque validateur
        const promises = validators.map(async (validator: ValidatorEndpoint) => {
          try {
            const countries = await tpnClient.getAvailableCountries(validator);
            countryMap.set(`${validator.ip}:${validator.port}`, countries);
            return countries;
          } catch (error) {
            logger.warn(`Could not fetch countries from ${validator.ip}:${validator.port}`);
            return [];
          }
        });
        
        await Promise.all(promises);
        
        // Collecter tous les pays uniques
        const allCountries = new Set<string>();
        countryMap.forEach(countries => {
          countries.forEach(country => allCountries.add(country));
        });
        
        spinner.succeed(`Found ${allCountries.size} unique countries across ${countryMap.size} validators`);
        
        if (allCountries.size > 0) {
          // Afficher les pays par ordre alphabétique
          const sortedCountries = Array.from(allCountries).sort();
          console.log('\nAvailable Countries:');
          const formattedCountries = sortedCountries.join(', ');
          console.log(`  ${formattedCountries}`);
          
          // Afficher les pays par validateur
          console.log('\nCountries by Validator:');
          countryMap.forEach((countries, validatorKey) => {
            if (countries.length > 0) {
              console.log(`  ${validatorKey}: ${countries.sort().join(', ')}`);
            }
          });
        }
      } else {
        // Comportement original - récupérer les pays d'un seul validateur
        const validator = tpnClient.getRandomValidator();
        const countries = await tpnClient.getAvailableCountries(validator);
        
        spinner.succeed(`Found ${countries.length} available countries from ${validator.ip}:${validator.port}`);
        
        if (countries.length > 0) {
          console.log('\nAvailable Countries:');
          const sortedCountries = [...countries].sort();
          const formattedCountries = sortedCountries.join(', ');
          console.log(`  ${formattedCountries}`);
        }
      }
    } catch (error) {
      spinner.fail(`Error: ${(error as Error).message}`);
    }
  });

// Cleanup command - explicitly clean up all WireGuard interfaces
program
  .command('cleanup')
  .description('Clean up all WireGuard interfaces')
  .action(async () => {
    const spinner = ora('Cleaning up all WireGuard interfaces...').start();
    
    try {
      wireguardManager.cleanupAllInterfaces();
      spinner.succeed('All WireGuard interfaces cleaned up');
    } catch (error) {
      spinner.fail(`Error: ${(error as Error).message}`);
    }
  });

// Direct test command - test a direct connection to TPN
program
  .command('test')
  .description('Test a direct connection to TPN')
  .option('-c, --country <code>', 'Country code to connect to', 'any')
  .action(async (options) => {
    const spinner = ora(`Testing direct connection to ${options.country}...`).start();
    
    try {
      // Clean up any existing connections
      await routeManager.stopRoute();
      wireguardManager.cleanupAllInterfaces();
      
      // Get the original IP
      const originalIp = await wireguardManager.getCurrentPublicIp();
      spinner.info(`Original IP: ${originalIp}`);
      
      // Get a direct config from TPN
      spinner.text = `Getting configuration for ${options.country}...`;
      const configPath = await wireguardManager.getDirectConfig(options.country);
      
      // Connect using wg-quick directly
      spinner.text = `Connecting to ${options.country}...`;
      
      try {
        const success = wireguardManager.activateConfig(configPath);
        
        if (success) {
          spinner.succeed('Connected successfully');
          
          // Check if the IP has changed
          try {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for connection
            const newIp = await wireguardManager.getCurrentPublicIp();
            console.log(`\nNew IP: ${newIp}`);
            
            if (newIp === originalIp) {
              console.log('\nWARNING: IP address has not changed. Connection might not be working properly.');
            } else {
              console.log('\nSUCCESS: IP address has changed. Connection is working.');
            }
          } catch (error) {
            console.log('\nUnable to determine new IP address.');
          }
        } else {
          spinner.fail('Failed to connect');
        }
      } finally {
        // Always clean up
        console.log('\nCleaning up test connection...');
        wireguardManager.cleanupAllInterfaces();
      }
    } catch (error) {
      spinner.fail(`Test failed: ${(error as Error).message}`);
    }
  });

// Parse the command line arguments
program.parse(process.argv);

// If no command was provided, show help
if (process.argv.length <= 2) {
  program.help();
}