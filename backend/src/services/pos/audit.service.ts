/**
 * POS Data Exchange Audit Service
 *
 * ============================================================================
 * MANDATORY SERVICE - DO NOT BYPASS
 * ============================================================================
 *
 * This service MUST be called for every POS data exchange operation.
 * All adapter implementations are REQUIRED to use this service.
 *
 * Compliance requirement: Every data exchange must have an audit trail.
 *
 * Features:
 * - Create audit records before processing any data
 * - Update audit records with processing results
 * - Calculate file hashes for integrity verification
 * - Determine retention policies based on data classification
 * - Query audit records for compliance reporting
 *
 * @module services/pos/audit.service
 * @security Audit records are immutable after success status
 */

import { createHash } from "crypto";
import { prisma } from "../../utils/db";
import type {
  POSExchangeType,
  POSDataCategory,
  POSAuditStatus,
  POSRetentionPolicy,
  Prisma,
} from "@prisma/client";

// ============================================================================
// Types
// ============================================================================

/**
 * Input for creating an audit record
 */
export interface CreateAuditRecordInput {
  storeId: string;
  posIntegrationId: string;
  companyId: string;
  exchangeId: string;
  exchangeType: POSExchangeType;
  direction: "INBOUND" | "OUTBOUND";
  dataCategory: POSDataCategory;
  sourceSystem: string;
  sourceIdentifier?: string;
  destinationSystem: string;
  destinationIdentifier?: string;
  containsPii?: boolean;
  containsFinancial?: boolean;
  accessedByUserId?: string;
  accessReason?: string;
  jurisdiction?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Input for updating an audit record
 */
export interface UpdateAuditRecordInput {
  status: POSAuditStatus;
  recordCount?: number;
  dataSizeBytes?: bigint | number;
  fileHash?: string;
  errorCode?: string;
  errorMessage?: string;
  completedAt?: Date;
}

/**
 * Filters for querying audit records
 */
export interface AuditQueryFilters {
  storeId?: string;
  companyId?: string;
  posIntegrationId?: string;
  dataCategory?: POSDataCategory;
  containsPii?: boolean;
  containsFinancial?: boolean;
  status?: POSAuditStatus;
  fromDate?: Date;
  toDate?: Date;
  exchangeType?: POSExchangeType;
  direction?: "INBOUND" | "OUTBOUND";
  jurisdiction?: string;
  limit?: number;
  offset?: number;
}

/**
 * Summary of audit records for reporting
 */
export interface AuditSummary {
  totalRecords: number;
  successCount: number;
  failedCount: number;
  piiCount: number;
  financialCount: number;
  byCategory: Record<string, number>;
  byExchangeType: Record<string, number>;
}

// ============================================================================
// Retention Policy Configuration
// ============================================================================

/**
 * Retention durations in years
 */
const RETENTION_YEARS: Record<POSRetentionPolicy, number | null> = {
  STANDARD: 7, // 7 years for financial records
  EXTENDED: 10, // 10 years
  PERMANENT: null, // Never expires
  PII_RESTRICTED: 2, // 2 years or upon request
};

// ============================================================================
// Service Class
// ============================================================================

/**
 * POS Data Exchange Audit Service
 *
 * Provides mandatory audit trail functionality for all POS data exchanges.
 */
export class POSAuditService {
  // ============================================================================
  // Audit Record Creation
  // ============================================================================

