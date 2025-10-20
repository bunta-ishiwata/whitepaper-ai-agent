import express from 'express';
import cors from 'cors';
import { OpenAIService } from './services/openai.js';
import { rewriteRouter } from './routes/rewrite.js';
import { schemaRouter } from './routes/schema.js';

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors({
  origin: [
    'https://script.google.com',
    'https://docs.google.com',
    /^https:\/\/script\.google\.com$/,
  ],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'whitepaper-backend',
    version: '1.0.0',
  });
});

// Initialize services (local mode - no Secret Manager or Firestore)
let openAIService: OpenAIService | null = null;

async function initializeServices() {
  try {
    console.log('Initializing services (LOCAL MODE)...');

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    // Initialize OpenAI service
    openAIService = new OpenAIService(apiKey);
    console.log('✓ OpenAI service initialized');

    // Mock Firestore service for local testing
    const mockFirestoreService = {
      async checkUsageLimit() {
        return {
          allowed: true,
          remaining: 1000,
          resetAt: new Date(Date.now() + 86400000),
        };
      },
      async recordUsage() {
        console.log('Mock: Usage recorded');
      },
      async getDailyUsage() {
        return {
          userId: 'local-user',
          date: new Date().toISOString().split('T')[0],
          totalCalls: 0,
          totalTokens: 0,
        };
      },
    };

    // Attach services to app locals
    app.locals.openAIService = openAIService;
    app.locals.firestoreService = mockFirestoreService;

    console.log('All services initialized successfully (LOCAL MODE)');
  } catch (error: any) {
    console.error('Failed to initialize services:', error.message);
    process.exit(1);
  }
}

// Mount routers
app.use('/api/rewrite', rewriteRouter);
app.use('/api/schema', schemaRouter);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      code: err.code || 'INTERNAL_ERROR',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: 'Not found',
      code: 'NOT_FOUND',
      path: req.path,
    },
  });
});

// Start server
async function start() {
  await initializeServices();

  app.listen(PORT, () => {
    console.log(`🚀 Whitepaper Backend (LOCAL) listening on port ${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Health check: http://localhost:${PORT}/health`);
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
