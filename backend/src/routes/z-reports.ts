/**
 * Z Report Routes
 *
 * API endpoints for Z Report (end-of-shift final snapshot) operations.
 * Phase 4.2: Shift & Day Summary Implementation Plan
 *
 * Endpoints:
 * - GET  /api/shifts/:shiftId/z-report             - Get Z Report for shift
 * - GET  /api/z-reports/:zReportId                 - Get Z Report by ID
 * - GET  /api/z-reports/:zReportId/verify          - Verify Z Report integrity
 * - POST /api/z-reports/:zReportId/printed         - Mark Z Report as printed
 * - POST /api/z-reports/:zReportId/exported        - Mark Z Report as exported
 * - GET  /api/stores/:storeId/z-reports            - List Z Reports for store
 * - GET  /api/stores/:storeId/z-reports/sequence   - Get Z Report sequence info
 * - GET  /api/stores/:storeId/z-reports/:zNumber   - Get Z Report by Z number
 *
 * Note: Z Reports are automatically generated when shifts are closed.
 * There is no manual generation endpoint - see shift.service.ts closeShift().
 *
 * Enterprise coding standards applied:
 * - API-001: Schema validation using Zod
 * - API-002: Rate limiting (inherits from global middleware)
 * - API-003: Centralized error handling
 * - API-004: JWT authentication required
 * - DB-006: Tenant isolation via RLS and permission checks
 */

import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { ZodError } from "zod";
import {
  zReportService,
  ZReportNotFoundError,
  ShiftSummaryNotFoundError,
  ZReportAlreadyExistsError,
  ShiftNotClosedError,
} from "../services/z-report.service";
import {
  ZReportShiftParamsSchema,
  ZReportIdParamsSchema,
  ZReportStoreParamsSchema,
  ZReportByZNumberParamsSchema,
  ZReportListQuerySchema,
  MarkZReportPrintedRequestSchema,
  MarkZReportExportedRequestSchema,
} from "../schemas/z-report.schema";
import { authMiddleware } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/permission.middleware";

/**
 * Error handler for Z Report routes
 */
const handleError = (error: unknown, reply: any) => {
  if (error instanceof ZodError) {
    return reply.status(400).send({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation error",
        details: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
  }

  if (error instanceof ZReportNotFoundError) {
    return reply.status(404).send({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: error.message,
      },
    });
  }

  if (error instanceof ShiftSummaryNotFoundError) {
    return reply.status(404).send({
      success: false,
      error: {
        code: "SHIFT_SUMMARY_NOT_FOUND",
        message: error.message,
      },
    });
  }

  if (error instanceof ZReportAlreadyExistsError) {
    return reply.status(409).send({
      success: false,
      error: {
        code: "Z_REPORT_EXISTS",
        message: error.message,
      },
    });
  }

  if (error instanceof ShiftNotClosedError) {
    return reply.status(400).send({
      success: false,
      error: {
        code: "SHIFT_NOT_CLOSED",
        message: error.message,
      },
    });
  }

  // Log unexpected errors
  console.error("Z Report route error:", error);

  return reply.status(500).send({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    },
  });
};

