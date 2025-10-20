import { ImageAnnotatorClient } from '@google-cloud/vision';
import { ParseInput, ParsedContext } from '../types/index.js';
import * as fs from 'fs/promises';

/**
 * Configuration options for ParserService
 */
export interface ParserServiceConfig {
  projectId?: string;
  keyFilename?: string;
}

/**
 * ParserService
 *
 * Provides PDF/text parsing and context building functionality.
 * Uses Google Cloud Vision OCR for PDF text extraction and CSV keyword parsing.
 *
 * @example
 * ```typescript
 * const parserService = new ParserService({
 *   projectId: 'my-project',
 *   keyFilename: './key.json'
 * });
 *
 * // Extract text from PDF
 * const text = await parserService.extractTextFromPdf('/path/to/file.pdf');
 *
 * // Parse CSV keywords
 * const keywords = parserService.parseCsvKeywords('keyword1,keyword2,keyword3');
 *
 * // Build complete context
 * const context = await parserService.buildContext({
 *   salesPdf: '/path/to/sales.pdf',
 *   targetText: 'Target audience description',
 *   keywordsCsv: 'AI,ML,automation'
 * });
 * ```
 */
export class ParserService {
  private visionClient: ImageAnnotatorClient;

  /**
   * Creates a new ParserService instance
   *
   * @param config - Parser service configuration
   *
   * @example
   * ```typescript
   * const service = new ParserService({
   *   projectId: 'my-gcp-project',
   *   keyFilename: './service-account-key.json'
   * });
   * ```
   */
  constructor(config?: ParserServiceConfig) {
    this.visionClient = new ImageAnnotatorClient({
      projectId: config?.projectId,
      keyFilename: config?.keyFilename,
    });
  }

  /**
   * Extracts text from a PDF file using Google Cloud Vision OCR
   *
   * @param pdfPath - Absolute path to the PDF file
   * @returns Promise resolving to extracted text content
   * @throws {Error} If PDF path is invalid or OCR extraction fails
   *
   * @example
   * ```typescript
   * const text = await parserService.extractTextFromPdf('/tmp/document.pdf');
   * console.log(`Extracted ${text.length} characters`);
   * ```
   */
  async extractTextFromPdf(pdfPath: string): Promise<string> {
    try {
      // Validate input
      if (!pdfPath || pdfPath.trim() === '') {
        throw new Error('PDF path is required');
      }

      // Check if file exists
      try {
        await fs.access(pdfPath);
      } catch {
        throw new Error(`PDF file not found: ${pdfPath}`);
      }

      // Read file as buffer
      const fileBuffer = await fs.readFile(pdfPath);

      // Use Cloud Vision OCR for text detection
      const [result] = await this.visionClient.documentTextDetection({
        image: {
          content: fileBuffer,
        },
      });

      // Extract full text annotation
      const fullTextAnnotation = result.fullTextAnnotation;
      if (!fullTextAnnotation || !fullTextAnnotation.text) {
        throw new Error('No text found in PDF');
      }

      return fullTextAnnotation.text.trim();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to extract text from PDF: ${errorMessage}`);
    }
  }

  /**
   * Parses CSV-formatted keyword string into an array of keywords
   *
   * @param csvText - CSV string containing keywords (comma-separated)
   * @returns Array of trimmed, non-empty keywords
   *
   * @example
   * ```typescript
   * const keywords = parserService.parseCsvKeywords('AI, machine learning, automation');
   * // Returns: ['AI', 'machine learning', 'automation']
   *
   * const emptyKeywords = parserService.parseCsvKeywords('');
   * // Returns: []
   *
   * const withWhitespace = parserService.parseCsvKeywords('  keyword1  ,  , keyword2  ');
   * // Returns: ['keyword1', 'keyword2']
   * ```
   */
  parseCsvKeywords(csvText: string): string[] {
    if (!csvText || csvText.trim() === '') {
      return [];
    }

    return csvText
      .split(',')
      .map((keyword) => keyword.trim())
      .filter((keyword) => keyword.length > 0);
  }

  /**
   * Builds a complete ParsedContext from various input sources
   *
   * Processes sales and target documents (PDF or text) and keywords (CSV or text array)
   * to create a unified context object. Prioritizes text input over PDF when both are provided.
   *
   * @param input - Parse input containing sales/target documents and keywords
   * @returns Promise resolving to ParsedContext with extracted text and keywords
   * @throws {Error} If no valid input is provided or processing fails
   *
   * @example
   * ```typescript
   * // Using PDF files and CSV keywords
   * const context = await parserService.buildContext({
   *   salesPdf: '/path/to/sales.pdf',
   *   targetPdf: '/path/to/target.pdf',
   *   keywordsCsv: 'AI,ML,automation'
   * });
   *
   * // Using pre-extracted text
   * const context = await parserService.buildContext({
   *   salesText: 'Sales content here',
   *   targetText: 'Target content here',
   *   keywordsText: 'keyword1,keyword2'
   * });
   *
   * // Mixed input (text takes priority over PDF)
   * const context = await parserService.buildContext({
   *   salesPdf: '/path/to/sales.pdf',
   *   salesText: 'Override with this text',
   *   keywordsCsv: 'AI,ML'
   * });
   * ```
   */
  async buildContext(input: ParseInput): Promise<ParsedContext> {
    try {
      // Extract sales text (prioritize direct text over PDF)
      let salesText = '';
      if (input.salesText && input.salesText.trim() !== '') {
        salesText = input.salesText.trim();
      } else if (input.salesPdf) {
        salesText = await this.extractTextFromPdf(input.salesPdf);
      }

      // Extract target text (prioritize direct text over PDF)
      let targetText = '';
      if (input.targetText && input.targetText.trim() !== '') {
        targetText = input.targetText.trim();
      } else if (input.targetPdf) {
        targetText = await this.extractTextFromPdf(input.targetPdf);
      }

      // Parse keywords (prioritize direct text over CSV)
      let keywords: string[] = [];
      if (input.keywordsText && input.keywordsText.trim() !== '') {
        keywords = this.parseCsvKeywords(input.keywordsText);
      } else if (input.keywordsCsv) {
        keywords = this.parseCsvKeywords(input.keywordsCsv);
      }

      // Validate that we have at least some content
      if (salesText === '' && targetText === '' && keywords.length === 0) {
        throw new Error('At least one input source (sales, target, or keywords) must be provided');
      }

      return {
        salesText,
        targetText,
        keywords,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to build context: ${errorMessage}`);
    }
  }
}
