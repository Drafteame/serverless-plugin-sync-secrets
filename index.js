import SyncSecret from "./src/SyncSecrets.js";
import Decrypt from "./src/Decrypt.js";
import logger from "./src/Logger.js";
import path from "path";

export default class SyncSecretPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.servicePath = this.serverless.config.servicePath || process.cwd();
    this.secrets = null;
    this.provider = this.serverless.getProvider('aws');
    this.stage = this.provider.getStage(); 

    logger.setServerless(serverless);

    this.defaultConfig = {
      ejson_file_path: path.join(this.servicePath, 'secrets', `${this.stage}.ejson`),
      secret_name: this.serverless.service.service,
      ejson_key: null,
      ssm_prefix: null,
      exclude: "^_",
      create_secret: false,
      show_values: false,
      delete_secret: false,
      dry: false
    };
    this.config = this.getConfig();

    this.hooks = {
      'before:package:initialize': async () => {
        await this.decryptSecrets();
        await this.syncSecretToSecretManager();
      }
    };
  }

  /**
   * Decrypts the EJSON file to a secure temporary location
   * @returns {Promise<void>}
   * @throws {Error} If decryption fails
   */
  async decryptSecrets() {
    const decrypt = new Decrypt(
      this.serverless,
      this.config.ejson_file_path,
      this.config.ejson_key,
      this.config.ssm_prefix
    );
    try {
      this.secrets = await decrypt.run(); 
    } catch (e) {
      logger.logError(`Error decrypting secrets: ${e.message}`);
      throw e;
    }
  }

  /**
   * Synchronizes secrets with AWS Secret Manager
   * @returns {Promise<Object>} ChangeSet of applied changes
   * @throws {Error} If sync fails
   */
  async syncSecretToSecretManager() {
    logger.logInfo('Starting secret sync process...');

    if (!this.secrets) {
      throw new Error('No secrets available. Make sure decryptSecrets() was called successfully.');
    }

    const syncSecret = new SyncSecret(
      this.serverless,
      this.config.secret_name,
      this.secrets,
      this.config.exclude,
      this.config.show_values,
      this.config.create_secret,
      this.config.delete_secret
    );
    const dry = this.config.dry;

    try {
      logger.logInfo('Syncing secrets...');
      const changeSet = await syncSecret.run();

      logger.logInfo('Changes detected:');
      for (const desc of changeSet.changeDesc()) {
        logger.logInfo(desc);
      }

      if (!dry) {
        await changeSet.apply();
        logger.logInfo('Secrets synced successfully!');
      }
    } catch (e) {
      logger.logError(`Error syncing secrets: ${e.message}`);
      throw e;
    }
  }

  /**
   * Load the plugin configuration
   * @returns {Object} The plugin configuration
   */
  getConfig() {
    logger.logInfo('Loading plugin configuration...');

    let config = { ...this.defaultConfig };
    const service = this.serverless.service;

    if (service.custom && service.custom.syncSecrets) {
      config = { ...config, ...service.custom.syncSecrets };

      const boolKeys = ['create_secret', 'delete_secret', 'show_values', 'dry'];
      boolKeys.forEach(key => {
        if (key in service.custom.syncSecrets) {
          logger.logInfo(`${key}: ${service.custom.syncSecrets[key]}`);
          config[key] = Boolean(service.custom.syncSecrets[key]);
        }
      });
    }

    logger.logInfo('Configuration loaded successfully');
    return config;
  }
}
