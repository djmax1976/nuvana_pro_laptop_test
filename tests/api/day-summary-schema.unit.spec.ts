import { test, expect } from "@playwright/test";
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
  DaySummaryStatusEnum,
} from "../../backend/src/schemas/day-summary.schema";

/**
 * @test-level Unit
 * @justification Unit tests for day-summary.schema.ts Zod validation schemas
 * @story shift-day-summary-phase-3
 *
 * Day Summary Schema Validation Tests
 *
 * Tests the Zod validation schemas for Day Summary API endpoints.
 * Focuses on:
 * - Valid input acceptance
 * - Invalid input rejection with proper error messages
 * - Edge cases for date validation
 * - Type transformations (string to boolean/number)
 * - Business rule enforcement (date ranges, character limits)
 *
 * ================================================================================
 * TRACEABILITY MATRIX
 * ================================================================================
 *
 * | Test ID     | Requirement                          | Schema                         | Priority |
 * |-------------|--------------------------------------|--------------------------------|----------|
 * | SCHEMA-001  | UUID-001: Valid UUID Accept          | DaySummaryStoreParamsSchema    | P0       |
 * | SCHEMA-002  | UUID-002: Invalid UUID Reject        | DaySummaryStoreParamsSchema    | P0       |
 * | SCHEMA-003  | UUID-001: Valid UUID Accept          | DaySummaryIdParamsSchema       | P0       |
 * | SCHEMA-004  | UUID-003: Required Field             | DaySummaryIdParamsSchema       | P0       |
 * | SCHEMA-010  | DATE-001: YYYY-MM-DD Accept          | DaySummaryDateParamsSchema     | P0       |
 * | SCHEMA-011  | DATE-002: Invalid Format Reject      | DaySummaryDateParamsSchema     | P0       |
 * | SCHEMA-012  | DATE-003: Invalid Value Reject       | DaySummaryDateParamsSchema     | P0       |
 * | SCHEMA-020  | QRY-001: Empty Query Accept          | DaySummaryListQuerySchema      | P1       |
 * | SCHEMA-021  | QRY-002: Boolean Transform           | DaySummaryListQuerySchema      | P1       |
 * | SCHEMA-022  | QRY-003: Numeric Transform           | DaySummaryListQuerySchema      | P1       |
 * | SCHEMA-023  | QRY-004: Limit Range Validation      | DaySummaryListQuerySchema      | P1       |
 * | SCHEMA-024  | QRY-005: Offset Non-negative         | DaySummaryListQuerySchema      | P1       |
 * | SCHEMA-025  | QRY-006: Date Range Order            | DaySummaryListQuerySchema      | P1       |
 * | SCHEMA-026  | QRY-007: Date Range Max 365          | DaySummaryListQuerySchema      | P1       |
 * | SCHEMA-027  | QRY-008: Valid Status Accept         | DaySummaryListQuerySchema      | P1       |
 * | SCHEMA-028  | QRY-009: Invalid Status Reject       | DaySummaryListQuerySchema      | P1       |
 * | SCHEMA-030  | BODY-001: Empty Body Accept          | CloseDayRequestSchema          | P1       |
 * | SCHEMA-031  | BODY-002: Valid Notes Accept         | CloseDayRequestSchema          | P1       |
 * | SCHEMA-032  | BODY-003: Notes at 2000 Char         | CloseDayRequestSchema          | P1       |
 * | SCHEMA-033  | BODY-004: Notes Over 2000 Reject     | CloseDayRequestSchema          | P1       |
 * | SCHEMA-040  | BODY-005: Valid Notes Accept         | UpdateDaySummaryNotesSchema    | P1       |
 * | SCHEMA-041  | BODY-006: Null Notes Accept          | UpdateDaySummaryNotesSchema    | P1       |
 * | SCHEMA-042  | BODY-004: Notes Over 2000 Reject     | UpdateDaySummaryNotesSchema    | P1       |
 * | SCHEMA-043  | BODY-007: Required Notes Field       | UpdateDaySummaryNotesSchema    | P1       |
 * | SCHEMA-050  | RPT-001: Empty Query Accept          | WeeklyReportQuerySchema        | P1       |
 * | SCHEMA-051  | RPT-002: Valid week_of Accept        | WeeklyReportQuerySchema        | P1       |
 * | SCHEMA-052  | RPT-003: Boolean Transform           | WeeklyReportQuerySchema        | P1       |
 * | SCHEMA-060  | RPT-004: Valid Year/Month            | MonthlyReportQuerySchema       | P1       |
 * | SCHEMA-061  | RPT-005: Two-digit Month             | MonthlyReportQuerySchema       | P1       |
 * | SCHEMA-062  | RPT-006: Invalid Year Format         | MonthlyReportQuerySchema       | P1       |
 * | SCHEMA-063  | RPT-007: Year Out of Range           | MonthlyReportQuerySchema       | P1       |
 * | SCHEMA-064  | RPT-008: Invalid Month               | MonthlyReportQuerySchema       | P1       |
 * | SCHEMA-070  | RPT-009: Valid Date Range            | DateRangeReportQuerySchema     | P1       |
 * | SCHEMA-071  | RPT-010: Breakdown Flags Transform   | DateRangeReportQuerySchema     | P1       |
 * | SCHEMA-072  | RPT-011: Required Dates              | DateRangeReportQuerySchema     | P1       |
 * | SCHEMA-073  | RPT-012: Reversed Range Reject       | DateRangeReportQuerySchema     | P1       |
 * | SCHEMA-074  | RPT-013: Range Exceed 365 Reject     | DateRangeReportQuerySchema     | P1       |
 * | SCHEMA-075  | RPT-014: Same Day Range Accept       | DateRangeReportQuerySchema     | P1       |
 * | SCHEMA-080  | ENUM-001: Valid Status Values        | DaySummaryStatusEnum           | P2       |
 * | SCHEMA-081  | ENUM-002: Invalid Status Reject      | DaySummaryStatusEnum           | P2       |
 * | SCHEMA-090  | GET-001: Empty Query Accept          | DaySummaryGetQuerySchema       | P2       |
 * | SCHEMA-091  | GET-002: All Include Flags           | DaySummaryGetQuerySchema       | P2       |
 * | SCHEMA-092  | GET-003: False String Values         | DaySummaryGetQuerySchema       | P2       |
 * | SCHEMA-100  | EDGE-001: 365 Day Range Boundary     | DaySummaryListQuerySchema      | P2       |
 * | SCHEMA-101  | EDGE-002: Unicode in Notes           | CloseDayRequestSchema          | P2       |
 * | SCHEMA-102  | EDGE-003: Empty String Notes         | CloseDayRequestSchema          | P2       |
 * | SCHEMA-103  | EDGE-004: Leap Year Validation       | DaySummaryDateParamsSchema     | P2       |
 * | SCHEMA-104  | EDGE-005: Limit/Offset Boundaries    | DaySummaryListQuerySchema      | P2       |
 * | SCHEMA-105  | EDGE-006: Year Boundaries            | MonthlyReportQuerySchema       | P2       |
 *
 * REQUIREMENT COVERAGE:
 * - UUID Validation (UUID-001 to UUID-003): 4 tests
 * - Date Validation (DATE-001 to DATE-003): 3 tests
 * - Query Parameters (QRY-001 to QRY-009): 9 tests
 * - Request Body (BODY-001 to BODY-007): 8 tests
 * - Report Queries (RPT-001 to RPT-014): 12 tests
 * - Enum Validation (ENUM-001 to ENUM-002): 2 tests
 * - Get Query (GET-001 to GET-003): 3 tests
 * - Edge Cases (EDGE-001 to EDGE-006): 6 tests
 * ================================================================================
 */

