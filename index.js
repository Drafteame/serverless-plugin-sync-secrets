import SyncSecret from "./src/SyncSecrets.js";
import chalk from "chalk";
import path from "path";
import AWS from "aws-sdk";

const logPrefix = "SyncSecret";
const stage = process.env.STAGE || 'dev';
const profile = process.env.AWS_PROFILE || 'draftea-dev';
const credentials = new AWS.SharedIniFileCredentials({ profile });
const awsConfig = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || credentials.accessKeyId,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || credentials.secretAccessKey,
  region: process.env.AWS_REGION || 'us-east-2'
};

export default class SyncSecretPlugin {

  constructor (serverless, options) {
    this.serverless = serverless;
    this.options = options || {};

    const servicePath =  this.serverless.config.servicePath || process.cwd();

    this.defaultConfig = {
      aws_access_key_id: awsConfig.accessKeyId,
      aws_secret_access_key: awsConfig.secretAccessKey,
      aws_region: awsConfig.region,
      secret_name: this.serverless.service.service,
      file_path: path.join(servicePath, 'secrets', `${stage}.json`),
      exclude: "^_",
      create_secret: false,
      show_values: false,
      delete_secret: false,
      dry: false
    };

    this.config = this.getConfig();

    this.hooks = {
      'before:package:initialize': () => this.syncSecretToSecretManager()
    };
  }

  async syncSecretToSecretManager() {
    this.logInfo('Starting secret sync process...');
    
    const syncSecret = new SyncSecret(
      this.config.aws_access_key_id,
      this.config.aws_secret_access_key,
      this.config.aws_region,
      this.config.secret_name,
      this.config.file_path,
      this.config.exclude,
      this.config.show_values,
      this.config.create_secret,
      this.config.delete_secret
    );
    const dry = this.config.dry;

    try {
      this.logInfo('Syncing secrets...');
      const changeSet = await syncSecret.run();
      this.logInfo('Changes detected:');
      for (const desc of changeSet.changeDesc()) {
        console.info(desc);
      }
  
      if (!dry) {
        await changeSet.apply();
        this.logInfo('Secrets synced successfully!');
      }
    } catch (e) {
      this.logError(`Error syncing secrets: ${e.message}`);
      process.exit(1);
    }
  }

    /**
   * @returns {Object}
   */
    getConfig() {
      this.logInfo('Loading plugin configuration...');
      
      let config = { ...this.defaultConfig };
      const service = this.serverless.service;
      this.logInfo(`Service: ${service.service}`);

      if (service.custom && service.custom.syncSecrets) {
        config = { ...config, ...service.custom.syncSecrets };

        const boolKeys = ['create_secret', 'delete_secret', 'show_values', 'dry'];
        boolKeys.forEach(key => {
          if (key in service.custom.syncSecrets) {
            this.logInfo(`${key}: ${service.custom.syncSecrets[key]}`);
            config[key] = Boolean(service.custom.syncSecrets[key]);
          }
        });
      }

      this.logInfo('Configuration loaded successfully');
      return config;
  }

  /**
   * Print a plugin info log message
   *
   * @param {string} message Log message
   */
  logInfo(message) {
    this.serverless.cli.consoleLog(`${chalk.cyan(logPrefix)}: ${message}`);
  }

  /**
   * Print a plugin error log message
   *
   * @param {string} message Log message
   */
  logError(message) {
    this.serverless.cli.consoleLog(`${chalk.red(logPrefix)}: ${message}`);
  }

}
