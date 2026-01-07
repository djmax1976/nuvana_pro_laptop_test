"use client";

/**
 * Shift & Day Report List Component
 *
 * Unified accordion view for shifts and day summaries with comprehensive filtering.
 * Day Summaries are displayed as parent accordion rows with their associated
 * Shifts as collapsible children (always expanded by default).
 *
 * Store Selection Logic:
 * - Single store: Auto-selected, no dropdown shown (badge displayed instead)
 * - Multiple stores: Dropdown shown, user must select
 *
 * Enterprise Standards Applied:
 * - SEC-014: INPUT_VALIDATION - All filter inputs validated via Zod schemas
 * - FE-002: FORM_VALIDATION - Client-side validation with clear error states
 * - API-001: VALIDATION - Query parameters validated before API calls
 * - SEC-004: XSS - All displayed values escaped through React's default behavior
 * - FE-005: UI_SECURITY - No sensitive data exposed in DOM
 * - FE-020: REACT_OPTIMIZATION - Memoized callbacks and derived data
 *
 * Story: Unified Shift & Day Report View
 */

import * as React from "react";
import {
  useShifts,
  type ShiftResponse,
  type ShiftQueryFilters,
  type PaginationOptions,
} from "@/lib/api/shifts";
import { useDaySummaries, type DaySummary } from "@/lib/api/day-summaries";
import { useCashiers } from "@/lib/api/cashiers";
import { useClientDashboard } from "@/lib/api/client-dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, RefreshCw, Clock, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShiftDayReportFilters } from "./ShiftDayReportFilters";
import { DayShiftAccordion } from "./DayShiftAccordion";
import {
  transformToAccordionItems,
  type DayAccordionItem,
  type DayShiftItem,
  type TransformAccordionOptions,
} from "./types/day-shift-accordion.types";
import { useStoreTimezone } from "@/contexts/StoreContext";
import {
  type FilterFormState,
  DEFAULT_FILTER_STATE,
} from "@/lib/schemas/shift-day-filters.schema";

/**
 * Props for ShiftList component
 */
interface ShiftListProps {
  /** Store ID to filter by (required for API calls) */
  storeId?: string;

  /** External filters (legacy support) */
  filters?: ShiftQueryFilters;

  /** Pagination options */
  pagination?: PaginationOptions;

  /** Callback when a shift row is clicked */
  onShiftClick?: (shift: ShiftResponse) => void;

  /** Callback when a day summary row is clicked */
  onDaySummaryClick?: (daySummary: DaySummary) => void;

  /** Callback when filters change (legacy support) */
  onFiltersChange?: (filters: ShiftQueryFilters) => void;

  /** Callback when pagination meta changes */
  onMetaChange?: (meta: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  }) => void;
}

/**
 * Convert date to ISO string (YYYY-MM-DD) for date input
 * SEC-014: Validates date format before conversion
 */
function toDateInputValue(date?: string): string {
  if (!date) return "";
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) {
      return "";
    }
    return d.toISOString().split("T")[0];
  } catch {
    return "";
  }
}

/**
 * Convert date input value (YYYY-MM-DD) to ISO 8601 datetime string (start of day UTC)
 * Used for "from" date filters
 */
function fromDateInputValue(dateString: string): string | undefined {
  if (!dateString) return undefined;
  const dateRegex = /^(\d{4})-(\d{2})-(\d{2})$/;
  const match = dateString.match(dateRegex);
  if (!match) return undefined;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return undefined;
  }
  return utcDate.toISOString();
}

/**
 * Convert date input value (YYYY-MM-DD) to ISO 8601 datetime string (end of day UTC)
 * Used for "to" date filters to include all records from that day
 * Sets time to 23:59:59.999 UTC
 */
function toDateInputValueEndOfDay(dateString: string): string | undefined {
  if (!dateString) return undefined;
  const dateRegex = /^(\d{4})-(\d{2})-(\d{2})$/;
  const match = dateString.match(dateRegex);
  if (!match) return undefined;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  // Set to end of day: 23:59:59.999 UTC
  const utcDate = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return undefined;
  }
  return utcDate.toISOString();
}

/**
 * ShiftList Component
 *
 * Displays a unified table of shifts or day summaries based on filter selection.
 */
