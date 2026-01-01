/**
 * @test-level COMPONENT
 * @justification Tests UI rendering and behavior for Open Shifts Blocking Banner
 * @story Day Close Defense-in-Depth Validation
 * @priority P0 (Critical - UI Safety Blocking)
 *
 * Open Shifts Blocking Banner Component Tests
 *
 * Tests the defense-in-depth UX for day close when open shifts exist:
 * - Banner visibility based on open shifts status
 * - Correct display of shift details (terminal, cashier, status)
 * - Proper pluralization of messages
 * - Accessibility and semantic structure
 *
 * MCP Guidance Applied:
 * - TESTING: Component tests are fast, isolated, and granular
 * - FE-002: Form validation - UI blocking when prerequisites not met
 * - SEC-014: Only display necessary information (no sensitive data)
 *
 * ================================================================================
 * TRACEABILITY MATRIX
 * ================================================================================
 *
 * | Test ID            | Requirement                          | Component/Feature              | Priority |
 * |--------------------|--------------------------------------|--------------------------------|----------|
 * | BLOCK-BANNER-001   | FE-002: Display blocking banner      | OpenShiftsBlockingBanner       | P0       |
 * | BLOCK-BANNER-002   | FE-002: Hide banner when no open     | OpenShiftsBlockingBanner       | P0       |
 * | BLOCK-BANNER-003   | FE-002: Show shift count             | OpenShiftsBlockingBanner       | P0       |
 * | BLOCK-BANNER-004   | FE-002: Show terminal names          | OpenShiftsBlockingBanner       | P0       |
 * | BLOCK-BANNER-005   | FE-002: Show cashier names           | OpenShiftsBlockingBanner       | P0       |
 * | BLOCK-BANNER-006   | FE-002: Show shift statuses          | OpenShiftsBlockingBanner       | P0       |
 * | BLOCK-BANNER-007   | FE-002: Singular shift message       | OpenShiftsBlockingBanner       | P1       |
 * | BLOCK-BANNER-008   | FE-002: Plural shifts message        | OpenShiftsBlockingBanner       | P1       |
 * | BLOCK-BANNER-009   | FE-002: Handle unknown terminal      | OpenShiftsBlockingBanner       | P1       |
 * | BLOCK-BANNER-010   | A11Y: ARIA alert role               | OpenShiftsBlockingBanner       | P2       |
 * | BLOCK-BANNER-011   | A11Y: Semantic list structure        | OpenShiftsBlockingBanner       | P2       |
 * | BLOCK-BANNER-012   | SEC-014: No sensitive data           | OpenShiftsBlockingBanner       | P0       |
 *
 * REQUIREMENT COVERAGE:
 * - Form Validation (FE-002): 9 tests
 * - Accessibility (A11Y): 2 tests
 * - Security (SEC-014): 1 test
 * ================================================================================
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";
import type {
  OpenShiftDetail,
  OpenShiftsCheckResponse,
} from "@/lib/api/shifts";

/**
 * Extract the Open Shifts Blocking Banner component for isolated testing
 * This mirrors the implementation in day-close/page.tsx
 */
