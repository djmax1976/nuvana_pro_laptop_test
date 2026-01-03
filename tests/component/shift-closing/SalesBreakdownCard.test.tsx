/**
 * @test-level COMPONENT
 * @justification Tests SalesBreakdownCard UI behavior without backend dependencies
 * @story Shift/Day Close - Sales Reconciliation
 * @priority P0 (Critical - UI Integration)
 *
 * SalesBreakdownCard Component Tests
 *
 * Tests the dual-column sales breakdown display:
 * - POS Totals column: Read-only values (source of truth from our lottery system until POS integration)
 * - Reports Totals column: Editable input for lottery items (also populated from our lottery system)
 *
 * CRITICAL BUSINESS RULE:
 * - Until 3rd-party POS integration, lottery data populates BOTH columns
 * - Both columns should match for reconciliation (no variance expected initially)
 * - Reports column is editable for manual adjustments if needed
 *
 * ================================================================================
 * TRACEABILITY MATRIX
 * ================================================================================
 *
 * | Test ID              | Requirement                              | Component/Feature              | Priority |
 * |----------------------|------------------------------------------|--------------------------------|----------|
 * | SB-CARD-001          | FE-002: Renders dual-column layout       | SalesBreakdownCard             | P0       |
 * | SB-CARD-002          | BIZ: POS column shows POS values         | SalesBreakdownCard             | P0       |
 * | SB-CARD-003          | BIZ: Reports column shows reports values | SalesBreakdownCard             | P0       |
 * | SB-CARD-004          | BIZ: Lottery items are editable          | SalesBreakdownCard             | P0       |
 * | SB-CARD-005          | BIZ: Department items are read-only      | SalesBreakdownCard             | P0       |
 * | SB-CARD-006          | BIZ: Lottery items are highlighted       | SalesBreakdownCard             | P0       |
 * | SB-CARD-007          | BIZ: Total sales calculated correctly    | SalesBreakdownCard             | P0       |
 * | SB-CARD-008          | BIZ: Lottery in BOTH columns             | SalesBreakdownCard             | P0       |
 * | SB-CARD-009          | FE-002: Input sanitization               | SalesBreakdownCard             | P0       |
 * | SB-CARD-010          | SEC-014: No XSS in input handling        | SalesBreakdownCard             | P0       |
 *
 * ================================================================================
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SalesBreakdownCard } from "@/components/shift-closing/SalesBreakdownCard";
import type { SalesBreakdownState } from "@/components/shift-closing/types";
import { DEFAULT_SALES_BREAKDOWN_STATE } from "@/components/shift-closing/types";

describe("SalesBreakdownCard Component", () => {
  const mockOnReportsChange = vi.fn();
  const mockOnPOSChange = vi.fn();

  // Sample state with different values for POS and Reports
  const sampleState: SalesBreakdownState = {
    pos: {
      gasSales: 2500.0,
      grocery: 1200.0,
      tobacco: 800.0,
      beverages: 450.0,
      snacks: 320.0,
      other: 180.0,
      scratchOff: 0, // POS lottery should be 0 by default (comes from POS integration)
      onlineLottery: 0, // POS lottery should be 0 by default
      salesTax: 245.0,
    },
    reports: {
      scratchOff: 500.0, // Reports lottery from our lottery close
      onlineLottery: 350.0, // Reports lottery from our system
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P0 CRITICAL - RENDERING TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("SB-CARD-001: [P0] should render dual-column layout with headers", () => {
    // GIVEN: SalesBreakdownCard component
    // WHEN: Component is rendered
    render(
      <SalesBreakdownCard
        state={sampleState}
        onReportsChange={mockOnReportsChange}
      />,
    );

    // THEN: Card should be visible with correct headers
    expect(screen.getByTestId("sales-breakdown-card")).toBeInTheDocument();
    expect(screen.getByText("Department Sales")).toBeInTheDocument();
    expect(screen.getByText("Department")).toBeInTheDocument();
    expect(screen.getByText("Reports Totals")).toBeInTheDocument();
    expect(screen.getByText("POS Totals")).toBeInTheDocument();
  });

  it("SB-CARD-002: [P0] should display POS values in POS column", () => {
    // GIVEN: SalesBreakdownCard with POS values
    // WHEN: Component is rendered
    render(
      <SalesBreakdownCard
        state={sampleState}
        onReportsChange={mockOnReportsChange}
      />,
    );

    // THEN: POS values should be displayed correctly
    // Gas Sales: $2,500.00
    expect(screen.getByTestId("sales-row-gas-sales")).toHaveTextContent(
      "$2,500.00",
    );
    // Grocery: $1,200.00
    expect(screen.getByTestId("sales-row-grocery")).toHaveTextContent(
      "$1,200.00",
    );
    // Sales Tax: $245.00
    expect(screen.getByTestId("sales-row-sales-tax")).toHaveTextContent(
      "$245.00",
    );
  });

  it("SB-CARD-003: [P0] should display Reports values in Reports column for lottery", () => {
    // GIVEN: SalesBreakdownCard with reports lottery values
    // WHEN: Component is rendered
    render(
      <SalesBreakdownCard
        state={sampleState}
        onReportsChange={mockOnReportsChange}
      />,
    );

    // THEN: Reports lottery values should be in editable inputs
    const scratchOffInput = screen.getByTestId("sales-reports-scratch-off");
    expect(scratchOffInput).toHaveValue("500.00");

    const onlineLotteryInput = screen.getByTestId(
      "sales-reports-online-lottery",
    );
    expect(onlineLotteryInput).toHaveValue("350.00");
  });

  it("SB-CARD-004: [P0] should have editable inputs for lottery items only", async () => {
    // GIVEN: SalesBreakdownCard component
    const user = userEvent.setup({ delay: null });
    render(
      <SalesBreakdownCard
        state={sampleState}
        onReportsChange={mockOnReportsChange}
      />,
    );

    // WHEN: User edits scratch off input
    const scratchOffInput = screen.getByTestId("sales-reports-scratch-off");
    await user.clear(scratchOffInput);
    await user.type(scratchOffInput, "600.00");
    await user.tab(); // Trigger blur

    // THEN: onReportsChange should be called with new value
    expect(mockOnReportsChange).toHaveBeenCalledWith({ scratchOff: 600 });
  });

  it("SB-CARD-005: [P0] should NOT have editable inputs for department items", () => {
    // GIVEN: SalesBreakdownCard component (editablePOS = false by default)
    render(
      <SalesBreakdownCard
        state={sampleState}
        onReportsChange={mockOnReportsChange}
      />,
    );

    // THEN: Department rows should NOT have editable inputs
    // Gas Sales should show formatted value, not an input
    const gasRow = screen.getByTestId("sales-row-gas-sales");
    expect(gasRow.querySelector("input")).toBeNull();

    // Grocery should show formatted value, not an input
    const groceryRow = screen.getByTestId("sales-row-grocery");
    expect(groceryRow.querySelector("input")).toBeNull();
  });

  it("SB-CARD-006: [P0] should highlight lottery items with green background", () => {
    // GIVEN: SalesBreakdownCard component
    render(
      <SalesBreakdownCard
        state={sampleState}
        onReportsChange={mockOnReportsChange}
      />,
    );

    // THEN: Lottery rows should have green background styling
    const scratchOffRow = screen.getByTestId("sales-row-scratch-off");
    expect(scratchOffRow.className).toMatch(/bg-green/);

    const onlineLotteryRow = screen.getByTestId("sales-row-online-lottery");
    expect(onlineLotteryRow.className).toMatch(/bg-green/);
  });

  it("SB-CARD-007: [P0] should calculate and display total sales correctly", () => {
    // GIVEN: SalesBreakdownCard with known values
    // POS departments: 2500 + 1200 + 800 + 450 + 320 + 180 + 245 = 5695
    // Reports lottery: 500 + 350 = 850
    // Total Reports = 5695 + 850 = 6545
    // Total POS = 5695 + 0 + 0 = 5695 (POS lottery is 0)

    render(
      <SalesBreakdownCard
        state={sampleState}
        onReportsChange={mockOnReportsChange}
      />,
    );

    // THEN: Total sales row should show correct calculations
    const totalsRow = screen.getByTestId("total-sales");
    expect(totalsRow).toHaveTextContent("$6,545.00"); // Reports total
    expect(totalsRow).toHaveTextContent("$5,695.00"); // POS total
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P0 CRITICAL - BUSINESS RULE: LOTTERY DATA COLUMN MAPPING
  // ═══════════════════════════════════════════════════════════════════════════

  it("SB-CARD-008: [P0] should display lottery values in BOTH columns for reconciliation", () => {
    // GIVEN: State where lottery values are in BOTH columns (correct per business rule)
    // This validates the business rule that lottery data populates both columns
    // until 3rd-party POS integration is implemented
    const correctState: SalesBreakdownState = {
      pos: {
        gasSales: 1000.0,
        grocery: 500.0,
        tobacco: 200.0,
        beverages: 100.0,
        snacks: 50.0,
        other: 25.0,
        scratchOff: 750.0, // Our lottery total (source of truth until POS integration)
        onlineLottery: 250.0, // Our lottery total
        salesTax: 100.0,
      },
      reports: {
        scratchOff: 750.0, // Same value in reports for reconciliation comparison
        onlineLottery: 250.0, // Same value in reports
      },
    };

    // WHEN: Component is rendered
    render(
      <SalesBreakdownCard
        state={correctState}
        onReportsChange={mockOnReportsChange}
      />,
    );

    // THEN: Reports column should show our lottery values (editable)
    const scratchOffInput = screen.getByTestId("sales-reports-scratch-off");
    expect(scratchOffInput).toHaveValue("750.00");

    const onlineLotteryInput = screen.getByTestId(
      "sales-reports-online-lottery",
    );
    expect(onlineLotteryInput).toHaveValue("250.00");

    // AND: POS column should also show lottery values (read-only)
    const scratchOffRow = screen.getByTestId("sales-row-scratch-off");
    expect(scratchOffRow).toHaveTextContent("$750.00");

    const onlineLotteryRow = screen.getByTestId("sales-row-online-lottery");
    expect(onlineLotteryRow).toHaveTextContent("$250.00");
  });

  it("SB-CARD-008b: [P0] should NOT use DEFAULT_SALES_BREAKDOWN_STATE with POS lottery values", () => {
    // GIVEN: Default state from types.ts
    // WHEN: We check the default values
    // THEN: POS lottery values should be 0 (not placeholder values)
    expect(DEFAULT_SALES_BREAKDOWN_STATE.pos.scratchOff).toBe(0);
    expect(DEFAULT_SALES_BREAKDOWN_STATE.pos.onlineLottery).toBe(0);

    // AND: Reports lottery values should also start at 0
    expect(DEFAULT_SALES_BREAKDOWN_STATE.reports.scratchOff).toBe(0);
    expect(DEFAULT_SALES_BREAKDOWN_STATE.reports.onlineLottery).toBe(0);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P0 CRITICAL - SECURITY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("SB-CARD-009: [P0] should sanitize numeric input on blur", async () => {
    // GIVEN: SalesBreakdownCard component
    const user = userEvent.setup({ delay: null });
    render(
      <SalesBreakdownCard
        state={sampleState}
        onReportsChange={mockOnReportsChange}
      />,
    );

    // WHEN: User enters invalid numeric value
    const scratchOffInput = screen.getByTestId("sales-reports-scratch-off");
    await user.clear(scratchOffInput);
    await user.type(scratchOffInput, "abc123.45xyz");
    await user.tab(); // Trigger blur

    // THEN: Value should be sanitized to valid number
    // sanitizeNumericInput("abc123.45xyz") should extract 123.45
    expect(mockOnReportsChange).toHaveBeenCalledWith({ scratchOff: 123.45 });
  });

  it("SB-CARD-010: [P0] should prevent XSS through input handling", async () => {
    // GIVEN: SalesBreakdownCard component
    const user = userEvent.setup({ delay: null });
    render(
      <SalesBreakdownCard
        state={sampleState}
        onReportsChange={mockOnReportsChange}
      />,
    );

    // WHEN: User attempts XSS through input
    const scratchOffInput = screen.getByTestId("sales-reports-scratch-off");
    await user.clear(scratchOffInput);
    await user.type(scratchOffInput, '<script>alert("xss")</script>100');
    await user.tab(); // Trigger blur

    // THEN: Only numeric part is extracted, XSS is stripped
    expect(mockOnReportsChange).toHaveBeenCalledWith({ scratchOff: 100 });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P1 - DISABLED STATE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("SB-CARD-011: [P1] should disable inputs when disabled prop is true", () => {
    // GIVEN: SalesBreakdownCard with disabled=true
    render(
      <SalesBreakdownCard
        state={sampleState}
        onReportsChange={mockOnReportsChange}
        disabled={true}
      />,
    );

    // THEN: Lottery inputs should be disabled
    const scratchOffInput = screen.getByTestId("sales-reports-scratch-off");
    expect(scratchOffInput).toBeDisabled();

    const onlineLotteryInput = screen.getByTestId(
      "sales-reports-online-lottery",
    );
    expect(onlineLotteryInput).toBeDisabled();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P1 - EDITABLE POS MODE TESTS (Testing/Debug feature)
  // ═══════════════════════════════════════════════════════════════════════════

  it("SB-CARD-012: [P1] should allow editing POS values when editablePOS is true", async () => {
    // GIVEN: SalesBreakdownCard with editablePOS=true
    const user = userEvent.setup({ delay: null });
    render(
      <SalesBreakdownCard
        state={sampleState}
        onReportsChange={mockOnReportsChange}
        onPOSChange={mockOnPOSChange}
        editablePOS={true}
      />,
    );

    // WHEN: User edits gas sales POS value
    const gasSalesInput = screen.getByTestId("sales-pos-gas-sales");
    expect(gasSalesInput).toBeInTheDocument();
    await user.clear(gasSalesInput);
    await user.type(gasSalesInput, "3000.00");
    await user.tab(); // Trigger blur

    // THEN: onPOSChange should be called
    expect(mockOnPOSChange).toHaveBeenCalledWith({ gasSales: 3000 });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P2 - EDGE CASE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("SB-CARD-013: [P2] should handle zero values gracefully", () => {
    // GIVEN: State with all zeros
    const zeroState: SalesBreakdownState = {
      pos: {
        gasSales: 0,
        grocery: 0,
        tobacco: 0,
        beverages: 0,
        snacks: 0,
        other: 0,
        scratchOff: 0,
        onlineLottery: 0,
        salesTax: 0,
      },
      reports: {
        scratchOff: 0,
        onlineLottery: 0,
      },
    };

    // WHEN: Component is rendered
    render(
      <SalesBreakdownCard
        state={zeroState}
        onReportsChange={mockOnReportsChange}
      />,
    );

    // THEN: Should display $0.00 values without errors
    const totalsRow = screen.getByTestId("total-sales");
    expect(totalsRow).toHaveTextContent("$0.00");
  });

  it("SB-CARD-014: [P2] should handle large numbers correctly", () => {
    // GIVEN: State with large values
    const largeState: SalesBreakdownState = {
      pos: {
        gasSales: 999999.99,
        grocery: 888888.88,
        tobacco: 0,
        beverages: 0,
        snacks: 0,
        other: 0,
        scratchOff: 0,
        onlineLottery: 0,
        salesTax: 0,
      },
      reports: {
        scratchOff: 555555.55,
        onlineLottery: 0,
      },
    };

    // WHEN: Component is rendered
    render(
      <SalesBreakdownCard
        state={largeState}
        onReportsChange={mockOnReportsChange}
      />,
    );

    // THEN: Should format large numbers correctly
    expect(screen.getByTestId("sales-row-gas-sales")).toHaveTextContent(
      "$999,999.99",
    );
    expect(screen.getByTestId("sales-row-grocery")).toHaveTextContent(
      "$888,888.88",
    );
  });
});
