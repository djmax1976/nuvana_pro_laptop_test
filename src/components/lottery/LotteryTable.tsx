"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
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
import { ReturnPackDialog } from "./ReturnPackDialog";
import type { LotteryPackResponse } from "@/lib/api/lottery";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

/**
 * Fetch bins for a store
 * SEC-006: SQL_INJECTION - API uses parameterized queries
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

/**
 * Store item for dropdown selection
 * @interface StoreItem
 */
interface StoreItem {
  /** Unique store identifier (UUID) */
  readonly store_id: string;
  /** Display name of the store */
  readonly name: string;
}

/**
 * Props interface for LotteryTable component
 * @interface LotteryTableProps
 *
 * @remarks
 * FE-001: STATE_MANAGEMENT - Store selection state managed by parent
 * FE-002: FORM_VALIDATION - Store dropdown validates selection exists in stores array
 */
interface LotteryTableProps {
  /** Currently selected store ID */
  readonly storeId: string;
  /** List of available stores for dropdown selection */
  readonly stores: readonly StoreItem[];
  /** Callback when store selection changes */
  readonly onStoreChange: (storeId: string) => void;
  /** Callback to report total pack count to parent */
  readonly onTotalCountChange?: (count: number) => void;
  /** Callback when Receive Packs button is clicked */
  readonly onReceivePacksClick?: () => void;
  /** Legacy props - kept for backward compatibility but not used in grouped view */
  readonly onEdit?: (packId: string) => void;
  readonly onDelete?: (packId: string) => void;
}

/**
 * Game summary row for inventory display
 * Story: Lottery Pack Return Feature - Added returnedPacks count
 *
 * MCP Guidance Applied:
 * - SEC-014: INPUT_VALIDATION - Strict type definitions
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
  returnedPacks: number;
  packs: LotteryPackResponse[];
}

/**
 * Status filter type - includes RETURNED option
 * Story: Lottery Pack Return Feature
 *
 * SEC-014: INPUT_VALIDATION - Enum constraint for status filter
 */
type StatusFilter = "all" | "RECEIVED" | "ACTIVE" | "SOLD" | "RETURNED";

/**
 * LotteryTable component
 * Displays lottery inventory grouped by game with expandable rows
 *
 * Story: Lottery Pack Return Feature
 *
 * Features:
 * - Filters: Game name search, Status dropdown (with Returned option), Date range
 * - Expandable rows showing pack details with aligned columns
 * - Return checkbox for marking packs as returned
 * - Total books count reported to parent
 *
 * MCP Guidance Applied:
 * - FE-001: STATE_MANAGEMENT - Controlled component state
 * - FE-002: FORM_VALIDATION - Input validation before submission
 * - SEC-004: XSS - React auto-escapes all text content
 * - SEC-014: INPUT_VALIDATION - Status filter enum constraint
 * - DB-006: TENANT_ISOLATION - Store-scoped data display
 *
 * @requirements
 * - AC #2: Table listing all lottery inventory for selected store
 * - AC #3: Shows aggregated pack counts by game
 * - AC #8: Empty state when no packs exist
 * - Story: Filter dropdown includes Returned option
 * - Story: Accordion columns align with parent table columns
 * - Story: Return checkbox marks pack as returned
 */