export async function zReportRoutes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions,
): Promise<void> {
  /**
   * GET /api/shifts/:shiftId/z-report
   * Get the Z Report for a shift
   */
  fastify.get(
    "/api/shifts/:shiftId/z-report",
    { preHandler: [authMiddleware, requirePermission("SHIFT_REPORT_VIEW")] },
    async (request, reply) => {
      try {
        const params = ZReportShiftParamsSchema.parse(request.params);

        const report = await zReportService.getByShiftId(params.shiftId);

        if (!report) {
          return reply.status(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: `Z Report not found for shift ${params.shiftId}. Z Reports are generated when shifts are closed.`,
            },
          });
        }

        return reply.send({
          success: true,
          data: zReportService.toResponse(report),
        });
      } catch (error) {
        return handleError(error, reply);
      }
    },
  );

  /**
   * GET /api/z-reports/:zReportId
   * Get a Z Report by ID
   * DB-006: Tenant isolation enforced
   */
  fastify.get(
    "/api/z-reports/:zReportId",
    { preHandler: [authMiddleware, requirePermission("SHIFT_REPORT_VIEW")] },
    async (request, reply) => {
      try {
        const params = ZReportIdParamsSchema.parse(request.params);
        const user = (request as any).user;

        const report = await zReportService.getById(params.zReportId);

        if (!report) {
          return reply.status(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: `Z Report not found: ${params.zReportId}`,
            },
          });
        }

        // DB-006: Tenant isolation - verify user has access to the store
        if (
          !user.is_system_admin &&
          !user.store_ids.includes(report.store_id)
        ) {
          return reply.status(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: `Z Report not found: ${params.zReportId}`,
            },
          });
        }

        return reply.send({
          success: true,
          data: zReportService.toResponse(report),
        });
      } catch (error) {
        return handleError(error, reply);
      }
    },
  );

  /**
   * GET /api/z-reports/:zReportId/verify
   * Verify the integrity of a Z Report
   * DB-006: Tenant isolation enforced
   */
  fastify.get(
    "/api/z-reports/:zReportId/verify",
    { preHandler: [authMiddleware, requirePermission("SHIFT_REPORT_VIEW")] },
    async (request, reply) => {
      try {
        const params = ZReportIdParamsSchema.parse(request.params);
        const user = (request as any).user;

        // First verify access to the report
        const report = await zReportService.getById(params.zReportId);
        if (!report) {
          return reply.status(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: `Z Report not found: ${params.zReportId}`,
            },
          });
        }

        // DB-006: Tenant isolation - verify user has access to the store
        if (
          !user.is_system_admin &&
          !user.store_ids.includes(report.store_id)
        ) {
          return reply.status(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: `Z Report not found: ${params.zReportId}`,
            },
          });
        }

        const isValid = await zReportService.verifyIntegrity(params.zReportId);

        return reply.send({
          success: true,
          data: {
            z_report_id: params.zReportId,
            integrity_valid: isValid,
            verified_at: new Date().toISOString(),
          },
          message: isValid
            ? "Z Report integrity verified - no tampering detected"
            : "Z Report integrity check failed - data may have been modified",
        });
      } catch (error) {
        return handleError(error, reply);
      }
    },
  );

  /**
   * POST /api/z-reports/:zReportId/printed
   * Mark a Z Report as printed
   * DB-006: Tenant isolation enforced
   */
  fastify.post(
    "/api/z-reports/:zReportId/printed",
    { preHandler: [authMiddleware, requirePermission("SHIFT_REPORT_VIEW")] },
    async (request, reply) => {
      try {
        const params = ZReportIdParamsSchema.parse(request.params);
        const body = MarkZReportPrintedRequestSchema.parse(request.body || {});
        const user = (request as any).user;

        // First verify access to the report
        const existingReport = await zReportService.getById(params.zReportId);
        if (!existingReport) {
          return reply.status(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: `Z Report not found: ${params.zReportId}`,
            },
          });
        }

        // DB-006: Tenant isolation - verify user has access to the store
        if (
          !user.is_system_admin &&
          !user.store_ids.includes(existingReport.store_id)
        ) {
          return reply.status(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: `Z Report not found: ${params.zReportId}`,
            },
          });
        }

        const report = await zReportService.markAsPrinted(
          params.zReportId,
          body.print_count_increment,
        );

        return reply.send({
          success: true,
          data: zReportService.toResponse(report),
          message: "Z Report marked as printed",
        });
      } catch (error) {
        return handleError(error, reply);
      }
    },
  );

  /**
   * POST /api/z-reports/:zReportId/exported
   * Mark a Z Report as exported
   * DB-006: Tenant isolation enforced
   */
  fastify.post(
    "/api/z-reports/:zReportId/exported",
    { preHandler: [authMiddleware, requirePermission("REPORT_EXPORT")] },
    async (request, reply) => {
      try {
        const params = ZReportIdParamsSchema.parse(request.params);
        const body = MarkZReportExportedRequestSchema.parse(request.body);
        const user = (request as any).user;

        // First verify access to the report
        const existingReport = await zReportService.getById(params.zReportId);
        if (!existingReport) {
          return reply.status(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: `Z Report not found: ${params.zReportId}`,
            },
          });
        }

        // DB-006: Tenant isolation - verify user has access to the store
        if (
          !user.is_system_admin &&
          !user.store_ids.includes(existingReport.store_id)
        ) {
          return reply.status(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: `Z Report not found: ${params.zReportId}`,
            },
          });
        }

        const report = await zReportService.markAsExported(
          params.zReportId,
          body.export_format,
        );

        return reply.send({
          success: true,
          data: zReportService.toResponse(report),
          message: `Z Report marked as exported (${body.export_format})`,
        });
      } catch (error) {
        return handleError(error, reply);
      }
    },
  );

  /**
   * GET /api/stores/:storeId/z-reports
   * List Z Reports for a store with filters
   * DB-006: Tenant isolation enforced
   */
  fastify.get(
    "/api/stores/:storeId/z-reports",
    { preHandler: [authMiddleware, requirePermission("SHIFT_REPORT_VIEW")] },
    async (request, reply) => {
      try {
        const params = ZReportStoreParamsSchema.parse(request.params);
        const query = ZReportListQuerySchema.parse(request.query);
        const user = (request as any).user;

        // DB-006: Tenant isolation - verify user has access to the store
        if (!user.is_system_admin && !user.store_ids.includes(params.storeId)) {
          return reply.status(403).send({
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: "You do not have access to this store",
            },
          });
        }

        const { reports, total, latestZNumber } =
          await zReportService.listByStore(params.storeId, {
            business_date: query.business_date
              ? new Date(query.business_date)
              : undefined,
            from_date: query.start_date
              ? new Date(query.start_date)
              : undefined,
            to_date: query.end_date ? new Date(query.end_date) : undefined,
            from_z_number: query.from_z_number,
            to_z_number: query.to_z_number,
            limit: query.limit,
            offset: query.offset,
          });

        return reply.send({
          success: true,
          data: reports.map((r) => zReportService.toResponse(r)),
          meta: {
            total,
            limit: query.limit,
            offset: query.offset,
            has_more: query.offset + reports.length < total,
            store_id: params.storeId,
            latest_z_number: latestZNumber,
          },
        });
      } catch (error) {
        return handleError(error, reply);
      }
    },
  );

  /**
   * GET /api/stores/:storeId/z-reports/sequence
   * Get Z Report sequence summary for a store
   * DB-006: Tenant isolation enforced
   */
  fastify.get(
    "/api/stores/:storeId/z-reports/sequence",
    { preHandler: [authMiddleware, requirePermission("SHIFT_REPORT_VIEW")] },
    async (request, reply) => {
      try {
        const params = ZReportStoreParamsSchema.parse(request.params);
        const user = (request as any).user;

        // DB-006: Tenant isolation - verify user has access to the store
        if (!user.is_system_admin && !user.store_ids.includes(params.storeId)) {
          return reply.status(403).send({
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: "You do not have access to this store",
            },
          });
        }

        const summary = await zReportService.getSequenceSummary(params.storeId);

        return reply.send({
          success: true,
          data: summary,
        });
      } catch (error) {
        return handleError(error, reply);
      }
    },
  );

  /**
   * GET /api/stores/:storeId/z-reports/:zNumber
   * Get a Z Report by store and Z number
   * DB-006: Tenant isolation enforced
   */
  fastify.get(
    "/api/stores/:storeId/z-reports/:zNumber",
    { preHandler: [authMiddleware, requirePermission("SHIFT_REPORT_VIEW")] },
    async (request, reply) => {
      try {
        const params = ZReportByZNumberParamsSchema.parse(request.params);
        const user = (request as any).user;

        // DB-006: Tenant isolation - verify user has access to the store
        if (!user.is_system_admin && !user.store_ids.includes(params.storeId)) {
          return reply.status(403).send({
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: "You do not have access to this store",
            },
          });
        }

        const report = await zReportService.getByStoreAndZNumber(
          params.storeId,
          params.zNumber,
        );

        if (!report) {
          return reply.status(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: `Z Report #${params.zNumber} not found for store ${params.storeId}`,
            },
          });
        }

        return reply.send({
          success: true,
          data: zReportService.toResponse(report),
        });
      } catch (error) {
        return handleError(error, reply);
      }
    },
  );
}