// =============================================================================
// SECTION 1: UUID VALIDATION TESTS
// =============================================================================

test.describe("DAY-SUMMARY-SCHEMA: UUID Validation", () => {
  test("SCHEMA-001: [P0] DaySummaryStoreParamsSchema should accept valid UUID", () => {
    // GIVEN: Valid store ID
    const validInput = { storeId: "550e8400-e29b-41d4-a716-446655440000" };

    // WHEN: Parsing the input
    const result = DaySummaryStoreParamsSchema.safeParse(validInput);

    // THEN: Should succeed
    expect(result.success, "Should accept valid UUID").toBe(true);
    if (result.success) {
      expect(result.data.storeId).toBe("550e8400-e29b-41d4-a716-446655440000");
    }
  });

  test("SCHEMA-002: [P0] DaySummaryStoreParamsSchema should reject invalid UUID format", () => {
    // GIVEN: Invalid store ID formats
    const invalidInputs = [
      { storeId: "not-a-uuid" },
      { storeId: "123" },
      { storeId: "550e8400-e29b-41d4-a716" }, // Incomplete UUID
      { storeId: "" },
      { storeId: "550e8400-e29b-41d4-a716-446655440000-extra" }, // Too long
    ];

    // WHEN/THEN: Each should fail validation
    for (const input of invalidInputs) {
      const result = DaySummaryStoreParamsSchema.safeParse(input);
      expect(result.success, `Should reject: ${input.storeId}`).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Invalid UUID");
      }
    }
  });

  test("SCHEMA-003: [P0] DaySummaryIdParamsSchema should accept valid UUID", () => {
    // GIVEN: Valid day summary ID
    const validInput = { daySummaryId: "550e8400-e29b-41d4-a716-446655440000" };

    // WHEN: Parsing the input
    const result = DaySummaryIdParamsSchema.safeParse(validInput);

    // THEN: Should succeed
    expect(result.success, "Should accept valid UUID").toBe(true);
  });

  test("SCHEMA-004: [P0] DaySummaryIdParamsSchema should reject missing daySummaryId", () => {
    // GIVEN: Missing day summary ID
    const invalidInput = {};

    // WHEN: Parsing the input
    const result = DaySummaryIdParamsSchema.safeParse(invalidInput);

    // THEN: Should fail
    expect(result.success, "Should reject missing field").toBe(false);
  });
});

