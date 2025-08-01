import chalk from 'chalk';
import debug from 'debug';

class Logger {
  private rootNamespace: string;
  private namespace: string;
  private isLogging: boolean;

  constructor(isLogging: boolean) {
    this.rootNamespace = 'azure:vitest';
    this.namespace = process.env.AZURE_VITEST_DEBUG === '1' ? 'azure:vitest:*' : 'azure:vitest:log,azure:vitest:warn,azure:vitest:error';
    this.isLogging = isLogging;

    if (this.isLogging && !this.isDisabled()) {
      debug.enable(this.namespace);
    }
  }

  private isDisabled() {
    return process.env.AZURE_VITEST_DISABLED === 'true';
  }

  // eslint-disable-next-line no-unused-vars
  private logMessage(level: string, message: string, colorFunc: (msg: string) => string, force = false) {
    if (!this.isDisabled() || force) {
      if (typeof message === 'object') {
        message = JSON.stringify(message, null, 2);
      }
      let enabled = false;
      if (['warn', 'error'].includes(level) || this.namespace === 'azure:vitest:*') {
        enabled = debug.enabled(`${this.rootNamespace}:${level}`);
        debug.enable(`${this.rootNamespace}:${level}`);
        const log = debug(this.rootNamespace).extend(level);
        log.log = console.log.bind(console);
        log(colorFunc(message));
        if (!enabled) {
          debug.disable();
        }
      } else {
        if (force) {
          debug.enable(this.namespace);
        }
        const log = debug(this.rootNamespace).extend(level);
        log.log = console.log.bind(console);
        log(colorFunc(message));
        if (!enabled) {
          debug.disable();
        }
      }

      if (this.isLogging && !this.isDisabled()) {
        debug.enable(this.namespace);
      }
    }
  }

  info(message: string, force = false) {
    this.logMessage('log', message, chalk.white, force);
  }

  warn(message: string) {
    this.logMessage('warn', message, chalk.yellow);
  }

  error(message: string) {
    this.logMessage('error', message, chalk.red);
  }

  debug(message: any) {
    this.logMessage('debug', message, chalk.blue);
  }
}

export default Logger;
