/**
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
}

/**
 * Set OpenAI API Key
 */
function setApiKey() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Set OpenAI API Key',
    'Enter your OpenAI API Key (sk-...):',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() === ui.Button.OK) {
    const apiKey = response.getResponseText().trim();
    if (apiKey.startsWith('sk-')) {
      PropertiesService.getScriptProperties().setProperty('OPENAI_API_KEY', apiKey);
      ui.alert('Success', 'API Key saved successfully!', ui.ButtonSet.OK);
    } else {
      ui.alert('Error', 'Invalid API Key format. Must start with "sk-"', ui.ButtonSet.OK);
    }
  }
}

/**
 * Set OpenAI Model
 */
function setModel() {
  const ui = SpreadsheetApp.getUi();
  const currentModel = PropertiesService.getScriptProperties().getProperty('OPENAI_MODEL') || 'gpt-5-mini';

  const response = ui.prompt(
    'Set OpenAI Model',
    `Current model: ${currentModel}\\n\\nEnter model name (e.g., gpt-5-mini, gpt-5, gpt-4o):`,
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() === ui.Button.OK) {
    const model = response.getResponseText().trim();
    if (model) {
      PropertiesService.getScriptProperties().setProperty('OPENAI_MODEL', model);
      ui.alert('Success', `Model set to: ${model}`, ui.ButtonSet.OK);
    }
  }
}

/**
 * Main function: Rewrite all commented rows in batches
 */
function rewriteAllCommentedRows() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  try {
    logToBacklog('INFO', -1, 'START', 'Starting rewrite process', {});

    // 1. Detect source sheet (VERn or active sheet)
    const sourceSheet = detectSourceSheet(ss);
    const sourceSheetName = sourceSheet.getName();
    logToBacklog('INFO', -1, 'DETECTED', `Source sheet: ${sourceSheetName}`, {});

    // 2. Create destination sheet (VER(n+1))
    const destSheetName = generateNextVersion(sourceSheetName);
    let destSheet = ss.getSheetByName(destSheetName);

    if (destSheet) {
      destSheet.clear();
      logToBacklog('INFO', -1, 'CLEARED', `Existing sheet ${destSheetName} cleared`, {});
    } else {
      destSheet = ss.insertSheet(destSheetName);
      logToBacklog('INFO', -1, 'CREATED', `New sheet ${destSheetName} created`, {});
    }

    // 3. Get data from source sheet
    const dataRange = sourceSheet.getDataRange();
    const values = dataRange.getValues();

    if (values.length === 0) {
      throw new Error('Source sheet is empty');
    }

    // 4. Copy header row
    const headers = values[0];
    const commentColIndex = headers.length - 1; // 最右列がコメント列
    destSheet.appendRow(headers);

    const headerRange = destSheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#1a1a1a');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');

    logToBacklog('INFO', -1, 'HEADERS', `Headers copied (${headers.length} columns)`, { headers });

    // 5. Collect commented rows
    const commentedRows = [];

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const comment = row[commentColIndex];

      if (comment && comment.toString().trim() !== '') {
        commentedRows.push({
          rowIndex: i + 1,
          row: row,
          comment: comment.toString().trim()
        });
      }
    }

    logToBacklog('INFO', -1, 'COLLECTED', `Found ${commentedRows.length} commented rows`, {
      totalRows: values.length - 1,
      commentedRows: commentedRows.length
    });

    // 6. Process in batches
    const batches = chunkArray(commentedRows, BATCH_SIZE);
    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalFailed = 0;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];

      logToBacklog('INFO', batchIndex, 'BATCH_START', `Processing batch ${batchIndex + 1}/${batches.length}`, {
        batchSize: batch.length,
        rowIndexes: batch.map(r => r.rowIndex)
      });

      try {
        // Call OpenAI API for this batch
        const batchResult = callOpenAIBatch(batch, headers);

        logToBacklog('API_RESPONSE', batchIndex, 'SUCCESS', 'Batch processed successfully', {
          rowsProcessed: batchResult.rows.length
        });

        // Apply results
        for (const revisedRow of batchResult.rows) {
          const originalRowData = batch.find(b => b.rowIndex === revisedRow.row_index);
          if (!originalRowData) continue;

          // Build revised row array
          const newRow = headers.map((header) => {
            const key = header.toString().trim();
            return revisedRow[key] !== undefined ? revisedRow[key] : '';
          });

          destSheet.appendRow(newRow);
          const destRowIndex = destSheet.getLastRow();

          // Apply diff highlighting
          applyDiffHighlighting(sourceSheet, destSheet, originalRowData.rowIndex, destRowIndex, headers.length);

          totalSuccess++;
        }

        totalProcessed += batch.length;

      } catch (error) {
        logToBacklog('ERROR', batchIndex, 'FAILED', `Batch failed: ${error.message}`, {
          error: error.toString(),
          stack: error.stack
        });

        // Copy original rows on error
        for (const item of batch) {
          destSheet.appendRow(item.row);
          totalFailed++;
        }

        totalProcessed += batch.length;
      }
    }

    // 7. Copy non-commented rows as-is
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const comment = row[commentColIndex];

      if (!comment || comment.toString().trim() === '') {
        destSheet.appendRow(row);
      }
    }

    logToBacklog('INFO', -1, 'COMPLETED', 'Rewrite process completed', {
      totalProcessed,
      totalSuccess,
      totalFailed
    });

    ui.alert(
      'Completed',
      `Rewrite completed!\\n\\nProcessed: ${totalProcessed}\\nSuccess: ${totalSuccess}\\nFailed: ${totalFailed}\\n\\nNew sheet: ${destSheetName}`,
      ui.ButtonSet.OK
    );

  } catch (error) {
    logToBacklog('ERROR', -1, 'FATAL', `Fatal error: ${error.message}`, {
      error: error.toString(),
      stack: error.stack
    });

    ui.alert('Error', `Rewrite failed: ${error.message}`, ui.ButtonSet.OK);
    throw error;
  }
}

