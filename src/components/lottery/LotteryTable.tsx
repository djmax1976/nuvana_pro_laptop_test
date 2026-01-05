"use client";

import React, { useMemo, useState, useEffect } from "react";
import { Loader2, Settings, ChevronRight, ChevronDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLotteryPacks } from "@/hooks/useLottery";
import { GameManagementModal } from "./GameManagementModal";
import { BinCountModal } from "./BinCountModal";
import type { LotteryPackResponse } from "@/lib/api/lottery";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

/**
 * Fetch bins for a store
 */
async function fetchBins(storeId: string): Promise<{ bin_id: string }[]> {
  const response = await fetch(`${API_BASE_URL}/api/lottery/bins/${storeId}`, {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return data.data || [];
}

interface LotteryTableProps {
  storeId: string;
  // Callback to report total pack count to parent
  onTotalCountChange?: (count: number) => void;
  // Callback when Receive Packs button is clicked
  onReceivePacksClick?: () => void;
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
  pack_value: number | null;
  status: string;
  totalPacks: number;
  activePacks: number;
  receivedPacks: number;
  packs: LotteryPackResponse[]; // Include packs for expandable sub-list
}

type StatusFilter = "all" | "RECEIVED" | "ACTIVE" | "SOLD";

/**
 * LotteryTable component
 * Displays lottery inventory grouped by game with expandable rows
 *
 * Features:
 * - Filters: Game name search, Status dropdown, Date range
 * - Expandable rows showing pack details
 * - Total books count reported to parent
 *
 * @requirements
 * - AC #2: Table listing all lottery inventory for selected store
 * - AC #3: Shows aggregated pack counts by game
 * - AC #8: Empty state when no packs exist
 */
export function LotteryTable({
  storeId,
  onTotalCountChange,
  onReceivePacksClick,
}: LotteryTableProps) {
  const {
    data: packs,
    isLoading,
    isError,
    error,
    refetch,
  } = useLotteryPacks(storeId);

  // Fetch bins count
  const { data: bins } = useQuery({
    queryKey: ["lottery-bins", storeId],
    queryFn: () => fetchBins(storeId),
    enabled: !!storeId,
    staleTime: 30000,
  });

  const totalBinsCount = bins?.length ?? 0;

  const [selectedGame, setSelectedGame] = useState<GameSummary | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBinCountModalOpen, setIsBinCountModalOpen] = useState(false);
  const [expandedGameIds, setExpandedGameIds] = useState<Set<string>>(
    new Set(),
  );

  // Filter state
  const [gameNameFilter, setGameNameFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Calculate total books count and report to parent
  const totalBooksCount = useMemo(() => {
    if (!packs) return 0;
    // Count all packs that are ACTIVE or RECEIVED (visible in inventory)
    return packs.filter(
      (pack) => pack.status === "ACTIVE" || pack.status === "RECEIVED",
    ).length;
  }, [packs]);

  // Report total count to parent when it changes
  useEffect(() => {
    onTotalCountChange?.(totalBooksCount);
  }, [totalBooksCount, onTotalCountChange]);

  // Filter packs based on status and date range
  const filteredPacks = useMemo(() => {
    if (!packs) return [];

    return packs.filter((pack) => {
      // Status filter
      if (statusFilter !== "all") {
        const targetStatus =
          statusFilter === "SOLD" ? "DEPLETED" : statusFilter;
        if (pack.status !== targetStatus) return false;
      } else {
        // By default, only show ACTIVE and RECEIVED
        if (pack.status !== "ACTIVE" && pack.status !== "RECEIVED")
          return false;
      }

      // Date range filter (using received_at)
      if (dateFrom) {
        const fromDate = new Date(dateFrom);
        const packDate = pack.received_at ? new Date(pack.received_at) : null;
        if (!packDate || packDate < fromDate) return false;
      }
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999); // End of day
        const packDate = pack.received_at ? new Date(pack.received_at) : null;
        if (!packDate || packDate > toDate) return false;
      }

      return true;
    });
  }, [packs, statusFilter, dateFrom, dateTo]);

  // Group packs by game and calculate totals
  const gameSummaries = useMemo(() => {
    if (!filteredPacks.length) return [];

    // Group by game_id
    const gameMap = new Map<string, GameSummary>();

    for (const pack of filteredPacks) {
      const gameId = pack.game?.game_id || "unknown";

      if (!gameMap.has(gameId)) {
        gameMap.set(gameId, {
          game_id: gameId,
          game_name: pack.game?.name || "Unknown Game",
          game_code: pack.game?.game_code || "N/A",
          price: pack.game?.price ?? null,
          pack_value: null,
          status: "ACTIVE",
          totalPacks: 0,
          activePacks: 0,
          receivedPacks: 0,
          packs: [],
        });
      }

      const summary = gameMap.get(gameId)!;
      summary.totalPacks++;
      summary.packs.push(pack);
      if (pack.status === "ACTIVE") {
        summary.activePacks++;
      } else if (pack.status === "RECEIVED") {
        summary.receivedPacks++;
      }
    }

    // Convert to array and sort by game name
    let result = Array.from(gameMap.values()).sort((a, b) =>
      a.game_name.localeCompare(b.game_name),
    );

    // Apply game name filter
    if (gameNameFilter.trim()) {
      const searchTerm = gameNameFilter.toLowerCase().trim();
      result = result.filter(
        (game) =>
          game.game_name.toLowerCase().includes(searchTerm) ||
          game.game_code.toLowerCase().includes(searchTerm),
      );
    }

    return result;
  }, [filteredPacks, gameNameFilter]);

  // Toggle row expansion
  const toggleExpanded = (gameId: string) => {
    setExpandedGameIds((prev) => {
      const next = new Set(prev);
      if (next.has(gameId)) {
        next.delete(gameId);
      } else {
        next.add(gameId);
      }
      return next;
    });
  };

  // Handle opening the management modal
  const handleManageGame = (game: GameSummary, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row expansion when clicking Manage
    setSelectedGame(game);
    setIsModalOpen(true);
  };

  // Handle modal close and refresh
  const handleModalSuccess = () => {
    refetch();
  };

  // Format date for display
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "--";
    return new Date(dateString).toLocaleDateString();
  };

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

  return (
    <>
      {/* Filters Section with Total Books and Receive Packs */}
      <div
        className="flex flex-wrap items-center gap-4 mb-4 p-4 bg-muted/30 rounded-lg"
        data-testid="lottery-filters"
      >
        {/* Game Name Filter */}
        <div className="flex-1 min-w-[180px]">
          <Input
            placeholder="Search game name or code..."
            value={gameNameFilter}
            onChange={(e) => setGameNameFilter(e.target.value)}
            data-testid="filter-game-name"
            className="w-full"
          />
        </div>

        {/* Status Filter */}
        <div className="w-[140px]">
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as StatusFilter)}
          >
            <SelectTrigger data-testid="filter-status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="RECEIVED">Received</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="SOLD">Sold</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Date From Filter */}
        <div className="w-[140px]">
          <Input
            type="date"
            placeholder="From"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            data-testid="filter-date-from"
          />
        </div>

        {/* Date To Filter */}
        <div className="w-[140px]">
          <Input
            type="date"
            placeholder="To"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            data-testid="filter-date-to"
          />
        </div>

        {/* Spacer to push right items */}
        <div className="flex-grow" />

        {/* Total Bins Badge - Clickable to open bin count configuration */}
        <Button
          variant="outline"
          className="px-4 py-2 h-auto"
          onClick={() => setIsBinCountModalOpen(true)}
          data-testid="total-bins-badge"
          title="Click to configure bin count"
        >
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Total Bins:</span>
            <span className="font-semibold" data-testid="total-bins-count">
              {totalBinsCount}
            </span>
          </div>
        </Button>

        {/* Total Remaining Packs Badge */}
        <div
          className="px-4 py-2 bg-background rounded-lg border"
          data-testid="total-remaining-packs-badge"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Total Remaining Packs:
            </span>
            <span
              className="font-semibold"
              data-testid="total-remaining-packs-count"
            >
              {totalBooksCount}
            </span>
          </div>
        </div>

        {/* Receive Packs Button */}
        <Button
          onClick={onReceivePacksClick}
          data-testid="receive-packs-button"
          aria-label="Receive lottery packs"
        >
          + Receive Packs
        </Button>
      </div>

      {/* Empty state */}
      {gameSummaries.length === 0 ? (
        <div className="p-8 text-center" data-testid="lottery-table-empty">
          <p className="text-muted-foreground">
            {packs && packs.length > 0
              ? "No lottery inventory matches your filters."
              : 'No lottery inventory for this store. Click "+ Receive Packs" to receive packs.'}
          </p>
        </div>
      ) : (
        <div
          className="rounded-md border overflow-x-auto"
          data-testid="lottery-table"
          role="region"
          aria-label="Lottery inventory table"
          id={`lottery-table-${storeId}`}
        >
          <Table size="compact">
            <TableHeader>
              <TableRow>
                <TableHead scope="col" className="w-[40px]"></TableHead>
                <TableHead scope="col">Game Name</TableHead>
                <TableHead scope="col">Game Number</TableHead>
                <TableHead scope="col">Dollar Value</TableHead>
                <TableHead scope="col" className="text-center">
                  Pack Count
                </TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col" className="text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {gameSummaries.map((game) => {
                const isExpanded = expandedGameIds.has(game.game_id);
                const dollarValue =
                  game.price !== null
                    ? `$${Number(game.price).toFixed(2)}`
                    : "N/A";

                // Get packs for sub-list (hide DEPLETED/SOLD)
                const visiblePacks = game.packs.filter(
                  (pack) =>
                    pack.status === "ACTIVE" || pack.status === "RECEIVED",
                );

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

                // Handle row click to toggle expansion
                const handleRowClick = () => {
                  toggleExpanded(game.game_id);
                };

                return (
                  <React.Fragment key={game.game_id}>
                    <TableRow
                      data-testid={`lottery-table-row-${game.game_id}`}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={handleRowClick}
                    >
                      <TableCell className="px-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="p-0 h-table-icon-button-compact w-table-icon-button-compact"
                          data-testid={`expand-game-${game.game_id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpanded(game.game_id);
                          }}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">
                        {game.game_name}
                      </TableCell>
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
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-table-button-compact"
                          onClick={(e) => handleManageGame(game, e)}
                          title="Manage game details"
                          data-testid={`manage-game-${game.game_id}`}
                        >
                          <Settings className="h-4 w-4 mr-1" />
                          Manage
                        </Button>
                      </TableCell>
                    </TableRow>

                    {/* Expandable Pack Details Sub-list */}
                    {isExpanded && (
                      <TableRow
                        className="bg-muted/30"
                        data-testid={`pack-details-${game.game_id}`}
                      >
                        <TableCell colSpan={7} className="p-0">
                          <div className="p-table-nested-padding">
                            {visiblePacks.length === 0 ? (
                              <p className="text-sm text-muted-foreground text-center py-1">
                                No active or received packs for this game.
                              </p>
                            ) : (
                              <Table size="dense" nested>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-xs">
                                      Pack #
                                    </TableHead>
                                    <TableHead className="text-xs">
                                      Serial Range
                                    </TableHead>
                                    <TableHead className="text-xs">
                                      Bin
                                    </TableHead>
                                    <TableHead className="text-xs">
                                      Status
                                    </TableHead>
                                    <TableHead className="text-xs">
                                      Received
                                    </TableHead>
                                    <TableHead className="text-xs">
                                      Activated
                                    </TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {visiblePacks.map((pack) => (
                                    <TableRow
                                      key={pack.pack_id}
                                      data-testid={`pack-row-${pack.pack_id}`}
                                    >
                                      <TableCell className="font-mono text-sm">
                                        {pack.pack_number}
                                      </TableCell>
                                      <TableCell className="font-mono text-sm">
                                        {pack.serial_start} - {pack.serial_end}
                                      </TableCell>
                                      <TableCell className="text-sm">
                                        {pack.bin?.name || "--"}
                                      </TableCell>
                                      <TableCell>
                                        <Badge
                                          variant={
                                            pack.status === "ACTIVE"
                                              ? "success"
                                              : "secondary"
                                          }
                                          className="text-xs"
                                        >
                                          {pack.status}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-sm">
                                        {formatDate(pack.received_at)}
                                      </TableCell>
                                      <TableCell className="text-sm">
                                        {formatDate(pack.activated_at)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Game Management Modal */}
      <GameManagementModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        storeId={storeId}
        game={selectedGame}
        onSuccess={handleModalSuccess}
      />

      {/* Bin Count Configuration Modal */}
      <BinCountModal
        open={isBinCountModalOpen}
        onOpenChange={setIsBinCountModalOpen}
        storeId={storeId}
        onSuccess={() => {
          // Refetch bins to update the count display
          refetch();
        }}
      />
    </>
  );
}
