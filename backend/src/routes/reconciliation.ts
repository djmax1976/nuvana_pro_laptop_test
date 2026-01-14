/**
 * Reconciliation Routes
 * Phase 5.3: Validation & Reconciliation
 *
 * API endpoints for validating summary data integrity and generating
 * reconciliation reports. These endpoints are primarily for administrative
 * use to identify and diagnose data discrepancies.
 *
 * Endpoints:
 * - GET  /api/admin/reconciliation/validate           - Validate all summaries
 * - GET  /api/stores/:storeId/reconciliation/validate - Validate store summaries
 * - GET  /api/admin/reconciliation/report             - Generate full reconciliation report
 *
 * Enterprise coding standards applied:
 * - API-001: Schema validation using Zod
 * - API-003: Centralized error handling
 * - API-004: JWT authentication required
 * - DB-006: Tenant isolation via RLS and permission checks
 */

import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { z, ZodError } from "zod";
import { prisma } from "../utils/db";
import { format } from "date-fns";
import { requirePermission } from "../middleware/permission.middleware";
import { authMiddleware } from "../middleware/auth.middleware";

// Tolerance for floating-point comparisons (0.01 = 1 cent)
const TOLERANCE = 0.01;

/**
 * Check if two numbers are approximately equal within tolerance
 */
function isClose(a: number, b: number, tolerance: number = TOLERANCE): boolean {
  return Math.abs(a - b) <= tolerance;
}

// Validation Schemas
const StoreParamsSchema = z.object({
  storeId: z.string().uuid(),
});

const ValidationQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  include_details: z.coerce.boolean().optional().default(false),
});

const ReportQuerySchema = z.object({
  store_id: z.string().uuid().optional(),
  from_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  limit: z.coerce.number().min(1).max(1000).optional().default(100),
});

// Response Types
interface ShiftDiscrepancy {
  shift_id: string;
  shift_summary_id: string;
  store_id: string;
  business_date: string;
  field: string;
  summary_value: number;
  calculated_value: number;
  difference: number;
}

interface DayDiscrepancy {
  day_summary_id: string;
  store_id: string;
  business_date: string;
  field: string;
  summary_value: number;
  calculated_value: number;
  difference: number;
}

interface ValidationResult {
  valid: boolean;
  summary: {
    shiftsValidated: number;
    shiftsWithDiscrepancies: number;
    daysValidated: number;
    daysWithDiscrepancies: number;
    orphanedShiftSummaries: number;
    orphanedDaySummaries: number;
    shiftsWithoutSummaries: number;
  };
  shiftDiscrepancies?: ShiftDiscrepancy[];
  dayDiscrepancies?: DayDiscrepancy[];
  orphanedShiftSummaries?: string[];
  orphanedDaySummaries?: string[];
  shiftsWithoutSummaries?: string[];
}

/**
 * Calculate transaction aggregates for a shift
 */
async function calculateShiftAggregates(
  shiftId: string,
): Promise<Record<string, number>> {
  const transactions = await prisma.transaction.findMany({
    where: { shift_id: shiftId },
    include: {
      line_items: true,
      payments: true,
    },
  });

  let gross_sales = 0;
  let returns_total = 0;
  let discounts_total = 0;
  let tax_collected = 0;
  const transaction_count = transactions.length;
  let refund_count = 0;
  let items_sold_count = 0;
  let items_returned_count = 0;

  for (const tx of transactions) {
    const txTotal = Number(tx.total);
    const txTax = Number(tx.tax);
    const txDiscount = Number(tx.discount);
    const txSubtotal = Number(tx.subtotal);

    if (txTotal < 0) {
      refund_count++;
      returns_total += Math.abs(txTotal);
    } else {
      gross_sales += txSubtotal;
    }

    discounts_total += txDiscount;
    tax_collected += txTax;

    for (const li of tx.line_items) {
      const qty =
        typeof li.quantity === "object" && "toNumber" in li.quantity
          ? li.quantity.toNumber()
          : Number(li.quantity);
      if (qty > 0) {
        items_sold_count += qty;
      } else {
        items_returned_count += Math.abs(qty);
      }
    }
  }

  const net_sales = gross_sales - returns_total - discounts_total;

  return {
    gross_sales,
    returns_total,
    discounts_total,
    net_sales,
    tax_collected,
    transaction_count,
    refund_count,
    items_sold_count,
    items_returned_count,
  };
}

