/**
 * XReport Service
 *
 * Service for generating and managing X Reports (mid-shift snapshots).
 * Phase 4.1: Shift & Day Summary Implementation Plan
 *
 * X Reports capture point-in-time snapshots of shift data for interim reporting.
 * Multiple X Reports can be generated per shift without affecting the shift's state.
 *
 * Enterprise coding standards applied:
 * - DB-001: ORM usage with Prisma
 * - DB-006: Tenant isolation through store_id scoping
 * - API-003: Centralized error handling with custom error classes
 * - LM-001: Structured logging
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../utils/db";
import {
  XReport,
  XReportResponse,
  XReportQueryOptions,
  XReportTenderBreakdown,
  XReportDepartmentBreakdown,
  GenerateXReportInput,
} from "../types/x-report.types";

/**
 * Error for X Report not found
 */
export class XReportNotFoundError extends Error {
  constructor(identifier: string) {
    super(`X Report not found: ${identifier}`);
    this.name = "XReportNotFoundError";
  }
}

/**
 * Error for shift not found
 */
export class ShiftNotFoundError extends Error {
  constructor(shiftId: string) {
    super(`Shift not found: ${shiftId}`);
    this.name = "ShiftNotFoundError";
  }
}

/**
 * Error for shift not active
 */
export class ShiftNotActiveError extends Error {
  constructor(shiftId: string, status: string) {
    super(
      `Cannot generate X Report for shift ${shiftId}: shift is ${status}. X Reports can only be generated for active shifts.`,
    );
    this.name = "ShiftNotActiveError";
  }
}

/**
 * XReport Service class
 */
