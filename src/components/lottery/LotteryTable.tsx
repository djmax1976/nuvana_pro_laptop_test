"use client";

import { useMemo } from "react";
import { Edit, Trash2, Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLotteryPacks } from "@/hooks/useLottery";
import { getPackStatusBadgeVariant } from "@/components/lottery/pack-status-badge";

interface LotteryTableProps {
  storeId: string;
  onEdit: (packId: string) => void;
  onDelete: (packId: string) => void;
}

/**
 * LotteryTable component
 * Displays active lottery packs in a table format with columns:
 * Bin Number, Dollar Amount, Game Number, Game Name, Pack Number, Status, Actions
 *
 * @requirements
 * - AC #2: Table listing all active lottery packs for selected store
 * - AC #2: Each row represents one bin with its active lottery pack
 * - AC #3: Only packs with status = ACTIVE are shown
 * - AC #3: Bins displayed in order (Bin 1, Bin 2, Bin 3, etc.)
 * - AC #8: Empty state when no active packs exist
 */
export function LotteryTable({ storeId, onEdit, onDelete }: LotteryTableProps) {
  const {
    data: packs,
    isLoading,
    isError,
    error,
  } = useLotteryPacks(storeId, { status: "ACTIVE" });

  // Filter to only ACTIVE packs and sort by bin number
  const sortedPacks = useMemo(() => {
    if (!packs) return [];

    // Filter to ACTIVE status (should already be filtered by API, but double-check)
    const activePacks = packs.filter((pack) => pack.status === "ACTIVE");

    // Sort by bin number (extract number from bin.name if possible)
    return activePacks.sort((a, b) => {
      const binA = a.bin?.name || "";
      const binB = b.bin?.name || "";

      // Try to extract numbers from bin names (e.g., "Bin 1" -> 1)
      const numA = parseInt(binA.replace(/\D/g, ""), 10) || 0;
      const numB = parseInt(binB.replace(/\D/g, ""), 10) || 0;

      if (numA !== numB) {
        return numA - numB;
      }

      // Fallback to alphabetical if no numbers found
      return binA.localeCompare(binB);
    });
  }, [packs]);

  // Loading state
  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center p-8"
        data-testid="lottery-table-loading"
      >
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="p-8 text-center" data-testid="lottery-table-error">
        <p className="text-destructive">
          Failed to load lottery packs: {error?.message || "Unknown error"}
        </p>
      </div>
    );
  }

  // Empty state
  if (!sortedPacks || sortedPacks.length === 0) {
    return (
      <div className="p-8 text-center" data-testid="lottery-table-empty">
        <p className="text-muted-foreground">
          No active lottery packs for this store
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-md border overflow-x-auto"
      data-testid="lottery-table"
      role="region"
      aria-label="Active lottery packs table"
      id={`lottery-table-${storeId}`}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Bin Number</TableHead>
            <TableHead scope="col">Dollar Amount</TableHead>
            <TableHead scope="col">Game Number</TableHead>
            <TableHead scope="col">Game Name</TableHead>
            <TableHead scope="col">Pack Number</TableHead>
            <TableHead scope="col">Status</TableHead>
            <TableHead scope="col" className="text-right">
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedPacks.map((pack) => {
            const binName = pack.bin?.name || "N/A";
            // Dollar amount and game number are not currently available in the API response
            // These fields could be added to the LotteryGame model in the future
            const dollarAmount = "N/A";
            const gameNumber = "N/A";
            const gameName = pack.game?.name || "N/A";

            return (
              <TableRow
                key={pack.pack_id}
                data-testid={`lottery-table-row-${pack.pack_id}`}
              >
                <TableCell className="font-medium">{binName}</TableCell>
                <TableCell>{dollarAmount}</TableCell>
                <TableCell>{gameNumber}</TableCell>
                <TableCell>{gameName}</TableCell>
                <TableCell>{pack.pack_number}</TableCell>
                <TableCell>
                  <Badge variant={getPackStatusBadgeVariant(pack.status)}>
                    {pack.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit(pack.pack_id)}
                      data-testid={`edit-pack-${pack.pack_id}`}
                      aria-label={`Edit pack ${pack.pack_number}`}
                      className="focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                    >
                      <Edit className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(pack.pack_id)}
                      data-testid={`delete-pack-${pack.pack_id}`}
                      aria-label={`Delete pack ${pack.pack_number}`}
                      className="focus:outline-none focus:ring-2 focus:ring-destructive focus:ring-offset-2"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
