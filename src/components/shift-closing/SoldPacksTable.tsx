"use client";

/**
 * Sold Packs Table Component
 *
 * Story: 10.1 - Lottery Shift Closing Page UI
 *
 * Displays read-only table of packs that were depleted during this shift.
 *
 * @requirements
 * - AC #3: Show read-only table with depleted packs
 * - AC #3: Auto-filled ending numbers (pack's serial_end)
 * - AC #3: Hide section when no depleted packs
 */

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DepletedPack } from "@/lib/api/shift-closing";

/**
 * Props for SoldPacksTable component
 */
export interface SoldPacksTableProps {
  /** Depleted packs from this shift */
  soldPacks: DepletedPack[];
}

/**
 * SoldPacksTable component
 * Displays read-only table of packs that were completely sold during shift
 */
export function SoldPacksTable({ soldPacks }: SoldPacksTableProps) {
  if (!soldPacks || soldPacks.length === 0) {
    return null; // Hide section when no depleted packs
  }

  return (
    <div className="space-y-2 md:space-y-4" data-testid="sold-packs-section">
      <h2 className="text-lg md:text-xl font-semibold">Sold Packs</h2>
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
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
              <TableHead scope="col" className="w-20 md:w-24">
                Starting
              </TableHead>
              <TableHead scope="col" className="w-20 md:w-24">
                Ending
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {soldPacks.map((pack) => (
              <TableRow key={pack.pack_id}>
                <TableCell className="font-mono text-primary font-semibold text-sm md:text-base">
                  {pack.bin_number}
                </TableCell>
                <TableCell className="text-sm md:text-base">
                  {pack.game_name}
                </TableCell>
                <TableCell className="text-sm md:text-base">
                  ${pack.game_price}
                </TableCell>
                <TableCell className="font-mono text-sm md:text-base">
                  {pack.starting_serial}
                </TableCell>
                <TableCell className="font-mono text-sm md:text-base">
                  {pack.ending_serial}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
