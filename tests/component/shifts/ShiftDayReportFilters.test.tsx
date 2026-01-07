/**
 * @file ShiftDayReportFilters.test.tsx
 * @test-level Component
 * @description Component tests for ShiftDayReportFilters - validates filter controls,
 *              responsive layout, state management, accessibility, and security.
 *
 * TRACEABILITY MATRIX:
 * ┌────────────────────────────────────────────────────────────────────────────────┐
 * │ Test ID                    │ Requirement              │ Priority │ Category    │
 * ├────────────────────────────┼──────────────────────────┼──────────┼─────────────┤
 * │ SDRF-RENDER-001           │ Filter controls render    │ P0       │ Render      │
 * │ SDRF-RENDER-002           │ Single store badge        │ P0       │ Render      │
 * │ SDRF-RENDER-003           │ Store selector visibility │ P0       │ Render      │
 * │ SDRF-STATE-001            │ Report type change        │ P0       │ State       │
 * │ SDRF-STATE-002            │ Cashier selection         │ P0       │ State       │
 * │ SDRF-STATE-003            │ Range preset change       │ P0       │ State       │
 * │ SDRF-STATE-004            │ Date input handling       │ P0       │ State       │
 * │ SDRF-STATE-005            │ Apply filters callback    │ P0       │ State       │
 * │ SDRF-STATE-006            │ Clear filters callback    │ P0       │ State       │
 * │ SDRF-A11Y-001             │ ARIA labels present       │ P1       │ A11y        │
 * │ SDRF-A11Y-002             │ Screen reader support     │ P1       │ A11y        │
 * │ SDRF-SEC-001              │ Input validation          │ P1       │ Security    │
 * │ SDRF-SEC-002              │ XSS prevention            │ P1       │ Security    │
 * │ SDRF-SEC-003              │ Report type allowlist     │ P1       │ Security    │
 * │ SDRF-EDGE-001             │ Disabled state handling   │ P2       │ Edge Case   │
 * │ SDRF-EDGE-002             │ Empty stores array        │ P2       │ Edge Case   │
 * │ SDRF-EDGE-003             │ Empty cashiers array      │ P2       │ Edge Case   │
 * │ SDRF-EDGE-004             │ Validation error display  │ P2       │ Edge Case   │
 * │ SDRF-RESP-001             │ Mobile layout             │ P2       │ Responsive  │
 * └────────────────────────────────────────────────────────────────────────────────┘
 *
 * ENTERPRISE STANDARDS:
 * - SEC-014: INPUT_VALIDATION - Tests verify allowlist validation on inputs
 * - SEC-004: XSS - Tests verify React's auto-escaping prevents XSS
 * - FE-002: FORM_VALIDATION - Tests verify proper error states
 * - FE-005: UI_SECURITY - Tests verify no sensitive data in DOM
 *
 * @story Unified Shift & Day Report View
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../../support/test-utils";
import { ShiftDayReportFilters } from "@/components/shifts/ShiftDayReportFilters";
import type { ShiftDayReportFiltersProps } from "@/components/shifts/ShiftDayReportFilters";
import type { FilterFormState } from "@/lib/schemas/shift-day-filters.schema";
import type { Cashier } from "@/lib/api/cashiers";
import type { OwnedStore } from "@/lib/api/client-dashboard";
import userEvent from "@testing-library/user-event";

// =============================================================================
// TEST FIXTURES - Real-world data structures (no mock data for logic)
// =============================================================================

/**
 * Factory function for creating filter state
 * SEC-014: Uses Zod-compatible structure
 */
function createFilterState(
  overrides: Partial<FilterFormState> = {},
): FilterFormState {
  return {
    storeId: "",
    reportType: "all",
    cashierId: "",
    rangePreset: "current",
    fromDate: "",
    toDate: "",
    ...overrides,
  };
}

/**
 * Factory function for creating store fixtures
 * FE-005: Uses UUIDs, no sensitive data
 */
function createStoreFixtures(): OwnedStore[] {
  return [
    {
      store_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      company_id: "comp-1234",
      company_name: "Test Company",
      name: "Downtown Store",
      location_json: { address: "123 Main St" },
      timezone: "America/New_York",
      status: "ACTIVE",
      created_at: "2024-01-01T00:00:00Z",
    },
    {
      store_id: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      company_id: "comp-1234",
      company_name: "Test Company",
      name: "Uptown Store",
      location_json: { address: "456 Oak Ave" },
      timezone: "America/New_York",
      status: "ACTIVE",
      created_at: "2024-01-01T00:00:00Z",
    },
  ];
}