/**
 * Detect source sheet (highest VERn or active sheet)
 */
function detectSourceSheet(ss) {
  const sheets = ss.getSheets();
  let highestVer = 0;
  let highestVerSheet = null;

  for (const sheet of sheets) {
    const name = sheet.getName();
    const match = name.match(/^VER(\\d+)$/i);

    if (match) {
      const ver = parseInt(match[1]);
      if (ver > highestVer) {
        highestVer = ver;
        highestVerSheet = sheet;
      }
    }
  }

  return highestVerSheet || ss.getActiveSheet();
}

/**
 * Generate next version sheet name
 */
function generateNextVersion(currentName) {
  const match = currentName.match(/^VER(\\d+)$/i);

  if (match) {
    const currentVer = parseInt(match[1]);
    return `VER${currentVer + 1}`;
  }

  return 'VER2'; // If not VERn, next is VER2
}

/**
 * Call OpenAI API for a batch of rows
 */
function callOpenAIBatch(batch, headers) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OpenAI API Key not set. Please use "Set API Key" menu.');
  }

  const model = PropertiesService.getScriptProperties().getProperty('OPENAI_MODEL') || 'gpt-5-mini';

  // Build JSON Schema dynamically
  const schema = buildJsonSchema(headers);

  // Build system prompt
  const systemPrompt = `あなたはエンタープライズ向けビジネス文書のリライト専門家です。

**役割:**
- クライアントのコメントに基づいて、ホワイトペーパー企画書の内容を改稿する
- コメントの指示を最優先で積極的に反映する
- 「もっと○○」という指示は、明確に変化が分かるレベルで対応する
- ビジネス文書として自然で読みやすい文体を維持する

**重要な原則:**
1. コメントがない列は変更しない
2. コメントの指示内容を最大限反映する
3. 元の文脈や意図は保持しつつ、指示に沿って改稿する
4. 専門用語は適切に使用する
5. 読み手に伝わりやすい文章にする`;

  // Build user prompt
  const userPrompt = `以下の${batch.length}行分のデータをコメントに基づいて改稿してください。

**データ:**
${batch.map((item, idx) => {
  const rowData = headers.map((h, i) => `${h}: ${item.row[i] || 'N/A'}`).join('\\n');
  return `【行${idx + 1}】(元の行番号: ${item.rowIndex})\\nコメント: ${item.comment}\\n${rowData}`;
}).join('\\n\\n')}

**指示:**
- 各行のコメントに従って内容を改稿してください
- コメントがない列は元のまま返してください
- 返却形式は指定されたJSON Schemaに従ってください
- 必ずrow_indexを含めてください`;

  // Prepare request payload
  const payload = {
    model: model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'whitepaper_rewrite',
        strict: true,
        schema: schema
      }
    },
    temperature: 0.7,
    reasoning_effort: 'low'
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
    timeout: 300000 // 5分
  };

  // Log request
  logToBacklog('API_REQUEST', -1, 'SENDING', 'Sending request to OpenAI', {
    model,
    batchSize: batch.length,
    headers: headers.length
  });

  const response = UrlFetchApp.fetch(OPENAI_API_URL, options);
  const statusCode = response.getResponseCode();
  const responseText = response.getContentText();

  if (statusCode >= 300) {
    throw new Error(`OpenAI API error (${statusCode}): ${responseText}`);
  }

  const result = JSON.parse(responseText);

  if (!result.choices || !result.choices[0] || !result.choices[0].message) {
    throw new Error('Invalid API response structure');
  }

  const content = JSON.parse(result.choices[0].message.content);

  return content;
}

