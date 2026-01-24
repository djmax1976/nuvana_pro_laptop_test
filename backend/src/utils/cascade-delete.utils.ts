/**
 * Cascade Delete Utilities
 *
 * Provides utility functions for properly cascading deletions through
 * related entities. These functions explicitly delete child records
 * that would otherwise be orphaned when using Prisma's deleteMany()
 * which does NOT trigger onDelete: Cascade referential actions.
 *
 * @module cascade-delete.utils
 * @see https://www.prisma.io/docs/concepts/components/prisma-client/relation-queries#cascading-deletes
 */

import { Prisma } from "@prisma/client";

/**
 * Result of cascade delete operation for API keys
 */
export interface CascadeDeleteApiKeysResult {
  /** Number of API keys deleted */
  apiKeysDeleted: number;
  /** Number of API key audit events deleted */
  auditEventsDeleted: number;
  /** Number of API key sync sessions deleted */
  syncSessionsDeleted: number;
}

/**
 * Cascade delete API keys and related data for given store IDs.
 *
 * This function ensures proper deletion order (children first) to satisfy
 * foreign key constraints:
 * 1. Delete ApiKeySyncSession records (FK → ApiKey)
 * 2. Delete ApiKeyAuditEvent records (FK → ApiKey)
 * 3. Delete ApiKey records (FK → Store, Company)
 *
 * @param tx - Prisma transaction client
 * @param storeIds - Array of store IDs whose API keys should be deleted
 * @returns Promise with counts of deleted records
 *
 * @example
 * ```typescript
 * await prisma.$transaction(async (tx) => {
 *   const stores = await tx.store.findMany({
 *     where: { company_id: companyId },
 *     select: { store_id: true }
 *   });
 *   const storeIds = stores.map(s => s.store_id);
 *
 *   const result = await cascadeDeleteApiKeys(tx, storeIds);
 *   console.log(`Deleted ${result.apiKeysDeleted} API keys`);
 * });
 * ```
 */
export async function cascadeDeleteApiKeys(
  tx: Prisma.TransactionClient,
  storeIds: string[]
): Promise<CascadeDeleteApiKeysResult> {
  // Early return for empty input
  if (!storeIds || storeIds.length === 0) {
    return { apiKeysDeleted: 0, auditEventsDeleted: 0, syncSessionsDeleted: 0 };
  }

  // Get API key IDs first to ensure we have the correct scope
  const apiKeys = await tx.apiKey.findMany({
    where: { store_id: { in: storeIds } },
    select: { api_key_id: true },
  });
  const apiKeyIds = apiKeys.map((k) => k.api_key_id);

  // No API keys to delete
  if (apiKeyIds.length === 0) {
    return { apiKeysDeleted: 0, auditEventsDeleted: 0, syncSessionsDeleted: 0 };
  }

  // Delete in correct order (children first to satisfy FK constraints)

  // 1. Delete sync sessions
  const syncSessionsResult = await tx.apiKeySyncSession.deleteMany({
    where: { api_key_id: { in: apiKeyIds } },
  });

  // 2. Delete audit events
  const auditEventsResult = await tx.apiKeyAuditEvent.deleteMany({
    where: { api_key_id: { in: apiKeyIds } },
  });

  // 3. Delete API keys
  const apiKeysResult = await tx.apiKey.deleteMany({
    where: { api_key_id: { in: apiKeyIds } },
  });

  return {
    apiKeysDeleted: apiKeysResult.count,
    auditEventsDeleted: auditEventsResult.count,
    syncSessionsDeleted: syncSessionsResult.count,
  };
}

/**
 * Cascade delete API keys for a specific company ID.
 *
 * Convenience function that first retrieves all stores for a company,
 * then cascades the deletion to all API keys for those stores.
 *
 * @param tx - Prisma transaction client
 * @param companyId - Company ID whose stores' API keys should be deleted
 * @returns Promise with counts of deleted records
 */
export async function cascadeDeleteApiKeysForCompany(
  tx: Prisma.TransactionClient,
  companyId: string
): Promise<CascadeDeleteApiKeysResult> {
  if (!companyId) {
    return { apiKeysDeleted: 0, auditEventsDeleted: 0, syncSessionsDeleted: 0 };
  }

  // Get all stores for this company
  const stores = await tx.store.findMany({
    where: { company_id: companyId },
    select: { store_id: true },
  });
  const storeIds = stores.map((s) => s.store_id);

  return cascadeDeleteApiKeys(tx, storeIds);
}

/**
 * Cascade delete API keys for multiple company IDs.
 *
 * Convenience function for batch deletion across multiple companies.
 *
 * @param tx - Prisma transaction client
 * @param companyIds - Array of company IDs whose stores' API keys should be deleted
 * @returns Promise with aggregated counts of deleted records
 */
export async function cascadeDeleteApiKeysForCompanies(
  tx: Prisma.TransactionClient,
  companyIds: string[]
): Promise<CascadeDeleteApiKeysResult> {
  if (!companyIds || companyIds.length === 0) {
    return { apiKeysDeleted: 0, auditEventsDeleted: 0, syncSessionsDeleted: 0 };
  }

  // Get all stores for these companies
  const stores = await tx.store.findMany({
    where: { company_id: { in: companyIds } },
    select: { store_id: true },
  });
  const storeIds = stores.map((s) => s.store_id);

  return cascadeDeleteApiKeys(tx, storeIds);
}