// =============================================================================
// SECTION 2: DATE VALIDATION TESTS
// =============================================================================

test.describe("DAY-SUMMARY-SCHEMA: Date Validation", () => {
  test("SCHEMA-010: [P0] DaySummaryDateParamsSchema should accept valid YYYY-MM-DD format", () => {
    // GIVEN: Valid date formats
    const validInputs = [
      { storeId: "550e8400-e29b-41d4-a716-446655440000", date: "2024-01-15" },
      { storeId: "550e8400-e29b-41d4-a716-446655440000", date: "2024-12-31" },
      { storeId: "550e8400-e29b-41d4-a716-446655440000", date: "2024-02-29" }, // Leap year
    ];

    // WHEN/THEN: Each should pass validation
    for (const input of validInputs) {
      const result = DaySummaryDateParamsSchema.safeParse(input);
      expect(result.success, `Should accept: ${input.date}`).toBe(true);
    }
  });

  test("SCHEMA-011: [P0] DaySummaryDateParamsSchema should reject invalid date formats", () => {
    // GIVEN: Invalid date formats
    const invalidInputs = [
      { storeId: "550e8400-e29b-41d4-a716-446655440000", date: "01-15-2024" }, // Wrong order
      { storeId: "550e8400-e29b-41d4-a716-446655440000", date: "2024/01/15" }, // Wrong separator
      { storeId: "550e8400-e29b-41d4-a716-446655440000", date: "2024-1-15" }, // Missing leading zero
      { storeId: "550e8400-e29b-41d4-a716-446655440000", date: "2024-01-5" }, // Missing leading zero
      { storeId: "550e8400-e29b-41d4-a716-446655440000", date: "24-01-15" }, // Two-digit year
    ];

    // WHEN/THEN: Each should fail validation
    for (const input of invalidInputs) {
      const result = DaySummaryDateParamsSchema.safeParse(input);
      expect(result.success, `Should reject: ${input.date}`).toBe(false);
    }
  });

  test("SCHEMA-012: [P0] DaySummaryDateParamsSchema should reject invalid date values", () => {
    // GIVEN: Invalid date values (correct format but impossible dates)
    const invalidInputs = [
      { storeId: "550e8400-e29b-41d4-a716-446655440000", date: "2024-13-01" }, // Month > 12
      { storeId: "550e8400-e29b-41d4-a716-446655440000", date: "2024-00-15" }, // Month = 0
      { storeId: "550e8400-e29b-41d4-a716-446655440000", date: "2024-01-32" }, // Day > 31
      { storeId: "550e8400-e29b-41d4-a716-446655440000", date: "2024-02-30" }, // Feb 30
      { storeId: "550e8400-e29b-41d4-a716-446655440000", date: "2023-02-29" }, // Not a leap year
    ];

    // WHEN/THEN: Each should fail validation
    for (const input of invalidInputs) {
      const result = DaySummaryDateParamsSchema.safeParse(input);
      expect(result.success, `Should reject: ${input.date}`).toBe(false);
    }
  });
});

// =============================================================================
// SECTION 3: QUERY PARAMETER TESTS
// =============================================================================