/**
 * Calculate day aggregates from shift summaries
 */
async function calculateDayAggregates(
  storeId: string,
  businessDate: Date,
): Promise<Record<string, number>> {
  const shiftSummaries = await prisma.shiftSummary.findMany({
    where: {
      store_id: storeId,
      business_date: businessDate,
    },
  });

  let gross_sales = 0;
  let returns_total = 0;
  let discounts_total = 0;
  let net_sales = 0;
  let tax_collected = 0;
  let transaction_count = 0;
  let refund_count = 0;
  let items_sold_count = 0;
  let items_returned_count = 0;
  const shift_count = shiftSummaries.length;

  for (const shift of shiftSummaries) {
    gross_sales += Number(shift.gross_sales);
    returns_total += Number(shift.returns_total);
    discounts_total += Number(shift.discounts_total);
    net_sales += Number(shift.net_sales);
    tax_collected += Number(shift.tax_collected);
    transaction_count += shift.transaction_count;
    refund_count += shift.refund_count;
    items_sold_count += shift.items_sold_count;
    items_returned_count += shift.items_returned_count;
  }

  return {
    shift_count,
    gross_sales,
    returns_total,
    discounts_total,
    net_sales,
    tax_collected,
    transaction_count,
    refund_count,
    items_sold_count,
    items_returned_count,
  };
}

/**
 * Validate shift summaries for a given scope
 */
async function validateShiftSummaries(
  whereClause: any,
  includeDetails: boolean,
): Promise<{
  validated: number;
  withDiscrepancies: number;
  discrepancies: ShiftDiscrepancy[];
}> {
  const shiftSummaries = await prisma.shiftSummary.findMany({
    where: whereClause,
    take: 1000, // Limit to prevent timeout
  });

  const discrepancies: ShiftDiscrepancy[] = [];
  const shiftIdsWithDiscrepancies = new Set<string>();

  const fieldsToCheck: Array<{ field: string; summaryKey: string }> = [
    { field: "gross_sales", summaryKey: "gross_sales" },
    { field: "returns_total", summaryKey: "returns_total" },
    { field: "discounts_total", summaryKey: "discounts_total" },
    { field: "net_sales", summaryKey: "net_sales" },
    { field: "tax_collected", summaryKey: "tax_collected" },
    { field: "transaction_count", summaryKey: "transaction_count" },
    { field: "refund_count", summaryKey: "refund_count" },
    { field: "items_sold_count", summaryKey: "items_sold_count" },
    { field: "items_returned_count", summaryKey: "items_returned_count" },
  ];

  for (const summary of shiftSummaries) {
    const calculated = await calculateShiftAggregates(summary.shift_id);

    for (const { field, summaryKey } of fieldsToCheck) {
      const summaryValue = Number((summary as any)[summaryKey]);
      const calculatedValue = calculated[field];

      if (!isClose(summaryValue, calculatedValue)) {
        shiftIdsWithDiscrepancies.add(summary.shift_summary_id);

        if (includeDetails) {
          discrepancies.push({
            shift_id: summary.shift_id,
            shift_summary_id: summary.shift_summary_id,
            store_id: summary.store_id,
            business_date: format(summary.business_date, "yyyy-MM-dd"),
            field,
            summary_value: summaryValue,
            calculated_value: calculatedValue,
            difference: summaryValue - calculatedValue,
          });
        }
      }
    }
  }

  return {
    validated: shiftSummaries.length,
    withDiscrepancies: shiftIdsWithDiscrepancies.size,
    discrepancies,
  };
}

/**
 * Validate day summaries for a given scope
 */