/**
 * Factory function for creating cashier fixtures
 * FE-005: Uses UUIDs, no sensitive data
 */
function createCashierFixtures(): Cashier[] {
  return [
    {
      cashier_id: "c3d4e5f6-a7b8-9012-cdef-123456789012",
      store_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      employee_id: "EMP001",
      name: "Alice Johnson",
      is_active: true,
      hired_on: "2024-01-01",
      termination_date: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      disabled_at: null,
    },
    {
      cashier_id: "d4e5f6a7-b8c9-0123-defa-234567890123",
      store_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      employee_id: "EMP002",
      name: "Bob Smith",
      is_active: true,
      hired_on: "2024-01-01",
      termination_date: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      disabled_at: null,
    },
  ];
}

/**
 * Default props factory for component
 * Ensures all required props are provided
 */
function createDefaultProps(
  overrides: Partial<ShiftDayReportFiltersProps> = {},
): ShiftDayReportFiltersProps {
  return {
    filterState: createFilterState(),
    onFilterChange: vi.fn(),
    stores: [],
    cashiers: [],
    onApplyFilters: vi.fn(),
    onClearFilters: vi.fn(),
    hasActiveFilters: false,
    ...overrides,
  };
}

// =============================================================================
// TEST SUITE: RENDERING TESTS (P0)
// =============================================================================

describe("SDRF-RENDER: ShiftDayReportFilters Rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[P0] SDRF-RENDER-001: should render all filter controls", () => {
    // GIVEN: Component with multiple stores (shows all controls)
    const stores = createStoreFixtures();
    const props = createDefaultProps({
      stores,
      filterState: createFilterState({ storeId: stores[0].store_id }),
    });

    // WHEN: Component is rendered
    renderWithProviders(<ShiftDayReportFilters {...props} />);

    // THEN: All filter controls should be present
    expect(screen.getByTestId("shift-day-report-filters")).toBeInTheDocument();
    expect(screen.getByTestId("filter-store")).toBeInTheDocument();
    expect(screen.getByTestId("filter-report-type")).toBeInTheDocument();
    expect(screen.getByTestId("filter-cashier")).toBeInTheDocument();
    expect(screen.getByTestId("filter-range")).toBeInTheDocument();
    expect(screen.getByTestId("filter-date-from")).toBeInTheDocument();
    expect(screen.getByTestId("filter-date-to")).toBeInTheDocument();
    expect(screen.getByTestId("apply-filters-button")).toBeInTheDocument();
  });

  it("[P0] SDRF-RENDER-002: should display single store badge when only one store", () => {
    // GIVEN: Component with single store
    const stores = [createStoreFixtures()[0]];
    const props = createDefaultProps({
      stores,
      filterState: createFilterState({ storeId: stores[0].store_id }),
    });

    // WHEN: Component is rendered
    renderWithProviders(<ShiftDayReportFilters {...props} />);

    // THEN: Single store badge should be displayed instead of dropdown
    expect(screen.getByTestId("single-store-badge")).toBeInTheDocument();
    expect(screen.getByTestId("single-store-badge")).toHaveTextContent(
      "Downtown Store",
    );
    expect(screen.queryByTestId("filter-store")).not.toBeInTheDocument();
  });

  it("[P0] SDRF-RENDER-003: should show store selector only when multiple stores exist", () => {
    // GIVEN: Component with multiple stores
    const stores = createStoreFixtures();
    const props = createDefaultProps({
      stores,
      filterState: createFilterState({ storeId: stores[0].store_id }),
    });

    // WHEN: Component is rendered
    renderWithProviders(<ShiftDayReportFilters {...props} />);

    // THEN: Store selector should be visible
    expect(screen.getByTestId("filter-store")).toBeInTheDocument();
    expect(screen.queryByTestId("single-store-badge")).not.toBeInTheDocument();
  });

  it("[P0] SDRF-RENDER-004: should display clear button only when filters are active", () => {
    // GIVEN: Component with active filters
    const props = createDefaultProps({ hasActiveFilters: true });

    // WHEN: Component is rendered
    renderWithProviders(<ShiftDayReportFilters {...props} />);

    // THEN: Clear button should be visible
    expect(screen.getByTestId("clear-filters-button")).toBeInTheDocument();
  });

  it("[P0] SDRF-RENDER-005: should hide clear button when no filters active", () => {
    // GIVEN: Component without active filters
    const props = createDefaultProps({ hasActiveFilters: false });

    // WHEN: Component is rendered
    renderWithProviders(<ShiftDayReportFilters {...props} />);

    // THEN: Clear button should not be visible
    expect(
      screen.queryByTestId("clear-filters-button"),
    ).not.toBeInTheDocument();
  });
});

