import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { StorageService, MulterFile, StorageServiceConfig } from './storage';
import { Storage, Bucket, File } from '@google-cloud/storage';

// Mock @google-cloud/storage
vi.mock('@google-cloud/storage', () => {
  const mockFile = {
    createWriteStream: vi.fn(),
    makePublic: vi.fn(),
    exists: vi.fn(),
    download: vi.fn(),
    delete: vi.fn(),
    getMetadata: vi.fn(),
    name: 'test-file.pdf',
  };

  const mockBucket = {
    file: vi.fn(() => mockFile),
    getFiles: vi.fn(),
  };

  const mockStorage = vi.fn(() => ({
    bucket: vi.fn(() => mockBucket),
  }));

  return {
    Storage: mockStorage,
  };
});

describe('StorageService', () => {
  let storageService: StorageService;
  let mockStorage: Storage;
  let mockBucket: Bucket;
  let mockFile: File;

  const config: StorageServiceConfig = {
    projectId: 'test-project',
    keyFilename: './test-key.json',
    bucketName: 'test-bucket',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Create service instance
    storageService = new StorageService(config);

    // Get mocked instances
    mockStorage = (storageService as any).storage;
    mockBucket = (storageService as any).bucket;
    mockFile = mockBucket.file('test-file.pdf');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with valid config', () => {
      expect(storageService).toBeInstanceOf(StorageService);
      expect((storageService as any).bucketName).toBe('test-bucket');
    });

    it('should throw error if bucket name is missing', () => {
      expect(() => {
        new StorageService({ bucketName: '' });
      }).toThrow('Bucket name is required');
    });

    it('should initialize Storage with provided credentials', () => {
      expect(Storage).toHaveBeenCalledWith({
        projectId: 'test-project',
        keyFilename: './test-key.json',
      });
    });
  });

  describe('uploadFile', () => {
    const mockMulterFile: MulterFile = {
      fieldname: 'file',
      originalname: 'test-document.pdf',
      encoding: '7bit',
      mimetype: 'application/pdf',
      size: 1024,
      buffer: Buffer.from('test file content'),
    };

    beforeEach(() => {
      // Mock stream behavior
      const mockStream = {
        on: vi.fn((event: string, callback: Function) => {
          if (event === 'finish') {
            // Simulate successful upload
            setTimeout(() => callback(), 0);
          }
          return mockStream;
        }),
        end: vi.fn(),
      };

      vi.spyOn(mockFile, 'createWriteStream').mockReturnValue(mockStream as any);
      vi.spyOn(mockFile, 'makePublic').mockResolvedValue([{} as any]);
    });

    it('should upload file successfully', async () => {
      const result = await storageService.uploadFile(mockMulterFile);

      expect(result).toMatchObject({
        publicUrl: expect.stringContaining('https://storage.googleapis.com/test-bucket/'),
        size: 1024,
        contentType: 'application/pdf',
      });
      expect(result.fileName).toMatch(/^\d+-test-document\.pdf$/);
      expect(mockFile.makePublic).toHaveBeenCalled();
    });

    it('should throw error if file is missing', async () => {
      await expect(storageService.uploadFile(null as any)).rejects.toThrow(
        'Invalid file: file or buffer is missing'
      );
    });

    it('should throw error if buffer is missing', async () => {
      const invalidFile = { ...mockMulterFile, buffer: undefined };
      await expect(storageService.uploadFile(invalidFile as any)).rejects.toThrow(
        'Invalid file: file or buffer is missing'
      );
    });

    it('should handle upload stream errors', async () => {
      const mockStream = {
        on: vi.fn((event: string, callback: Function) => {
          if (event === 'error') {
            setTimeout(() => callback(new Error('Stream error')), 0);
          }
          return mockStream;
        }),
        end: vi.fn(),
      };

      vi.spyOn(mockFile, 'createWriteStream').mockReturnValue(mockStream as any);

      await expect(storageService.uploadFile(mockMulterFile)).rejects.toThrow(
        'Failed to upload file'
      );
    });

    it('should include metadata in upload', async () => {
      await storageService.uploadFile(mockMulterFile);

      expect(mockFile.createWriteStream).toHaveBeenCalledWith(
        expect.objectContaining({
          resumable: false,
          metadata: expect.objectContaining({
            contentType: 'application/pdf',
            metadata: expect.objectContaining({
              originalName: 'test-document.pdf',
            }),
          }),
        })
      );
    });
  });

  describe('downloadFile', () => {
    const testFileName = 'test-file.pdf';
    const testBuffer = Buffer.from('test file content');

    beforeEach(() => {
      vi.spyOn(mockFile, 'exists').mockResolvedValue([true] as any);
      vi.spyOn(mockFile, 'download').mockResolvedValue([testBuffer] as any);
    });

    it('should download file successfully', async () => {
      const result = await storageService.downloadFile(testFileName);

      expect(result).toEqual(testBuffer);
      expect(mockBucket.file).toHaveBeenCalledWith(testFileName);
      expect(mockFile.exists).toHaveBeenCalled();
      expect(mockFile.download).toHaveBeenCalled();
    });

    it('should throw error if file name is empty', async () => {
      await expect(storageService.downloadFile('')).rejects.toThrow(
        'File name is required'
      );
    });

    it('should throw error if file does not exist', async () => {
      vi.spyOn(mockFile, 'exists').mockResolvedValue([false] as any);

      await expect(storageService.downloadFile(testFileName)).rejects.toThrow(
        'File not found: test-file.pdf'
      );
    });

    it('should handle download errors', async () => {
      vi.spyOn(mockFile, 'download').mockRejectedValue(new Error('Download failed'));

      await expect(storageService.downloadFile(testFileName)).rejects.toThrow(
        'Failed to download file'
      );
    });
  });

  describe('deleteFile', () => {
    const testFileName = 'test-file.pdf';

    beforeEach(() => {
      vi.spyOn(mockFile, 'exists').mockResolvedValue([true] as any);
      vi.spyOn(mockFile, 'delete').mockResolvedValue([{} as any]);
    });

    it('should delete file successfully', async () => {
      await storageService.deleteFile(testFileName);

      expect(mockBucket.file).toHaveBeenCalledWith(testFileName);
      expect(mockFile.exists).toHaveBeenCalled();
      expect(mockFile.delete).toHaveBeenCalled();
    });

    it('should throw error if file name is empty', async () => {
      await expect(storageService.deleteFile('')).rejects.toThrow(
        'File name is required'
      );
    });

    it('should throw error if file does not exist', async () => {
      vi.spyOn(mockFile, 'exists').mockResolvedValue([false] as any);

      await expect(storageService.deleteFile(testFileName)).rejects.toThrow(
        'File not found: test-file.pdf'
      );
    });

    it('should handle deletion errors', async () => {
      vi.spyOn(mockFile, 'delete').mockRejectedValue(new Error('Delete failed'));

      await expect(storageService.deleteFile(testFileName)).rejects.toThrow(
        'Failed to delete file'
      );
    });
  });

  describe('deleteFiles', () => {
    beforeEach(() => {
      vi.spyOn(mockFile, 'exists').mockResolvedValue([true] as any);
      vi.spyOn(mockFile, 'delete').mockResolvedValue([{} as any]);
    });

    it('should delete multiple files successfully', async () => {
      const fileNames = ['file1.pdf', 'file2.pdf', 'file3.pdf'];
      const result = await storageService.deleteFiles(fileNames);

      expect(result.deleted).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle partial failures', async () => {
      const fileNames = ['file1.pdf', 'file2.pdf', 'file3.pdf'];

      // Make second file fail
      let callCount = 0;
      vi.spyOn(mockFile, 'delete').mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Delete failed');
        }
        return [{} as any];
      });

      const result = await storageService.deleteFiles(fileNames);

      expect(result.deleted).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.fileName).toBe('file2.pdf');
    });

    it('should throw error if file names array is empty', async () => {
      await expect(storageService.deleteFiles([])).rejects.toThrow(
        'File names array is required and must not be empty'
      );
    });

    it('should throw error if file names is not an array', async () => {
      await expect(storageService.deleteFiles(null as any)).rejects.toThrow(
        'File names array is required and must not be empty'
      );
    });

    it('should process deletions in parallel', async () => {
      const fileNames = ['file1.pdf', 'file2.pdf', 'file3.pdf'];
      const startTime = Date.now();

      vi.spyOn(mockFile, 'delete').mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return [{} as any];
      });

      await storageService.deleteFiles(fileNames);
      const duration = Date.now() - startTime;

      // Should take ~100ms (parallel) not ~300ms (sequential)
      expect(duration).toBeLessThan(200);
    });
  });

  describe('listFiles', () => {
    const mockFiles = [
      { name: 'file1.pdf' },
      { name: 'file2.pdf' },
      { name: 'reports/file3.pdf' },
    ] as File[];

    beforeEach(() => {
      vi.spyOn(mockBucket, 'getFiles').mockResolvedValue([mockFiles, {} as any, {} as any]);
    });

    it('should list all files without prefix', async () => {
      const result = await storageService.listFiles();

      expect(result).toEqual(['file1.pdf', 'file2.pdf', 'reports/file3.pdf']);
      expect(mockBucket.getFiles).toHaveBeenCalledWith({});
    });

    it('should list files with prefix', async () => {
      const result = await storageService.listFiles('reports/');

      expect(mockBucket.getFiles).toHaveBeenCalledWith({ prefix: 'reports/' });
    });

    it('should handle listing errors', async () => {
      vi.spyOn(mockBucket, 'getFiles').mockRejectedValue(new Error('List failed'));

      await expect(storageService.listFiles()).rejects.toThrow('Failed to list files');
    });
  });

  describe('getFileMetadata', () => {
    const testFileName = 'test-file.pdf';
    const mockMetadata = {
      name: 'test-file.pdf',
      size: '2048',
      contentType: 'application/pdf',
      timeCreated: '2025-10-16T00:00:00.000Z',
      updated: '2025-10-16T01:00:00.000Z',
    };

    beforeEach(() => {
      vi.spyOn(mockFile, 'exists').mockResolvedValue([true] as any);
      vi.spyOn(mockFile, 'getMetadata').mockResolvedValue([mockMetadata] as any);
    });

    it('should get file metadata successfully', async () => {
      const result = await storageService.getFileMetadata(testFileName);

      expect(result).toEqual({
        name: 'test-file.pdf',
        size: 2048,
        contentType: 'application/pdf',
        created: '2025-10-16T00:00:00.000Z',
        updated: '2025-10-16T01:00:00.000Z',
      });
    });

    it('should throw error if file name is empty', async () => {
      await expect(storageService.getFileMetadata('')).rejects.toThrow(
        'File name is required'
      );
    });

    it('should throw error if file does not exist', async () => {
      vi.spyOn(mockFile, 'exists').mockResolvedValue([false] as any);

      await expect(storageService.getFileMetadata(testFileName)).rejects.toThrow(
        'File not found: test-file.pdf'
      );
    });

    it('should handle metadata retrieval errors', async () => {
      vi.spyOn(mockFile, 'getMetadata').mockRejectedValue(
        new Error('Metadata retrieval failed')
      );

      await expect(storageService.getFileMetadata(testFileName)).rejects.toThrow(
        'Failed to get file metadata'
      );
    });

    it('should handle missing metadata fields with defaults', async () => {
      const incompleteMetadata = {};
      vi.spyOn(mockFile, 'getMetadata').mockResolvedValue([incompleteMetadata] as any);

      const result = await storageService.getFileMetadata(testFileName);

      expect(result.name).toBe(testFileName);
      expect(result.size).toBe(0);
      expect(result.contentType).toBe('application/octet-stream');
      expect(result.created).toBeTruthy();
      expect(result.updated).toBeTruthy();
    });
  });

  describe('fileExists', () => {
    const testFileName = 'test-file.pdf';

    it('should return true if file exists', async () => {
      vi.spyOn(mockFile, 'exists').mockResolvedValue([true] as any);

      const result = await storageService.fileExists(testFileName);

      expect(result).toBe(true);
      expect(mockBucket.file).toHaveBeenCalledWith(testFileName);
    });

    it('should return false if file does not exist', async () => {
      vi.spyOn(mockFile, 'exists').mockResolvedValue([false] as any);

      const result = await storageService.fileExists(testFileName);

      expect(result).toBe(false);
    });

    it('should return false if file name is empty', async () => {
      const result = await storageService.fileExists('');

      expect(result).toBe(false);
    });

    it('should return false on errors', async () => {
      vi.spyOn(mockFile, 'exists').mockRejectedValue(new Error('Check failed'));

      const result = await storageService.fileExists(testFileName);

      expect(result).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle very large files', async () => {
      const largeBuffer = Buffer.alloc(10 * 1024 * 1024); // 10MB
      const largeFile: MulterFile = {
        fieldname: 'file',
        originalname: 'large-file.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: largeBuffer.length,
        buffer: largeBuffer,
      };

      const mockStream = {
        on: vi.fn((event: string, callback: Function) => {
          if (event === 'finish') {
            setTimeout(() => callback(), 0);
          }
          return mockStream;
        }),
        end: vi.fn(),
      };

      vi.spyOn(mockFile, 'createWriteStream').mockReturnValue(mockStream as any);
      vi.spyOn(mockFile, 'makePublic').mockResolvedValue([{} as any]);

      const result = await storageService.uploadFile(largeFile);

      expect(result.size).toBe(largeBuffer.length);
    });

    it('should handle special characters in file names', async () => {
      const specialFileName = 'test file (1) [2024].pdf';
      vi.spyOn(mockFile, 'exists').mockResolvedValue([true] as any);

      const exists = await storageService.fileExists(specialFileName);

      expect(mockBucket.file).toHaveBeenCalledWith(specialFileName);
    });

    it('should handle concurrent operations', async () => {
      vi.spyOn(mockFile, 'exists').mockResolvedValue([true] as any);
      vi.spyOn(mockFile, 'download').mockResolvedValue([Buffer.from('test')] as any);

      const promises = Array(10)
        .fill(null)
        .map(() => storageService.downloadFile('test.pdf'));

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      results.forEach((result) => {
        expect(result).toBeInstanceOf(Buffer);
      });
    });
  });
});