async function validateDaySummaries(
  whereClause: any,
  includeDetails: boolean,
): Promise<{
  validated: number;
  withDiscrepancies: number;
  discrepancies: DayDiscrepancy[];
}> {
  const daySummaries = await prisma.daySummary.findMany({
    where: whereClause,
    take: 1000,
  });

  const discrepancies: DayDiscrepancy[] = [];
  const dayIdsWithDiscrepancies = new Set<string>();

  const fieldsToCheck: Array<{ field: string; summaryKey: string }> = [
    { field: "shift_count", summaryKey: "shift_count" },
    { field: "gross_sales", summaryKey: "gross_sales" },
    { field: "returns_total", summaryKey: "returns_total" },
    { field: "discounts_total", summaryKey: "discounts_total" },
    { field: "net_sales", summaryKey: "net_sales" },
    { field: "tax_collected", summaryKey: "tax_collected" },
    { field: "transaction_count", summaryKey: "transaction_count" },
    { field: "refund_count", summaryKey: "refund_count" },
    { field: "items_sold_count", summaryKey: "items_sold_count" },
    { field: "items_returned_count", summaryKey: "items_returned_count" },
  ];

  for (const summary of daySummaries) {
    const calculated = await calculateDayAggregates(
      summary.store_id,
      summary.business_date,
    );

    for (const { field, summaryKey } of fieldsToCheck) {
      const summaryValue = Number((summary as any)[summaryKey]);
      const calculatedValue = calculated[field];

      if (!isClose(summaryValue, calculatedValue)) {
        dayIdsWithDiscrepancies.add(summary.day_summary_id);

        if (includeDetails) {
          discrepancies.push({
            day_summary_id: summary.day_summary_id,
            store_id: summary.store_id,
            business_date: format(summary.business_date, "yyyy-MM-dd"),
            field,
            summary_value: summaryValue,
            calculated_value: calculatedValue,
            difference: summaryValue - calculatedValue,
          });
        }
      }
    }
  }

  return {
    validated: daySummaries.length,
    withDiscrepancies: dayIdsWithDiscrepancies.size,
    discrepancies,
  };
}

/**
 * Find orphaned summaries and shifts without summaries
 */
async function findOrphanedRecords(storeId?: string): Promise<{
  orphanedShiftSummaries: string[];
  orphanedDaySummaries: string[];
  shiftsWithoutSummaries: string[];
}> {
  const whereClause: any = {};
  if (storeId) {
    whereClause.store_id = storeId;
  }

  // Find orphaned shift summaries (summaries without shifts)
  const shiftSummaries = await prisma.shiftSummary.findMany({
    where: whereClause,
    select: { shift_summary_id: true, shift_id: true },
    take: 100,
  });

  const orphanedShiftSummaries: string[] = [];
  for (const summary of shiftSummaries) {
    const shift = await prisma.shift.findUnique({
      where: { shift_id: summary.shift_id },
      select: { shift_id: true },
    });
    if (!shift) {
      orphanedShiftSummaries.push(summary.shift_summary_id);
    }
  }

  // Find orphaned day summaries (summaries without any shift summaries)
  const daySummaries = await prisma.daySummary.findMany({
    where: whereClause,
    select: { day_summary_id: true, store_id: true, business_date: true },
    take: 100,
  });

  const orphanedDaySummaries: string[] = [];
  for (const summary of daySummaries) {
    const shiftCount = await prisma.shiftSummary.count({
      where: {
        store_id: summary.store_id,
        business_date: summary.business_date,
      },
    });
    if (shiftCount === 0) {
      orphanedDaySummaries.push(summary.day_summary_id);
    }
  }

  // Find closed shifts without summaries
  const shiftWhereClause: any = {
    status: "CLOSED",
    closed_at: { not: null },
    shift_summary: { is: null },
  };
  if (storeId) {
    shiftWhereClause.store_id = storeId;
  }

  const shiftsWithoutSummaries = await prisma.shift.findMany({
    where: shiftWhereClause,
    select: { shift_id: true },
    take: 100,
  });

  return {
    orphanedShiftSummaries,
    orphanedDaySummaries,
    shiftsWithoutSummaries: shiftsWithoutSummaries.map((s) => s.shift_id),
  };
}

