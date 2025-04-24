#!/usr/bin/env node
import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';

import routeManager from './routing/routeManager.js';
import circuitBuilder from './routing/circuitBuilder.js';
import validatorEndpoints from './api/validatorEndpoints.js';
import tpnClient from './api/tpnClient.js';
import wireguardManager from './vpn/wireguardManager.js';
import { getConfig, updateConfig } from './utils/config.js';

// Create CLI program
const program = new Command();

program
  .name('tpn-router')
  .description('Dynamic routing client for TPN VPN network')
  .version('0.1.0');

// Start command - creates and starts a new routing circuit
program
  .command('start')
  .description('Start a new routing circuit')
  .option('-l, --length <number>', 'Number of hops in the circuit', parseInt)
  .option('-c, --countries <list>', 'Comma-separated list of country codes')
  .action(async (options) => {
    const spinner = ora('Creating routing circuit...').start();
    
    try {
      // Check if WireGuard is installed
      if (!wireguardManager.isWireGuardInstalled()) {
        spinner.fail('WireGuard is not installed on your system');
        console.log('Please install WireGuard:');
        console.log('  - Mac: brew install wireguard-tools');
        console.log('  - Linux: sudo apt install -y wireguard wireguard-tools');
        process.exit(1);
      }
      
      // Check validators
      spinner.text = 'Checking TPN validators...';
      const activeCount = await validatorEndpoints.checkAllValidators();
      
      if (activeCount === 0) {
        spinner.fail('No active TPN validators found');
        process.exit(1);
      }
      
      // Parse countries if provided
      let countries: string[] | undefined;
      if (options.countries) {
        countries = options.countries.split(',').map((c: string) => c.trim().toUpperCase());
        spinner.text = `Building circuit with countries: ${(countries ?? []).join(', ')}`;
      } else {
        spinner.text = 'Building circuit with random countries';
      }
      
      // Start the route
      const success = await routeManager.createRoute(options.length, countries);
      
      if (success) {
        const circuit = routeManager.getActiveCircuit();
        spinner.succeed(`Routing circuit created with ${circuit?.nodes.length || 0} hops`);
        
        // Show circuit information
        if (circuit) {
          console.log('\nCircuit Information:');
          console.log(`  - Circuit ID: ${circuit.id}`);
          console.log(`  - Number of hops: ${circuit.nodes.length}`);
          console.log(`  - Created at: ${circuit.createdAt.toLocaleString()}`);
          console.log(`  - Expires at: ${circuit.expiresAt.toLocaleString()}`);
          
          // Show exit node information
          const exitConfig = circuitBuilder.getExitNodeConfig(circuit);
          console.log('\nExit Node:');
          console.log(`  - Country: ${exitConfig.country || 'Unknown'}`);
          console.log(`  - Endpoint: ${exitConfig.endpoint}`);
        }
      } else {
        spinner.fail('Failed to create routing circuit');
        process.exit(1);
      }
    } catch (error) {
      spinner.fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Stop command - stops the current routing circuit
program
  .command('stop')
  .description('Stop the current routing circuit')
  .action(async () => {
    const spinner = ora('Stopping routing circuit...').start();
    
    try {
      const success = await routeManager.stopRoute();
      
      if (success) {
        spinner.succeed('Routing circuit stopped');
      } else {
        spinner.fail('Failed to stop routing circuit');
        process.exit(1);
      }
    } catch (error) {
      spinner.fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Status command - shows the current routing status
program
  .command('status')
  .description('Show the current routing status')
  .action(async () => {
    try {
      const isActive = routeManager.isRouteActive();
      
      if (isActive) {
        const circuit = routeManager.getActiveCircuit();
        console.log('Routing Status: Active');
        
        if (circuit) {
          console.log('\nCircuit Information:');
          console.log(`  - Circuit ID: ${circuit.id}`);
          console.log(`  - Number of hops: ${circuit.nodes.length}`);
          console.log(`  - Created at: ${circuit.createdAt.toLocaleString()}`);
          console.log(`  - Expires at: ${circuit.expiresAt.toLocaleString()}`);
          
          // Check time remaining
          const timeRemaining = circuit.expiresAt.getTime() - Date.now();
          console.log(`  - Time remaining: ${Math.floor(timeRemaining / 60000)} minutes`);
          
          // Show exit node information
          const exitConfig = circuitBuilder.getExitNodeConfig(circuit);
          console.log('\nExit Node:');
          console.log(`  - Country: ${exitConfig.country || 'Unknown'}`);
          console.log(`  - Endpoint: ${exitConfig.endpoint}`);
          
          // Show current IP
          try {
            const ip = await wireguardManager.getCurrentPublicIp();
            console.log(`\nCurrent Public IP: ${ip}`);
          } catch (err) {
            console.log('\nCurrent Public IP: Unable to determine');
          }
        }
      } else {
        console.log('Routing Status: Not active');
        
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

// Refresh command - refreshes the current routing circuit
program
  .command('refresh')
  .description('Refresh the current routing circuit')
  .action(async () => {
    const spinner = ora('Refreshing routing circuit...').start();
    
    try {
      if (!routeManager.isRouteActive()) {
        spinner.fail('No active routing circuit to refresh');
        process.exit(1);
      }
      
      const success = await routeManager.refreshRoute();
      
      if (success) {
        const circuit = routeManager.getActiveCircuit();
        spinner.succeed(`Routing circuit refreshed with ${circuit?.nodes.length || 0} hops`);
      } else {
        spinner.fail('Failed to refresh routing circuit');
        process.exit(1);
      }
    } catch (error) {
      spinner.fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Change exit command - changes the exit node of the circuit
program
  .command('exit')
  .description('Change the exit node of the circuit')
  .action(async () => {
    const spinner = ora('Changing exit node...').start();
    
    try {
      if (!routeManager.isRouteActive()) {
        spinner.fail('No active routing circuit');
        process.exit(1);
      }
      
      const success = await routeManager.changeExitNode();
      
      if (success) {
        const circuit = routeManager.getActiveCircuit();
        const exitConfig = circuit ? circuitBuilder.getExitNodeConfig(circuit) : null;
        
        spinner.succeed('Exit node changed successfully');
        
        if (exitConfig) {
          console.log('\nNew Exit Node:');
          console.log(`  - Country: ${exitConfig.country || 'Unknown'}`);
          console.log(`  - Endpoint: ${exitConfig.endpoint}`);
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
  .action(async () => {
    const spinner = ora('Fetching available countries...').start();
    
    try {
      const validator = tpnClient.getRandomValidator();
      const countries = await tpnClient.getAvailableCountries(validator);
      
      spinner.succeed(`Found ${countries.length} available countries`);
      
      if (countries.length > 0) {
        console.log('\nAvailable Countries:');
        const formattedCountries = countries.join(', ');
        console.log(`  ${formattedCountries}`);
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