import SyncSecret from "./src/SyncSecrets.js";
import Decrypt from "./src/Decrypt.js";
import logger from "./src/Logger.js";
import path from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import AWS from "aws-sdk";

const stage = process.env.STAGE || 'dev';
let credentials;
try {
  const profile = process.env.AWS_PROFILE || 'draftea-dev';
  credentials = new AWS.SharedIniFileCredentials({ profile });
} catch (error) {
  logger.logInfo(`Profile ${profile} not found in ~/.aws/credentials`);
  credentials = { accessKeyId: undefined, secretAccessKey: undefined };
}
const awsConfig = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || credentials.accessKeyId,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || credentials.secretAccessKey,
  region: process.env.AWS_REGION || 'us-east-2'
};

export default class SyncSecretPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.servicePath = this.serverless.config.servicePath || process.cwd();

    logger.setServerless(serverless);

    this.tempDir = this.#createTempDir();

    this.defaultConfig = {
      aws_access_key_id: awsConfig.accessKeyId,
      aws_secret_access_key: awsConfig.secretAccessKey,
      aws_region: awsConfig.region,
      secret_name: this.serverless.service.service,
      exclude: "^_",
      create_secret: false,
      show_values: false,
      delete_secret: false,
      dry: false
    };

    this.ejson_file_path = path.join(this.servicePath, 'secrets', `${stage}.ejson`);
    this.decryptedFilePath = path.join(this.tempDir, `decrypted_${crypto.randomBytes(8).toString('hex')}.json`);

    this.config = this.getConfig();

    this.hooks = {
      'before:package:initialize': async () => {
        await this.decryptSecrets();
        await this.syncSecretToSecretManager();
      },
      'after:package:initialize': async () => this.cleanupTempFiles()
    };

    process.on('exit', this.cleanupTempFiles.bind(this));
    process.on('SIGINT', () => {
      this.cleanupTempFiles();
      process.exit(1);
    });
  }

  /**
   * Creates a secure temporary directory with restricted permissions
   * @returns {string} Path to the created temporary directory
   */
  #createTempDir() {
    const baseTemp = os.tmpdir();
    const uniqueDirName = `sls-secrets-${crypto.randomBytes(16).toString('hex')}`;
    const tempDir = path.join(baseTemp, uniqueDirName);

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { mode: 0o700 });
    }

    return tempDir;
  }

  /**
   * Decrypts the EJSON file to a secure temporary location
   * @returns {Promise<void>}
   * @throws {Error} If decryption fails
   */
  async decryptSecrets() {
    const decrypt = new Decrypt(
      this.ejson_file_path, // file to decrypt
      this.decryptedFilePath // decrypted file path
    );
    try {
      await decrypt.run();
      fs.chmodSync(this.decryptedFilePath, 0o600);
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

    const syncSecret = new SyncSecret(
      this.config.aws_access_key_id,
      this.config.aws_secret_access_key,
      this.config.aws_region,
      this.config.secret_name,
      this.decryptedFilePath,
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
      throw new Error(e);
    } finally {
      this.cleanupTempFiles();
    }
  }

  /**
   * Deletes the temporary files and directories created during the process
   */
  cleanupTempFiles() {
    try {
      if (this.decryptedFilePath && fs.existsSync(this.decryptedFilePath)) {
        fs.unlinkSync(this.decryptedFilePath);
        logger.logInfo('Temporary file deleted');
      }
      if (this.tempDir && fs.existsSync(this.tempDir)) {
        fs.rmdirSync(this.tempDir);
        logger.logInfo('Temporary directory deleted');
      }
    } catch (e) {
      logger.logError(`Error cleaning up temporary files: ${e.message}`);
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
