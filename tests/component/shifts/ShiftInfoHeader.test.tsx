/**
 * @test-level COMPONENT
 * @justification Tests ShiftInfoHeader UI component without backend dependencies
 * @story Shift Closing Plan - Shared Components
 * @priority P0 (Critical - Shared UI Component)
 *
 * ShiftInfoHeader Component Tests
 *
 * Tests the shared header component used in both Shift Close and Day Close wizards.
 * Displays terminal name, shift number, cashier info, start time, and opening cash.
 *
 * ================================================================================
 * TRACEABILITY MATRIX
 * ================================================================================
 *
 * | Test ID              | Requirement                          | Component/Feature              | Priority |
 * |----------------------|--------------------------------------|--------------------------------|----------|
 * | SIH-001              | FE-002: Header renders correctly     | ShiftInfoHeader                | P0       |
 * | SIH-002              | FE-002: Terminal name displayed      | ShiftInfoHeader                | P0       |
 * | SIH-003              | FE-002: Shift number displayed       | ShiftInfoHeader                | P0       |
 * | SIH-004              | FE-002: Cashier name displayed       | ShiftInfoHeader                | P0       |
 * | SIH-005              | FE-002: Start time formatted         | ShiftInfoHeader                | P0       |
 * | SIH-006              | FE-002: Opening cash formatted       | ShiftInfoHeader                | P0       |
 * | SIH-007              | FE-002: Null shift number handled    | ShiftInfoHeader                | P1       |
 *
 * REQUIREMENT COVERAGE:
 * - Form Validation (FE-002): 7 tests
 * - UI Security (FE-005): Implicit in all tests (no secrets displayed)
 * ================================================================================
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ShiftInfoHeader } from "@/components/shifts/ShiftInfoHeader";

describe("ShiftInfoHeader Component", () => {
  // Default props for testing
  const defaultProps = {
    terminalName: "Terminal 1",
    shiftNumber: 5,
    cashierName: "John Smith",
    shiftStartTime: "2025-12-25T08:00:00.000Z",
    openingCash: 200.0,
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // P0 CRITICAL - RENDERING TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("SIH-001: [P0] should render header component with test id", () => {
    // GIVEN: Default props
    // WHEN: Component is rendered
    render(<ShiftInfoHeader {...defaultProps} />);

    // THEN: Header container should be present
    expect(screen.getByTestId("shift-info-header")).toBeInTheDocument();
  });

  it("SIH-002: [P0] should display terminal name in card", () => {
    // GIVEN: Terminal name "Terminal 1"
    // WHEN: Component is rendered
    render(<ShiftInfoHeader {...defaultProps} />);

    // THEN: Terminal name should be visible with label
    expect(screen.getByText("Terminal:")).toBeInTheDocument();
    expect(screen.getByText("Terminal 1")).toBeInTheDocument();
  });

  it("SIH-003: [P0] should display shift number with proper format", () => {
    // GIVEN: Shift number 5
    // WHEN: Component is rendered
    render(<ShiftInfoHeader {...defaultProps} />);

    // THEN: Shift number should be displayed as "#5" with label
    expect(screen.getByText("Shift:")).toBeInTheDocument();
    expect(screen.getByText("#5")).toBeInTheDocument();
  });

  it("SIH-004: [P0] should display cashier name", () => {
    // GIVEN: Cashier name "John Smith"
    // WHEN: Component is rendered
    render(<ShiftInfoHeader {...defaultProps} />);

    // THEN: Cashier name should be visible
    expect(screen.getByText("John Smith")).toBeInTheDocument();
    expect(screen.getByText("Cashier:")).toBeInTheDocument();
  });

  it("SIH-005: [P0] should format and display start time", () => {
    // GIVEN: ISO timestamp "2025-12-25T08:00:00.000Z"
    // WHEN: Component is rendered
    render(<ShiftInfoHeader {...defaultProps} />);

    // THEN: Start time should be formatted and visible
    expect(screen.getByText("Started:")).toBeInTheDocument();
    // The formatted date should include "Dec 25, 2025"
    expect(screen.getByText(/Dec 25, 2025/)).toBeInTheDocument();
  });

  it("SIH-006: [P0] should format and display opening cash", () => {
    // GIVEN: Opening cash 200.00
    // WHEN: Component is rendered
    render(<ShiftInfoHeader {...defaultProps} />);

    // THEN: Opening cash should be formatted as currency
    expect(screen.getByTestId("opening-cash-display")).toBeInTheDocument();
    expect(screen.getByText("Opening Cash:")).toBeInTheDocument();
    expect(screen.getByText("$200.00")).toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P1 - EDGE CASE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("SIH-007: [P1] should not display shift number when null", () => {
    // GIVEN: Shift number is null
    const propsWithNullShiftNumber = {
      ...defaultProps,
      shiftNumber: null,
    };

    // WHEN: Component is rendered
    render(<ShiftInfoHeader {...propsWithNullShiftNumber} />);

    // THEN: Shift label and number should NOT be visible
    expect(screen.queryByText("Shift:")).not.toBeInTheDocument();
    // But terminal name should still be visible
    expect(screen.getByText("Terminal 1")).toBeInTheDocument();
  });

  it("SIH-008: [P1] should handle zero opening cash", () => {
    // GIVEN: Opening cash is 0
    const propsWithZeroCash = {
      ...defaultProps,
      openingCash: 0,
    };

    // WHEN: Component is rendered
    render(<ShiftInfoHeader {...propsWithZeroCash} />);

    // THEN: Opening cash should display as $0.00
    expect(screen.getByText("$0.00")).toBeInTheDocument();
  });

  it("SIH-009: [P1] should handle large opening cash amounts", () => {
    // GIVEN: Large opening cash amount
    const propsWithLargeCash = {
      ...defaultProps,
      openingCash: 10000.5,
    };

    // WHEN: Component is rendered
    render(<ShiftInfoHeader {...propsWithLargeCash} />);

    // THEN: Opening cash should be formatted correctly
    expect(screen.getByText("$10,000.50")).toBeInTheDocument();
  });

  it("SIH-010: [P1] should handle different terminal names", () => {
    // GIVEN: Different terminal name
    const propsWithDifferentTerminal = {
      ...defaultProps,
      terminalName: "POS Register A",
    };

    // WHEN: Component is rendered
    render(<ShiftInfoHeader {...propsWithDifferentTerminal} />);

    // THEN: Terminal name should be displayed
    expect(screen.getByText("POS Register A")).toBeInTheDocument();
  });
});
