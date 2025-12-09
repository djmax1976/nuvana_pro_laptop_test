"use client";

import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useLotteryPacks } from "@/hooks/useLottery";

interface LotteryTableProps {
  storeId: string;
  // Legacy props - kept for backward compatibility but not used in grouped view
  onEdit?: (packId: string) => void;
  onDelete?: (packId: string) => void;
}

/**
 * Game summary row for inventory display
 */
interface GameSummary {
  game_id: string;
  game_name: string;
  game_code: string;
  price: number | null;
  totalPacks: number;
  activePacks: number;
  receivedPacks: number;
}

/**
 * LotteryTable component
 * Displays lottery inventory grouped by game with columns:
 * Game Name, Game Number, Dollar Value, Pack Count, Status
 *
 * @requirements
 * - AC #2: Table listing all lottery inventory for selected store
 * - AC #3: Shows aggregated pack counts by game
 * - AC #8: Empty state when no packs exist
 */
export function LotteryTable({ storeId }: LotteryTableProps) {
  const { data: packs, isLoading, isError, error } = useLotteryPacks(storeId);

  // Group packs by game and calculate totals
  const gameSummaries = useMemo(() => {
    if (!packs) return [];

    // Filter to only ACTIVE and RECEIVED packs
    const visiblePacks = packs.filter(
      (pack) => pack.status === "ACTIVE" || pack.status === "RECEIVED",
    );

    // Group by game_id
    const gameMap = new Map<string, GameSummary>();

    for (const pack of visiblePacks) {
      const gameId = pack.game?.game_id || "unknown";

      if (!gameMap.has(gameId)) {
        gameMap.set(gameId, {
          game_id: gameId,
          game_name: pack.game?.name || "Unknown Game",
          game_code: pack.game?.game_code || "N/A",
          price: pack.game?.price ?? null,
          totalPacks: 0,
          activePacks: 0,
          receivedPacks: 0,
        });
      }

      const summary = gameMap.get(gameId)!;
      summary.totalPacks++;
      if (pack.status === "ACTIVE") {
        summary.activePacks++;
      } else if (pack.status === "RECEIVED") {
        summary.receivedPacks++;
      }
    }

    // Convert to array and sort by game name
    return Array.from(gameMap.values()).sort((a, b) =>
      a.game_name.localeCompare(b.game_name),
    );
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
          Failed to load lottery inventory: {error?.message || "Unknown error"}
        </p>
      </div>
    );
  }

  // Empty state
  if (!gameSummaries || gameSummaries.length === 0) {
    return (
      <div className="p-8 text-center" data-testid="lottery-table-empty">
        <p className="text-muted-foreground">
          No lottery inventory for this store. Click &quot;+ Add New
          Lottery&quot; to receive packs.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-md border overflow-x-auto"
      data-testid="lottery-table"
      role="region"
      aria-label="Lottery inventory table"
      id={`lottery-table-${storeId}`}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Game Name</TableHead>
            <TableHead scope="col">Game Number</TableHead>
            <TableHead scope="col">Dollar Value</TableHead>
            <TableHead scope="col" className="text-center">
              Pack Count
            </TableHead>
            <TableHead scope="col">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {gameSummaries.map((game) => {
            // Dollar value from game price
            const dollarValue =
              game.price !== null ? `$${Number(game.price).toFixed(2)}` : "N/A";

            // Determine status display
            const getStatusBadges = () => {
              const badges = [];
              if (game.activePacks > 0) {
                badges.push(
                  <Badge key="active" variant="success" className="mr-1">
                    {game.activePacks} Active
                  </Badge>,
                );
              }
              if (game.receivedPacks > 0) {
                badges.push(
                  <Badge key="received" variant="secondary">
                    {game.receivedPacks} Received
                  </Badge>,
                );
              }
              return badges;
            };

            return (
              <TableRow
                key={game.game_id}
                data-testid={`lottery-table-row-${game.game_id}`}
              >
                <TableCell className="font-medium">{game.game_name}</TableCell>
                <TableCell>{game.game_code}</TableCell>
                <TableCell>{dollarValue}</TableCell>
                <TableCell className="text-center font-semibold">
                  {game.totalPacks}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {getStatusBadges()}
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