  /**
   * MANDATORY: Create audit record BEFORE processing any data
   *
   * @throws Error if audit record cannot be created (processing must not proceed)
   */
  async createAuditRecord(input: CreateAuditRecordInput): Promise<string> {
    const retentionPolicy = this.determineRetentionPolicy(
      input.dataCategory,
      input.containsPii,
    );
    const retentionExpiresAt = this.calculateRetentionExpiry(retentionPolicy);

    // Determine financial flag based on data category if not explicitly set
    const containsFinancial =
      input.containsFinancial ??
      (input.dataCategory === "TRANSACTION" ||
        input.dataCategory === "FINANCIAL");

    const record = await prisma.pOSDataExchangeAudit.create({
      data: {
        store_id: input.storeId,
        pos_integration_id: input.posIntegrationId,
        company_id: input.companyId,
        exchange_id: input.exchangeId,
        exchange_type: input.exchangeType,
        direction: input.direction,
        data_category: input.dataCategory,
        contains_pii: input.containsPii ?? false,
        contains_financial: containsFinancial,
        source_system: input.sourceSystem,
        source_identifier: input.sourceIdentifier,
        destination_system: input.destinationSystem,
        destination_identifier: input.destinationIdentifier,
        retention_policy: retentionPolicy,
        retention_expires_at: retentionExpiresAt,
        jurisdiction: input.jurisdiction ?? "US",
        accessed_by_user_id: input.accessedByUserId,
        access_reason: input.accessReason,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        status: "PENDING",
        initiated_at: new Date(),
      },
    });

    console.log(
      `[POSAuditService] Created audit record ${record.audit_id} for exchange ${input.exchangeId}`,
    );

    return record.audit_id;
  }

  // ============================================================================
  // Audit Record Updates
  // ============================================================================

  /**
   * MANDATORY: Update audit record after processing completes
   */
  async updateAuditRecord(
    auditId: string,
    input: UpdateAuditRecordInput,
  ): Promise<void> {
    await prisma.pOSDataExchangeAudit.update({
      where: { audit_id: auditId },
      data: {
        status: input.status,
        record_count: input.recordCount,
        data_size_bytes: input.dataSizeBytes
          ? BigInt(input.dataSizeBytes)
          : undefined,
        file_hash: input.fileHash,
        error_code: input.errorCode,
        error_message: input.errorMessage,
        completed_at: input.completedAt ?? new Date(),
      },
    });

    console.log(
      `[POSAuditService] Updated audit record ${auditId} with status ${input.status}`,
    );
  }

  /**
   * Mark audit record as successfully completed
   */
  async completeAuditRecord(
    auditId: string,
    recordCount: number,
    dataSizeBytes?: bigint | number,
    fileHash?: string,
  ): Promise<void> {
    await this.updateAuditRecord(auditId, {
      status: "SUCCESS",
      recordCount,
      dataSizeBytes,
      fileHash,
      completedAt: new Date(),
    });
  }

