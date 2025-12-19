/**
 * Day Summary Routes
 *
 * API endpoints for day summary operations.
 * Phase 3.1: Shift & Day Summary Implementation Plan
 *
 * Endpoints:
 * - GET  /api/stores/:storeId/day-summaries              - List day summaries for a store
 * - GET  /api/stores/:storeId/day-summary/:date          - Get summary for a specific date
 * - POST /api/stores/:storeId/day-summary/:date/close    - Close the business day
 * - PATCH /api/stores/:storeId/day-summary/:date/notes   - Update day notes
 * - GET  /api/stores/:storeId/reports/weekly             - Weekly summary report
 * - GET  /api/stores/:storeId/reports/monthly            - Monthly summary report
 * - GET  /api/stores/:storeId/reports/date-range         - Custom date range report
 * - GET  /api/day-summaries/:daySummaryId                - Get summary by ID
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
  daySummaryService,
  DaySummaryNotFoundError,
  DayNotReadyError,
  DayAlreadyClosedError,
  StoreNotFoundError,
} from "../services/day-summary.service";
import {
  DaySummaryStoreParamsSchema,
  DaySummaryDateParamsSchema,
  DaySummaryIdParamsSchema,
  DaySummaryListQuerySchema,
  DaySummaryGetQuerySchema,
  CloseDayRequestSchema,
  UpdateDaySummaryNotesSchema,
  WeeklyReportQuerySchema,
  MonthlyReportQuerySchema,
  DateRangeReportQuerySchema,
} from "../schemas/day-summary.schema";
import { requirePermission } from "../middleware/permission.middleware";
import { authMiddleware } from "../middleware/auth.middleware";

/**
 * Error handler for day summary routes
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

  if (error instanceof DaySummaryNotFoundError) {
    return reply.status(404).send({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: error.message,
      },
    });
  }

  if (error instanceof DayNotReadyError) {
    return reply.status(400).send({
      success: false,
      error: {
        code: "DAY_NOT_READY",
        message: error.message,
      },
    });
  }

  if (error instanceof DayAlreadyClosedError) {
    return reply.status(409).send({
      success: false,
      error: {
        code: "DAY_ALREADY_CLOSED",
        message: error.message,
      },
    });
  }

  if (error instanceof StoreNotFoundError) {
    return reply.status(404).send({
      success: false,
      error: {
        code: "STORE_NOT_FOUND",
        message: error.message,
      },
    });
  }

  // Log unexpected errors
  console.error("Day summary route error:", error);

  return reply.status(500).send({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    },
  });
};

export async function daySummaryRoutes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions,
): Promise<void> {
  /**
   * GET /api/stores/:storeId/day-summaries
   * List day summaries for a store
   */
  fastify.get(
    "/api/stores/:storeId/day-summaries",
    { preHandler: [authMiddleware, requirePermission("SHIFT_REPORT_VIEW")] },
    async (request, reply) => {
      try {
        const params = DaySummaryStoreParamsSchema.parse(request.params);
        const query = DaySummaryListQuerySchema.parse(request.query);

        const summaries = await daySummaryService.listByStore(params.storeId, {
          from_date: query.start_date ? new Date(query.start_date) : undefined,
          to_date: query.end_date ? new Date(query.end_date) : undefined,
          status: query.status,
          include_tender_summaries: query.include_tender_summaries,
          include_department_summaries: query.include_department_summaries,
          include_tax_summaries: query.include_tax_summaries,
          include_hourly_summaries: query.include_hourly_summaries,
        });

        const response = summaries.map((s) => daySummaryService.toResponse(s));

        return reply.send({
          success: true,
          data: response,
          meta: {
            total: response.length,
            store_id: params.storeId,
          },
        });
      } catch (error) {
        return handleError(error, reply);
      }
    },
  );

  /**
   * GET /api/stores/:storeId/day-summary/:date
   * Get summary for a specific date
   */
  fastify.get(
    "/api/stores/:storeId/day-summary/:date",
    { preHandler: [authMiddleware, requirePermission("SHIFT_REPORT_VIEW")] },
    async (request, reply) => {
      try {
        const params = DaySummaryDateParamsSchema.parse(request.params);
        const query = DaySummaryGetQuerySchema.parse(request.query);

        const businessDate = new Date(params.date);

        const summary = await daySummaryService.getByStoreAndDate(
          params.storeId,
          businessDate,
          {
            include_tender_summaries: query.include_tender_summaries,
            include_department_summaries: query.include_department_summaries,
            include_tax_summaries: query.include_tax_summaries,
            include_hourly_summaries: query.include_hourly_summaries,
          },
        );

        if (!summary) {
          return reply.status(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: `No day summary found for ${params.date}`,
            },
          });
        }

        return reply.send({
          success: true,
          data: daySummaryService.toResponse(summary),
        });
      } catch (error) {
        return handleError(error, reply);
      }
    },
  );

  /**
   * POST /api/stores/:storeId/day-summary/:date/close
   * Close the business day
   */
  fastify.post(
    "/api/stores/:storeId/day-summary/:date/close",
    { preHandler: [authMiddleware, requirePermission("SHIFT_CLOSE")] },
    async (request, reply) => {
      try {
        const params = DaySummaryDateParamsSchema.parse(request.params);
        const body = CloseDayRequestSchema.parse(request.body || {});

        const user = (request as any).user;
        if (!user?.userId) {
          return reply.status(401).send({
            success: false,
            error: {
              code: "UNAUTHORIZED",
              message: "User not authenticated",
            },
          });
        }

        const businessDate = new Date(params.date);

        const summary = await daySummaryService.closeDaySummary(
          params.storeId,
          businessDate,
          user.userId,
          body.notes,
        );

        return reply.send({
          success: true,
          data: daySummaryService.toResponse(summary),
          message: `Business day ${params.date} has been closed`,
        });
      } catch (error) {
        return handleError(error, reply);
      }
    },
  );

  /**
   * PATCH /api/stores/:storeId/day-summary/:date/notes
   * Update day notes
   */
  fastify.patch(
    "/api/stores/:storeId/day-summary/:date/notes",
    { preHandler: [authMiddleware, requirePermission("SHIFT_CLOSE")] },
    async (request, reply) => {
      try {
        const params = DaySummaryDateParamsSchema.parse(request.params);
        const body = UpdateDaySummaryNotesSchema.parse(request.body);

        const businessDate = new Date(params.date);

        const summary = await daySummaryService.updateNotes(
          params.storeId,
          businessDate,
          body.notes,
        );

        return reply.send({
          success: true,
          data: daySummaryService.toResponse(summary),
          message: "Day notes updated",
        });
      } catch (error) {
        return handleError(error, reply);
      }
    },
  );

  /**
   * GET /api/stores/:storeId/reports/weekly
   * Weekly summary report
   */
  fastify.get(
    "/api/stores/:storeId/reports/weekly",
    { preHandler: [authMiddleware, requirePermission("SHIFT_REPORT_VIEW")] },
    async (request, reply) => {
      try {
        const params = DaySummaryStoreParamsSchema.parse(request.params);
        const query = WeeklyReportQuerySchema.parse(request.query);

        const weekOf = query.week_of ? new Date(query.week_of) : new Date();

        const report = await daySummaryService.getWeeklyReport(
          params.storeId,
          weekOf,
        );

        return reply.send({
          success: true,
          data: report,
        });
      } catch (error) {
        return handleError(error, reply);
      }
    },
  );

  /**
   * GET /api/stores/:storeId/reports/monthly
   * Monthly summary report
   */
  fastify.get(
    "/api/stores/:storeId/reports/monthly",
    { preHandler: [authMiddleware, requirePermission("SHIFT_REPORT_VIEW")] },
    async (request, reply) => {
      try {
        const params = DaySummaryStoreParamsSchema.parse(request.params);
        const query = MonthlyReportQuerySchema.parse(request.query);

        const report = await daySummaryService.getMonthlyReport(
          params.storeId,
          query.year,
          query.month,
        );

        return reply.send({
          success: true,
          data: report,
        });
      } catch (error) {
        return handleError(error, reply);
      }
    },
  );

  /**
   * GET /api/stores/:storeId/reports/date-range
   * Custom date range report
   */
  fastify.get(
    "/api/stores/:storeId/reports/date-range",
    { preHandler: [authMiddleware, requirePermission("SHIFT_REPORT_VIEW")] },
    async (request, reply) => {
      try {
        const params = DaySummaryStoreParamsSchema.parse(request.params);
        const query = DateRangeReportQuerySchema.parse(request.query);

        const startDate = new Date(query.start_date);
        const endDate = new Date(query.end_date);

        // Get all day summaries in range
        const summaries = await daySummaryService.listByStore(params.storeId, {
          from_date: startDate,
          to_date: endDate,
          include_tender_summaries: query.include_tender_breakdown,
          include_department_summaries: query.include_department_breakdown,
        });

        // Calculate aggregate totals
        let total_shift_count = 0;
        let total_gross_sales = 0;
        let total_returns = 0;
        let total_discounts = 0;
        let total_net_sales = 0;
        let total_tax_collected = 0;
        let total_transaction_count = 0;
        let total_items_sold = 0;
        let total_cash_variance = 0;

        for (const summary of summaries) {
          total_shift_count += summary.shift_count;
          total_gross_sales += Number(summary.gross_sales);
          total_returns += Number(summary.returns_total);
          total_discounts += Number(summary.discounts_total);
          total_net_sales += Number(summary.net_sales);
          total_tax_collected += Number(summary.tax_collected);
          total_transaction_count += summary.transaction_count;
          total_items_sold += summary.items_sold_count;
          total_cash_variance += Number(summary.total_cash_variance);
        }

        const day_count = summaries.length;
        const avg_daily_sales = day_count > 0 ? total_net_sales / day_count : 0;
        const avg_transaction =
          total_transaction_count > 0
            ? total_net_sales / total_transaction_count
            : 0;

        const response: any = {
          store_id: params.storeId,
          start_date: query.start_date,
          end_date: query.end_date,
          day_count,
          shift_count: total_shift_count,
          gross_sales: total_gross_sales,
          returns_total: total_returns,
          discounts_total: total_discounts,
          net_sales: total_net_sales,
          tax_collected: total_tax_collected,
          transaction_count: total_transaction_count,
          items_sold_count: total_items_sold,
          avg_daily_sales,
          avg_transaction,
          total_cash_variance,
        };

        if (query.include_daily_breakdown) {
          response.daily_breakdown = summaries.map((s) =>
            daySummaryService.toResponse(s),
          );
        }

        return reply.send({
          success: true,
          data: response,
        });
      } catch (error) {
        return handleError(error, reply);
      }
    },
  );

  /**
   * GET /api/day-summaries/:daySummaryId
   * Get summary by ID
   */
  fastify.get(
    "/api/day-summaries/:daySummaryId",
    { preHandler: [authMiddleware, requirePermission("SHIFT_REPORT_VIEW")] },
    async (request, reply) => {
      try {
        const params = DaySummaryIdParamsSchema.parse(request.params);
        const query = DaySummaryGetQuerySchema.parse(request.query);

        const summary = await daySummaryService.getById(params.daySummaryId, {
          include_tender_summaries: query.include_tender_summaries,
          include_department_summaries: query.include_department_summaries,
          include_tax_summaries: query.include_tax_summaries,
          include_hourly_summaries: query.include_hourly_summaries,
        });

        if (!summary) {
          return reply.status(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: `Day summary not found: ${params.daySummaryId}`,
            },
          });
        }

        return reply.send({
          success: true,
          data: daySummaryService.toResponse(summary),
        });
      } catch (error) {
        return handleError(error, reply);
      }
    },
  );

  /**
   * POST /api/stores/:storeId/day-summary/:date/refresh
   * Manually refresh/recalculate day summary from shift summaries
   * Useful for debugging or when data gets out of sync
   */
  fastify.post(
    "/api/stores/:storeId/day-summary/:date/refresh",
    { preHandler: [authMiddleware, requirePermission("SHIFT_CLOSE")] },
    async (request, reply) => {
      try {
        const params = DaySummaryDateParamsSchema.parse(request.params);

        const businessDate = new Date(params.date);

        const summary = await daySummaryService.updateDaySummary(
          params.storeId,
          businessDate,
        );

        return reply.send({
          success: true,
          data: daySummaryService.toResponse(summary),
          message: `Day summary for ${params.date} has been refreshed`,
        });
      } catch (error) {
        return handleError(error, reply);
      }
    },
  );
}
