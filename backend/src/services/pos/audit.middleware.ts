/**
 * Audit Middleware for POS Adapters
 *
 * ============================================================================
 * MANDATORY MIDDLEWARE - ALL ADAPTERS MUST USE THIS
 * ============================================================================
 *
 * This middleware wraps adapter methods to ensure audit records are created
 * for every data exchange operation.
 *
 * Usage:
 *   const auditedAdapter = withAuditMiddleware(adapter, storeContext);
 *
 * @module services/pos/audit.middleware
 * @security All POS data exchanges are logged for compliance
 */

import type { POSAdapter } from "../../types/pos-integration.types";
import type { POSDataCategory } from "@prisma/client";
import {
  posAuditService,
  generateExchangeId,
  type CreateAuditRecordInput,
} from "./audit.service";

// ============================================================================
// Types
// ============================================================================

/**
 * Store context required for audit tracking
 */
export interface StoreContext {
  storeId: string;
  posIntegrationId: string;
  companyId: string;
  userId?: string;
}

/**
 * Options for audit middleware
 */
export interface AuditMiddlewareOptions {
  /** Whether to audit testConnection calls (default: false) */
  auditTestConnection?: boolean;
  /** Whether to log debug information (default: false) */
  debug?: boolean;
}

// ============================================================================
// Method Configuration
// ============================================================================

/**
 * Methods that should be audited
 */
const AUDITABLE_METHODS = [
  "syncDepartments",
  "syncTenderTypes",
  "syncCashiers",
  "syncTaxRates",
  "syncAll",
  "importTransactions",
  "exportPriceBook",
  "exportDepartments",
  "exportTenderTypes",
] as const;

type AuditableMethod = (typeof AUDITABLE_METHODS)[number];

/**
 * Mapping from method names to data categories
 */
const METHOD_TO_CATEGORY: Record<AuditableMethod, POSDataCategory> = {
  syncDepartments: "DEPARTMENT",
  syncTenderTypes: "TENDER_TYPE",
  syncCashiers: "CASHIER",
  syncTaxRates: "TAX_RATE",
  syncAll: "SYSTEM_CONFIG",
  importTransactions: "TRANSACTION",
  exportPriceBook: "PRICEBOOK",
  exportDepartments: "DEPARTMENT",
  exportTenderTypes: "TENDER_TYPE",
};

/**
 * Methods that are exports (OUTBOUND direction)
 */
const EXPORT_METHODS = new Set([
  "exportPriceBook",
  "exportDepartments",
  "exportTenderTypes",
]);

/**
 * Methods that contain financial data
 */
const FINANCIAL_METHODS = new Set([
  "syncTenderTypes",
  "importTransactions",
  "syncAll",
]);

/**
 * Methods that may contain PII
 */
const PII_METHODS = new Set(["syncCashiers"]);

// ============================================================================
// Middleware Implementation
// ============================================================================

/**
 * Check if a method should be audited
 */
function isAuditableMethod(method: string): method is AuditableMethod {
  return AUDITABLE_METHODS.includes(method as AuditableMethod);
}

/**
 * Get data category for a method
 */
function getDataCategoryForMethod(method: AuditableMethod): POSDataCategory {
  return METHOD_TO_CATEGORY[method] ?? "SYSTEM_CONFIG";
}

/**
 * Get direction for a method
 */
function getDirectionForMethod(method: string): "INBOUND" | "OUTBOUND" {
  return EXPORT_METHODS.has(method) ? "OUTBOUND" : "INBOUND";
}

/**
 * Check if method involves financial data
 */
function containsFinancialData(method: string): boolean {
  return FINANCIAL_METHODS.has(method);
}

/**
 * Check if method may contain PII
 */
function containsPiiData(method: string): boolean {
  return PII_METHODS.has(method);
}