  /**
   * Mark audit record as failed
   */
  async failAuditRecord(
    auditId: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<void> {
    await this.updateAuditRecord(auditId, {
      status: "FAILED",
      errorCode,
      errorMessage,
      completedAt: new Date(),
    });
  }

  /**
   * Mark audit record as partially successful
   */
  async partialAuditRecord(
    auditId: string,
    recordCount: number,
    errorCode: string,
    errorMessage: string,
  ): Promise<void> {
    await this.updateAuditRecord(auditId, {
      status: "PARTIAL",
      recordCount,
      errorCode,
      errorMessage,
      completedAt: new Date(),
    });
  }

  /**
   * Mark audit record as processing (in progress)
   */
  async startProcessing(auditId: string): Promise<void> {
    await prisma.pOSDataExchangeAudit.update({
      where: { audit_id: auditId },
      data: {
        status: "PROCESSING",
      },
    });
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * Query audit records with filters
   */
  async queryAuditRecords(filters: AuditQueryFilters) {
    const where: Prisma.POSDataExchangeAuditWhereInput = {};

    if (filters.storeId) {
      where.store_id = filters.storeId;
    }
    if (filters.companyId) {
      where.company_id = filters.companyId;
    }
    if (filters.posIntegrationId) {
      where.pos_integration_id = filters.posIntegrationId;
    }
    if (filters.dataCategory) {
      where.data_category = filters.dataCategory;
    }
    if (filters.containsPii !== undefined) {
      where.contains_pii = filters.containsPii;
    }
    if (filters.containsFinancial !== undefined) {
      where.contains_financial = filters.containsFinancial;
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.exchangeType) {
      where.exchange_type = filters.exchangeType;
    }
    if (filters.direction) {
      where.direction = filters.direction;
    }
    if (filters.jurisdiction) {
      where.jurisdiction = filters.jurisdiction;
    }
    if (filters.fromDate || filters.toDate) {
      where.initiated_at = {};
      if (filters.fromDate) {
        where.initiated_at.gte = filters.fromDate;
      }
      if (filters.toDate) {
        where.initiated_at.lte = filters.toDate;
      }
    }

    return prisma.pOSDataExchangeAudit.findMany({
      where,
      orderBy: { initiated_at: "desc" },
      take: filters.limit ?? 100,
      skip: filters.offset ?? 0,
    });
  }

  /**
   * Get a single audit record by ID
   */
  async getAuditRecord(auditId: string) {
    return prisma.pOSDataExchangeAudit.findUnique({
      where: { audit_id: auditId },
    });
  }

  /**
   * Get audit records by exchange ID (for grouped operations)
   */
  async getAuditRecordsByExchangeId(exchangeId: string) {
    return prisma.pOSDataExchangeAudit.findMany({
      where: { exchange_id: exchangeId },
      orderBy: { initiated_at: "asc" },
    });
  }

  /**
   * Get audit summary for compliance reporting
   */
  async getAuditSummary(filters: {
    storeId?: string;
    companyId?: string;
    fromDate?: Date;
    toDate?: Date;
  }): Promise<AuditSummary> {
    const where: Prisma.POSDataExchangeAuditWhereInput = {};

    if (filters.storeId) {
      where.store_id = filters.storeId;
    }
    if (filters.companyId) {
      where.company_id = filters.companyId;
    }
    if (filters.fromDate || filters.toDate) {
      where.initiated_at = {};
      if (filters.fromDate) {
        where.initiated_at.gte = filters.fromDate;
      }
      if (filters.toDate) {
        where.initiated_at.lte = filters.toDate;
      }
    }

    // Get total count
    const totalRecords = await prisma.pOSDataExchangeAudit.count({ where });

    // Get success count
    const successCount = await prisma.pOSDataExchangeAudit.count({
      where: { ...where, status: "SUCCESS" },
    });

    // Get failed count
    const failedCount = await prisma.pOSDataExchangeAudit.count({
      where: { ...where, status: "FAILED" },
    });

    // Get PII count
    const piiCount = await prisma.pOSDataExchangeAudit.count({
      where: { ...where, contains_pii: true },
    });

    // Get financial count
    const financialCount = await prisma.pOSDataExchangeAudit.count({
      where: { ...where, contains_financial: true },
    });

    // Get by category
    const byCategory = await prisma.pOSDataExchangeAudit.groupBy({
      by: ["data_category"],
      where,
      _count: { audit_id: true },
    });

    // Get by exchange type
    const byExchangeType = await prisma.pOSDataExchangeAudit.groupBy({
      by: ["exchange_type"],
      where,
      _count: { audit_id: true },
    });

    return {
      totalRecords,
      successCount,
      failedCount,
      piiCount,
      financialCount,
      byCategory: Object.fromEntries(
        byCategory.map((c) => [c.data_category, c._count.audit_id]),
      ),
      byExchangeType: Object.fromEntries(
        byExchangeType.map((e) => [e.exchange_type, e._count.audit_id]),
      ),
    };
  }

  // ============================================================================
  // PII Report Generation
  // ============================================================================

  /**
   * Get PII access report for compliance
   */
  async getPIIAccessReport(filters: {
    companyId?: string;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
    offset?: number;
  }) {
    const where: Prisma.POSDataExchangeAuditWhereInput = {
      contains_pii: true,
    };

    if (filters.companyId) {
      where.company_id = filters.companyId;
    }
    if (filters.fromDate || filters.toDate) {
      where.initiated_at = {};
      if (filters.fromDate) {
        where.initiated_at.gte = filters.fromDate;
      }
      if (filters.toDate) {
        where.initiated_at.lte = filters.toDate;
      }
    }

    return prisma.pOSDataExchangeAudit.findMany({
      where,
      include: {
        accessed_by: {
          select: {
            user_id: true,
            name: true,
            email: true,
          },
        },
        store: {
          select: {
            store_id: true,
            name: true,
          },
        },
      },
      orderBy: { initiated_at: "desc" },
      take: filters.limit ?? 100,
      skip: filters.offset ?? 0,
    });
  }

  // ============================================================================
  // Retention Management
  // ============================================================================

  /**
   * Get records that have passed their retention expiry
   */
  async getExpiredRecords(limit = 1000) {
    return prisma.pOSDataExchangeAudit.findMany({
      where: {
        retention_expires_at: {
          lt: new Date(),
        },
      },
      take: limit,
    });
  }

  /**
   * Delete expired records (for scheduled retention cleanup)
   * CAUTION: This permanently deletes audit records
   */
  async deleteExpiredRecords(): Promise<number> {
    const result = await prisma.pOSDataExchangeAudit.deleteMany({
      where: {
        retention_expires_at: {
          lt: new Date(),
        },
      },
    });

    if (result.count > 0) {
      console.log(
        `[POSAuditService] Deleted ${result.count} expired audit records`,
      );
    }

    return result.count;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Calculate file hash for integrity verification
   */
  calculateFileHash(content: string | Buffer): string {
    return createHash("sha256").update(content).digest("hex");
  }

  /**
   * Generate unique exchange ID for grouping related audit records
   */
  generateExchangeId(prefix = "EX"): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}-${timestamp}-${random}`.toUpperCase();
  }

  /**
   * Determine retention policy based on data category
   */
  private determineRetentionPolicy(
    category: POSDataCategory,
    containsPii?: boolean,
  ): POSRetentionPolicy {
    if (containsPii) {
      return "PII_RESTRICTED";
    }

    switch (category) {
      case "TRANSACTION":
      case "FINANCIAL":
        return "STANDARD"; // 7 years for financial records
      case "EMPLOYEE":
      case "CASHIER":
      case "PII":
        return "PII_RESTRICTED";
      default:
        return "STANDARD";
    }
  }

  /**
   * Calculate retention expiry date
   */
  private calculateRetentionExpiry(policy: POSRetentionPolicy): Date | null {
    const years = RETENTION_YEARS[policy];

    if (years === null) {
      return null; // Permanent retention
    }

    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + years);
    return expiryDate;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Singleton instance of POSAuditService
 */
export const posAuditService = new POSAuditService();

// ============================================================================
// Convenience Functions (for module-level imports)
// ============================================================================

/**
 * Create an audit record
 */
export const createAuditRecord = (input: CreateAuditRecordInput) =>
  posAuditService.createAuditRecord(input);

/**
 * Update an audit record
 */
export const updateAuditRecord = (
  auditId: string,
  input: UpdateAuditRecordInput,
) => posAuditService.updateAuditRecord(auditId, input);

/**
 * Complete an audit record successfully
 */
export const completeAuditRecord = (
  auditId: string,
  recordCount: number,
  dataSizeBytes?: bigint | number,
  fileHash?: string,
) =>
  posAuditService.completeAuditRecord(
    auditId,
    recordCount,
    dataSizeBytes,
    fileHash,
  );

/**
 * Fail an audit record
 */
export const failAuditRecord = (
  auditId: string,
  errorCode: string,
  errorMessage: string,
) => posAuditService.failAuditRecord(auditId, errorCode, errorMessage);

/**
 * Calculate file hash
 */
export const calculateFileHash = (content: string | Buffer) =>
  posAuditService.calculateFileHash(content);

/**
 * Generate exchange ID
 */
export const generateExchangeId = (prefix?: string) =>
  posAuditService.generateExchangeId(prefix);
