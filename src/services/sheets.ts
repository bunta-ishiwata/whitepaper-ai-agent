import { google, sheets_v4, Auth } from 'googleapis';
import { WhitepaperPlan } from '../types/index.js';

/**
 * Google Sheets Service
 * Manages spreadsheet creation, data writing, and folder organization for whitepaper plans
 */
export class SheetsService {
  private sheets: sheets_v4.Sheets;
  private auth: Auth.OAuth2Client | Auth.GoogleAuth;

  /**
   * Initializes the SheetsService with Google API credentials
   * @param auth - Optional OAuth2Client for user authentication. If not provided, uses service account.
   * @throws {Error} If authentication fails or credentials are invalid
   */
  constructor(auth?: Auth.OAuth2Client) {
    if (auth) {
      // Use user's OAuth2 credentials
      this.auth = auth;
      this.sheets = google.sheets({ version: 'v4', auth });
    } else {
      // Fallback to service account for backward compatibility
      const serviceAuth = new google.auth.GoogleAuth({
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        scopes: [
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive',
        ],
      });
      this.auth = serviceAuth;
      this.sheets = google.sheets({ version: 'v4', auth: serviceAuth });
    }
  }

  /**
   * Creates a new spreadsheet with the specified title
   * @param title - The title of the spreadsheet to create
   * @returns Promise resolving to an object with spreadsheetId and sheetId
   * @throws {Error} If spreadsheet creation fails
   * @example
   * ```typescript
   * const service = new SheetsService();
   * const { spreadsheetId, sheetId } = await service.createSpreadsheet('Whitepaper Plan 2025');
   * console.log(`Created spreadsheet: ${spreadsheetId}, sheet: ${sheetId}`);
   * ```
   */
  async createSpreadsheet(title: string): Promise<{ spreadsheetId: string; sheetId: number }> {
    try {
      const response = await this.sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title,
          },
          sheets: [
            {
              properties: {
                title: 'VER1',
                gridProperties: {
                  rowCount: 1000,
                  columnCount: 10,
                  frozenRowCount: 1,
                },
              },
            },
          ],
        },
      });

      const spreadsheetId = response.data.spreadsheetId;
      if (!spreadsheetId) {
        throw new Error('Failed to create spreadsheet: No ID returned');
      }

      const sheetId = response.data.sheets?.[0]?.properties?.sheetId;
      if (sheetId === undefined || sheetId === null) {
        throw new Error('Failed to get sheet ID from created spreadsheet');
      }

      return { spreadsheetId, sheetId };
    } catch (error) {
      throw new Error(
        `Failed to create spreadsheet: ${(error as Error).message}`
      );
    }
  }

  /**
   * Writes whitepaper plan data to the specified spreadsheet
   * @param spreadsheetId - The ID of the target spreadsheet
   * @param plans - Array of whitepaper plans to write
   * @param sheetId - The ID of the sheet within the spreadsheet
   * @returns Promise that resolves when data is successfully written
   * @throws {Error} If writing data fails or spreadsheet is not found
   * @example
   * ```typescript
   * const plans: WhitepaperPlan[] = [{
   *   title: 'Introduction',
   *   section: '1.0',
   *   content: 'Overview of the topic',
   *   keywords: ['intro', 'overview'],
   *   targetAudience: 'Technical readers',
   *   estimatedPages: 2,
   *   priority: 1,
   *   status: 'draft',
   *   createdAt: new Date(),
   *   updatedAt: new Date()
   * }];
   * await service.writeData(spreadsheetId, plans, sheetId);
   * ```
   */
  async writeData(
    spreadsheetId: string,
    plans: WhitepaperPlan[],
    sheetId: number
  ): Promise<void> {
    try {
      // Prepare header row
      const headers = [
        'No',
        'タイトル',
        '目的',
        '内容（概要）',
        '感情的ニーズ',
        '機能的ニーズ',
        '成果的ニーズ',
        'ニーズ（複数）',
        'ターゲット',
        '職種／部署',
        'レベル',
        '構成',
        'コメント',
      ];

      // Prepare data rows
      const rows = plans.map((plan) => [
        plan.no.toString(),
        plan.タイトル,
        plan.目的,
        plan.内容概要,
        plan.感情的ニーズ,
        plan.機能的ニーズ,
        plan.成果的ニーズ,
        plan.ニーズ複数,
        plan.ターゲット,
        plan.職種部署,
        plan.レベル,
        plan.構成,
        plan.コメント,
      ]);

      // Combine headers and data
      const values = [headers, ...rows];

      await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'VER1!A1',
        valueInputOption: 'RAW',
        requestBody: {
          values,
        },
      });

      // Calculate the total number of rows needed (header + data rows)
      const totalRows = 1 + plans.length;

      // Format header row and delete empty rows
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId: sheetId,
                  startRowIndex: 0,
                  endRowIndex: 1,
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: {
                      red: 0.2,
                      green: 0.2,
                      blue: 0.2,
                    },
                    textFormat: {
                      foregroundColor: {
                        red: 1,
                        green: 1,
                        blue: 1,
                      },
                      bold: true,
                    },
                  },
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat)',
              },
            },
            {
              deleteDimension: {
                range: {
                  sheetId: sheetId,
                  dimension: 'ROWS',
                  startIndex: totalRows,
                  endIndex: 1000, // Delete from totalRows to the default 1000 rows
                },
              },
            },
          ],
        },
      });
    } catch (error) {
      throw new Error(`Failed to write data: ${(error as Error).message}`);
    }
  }

  /**
   * Moves the spreadsheet to a specified Google Drive folder
   * @param spreadsheetId - The ID of the spreadsheet to move
   * @param folderId - The ID of the destination folder
   * @returns Promise that resolves when the move operation completes
   * @throws {Error} If the move operation fails or folder is not found
   * @example
   * ```typescript
   * const folderId = '1a2b3c4d5e6f7g8h9i';
   * await service.moveToFolder(spreadsheetId, folderId);
   * console.log('Spreadsheet moved to folder successfully');
   * ```
   */
  async moveToFolder(spreadsheetId: string, folderId: string): Promise<void> {
    try {
      const drive = google.drive({ version: 'v3', auth: this.auth });

      // Get current parents
      const file = await drive.files.get({
        fileId: spreadsheetId,
        fields: 'parents',
      });

      const previousParents = file.data.parents?.join(',');

      // Move to new folder
      await drive.files.update({
        fileId: spreadsheetId,
        addParents: folderId,
        removeParents: previousParents,
        fields: 'id, parents',
      });
    } catch (error) {
      throw new Error(
        `Failed to move spreadsheet to folder: ${(error as Error).message}`
      );
    }
  }

  /**
   * Generates the URL for accessing a spreadsheet
   * @param spreadsheetId - The ID of the spreadsheet
   * @returns The full URL to access the spreadsheet in Google Sheets
   * @example
   * ```typescript
   * const url = service.getSpreadsheetUrl(spreadsheetId);
   * console.log(`View spreadsheet at: ${url}`);
   * // Output: https://docs.google.com/spreadsheets/d/abc123xyz/edit
   * ```
   */
  getSpreadsheetUrl(spreadsheetId: string): string {
    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  }
}
