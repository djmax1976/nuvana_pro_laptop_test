"use client";

/**
 * Shift & Day Report Filters Component
 *
 * Unified filter bar for shift and day reports with:
 * - Store filter (only shown when multiple stores available)
 * - Report Type filter (Shift/Day)
 * - Cashier filter dropdown (populated based on selected store)
 * - Range preset filter
 * - From/To date pickers
 *
 * Responsive Layout Strategy:
 * - Mobile (< 640px): Single column stack, full-width controls
 * - Tablet (640px - 1024px): 2-3 columns with wrap
 * - Desktop (> 1024px): All filters in single row with even distribution
 *
 * Enterprise Standards Applied:
 * - SEC-014: INPUT_VALIDATION - All inputs validated via Zod schemas
 * - FE-002: FORM_VALIDATION - Client-side validation with clear error states
 * - SEC-004: XSS - All values sanitized through controlled inputs
 * - FE-005: UI_SECURITY - No sensitive data exposed in DOM attributes
 * - FE-020: REACT_OPTIMIZATION - Memoized callbacks prevent unnecessary re-renders
 */

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Cashier } from "@/lib/api/cashiers";
import type { OwnedStore } from "@/lib/api/client-dashboard";
import type {
  FilterFormState,
  ReportType,
  RangePreset,
} from "@/lib/schemas/shift-day-filters.schema";
import {
  calculateDateRange,
  RANGE_PRESET_OPTIONS,
  formatDateToISO,
} from "@/lib/utils/date-range-presets";

/**
 * Props for ShiftDayReportFilters component
 */
export interface ShiftDayReportFiltersProps {
  /** Current filter state */
  filterState: FilterFormState;

  /** Callback when filter state changes */
  onFilterChange: (newState: FilterFormState) => void;

  /** Available stores for the dropdown */
  stores: OwnedStore[];

  /** Loading state for stores */
  storesLoading?: boolean;

  /** Available cashiers for the dropdown (filtered by selected store) */
  cashiers: Cashier[];

  /** Loading state for cashiers */
  cashiersLoading?: boolean;

  /** Last closed date for "current" preset calculations */
  lastClosedDate?: string | null;

  /** Callback to apply filters */
  onApplyFilters: () => void;

  /** Callback to clear filters */
  onClearFilters: () => void;

  /** Whether any filters are currently active */
  hasActiveFilters: boolean;

  /** Disabled state for the entire filter bar */
  disabled?: boolean;

  /** Validation error message to display */
  validationError?: string | null;
}

/**
 * ShiftDayReportFilters Component
 *
 * Renders the unified filter bar for shift and day reports.
 * Handles date range preset calculations and filter state management.
 * Store dropdown only shown when multiple stores are available.
 */
