/**
 * Google Apps Script Code Template
 * Provides the template code for spreadsheet-bound GAS that implements
 * client feedback revision functionality with LLM integration
 */

/**
 * Gets the complete Google Apps Script code template for whitepaper revision
 *
 * This template includes:
 * - Custom menu integration in Google Sheets
 * - Client feedback processing from v1 sheet
 * - LLM-powered content revision
 * - v2 sheet creation with highlighted differences
 * - Error handling and logging
 *
 * @returns The complete GAS code as a string
 *
 * @example
 * ```typescript
 * import { getGasCodeTemplate } from './templates/gas-code.js';
 *
 * const gasCode = getGasCodeTemplate();
 * // Upload to Apps Script project
 * ```
 */
export function getGasCodeTemplate(): string {
  return `/**
 * Whitepaper Rewriter - Google Apps Script
 *
 * スプレッドシートにバインドされたGASで、コメント行を元にOpenAI APIでAIリライトし、
 * VER(n+1)タブに差分ハイライト付きで出力するツール
 */

// Configuration
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const BATCH_SIZE = 5; // 5行ずつバッチ処理
const MENU_TITLE = 'Whitepaper Rewriter';

/**
 * Creates custom menu when spreadsheet opens
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu(MENU_TITLE)
    .addItem('🔄 Rewrite all commented rows (batch: 5)', 'rewriteAllCommentedRows')
    .addItem('⚙️ Set API Key', 'setApiKey')
    .addItem('🔧 Set Model', 'setModel')
    .addItem('📊 View Backlog', 'viewBacklog')
    .addToUi();

  Logger.log('Custom menu "Whitepaper Rewriter" created successfully');
}

/**
 * Main function: Applies client feedback to create v2 sheet
 *
 * Process:
 * 1. Retrieves v1 sheet (source)
 * 2. Creates or clears v2 sheet (destination)
 * 3. Finds rows with client comments
 * 4. Sends comments to LLM for revision
 * 5. Writes revised content to v2
 * 6. Highlights differences in red
 *
 * @throws {Error} If v1 sheet doesn't exist or API key is not configured
 */
function applyClientFeedback() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  try {
    Logger.log('=== Starting Client Feedback Application ===');

    // 1. Get v1 sheet (source data)
    const sheetV1 = ss.getSheetByName('Whitepaper Plans');
    if (!sheetV1) {
      throw new Error('Sheet "Whitepaper Plans" not found. Please ensure v1 sheet exists.');
    }

    Logger.log('v1 sheet found: ' + sheetV1.getName());

    // 2. Create or get v2 sheet
    let sheetV2 = ss.getSheetByName('Whitepaper Plans v2');
    if (sheetV2) {
      Logger.log('v2 sheet exists, clearing contents');
      sheetV2.clear();
    } else {
      Logger.log('Creating new v2 sheet');
      sheetV2 = ss.insertSheet('Whitepaper Plans v2');
    }

    // Get data from v1
    const dataRange = sheetV1.getDataRange();
    const values = dataRange.getValues();

    if (values.length === 0) {
      throw new Error('v1 sheet is empty. No data to process.');
    }

    Logger.log(\`Retrieved \${values.length} rows from v1 sheet\`);

    // Copy header row
    const headers = values[0];
    const commentColIndex = headers.indexOf('コメント');

    // If comment column doesn't exist, add it
    let finalHeaders = headers;
    if (commentColIndex === -1) {
      finalHeaders = [...headers, 'コメント'];
      Logger.log('Comment column not found, adding to headers');
    }

    sheetV2.appendRow(finalHeaders);
    Logger.log('Headers copied to v2');

    // Format header row in v2
    const headerRange = sheetV2.getRange(1, 1, 1, finalHeaders.length);
    headerRange.setBackground('#333333');
    headerRange.setFontColor('#FFFFFF');
    headerRange.setFontWeight('bold');

    // 3. Process each data row
    let processedCount = 0;
    let revisedCount = 0;

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const comment = commentColIndex !== -1 ? row[commentColIndex] : '';

      Logger.log(\`Processing row \${i + 1}...\`);

      if (comment && comment.toString().trim() !== '') {
        Logger.log(\`Row \${i + 1} has comment: "\${comment}"\`);

        try {
          // 4. Send to LLM for revision
          const revisedRow = callLLMForRevision(row, comment.toString(), headers);

          // 5. Write revised content to v2
          sheetV2.appendRow(revisedRow);

          // 6. Highlight differences
          highlightDifferences(sheetV1, sheetV2, i + 1, sheetV2.getLastRow(), finalHeaders.length);

          revisedCount++;
          Logger.log(\`Row \${i + 1} revised successfully\`);
        } catch (error) {
          Logger.log(\`Error revising row \${i + 1}: \${error.message}\`);
          // Copy original row on error
          sheetV2.appendRow(row);
        }
      } else {
        // No comment, copy row as-is
        sheetV2.appendRow(row);
        Logger.log(\`Row \${i + 1} copied without revision (no comment)\`);
      }

      processedCount++;
    }

    Logger.log(\`=== Completed: \${processedCount} rows processed, \${revisedCount} rows revised ===\`);

    // Show completion message
    SpreadsheetApp.getUi().alert(
      '完了',
      \`v2シートを作成しました。\\n処理行数: \${processedCount}\\n改稿行数: \${revisedCount}\`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );

  } catch (error) {
    Logger.log('ERROR: ' + error.message);
    SpreadsheetApp.getUi().alert('エラー', error.message, SpreadsheetApp.getUi().ButtonSet.OK);
    throw error;
  }
}

/**
 * Calls LLM API to revise content based on client comment
 *
 * @param {Array} row - Original row data
 * @param {string} comment - Client feedback comment
 * @param {Array} headers - Column headers
 * @returns {Array} Revised row data
 * @throws {Error} If API call fails or API key is not configured
 *
 * @private
 */
function callLLMForRevision(row, comment, headers) {
  Logger.log('Calling LLM for revision...');

  // Get API configuration from Script Properties
  const apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured. Please set it in Script Properties.');
  }

  const model = PropertiesService.getScriptProperties().getProperty('OPENAI_MODEL') || 'gpt-4';

  // Build context from row data
  const rowContext = headers.map((header, index) => {
    return \`\${header}: \${row[index] || 'N/A'}\`;
  }).join('\\n');

  // Construct prompt
  const systemPrompt = \`You are an expert whitepaper editor. Your task is to revise whitepaper content based on client feedback while maintaining professionalism, clarity, and accuracy.

Key responsibilities:
- Understand the client's feedback and intent
- Revise the content appropriately
- Maintain the original structure and format
- Keep the tone professional and appropriate for the target audience
- Only modify fields that are relevant to the feedback

Return the revised content as a JSON object with the same structure as the input.\`;

  const userPrompt = \`Please revise the following whitepaper content based on the client comment.

## Original Content
\${rowContext}

## Client Comment
\${comment}

## Instructions
Revise the relevant fields based on the comment. Return a JSON object with the same fields as the original content. Only modify the fields that need to be changed based on the comment.

Return format:
{
  "title": "revised or original title",
  "section": "revised or original section",
  "content": "revised or original content",
  "keywords": "revised or original keywords",
  "targetAudience": "revised or original target audience",
  "estimatedPages": "revised or original estimated pages",
  "priority": "revised or original priority",
  "status": "revised or original status"
}\`;

  // Call OpenAI API
  const url = 'https://api.openai.com/v1/chat/completions';
  const payload = {
    model: model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.7,
    max_completion_tokens: 2000,
    response_format: { type: 'json_object' }
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + apiKey
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();

    if (responseCode !== 200) {
      throw new Error(\`API request failed with status \${responseCode}: \${response.getContentText()}\`);
    }

    const result = JSON.parse(response.getContentText());

    if (!result.choices || !result.choices[0] || !result.choices[0].message) {
      throw new Error('Invalid API response structure');
    }

    const revisedContent = JSON.parse(result.choices[0].message.content);
    Logger.log('LLM revision successful');

    // Map revised content back to row format
    const revisedRow = headers.map((header) => {
      const key = header.toLowerCase().replace(/\\s+/g, '');

      switch (header) {
        case 'Title':
          return revisedContent.title || row[headers.indexOf('Title')];
        case 'Section':
          return revisedContent.section || row[headers.indexOf('Section')];
        case 'Content':
          return revisedContent.content || row[headers.indexOf('Content')];
        case 'Keywords':
          return revisedContent.keywords || row[headers.indexOf('Keywords')];
        case 'Target Audience':
          return revisedContent.targetAudience || row[headers.indexOf('Target Audience')];
        case 'Estimated Pages':
          return revisedContent.estimatedPages || row[headers.indexOf('Estimated Pages')];
        case 'Priority':
          return revisedContent.priority || row[headers.indexOf('Priority')];
        case 'Status':
          return 'revised';
        case 'コメント':
          return comment;
        default:
          const headerIndex = headers.indexOf(header);
          return headerIndex !== -1 ? row[headerIndex] : '';
      }
    });

    return revisedRow;

  } catch (error) {
    Logger.log('LLM API Error: ' + error.message);
    throw new Error(\`Failed to call LLM API: \${error.message}\`);
  }
}

/**
 * Highlights differences between v1 and v2 sheets
 * Compares cells and applies red background to changed cells in v2
 *
 * @param {Sheet} sheetV1 - Source sheet (v1)
 * @param {Sheet} sheetV2 - Destination sheet (v2)
 * @param {number} rowV1 - Row number in v1 sheet (1-indexed)
 * @param {number} rowV2 - Row number in v2 sheet (1-indexed)
 * @param {number} colCount - Number of columns to compare
 *
 * @private
 */
function highlightDifferences(sheetV1, sheetV2, rowV1, rowV2, colCount) {
  Logger.log(\`Highlighting differences for v1 row \${rowV1} vs v2 row \${rowV2}\`);

  try {
    const rangeV1 = sheetV1.getRange(rowV1, 1, 1, colCount);
    const rangeV2 = sheetV2.getRange(rowV2, 1, 1, colCount);

    const valuesV1 = rangeV1.getValues()[0];
    const valuesV2 = rangeV2.getValues()[0];

    let changedCount = 0;

    for (let col = 0; col < colCount; col++) {
      const valueV1 = valuesV1[col] ? valuesV1[col].toString().trim() : '';
      const valueV2 = valuesV2[col] ? valuesV2[col].toString().trim() : '';

      if (valueV1 !== valueV2) {
        // Highlight changed cell in red
        const cell = sheetV2.getRange(rowV2, col + 1);
        cell.setBackground('#ffcccc'); // Light red background
        changedCount++;
      }
    }

    Logger.log(\`Highlighted \${changedCount} changed cells\`);

  } catch (error) {
    Logger.log(\`Error highlighting differences: \${error.message}\`);
    // Non-critical error, don't throw
  }
}

/**
 * Test function for LLM API connectivity
 * Can be run manually to verify API configuration
 */
function testLLMConnection() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');

  if (!apiKey) {
    Logger.log('ERROR: OPENAI_API_KEY not configured');
    return;
  }

  Logger.log('Testing LLM API connection...');

  const testRow = ['Test Title', 'Section 1', 'Test content', 'keyword1, keyword2', 'Test Audience', '5', '1', 'draft'];
  const testComment = 'Please make it more concise';
  const testHeaders = ['Title', 'Section', 'Content', 'Keywords', 'Target Audience', 'Estimated Pages', 'Priority', 'Status'];

  try {
    const result = callLLMForRevision(testRow, testComment, testHeaders);
    Logger.log('SUCCESS: LLM API connection successful');
    Logger.log('Result: ' + JSON.stringify(result));
  } catch (error) {
    Logger.log('ERROR: ' + error.message);
  }
}
`;
}

/**
 * Gets the appsscript.json manifest configuration
 *
 * Defines the required OAuth scopes and runtime version for the Apps Script project
 *
 * @returns The appsscript.json content as a string
 *
 * @example
 * ```typescript
 * import { getAppsScriptManifest } from './templates/gas-code.js';
 *
 * const manifest = getAppsScriptManifest();
 * // Upload as appsscript.json
 * ```
 */
export function getAppsScriptManifest(): string {
  return JSON.stringify(
    {
      timeZone: 'Asia/Tokyo',
      dependencies: {},
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
  );
}
