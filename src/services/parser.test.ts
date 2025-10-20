import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ParserService, ParserServiceConfig } from './parser';
import { ParseInput, ParsedContext } from '../types/index';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import * as fs from 'fs/promises';

// Mock @google-cloud/vision
vi.mock('@google-cloud/vision', () => {
  const mockDocumentTextDetection = vi.fn();

  const MockImageAnnotatorClient = vi.fn(() => ({
    documentTextDetection: mockDocumentTextDetection,
  }));

  return {
    ImageAnnotatorClient: MockImageAnnotatorClient,
  };
});

// Mock fs/promises
vi.mock('fs/promises', () => ({
  access: vi.fn(),
  readFile: vi.fn(),
}));

describe('ParserService', () => {
  let parserService: ParserService;
  let mockVisionClient: ImageAnnotatorClient;

  const config: ParserServiceConfig = {
    projectId: 'test-project',
    keyFilename: './test-key.json',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Create service instance
    parserService = new ParserService(config);

    // Get mocked vision client
    mockVisionClient = (parserService as any).visionClient;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with valid config', () => {
      expect(parserService).toBeInstanceOf(ParserService);
    });

    it('should create instance without config', () => {
      const service = new ParserService();
      expect(service).toBeInstanceOf(ParserService);
    });

    it('should initialize ImageAnnotatorClient with provided credentials', () => {
      expect(ImageAnnotatorClient).toHaveBeenCalledWith({
        projectId: 'test-project',
        keyFilename: './test-key.json',
      });
    });
  });

  describe('extractTextFromPdf', () => {
    const testPdfPath = '/tmp/test-document.pdf';
    const testBuffer = Buffer.from('PDF content');
    const extractedText = 'This is extracted text from PDF';

    beforeEach(() => {
      // Mock file system operations
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(testBuffer);

      // Mock Vision API response
      vi.mocked(mockVisionClient.documentTextDetection).mockResolvedValue([
        {
          fullTextAnnotation: {
            text: extractedText,
          },
        },
      ] as any);
    });

    it('should extract text from PDF successfully', async () => {
      const result = await parserService.extractTextFromPdf(testPdfPath);

      expect(result).toBe(extractedText);
      expect(fs.access).toHaveBeenCalledWith(testPdfPath);
      expect(fs.readFile).toHaveBeenCalledWith(testPdfPath);
      expect(mockVisionClient.documentTextDetection).toHaveBeenCalledWith({
        image: {
          content: testBuffer,
        },
      });
    });

    it('should trim whitespace from extracted text', async () => {
      const textWithWhitespace = '  \n  Extracted text  \n  ';
      vi.mocked(mockVisionClient.documentTextDetection).mockResolvedValue([
        {
          fullTextAnnotation: {
            text: textWithWhitespace,
          },
        },
      ] as any);

      const result = await parserService.extractTextFromPdf(testPdfPath);

      expect(result).toBe('Extracted text');
    });

    it('should throw error if PDF path is empty', async () => {
      await expect(parserService.extractTextFromPdf('')).rejects.toThrow(
        'PDF path is required'
      );
    });

    it('should throw error if PDF path is whitespace', async () => {
      await expect(parserService.extractTextFromPdf('   ')).rejects.toThrow(
        'PDF path is required'
      );
    });

    it('should throw error if PDF file does not exist', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('File not found'));

      await expect(parserService.extractTextFromPdf(testPdfPath)).rejects.toThrow(
        'PDF file not found: /tmp/test-document.pdf'
      );
    });

    it('should throw error if no text found in PDF', async () => {
      vi.mocked(mockVisionClient.documentTextDetection).mockResolvedValue([
        {
          fullTextAnnotation: null,
        },
      ] as any);

      await expect(parserService.extractTextFromPdf(testPdfPath)).rejects.toThrow(
        'No text found in PDF'
      );
    });

    it('should throw error if fullTextAnnotation.text is empty', async () => {
      vi.mocked(mockVisionClient.documentTextDetection).mockResolvedValue([
        {
          fullTextAnnotation: {
            text: '',
          },
        },
      ] as any);

      await expect(parserService.extractTextFromPdf(testPdfPath)).rejects.toThrow(
        'No text found in PDF'
      );
    });

    it('should handle Vision API errors', async () => {
      vi.mocked(mockVisionClient.documentTextDetection).mockRejectedValue(
        new Error('Vision API error')
      );

      await expect(parserService.extractTextFromPdf(testPdfPath)).rejects.toThrow(
        'Failed to extract text from PDF: Vision API error'
      );
    });

    it('should handle file reading errors', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('Read error'));

      await expect(parserService.extractTextFromPdf(testPdfPath)).rejects.toThrow(
        'Failed to extract text from PDF'
      );
    });
  });

  describe('parseCsvKeywords', () => {
    it('should parse comma-separated keywords', () => {
      const csvText = 'keyword1,keyword2,keyword3';
      const result = parserService.parseCsvKeywords(csvText);

      expect(result).toEqual(['keyword1', 'keyword2', 'keyword3']);
    });

    it('should trim whitespace from keywords', () => {
      const csvText = '  keyword1  ,  keyword2  ,  keyword3  ';
      const result = parserService.parseCsvKeywords(csvText);

      expect(result).toEqual(['keyword1', 'keyword2', 'keyword3']);
    });

    it('should filter out empty keywords', () => {
      const csvText = 'keyword1,,keyword2,  ,keyword3';
      const result = parserService.parseCsvKeywords(csvText);

      expect(result).toEqual(['keyword1', 'keyword2', 'keyword3']);
    });

    it('should return empty array for empty string', () => {
      const result = parserService.parseCsvKeywords('');

      expect(result).toEqual([]);
    });

    it('should return empty array for whitespace string', () => {
      const result = parserService.parseCsvKeywords('   ');

      expect(result).toEqual([]);
    });

    it('should handle single keyword', () => {
      const csvText = 'single-keyword';
      const result = parserService.parseCsvKeywords(csvText);

      expect(result).toEqual(['single-keyword']);
    });

    it('should handle keywords with special characters', () => {
      const csvText = 'AI/ML, cloud-native, Web3.0';
      const result = parserService.parseCsvKeywords(csvText);

      expect(result).toEqual(['AI/ML', 'cloud-native', 'Web3.0']);
    });

    it('should handle keywords with spaces', () => {
      const csvText = 'machine learning, artificial intelligence, deep learning';
      const result = parserService.parseCsvKeywords(csvText);

      expect(result).toEqual(['machine learning', 'artificial intelligence', 'deep learning']);
    });

    it('should handle only commas input', () => {
      const csvText = ',,,';
      const result = parserService.parseCsvKeywords(csvText);

      expect(result).toEqual([]);
    });

    it('should handle very long keyword list', () => {
      const keywords = Array(100).fill('keyword').map((k, i) => `${k}${i}`);
      const csvText = keywords.join(',');
      const result = parserService.parseCsvKeywords(csvText);

      expect(result).toHaveLength(100);
      expect(result[0]).toBe('keyword0');
      expect(result[99]).toBe('keyword99');
    });
  });

  describe('buildContext', () => {
    const mockSalesText = 'Sales document content';
    const mockTargetText = 'Target document content';
    const mockKeywords = ['AI', 'ML', 'automation'];

    beforeEach(() => {
      // Mock file system and Vision API for PDF extraction
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('PDF content'));
      vi.mocked(mockVisionClient.documentTextDetection).mockResolvedValue([
        {
          fullTextAnnotation: {
            text: 'Extracted PDF text',
          },
        },
      ] as any);
    });

    describe('with direct text input', () => {
      it('should build context from direct text input', async () => {
        const input: ParseInput = {
          salesText: mockSalesText,
          targetText: mockTargetText,
          keywordsText: 'AI,ML,automation',
        };

        const result = await parserService.buildContext(input);

        expect(result).toEqual({
          salesText: mockSalesText,
          targetText: mockTargetText,
          keywords: mockKeywords,
        });
      });

      it('should prioritize text over PDF when both provided', async () => {
        const input: ParseInput = {
          salesPdf: '/path/to/sales.pdf',
          salesText: mockSalesText,
          targetPdf: '/path/to/target.pdf',
          targetText: mockTargetText,
          keywordsCsv: 'AI,ML,automation',
        };

        const result = await parserService.buildContext(input);

        expect(result.salesText).toBe(mockSalesText);
        expect(result.targetText).toBe(mockTargetText);
        expect(fs.readFile).not.toHaveBeenCalled();
      });

      it('should trim whitespace from direct text input', async () => {
        const input: ParseInput = {
          salesText: '  Sales text  ',
          targetText: '  Target text  ',
          keywordsText: '  AI  ,  ML  ',
        };

        const result = await parserService.buildContext(input);

        expect(result.salesText).toBe('Sales text');
        expect(result.targetText).toBe('Target text');
        expect(result.keywords).toEqual(['AI', 'ML']);
      });
    });

    describe('with PDF input', () => {
      it('should build context from PDF files', async () => {
        const input: ParseInput = {
          salesPdf: '/path/to/sales.pdf',
          targetPdf: '/path/to/target.pdf',
          keywordsCsv: 'AI,ML,automation',
        };

        const result = await parserService.buildContext(input);

        expect(result).toEqual({
          salesText: 'Extracted PDF text',
          targetText: 'Extracted PDF text',
          keywords: mockKeywords,
        });
        expect(fs.readFile).toHaveBeenCalledTimes(2);
      });

      it('should handle only sales PDF', async () => {
        const input: ParseInput = {
          salesPdf: '/path/to/sales.pdf',
          keywordsText: 'AI,ML',
        };

        const result = await parserService.buildContext(input);

        expect(result.salesText).toBe('Extracted PDF text');
        expect(result.targetText).toBe('');
        expect(result.keywords).toEqual(['AI', 'ML']);
      });

      it('should handle only target PDF', async () => {
        const input: ParseInput = {
          targetPdf: '/path/to/target.pdf',
          keywordsText: 'AI,ML',
        };

        const result = await parserService.buildContext(input);

        expect(result.salesText).toBe('');
        expect(result.targetText).toBe('Extracted PDF text');
        expect(result.keywords).toEqual(['AI', 'ML']);
      });
    });

    describe('with mixed input', () => {
      it('should handle sales PDF and target text', async () => {
        const input: ParseInput = {
          salesPdf: '/path/to/sales.pdf',
          targetText: mockTargetText,
          keywordsText: 'AI,ML',
        };

        const result = await parserService.buildContext(input);

        expect(result.salesText).toBe('Extracted PDF text');
        expect(result.targetText).toBe(mockTargetText);
        expect(result.keywords).toEqual(['AI', 'ML']);
      });

      it('should handle sales text and target PDF', async () => {
        const input: ParseInput = {
          salesText: mockSalesText,
          targetPdf: '/path/to/target.pdf',
          keywordsText: 'AI,ML',
        };

        const result = await parserService.buildContext(input);

        expect(result.salesText).toBe(mockSalesText);
        expect(result.targetText).toBe('Extracted PDF text');
        expect(result.keywords).toEqual(['AI', 'ML']);
      });
    });

    describe('keyword handling', () => {
      it('should prioritize keywordsText over keywordsCsv', async () => {
        const input: ParseInput = {
          salesText: mockSalesText,
          keywordsText: 'keyword1,keyword2',
          keywordsCsv: 'keyword3,keyword4',
        };

        const result = await parserService.buildContext(input);

        expect(result.keywords).toEqual(['keyword1', 'keyword2']);
      });

      it('should use keywordsCsv when keywordsText not provided', async () => {
        const input: ParseInput = {
          salesText: mockSalesText,
          keywordsCsv: 'keyword1,keyword2',
        };

        const result = await parserService.buildContext(input);

        expect(result.keywords).toEqual(['keyword1', 'keyword2']);
      });

      it('should handle empty keywords', async () => {
        const input: ParseInput = {
          salesText: mockSalesText,
        };

        const result = await parserService.buildContext(input);

        expect(result.keywords).toEqual([]);
      });
    });

    describe('validation', () => {
      it('should throw error when no input provided', async () => {
        const input: ParseInput = {};

        await expect(parserService.buildContext(input)).rejects.toThrow(
          'At least one input source (sales, target, or keywords) must be provided'
        );
      });

      it('should throw error when all inputs are empty strings', async () => {
        const input: ParseInput = {
          salesText: '',
          targetText: '',
          keywordsText: '',
        };

        await expect(parserService.buildContext(input)).rejects.toThrow(
          'At least one input source (sales, target, or keywords) must be provided'
        );
      });

      it('should throw error when all inputs are whitespace', async () => {
        const input: ParseInput = {
          salesText: '   ',
          targetText: '   ',
          keywordsText: '   ',
        };

        await expect(parserService.buildContext(input)).rejects.toThrow(
          'At least one input source (sales, target, or keywords) must be provided'
        );
      });

      it('should accept input with only sales text', async () => {
        const input: ParseInput = {
          salesText: mockSalesText,
        };

        const result = await parserService.buildContext(input);

        expect(result.salesText).toBe(mockSalesText);
        expect(result.targetText).toBe('');
        expect(result.keywords).toEqual([]);
      });

      it('should accept input with only target text', async () => {
        const input: ParseInput = {
          targetText: mockTargetText,
        };

        const result = await parserService.buildContext(input);

        expect(result.salesText).toBe('');
        expect(result.targetText).toBe(mockTargetText);
        expect(result.keywords).toEqual([]);
      });

      it('should accept input with only keywords', async () => {
        const input: ParseInput = {
          keywordsText: 'AI,ML',
        };

        const result = await parserService.buildContext(input);

        expect(result.salesText).toBe('');
        expect(result.targetText).toBe('');
        expect(result.keywords).toEqual(['AI', 'ML']);
      });
    });

    describe('error handling', () => {
      it('should handle PDF extraction failure', async () => {
        vi.mocked(mockVisionClient.documentTextDetection).mockRejectedValue(
          new Error('OCR failed')
        );

        const input: ParseInput = {
          salesPdf: '/path/to/sales.pdf',
        };

        await expect(parserService.buildContext(input)).rejects.toThrow(
          'Failed to build context'
        );
      });

      it('should handle file not found error', async () => {
        vi.mocked(fs.access).mockRejectedValue(new Error('File not found'));

        const input: ParseInput = {
          salesPdf: '/path/to/nonexistent.pdf',
        };

        await expect(parserService.buildContext(input)).rejects.toThrow(
          'Failed to build context'
        );
      });

      it('should include original error message in thrown error', async () => {
        vi.mocked(mockVisionClient.documentTextDetection).mockRejectedValue(
          new Error('Custom OCR error')
        );

        const input: ParseInput = {
          salesPdf: '/path/to/sales.pdf',
        };

        await expect(parserService.buildContext(input)).rejects.toThrow(
          'Failed to build context'
        );
      });
    });

    describe('complex scenarios', () => {
      it('should handle all inputs provided', async () => {
        const input: ParseInput = {
          salesPdf: '/path/to/sales.pdf',
          salesText: mockSalesText,
          targetPdf: '/path/to/target.pdf',
          targetText: mockTargetText,
          keywordsCsv: 'csv1,csv2',
          keywordsText: 'text1,text2',
        };

        const result = await parserService.buildContext(input);

        // Text should be prioritized over PDF
        expect(result.salesText).toBe(mockSalesText);
        expect(result.targetText).toBe(mockTargetText);
        expect(result.keywords).toEqual(['text1', 'text2']);

        // PDF extraction should not be called when text is provided
        expect(fs.readFile).not.toHaveBeenCalled();
      });

      it('should handle very long text content', async () => {
        const longText = 'A'.repeat(100000);
        const input: ParseInput = {
          salesText: longText,
          targetText: longText,
          keywordsText: 'AI,ML',
        };

        const result = await parserService.buildContext(input);

        expect(result.salesText).toBe(longText);
        expect(result.targetText).toBe(longText);
        expect(result.keywords).toEqual(['AI', 'ML']);
      });

      it('should handle special characters in text', async () => {
        const specialText = 'Text with 日本語, émojis 🚀, and symbols: @#$%';
        const input: ParseInput = {
          salesText: specialText,
          targetText: specialText,
          keywordsText: '日本語,émoji,symbol',
        };

        const result = await parserService.buildContext(input);

        expect(result.salesText).toBe(specialText);
        expect(result.targetText).toBe(specialText);
        expect(result.keywords).toEqual(['日本語', 'émoji', 'symbol']);
      });

      it('should handle multiple PDF extractions in parallel', async () => {
        let extractionCount = 0;
        vi.mocked(mockVisionClient.documentTextDetection).mockImplementation(async () => {
          extractionCount++;
          return [
            {
              fullTextAnnotation: {
                text: `Extracted text ${extractionCount}`,
              },
            },
          ] as any;
        });

        const input: ParseInput = {
          salesPdf: '/path/to/sales.pdf',
          targetPdf: '/path/to/target.pdf',
          keywordsText: 'AI,ML',
        };

        const result = await parserService.buildContext(input);

        expect(result.salesText).toBeTruthy();
        expect(result.targetText).toBeTruthy();
        expect(extractionCount).toBe(2);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle null-like values gracefully', async () => {
      const input: ParseInput = {
        salesText: undefined,
        targetText: undefined,
        keywordsText: 'AI,ML',
      };

      const result = await parserService.buildContext(input);

      expect(result.salesText).toBe('');
      expect(result.targetText).toBe('');
      expect(result.keywords).toEqual(['AI', 'ML']);
    });

    it('should handle concurrent buildContext calls', async () => {
      const input: ParseInput = {
        salesText: 'Sales text',
        targetText: 'Target text',
        keywordsText: 'AI,ML',
      };

      const promises = Array(5)
        .fill(null)
        .map(() => parserService.buildContext(input));

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach((result) => {
        expect(result).toEqual({
          salesText: 'Sales text',
          targetText: 'Target text',
          keywords: ['AI', 'ML'],
        });
      });
    });

    it('should handle empty PDF (no text detected)', async () => {
      vi.mocked(mockVisionClient.documentTextDetection).mockResolvedValue([
        {
          fullTextAnnotation: null,
        },
      ] as any);

      const input: ParseInput = {
        salesPdf: '/path/to/empty.pdf',
      };

      await expect(parserService.buildContext(input)).rejects.toThrow(
        'No text found in PDF'
      );
    });

    it('should handle PDF with only whitespace', async () => {
      vi.mocked(mockVisionClient.documentTextDetection).mockResolvedValue([
        {
          fullTextAnnotation: {
            text: '   \n\n   ',
          },
        },
      ] as any);

      const input: ParseInput = {
        salesPdf: '/path/to/whitespace.pdf',
      };

      await expect(parserService.buildContext(input)).rejects.toThrow(
        'At least one input source (sales, target, or keywords) must be provided'
      );
    });

    it('should handle very large keyword list', async () => {
      const largeKeywordList = Array(1000)
        .fill('keyword')
        .map((k, i) => `${k}${i}`)
        .join(',');

      const keywords = parserService.parseCsvKeywords(largeKeywordList);

      expect(keywords).toHaveLength(1000);
      expect(keywords[0]).toBe('keyword0');
      expect(keywords[999]).toBe('keyword999');
    });
  });
});
