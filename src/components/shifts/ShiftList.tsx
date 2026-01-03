"use client";

/**
 * Shift & Day Report List Component
 *
 * Unified list view for shifts and day summaries with comprehensive filtering.
 * Supports filtering by store, report type (shift/day), cashier, and date range presets.
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  RefreshCw,
  Clock,
  AlertTriangle,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { ShiftStatusBadge } from "./ShiftStatusBadge";
import { ShiftDayReportFilters } from "./ShiftDayReportFilters";
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
 * Format timestamp for display
 * SEC-004: Output encoding handled by React
 */
function formatTimestamp(timestamp: string | null): string {
  if (!timestamp) return "—";
  try {
    const date = new Date(timestamp);
    return format(date, "MMM dd, yyyy HH:mm");
  } catch {
    return timestamp;
  }
}

/**
 * Format date for display (date only, no time)
 */
function formatDateOnly(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    const date = new Date(dateStr);
    return format(date, "MMM dd, yyyy");
  } catch {
    return dateStr;
  }
}

/**
 * Convert date to ISO string (YYYY-MM-DD) for date input
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

  // Determine which data source to use based on report type
  const isShiftView = appliedFilters.reportType !== "day";
  const isDayView = appliedFilters.reportType === "day";

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
   * "current" is the default range preset, so it's not considered an active filter
   */
  const hasActiveFilters =
    appliedFilters.reportType !== "" ||
    appliedFilters.cashierId !== "" ||
    appliedFilters.rangePreset !== "current" ||
    appliedFilters.fromDate !== "" ||
    appliedFilters.toDate !== "";

  // Determine loading and error states based on current view
  const isLoading = isShiftView ? shiftsLoading : daySummariesLoading;
  const isError = isShiftView ? shiftsError : daySummariesError;
  const error = isShiftView ? shiftsErrorObj : daySummariesErrorObj;
  const refetch = isShiftView ? refetchShifts : refetchDaySummaries;

  // Get data for current view
  const daySummaries = daySummariesData || [];

  // Filter shifts by cashier if selected
  const filteredShifts = React.useMemo(() => {
    const shifts = shiftsData?.shifts || [];
    if (!appliedFilters.cashierId) {
      return shifts;
    }
    return shifts.filter(
      (shift) => shift.cashier_id === appliedFilters.cashierId,
    );
  }, [shiftsData?.shifts, appliedFilters.cashierId]);

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

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Skeleton className="h-4 w-24" />
                </TableHead>
                <TableHead>
                  <Skeleton className="h-4 w-32" />
                </TableHead>
                <TableHead>
                  <Skeleton className="h-4 w-24" />
                </TableHead>
                <TableHead>
                  <Skeleton className="h-4 w-32" />
                </TableHead>
                <TableHead>
                  <Skeleton className="h-4 w-32" />
                </TableHead>
                <TableHead>
                  <Skeleton className="h-4 w-24" />
                </TableHead>
                <TableHead>
                  <Skeleton className="h-4 w-24" />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3, 4, 5].map((i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-5 w-28" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-24" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
              Error Loading {isDayView ? "Day Summaries" : "Shifts"}
            </h3>
          </div>
          <p className="text-muted-foreground mb-4">
            {error instanceof Error
              ? error.message
              : `Failed to load ${isDayView ? "day summaries" : "shifts"}. Please try again.`}
          </p>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // Empty state
  const isEmpty = isDayView
    ? daySummaries.length === 0
    : filteredShifts.length === 0;

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
          {isDayView ? (
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          ) : (
            <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          )}
          <h3 className="text-lg font-medium mb-2">
            No {isDayView ? "Day Summaries" : "Shifts"} Found
          </h3>
          <p className="text-muted-foreground">
            {hasActiveFilters
              ? `No ${isDayView ? "day summaries" : "shifts"} match your current filters.`
              : `No ${isDayView ? "day summaries" : "shifts"} available.`}
          </p>
        </div>
      </div>
    );
  }

  // Render table based on view type
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

      <div className="rounded-md border">
        {isDayView ? (
          // Day Summary Table
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business Date</TableHead>
                <TableHead>Shift Count</TableHead>
                <TableHead>Transactions</TableHead>
                <TableHead className="text-right">Gross Sales</TableHead>
                <TableHead className="text-right">Net Sales</TableHead>
                <TableHead className="text-right">Cash Variance</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {daySummaries.map((daySummary) => (
                <TableRow
                  key={daySummary.day_summary_id}
                  data-testid={`day-summary-row-${daySummary.day_summary_id}`}
                  className={
                    onDaySummaryClick ? "cursor-pointer hover:bg-muted/50" : ""
                  }
                  onClick={() => onDaySummaryClick?.(daySummary)}
                >
                  <TableCell className="font-medium">
                    {formatDateOnly(daySummary.business_date)}
                  </TableCell>
                  <TableCell>{daySummary.shift_count}</TableCell>
                  <TableCell>{daySummary.transaction_count}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(daySummary.gross_sales, "USD", "en-US")}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(daySummary.net_sales, "USD", "en-US")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span
                        className={
                          daySummary.total_cash_variance !== 0
                            ? daySummary.total_cash_variance > 0
                              ? "text-green-600"
                              : "text-destructive"
                            : ""
                        }
                      >
                        {formatCurrency(
                          Math.abs(daySummary.total_cash_variance),
                          "USD",
                          "en-US",
                        )}
                      </span>
                      {Math.abs(daySummary.total_cash_variance) > 0 && (
                        <AlertTriangle
                          className="h-3 w-3 text-amber-500"
                          aria-label="Variance present"
                        />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        daySummary.status === "CLOSED"
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                          : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300"
                      }`}
                    >
                      {daySummary.status}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          // Shift Table
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Shift ID</TableHead>
                <TableHead>Store</TableHead>
                <TableHead>Cashier</TableHead>
                <TableHead>Opened At</TableHead>
                <TableHead>Closed At</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Variance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredShifts.map((shift) => (
                <TableRow
                  key={shift.shift_id}
                  data-testid={`shift-list-row-${shift.shift_id}`}
                  data-cashier-id={shift.cashier_id}
                  className={
                    onShiftClick ? "cursor-pointer hover:bg-muted/50" : ""
                  }
                  onClick={() => onShiftClick?.(shift)}
                >
                  <TableCell className="font-medium">
                    {shift.shift_id.substring(0, 8)}...
                  </TableCell>
                  <TableCell>{shift.store_name || "Unknown"}</TableCell>
                  <TableCell>{shift.cashier_name || "Unknown"}</TableCell>
                  <TableCell>{formatTimestamp(shift.opened_at)}</TableCell>
                  <TableCell>{formatTimestamp(shift.closed_at)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ShiftStatusBadge
                        status={shift.status}
                        shiftId={shift.shift_id}
                      />
                      {shift.status === "VARIANCE_REVIEW" && (
                        <span title="Variance requires review">
                          <AlertTriangle
                            className="h-4 w-4 text-destructive"
                            data-testid={`variance-alert-badge-${shift.shift_id}`}
                            aria-label="Variance requires review"
                          />
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {shift.variance_amount !== null ? (
                      <div className="flex items-center gap-2">
                        <span>
                          {formatCurrency(
                            Math.abs(shift.variance_amount),
                            "USD",
                            "en-US",
                          )}
                        </span>
                        {shift.status === "VARIANCE_REVIEW" && (
                          <span title="Variance requires review">
                            <AlertTriangle
                              className="h-3 w-3 text-destructive"
                              aria-label="Variance requires review"
                            />
                          </span>
                        )}
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