/**
 * Build JSON Schema dynamically from headers
 */
function buildJsonSchema(headers) {
  const properties = {
    row_index: { type: 'integer' }
  };

  for (const header of headers) {
    const key = header.toString().trim();
    properties[key] = { type: 'string' };
  }

  return {
    type: 'object',
    required: ['rows'],
    properties: {
      rows: {
        type: 'array',
        items: {
          type: 'object',
          required: ['row_index'],
          properties: properties
        }
      }
    },
    additionalProperties: false
  };
}

/**
 * Apply diff highlighting (red text for added content)
 */
function applyDiffHighlighting(sourceSheet, destSheet, sourceRow, destRow, colCount) {
  const sourceRange = sourceSheet.getRange(sourceRow, 1, 1, colCount);
  const destRange = destSheet.getRange(destRow, 1, 1, colCount);

  const sourceValues = sourceRange.getValues()[0];
  const destValues = destRange.getValues()[0];

  for (let col = 0; col < colCount; col++) {
    const originalText = sourceValues[col] ? sourceValues[col].toString() : '';
    const revisedText = destValues[col] ? destValues[col].toString() : '';

    if (originalText !== revisedText) {
      const richText = createDiffRichText(originalText, revisedText);
      destSheet.getRange(destRow, col + 1).setRichTextValue(richText);
    }
  }
}

/**
 * Create RichTextValue with diff highlighting (added text in red)
 */
function createDiffRichText(original, revised) {
  const redStyle = SpreadsheetApp.newTextStyle()
    .setForegroundColor('#FF0000')
    .build();

  const builder = SpreadsheetApp.newRichTextValue().setText(revised);

  // Simple diff: find added characters (LCS-based)
  const diff = computeSimpleDiff(original, revised);

  for (const segment of diff) {
    if (segment.type === 'insert') {
      builder.setTextStyle(segment.start, segment.end, redStyle);
    }
  }

  return builder.build();
}

/**
 * Compute simple character-level diff (LCS-based)
 */
function computeSimpleDiff(str1, str2) {
  // Simplified diff: highlight entire revised text if different
  // For production, implement proper LCS algorithm
  if (str1 === str2) {
    return [];
  }

  // For now, highlight entire text in red if changed
  return [{ type: 'insert', start: 0, end: str2.length }];
}

/**
 * Chunk array into batches
 */
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Log to Backlog sheet
 */
function logToBacklog(type, batchIndex, status, message, details) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let backlogSheet = ss.getSheetByName('Backlog');

  if (!backlogSheet) {
    backlogSheet = ss.insertSheet('Backlog');

    // Set headers
    backlogSheet.getRange(1, 1, 1, 6).setValues([[
      'Timestamp',
      'Type',
      'Batch Index',
      'Status',
      'Message',
      'Details'
    ]]);

    const headerRange = backlogSheet.getRange(1, 1, 1, 6);
    headerRange.setBackground('#1a1a1a');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');
  }

  const timestamp = new Date();
  const detailsJson = JSON.stringify(details);

  backlogSheet.appendRow([
    timestamp,
    type,
    batchIndex,
    status,
    message,
    detailsJson
  ]);

  // Format timestamp
  const lastRow = backlogSheet.getLastRow();
  backlogSheet.getRange(lastRow, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
}

/**
 * View Backlog sheet
 */
function viewBacklog() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const backlogSheet = ss.getSheetByName('Backlog');

  if (!backlogSheet) {
    const ui = SpreadsheetApp.getUi();
    ui.alert('Info', 'No backlog yet. Run rewrite first.', ui.ButtonSet.OK);
    return;
  }

  ss.setActiveSheet(backlogSheet);
}
