import chalk from "chalk";

class Logger {
  constructor(prefix = "SyncSecret") {
    this.prefix = prefix;
    this.serverless = null;
  }

  setServerless(serverless) {
    this.serverless = serverless;
  }
  
  /**
   * Print a plugin info log message
   *
   * @param {string} message Log message
   */
  logInfo(message) {
    this.serverless.cli.consoleLog(`${chalk.cyan(this.prefix)}: ${message}`);
  }

   /**
   * Print a plugin error log message
   *
   * @param {string} message Log message
   */
  logError(message) {
    this.serverless.cli.consoleLog(`${chalk.red(this.prefix)}: ${message}`);
  }
}

export default new Logger();
