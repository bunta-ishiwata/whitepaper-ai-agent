import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { SecretManagerService } from './services/secretManager.js';
import { OpenAIService } from './services/openai.js';
import { FirestoreService } from './services/firestore.js';
import { rewriteRouter } from './routes/rewrite.js';
import { schemaRouter } from './routes/schema.js';

const app = express();
const PORT = process.env.PORT || 8080;
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || '';

if (!GCP_PROJECT_ID) {
  console.error('ERROR: GCP_PROJECT_ID environment variable is required');
  process.exit(1);
}

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

// Initialize services
let openAIService: OpenAIService | null = null;
let firestoreService: FirestoreService | null = null;

async function initializeServices() {
  try {
    console.log('Initializing services...');

    // Get OpenAI API key from environment variable (for local) or Secret Manager (for production)
    let apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      console.log('OPENAI_API_KEY not found in environment, trying Secret Manager...');
      const secretManager = new SecretManagerService(GCP_PROJECT_ID);
      apiKey = await secretManager.getOpenAIApiKey(
        process.env.OPENAI_API_KEY_SECRET || 'openai-api-key'
      );
    } else {
      console.log('Using OPENAI_API_KEY from environment variable');
    }

    // Initialize OpenAI service
    openAIService = new OpenAIService(apiKey);
    console.log('✓ OpenAI service initialized');

    // Initialize Firestore service
    firestoreService = new FirestoreService({
      projectId: GCP_PROJECT_ID,
      usageCollection: process.env.FIRESTORE_USAGE_COLLECTION,
      logsCollection: process.env.FIRESTORE_LOGS_COLLECTION,
      maxRequestsPerDay: parseInt(process.env.MAX_REQUESTS_PER_DAY || '100'),
    });
    console.log('✓ Firestore service initialized');

    // Attach services to app locals
    app.locals.openAIService = openAIService;
    app.locals.firestoreService = firestoreService;

    console.log('All services initialized successfully');
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
    console.log(`🚀 Whitepaper Backend listening on port ${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Project ID: ${GCP_PROJECT_ID}`);
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