class XReportService {
  /**
   * Generate a new X Report for an active shift.
   * Captures current snapshot of all shift transactions and aggregates.
   *
   * @param input - Generation input with shift_id and user
   * @returns The generated X Report
   */
  async generateXReport(input: GenerateXReportInput): Promise<XReport> {
    const { shift_id, generated_by } = input;

    // Get the shift with its transactions
    // Phase 2.3: Optimized include queries for lookup tables
    // DB-001: ORM_USAGE - Using Prisma ORM with parameterized queries
    // SEC-006: SQL_INJECTION - All inputs bound via Prisma (no raw SQL)
    // Performance: Selective includes reduce data transfer for lookup tables
    const shift = await prisma.shift.findUnique({
      where: { shift_id },
      include: {
        store: { select: { store_id: true } },
        transactions: {
          include: {
            line_items: {
              include: {
                // Optimized: Only fetch required Department fields
                department: {
                  select: {
                    department_id: true,
                    code: true,
                    display_name: true,
                  },
                },
              },
            },
            payments: {
              include: {
                // Optimized: Only fetch required TenderType fields
                tender_type: {
                  select: {
                    tender_type_id: true,
                    code: true,
                    display_name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!shift) {
      throw new ShiftNotFoundError(shift_id);
    }

    // SEC-014: INPUT_VALIDATION - Validate shift status before processing
    if (shift.status !== "ACTIVE") {
      throw new ShiftNotActiveError(shift_id, shift.status);
    }

    // Get the next report number for this shift
    const lastReport = await prisma.xReport.findFirst({
      where: { shift_id },
      orderBy: { report_number: "desc" },
      select: { report_number: true },
    });

    const reportNumber = (lastReport?.report_number || 0) + 1;

    // Aggregate transaction data
    const aggregates = this.aggregateTransactions(shift.transactions);

    // Build tender breakdown
    const tenderBreakdown = this.buildTenderBreakdown(shift.transactions);

    // Build department breakdown
    const departmentBreakdown = this.buildDepartmentBreakdown(
      shift.transactions,
    );

    // Create the X Report
    // DB-001: ORM_USAGE - Using Prisma ORM with parameterized values
    // SEC-006: SQL_INJECTION - All inputs bound via Prisma (no raw SQL)
    const xReport = await prisma.xReport.create({
      data: {
        shift_id,
        store_id: shift.store_id,
        report_number: reportNumber,
        generated_at: new Date(),
        generated_by,
        gross_sales: aggregates.gross_sales,
        returns_total: aggregates.returns_total,
        discounts_total: aggregates.discounts_total,
        net_sales: aggregates.net_sales,
        tax_collected: aggregates.tax_collected,
        transaction_count: aggregates.transaction_count,
        items_sold_count: aggregates.items_sold_count,
        items_returned_count: aggregates.items_returned_count,
        opening_cash: shift.opening_cash,
        expected_cash: aggregates.expected_cash,
        tender_breakdown: tenderBreakdown as unknown as Prisma.InputJsonValue,
        department_breakdown:
          departmentBreakdown as unknown as Prisma.InputJsonValue,
        lottery_sales: aggregates.lottery_sales,
        lottery_cashes: aggregates.lottery_cashes,
        lottery_tickets_sold: aggregates.lottery_tickets_sold,
      },
    });

    return xReport as unknown as XReport;
  }

  /**
   * Get an X Report by ID
   *
   * @param xReportId - The X Report ID
   * @returns The X Report or null
   */
  async getById(xReportId: string): Promise<XReport | null> {
    const report = await prisma.xReport.findUnique({
      where: { x_report_id: xReportId },
    });

    if (!report) {
      return null;
    }

    return report as unknown as XReport;
  }

  /**
   * Get an X Report by shift ID and report number
   *
   * @param shiftId - The shift ID
   * @param reportNumber - The report number within the shift
   * @returns The X Report or null
   */
  async getByShiftAndNumber(
    shiftId: string,
    reportNumber: number,
  ): Promise<XReport | null> {
    const report = await prisma.xReport.findUnique({
      where: {
        shift_id_report_number: {
          shift_id: shiftId,
          report_number: reportNumber,
        },
      },
    });

    if (!report) {
      return null;
    }

    return report as unknown as XReport;
  }

  /**
   * List X Reports for a shift
   *
   * @param shiftId - The shift ID
   * @returns List of X Reports
   */
  async listByShift(shiftId: string): Promise<XReport[]> {
    const reports = await prisma.xReport.findMany({
      where: { shift_id: shiftId },
      orderBy: { report_number: "asc" },
    });

    return reports as unknown as XReport[];
  }

  /**
   * List X Reports with filters and pagination
   *
   * @param options - Query options
   * @returns List of X Reports with total count
   */
  async list(
    options: XReportQueryOptions = {},
  ): Promise<{ reports: XReport[]; total: number }> {
    const where: Prisma.XReportWhereInput = {};

    if (options.shift_id) {
      where.shift_id = options.shift_id;
    }

    if (options.store_id) {
      where.store_id = options.store_id;
    }

    if (options.from_date || options.to_date) {
      where.generated_at = {};
      if (options.from_date) {
        where.generated_at.gte = options.from_date;
      }
      if (options.to_date) {
        where.generated_at.lte = options.to_date;
      }
    }

    const [reports, total] = await Promise.all([
      prisma.xReport.findMany({
        where,
        orderBy: { generated_at: "desc" },
        take: options.limit || 20,
        skip: options.offset || 0,
      }),
      prisma.xReport.count({ where }),
    ]);

    return {
      reports: reports as unknown as XReport[],
      total,
    };
  }

  /**
   * Mark an X Report as printed
   *
   * @param xReportId - The X Report ID
   * @param incrementBy - Number to increment print count by
   * @returns Updated X Report
   */
  async markAsPrinted(
    xReportId: string,
    incrementBy: number = 1,
  ): Promise<XReport> {
    const report = await prisma.xReport.findUnique({
      where: { x_report_id: xReportId },
    });

    if (!report) {
      throw new XReportNotFoundError(xReportId);
    }

    const updated = await prisma.xReport.update({
      where: { x_report_id: xReportId },
      data: {
        was_printed: true,
        print_count: report.print_count + incrementBy,
      },
    });

    return updated as unknown as XReport;
  }

  /**
   * Convert an X Report to API response format
   */
  toResponse(report: XReport): XReportResponse {
    return {
      x_report_id: report.x_report_id,
      shift_id: report.shift_id,
      store_id: report.store_id,
      report_number: report.report_number,
      generated_at: report.generated_at.toISOString(),
      generated_by: report.generated_by,
      gross_sales: Number(report.gross_sales),
      returns_total: Number(report.returns_total),
      discounts_total: Number(report.discounts_total),
      net_sales: Number(report.net_sales),
      tax_collected: Number(report.tax_collected),
      transaction_count: report.transaction_count,
      items_sold_count: report.items_sold_count,
      items_returned_count: report.items_returned_count,
      opening_cash: Number(report.opening_cash),
      expected_cash: Number(report.expected_cash),
      tender_breakdown:
        report.tender_breakdown as unknown as XReportTenderBreakdown[],
      department_breakdown:
        report.department_breakdown as unknown as XReportDepartmentBreakdown[],
      lottery_sales: report.lottery_sales ? Number(report.lottery_sales) : null,
      lottery_cashes: report.lottery_cashes
        ? Number(report.lottery_cashes)
        : null,
      lottery_tickets_sold: report.lottery_tickets_sold,
      was_printed: report.was_printed,
      print_count: report.print_count,
      created_at: report.created_at.toISOString(),
    };
  }

  /**
   * Aggregate transaction data for the snapshot
   */
  private aggregateTransactions(transactions: any[]) {
    let gross_sales = 0;
    let returns_total = 0;
    let discounts_total = 0;
    let net_sales = 0;
    let tax_collected = 0;
    let items_sold_count = 0;
    let items_returned_count = 0;
    let cash_payments = 0;

    for (const txn of transactions) {
      // Skip voided transactions
      if (txn.status === "VOIDED") continue;

      const isReturn = txn.transaction_type === "RETURN";
      const txnTotal = Number(txn.total_amount || 0);
      const txnTax = Number(txn.tax_amount || 0);
      const txnDiscount = Number(txn.discount_amount || 0);

      if (isReturn) {
        returns_total += Math.abs(txnTotal);
      } else {
        gross_sales += txnTotal + txnDiscount;
      }

      discounts_total += txnDiscount;
      tax_collected += txnTax;

      // Count items
      for (const item of txn.line_items || []) {
        const qty = Number(item.quantity || 0);
        if (qty < 0 || isReturn) {
          items_returned_count += Math.abs(qty);
        } else {
          items_sold_count += qty;
        }
      }

      // Track cash payments for expected cash calculation
      // Phase 2.3: Use correct Prisma field name 'code' (not 'tender_code')
      for (const payment of txn.payments || []) {
        if (payment.tender_type?.code === "CASH") {
          cash_payments += Number(payment.amount || 0);
        }
      }
    }

    net_sales = gross_sales - returns_total - discounts_total;

    return {
      gross_sales,
      returns_total,
      discounts_total,
      net_sales,
      tax_collected,
      transaction_count: transactions.filter((t) => t.status !== "VOIDED")
        .length,
      items_sold_count,
      items_returned_count,
      expected_cash: cash_payments, // Opening cash + net cash = expected cash (handled in caller)
      lottery_sales: null as number | null,
      lottery_cashes: null as number | null,
      lottery_tickets_sold: null as number | null,
    };
  }

  /**
   * Build tender breakdown from transactions
   */
  private buildTenderBreakdown(transactions: any[]): XReportTenderBreakdown[] {
    const tenderMap = new Map<
      string,
      {
        tender_type_id: string;
        tender_code: string;
        tender_name: string;
        total_amount: number;
        transaction_count: number;
        refund_amount: number;
        refund_count: number;
      }
    >();

    for (const txn of transactions) {
      if (txn.status === "VOIDED") continue;
      const isReturn = txn.transaction_type === "RETURN";

      for (const payment of txn.payments || []) {
        const tenderId = payment.tender_type_id;
        const amount = Number(payment.amount || 0);

        const existing = tenderMap.get(tenderId);
        if (existing) {
          if (isReturn) {
            existing.refund_amount += Math.abs(amount);
            existing.refund_count += 1;
          } else {
            existing.total_amount += amount;
            existing.transaction_count += 1;
          }
        } else {
          tenderMap.set(tenderId, {
            tender_type_id: tenderId,
            // Phase 2.3: Use correct Prisma field name 'code' (not 'tender_code')
            tender_code: payment.tender_type?.code || "UNKNOWN",
            tender_name: payment.tender_type?.display_name || "Unknown",
            total_amount: isReturn ? 0 : amount,
            transaction_count: isReturn ? 0 : 1,
            refund_amount: isReturn ? Math.abs(amount) : 0,
            refund_count: isReturn ? 1 : 0,
          });
        }
      }
    }

    return Array.from(tenderMap.values()).map((t) => ({
      ...t,
      net_amount: t.total_amount - t.refund_amount,
    }));
  }

  /**
   * Build department breakdown from transactions
   */
  private buildDepartmentBreakdown(
    transactions: any[],
  ): XReportDepartmentBreakdown[] {
    const deptMap = new Map<
      string,
      {
        department_id: string;
        department_code: string;
        department_name: string;
        gross_sales: number;
        net_sales: number;
        items_sold_count: number;
        items_returned_count: number;
        tax_collected: number;
      }
    >();

    for (const txn of transactions) {
      if (txn.status === "VOIDED") continue;
      const isReturn = txn.transaction_type === "RETURN";

      for (const item of txn.line_items || []) {
        const deptId = item.department_id || "UNKNOWN";
        const amount = Number(item.extended_price || 0);
        const qty = Number(item.quantity || 0);
        const tax = Number(item.tax_amount || 0);

        const existing = deptMap.get(deptId);
        if (existing) {
          if (isReturn || qty < 0) {
            existing.items_returned_count += Math.abs(qty);
            existing.net_sales -= Math.abs(amount);
          } else {
            existing.gross_sales += amount;
            existing.net_sales += amount;
            existing.items_sold_count += qty;
          }
          existing.tax_collected += tax;
        } else {
          deptMap.set(deptId, {
            department_id: deptId,
            // Phase 2.3: Use correct Prisma field names 'code' and 'display_name'
            department_code: item.department?.code || "UNKNOWN",
            department_name: item.department?.display_name || "Unknown",
            gross_sales: isReturn || qty < 0 ? 0 : amount,
            net_sales: isReturn || qty < 0 ? -Math.abs(amount) : amount,
            items_sold_count: isReturn || qty < 0 ? 0 : qty,
            items_returned_count: isReturn || qty < 0 ? Math.abs(qty) : 0,
            tax_collected: tax,
          });
        }
      }
    }

    return Array.from(deptMap.values());
  }
}

// Export singleton instance
export const xReportService = new XReportService();