export function LotteryTable({
  storeId,
  stores,
  onStoreChange,
  onTotalCountChange,
  onReceivePacksClick,
}: LotteryTableProps) {
  // Derive whether to show store dropdown - only for multi-store companies
  // FE-005: UI_SECURITY - No sensitive data exposed in dropdown
  const showStoreDropdown = stores.length > 1;
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

  // FE-001: STATE_MANAGEMENT - Component state
  const [selectedGame, setSelectedGame] = useState<GameSummary | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBinCountModalOpen, setIsBinCountModalOpen] = useState(false);
  const [expandedGameIds, setExpandedGameIds] = useState<Set<string>>(
    new Set(),
  );

  // Return dialog state - Story: Lottery Pack Return Feature
  const [returningPack, setReturningPack] =
    useState<LotteryPackResponse | null>(null);

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

  /**
   * Filter packs based on status and date range
   * Story: Lottery Pack Return Feature - Added RETURNED status handling
   *
   * MCP Guidance Applied:
   * - SEC-014: INPUT_VALIDATION - Status enum constraint
   */
  const filteredPacks = useMemo(() => {
    if (!packs) return [];

    return packs.filter((pack) => {
      // Status filter - Story: Added RETURNED handling
      if (statusFilter !== "all") {
        const targetStatus =
          statusFilter === "SOLD" ? "DEPLETED" : statusFilter;
        if (pack.status !== targetStatus) return false;
      } else {
        // By default, only show ACTIVE and RECEIVED (not DEPLETED or RETURNED)
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

  /**
   * Group packs by game and calculate totals
   * Story: Lottery Pack Return Feature - Added returnedPacks counter
   */
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
          returnedPacks: 0,
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
      } else if (pack.status === "RETURNED") {
        summary.returnedPacks++;
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
  const toggleExpanded = useCallback((gameId: string) => {
    setExpandedGameIds((prev) => {
      const next = new Set(prev);
      if (next.has(gameId)) {
        next.delete(gameId);
      } else {
        next.add(gameId);
      }
      return next;
    });
  }, []);

  // Handle opening the management modal
  const handleManageGame = useCallback(
    (game: GameSummary, e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent row expansion when clicking Manage
      setSelectedGame(game);
      setIsModalOpen(true);
    },
    [],
  );

  // Handle modal close and refresh
  const handleModalSuccess = useCallback(() => {
    refetch();
  }, [refetch]);

  /**
   * Handle return checkbox click
   * Story: Lottery Pack Return Feature
   */
  const handleReturnClick = useCallback(
    (pack: LotteryPackResponse, e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent row expansion
      setReturningPack(pack);
    },
    [],
  );

  /**
   * Handle return dialog success
   * Story: Lottery Pack Return Feature
   */
  const handleReturnSuccess = useCallback(() => {
    setReturningPack(null);
    refetch();
  }, [refetch]);

  // Format date for display
  const formatDate = useCallback((dateString: string | null | undefined) => {
    if (!dateString) return "--";
    return new Date(dateString).toLocaleDateString();
  }, []);

  /**
   * Get status badge variant
   * Story: Lottery Pack Return Feature - Added RETURNED variant
   */
  const getStatusBadgeVariant = useCallback((status: string) => {
    switch (status) {
      case "ACTIVE":
        return "success";
      case "RECEIVED":
        return "secondary";
      case "RETURNED":
        return "warning";
      case "DEPLETED":
        return "destructive";
      default:
        return "secondary";
    }
  }, []);

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
        {/* Store Selector Dropdown - Only shown for multi-store companies */}
        {/* FE-005: UI_SECURITY - Store names are non-sensitive display data */}
        {/* FE-002: FORM_VALIDATION - Selection constrained to valid store IDs */}
        {showStoreDropdown && (
          <div className="w-[180px]">
            <Select
              value={storeId}
              onValueChange={(value: string) => {
                // Validate that selected store exists in the stores array
                // SEC-014: INPUT_VALIDATION - Validate selection against allowlist
                const isValidStore = stores.some(
                  (store) => store.store_id === value,
                );
                if (isValidStore) {
                  onStoreChange(value);
                }
              }}
            >
              <SelectTrigger
                data-testid="store-selector"
                aria-label="Select store"
              >
                <SelectValue placeholder="Select store" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((store) => (
                  <SelectItem key={store.store_id} value={store.store_id}>
                    {/* SEC-004: XSS - React auto-escapes text content */}
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

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

        {/* Status Filter - Story: Added RETURNED option */}
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
              <SelectItem value="RETURNED">Returned</SelectItem>
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
                <TableHead scope="col" className="w-[100px] pl-0">
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

                // Get packs for sub-list based on current filter
                // Story: When RETURNED filter is selected, show RETURNED packs
                const visiblePacks =
                  statusFilter === "RETURNED"
                    ? game.packs.filter((pack) => pack.status === "RETURNED")
                    : game.packs.filter(
                        (pack) =>
                          pack.status === "ACTIVE" ||
                          pack.status === "RECEIVED",
                      );

                /**
                 * Get status badges for game summary row
                 * Story: Lottery Pack Return Feature - Added Returned badge
                 */
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
                      <Badge
                        key="received"
                        variant="secondary"
                        className="mr-1"
                      >
                        {game.receivedPacks} Received
                      </Badge>,
                    );
                  }
                  if (game.returnedPacks > 0) {
                    badges.push(
                      <Badge key="returned" variant="warning">
                        {game.returnedPacks} Returned
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
                        <div className="flex items-center gap-1 flex-wrap">
                          {getStatusBadges()}
                        </div>
                      </TableCell>
                      <TableCell className="w-[100px] pl-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-table-button-compact px-2"
                          onClick={(e) => handleManageGame(game, e)}
                          title="Manage game details"
                          data-testid={`manage-game-${game.game_id}`}
                        >
                          <Settings className="h-4 w-4 mr-1" />
                          Manage
                        </Button>
                      </TableCell>
                    </TableRow>

                    {/* Expandable Pack Details Sub-list - Aligned with parent columns */}
                    {/* Story: Column alignment matches parent table structure */}
                    {/* Style: Option 5 - Light blue gradient with left border indicator */}
                    {/* Header row for sub-list so users know what each column means */}
                    {isExpanded && (
                      <TableRow
                        className="bg-gradient-to-r from-blue-50 to-slate-50 border-l-[3px] border-l-blue-500"
                        data-testid={`pack-details-${game.game_id}`}
                      >
                        {/* Column 1: Empty (align with expand button) */}
                        <TableCell className="w-[40px] px-2"></TableCell>
                        {/* Column 2: Pack # header (align with Game Name) */}
                        <TableCell className="text-xs font-medium text-blue-700 py-1">
                          Pack #
                        </TableCell>
                        {/* Column 3: Received At header (align with Game Number) */}
                        <TableCell className="text-xs font-medium text-blue-700 py-1">
                          Received At
                        </TableCell>
                        {/* Column 4: Activated At header (align with Dollar Value) */}
                        <TableCell className="text-xs font-medium text-blue-700 py-1">
                          Activated At
                        </TableCell>
                        {/* Column 5: Returned At header (align with Pack Count) */}
                        <TableCell className="text-xs font-medium text-blue-700 py-1 text-center">
                          Returned At
                        </TableCell>
                        {/* Column 6: Status header (align with Status) */}
                        <TableCell className="text-xs font-medium text-blue-700 py-1">
                          Status
                        </TableCell>
                        {/* Column 7: Returned checkbox header (align with Actions) */}
                        <TableCell className="text-xs font-medium text-blue-700 py-1 w-[100px] pl-0">
                          <span className="ml-2">Returned</span>
                        </TableCell>
                      </TableRow>
                    )}
                    {isExpanded && visiblePacks.length === 0 && (
                      <TableRow className="bg-gradient-to-r from-blue-50 to-slate-50 border-l-[3px] border-l-blue-500">
                        <TableCell colSpan={7} className="py-4">
                          <p className="text-sm text-muted-foreground text-center">
                            {statusFilter === "RETURNED"
                              ? "No returned packs for this game."
                              : "No active or received packs for this game."}
                          </p>
                        </TableCell>
                      </TableRow>
                    )}
                    {isExpanded &&
                      visiblePacks.map((pack) => {
                        const isReturned = pack.status === "RETURNED";
                        const canReturn =
                          pack.status === "RECEIVED" ||
                          pack.status === "ACTIVE";

                        return (
                          <TableRow
                            key={pack.pack_id}
                            className="bg-gradient-to-r from-blue-50 to-slate-50 border-l-[3px] border-l-blue-500 hover:from-blue-100 hover:to-blue-50"
                            data-testid={`pack-row-${pack.pack_id}`}
                          >
                            {/* Column 1: Empty (align with expand button) */}
                            <TableCell className="w-[40px] px-2"></TableCell>
                            {/* Column 2: Pack # (align with Game Name) - No serial range per user request */}
                            <TableCell className="font-mono text-sm">
                              #{pack.pack_number}
                            </TableCell>
                            {/* Column 3: Received At (align with Game Number) */}
                            <TableCell className="text-sm">
                              {formatDate(pack.received_at)}
                            </TableCell>
                            {/* Column 4: Activated At (align with Dollar Value) */}
                            <TableCell className="text-sm">
                              {formatDate(pack.activated_at)}
                            </TableCell>
                            {/* Column 5: Returned At (align with Pack Count) */}
                            <TableCell className="text-sm text-center">
                              {(pack as any).returned_at
                                ? formatDate((pack as any).returned_at)
                                : "--"}
                            </TableCell>
                            {/* Column 6: Status (align with Status) */}
                            <TableCell>
                              <Badge
                                variant={getStatusBadgeVariant(pack.status)}
                                className="text-xs"
                              >
                                {pack.status}
                              </Badge>
                            </TableCell>
                            {/* Column 7: Returned Checkbox (align with Actions) */}
                            <TableCell className="w-[100px] pl-0">
                              <Checkbox
                                className="ml-2"
                                checked={isReturned}
                                disabled={isReturned || !canReturn}
                                onCheckedChange={() => {}}
                                onClick={(e) => {
                                  if (canReturn) {
                                    handleReturnClick(pack, e);
                                  }
                                }}
                                data-testid={`return-checkbox-${pack.pack_id}`}
                                aria-label={
                                  isReturned
                                    ? "Pack already returned"
                                    : canReturn
                                      ? `Mark pack ${pack.pack_number} as returned`
                                      : "Cannot return this pack"
                                }
                                title={
                                  isReturned
                                    ? "Pack already returned"
                                    : canReturn
                                      ? "Click to mark as returned"
                                      : "Cannot return depleted packs"
                                }
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
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

      {/* Return Pack Dialog - Story: Lottery Pack Return Feature */}
      <ReturnPackDialog
        open={returningPack !== null}
        onOpenChange={(open) => {
          if (!open) {
            setReturningPack(null);
          }
        }}
        packId={returningPack?.pack_id ?? null}
        packData={returningPack}
        onSuccess={handleReturnSuccess}
      />
    </>
  );
}