export function ShiftList({
  storeId,
  filters,
  pagination,
  onShiftClick,
  onDaySummaryClick,
  onFiltersChange,
  onMetaChange,
}: ShiftListProps) {
  // Get store timezone from context for correct "today" detection
  // SEC-014: Required for timezone-aware date calculations
  const storeTimezone = useStoreTimezone();

  // Fetch client dashboard data to get available stores
  const { data: dashboardData, isLoading: dashboardLoading } =
    useClientDashboard();

  // Extract stores from dashboard data
  const stores = React.useMemo(() => {
    return dashboardData?.stores || [];
  }, [dashboardData?.stores]);

  // Filter form state (new unified filters)
  const [filterState, setFilterState] = React.useState<FilterFormState>(() => ({
    ...DEFAULT_FILTER_STATE,
    storeId: storeId || filters?.store_id || "",
    fromDate: toDateInputValue(filters?.from),
    toDate: toDateInputValue(filters?.to),
  }));

  // Applied filters (what's actually sent to API)
  const [appliedFilters, setAppliedFilters] =
    React.useState<FilterFormState>(filterState);

  // Validation error for filters
  const [filterValidationError, setFilterValidationError] = React.useState<
    string | null
  >(null);

  /**
   * Auto-select store when there's only one store available
   * SEC-014: Store ID validated via UUID schema in FilterFormState
   */
  React.useEffect(() => {
    if (stores.length === 1 && !filterState.storeId) {
      const singleStore = stores[0];
      setFilterState((prev) => ({
        ...prev,
        storeId: singleStore.store_id,
      }));
      setAppliedFilters((prev) => ({
        ...prev,
        storeId: singleStore.store_id,
      }));
    }
  }, [stores, filterState.storeId]);

  // Derive effective store ID from filter state (prioritize filter state)
  const effectiveStoreId =
    appliedFilters.storeId || storeId || filters?.store_id;

  // Fetch cashiers for the selected store (only when store is selected)
  const { data: cashiers, isLoading: cashiersLoading } = useCashiers(
    effectiveStoreId || undefined,
    { is_active: true },
    { enabled: !!effectiveStoreId },
  );

  // Build shift query filters from applied filter state
  // Note: toDate uses end-of-day (23:59:59.999) to include all shifts opened on that day
  const shiftQueryFilters: ShiftQueryFilters = React.useMemo(() => {
    const queryFilters: ShiftQueryFilters = {};

    if (effectiveStoreId) {
      queryFilters.store_id = effectiveStoreId;
    }

    if (appliedFilters.fromDate) {
      queryFilters.from = fromDateInputValue(appliedFilters.fromDate);
    }

    if (appliedFilters.toDate) {
      // Use end-of-day for "to" date to include all shifts opened on that day
      queryFilters.to = toDateInputValueEndOfDay(appliedFilters.toDate);
    }

    return queryFilters;
  }, [effectiveStoreId, appliedFilters.fromDate, appliedFilters.toDate]);

  /**
   * Determine which data sources to use based on report type
   * SEC-014: Report type validated via Zod schema
   *
   * Report type logic:
   * - "all" (default): Show both shifts AND day summaries in a unified view
   * - "shift": Show only shift records
   * - "day": Show only day summaries
   */
  const isAllView =
    appliedFilters.reportType === "all" || appliedFilters.reportType === "";
  const isShiftView = appliedFilters.reportType === "shift" || isAllView;
  const isDayView = appliedFilters.reportType === "day" || isAllView;

  // Fetch shifts data (when report type is "shift" or not selected)
  const {
    data: shiftsData,
    isLoading: shiftsLoading,
    isError: shiftsError,
    error: shiftsErrorObj,
    refetch: refetchShifts,
  } = useShifts(shiftQueryFilters, pagination, {
    enabled: isShiftView && !!shiftQueryFilters.store_id,
  });

  // Fetch day summaries data (when report type is "day")
  const {
    data: daySummariesData,
    isLoading: daySummariesLoading,
    isError: daySummariesError,
    error: daySummariesErrorObj,
    refetch: refetchDaySummaries,
  } = useDaySummaries(
    shiftQueryFilters.store_id || null,
    {
      start_date: appliedFilters.fromDate || undefined,
      end_date: appliedFilters.toDate || undefined,
    },
    { enabled: isDayView && !!shiftQueryFilters.store_id },
  );

  // Notify parent of meta changes (shifts only for now)
  React.useEffect(() => {
    if (shiftsData?.meta && onMetaChange && isShiftView) {
      onMetaChange(shiftsData.meta);
    }
  }, [shiftsData?.meta, onMetaChange, isShiftView]);

  // Update filter state when external filters change
  React.useEffect(() => {
    if (filters) {
      setFilterState((prev) => ({
        ...prev,
        fromDate: toDateInputValue(filters.from),
        toDate: toDateInputValue(filters.to),
      }));
    }
  }, [filters]);

  /**
   * Apply current filter state to API queries
   * SEC-014: Validates required fields before applying
   */
  const handleApplyFilters = React.useCallback(() => {
    // Clear any previous validation error
    setFilterValidationError(null);

    // Validate: "Day" range preset requires a date to be selected
    if (filterState.rangePreset === "day" && !filterState.fromDate) {
      setFilterValidationError(
        "Please select a date when using the Day range preset.",
      );
      return;
    }

    // Validate: "Custom" range preset with partial dates should have at least one date
    // (Optional - allow custom without dates to show all data)

    setAppliedFilters(filterState);

    // Notify legacy callback if provided
    if (onFiltersChange) {
      const legacyFilters: ShiftQueryFilters = {};
      if (filterState.fromDate) {
        legacyFilters.from = fromDateInputValue(filterState.fromDate);
      }
      if (filterState.toDate) {
        legacyFilters.to = fromDateInputValue(filterState.toDate);
      }
      if (effectiveStoreId) {
        legacyFilters.store_id = effectiveStoreId;
      }
      onFiltersChange(legacyFilters);
    }
  }, [filterState, onFiltersChange, effectiveStoreId]);

  /**
   * Clear all filters to default state
   * Preserves storeId when there's only one store (auto-selected)
   */
  const handleClearFilters = React.useCallback(() => {
    // Clear validation error
    setFilterValidationError(null);

    // Preserve store selection when there's only one store (auto-selected)
    const preservedStoreId = stores.length === 1 ? stores[0].store_id : "";

    const clearedState: FilterFormState = {
      ...DEFAULT_FILTER_STATE,
      storeId: preservedStoreId,
    };
    setFilterState(clearedState);
    setAppliedFilters(clearedState);

    // Notify legacy callback
    if (onFiltersChange) {
      const clearedFilters: ShiftQueryFilters = {};
      if (preservedStoreId) {
        clearedFilters.store_id = preservedStoreId;
      }
      onFiltersChange(clearedFilters);
    }
  }, [onFiltersChange, stores]);

  /**
   * Check if any filters are active (different from default state)
   * "all" is the default report type, "current" is the default range preset
   * SEC-014: Filter state validation against default values
   */
  const hasActiveFilters =
    (appliedFilters.reportType !== "all" && appliedFilters.reportType !== "") ||
    appliedFilters.cashierId !== "" ||
    appliedFilters.rangePreset !== "current" ||
    appliedFilters.fromDate !== "" ||
    appliedFilters.toDate !== "";

  /**
   * Determine loading and error states based on current view
   * For "all" view, we need both data sources to be ready
   */
  const isLoading = isAllView
    ? shiftsLoading || daySummariesLoading
    : isShiftView && !isDayView
      ? shiftsLoading
      : daySummariesLoading;

  const isError = isAllView
    ? shiftsError || daySummariesError
    : isShiftView && !isDayView
      ? shiftsError
      : daySummariesError;

  const error = isAllView
    ? shiftsErrorObj || daySummariesErrorObj
    : isShiftView && !isDayView
      ? shiftsErrorObj
      : daySummariesErrorObj;

  /**
   * Refetch function for error recovery
   * For "all" view, refetch both data sources
   */
  const refetch = React.useCallback(() => {
    if (isAllView) {
      void refetchShifts();
      void refetchDaySummaries();
    } else if (isShiftView && !isDayView) {
      void refetchShifts();
    } else {
      void refetchDaySummaries();
    }
  }, [isAllView, isShiftView, isDayView, refetchShifts, refetchDaySummaries]);

  // Get data for current view - memoized to prevent reference changes
  // FE-020: Memoized for stable dependency in accordion items calculation
  const daySummaries = React.useMemo(
    () => daySummariesData || [],
    [daySummariesData],
  );

  // Filter shifts by cashier if selected
  // FE-020: Memoized for performance
  const filteredShifts = React.useMemo(() => {
    const shifts = shiftsData?.shifts || [];
    if (!appliedFilters.cashierId) {
      return shifts;
    }
    return shifts.filter(
      (shift) => shift.cashier_id === appliedFilters.cashierId,
    );
  }, [shiftsData?.shifts, appliedFilters.cashierId]);

  /**
   * Transform data into accordion items
   * FE-020: Memoized to prevent unnecessary recalculations
   *
   * Date Handling:
   * - Uses store timezone for "today" detection (not browser timezone)
   * - Correctly handles overnight operations where business days span midnight
   */
  const accordionItems = React.useMemo(() => {
    // SEC-014: Pass store timezone for correct date calculations
    const options: TransformAccordionOptions = {
      storeTimezone,
    };
    return transformToAccordionItems(daySummaries, filteredShifts, options);
  }, [daySummaries, filteredShifts, storeTimezone]);

  /**
   * Handle day accordion click - navigate to day summary detail
   * FE-002: Validates data before navigation
   */
  const handleDayAccordionClick = React.useCallback(
    (item: DayAccordionItem) => {
      if (onDaySummaryClick && item._originalDaySummary) {
        onDaySummaryClick(item._originalDaySummary);
      }
    },
    [onDaySummaryClick],
  );

  /**
   * Handle shift row click - navigate to shift detail
   * FE-002: Validates data before navigation
   */
  const handleShiftAccordionClick = React.useCallback(
    (shift: DayShiftItem) => {
      if (onShiftClick && shift._originalShift) {
        onShiftClick(shift._originalShift);
      }
    },
    [onShiftClick],
  );

  // Loading state (show when data is loading AND we have store selected)
  // Also show loading if dashboard is still loading
  if (dashboardLoading || isLoading) {
    return (
      <div className="space-y-4" data-testid="shift-list-loading">
        {/* Filters (show while loading) */}
        <ShiftDayReportFilters
          filterState={filterState}
          onFilterChange={setFilterState}
          stores={stores}
          storesLoading={dashboardLoading}
          cashiers={cashiers || []}
          cashiersLoading={cashiersLoading}
          onApplyFilters={handleApplyFilters}
          onClearFilters={handleClearFilters}
          hasActiveFilters={hasActiveFilters}
          disabled={dashboardLoading}
          validationError={filterValidationError}
        />

        {/* Accordion skeleton loading state */}
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              {/* Shift table skeleton */}
              <div className="ml-8 rounded-md border">
                <div className="p-3 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </div>
              {/* Day header skeleton */}
              <div className="flex items-center gap-4 p-4 rounded-lg border">
                <Skeleton className="h-5 w-5" />
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="space-y-4">
        {/* Filters */}
        <ShiftDayReportFilters
          filterState={filterState}
          onFilterChange={setFilterState}
          stores={stores}
          storesLoading={dashboardLoading}
          cashiers={cashiers || []}
          cashiersLoading={cashiersLoading}
          onApplyFilters={handleApplyFilters}
          onClearFilters={handleClearFilters}
          hasActiveFilters={hasActiveFilters}
          validationError={filterValidationError}
        />

        <div
          className="rounded-lg border border-destructive p-6"
          data-testid="shift-list-error"
        >
          <div className="flex items-center gap-2 text-destructive mb-4">
            <AlertCircle className="h-5 w-5" />
            <h3 className="font-semibold">
              Error Loading{" "}
              {isAllView
                ? "Reports"
                : isDayView && !isShiftView
                  ? "Day Summaries"
                  : "Shifts"}
            </h3>
          </div>
          <p className="text-muted-foreground mb-4">
            {error instanceof Error
              ? error.message
              : `Failed to load ${isAllView ? "reports" : isDayView && !isShiftView ? "day summaries" : "shifts"}. Please try again.`}
          </p>
          <Button variant="outline" onClick={refetch}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  /**
   * Determine if the view is empty
   * For unified accordion view, check if accordion items are empty
   */
  const isEmpty = accordionItems.length === 0;

  if (isEmpty) {
    return (
      <div className="space-y-4">
        {/* Filters */}
        <ShiftDayReportFilters
          filterState={filterState}
          onFilterChange={setFilterState}
          stores={stores}
          storesLoading={dashboardLoading}
          cashiers={cashiers || []}
          cashiersLoading={cashiersLoading}
          onApplyFilters={handleApplyFilters}
          onClearFilters={handleClearFilters}
          hasActiveFilters={hasActiveFilters}
          validationError={filterValidationError}
        />

        <div
          className="text-center py-12 border rounded-lg"
          data-testid="shift-list-empty"
        >
          <div className="flex justify-center gap-2 mb-4">
            <Clock className="h-10 w-10 text-muted-foreground" />
            <Calendar className="h-10 w-10 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">No Reports Found</h3>
          <p className="text-muted-foreground">
            {hasActiveFilters
              ? "No shift or day reports match your current filters."
              : "No shift or day reports available."}
          </p>
        </div>
      </div>
    );
  }

  // Render unified accordion view
  return (
    <div className="space-y-4" data-testid="shift-list-table">
      {/* Filters */}
      <ShiftDayReportFilters
        filterState={filterState}
        onFilterChange={setFilterState}
        stores={stores}
        storesLoading={dashboardLoading}
        cashiers={cashiers || []}
        cashiersLoading={cashiersLoading}
        onApplyFilters={handleApplyFilters}
        onClearFilters={handleClearFilters}
        hasActiveFilters={hasActiveFilters}
        validationError={filterValidationError}
      />

      {/* Unified Day-Shift Accordion View */}
      <DayShiftAccordion
        items={accordionItems}
        onDayClick={handleDayAccordionClick}
        onShiftClick={handleShiftAccordionClick}
        isLoading={false}
      />
    </div>
  );
}