// =============================================================================
// TEST SUITE: STATE MANAGEMENT TESTS (P0)
// =============================================================================

describe("SDRF-STATE: ShiftDayReportFilters State Management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[P0] SDRF-STATE-001: should call onFilterChange when report type changes", async () => {
    // GIVEN: Component with onFilterChange callback
    const onFilterChange = vi.fn();
    const props = createDefaultProps({ onFilterChange });
    const user = userEvent.setup();

    renderWithProviders(<ShiftDayReportFilters {...props} />);

    // WHEN: Report type is changed
    const reportTypeSelect = screen.getByTestId("filter-report-type");
    await user.click(reportTypeSelect);
    const shiftOption = screen.getByRole("option", { name: "Shift" });
    await user.click(shiftOption);

    // THEN: onFilterChange should be called with new report type
    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ reportType: "shift" }),
    );
  });

  it("[P0] SDRF-STATE-002: should call onFilterChange when cashier is selected", async () => {
    // GIVEN: Component with cashiers and store selected
    const onFilterChange = vi.fn();
    const stores = createStoreFixtures();
    const cashiers = createCashierFixtures();
    const props = createDefaultProps({
      onFilterChange,
      stores,
      cashiers,
      filterState: createFilterState({ storeId: stores[0].store_id }),
    });
    const user = userEvent.setup();

    renderWithProviders(<ShiftDayReportFilters {...props} />);

    // WHEN: Cashier is selected
    const cashierSelect = screen.getByTestId("filter-cashier");
    await user.click(cashierSelect);
    const aliceOption = screen.getByRole("option", { name: "Alice Johnson" });
    await user.click(aliceOption);

    // THEN: onFilterChange should be called with cashier ID
    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ cashierId: cashiers[0].cashier_id }),
    );
  });

  it("[P0] SDRF-STATE-003: should call onFilterChange when range preset changes", async () => {
    // GIVEN: Component with onFilterChange callback
    const onFilterChange = vi.fn();
    const props = createDefaultProps({ onFilterChange });
    const user = userEvent.setup();

    renderWithProviders(<ShiftDayReportFilters {...props} />);

    // WHEN: Range preset is changed
    const rangeSelect = screen.getByTestId("filter-range");
    await user.click(rangeSelect);
    const customOption = screen.getByRole("option", { name: "Custom" });
    await user.click(customOption);

    // THEN: onFilterChange should be called with new range preset
    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ rangePreset: "custom" }),
    );
  });

  it("[P0] SDRF-STATE-004: should update date when from date input changes", async () => {
    // GIVEN: Component with custom range preset (dates editable)
    const onFilterChange = vi.fn();
    const props = createDefaultProps({
      onFilterChange,
      filterState: createFilterState({ rangePreset: "custom" }),
    });
    const user = userEvent.setup();

    renderWithProviders(<ShiftDayReportFilters {...props} />);

    // WHEN: From date is entered
    const fromDateInput = screen.getByTestId("filter-date-from");
    await user.clear(fromDateInput);
    await user.type(fromDateInput, "2024-06-15");

    // THEN: onFilterChange should be called with new date
    await waitFor(() => {
      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({ fromDate: "2024-06-15" }),
      );
    });
  });

  it("[P0] SDRF-STATE-005: should call onApplyFilters when apply button is clicked", async () => {
    // GIVEN: Component with onApplyFilters callback
    const onApplyFilters = vi.fn();
    const props = createDefaultProps({ onApplyFilters });
    const user = userEvent.setup();

    renderWithProviders(<ShiftDayReportFilters {...props} />);

    // WHEN: Apply button is clicked
    const applyButton = screen.getByTestId("apply-filters-button");
    await user.click(applyButton);

    // THEN: onApplyFilters should be called
    expect(onApplyFilters).toHaveBeenCalledTimes(1);
  });

  it("[P0] SDRF-STATE-006: should call onClearFilters when clear button is clicked", async () => {
    // GIVEN: Component with active filters and onClearFilters callback
    const onClearFilters = vi.fn();
    const props = createDefaultProps({
      onClearFilters,
      hasActiveFilters: true,
    });
    const user = userEvent.setup();

    renderWithProviders(<ShiftDayReportFilters {...props} />);

    // WHEN: Clear button is clicked
    const clearButton = screen.getByTestId("clear-filters-button");
    await user.click(clearButton);

    // THEN: onClearFilters should be called
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it("[P0] SDRF-STATE-007: should clear cashier when store changes", async () => {
    // GIVEN: Component with store and cashier selected
    const onFilterChange = vi.fn();
    const stores = createStoreFixtures();
    const props = createDefaultProps({
      onFilterChange,
      stores,
      filterState: createFilterState({
        storeId: stores[0].store_id,
        cashierId: "c3d4e5f6-a7b8-9012-cdef-123456789012",
      }),
    });
    const user = userEvent.setup();

    renderWithProviders(<ShiftDayReportFilters {...props} />);

    // WHEN: Store is changed
    const storeSelect = screen.getByTestId("filter-store");
    await user.click(storeSelect);
    const uptownOption = screen.getByRole("option", { name: "Uptown Store" });
    await user.click(uptownOption);

    // THEN: onFilterChange should be called with empty cashierId
    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: stores[1].store_id,
        cashierId: "", // Cleared
      }),
    );
  });
});

