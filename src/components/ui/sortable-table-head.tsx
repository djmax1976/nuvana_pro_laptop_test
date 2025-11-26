"use client";

import * as React from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { TableHead } from "@/components/ui/table";

export type SortDirection = "asc" | "desc" | null;

export interface SortableTableHeadProps
  extends React.ThHTMLAttributes<HTMLTableCellElement> {
  sortKey: string;
  currentSortKey: string | null;
  currentSortDirection: SortDirection;
  onSort: (key: string) => void;
  children: React.ReactNode;
}

/**
 * SortableTableHead component
 * A table header cell that can be clicked to sort by that column
 * Shows sort direction indicators (arrows)
 */
export const SortableTableHead = React.forwardRef<
  HTMLTableCellElement,
  SortableTableHeadProps
>(
  (
    {
      className,
      sortKey,
      currentSortKey,
      currentSortDirection,
      onSort,
      children,
      ...props
    },
    ref,
  ) => {
    const isActive = currentSortKey === sortKey;

    return (
      <TableHead
        ref={ref}
        className={cn(
          "cursor-pointer select-none hover:bg-muted/50 transition-colors",
          className,
        )}
        onClick={() => onSort(sortKey)}
        {...props}
      >
        <div className="flex items-center gap-1">
          {children}
          <span className="ml-1">
            {isActive && currentSortDirection === "asc" ? (
              <ArrowUp className="h-4 w-4" />
            ) : isActive && currentSortDirection === "desc" ? (
              <ArrowDown className="h-4 w-4" />
            ) : (
              <ArrowUpDown className="h-4 w-4 text-muted-foreground/50" />
            )}
          </span>
        </div>
      </TableHead>
    );
  },
);
SortableTableHead.displayName = "SortableTableHead";
