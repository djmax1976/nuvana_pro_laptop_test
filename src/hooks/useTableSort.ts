"use client";

import { useState, useMemo, useCallback } from "react";
import { SortDirection } from "@/components/ui/sortable-table-head";

export interface UseTableSortOptions<T> {
  data: T[];
  defaultSortKey?: string | null;
  defaultSortDirection?: SortDirection;
}

export interface UseTableSortReturn<T> {
  sortedData: T[];
  sortKey: string | null;
  sortDirection: SortDirection;
  handleSort: (key: string) => void;
  resetSort: () => void;
}

/**
 * Custom hook for client-side table sorting
 * Handles sort state and returns sorted data
 */
export function useTableSort<T>({
  data,
  defaultSortKey = null,
  defaultSortDirection = null,
}: UseTableSortOptions<T>): UseTableSortReturn<T> {
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey);
  const [sortDirection, setSortDirection] =
    useState<SortDirection>(defaultSortDirection);

  const handleSort = useCallback((key: string) => {
    setSortKey((currentKey) => {
      setSortDirection((currentDirection) => {
        if (currentKey !== key) {
          // New column - start with ascending
          return "asc";
        }
        // Same column - cycle through: asc -> desc -> null
        if (currentDirection === "asc") return "desc";
        if (currentDirection === "desc") return null;
        return "asc";
      });
      return key;
    });
  }, []);

  const resetSort = useCallback(() => {
    setSortKey(defaultSortKey);
    setSortDirection(defaultSortDirection);
  }, [defaultSortKey, defaultSortDirection]);

  const sortedData = useMemo(() => {
    if (!sortKey || !sortDirection) {
      return data;
    }

    return [...data].sort((a, b) => {
      const aValue = getNestedValue(a as Record<string, unknown>, sortKey);
      const bValue = getNestedValue(b as Record<string, unknown>, sortKey);

      // Handle null/undefined values
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return sortDirection === "asc" ? 1 : -1;
      if (bValue == null) return sortDirection === "asc" ? -1 : 1;

      // Handle dates
      if (isDateString(aValue) && isDateString(bValue)) {
        const aDate = new Date(aValue as string).getTime();
        const bDate = new Date(bValue as string).getTime();
        // Verify both dates are valid (finite numbers) before comparison
        if (Number.isFinite(aDate) && Number.isFinite(bDate)) {
          return sortDirection === "asc" ? aDate - bDate : bDate - aDate;
        }
        // Fall back to string comparison if dates are invalid
        const aString = String(aValue).toLowerCase();
        const bString = String(bValue).toLowerCase();
        return sortDirection === "asc"
          ? aString.localeCompare(bString)
          : bString.localeCompare(aString);
      }

      // Handle numbers
      if (typeof aValue === "number" && typeof bValue === "number") {
        return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
      }

      // Handle strings (case-insensitive)
      const aString = String(aValue).toLowerCase();
      const bString = String(bValue).toLowerCase();

      if (aString < bString) return sortDirection === "asc" ? -1 : 1;
      if (aString > bString) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [data, sortKey, sortDirection]);

  return {
    sortedData,
    sortKey,
    sortDirection,
    handleSort,
    resetSort,
  };
}

/**
 * Get nested value from object using dot notation
 * e.g., getNestedValue({ a: { b: 1 } }, "a.b") => 1
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce((current: unknown, key) => {
    if (current && typeof current === "object" && key in current) {
      // eslint-disable-next-line security/detect-object-injection -- key is validated via 'in' check
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/**
 * Check if a value looks like a date string
 */
function isDateString(value: unknown): boolean {
  if (typeof value !== "string") return false;
  // Check for ISO date format or common date patterns
  const date = new Date(value);
  return !isNaN(date.getTime()) && value.includes("-");
}