/**
 * Wrap an adapter with audit middleware
 * MANDATORY: Use this for all adapter operations
 *
 * @param adapter - The POS adapter to wrap
 * @param context - Store context with IDs for audit tracking
 * @param options - Optional middleware configuration
 * @returns Proxied adapter with audit logging
 *
 * @example
 * ```typescript
 * const adapter = getPOSAdapter(posType);
 * const auditedAdapter = withAuditMiddleware(adapter, {
 *   storeId: store.store_id,
 *   posIntegrationId: integration.pos_integration_id,
 *   companyId: store.company_id,
 *   userId: currentUser.id,
 * });
 *
 * // All sync operations are now audited
 * const departments = await auditedAdapter.syncDepartments(config);
 * ```
 */
export function withAuditMiddleware<T extends POSAdapter>(
  adapter: T,
  context: StoreContext,
  options: AuditMiddlewareOptions = {},
): T {
  const { debug = false } = options;

  return new Proxy(adapter, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      // Only wrap functions
      if (typeof value !== "function") {
        return value;
      }

      const methodName = prop as string;

      // Check if this method should be audited
      if (!isAuditableMethod(methodName)) {
        return value;
      }

      // Return wrapped function with audit logging
      return async function auditedMethod(
        this: T,
        ...args: unknown[]
      ): Promise<unknown> {
        const exchangeId = generateExchangeId("SYNC");
        const dataCategory = getDataCategoryForMethod(methodName);
        const direction = getDirectionForMethod(methodName);

        if (debug) {
          console.log(
            `[AuditMiddleware] Starting ${methodName} for exchange ${exchangeId}`,
          );
        }

        // Create audit record BEFORE processing
        const auditInput: CreateAuditRecordInput = {
          storeId: context.storeId,
          posIntegrationId: context.posIntegrationId,
          companyId: context.companyId,
          exchangeId,
          exchangeType: "SYNC_OPERATION",
          direction,
          dataCategory,
          sourceSystem: direction === "INBOUND" ? adapter.posType : "NUVANA",
          destinationSystem:
            direction === "INBOUND" ? "NUVANA" : adapter.posType,
          containsPii: containsPiiData(methodName),
          containsFinancial: containsFinancialData(methodName),
          accessedByUserId: context.userId,
          accessReason: `Sync ${dataCategory.toLowerCase().replace("_", " ")} from POS`,
        };

        let auditId: string;
        try {
          auditId = await posAuditService.createAuditRecord(auditInput);
        } catch (auditError) {
          // If audit record creation fails, we should NOT proceed with the operation
          console.error(
            `[AuditMiddleware] CRITICAL: Failed to create audit record for ${methodName}:`,
            auditError,
          );
          throw new Error(
            `Audit compliance failure: Cannot proceed without audit record. ${
              auditError instanceof Error ? auditError.message : "Unknown error"
            }`,
          );
        }

        try {
          // Mark as processing
          await posAuditService.startProcessing(auditId);

          // Execute the actual method
          const result = await value.apply(target, args);

          // Update audit record on success
          const recordCount = Array.isArray(result) ? result.length : 1;

          await posAuditService.completeAuditRecord(auditId, recordCount);

          if (debug) {
            console.log(
              `[AuditMiddleware] Completed ${methodName} with ${recordCount} records`,
            );
          }

          return result;
        } catch (error) {
          // Update audit record on failure
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          const errorCode =
            error instanceof Error && "code" in error
              ? String((error as { code?: unknown }).code)
              : "SYNC_ERROR";

          await posAuditService.failAuditRecord(
            auditId,
            errorCode,
            errorMessage,
          );

          if (debug) {
            console.log(
              `[AuditMiddleware] Failed ${methodName}: ${errorMessage}`,
            );
          }

          // Re-throw the original error
          throw error;
        }
      };
    },
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create an audit record manually for operations not covered by middleware
 *
 * Use this for custom operations like file imports/exports that aren't
 * standard adapter methods.
 *
 * @example
 * ```typescript
 * const auditId = await createManualAuditRecord({
 *   context,
 *   exchangeType: "FILE_IMPORT",
 *   dataCategory: "TRANSACTION",
 *   direction: "INBOUND",
 *   sourceSystem: "GILBARCO_PASSPORT",
 *   sourceIdentifier: "/path/to/TLog_20251219.xml",
 * });
 *
 * try {
 *   const result = await processFile(filePath);
 *   await posAuditService.completeAuditRecord(auditId, result.count);
 * } catch (error) {
 *   await posAuditService.failAuditRecord(auditId, "IMPORT_ERROR", error.message);
 *   throw error;
 * }
 * ```
 */
export async function createManualAuditRecord(params: {
  context: StoreContext;
  exchangeType: CreateAuditRecordInput["exchangeType"];
  dataCategory: POSDataCategory;
  direction: "INBOUND" | "OUTBOUND";
  sourceSystem: string;
  sourceIdentifier?: string;
  destinationSystem?: string;
  destinationIdentifier?: string;
  containsPii?: boolean;
  containsFinancial?: boolean;
  accessReason?: string;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const exchangeId = generateExchangeId(
    params.exchangeType === "FILE_IMPORT" ||
      params.exchangeType === "FILE_EXPORT"
      ? "FILE"
      : "OP",
  );

  return posAuditService.createAuditRecord({
    storeId: params.context.storeId,
    posIntegrationId: params.context.posIntegrationId,
    companyId: params.context.companyId,
    exchangeId,
    exchangeType: params.exchangeType,
    direction: params.direction,
    dataCategory: params.dataCategory,
    sourceSystem: params.sourceSystem,
    sourceIdentifier: params.sourceIdentifier,
    destinationSystem:
      params.destinationSystem ??
      (params.direction === "INBOUND" ? "NUVANA" : params.sourceSystem),
    destinationIdentifier: params.destinationIdentifier,
    containsPii: params.containsPii,
    containsFinancial: params.containsFinancial,
    accessedByUserId: params.context.userId,
    accessReason: params.accessReason,
    metadata: params.metadata,
  });
}

/**
 * Wrap a function with audit tracking
 *
 * Use this for wrapping arbitrary async operations with audit logging.
 *
 * @example
 * ```typescript
 * const importResult = await withAuditTracking(
 *   context,
 *   "FILE_IMPORT",
 *   "TRANSACTION",
 *   "INBOUND",
 *   "GILBARCO_PASSPORT",
 *   async () => {
 *     return await importTransactionsFromFile(filePath);
 *   },
 *   {
 *     sourceIdentifier: filePath,
 *     accessReason: "Daily transaction import",
 *   }
 * );
 * ```
 */
export async function withAuditTracking<T>(
  context: StoreContext,
  exchangeType: CreateAuditRecordInput["exchangeType"],
  dataCategory: POSDataCategory,
  direction: "INBOUND" | "OUTBOUND",
  sourceSystem: string,
  fn: () => Promise<T>,
  options?: {
    sourceIdentifier?: string;
    destinationSystem?: string;
    destinationIdentifier?: string;
    containsPii?: boolean;
    containsFinancial?: boolean;
    accessReason?: string;
    metadata?: Record<string, unknown>;
    getRecordCount?: (result: T) => number;
    getDataSize?: (result: T) => number;
    getFileHash?: (result: T) => string;
  },
): Promise<T> {
  const auditId = await createManualAuditRecord({
    context,
    exchangeType,
    dataCategory,
    direction,
    sourceSystem,
    ...options,
  });

  try {
    await posAuditService.startProcessing(auditId);

    const result = await fn();

    // Calculate metrics if handlers provided
    const recordCount = options?.getRecordCount?.(result) ?? 1;
    const dataSize = options?.getDataSize?.(result);
    const fileHash = options?.getFileHash?.(result);

    await posAuditService.completeAuditRecord(
      auditId,
      recordCount,
      dataSize ? BigInt(dataSize) : undefined,
      fileHash,
    );

    return result;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const errorCode =
      error instanceof Error && "code" in error
        ? String((error as { code?: unknown }).code)
        : "OPERATION_ERROR";

    await posAuditService.failAuditRecord(auditId, errorCode, errorMessage);

    throw error;
  }
}
