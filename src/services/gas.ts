import { google, script_v1 } from 'googleapis';
import { getGasCodeTemplate, getAppsScriptManifest } from '../templates/gas-code.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger('GasService');

/**
 * Google Apps Script Service Configuration
 */
interface GasServiceConfig {
  /**
   * Path to Google Cloud service account credentials JSON file
   */
  credentialsPath?: string;

  /**
   * OAuth2 access token (alternative to service account)
   */
  accessToken?: string;
}

/**
 * Apps Script Project File
 */
interface ScriptFile {
  name: string;
  type: 'SERVER_JS' | 'JSON';
  source: string;
}

/**
 * Google Apps Script Service
 *
 * Manages the creation and deployment of Apps Script projects bound to spreadsheets.
 * Provides automated setup of whitepaper revision functionality using LLM integration.
 *
 * Features:
 * - Creates container-bound Apps Script projects
 * - Uploads code templates for client feedback processing
 * - Configures OAuth scopes and runtime settings
 * - Integrates with Google Sheets for whitepaper management
 *
 * @example
 * ```typescript
 * const gasService = new GasService({
 *   credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS
 * });
 *
 * await gasService.attachToSpreadsheet('1a2b3c4d5e6f7g8h9i');
 * console.log('Apps Script attached successfully');
 * ```
 */
export class GasService {
  private script: script_v1.Script;
  private drive: any;

  /**
   * Creates a new GasService instance
   *
   * @param config - Configuration for Google Apps Script API authentication
   * @throws {Error} If authentication fails or credentials are invalid
   */
  constructor(config: GasServiceConfig = {}) {
    const auth = new google.auth.GoogleAuth({
      keyFile: config.credentialsPath || process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: [
        'https://www.googleapis.com/auth/script.projects',
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/spreadsheets',
      ],
    });

    this.script = google.script({ version: 'v1', auth });
    this.drive = google.drive({ version: 'v3', auth });

    logger.info('GasService initialized');
  }