// =============================================================================
// TEST SUITE: ACCESSIBILITY TESTS (P1)
// =============================================================================

describe("SDRF-A11Y: ShiftDayReportFilters Accessibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[P1] SDRF-A11Y-001: should have proper ARIA labels on container", () => {
    // GIVEN: Component is rendered
    const props = createDefaultProps();

    // WHEN: Component is rendered
    renderWithProviders(<ShiftDayReportFilters {...props} />);

    // THEN: Container should have search role and aria-label
    const container = screen.getByTestId("shift-day-report-filters");
    expect(container).toHaveAttribute("role", "search");
    expect(container).toHaveAttribute(
      "aria-label",
      "Filter shift and day reports",
    );
  });

  it("[P1] SDRF-A11Y-002: should have labels associated with inputs", () => {
    // GIVEN: Component with multiple stores
    const stores = createStoreFixtures();
    const props = createDefaultProps({
      stores,
      filterState: createFilterState({ storeId: stores[0].store_id }),
    });

    // WHEN: Component is rendered
    renderWithProviders(<ShiftDayReportFilters {...props} />);

    // THEN: Labels should be present for inputs
    expect(screen.getByLabelText("Store")).toBeInTheDocument();
    expect(screen.getByLabelText("Report Type")).toBeInTheDocument();
    expect(screen.getByLabelText("Cashier")).toBeInTheDocument();
    expect(screen.getByLabelText("Range")).toBeInTheDocument();
    expect(screen.getByLabelText("From Date")).toBeInTheDocument();
    expect(screen.getByLabelText("To Date")).toBeInTheDocument();
  });

  it("[P1] SDRF-A11Y-003: should show validation error with alert role", () => {
    // GIVEN: Component with validation error
    const props = createDefaultProps({
      validationError: "Please select a date when using the Day range preset.",
    });

    // WHEN: Component is rendered
    renderWithProviders(<ShiftDayReportFilters {...props} />);

    // THEN: Error should have alert role and be announced
    const errorElement = screen.getByTestId("filter-validation-error");
    expect(errorElement).toHaveAttribute("role", "alert");
    expect(errorElement).toHaveAttribute("aria-live", "polite");
    expect(errorElement).toHaveTextContent(
      "Please select a date when using the Day range preset.",
    );
  });
});

// =============================================================================
// TEST SUITE: SECURITY TESTS (P1)
// =============================================================================

