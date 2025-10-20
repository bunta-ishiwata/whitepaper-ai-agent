import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { generateRouter } from './generate.js';
import type { WhitepaperPlan } from '../types/index.js';

// Mock services
vi.mock('../services/storage.js', () => ({
  StorageService: vi.fn().mockImplementation(() => ({
    uploadFile: vi.fn().mockResolvedValue({ fileName: 'test-file.pdf' }),
    downloadFile: vi.fn().mockResolvedValue(Buffer.from('mock pdf content')),
    deleteFiles: vi.fn().mockResolvedValue({ deleted: 1, failed: 0 }),
  })),
}));

vi.mock('../services/parser.js', () => ({
  ParserService: vi.fn().mockImplementation(() => ({
    buildContext: vi.fn().mockResolvedValue({
      salesText: 'Mock sales text content',
      targetText: 'Mock target text content',
      keywords: ['AI', 'ML', 'automation'],
    }),
  })),
}));

vi.mock('../services/llm.js', () => ({
  LLMService: vi.fn().mockImplementation(() => ({
    generatePlans: vi.fn().mockImplementation((_context, count) => {
      const mockPlans: WhitepaperPlan[] = [];
      for (let i = 0; i < count; i++) {
        mockPlans.push({
          no: i + 1,
          タイトル: `ホワイトペーパー企画 ${i + 1}`,
          目的: `目的 ${i + 1}`,
          内容概要: `これは企画 ${i + 1} の内容概要です`,
          感情的ニーズ: `感情的ニーズ ${i + 1}`,
          機能的ニーズ: `機能的ニーズ ${i + 1}`,
          成果的ニーズ: `成果的ニーズ ${i + 1}`,
          ニーズ複数: 'AI, ML, 自動化',
          ターゲット: '企業の意思決定者',
          職種部署: 'IT部門',
          レベル: 'マネージャー',
          構成: `## 第${i + 1}章：導入\n### ${i + 1}.1 背景\n### ${i + 1}.2 課題`,
          コメント: '',
        });
      }
      return Promise.resolve(mockPlans);
    }),
  })),
}));

vi.mock('../services/sheets.js', () => ({
  SheetsService: vi.fn().mockImplementation(() => ({
    createSpreadsheet: vi.fn().mockResolvedValue({ spreadsheetId: 'mock-spreadsheet-id', sheetId: 0 }),
    writeData: vi.fn().mockResolvedValue(undefined),
    moveToFolder: vi.fn().mockResolvedValue(undefined),
    getSpreadsheetUrl: vi
      .fn()
      .mockReturnValue('https://docs.google.com/spreadsheets/d/mock-spreadsheet-id'),
  })),
}));

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

