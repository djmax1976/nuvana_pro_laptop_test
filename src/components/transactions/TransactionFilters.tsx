"use client";

/**
 * Transaction Filters Component
 * Provides filtering controls for transactions (date range, shift, cashier)
 *
 * Story: 3.5 - Transaction Display UI
 */

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";
import type { TransactionQueryFilters } from "@/lib/api/transactions";

interface ShiftOption {
  shift_id: string;
  name: string;
}

interface CashierOption {
  cashier_id: string;
  name: string;
}

interface TransactionFiltersProps {
  filters?: TransactionQueryFilters;
  shifts?: ShiftOption[];
  cashiers?: CashierOption[];
  onFiltersChange: (filters: TransactionQueryFilters) => void;
}

/**
 * Convert date to ISO string (YYYY-MM-DD) for date input
 */
function toDateInputValue(date?: string): string {
  if (!date) return "";
  try {
    const d = new Date(date);
    // Check if date is invalid before calling toISOString()
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
 * Validates input strictly using regex and component checks to avoid timezone shifts
 * and reliably detect invalid dates (e.g., Feb 30, month 13, etc.)
 */
function fromDateInputValue(dateString: string): string | undefined {
  if (!dateString) return undefined;

  // Strict regex validation for YYYY-MM-DD format
  const dateRegex = /^(\d{4})-(\d{2})-(\d{2})$/;
  const match = dateString.match(dateRegex);

  if (!match) {
    return undefined;
  }

  // Extract components (match[0] is full match, 1-3 are groups)
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  // Validate component ranges
  if (month < 1 || month > 12) {
    return undefined;
  }

  if (day < 1 || day > 31) {
    return undefined;
  }

  // Create UTC date at midnight and verify components match
  // Date.UTC uses 0-indexed months, so month-1
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  // Verify the date components match (catches invalid dates like Feb 30, Apr 31, etc.)
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return undefined;
  }

  // Return UTC ISO datetime at midnight
  return utcDate.toISOString();
}

export function TransactionFilters({
  filters,
  shifts = [],
  cashiers = [],
  onFiltersChange,
}: TransactionFiltersProps) {
  const [fromDate, setFromDate] = useState<string>(
    toDateInputValue(filters?.from),
  );
  const [toDate, setToDate] = useState<string>(toDateInputValue(filters?.to));
  const [shiftId, setShiftId] = useState<string>(filters?.shift_id || "all");
  const [cashierId, setCashierId] = useState<string>(
    filters?.cashier_id || "all",
  );

  // Update local state when filters prop changes
  useEffect(() => {
    setFromDate(toDateInputValue(filters?.from));
    setToDate(toDateInputValue(filters?.to));
    setShiftId(filters?.shift_id || "all");
    setCashierId(filters?.cashier_id || "all");
  }, [filters]);

  const handleApplyFilters = () => {
    const newFilters: TransactionQueryFilters = {};

    if (fromDate) {
      newFilters.from = fromDateInputValue(fromDate);
    }
    if (toDate) {
      newFilters.to = fromDateInputValue(toDate);
    }
    if (shiftId && shiftId !== "all") {
      newFilters.shift_id = shiftId;
    }
    if (cashierId && cashierId !== "all") {
      newFilters.cashier_id = cashierId;
    }

    onFiltersChange(newFilters);
  };

  const handleClearFilters = () => {
    setFromDate("");
    setToDate("");
    setShiftId("all");
    setCashierId("all");
    onFiltersChange({});
  };

  const hasActiveFilters =
    fromDate ||
    toDate ||
    (shiftId && shiftId !== "all") ||
    (cashierId && cashierId !== "all");

  return (
    <div
      className="space-y-4 p-4 border rounded-lg"
      data-testid="transaction-filters"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Date Range - From */}
        <div className="space-y-2">
          <Label htmlFor="date-from">From Date</Label>
          <Input
            id="date-from"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            data-testid="date-range-picker-from"
          />
        </div>

        {/* Date Range - To */}
        <div className="space-y-2">
          <Label htmlFor="date-to">To Date</Label>
          <Input
            id="date-to"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            data-testid="date-range-picker-to"
            min={fromDate || undefined}
          />
        </div>

        {/* Shift Filter */}
        <div className="space-y-2">
          <Label htmlFor="shift-filter">Shift</Label>
          <Select value={shiftId} onValueChange={setShiftId}>
            <SelectTrigger id="shift-filter" data-testid="shift-filter-select">
              <SelectValue placeholder="All Shifts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Shifts</SelectItem>
              {shifts.map((shift) => (
                <SelectItem
                  key={shift.shift_id}
                  value={shift.shift_id}
                  data-testid={`shift-option-${shift.shift_id}`}
                >
                  {shift.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Cashier Filter */}
        <div className="space-y-2">
          <Label htmlFor="cashier-filter">Cashier</Label>
          <Select value={cashierId} onValueChange={setCashierId}>
            <SelectTrigger
              id="cashier-filter"
              data-testid="cashier-filter-select"
            >
              <SelectValue placeholder="All Cashiers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cashiers</SelectItem>
              {cashiers.map((cashier) => (
                <SelectItem
                  key={cashier.cashier_id}
                  value={cashier.cashier_id}
                  data-testid={`cashier-option-${cashier.cashier_id}`}
                >
                  {cashier.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        <Button onClick={handleApplyFilters} data-testid="apply-filters-button">
          Apply Filters
        </Button>
        {hasActiveFilters && (
          <Button
            variant="outline"
            onClick={handleClearFilters}
            data-testid="clear-filters-button"
          >
            <X className="h-4 w-4 mr-2" />
            Clear Filters
          </Button>
        )}
      </div>
    </div>
  );
}
