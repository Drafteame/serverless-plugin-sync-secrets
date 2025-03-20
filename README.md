# serverless-plugin-sync-secrets

This is a Serverless Framework that simplifies secrets management by synchronizing encrypted EJSON files with AWS Secrets Manager.

## Features

- **Enhanced Security**: Decrypts EJSON secrets directly in memory, without writing secrets to temporary files.
- **AWS Integration**: Automatically synchronizes secrets with AWS Secrets Manager.
- **Multi-environment Support**: Manages different sets of secrets per environment (dev, prod, etc.).
- **Simulation Mode**: Preview changes without applying them using "dry run" mode.

## Requirements

### EJSON

[EJSON](https://github.com/Shopify/ejson) must be installed in your development environment.

#### AWS Policies

The following AWS permissions are required for this plugin to work:

- `secretsmanager:GetSecretValue`
- `secretsmanager:UpdateSecret`
- `secretsmanager:ListSecrets`
- `secretsmanager:CreateSecret`
- `secretsmanager:DeleteSecret`
- `ssm:GetParameter` (only if using SSM to store the EJSON key)

## Installation

Install the plugin via npm:

```bash
npm install --save-dev serverless-plugin-sync-secrets
```

Add the plugin to your `serverless.yml` file:

```yaml
plugins:
  - serverless-plugin-sync-secrets
```

## Usage

### Configuration

To configure this plugin, you need to add a `syncSecrets` section to the `custom` section of your `serverless.yml` file.
Here is an example:

```yaml
custom:
  syncSecrets:
    ejson_file_path: path/to/ejson/secrets.ejson
    ejson_key: <ejson-private-key>
    ssm_prefix: <ssm-prefix>
    secret_name: <secret-name>
    exclude: '^_'
    create_secret: true
    show_values: false
    delete_secret: false
    dry: false
```

#### Configuration Options

| Option            | Description |
|------------------|-------------|
| `ejson_file_path` | Path to the `EJSON` secrets file (default: `./secrets/{stage}.ejson`). |
| `ejson_key` | The `EJSON` private key (optional if `ssm_prefix` is set). |
| `ssm_prefix` | Prefix in `AWS SSM Parameter Store` to retrieve the `EJSON` private key (optional if `ejson_key` is provided). |
| `secret_name` | Name of the secret in `AWS Secrets Manager` (default: service name). |
| `exclude` | Regex pattern to exclude specific keys from synchronization (default: `'^_'`). |
| `create_secret` | If `true`, creates the secret in AWS Secrets Manager if it does not exist (default: `false`). |
| `show_values` | If `true`, shows the secret values in logs instead of markers (default: `false`). |
| `delete_secret` | If `true`, deletes the secret instead of creating or updating it (default: `false`). |
| `dry` | If `true`, runs in simulation mode without applying changes (default: `false`). |


## Execution

The plugin will runs automatically when executing the `serverless deploy` command. It is triggered during the `before:package:initialize` phase of the serverless deployment process.

## Example 1

```yaml
service: my-service

provider:
  name: aws
  architecture: arm64
  runtime: provided.al2
  region: ${opt:region, "us-east-2"}
  stage: ${opt:stage, "dev"}

custom:
  syncSecrets:
    ejson_file_path: ./secrets/${self:provider.stage}.ejson
    ssm_prefix: "/ejson/keys/${self:provider.stage}/EJSON_KEY"
    secret_name: "my-service"
    create_secret: true

plugins:
  - serverless-secret-sync-plugin
```

## Example 2

```yaml
service: my-service

provider:
  name: aws
  architecture: arm64
  runtime: provided.al2
  region: ${opt:region, "us-east-2"}
  stage: ${opt:stage, "dev"}

custom:
  syncSecrets:
    ejson_key: ${env:EJSON_KEY}

plugins:
  - serverless-secret-sync-plugin
```