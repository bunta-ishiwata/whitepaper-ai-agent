import { Storage, File, Bucket } from '@google-cloud/storage';

/**
 * Configuration options for StorageService
 */
export interface StorageServiceConfig {
  projectId?: string;
  keyFilename?: string;
  bucketName: string;
}

/**
 * Upload result metadata
 */
export interface UploadResult {
  fileName: string;
  publicUrl: string;
  size: number;
  contentType: string;
  uploadedAt: string;
}

/**
 * Express Multer File interface
 * Represents a file uploaded via multer middleware
 */
export interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
  destination?: string;
  filename?: string;
  path?: string;
  stream?: NodeJS.ReadableStream;
}

/**
 * StorageService
 *
 * Provides Cloud Storage integration for file upload, download, and deletion operations.
 * Supports both single and batch file operations with comprehensive error handling.
 *
 * @example
 * ```typescript
 * const storageService = new StorageService({
 *   projectId: 'my-project',
 *   keyFilename: './key.json',
 *   bucketName: 'my-bucket'
 * });
 *
 * // Upload a file
 * const result = await storageService.uploadFile(multerFile);
 * console.log(`File uploaded to: ${result.publicUrl}`);
 *
 * // Download a file
 * const buffer = await storageService.downloadFile('file.pdf');
 *
 * // Delete multiple files
 * await storageService.deleteFiles(['file1.pdf', 'file2.pdf']);
 * ```
 */
export class StorageService {
  private storage: Storage;
  private bucketName: string;
  private bucket: Bucket;

  /**
   * Creates a new StorageService instance
   *
   * @param config - Storage service configuration
   * @throws {Error} If bucket name is not provided
   *
   * @example
   * ```typescript
   * const service = new StorageService({
   *   projectId: 'my-gcp-project',
   *   keyFilename: './service-account-key.json',
   *   bucketName: 'my-storage-bucket'
   * });
   * ```
   */
  constructor(config: StorageServiceConfig) {
    if (!config.bucketName) {
      throw new Error('Bucket name is required');
    }

    this.storage = new Storage({
      projectId: config.projectId,
      keyFilename: config.keyFilename,
    });

    this.bucketName = config.bucketName;
    this.bucket = this.storage.bucket(this.bucketName);
  }

