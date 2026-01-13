/**
 * X Report Routes
 *
 * API endpoints for X Report (mid-shift snapshot) operations.
 * Phase 4.1: Shift & Day Summary Implementation Plan
 *
 * Endpoints:
 * - POST /api/shifts/:shiftId/x-reports           - Generate new X Report for shift
 * - GET  /api/shifts/:shiftId/x-reports           - List X Reports for a shift
 * - GET  /api/shifts/:shiftId/x-reports/:number   - Get X Report by shift and number
 * - GET  /api/x-reports/:xReportId                - Get X Report by ID
 * - POST /api/x-reports/:xReportId/printed        - Mark X Report as printed
 * - GET  /api/stores/:storeId/x-reports           - List X Reports for store (with filters)
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
  xReportService,
  XReportNotFoundError,
  ShiftNotFoundError,
  ShiftNotActiveError,
} from "../services/x-report.service";
import {
  XReportShiftParamsSchema,
  XReportIdParamsSchema,
  XReportShiftNumberParamsSchema,
  XReportStoreParamsSchema,
  XReportListQuerySchema,
  GenerateXReportRequestSchema,
  MarkXReportPrintedRequestSchema,
} from "../schemas/x-report.schema";
import { authMiddleware } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/permission.middleware";

/**
 * Error handler for X Report routes
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

  if (error instanceof XReportNotFoundError) {
    return reply.status(404).send({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: error.message,
      },
    });
  }

  if (error instanceof ShiftNotFoundError) {
    return reply.status(404).send({
      success: false,
      error: {
        code: "SHIFT_NOT_FOUND",
        message: error.message,
      },
    });
  }

  if (error instanceof ShiftNotActiveError) {
    return reply.status(400).send({
      success: false,
      error: {
        code: "SHIFT_NOT_ACTIVE",
        message: error.message,
      },
    });
  }

  // Log unexpected errors
  console.error("X Report route error:", error);

  return reply.status(500).send({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    },
  });
};

export async function xReportRoutes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions,
): Promise<void> {
  /**
   * POST /api/shifts/:shiftId/x-reports
   * Generate a new X Report for an active shift
   */
  fastify.post(
    "/api/shifts/:shiftId/x-reports",
    { preHandler: [authMiddleware, requirePermission("SHIFT_REPORT_VIEW")] },
    async (request, reply) => {
      try {
        const params = XReportShiftParamsSchema.parse(request.params);
        GenerateXReportRequestSchema.parse(request.body || {});

        const user = (request as any).user;
        if (!user?.id) {
          return reply.status(401).send({
            success: false,
            error: {
              code: "UNAUTHORIZED",
              message: "User not authenticated",
            },
          });
        }

        const report = await xReportService.generateXReport({
          shift_id: params.shiftId,
          generated_by: user.id,
          requester: {
            is_system_admin: user.is_system_admin,
            store_ids: user.store_ids || [],
          },
        });

        return reply.status(201).send({
          success: true,
          data: xReportService.toResponse(report),
          message: `X Report #${report.report_number} generated successfully`,
        });
      } catch (error) {
        return handleError(error, reply);
      }
    },
  );

  /**
   * GET /api/shifts/:shiftId/x-reports
   * List all X Reports for a shift
   */
  fastify.get(
    "/api/shifts/:shiftId/x-reports",
    { preHandler: [authMiddleware, requirePermission("SHIFT_REPORT_VIEW")] },
    async (request, reply) => {
      try {
        const params = XReportShiftParamsSchema.parse(request.params);
        const user = (request as any).user;

        const reports = await xReportService.listByShiftForRequester(
          params.shiftId,
          {
            is_system_admin: user.is_system_admin,
            store_ids: user.store_ids || [],
          },
        );

        return reply.send({
          success: true,
          data: reports.map((r) => xReportService.toResponse(r)),
          meta: {
            total: reports.length,
            shift_id: params.shiftId,
          },
        });
      } catch (error) {
        return handleError(error, reply);
      }
    },
  );

  /**
   * GET /api/shifts/:shiftId/x-reports/:reportNumber
   * Get a specific X Report by shift and report number
   */
  fastify.get(
    "/api/shifts/:shiftId/x-reports/:reportNumber",
    { preHandler: [authMiddleware, requirePermission("SHIFT_REPORT_VIEW")] },
    async (request, reply) => {
      try {
        const params = XReportShiftNumberParamsSchema.parse(request.params);
        const user = (request as any).user;

        const report = await xReportService.getByShiftAndNumber(
          params.shiftId,
          params.reportNumber,
          {
            is_system_admin: user.is_system_admin,
            store_ids: user.store_ids || [],
          },
        );

        if (!report) {
          return reply.status(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: `X Report #${params.reportNumber} not found for shift ${params.shiftId}`,
            },
          });
        }

        return reply.send({
          success: true,
          data: xReportService.toResponse(report),
        });
      } catch (error) {
        return handleError(error, reply);
      }
    },
  );

  /**
   * GET /api/x-reports/:xReportId
   * Get an X Report by ID
   * DB-006: Tenant isolation enforced - only returns report if user has access to the store
   */
  fastify.get(
    "/api/x-reports/:xReportId",
    { preHandler: [authMiddleware, requirePermission("SHIFT_REPORT_VIEW")] },
    async (request, reply) => {
      try {
        const params = XReportIdParamsSchema.parse(request.params);
        const user = (request as any).user;

        const report = await xReportService.getById(params.xReportId);

        if (!report) {
          return reply.status(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: `X Report not found: ${params.xReportId}`,
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
              message: `X Report not found: ${params.xReportId}`,
            },
          });
        }

        return reply.send({
          success: true,
          data: xReportService.toResponse(report),
        });
      } catch (error) {
        return handleError(error, reply);
      }
    },
  );

  /**
   * POST /api/x-reports/:xReportId/printed
   * Mark an X Report as printed
   * DB-006: Tenant isolation enforced
   */
  fastify.post(
    "/api/x-reports/:xReportId/printed",
    { preHandler: [authMiddleware, requirePermission("SHIFT_REPORT_VIEW")] },
    async (request, reply) => {
      try {
        const params = XReportIdParamsSchema.parse(request.params);
        const body = MarkXReportPrintedRequestSchema.parse(request.body || {});
        const user = (request as any).user;

        // First verify access to the report
        const existingReport = await xReportService.getById(params.xReportId);
        if (!existingReport) {
          return reply.status(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: `X Report not found: ${params.xReportId}`,
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
              message: `X Report not found: ${params.xReportId}`,
            },
          });
        }

        const report = await xReportService.markAsPrinted(
          params.xReportId,
          body.print_count_increment,
        );

        return reply.send({
          success: true,
          data: xReportService.toResponse(report),
          message: "X Report marked as printed",
        });
      } catch (error) {
        return handleError(error, reply);
      }
    },
  );

  /**
   * GET /api/stores/:storeId/x-reports
   * List X Reports for a store with filters
   * DB-006: Tenant isolation enforced
   */
  fastify.get(
    "/api/stores/:storeId/x-reports",
    { preHandler: [authMiddleware, requirePermission("SHIFT_REPORT_VIEW")] },
    async (request, reply) => {
      try {
        const params = XReportStoreParamsSchema.parse(request.params);
        const query = XReportListQuerySchema.parse(request.query);
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

        const { reports, total } = await xReportService.list({
          store_id: params.storeId,
          from_date: query.start_date ? new Date(query.start_date) : undefined,
          to_date: query.end_date ? new Date(query.end_date) : undefined,
          limit: query.limit,
          offset: query.offset,
        });

        return reply.send({
          success: true,
          data: reports.map((r) => xReportService.toResponse(r)),
          meta: {
            total,
            limit: query.limit,
            offset: query.offset,
            has_more: query.offset + reports.length < total,
            store_id: params.storeId,
          },
        });
      } catch (error) {
        return handleError(error, reply);
      }
    },
  );
}