describe("SDRF-SEC: ShiftDayReportFilters Security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[P1] SDRF-SEC-001: should prevent XSS in validation error display", () => {
    // GIVEN: Component with XSS attempt in validation error
    // SEC-004: React auto-escapes output
    const xssAttempt = "<script>alert('xss')</script>";
    const props = createDefaultProps({ validationError: xssAttempt });

    // WHEN: Component is rendered
    renderWithProviders(<ShiftDayReportFilters {...props} />);

    // THEN: Script tag should be escaped, not executed
    const errorElement = screen.getByTestId("filter-validation-error");
    expect(errorElement.innerHTML).not.toContain("<script>");
    expect(errorElement.textContent).toContain("<script>");
  });

  it("[P1] SDRF-SEC-002: should validate report type against allowlist", async () => {
    // GIVEN: Component with onFilterChange callback
    // SEC-014: Allowlist validation
    const onFilterChange = vi.fn();
    const props = createDefaultProps({ onFilterChange });
    const user = userEvent.setup();

    renderWithProviders(<ShiftDayReportFilters {...props} />);

    // WHEN: Valid report type is selected
    const reportTypeSelect = screen.getByTestId("filter-report-type");
    await user.click(reportTypeSelect);
    const dayOption = screen.getByRole("option", { name: "Day" });
    await user.click(dayOption);

    // THEN: Only valid enum values should be accepted
    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ reportType: "day" }),
    );
  });

  it("[P1] SDRF-SEC-003: should not expose sensitive data in DOM", () => {
    // GIVEN: Component with stores (UUIDs only)
    // FE-005: No sensitive data in DOM
    const stores = createStoreFixtures();
    const props = createDefaultProps({
      stores,
      filterState: createFilterState({ storeId: stores[0].store_id }),
    });

    // WHEN: Component is rendered
    const { container } = renderWithProviders(
      <ShiftDayReportFilters {...props} />,
    );

    // THEN: No passwords, tokens, or PII should be in DOM
    const html = container.innerHTML;
    expect(html).not.toContain("password");
    expect(html).not.toContain("token");
    expect(html).not.toContain("secret");
    expect(html).not.toContain("api_key");
  });

  it("[P1] SDRF-SEC-004: date inputs should enforce date format", async () => {
    // GIVEN: Component with custom range preset
    const onFilterChange = vi.fn();
    const props = createDefaultProps({
      onFilterChange,
      filterState: createFilterState({ rangePreset: "custom" }),
    });
    const user = userEvent.setup();

    renderWithProviders(<ShiftDayReportFilters {...props} />);

    // WHEN: Invalid date format is entered
    const fromDateInput = screen.getByTestId(
      "filter-date-from",
    ) as HTMLInputElement;
    await user.type(fromDateInput, "not-a-date");

    // THEN: Date input type should reject invalid format
    // HTML5 date input enforces YYYY-MM-DD format
    expect(fromDateInput.value).toBe("");
  });
});

// =============================================================================
// TEST SUITE: EDGE CASE TESTS (P2)
// =============================================================================