  /**
   * Uploads a file to Cloud Storage
   *
   * @param file - The file to upload (from multer middleware)
   * @returns Upload result with public URL and metadata
   * @throws {Error} If upload fails or file is invalid
   *
   * @example
   * ```typescript
   * app.post('/upload', upload.single('file'), async (req, res) => {
   *   const result = await storageService.uploadFile(req.file);
   *   res.json({ url: result.publicUrl });
   * });
   * ```
   */
  async uploadFile(file: MulterFile): Promise<UploadResult> {
    try {
      if (!file || !file.buffer) {
        throw new Error('Invalid file: file or buffer is missing');
      }

      // Generate unique filename with timestamp
      const timestamp = Date.now();
      const fileName = `${timestamp}-${file.originalname}`;
      const blob = this.bucket.file(fileName);

      // Create write stream with metadata
      const blobStream = blob.createWriteStream({
        resumable: false,
        metadata: {
          contentType: file.mimetype,
          metadata: {
            originalName: file.originalname,
            uploadedAt: new Date().toISOString(),
          },
        },
      });

      // Upload file using promise wrapper
      await new Promise<void>((resolve, reject) => {
        blobStream.on('error', (error: Error) => {
          reject(new Error(`Upload failed: ${error.message}`));
        });

        blobStream.on('finish', () => {
          resolve();
        });

        blobStream.end(file.buffer);
      });

      // Make file publicly accessible
      await blob.makePublic();

      // Get public URL
      const publicUrl = `https://storage.googleapis.com/${this.bucketName}/${fileName}`;

      return {
        fileName,
        publicUrl,
        size: file.size,
        contentType: file.mimetype,
        uploadedAt: new Date().toISOString(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to upload file: ${errorMessage}`);
    }
  }

  /**
   * Downloads a file from Cloud Storage
   *
   * @param fileName - The name of the file to download
   * @returns File contents as a Buffer
   * @throws {Error} If download fails or file not found
   *
   * @example
   * ```typescript
   * const fileBuffer = await storageService.downloadFile('report.pdf');
   * res.setHeader('Content-Type', 'application/pdf');
   * res.send(fileBuffer);
   * ```
   */
  async downloadFile(fileName: string): Promise<Buffer> {
    try {
      if (!fileName || fileName.trim() === '') {
        throw new Error('File name is required');
      }

      const file = this.bucket.file(fileName);

      // Check if file exists
      const [exists] = await file.exists();
      if (!exists) {
        throw new Error(`File not found: ${fileName}`);
      }

      // Download file
      const [contents] = await file.download();
      return contents;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to download file: ${errorMessage}`);
    }
  }

  /**
   * Deletes a single file from Cloud Storage
   *
   * @param fileName - The name of the file to delete
   * @throws {Error} If deletion fails
   *
   * @example
   * ```typescript
   * await storageService.deleteFile('old-report.pdf');
   * console.log('File deleted successfully');
   * ```
   */
  async deleteFile(fileName: string): Promise<void> {
    try {
      if (!fileName || fileName.trim() === '') {
        throw new Error('File name is required');
      }

      const file = this.bucket.file(fileName);

      // Check if file exists before deletion
      const [exists] = await file.exists();
      if (!exists) {
        throw new Error(`File not found: ${fileName}`);
      }

      await file.delete();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to delete file: ${errorMessage}`);
    }
  }

  /**
   * Deletes multiple files from Cloud Storage in batch
   *
   * @param fileNames - Array of file names to delete
   * @returns Summary of deletion results
   * @throws {Error} If batch deletion fails
   *
   * @example
   * ```typescript
   * const result = await storageService.deleteFiles([
   *   'file1.pdf',
   *   'file2.pdf',
   *   'file3.pdf'
   * ]);
   * console.log(`Deleted: ${result.deleted}, Failed: ${result.failed}`);
   * ```
   */
  async deleteFiles(fileNames: string[]): Promise<{
    deleted: number;
    failed: number;
    errors: Array<{ fileName: string; error: string }>;
  }> {
    if (!Array.isArray(fileNames) || fileNames.length === 0) {
      throw new Error('File names array is required and must not be empty');
    }

    const results = {
      deleted: 0,
      failed: 0,
      errors: [] as Array<{ fileName: string; error: string }>,
    };

    // Process deletions in parallel
    const deletePromises = fileNames.map(async (fileName) => {
      try {
        await this.deleteFile(fileName);
        results.deleted++;
      } catch (error) {
        results.failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.errors.push({ fileName, error: errorMessage });
      }
    });

    await Promise.all(deletePromises);

    return results;
  }

  /**
   * Lists all files in the bucket with optional prefix filter
   *
   * @param prefix - Optional prefix to filter files
   * @returns Array of file names
   * @throws {Error} If listing fails
   *
   * @example
   * ```typescript
   * // List all PDF files
   * const pdfFiles = await storageService.listFiles('reports/');
   * console.log(`Found ${pdfFiles.length} files`);
   * ```
   */
  async listFiles(prefix?: string): Promise<string[]> {
    try {
      const options = prefix ? { prefix } : {};
      const [files] = await this.bucket.getFiles(options);
      return files.map((file: File) => file.name);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to list files: ${errorMessage}`);
    }
  }

  /**
   * Gets metadata for a specific file
   *
   * @param fileName - The name of the file
   * @returns File metadata including size, content type, and timestamps
   * @throws {Error} If file not found or metadata retrieval fails
   *
   * @example
   * ```typescript
   * const metadata = await storageService.getFileMetadata('report.pdf');
   * console.log(`File size: ${metadata.size} bytes`);
   * ```
   */
  async getFileMetadata(fileName: string): Promise<{
    name: string;
    size: number;
    contentType: string;
    created: string;
    updated: string;
  }> {
    try {
      if (!fileName || fileName.trim() === '') {
        throw new Error('File name is required');
      }

      const file = this.bucket.file(fileName);
      const [exists] = await file.exists();

      if (!exists) {
        throw new Error(`File not found: ${fileName}`);
      }

      const [metadata] = await file.getMetadata();

      return {
        name: metadata.name || fileName,
        size: typeof metadata.size === 'number'
          ? metadata.size
          : parseInt(metadata.size || '0', 10),
        contentType: metadata.contentType || 'application/octet-stream',
        created: metadata.timeCreated || new Date().toISOString(),
        updated: metadata.updated || new Date().toISOString(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get file metadata: ${errorMessage}`);
    }
  }

  /**
   * Checks if a file exists in the bucket
   *
   * @param fileName - The name of the file to check
   * @returns True if file exists, false otherwise
   *
   * @example
   * ```typescript
   * const exists = await storageService.fileExists('report.pdf');
   * if (exists) {
   *   console.log('File found');
   * }
   * ```
   */
  async fileExists(fileName: string): Promise<boolean> {
    try {
      if (!fileName || fileName.trim() === '') {
        return false;
      }

      const file = this.bucket.file(fileName);
      const [exists] = await file.exists();
      return exists;
    } catch (error) {
      return false;
    }
  }
}