test.describe("DAY-SUMMARY-SCHEMA: List Query Parameters", () => {
  test("SCHEMA-020: [P1] DaySummaryListQuerySchema should accept empty query", () => {
    // GIVEN: Empty query
    const input = {};

    // WHEN: Parsing the input
    const result = DaySummaryListQuerySchema.safeParse(input);

    // THEN: Should succeed with undefined optional fields
    expect(result.success, "Should accept empty query").toBe(true);
  });

  test("SCHEMA-021: [P1] DaySummaryListQuerySchema should transform boolean strings", () => {
    // GIVEN: Query with string boolean values
    const input = {
      include_tender_summaries: "true",
      include_department_summaries: "false",
      include_tax_summaries: "true",
      include_hourly_summaries: "false",
    };

    // WHEN: Parsing the input
    const result = DaySummaryListQuerySchema.safeParse(input);

    // THEN: Should transform strings to booleans
    expect(result.success, "Should accept and transform booleans").toBe(true);
    if (result.success) {
      expect(result.data.include_tender_summaries).toBe(true);
      expect(result.data.include_department_summaries).toBe(false);
      expect(result.data.include_tax_summaries).toBe(true);
      expect(result.data.include_hourly_summaries).toBe(false);
    }
  });

  test("SCHEMA-022: [P1] DaySummaryListQuerySchema should transform numeric strings", () => {
    // GIVEN: Query with string number values
    const input = {
      limit: "50",
      offset: "10",
    };

    // WHEN: Parsing the input
    const result = DaySummaryListQuerySchema.safeParse(input);

    // THEN: Should transform strings to numbers
    expect(result.success, "Should accept and transform numbers").toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
      expect(result.data.offset).toBe(10);
    }
  });

  test("SCHEMA-023: [P1] DaySummaryListQuerySchema should reject limit out of range", () => {
    // GIVEN: Limit out of valid range
    const invalidInputs = [
      { limit: "0" }, // Below minimum
      { limit: "-1" }, // Negative
      { limit: "101" }, // Above maximum
      { limit: "999" }, // Way above maximum
    ];

    // WHEN/THEN: Each should fail validation
    for (const input of invalidInputs) {
      const result = DaySummaryListQuerySchema.safeParse(input);
      expect(result.success, `Should reject limit: ${input.limit}`).toBe(false);
    }
  });

  test("SCHEMA-024: [P1] DaySummaryListQuerySchema should reject negative offset", () => {
    // GIVEN: Negative offset
    const input = { offset: "-5" };

    // WHEN: Parsing the input
    const result = DaySummaryListQuerySchema.safeParse(input);

    // THEN: Should fail
    expect(result.success, "Should reject negative offset").toBe(false);
  });

  test("SCHEMA-025: [P1] DaySummaryListQuerySchema should validate date range order", () => {
    // GIVEN: start_date after end_date
    const input = {
      start_date: "2024-12-31",
      end_date: "2024-01-01",
    };

    // WHEN: Parsing the input
    const result = DaySummaryListQuerySchema.safeParse(input);

    // THEN: Should fail with specific error
    expect(result.success, "Should reject reversed date range").toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        "start_date must be before or equal to end_date",
      );
    }
  });

  test("SCHEMA-026: [P1] DaySummaryListQuerySchema should reject date range exceeding 365 days", () => {
    // GIVEN: Date range > 365 days
    const input = {
      start_date: "2022-01-01",
      end_date: "2024-01-01",
    };

    // WHEN: Parsing the input
    const result = DaySummaryListQuerySchema.safeParse(input);

    // THEN: Should fail with specific error
    expect(result.success, "Should reject excessive date range").toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        "Date range must not exceed 365 days",
      );
    }
  });

  test("SCHEMA-027: [P1] DaySummaryListQuerySchema should accept valid status filter", () => {
    // GIVEN: Valid status values
    const validStatuses = ["OPEN", "PENDING_CLOSE", "CLOSED"];

    // WHEN/THEN: Each should pass validation
    for (const status of validStatuses) {
      const result = DaySummaryListQuerySchema.safeParse({ status });
      expect(result.success, `Should accept status: ${status}`).toBe(true);
    }
  });

  test("SCHEMA-028: [P1] DaySummaryListQuerySchema should reject invalid status", () => {
    // GIVEN: Invalid status values
    const invalidStatuses = ["INVALID", "open", "closed", "CLOSING", ""];

    // WHEN/THEN: Each should fail validation
    for (const status of invalidStatuses) {
      const result = DaySummaryListQuerySchema.safeParse({ status });
      expect(result.success, `Should reject status: ${status}`).toBe(false);
    }
  });
});

// =============================================================================
// SECTION 4: REQUEST BODY VALIDATION TESTS
// =============================================================================

