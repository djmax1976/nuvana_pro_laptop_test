/**
 * Report Service
 *
 * Business logic for report generation and PDF export.
 * Story 4.6: Shift Report Generation
 */

import PDFDocument from "pdfkit";
import { ShiftReportData } from "../types/shift-report.types";

/**
 * Report Service
 * Provides PDF generation functionality for shift reports
 */
export class ReportService {
  /**
   * Format a currency value safely, handling null/undefined
   * @param value - Currency value (number, null, or undefined)
   * @returns Formatted currency string (e.g., "$0.00" for null/undefined)
   */
  private formatCurrency(value: number | null | undefined): string {
    if (value == null || isNaN(value)) {
      return "$0.00";
    }
    return `$${value.toFixed(2)}`;
  }

  /**
   * Format a percentage value safely, handling null/undefined
   * @param value - Percentage value (number, null, or undefined)
   * @returns Formatted percentage string (e.g., "0.00%" for null/undefined)
   */
  private formatPercentage(value: number | null | undefined): string {
    if (value == null || isNaN(value)) {
      return "0.00%";
    }
    return `${value.toFixed(2)}%`;
  }
  /**
   * Generate PDF from shift report data
   * @param reportData - Shift report data
   * @returns PDF buffer
   */
  async generateShiftReportPDF(reportData: ShiftReportData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const chunks: Buffer[] = [];

        // Collect PDF data
        doc.on("data", (chunk) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", (error) => reject(error));

        // PDF Header
        doc.fontSize(20).text("Shift Report", { align: "center" }).moveDown();

        // Shift Information Section
        doc.fontSize(14).text("Shift Information", { underline: true });
        doc.fontSize(10);
        doc.text(`Shift ID: ${reportData.shift.shift_id}`);
        doc.text(`Store: ${reportData.shift.store_name || "N/A"}`);
        if (reportData.shift.opened_by) {
          doc.text(
            `Opened By: ${reportData.shift.opened_by.name} (${reportData.shift.opened_by.user_id})`,
          );
        }
        if (reportData.shift.cashier_name) {
          doc.text(
            `Cashier: ${reportData.shift.cashier_name.name} (${reportData.shift.cashier_name.user_id})`,
          );
        }
        doc.text(`Opened At: ${reportData.shift.opened_at}`);
        if (reportData.shift.closed_at) {
          doc.text(`Closed At: ${reportData.shift.closed_at}`);
        }
        doc.text(`Status: ${reportData.shift.status}`);
        doc.moveDown();

        // Summary Section
        doc.fontSize(14).text("Summary", { underline: true });
        doc.fontSize(10);
        doc.text(
          `Total Sales: ${this.formatCurrency(reportData.summary.total_sales)}`,
        );
        doc.text(`Transaction Count: ${reportData.summary.transaction_count}`);
        doc.text(
          `Opening Cash: ${this.formatCurrency(reportData.summary.opening_cash)}`,
        );
        doc.text(
          `Closing Cash: ${this.formatCurrency(reportData.summary.closing_cash)}`,
        );
        doc.text(
          `Expected Cash: ${this.formatCurrency(reportData.summary.expected_cash)}`,
        );
        doc.text(
          `Variance Amount: ${this.formatCurrency(reportData.summary.variance_amount)}`,
        );
        doc.text(
          `Variance Percentage: ${this.formatPercentage(reportData.summary.variance_percentage)}`,
        );
        doc.moveDown();

        // Payment Methods Section
        if (reportData.payment_methods.length > 0) {
          doc.fontSize(14).text("Payment Methods", { underline: true });
          doc.fontSize(10);
          reportData.payment_methods.forEach((pm) => {
            doc.text(
              `${pm.method}: ${this.formatCurrency(pm.total)} (${pm.count} transactions)`,
            );
          });
          doc.moveDown();
        }

        // Variance Details Section
        if (reportData.variance) {
          doc.fontSize(14).text("Variance Details", { underline: true });
          doc.fontSize(10);
          doc.text(
            `Variance Amount: ${this.formatCurrency(reportData.variance.variance_amount)}`,
          );
          doc.text(
            `Variance Percentage: ${this.formatPercentage(reportData.variance.variance_percentage)}`,
          );
          if (reportData.variance.variance_reason) {
            doc.text(`Reason: ${reportData.variance.variance_reason}`);
          }
          if (reportData.variance.approved_by) {
            doc.text(
              `Approved By: ${reportData.variance.approved_by.name} (${reportData.variance.approved_by.user_id})`,
            );
          }
          if (reportData.variance.approved_at) {
            doc.text(`Approved At: ${reportData.variance.approved_at}`);
          }
          doc.moveDown();
        }

        // Transactions Section
        if (reportData.transactions.length > 0) {
          doc.fontSize(14).text("Transactions", { underline: true });
          doc.fontSize(10);
          reportData.transactions.forEach((tx, index) => {
            if (index > 0) {
              doc.moveDown(0.5);
            }
            doc.text(`Transaction ${index + 1}: ${tx.transaction_id}`);
            doc.text(`Timestamp: ${tx.timestamp}`);
            doc.text(`Total: ${this.formatCurrency(tx.total)}`);
            if (tx.cashier) {
              doc.text(`Cashier: ${tx.cashier.name}`);
            }
            if (tx.line_items.length > 0) {
              doc.text("Line Items:");
              tx.line_items.forEach((li) => {
                doc.text(
                  `  - ${li.product_name}: ${li.quantity} x ${this.formatCurrency(li.price)} = ${this.formatCurrency(li.subtotal)}`,
                  { indent: 20 },
                );
              });
            }
            if (tx.payments.length > 0) {
              doc.text("Payments:");
              tx.payments.forEach((p) => {
                doc.text(`  - ${p.method}: ${this.formatCurrency(p.amount)}`, {
                  indent: 20,
                });
              });
            }
          });
        }

        // Finalize PDF
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}

// Export singleton instance
export const reportService = new ReportService();
