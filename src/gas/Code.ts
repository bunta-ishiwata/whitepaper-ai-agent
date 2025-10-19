/**
 * Whitepaper Rewriter - Google Apps Script
 *
 * スプレッドシートにバインドされたGASで、コメント行を元にOpenAI APIでAIリライトし、
 * VER(n+1)タブに差分ハイライト付きで出力するツール
 */

// Configuration
const BACKEND_API_URL = 'BACKEND_URL_PLACEHOLDER'; // Will be replaced during deployment
const BATCH_SIZE = 5; // 5行ずつバッチ処理
const MENU_TITLE = 'Whitepaper Rewriter';

/**
 * Creates custom menu when spreadsheet opens
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu(MENU_TITLE)
    .addItem('🔄 Rewrite all commented rows (batch: 5)', 'rewriteAllCommentedRows')
    .addItem('📋 View Backlog', 'viewBacklog')
    .addToUi();
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
    const commentedRows: Array<{rowIndex: number, row: any[], comment: string}> = [];

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
        // Call Backend API for this batch
        const batchResult = callBackendAPIBatch(batch, headers);

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

      } catch (error: any) {
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

    // 8. Delete empty rows and columns
    const totalRows = destSheet.getLastRow();
    const totalCols = headers.length;
    const maxRows = destSheet.getMaxRows();
    const maxCols = destSheet.getMaxColumns();

    // Delete empty rows (from totalRows+1 to maxRows)
    if (maxRows > totalRows) {
      destSheet.deleteRows(totalRows + 1, maxRows - totalRows);
      logToBacklog('INFO', -1, 'CLEANUP', 'Deleted empty rows', {
        deletedRows: maxRows - totalRows
      });
    }

    // Delete empty columns (from totalCols+1 to maxCols)
    if (maxCols > totalCols) {
      destSheet.deleteColumns(totalCols + 1, maxCols - totalCols);
      logToBacklog('INFO', -1, 'CLEANUP', 'Deleted empty columns', {
        deletedColumns: maxCols - totalCols
      });
    }

    logToBacklog('INFO', -1, 'COMPLETED', 'Rewrite process completed', {
      totalProcessed,
      totalSuccess,
      totalFailed
    });

    ui.alert(
      'Completed',
      `Rewrite completed!\n\nProcessed: ${totalProcessed}\nSuccess: ${totalSuccess}\nFailed: ${totalFailed}\n\nNew sheet: ${destSheetName}`,
      ui.ButtonSet.OK
    );

  } catch (error: any) {
    logToBacklog('ERROR', -1, 'FATAL', `Fatal error: ${error.message}`, {
      error: error.toString(),
      stack: error.stack
    });

    ui.alert('Error', `Rewrite failed: ${error.message}`, ui.ButtonSet.OK);
    throw error;
  }
}

/**
 * Detect source sheet (highest VERn or Whitepaper Plans)
 */
function detectSourceSheet(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): GoogleAppsScript.Spreadsheet.Sheet {
  const sheets = ss.getSheets();
  let highestVer = 0;
  let highestVerSheet: GoogleAppsScript.Spreadsheet.Sheet | null = null;
  let whitepaperPlansSheet: GoogleAppsScript.Spreadsheet.Sheet | null = null;

  for (const sheet of sheets) {
    const name = sheet.getName();

    // Check for VERn pattern
    const match = name.match(/^VER(\d+)$/i);
    if (match) {
      const ver = parseInt(match[1]);
      if (ver > highestVer) {
        highestVer = ver;
        highestVerSheet = sheet;
      }
    }

    // Check for "Whitepaper Plans" sheet
    if (name === 'Whitepaper Plans') {
      whitepaperPlansSheet = sheet;
    }
  }

  // Priority: highest VERn > VER1 > first sheet (excluding Backlog)
  if (highestVerSheet) {
    return highestVerSheet;
  }

  if (whitepaperPlansSheet) {
    return whitepaperPlansSheet;
  }

  // Look for VER1 explicitly
  for (const sheet of sheets) {
    if (sheet.getName() === 'VER1') {
      return sheet;
    }
  }

  // Return first sheet that is not Backlog
  for (const sheet of sheets) {
    if (sheet.getName() !== 'Backlog') {
      return sheet;
    }
  }

  // Fallback to first sheet
  return sheets[0];
}

/**
 * Generate next version sheet name
 */
function generateNextVersion(currentName: string): string {
  const match = currentName.match(/^VER(\d+)$/i);

  if (match) {
    const currentVer = parseInt(match[1]);
    return `VER${currentVer + 1}`;
  }

  return 'VER2'; // If not VERn, next is VER2
}

/**
 * Call Backend API for a batch of rows
 */
function callBackendAPIBatch(
  batch: Array<{rowIndex: number, row: any[], comment: string}>,
  headers: any[]
): any {
  // Format batch data for backend API
  const formattedBatch = batch.map((item) => {
    const data: Record<string, string> = {};
    headers.forEach((header, idx) => {
      data[header.toString()] = item.row[idx]?.toString() || '';
    });

    return {
      row_index: item.rowIndex,
      data: data,
      comment: item.comment
    };
  });

  const payload = {
    batch: formattedBatch,
    headers: headers.map(h => h.toString())
  };

  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
    timeout: 300000 // 5分
  };

  // Log request
  logToBacklog('API_REQUEST', -1, 'SENDING', 'Sending request to Backend API', {
    batchSize: batch.length,
    headers: headers.length
  });

  const response = UrlFetchApp.fetch(`${BACKEND_API_URL}/api/rewrite/batch`, options);
  const statusCode = response.getResponseCode();
  const responseText = response.getContentText();

  if (statusCode >= 300) {
    throw new Error(`Backend API error (${statusCode}): ${responseText}`);
  }

  const result = JSON.parse(responseText);

  if (!result.success) {
    throw new Error('Backend API returned error');
  }

  logToBacklog('API_RESPONSE', -1, 'SUCCESS', 'Received response from Backend API', {
    rowCount: result.data.rows.length,
    tokensUsed: result.data.metadata.tokensUsed
  });

  return { rows: result.data.rows };
}


/**
 * Apply diff highlighting (red text for added content)
 */
function applyDiffHighlighting(
  sourceSheet: GoogleAppsScript.Spreadsheet.Sheet,
  destSheet: GoogleAppsScript.Spreadsheet.Sheet,
  sourceRow: number,
  destRow: number,
  colCount: number
) {
  const sourceRange = sourceSheet.getRange(sourceRow, 1, 1, colCount);
  const destRange = destSheet.getRange(destRow, 1, 1, colCount);

  const sourceValues = sourceRange.getValues()[0];
  const destValues = destRange.getValues()[0];

  for (let col = 0; col < colCount; col++) {
    const originalText = sourceValues[col]?.toString() || '';
    const revisedText = destValues[col]?.toString() || '';

    if (originalText !== revisedText) {
      const richText = createDiffRichText(originalText, revisedText);
      destSheet.getRange(destRow, col + 1).setRichTextValue(richText);
    }
  }
}

/**
 * Create RichTextValue with diff highlighting (added text in red)
 */
function createDiffRichText(
  original: string,
  revised: string
): GoogleAppsScript.Spreadsheet.RichTextValue {
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
function computeSimpleDiff(str1: string, str2: string): Array<{type: string, start: number, end: number}> {
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
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Log to Backlog sheet
 */
function logToBacklog(
  type: string,
  batchIndex: number,
  status: string,
  message: string,
  details: any
) {
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