/**
 * Error handler for reconciliation routes
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

  console.error("Reconciliation route error:", error);

  return reply.status(500).send({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    },
  });
};

export async function reconciliationRoutes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions,
): Promise<void> {
  /**
   * GET /api/admin/reconciliation/validate
   * Validate all summaries (admin only)
   */
  fastify.get(
    "/api/admin/reconciliation/validate",
    { preHandler: [authMiddleware, requirePermission("SHIFT_REPORT_VIEW")] },
    async (request, reply) => {
      try {
        const query = ValidationQuerySchema.parse(request.query);

        const dateFilter: any = {};
        if (query.date) {
          const targetDate = new Date(query.date);
          targetDate.setHours(0, 0, 0, 0);
          dateFilter.business_date = targetDate;
        }

        // Validate shift summaries
        const shiftResult = await validateShiftSummaries(
          dateFilter,
          query.include_details,
        );

        // Validate day summaries
        const dayResult = await validateDaySummaries(
          dateFilter,
          query.include_details,
        );

        // Find orphaned records
        const orphaned = await findOrphanedRecords();

        const result: ValidationResult = {
          valid:
            shiftResult.withDiscrepancies === 0 &&
            dayResult.withDiscrepancies === 0 &&
            orphaned.orphanedShiftSummaries.length === 0 &&
            orphaned.orphanedDaySummaries.length === 0 &&
            orphaned.shiftsWithoutSummaries.length === 0,
          summary: {
            shiftsValidated: shiftResult.validated,
            shiftsWithDiscrepancies: shiftResult.withDiscrepancies,
            daysValidated: dayResult.validated,
            daysWithDiscrepancies: dayResult.withDiscrepancies,
            orphanedShiftSummaries: orphaned.orphanedShiftSummaries.length,
            orphanedDaySummaries: orphaned.orphanedDaySummaries.length,
            shiftsWithoutSummaries: orphaned.shiftsWithoutSummaries.length,
          },
        };

        if (query.include_details) {
          result.shiftDiscrepancies = shiftResult.discrepancies;
          result.dayDiscrepancies = dayResult.discrepancies;
          result.orphanedShiftSummaries = orphaned.orphanedShiftSummaries;
          result.orphanedDaySummaries = orphaned.orphanedDaySummaries;
          result.shiftsWithoutSummaries = orphaned.shiftsWithoutSummaries;
        }

        return reply.send({
          success: true,
          data: result,
        });
      } catch (error) {
        return handleError(error, reply);
      }
    },
  );

  /**
   * GET /api/stores/:storeId/reconciliation/validate
   * Validate summaries for a specific store
   */
  fastify.get(
    "/api/stores/:storeId/reconciliation/validate",
    { preHandler: [authMiddleware, requirePermission("SHIFT_REPORT_VIEW")] },
    async (request, reply) => {
      try {
        const params = StoreParamsSchema.parse(request.params);
        const query = ValidationQuerySchema.parse(request.query);

        const whereClause: any = { store_id: params.storeId };
        if (query.date) {
          const targetDate = new Date(query.date);
          targetDate.setHours(0, 0, 0, 0);
          whereClause.business_date = targetDate;
        }

        // Validate shift summaries
        const shiftResult = await validateShiftSummaries(
          whereClause,
          query.include_details,
        );

        // Validate day summaries
        const dayResult = await validateDaySummaries(
          whereClause,
          query.include_details,
        );

        // Find orphaned records for this store
        const orphaned = await findOrphanedRecords(params.storeId);

        const result: ValidationResult = {
          valid:
            shiftResult.withDiscrepancies === 0 &&
            dayResult.withDiscrepancies === 0 &&
            orphaned.orphanedShiftSummaries.length === 0 &&
            orphaned.orphanedDaySummaries.length === 0 &&
            orphaned.shiftsWithoutSummaries.length === 0,
          summary: {
            shiftsValidated: shiftResult.validated,
            shiftsWithDiscrepancies: shiftResult.withDiscrepancies,
            daysValidated: dayResult.validated,
            daysWithDiscrepancies: dayResult.withDiscrepancies,
            orphanedShiftSummaries: orphaned.orphanedShiftSummaries.length,
            orphanedDaySummaries: orphaned.orphanedDaySummaries.length,
            shiftsWithoutSummaries: orphaned.shiftsWithoutSummaries.length,
          },
        };

        if (query.include_details) {
          result.shiftDiscrepancies = shiftResult.discrepancies;
          result.dayDiscrepancies = dayResult.discrepancies;
          result.orphanedShiftSummaries = orphaned.orphanedShiftSummaries;
          result.orphanedDaySummaries = orphaned.orphanedDaySummaries;
          result.shiftsWithoutSummaries = orphaned.shiftsWithoutSummaries;
        }

        return reply.send({
          success: true,
          data: result,
        });
      } catch (error) {
        return handleError(error, reply);
      }
    },
  );

  /**
   * GET /api/admin/reconciliation/report
   * Generate full reconciliation report
   */
  fastify.get(
    "/api/admin/reconciliation/report",
    { preHandler: [authMiddleware, requirePermission("SHIFT_REPORT_VIEW")] },
    async (request, reply) => {
      try {
        const query = ReportQuerySchema.parse(request.query);

        const whereClause: any = {};
        if (query.store_id) {
          whereClause.store_id = query.store_id;
        }
        if (query.from_date || query.to_date) {
          whereClause.business_date = {};
          if (query.from_date) {
            const fromDate = new Date(query.from_date);
            fromDate.setHours(0, 0, 0, 0);
            whereClause.business_date.gte = fromDate;
          }
          if (query.to_date) {
            const toDate = new Date(query.to_date);
            toDate.setHours(23, 59, 59, 999);
            whereClause.business_date.lte = toDate;
          }
        }

        // Get summary statistics
        const shiftSummaryCount = await prisma.shiftSummary.count({
          where: whereClause,
        });
        const daySummaryCount = await prisma.daySummary.count({
          where: whereClause,
        });

        // Validate with details
        const shiftResult = await validateShiftSummaries(whereClause, true);
        const dayResult = await validateDaySummaries(whereClause, true);

        // Find orphaned records
        const orphaned = await findOrphanedRecords(query.store_id);

        // Calculate totals from day summaries
        const daySummaries = await prisma.daySummary.findMany({
          where: whereClause,
          take: query.limit,
        });

        let totalGrossSales = 0;
        let totalNetSales = 0;
        let totalTransactions = 0;
        let totalCashVariance = 0;

        for (const summary of daySummaries) {
          totalGrossSales += Number(summary.gross_sales);
          totalNetSales += Number(summary.net_sales);
          totalTransactions += summary.transaction_count;
          totalCashVariance += Number(summary.total_cash_variance);
        }

        const report = {
          generated_at: new Date().toISOString(),
          scope: {
            store_id: query.store_id || "all",
            from_date: query.from_date || "all",
            to_date: query.to_date || "all",
          },
          overview: {
            shift_summaries_total: shiftSummaryCount,
            day_summaries_total: daySummaryCount,
            total_gross_sales: totalGrossSales,
            total_net_sales: totalNetSales,
            total_transactions: totalTransactions,
            total_cash_variance: totalCashVariance,
          },
          validation: {
            overall_valid:
              shiftResult.withDiscrepancies === 0 &&
              dayResult.withDiscrepancies === 0 &&
              orphaned.orphanedShiftSummaries.length === 0 &&
              orphaned.orphanedDaySummaries.length === 0 &&
              orphaned.shiftsWithoutSummaries.length === 0,
            shifts_validated: shiftResult.validated,
            shifts_with_discrepancies: shiftResult.withDiscrepancies,
            days_validated: dayResult.validated,
            days_with_discrepancies: dayResult.withDiscrepancies,
            orphaned_shift_summaries: orphaned.orphanedShiftSummaries.length,
            orphaned_day_summaries: orphaned.orphanedDaySummaries.length,
            shifts_without_summaries: orphaned.shiftsWithoutSummaries.length,
          },
          discrepancies: {
            shift_discrepancies: shiftResult.discrepancies.slice(0, 50),
            day_discrepancies: dayResult.discrepancies.slice(0, 50),
          },
          orphaned_records: {
            shift_summary_ids: orphaned.orphanedShiftSummaries,
            day_summary_ids: orphaned.orphanedDaySummaries,
            shift_ids_missing_summary: orphaned.shiftsWithoutSummaries,
          },
          recommendations: [] as string[],
        };

        // Add recommendations based on findings
        if (orphaned.shiftsWithoutSummaries.length > 0) {
          report.recommendations.push(
            `Run backfill-shift-summaries.ts to create ${orphaned.shiftsWithoutSummaries.length} missing shift summaries`,
          );
        }
        if (orphaned.orphanedShiftSummaries.length > 0) {
          report.recommendations.push(
            `Review ${orphaned.orphanedShiftSummaries.length} orphaned shift summaries - their parent shifts may have been deleted`,
          );
        }
        if (shiftResult.withDiscrepancies > 0) {
          report.recommendations.push(
            `${shiftResult.withDiscrepancies} shift summaries have discrepancies - consider running rollback and re-backfill`,
          );
        }
        if (dayResult.withDiscrepancies > 0) {
          report.recommendations.push(
            `${dayResult.withDiscrepancies} day summaries have discrepancies - run backfill-day-summaries.ts to refresh`,
          );
        }

        return reply.send({
          success: true,
          data: report,
        });
      } catch (error) {
        return handleError(error, reply);
      }
    },
  );
}
