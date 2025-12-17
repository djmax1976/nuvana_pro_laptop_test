"use client";

/**
 * Day Bins Table Component
 *
 * Story: MyStore Lottery Page Redesign
 * Story: Lottery Manual Entry Feature
 *
 * Displays all bins with their active packs in a table format for day-based tracking.
 * Shows starting serial (first of day) and ending serial (last closing).
 *
 * @requirements
 * - Display table with columns (Bin, Name, Amount, Pack #, Starting, Ending)
 * - Show all bins ordered by display_order
 * - Greyed rows for empty bins
 * - Ending column is grayed out/disabled by default (read-only)
 * - When manualEntryMode is active, Ending column becomes editable input fields
 * - Clicking a row opens pack details modal (disabled in manual entry mode)
 *
 * MCP Guidance Applied:
 * - FE-002: FORM_VALIDATION - Strict input validation for 3-digit serial numbers
 * - SEC-014: INPUT_VALIDATION - Length, type, and format constraints on inputs
 * - SEC-004: XSS - React auto-escapes output, no dangerouslySetInnerHTML used
 * - FE-005: UI_SECURITY - No sensitive data exposed in DOM
 */

import { useCallback, useRef, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import type { DayBin } from "@/lib/api/lottery";

/**
 * Props for DayBinsTable component
 */
export interface DayBinsTableProps {
  /** Bins with pack information, ordered by display_order */
  bins: DayBin[];
  /** Callback when a row is clicked (to open pack details) */
  onRowClick?: (packId: string) => void;
  /** Whether manual entry mode is active - enables editable ending serial inputs */
  manualEntryMode?: boolean;
  /** Current ending values keyed by bin_id (for manual entry mode) */
  endingValues?: Record<string, string>;
  /** Callback when ending value changes (for manual entry mode) */
  onEndingChange?: (binId: string, value: string) => void;
  /** Callback when an input is complete (3 digits entered) */
  onInputComplete?: (binId: string) => void;
}

/**
 * DayBinsTable component
 * Displays bins with active packs in a table for day-based tracking
 * Supports manual entry mode where ending serial inputs become editable
 */
export function DayBinsTable({
  bins,
  onRowClick,
  manualEntryMode = false,
  endingValues = {},
  onEndingChange,
  onInputComplete,
}: DayBinsTableProps) {
  // Refs for input focus management (auto-advance to next input)
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  // Handle null/undefined bins early (before spreading)
  const safeBins = bins || [];

  // Sort bins by bin_number (display_order + 1)
  const sortedBins = [...safeBins].sort((a, b) => a.bin_number - b.bin_number);

  // Get active bins (bins with packs) for focus management
  const activeBinIds = sortedBins
    .filter((bin) => bin.pack !== null)
    .map((bin) => bin.bin_id);

  /**
   * Handle input change with strict validation
   * Only allows numeric input, max 3 digits
   * MCP: SEC-014 INPUT_VALIDATION - Strict format constraints
   */
  const handleInputChange = useCallback(
    (binId: string, value: string) => {
      // Strip non-numeric characters (SEC-014: sanitize input)
      const sanitizedValue = value.replace(/\D/g, "");

      // Enforce max length of 3 digits
      const truncatedValue = sanitizedValue.slice(0, 3);

      onEndingChange?.(binId, truncatedValue);

      // Auto-advance when 3 digits entered
      if (truncatedValue.length === 3) {
        onInputComplete?.(binId);

        // Find next active bin and focus its input
        const currentIndex = activeBinIds.indexOf(binId);
        if (currentIndex !== -1 && currentIndex < activeBinIds.length - 1) {
          const nextBinId = activeBinIds[currentIndex + 1];
          const nextInput = inputRefs.current.get(nextBinId);
          if (nextInput) {
            // Small delay to ensure state update completes
            setTimeout(() => nextInput.focus(), 50);
          }
        }
      }
    },
    [onEndingChange, onInputComplete, activeBinIds],
  );

  /**
   * Store input ref for focus management
   */
  const setInputRef = useCallback(
    (binId: string, element: HTMLInputElement | null) => {
      if (element) {
        inputRefs.current.set(binId, element);
      } else {
        inputRefs.current.delete(binId);
      }
    },
    [],
  );

  // Focus first active input when manual entry mode is activated
  useEffect(() => {
    if (manualEntryMode && activeBinIds.length > 0) {
      const firstInput = inputRefs.current.get(activeBinIds[0]);
      if (firstInput) {
        // Small delay to ensure DOM is ready
        setTimeout(() => firstInput.focus(), 100);
      }
    }
  }, [manualEntryMode, activeBinIds]);

  if (safeBins.length === 0) {
    return (
      <div
        className="p-8 text-center text-muted-foreground"
        data-testid="day-bins-table-empty"
      >
        No bins configured for this store.
      </div>
    );
  }

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
                {manualEntryMode && (
                  <span className="ml-1 text-xs text-primary">(Edit)</span>
                )}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedBins.map((bin) => {
              const isEmpty = bin.pack === null;
              // Disable row click in manual entry mode to prevent accidental navigation
              const isClickable = !isEmpty && onRowClick && !manualEntryMode;
              const currentEndingValue = endingValues[bin.bin_id] || "";

              return (
                <TableRow
                  key={bin.bin_id}
                  data-testid={`day-bins-row-${bin.bin_id}`}
                  className={`
                    ${isEmpty ? "opacity-50 bg-muted/30" : ""}
                    ${isClickable ? "cursor-pointer hover:bg-muted/50" : ""}
                    ${manualEntryMode && !isEmpty ? "bg-primary/5" : ""}
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

                  {/* Ending Serial - Editable in manual entry mode */}
                  <TableCell
                    className={`font-mono text-sm md:text-base ${
                      isEmpty
                        ? "text-muted-foreground"
                        : manualEntryMode
                          ? ""
                          : "text-muted-foreground/70"
                    }`}
                  >
                    {isEmpty ? (
                      "--"
                    ) : manualEntryMode ? (
                      <Input
                        ref={(el) => setInputRef(bin.bin_id, el)}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={3}
                        value={currentEndingValue}
                        onChange={(e) =>
                          handleInputChange(bin.bin_id, e.target.value)
                        }
                        onClick={(e) => e.stopPropagation()}
                        placeholder="000"
                        className={`w-16 h-8 text-center font-mono font-bold text-sm ${
                          currentEndingValue.length === 3
                            ? "border-green-500 bg-green-50 dark:bg-green-950/20"
                            : "border-primary"
                        }`}
                        data-testid={`ending-input-${bin.bin_id}`}
                        aria-label={`Ending serial for bin ${bin.bin_number}`}
                      />
                    ) : (
                      <span data-testid={`ending-display-${bin.bin_id}`}>
                        {bin.pack!.ending_serial || "--"}
                      </span>
                    )}
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
