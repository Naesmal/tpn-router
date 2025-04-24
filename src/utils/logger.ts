import chalk from 'chalk';
import { getConfig } from './config.js';

// Log levels with their numerical values
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Get the configured log level
 */
function getLogLevel(): number {
  const config = getConfig();
  return LOG_LEVELS[config.logLevel] || LOG_LEVELS.info;
}

/**
 * Format the current timestamp
 */
function getTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, -5);
}

/**
 * Debug level logging (verbose)
 */
export function debug(message: string, ...args: any[]): void {
  if (getLogLevel() <= LOG_LEVELS.debug) {
    console.log(
      `${chalk.gray(getTimestamp())} ${chalk.blue('[DEBUG]')} ${message}`,
      ...args
    );
  }
}

/**
 * Info level logging (normal operation)
 */
export function info(message: string, ...args: any[]): void {
  if (getLogLevel() <= LOG_LEVELS.info) {
    console.log(
      `${chalk.gray(getTimestamp())} ${chalk.green('[INFO]')} ${message}`,
      ...args
    );
  }
}

/**
 * Warning level logging (issues that don't affect operation)
 */
export function warn(message: string, ...args: any[]): void {
  if (getLogLevel() <= LOG_LEVELS.warn) {
    console.log(
      `${chalk.gray(getTimestamp())} ${chalk.yellow('[WARN]')} ${message}`,
      ...args
    );
  }
}

/**
 * Error level logging (issues that affect operation)
 */
export function error(message: string, ...args: any[]): void {
  if (getLogLevel() <= LOG_LEVELS.error) {
    console.log(
      `${chalk.gray(getTimestamp())} ${chalk.red('[ERROR]')} ${message}`,
      ...args
    );
  }
}

/**
 * Success message (for user feedback)
 */
export function success(message: string, ...args: any[]): void {
  if (getLogLevel() <= LOG_LEVELS.info) {
    console.log(
      `${chalk.gray(getTimestamp())} ${chalk.greenBright('[SUCCESS]')} ${message}`,
      ...args
    );
  }
}

export default {
  debug,
  info,
  warn,
  error,
  success,
};