test.describe("DAY-SUMMARY-SCHEMA: Close Day Request Body", () => {
  test("SCHEMA-030: [P1] CloseDayRequestSchema should accept empty body", () => {
    // GIVEN: Empty request body
    const input = {};

    // WHEN: Parsing the input
    const result = CloseDayRequestSchema.safeParse(input);

    // THEN: Should succeed (notes is optional)
    expect(result.success, "Should accept empty body").toBe(true);
  });

  test("SCHEMA-031: [P1] CloseDayRequestSchema should accept valid notes", () => {
    // GIVEN: Valid notes
    const input = { notes: "Day closed with no issues." };

    // WHEN: Parsing the input
    const result = CloseDayRequestSchema.safeParse(input);

    // THEN: Should succeed
    expect(result.success, "Should accept valid notes").toBe(true);
    if (result.success) {
      expect(result.data.notes).toBe("Day closed with no issues.");
    }
  });

  test("SCHEMA-032: [P1] CloseDayRequestSchema should accept notes at 2000 character limit", () => {
    // GIVEN: Notes at exactly 2000 characters
    const input = { notes: "x".repeat(2000) };

    // WHEN: Parsing the input
    const result = CloseDayRequestSchema.safeParse(input);

    // THEN: Should succeed
    expect(result.success, "Should accept 2000 character notes").toBe(true);
  });

  test("SCHEMA-033: [P1] CloseDayRequestSchema should reject notes exceeding 2000 characters", () => {
    // GIVEN: Notes exceeding 2000 characters
    const input = { notes: "x".repeat(2001) };

    // WHEN: Parsing the input
    const result = CloseDayRequestSchema.safeParse(input);

    // THEN: Should fail
    expect(result.success, "Should reject >2000 character notes").toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("2000 characters");
    }
  });
});

test.describe("DAY-SUMMARY-SCHEMA: Update Notes Request Body", () => {
  test("SCHEMA-040: [P1] UpdateDaySummaryNotesSchema should accept valid notes", () => {
    // GIVEN: Valid notes
    const input = { notes: "Updated manager notes" };

    // WHEN: Parsing the input
    const result = UpdateDaySummaryNotesSchema.safeParse(input);

    // THEN: Should succeed
    expect(result.success, "Should accept valid notes").toBe(true);
  });

  test("SCHEMA-041: [P1] UpdateDaySummaryNotesSchema should accept null notes", () => {
    // GIVEN: Null notes (to clear)
    const input = { notes: null };

    // WHEN: Parsing the input
    const result = UpdateDaySummaryNotesSchema.safeParse(input);

    // THEN: Should succeed
    expect(result.success, "Should accept null notes").toBe(true);
    if (result.success) {
      expect(result.data.notes).toBeNull();
    }
  });

  test("SCHEMA-042: [P1] UpdateDaySummaryNotesSchema should reject notes exceeding 2000 characters", () => {
    // GIVEN: Notes exceeding 2000 characters
    const input = { notes: "x".repeat(2001) };

    // WHEN: Parsing the input
    const result = UpdateDaySummaryNotesSchema.safeParse(input);

    // THEN: Should fail
    expect(result.success, "Should reject >2000 character notes").toBe(false);
  });

  test("SCHEMA-043: [P1] UpdateDaySummaryNotesSchema should require notes field", () => {
    // GIVEN: Missing notes field
    const input = {};

    // WHEN: Parsing the input
    const result = UpdateDaySummaryNotesSchema.safeParse(input);

    // THEN: Should fail
    expect(result.success, "Should require notes field").toBe(false);
  });
});

// =============================================================================
// SECTION 5: REPORT QUERY PARAMETER TESTS
// =============================================================================

test.describe("DAY-SUMMARY-SCHEMA: Weekly Report Query", () => {
  test("SCHEMA-050: [P1] WeeklyReportQuerySchema should accept empty query", () => {
    // GIVEN: Empty query (uses current week)
    const input = {};

    // WHEN: Parsing the input
    const result = WeeklyReportQuerySchema.safeParse(input);

    // THEN: Should succeed
    expect(result.success, "Should accept empty query").toBe(true);
  });

  test("SCHEMA-051: [P1] WeeklyReportQuerySchema should accept valid week_of date", () => {
    // GIVEN: Valid week_of date
    const input = { week_of: "2024-01-15" };

    // WHEN: Parsing the input
    const result = WeeklyReportQuerySchema.safeParse(input);

    // THEN: Should succeed
    expect(result.success, "Should accept valid week_of").toBe(true);
  });

  test("SCHEMA-052: [P1] WeeklyReportQuerySchema should transform include_details", () => {
    // GIVEN: Query with include_details
    const input = { include_details: "true" };

    // WHEN: Parsing the input
    const result = WeeklyReportQuerySchema.safeParse(input);

    // THEN: Should transform to boolean
    expect(result.success, "Should accept and transform boolean").toBe(true);
    if (result.success) {
      expect(result.data.include_details).toBe(true);
    }
  });
});