  /**
   * Attaches Apps Script project to a spreadsheet and deploys revision functionality
   *
   * This method performs the following steps:
   * 1. Creates a new container-bound Apps Script project linked to the spreadsheet
   * 2. Retrieves the GAS code template for whitepaper revision
   * 3. Uploads the code files (Code.gs and appsscript.json) to the project
   * 4. Configures OAuth scopes for Sheets and external API access
   *
   * The deployed script includes:
   * - Custom menu "WPエージェント" in the spreadsheet
   * - "コメント反映してv2作成" function for processing client feedback
   * - LLM integration for content revision
   * - Difference highlighting functionality
   *
   * @param spreadsheetId - The ID of the target spreadsheet
   * @returns Promise resolving to the created Apps Script project ID
   * @throws {Error} If spreadsheet doesn't exist or project creation fails
   * @throws {Error} If code upload fails or API access is denied
   *
   * @example
   * ```typescript
   * const gasService = new GasService();
   * const projectId = await gasService.attachToSpreadsheet('1a2b3c4d5e6f7g8h9i');
   * console.log(`Apps Script project created: ${projectId}`);
   * // User can now access the custom menu in the spreadsheet
   * ```
   */
  async attachToSpreadsheet(spreadsheetId: string): Promise<string> {
    try {
      logger.info(`Starting Apps Script attachment for spreadsheet: ${spreadsheetId}`);

      // 1. Create container-bound Apps Script project
      const projectId = await this.createBoundProject(spreadsheetId);
      logger.info(`Apps Script project created: ${projectId}`);

      // 2. Get code templates
      const gasCode = getGasCodeTemplate();
      const manifestJson = getAppsScriptManifest();

      logger.info('Code templates retrieved');

      // 3. Upload code files to project
      await this.uploadCode(projectId, [
        {
          name: 'Code',
          type: 'SERVER_JS',
          source: gasCode,
        },
        {
          name: 'appsscript',
          type: 'JSON',
          source: manifestJson,
        },
      ]);

      logger.info('Code files uploaded successfully');
      logger.info(`Apps Script attached to spreadsheet: ${spreadsheetId}`);

      return projectId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to attach Apps Script: ${errorMessage}`);
      throw new Error(`Failed to attach Apps Script to spreadsheet: ${errorMessage}`);
    }
  }

  /**
   * Creates a container-bound Apps Script project for a spreadsheet
   *
   * Container-bound scripts are tied to a specific Google Sheets document and
   * appear in the Extensions > Apps Script menu of that spreadsheet.
   *
   * @param spreadsheetId - The ID of the parent spreadsheet
   * @returns Promise resolving to the created project ID
   * @throws {Error} If project creation fails or spreadsheet is not accessible
   * @private
   */
  private async createBoundProject(spreadsheetId: string): Promise<string> {
    try {
      logger.info(`Creating container-bound Apps Script project for spreadsheet: ${spreadsheetId}`);

      // Create the container-bound project
      const response = await this.script.projects.create({
        requestBody: {
          title: 'Whitepaper AI Agent - Revision Handler',
          parentId: spreadsheetId,
        },
      });

      const scriptId = response.data.scriptId;
      if (!scriptId) {
        throw new Error('Failed to create Apps Script project: No script ID returned');
      }

      logger.info(`Container-bound project created with ID: ${scriptId}`);
      return scriptId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to create bound project: ${errorMessage}`);
      throw new Error(`Failed to create container-bound Apps Script project: ${errorMessage}`);
    }
  }

  /**
   * Uploads code files to an Apps Script project
   *
   * Replaces all existing files in the project with the provided files.
   * This is typically used to deploy initial code templates or update existing scripts.
   *
   * @param projectId - The Apps Script project ID
   * @param files - Array of script files to upload
   * @throws {Error} If upload fails or project is not accessible
   * @private
   *
   * @example
   * ```typescript
   * await this.uploadCode(projectId, [
   *   { name: 'Code', type: 'SERVER_JS', source: 'function test() {}' },
   *   { name: 'appsscript', type: 'JSON', source: '{"timeZone":"UTC"}' }
   * ]);
   * ```
   */
  private async uploadCode(projectId: string, files: ScriptFile[]): Promise<void> {
    try {
      logger.info(`Uploading ${files.length} files to project: ${projectId}`);

      // Get current project content
      const project = await this.script.projects.getContent({
        scriptId: projectId,
      });

      if (!project.data.files) {
        throw new Error('Failed to retrieve project files');
      }

      // Replace files with new content
      const updatedFiles = files.map((file) => ({
        name: file.name,
        type: file.type,
        source: file.source,
      }));

      await this.script.projects.updateContent({
        scriptId: projectId,
        requestBody: {
          files: updatedFiles,
        },
      });

      logger.info(`Successfully uploaded ${files.length} files`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to upload code: ${errorMessage}`);
      throw new Error(`Failed to upload code to Apps Script project: ${errorMessage}`);
    }
  }

  /**
   * Sets script properties for the Apps Script project
   *
   * Script properties are key-value pairs that persist across script executions.
   * Commonly used for API keys, configuration values, and secrets.
   *
   * Note: This requires the Apps Script API to support the properties endpoint.
   * For manual setup, users can set properties via:
   * Extensions > Apps Script > Project Settings > Script Properties
   *
   * @param projectId - The Apps Script project ID
   * @param properties - Object containing key-value pairs to set
   * @throws {Error} If property update fails
   *
   * @example
   * ```typescript
   * await gasService.setScriptProperties(projectId, {
   *   OPENAI_API_KEY: 'sk-...',
   *   OPENAI_MODEL: 'gpt-4'
   * });
   * ```
   */
  async setScriptProperties(
    projectId: string,
    properties: Record<string, string>
  ): Promise<void> {
    try {
      logger.info(`Setting script properties for project: ${projectId}`);
      logger.warn(
        'Script properties must be set manually via Apps Script editor: Extensions > Apps Script > Project Settings > Script Properties'
      );

      // Note: The Apps Script API doesn't provide a direct endpoint for script properties.
      // Properties must be set manually or via a deployment that includes them.
      // Log the properties that should be set:
      logger.info('Required script properties:');
      Object.entries(properties).forEach(([key, value]) => {
        logger.info(`  ${key}: ${value.substring(0, 10)}...`);
      });

      logger.info('Script properties logged (manual setup required)');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to set script properties: ${errorMessage}`);
      throw new Error(`Failed to set script properties: ${errorMessage}`);
    }
  }

  /**
   * Gets the Apps Script editor URL for manual access
   *
   * @param projectId - The Apps Script project ID
   * @returns The URL to access the project in the Apps Script editor
   *
   * @example
   * ```typescript
   * const url = gasService.getScriptEditorUrl(projectId);
   * console.log(`Edit script at: ${url}`);
   * // Output: https://script.google.com/d/abc123xyz/edit
   * ```
   */
  getScriptEditorUrl(projectId: string): string {
    return `https://script.google.com/d/${projectId}/edit`;
  }

  /**
   * Verifies that a spreadsheet exists and is accessible
   *
   * @param spreadsheetId - The spreadsheet ID to verify
   * @returns Promise resolving to true if accessible
   * @throws {Error} If spreadsheet is not found or not accessible
   *
   * @example
   * ```typescript
   * const isAccessible = await gasService.verifySpreadsheetAccess('1a2b3c4d5e6f7g8h9i');
   * console.log(`Spreadsheet accessible: ${isAccessible}`);
   * ```
   */
  async verifySpreadsheetAccess(spreadsheetId: string): Promise<boolean> {
    try {
      logger.info(`Verifying access to spreadsheet: ${spreadsheetId}`);

      const response = await this.drive.files.get({
        fileId: spreadsheetId,
        fields: 'id, name, mimeType',
      });

      if (response.data.mimeType !== 'application/vnd.google-apps.spreadsheet') {
        throw new Error('File is not a Google Spreadsheet');
      }

      logger.info(`Spreadsheet verified: ${response.data.name}`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to verify spreadsheet access: ${errorMessage}`);
      throw new Error(`Failed to verify spreadsheet access: ${errorMessage}`);
    }
  }
}

/**
 * Factory function to create a GasService instance from environment variables
 *
 * @returns Configured GasService instance
 * @throws {Error} If GOOGLE_APPLICATION_CREDENTIALS is not set
 *
 * @example
 * ```typescript
 * import { createGasService } from './services/gas.js';
 *
 * const gasService = createGasService();
 * await gasService.attachToSpreadsheet(spreadsheetId);
 * ```
 */
export function createGasService(): GasService {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!credentialsPath) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS environment variable is required');
  }

  return new GasService({ credentialsPath });
}
