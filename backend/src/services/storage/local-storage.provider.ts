/**
 * Local Filesystem Storage Provider
 *
 * Development-only storage provider using local filesystem.
 * NOT recommended for production - use S3/R2 instead.
 *
 * Enterprise coding standards applied:
 * - SEC-015: File stored outside web root with restricted names
 * - API-003: Structured error handling
 * - LM-001: Comprehensive logging
 *
 * @module local-storage.provider
 */

import * as fs from "fs/promises";
import * as path from "path";
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
 * Local Filesystem Storage Provider Implementation
 *
 * WARNING: This provider is for development/testing only.
 * Does not provide presigned URLs - returns file:// paths instead.
 */
export class LocalStorageProvider extends BaseStorageProvider {
  readonly provider = StorageProvider.LOCAL;

  private readonly basePath: string;

  constructor(config?: StorageConfig) {
    super();
    const storageConfig = config || getStorageConfig();

    // SEC-015: Use path outside web root
    this.basePath = path.resolve(
      storageConfig.localPath || "./uploads/scanned-documents",
    );

    console.log(
      `[LocalStorageProvider] Initialized with base path: ${this.basePath}`,
    );
    console.warn(
      "[LocalStorageProvider] WARNING: Local storage is for development only. Use S3 in production.",
    );
  }

  /**
   * Ensure directory exists for a given key.
   */
  private async ensureDirectory(key: string): Promise<void> {
    const fullPath = path.join(this.basePath, key);
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true, mode: 0o755 });
  }

  /**
   * Upload a file to local filesystem.
   *
   * SEC-015: Files stored with restricted permissions (644).
   *
   * @param key - Storage key/path
   * @param data - File data as Buffer
   * @param mimeType - MIME type (stored in metadata file)
   * @returns Upload result
   */
  async upload(
    key: string,
    data: Buffer,
    mimeType: string,
  ): Promise<StorageUploadResult> {
    const startTime = Date.now();
    const fullPath = path.join(this.basePath, key);

    try {
      await this.ensureDirectory(key);

      // Write file with restricted permissions (owner read/write, group/others read)
      await fs.writeFile(fullPath, data, { mode: 0o644 });

      // Write metadata file for MIME type
      const metadataPath = `${fullPath}.meta.json`;
      await fs.writeFile(
        metadataPath,
        JSON.stringify({
          mimeType,
          uploadedAt: new Date().toISOString(),
          size: data.length,
        }),
        { mode: 0o644 },
      );

      this.logOperation("upload", key, true, Date.now() - startTime);

      return {
        success: true,
        provider: this.provider,
        bucket: "local",
        key,
        // Local storage can't provide HTTP URLs
        url: `file://${fullPath}`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown local storage error";

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
        error: `Local storage upload failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Get file path for local access.
   * Note: Local storage doesn't support true presigned URLs.
   *
   * @param key - Storage key/path
   * @param _expiresInSeconds - Ignored for local storage
   * @returns Local file path
   */
  async getPresignedUrl(
    key: string,
    _expiresInSeconds: number,
  ): Promise<string> {
    const startTime = Date.now();
    const fullPath = path.join(this.basePath, key);

    try {
      // Verify file exists
      await fs.access(fullPath);

      this.logOperation("getPresignedUrl", key, true, Date.now() - startTime);

      // Return file:// URL for local development
      return `file://${fullPath}`;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "File not found";

      this.logOperation(
        "getPresignedUrl",
        key,
        false,
        Date.now() - startTime,
        errorMessage,
      );

      throw new DocumentScanError(
        DocumentScanErrorCode.DOCUMENT_NOT_FOUND,
        `Local file not found: ${errorMessage}`,
        { key },
      );
    }
  }

  /**
   * Delete a file from local filesystem.
   *
   * @param key - Storage key/path
   * @returns Success indicator
   */
  async delete(key: string): Promise<boolean> {
    const startTime = Date.now();
    const fullPath = path.join(this.basePath, key);
    const metadataPath = `${fullPath}.meta.json`;

    try {
      // Delete main file
      await fs.unlink(fullPath);

      // Delete metadata file if exists
      try {
        await fs.unlink(metadataPath);
      } catch {
        // Metadata file might not exist, ignore
      }

      this.logOperation("delete", key, true, Date.now() - startTime);

      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown delete error";

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
   * Check if a file exists in local filesystem.
   *
   * @param key - Storage key/path
   * @returns Existence indicator
   */
  async exists(key: string): Promise<boolean> {
    const startTime = Date.now();
    const fullPath = path.join(this.basePath, key);

    try {
      await fs.access(fullPath);
      this.logOperation("exists", key, true, Date.now() - startTime);
      return true;
    } catch {
      this.logOperation("exists", key, true, Date.now() - startTime);
      return false;
    }
  }

  /**
   * Read a file from local storage (development helper).
   * Not part of IStorageProvider interface.
   *
   * @param key - Storage key/path
   * @returns File buffer
   */
  async read(key: string): Promise<Buffer> {
    const fullPath = path.join(this.basePath, key);
    return fs.readFile(fullPath);
  }
}

/**
 * Singleton instance for local storage provider.
 */
let localProviderInstance: LocalStorageProvider | null = null;

/**
 * Get the local storage provider instance.
 *
 * @returns LocalStorageProvider instance
 */
export function getLocalStorageProvider(): LocalStorageProvider {
  if (!localProviderInstance) {
    localProviderInstance = new LocalStorageProvider();
  }
  return localProviderInstance;
}
