"use client";

/**
 * Client Dashboard Shifts Page
 * Displays shift list with filtering, pagination, and detail view for store operations
 *
 * Story: 4.7 - Shift Management UI
 * Story: Client Owner Dashboard - Shift Detail View
 *
 * Security Considerations (FE-001: STATE_MANAGEMENT):
 * - Page title uses centralized context for consistent header display
 * - No sensitive data stored in component state
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ShiftList } from "@/components/shifts/ShiftList";
import {
  type ShiftQueryFilters,
  type PaginationOptions,
  type ShiftResponse,
} from "@/lib/api/shifts";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePageTitleEffect } from "@/contexts/PageTitleContext";

export default function ClientShiftsPage() {
  const router = useRouter();
  const [filters, setFilters] = useState<ShiftQueryFilters>({});
  const [pagination, setPagination] = useState<PaginationOptions>({
    limit: 50,
    offset: 0,
  });
  const [paginationMeta, setPaginationMeta] = useState<{
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  } | null>(null);

  // Set page title in header (FE-001: STATE_MANAGEMENT)
  usePageTitleEffect("Shift Management");

  // Handle filter changes - parent controls filter state to reset pagination
  const handleFiltersChange = useCallback((newFilters: ShiftQueryFilters) => {
    setFilters(newFilters);
    // Reset pagination when filters change
    setPagination({ limit: 50, offset: 0 });
  }, []);

  // Handle shift click - navigate to shift detail page
  const handleShiftClick = useCallback(
    (shift: ShiftResponse) => {
      router.push(`/client-dashboard/shifts/${shift.shift_id}`);
    },
    [router],
  );

  // Handle pagination
  const handlePreviousPage = useCallback(() => {
    setPagination((prev) => ({
      ...prev,
      offset: Math.max(0, prev.offset - prev.limit),
    }));
  }, []);

  const handleNextPage = useCallback(() => {
    setPagination((prev) => ({
      ...prev,
      offset: prev.offset + prev.limit,
    }));
  }, []);

  const handlePageSizeChange = useCallback((newLimit: number) => {
    setPagination({ limit: newLimit, offset: 0 });
  }, []);

  return (
    <div className="space-y-6" data-testid="client-shifts-page">
      {/* Shift List (includes filters) */}
      <ShiftList
        filters={filters}
        pagination={pagination}
        onShiftClick={handleShiftClick}
        onFiltersChange={handleFiltersChange}
        onMetaChange={setPaginationMeta}
      />

      {/* Pagination Controls */}
      <div
        className="flex items-center justify-between"
        data-testid="pagination-controls"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Page size:</span>
          <select
            value={pagination.limit}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            className="rounded-md border border-input bg-background px-3 py-1 text-sm"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreviousPage}
            disabled={pagination.offset === 0}
            data-testid="pagination-previous-button"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            {paginationMeta ? (
              <>
                Page {Math.floor(pagination.offset / pagination.limit) + 1} of{" "}
                {Math.ceil(paginationMeta.total / pagination.limit) || 1} (
                {paginationMeta.total} total)
              </>
            ) : (
              `Page ${Math.floor(pagination.offset / pagination.limit) + 1}`
            )}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextPage}
            disabled={!paginationMeta || !paginationMeta.has_more}
            data-testid="pagination-next-button"
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
