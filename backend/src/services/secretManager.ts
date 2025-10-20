import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

export class SecretManagerService {
  private client: SecretManagerServiceClient;
  private projectId: string;

  constructor(projectId: string) {
    this.client = new SecretManagerServiceClient();
    this.projectId = projectId;
  }

  /**
   * Get OpenAI API key from Secret Manager
   */
  async getOpenAIApiKey(secretName: string = 'openai-api-key'): Promise<string> {
    try {
      const name = `projects/${this.projectId}/secrets/${secretName}/versions/latest`;
      const [version] = await this.client.accessSecretVersion({ name });

      const payload = version.payload?.data;
      if (!payload) {
        throw new Error('Secret payload is empty');
      }

      // Convert Buffer to string
      const apiKey = payload.toString('utf8');

      if (!apiKey || !apiKey.startsWith('sk-')) {
        throw new Error('Invalid OpenAI API key format');
      }

      return apiKey;
    } catch (error: any) {
      console.error('Failed to get OpenAI API key from Secret Manager:', error.message);
      throw new Error(`Secret Manager error: ${error.message}`);
    }
  }

  /**
   * Create or update a secret
   */
  async createOrUpdateSecret(secretName: string, secretValue: string): Promise<void> {
    try {
      const parent = `projects/${this.projectId}`;

      // Try to create secret first
      try {
        await this.client.createSecret({
          parent,
          secretId: secretName,
          secret: {
            replication: {
              automatic: {},
            },
          },
        });
        console.log(`Secret ${secretName} created`);
      } catch (error: any) {
        // Secret already exists, that's fine
        if (!error.message.includes('already exists')) {
          throw error;
        }
      }

      // Add secret version
      const secretPath = `projects/${this.projectId}/secrets/${secretName}`;
      await this.client.addSecretVersion({
        parent: secretPath,
        payload: {
          data: Buffer.from(secretValue, 'utf8'),
        },
      });

      console.log(`Secret ${secretName} version added`);
    } catch (error: any) {
      console.error('Failed to create/update secret:', error.message);
      throw new Error(`Secret Manager error: ${error.message}`);
    }
  }
}
