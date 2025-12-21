/**
 * POS Audit Routes
 *
 * API endpoints for POS data exchange audit trail access and compliance reporting.
 * Phase 0: Data Exchange Audit Infrastructure
 *
 * Routes:
 * - GET    /api/stores/:storeId/pos-audit              - Get audit records for a store
 * - GET    /api/stores/:storeId/pos-audit/summary      - Get audit summary for a store
 * - GET    /api/stores/:storeId/pos-audit/:auditId     - Get specific audit record
 * - GET    /api/admin/pos-audit                        - Query all audit records (admin)
 * - GET    /api/admin/pos-audit/summary                - Get system-wide audit summary (admin)
 * - GET    /api/admin/pos-audit/pii-report             - Generate PII access report (admin)
 * - POST   /api/admin/pos-audit/retention-cleanup      - Trigger retention cleanup (admin)
 *
 * Security:
 * - All endpoints require authentication
 * - Store endpoints enforce store-level access control
 * - Admin endpoints require ADMIN_AUDIT_VIEW permission
 * - PII report requires system admin status
 *
 * @module routes/pos-audit
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  authMiddleware,
  type UserIdentity,
} from "../middleware/auth.middleware";
import { permissionMiddleware } from "../middleware/permission.middleware";
import { ADMIN_AUDIT_VIEW, POS_AUDIT_READ } from "../constants/permissions";
import { posAuditService } from "../services/pos/audit.service";
import { prisma } from "../utils/db";
import {
  StoreIdParamSchema,
  AuditIdParamSchema,
  POSAuditQuerySchema,
  POSAuditAdminQuerySchema,
  POSAuditSummaryQuerySchema,
  POSAuditPIIReportQuerySchema,
  RetentionCleanupRequestSchema,
} from "../schemas/pos-audit.schema";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Verify user has access to the store
 * Returns the store if access is granted, throws otherwise
 */
async function verifyStoreAccess(
  storeId: string,
  user: UserIdentity,
): Promise<{ store_id: string; company_id: string }> {
  const store = await prisma.store.findUnique({
    where: { store_id: storeId },
    select: { store_id: true, company_id: true },
  });

  if (!store) {
    throw { statusCode: 404, message: "Store not found" };
  }

  // System admin has access to all stores
  if (user.is_system_admin) {
    return store;
  }

  // Check if user has access to this store
  const hasAccess =
    user.store_ids?.includes(storeId) ||
    user.company_ids?.includes(store.company_id) ||
    user.client_id === store.company_id;

  if (!hasAccess) {
    throw { statusCode: 403, message: "Access denied to this store" };
  }

  return store;
}

/**
 * Verify user has admin access
 */
function verifyAdminAccess(user: UserIdentity): void {
  if (!user.is_system_admin) {
    throw { statusCode: 403, message: "Admin access required" };
  }
}

/**
 * Sanitize audit record for response (remove internal fields, format dates)
 */
function sanitizeAuditRecord(record: any): any {
  return {
    audit_id: record.audit_id,
    exchange_id: record.exchange_id,
    exchange_type: record.exchange_type,
    direction: record.direction,
    data_category: record.data_category,
    contains_pii: record.contains_pii,
    contains_financial: record.contains_financial,
    source_system: record.source_system,
    source_identifier: record.source_identifier,
    destination_system: record.destination_system,
    destination_identifier: record.destination_identifier,
    record_count: record.record_count,
    data_size_bytes: record.data_size_bytes
      ? Number(record.data_size_bytes)
      : null,
    file_hash: record.file_hash,
    status: record.status,
    error_code: record.error_code,
    error_message: record.error_message,
    retention_policy: record.retention_policy,
    retention_expires_at: record.retention_expires_at,
    jurisdiction: record.jurisdiction,
    access_reason: record.access_reason,
    initiated_at: record.initiated_at,
    completed_at: record.completed_at,
    store_id: record.store_id,
    pos_integration_id: record.pos_integration_id,
    company_id: record.company_id,
    // Include user info if present (from join)
    accessed_by: record.accessed_by
      ? {
          user_id: record.accessed_by.user_id,
          name: record.accessed_by.name,
          email: record.accessed_by.email,
        }
      : null,
    // Include store info if present (from join)
    store: record.store
      ? {
          store_id: record.store.store_id,
          name: record.store.name,
        }
      : null,
  };
}

// ============================================================================
// Store-Level Routes
// ============================================================================

/**
 * Register store-level POS audit routes
 * Prefix: /api/stores/:storeId/pos-audit
 */