test.describe("DAY-SUMMARY-SCHEMA: Monthly Report Query", () => {
  test("SCHEMA-060: [P1] MonthlyReportQuerySchema should accept valid year and month", () => {
    // GIVEN: Valid year and month
    const input = { year: "2024", month: "1" };

    // WHEN: Parsing the input
    const result = MonthlyReportQuerySchema.safeParse(input);

    // THEN: Should succeed and transform
    expect(result.success, "Should accept valid year/month").toBe(true);
    if (result.success) {
      expect(result.data.year).toBe(2024);
      expect(result.data.month).toBe(1);
    }
  });

  test("SCHEMA-061: [P1] MonthlyReportQuerySchema should accept two-digit month", () => {
    // GIVEN: Two-digit month
    const input = { year: "2024", month: "12" };

    // WHEN: Parsing the input
    const result = MonthlyReportQuerySchema.safeParse(input);

    // THEN: Should succeed
    expect(result.success, "Should accept two-digit month").toBe(true);
    if (result.success) {
      expect(result.data.month).toBe(12);
    }
  });

  test("SCHEMA-062: [P1] MonthlyReportQuerySchema should reject invalid year format", () => {
    // GIVEN: Invalid year formats
    const invalidInputs = [
      { year: "24", month: "1" }, // Two-digit year
      { year: "20244", month: "1" }, // Five-digit year
      { year: "abcd", month: "1" }, // Non-numeric
    ];

    // WHEN/THEN: Each should fail
    for (const input of invalidInputs) {
      const result = MonthlyReportQuerySchema.safeParse(input);
      expect(result.success, `Should reject year: ${input.year}`).toBe(false);
    }
  });

  test("SCHEMA-063: [P1] MonthlyReportQuerySchema should reject year out of range", () => {
    // GIVEN: Year out of valid range
    const invalidInputs = [
      { year: "1999", month: "1" }, // Below 2000
      { year: "2101", month: "1" }, // Above 2100
    ];

    // WHEN/THEN: Each should fail
    for (const input of invalidInputs) {
      const result = MonthlyReportQuerySchema.safeParse(input);
      expect(result.success, `Should reject year: ${input.year}`).toBe(false);
    }
  });

  test("SCHEMA-064: [P1] MonthlyReportQuerySchema should reject invalid month", () => {
    // GIVEN: Invalid month values
    const invalidInputs = [
      { year: "2024", month: "0" }, // Month 0
      { year: "2024", month: "13" }, // Month 13
      { year: "2024", month: "-1" }, // Negative month
      { year: "2024", month: "abc" }, // Non-numeric
    ];

    // WHEN/THEN: Each should fail
    for (const input of invalidInputs) {
      const result = MonthlyReportQuerySchema.safeParse(input);
      expect(result.success, `Should reject month: ${input.month}`).toBe(false);
    }
  });
});

