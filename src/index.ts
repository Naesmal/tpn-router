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

  program
  .command('reconnect')
  .description('Reconnect to VPN (can be used to refresh or change country)')
  .option('-c, --country <code>', 'Country code to connect to (optional)')
  .action(async (options) => {
    const spinner = ora('Reconnecting to VPN...').start();
    
    try {
      // Arrêter toute connexion active
      await routeManager.stopRoute();
      
      // Créer une nouvelle connexion
      let success;
      if (options.country) {
        spinner.text = `Connecting to VPN server in ${options.country}...`;
        success = await routeManager.createDirectConnection(options.country);
      } else {
        spinner.text = 'Connecting to random VPN server...';
        success = await routeManager.createDirectConnection('any');
      }
      
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

// Status command - shows the current VPN status
program
  .command('status')
  .description('Show the current VPN status')
  .action(async () => {
    try {
      // Vérifier directement si une interface WireGuard est active
      const isVpnActive = wireguardManager.isVpnActive();
      
      if (isVpnActive) {
        console.log('VPN Status: Active');
        
        // Obtenir des informations sur l'interface active
        const interfaceInfo = await wireguardManager.getActiveInterfaceInfo();
        
        if (interfaceInfo) {
          console.log('\nWireGuard Interface:');
          console.log(`  - Name: ${interfaceInfo.name}`);
          console.log(`  - Endpoint: ${interfaceInfo.endpoint || 'Unknown'}`);
          
          if (interfaceInfo.publicKey) {
            console.log(`  - Peer Public Key: ${interfaceInfo.publicKey}`);
          }
          
          if (interfaceInfo.allowedIPs) {
            console.log(`  - Allowed IPs: ${interfaceInfo.allowedIPs}`);
          }
          
          // Tenter d'obtenir le pays si le circuit est en mémoire
          const circuit = routeManager.getActiveCircuit();
          if (circuit && circuit.nodes.length > 0) {
            const node = circuit.nodes[0];
            if (node.config.country) {
              console.log(`  - Country: ${node.config.country}`);
            }
            
            if (circuit.expiresAt) {
              console.log(`  - Expires at: ${circuit.expiresAt.toLocaleString()}`);
              
              // Calculer le temps restant
              const timeRemaining = circuit.expiresAt.getTime() - Date.now();
              if (timeRemaining > 0) {
                console.log(`  - Time remaining: ${Math.floor(timeRemaining / 60000)} minutes`);
              } else {
                console.log('  - Expired (connection may stop working soon)');
              }
            }
          }
        }
        
        // Afficher le mode (direct ou circuit)
        const circuit = routeManager.getActiveCircuit();
        if (circuit) {
          if (circuit.nodes.length === 1) {
            console.log('\nConnection Type: Direct VPN');
          } else if (circuit.nodes.length > 1) {
            console.log(`\nConnection Type: Circuit (${circuit.nodes.length} hops)`);
            
            // Afficher le chemin du circuit
            console.log('\nCircuit Path:');
            circuit.nodes.sort((a, b) => a.index - b.index).forEach((node, idx) => {
              console.log(`  - Hop ${idx + 1}: ${node.config.country || 'Unknown'} (${node.config.endpoint})`);
            });
          }
        } else {
          console.log('\nConnection Type: Direct WireGuard connection');
        }
      } else {
        console.log('VPN Status: Not active');
      }
      
      // Toujours afficher l'IP actuelle
      try {
        const ip = await wireguardManager.getCurrentPublicIp();
        console.log(`\nCurrent Public IP: ${ip}`);
      } catch (err) {
        console.log('\nCurrent Public IP: Unable to determine');
      }
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
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
// Parse the command line arguments
program.parse(process.argv);

// If no command was provided, show help
if (process.argv.length <= 2) {
  program.help();
}