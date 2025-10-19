import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AppsScriptService {
  private oauth2Client: any;
  private script: any;

  constructor(oauth2Client: any) {
    this.oauth2Client = oauth2Client;
    this.script = google.script({ version: 'v1', auth: oauth2Client });
  }

  /**
   * Create and bind GAS to a spreadsheet
   * Note: The GAS code calls Backend API for OpenAI processing
   */
  async createAndBindScript(
    spreadsheetId: string,
    backendApiUrl: string
  ): Promise<{ scriptId: string; projectUrl: string }> {
    try {
      console.log(`Creating Apps Script project for spreadsheet ${spreadsheetId}...`);

      // Read GAS code from file (using .js version)
      const gasCodePath = path.join(__dirname, '..', 'gas', 'Code.js');
      let gasCode = await fs.readFile(gasCodePath, 'utf-8');

      // Replace placeholder with actual backend API URL
      gasCode = gasCode.replace('BACKEND_URL_PLACEHOLDER', backendApiUrl);

      // Create container-bound script
      const createResponse = await this.script.projects.create({
        requestBody: {
          title: 'Whitepaper Rewriter',
          parentId: spreadsheetId,
        },
      });

      const scriptId = createResponse.data.scriptId;
      console.log(`Created script project: ${scriptId}`);

      // Update script content
      await this.script.projects.updateContent({
        scriptId,
        requestBody: {
          files: [
            {
              name: 'Code',
              type: 'SERVER_JS',
              source: gasCode,
            },
            {
              name: 'appsscript',
              type: 'JSON',
              source: JSON.stringify(
                {
                  timeZone: 'Asia/Tokyo',
                  exceptionLogging: 'STACKDRIVER',
                  runtimeVersion: 'V8',
                  oauthScopes: [
                    'https://www.googleapis.com/auth/spreadsheets.currentonly',
                    'https://www.googleapis.com/auth/spreadsheets',
                    'https://www.googleapis.com/auth/script.external_request',
                  ],
                },
                null,
                2
              ),
            },
          ],
        },
      });

      console.log('Script content updated');

      const projectUrl = `https://script.google.com/d/${scriptId}/edit`;

      return {
        scriptId,
        projectUrl,
      };
    } catch (error: any) {
      console.error('Failed to create and bind script:', error.message);

      // Handle specific errors
      if (error.code === 403) {
        throw new Error('権限がありません。Apps Script APIが有効になっているか確認してください。');
      }

      if (error.code === 404) {
        throw new Error('スプレッドシートが見つかりません。');
      }

      throw new Error(`GASバインドエラー: ${error.message}`);
    }
  }

  /**
   * Check if a spreadsheet already has a bound script
   */
  async getBoundScript(spreadsheetId: string): Promise<string | null> {
    try {
      // Try to get the bound script using Drive API
      const drive = google.drive({ version: 'v3', auth: this.oauth2Client });

      const response = await drive.files.list({
        q: `'${spreadsheetId}' in parents and mimeType='application/vnd.google-apps.script'`,
        fields: 'files(id, name)',
        pageSize: 1,
      });

      if (response.data.files && response.data.files.length > 0) {
        return response.data.files[0]?.id || null;
      }

      return null;
    } catch (error: any) {
      console.error('Failed to check bound script:', error.message);
      return null;
    }
  }

  /**
   * Update backend API URL in existing script
   * @deprecated This method is no longer used as GAS now calls OpenAI API directly
   */
  async updateBackendUrl(_scriptId: string, _newBackendUrl: string): Promise<void> {
    console.warn('updateBackendUrl is deprecated: GAS now calls OpenAI API directly');
    // No-op - kept for backward compatibility
  }

  /**
   * Delete a script project
   */
  async deleteScript(scriptId: string): Promise<void> {
    try {
      // Use Drive API to trash the script file
      const drive = google.drive({ version: 'v3', auth: this.oauth2Client });

      await drive.files.delete({ fileId: scriptId });

      console.log(`Deleted script ${scriptId}`);
    } catch (error: any) {
      console.error('Failed to delete script:', error.message);
      throw new Error(`Script削除エラー: ${error.message}`);
    }
  }
}
