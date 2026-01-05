/**
 * AWS S3 Storage Provider
 *
 * Enterprise-grade S3 storage implementation for scanned documents.
 * Also compatible with S3-compatible services (Cloudflare R2, MinIO).
 *
 * Enterprise coding standards applied:
 * - SEC-015: Secure file storage with proper permissions
 * - DB-003: TLS for all connections, credential rotation support
 * - API-003: Structured error handling with retry logic
 * - LM-001: Comprehensive logging for audit trail
 *
 * @module s3-storage.provider
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  StorageProvider,
  StorageUploadResult,
  DocumentScanError,
  DocumentScanErrorCode,
} from "../../types/document-scanning.types";
import {
  BaseStorageProvider,
  StorageConfig,
  getStorageConfig,
} from "./storage-provider.interface";

/**
 * AWS S3 Storage Provider Implementation
 *
 * Features:
 * - Automatic retry with exponential backoff
 * - Presigned URLs for secure, temporary access
 * - Support for S3-compatible endpoints (R2, MinIO)
 * - Server-side encryption (AES-256)
 */
export class S3StorageProvider extends BaseStorageProvider {
  readonly provider = StorageProvider.S3;

  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly config: StorageConfig;

  constructor(config?: StorageConfig) {
    super();
    this.config = config || getStorageConfig();

    if (!this.config.bucket) {
      throw new Error(
        "S3 bucket name is required. Set STORAGE_BUCKET or AWS_S3_BUCKET environment variable.",
      );
    }

    if (!this.config.accessKeyId || !this.config.secretAccessKey) {
      throw new Error(
        "S3 credentials are required. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.",
      );
    }

    this.bucket = this.config.bucket;

    // Initialize S3 client with optional custom endpoint (for R2/MinIO)
    const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
      region: this.config.region || "us-east-1",
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
      // Retry configuration for reliability
      maxAttempts: 3,
    };

    // Custom endpoint for S3-compatible services (Cloudflare R2, MinIO)
    if (this.config.endpoint) {
      clientConfig.endpoint = this.config.endpoint;
      clientConfig.forcePathStyle = true; // Required for most S3-compatible services
    }

    this.client = new S3Client(clientConfig);

    console.log(
      `[S3StorageProvider] Initialized with bucket: ${this.bucket}, region: ${this.config.region}`,
    );
  }

  /**
   * Upload a file to S3.
   *
   * SEC-015: Server-side encryption enabled by default.
   * API-003: Structured error response on failure.
   *
   * @param key - Storage key/path (use generateStorageKey)
   * @param data - File data as Buffer
   * @param mimeType - MIME type for Content-Type header
   * @returns Upload result with path and presigned URL
   */
  async upload(
    key: string,
    data: Buffer,
    mimeType: string,
  ): Promise<StorageUploadResult> {
    const startTime = Date.now();

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: mimeType,
        // SEC-015: Server-side encryption
        ServerSideEncryption: "AES256",
        // Metadata for audit trail
        Metadata: {
          "upload-timestamp": new Date().toISOString(),
        },
      });

      await this.client.send(command);

      // Generate presigned URL for immediate access (1 hour validity)
      const url = await this.getPresignedUrl(key, 3600);

      this.logOperation("upload", key, true, Date.now() - startTime);

      return {
        success: true,
        provider: this.provider,
        bucket: this.bucket,
        key,
        region: this.config.region,
        url,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown S3 upload error";

      this.logOperation(
        "upload",
        key,
        false,
        Date.now() - startTime,
        errorMessage,
      );

      return {
        success: false,
        provider: this.provider,
        key,
        error: `S3 upload failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Generate a presigned URL for temporary access to a file.
   *
   * SEC-015: Time-limited access prevents unauthorized sharing.
   *
   * @param key - Storage key/path
   * @param expiresInSeconds - URL validity duration (max 7 days for S3)
   * @returns Presigned URL string
   */
  async getPresignedUrl(
    key: string,
    expiresInSeconds: number,
  ): Promise<string> {
    const startTime = Date.now();

    try {
      // S3 max presigned URL validity is 7 days (604800 seconds)
      const validExpiry = Math.min(expiresInSeconds, 604800);

      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const url = await getSignedUrl(this.client, command, {
        expiresIn: validExpiry,
      });

      this.logOperation("getPresignedUrl", key, true, Date.now() - startTime);

      return url;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown S3 presign error";

      this.logOperation(
        "getPresignedUrl",
        key,
        false,
        Date.now() - startTime,
        errorMessage,
      );

      throw new DocumentScanError(
        DocumentScanErrorCode.STORAGE_FAILED,
        `Failed to generate presigned URL: ${errorMessage}`,
        { key },
      );
    }
  }

  /**
   * Delete a file from S3.
   *
   * @param key - Storage key/path
   * @returns Success indicator
   */
  async delete(key: string): Promise<boolean> {
    const startTime = Date.now();

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);

      this.logOperation("delete", key, true, Date.now() - startTime);

      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown S3 delete error";

      this.logOperation(
        "delete",
        key,
        false,
        Date.now() - startTime,
        errorMessage,
      );

      return false;
    }
  }

  /**
   * Check if a file exists in S3.
   *
   * @param key - Storage key/path
   * @returns Existence indicator
   */
  async exists(key: string): Promise<boolean> {
    const startTime = Date.now();

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);

      this.logOperation("exists", key, true, Date.now() - startTime);

      return true;
    } catch (error) {
      // NotFound is expected, not an error
      if (
        error instanceof Error &&
        (error.name === "NotFound" || error.name === "NoSuchKey")
      ) {
        this.logOperation("exists", key, true, Date.now() - startTime);
        return false;
      }

      const errorMessage =
        error instanceof Error ? error.message : "Unknown S3 head error";

      this.logOperation(
        "exists",
        key,
        false,
        Date.now() - startTime,
        errorMessage,
      );

      return false;
    }
  }
}

/**
 * Singleton instance for the S3 storage provider.
 * Lazy initialization to avoid startup errors if S3 is not configured.
 */
let s3ProviderInstance: S3StorageProvider | null = null;

/**
 * Get the S3 storage provider instance.
 * Creates instance on first call (lazy initialization).
 *
 * @returns S3StorageProvider instance
 * @throws Error if S3 is not properly configured
 */
export function getS3StorageProvider(): S3StorageProvider {
  if (!s3ProviderInstance) {
    s3ProviderInstance = new S3StorageProvider();
  }
  return s3ProviderInstance;
}