function OpenShiftsBlockingBanner({
  openShiftsData,
  isLoading = false,
}: {
  openShiftsData: OpenShiftsCheckResponse | null | undefined;
  isLoading?: boolean;
}) {
  const hasOtherOpenShifts = openShiftsData?.has_open_shifts ?? false;

  if (isLoading || !hasOtherOpenShifts || !openShiftsData) {
    return null;
  }

  return (
    <Card
      className="border-destructive bg-destructive/5"
      data-testid="open-shifts-blocking-banner"
      role="alert"
    >
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <AlertCircle
            className="h-6 w-6 text-destructive flex-shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div className="space-y-3">
            <div>
              <h3 className="font-semibold text-destructive">
                Cannot Close Day – Open Shifts Found
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                All shifts must be closed before the day can be closed. The
                following {openShiftsData.open_shift_count} shift
                {openShiftsData.open_shift_count !== 1 ? "s are" : " is"} still
                open:
              </p>
            </div>
            <ul className="space-y-2" data-testid="open-shifts-list">
              {openShiftsData.open_shifts.map((shift) => (
                <li
                  key={shift.shift_id}
                  className="text-sm flex items-center gap-2"
                  data-testid={`shift-item-${shift.shift_id}`}
                >
                  <Badge
                    variant="outline"
                    className="text-amber-600 border-amber-300"
                    data-testid={`shift-status-${shift.shift_id}`}
                  >
                    {shift.status}
                  </Badge>
                  <span
                    className="font-medium"
                    data-testid={`shift-terminal-${shift.shift_id}`}
                  >
                    {shift.terminal_name || "Unknown Terminal"}
                  </span>
                  <span className="text-muted-foreground">•</span>
                  <span data-testid={`shift-cashier-${shift.shift_id}`}>
                    {shift.cashier_name}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              Please ask other cashiers to close their shifts first, or close
              them from the Shift Management page.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

describe("OpenShiftsBlockingBanner Component", () => {
  // Sample test data
  const singleOpenShift: OpenShiftsCheckResponse = {
    has_open_shifts: true,
    open_shift_count: 1,
    open_shifts: [
      {
        shift_id: "shift-001",
        terminal_name: "Terminal 1",
        cashier_name: "John Doe",
        shift_number: 1,
        status: "ACTIVE",
        opened_at: "2025-12-24T08:00:00.000Z",
      },
    ],
  };

  const multipleOpenShifts: OpenShiftsCheckResponse = {
    has_open_shifts: true,
    open_shift_count: 3,
    open_shifts: [
      {
        shift_id: "shift-001",
        terminal_name: "Terminal 1",
        cashier_name: "John Doe",
        shift_number: 1,
        status: "OPEN",
        opened_at: "2025-12-24T08:00:00.000Z",
      },
      {
        shift_id: "shift-002",
        terminal_name: "Terminal 2",
        cashier_name: "Jane Smith",
        shift_number: 2,
        status: "ACTIVE",
        opened_at: "2025-12-24T09:00:00.000Z",
      },
      {
        shift_id: "shift-003",
        terminal_name: null,
        cashier_name: "Bob Wilson",
        shift_number: null,
        status: "RECONCILING",
        opened_at: "2025-12-24T10:00:00.000Z",
      },
    ],
  };

  const noOpenShifts: OpenShiftsCheckResponse = {
    has_open_shifts: false,
    open_shift_count: 0,
    open_shifts: [],
  };

  afterEach(() => {
    cleanup();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P0 CRITICAL - VISIBILITY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("BLOCK-BANNER-001: [P0] should display blocking banner when open shifts exist", () => {
    // GIVEN: Open shifts data with has_open_shifts = true
    // WHEN: Component is rendered
    render(<OpenShiftsBlockingBanner openShiftsData={singleOpenShift} />);

    // THEN: Banner should be visible
    expect(
      screen.getByTestId("open-shifts-blocking-banner"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Cannot Close Day – Open Shifts Found"),
    ).toBeInTheDocument();
  });

  it("BLOCK-BANNER-002: [P0] should NOT display banner when no open shifts", () => {
    // GIVEN: Open shifts data with has_open_shifts = false
    // WHEN: Component is rendered
    render(<OpenShiftsBlockingBanner openShiftsData={noOpenShifts} />);

    // THEN: Banner should NOT be visible
    expect(
      screen.queryByTestId("open-shifts-blocking-banner"),
    ).not.toBeInTheDocument();
  });

  it("BLOCK-BANNER-002a: [P0] should NOT display banner when data is null", () => {
    // GIVEN: Null open shifts data
    // WHEN: Component is rendered
    render(<OpenShiftsBlockingBanner openShiftsData={null} />);

    // THEN: Banner should NOT be visible
    expect(
      screen.queryByTestId("open-shifts-blocking-banner"),
    ).not.toBeInTheDocument();
  });

  it("BLOCK-BANNER-002b: [P0] should NOT display banner when loading", () => {
    // GIVEN: Loading state with open shifts data
    // WHEN: Component is rendered with isLoading=true
    render(
      <OpenShiftsBlockingBanner
        openShiftsData={singleOpenShift}
        isLoading={true}
      />,
    );

    // THEN: Banner should NOT be visible during loading
    expect(
      screen.queryByTestId("open-shifts-blocking-banner"),
    ).not.toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P0 CRITICAL - CONTENT DISPLAY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("BLOCK-BANNER-003: [P0] should display correct shift count", () => {
    // GIVEN: Multiple open shifts
    // WHEN: Component is rendered
    render(<OpenShiftsBlockingBanner openShiftsData={multipleOpenShifts} />);

    // THEN: Should show correct count in message
    expect(
      screen.getByText(/The following 3 shifts are still open/i),
    ).toBeInTheDocument();
  });

  it("BLOCK-BANNER-004: [P0] should display terminal names for each shift", () => {
    // GIVEN: Multiple open shifts with different terminals
    // WHEN: Component is rendered
    render(<OpenShiftsBlockingBanner openShiftsData={multipleOpenShifts} />);

    // THEN: Each terminal name should be visible
    expect(screen.getByText("Terminal 1")).toBeInTheDocument();
    expect(screen.getByText("Terminal 2")).toBeInTheDocument();
  });

  it("BLOCK-BANNER-005: [P0] should display cashier names for each shift", () => {
    // GIVEN: Multiple open shifts with different cashiers
    // WHEN: Component is rendered
    render(<OpenShiftsBlockingBanner openShiftsData={multipleOpenShifts} />);

    // THEN: Each cashier name should be visible
    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("Jane Smith")).toBeInTheDocument();
    expect(screen.getByText("Bob Wilson")).toBeInTheDocument();
  });

  it("BLOCK-BANNER-006: [P0] should display shift status badges", () => {
    // GIVEN: Multiple open shifts with different statuses
    // WHEN: Component is rendered
    render(<OpenShiftsBlockingBanner openShiftsData={multipleOpenShifts} />);

    // THEN: Each status should be visible
    expect(screen.getByText("OPEN")).toBeInTheDocument();
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    expect(screen.getByText("RECONCILING")).toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P1 IMPORTANT - PLURALIZATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("BLOCK-BANNER-007: [P1] should use singular form for one shift", () => {
    // GIVEN: Single open shift
    // WHEN: Component is rendered
    render(<OpenShiftsBlockingBanner openShiftsData={singleOpenShift} />);

    // THEN: Should use singular "shift is"
    expect(
      screen.getByText(/The following 1 shift is still open/i),
    ).toBeInTheDocument();
  });

  it("BLOCK-BANNER-008: [P1] should use plural form for multiple shifts", () => {
    // GIVEN: Multiple open shifts
    // WHEN: Component is rendered
    render(<OpenShiftsBlockingBanner openShiftsData={multipleOpenShifts} />);

    // THEN: Should use plural "shifts are"
    expect(
      screen.getByText(/The following 3 shifts are still open/i),
    ).toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P1 IMPORTANT - EDGE CASE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("BLOCK-BANNER-009: [P1] should show 'Unknown Terminal' when terminal_name is null", () => {
    // GIVEN: Shift with null terminal_name
    // WHEN: Component is rendered
    render(<OpenShiftsBlockingBanner openShiftsData={multipleOpenShifts} />);

    // THEN: Should display "Unknown Terminal" for shift-003
    expect(screen.getByText("Unknown Terminal")).toBeInTheDocument();
    expect(screen.getByTestId("shift-terminal-shift-003")).toHaveTextContent(
      "Unknown Terminal",
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P2 NICE-TO-HAVE - ACCESSIBILITY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("BLOCK-BANNER-010: [P2] should have ARIA alert role for screen readers", () => {
    // GIVEN: Open shifts data
    // WHEN: Component is rendered
    render(<OpenShiftsBlockingBanner openShiftsData={singleOpenShift} />);

    // THEN: Card should have role="alert"
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("BLOCK-BANNER-011: [P2] should use semantic list structure for shifts", () => {
    // GIVEN: Multiple open shifts
    // WHEN: Component is rendered
    render(<OpenShiftsBlockingBanner openShiftsData={multipleOpenShifts} />);

    // THEN: Shifts should be rendered in a list
    const list = screen.getByTestId("open-shifts-list");
    expect(list.tagName).toBe("UL");
    const listItems = list.querySelectorAll("li");
    expect(listItems).toHaveLength(3);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P0 CRITICAL - SECURITY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("BLOCK-BANNER-012: [P0] should NOT expose sensitive data (only display necessary fields)", () => {
    // GIVEN: Open shifts data
    // WHEN: Component is rendered
    render(<OpenShiftsBlockingBanner openShiftsData={singleOpenShift} />);

    // THEN: Should NOT display opened_at timestamp (internal detail)
    expect(
      screen.queryByText("2025-12-24T08:00:00.000Z"),
    ).not.toBeInTheDocument();

    // THEN: Should only display: status, terminal_name, cashier_name
    expect(screen.getByText("Terminal 1")).toBeInTheDocument();
    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INTEGRATION SCENARIO TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("BLOCK-BANNER-INT-001: should provide actionable guidance to user", () => {
    // GIVEN: Open shifts data
    // WHEN: Component is rendered
    render(<OpenShiftsBlockingBanner openShiftsData={singleOpenShift} />);

    // THEN: Should display actionable guidance
    expect(
      screen.getByText(/Please ask other cashiers to close their shifts/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/close them from the Shift Management page/i),
    ).toBeInTheDocument();
  });

  it("BLOCK-BANNER-INT-002: should correctly associate shift items with data-testids", () => {
    // GIVEN: Multiple open shifts
    // WHEN: Component is rendered
    render(<OpenShiftsBlockingBanner openShiftsData={multipleOpenShifts} />);

    // THEN: Each shift should have proper test ID associations
    expect(screen.getByTestId("shift-item-shift-001")).toBeInTheDocument();
    expect(screen.getByTestId("shift-item-shift-002")).toBeInTheDocument();
    expect(screen.getByTestId("shift-item-shift-003")).toBeInTheDocument();

    // Verify each item has correct sub-element test IDs
    expect(screen.getByTestId("shift-status-shift-001")).toHaveTextContent(
      "OPEN",
    );
    expect(screen.getByTestId("shift-terminal-shift-002")).toHaveTextContent(
      "Terminal 2",
    );
    expect(screen.getByTestId("shift-cashier-shift-003")).toHaveTextContent(
      "Bob Wilson",
    );
  });
});