test.describe("DAY-SUMMARY-SCHEMA: Date Range Report Query", () => {
  test("SCHEMA-070: [P1] DateRangeReportQuerySchema should accept valid date range", () => {
    // GIVEN: Valid date range
    const input = {
      start_date: "2024-01-01",
      end_date: "2024-01-31",
    };

    // WHEN: Parsing the input
    const result = DateRangeReportQuerySchema.safeParse(input);

    // THEN: Should succeed
    expect(result.success, "Should accept valid date range").toBe(true);
  });

  test("SCHEMA-071: [P1] DateRangeReportQuerySchema should transform breakdown flags", () => {
    // GIVEN: Query with breakdown flags
    const input = {
      start_date: "2024-01-01",
      end_date: "2024-01-31",
      include_daily_breakdown: "true",
      include_tender_breakdown: "false",
      include_department_breakdown: "true",
    };

    // WHEN: Parsing the input
    const result = DateRangeReportQuerySchema.safeParse(input);

    // THEN: Should transform booleans
    expect(result.success, "Should accept and transform booleans").toBe(true);
    if (result.success) {
      expect(result.data.include_daily_breakdown).toBe(true);
      expect(result.data.include_tender_breakdown).toBe(false);
      expect(result.data.include_department_breakdown).toBe(true);
    }
  });

  test("SCHEMA-072: [P1] DateRangeReportQuerySchema should require both dates", () => {
    // GIVEN: Missing dates
    const invalidInputs = [
      { start_date: "2024-01-01" }, // Missing end_date
      { end_date: "2024-01-31" }, // Missing start_date
      {}, // Missing both
    ];

    // WHEN/THEN: Each should fail
    for (const input of invalidInputs) {
      const result = DateRangeReportQuerySchema.safeParse(input);
      expect(result.success, "Should require both dates").toBe(false);
    }
  });

  test("SCHEMA-073: [P1] DateRangeReportQuerySchema should reject reversed date range", () => {
    // GIVEN: Reversed date range
    const input = {
      start_date: "2024-12-31",
      end_date: "2024-01-01",
    };

    // WHEN: Parsing the input
    const result = DateRangeReportQuerySchema.safeParse(input);

    // THEN: Should fail
    expect(result.success, "Should reject reversed range").toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        "start_date must be before or equal to end_date",
      );
    }
  });

  test("SCHEMA-074: [P1] DateRangeReportQuerySchema should reject range exceeding 365 days", () => {
    // GIVEN: Range exceeding 365 days
    const input = {
      start_date: "2022-01-01",
      end_date: "2024-01-01",
    };

    // WHEN: Parsing the input
    const result = DateRangeReportQuerySchema.safeParse(input);

    // THEN: Should fail
    expect(result.success, "Should reject excessive range").toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        "Date range must not exceed 365 days",
      );
    }
  });

  test("SCHEMA-075: [P1] DateRangeReportQuerySchema should accept same start and end date", () => {
    // GIVEN: Same start and end date (single day)
    const input = {
      start_date: "2024-01-15",
      end_date: "2024-01-15",
    };

    // WHEN: Parsing the input
    const result = DateRangeReportQuerySchema.safeParse(input);

    // THEN: Should succeed
    expect(result.success, "Should accept single day range").toBe(true);
  });
});

// =============================================================================
// SECTION 6: STATUS ENUM TESTS
// =============================================================================

test.describe("DAY-SUMMARY-SCHEMA: Status Enum", () => {
  test("SCHEMA-080: [P2] DaySummaryStatusEnum should accept all valid statuses", () => {
    // GIVEN: All valid status values
    const validStatuses = ["OPEN", "PENDING_CLOSE", "CLOSED"];

    // WHEN/THEN: Each should pass
    for (const status of validStatuses) {
      const result = DaySummaryStatusEnum.safeParse(status);
      expect(result.success, `Should accept status: ${status}`).toBe(true);
    }
  });

  test("SCHEMA-081: [P2] DaySummaryStatusEnum should reject invalid statuses", () => {
    // GIVEN: Invalid status values
    const invalidStatuses = [
      "INVALID",
      "open",
      "pending_close",
      "closed",
      "",
      "OPENING",
      "CLOSING",
      " OPEN", // Leading space
      "OPEN ", // Trailing space
    ];

    // WHEN/THEN: Each should fail
    for (const status of invalidStatuses) {
      const result = DaySummaryStatusEnum.safeParse(status);
      expect(result.success, `Should reject status: ${status}`).toBe(false);
    }
  });
});

// =============================================================================
// SECTION 7: GET QUERY PARAMETER TESTS
// =============================================================================

test.describe("DAY-SUMMARY-SCHEMA: Get Query Parameters", () => {
  test("SCHEMA-090: [P2] DaySummaryGetQuerySchema should accept empty query", () => {
    // GIVEN: Empty query
    const input = {};

    // WHEN: Parsing the input
    const result = DaySummaryGetQuerySchema.safeParse(input);

    // THEN: Should succeed
    expect(result.success, "Should accept empty query").toBe(true);
  });

  test("SCHEMA-091: [P2] DaySummaryGetQuerySchema should transform all include flags", () => {
    // GIVEN: Query with all include flags
    const input = {
      include_tender_summaries: "true",
      include_department_summaries: "true",
      include_tax_summaries: "true",
      include_hourly_summaries: "true",
    };

    // WHEN: Parsing the input
    const result = DaySummaryGetQuerySchema.safeParse(input);

    // THEN: Should transform all to booleans
    expect(result.success, "Should accept all include flags").toBe(true);
    if (result.success) {
      expect(result.data.include_tender_summaries).toBe(true);
      expect(result.data.include_department_summaries).toBe(true);
      expect(result.data.include_tax_summaries).toBe(true);
      expect(result.data.include_hourly_summaries).toBe(true);
    }
  });

  test("SCHEMA-092: [P2] DaySummaryGetQuerySchema should handle false string values", () => {
    // GIVEN: Query with false string values
    const input = {
      include_tender_summaries: "false",
      include_department_summaries: "FALSE", // Case variation - should not be true
    };

    // WHEN: Parsing the input
    const result = DaySummaryGetQuerySchema.safeParse(input);

    // THEN: Should transform to false
    expect(result.success, "Should accept false strings").toBe(true);
    if (result.success) {
      expect(result.data.include_tender_summaries).toBe(false);
      expect(result.data.include_department_summaries).toBe(false);
    }
  });
});

