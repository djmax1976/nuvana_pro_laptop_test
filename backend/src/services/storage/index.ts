/**
 * Storage Module - Public API
 *
 * Export all storage-related functionality for use by other modules.
 *
 * @module storage
 */

// Factory and utilities
export {
  getStorageProvider,
  getStorageProviderByType,
  clearStorageProviderCache,
  generateStorageKey,
  getStorageConfig,
} from "./storage.factory";

// Provider implementations
export { S3StorageProvider, getS3StorageProvider } from "./s3-storage.provider";
export {
  LocalStorageProvider,
  getLocalStorageProvider,
} from "./local-storage.provider";

// Interfaces and types
export type { StorageConfig } from "./storage-provider.interface";
export {
  BaseStorageProvider,
  getStorageConfig as getStorageConfigFromEnv,
} from "./storage-provider.interface";

// Re-export types from document-scanning.types
export type {
  IStorageProvider,
  StorageUploadResult,
} from "../../types/document-scanning.types";