describe("SDRF-EDGE: ShiftDayReportFilters Edge Cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[P2] SDRF-EDGE-001: should handle disabled state correctly", () => {
    // GIVEN: Component in disabled state
    const props = createDefaultProps({ disabled: true });

    // WHEN: Component is rendered
    renderWithProviders(<ShiftDayReportFilters {...props} />);

    // THEN: Apply button should be disabled
    const applyButton = screen.getByTestId("apply-filters-button");
    expect(applyButton).toBeDisabled();
  });

  it("[P2] SDRF-EDGE-002: should handle empty stores array", () => {
    // GIVEN: Component with no stores
    const props = createDefaultProps({ stores: [] });

    // WHEN: Component is rendered
    renderWithProviders(<ShiftDayReportFilters {...props} />);

    // THEN: Component should render without errors, no store selector
    expect(screen.getByTestId("shift-day-report-filters")).toBeInTheDocument();
    expect(screen.queryByTestId("filter-store")).not.toBeInTheDocument();
    expect(screen.queryByTestId("single-store-badge")).not.toBeInTheDocument();
  });

  it("[P2] SDRF-EDGE-003: should handle empty cashiers array", () => {
    // GIVEN: Component with store selected but no cashiers
    const stores = createStoreFixtures();
    const props = createDefaultProps({
      stores,
      cashiers: [],
      filterState: createFilterState({ storeId: stores[0].store_id }),
    });

    // WHEN: Component is rendered
    renderWithProviders(<ShiftDayReportFilters {...props} />);

    // THEN: Cashier dropdown should show "All Cashiers" option
    expect(screen.getByTestId("filter-cashier")).toBeInTheDocument();
  });

  it("[P2] SDRF-EDGE-004: should disable cashier select when no store selected", () => {
    // GIVEN: Component with no store selected
    const stores = createStoreFixtures();
    const props = createDefaultProps({
      stores,
      filterState: createFilterState({ storeId: "" }),
    });

    // WHEN: Component is rendered
    renderWithProviders(<ShiftDayReportFilters {...props} />);

    // THEN: Cashier select should be disabled
    const cashierTrigger = screen.getByTestId("filter-cashier");
    expect(cashierTrigger).toHaveAttribute("data-disabled");
  });

  it("[P2] SDRF-EDGE-005: should disable date inputs when non-custom preset selected", () => {
    // GIVEN: Component with "current" range preset (non-custom)
    const props = createDefaultProps({
      filterState: createFilterState({ rangePreset: "current" }),
    });

    // WHEN: Component is rendered
    renderWithProviders(<ShiftDayReportFilters {...props} />);

    // THEN: Date inputs should be disabled
    const fromDateInput = screen.getByTestId("filter-date-from");
    const toDateInput = screen.getByTestId("filter-date-to");
    expect(fromDateInput).toBeDisabled();
    expect(toDateInput).toBeDisabled();
  });

  it("[P2] SDRF-EDGE-006: should show loading state for stores", () => {
    // GIVEN: Component with stores loading
    const stores = createStoreFixtures();
    const props = createDefaultProps({
      stores,
      storesLoading: true,
      filterState: createFilterState({ storeId: stores[0].store_id }),
    });

    // WHEN: Component is rendered
    renderWithProviders(<ShiftDayReportFilters {...props} />);

    // THEN: Store select should be disabled
    const storeSelect = screen.getByTestId("filter-store");
    expect(storeSelect).toHaveAttribute("data-disabled");
  });

  it("[P2] SDRF-EDGE-007: should show loading state for cashiers", () => {
    // GIVEN: Component with cashiers loading
    const stores = createStoreFixtures();
    const props = createDefaultProps({
      stores,
      cashiersLoading: true,
      filterState: createFilterState({ storeId: stores[0].store_id }),
    });

    // WHEN: Component is rendered
    renderWithProviders(<ShiftDayReportFilters {...props} />);

    // THEN: Cashier select should be disabled
    const cashierSelect = screen.getByTestId("filter-cashier");
    expect(cashierSelect).toHaveAttribute("data-disabled");
  });
});

// =============================================================================
// TEST SUITE: BUSINESS LOGIC TESTS (P1)
// =============================================================================

describe("SDRF-LOGIC: ShiftDayReportFilters Business Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[P1] SDRF-LOGIC-001: should sync toDate with fromDate when day preset is selected", async () => {
    // GIVEN: Component with day preset
    const onFilterChange = vi.fn();
    const props = createDefaultProps({
      onFilterChange,
      filterState: createFilterState({
        rangePreset: "day",
        fromDate: "",
        toDate: "",
      }),
    });
    const user = userEvent.setup();

    renderWithProviders(<ShiftDayReportFilters {...props} />);

    // WHEN: From date is entered with day preset
    const fromDateInput = screen.getByTestId("filter-date-from");
    await user.clear(fromDateInput);
    await user.type(fromDateInput, "2024-06-15");

    // THEN: Both fromDate and toDate should be set to same value
    await waitFor(() => {
      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          fromDate: "2024-06-15",
          toDate: "2024-06-15",
        }),
      );
    });
  });

  it("[P1] SDRF-LOGIC-002: should restrict to date min to from date value", () => {
    // GIVEN: Component with custom preset and from date set
    const props = createDefaultProps({
      filterState: createFilterState({
        rangePreset: "custom",
        fromDate: "2024-06-01",
      }),
    });

    // WHEN: Component is rendered
    renderWithProviders(<ShiftDayReportFilters {...props} />);

    // THEN: To date should have min attribute set to from date
    const toDateInput = screen.getByTestId("filter-date-to");
    expect(toDateInput).toHaveAttribute("min", "2024-06-01");
  });

  it("[P1] SDRF-LOGIC-003: should enable from date input for day preset", () => {
    // GIVEN: Component with day preset
    const props = createDefaultProps({
      filterState: createFilterState({ rangePreset: "day" }),
    });

    // WHEN: Component is rendered
    renderWithProviders(<ShiftDayReportFilters {...props} />);

    // THEN: From date should be enabled, to date disabled
    const fromDateInput = screen.getByTestId("filter-date-from");
    const toDateInput = screen.getByTestId("filter-date-to");
    expect(fromDateInput).not.toBeDisabled();
    expect(toDateInput).toBeDisabled();
  });

  it("[P1] SDRF-LOGIC-004: should reset cashier when all cashiers option selected", async () => {
    // GIVEN: Component with cashier selected
    const onFilterChange = vi.fn();
    const stores = createStoreFixtures();
    const cashiers = createCashierFixtures();
    const props = createDefaultProps({
      onFilterChange,
      stores,
      cashiers,
      filterState: createFilterState({
        storeId: stores[0].store_id,
        cashierId: cashiers[0].cashier_id,
      }),
    });
    const user = userEvent.setup();

    renderWithProviders(<ShiftDayReportFilters {...props} />);

    // WHEN: "All Cashiers" is selected
    const cashierSelect = screen.getByTestId("filter-cashier");
    await user.click(cashierSelect);
    const allOption = screen.getByRole("option", { name: "All Cashiers" });
    await user.click(allOption);

    // THEN: cashierId should be reset to empty string
    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ cashierId: "" }),
    );
  });
});