// =============================================================================
// SECTION 8: EDGE CASES AND BOUNDARY TESTS
// =============================================================================

test.describe("DAY-SUMMARY-SCHEMA: Edge Cases", () => {
  test("SCHEMA-100: [P2] should accept exactly 365-day date range", () => {
    // GIVEN: Exactly 365 days range
    const input = {
      start_date: "2024-01-01",
      end_date: "2024-12-31", // 366 days in leap year 2024
    };

    // For non-leap year:
    const input2 = {
      start_date: "2023-01-01",
      end_date: "2023-12-31", // 365 days
    };

    // WHEN: Parsing the input
    const result = DaySummaryListQuerySchema.safeParse(input2);

    // THEN: Should succeed
    expect(result.success, "Should accept 365-day range").toBe(true);
  });

  test("SCHEMA-101: [P2] should handle unicode in notes", () => {
    // GIVEN: Notes with unicode characters
    const input = { notes: "Day closed with no issues! \u2713 \u{1F600}" };

    // WHEN: Parsing the input
    const result = CloseDayRequestSchema.safeParse(input);

    // THEN: Should succeed
    expect(result.success, "Should accept unicode in notes").toBe(true);
    if (result.success) {
      expect(result.data.notes).toContain("\u2713");
    }
  });

  test("SCHEMA-102: [P2] should handle empty string notes", () => {
    // GIVEN: Empty string notes
    const input = { notes: "" };

    // WHEN: Parsing the input
    const result = CloseDayRequestSchema.safeParse(input);

    // THEN: Should succeed (empty is valid, just short)
    expect(result.success, "Should accept empty string notes").toBe(true);
  });

  test("SCHEMA-103: [P2] should handle leap year dates correctly", () => {
    // GIVEN: Feb 29 in leap year
    const leapYearInput = {
      storeId: "550e8400-e29b-41d4-a716-446655440000",
      date: "2024-02-29",
    };

    // WHEN: Parsing leap year date
    const leapResult = DaySummaryDateParamsSchema.safeParse(leapYearInput);

    // THEN: Should accept leap year Feb 29
    expect(leapResult.success, "Should accept leap year Feb 29").toBe(true);

    // GIVEN: Feb 29 in non-leap year
    const nonLeapInput = {
      storeId: "550e8400-e29b-41d4-a716-446655440000",
      date: "2023-02-29",
    };

    // WHEN: Parsing non-leap year date
    const nonLeapResult = DaySummaryDateParamsSchema.safeParse(nonLeapInput);

    // THEN: Should reject non-leap year Feb 29
    expect(nonLeapResult.success, "Should reject non-leap year Feb 29").toBe(
      false,
    );
  });

  test("SCHEMA-104: [P2] should handle limit and offset at boundaries", () => {
    // GIVEN: Limit at min and max boundaries
    const minLimit = { limit: "1" };
    const maxLimit = { limit: "100" };
    const zeroOffset = { offset: "0" };

    // WHEN: Parsing boundary values
    const minResult = DaySummaryListQuerySchema.safeParse(minLimit);
    const maxResult = DaySummaryListQuerySchema.safeParse(maxLimit);
    const offsetResult = DaySummaryListQuerySchema.safeParse(zeroOffset);

    // THEN: All should succeed
    expect(minResult.success, "Should accept limit=1").toBe(true);
    expect(maxResult.success, "Should accept limit=100").toBe(true);
    expect(offsetResult.success, "Should accept offset=0").toBe(true);
  });

  test("SCHEMA-105: [P2] should handle year boundaries", () => {
    // GIVEN: Years at boundaries
    const minYear = { year: "2000", month: "1" };
    const maxYear = { year: "2100", month: "12" };

    // WHEN: Parsing boundary years
    const minResult = MonthlyReportQuerySchema.safeParse(minYear);
    const maxResult = MonthlyReportQuerySchema.safeParse(maxYear);

    // THEN: Both should succeed
    expect(minResult.success, "Should accept year 2000").toBe(true);
    expect(maxResult.success, "Should accept year 2100").toBe(true);
  });
});
