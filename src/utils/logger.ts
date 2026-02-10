import chalk from 'chalk';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

let verboseEnabled = false;

export const setVerbose = (enabled: boolean) => {
  verboseEnabled = enabled;
};

export const log = (level: LogLevel, message: string) => {
  if (level === 'debug' && !verboseEnabled) return;

  const prefix =
    level === 'info'
      ? chalk.blue('info')
      : level === 'warn'
        ? chalk.yellow('warn')
        : level === 'error'
          ? chalk.red('error')
          : chalk.gray('debug');

  console.log(`${prefix} ${message}`);
};

export const info = (message: string) => log('info', message);
export const warn = (message: string) => log('warn', message);
export const error = (message: string) => log('error', message);
export const debug = (message: string) => log('debug', message);
