"use client";

/**
 * Active Packs Table Component
 *
 * Story: 10.1 - Lottery Shift Closing Page UI
 *
 * Displays all bins with their active packs in a table format.
 * Shows empty bins as greyed out rows.
 * Includes input fields for entering ending serial numbers.
 *
 * @requirements
 * - AC #2: Display table with columns (Bin, Name, Amount, Starting, Ending)
 * - AC #2: Show all bins ordered by display_order
 * - AC #2: Greyed rows for empty bins
 * - AC #5: Auto-advance focus logic
 * - AC #8: Sticky header on scroll
 */

import { useRef } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BinWithPack } from "@/lib/api/shift-closing";
import { EndingNumberInput } from "./EndingNumberInput";

/**
 * Props for ActivePacksTable component
 */
export interface ActivePacksTableProps {
  /** Bins with pack information, ordered by display_order */
  bins: BinWithPack[];
  /** Current ending number values keyed by bin_id */
  endingValues: Record<string, string>;
  /** Callback when ending number changes */
  onChange: (binId: string, value: string) => void;
  /** Callback when 3 digits are entered (triggers auto-advance) */
  onComplete?: (binId: string) => void;
  /** Whether manual entry mode is active (skips pack number validation) */
  manualEntryMode?: boolean;
}

/**
 * ActivePacksTable component
 * Displays bins with active packs in a table with input fields for ending numbers
 */
export function ActivePacksTable({
  bins,
  endingValues,
  onChange,
  onComplete,
  manualEntryMode = false,
}: ActivePacksTableProps) {
  // Refs for input fields to enable auto-advance
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Find next active bin after current bin
  const findNextActiveBin = (currentBinId: string): string | null => {
    // Sort bins by display_order (bin_number)
    const sortedBins = [...bins].sort((a, b) => a.bin_number - b.bin_number);
    const currentIndex = sortedBins.findIndex((b) => b.bin_id === currentBinId);

    if (currentIndex === -1) return null;

    // Find next bin with active pack
    for (let i = currentIndex + 1; i < sortedBins.length; i++) {
      // eslint-disable-next-line security/detect-object-injection -- i is bounded by array length
      const bin = sortedBins[i];
      if (bin.pack !== null) {
        return bin.bin_id;
      }
    }

    // No next active bin found
    return null;
  };

  // Handle input change
  const handleInputChange = (binId: string, value: string) => {
    // Value is already sanitized by EndingNumberInput component
    onChange(binId, value);
  };

  // Handle input complete (3 digits entered) - triggers auto-advance
  const handleInputComplete = (binId: string) => {
    // Call parent onComplete callback if provided
    if (onComplete) {
      onComplete(binId);
    }

    // Focus next active bin
    const nextBinId = findNextActiveBin(binId);
    if (nextBinId) {
      // Use setTimeout to ensure DOM is updated
      setTimeout(() => {
        const refs = inputRefs.current;
        const nextInput = refs[nextBinId as keyof typeof refs];
        if (nextInput) {
          nextInput.focus();
          nextInput.select(); // Select text for easy replacement
        }
      }, 0);
    }
  };

  if (!bins || bins.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No bins configured for this store.
      </div>
    );
  }

  // Sort bins by display_order (bin_number)
  const sortedBins = [...bins].sort((a, b) => a.bin_number - b.bin_number);

  return (
    <div
      className="rounded-md border overflow-hidden"
      data-testid="active-packs-table"
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
              const currentValue = endingValues[bin.bin_id] || "";

              return (
                <TableRow
                  key={bin.bin_id}
                  data-testid={`active-packs-row-${bin.bin_id}`}
                  className={isEmpty ? "opacity-50 bg-muted/30" : ""}
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

                  {/* Amount */}
                  <TableCell
                    className={`text-sm md:text-base ${isEmpty ? "text-muted-foreground" : ""}`}
                  >
                    {isEmpty ? "--" : `$${bin.pack!.game_price}`}
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

                  {/* Ending Input */}
                  <TableCell>
                    {isEmpty ? (
                      <span className="text-muted-foreground">--</span>
                    ) : (
                      <EndingNumberInput
                        ref={(el) => {
                          inputRefs.current[bin.bin_id] = el;
                        }}
                        value={currentValue}
                        onChange={(value) =>
                          handleInputChange(bin.bin_id, value)
                        }
                        onComplete={handleInputComplete}
                        disabled={false}
                        binId={bin.bin_id}
                        packNumber={bin.pack?.pack_number}
                        startingSerial={bin.pack?.starting_serial}
                        serialEnd={bin.pack?.serial_end}
                        manualEntryMode={manualEntryMode}
                      />
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
