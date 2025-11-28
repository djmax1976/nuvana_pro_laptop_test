/**
 * @test-level Component
 * @justification Component tests for TransactionFilters - validates filter controls and state management
 * @story 3-5-transaction-display-ui
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../support/test-utils";
import { TransactionFilters } from "@/components/transactions/TransactionFilters";
import userEvent from "@testing-library/user-event";

// Mock date-fns
vi.mock("date-fns", () => ({
  format: vi.fn((date: Date) => date.toISOString().split("T")[0]),
  parse: vi.fn(
    (dateString: string, formatString?: string, referenceDate?: Date) => {
      try {
        const parsed = new Date(dateString);
        // If parsing fails or results in invalid date, use referenceDate if provided
        if (isNaN(parsed.getTime()) && referenceDate) {
          return referenceDate;
        }
        return parsed;
      } catch {
        // If parsing throws, use referenceDate if provided, otherwise return invalid date
        return referenceDate || new Date(NaN);
      }
    },
  ),
}));

describe("3.5-COMPONENT: TransactionFilters Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[P0] 3.5-COMPONENT-010: should render date range picker filter", () => {
    // GIVEN: Component is rendered
    const onFiltersChange = vi.fn();
    renderWithProviders(
      <TransactionFilters onFiltersChange={onFiltersChange} />,
    );

    // THEN: Date range picker should be displayed
    expect(screen.getByTestId("date-range-picker-from")).toBeInTheDocument();
    expect(screen.getByTestId("date-range-picker-to")).toBeInTheDocument();
  });

  it("[P0] 3.5-COMPONENT-011: should render shift filter dropdown", () => {
    // GIVEN: Component is rendered
    const onFiltersChange = vi.fn();
    renderWithProviders(
      <TransactionFilters onFiltersChange={onFiltersChange} />,
    );

    // THEN: Shift filter dropdown should be displayed
    expect(screen.getByTestId("shift-filter-select")).toBeInTheDocument();
  });

  it("[P0] 3.5-COMPONENT-012: should render cashier filter dropdown", () => {
    // GIVEN: Component is rendered
    const onFiltersChange = vi.fn();
    renderWithProviders(
      <TransactionFilters onFiltersChange={onFiltersChange} />,
    );

    // THEN: Cashier filter dropdown should be displayed
    expect(screen.getByTestId("cashier-filter-select")).toBeInTheDocument();
  });

  it("[P0] 3.5-COMPONENT-013: should call onFiltersChange when date range is updated and applied", async () => {
    // GIVEN: Component is rendered
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <TransactionFilters onFiltersChange={onFiltersChange} />,
    );

    // WHEN: Date range is updated and Apply Filters is clicked
    const fromInput = screen.getByTestId("date-range-picker-from");
    const toInput = screen.getByTestId("date-range-picker-to");

    await user.type(fromInput, "2024-01-01");
    await user.type(toInput, "2024-01-31");

    const applyButton = screen.getByTestId("apply-filters-button");
    await user.click(applyButton);

    // THEN: onFiltersChange should be called with updated filters
    await waitFor(() => {
      expect(onFiltersChange).toHaveBeenCalled();
    });
  });

  it("[P0] 3.5-COMPONENT-014: should call onFiltersChange when shift filter is selected and applied", async () => {
    // GIVEN: Component is rendered with shift options
    const onFiltersChange = vi.fn();
    const shifts = [
      { shift_id: "shift-1", name: "Morning Shift" },
      { shift_id: "shift-2", name: "Evening Shift" },
    ];
    const user = userEvent.setup();
    renderWithProviders(
      <TransactionFilters onFiltersChange={onFiltersChange} shifts={shifts} />,
    );

    // WHEN: Shift filter is selected and Apply Filters is clicked
    const shiftSelect = screen.getByTestId("shift-filter-select");
    await user.click(shiftSelect);
    const shiftOption = screen.getByTestId("shift-option-shift-1");
    await user.click(shiftOption);

    const applyButton = screen.getByTestId("apply-filters-button");
    await user.click(applyButton);

    // THEN: onFiltersChange should be called with selected shift
    await waitFor(() => {
      expect(onFiltersChange).toHaveBeenCalledWith(
        expect.objectContaining({ shift_id: "shift-1" }),
      );
    });
  });

  it("[P0] 3.5-COMPONENT-015: should call onFiltersChange when cashier filter is selected and applied", async () => {
    // GIVEN: Component is rendered with cashier options
    const onFiltersChange = vi.fn();
    const cashiers = [
      { cashier_id: "cashier-1", name: "John Cashier" },
      { cashier_id: "cashier-2", name: "Jane Cashier" },
    ];
    const user = userEvent.setup();
    renderWithProviders(
      <TransactionFilters
        onFiltersChange={onFiltersChange}
        cashiers={cashiers}
      />,
    );

    // WHEN: Cashier filter is selected and Apply Filters is clicked
    const cashierSelect = screen.getByTestId("cashier-filter-select");
    await user.click(cashierSelect);
    const cashierOption = screen.getByTestId("cashier-option-cashier-1");
    await user.click(cashierOption);

    const applyButton = screen.getByTestId("apply-filters-button");
    await user.click(applyButton);

    // THEN: onFiltersChange should be called with selected cashier
    await waitFor(() => {
      expect(onFiltersChange).toHaveBeenCalledWith(
        expect.objectContaining({ cashier_id: "cashier-1" }),
      );
    });
  });

  it("[P0] 3.5-COMPONENT-016: should display clear filters button when filters are active", () => {
    // GIVEN: Component is rendered with active filters
    const onFiltersChange = vi.fn();
    renderWithProviders(
      <TransactionFilters
        onFiltersChange={onFiltersChange}
        filters={{ from: "2024-01-01T00:00:00Z" }}
      />,
    );

    // THEN: Clear filters button should be displayed
    expect(screen.getByTestId("clear-filters-button")).toBeInTheDocument();
  });

  it("[P0] 3.5-COMPONENT-017: should clear all filters when clear button is clicked", async () => {
    // GIVEN: Component is rendered with filters applied
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <TransactionFilters
        onFiltersChange={onFiltersChange}
        filters={{ from: "2024-01-01T00:00:00Z", shift_id: "shift-1" }}
      />,
    );

    // WHEN: Clear filters button is clicked
    const clearButton = screen.getByTestId("clear-filters-button");
    await user.click(clearButton);

    // THEN: onFiltersChange should be called with empty filters
    await waitFor(() => {
      expect(onFiltersChange).toHaveBeenCalledWith({});
    });
  });

  // ============================================================================
  // INPUT VALIDATION TESTS - Date Range Validation
  // ============================================================================

  it("[P1] 3.5-COMPONENT-VALID-001: should handle same date for from and to", async () => {
    // GIVEN: Component is rendered
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <TransactionFilters onFiltersChange={onFiltersChange} />,
    );

    // WHEN: Same date is set for from and to
    const fromInput = screen.getByTestId("date-range-picker-from");
    const toInput = screen.getByTestId("date-range-picker-to");
    const sameDate = "2024-01-15";

    await user.clear(fromInput);
    await user.type(fromInput, sameDate);
    await user.clear(toInput);
    await user.type(toInput, sameDate);

    const applyButton = screen.getByTestId("apply-filters-button");
    await user.click(applyButton);

    // THEN: Filters should be applied with same date (valid - single day range)
    await waitFor(() => {
      expect(onFiltersChange).toHaveBeenCalled();
      const callArgs = onFiltersChange.mock.calls[0][0];
      expect(callArgs.from).toBeDefined();
      expect(callArgs.to).toBeDefined();
    });
  });

  it("[P2] 3.5-COMPONENT-VALID-002: should handle empty date inputs gracefully", async () => {
    // GIVEN: Component is rendered with empty dates
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <TransactionFilters onFiltersChange={onFiltersChange} />,
    );

    // WHEN: Apply filters is clicked with empty dates
    const applyButton = screen.getByTestId("apply-filters-button");
    await user.click(applyButton);

    // THEN: onFiltersChange should be called with empty filters object
    await waitFor(() => {
      expect(onFiltersChange).toHaveBeenCalledWith({});
    });
  });

  // ============================================================================
  // EDGE CASES - Date Range Edge Cases
  // ============================================================================

  it("[P2] 3.5-COMPONENT-EDGE-001: should handle very old dates (1900-01-01)", async () => {
    // GIVEN: Component is rendered
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <TransactionFilters onFiltersChange={onFiltersChange} />,
    );

    // WHEN: Very old date is entered
    const fromInput = screen.getByTestId("date-range-picker-from");
    await user.clear(fromInput);
    await user.type(fromInput, "1900-01-01");

    const applyButton = screen.getByTestId("apply-filters-button");
    await user.click(applyButton);

    // THEN: Filter should be applied (validation happens at API level)
    await waitFor(() => {
      expect(onFiltersChange).toHaveBeenCalled();
    });
  });

  it("[P2] 3.5-COMPONENT-EDGE-002: should handle future dates", async () => {
    // GIVEN: Component is rendered
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <TransactionFilters onFiltersChange={onFiltersChange} />,
    );

    // WHEN: Future date is entered
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const futureDateString = futureDate.toISOString().split("T")[0];

    const fromInput = screen.getByTestId("date-range-picker-from");
    await user.clear(fromInput);
    await user.type(fromInput, futureDateString);

    const applyButton = screen.getByTestId("apply-filters-button");
    await user.click(applyButton);

    // THEN: Filter should be applied (validation happens at API level)
    await waitFor(() => {
      expect(onFiltersChange).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // SECURITY TESTS - Input Validation
  // ============================================================================

  it("[P2] 3.5-COMPONENT-001: should handle date input without errors", async () => {
    // GIVEN: Component is rendered
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <TransactionFilters onFiltersChange={onFiltersChange} />,
    );

    // WHEN: Valid date is entered
    const fromInput = screen.getByTestId(
      "date-range-picker-from",
    ) as HTMLInputElement;

    await user.clear(fromInput);
    await user.type(fromInput, "2024-01-01");

    const applyButton = screen.getByTestId("apply-filters-button");
    await user.click(applyButton);

    // THEN: Component should handle the input and apply filters without errors
    await waitFor(() => {
      expect(onFiltersChange).toHaveBeenCalled();
    });
    expect(fromInput).toBeInTheDocument();
  });

  // ============================================================================
  // ADDITIONAL ASSERTIONS - Filter State Management
  // ============================================================================

  it("[P2] 3.5-COMPONENT-ASSERT-001: should update local state when filters prop changes", () => {
    // GIVEN: Component is rendered with initial filters
    const onFiltersChange = vi.fn();
    const { rerender } = renderWithProviders(
      <TransactionFilters
        onFiltersChange={onFiltersChange}
        filters={{ from: "2024-01-01T00:00:00Z" }}
      />,
    );

    // WHEN: Filters prop is updated
    rerender(
      <TransactionFilters
        onFiltersChange={onFiltersChange}
        filters={{ from: "2024-02-01T00:00:00Z", shift_id: "shift-1" }}
      />,
    );

    // THEN: Local state should reflect new filters
    const fromInput = screen.getByTestId(
      "date-range-picker-from",
    ) as HTMLInputElement;
    expect(fromInput.value).toContain("2024-02");
  });

  it("[P2] 3.5-COMPONENT-ASSERT-002: should not call onFiltersChange until Apply is clicked", async () => {
    // GIVEN: Component is rendered
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <TransactionFilters onFiltersChange={onFiltersChange} />,
    );

    // WHEN: Date is changed but Apply is not clicked
    const fromInput = screen.getByTestId("date-range-picker-from");
    await user.type(fromInput, "2024-01-01");

    // THEN: onFiltersChange should not be called
    expect(onFiltersChange).not.toHaveBeenCalled();

    // WHEN: Apply Filters is clicked
    const applyButton = screen.getByTestId("apply-filters-button");
    await user.click(applyButton);

    // THEN: onFiltersChange should be called
    await waitFor(() => {
      expect(onFiltersChange).toHaveBeenCalled();
    });
  });

  it("[P2] 3.5-COMPONENT-ASSERT-003: should handle multiple filter combinations", async () => {
    // GIVEN: Component is rendered with all filter options
    const onFiltersChange = vi.fn();
    const user = userEvent.setup();
    const shifts = [{ shift_id: "shift-1", name: "Morning Shift" }];
    const cashiers = [{ cashier_id: "cashier-1", name: "John Cashier" }];

    renderWithProviders(
      <TransactionFilters
        onFiltersChange={onFiltersChange}
        shifts={shifts}
        cashiers={cashiers}
      />,
    );

    // WHEN: All filters are set and applied
    const fromInput = screen.getByTestId("date-range-picker-from");
    const toInput = screen.getByTestId("date-range-picker-to");
    await user.type(fromInput, "2024-01-01");
    await user.type(toInput, "2024-01-31");

    const shiftSelect = screen.getByTestId("shift-filter-select");
    await user.click(shiftSelect);
    const shiftOption = screen.getByTestId("shift-option-shift-1");
    await user.click(shiftOption);

    const cashierSelect = screen.getByTestId("cashier-filter-select");
    await user.click(cashierSelect);
    const cashierOption = screen.getByTestId("cashier-option-cashier-1");
    await user.click(cashierOption);

    const applyButton = screen.getByTestId("apply-filters-button");
    await user.click(applyButton);

    // THEN: onFiltersChange should be called with all filters
    await waitFor(() => {
      expect(onFiltersChange).toHaveBeenCalledWith(
        expect.objectContaining({
          from: expect.any(String),
          to: expect.any(String),
          shift_id: "shift-1",
          cashier_id: "cashier-1",
        }),
      );
    });
  });
});
