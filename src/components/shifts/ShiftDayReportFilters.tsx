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
 * Enterprise Standards Applied:
 * - SEC-014: INPUT_VALIDATION - All inputs validated via Zod schemas
 * - FE-002: FORM_VALIDATION - Client-side validation with clear error states
 * - SEC-004: XSS - All values sanitized through controlled inputs
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
   */
  const handleReportTypeChange = React.useCallback(
    (value: string) => {
      // "select" is the placeholder value, treat as empty
      const reportType = value === "select" ? "" : (value as ReportType | "");
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
   * Calculate grid columns based on whether store selector is shown
   * When store selector is shown: 6 columns on desktop
   * When store selector is hidden: 5 columns on desktop (show store name as info)
   */
  const gridClass = showStoreSelector
    ? "grid grid-cols-1 md:grid-cols-6 gap-4"
    : "grid grid-cols-1 md:grid-cols-5 gap-4";

  return (
    <div
      className="space-y-4 p-4 border rounded-lg"
      data-testid="shift-day-report-filters"
    >
      {/* Single store info badge (when only one store) */}
      {!showStoreSelector && selectedStoreName && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="font-medium">Store:</span>
          <span
            className="px-2 py-1 bg-primary/10 text-primary rounded-md font-medium"
            data-testid="single-store-badge"
          >
            {selectedStoreName}
          </span>
        </div>
      )}

      {/* Filter Row */}
      <div className={gridClass}>
        {/* Filter 0: Store (only shown when multiple stores) */}
        {showStoreSelector && (
          <div className="space-y-2">
            <Label htmlFor="filter-store">Store</Label>
            <Select
              value={filterState.storeId || ""}
              onValueChange={handleStoreChange}
              disabled={disabled || storesLoading}
            >
              <SelectTrigger id="filter-store" data-testid="filter-store">
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
          </div>
        )}

        {/* Filter 1: Report Type */}
        <div className="space-y-2">
          <Label htmlFor="filter-report-type">Report Type</Label>
          <Select
            value={filterState.reportType || "select"}
            onValueChange={handleReportTypeChange}
            disabled={disabled}
          >
            <SelectTrigger
              id="filter-report-type"
              data-testid="filter-report-type"
            >
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="select">Select</SelectItem>
              <SelectItem value="shift">Shift</SelectItem>
              <SelectItem value="day">Day</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Filter 2: Cashier */}
        <div className="space-y-2">
          <Label htmlFor="filter-cashier">Cashier</Label>
          <Select
            value={filterState.cashierId || "all"}
            onValueChange={handleCashierChange}
            disabled={disabled || cashiersLoading || !filterState.storeId}
          >
            <SelectTrigger id="filter-cashier" data-testid="filter-cashier">
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
        </div>

        {/* Filter 3: Range Preset */}
        <div className="space-y-2">
          <Label htmlFor="filter-range">Range</Label>
          <Select
            value={filterState.rangePreset}
            onValueChange={handleRangePresetChange}
            disabled={disabled}
          >
            <SelectTrigger id="filter-range" data-testid="filter-range">
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
        <div className="space-y-2">
          <Label htmlFor="filter-date-from">From Date</Label>
          <Input
            id="filter-date-from"
            type="date"
            value={filterState.fromDate}
            onChange={handleFromDateChange}
            disabled={isFromDateDisabled}
            max={today}
            data-testid="filter-date-from"
            className={isFromDateDisabled ? "bg-muted" : ""}
          />
        </div>

        {/* Filter 5: To Date */}
        <div className="space-y-2">
          <Label htmlFor="filter-date-to">To Date</Label>
          <Input
            id="filter-date-to"
            type="date"
            value={filterState.toDate}
            onChange={handleToDateChange}
            disabled={isToDateDisabled}
            min={filterState.fromDate || undefined}
            max={today}
            data-testid="filter-date-to"
            className={isToDateDisabled ? "bg-muted" : ""}
          />
        </div>
      </div>

      {/* Validation Error */}
      {validationError && (
        <div
          className="flex items-center gap-2 text-sm text-destructive"
          data-testid="filter-validation-error"
          role="alert"
        >
          <AlertCircle className="h-4 w-4" />
          <span>{validationError}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        <Button
          onClick={onApplyFilters}
          disabled={disabled}
          data-testid="apply-filters-button"
        >
          Apply Filters
        </Button>
        {hasActiveFilters && (
          <Button
            variant="outline"
            onClick={onClearFilters}
            disabled={disabled}
            data-testid="clear-filters-button"
          >
            Clear Filters
          </Button>
        )}
      </div>
    </div>
  );
}
