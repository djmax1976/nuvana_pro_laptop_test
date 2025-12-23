/**
 * ZReport Service
 *
 * Service for generating and managing Z Reports (end-of-shift final snapshots).
 * Phase 4.2: Shift & Day Summary Implementation Plan
 *
 * Z Reports are permanent, immutable records created when a shift is closed.
 * They include a sequential Z number for audit trail purposes.
 *
 * Enterprise coding standards applied:
 * - DB-001: ORM usage with Prisma
 * - DB-006: Tenant isolation through store_id scoping
 * - API-003: Centralized error handling with custom error classes
 * - LM-001: Structured logging
 * - SEC: Signature hash for tamper detection
 */

import { Prisma } from "@prisma/client";
import { createHash } from "crypto";
import { prisma } from "../utils/db";
import { format } from "date-fns";
import {
  ZReport,
  ZReportResponse,
  ZReportQueryOptions,
  ZReportData,
  ZReportSequenceSummary,
  GenerateZReportInput,
  ZReportTenderBreakdown,
  ZReportDepartmentBreakdown,
  ZReportTaxBreakdown,
  ZReportHourlyBreakdown,
} from "../types/z-report.types";

/**
 * Error for Z Report not found
 */
export class ZReportNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Z Report not found: ${identifier}`);
    this.name = "ZReportNotFoundError";
  }
}

/**
 * Error for shift summary not found
 */
export class ShiftSummaryNotFoundError extends Error {
  constructor(shiftSummaryId: string) {
    super(`Shift summary not found: ${shiftSummaryId}`);
    this.name = "ShiftSummaryNotFoundError";
  }
}

/**
 * Error for Z Report already exists
 */
export class ZReportAlreadyExistsError extends Error {
  constructor(shiftId: string) {
    super(`Z Report already exists for shift: ${shiftId}`);
    this.name = "ZReportAlreadyExistsError";
  }
}

/**
 * Error for shift not closed
 */
export class ShiftNotClosedError extends Error {
  constructor(shiftId: string, status: string) {
    super(
      `Cannot generate Z Report for shift ${shiftId}: shift is ${status}. Z Reports can only be generated for closed shifts.`,
    );
    this.name = "ShiftNotClosedError";
  }
}

/**
 * ZReport Service class
 */
class ZReportService {
  /**
   * Generate a new Z Report for a closed shift.
   * This should be called automatically when a shift is closed.
   *
   * @param input - Generation input with shift_id, shift_summary_id, and user
   * @returns The generated Z Report
   */
  async generateZReport(input: GenerateZReportInput): Promise<ZReport> {
    const { shift_id, shift_summary_id, generated_by } = input;

    // Check if Z Report already exists for this shift
    const existingZReport = await prisma.zReport.findUnique({
      where: { shift_id },
    });

    if (existingZReport) {
      throw new ZReportAlreadyExistsError(shift_id);
    }

    // Get the shift summary with all child summaries
    const shiftSummary = await prisma.shiftSummary.findUnique({
      where: { shift_summary_id },
      include: {
        shift: {
          select: { status: true },
        },
        tender_summaries: true,
        department_summaries: true,
        tax_summaries: true,
        hourly_summaries: true,
      },
    });

    if (!shiftSummary) {
      throw new ShiftSummaryNotFoundError(shift_summary_id);
    }

    if (shiftSummary.shift.status !== "CLOSED") {
      throw new ShiftNotClosedError(shift_id, shiftSummary.shift.status);
    }

    // Get the next Z number for this store using a transaction
    // to ensure sequential integrity
    const zReport = await prisma.$transaction(async (tx) => {
      // Get and lock the next Z number
      const lastZReport = await tx.zReport.findFirst({
        where: { store_id: shiftSummary.store_id },
        orderBy: { z_number: "desc" },
        select: { z_number: true },
      });

      const zNumber = (lastZReport?.z_number || 0) + 1;

      // Build the complete report data snapshot
      const reportData = this.buildReportData(shiftSummary);

      // Generate signature hash for tamper detection
      const signatureHash = this.generateSignatureHash(reportData);

      // Create the Z Report
      return tx.zReport.create({
        data: {
          shift_id,
          shift_summary_id,
          store_id: shiftSummary.store_id,
          business_date: shiftSummary.business_date,
          generated_at: new Date(),
          generated_by,
          z_number: zNumber,
          report_data: reportData as unknown as Prisma.InputJsonValue,
          signature_hash: signatureHash,
        },
      });
    });

    return zReport as unknown as ZReport;
  }

  /**
   * Get a Z Report by ID
   *
   * @param zReportId - The Z Report ID
   * @returns The Z Report or null
   */
  async getById(zReportId: string): Promise<ZReport | null> {
    const report = await prisma.zReport.findUnique({
      where: { z_report_id: zReportId },
    });

    if (!report) {
      return null;
    }

    return report as unknown as ZReport;
  }

  /**
   * Get a Z Report by shift ID
   *
   * @param shiftId - The shift ID
   * @returns The Z Report or null
   */
  async getByShiftId(shiftId: string): Promise<ZReport | null> {
    const report = await prisma.zReport.findUnique({
      where: { shift_id: shiftId },
    });

    if (!report) {
      return null;
    }

    return report as unknown as ZReport;
  }

  /**
   * Get a Z Report by store ID and Z number
   *
   * @param storeId - The store ID
   * @param zNumber - The Z number
   * @returns The Z Report or null
   */
  async getByStoreAndZNumber(
    storeId: string,
    zNumber: number,
  ): Promise<ZReport | null> {
    const report = await prisma.zReport.findUnique({
      where: {
        store_id_z_number: {
          store_id: storeId,
          z_number: zNumber,
        },
      },
    });

    if (!report) {
      return null;
    }

    return report as unknown as ZReport;
  }

  /**
   * List Z Reports with filters and pagination
   *
   * @param options - Query options
   * @returns List of Z Reports with total count
   */
  async list(
    options: ZReportQueryOptions = {},
  ): Promise<{ reports: ZReport[]; total: number; latestZNumber?: number }> {
    const where: Prisma.ZReportWhereInput = {};

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

    if (
      options.from_z_number !== undefined ||
      options.to_z_number !== undefined
    ) {
      where.z_number = {};
      if (options.from_z_number !== undefined) {
        where.z_number.gte = options.from_z_number;
      }
      if (options.to_z_number !== undefined) {
        where.z_number.lte = options.to_z_number;
      }
    }

    const [reports, total, latestReport] = await Promise.all([
      prisma.zReport.findMany({
        where,
        orderBy: { z_number: "desc" },
        take: options.limit || 20,
        skip: options.offset || 0,
      }),
      prisma.zReport.count({ where }),
      options.store_id
        ? prisma.zReport.findFirst({
            where: { store_id: options.store_id },
            orderBy: { z_number: "desc" },
            select: { z_number: true },
          })
        : null,
    ]);

    return {
      reports: reports as unknown as ZReport[],
      total,
      latestZNumber: latestReport?.z_number,
    };
  }

  /**
   * List Z Reports by store ID
   *
   * @param storeId - The store ID
   * @param options - Query options
   * @returns List of Z Reports
   */
  async listByStore(
    storeId: string,
    options: Omit<ZReportQueryOptions, "store_id"> = {},
  ): Promise<{ reports: ZReport[]; total: number; latestZNumber?: number }> {
    return this.list({ ...options, store_id: storeId });
  }

  /**
   * Get Z Report sequence summary for a store
   *
   * @param storeId - The store ID
   * @returns Sequence summary
   */
  async getSequenceSummary(storeId: string): Promise<ZReportSequenceSummary> {
    const [total, latest, first] = await Promise.all([
      prisma.zReport.count({ where: { store_id: storeId } }),
      prisma.zReport.findFirst({
        where: { store_id: storeId },
        orderBy: { z_number: "desc" },
        select: { z_number: true, business_date: true },
      }),
      prisma.zReport.findFirst({
        where: { store_id: storeId },
        orderBy: { z_number: "asc" },
        select: { business_date: true },
      }),
    ]);

    return {
      store_id: storeId,
      total_z_reports: total,
      latest_z_number: latest?.z_number || 0,
      latest_z_report_date: latest?.business_date
        ? format(latest.business_date, "yyyy-MM-dd")
        : null,
      first_z_report_date: first?.business_date
        ? format(first.business_date, "yyyy-MM-dd")
        : null,
    };
  }

  /**
   * Mark a Z Report as printed
   *
   * @param zReportId - The Z Report ID
   * @param incrementBy - Number to increment print count by
   * @returns Updated Z Report
   */
  async markAsPrinted(
    zReportId: string,
    incrementBy: number = 1,
  ): Promise<ZReport> {
    const report = await prisma.zReport.findUnique({
      where: { z_report_id: zReportId },
    });

    if (!report) {
      throw new ZReportNotFoundError(zReportId);
    }

    const updated = await prisma.zReport.update({
      where: { z_report_id: zReportId },
      data: {
        was_printed: true,
        print_count: report.print_count + incrementBy,
      },
    });

    return updated as unknown as ZReport;
  }

  /**
   * Mark a Z Report as exported
   *
   * @param zReportId - The Z Report ID
   * @param exportFormat - The export format used
   * @returns Updated Z Report
   */
  async markAsExported(
    zReportId: string,
    exportFormat: string,
  ): Promise<ZReport> {
    const report = await prisma.zReport.findUnique({
      where: { z_report_id: zReportId },
    });

    if (!report) {
      throw new ZReportNotFoundError(zReportId);
    }

    const updated = await prisma.zReport.update({
      where: { z_report_id: zReportId },
      data: {
        was_exported: true,
        export_format: exportFormat,
      },
    });

    return updated as unknown as ZReport;
  }

  /**
   * Verify the integrity of a Z Report
   *
   * @param zReportId - The Z Report ID
   * @returns true if the report data matches the signature hash
   */
  async verifyIntegrity(zReportId: string): Promise<boolean> {
    const report = await prisma.zReport.findUnique({
      where: { z_report_id: zReportId },
    });

    if (!report) {
      throw new ZReportNotFoundError(zReportId);
    }

    if (!report.signature_hash) {
      return false;
    }

    const currentHash = this.generateSignatureHash(
      report.report_data as unknown as ZReportData,
    );

    return currentHash === report.signature_hash;
  }

  /**
   * Convert a Z Report to API response format
   */
  toResponse(report: ZReport): ZReportResponse {
    return {
      z_report_id: report.z_report_id,
      shift_id: report.shift_id,
      shift_summary_id: report.shift_summary_id,
      store_id: report.store_id,
      business_date: format(report.business_date, "yyyy-MM-dd"),
      generated_at: report.generated_at.toISOString(),
      generated_by: report.generated_by,
      z_number: report.z_number,
      report_data: report.report_data,
      was_printed: report.was_printed,
      print_count: report.print_count,
      was_exported: report.was_exported,
      export_format: report.export_format,
      signature_hash: report.signature_hash,
      created_at: report.created_at.toISOString(),
    };
  }

  /**
   * Build the complete report data snapshot from shift summary
   */
  private buildReportData(shiftSummary: any): ZReportData {
    return {
      // Timing
      shift_opened_at: shiftSummary.shift_opened_at.toISOString(),
      shift_closed_at: shiftSummary.shift_closed_at.toISOString(),
      shift_duration_mins: shiftSummary.shift_duration_mins,

      // Personnel
      opened_by_user_id: shiftSummary.opened_by_user_id,
      closed_by_user_id: shiftSummary.closed_by_user_id,
      cashier_user_id: shiftSummary.cashier_user_id,

      // Sales Totals
      gross_sales: Number(shiftSummary.gross_sales),
      returns_total: Number(shiftSummary.returns_total),
      discounts_total: Number(shiftSummary.discounts_total),
      net_sales: Number(shiftSummary.net_sales),

      // Tax
      tax_collected: Number(shiftSummary.tax_collected),
      tax_exempt_sales: Number(shiftSummary.tax_exempt_sales),
      taxable_sales: Number(shiftSummary.taxable_sales),

      // Transaction Counts
      transaction_count: shiftSummary.transaction_count,
      void_count: shiftSummary.void_count,
      refund_count: shiftSummary.refund_count,
      no_sale_count: shiftSummary.no_sale_count || 0,

      // Item Counts
      items_sold_count: shiftSummary.items_sold_count,
      items_returned_count: shiftSummary.items_returned_count,

      // Averages
      avg_transaction: Number(shiftSummary.avg_transaction),
      avg_items_per_txn: Number(shiftSummary.avg_items_per_txn),

      // Cash Reconciliation
      cash_reconciliation: {
        opening_cash: Number(shiftSummary.opening_cash),
        closing_cash: Number(shiftSummary.closing_cash),
        expected_cash: Number(shiftSummary.expected_cash),
        cash_variance: Number(shiftSummary.cash_variance),
        variance_percentage: Number(shiftSummary.variance_percentage),
        variance_approved: shiftSummary.variance_approved,
        variance_approved_by: shiftSummary.variance_approved_by,
        variance_approved_at:
          shiftSummary.variance_approved_at?.toISOString() || null,
        variance_reason: shiftSummary.variance_reason,
      },

      // Tender Breakdown
      tender_breakdown: (shiftSummary.tender_summaries || []).map(
        (t: any): ZReportTenderBreakdown => ({
          tender_type_id: t.tender_type_id,
          tender_code: t.tender_code,
          tender_display_name: t.tender_display_name,
          total_amount: Number(t.total_amount),
          transaction_count: t.transaction_count,
          refund_amount: Number(t.refund_amount),
          refund_count: t.refund_count,
          net_amount: Number(t.net_amount),
        }),
      ),

      // Department Breakdown
      department_breakdown: (shiftSummary.department_summaries || []).map(
        (d: any): ZReportDepartmentBreakdown => ({
          department_id: d.department_id,
          department_code: d.department_code,
          department_name: d.department_name,
          gross_sales: Number(d.gross_sales),
          returns_total: Number(d.returns_total),
          discounts_total: Number(d.discounts_total),
          net_sales: Number(d.net_sales),
          tax_collected: Number(d.tax_collected),
          transaction_count: d.transaction_count,
          items_sold_count: d.items_sold_count,
          items_returned_count: d.items_returned_count,
        }),
      ),

      // Tax Breakdown
      tax_breakdown: (shiftSummary.tax_summaries || []).map(
        (t: any): ZReportTaxBreakdown => ({
          tax_rate_id: t.tax_rate_id,
          tax_code: t.tax_code,
          tax_display_name: t.tax_display_name,
          tax_rate_snapshot: Number(t.tax_rate_snapshot),
          taxable_amount: Number(t.taxable_amount),
          tax_collected: Number(t.tax_collected),
          exempt_amount: Number(t.exempt_amount),
          transaction_count: t.transaction_count,
        }),
      ),

      // Hourly Breakdown
      hourly_breakdown: (shiftSummary.hourly_summaries || []).map(
        (h: any): ZReportHourlyBreakdown => ({
          hour_number: h.hour_number,
          hour_start: h.hour_start.toISOString(),
          gross_sales: Number(h.gross_sales),
          net_sales: Number(h.net_sales),
          transaction_count: h.transaction_count,
          items_sold_count: h.items_sold_count,
          avg_transaction: Number(h.avg_transaction),
        }),
      ),

      // Lottery (optional)
      lottery_sales: shiftSummary.lottery_sales
        ? Number(shiftSummary.lottery_sales)
        : null,
      lottery_cashes: shiftSummary.lottery_cashes
        ? Number(shiftSummary.lottery_cashes)
        : null,
      lottery_net: shiftSummary.lottery_net
        ? Number(shiftSummary.lottery_net)
        : null,
      lottery_packs_sold: shiftSummary.lottery_packs_sold,
      lottery_tickets_sold: shiftSummary.lottery_tickets_sold,

      // Fuel (optional)
      fuel_gallons: shiftSummary.fuel_gallons
        ? Number(shiftSummary.fuel_gallons)
        : null,
      fuel_sales: shiftSummary.fuel_sales
        ? Number(shiftSummary.fuel_sales)
        : null,

      // Extra data
      extra_data: shiftSummary.extra_data || null,
    };
  }

  /**
   * Generate SHA-256 hash of report data for tamper detection
   */
  private generateSignatureHash(reportData: ZReportData): string {
    const dataString = JSON.stringify(
      reportData,
      Object.keys(reportData).sort(),
    );
    return createHash("sha256").update(dataString).digest("hex");
  }
}

// Export singleton instance
export const zReportService = new ZReportService();
