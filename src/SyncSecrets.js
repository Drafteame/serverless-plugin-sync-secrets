import SecretsManager from "./SecretsManager.js";
import ChangeSet from "./ChangeSet.js";
import logger from "./Logger.js";

/**
 * SyncSecret is a class representing an action to synchronize secrets with AWS Secrets Manager.
 * It validates input data, fetches existing secrets, and creates a change set for updates.
 */
export default class SyncSecret {
  /**
   * Secret data object
   * @type {Object}
   */
  #secrets;

  /**
   * Regexp to that evaluates if a kip should skip the sync process
   * @type {string}
   */
  #skipPattern;

  /**
   * Flag to hide or not secret values on logs
   * @type {boolean}
   */
  #showValues;

  /**
   * Secrets Manager client instance
   * @type {SecretsManager}
   */
  #smClient;

  /**
   * Flag to create the secret before sync if not exists
   * @type {boolean}
   */
  #createSecretFlag;

  /**
   * Flag that marks the specified secret to be deleted
   */
  #deleteSecretFlag;

  /**
   * Creates a new SyncSecret instance.
   * 
   * @param {Serverless} serverless The Serverless instance.
   * @param {string} secretName The name of the secret in AWS Secrets Manager.
   * @param {Object} secrets The object containing the secret values.
   * @param {string} skipPattern A regular expression that eval keys of the json file and if matched,
   *        that key should be omitted
   * @param {boolean} showValues If this flag is set to true all secret values will be displayed on logs,
   *        if false, a placeholder will be displayed.
   * @param {boolean} createSecret Flag to create the secret before sync if not exists
   * @param {boolean} deleteSecret Flag that marks the specified secret to be deleted.
   *
   * @throws {Error} Throws an error if any required parameter is missing or if the JSON file doesn't exist.
   */
  constructor(
    serverless,
    secretName,
    secrets,
    skipPattern,
    showValues,
    createSecret,
    deleteSecret,
  ) {
    this.#validateData(secretName);
    this.#secrets = secrets;
    this.#skipPattern = skipPattern;
    this.#showValues = showValues;
    this.#createSecretFlag = createSecret;
    this.#deleteSecretFlag = deleteSecret;

    this.#smClient = new SecretsManager(serverless, secretName);
  }

  /**
   * Runs the action to synchronize secrets by fetching existing secrets and creating a change set.
   * @returns {Promise<ChangeSet>} A promise that resolves to a ChangeSet instance representing the changes to be applied.
   */
  async run() {
    await this.#createSecret();
    let existingSecretData = {};
    let newSecretData = {};

    if (!this.#deleteSecretFlag) {
      existingSecretData = await this.#smClient.getValues();
      newSecretData = this.#secrets;
    }

    return new ChangeSet(
      this.#smClient,
      newSecretData,
      existingSecretData,
      this.#skipPattern,
      this.#showValues,
      this.#deleteSecretFlag,
    );
  }

  /**
   * Execute secret creation if needed
   */
  async #createSecret() {
    if (this.#deleteSecretFlag || !this.#createSecretFlag) {
      logger.logInfo("Secret creation skip...");  
      return;
    }

    if (await this.#smClient.exists()) {
      return;
    }

    await this.#smClient.create();
  }

  /**
   * Validates input data, ensuring that required parameters are provided and the JSON file exists.
   * @param {string} secretName - The name of the secret in AWS Secrets Manager.
   * @throws {Error} Throws an error if any required parameter is missing or if the JSON file doesn't exist.
   */
  #validateData(secretName) {
    if (!secretName) {
      throw new Error("Missing secret_name");
    }
  }
}
