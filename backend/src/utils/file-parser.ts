/**
 * File Parser Utilities
 *
 * Utilities for parsing CSV and JSON files for bulk transaction import.
 * Story 3.6: Bulk Transaction Import
 */

import { parse as parseCsv } from "csv-parse/sync";
import { TransactionPayload } from "../schemas/transaction.schema";

export interface ParseResult {
  transactions: TransactionPayload[];
  errors: Array<{
    row_number: number;
    field?: string;
    error: string;
  }>;
}

/**
 * Parse CSV file into transaction records
 * @param fileContent - CSV file content as string
 * @param encoding - File encoding (default: 'utf-8')
 * @returns ParseResult with transactions and errors
 */
export function parseCsvFile(
  fileContent: string,
  _encoding: string = "utf-8",
): ParseResult {
  const errors: ParseResult["errors"] = [];
  const transactions: TransactionPayload[] = [];

  // Check for empty file
  if (!fileContent || fileContent.trim().length === 0) {
    errors.push({
      row_number: 1,
      field: "file",
      error: "File is empty",
    });
    return { transactions, errors };
  }

  try {
    // Parse CSV with header row
    const records = parseCsv(fileContent, {
      columns: true, // Use first row as column names
      skip_empty_lines: true,
      trim: true,
      cast: false, // Keep as strings for validation
    });

    records.forEach((record: any, index: number) => {
      const rowNumber = index + 2; // +2 because index is 0-based and we skip header row

      try {
        // Convert CSV record to TransactionPayload
        // Expected columns: store_id, shift_id, cashier_id, timestamp, line_items (JSON), payments (JSON), subtotal, tax, discount, total
        const transaction: TransactionPayload = {
          store_id: record.store_id,
          shift_id: record.shift_id,
          cashier_id: record.cashier_id,
          pos_terminal_id: record.pos_terminal_id || undefined,
          timestamp: record.timestamp || new Date().toISOString(),
          subtotal: parseFloat(record.subtotal) || 0,
          tax: parseFloat(record.tax) || 0,
          discount: parseFloat(record.discount) || 0,
          line_items: parseJsonField(
            record.line_items,
            "line_items",
            rowNumber,
          ),
          payments: parseJsonField(record.payments, "payments", rowNumber),
        };

        transactions.push(transaction);
      } catch (error: any) {
        errors.push({
          row_number: rowNumber,
          field: "row",
          error: error.message || "Failed to parse transaction row",
        });
      }
    });
  } catch (error: any) {
    errors.push({
      row_number: 1,
      field: "file",
      error: error.message || "Failed to parse CSV file",
    });
  }

  return { transactions, errors };
}

/**
 * Parse JSON file into transaction records
 * @param fileContent - JSON file content as string
 * @param encoding - File encoding (default: 'utf-8')
 * @returns ParseResult with transactions and errors
 */
export function parseJsonFile(
  fileContent: string,
  _encoding: string = "utf-8",
): ParseResult {
  const errors: ParseResult["errors"] = [];
  const transactions: TransactionPayload[] = [];

  // Check for empty file
  if (!fileContent || fileContent.trim().length === 0) {
    errors.push({
      row_number: 1,
      field: "file",
      error: "File is empty",
    });
    return { transactions, errors };
  }

  try {
    const data = JSON.parse(fileContent);

    // Expect array of transaction objects
    if (!Array.isArray(data)) {
      errors.push({
        row_number: 1,
        field: "file",
        error: "JSON file must contain an array of transactions",
      });
      return { transactions, errors };
    }

    data.forEach((record: any, index: number) => {
      const rowNumber = index + 1;

      try {
        // Validate and convert to TransactionPayload
        const transaction: TransactionPayload = {
          store_id: record.store_id,
          shift_id: record.shift_id,
          cashier_id: record.cashier_id,
          pos_terminal_id: record.pos_terminal_id || undefined,
          timestamp: record.timestamp || new Date().toISOString(),
          subtotal: record.subtotal || 0,
          tax: record.tax || 0,
          discount: record.discount || 0,
          line_items: record.line_items || [],
          payments: record.payments || [],
        };

        transactions.push(transaction);
      } catch (error: any) {
        errors.push({
          row_number: rowNumber,
          field: "row",
          error: error.message || "Failed to parse transaction object",
        });
      }
    });
  } catch (error: any) {
    errors.push({
      row_number: 1,
      field: "file",
      error: error.message || "Failed to parse JSON file",
    });
  }

  return { transactions, errors };
}

/**
 * Helper to parse JSON field from CSV string
 */
function parseJsonField(
  value: string | undefined,
  fieldName: string,
  _rowNumber: number,
): any {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      throw new Error(`${fieldName} must be an array`);
    }
    return parsed;
  } catch (error: any) {
    throw new Error(
      `Invalid JSON in ${fieldName} field: ${error.message || "Parse error"}`,
    );
  }
}
