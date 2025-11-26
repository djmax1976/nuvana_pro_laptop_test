"use client";

import { useState, useCallback, useMemo } from "react";

export interface UseBulkSelectionOptions<T> {
  data: T[];
  getItemId: (item: T) => string;
}

export interface UseBulkSelectionReturn<T> {
  selectedIds: Set<string>;
  selectedItems: T[];
  isAllSelected: boolean;
  isPartiallySelected: boolean;
  isSelected: (id: string) => boolean;
  toggleSelection: (id: string) => void;
  toggleSelectAll: () => void;
  clearSelection: () => void;
  selectAll: () => void;
  selectedCount: number;
}

/**
 * Custom hook for managing bulk selection in tables
 * Handles select all, individual selection, and partial selection state
 */
export function useBulkSelection<T>({
  data,
  getItemId,
}: UseBulkSelectionOptions<T>): UseBulkSelectionReturn<T> {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const allIds = useMemo(() => new Set(data.map(getItemId)), [data, getItemId]);

  const isAllSelected = useMemo(() => {
    if (data.length === 0) return false;
    return data.every((item) => selectedIds.has(getItemId(item)));
  }, [data, selectedIds, getItemId]);

  const isPartiallySelected = useMemo(() => {
    if (data.length === 0) return false;
    const selectedCount = data.filter((item) =>
      selectedIds.has(getItemId(item)),
    ).length;
    return selectedCount > 0 && selectedCount < data.length;
  }, [data, selectedIds, getItemId]);

  const selectedItems = useMemo(() => {
    return data.filter((item) => selectedIds.has(getItemId(item)));
  }, [data, selectedIds, getItemId]);

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds],
  );

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      // If all are selected, clear selection
      if (data.every((item) => prev.has(getItemId(item)))) {
        return new Set();
      }
      // Otherwise, select all visible items
      return new Set(data.map(getItemId));
    });
  }, [data, getItemId]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(data.map(getItemId)));
  }, [data, getItemId]);

  return {
    selectedIds,
    selectedItems,
    isAllSelected,
    isPartiallySelected,
    isSelected,
    toggleSelection,
    toggleSelectAll,
    clearSelection,
    selectAll,
    selectedCount: selectedItems.length,
  };
}
