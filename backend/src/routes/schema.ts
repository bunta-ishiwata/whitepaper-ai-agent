import express from 'express';
import type { OpenAIService } from '../services/openai.js';
import type { FirestoreService } from '../services/firestore.js';

export const schemaRouter = express.Router();

/**
 * POST /api/schema/generate
 * Generate JSON Schema from column headers
 */
schemaRouter.post('/generate', async (req, res, next) => {
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
    const { userId, headers } = req.body;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'userId is required and must be a string',
          code: 'INVALID_USER_ID',
        },
      });
    }

    if (!Array.isArray(headers) || headers.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'headers must be a non-empty array of strings',
          code: 'INVALID_HEADERS',
        },
      });
    }

    if (!headers.every(h => typeof h === 'string')) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'All headers must be strings',
          code: 'INVALID_HEADERS',
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

    // Generate schema
    const startTime = Date.now();
    const schema = await openAIService.generateSchema(headers);
    const duration = Date.now() - startTime;

    // Estimate tokens used
    const estimatedTokens = Math.ceil(JSON.stringify(schema).length / 4);

    // Record usage
    await firestoreService.recordUsage({
      userId,
      timestamp: new Date(),
      apiCalls: 1,
      tokensUsed: estimatedTokens,
      operation: 'schema',
      metadata: {
        headers,
        duration,
      },
    });

    // Return result
    res.json({
      success: true,
      data: {
        schema,
        metadata: {
          duration,
          tokensUsed: estimatedTokens,
          remaining: usageCheck.remaining - 1,
          resetAt: usageCheck.resetAt.toISOString(),
        },
      },
    });
  } catch (error: any) {
    console.error('Schema generation error:', error);
    next(error);
  }
});
