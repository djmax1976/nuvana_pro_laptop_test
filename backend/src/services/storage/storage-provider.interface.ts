/**
 * Storage Provider Interface
 *
 * Abstract interface for cloud storage providers (S3, R2, Azure, Local).
 * Enables flexible storage backend without code changes.
 *
 * Enterprise coding standards applied:
 * - SEC-015: File security with UUID-based names and secure paths
 * - API-003: Structured error handling
 * - LM-001: Structured logging integration
 *
 * @module storage-provider.interface
 */

import {
  StorageProvider,
  StorageUploadResult,
  IStorageProvider,
} from "../../types/document-scanning.types";

/**
 * Storage configuration loaded from environment.
 */
export interface StorageConfig {
  /** Active storage provider */
  provider: StorageProvider;
  /** S3/R2 bucket name */
  bucket?: string;
  /** AWS region or R2 account ID */
  region?: string;
  /** Access key ID */
  accessKeyId?: string;
  /** Secret access key */
  secretAccessKey?: string;
  /** S3 endpoint URL (for R2 or MinIO) */
  endpoint?: string;
  /** Local storage path (for development) */
  localPath?: string;
  /** Azure container name */
  azureContainer?: string;
  /** Azure connection string */
  azureConnectionString?: string;
}

/**
 * Get storage configuration from environment variables.
 * SEC-015: Credentials loaded from env, never hardcoded.
 *
 * @returns Storage configuration object
 */
export function getStorageConfig(): StorageConfig {
  const provider = (process.env.STORAGE_PROVIDER || "LOCAL") as StorageProvider;

  return {
    provider,
    // S3 / R2 configuration
    bucket: process.env.STORAGE_BUCKET || process.env.AWS_S3_BUCKET,
    region: process.env.STORAGE_REGION || process.env.AWS_REGION || "us-east-1",
    accessKeyId:
      process.env.STORAGE_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey:
      process.env.STORAGE_SECRET_ACCESS_KEY ||
      process.env.AWS_SECRET_ACCESS_KEY,
    endpoint: process.env.STORAGE_ENDPOINT, // For R2 or custom S3-compatible
    // Local storage
    localPath: process.env.STORAGE_LOCAL_PATH || "./uploads",
    // Azure configuration
    azureContainer: process.env.AZURE_STORAGE_CONTAINER,
    azureConnectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
  };
}

/**
 * Generate a secure storage key for scanned documents.
 * SEC-015: UUID-based names prevent path traversal and guessing.
 *
 * @param storeId - Store UUID
 * @param documentId - Document UUID
 * @param originalFilename - Original filename (for extension only)
 * @returns Secure storage key
 */
export function generateStorageKey(
  storeId: string,
  documentId: string,
  originalFilename: string,
): string {
  // Extract extension safely
  const extension = originalFilename.split(".").pop()?.toLowerCase() || "jpg";
  const sanitizedExtension = extension.replace(/[^a-z0-9]/g, "");

  // Generate date-based path for organization
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");

  // Structure: stores/{store_id}/{year}/{month}/{day}/{document_id}.{ext}
  // SEC-015: No user-controlled path segments, all UUIDs
  return `stores/${storeId}/${year}/${month}/${day}/${documentId}.${sanitizedExtension}`;
}

/**
 * Abstract base class for storage providers.
 * Provides common functionality and logging.
 */
export abstract class BaseStorageProvider implements IStorageProvider {
  abstract readonly provider: StorageProvider;

  abstract upload(
    key: string,
    data: Buffer,
    mimeType: string,
  ): Promise<StorageUploadResult>;

  abstract getPresignedUrl(
    key: string,
    expiresInSeconds: number,
  ): Promise<string>;

  abstract delete(key: string): Promise<boolean>;

  abstract exists(key: string): Promise<boolean>;

  /**
   * Log storage operation for audit trail.
   * LM-001: Structured logging without sensitive data.
   */
  protected logOperation(
    operation: string,
    key: string,
    success: boolean,
    durationMs?: number,
    error?: string,
  ): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      provider: this.provider,
      operation,
      key: this.sanitizeKeyForLog(key),
      success,
      durationMs,
      ...(error && { error }),
    };

    if (success) {
      console.log("[StorageProvider]", JSON.stringify(logEntry));
    } else {
      console.error("[StorageProvider]", JSON.stringify(logEntry));
    }
  }

  /**
   * Sanitize storage key for logging.
   * Removes potential sensitive info while keeping structure.
   */
  private sanitizeKeyForLog(key: string): string {
    // Keep only path structure, not full UUIDs
    return key.replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "[UUID]",
    );
  }
}