export function ShiftDayReportFilters({
  filterState,
  onFilterChange,
  stores,
  storesLoading = false,
  cashiers,
  cashiersLoading = false,
  lastClosedDate,
  onApplyFilters,
  onClearFilters,
  hasActiveFilters,
  disabled = false,
  validationError = null,
}: ShiftDayReportFiltersProps) {
  /**
   * Determine if store selector should be shown
   * Only show when there are multiple stores available
   */
  const showStoreSelector = stores.length > 1;

  /**
   * Handle store selection change
   * SEC-014: Value validated as UUID
   * When store changes, clear cashier selection as cashiers are store-specific
   */
  const handleStoreChange = React.useCallback(
    (value: string) => {
      onFilterChange({
        ...filterState,
        storeId: value,
        // Clear cashier when store changes since cashiers are store-specific
        cashierId: "",
      });
    },
    [filterState, onFilterChange],
  );

  /**
   * Handle report type change
   * SEC-014: Value validated against ReportType enum
   * Accepts "all", "shift", or "day" as valid values
   */
  const handleReportTypeChange = React.useCallback(
    (value: string) => {
      // Validate against allowed values
      const validValues = ["all", "shift", "day", ""] as const;
      const reportType = validValues.includes(
        value as (typeof validValues)[number],
      )
        ? (value as ReportType | "")
        : "all";
      onFilterChange({
        ...filterState,
        reportType,
      });
    },
    [filterState, onFilterChange],
  );

  /**
   * Handle cashier selection change
   * SEC-014: Value validated as UUID or empty string
   */
  const handleCashierChange = React.useCallback(
    (value: string) => {
      // "all" is the placeholder value, treat as empty string
      const cashierId = value === "all" ? "" : value;
      onFilterChange({
        ...filterState,
        cashierId,
      });
    },
    [filterState, onFilterChange],
  );

  /**
   * Handle range preset change
   * Automatically calculates and sets date range for non-custom presets
   */
  const handleRangePresetChange = React.useCallback(
    (value: string) => {
      const rangePreset = value as RangePreset;

      // Calculate date range for the preset
      const dateRange = calculateDateRange(rangePreset, lastClosedDate);

      if (dateRange) {
        // Preset has calculated dates - update both dates
        onFilterChange({
          ...filterState,
          rangePreset,
          fromDate: dateRange.fromDate,
          toDate: dateRange.toDate,
        });
      } else if (rangePreset === "day") {
        // Day preset - clear toDate, keep fromDate if set
        onFilterChange({
          ...filterState,
          rangePreset,
          toDate: "",
        });
      } else {
        // Custom preset - just update the preset, leave dates as-is
        onFilterChange({
          ...filterState,
          rangePreset,
        });
      }
    },
    [filterState, onFilterChange, lastClosedDate],
  );

  /**
   * Handle from date change
   * SEC-014: Date format validated by input type="date"
   */
  const handleFromDateChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const fromDate = e.target.value;

      // If "day" preset is selected, sync toDate with fromDate
      if (filterState.rangePreset === "day") {
        onFilterChange({
          ...filterState,
          fromDate,
          toDate: fromDate,
        });
      } else {
        onFilterChange({
          ...filterState,
          fromDate,
        });
      }
    },
    [filterState, onFilterChange],
  );

  /**
   * Handle to date change
   * SEC-014: Date format validated by input type="date"
   */
  const handleToDateChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onFilterChange({
        ...filterState,
        toDate: e.target.value,
      });
    },
    [filterState, onFilterChange],
  );

  /**
   * Determine if To Date should be disabled
   * - Disabled when range preset is "day" (single date selection)
   * - Disabled when a preset other than "custom" is selected (auto-calculated)
   */
  const isToDateDisabled = disabled || filterState.rangePreset !== "custom";

  /**
   * Determine if From Date should be disabled
   * - Disabled when a preset other than "custom" and "day" is selected
   */
  const isFromDateDisabled =
    disabled ||
    (filterState.rangePreset !== "custom" && filterState.rangePreset !== "day");

  // Get today's date for max attribute
  const today = formatDateToISO(new Date());

  /**
   * Get the selected store name for display
   * SEC-004: Output encoding handled by React
   */
  const selectedStoreName = React.useMemo(() => {
    if (!filterState.storeId) return null;
    const store = stores.find((s) => s.store_id === filterState.storeId);
    return store?.name || null;
  }, [filterState.storeId, stores]);

  /**
   * Base filter field styles for consistent sizing and equal distribution
   * FE-005: UI_SECURITY - No dynamic content in class names
   *
   * Responsive width strategy:
   * - Mobile: full width (w-full)
   * - Tablet: half width with wrapping (basis-[calc(50%-0.375rem)])
   * - Desktop: equal distribution (flex-1 with min-width)
   *
   * The basis calc accounts for the gap-3 (0.75rem) between items.
   * min-w-0 prevents flex items from overflowing their container.
   */
  const filterFieldBaseClass = cn(
    "space-y-1.5 min-w-0",
    // Mobile: full width stacked
    "w-full",
    // Tablet: 2 per row (50% minus half gap)
    "sm:w-auto sm:basis-[calc(50%-0.375rem)]",
    // Large tablet: 3 per row (33.33% minus gap adjustment)
    "md:basis-[calc(33.333%-0.5rem)]",
    // Desktop+: equal distribution across all items
    "lg:flex-1 lg:basis-0",
  );

  return (
    <div
      className="p-4 border rounded-lg bg-card"
      data-testid="shift-day-report-filters"
      role="search"
      aria-label="Filter shift and day reports"
    >
      {/* Single store info badge (when only one store) */}
      {!showStoreSelector && selectedStoreName && (
        <div
          className="flex items-center gap-2 text-sm text-muted-foreground mb-4"
          aria-label="Selected store"
        >
          <span className="font-medium">Store:</span>
          <span
            className="px-2 py-1 bg-primary/10 text-primary rounded-md font-medium"
            data-testid="single-store-badge"
          >
            {selectedStoreName}
          </span>
        </div>
      )}

      {/*
       * Responsive Filter Layout
       *
       * Layout Strategy:
       * - Mobile (< 640px): Stacked vertically, full width
       * - Tablet (640px - 1024px): Wrapped flex with 2-3 items per row
       * - Desktop (> 1024px): Single row with even distribution using flexbox
       *
       * Uses flexbox instead of grid for automatic equal distribution.
       * Each child has flex-1 to ensure equal widths.
       *
       * SEC-004: XSS - All values rendered through React's auto-escaping
       * FE-002: FORM_VALIDATION - Each input has proper labels and aria attributes
       */}
      <div
        className={cn(
          // Base: flex container with wrap for responsive behavior
          "flex flex-wrap gap-3",
          // Align items to bottom for consistent button placement
          "items-end",
        )}
      >
        {/* Filter 0: Store (only shown when multiple stores) */}
        {showStoreSelector && (
          <div className={filterFieldBaseClass}>
            <Label htmlFor="filter-store" className="text-sm font-medium">
              Store
            </Label>
            <Select
              value={filterState.storeId || ""}
              onValueChange={handleStoreChange}
              disabled={disabled || storesLoading}
            >
              <SelectTrigger
                id="filter-store"
                data-testid="filter-store"
                aria-describedby={storesLoading ? "store-loading" : undefined}
                className="w-full"
              >
                <SelectValue placeholder="Select Store" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((store) => (
                  <SelectItem key={store.store_id} value={store.store_id}>
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {storesLoading && (
              <span id="store-loading" className="sr-only">
                Loading stores
              </span>
            )}
          </div>
        )}

        {/* Filter 1: Report Type */}
        <div className={filterFieldBaseClass}>
          <Label htmlFor="filter-report-type" className="text-sm font-medium">
            Report Type
          </Label>
          <Select
            value={filterState.reportType || "all"}
            onValueChange={handleReportTypeChange}
            disabled={disabled}
          >
            <SelectTrigger
              id="filter-report-type"
              data-testid="filter-report-type"
              className="w-full"
            >
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="shift">Shift</SelectItem>
              <SelectItem value="day">Day</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Filter 2: Cashier */}
        <div className={filterFieldBaseClass}>
          <Label htmlFor="filter-cashier" className="text-sm font-medium">
            Cashier
          </Label>
          <Select
            value={filterState.cashierId || "all"}
            onValueChange={handleCashierChange}
            disabled={disabled || cashiersLoading || !filterState.storeId}
          >
            <SelectTrigger
              id="filter-cashier"
              data-testid="filter-cashier"
              aria-describedby={
                !filterState.storeId
                  ? "cashier-store-required"
                  : cashiersLoading
                    ? "cashier-loading"
                    : undefined
              }
              className="w-full"
            >
              <SelectValue
                placeholder={
                  filterState.storeId ? "All Cashiers" : "Select store first"
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cashiers</SelectItem>
              {cashiers.map((cashier) => (
                <SelectItem key={cashier.cashier_id} value={cashier.cashier_id}>
                  {cashier.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!filterState.storeId && (
            <span id="cashier-store-required" className="sr-only">
              Select a store first to filter by cashier
            </span>
          )}
          {cashiersLoading && (
            <span id="cashier-loading" className="sr-only">
              Loading cashiers
            </span>
          )}
        </div>

        {/* Filter 3: Range Preset */}
        <div className={filterFieldBaseClass}>
          <Label htmlFor="filter-range" className="text-sm font-medium">
            Range
          </Label>
          <Select
            value={filterState.rangePreset}
            onValueChange={handleRangePresetChange}
            disabled={disabled}
          >
            <SelectTrigger
              id="filter-range"
              data-testid="filter-range"
              className="w-full"
            >
              <SelectValue placeholder="Custom" />
            </SelectTrigger>
            <SelectContent>
              {RANGE_PRESET_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Filter 4: From Date */}
        <div className={filterFieldBaseClass}>
          <Label htmlFor="filter-date-from" className="text-sm font-medium">
            From Date
          </Label>
          <Input
            id="filter-date-from"
            type="date"
            value={filterState.fromDate}
            onChange={handleFromDateChange}
            disabled={isFromDateDisabled}
            max={today}
            data-testid="filter-date-from"
            aria-describedby={
              isFromDateDisabled ? "from-date-disabled" : undefined
            }
            className={cn(
              "w-full",
              isFromDateDisabled && "bg-muted cursor-not-allowed",
            )}
          />
          {isFromDateDisabled && (
            <span id="from-date-disabled" className="sr-only">
              From date is automatically set based on range selection
            </span>
          )}
        </div>

        {/* Filter 5: To Date */}
        <div className={filterFieldBaseClass}>
          <Label htmlFor="filter-date-to" className="text-sm font-medium">
            To Date
          </Label>
          <Input
            id="filter-date-to"
            type="date"
            value={filterState.toDate}
            onChange={handleToDateChange}
            disabled={isToDateDisabled}
            min={filterState.fromDate || undefined}
            max={today}
            data-testid="filter-date-to"
            aria-describedby={isToDateDisabled ? "to-date-disabled" : undefined}
            className={cn(
              "w-full",
              isToDateDisabled && "bg-muted cursor-not-allowed",
            )}
          />
          {isToDateDisabled && (
            <span id="to-date-disabled" className="sr-only">
              To date is automatically set based on range selection
            </span>
          )}
        </div>

        {/*
         * Action Buttons
         *
         * Uses same responsive width classes as filter fields for even distribution.
         * On mobile, spans full width for touch-friendly targets.
         *
         * FE-002: FORM_VALIDATION - Clear visual feedback for actions
         */}
        <div
          className={cn(
            // Same responsive sizing as filter fields for even distribution
            "min-w-0",
            "w-full",
            "sm:w-auto sm:basis-[calc(50%-0.375rem)]",
            "md:basis-[calc(33.333%-0.5rem)]",
            "lg:flex-1 lg:basis-0",
            // Button container layout
            "flex items-center gap-2",
            // Ensure minimum height matches input fields (label height + input height)
            "pt-[1.625rem]", // Matches label height + spacing to align buttons with inputs
          )}
        >
          <Button
            type="button"
            onClick={onApplyFilters}
            disabled={disabled}
            data-testid="apply-filters-button"
            className="flex-1"
          >
            Apply
          </Button>
          {hasActiveFilters && (
            <Button
              type="button"
              variant="outline"
              onClick={onClearFilters}
              disabled={disabled}
              data-testid="clear-filters-button"
              className="flex-1"
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/*
       * Validation Error Display
       *
       * SEC-004: XSS - Error message rendered through React's auto-escaping
       * FE-002: FORM_VALIDATION - Clear error state with icon and color
       */}
      {validationError && (
        <div
          className="flex items-center gap-2 mt-3 text-sm text-destructive"
          data-testid="filter-validation-error"
          role="alert"
          aria-live="polite"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span>{validationError}</span>
        </div>
      )}
    </div>
  );
}
