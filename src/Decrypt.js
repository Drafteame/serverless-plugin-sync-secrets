import fs from "fs";
import util from "util";
import cp from "child_process";
import os from "os";
import path from "path";
import crypto from "crypto";
import lodash from "lodash";
import logger from "./Logger.js";

export default class Decrypt {
  #filePath;
  #ejsonPrivateKey;
  #ssm_prefix;

  /**
   * Create a new Decrypt instance.
   * @param {Serverless} serverless The Serverless instance.
   * @param {string} filePath The path to the JSON file.
   * @param {string} privateKey Optional private key for encryption.
   * @param {string} ssm_prefix The SSM parameter name prefix for the private key.
  */
  constructor(
    serverless,
    filePath, 
    privateKey,
    ssm_prefix
  ) {
    this.exec = util.promisify(cp.exec);
    this.provider = serverless.getProvider('aws');
    this.#filePath = filePath;
    this.#ejsonPrivateKey = privateKey;
    this.#ssm_prefix = ssm_prefix;
    this.#validateFilePath();
  }

  /**
   * Initialize the decryptor by getting the private key if not provided
   * @returns {Promise<Decrypt>} This instance for chaining
   * @throws {Error} If private key cannot be obtained
   */
  async setEjsonPrivateKey() {
    if (lodash.isNull(this.#ejsonPrivateKey) || lodash.isEmpty(this.#ejsonPrivateKey)) {
      if (lodash.isNull(this.#ssm_prefix) || lodash.isEmpty(this.#ssm_prefix)) {
        throw new Error("No provided private key for decryption and no SSM prefix provided");
      }
      this.#ejsonPrivateKey = await this.#getEjsonPrivateKey();
    }
    return this;
  }
  
  /**
   * Validate the existence of the JSON file at the specified path and the private key.
   *
   * @throws {Error} File not exists
   */
  #validateFilePath() {
    if (!fs.existsSync(this.#filePath)) {
      throw new Error(`JSON file does not exist at path: ${this.#filePath}`);
    }
  }

  /**
   * Run the decryption process.
   *
   * @throws {Error} If any step of the process fails
   * @returns {Promise<Object>} The decrypted JSON object
   */
    async run() {
      await this.#checkEjsonInstalled();
      await this.#ejsonPrivateKey();
      return await this.#decrypt();
    }

   /**
   * Checks if ejson is installed in the system.
   * 
   * @throws {Error} If ejson is not installed
   * @returns {Promise<boolean>} True if ejson is installed
   */
    async #checkEjsonInstalled() {
        try {
            await this.exec('which ejson');
            return true;
        } catch (error) {
            throw new Error('ejson command not found. Please install it first.');
        }
    }

  /**
   * Decrypt the JSON file using the ejson command and set the decrypted output.
   *
   * @throws {Error} An execution error occurs during ejson command
   *
   * @returns {Promise<Object>} The decrypted JSON object
   */
  async #decrypt() {
    logger.logInfo('Decrypting secrets...');
    let tmpKeyFile = null;

    try{
      const tmpdir = os.tmpdir();
      tmpKeyFile = path.join(tmpdir, `${crypto.randomBytes(16).toString('hex')}`);
      fs.writeFileSync(tmpKeyFile, this.#ejsonPrivateKey, { mode: 0o600 });

      const command = `ejson decrypt ${this.#filePath} --keydir ${tmpKeyFile}`;
      const res = await this.exec(command);

      const out = res.stdout.toString();
      const err = res.stderr.toString();

      if (!lodash.isEmpty(err)) {
        throw new Error(err);
      }

      const secrets = JSON.parse(out);

      logger.logInfo('Secrets decrypted successfully!');
      return secrets;
    } catch (error) {
        throw new Error(`Error decrypting secrets: ${error.message}`);
    } finally {
      if (tmpKeyFile && fs.existsSync(tmpKeyFile)){
        fs.unlinkSync(tmpKeyFile);
      }
    }
  }

    /**
   * Get the private key from AWS SSM Parameter Store
   * 
   * @throws {Error} If the key cannot be retrieved
   * @returns {Promise<string>} The private key
   */
  async #getEjsonPrivateKey() {
    try {
      const result = await this.provider.request('SSM', 'getParameter', {
          Name: this.#ssm_prefix,
          WithDecryption: true
        });

      const privateKey = result.Parameter.Value;

      if (lodash.isEmpty(privateKey)) {
        throw new Error("No provided private key for decryption");
      }

      return privateKey;        
    } catch (error) {
        throw new Error(`Error getting private key from SSM: ${error.message}`);
    }
  }

}