export async function storePosAuditRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * GET /api/stores/:storeId/pos-audit
   * Get audit records for a specific store
   *
   * Requires: POS_AUDIT_READ permission
   */
  fastify.get(
    "/",
    {
      preHandler: [authMiddleware, permissionMiddleware(POS_AUDIT_READ)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = StoreIdParamSchema.safeParse(request.params);
        const queryResult = POSAuditQuerySchema.safeParse(request.query);

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        if (!queryResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: queryResult.error.issues[0].message,
            },
          });
        }

        const { storeId } = paramsResult.data;
        await verifyStoreAccess(storeId, user);

        const query = queryResult.data;
        const records = await posAuditService.queryAuditRecords({
          storeId,
          dataCategory: query.dataCategory,
          status: query.status,
          containsPii: query.containsPii,
          containsFinancial: query.containsFinancial,
          exchangeType: query.exchangeType,
          direction: query.direction,
          fromDate: query.fromDate ? new Date(query.fromDate) : undefined,
          toDate: query.toDate ? new Date(query.toDate) : undefined,
          jurisdiction: query.jurisdiction,
          limit: query.limit,
          offset: query.offset,
        });

        return reply.send({
          success: true,
          data: records.map(sanitizeAuditRecord),
          pagination: {
            limit: query.limit,
            offset: query.offset,
            count: records.length,
          },
        });
      } catch (error: any) {
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to get POS audit records");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to get POS audit records",
          },
        });
      }
    },
  );

  /**
   * GET /api/stores/:storeId/pos-audit/summary
   * Get audit summary for a specific store
   *
   * Requires: POS_AUDIT_READ permission
   */
  fastify.get(
    "/summary",
    {
      preHandler: [authMiddleware, permissionMiddleware(POS_AUDIT_READ)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = StoreIdParamSchema.safeParse(request.params);
        const queryResult = POSAuditSummaryQuerySchema.safeParse(request.query);

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        if (!queryResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: queryResult.error.issues[0].message,
            },
          });
        }

        const { storeId } = paramsResult.data;
        await verifyStoreAccess(storeId, user);

        const query = queryResult.data;
        const summary = await posAuditService.getAuditSummary({
          storeId,
          fromDate: query.fromDate ? new Date(query.fromDate) : undefined,
          toDate: query.toDate ? new Date(query.toDate) : undefined,
        });

        return reply.send({
          success: true,
          data: summary,
        });
      } catch (error: any) {
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to get POS audit summary");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to get POS audit summary",
          },
        });
      }
    },
  );

  /**
   * GET /api/stores/:storeId/pos-audit/:auditId
   * Get a specific audit record
   *
   * Requires: POS_AUDIT_READ permission
   */
  fastify.get(
    "/:auditId",
    {
      preHandler: [authMiddleware, permissionMiddleware(POS_AUDIT_READ)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = StoreIdParamSchema.merge(
          AuditIdParamSchema,
        ).safeParse(request.params);

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        const { storeId, auditId } = paramsResult.data;
        await verifyStoreAccess(storeId, user);

        const record = await posAuditService.getAuditRecord(auditId);

        if (!record) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Audit record not found",
            },
          });
        }

        // Verify the record belongs to the requested store
        if (record.store_id !== storeId) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Audit record not found for this store",
            },
          });
        }

        return reply.send({
          success: true,
          data: sanitizeAuditRecord(record),
        });
      } catch (error: any) {
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to get POS audit record");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to get POS audit record",
          },
        });
      }
    },
  );
}

// ============================================================================
// Admin Routes
// ============================================================================

/**
 * Register admin-level POS audit routes
 * Prefix: /api/admin/pos-audit
 */
