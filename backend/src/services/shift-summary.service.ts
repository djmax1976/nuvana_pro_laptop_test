/**
 * ShiftSummary Service
 *
 * Service for creating and retrieving pre-aggregated shift summaries.
 * Phase 2.1: Shift & Day Summary Implementation Plan
 * Phase 7.3: Caching Strategy Integration
 *
 * This service creates a frozen snapshot of shift data when a shift is closed,
 * enabling fast reporting without runtime aggregation.
 *
 * Enterprise coding standards applied:
 * - DB-001: ORM usage with Prisma
 * - DB-006: Tenant isolation through store_id scoping
 * - API-003: Centralized error handling with custom error classes
 */

import { Prisma, ShiftStatus } from "@prisma/client";
import { prisma } from "../utils/db";
import { startOfHour, differenceInMinutes } from "date-fns";
import { cacheService, CACHE_TTL, CacheKeys } from "./cache.service";
import {
  ShiftSummaryWithDetails,
  ShiftSummaryResponse,
  ShiftSummaryQueryOptions,
  ShiftTenderSummaryResponse,
  ShiftDepartmentSummaryResponse,
  ShiftTaxSummaryResponse,
  ShiftHourlySummaryResponse,
} from "../types/shift-summary.types";

/**
 * Error for shift summary not found
 */
