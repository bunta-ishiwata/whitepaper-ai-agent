import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as fs from 'fs/promises';
import * as path from 'path';
import { StorageService } from '../services/storage.js';
import { ParserService } from '../services/parser.js';
import { LLMService } from '../services/llm.js';
import { SheetsService } from '../services/sheets.js';
import { AuthService } from '../services/auth.js';
import { AppsScriptService } from '../services/appsscript.js';
import { Logger } from '../utils/logger.js';
import type { ParseInput, WhitepaperPlan } from '../types/index.js';

const logger = new Logger('GenerateRoute');
const router = Router();

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
    files: 3, // Maximum 3 files (salesPdf, targetPdf, optional keywordsCsv)
  },
  fileFilter: (_req, file, cb) => {
    // Allow PDF and CSV files
    const allowedMimes = ['application/pdf', 'text/csv', 'text/plain'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Only PDF and CSV files are allowed.`));
    }
  },
});

/**
 * Request body interface for whitepaper generation
 */
interface GenerateRequestBody {
  salesText?: string;
  targetText?: string;
  keywordsText?: string;
  planCount?: string;
  spreadsheetTitle?: string;
  folderId?: string;
}

/**
 * Multer files interface
 */
interface MulterFiles {
  salesPdf?: Express.Multer.File[];
  targetPdf?: Express.Multer.File[];
  keywordsCsv?: Express.Multer.File[];
}

/**
 * POST /generate
 *
 * Main API endpoint for whitepaper plan generation.
 * Accepts file uploads and/or text inputs to generate whitepaper plans
 * and save them to Google Sheets.
 *
 * @route POST /generate
 * @group Whitepaper - Whitepaper plan generation operations
 *
 * @param {Express.Multer.File} [salesPdf] - Sales material PDF file (multipart/form-data)
 * @param {Express.Multer.File} [targetPdf] - Target audience PDF file (multipart/form-data)
 * @param {Express.Multer.File} [keywordsCsv] - Keywords CSV file (multipart/form-data)
 * @param {string} [salesText] - Sales material text (form field)
 * @param {string} [targetText] - Target audience text (form field)
 * @param {string} [keywordsText] - Keywords as comma-separated text (form field)
 * @param {number} [planCount=3] - Number of whitepaper plans to generate (form field)
 * @param {string} [spreadsheetTitle] - Custom spreadsheet title (form field)
 * @param {string} [folderId] - Google Drive folder ID to move spreadsheet to (form field)
 *
 * @returns {object} 200 - Success response with spreadsheet URL and plans
 * @returns {object} 400 - Bad request (invalid input)
 * @returns {object} 500 - Internal server error
 *
 * @example
 * // Using curl with file uploads
 * curl -X POST http://localhost:8080/generate \
 *   -F "salesPdf=@sales.pdf" \
 *   -F "targetPdf=@target.pdf" \
 *   -F "keywordsText=AI,ML,automation" \
 *   -F "planCount=5"
 *
 * @example
 * // Using curl with text inputs
 * curl -X POST http://localhost:8080/generate \
 *   -F "salesText=Product features and benefits..." \
 *   -F "targetText=Target market analysis..." \
 *   -F "keywordsText=AI,ML,automation" \
 *   -F "planCount=3"
 */
router.post(
  '/',
  upload.fields([
    { name: 'salesPdf', maxCount: 1 },
    { name: 'targetPdf', maxCount: 1 },
    { name: 'keywordsCsv', maxCount: 1 },
  ]),
  async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    let tempFiles: string[] = [];

    try {
      logger.info('Received whitepaper generation request');

      // Check authentication
      if (!req.session?.authenticated || !req.session?.tokens) {
        logger.warn('Unauthenticated request to /generate endpoint');
        res.status(401).json({
          error: 'Unauthorized',
          message: 'You must authenticate before using this endpoint',
          loginUrl: '/auth/login',
          authFlow: {
            step1: 'Visit /auth/login to authenticate with your Google account',
            step2: 'After authentication, you can create spreadsheets in your Google Drive',
          },
        });
        return;
      }

      // Extract request data
      const files = req.files as MulterFiles;
      const body = req.body as GenerateRequestBody;

      // Validate input: at least one source must be provided
      const hasSalesInput = !!files.salesPdf?.[0] || !!body.salesText;
      const hasTargetInput = !!files.targetPdf?.[0] || !!body.targetText;
      const hasKeywordsInput = !!files.keywordsCsv?.[0] || !!body.keywordsText;

      if (!hasSalesInput && !hasTargetInput && !hasKeywordsInput) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'At least one input source (sales, target, or keywords) must be provided',
        });
        return;
      }

      // Parse plan count (default: 3)
      const planCount = body.planCount ? parseInt(body.planCount, 10) : 3;
      if (isNaN(planCount) || planCount < 1 || planCount > 50) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'planCount must be a number between 1 and 50',
        });
        return;
      }

      logger.info(`Processing request with planCount=${planCount}`);

      // Step 1: Upload files to Cloud Storage (if provided)
      const storageService = new StorageService({
        projectId: process.env.GCP_PROJECT_ID,
        keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        bucketName: process.env.GCS_BUCKET_NAME || '',
      });

      const uploadedFiles: { [key: string]: string } = {};

      if (files.salesPdf?.[0]) {
        logger.info('Uploading sales PDF to Cloud Storage');
        const result = await storageService.uploadFile(files.salesPdf[0]);
        logger.info(`Sales PDF uploaded: ${result.fileName}`);
        uploadedFiles.salesPdf = result.fileName;
      }

      if (files.targetPdf?.[0]) {
        logger.info('Uploading target PDF to Cloud Storage');
        const result = await storageService.uploadFile(files.targetPdf[0]);
        logger.info(`Target PDF uploaded: ${result.fileName}`);
        uploadedFiles.targetPdf = result.fileName;
      }

      if (files.keywordsCsv?.[0]) {
        logger.info('Uploading keywords CSV to Cloud Storage');
        const result = await storageService.uploadFile(files.keywordsCsv[0]);
        logger.info(`Keywords CSV uploaded: ${result.fileName}`);
        uploadedFiles.keywordsCsv = result.fileName;
      }

      // Step 2: Download files to local temp directory for parsing
      const tmpDir = '/tmp/whitepaper-gen';
      await fs.mkdir(tmpDir, { recursive: true });

      const localPaths: { [key: string]: string } = {};

      for (const [key, fileName] of Object.entries(uploadedFiles)) {
        const localPath = path.join(tmpDir, fileName);
        logger.info(`Downloading ${key} from Cloud Storage`);
        const buffer = await storageService.downloadFile(fileName);
        await fs.writeFile(localPath, buffer);
        localPaths[key] = localPath;
        tempFiles.push(localPath);
        logger.info(`${key} saved to ${localPath}`);
      }

      // Step 3: Parse context using ParserService
      logger.info('Building context from input sources');
      const parserService = new ParserService({
        projectId: process.env.GCP_PROJECT_ID,
        keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      });

      const parseInput: ParseInput = {
        salesPdf: localPaths.salesPdf,
        salesText: body.salesText,
        targetPdf: localPaths.targetPdf,
        targetText: body.targetText,
        keywordsCsv: localPaths.keywordsCsv,
        keywordsText: body.keywordsText,
      };

      const context = await parserService.buildContext(parseInput);
      logger.info('Context built successfully', {
        salesTextLength: context.salesText.length,
        targetTextLength: context.targetText.length,
        keywordsCount: context.keywords.length,
      });

      // Step 4: Generate whitepaper plans using LLMService
      logger.info(`Generating ${planCount} whitepaper plans using LLM`);
      const llmService = new LLMService({
        apiKey: process.env.OPENAI_API_KEY || '',
        model: process.env.OPENAI_MODEL || 'gpt-4',
        maxTokens: process.env.OPENAI_MAX_TOKENS
          ? parseInt(process.env.OPENAI_MAX_TOKENS, 10)
          : 4096,
        temperature: process.env.OPENAI_TEMPERATURE
          ? parseFloat(process.env.OPENAI_TEMPERATURE)
          : 0.7,
      });

      const plans: WhitepaperPlan[] = await llmService.generatePlans(context, planCount);
      logger.info(`Generated ${plans.length} whitepaper plans`);

      // Step 5: Create authenticated client and spreadsheet
      logger.info('Creating authenticated Google Sheets client');
      const authService = new AuthService();

      // Check if token needs refreshing
      if (!authService.isTokenValid(req.session.tokens)) {
        logger.info('Access token expired, refreshing...');
        req.session.tokens = await authService.refreshToken(req.session.tokens);
      }

      const authenticatedClient = authService.getAuthenticatedClient(req.session.tokens);
      const sheetsService = new SheetsService(authenticatedClient);

      logger.info('Creating Google Spreadsheet in user\'s Google Drive');
      const spreadsheetTitle =
        body.spreadsheetTitle || `Whitepaper Plans - ${new Date().toISOString()}`;
      const { spreadsheetId, sheetId } = await sheetsService.createSpreadsheet(spreadsheetTitle);
      logger.info(`Spreadsheet created: ${spreadsheetId}, sheet: ${sheetId}`);

      logger.info('Writing data to spreadsheet');
      await sheetsService.writeData(spreadsheetId, plans, sheetId);
      logger.info('Data written successfully');

      // Step 6: Bind Google Apps Script to spreadsheet
      logger.info('Binding Google Apps Script to spreadsheet');
      const backendApiUrl = process.env.BACKEND_API_URL || 'http://localhost:8080';
      const appsScriptService = new AppsScriptService(authenticatedClient);

      try {
        const { scriptId, projectUrl } = await appsScriptService.createAndBindScript(
          spreadsheetId,
          backendApiUrl
        );
        logger.info(`Apps Script bound successfully: ${scriptId}`);
        logger.info(`Script project URL: ${projectUrl}`);
      } catch (scriptError: any) {
        logger.warn('Failed to bind Apps Script (non-fatal)', scriptError);
        // Don't fail the entire request if GAS binding fails
        // Users can still use the spreadsheet without rewriter functionality
      }

      // Step 7: Move spreadsheet to folder (if folderId provided)
      if (body.folderId) {
        logger.info(`Moving spreadsheet to folder: ${body.folderId}`);
        await sheetsService.moveToFolder(spreadsheetId, body.folderId);
        logger.info('Spreadsheet moved successfully');
      }

      // Step 8: Cleanup temporary files
      logger.info('Cleaning up temporary files');
      await cleanupTempFiles(tempFiles);
      tempFiles = []; // Clear array after cleanup

      // Step 9: Cleanup uploaded files from Cloud Storage
      logger.info('Cleaning up uploaded files from Cloud Storage');
      const fileNamesToDelete = Object.values(uploadedFiles);
      if (fileNamesToDelete.length > 0) {
        const deleteResult = await storageService.deleteFiles(fileNamesToDelete);
        logger.info('Cloud Storage cleanup completed', {
          deleted: deleteResult.deleted,
          failed: deleteResult.failed,
        });
      }

      // Step 10: Return success response
      const spreadsheetUrl = sheetsService.getSpreadsheetUrl(spreadsheetId);
      const duration = Date.now() - startTime;

      logger.info(`Request completed successfully in ${duration}ms`);

      res.status(200).json({
        success: true,
        spreadsheetId,
        spreadsheetUrl,
        planCount: plans.length,
        plans: plans.map((plan) => ({
          no: plan.no,
          タイトル: plan.タイトル,
          目的: plan.目的,
          ターゲット: plan.ターゲット,
          構成: plan.構成,
        })),
        metadata: {
          duration: `${duration}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      // Cleanup temporary files on error
      if (tempFiles.length > 0) {
        logger.warn('Cleaning up temporary files after error');
        await cleanupTempFiles(tempFiles).catch((cleanupError) => {
          logger.error('Failed to cleanup temporary files', cleanupError);
        });
      }

      // Log and return error response
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Request failed', error instanceof Error ? error : new Error(errorMessage));

      const duration = Date.now() - startTime;

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: errorMessage,
        metadata: {
          duration: `${duration}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
);

/**
 * Cleanup temporary files from local filesystem
 *
 * @param filePaths - Array of file paths to delete
 * @returns Promise that resolves when cleanup is complete
 */
async function cleanupTempFiles(filePaths: string[]): Promise<void> {
  const deletePromises = filePaths.map(async (filePath) => {
    try {
      await fs.unlink(filePath);
      logger.debug(`Deleted temporary file: ${filePath}`);
    } catch (error) {
      // Ignore errors if file doesn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn(`Failed to delete temporary file: ${filePath}`, error);
      }
    }
  });

  await Promise.all(deletePromises);
}

export { router as generateRouter };