export async function adminPosAuditRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * GET /api/admin/pos-audit
   * Query all audit records across the system
   *
   * Requires: ADMIN_AUDIT_VIEW permission + System Admin status
   */
  fastify.get(
    "/",
    {
      preHandler: [authMiddleware, permissionMiddleware(ADMIN_AUDIT_VIEW)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        verifyAdminAccess(user);

        const queryResult = POSAuditAdminQuerySchema.safeParse(request.query);

        if (!queryResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: queryResult.error.issues[0].message,
            },
          });
        }

        const query = queryResult.data;
        const records = await posAuditService.queryAuditRecords({
          storeId: query.storeId,
          companyId: query.companyId,
          posIntegrationId: query.posIntegrationId,
          dataCategory: query.dataCategory,
          status: query.status,
          containsPii: query.containsPii,
          containsFinancial: query.containsFinancial,
          exchangeType: query.exchangeType,
          direction: query.direction,
          fromDate: query.fromDate ? new Date(query.fromDate) : undefined,
          toDate: query.toDate ? new Date(query.toDate) : undefined,
          jurisdiction: query.jurisdiction,
          limit: query.limit,
          offset: query.offset,
        });

        return reply.send({
          success: true,
          data: records.map(sanitizeAuditRecord),
          pagination: {
            limit: query.limit,
            offset: query.offset,
            count: records.length,
          },
        });
      } catch (error: any) {
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to get admin POS audit records");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to get POS audit records",
          },
        });
      }
    },
  );

  /**
   * GET /api/admin/pos-audit/summary
   * Get system-wide audit summary
   *
   * Requires: ADMIN_AUDIT_VIEW permission + System Admin status
   */
  fastify.get(
    "/summary",
    {
      preHandler: [authMiddleware, permissionMiddleware(ADMIN_AUDIT_VIEW)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        verifyAdminAccess(user);

        const queryResult = POSAuditSummaryQuerySchema.extend({
          companyId: POSAuditAdminQuerySchema.shape.companyId,
          storeId: POSAuditAdminQuerySchema.shape.storeId,
        }).safeParse(request.query);

        if (!queryResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: queryResult.error.issues[0].message,
            },
          });
        }

        const query = queryResult.data;
        const summary = await posAuditService.getAuditSummary({
          storeId: query.storeId,
          companyId: query.companyId,
          fromDate: query.fromDate ? new Date(query.fromDate) : undefined,
          toDate: query.toDate ? new Date(query.toDate) : undefined,
        });

        return reply.send({
          success: true,
          data: summary,
        });
      } catch (error: any) {
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to get admin POS audit summary");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to get POS audit summary",
          },
        });
      }
    },
  );

  /**
   * GET /api/admin/pos-audit/pii-report
   * Generate PII access report for compliance
   *
   * Requires: ADMIN_AUDIT_VIEW permission + System Admin status
   * This endpoint provides detailed tracking of all PII data access
   * for regulatory compliance (GDPR, CCPA, etc.)
   */
  fastify.get(
    "/pii-report",
    {
      preHandler: [authMiddleware, permissionMiddleware(ADMIN_AUDIT_VIEW)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        verifyAdminAccess(user);

        const queryResult = POSAuditPIIReportQuerySchema.extend({
          companyId: POSAuditAdminQuerySchema.shape.companyId,
        }).safeParse(request.query);

        if (!queryResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: queryResult.error.issues[0].message,
            },
          });
        }

        const query = queryResult.data;
        const piiRecords = await posAuditService.getPIIAccessReport({
          companyId: query.companyId,
          fromDate: query.fromDate ? new Date(query.fromDate) : undefined,
          toDate: query.toDate ? new Date(query.toDate) : undefined,
          limit: query.limit,
          offset: query.offset,
        });

        return reply.send({
          success: true,
          data: piiRecords.map(sanitizeAuditRecord),
          pagination: {
            limit: query.limit,
            offset: query.offset,
            count: piiRecords.length,
          },
          compliance: {
            report_type: "PII_ACCESS_REPORT",
            generated_at: new Date().toISOString(),
            generated_by: user.id,
          },
        });
      } catch (error: any) {
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to generate PII access report");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to generate PII access report",
          },
        });
      }
    },
  );

  /**
   * POST /api/admin/pos-audit/retention-cleanup
   * Trigger retention policy cleanup (delete expired records)
   *
   * Requires: ADMIN_AUDIT_VIEW permission + System Admin status
   * This endpoint is for scheduled or manual cleanup of expired audit records
   * based on retention policies.
   */
  fastify.post(
    "/retention-cleanup",
    {
      preHandler: [authMiddleware, permissionMiddleware(ADMIN_AUDIT_VIEW)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        verifyAdminAccess(user);

        const bodyResult = RetentionCleanupRequestSchema.safeParse(
          request.body || {},
        );

        if (!bodyResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: bodyResult.error.issues[0].message,
            },
          });
        }

        const { dryRun, maxRecords } = bodyResult.data;

        if (dryRun) {
          // Dry run: Just count expired records
          const expiredRecords =
            await posAuditService.getExpiredRecords(maxRecords);

          return reply.send({
            success: true,
            data: {
              dry_run: true,
              would_delete: expiredRecords.length,
              sample_records: expiredRecords.slice(0, 5).map((r) => ({
                audit_id: r.audit_id,
                exchange_id: r.exchange_id,
                retention_policy: r.retention_policy,
                retention_expires_at: r.retention_expires_at,
                data_category: r.data_category,
              })),
            },
            message: `Dry run: ${expiredRecords.length} records would be deleted`,
          });
        }

        // Actual deletion
        const deletedCount = await posAuditService.deleteExpiredRecords();

        // Log the cleanup action
        request.log.info(
          {
            action: "RETENTION_CLEANUP",
            triggered_by: user.id,
            deleted_count: deletedCount,
          },
          "POS audit retention cleanup executed",
        );

        return reply.send({
          success: true,
          data: {
            dry_run: false,
            deleted_count: deletedCount,
            triggered_by: user.id,
            executed_at: new Date().toISOString(),
          },
          message: `Successfully deleted ${deletedCount} expired audit records`,
        });
      } catch (error: any) {
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to execute retention cleanup");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to execute retention cleanup",
          },
        });
      }
    },
  );

  /**
   * GET /api/admin/pos-audit/:auditId
   * Get a specific audit record by ID (admin access)
   *
   * Requires: ADMIN_AUDIT_VIEW permission + System Admin status
   */
  fastify.get(
    "/:auditId",
    {
      preHandler: [authMiddleware, permissionMiddleware(ADMIN_AUDIT_VIEW)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        verifyAdminAccess(user);

        const paramsResult = AuditIdParamSchema.safeParse(request.params);

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        const { auditId } = paramsResult.data;
        const record = await posAuditService.getAuditRecord(auditId);

        if (!record) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Audit record not found",
            },
          });
        }

        return reply.send({
          success: true,
          data: sanitizeAuditRecord(record),
        });
      } catch (error: any) {
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to get POS audit record");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to get POS audit record",
          },
        });
      }
    },
  );
}
