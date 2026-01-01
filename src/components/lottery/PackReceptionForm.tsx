"use client";

/**
 * Pack Reception Form Component
 * Form for receiving lottery packs via 24-digit serialized barcode scanning
 *
 * Story: 6.12 - Serialized Pack Reception with Batch Processing
 * Story: Scan-Only Pack Reception Security
 *
 * AC #1, #2, #3, #4, #5: Serialized input, parsing, validation, batch submission
 *
 * Security Enhancement:
 * - SCAN-ONLY INPUT: Manual keyboard entry is detected and rejected
 * - Enterprise-grade barcode scan detection using keystroke timing analysis
 * - Server-side validation of scan metrics prevents client-side tampering
 * - Audit logging of all scan attempts for security analysis
 *
 * Enhanced: Auto-create games when game code not found (Client Dashboard only)
 */

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, X } from "lucide-react";
import {
  receivePackBatch,
  getGames,
  checkPackExists,
  type LotteryGameResponse,
} from "@/lib/api/lottery";
import { parseSerializedNumber } from "@/lib/utils/lottery-serial-parser";
import { NewGameModal } from "./NewGameModal";
import { useScanDetector } from "@/hooks/useScanDetector";
// ScanOnlyIndicator components available but UI simplified per requirements
// Detection logic still active via useScanDetector hook
import type { ScanMetrics } from "@/types/scan-detection";

/**
 * Expected barcode length
 */
const EXPECTED_BARCODE_LENGTH = 24;

/**
 * Pack item in reception list
 * Exported for parent component state management
 * MCP FE-001: STATE_MANAGEMENT - Type exported for lifted state pattern
 */
export interface PackItem {
  serial: string;
  game_code: string;
  pack_number: string;
  serial_start: string;
  game_name?: string;
  game_id?: string;
  game_price?: number;
  game_pack_value?: number;
  game_total_tickets?: number;
  error?: string;
  isValidating?: boolean;
  /** Scan metrics for server-side validation */
  scanMetrics?: ScanMetrics;
  /** Timestamp when pack was added (for display/debugging) */
  addedAt?: number;
}

/**
 * Props for PackReceptionForm
 *
 * MCP FE-001: STATE_MANAGEMENT - Supports lifted state pattern
 * Parent can optionally manage packList state to persist across modal close/reopen
 */
interface PackReceptionFormProps {
  storeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  /**
   * Whether to enforce scan-only input (default: true)
   * Set to false for testing or accessibility exceptions
   */
  enforceScanOnly?: boolean;
  /**
   * Optional: Pack list managed by parent (lifted state pattern)
   * When provided, packList state is controlled by parent
   * MCP FE-001: STATE_MANAGEMENT - Parent owns data for persistence
   */
  packList?: PackItem[];
  /**
   * Optional: Callback when a pack is added (lifted state pattern)
   * Required when packList is provided
   */
  onPackAdd?: (pack: PackItem) => void;
  /**
   * Optional: Callback when a pack is removed (lifted state pattern)
   * Required when packList is provided
   */
  onPackRemove?: (index: number) => void;
  /**
   * Optional: Callback to clear all packs (lifted state pattern)
   * Called on successful submission or explicit cancel
   */
  onPacksClear?: () => void;
}

/**
 * PackReceptionForm component
 * Dialog form for receiving lottery packs via barcode scanning
 * Supports batch processing with auto-generating input fields
 *
 * SECURITY: Manual keyboard entry is detected and rejected.
 * Uses keystroke timing analysis to distinguish scanner vs typing.
 *
 * MCP FE-001: STATE_MANAGEMENT - Supports both local and lifted state patterns
 * When packList prop is provided, component uses controlled mode (parent owns state)
 * When packList prop is not provided, component uses internal state (backward compatible)
 */
