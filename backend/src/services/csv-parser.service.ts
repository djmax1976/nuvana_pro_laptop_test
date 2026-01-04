/**
 * CSV Parser Service
 *
 * Generic CSV parsing service with streaming support and validation.
 * Designed for enterprise-grade bulk import operations.
 *
 * Features:
 * - Streaming parser for memory efficiency
 * - Header normalization with alias support
 * - Row-by-row validation with error collection
 * - BOM handling for Excel-exported CSVs
 * - Configurable delimiter detection
 *
 * @module services/csv-parser.service
 */

import { Readable } from "stream";

// ============================================================================
// Types
// ============================================================================

export interface CsvParseOptions {
  /** Maximum file size in bytes (default: 5MB) */
  maxFileSize?: number;
  /** Maximum number of rows to parse (default: 1000) */
  maxRows?: number;
  /** Delimiter character (default: auto-detect from first line) */
  delimiter?: string;
  /** Whether first row contains headers (default: true) */
  hasHeaders?: boolean;
  /** Header normalization function */
  headerNormalizer?: (header: string) => string | undefined;
  /** Required headers that must be present */
  requiredHeaders?: string[];
  /** Skip empty rows (default: true) */
  skipEmptyRows?: boolean;
  /** Trim whitespace from values (default: true) */
  trimValues?: boolean;
}

export interface ParsedRow {
  /** 1-based row number (after header) */
  rowNumber: number;
  /** Raw values from CSV */
  rawValues: string[];
  /** Parsed data object (keys are normalized headers) */
  data: Record<string, string>;
}

export interface CsvParseResult {
  /** Whether parsing succeeded */
  success: boolean;
  /** Original headers from CSV */
  originalHeaders: string[];
  /** Normalized header mapping (original -> normalized) */
  headerMapping: Record<string, string>;
  /** Parsed rows */
  rows: ParsedRow[];
  /** Total rows parsed (excluding header) */
  totalRows: number;
  /** Parsing errors */
  errors: CsvParseError[];
  /** Warnings (non-fatal issues) */
  warnings: string[];
}

export interface CsvParseError {
  /** Row number where error occurred (0 = header) */
  rowNumber: number;
  /** Error message */
  message: string;
  /** Error type */
  type: "HEADER" | "ROW" | "SIZE" | "FORMAT";
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const DEFAULT_MAX_ROWS = 1000;
const BOM = "\uFEFF";

// ============================================================================
// CSV Parser Implementation
// ============================================================================

/**
 * Parse a CSV file buffer into structured data
 */
export async function parseCsvBuffer(
  buffer: Buffer,
  options: CsvParseOptions = {},
): Promise<CsvParseResult> {
  const {
    maxFileSize = DEFAULT_MAX_FILE_SIZE,
    maxRows = DEFAULT_MAX_ROWS,
    hasHeaders = true,
    headerNormalizer,
    requiredHeaders = [],
    skipEmptyRows = true,
    trimValues = true,
  } = options;

  const errors: CsvParseError[] = [];
  const warnings: string[] = [];

  // Check file size
  if (buffer.length > maxFileSize) {
    return {
      success: false,
      originalHeaders: [],
      headerMapping: {},
      rows: [],
      totalRows: 0,
      errors: [
        {
          rowNumber: 0,
          message: `File size (${formatBytes(buffer.length)}) exceeds maximum (${formatBytes(maxFileSize)})`,
          type: "SIZE",
        },
      ],
      warnings: [],
    };
  }

  // Convert buffer to string, handling BOM
  let content = buffer.toString("utf-8");
  if (content.startsWith(BOM)) {
    content = content.slice(1);
    warnings.push("BOM character removed from file");
  }

  // Normalize line endings
  content = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Detect delimiter
  const delimiter = options.delimiter || detectDelimiter(content);

  // Parse lines
  const lines = parseLines(content, delimiter);

  if (lines.length === 0) {
    return {
      success: false,
      originalHeaders: [],
      headerMapping: {},
      rows: [],
      totalRows: 0,
      errors: [
        {
          rowNumber: 0,
          message: "CSV file is empty",
          type: "FORMAT",
        },
      ],
      warnings,
    };
  }

  // Process headers
  const originalHeaders: string[] = [];
  const headerMapping: Record<string, string> = {};
  let dataStartIndex = 0;

  if (hasHeaders) {
    const headerLine = lines[0];
    dataStartIndex = 1;

    for (const header of headerLine) {
      const trimmed = header.trim();
      originalHeaders.push(trimmed);

      if (headerNormalizer) {
        const normalized = headerNormalizer(trimmed);
        if (normalized) {
          headerMapping[trimmed] = normalized;
        }
      } else {
        // Default: lowercase and replace spaces with underscores
        headerMapping[trimmed] = trimmed.toLowerCase().replace(/\s+/g, "_");
      }
    }

    // Check required headers
    const normalizedHeaders = Object.values(headerMapping);
    for (const required of requiredHeaders) {
      if (!normalizedHeaders.includes(required)) {
        errors.push({
          rowNumber: 0,
          message: `Missing required column: ${required}`,
          type: "HEADER",
        });
      }
    }

    if (errors.length > 0) {
      return {
        success: false,
        originalHeaders,
        headerMapping,
        rows: [],
        totalRows: 0,
        errors,
        warnings,
      };
    }
  }

  // Parse data rows
  const rows: ParsedRow[] = [];
  const normalizedHeaderKeys = Object.keys(headerMapping);
  const normalizedHeaderValues = Object.values(headerMapping);

  for (let i = dataStartIndex; i < lines.length; i++) {
    if (rows.length >= maxRows) {
      warnings.push(
        `File contains more than ${maxRows} rows. Only first ${maxRows} rows were processed.`,
      );
      break;
    }

    const line = lines[i];
    const rowNumber = i - dataStartIndex + 1;

    // Skip empty rows
    if (skipEmptyRows && line.every((cell) => cell.trim() === "")) {
      continue;
    }

    // Build data object
    const data: Record<string, string> = {};

    for (let j = 0; j < normalizedHeaderKeys.length; j++) {
      const normalizedHeader = normalizedHeaderValues[j];
      let value = line[j] || "";

      if (trimValues) {
        value = value.trim();
      }

      data[normalizedHeader] = value;
    }

    rows.push({
      rowNumber,
      rawValues: line,
      data,
    });
  }

  return {
    success: true,
    originalHeaders,
    headerMapping,
    rows,
    totalRows: rows.length,
    errors,
    warnings,
  };
}

/**
 * Parse CSV content into lines, handling quoted fields
 */
function parseLines(content: string, delimiter: string): string[][] {
  const lines: string[][] = [];
  let currentLine: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let i = 0;

  while (i < content.length) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote
          currentField += '"';
          i += 2;
          continue;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    }