export class ShiftSummaryNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Shift summary not found: ${identifier}`);
    this.name = "ShiftSummaryNotFoundError";
  }
}

/**
 * Error for shift not ready for summary creation
 */
export class ShiftNotReadyError extends Error {
  constructor(shiftId: string, reason: string) {
    super(`Shift ${shiftId} is not ready for summary creation: ${reason}`);
    this.name = "ShiftNotReadyError";
  }
}

/**
 * Error for duplicate shift summary
 */
export class DuplicateShiftSummaryError extends Error {
  constructor(shiftId: string) {
    super(`A summary already exists for shift ${shiftId}`);
    this.name = "DuplicateShiftSummaryError";
  }
}

/**
 * ShiftSummary Service class
 */
class ShiftSummaryService {
  /**
   * Create a shift summary when a shift is closed.
   * This aggregates all transaction data and creates a frozen snapshot.
   *
   * @param shiftId - The shift ID to create a summary for
   * @param closedByUserId - The user ID who closed the shift
   * @returns The created shift summary with all child summaries
   */
  async createShiftSummary(
    shiftId: string,
    closedByUserId: string,
  ): Promise<ShiftSummaryWithDetails> {
    // 1. Get shift details and validate it's closed
    const shift = await prisma.shift.findUnique({
      where: { shift_id: shiftId },
      include: {
        store: {
          select: {
            store_id: true,
            company_id: true,
            timezone: true,
          },
        },
        cashier: {
          select: {
            cashier_id: true,
            name: true,
          },
        },
      },
    });

    if (!shift) {
      throw new ShiftNotReadyError(shiftId, "Shift not found");
    }

    if (shift.status !== ShiftStatus.CLOSED) {
      throw new ShiftNotReadyError(
        shiftId,
        `Shift must be CLOSED but is ${shift.status}`,
      );
    }

    if (!shift.closed_at) {
      throw new ShiftNotReadyError(shiftId, "Shift has no closed_at timestamp");
    }

    // Check if summary already exists
    const existingSummary = await prisma.shiftSummary.findUnique({
      where: { shift_id: shiftId },
    });

    if (existingSummary) {
      throw new DuplicateShiftSummaryError(shiftId);
    }

    // 2. Calculate business date based on shift opening time
    // For now, use the date portion of opened_at as business_date
    // TODO: Add support for store's business day cutoff time
    const businessDate = new Date(shift.opened_at);
    businessDate.setHours(0, 0, 0, 0);

    // 3. Aggregate all transactions for the shift
    const transactions = await prisma.transaction.findMany({
      where: { shift_id: shiftId },
      include: {
        line_items: {
          include: {
            department: true,
            tax_rate: true, // Include tax rate for aggregation (Phase 2.4)
          },
        },
        payments: {
          include: {
            tender_type: true,
          },
        },
      },
    });

    // 4. Calculate aggregate totals
    const aggregates = this.calculateTransactionAggregates(transactions);

    // 5. Calculate shift duration
    const shiftDurationMins = differenceInMinutes(
      shift.closed_at,
      shift.opened_at,
    );

    // 6. Calculate averages
    const avgTransaction =
      aggregates.transaction_count > 0
        ? aggregates.net_sales / aggregates.transaction_count
        : 0;
    const avgItemsPerTxn =
      aggregates.transaction_count > 0
        ? aggregates.items_sold_count / aggregates.transaction_count
        : 0;

    // 7. Calculate cash variance percentage
    const openingCash = Number(shift.opening_cash);
    const closingCash = Number(shift.closing_cash || 0);
    const expectedCash = Number(shift.expected_cash || openingCash);
    const cashVariance = closingCash - expectedCash;
    const variancePercentage =
      expectedCash > 0 ? (cashVariance / expectedCash) * 100 : 0;

    // 8. Aggregate by tender type
    const tenderAggregates = this.aggregateByTenderType(transactions);

    // 9. Aggregate by department
    const departmentAggregates = this.aggregateByDepartment(transactions);

    // 10. Aggregate by tax rate (placeholder - needs tax rate tracking in line items)
    const taxAggregates = this.aggregateByTaxRate(
      transactions,
      shift.store.company_id,
    );

    // 11. Aggregate by hour
    const hourlyAggregates = this.aggregateByHour(transactions);

    // 12. Get lottery data if available
    const lotteryData = await this.getLotteryData(shiftId, shift.store_id);

    // 13. Create all summary records in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create main shift summary
      const shiftSummary = await tx.shiftSummary.create({
        data: {
          shift_id: shiftId,
          store_id: shift.store_id,
          business_date: businessDate,
          shift_opened_at: shift.opened_at,
          shift_closed_at: shift.closed_at!, // Non-null assertion: validated above
          shift_duration_mins: shiftDurationMins,
          opened_by_user_id: shift.opened_by,
          closed_by_user_id: closedByUserId,
          cashier_user_id: null, // Cashier is a Cashier record, not a User
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
          no_sale_count: 0, // TODO: Track no-sale opens
          items_sold_count: aggregates.items_sold_count,
          items_returned_count: aggregates.items_returned_count,
          avg_transaction: avgTransaction,
          avg_items_per_txn: avgItemsPerTxn,
          opening_cash: openingCash,
          closing_cash: closingCash,
          expected_cash: expectedCash,
          cash_variance: cashVariance,
          variance_percentage: variancePercentage,
          variance_approved: shift.approved_by !== null,
          variance_approved_by: shift.approved_by,
          variance_approved_at: shift.approved_at,
          variance_reason: shift.variance_reason,
          lottery_sales: lotteryData?.sales || null,
          lottery_cashes: lotteryData?.cashes || null,
          lottery_net: lotteryData?.net || null,
          lottery_packs_sold: lotteryData?.packs_sold || null,
          lottery_tickets_sold: lotteryData?.tickets_sold || null,
        },
      });

      // Create tender summaries
      const tenderSummaries = await Promise.all(
        tenderAggregates.map((tender) =>
          tx.shiftTenderSummary.create({
            data: {
              shift_summary_id: shiftSummary.shift_summary_id,
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
          tx.shiftDepartmentSummary.create({
            data: {
              shift_summary_id: shiftSummary.shift_summary_id,
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
          tx.shiftTaxSummary.create({
            data: {
              shift_summary_id: shiftSummary.shift_summary_id,
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
          tx.shiftHourlySummary.create({
            data: {
              shift_summary_id: shiftSummary.shift_summary_id,
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
        ...shiftSummary,
        tender_summaries: tenderSummaries,
        department_summaries: departmentSummaries,
        tax_summaries: taxSummaries,
        hourly_summaries: hourlySummaries,
      } as ShiftSummaryWithDetails;
    });

    return result;
  }

  /**
   * Get a shift summary by shift ID
   *
   * Uses cache-aside pattern for improved performance.
   * Cache is populated on first read and invalidated on updates.
   *
   * @param shiftId - The shift ID
   * @param options - Query options
   * @returns The shift summary or null
   */
  async getByShiftId(
    shiftId: string,
    options: ShiftSummaryQueryOptions = {},
  ): Promise<ShiftSummaryWithDetails | null> {
    // Only use cache if no special includes are requested
    const hasIncludes =
      options.include_tender_summaries ||
      options.include_department_summaries ||
      options.include_tax_summaries ||
      options.include_hourly_summaries;

    if (!hasIncludes) {
      // Try to get from cache first
      const cached =
        await cacheService.getShiftSummary<ShiftSummaryWithDetails>(shiftId);
      if (cached) {
        return cached;
      }
    }

    const include: Prisma.ShiftSummaryInclude = {};

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

    const summary = await prisma.shiftSummary.findUnique({
      where: { shift_id: shiftId },
      include: Object.keys(include).length > 0 ? include : undefined,
    });

    if (!summary) {
      return null;
    }

    // Cache the result if no special includes (cache base object)
    if (!hasIncludes) {
      // Fire-and-forget caching
      cacheService.cacheShiftSummary(shiftId, summary).catch((err) => {
        console.warn("Failed to cache shift summary:", err);
      });
    }

    return summary as unknown as ShiftSummaryWithDetails;
  }

  /**
   * Get a shift summary by summary ID
   *
   * @param summaryId - The shift summary ID
   * @param options - Query options
   * @returns The shift summary or null
   */
  async getById(
    summaryId: string,
    options: ShiftSummaryQueryOptions = {},
  ): Promise<ShiftSummaryWithDetails | null> {
    const include: Prisma.ShiftSummaryInclude = {};

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

    const summary = await prisma.shiftSummary.findUnique({
      where: { shift_summary_id: summaryId },
      include: Object.keys(include).length > 0 ? include : undefined,
    });

    if (!summary) {
      return null;
    }

    return summary as unknown as ShiftSummaryWithDetails;
  }

  /**
   * List shift summaries with filters
   *
   * @param options - Query options
   * @returns List of shift summaries
   */
  async list(
    options: ShiftSummaryQueryOptions = {},
  ): Promise<ShiftSummaryWithDetails[]> {
    const where: Prisma.ShiftSummaryWhereInput = {};

    if (options.store_id) {
      where.store_id = options.store_id;
    }

    if (options.business_date) {
      where.business_date = options.business_date;
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

    const include: Prisma.ShiftSummaryInclude = {};

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

    const summaries = await prisma.shiftSummary.findMany({
      where,
      include: Object.keys(include).length > 0 ? include : undefined,
      orderBy: { shift_closed_at: "desc" },
    });

    return summaries as unknown as ShiftSummaryWithDetails[];
  }

  /**
   * Convert a shift summary to API response format
   */
  toResponse(summary: ShiftSummaryWithDetails): ShiftSummaryResponse {
    return {
      shift_summary_id: summary.shift_summary_id,
      shift_id: summary.shift_id,
      store_id: summary.store_id,
      business_date: summary.business_date.toISOString().split("T")[0],
      shift_opened_at: summary.shift_opened_at.toISOString(),
      shift_closed_at: summary.shift_closed_at.toISOString(),
      shift_duration_mins: summary.shift_duration_mins,
      opened_by_user_id: summary.opened_by_user_id,
      closed_by_user_id: summary.closed_by_user_id,
      cashier_user_id: summary.cashier_user_id,
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
      no_sale_count: summary.no_sale_count,
      items_sold_count: summary.items_sold_count,
      items_returned_count: summary.items_returned_count,
      avg_transaction: Number(summary.avg_transaction),
      avg_items_per_txn: Number(summary.avg_items_per_txn),
      opening_cash: Number(summary.opening_cash),
      closing_cash: Number(summary.closing_cash),
      expected_cash: Number(summary.expected_cash),
      cash_variance: Number(summary.cash_variance),
      variance_percentage: Number(summary.variance_percentage),
      variance_approved: summary.variance_approved,
      variance_approved_by: summary.variance_approved_by,
      variance_approved_at: summary.variance_approved_at?.toISOString() || null,
      variance_reason: summary.variance_reason,
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
      created_at: summary.created_at.toISOString(),
      tender_summaries: summary.tender_summaries?.map(this.toTenderResponse),
      department_summaries: summary.department_summaries?.map(
        this.toDepartmentResponse,
      ),
      tax_summaries: summary.tax_summaries?.map(this.toTaxResponse),
      hourly_summaries: summary.hourly_summaries?.map(this.toHourlyResponse),
    };
  }

  private toTenderResponse(tender: any): ShiftTenderSummaryResponse {
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

  private toDepartmentResponse(dept: any): ShiftDepartmentSummaryResponse {
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

  private toTaxResponse(tax: any): ShiftTaxSummaryResponse {
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

  private toHourlyResponse(hour: any): ShiftHourlySummaryResponse {
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
   * Calculate aggregate totals from transactions
   */
  private calculateTransactionAggregates(transactions: any[]) {
    let gross_sales = 0;
    let returns_total = 0;
    let discounts_total = 0;
    let tax_collected = 0;
    let tax_exempt_sales = 0;
    let taxable_sales = 0;
    let transaction_count = transactions.length;
    let void_count = 0;
    let refund_count = 0;
    let items_sold_count = 0;
    let items_returned_count = 0;

    for (const tx of transactions) {
      const txTotal = Number(tx.total);
      const txTax = Number(tx.tax);
      const txDiscount = Number(tx.discount);
      const txSubtotal = Number(tx.subtotal);

      // Determine if this is a refund (negative total)
      if (txTotal < 0) {
        refund_count++;
        returns_total += Math.abs(txTotal);
      } else {
        gross_sales += txSubtotal;
      }

      discounts_total += txDiscount;
      tax_collected += txTax;

      // Calculate taxable vs exempt
      if (txTax > 0) {
        taxable_sales += txSubtotal - txDiscount;
      } else {
        tax_exempt_sales += txSubtotal - txDiscount;
      }

      // Count line items
      for (const li of tx.line_items) {
        const qty = li.quantity;
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
      tax_exempt_sales,
      taxable_sales,
      transaction_count,
      void_count,
      refund_count,
      items_sold_count,
      items_returned_count,
    };
  }

  /**
   * Aggregate transactions by tender type
   */
  private aggregateByTenderType(transactions: any[]) {
    const tenderMap = new Map<
      string,
      {
        tender_type_id: string;
        tender_code: string;
        tender_display_name: string;
        total_amount: number;
        transaction_count: number;
        refund_amount: number;
        refund_count: number;
      }
    >();

    for (const tx of transactions) {
      for (const payment of tx.payments) {
        if (!payment.tender_type) continue;

        const tenderId = payment.tender_type_id;
        const amount = Number(payment.amount);
        const isRefund = amount < 0;

        const existing = tenderMap.get(tenderId);
        if (existing) {
          if (isRefund) {
            existing.refund_amount += Math.abs(amount);
            existing.refund_count++;
          } else {
            existing.total_amount += amount;
            existing.transaction_count++;
          }
        } else {
          tenderMap.set(tenderId, {
            tender_type_id: tenderId,
            tender_code: payment.tender_type.code,
            tender_display_name: payment.tender_type.display_name,
            total_amount: isRefund ? 0 : amount,
            transaction_count: isRefund ? 0 : 1,
            refund_amount: isRefund ? Math.abs(amount) : 0,
            refund_count: isRefund ? 1 : 0,
          });
        }
      }
    }

    return Array.from(tenderMap.values());
  }

  /**
   * Aggregate transactions by department
   */
  private aggregateByDepartment(transactions: any[]) {
    const deptMap = new Map<
      string,
      {
        department_id: string;
        department_code: string;
        department_name: string;
        gross_sales: number;
        returns_total: number;
        discounts_total: number;
        net_sales: number;
        tax_collected: number;
        transaction_count: number;
        items_sold_count: number;
        items_returned_count: number;
        transactions: Set<string>;
      }
    >();

    for (const tx of transactions) {
      for (const li of tx.line_items) {
        if (!li.department) continue;

        const deptId = li.department_id;
        const lineTotal = Number(li.line_total);
        const discount = Number(li.discount);
        const tax = Number(li.tax_amount || 0);
        const qty = li.quantity;
        const isReturn = qty < 0;

        const existing = deptMap.get(deptId);
        if (existing) {
          if (isReturn) {
            existing.returns_total += Math.abs(lineTotal);
            existing.items_returned_count += Math.abs(qty);
          } else {
            existing.gross_sales += lineTotal;
            existing.items_sold_count += qty;
          }
          existing.discounts_total += discount;
          existing.tax_collected += tax;
          existing.transactions.add(tx.transaction_id);
        } else {
          deptMap.set(deptId, {
            department_id: deptId,
            department_code: li.department.code,
            department_name: li.department.display_name,
            gross_sales: isReturn ? 0 : lineTotal,
            returns_total: isReturn ? Math.abs(lineTotal) : 0,
            discounts_total: discount,
            net_sales: 0, // Calculate after
            tax_collected: tax,
            transaction_count: 0, // Count after
            items_sold_count: isReturn ? 0 : qty,
            items_returned_count: isReturn ? Math.abs(qty) : 0,
            transactions: new Set([tx.transaction_id]),
          });
        }
      }
    }

    // Calculate net sales and transaction count
    return Array.from(deptMap.values()).map((dept) => ({
      ...dept,
      net_sales: dept.gross_sales - dept.returns_total - dept.discounts_total,
      transaction_count: dept.transactions.size,
    }));
  }

  /**
   * Aggregate transactions by tax rate
   * Phase 2.4: Full implementation using tax_rate_id on line items
   *
   * For line items with tax_rate_id set:
   *   - Groups by tax_rate_id and aggregates taxable_amount, tax_collected
   *
   * For line items without tax_rate_id (historical data):
   *   - Uses denormalized tax_rate_code and tax_rate_value if available
   *   - Falls back to a "UNKNOWN" bucket if no tax rate info exists
   *
   * @param transactions - Array of transactions with line_items including tax_rate
   * @param _companyId - Company ID (unused but kept for future expansion)
   */
  private aggregateByTaxRate(transactions: any[], _companyId: string) {
    // Map: tax_rate_id -> aggregated data
    // For items without tax_rate_id, we use a special key based on tax_rate_code
    const taxMap = new Map<
      string,
      {
        tax_rate_id: string | null;
        tax_code: string;
        tax_display_name: string;
        tax_rate_snapshot: number;
        taxable_amount: number;
        tax_collected: number;
        exempt_amount: number;
        transactions: Set<string>;
      }
    >();

    for (const tx of transactions) {
      for (const li of tx.line_items) {
        const taxAmount = Number(li.tax_amount || 0);
        const lineTotal = Number(li.line_total);
        const qty = li.quantity;
        const isReturn = qty < 0;

        // Skip items with no tax
        if (taxAmount === 0 && !li.tax_rate_id && !li.tax_rate_code) {
          continue;
        }

        // Determine the grouping key and tax rate info
        let mapKey: string;
        let taxRateId: string | null = null;
        let taxCode: string;
        let taxDisplayName: string;
        let taxRateValue: number;

        if (li.tax_rate && li.tax_rate_id) {
          // Best case: We have a FK to TaxRate
          mapKey = li.tax_rate_id;
          taxRateId = li.tax_rate_id;
          taxCode = li.tax_rate.code;
          taxDisplayName = li.tax_rate.display_name;
          taxRateValue = Number(li.tax_rate.rate);
        } else if (li.tax_rate_code && li.tax_rate_value !== null) {
          // Fallback: Use denormalized values from the line item
          mapKey = `code:${li.tax_rate_code}`;
          taxCode = li.tax_rate_code;
          taxDisplayName = li.tax_rate_code; // Best guess without FK
          taxRateValue = Number(li.tax_rate_value);
        } else if (taxAmount > 0) {
          // Last resort: Tax was collected but no rate info
          // Calculate effective rate from tax_amount / (line_total - tax_amount)
          const taxableBase = lineTotal - taxAmount;
          const effectiveRate = taxableBase > 0 ? taxAmount / taxableBase : 0;
          mapKey = "UNKNOWN";
          taxCode = "UNKNOWN";
          taxDisplayName = "Unknown Tax Rate";
          taxRateValue = effectiveRate;
        } else {
          // No tax info at all - skip
          continue;
        }

        // Calculate taxable amount (line total minus the tax itself)
        const taxableAmount = isReturn ? 0 : Math.max(0, lineTotal - taxAmount);
        const exemptAmount = taxAmount === 0 && lineTotal > 0 ? lineTotal : 0;

        const existing = taxMap.get(mapKey);
        if (existing) {
          if (isReturn) {
            // Returns reduce the taxable amount but we track them separately
            existing.exempt_amount += Math.abs(lineTotal);
          } else {
            existing.taxable_amount += taxableAmount;
            existing.tax_collected += taxAmount;
          }
          existing.transactions.add(tx.transaction_id);
        } else {
          taxMap.set(mapKey, {
            tax_rate_id: taxRateId,
            tax_code: taxCode,
            tax_display_name: taxDisplayName,
            tax_rate_snapshot: taxRateValue,
            taxable_amount: isReturn ? 0 : taxableAmount,
            tax_collected: isReturn ? 0 : taxAmount,
            exempt_amount: isReturn ? Math.abs(lineTotal) : exemptAmount,
            transactions: new Set([tx.transaction_id]),
          });
        }
      }
    }

    // Convert map to array with transaction counts
    // Only include entries with valid tax_rate_id (required FK in ShiftTaxSummary)
    // Entries without tax_rate_id are aggregated into the main shift summary tax_collected
    return Array.from(taxMap.values())
      .filter((tax) => tax.tax_rate_id !== null)
      .map((tax) => ({
        tax_rate_id: tax.tax_rate_id as string, // Non-null assertion: filtered above
        tax_code: tax.tax_code,
        tax_display_name: tax.tax_display_name,
        tax_rate_snapshot: tax.tax_rate_snapshot,
        taxable_amount: tax.taxable_amount,
        tax_collected: tax.tax_collected,
        exempt_amount: tax.exempt_amount,
        transaction_count: tax.transactions.size,
      }));
  }

  /**
   * Aggregate transactions by hour
   */
  private aggregateByHour(transactions: any[]) {
    const hourMap = new Map<
      number,
      {
        hour_start: Date;
        hour_number: number;
        gross_sales: number;
        net_sales: number;
        transaction_count: number;
        items_sold_count: number;
      }
    >();

    for (const tx of transactions) {
      const timestamp = new Date(tx.timestamp);
      const hourStart = startOfHour(timestamp);
      const hourNumber = hourStart.getHours();
      const txSubtotal = Number(tx.subtotal);
      const txDiscount = Number(tx.discount);

      const itemCount = tx.line_items.reduce(
        (sum: number, li: any) => sum + Math.max(0, li.quantity),
        0,
      );

      const existing = hourMap.get(hourNumber);
      if (existing) {
        existing.gross_sales += txSubtotal;
        existing.net_sales += txSubtotal - txDiscount;
        existing.transaction_count++;
        existing.items_sold_count += itemCount;
      } else {
        hourMap.set(hourNumber, {
          hour_start: hourStart,
          hour_number: hourNumber,
          gross_sales: txSubtotal,
          net_sales: txSubtotal - txDiscount,
          transaction_count: 1,
          items_sold_count: itemCount,
        });
      }
    }

    return Array.from(hourMap.values()).sort(
      (a, b) => a.hour_number - b.hour_number,
    );
  }

  /**
   * Get lottery data for a shift
   *
   * Calculates lottery sales from ticket serials and their game prices.
   * Note: Lottery cashes (payouts) are tracked separately through transactions.
   */
  private async getLotteryData(shiftId: string, _storeId: string) {
    try {
      // Count tickets sold during this shift and get their prices
      const ticketSerials = await prisma.lotteryTicketSerial.findMany({
        where: { shift_id: shiftId },
        include: {
          pack: {
            include: {
              game: {
                select: { price: true },
              },
            },
          },
        },
      });

      if (ticketSerials.length === 0) {
        return null;
      }

      // Calculate total lottery sales from ticket prices
      const sales = ticketSerials.reduce((sum, ticket) => {
        const price = ticket.pack?.game?.price;
        return sum + (price ? Number(price) : 0);
      }, 0);

      // Count packs that were closed during this shift
      const packsClosedCount = await prisma.lotteryShiftClosing.count({
        where: { shift_id: shiftId },
      });

      // Lottery cashes (payouts) would need to come from lottery payout transactions
      // For now, we'll set cashes to 0 - this can be enhanced when lottery payout
      // tracking is implemented in transactions
      const cashes = 0;

      return {
        sales,
        cashes,
        net: sales - cashes,
        packs_sold: packsClosedCount,
        tickets_sold: ticketSerials.length,
      };
    } catch {
      // If lottery tables don't exist or there's an error, return null
      return null;
    }
  }
}

// Export singleton instance
export const shiftSummaryService = new ShiftSummaryService();
