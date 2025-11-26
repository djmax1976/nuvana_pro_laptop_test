"use client";

import * as React from "react";
import { X, Power, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface BulkActionsBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onBulkActivate?: () => void;
  onBulkDeactivate?: () => void;
  onBulkDelete?: () => void;
  isLoading?: boolean;
  className?: string;
  /** Whether any selected items are ACTIVE (affects delete button) */
  hasActiveItems?: boolean;
}

/**
 * BulkActionsBar component
 * Displays when items are selected, showing count and action buttons
 */
export function BulkActionsBar({
  selectedCount,
  onClearSelection,
  onBulkActivate,
  onBulkDeactivate,
  onBulkDelete,
  isLoading = false,
  className,
  hasActiveItems = false,
}: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg border bg-muted/50 px-4 py-3",
        className,
      )}
    >
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium">
          {selectedCount} item{selectedCount !== 1 ? "s" : ""} selected
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          disabled={isLoading}
        >
          <X className="mr-1 h-4 w-4" />
          Clear
        </Button>
      </div>

      <div className="flex items-center gap-2">
        {onBulkActivate && (
          <Button
            variant="outline"
            size="sm"
            onClick={onBulkActivate}
            disabled={isLoading}
            className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950"
          >
            <Power className="mr-1 h-4 w-4" />
            Activate
          </Button>
        )}

        {onBulkDeactivate && (
          <Button
            variant="outline"
            size="sm"
            onClick={onBulkDeactivate}
            disabled={isLoading}
            className="text-gray-600 hover:text-gray-700 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-900"
          >
            <Power className="mr-1 h-4 w-4" />
            Deactivate
          </Button>
        )}

        {onBulkDelete && (
          <Button
            variant="outline"
            size="sm"
            onClick={onBulkDelete}
            disabled={isLoading || hasActiveItems}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950 disabled:opacity-50"
            title={
              hasActiveItems
                ? "Deactivate items before deleting"
                : "Delete selected items"
            }
          >
            <Trash2 className="mr-1 h-4 w-4" />
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}
