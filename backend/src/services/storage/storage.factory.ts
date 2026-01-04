/**
 * Storage Provider Factory
 *
 * Factory for creating storage provider instances based on configuration.
 * Enables runtime switching between S3, R2, Azure, and local storage.
 *
 * Enterprise coding standards applied:
 * - SEC-015: Provider selection via environment config
 * - API-003: Structured error handling
 * - LM-001: Logging for provider initialization
 *
 * @module storage.factory
 */

import {
  StorageProvider,
  IStorageProvider,
} from "../../types/document-scanning.types";
import { getStorageConfig } from "./storage-provider.interface";
import { S3StorageProvider, getS3StorageProvider } from "./s3-storage.provider";
import {
  LocalStorageProvider,
  getLocalStorageProvider,
} from "./local-storage.provider";

/**
 * Cached provider instances by type.
 * Ensures singleton pattern per provider type.
 */
const providerCache: Map<StorageProvider, IStorageProvider> = new Map();

/**
 * Get storage provider instance based on environment configuration.
 *
 * Provider is determined by STORAGE_PROVIDER environment variable:
 * - "S3" or "R2" -> S3StorageProvider (R2 is S3-compatible)
 * - "LOCAL" -> LocalStorageProvider (development only)
 * - "AZURE" -> AzureStorageProvider (not yet implemented)
 *
 * @returns Storage provider instance
 * @throws Error if provider type is not supported
 */
export function getStorageProvider(): IStorageProvider {
  const config = getStorageConfig();
  const providerType = config.provider;

  // Return cached instance if available
  const cached = providerCache.get(providerType);
  if (cached) {
    return cached;
  }

  let provider: IStorageProvider;

  switch (providerType) {
    case StorageProvider.S3:
    case StorageProvider.R2:
      // R2 uses S3-compatible API with custom endpoint
      provider = getS3StorageProvider();
      break;

    case StorageProvider.LOCAL:
      console.warn(
        "[StorageFactory] Using LOCAL storage provider. This is for development only.",
      );
      provider = getLocalStorageProvider();
      break;

    case StorageProvider.AZURE:
      throw new Error(
        "Azure storage provider is not yet implemented. Please use S3 or LOCAL.",
      );

    default:
      throw new Error(
        `Unknown storage provider: ${providerType}. Supported: S3, R2, LOCAL`,
      );
  }

  // Cache the instance
  providerCache.set(providerType, provider);

  console.log(`[StorageFactory] Initialized storage provider: ${providerType}`);

  return provider;
}

/**
 * Clear provider cache.
 * Useful for testing or reconfiguration.
 */
export function clearStorageProviderCache(): void {
  providerCache.clear();
  console.log("[StorageFactory] Provider cache cleared");
}

/**
 * Get specific storage provider by type.
 * Bypasses environment configuration.
 *
 * @param type - Storage provider type
 * @returns Storage provider instance
 */
export function getStorageProviderByType(
  type: StorageProvider,
): IStorageProvider {
  switch (type) {
    case StorageProvider.S3:
    case StorageProvider.R2:
      return new S3StorageProvider();

    case StorageProvider.LOCAL:
      return new LocalStorageProvider();

    case StorageProvider.AZURE:
      throw new Error("Azure storage provider is not yet implemented.");

    default:
      throw new Error(`Unknown storage provider: ${type}`);
  }
}

// Re-export utilities for convenience
export {
  generateStorageKey,
  getStorageConfig,
} from "./storage-provider.interface";
export { S3StorageProvider } from "./s3-storage.provider";
export { LocalStorageProvider } from "./local-storage.provider";
