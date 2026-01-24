"use client";

/**
 * Super Admin Dashboard Lottery Page
 * Manages state-scoped lottery games across all stores
 *
 * Story: State-Scoped Lottery Games Phase
 *
 * Features:
 * - View all lottery games (grouped by state)
 * - Create new STATE-scoped games
 * - Edit/update existing games
 * - Filter games by state
 *
 * @enterprise-standards
 * - FE-001: STATE_MANAGEMENT - React Query for server state
 * - FE-002: FORM_VALIDATION - React Hook Form with Zod
 * - SEC-014: INPUT_VALIDATION - Client-side validation
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  Pencil,
  Loader2,
  AlertCircle,
  Check,
  Upload,
  Search,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import {
  getGames,
  createGame,
  updateGame,
  type LotteryGameResponse,
  type CreateGameInput,
  type UpdateGameInput,
} from "@/lib/api/lottery";
import {
  getLotteryEnabledStates,
  type USStateResponse,
} from "@/lib/api/geographic";
import { LotteryGameImportWizard } from "@/components/lottery-import/LotteryGameImportWizard";

// ============ Validation Schema ============

const createGameSchema = z.object({
  state_id: z.string().uuid("Please select a state"),
  game_code: z
    .string()
    .min(1, "Game code is required")
    .max(20, "Game code must be 20 characters or less")
    .regex(
      /^[A-Z0-9]+$/,
      "Game code must be uppercase letters and numbers only",
    ),
  name: z
    .string()
    .min(1, "Game name is required")
    .max(100, "Game name must be 100 characters or less"),
  price: z
    .number({ error: "Price is required" })
    .positive("Price must be a positive number"),
  pack_value: z
    .number({ error: "Pack value is required" })
    .positive("Pack value must be a positive number"),
  description: z.string().max(500).optional(),
});

type CreateGameFormData = z.infer<typeof createGameSchema>;

const updateGameSchema = z.object({
  name: z
    .string()
    .min(1, "Game name is required")
    .max(100, "Game name must be 100 characters or less")
    .optional(),
  game_code: z
    .string()
    .min(1, "Game code is required")
    .max(20, "Game code must be 20 characters or less")
    .regex(
      /^[A-Z0-9]+$/,
      "Game code must be uppercase letters and numbers only",
    )
    .optional(),
  price: z
    .number({ error: "Price is required" })
    .positive("Price must be a positive number")
    .optional(),
  pack_value: z
    .number({ error: "Pack value is required" })
    .positive("Pack value must be a positive number")
    .optional(),
  description: z.string().max(500).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "DISCONTINUED"]).optional(),
});

type UpdateGameFormData = z.infer<typeof updateGameSchema>;

// ============ Component ============

export default function LotteryPage() {
  // State
  const [states, setStates] = useState<USStateResponse[]>([]);
  const [games, setGames] = useState<LotteryGameResponse[]>([]);
  const [isLoadingStates, setIsLoadingStates] = useState(true);
  const [isLoadingGames, setIsLoadingGames] = useState(true);
  const [statesError, setStatesError] = useState<string | null>(null);
  const [gamesError, setGamesError] = useState<string | null>(null);
  const [selectedStateFilter, setSelectedStateFilter] = useState<string>("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingGame, setEditingGame] = useState<LotteryGameResponse | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);

  // Search and filter state
  // FE-021: EVENT_HANDLING - Debounced search for better UX
  // SEC-014: INPUT_VALIDATION - Allowlist filter values
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [priceFilter, setPriceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Debounce search input to prevent excessive filtering
  // FE-021: EVENT_HANDLING - 300ms debounce for search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Create form
  const createForm = useForm<CreateGameFormData>({
    resolver: zodResolver(createGameSchema),
    defaultValues: {
      state_id: "",
      game_code: "",
      name: "",
      price: undefined,
      pack_value: undefined,
      description: "",
    },
  });

  // Edit form
  const editForm = useForm<UpdateGameFormData>({
    resolver: zodResolver(updateGameSchema),
    defaultValues: {
      name: "",
      game_code: "",
      price: undefined,
      pack_value: undefined,
      description: "",
      status: "ACTIVE",
    },
  });

  // Load states
  const loadStates = useCallback(async () => {
    setIsLoadingStates(true);
    setStatesError(null);
    try {
      const response = await getLotteryEnabledStates();
      if (response.success && response.data) {
        setStates(response.data);
      } else {
        setStatesError("Failed to load states");
      }
    } catch (err) {
      setStatesError(
        err instanceof Error ? err.message : "Failed to load states",
      );
    } finally {
      setIsLoadingStates(false);
    }
  }, []);

  // Load games
  const loadGames = useCallback(async () => {
    setIsLoadingGames(true);
    setGamesError(null);
    try {
      const response = await getGames();
      if (response.success && response.data) {
        setGames(response.data);
      } else {
        setGamesError("Failed to load games");
      }
    } catch (err) {
      setGamesError(
        err instanceof Error ? err.message : "Failed to load games",
      );
    } finally {
      setIsLoadingGames(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadStates();
    loadGames();
  }, [loadStates, loadGames]);

  // Clear success message after 3 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Filter games by state, search term, price, and status
  // SEC-014: INPUT_VALIDATION - Safe client-side filtering with escaped regex
  // SEC-006: SQL_INJECTION - N/A (client-side filtering, no SQL)
  const filteredGames = useMemo(() => {
    return games.filter((game) => {
      // State filter
      if (selectedStateFilter !== "all" && game.state_id !== selectedStateFilter) {
        return false;
      }

      // Search filter (game name or game code)
      // SEC-014: INPUT_VALIDATION - Case-insensitive search, no regex special chars concern
      if (debouncedSearchTerm.trim()) {
        const searchLower = debouncedSearchTerm.toLowerCase().trim();
        const nameMatch = game.name.toLowerCase().includes(searchLower);
        const codeMatch = game.game_code.toLowerCase().includes(searchLower);
        if (!nameMatch && !codeMatch) {
          return false;
        }
      }

      // Price filter
      // SEC-014: INPUT_VALIDATION - Allowlist-based price filtering
      if (priceFilter !== "all") {
        const gamePrice = game.price ?? 0;
        switch (priceFilter) {
          case "1":
            if (gamePrice !== 1) return false;
            break;
          case "2":
            if (gamePrice !== 2) return false;
            break;
          case "3":
            if (gamePrice !== 3) return false;
            break;
          case "5":
            if (gamePrice !== 5) return false;
            break;
          case "10":
            if (gamePrice !== 10) return false;
            break;
          case "20":
            if (gamePrice !== 20) return false;
            break;
          case "25":
            if (gamePrice !== 25) return false;
            break;
          case "30":
            if (gamePrice !== 30) return false;
            break;
          case "50":
            if (gamePrice !== 50) return false;
            break;
          case "other":
            // "Other" means any price not in the standard list
            const standardPrices = [1, 2, 3, 5, 10, 20, 25, 30, 50];
            if (standardPrices.includes(gamePrice)) return false;
            break;
        }
      }

      // Status filter
      // SEC-014: INPUT_VALIDATION - Enum-based status filtering
      if (statusFilter !== "all") {
        if (game.status !== statusFilter) {
          return false;
        }
      }

      return true;
    });
  }, [games, selectedStateFilter, debouncedSearchTerm, priceFilter, statusFilter]);

  // Group games by state for display
  const gamesByState = filteredGames.reduce(
    (acc, game) => {
      const stateId = game.state_id || "global";
      if (!acc[stateId]) {
        acc[stateId] = [];
      }
      acc[stateId].push(game);
      return acc;
    },
    {} as Record<string, LotteryGameResponse[]>,
  );

  // Get state name by ID
  const getStateName = (stateId: string | null | undefined): string => {
    if (!stateId) return "Global";
    const state = states.find((s) => s.state_id === stateId);
    return state ? `${state.name} (${state.code})` : "Unknown State";
  };

  // Handle create game
  const handleCreateGame = async (data: CreateGameFormData) => {
    setIsSubmitting(true);
    try {
      const input: CreateGameInput = {
        state_id: data.state_id,
        game_code: data.game_code,
        name: data.name,
        price: data.price,
        pack_value: data.pack_value,
        description: data.description || undefined,
      };
      const response = await createGame(input);
      if (response.success) {
        setSuccessMessage(`Game "${data.name}" created successfully`);
        setIsCreateDialogOpen(false);
        createForm.reset();
        loadGames();
      } else {
        createForm.setError("root", {
          message: response.error || "Failed to create game",
        });
      }
    } catch (err) {
      createForm.setError("root", {
        message: err instanceof Error ? err.message : "Failed to create game",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle edit game
  const handleEditGame = async (data: UpdateGameFormData) => {
    if (!editingGame) return;

    setIsSubmitting(true);
    try {
      const input: UpdateGameInput = {};
      if (data.name) input.name = data.name;
      if (data.game_code) input.game_code = data.game_code;
      if (data.price) input.price = data.price;
      if (data.pack_value) input.pack_value = data.pack_value;
      if (data.description !== undefined) input.description = data.description;
      if (data.status) input.status = data.status;

      const response = await updateGame(editingGame.game_id, input);
      if (response.success) {
        setSuccessMessage(
          `Game "${data.name || editingGame.name}" updated successfully`,
        );
        setIsEditDialogOpen(false);
        setEditingGame(null);
        editForm.reset();
        loadGames();
      } else {
        editForm.setError("root", {
          message: response.error || "Failed to update game",
        });
      }
    } catch (err) {
      editForm.setError("root", {
        message: err instanceof Error ? err.message : "Failed to update game",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open edit dialog
  const openEditDialog = (game: LotteryGameResponse) => {
    setEditingGame(game);
    editForm.reset({
      name: game.name,
      game_code: game.game_code,
      price: game.price || undefined,
      pack_value: game.pack_value || undefined,
      description: game.description || "",
      status:
        (game.status as "ACTIVE" | "INACTIVE" | "DISCONTINUED") || "ACTIVE",
    });
    setIsEditDialogOpen(true);
  };

  // Format currency
  const formatCurrency = (value: number | null | undefined): string => {
    if (value == null) return "-";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);
  };

  // Get status badge variant
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return (
          <Badge variant="success">
            Active
          </Badge>
        );
      case "INACTIVE":
        return <Badge variant="destructive">Inactive</Badge>;
      case "DISCONTINUED":
        return <Badge variant="destructive">Discontinued</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6" data-testid="lottery-page">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Lottery Games</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Manage state-scoped lottery games for all stores
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setIsImportDialogOpen(true)}
            data-testid="import-games-button"
          >
            <Upload className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
          <Dialog
            open={isCreateDialogOpen}
            onOpenChange={setIsCreateDialogOpen}
          >
            <DialogTrigger asChild>
              <Button data-testid="create-game-button">
                <Plus className="h-4 w-4 mr-2" />
                Create Game
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Create New Lottery Game</DialogTitle>
                <DialogDescription>
                  Create a state-scoped lottery game that will be available to
                  all stores in the selected state.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={createForm.handleSubmit(handleCreateGame)}>
                <div className="grid gap-4 py-4">
                  {/* State Selection */}
                  <div className="grid gap-2">
                    <Label htmlFor="state_id">State *</Label>
                    <Select
                      value={createForm.watch("state_id")}
                      onValueChange={(value) =>
                        createForm.setValue("state_id", value)
                      }
                      disabled={isLoadingStates}
                    >
                      <SelectTrigger id="state_id" data-testid="state-select">
                        <SelectValue placeholder="Select a state" />
                      </SelectTrigger>
                      <SelectContent>
                        {states.map((state) => (
                          <SelectItem
                            key={state.state_id}
                            value={state.state_id}
                          >
                            {state.name} ({state.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {createForm.formState.errors.state_id && (
                      <p className="text-sm text-destructive">
                        {createForm.formState.errors.state_id.message}
                      </p>
                    )}
                  </div>

                  {/* Game Code */}
                  <div className="grid gap-2">
                    <Label htmlFor="game_code">Game Code *</Label>
                    <Input
                      id="game_code"
                      placeholder="e.g., GA001"
                      {...createForm.register("game_code", {
                        onChange: (e) => {
                          e.target.value = e.target.value.toUpperCase();
                        },
                      })}
                      data-testid="game-code-input"
                    />
                    {createForm.formState.errors.game_code && (
                      <p className="text-sm text-destructive">
                        {createForm.formState.errors.game_code.message}
                      </p>
                    )}
                  </div>

                  {/* Game Name */}
                  <div className="grid gap-2">
                    <Label htmlFor="name">Game Name *</Label>
                    <Input
                      id="name"
                      placeholder="e.g., Georgia Jackpot"
                      {...createForm.register("name")}
                      data-testid="game-name-input"
                    />
                    {createForm.formState.errors.name && (
                      <p className="text-sm text-destructive">
                        {createForm.formState.errors.name.message}
                      </p>
                    )}
                  </div>

                  {/* Price */}
                  <div className="grid gap-2">
                    <Label htmlFor="price">Ticket Price ($) *</Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="e.g., 5.00"
                      {...createForm.register("price", { valueAsNumber: true })}
                      data-testid="price-input"
                    />
                    {createForm.formState.errors.price && (
                      <p className="text-sm text-destructive">
                        {createForm.formState.errors.price.message}
                      </p>
                    )}
                  </div>

                  {/* Pack Value */}
                  <div className="grid gap-2">
                    <Label htmlFor="pack_value">Pack Value ($) *</Label>
                    <Input
                      id="pack_value"
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="e.g., 300.00"
                      {...createForm.register("pack_value", {
                        valueAsNumber: true,
                      })}
                      data-testid="pack-value-input"
                    />
                    {createForm.formState.errors.pack_value && (
                      <p className="text-sm text-destructive">
                        {createForm.formState.errors.pack_value.message}
                      </p>
                    )}
                  </div>

                  {/* Description */}
                  <div className="grid gap-2">
                    <Label htmlFor="description">Description (Optional)</Label>
                    <Input
                      id="description"
                      placeholder="Optional game description"
                      {...createForm.register("description")}
                      data-testid="description-input"
                    />
                  </div>

                  {/* Error message */}
                  {createForm.formState.errors.root && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Error</AlertTitle>
                      <AlertDescription>
                        {createForm.formState.errors.root.message}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    data-testid="submit-create-game"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create Game"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Import Wizard */}
      <LotteryGameImportWizard
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        states={states}
        onImportComplete={loadGames}
      />

      {/* Success Message */}
      {successMessage && (
        <Alert className="bg-green-50 border-green-200">
          <Check className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-800">Success</AlertTitle>
          <AlertDescription className="text-green-700">
            {successMessage}
          </AlertDescription>
        </Alert>
      )}

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Search & Filter Games</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            {/* Search Bar */}
            <div className="flex-1 min-w-[250px]">
              <Label htmlFor="search-games" className="text-sm font-medium mb-1.5 block">
                Search
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search-games"
                  placeholder="Search by game name or code..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-9"
                  data-testid="search-games-input"
                />
                {searchTerm && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                    onClick={() => setSearchTerm("")}
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* State Filter */}
            <div className="w-[200px]">
              <Label htmlFor="state-filter" className="text-sm font-medium mb-1.5 block">
                State
              </Label>
              <Select
                value={selectedStateFilter}
                onValueChange={setSelectedStateFilter}
                disabled={isLoadingStates}
              >
                <SelectTrigger
                  id="state-filter"
                  data-testid="state-filter"
                >
                  <SelectValue placeholder="All States" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All States</SelectItem>
                  {states.map((state) => (
                    <SelectItem key={state.state_id} value={state.state_id}>
                      {state.name} ({state.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Price Filter */}
            <div className="w-[150px]">
              <Label htmlFor="price-filter" className="text-sm font-medium mb-1.5 block">
                Price
              </Label>
              <Select
                value={priceFilter}
                onValueChange={setPriceFilter}
              >
                <SelectTrigger
                  id="price-filter"
                  data-testid="price-filter"
                >
                  <SelectValue placeholder="All Prices" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Prices</SelectItem>
                  <SelectItem value="1">$1</SelectItem>
                  <SelectItem value="2">$2</SelectItem>
                  <SelectItem value="3">$3</SelectItem>
                  <SelectItem value="5">$5</SelectItem>
                  <SelectItem value="10">$10</SelectItem>
                  <SelectItem value="20">$20</SelectItem>
                  <SelectItem value="25">$25</SelectItem>
                  <SelectItem value="30">$30</SelectItem>
                  <SelectItem value="50">$50</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Status Filter */}
            <div className="w-[160px]">
              <Label htmlFor="status-filter" className="text-sm font-medium mb-1.5 block">
                Status
              </Label>
              <Select
                value={statusFilter}
                onValueChange={setStatusFilter}
              >
                <SelectTrigger
                  id="status-filter"
                  data-testid="status-filter"
                >
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                  <SelectItem value="DISCONTINUED">Discontinued</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Clear All Filters Button */}
            {(searchTerm || selectedStateFilter !== "all" || priceFilter !== "all" || statusFilter !== "all") && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchTerm("");
                  setSelectedStateFilter("all");
                  setPriceFilter("all");
                  setStatusFilter("all");
                }}
                className="h-10"
                data-testid="clear-filters-button"
              >
                <X className="h-4 w-4 mr-1" />
                Clear Filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Error States */}
      {statesError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error loading states</AlertTitle>
          <AlertDescription>{statesError}</AlertDescription>
        </Alert>
      )}

      {gamesError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error loading games</AlertTitle>
          <AlertDescription>{gamesError}</AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {(isLoadingStates || isLoadingGames) && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Games Table */}
      {!isLoadingGames && !gamesError && (
        <Card>
          <CardHeader>
            <CardTitle>Lottery Games</CardTitle>
            <CardDescription>
              {filteredGames.length} game{filteredGames.length !== 1 ? "s" : ""}{" "}
              found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredGames.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No lottery games found. Create your first game to get started.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>State</TableHead>
                    <TableHead>Game Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Pack Value</TableHead>
                    <TableHead className="text-right">Tickets/Pack</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGames.map((game) => (
                    <TableRow
                      key={game.game_id}
                      data-testid={`game-row-${game.game_id}`}
                    >
                      <TableCell>
                        <Badge variant="outline">
                          {getStateName(game.state_id)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono font-medium">
                        {game.game_code}
                      </TableCell>
                      <TableCell>{game.name}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(game.price)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(game.pack_value)}
                      </TableCell>
                      <TableCell className="text-right">
                        {game.total_tickets || "-"}
                      </TableCell>
                      <TableCell>{getStatusBadge(game.status)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(game)}
                          data-testid={`edit-game-${game.game_id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Edit Game Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Lottery Game</DialogTitle>
            <DialogDescription>
              Update the game details. State cannot be changed after creation.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(handleEditGame)}>
            <div className="grid gap-4 py-4">
              {/* State (read-only) */}
              <div className="grid gap-2">
                <Label>State</Label>
                <Input
                  value={editingGame ? getStateName(editingGame.state_id) : ""}
                  disabled
                  className="bg-muted"
                />
              </div>

              {/* Game Code */}
              <div className="grid gap-2">
                <Label htmlFor="edit_game_code">Game Code *</Label>
                <Input
                  id="edit_game_code"
                  {...editForm.register("game_code", {
                    onChange: (e) => {
                      e.target.value = e.target.value.toUpperCase();
                    },
                  })}
                  data-testid="edit-game-code-input"
                />
                {editForm.formState.errors.game_code && (
                  <p className="text-sm text-destructive">
                    {editForm.formState.errors.game_code.message}
                  </p>
                )}
              </div>

              {/* Game Name */}
              <div className="grid gap-2">
                <Label htmlFor="edit_name">Game Name *</Label>
                <Input
                  id="edit_name"
                  {...editForm.register("name")}
                  data-testid="edit-game-name-input"
                />
                {editForm.formState.errors.name && (
                  <p className="text-sm text-destructive">
                    {editForm.formState.errors.name.message}
                  </p>
                )}
              </div>

              {/* Price */}
              <div className="grid gap-2">
                <Label htmlFor="edit_price">Ticket Price ($) *</Label>
                <Input
                  id="edit_price"
                  type="number"
                  step="0.01"
                  min="0.01"
                  {...editForm.register("price", { valueAsNumber: true })}
                  data-testid="edit-price-input"
                />
                {editForm.formState.errors.price && (
                  <p className="text-sm text-destructive">
                    {editForm.formState.errors.price.message}
                  </p>
                )}
              </div>

              {/* Pack Value */}
              <div className="grid gap-2">
                <Label htmlFor="edit_pack_value">Pack Value ($) *</Label>
                <Input
                  id="edit_pack_value"
                  type="number"
                  step="0.01"
                  min="0.01"
                  {...editForm.register("pack_value", { valueAsNumber: true })}
                  data-testid="edit-pack-value-input"
                />
                {editForm.formState.errors.pack_value && (
                  <p className="text-sm text-destructive">
                    {editForm.formState.errors.pack_value.message}
                  </p>
                )}
              </div>

              {/* Status */}
              <div className="grid gap-2">
                <Label htmlFor="edit_status">Status</Label>
                <Select
                  value={editForm.watch("status")}
                  onValueChange={(value) =>
                    editForm.setValue(
                      "status",
                      value as "ACTIVE" | "INACTIVE" | "DISCONTINUED",
                    )
                  }
                >
                  <SelectTrigger
                    id="edit_status"
                    data-testid="edit-status-select"
                  >
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                    <SelectItem value="DISCONTINUED">Discontinued</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Description */}
              <div className="grid gap-2">
                <Label htmlFor="edit_description">Description (Optional)</Label>
                <Input
                  id="edit_description"
                  {...editForm.register("description")}
                  data-testid="edit-description-input"
                />
              </div>

              {/* Error message */}
              {editForm.formState.errors.root && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>
                    {editForm.formState.errors.root.message}
                  </AlertDescription>
                </Alert>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsEditDialogOpen(false);
                  setEditingGame(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                data-testid="submit-edit-game"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