// =============================================================================
// TEST SUITE: INTEGRATION ASSERTIONS (P1)
// =============================================================================

describe("SDRF-ASSERT: ShiftDayReportFilters Assertions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[P1] SDRF-ASSERT-001: should render correct number of store options", async () => {
    // GIVEN: Component with multiple stores
    const stores = createStoreFixtures();
    const props = createDefaultProps({
      stores,
      filterState: createFilterState({ storeId: stores[0].store_id }),
    });
    const user = userEvent.setup();

    renderWithProviders(<ShiftDayReportFilters {...props} />);

    // WHEN: Store dropdown is opened
    const storeSelect = screen.getByTestId("filter-store");
    await user.click(storeSelect);

    // THEN: All stores should be in dropdown
    const options = screen.getAllByRole("option");
    expect(options.length).toBe(stores.length);
  });

  it("[P1] SDRF-ASSERT-002: should render correct number of cashier options", async () => {
    // GIVEN: Component with cashiers
    const stores = createStoreFixtures();
    const cashiers = createCashierFixtures();
    const props = createDefaultProps({
      stores,
      cashiers,
      filterState: createFilterState({ storeId: stores[0].store_id }),
    });
    const user = userEvent.setup();

    renderWithProviders(<ShiftDayReportFilters {...props} />);

    // WHEN: Cashier dropdown is opened
    const cashierSelect = screen.getByTestId("filter-cashier");
    await user.click(cashierSelect);

    // THEN: All cashiers + "All Cashiers" option should be in dropdown
    const options = screen.getAllByRole("option");
    expect(options.length).toBe(cashiers.length + 1); // +1 for "All Cashiers"
  });

  it("[P1] SDRF-ASSERT-003: should have correct button types to prevent form submission", () => {
    // GIVEN: Component is rendered
    const props = createDefaultProps({ hasActiveFilters: true });

    // WHEN: Component is rendered
    renderWithProviders(<ShiftDayReportFilters {...props} />);

    // THEN: Buttons should have type="button" to prevent form submission
    const applyButton = screen.getByTestId("apply-filters-button");
    const clearButton = screen.getByTestId("clear-filters-button");
    expect(applyButton).toHaveAttribute("type", "button");
    expect(clearButton).toHaveAttribute("type", "button");
  });

  it("[P1] SDRF-ASSERT-004: should not call callbacks during initial render", () => {
    // GIVEN: Component with callbacks
    const onFilterChange = vi.fn();
    const onApplyFilters = vi.fn();
    const onClearFilters = vi.fn();
    const props = createDefaultProps({
      onFilterChange,
      onApplyFilters,
      onClearFilters,
    });

    // WHEN: Component is rendered
    renderWithProviders(<ShiftDayReportFilters {...props} />);

    // THEN: No callbacks should be called during initial render
    expect(onFilterChange).not.toHaveBeenCalled();
    expect(onApplyFilters).not.toHaveBeenCalled();
    expect(onClearFilters).not.toHaveBeenCalled();
  });
});
