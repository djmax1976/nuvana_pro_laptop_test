/**
 * DaySummary Service
 *
 * Service for creating, updating, and retrieving pre-aggregated day summaries.
 * Phase 3.1: Shift & Day Summary Implementation Plan
 * Phase 7.3: Caching Strategy Integration
 *
 * This service aggregates shift summaries into daily summaries, providing:
 * - Fast daily, weekly, and monthly reporting
 * - Incremental updates when shifts close
 * - Day close finalization
 *
 * Enterprise coding standards applied:
 * - DB-001: ORM usage with Prisma
 * - DB-006: Tenant isolation through store_id scoping
 * - API-003: Centralized error handling with custom error classes
 * - LM-001: Structured logging
 */

import { Prisma, DaySummaryStatus } from "@prisma/client";
import { prisma } from "../utils/db";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  format,
  getWeek,
} from "date-fns";
import { cacheService } from "./cache.service";
// Note: timezone utilities removed - day close now checks ALL open shifts regardless of date
import {
  DaySummaryWithDetails,
  DaySummaryResponse,
  DaySummaryQueryOptions,
  DayTenderSummaryResponse,
  DayDepartmentSummaryResponse,
  DayTaxSummaryResponse,
  DayHourlySummaryResponse,
  PeriodSummaryReportWithBreakdown,
  DayBreakdownItem,
  WeekBreakdownItem,
  DayTenderAggregates,
  DayDepartmentAggregates,
  DayTaxAggregates,
  DayHourlyAggregates,
  DayCloseReconciliationResponse,
  ReconciliationShiftDetail,
  ReconciliationLotteryBin,
} from "../types/day-summary.types";

/**
 * Error for day summary not found
 */
