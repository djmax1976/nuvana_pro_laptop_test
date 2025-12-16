"use client";

/**
 * Day Bins Table Component
 *
 * Story: MyStore Lottery Page Redesign
 *
 * Displays all bins with their active packs in a read-only table format for day-based tracking.
 * Shows starting serial (first of day) and ending serial (last closing, grayed out).
 *
 * @requirements
 * - Display table with columns (Bin, Name, Amount, Pack #, Starting, Ending)
 * - Show all bins ordered by display_order
 * - Greyed rows for empty bins
 * - Ending column is grayed out/disabled (read-only)
 * - Clicking a row opens pack details modal
 */

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DayBin } from "@/lib/api/lottery";

/**
 * Props for DayBinsTable component
 */
export interface DayBinsTableProps {
  /** Bins with pack information, ordered by display_order */
  bins: DayBin[];
  /** Callback when a row is clicked (to open pack details) */
  onRowClick?: (packId: string) => void;
}

/**
 * DayBinsTable component
 * Displays bins with active packs in a read-only table for day-based tracking
 */
export function DayBinsTable({ bins, onRowClick }: DayBinsTableProps) {
  if (!bins || bins.length === 0) {
    return (
      <div
        className="p-8 text-center text-muted-foreground"
        data-testid="day-bins-table-empty"
      >
        No bins configured for this store.
      </div>
    );
  }

  // Sort bins by bin_number (display_order + 1)
  const sortedBins = [...bins].sort((a, b) => a.bin_number - b.bin_number);

  return (
    <div
      className="rounded-md border overflow-hidden"
      data-testid="day-bins-table"
    >
      <div className="max-h-[70vh] overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10 border-b">
            <TableRow>
              <TableHead scope="col" className="w-16 md:w-20">
                Bin
              </TableHead>
              <TableHead scope="col" className="min-w-[120px]">
                Name
              </TableHead>
              <TableHead scope="col" className="w-20 md:w-24">
                Amount
              </TableHead>
              <TableHead scope="col" className="w-24 md:w-28">
                Pack #
              </TableHead>
              <TableHead scope="col" className="w-20 md:w-24">
                Starting
              </TableHead>
              <TableHead scope="col" className="w-24 md:w-32">
                Ending
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedBins.map((bin) => {
              const isEmpty = bin.pack === null;
              const isClickable = !isEmpty && onRowClick;

              return (
                <TableRow
                  key={bin.bin_id}
                  data-testid={`day-bins-row-${bin.bin_id}`}
                  className={`
                    ${isEmpty ? "opacity-50 bg-muted/30" : ""}
                    ${isClickable ? "cursor-pointer hover:bg-muted/50" : ""}
                  `}
                  onClick={() => {
                    if (isClickable && bin.pack) {
                      onRowClick(bin.pack.pack_id);
                    }
                  }}
                >
                  {/* Bin Number */}
                  <TableCell className="font-mono text-primary font-semibold text-sm md:text-base">
                    {bin.bin_number}
                  </TableCell>

                  {/* Game Name */}
                  <TableCell
                    className={`text-sm md:text-base ${isEmpty ? "text-muted-foreground" : ""}`}
                  >
                    {isEmpty ? "(Empty)" : bin.pack!.game_name}
                  </TableCell>

                  {/* Amount (per ticket price) */}
                  <TableCell
                    className={`text-sm md:text-base ${isEmpty ? "text-muted-foreground" : ""}`}
                  >
                    {isEmpty ? "--" : `$${bin.pack!.game_price.toFixed(2)}`}
                  </TableCell>

                  {/* Pack Number */}
                  <TableCell
                    className={`font-mono text-sm md:text-base ${
                      isEmpty ? "text-muted-foreground" : ""
                    }`}
                  >
                    {isEmpty ? "--" : bin.pack!.pack_number}
                  </TableCell>

                  {/* Starting Serial */}
                  <TableCell
                    className={`font-mono text-sm md:text-base ${
                      isEmpty ? "text-muted-foreground" : ""
                    }`}
                  >
                    {isEmpty ? "--" : bin.pack!.starting_serial}
                  </TableCell>

                  {/* Ending Serial (grayed out, read-only) */}
                  <TableCell
                    className={`font-mono text-sm md:text-base ${
                      isEmpty
                        ? "text-muted-foreground"
                        : "text-muted-foreground/70"
                    }`}
                  >
                    {isEmpty ? "--" : bin.pack!.ending_serial || "--"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
