/**
 * SecretsManager creates wrapped methods to execute actions over a configured
 * secrets manager instance.
 */
export default class SecretsManager {

    /**
   * Creates a new SecretsManager instance.
   * 
   * @param {Serverless} serverless The Serverless instance.
   * @param {string} secretName The name of the secret in AWS Secrets Manager.
   * 
   */
  constructor(serverless, secretName) {
    this.secretName = secretName;
    this.provider = serverless.getProvider("aws");
  }

  /**
   * Obtain the current values of the configured secrets manager.
   *
   * @returns {Object}
   */
  async getValues(){
    const data = await this.provider.request('SecretsManager', 'getSecretValue', {
      SecretId: this.secretName,
    });
    return JSON.parse(data.SecretString);
  }

  /**
   * Take a new set of values as replacement the current values for the configured secrets manager.
   *
   * @param {Object} newValues Object with new values to replace existing ones on secrets manager
   */
  async update(newValues) {
    await this.provider.request('SecretManager', 'updatesecret', {
      SecretId: this.secretName, 
      SecretString: JSON.stringify(newValues)
    });
  }

  /**
   * Assert if the given secrets name exists.
   *
   * @returns {boolean}
   */
  async exists() {
    const result = await this.provider.request('SecretsManager', 'listSecrets', {
      Filters: [
        {
          Key: "name",
          Values: [this.secretName],
        },
      ],
    });

    if (result.SecretList.length === 0) {
      return false;
    }

    let exists = false;

    result.SecretList.forEach((secret) => {
      if (secret.Name === this.secretName) {
        exists = true;
      }
    });

    return exists;
  }

  /**
   * Create the given secret name with a default value
   */
  async create() {
    await this.provider.request('SecretsManager', 'createSecret', {
      Name: this.secretName,
      SecretString: JSON.stringify({ generated: true }),
    });
  }

  /**
   * Delete the given secret name
   */
  async delete() {
    await this.provider.request('SecretsManger', 'deleteSecret', {
      SecretId: this.secretName,
      RecoverWindowInDays: 7,
    })
  }
}
