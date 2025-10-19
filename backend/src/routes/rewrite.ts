import express from 'express';
import type { OpenAIService } from '../services/openai.js';
import type { FirestoreService } from '../services/firestore.js';

export const rewriteRouter = express.Router();

/**
 * POST /api/rewrite
 * Rewrite a single cell value using OpenAI
 */
rewriteRouter.post('/', async (req, res, next) => {
  try {
    const openAIService = req.app.locals.openAIService as OpenAIService;
    const firestoreService = req.app.locals.firestoreService as FirestoreService;

    if (!openAIService || !firestoreService) {
      return res.status(503).json({
        success: false,
        error: {
          message: 'Services not initialized',
          code: 'SERVICE_UNAVAILABLE',
        },
      });
    }

    // Validate request body
    const { userId, original, instruction, context } = req.body;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'userId is required and must be a string',
          code: 'INVALID_USER_ID',
        },
      });
    }

    if (!original || typeof original !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'original is required and must be a string',
          code: 'INVALID_ORIGINAL',
        },
      });
    }

    if (!instruction || typeof instruction !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'instruction is required and must be a string',
          code: 'INVALID_INSTRUCTION',
        },
      });
    }

    if (!context || !context.columnName || !Array.isArray(context.allHeaders)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'context must include columnName and allHeaders array',
          code: 'INVALID_CONTEXT',
        },
      });
    }

    // Check usage limit
    const usageCheck = await firestoreService.checkUsageLimit(userId);

    if (!usageCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: {
          message: 'Daily usage limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          remaining: usageCheck.remaining,
          resetAt: usageCheck.resetAt.toISOString(),
        },
      });
    }

    // Perform rewrite
    const startTime = Date.now();
    const rewritten = await openAIService.rewriteCell(original, instruction, {
      columnName: context.columnName,
      rowIndex: context.rowIndex || 0,
      allHeaders: context.allHeaders,
    });
    const duration = Date.now() - startTime;

    // Estimate tokens used (rough estimate: ~4 chars = 1 token)
    const estimatedTokens = Math.ceil((original.length + instruction.length + rewritten.length) / 4);

    // Record usage
    await firestoreService.recordUsage({
      userId,
      timestamp: new Date(),
      apiCalls: 1,
      tokensUsed: estimatedTokens,
      operation: 'rewrite',
      metadata: {
        spreadsheetId: context.spreadsheetId,
        sheetName: context.sheetName,
        cellRange: context.cellRange,
        columnName: context.columnName,
        rowIndex: context.rowIndex,
        duration,
      },
    });

    // Return result
    res.json({
      success: true,
      data: {
        original,
        rewritten,
        metadata: {
          duration,
          tokensUsed: estimatedTokens,
          remaining: usageCheck.remaining - 1,
          resetAt: usageCheck.resetAt.toISOString(),
        },
      },
    });
  } catch (error: any) {
    console.error('Rewrite error:', error);
    next(error);
  }
});

/**
 * POST /api/rewrite/batch
 * Rewrite multiple rows in batch using OpenAI
 */
rewriteRouter.post('/batch', async (req, res, next) => {
  try {
    const openAIService = req.app.locals.openAIService as OpenAIService;

    if (!openAIService) {
      return res.status(503).json({
        success: false,
        error: {
          message: 'OpenAI service not initialized',
          code: 'SERVICE_UNAVAILABLE',
        },
      });
    }

    // Validate request body
    const { batch, headers } = req.body;

    console.log('📥 Batch rewrite request:', {
      batchSize: batch?.length,
      headers: headers?.length,
      rowIndexes: batch?.map((b: any) => b.row_index),
    });

    if (!batch || !Array.isArray(batch) || batch.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'batch is required and must be a non-empty array',
          code: 'INVALID_BATCH',
        },
      });
    }

    if (!headers || !Array.isArray(headers) || headers.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'headers is required and must be a non-empty array',
          code: 'INVALID_HEADERS',
        },
      });
    }

    // Perform batch rewrite
    const startTime = Date.now();
    const rows = await openAIService.rewriteBatch(batch, headers);
    const duration = Date.now() - startTime;

    console.log('📤 Batch rewrite response:', {
      rowCount: rows.length,
      rowIndexes: rows.map((r: any) => r.row_index),
      duration: `${duration}ms`,
    });

    // Estimate tokens used (rough estimate)
    const estimatedTokens = Math.ceil(
      (JSON.stringify(batch).length + JSON.stringify(rows).length) / 4
    );

    // Return result
    res.json({
      success: true,
      data: {
        rows,
        metadata: {
          duration,
          tokensUsed: estimatedTokens,
          batchSize: batch.length,
        },
      },
    });
  } catch (error: any) {
    console.error('Batch rewrite error:', error);
    next(error);
  }
});

/**
 * GET /api/rewrite/usage
 * Get user's daily usage statistics
 */
rewriteRouter.get('/usage', async (req, res, next) => {
  try {
    const firestoreService = req.app.locals.firestoreService as FirestoreService;

    if (!firestoreService) {
      return res.status(503).json({
        success: false,
        error: {
          message: 'Firestore service not initialized',
          code: 'SERVICE_UNAVAILABLE',
        },
      });
    }

    const userId = req.query.userId as string;
    const date = req.query.date as string | undefined;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'userId query parameter is required',
          code: 'INVALID_USER_ID',
        },
      });
    }

    const usage = await firestoreService.getDailyUsage(userId, date);
    const usageCheck = await firestoreService.checkUsageLimit(userId);

    res.json({
      success: true,
      data: {
        usage: usage || {
          userId,
          date: date || new Date().toISOString().split('T')[0],
          totalCalls: 0,
          totalTokens: 0,
        },
        limit: {
          allowed: usageCheck.allowed,
          remaining: usageCheck.remaining,
          resetAt: usageCheck.resetAt.toISOString(),
        },
      },
    });
  } catch (error: any) {
    console.error('Usage query error:', error);
    next(error);
  }
});