export class DaySummaryNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Day summary not found: ${identifier}`);
    this.name = "DaySummaryNotFoundError";
  }
}

/**
 * Error for day not ready for closing
 */
export class DayNotReadyError extends Error {
  constructor(storeId: string, businessDate: string, reason: string) {
    super(
      `Day ${businessDate} for store ${storeId} is not ready for closing: ${reason}`,
    );
    this.name = "DayNotReadyError";
  }
}

/**
 * Error for day already closed
 */
export class DayAlreadyClosedError extends Error {
  constructor(storeId: string, businessDate: string) {
    super(`Day ${businessDate} for store ${storeId} is already closed`);
    this.name = "DayAlreadyClosedError";
  }
}

/**
 * Error for store not found
 */
export class StoreNotFoundError extends Error {
  constructor(storeId: string) {
    super(`Store not found: ${storeId}`);
    this.name = "StoreNotFoundError";
  }
}

/**
 * Error when lottery day is not closed
 * SEC-006/API-003: Structured error with tenant-scoped context, no sensitive data exposed
 */
export class LotteryNotClosedError extends Error {
  public readonly storeId: string;
  public readonly businessDate: string;

  constructor(storeId: string, businessDate: string) {
    super(
      `Lottery must be closed before day can be closed. Store: ${storeId}, Date: ${businessDate}`,
    );
    this.name = "LotteryNotClosedError";
    this.storeId = storeId;
    this.businessDate = businessDate;
  }
}

/**
 * Open shift detail for error reporting
 * DB-006: Tenant-scoped data structure for RLS-compliant responses
 */
export interface OpenShiftDetail {
  shift_id: string;
  terminal_name: string | null;
  cashier_name: string;
  status: string;
  opened_at: string;
}

/**
 * Error when shifts are still open (with actionable details)
 * API-003: Machine-readable error with structured details for client consumption
 * SEC-014: Only includes necessary fields, no sensitive data exposure
 */
export class ShiftsStillOpenError extends Error {
  public readonly openShifts: OpenShiftDetail[];
  public readonly storeId: string;
  public readonly businessDate: string;

  constructor(
    storeId: string,
    businessDate: string,
    openShifts: OpenShiftDetail[],
  ) {
    super(
      `All shifts must be closed before proceeding. ${openShifts.length} shift(s) still open.`,
    );
    this.name = "ShiftsStillOpenError";
    this.openShifts = openShifts;
    this.storeId = storeId;
    this.businessDate = businessDate;
  }
}

/**
 * DaySummary Service class
 */
class DaySummaryService {
  /**
   * Get or create a day summary for a store and business date.
   * Creates a new OPEN day summary if one doesn't exist.
   *
   * @param storeId - The store ID
   * @param businessDate - The business date
   * @returns The day summary
   */
  async getOrCreateDaySummary(
    storeId: string,
    businessDate: Date,
  ): Promise<DaySummaryWithDetails> {
    // Normalize the date to start of day
    const normalizedDate = new Date(businessDate);
    normalizedDate.setHours(0, 0, 0, 0);

    // Try to find existing day summary
    let daySummary = await prisma.daySummary.findUnique({
      where: {
        store_id_business_date: {
          store_id: storeId,
          business_date: normalizedDate,
        },
      },
      include: {
        tender_summaries: true,
        department_summaries: true,
        tax_summaries: true,
        hourly_summaries: true,
      },
    });

    // Create if doesn't exist
    if (!daySummary) {
      // Verify store exists
      const store = await prisma.store.findUnique({
        where: { store_id: storeId },
        select: { store_id: true },
      });

      if (!store) {
        throw new StoreNotFoundError(storeId);
      }

      daySummary = await prisma.daySummary.create({
        data: {
          store_id: storeId,
          business_date: normalizedDate,
          status: DaySummaryStatus.OPEN,
        },
        include: {
          tender_summaries: true,
          department_summaries: true,
          tax_summaries: true,
          hourly_summaries: true,
        },
      });
    }

    return daySummary as unknown as DaySummaryWithDetails;
  }

  /**
   * Update day summary by aggregating all shift summaries for the day.
   * Called when a shift is closed to update daily totals.
   *
   * @param storeId - The store ID
   * @param businessDate - The business date
   * @returns The updated day summary
   */
  async updateDaySummary(
    storeId: string,
    businessDate: Date,
  ): Promise<DaySummaryWithDetails> {
    const normalizedDate = new Date(businessDate);
    normalizedDate.setHours(0, 0, 0, 0);

    // Get or create the day summary first
    await this.getOrCreateDaySummary(storeId, businessDate);

    // Get all shift summaries for this day
    const shiftSummaries = await prisma.shiftSummary.findMany({
      where: {
        store_id: storeId,
        business_date: normalizedDate,
      },
      include: {
        tender_summaries: true,
        department_summaries: true,
        tax_summaries: true,
        hourly_summaries: true,
      },
      orderBy: { shift_opened_at: "asc" },
    });

    // Aggregate shift data
    const aggregates = this.aggregateShiftSummaries(shiftSummaries);

    // Aggregate tender summaries
    const tenderAggregates = this.aggregateTenderSummaries(shiftSummaries);

    // Aggregate department summaries
    const departmentAggregates =
      this.aggregateDepartmentSummaries(shiftSummaries);

    // Aggregate tax summaries
    const taxAggregates = this.aggregateTaxSummaries(shiftSummaries);

    // Aggregate hourly summaries
    const hourlyAggregates = this.aggregateHourlySummaries(shiftSummaries);

    // Determine status
    let newStatus: DaySummaryStatus = DaySummaryStatus.OPEN;
    if (shiftSummaries.length > 0) {
      // Check if there are any open shifts for this day
      const openShiftsCount = await prisma.shift.count({
        where: {
          store_id: storeId,
          status: { in: ["ACTIVE", "CLOSING", "RECONCILING"] },
          opened_at: {
            gte: normalizedDate,
            lt: new Date(normalizedDate.getTime() + 24 * 60 * 60 * 1000),
          },
        },
      });

      if (openShiftsCount === 0) {
        newStatus = DaySummaryStatus.PENDING_CLOSE;
      }
    }

    // Update day summary in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update main day summary
      const daySummary = await tx.daySummary.update({
        where: {
          store_id_business_date: {
            store_id: storeId,
            business_date: normalizedDate,
          },
        },
        data: {
          shift_count: aggregates.shift_count,
          first_shift_opened: aggregates.first_shift_opened,
          last_shift_closed: aggregates.last_shift_closed,
          gross_sales: aggregates.gross_sales,
          returns_total: aggregates.returns_total,
          discounts_total: aggregates.discounts_total,
          net_sales: aggregates.net_sales,
          tax_collected: aggregates.tax_collected,
          tax_exempt_sales: aggregates.tax_exempt_sales,
          taxable_sales: aggregates.taxable_sales,
          transaction_count: aggregates.transaction_count,
          void_count: aggregates.void_count,
          refund_count: aggregates.refund_count,
          items_sold_count: aggregates.items_sold_count,
          items_returned_count: aggregates.items_returned_count,
          avg_transaction: aggregates.avg_transaction,
          avg_items_per_txn: aggregates.avg_items_per_txn,
          total_opening_cash: aggregates.total_opening_cash,
          total_closing_cash: aggregates.total_closing_cash,
          total_expected_cash: aggregates.total_expected_cash,
          total_cash_variance: aggregates.total_cash_variance,
          lottery_sales: aggregates.lottery_sales,
          lottery_cashes: aggregates.lottery_cashes,
          lottery_net: aggregates.lottery_net,
          lottery_packs_sold: aggregates.lottery_packs_sold,
          lottery_tickets_sold: aggregates.lottery_tickets_sold,
          fuel_gallons: aggregates.fuel_gallons,
          fuel_sales: aggregates.fuel_sales,
          status: newStatus,
        },
      });

      // Delete existing child summaries and recreate
      await tx.dayTenderSummary.deleteMany({
        where: { day_summary_id: daySummary.day_summary_id },
      });
      await tx.dayDepartmentSummary.deleteMany({
        where: { day_summary_id: daySummary.day_summary_id },
      });
      await tx.dayTaxSummary.deleteMany({
        where: { day_summary_id: daySummary.day_summary_id },
      });
      await tx.dayHourlySummary.deleteMany({
        where: { day_summary_id: daySummary.day_summary_id },
      });

      // Create tender summaries
      const tenderSummaries = await Promise.all(
        tenderAggregates.map((tender) =>
          tx.dayTenderSummary.create({
            data: {
              day_summary_id: daySummary.day_summary_id,
              tender_type_id: tender.tender_type_id,
              tender_code: tender.tender_code,
              tender_display_name: tender.tender_display_name,
              total_amount: tender.total_amount,
              transaction_count: tender.transaction_count,
              refund_amount: tender.refund_amount,
              refund_count: tender.refund_count,
              net_amount: tender.total_amount - tender.refund_amount,
            },
          }),
        ),
      );

      // Create department summaries
      const departmentSummaries = await Promise.all(
        departmentAggregates.map((dept) =>
          tx.dayDepartmentSummary.create({
            data: {
              day_summary_id: daySummary.day_summary_id,
              department_id: dept.department_id,
              department_code: dept.department_code,
              department_name: dept.department_name,
              gross_sales: dept.gross_sales,
              returns_total: dept.returns_total,
              discounts_total: dept.discounts_total,
              net_sales: dept.net_sales,
              tax_collected: dept.tax_collected,
              transaction_count: dept.transaction_count,
              items_sold_count: dept.items_sold_count,
              items_returned_count: dept.items_returned_count,
            },
          }),
        ),
      );

      // Create tax summaries
      const taxSummaries = await Promise.all(
        taxAggregates.map((tax) =>
          tx.dayTaxSummary.create({
            data: {
              day_summary_id: daySummary.day_summary_id,
              tax_rate_id: tax.tax_rate_id,
              tax_code: tax.tax_code,
              tax_display_name: tax.tax_display_name,
              tax_rate_snapshot: tax.tax_rate_snapshot,
              taxable_amount: tax.taxable_amount,
              tax_collected: tax.tax_collected,
              exempt_amount: tax.exempt_amount,
              transaction_count: tax.transaction_count,
            },
          }),
        ),
      );

      // Create hourly summaries
      const hourlySummaries = await Promise.all(
        hourlyAggregates.map((hour) =>
          tx.dayHourlySummary.create({
            data: {
              day_summary_id: daySummary.day_summary_id,
              hour_start: hour.hour_start,
              hour_number: hour.hour_number,
              gross_sales: hour.gross_sales,
              net_sales: hour.net_sales,
              transaction_count: hour.transaction_count,
              items_sold_count: hour.items_sold_count,
              avg_transaction:
                hour.transaction_count > 0
                  ? hour.net_sales / hour.transaction_count
                  : 0,
            },
          }),
        ),
      );

      return {
        ...daySummary,
        tender_summaries: tenderSummaries,
        department_summaries: departmentSummaries,
        tax_summaries: taxSummaries,
        hourly_summaries: hourlySummaries,
      } as unknown as DaySummaryWithDetails;
    });

    // Invalidate cache after update (fire-and-forget)
    cacheService.invalidateDaySummary(storeId, normalizedDate).catch((err) => {
      console.warn("Failed to invalidate day summary cache:", err);
    });

    // Also invalidate period reports that might include this date
    cacheService.invalidateStoreReports(storeId).catch((err) => {
      console.warn("Failed to invalidate store reports cache:", err);
    });

    return result;
  }

  /**
   * Close the business day for a store.
   *
   * Prerequisites (defense-in-depth validation):
   * 1. All shifts for the day must be closed
   * 2. Lottery day must be closed (if lottery exists for the day)
   *
   * API-003: Centralized error handling with structured responses
   * DB-006: Tenant isolation via store_id scoping
   * SEC-014: Input validation before processing
   *
   * @param storeId - The store ID
   * @param businessDate - The business date
   * @param closedByUserId - The user closing the day
   * @param notes - Optional manager notes
   * @param currentShiftId - Optional current shift ID to exclude from open shifts check
   * @returns The closed day summary
   */
  async closeDaySummary(
    storeId: string,
    businessDate: Date,
    closedByUserId: string,
    notes?: string,
    currentShiftId?: string,
  ): Promise<DaySummaryWithDetails> {
    const normalizedDate = new Date(businessDate);
    normalizedDate.setHours(0, 0, 0, 0);
    const dateStr = format(normalizedDate, "yyyy-MM-dd");

    // Validate store exists - DB-006: Tenant isolation
    const store = await prisma.store.findUnique({
      where: { store_id: storeId },
      select: { store_id: true },
    });

    if (!store) {
      throw new StoreNotFoundError(storeId);
    }

    // Get current day summary
    const daySummary = await prisma.daySummary.findUnique({
      where: {
        store_id_business_date: {
          store_id: storeId,
          business_date: normalizedDate,
        },
      },
    });

    if (!daySummary) {
      throw new DaySummaryNotFoundError(`${storeId}/${dateStr}`);
    }

    if (daySummary.status === DaySummaryStatus.CLOSED) {
      throw new DayAlreadyClosedError(storeId, dateStr);
    }

    // VALIDATION 1: Check for OTHER open shifts with detailed information
    // BUSINESS RULE: Any open shift (except the current cashier's) blocks day close.
    // The currentShiftId is excluded because the cashier closing the day is doing so
    // from their own shift - they will close it as part of the day close flow.
    // DB-001: Using ORM query builder for safe parameterized queries
    // Includes OPEN status in addition to ACTIVE, CLOSING, RECONCILING
    const openShifts = await prisma.shift.findMany({
      where: {
        store_id: storeId,
        status: { in: ["OPEN", "ACTIVE", "CLOSING", "RECONCILING"] },
        // Exclude the current shift if provided
        ...(currentShiftId && { shift_id: { not: currentShiftId } }),
      },
      select: {
        shift_id: true,
        status: true,
        opened_at: true,
        pos_terminal: {
          select: { name: true }, // Correct field name per Prisma schema
        },
        cashier: {
          select: { name: true }, // Cashier model has single 'name' field
        },
      },
    });

    if (openShifts.length > 0) {
      // API-003: Structured error with actionable details
      throw new ShiftsStillOpenError(
        storeId,
        dateStr,
        openShifts.map((s) => ({
          shift_id: s.shift_id,
          terminal_name: s.pos_terminal?.name || null,
          cashier_name: s.cashier.name,
          status: s.status,
          opened_at: s.opened_at.toISOString(),
        })),
      );
    }

    // =========================================================================
    // VALIDATION 2: Check if lottery day is closed (if lottery exists)
    // =========================================================================
    // PHASE 4: Status-based lottery day lookup
    // Find the OPEN or PENDING_CLOSE lottery day for this store.
    // If none exists, lottery check passes (no lottery to close).
    // If one exists but isn't CLOSED, block the day close.
    //
    // MCP Guidance Applied:
    // - DB-006: TENANT_ISOLATION - store_id filter enforces tenant scoping
    // - DB-001: ORM_USAGE - Using Prisma ORM with query builder, no raw SQL
    // - SEC-006: SQL_INJECTION - All parameters bound via Prisma ORM
    // =========================================================================
    const lotteryDay = await prisma.lotteryBusinessDay.findFirst({
      where: {
        store_id: storeId,
        status: { in: ["OPEN", "PENDING_CLOSE"] },
      },
      select: { status: true },
      orderBy: {
        opened_at: "desc",
      },
    });

    // If an OPEN or PENDING_CLOSE lottery day exists, block the day close
    // This enforces the business rule: lottery must be closed before day close
    // Note: lotteryDay will only exist if status is OPEN or PENDING_CLOSE (from findFirst above)
    if (lotteryDay) {
      throw new LotteryNotClosedError(storeId, dateStr);
    }

    // Update day summary to refresh aggregates and close
    await this.updateDaySummary(storeId, businessDate);

    // Finalize the close
    const result = await prisma.daySummary.update({
      where: {
        store_id_business_date: {
          store_id: storeId,
          business_date: normalizedDate,
        },
      },
      data: {
        status: DaySummaryStatus.CLOSED,
        closed_at: new Date(),
        closed_by: closedByUserId,
        notes: notes || daySummary.notes,
      },
      include: {
        tender_summaries: true,
        department_summaries: true,
        tax_summaries: true,
        hourly_summaries: true,
      },
    });

    return result as unknown as DaySummaryWithDetails;
  }

  /**
   * Get a day summary by store and date
   *
   * Uses cache-aside pattern for improved performance.
   * Cache is populated on first read and invalidated on updates.
   *
   * @param storeId - The store ID
   * @param businessDate - The business date
   * @param options - Query options
   * @returns The day summary or null
   */
  async getByStoreAndDate(
    storeId: string,
    businessDate: Date,
    options: DaySummaryQueryOptions = {},
  ): Promise<DaySummaryWithDetails | null> {
    const normalizedDate = new Date(businessDate);
    normalizedDate.setHours(0, 0, 0, 0);

    // Only use cache if no special includes are requested
    const hasIncludes =
      options.include_tender_summaries ||
      options.include_department_summaries ||
      options.include_tax_summaries ||
      options.include_hourly_summaries;

    if (!hasIncludes) {
      // Try to get from cache first
      const cached = await cacheService.getDaySummary<DaySummaryWithDetails>(
        storeId,
        normalizedDate,
      );
      if (cached) {
        return cached;
      }
    }

    const include: Prisma.DaySummaryInclude = {};

    if (options.include_tender_summaries) {
      include.tender_summaries = true;
    }
    if (options.include_department_summaries) {
      include.department_summaries = true;
    }
    if (options.include_tax_summaries) {
      include.tax_summaries = true;
    }
    if (options.include_hourly_summaries) {
      include.hourly_summaries = true;
    }

    const summary = await prisma.daySummary.findUnique({
      where: {
        store_id_business_date: {
          store_id: storeId,
          business_date: normalizedDate,
        },
      },
      include: Object.keys(include).length > 0 ? include : undefined,
    });

    if (!summary) {
      return null;
    }

    // Cache the result if no special includes
    if (!hasIncludes) {
      // Fire-and-forget caching
      cacheService
        .cacheDaySummary(storeId, normalizedDate, summary)
        .catch((err) => {
          console.warn("Failed to cache day summary:", err);
        });
    }

    return summary as unknown as DaySummaryWithDetails;
  }

  /**
   * Get a day summary by ID
   *
   * @param daySummaryId - The day summary ID
   * @param options - Query options
   * @returns The day summary or null
   */
  async getById(
    daySummaryId: string,
    options: DaySummaryQueryOptions = {},
  ): Promise<DaySummaryWithDetails | null> {
    const include: Prisma.DaySummaryInclude = {};

    if (options.include_tender_summaries) {
      include.tender_summaries = true;
    }
    if (options.include_department_summaries) {
      include.department_summaries = true;
    }
    if (options.include_tax_summaries) {
      include.tax_summaries = true;
    }
    if (options.include_hourly_summaries) {
      include.hourly_summaries = true;
    }

    const summary = await prisma.daySummary.findUnique({
      where: { day_summary_id: daySummaryId },
      include: Object.keys(include).length > 0 ? include : undefined,
    });

    if (!summary) {
      return null;
    }

    return summary as unknown as DaySummaryWithDetails;
  }

  /**
   * List day summaries for a store with filters
   *
   * @param storeId - The store ID
   * @param options - Query options
   * @returns List of day summaries
   */
  async listByStore(
    storeId: string,
    options: DaySummaryQueryOptions = {},
  ): Promise<DaySummaryWithDetails[]> {
    const where: Prisma.DaySummaryWhereInput = {
      store_id: storeId,
    };

    if (options.status) {
      where.status = options.status as DaySummaryStatus;
    }

    if (options.from_date || options.to_date) {
      where.business_date = {};
      if (options.from_date) {
        where.business_date.gte = options.from_date;
      }
      if (options.to_date) {
        where.business_date.lte = options.to_date;
      }
    }

    const include: Prisma.DaySummaryInclude = {};

    if (options.include_tender_summaries) {
      include.tender_summaries = true;
    }
    if (options.include_department_summaries) {
      include.department_summaries = true;
    }
    if (options.include_tax_summaries) {
      include.tax_summaries = true;
    }
    if (options.include_hourly_summaries) {
      include.hourly_summaries = true;
    }

    const summaries = await prisma.daySummary.findMany({
      where,
      include: Object.keys(include).length > 0 ? include : undefined,
      orderBy: { business_date: "desc" },
    });

    return summaries as unknown as DaySummaryWithDetails[];
  }

  /**
   * Get weekly summary report
   *
   * Uses cached reports when available for improved performance.
   *
   * @param storeId - The store ID
   * @param weekOf - Any date within the target week
   * @returns Weekly summary report with daily breakdown
   */
  async getWeeklyReport(
    storeId: string,
    weekOf: Date,
  ): Promise<PeriodSummaryReportWithBreakdown> {
    const weekStart = startOfWeek(weekOf, { weekStartsOn: 0 }); // Sunday
    const weekEnd = endOfWeek(weekOf, { weekStartsOn: 0 });
    const year = weekStart.getFullYear();
    const week = getWeek(weekStart, { weekStartsOn: 0 });

    // Try to get from cache first
    const cached =
      await cacheService.getWeeklyReport<PeriodSummaryReportWithBreakdown>(
        storeId,
        year,
        week,
      );
    if (cached) {
      return cached;
    }

    const report = await this.getPeriodReport(
      storeId,
      weekStart,
      weekEnd,
      "week",
    );

    // Cache the result (fire-and-forget)
    cacheService.cacheWeeklyReport(storeId, year, week, report).catch((err) => {
      console.warn("Failed to cache weekly report:", err);
    });

    return report;
  }

  /**
   * Get monthly summary report
   *
   * Uses cached reports when available for improved performance.
   *
   * @param storeId - The store ID
   * @param year - The year
   * @param month - The month (1-12)
   * @returns Monthly summary report with daily and weekly breakdowns
   */
  async getMonthlyReport(
    storeId: string,
    year: number,
    month: number,
  ): Promise<PeriodSummaryReportWithBreakdown> {
    // Try to get from cache first
    const cached =
      await cacheService.getMonthlyReport<PeriodSummaryReportWithBreakdown>(
        storeId,
        year,
        month,
      );
    if (cached) {
      return cached;
    }

    const monthStart = startOfMonth(new Date(year, month - 1, 1));
    const monthEnd = endOfMonth(new Date(year, month - 1, 1));

    const report = await this.getPeriodReport(
      storeId,
      monthStart,
      monthEnd,
      "month",
    );

    // Cache the result (fire-and-forget)
    cacheService
      .cacheMonthlyReport(storeId, year, month, report)
      .catch((err) => {
        console.warn("Failed to cache monthly report:", err);
      });

    return report;
  }

  /**
   * Get period summary report (internal)
   *
   * Returns structured report with totals, daily breakdown, and
   * weekly breakdown (for monthly reports).
   */
  private async getPeriodReport(
    storeId: string,
    startDate: Date,
    endDate: Date,
    periodType: "week" | "month",
  ): Promise<PeriodSummaryReportWithBreakdown> {
    const daySummaries = await prisma.daySummary.findMany({
      where: {
        store_id: storeId,
        business_date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { business_date: "asc" },
    });

    // Aggregate the day summaries into totals
    let shift_count = 0;
    let gross_sales = 0;
    let returns_total = 0;
    let discounts_total = 0;
    let net_sales = 0;
    let tax_collected = 0;
    let transaction_count = 0;
    let items_sold_count = 0;
    let total_variance = 0;
    let lottery_sales: number | null = null;
    let lottery_net: number | null = null;
    let fuel_sales: number | null = null;
    let fuel_gallons: number | null = null;

    // Build daily breakdown
    const daily_breakdown: DayBreakdownItem[] = [];

    for (const day of daySummaries) {
      shift_count += day.shift_count;
      gross_sales += Number(day.gross_sales);
      returns_total += Number(day.returns_total);
      discounts_total += Number(day.discounts_total);
      net_sales += Number(day.net_sales);
      tax_collected += Number(day.tax_collected);
      transaction_count += day.transaction_count;
      items_sold_count += day.items_sold_count;
      total_variance += Number(day.total_cash_variance);

      if (day.lottery_sales !== null) {
        lottery_sales = (lottery_sales || 0) + Number(day.lottery_sales);
      }
      if (day.lottery_net !== null) {
        lottery_net = (lottery_net || 0) + Number(day.lottery_net);
      }
      if (day.fuel_sales !== null) {
        fuel_sales = (fuel_sales || 0) + Number(day.fuel_sales);
      }
      if (day.fuel_gallons !== null) {
        fuel_gallons = (fuel_gallons || 0) + Number(day.fuel_gallons);
      }

      // Add to daily breakdown
      daily_breakdown.push({
        business_date: format(day.business_date, "yyyy-MM-dd"),
        shift_count: day.shift_count,
        net_sales: Number(day.net_sales),
        gross_sales: Number(day.gross_sales),
        transaction_count: day.transaction_count,
        variance_amount: Number(day.total_cash_variance),
        status: day.status,
      });
    }

    const day_count = daySummaries.length;
    const avg_daily_sales = day_count > 0 ? net_sales / day_count : 0;
    const avg_transaction_value =
      transaction_count > 0 ? net_sales / transaction_count : 0;

    // Build weekly breakdown for monthly reports
    let weekly_breakdown: WeekBreakdownItem[] | undefined;
    if (periodType === "month" && daySummaries.length > 0) {
      weekly_breakdown = this.buildWeeklyBreakdown(daySummaries);
    }

    return {
      store_id: storeId,
      period_type: periodType,
      period_start: format(startDate, "yyyy-MM-dd"),
      period_end: format(endDate, "yyyy-MM-dd"),
      day_count,
      totals: {
        gross_sales,
        returns_total,
        discounts_total,
        net_sales,
        tax_collected,
        transaction_count,
        items_sold_count,
        avg_daily_sales,
        avg_transaction_value,
        total_variance,
        shift_count,
        lottery_sales,
        lottery_net,
        fuel_sales,
        fuel_gallons,
      },
      daily_breakdown,
      weekly_breakdown,
    };
  }

  /**
   * Build weekly breakdown from day summaries for monthly reports
   */
  private buildWeeklyBreakdown(daySummaries: any[]): WeekBreakdownItem[] {
    const weekMap = new Map<
      number,
      {
        week_number: number;
        week_start: Date;
        week_end: Date;
        net_sales: number;
        gross_sales: number;
        transaction_count: number;
        shift_count: number;
        variance_amount: number;
      }
    >();

    for (const day of daySummaries) {
      const weekNum = getWeek(day.business_date, { weekStartsOn: 0 });
      const existing = weekMap.get(weekNum);

      if (existing) {
        existing.net_sales += Number(day.net_sales);
        existing.gross_sales += Number(day.gross_sales);
        existing.transaction_count += day.transaction_count;
        existing.shift_count += day.shift_count;
        existing.variance_amount += Number(day.total_cash_variance);
        // Update week_end if this day is later
        if (day.business_date > existing.week_end) {
          existing.week_end = day.business_date;
        }
      } else {
        const weekStart = startOfWeek(day.business_date, { weekStartsOn: 0 });
        const weekEnd = endOfWeek(day.business_date, { weekStartsOn: 0 });
        weekMap.set(weekNum, {
          week_number: weekNum,
          week_start: weekStart,
          week_end: weekEnd,
          net_sales: Number(day.net_sales),
          gross_sales: Number(day.gross_sales),
          transaction_count: day.transaction_count,
          shift_count: day.shift_count,
          variance_amount: Number(day.total_cash_variance),
        });
      }
    }

    return Array.from(weekMap.values())
      .sort((a, b) => a.week_number - b.week_number)
      .map((w) => ({
        week_number: w.week_number,
        week_start: format(w.week_start, "yyyy-MM-dd"),
        week_end: format(w.week_end, "yyyy-MM-dd"),
        net_sales: w.net_sales,
        gross_sales: w.gross_sales,
        transaction_count: w.transaction_count,
        shift_count: w.shift_count,
        variance_amount: w.variance_amount,
      }));
  }

  /**
   * Update day summary notes
   *
   * @param storeId - The store ID
   * @param businessDate - The business date
   * @param notes - The notes to set
   * @returns The updated day summary
   */
  async updateNotes(
    storeId: string,
    businessDate: Date,
    notes: string | null,
  ): Promise<DaySummaryWithDetails> {
    const normalizedDate = new Date(businessDate);
    normalizedDate.setHours(0, 0, 0, 0);

    const result = await prisma.daySummary.update({
      where: {
        store_id_business_date: {
          store_id: storeId,
          business_date: normalizedDate,
        },
      },
      data: { notes },
      include: {
        tender_summaries: true,
        department_summaries: true,
        tax_summaries: true,
        hourly_summaries: true,
      },
    });

    return result as unknown as DaySummaryWithDetails;
  }

  /**
   * Convert a day summary to API response format
   */
  toResponse(summary: DaySummaryWithDetails): DaySummaryResponse {
    return {
      day_summary_id: summary.day_summary_id,
      store_id: summary.store_id,
      business_date: format(summary.business_date, "yyyy-MM-dd"),
      shift_count: summary.shift_count,
      first_shift_opened: summary.first_shift_opened?.toISOString() || null,
      last_shift_closed: summary.last_shift_closed?.toISOString() || null,
      gross_sales: Number(summary.gross_sales),
      returns_total: Number(summary.returns_total),
      discounts_total: Number(summary.discounts_total),
      net_sales: Number(summary.net_sales),
      tax_collected: Number(summary.tax_collected),
      tax_exempt_sales: Number(summary.tax_exempt_sales),
      taxable_sales: Number(summary.taxable_sales),
      transaction_count: summary.transaction_count,
      void_count: summary.void_count,
      refund_count: summary.refund_count,
      customer_count: summary.customer_count,
      items_sold_count: summary.items_sold_count,
      items_returned_count: summary.items_returned_count,
      avg_transaction: Number(summary.avg_transaction),
      avg_items_per_txn: Number(summary.avg_items_per_txn),
      total_opening_cash: Number(summary.total_opening_cash),
      total_closing_cash: Number(summary.total_closing_cash),
      total_expected_cash: Number(summary.total_expected_cash),
      total_cash_variance: Number(summary.total_cash_variance),
      lottery_sales: summary.lottery_sales
        ? Number(summary.lottery_sales)
        : null,
      lottery_cashes: summary.lottery_cashes
        ? Number(summary.lottery_cashes)
        : null,
      lottery_net: summary.lottery_net ? Number(summary.lottery_net) : null,
      lottery_packs_sold: summary.lottery_packs_sold,
      lottery_tickets_sold: summary.lottery_tickets_sold,
      fuel_gallons: summary.fuel_gallons ? Number(summary.fuel_gallons) : null,
      fuel_sales: summary.fuel_sales ? Number(summary.fuel_sales) : null,
      status: summary.status,
      closed_at: summary.closed_at?.toISOString() || null,
      closed_by: summary.closed_by,
      notes: summary.notes,
      created_at: summary.created_at.toISOString(),
      updated_at: summary.updated_at.toISOString(),
      tender_summaries: summary.tender_summaries?.map(this.toTenderResponse),
      department_summaries: summary.department_summaries?.map(
        this.toDepartmentResponse,
      ),
      tax_summaries: summary.tax_summaries?.map(this.toTaxResponse),
      hourly_summaries: summary.hourly_summaries?.map(this.toHourlyResponse),
    };
  }

  private toTenderResponse(tender: any): DayTenderSummaryResponse {
    return {
      id: tender.id,
      tender_type_id: tender.tender_type_id,
      tender_code: tender.tender_code,
      tender_display_name: tender.tender_display_name,
      total_amount: Number(tender.total_amount),
      transaction_count: tender.transaction_count,
      refund_amount: Number(tender.refund_amount),
      refund_count: tender.refund_count,
      net_amount: Number(tender.net_amount),
    };
  }

  private toDepartmentResponse(dept: any): DayDepartmentSummaryResponse {
    return {
      id: dept.id,
      department_id: dept.department_id,
      department_code: dept.department_code,
      department_name: dept.department_name,
      gross_sales: Number(dept.gross_sales),
      returns_total: Number(dept.returns_total),
      discounts_total: Number(dept.discounts_total),
      net_sales: Number(dept.net_sales),
      tax_collected: Number(dept.tax_collected),
      transaction_count: dept.transaction_count,
      items_sold_count: dept.items_sold_count,
      items_returned_count: dept.items_returned_count,
    };
  }

  private toTaxResponse(tax: any): DayTaxSummaryResponse {
    return {
      id: tax.id,
      tax_rate_id: tax.tax_rate_id,
      tax_code: tax.tax_code,
      tax_display_name: tax.tax_display_name,
      tax_rate_snapshot: Number(tax.tax_rate_snapshot),
      taxable_amount: Number(tax.taxable_amount),
      tax_collected: Number(tax.tax_collected),
      exempt_amount: Number(tax.exempt_amount),
      transaction_count: tax.transaction_count,
    };
  }

  private toHourlyResponse(hour: any): DayHourlySummaryResponse {
    return {
      id: hour.id,
      hour_start: hour.hour_start.toISOString(),
      hour_number: hour.hour_number,
      gross_sales: Number(hour.gross_sales),
      net_sales: Number(hour.net_sales),
      transaction_count: hour.transaction_count,
      items_sold_count: hour.items_sold_count,
      avg_transaction: Number(hour.avg_transaction),
    };
  }

  /**
   * Aggregate shift summaries into day totals
   */
  private aggregateShiftSummaries(shiftSummaries: any[]) {
    let gross_sales = 0;
    let returns_total = 0;
    let discounts_total = 0;
    let net_sales = 0;
    let tax_collected = 0;
    let tax_exempt_sales = 0;
    let taxable_sales = 0;
    let transaction_count = 0;
    let void_count = 0;
    let refund_count = 0;
    let items_sold_count = 0;
    let items_returned_count = 0;
    let total_opening_cash = 0;
    let total_closing_cash = 0;
    let total_expected_cash = 0;
    let total_cash_variance = 0;
    let lottery_sales: number | null = null;
    let lottery_cashes: number | null = null;
    let lottery_net: number | null = null;
    let lottery_packs_sold: number | null = null;
    let lottery_tickets_sold: number | null = null;
    let fuel_gallons: number | null = null;
    let fuel_sales: number | null = null;

    let first_shift_opened: Date | null = null;
    let last_shift_closed: Date | null = null;

    for (const shift of shiftSummaries) {
      gross_sales += Number(shift.gross_sales);
      returns_total += Number(shift.returns_total);
      discounts_total += Number(shift.discounts_total);
      net_sales += Number(shift.net_sales);
      tax_collected += Number(shift.tax_collected);
      tax_exempt_sales += Number(shift.tax_exempt_sales);
      taxable_sales += Number(shift.taxable_sales);
      transaction_count += shift.transaction_count;
      void_count += shift.void_count;
      refund_count += shift.refund_count;
      items_sold_count += shift.items_sold_count;
      items_returned_count += shift.items_returned_count;
      total_opening_cash += Number(shift.opening_cash);
      total_closing_cash += Number(shift.closing_cash);
      total_expected_cash += Number(shift.expected_cash);
      total_cash_variance += Number(shift.cash_variance);

      // Track first/last shift times
      const openedAt = new Date(shift.shift_opened_at);
      const closedAt = new Date(shift.shift_closed_at);

      if (!first_shift_opened || openedAt < first_shift_opened) {
        first_shift_opened = openedAt;
      }
      if (!last_shift_closed || closedAt > last_shift_closed) {
        last_shift_closed = closedAt;
      }

      // Aggregate optional fields
      if (shift.lottery_sales !== null) {
        lottery_sales = (lottery_sales || 0) + Number(shift.lottery_sales);
      }
      if (shift.lottery_cashes !== null) {
        lottery_cashes = (lottery_cashes || 0) + Number(shift.lottery_cashes);
      }
      if (shift.lottery_net !== null) {
        lottery_net = (lottery_net || 0) + Number(shift.lottery_net);
      }
      if (shift.lottery_packs_sold !== null) {
        lottery_packs_sold =
          (lottery_packs_sold || 0) + shift.lottery_packs_sold;
      }
      if (shift.lottery_tickets_sold !== null) {
        lottery_tickets_sold =
          (lottery_tickets_sold || 0) + shift.lottery_tickets_sold;
      }
      if (shift.fuel_gallons !== null) {
        fuel_gallons = (fuel_gallons || 0) + Number(shift.fuel_gallons);
      }
      if (shift.fuel_sales !== null) {
        fuel_sales = (fuel_sales || 0) + Number(shift.fuel_sales);
      }
    }

    const shift_count = shiftSummaries.length;
    const avg_transaction =
      transaction_count > 0 ? net_sales / transaction_count : 0;
    const avg_items_per_txn =
      transaction_count > 0 ? items_sold_count / transaction_count : 0;

    return {
      shift_count,
      first_shift_opened,
      last_shift_closed,
      gross_sales,
      returns_total,
      discounts_total,
      net_sales,
      tax_collected,
      tax_exempt_sales,
      taxable_sales,
      transaction_count,
      void_count,
      refund_count,
      items_sold_count,
      items_returned_count,
      avg_transaction,
      avg_items_per_txn,
      total_opening_cash,
      total_closing_cash,
      total_expected_cash,
      total_cash_variance,
      lottery_sales,
      lottery_cashes,
      lottery_net,
      lottery_packs_sold,
      lottery_tickets_sold,
      fuel_gallons,
      fuel_sales,
    };
  }

  /**
   * Aggregate tender summaries from all shifts
   */
  private aggregateTenderSummaries(
    shiftSummaries: any[],
  ): DayTenderAggregates[] {
    const tenderMap = new Map<string, DayTenderAggregates>();

    for (const shift of shiftSummaries) {
      for (const tender of shift.tender_summaries || []) {
        const existing = tenderMap.get(tender.tender_type_id);
        if (existing) {
          existing.total_amount += Number(tender.total_amount);
          existing.transaction_count += tender.transaction_count;
          existing.refund_amount += Number(tender.refund_amount);
          existing.refund_count += tender.refund_count;
        } else {
          tenderMap.set(tender.tender_type_id, {
            tender_type_id: tender.tender_type_id,
            tender_code: tender.tender_code,
            tender_display_name: tender.tender_display_name,
            total_amount: Number(tender.total_amount),
            transaction_count: tender.transaction_count,
            refund_amount: Number(tender.refund_amount),
            refund_count: tender.refund_count,
          });
        }
      }
    }

    return Array.from(tenderMap.values());
  }

  /**
   * Aggregate department summaries from all shifts
   */
  private aggregateDepartmentSummaries(
    shiftSummaries: any[],
  ): DayDepartmentAggregates[] {
    const deptMap = new Map<string, DayDepartmentAggregates>();

    for (const shift of shiftSummaries) {
      for (const dept of shift.department_summaries || []) {
        const existing = deptMap.get(dept.department_id);
        if (existing) {
          existing.gross_sales += Number(dept.gross_sales);
          existing.returns_total += Number(dept.returns_total);
          existing.discounts_total += Number(dept.discounts_total);
          existing.net_sales += Number(dept.net_sales);
          existing.tax_collected += Number(dept.tax_collected);
          existing.transaction_count += dept.transaction_count;
          existing.items_sold_count += dept.items_sold_count;
          existing.items_returned_count += dept.items_returned_count;
        } else {
          deptMap.set(dept.department_id, {
            department_id: dept.department_id,
            department_code: dept.department_code,
            department_name: dept.department_name,
            gross_sales: Number(dept.gross_sales),
            returns_total: Number(dept.returns_total),
            discounts_total: Number(dept.discounts_total),
            net_sales: Number(dept.net_sales),
            tax_collected: Number(dept.tax_collected),
            transaction_count: dept.transaction_count,
            items_sold_count: dept.items_sold_count,
            items_returned_count: dept.items_returned_count,
          });
        }
      }
    }

    return Array.from(deptMap.values());
  }

  /**
   * Aggregate tax summaries from all shifts
   */
  private aggregateTaxSummaries(shiftSummaries: any[]): DayTaxAggregates[] {
    const taxMap = new Map<string, DayTaxAggregates>();

    for (const shift of shiftSummaries) {
      for (const tax of shift.tax_summaries || []) {
        const existing = taxMap.get(tax.tax_rate_id);
        if (existing) {
          existing.taxable_amount += Number(tax.taxable_amount);
          existing.tax_collected += Number(tax.tax_collected);
          existing.exempt_amount += Number(tax.exempt_amount);
          existing.transaction_count += tax.transaction_count;
        } else {
          taxMap.set(tax.tax_rate_id, {
            tax_rate_id: tax.tax_rate_id,
            tax_code: tax.tax_code,
            tax_display_name: tax.tax_display_name,
            tax_rate_snapshot: Number(tax.tax_rate_snapshot),
            taxable_amount: Number(tax.taxable_amount),
            tax_collected: Number(tax.tax_collected),
            exempt_amount: Number(tax.exempt_amount),
            transaction_count: tax.transaction_count,
          });
        }
      }
    }

    return Array.from(taxMap.values());
  }

  /**
   * Aggregate hourly summaries from all shifts
   */
  private aggregateHourlySummaries(
    shiftSummaries: any[],
  ): DayHourlyAggregates[] {
    const hourMap = new Map<number, DayHourlyAggregates>();

    for (const shift of shiftSummaries) {
      for (const hour of shift.hourly_summaries || []) {
        const existing = hourMap.get(hour.hour_number);
        if (existing) {
          existing.gross_sales += Number(hour.gross_sales);
          existing.net_sales += Number(hour.net_sales);
          existing.transaction_count += hour.transaction_count;
          existing.items_sold_count += hour.items_sold_count;
        } else {
          hourMap.set(hour.hour_number, {
            hour_start: new Date(hour.hour_start),
            hour_number: hour.hour_number,
            gross_sales: Number(hour.gross_sales),
            net_sales: Number(hour.net_sales),
            transaction_count: hour.transaction_count,
            items_sold_count: hour.items_sold_count,
          });
        }
      }
    }

    return Array.from(hourMap.values()).sort(
      (a, b) => a.hour_number - b.hour_number,
    );
  }

  // =========================================================================
  // DAY CLOSE RECONCILIATION
  // =========================================================================

  /**
   * Get Day Close reconciliation data combining all shifts + lottery for a date.
   *
   * This is the main endpoint data for viewing a "Day Close" row in Lottery Management.
   * It aggregates:
   * - All shifts that have ShiftSummary.business_date matching this date
   * - Lottery bins closed from LotteryBusinessDay + LotteryDayPack
   * - Combined day totals from DaySummary
   *
   * @security DB-006: TENANT_ISOLATION - All queries scoped by store_id
   * @security SEC-014: INPUT_VALIDATION - Date format validated
   * @security API-003: ERROR_HANDLING - Proper error responses
   *
   * @param storeId - Store UUID
   * @param businessDate - Business date
   * @returns Complete reconciliation data for the day
   */
  async getReconciliation(
    storeId: string,
    businessDate: Date,
  ): Promise<DayCloseReconciliationResponse> {
    // Normalize date to start of day
    const normalizedDate = new Date(businessDate);
    normalizedDate.setHours(0, 0, 0, 0);
    const businessDateStr = format(normalizedDate, "yyyy-MM-dd");

    // =========================================================================
    // 1. Get DaySummary for day totals and status
    // =========================================================================
    const daySummary = await prisma.daySummary.findUnique({
      where: {
        store_id_business_date: {
          store_id: storeId,
          business_date: normalizedDate,
        },
      },
      include: {
        closed_by_user: {
          select: { name: true },
        },
      },
    });

    // =========================================================================
    // 2. Get all shifts for this business date
    // DB-006: TENANT_ISOLATION - Filter by store_id AND business_date
    // =========================================================================
    const shiftSummaries = await prisma.shiftSummary.findMany({
      where: {
        store_id: storeId,
        business_date: normalizedDate,
      },
      include: {
        shift: {
          select: {
            shift_id: true,
            status: true,
            opened_at: true,
            closed_at: true,
            opening_cash: true,
            closing_cash: true,
            expected_cash: true,
            variance: true,
            cashier: {
              select: { name: true },
            },
            pos_terminal: {
              select: { name: true },
            },
          },
        },
      },
      orderBy: {
        created_at: "asc",
      },
    });

    // Transform shifts to response format
    const shifts: ReconciliationShiftDetail[] = shiftSummaries.map((ss) => ({
      shift_id: ss.shift_id,
      terminal_name: ss.shift?.pos_terminal?.name || null,
      cashier_name: ss.shift?.cashier?.name || "Unknown",
      opened_at: ss.shift?.opened_at?.toISOString() || "",
      closed_at: ss.shift?.closed_at?.toISOString() || null,
      status: ss.shift?.status || "UNKNOWN",
      opening_cash: ss.shift?.opening_cash ? Number(ss.shift.opening_cash) : 0,
      closing_cash: ss.shift?.closing_cash
        ? Number(ss.shift.closing_cash)
        : null,
      expected_cash: ss.expected_cash ? Number(ss.expected_cash) : null,
      variance: ss.cash_variance ? Number(ss.cash_variance) : null,
      net_sales: Number(ss.net_sales),
      transaction_count: ss.transaction_count,
      lottery_sales: ss.lottery_sales ? Number(ss.lottery_sales) : null,
      lottery_tickets_sold: ss.lottery_tickets_sold,
    }));

    // =========================================================================
    // 3. Get LotteryBusinessDay and bins closed
    // =========================================================================
    // PHASE 4: Use findFirst with date filter (unique constraint removed)
    // For reconciliation reports, we look up by calendar date to get historical data.
    // If multiple days exist for same date (edge case), prefer CLOSED for reports.
    //
    // MCP Guidance Applied:
    // - DB-006: TENANT_ISOLATION - store_id filter enforces tenant scoping
    // - DB-001: ORM_USAGE - Using Prisma ORM with query builder, no raw SQL
    // - SEC-006: SQL_INJECTION - All parameters bound via Prisma ORM
    // =========================================================================
    const lotteryDay = await prisma.lotteryBusinessDay.findFirst({
      where: {
        store_id: storeId,
        business_date: normalizedDate,
      },
      include: {
        day_packs: {
          include: {
            pack: {
              include: {
                game: {
                  select: {
                    name: true,
                    price: true,
                  },
                },
                bin: {
                  select: {
                    display_order: true,
                  },
                },
              },
            },
          },
        },
      },
      // If multiple records exist for same date, prefer CLOSED for historical reports
      orderBy: [
        { status: "asc" }, // CLOSED < OPEN < PENDING_CLOSE alphabetically
        { closed_at: "desc" }, // Most recently closed first
      ],
    });

    // Transform lottery bins to response format
    const binsClosed: ReconciliationLotteryBin[] =
      lotteryDay?.day_packs?.map((dp) => ({
        bin_number: dp.pack.bin ? dp.pack.bin.display_order + 1 : 0,
        pack_number: dp.pack.pack_number,
        game_name: dp.pack.game.name,
        game_price: Number(dp.pack.game.price),
        starting_serial: dp.starting_serial || "",
        closing_serial: dp.ending_serial || "",
        tickets_sold: dp.tickets_sold || 0,
        sales_amount: Number(dp.sales_amount || 0),
      })) || [];

    // Sort bins by bin_number for consistent display
    binsClosed.sort((a, b) => a.bin_number - b.bin_number);

    // Calculate lottery totals from bins
    let lotteryTotalSales = 0;
    let lotteryTotalTickets = 0;
    for (const bin of binsClosed) {
      lotteryTotalSales += bin.sales_amount;
      lotteryTotalTickets += bin.tickets_sold;
    }

    // =========================================================================
    // 4. Build response
    // =========================================================================
    const response: DayCloseReconciliationResponse = {
      store_id: storeId,
      business_date: businessDateStr,
      status: daySummary?.status || "OPEN",
      closed_at: daySummary?.closed_at?.toISOString() || null,
      closed_by: daySummary?.closed_by || null,
      closed_by_name: daySummary?.closed_by_user?.name || null,

      shifts,

      lottery: {
        is_closed: lotteryDay?.status === "CLOSED",
        closed_at: lotteryDay?.closed_at?.toISOString() || null,
        bins_closed: binsClosed,
        total_sales: lotteryTotalSales,
        total_tickets_sold: lotteryTotalTickets,
      },

      day_totals: {
        shift_count: daySummary?.shift_count || shifts.length,
        gross_sales: daySummary ? Number(daySummary.gross_sales) : 0,
        net_sales: daySummary ? Number(daySummary.net_sales) : 0,
        tax_collected: daySummary ? Number(daySummary.tax_collected) : 0,
        transaction_count: daySummary?.transaction_count || 0,
        total_opening_cash: daySummary
          ? Number(daySummary.total_opening_cash)
          : 0,
        total_closing_cash: daySummary
          ? Number(daySummary.total_closing_cash)
          : 0,
        total_expected_cash: daySummary
          ? Number(daySummary.total_expected_cash)
          : 0,
        total_cash_variance: daySummary
          ? Number(daySummary.total_cash_variance)
          : 0,
        lottery_sales: daySummary?.lottery_sales
          ? Number(daySummary.lottery_sales)
          : lotteryTotalSales > 0
            ? lotteryTotalSales
            : null,
        lottery_net: daySummary?.lottery_net
          ? Number(daySummary.lottery_net)
          : null,
      },

      notes: daySummary?.notes || null,
    };

    return response;
  }
}

// Export singleton instance
export const daySummaryService = new DaySummaryService();