describe('POST /generate', () => {
  let app: express.Application;

  beforeAll(() => {
    // Set up test environment variables
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/auth/callback';

    // Setup express app with generate router
    app = express();

    // Session middleware with test configuration
    app.use(session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false }
    }));

    // Mock authentication middleware
    app.use((req, _res, next) => {
      // Set up mock session with authenticated user
      req.session.authenticated = true;
      req.session.tokens = {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expiry_date: Date.now() + 3600000,
        token_type: 'Bearer'
      };
      next();
    });

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use('/generate', generateRouter);
  });

  afterAll(() => {
    vi.clearAllMocks();
  });

  it('should return 400 if no input sources are provided', async () => {
    const response = await request(app)
      .post('/generate')
      .field('planCount', '3');

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error', 'Bad Request');
    expect(response.body.message).toContain('At least one input source');
  });

  it('should return 400 if planCount is invalid', async () => {
    const response = await request(app)
      .post('/generate')
      .field('salesText', 'Mock sales content')
      .field('planCount', '0');

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error', 'Bad Request');
    expect(response.body.message).toContain('planCount must be a number between 1 and 50');
  });

  it('should return 400 if planCount exceeds maximum', async () => {
    const response = await request(app)
      .post('/generate')
      .field('salesText', 'Mock sales content')
      .field('planCount', '51');

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error', 'Bad Request');
    expect(response.body.message).toContain('planCount must be a number between 1 and 50');
  });

  it('should generate whitepaper plans with text inputs', async () => {
    const response = await request(app)
      .post('/generate')
      .field('salesText', 'Our product offers advanced AI capabilities')
      .field('targetText', 'Enterprise decision makers seeking automation')
      .field('keywordsText', 'AI,ML,automation')
      .field('planCount', '3');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('spreadsheetId', 'mock-spreadsheet-id');
    expect(response.body).toHaveProperty('spreadsheetUrl');
    expect(response.body.spreadsheetUrl).toContain('docs.google.com/spreadsheets');
    expect(response.body).toHaveProperty('planCount', 3);
    expect(response.body).toHaveProperty('plans');
    expect(Array.isArray(response.body.plans)).toBe(true);
    expect(response.body.plans).toHaveLength(3);
    expect(response.body.metadata).toHaveProperty('duration');
    expect(response.body.metadata).toHaveProperty('timestamp');

    // Validate plan structure
    const plan = response.body.plans[0];
    expect(plan).toHaveProperty('no');
    expect(plan).toHaveProperty('タイトル');
    expect(plan).toHaveProperty('目的');
    expect(plan).toHaveProperty('ターゲット');
    expect(plan).toHaveProperty('構成');
  });

  it('should generate whitepaper plans with file uploads', async () => {
    const salesPdfBuffer = Buffer.from('mock pdf content');
    const targetPdfBuffer = Buffer.from('mock pdf content');

    const response = await request(app)
      .post('/generate')
      .attach('salesPdf', salesPdfBuffer, 'sales.pdf')
      .attach('targetPdf', targetPdfBuffer, 'target.pdf')
      .field('keywordsText', 'AI,ML,automation')
      .field('planCount', '5');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('planCount', 5);
    expect(response.body.plans).toHaveLength(5);
  });

  it('should accept custom spreadsheet title', async () => {
    const customTitle = 'My Custom Whitepaper Plans';

    const response = await request(app)
      .post('/generate')
      .field('salesText', 'Test sales content')
      .field('spreadsheetTitle', customTitle)
      .field('planCount', '2');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
  });

  it('should accept folder ID for moving spreadsheet', async () => {
    const folderId = 'test-folder-id';

    const response = await request(app)
      .post('/generate')
      .field('salesText', 'Test sales content')
      .field('folderId', folderId)
      .field('planCount', '2');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
  });

  it('should use default planCount of 3 when not specified', async () => {
    const response = await request(app)
      .post('/generate')
      .field('salesText', 'Test sales content')
      .field('targetText', 'Test target content');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('planCount', 3);
    expect(response.body.plans).toHaveLength(3);
  });

  it('should handle mixed input sources (files and text)', async () => {
    const salesPdfBuffer = Buffer.from('mock pdf content');

    const response = await request(app)
      .post('/generate')
      .attach('salesPdf', salesPdfBuffer, 'sales.pdf')
      .field('targetText', 'Test target content')
      .field('keywordsText', 'keyword1,keyword2')
      .field('planCount', '4');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('planCount', 4);
  });

  it('should handle file validation gracefully', async () => {
    // Note: File type validation happens at multer level and is hard to test with supertest
    // This test verifies that valid files are accepted
    const validPdfBuffer = Buffer.from('mock pdf content');

    const response = await request(app)
      .post('/generate')
      .attach('salesPdf', validPdfBuffer, 'sales.pdf')
      .field('planCount', '3');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
  });

  it('should include metadata in response', async () => {
    const response = await request(app)
      .post('/generate')
      .field('salesText', 'Test content')
      .field('planCount', '2');

    expect(response.status).toBe(200);
    expect(response.body.metadata).toHaveProperty('duration');
    expect(response.body.metadata.duration).toMatch(/^\d+ms$/);
    expect(response.body.metadata).toHaveProperty('timestamp');
    expect(new Date(response.body.metadata.timestamp).getTime()).toBeGreaterThan(0);
  });

  it('should return plan summaries in response', async () => {
    const response = await request(app)
      .post('/generate')
      .field('salesText', 'Test content')
      .field('planCount', '3');

    expect(response.status).toBe(200);
    expect(response.body.plans).toHaveLength(3);

    response.body.plans.forEach((plan: any, index: number) => {
      expect(plan.no).toBe(index + 1);
      expect(plan.タイトル).toBe(`ホワイトペーパー企画 ${index + 1}`);
      expect(plan.目的).toBe(`目的 ${index + 1}`);
      expect(plan.ターゲット).toBe('企業の意思決定者');
      expect(plan.構成).toContain(`## 第${index + 1}章：導入`);
    });
  });

  it('should handle only keywords input', async () => {
    const response = await request(app)
      .post('/generate')
      .field('keywordsText', 'AI,ML,automation,cloud')
      .field('planCount', '2');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('planCount', 2);
  });

  it('should handle CSV keywords file', async () => {
    const csvBuffer = Buffer.from('keyword1,keyword2,keyword3\nAI,ML,automation');

    const response = await request(app)
      .post('/generate')
      .attach('keywordsCsv', csvBuffer, 'keywords.csv')
      .field('salesText', 'Test content')
      .field('planCount', '2');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
  });
});