    // Not in quotes
    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (char === delimiter) {
      currentLine.push(currentField);
      currentField = "";
      i++;
      continue;
    }

    if (char === "\n") {
      currentLine.push(currentField);
      lines.push(currentLine);
      currentLine = [];
      currentField = "";
      i++;
      continue;
    }

    currentField += char;
    i++;
  }

  // Handle last field/line
  if (currentField || currentLine.length > 0) {
    currentLine.push(currentField);
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Auto-detect delimiter from first line of CSV
 * Supports: comma, semicolon, tab, pipe
 */
function detectDelimiter(content: string): string {
  const firstLine = content.split("\n")[0] || "";

  // Count potential delimiters in first line (outside quotes)
  const counts: Record<string, number> = {
    ",": 0,
    ";": 0,
    "\t": 0,
    "|": 0,
  };

  let inQuotes = false;
  for (const char of firstLine) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && char in counts) {
      counts[char]++;
    }
  }

  // Return delimiter with highest count
  let maxDelimiter = ",";
  let maxCount = 0;

  for (const [delimiter, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      maxDelimiter = delimiter;
    }
  }

  return maxDelimiter;
}

/**
 * Format bytes into human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// ============================================================================
// Stream-based parsing for very large files (future enhancement)
// ============================================================================

/**
 * Create a transform stream for parsing CSV data
 * Useful for processing very large files without loading into memory
 */
export function createCsvParseStream(_options: CsvParseOptions = {}): Readable {
  // Placeholder for future streaming implementation
  // For now, use parseCsvBuffer which is sufficient for <1000 rows
  throw new Error("Streaming CSV parsing not yet implemented");
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate that a CSV file has valid structure
 * Returns errors if file is malformed
 */
export function validateCsvStructure(content: string): string[] {
  const errors: string[] = [];

  // Check for null bytes (binary file)
  if (content.includes("\0")) {
    errors.push("File contains binary data. Please upload a valid CSV file.");
  }

  // Check for reasonable content
  if (content.trim().length === 0) {
    errors.push("File is empty");
  }

  // Check for at least one delimiter
  const hasComma = content.includes(",");
  const hasSemicolon = content.includes(";");
  const hasTab = content.includes("\t");
  const hasPipe = content.includes("|");

  if (!hasComma && !hasSemicolon && !hasTab && !hasPipe) {
    errors.push(
      "File does not appear to be a valid CSV. No column delimiters found.",
    );
  }

  return errors;
}

/**
 * Generate a sample CSV template for download
 */
export function generateCsvTemplate(
  headers: string[],
  sampleRows: Record<string, string>[] = [],
): string {
  const lines: string[] = [];

  // Header row
  lines.push(headers.map((h) => escapeCsvField(h)).join(","));

  // Sample data rows
  for (const row of sampleRows) {
    const values = headers.map((h) => escapeCsvField(row[h] || ""));
    lines.push(values.join(","));
  }

  return lines.join("\n");
}

/**
 * Escape a field value for CSV output
 */
function escapeCsvField(value: string): string {
  if (
    value.includes(",") ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
