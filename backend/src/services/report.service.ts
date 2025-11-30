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
        doc.text(`Total Sales: $${reportData.summary.total_sales.toFixed(2)}`);
        doc.text(`Transaction Count: ${reportData.summary.transaction_count}`);
        doc.text(
          `Opening Cash: $${reportData.summary.opening_cash.toFixed(2)}`,
        );
        doc.text(
          `Closing Cash: $${reportData.summary.closing_cash.toFixed(2)}`,
        );
        doc.text(
          `Expected Cash: $${reportData.summary.expected_cash.toFixed(2)}`,
        );
        doc.text(
          `Variance Amount: $${reportData.summary.variance_amount.toFixed(2)}`,
        );
        doc.text(
          `Variance Percentage: ${reportData.summary.variance_percentage.toFixed(2)}%`,
        );
        doc.moveDown();

        // Payment Methods Section
        if (reportData.payment_methods.length > 0) {
          doc.fontSize(14).text("Payment Methods", { underline: true });
          doc.fontSize(10);
          reportData.payment_methods.forEach((pm) => {
            doc.text(
              `${pm.method}: $${pm.total.toFixed(2)} (${pm.count} transactions)`,
            );
          });
          doc.moveDown();
        }

        // Variance Details Section
        if (reportData.variance) {
          doc.fontSize(14).text("Variance Details", { underline: true });
          doc.fontSize(10);
          doc.text(
            `Variance Amount: $${reportData.variance.variance_amount.toFixed(2)}`,
          );
          doc.text(
            `Variance Percentage: ${reportData.variance.variance_percentage.toFixed(2)}%`,
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
            doc.text(`Total: $${tx.total.toFixed(2)}`);
            if (tx.cashier) {
              doc.text(`Cashier: ${tx.cashier.name}`);
            }
            if (tx.line_items.length > 0) {
              doc.text("Line Items:");
              tx.line_items.forEach((li) => {
                doc.text(
                  `  - ${li.product_name}: ${li.quantity} x $${li.price.toFixed(2)} = $${li.subtotal.toFixed(2)}`,
                  { indent: 20 },
                );
              });
            }
            if (tx.payments.length > 0) {
              doc.text("Payments:");
              tx.payments.forEach((p) => {
                doc.text(`  - ${p.method}: $${p.amount.toFixed(2)}`, {
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