export function PackReceptionForm({
  storeId,
  open,
  onOpenChange,
  onSuccess,
  enforceScanOnly = true,
  // Lifted state props (optional - for parent-controlled mode)
  packList: externalPackList,
  onPackAdd,
  onPackRemove,
  onPacksClear,
}: PackReceptionFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingGames, setIsLoadingGames] = useState(false);

  // Internal state for backward compatibility (used when props not provided)
  const [internalPackList, setInternalPackList] = useState<PackItem[]>([]);

  // MCP FE-001: STATE_MANAGEMENT - Determine if using controlled or uncontrolled mode
  const isControlled = externalPackList !== undefined;
  const packList = isControlled ? externalPackList : internalPackList;

  const [inputValue, setInputValue] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Games cache for checking existence on scan
  const [gamesCache, setGamesCache] = useState<
    Map<string, LotteryGameResponse>
  >(new Map());

  // State for new game creation flow - immediate check on scan
  const [showNewGameModal, setShowNewGameModal] = useState(false);
  const [pendingGameToCreate, setPendingGameToCreate] = useState<{
    serial: string;
    game_code: string;
    pack_number: string;
    serial_start: string;
    scanMetrics?: ScanMetrics;
  } | null>(null);

  // Scan detector hook for detecting manual entry vs barcode scan
  const scanDetector = useScanDetector({
    expectedLength: EXPECTED_BARCODE_LENGTH,
    enabled: enforceScanOnly,
    onManualDetected: (metrics) => {
      // Manual entry detected - show rejection
      toast({
        title: "Manual Entry Not Allowed",
        description:
          "Please use a barcode scanner. Manual keyboard entry is not permitted for security.",
        variant: "destructive",
      });
      // Clear input and reset detector
      setInputValue("");
      scanDetectorRef.current.reset();
      // Refocus for next attempt
      setTimeout(() => inputRef.current?.focus(), 100);
    },
    onScanDetected: (metrics) => {
      // Valid scan detected - process will continue via handleSerialComplete
      console.debug("Scan detected with confidence:", metrics.confidence);
    },
  });

  // Store scanDetector in ref to avoid dependency on object reference in callbacks
  // This prevents infinite loops and unnecessary re-renders
  const scanDetectorRef = useRef(scanDetector);
  scanDetectorRef.current = scanDetector;

  // Clear debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  // Fetch games when dialog opens
  useEffect(() => {
    if (open) {
      const fetchGames = async () => {
        setIsLoadingGames(true);
        try {
          const response = await getGames();
          if (response.success && response.data) {
            // Build a map of game_code -> game for quick lookup
            const gameMap = new Map<string, LotteryGameResponse>();
            for (const game of response.data) {
              gameMap.set(game.game_code, game);
            }
            setGamesCache(gameMap);
          }
        } catch (error) {
          console.error("Failed to fetch games:", error);
          // Continue without cache - will show modal for all games
        } finally {
          setIsLoadingGames(false);
        }
      };
      fetchGames();
    }
  }, [open]);

  // Reset form state when dialog closes
  // MCP FE-001: STATE_MANAGEMENT - In controlled mode, DO NOT clear packList
  // (parent owns state and decides when to clear). Only clear internal state.
  useEffect(() => {
    if (!open) {
      // Only clear packList in uncontrolled mode (parent controls in controlled mode)
      if (!isControlled) {
        setInternalPackList([]);
      }
      // Always clear input and transient modal states
      setInputValue("");
      setPendingGameToCreate(null);
      setShowNewGameModal(false);
      scanDetectorRef.current.reset();
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
    }
  }, [open, isControlled]);

  // Focus input when dialog opens (after animation completes)
  useEffect(() => {
    if (open && !isLoadingGames && !showNewGameModal) {
      const timeoutId = setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timeoutId);
    }
  }, [open, isLoadingGames, showNewGameModal]);

  /**
   * Clear input and refocus for next entry
   */
  const clearInputAndFocus = useCallback(() => {
    setInputValue("");
    scanDetectorRef.current.reset();
    // Immediately focus after clearing
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }, []);

  /**
   * Add pack to list after game is validated/created
   * MCP FE-001: STATE_MANAGEMENT - Supports both controlled and uncontrolled modes
   */
  const addPackToList = useCallback(
    (
      serial: string,
      parsed: { game_code: string; pack_number: string; serial_start: string },
      game: LotteryGameResponse,
      scanMetrics?: ScanMetrics,
    ) => {
      const newPack: PackItem = {
        serial,
        game_code: parsed.game_code,
        pack_number: parsed.pack_number,
        serial_start: parsed.serial_start,
        game_name: game.name,
        game_id: game.game_id,
        game_price: game.price ?? undefined,
        game_pack_value: game.pack_value ?? undefined,
        game_total_tickets: game.total_tickets ?? undefined,
        scanMetrics,
        addedAt: Date.now(),
      };

      // Prepend to list (newest first) for immediate visual feedback
      // MCP FE-001: STATE_MANAGEMENT - Use callback in controlled mode, internal state otherwise
      if (isControlled && onPackAdd) {
        onPackAdd(newPack);
      } else {
        setInternalPackList((prev) => [newPack, ...prev]);
      }
      clearInputAndFocus();
    },
    [clearInputAndFocus, isControlled, onPackAdd],
  );

  // State for checking pack existence
  const [isCheckingPack, setIsCheckingPack] = useState(false);

  /**
   * Parse and add serialized number to list
   * Checks game existence immediately - shows modal if game not found
   * Also checks server-side if pack already exists in inventory
   *
   * SECURITY: Only processes if scan detection passed
   */
  const handleSerialComplete = useCallback(
    async (serial: string, scanMetrics?: ScanMetrics): Promise<void> => {
      // Validate format first (client-side)
      if (!/^\d{24}$/.test(serial)) {
        // Not yet 24 digits - wait for more input
        return;
      }

      // SECURITY: Check if scan enforcement is enabled and entry was manual
      if (enforceScanOnly && scanMetrics?.inputMethod === "MANUAL") {
        toast({
          title: "Manual Entry Rejected",
          description: `Detected manual keyboard entry. Please use a barcode scanner.`,
          variant: "destructive",
        });
        clearInputAndFocus();
        return;
      }

      try {
        // Parse serial client-side
        const parsed = parseSerializedNumber(serial);

        // Check if pack already exists in list (duplicate in same session)
        const existingInList = packList.find((p) => p.serial === serial);
        if (existingInList) {
          toast({
            title: "Duplicate pack",
            description: "Pack already exists in reception list",
            variant: "destructive",
          });
          clearInputAndFocus();
          return;
        }

        // Check if pack already exists in database (server-side check)
        setIsCheckingPack(true);
        try {
          const checkResponse = await checkPackExists(
            storeId,
            parsed.pack_number,
          );
          if (checkResponse.success && checkResponse.data?.exists) {
            const existingPack = checkResponse.data.pack;
            toast({
              title: "Pack already in inventory",
              description: `Pack ${parsed.pack_number} already exists${existingPack?.game?.name ? ` (${existingPack.game.name})` : ""} with status: ${existingPack?.status || "Unknown"}`,
              variant: "destructive",
            });
            clearInputAndFocus();
            return;
          }
        } catch (checkError) {
          // Log error but continue - don't block reception if check fails
          console.error("Failed to check pack existence:", checkError);
        } finally {
          setIsCheckingPack(false);
        }

        // Check if game exists in cache
        const game = gamesCache.get(parsed.game_code);
        if (game) {
          // Game exists - add pack to list immediately
          addPackToList(serial, parsed, game, scanMetrics);
        } else {
          // Game not found - show modal to create it
          setPendingGameToCreate({
            serial,
            game_code: parsed.game_code,
            pack_number: parsed.pack_number,
            serial_start: parsed.serial_start,
            scanMetrics,
          });
          setShowNewGameModal(true);
          clearInputAndFocus();
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Invalid serial format";
        toast({
          title: "Invalid serial",
          description: errorMessage,
          variant: "destructive",
        });
        // Clear input on error too
        clearInputAndFocus();
      }
    },
    [
      packList,
      gamesCache,
      storeId,
      toast,
      clearInputAndFocus,
      addPackToList,
      enforceScanOnly,
    ],
  );

  /**
   * Handle keydown event - track keystroke timing for scan detection
   */
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    scanDetectorRef.current.handleKeyDown(e);
  }, []);

  /**
   * Handle paste event - BLOCK paste when scan-only is enforced
   * Barcode scanners do not use paste - they simulate keystrokes.
   * Paste is a manual entry bypass attempt.
   */
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      if (enforceScanOnly) {
        e.preventDefault();
        toast({
          title: "Paste Not Allowed",
          description:
            "Please use a barcode scanner. Pasting is not permitted for security.",
          variant: "destructive",
        });
      }
    },
    [enforceScanOnly, toast],
  );

  /**
   * Handle input change with debouncing and scan detection
   * SECURITY: Real-time blocking of manual entry after enough keystrokes
   */
  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const detector = scanDetectorRef.current;
      const cleanedValue = detector.handleChange(e);

      // SECURITY: Check for manual entry in real-time after just 2 keystrokes
      // Block immediately when we detect slow typing (> 50ms between keys)
      if (enforceScanOnly && cleanedValue.length >= 2) {
        // Use SYNCHRONOUS check to get current keystroke timing data
        const quickCheck = detector.getQuickCheckSync();
        // If not likely a scan, block immediately
        // likelyScan is false when avgRecent > 50ms (typical human typing is 150-300ms)
        if (!quickCheck.likelyScan) {
          toast({
            title: "Manual Entry Not Allowed",
            description:
              "Please use a barcode scanner. Manual keyboard entry is not permitted for security.",
            variant: "destructive",
          });
          // Clear input and reset
          setInputValue("");
          scanDetectorRef.current.reset();
          setTimeout(() => inputRef.current?.focus(), 100);
          return; // Don't process further
        }
      }

      setInputValue(cleanedValue);

      // Clear existing debounce timer
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      // Set new debounce timer
      // Use shorter delay for scanned input (detected by quick check)
      const delay = detector.quickCheck.likelyScan ? 100 : 400;

      debounceTimer.current = setTimeout(() => {
        if (cleanedValue.length === EXPECTED_BARCODE_LENGTH) {
          // Get final scan metrics from current ref value
          const currentDetector = scanDetectorRef.current;
          const metrics = currentDetector.getMetrics();

          // Final check - reject if manual entry detected
          if (enforceScanOnly && currentDetector.shouldReject) {
            toast({
              title: "Manual Entry Not Allowed",
              description:
                "Please use a barcode scanner. Manual keyboard entry is not permitted for security.",
              variant: "destructive",
            });
            setInputValue("");
            scanDetectorRef.current.reset();
            setTimeout(() => inputRef.current?.focus(), 100);
            return;
          }

          handleSerialComplete(cleanedValue, metrics ?? undefined);
        }
      }, delay);
    },
    [handleSerialComplete, enforceScanOnly, toast],
  );

  /**
   * Remove pack from list
   * MCP FE-001: STATE_MANAGEMENT - Supports both controlled and uncontrolled modes
   */
  const handleRemovePack = useCallback(
    (index: number) => {
      if (isControlled && onPackRemove) {
        onPackRemove(index);
      } else {
        setInternalPackList((prev) => prev.filter((_, i) => i !== index));
      }
    },
    [isControlled, onPackRemove],
  );

  /**
   * Handle batch submission
   * Includes scan metrics for server-side validation
   *
   * MCP SEC-014: INPUT_VALIDATION - Validate scan metrics array integrity before submission
   */
  const handleSubmit = useCallback(async () => {
    const serials = packList.map((pack) => pack.serial);
    const scanMetricsArray = packList.map((pack) => pack.scanMetrics);

    if (serials.length === 0) {
      toast({
        title: "No packs to receive",
        description: "Please scan at least one valid pack",
        variant: "destructive",
      });
      return;
    }

    // MCP SEC-014: Validate that ALL packs have scan metrics when enforcement is enabled
    // Filter(Boolean) was causing array length mismatch - server expects 1:1 correlation
    if (enforceScanOnly) {
      const packsWithoutMetrics = packList.filter((pack) => !pack.scanMetrics);
      if (packsWithoutMetrics.length > 0) {
        toast({
          title: "Scan validation error",
          description: `${packsWithoutMetrics.length} pack(s) missing scan data. Please remove and re-scan them.`,
          variant: "destructive",
        });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // Submit all packs via batch API with scan metrics
      // Note: scanMetricsArray is guaranteed to have same length as serials when enforceScanOnly=true
      const response = await receivePackBatch({
        serialized_numbers: serials,
        store_id: storeId,
        // Include scan metrics for server-side validation (array length matches serials)
        scan_metrics: enforceScanOnly
          ? (scanMetricsArray as ScanMetrics[])
          : undefined,
      });

      if (response.success && response.data) {
        const createdCount = response.data.created.length;
        const duplicateCount = response.data.duplicates.length;
        const errorCount = response.data.errors.length;

        if (createdCount > 0) {
          toast({
            title: "Packs received",
            description: `Successfully received ${createdCount} pack(s)${
              duplicateCount > 0
                ? `, ${duplicateCount} duplicate(s) skipped`
                : ""
            }${errorCount > 0 ? `, ${errorCount} error(s)` : ""}`,
          });

          // Reset form - clear packs using appropriate method based on mode
          // MCP FE-001: STATE_MANAGEMENT - Use callback in controlled mode
          if (isControlled && onPacksClear) {
            onPacksClear();
          } else {
            setInternalPackList([]);
          }
          setInputValue("");
          scanDetectorRef.current.reset();
          onOpenChange(false);
          onSuccess?.();
        } else {
          // Build detailed error message
          let errorDetails = "All packs were duplicates or had errors.";
          if (response.data.errors.length > 0) {
            // Show first error for brevity, include serial for debugging
            const firstError = response.data.errors[0];
            errorDetails = `Error: ${firstError.error}`;
            if (response.data.errors.length > 1) {
              errorDetails += ` (+${response.data.errors.length - 1} more errors)`;
            }
          } else if (duplicateCount > 0) {
            errorDetails = `All ${duplicateCount} pack(s) already exist in the system.`;
          }
          toast({
            title: "No packs received",
            description: errorDetails,
            variant: "destructive",
          });
        }
      } else {
        throw new Error("Batch submission failed");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to receive packs";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    packList,
    storeId,
    toast,
    onOpenChange,
    onSuccess,
    enforceScanOnly,
    isControlled,
    onPacksClear,
  ]);

  /**
   * Handle game created callback - add the pack to list after game creation
   */
  const handleGamesCreated = useCallback(
    (
      createdGameCodes: string[],
      createdGames: Map<
        string,
        {
          name: string;
          price: number;
          pack_value: number;
          total_tickets: number;
        }
      >,
    ) => {
      if (!pendingGameToCreate) return;

      // Get the created game data
      const gameData = createdGames.get(pendingGameToCreate.game_code);
      if (gameData) {
        // Create a LotteryGameResponse-like object for the new game
        const newGame: LotteryGameResponse = {
          game_id: "", // Will be fetched from server on submit
          game_code: pendingGameToCreate.game_code,
          name: gameData.name,
          description: null,
          price: gameData.price,
          pack_value: gameData.pack_value,
          total_tickets: gameData.total_tickets,
          status: "ACTIVE",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        // Add to games cache for future lookups
        setGamesCache((prev) => {
          const updated = new Map(prev);
          updated.set(pendingGameToCreate.game_code, newGame);
          return updated;
        });

        // Add the pack to list with scan metrics
        addPackToList(
          pendingGameToCreate.serial,
          pendingGameToCreate,
          newGame,
          pendingGameToCreate.scanMetrics,
        );
      }

      // Clear pending state
      setPendingGameToCreate(null);
    },
    [pendingGameToCreate, addPackToList],
  );

  /**
   * Handle new game modal cancel
   */
  const handleNewGameCancel = useCallback(() => {
    setPendingGameToCreate(null);
    toast({
      title: "Game creation cancelled",
      description: "The pack was not added to the list.",
      variant: "destructive",
    });
  }, [toast]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!isSubmitting) {
      onOpenChange(newOpen);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receive Lottery Packs</DialogTitle>
          <DialogDescription className="sr-only">
            Scan barcodes to receive lottery packs into inventory
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Single Input Field */}
          <div className="space-y-2">
            <label htmlFor="serial-input" className="text-sm font-medium">
              Barcode
            </label>
            <Input
              id="serial-input"
              ref={inputRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Scan barcode..."
              disabled={isSubmitting || isLoadingGames || isCheckingPack}
              maxLength={24}
              data-testid="serial-input"
              className="font-mono"
              aria-label="Scan 24-digit barcode"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            {isLoadingGames && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading games...
              </p>
            )}
            {isCheckingPack && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Checking inventory...
              </p>
            )}
          </div>

          {/* Pack List */}
          {packList.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  Packs Ready to Receive ({packList.length})
                </label>
              </div>
              <div className="border rounded-md divide-y max-h-60 overflow-y-auto">
                {packList.map((pack, index) => (
                  <div
                    key={index}
                    className="p-3 flex items-center justify-between hover:bg-muted/50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {pack.game_name || "Unknown Game"} ({pack.game_code})
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Pack: {pack.pack_number} | $
                        {pack.game_price?.toFixed(2) ?? "0.00"}/ticket
                        {pack.game_total_tickets && (
                          <span className="ml-2">
                            ({pack.game_total_tickets} tickets)
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemovePack(index)}
                      disabled={isSubmitting}
                      data-testid={`remove-pack-${index}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => handleSubmit()}
            disabled={isSubmitting || packList.length === 0}
            data-testid="submit-batch-reception"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Receive {packList.length > 0 ? `${packList.length} ` : ""}Pack
            {packList.length !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* New Game Modal - shown immediately when game code not found on scan */}
      <NewGameModal
        open={showNewGameModal}
        onOpenChange={setShowNewGameModal}
        gamesToCreate={pendingGameToCreate ? [pendingGameToCreate] : []}
        storeId={storeId}
        onGamesCreated={handleGamesCreated}
        onCancel={handleNewGameCancel}
      />
    </Dialog>
  );
}
