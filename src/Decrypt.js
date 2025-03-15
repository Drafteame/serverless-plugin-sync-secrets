import fs from "fs";
import util from "util";
import cp from "child_process";
import lodash from "lodash";
import logger from "./Logger.js";

export default class Decrypt {
  #filePath;
  #ejsonPrivateKey;
  #outFile;
  #profile;
  #stage;

  /**
   * Create a new Decrypt instance.
   *
   * @param {string} filePath The path to the JSON file.
   * @param {string} privateKey Optional private key for encryption.
   * @param {string} outFile Path to a destination file were the decrypted content should be placed.
   */
  constructor(
    filePath,
    outFile,
    privateKey = null
  ) {
    this.exec = util.promisify(cp.exec);
    this.#filePath = filePath;
    this.#outFile = outFile;
    this.#ejsonPrivateKey = privateKey;
    this.#profile = process.env.AWS_PROFILE || "draftea-dev";
    this.#stage = process.env.STAGE || "dev";
    this.#validateFilePath();
  }

  /**
   * Initialize the decryptor by getting the private key if not provided
   * @returns {Promise<Decrypt>} This instance for chaining
   * @throws {Error} If private key cannot be obtained
   */
  async #init() {
    this.#ejsonPrivateKey = process.env.EJSON_KEY || await this.#getEjsonPrivateKey();
    if (lodash.isEmpty(this.#ejsonPrivateKey)) {
      throw new Error("No provided private key for decryption");
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
   * @returns {Promise<void>}
   */
    async run() {
      await this.#init();

      await this.#checkEjsonInstalled();

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
   * @returns {Promise<void>}
   */
  async #decrypt() {
    logger.logInfo('Decrypting secrets...');
    const command = `echo ${this.#ejsonPrivateKey} | ejson decrypt ${this.#filePath} -o ${this.#outFile} --key-from-stdin`;

    const res = await this.exec(command);
    const err = res.stderr.toString();

    if (!lodash.isEmpty(err)) {
      throw new Error(err);
    }

    logger.logInfo('Secrets decrypted successfully!');
  }

    /**
   * Get the private key from AWS SSM Parameter Store
   * 
   * @throws {Error} If the key cannot be retrieved
   * @returns {Promise<string>} The private key
   */
async #getEjsonPrivateKey() {
    try {
        const command = `aws ssm get-parameter --name "/service/ejson/${this.#stage}/PRIVATE_KEY" --with-decryption --profile ${this.#profile} --output text --query Parameter.Value`;
        const res = await this.exec(command);
        const out = res.stdout.toString();
        const err = res.stderr.toString();

        if (!lodash.isEmpty(err)) {
            throw new Error(err);
        }
        return out.trim();
    } catch (error) {
        throw new Error(`Error al obtener la clave privada de AWS SSM: ${error.message}`);
    }
}

}
