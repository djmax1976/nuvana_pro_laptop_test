"use client";

/**
 * Shift List Component
 * Displays a list of shifts in a table with filtering and pagination
 * Allows users to click shifts to view full details
 *
 * Story: 4.7 - Shift Management UI
 */

import {
  useShifts,
  type ShiftResponse,
  type ShiftQueryFilters,
  type PaginationOptions,
} from "@/lib/api/shifts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, RefreshCw, Clock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import * as React from "react";
import { ShiftStatusBadge } from "./ShiftStatusBadge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ShiftStatus } from "@/lib/api/shifts";

interface ShiftListProps {
  filters?: ShiftQueryFilters;
  pagination?: PaginationOptions;
  onShiftClick?: (shift: ShiftResponse) => void;
  onFiltersChange?: (filters: ShiftQueryFilters) => void;
  onMetaChange?: (meta: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  }) => void;
}

/**
 * Format timestamp for display
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
 * Convert date input value (YYYY-MM-DD) to ISO 8601 datetime string
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

export function ShiftList({
  filters,
  pagination,
  onShiftClick,
  onFiltersChange,
  onMetaChange,
}: ShiftListProps) {
  const [localFilters, setLocalFilters] = React.useState<ShiftQueryFilters>(
    filters || {},
  );
  const [statusFilter, setStatusFilter] = React.useState<string>(
    filters?.status || "all",
  );
  const [fromDate, setFromDate] = React.useState<string>(
    toDateInputValue(filters?.from),
  );
  const [toDate, setToDate] = React.useState<string>(
    toDateInputValue(filters?.to),
  );

  const { data, isLoading, isError, error, refetch } = useShifts(
    localFilters,
    pagination,
  );

  // Notify parent of meta changes
  React.useEffect(() => {
    if (data?.meta && onMetaChange) {
      onMetaChange(data.meta);
    }
  }, [data?.meta, onMetaChange]);

  // Update local filters when prop changes
  React.useEffect(() => {
    setLocalFilters(filters || {});
    setStatusFilter(filters?.status || "all");
    setFromDate(toDateInputValue(filters?.from));
    setToDate(toDateInputValue(filters?.to));
  }, [filters]);

  const handleApplyFilters = () => {
    const newFilters: ShiftQueryFilters = {};
    if (statusFilter && statusFilter !== "all") {
      newFilters.status = statusFilter as ShiftStatus;
    }
    if (fromDate) {
      newFilters.from = fromDateInputValue(fromDate);
    }
    if (toDate) {
      newFilters.to = fromDateInputValue(toDate);
    }
    if (filters?.store_id) {
      newFilters.store_id = filters.store_id;
    }
    setLocalFilters(newFilters);
    onFiltersChange?.(newFilters);
  };

  const handleClearFilters = () => {
    setStatusFilter("all");
    setFromDate("");
    setToDate("");
    const clearedFilters: ShiftQueryFilters = {};
    if (filters?.store_id) {
      clearedFilters.store_id = filters.store_id;
    }
    setLocalFilters(clearedFilters);
    onFiltersChange?.(clearedFilters);
  };

  const hasActiveFilters = statusFilter !== "all" || fromDate || toDate;

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="shift-list-loading">
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
      <div
        className="rounded-lg border border-destructive p-6"
        data-testid="shift-list-error"
      >
        <div className="flex items-center gap-2 text-destructive mb-4">
          <AlertCircle className="h-5 w-5" />
          <h3 className="font-semibold">Error Loading Shifts</h3>
        </div>
        <p className="text-muted-foreground mb-4">
          {error instanceof Error
            ? error.message
            : "Failed to load shifts. Please try again."}
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  // Empty state
  if (!data || !data.shifts || data.shifts.length === 0) {
    return (
      <div className="space-y-4">
        {/* Filters */}
        <div
          className="space-y-4 p-4 border rounded-lg"
          data-testid="shift-filters-container"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="shift-filter-status">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger
                  id="shift-filter-status"
                  data-testid="shift-filter-status"
                >
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="OPEN">Open</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="CLOSING">Closing</SelectItem>
                  <SelectItem value="RECONCILING">Reconciling</SelectItem>
                  <SelectItem value="CLOSED">Closed</SelectItem>
                  <SelectItem value="VARIANCE_REVIEW">
                    Variance Review
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="shift-filter-date-from">From Date</Label>
              <Input
                id="shift-filter-date-from"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                data-testid="shift-filter-date-from"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shift-filter-date-to">To Date</Label>
              <Input
                id="shift-filter-date-to"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                data-testid="shift-filter-date-to"
                min={fromDate || undefined}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleApplyFilters}>Apply Filters</Button>
            {hasActiveFilters && (
              <Button variant="outline" onClick={handleClearFilters}>
                Clear Filters
              </Button>
            )}
          </div>
        </div>

        <div
          className="text-center py-12 border rounded-lg"
          data-testid="shift-list-empty"
        >
          <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Shifts Found</h3>
          <p className="text-muted-foreground">
            {hasActiveFilters
              ? "No shifts match your current filters."
              : "No shifts available."}
          </p>
        </div>
      </div>
    );
  }

  // Render shift table
  return (
    <div className="space-y-4" data-testid="shift-list-table">
      {/* Filters */}
      <div
        className="space-y-4 p-4 border rounded-lg"
        data-testid="shift-filters-container"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="shift-filter-status">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger
                id="shift-filter-status"
                data-testid="shift-filter-status"
              >
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="OPEN">Open</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="CLOSING">Closing</SelectItem>
                <SelectItem value="RECONCILING">Reconciling</SelectItem>
                <SelectItem value="CLOSED">Closed</SelectItem>
                <SelectItem value="VARIANCE_REVIEW">Variance Review</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="shift-filter-date-from">From Date</Label>
            <Input
              id="shift-filter-date-from"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              data-testid="shift-filter-date-from"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="shift-filter-date-to">To Date</Label>
            <Input
              id="shift-filter-date-to"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              data-testid="shift-filter-date-to"
              min={fromDate || undefined}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleApplyFilters}>Apply Filters</Button>
          {hasActiveFilters && (
            <Button variant="outline" onClick={handleClearFilters}>
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-md border">
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
            {data.shifts.map((shift) => (
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
      </div>
    </div>
  );
}
