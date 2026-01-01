"use client";

/**
 * Day Close Mode Scanner Component
 *
 * Full-page scanner interface for closing lottery as part of day close workflow.
 * Replaces the modal-based approach with a persistent, scannable interface.
 *
 * Story: Lottery Day Close Enhancement - Phase 2
 *
 * Features:
 * - Floating scan bar that stays visible while scrolling
 * - 400ms debounce for scanner detection (fast input = scanner, slow = manual)
 * - Web Audio API notification sounds (success/error)
 * - Direct table row updates on successful scan
 * - Click-to-undo on scanned rows
 * - Real-time progress tracking
 * - Accessibility: ARIA labels, keyboard navigation, focus management
 *
 * MCP Guidance Applied:
 * - FE-002: FORM_VALIDATION - Strict 24-digit validation before processing
 * - SEC-014: INPUT_VALIDATION - Length, type, and format constraints
 * - SEC-004: XSS - React auto-escapes all output
 * - FE-001: STATE_MANAGEMENT - Secure state with useCallback/useMemo
 * - FE-005: UI_SECURITY - No sensitive data exposed in DOM
 *
 * @requirements
 * - Auto-focused scan input for immediate barcode scanner use
 * - Floating scan bar appears when inline input scrolls out of view
 * - Validate serial against pack ranges (ending >= starting, <= serial_end)
 * - Duplicate scan detection
 * - Sound feedback (toggleable, persisted to localStorage)
 * - All bins must be scanned before proceeding
 */

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type ChangeEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useNotificationSound } from "@/hooks/use-notification-sound";
import {
  Loader2,
  Volume2,
  VolumeX,
  X,
  CheckCircle2,
  ArrowRight,
  Scan,
  AlertCircle,
  PenLine,
} from "lucide-react";
import {
  prepareLotteryDayClose,
  type DayBin,
  type PrepareLotteryDayCloseResponse,
} from "@/lib/api/lottery";
import { parseSerializedNumber } from "@/lib/utils/lottery-serial-parser";
import { cn } from "@/lib/utils";
import { ManualEntryAuthModal } from "@/components/lottery/ManualEntryAuthModal";
import { validateManualEntryEnding } from "@/lib/services/lottery-closing-validation";

/**
 * Scanned bin state - tracks which bins have been scanned and their ending serials
 */
export interface ScannedBin {
  bin_id: string;
  bin_number: number;
  pack_id: string;
  pack_number: string;
  game_name: string;
  closing_serial: string;
}

/**
 * Lottery close result data passed to parent on success
 * Now includes pending close data for two-phase commit
 */
export interface LotteryCloseResult {
  /** Number of packs with closing serials */
  closings_created: number;
  /** Business day date string */
  business_day: string;
  /** Estimated lottery total (calculated from scanned serials) */
  lottery_total: number;
  /** Bin breakdown with sales calculations */
  bins_closed: PrepareLotteryDayCloseResponse["bins_preview"];
  /** Day ID for commit-close call */
  day_id?: string;
  /** Pending close expiration time */
  pending_close_expires_at?: string;
}

/**
 * Open shift info for blocking banner display
 */
export interface BlockingShiftInfo {
  shift_id: string;
  terminal_name: string | null;
  cashier_name: string;
  shift_number: number | null;
}

/**
 * Manual entry state interface
 * Tracks manual entry mode activation and authorization
 *
 * MCP Guidance Applied:
 * - FE-001: STATE_MANAGEMENT - Sensitive authorization state managed in memory
 * - SEC-010: AUTHZ - Authorization tracked with user ID for audit
 */
export interface ManualEntryState {
  isActive: boolean;
  authorizedBy: {
    userId: string;
    name: string;
  } | null;
  authorizedAt: Date | null;
}

/**
 * Validation error for a single bin
 */
interface BinValidationError {
  message: string;
}

/**
 * Pending closings data for deferred commit mode
 * Contains everything needed to call the close API later
 */
export interface PendingClosingsData {
  closings: Array<{
    pack_id: string;
    closing_serial: string;
  }>;
  entry_method: "SCAN" | "MANUAL";
  authorized_by_user_id?: string;
}

/**
 * Props interface for DayCloseModeScanner
 */
interface DayCloseModeScannerProps {
  /** Store UUID for API calls */
  storeId: string;
  /** Bins with pack information from useLotteryDayBins hook */
  bins: DayBin[];
  /** Current shift ID - excluded from open shifts check */
  currentShiftId?: string;
  /** Callback when user cancels day close mode */
  onCancel: () => void;
  /** Callback when lottery is successfully closed with data for day-close page */
  onSuccess: (data: LotteryCloseResult) => void;
  /** Optional: External state management for scanned bins (controlled mode) */
  scannedBins?: ScannedBin[];
  /** Optional: Callback for external scanned bins state (controlled mode) */
  onScannedBinsChange?: (bins: ScannedBin[]) => void;
  /** Optional: Open shifts blocking day close (empty array = not blocked) */
  blockingShifts?: BlockingShiftInfo[];
  /**
   * Defer database commit until Step 3 completes
   * When true:
   * - Does NOT call the close API
   * - Calculates totals locally from scanned bins
   * - Returns pending closings data for the parent to commit later
   * - onPendingClosings callback is required when this is true
   */
  deferCommit?: boolean;
  /** Callback with pending closings data when deferCommit is true */
  onPendingClosings?: (data: PendingClosingsData) => void;
}

/**
 * SCANNER_DEBOUNCE_MS - Debounce time for scanner detection
 * Scanner input is typically fast (< 100ms between chars)
 * Manual typing is slower, so we wait 400ms before processing
 */
const SCANNER_DEBOUNCE_MS = 400;

/**
 * SERIAL_LENGTH - Expected length of lottery serial number
 */
const SERIAL_LENGTH = 24;

/**
 * DayCloseModeScanner component
 * Full-page scanner interface for closing lottery during day close
 */
export function DayCloseModeScanner({
  storeId,
  bins,
  currentShiftId,
  onCancel,
  onSuccess,
  scannedBins: externalScannedBins,
  onScannedBinsChange,
  blockingShifts = [],
}: DayCloseModeScannerProps) {
  const { toast } = useToast();
  const { playSuccess, playError, isMuted, toggleMute } =
    useNotificationSound();

  // ============ STATE MANAGEMENT ============
  // Controlled vs uncontrolled pattern for scanned bins
  const [internalScannedBins, setInternalScannedBins] = useState<ScannedBin[]>(
    [],
  );
  const isControlled = externalScannedBins !== undefined;
  const scannedBins = isControlled ? externalScannedBins : internalScannedBins;

  // Keep refs to avoid stale closures
  const externalScannedBinsRef = useRef(externalScannedBins);
  const onScannedBinsChangeRef = useRef(onScannedBinsChange);
  useEffect(() => {
    externalScannedBinsRef.current = externalScannedBins;
    onScannedBinsChangeRef.current = onScannedBinsChange;
  }, [externalScannedBins, onScannedBinsChange]);

  // Wrapper for setting scanned bins - handles controlled/uncontrolled
  const setScannedBins = useCallback(
    (updater: ScannedBin[] | ((prev: ScannedBin[]) => ScannedBin[])) => {
      if (isControlled) {
        const currentBins = externalScannedBinsRef.current ?? [];
        const newValue =
          typeof updater === "function" ? updater(currentBins) : updater;
        onScannedBinsChangeRef.current?.(newValue);
      } else {
        setInternalScannedBins(updater);
      }
    },
    [isControlled],
  );

  const [inputValue, setInputValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFloatingBar, setShowFloatingBar] = useState(false);
  const [lastScannedBinId, setLastScannedBinId] = useState<string | null>(null);

  // Manual entry state management
  const [manualEntryAuthModalOpen, setManualEntryAuthModalOpen] =
    useState(false);
  const [manualEntryState, setManualEntryState] = useState<ManualEntryState>({
    isActive: false,
    authorizedBy: null,
    authorizedAt: null,
  });

  // Manual entry values - keyed by bin_id (3-digit ending serials)
  const [manualEndingValues, setManualEndingValues] = useState<
    Record<string, string>
  >({});

  // Validation errors for manual entry - keyed by bin_id
  const [validationErrors, setValidationErrors] = useState<
    Record<string, BinValidationError>
  >({});

  // Track bins with pending validation (validation in flight)
  // Prevents race condition where button enables before validation completes
  const [pendingValidations, setPendingValidations] = useState<Set<string>>(
    new Set(),
  );

  // Validation error modal state
  const [validationErrorModal, setValidationErrorModal] = useState<{
    open: boolean;
    binNumber: number | null;
    message: string;
  }>({ open: false, binNumber: null, message: "" });

  // Refs for DOM and timers
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const floatingInputRef = useRef<HTMLInputElement>(null);
  const inlineScanSectionRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Refs for manual entry input focus management
  const manualInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const hasAppliedManualFocus = useRef(false);
  const prevManualEntryMode = useRef(manualEntryState.isActive);

  // ============ COMPUTED VALUES ============
  // Get bins with active packs (need scanning)
  const activeBins = useMemo(
    () => bins.filter((bin) => bin.is_active && bin.pack),
    [bins],
  );

  // Get pending bins (not yet scanned)
  const pendingBins = useMemo(
    () =>
      activeBins.filter(
        (bin) => !scannedBins.find((scanned) => scanned.bin_id === bin.bin_id),
      ),
    [activeBins, scannedBins],
  );

  // Progress percentage
  const progressPercent = useMemo(() => {
    if (activeBins.length === 0) return 0;
    return Math.round((scannedBins.length / activeBins.length) * 100);
  }, [scannedBins.length, activeBins.length]);

  // Can proceed to next step? (either all scanned OR all manual entries valid)
  const allBinsScanned =
    activeBins.length > 0 && scannedBins.length === activeBins.length;

  // Get sorted active bin IDs for focus management
  const sortedActiveBinIds = useMemo(
    () =>
      [...activeBins]
        .sort((a, b) => a.bin_number - b.bin_number)
        .map((bin) => bin.bin_id),
    [activeBins],
  );

  // Check if all active bins have valid 3-digit ending values in manual entry mode
  // Bins that were scanned already have their values; remaining bins need manual input
  // Also ensures no pending validations are in flight (prevents race condition)
  const canCloseManualEntry = useMemo(() => {
    if (!manualEntryState.isActive) return false;
    if (Object.keys(validationErrors).length > 0) return false;
    if (pendingValidations.size > 0) return false; // Wait for validations to complete
    if (activeBins.length === 0) return false;

    return activeBins.every((bin) => {
      // Check if this bin was already scanned
      const scannedBin = scannedBins.find((s) => s.bin_id === bin.bin_id);
      if (scannedBin) return true; // Already has a valid closing serial

      // Otherwise check manual entry value
      const value = manualEndingValues[bin.bin_id];
      return value && /^\d{3}$/.test(value);
    });
  }, [
    manualEntryState.isActive,
    activeBins,
    scannedBins,
    manualEndingValues,
    validationErrors,
    pendingValidations,
  ]);

  // Is scanning blocked by open shifts?
  const isBlocked = blockingShifts.length > 0;

  // ============ SCROLL DETECTION FOR FLOATING BAR ============
  useEffect(() => {
    const handleScroll = () => {
      if (!inlineScanSectionRef.current) return;
      const rect = inlineScanSectionRef.current.getBoundingClientRect();
      const isHidden = rect.bottom < 0;
      setShowFloatingBar(isHidden);

      // Focus floating input when bar appears
      if (isHidden && floatingInputRef.current) {
        floatingInputRef.current.focus();
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // ============ CLEANUP ============
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // ============ AUTO-FOCUS ON MOUNT ============
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      inlineInputRef.current?.focus();
    }, 150);
    return () => clearTimeout(timeoutId);
  }, []);

  // ============ CLEAR FLASH ANIMATION ============
  useEffect(() => {
    if (lastScannedBinId) {
      const timeoutId = setTimeout(() => {
        setLastScannedBinId(null);
      }, 800);
      return () => clearTimeout(timeoutId);
    }
  }, [lastScannedBinId]);

  // ============ MANUAL ENTRY MODE FOCUS MANAGEMENT ============
  // Focus first unscanned bin input when manual entry mode is activated
  useEffect(() => {
    const wasJustActivated =
      manualEntryState.isActive && !prevManualEntryMode.current;
    prevManualEntryMode.current = manualEntryState.isActive;

    if (!manualEntryState.isActive) {
      hasAppliedManualFocus.current = false;
      return;
    }

    if (
      wasJustActivated &&
      !hasAppliedManualFocus.current &&
      sortedActiveBinIds.length > 0
    ) {
      hasAppliedManualFocus.current = true;

      // Find first bin that hasn't been scanned yet
      const firstUnscannedBinId = sortedActiveBinIds.find(
        (binId) => !scannedBins.find((s) => s.bin_id === binId),
      );

      if (firstUnscannedBinId) {
        setTimeout(() => {
          const firstInput = manualInputRefs.current.get(firstUnscannedBinId);
          if (firstInput) {
            firstInput.focus();
          }
        }, 100);
      }
    }
  }, [manualEntryState.isActive, sortedActiveBinIds, scannedBins]);

  /**
   * Clear input and refocus for next scan
   * MCP: FE-001 STATE_MANAGEMENT - Clean state transitions
   */
  const clearInputAndFocus = useCallback(
    (inputRef: React.RefObject<HTMLInputElement | null>) => {
      setInputValue("");
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    },
    [],
  );

  /**
   * Process a complete 24-digit serial number
   * MCP: FE-002 FORM_VALIDATION, SEC-014 INPUT_VALIDATION
   */
  const processSerial = useCallback(
    (serial: string, inputRef: React.RefObject<HTMLInputElement | null>) => {
      // Validate format
      if (!/^\d{24}$/.test(serial)) {
        return; // Not complete yet
      }

      try {
        // Parse serial client-side
        const parsed = parseSerializedNumber(serial);
        const packNumber = parsed.pack_number;
        const closingSerial = parsed.serial_start; // Positions 12-14

        // Find matching bin by pack number
        const matchingBin = activeBins.find(
          (bin) => bin.pack && bin.pack.pack_number === packNumber,
        );

        if (!matchingBin || !matchingBin.pack) {
          playError();
          toast({
            title: "Pack not found",
            description: `No active pack matching ${packNumber}`,
            variant: "destructive",
          });
          clearInputAndFocus(inputRef);
          return;
        }

        // Check if already scanned
        const alreadyScanned = scannedBins.find(
          (scanned) => scanned.bin_id === matchingBin.bin_id,
        );
        if (alreadyScanned) {
          playError();
          toast({
            title: "Duplicate scan",
            description: `Bin ${matchingBin.bin_number} has already been scanned`,
            variant: "destructive",
          });
          clearInputAndFocus(inputRef);
          return;
        }

        // Validate closing serial range
        const closingSerialNum = parseInt(closingSerial, 10);
        const startingSerialNum = parseInt(
          matchingBin.pack.starting_serial,
          10,
        );
        const serialEndNum = parseInt(matchingBin.pack.serial_end, 10);

        if (closingSerialNum < startingSerialNum) {
          playError();
          toast({
            title: "Invalid ending serial",
            description: `Ending ${closingSerial} is less than starting ${matchingBin.pack.starting_serial}`,
            variant: "destructive",
          });
          clearInputAndFocus(inputRef);
          return;
        }

        if (closingSerialNum > serialEndNum) {
          playError();
          toast({
            title: "Invalid ending serial",
            description: `Ending ${closingSerial} exceeds pack max ${matchingBin.pack.serial_end}`,
            variant: "destructive",
          });
          clearInputAndFocus(inputRef);
          return;
        }

        // Success! Add to scanned list
        const newScannedBin: ScannedBin = {
          bin_id: matchingBin.bin_id,
          bin_number: matchingBin.bin_number,
          pack_id: matchingBin.pack.pack_id,
          pack_number: matchingBin.pack.pack_number,
          game_name: matchingBin.pack.game_name,
          closing_serial: closingSerial,
        };

        setScannedBins((prev) =>
          [...prev, newScannedBin].sort((a, b) => a.bin_number - b.bin_number),
        );
        setLastScannedBinId(matchingBin.bin_id);
        clearInputAndFocus(inputRef);

        // Success feedback
        playSuccess();
        toast({
          title: "Bin scanned",
          description: `Bin ${matchingBin.bin_number} - ${matchingBin.pack.game_name} (${closingSerial})`,
        });

        // Scroll row into view
        const row = document.getElementById(`bin-row-${matchingBin.bin_id}`);
        if (row) {
          row.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Invalid serial format";
        playError();
        toast({
          title: "Invalid serial",
          description: errorMessage,
          variant: "destructive",
        });
        clearInputAndFocus(inputRef);
      }
    },
    [
      activeBins,
      scannedBins,
      setScannedBins,
      toast,
      clearInputAndFocus,
      playSuccess,
      playError,
    ],
  );

  /**
   * Handle input change with debouncing for scanner detection
   * MCP: SEC-014 INPUT_VALIDATION - Sanitize input
   */
  const handleInputChange = useCallback(
    (
      e: ChangeEvent<HTMLInputElement>,
      inputRef: React.RefObject<HTMLInputElement | null>,
    ) => {
      const cleanedValue = e.target.value.replace(/\D/g, ""); // Only digits
      setInputValue(cleanedValue);

      // Clear existing debounce
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Set new debounce timer
      debounceTimerRef.current = setTimeout(() => {
        if (cleanedValue.length === SERIAL_LENGTH) {
          processSerial(cleanedValue, inputRef);
        }
      }, SCANNER_DEBOUNCE_MS);
    },
    [processSerial],
  );

  /**
   * Remove scanned bin (undo)
   */
  const handleRemoveBin = useCallback(
    (binId: string) => {
      setScannedBins((prev) => prev.filter((bin) => bin.bin_id !== binId));
      inlineInputRef.current?.focus();
    },
    [setScannedBins],
  );

  // ============ MANUAL ENTRY HANDLERS ============

  /**
   * Handle Manual Entry button click
   * Opens the auth modal for PIN verification
   */
  const handleManualEntryClick = useCallback(() => {
    setManualEntryAuthModalOpen(true);
  }, []);

  /**
   * Handle Manual Entry authorization success
   * Pre-populate manual entry values with already-scanned bin values
   */
  const handleManualEntryAuthorized = useCallback(
    (authorizedBy: { userId: string; name: string }) => {
      // Pre-populate manualEndingValues with scanned bin values
      const prePopulatedValues: Record<string, string> = {};
      scannedBins.forEach((scannedBin) => {
        prePopulatedValues[scannedBin.bin_id] = scannedBin.closing_serial;
      });

      setManualEntryState({
        isActive: true,
        authorizedBy,
        authorizedAt: new Date(),
      });
      setManualEntryAuthModalOpen(false);
      setManualEndingValues(prePopulatedValues);
      setValidationErrors({});
      setPendingValidations(new Set());

      toast({
        title: "Manual Entry Enabled",
        description: `Authorized by ${authorizedBy.name}. You can now enter ending serial numbers.`,
      });
    },
    [scannedBins, toast],
  );

  /**
   * Handle cancel/exit manual entry mode
   */
  const handleCancelManualEntry = useCallback(() => {
    setManualEntryState({
      isActive: false,
      authorizedBy: null,
      authorizedAt: null,
    });
    setManualEndingValues({});
    setValidationErrors({});
    setPendingValidations(new Set());

    toast({
      title: "Manual Entry Cancelled",
      description: "Manual entry mode has been deactivated.",
    });
  }, [toast]);

  /**
   * Store manual input ref for focus management
   */
  const setManualInputRef = useCallback(
    (binId: string, element: HTMLInputElement | null) => {
      if (element) {
        manualInputRefs.current.set(binId, element);
      } else {
        manualInputRefs.current.delete(binId);
      }
    },
    [],
  );

  /**
   * Handle manual ending value change
   * Only allows numeric input, max 3 digits, validates on 3 digits, auto-advances focus
   * MCP: SEC-014 INPUT_VALIDATION - Strict format constraints
   * MCP: FE-002 FORM_VALIDATION - Validate immediately when complete input detected
   */
  const handleManualEndingChange = useCallback(
    (binId: string, value: string) => {
      // Strip non-numeric characters
      const sanitizedValue = value.replace(/\D/g, "");
      // Enforce max length of 3 digits
      const truncatedValue = sanitizedValue.slice(0, 3);

      setManualEndingValues((prev) => ({
        ...prev,
        [binId]: truncatedValue,
      }));

      // When 3 digits entered: validate immediately, then auto-advance focus
      if (truncatedValue.length === 3) {
        // Find the bin to get pack data for validation
        const bin = activeBins.find((b) => b.bin_id === binId);
        if (bin?.pack) {
          // Mark this bin as having validation in progress
          setPendingValidations((prev) => new Set(prev).add(binId));

          // Validate immediately when 3 digits entered (don't wait for blur)
          validateManualEntryEnding(truncatedValue, {
            starting_serial: bin.pack.starting_serial,
            serial_end: bin.pack.serial_end,
          }).then((result) => {
            // Remove from pending validations
            setPendingValidations((prev) => {
              const next = new Set(prev);
              next.delete(binId);
              return next;
            });

            if (result.valid) {
              // Clear any existing error for this bin
              setValidationErrors((prev) => {
                const { [binId]: _, ...rest } = prev;
                return rest;
              });
            } else {
              // Set error state and show modal
              const errorMessage = result.error || "Invalid ending number";
              setValidationErrors((prev) => ({
                ...prev,
                [binId]: { message: errorMessage },
              }));
              setValidationErrorModal({
                open: true,
                binNumber: bin.bin_number,
                message: errorMessage,
              });
            }
          });
        }

        // Auto-advance to next bin that needs input (not scanned, and after current bin)
        const currentIndex = sortedActiveBinIds.indexOf(binId);
        if (currentIndex !== -1) {
          for (let i = currentIndex + 1; i < sortedActiveBinIds.length; i++) {
            // eslint-disable-next-line security/detect-object-injection -- Array index access is safe with controlled loop
            const nextBinId = sortedActiveBinIds[i];
            // Skip bins that were already scanned
            if (scannedBins.find((s) => s.bin_id === nextBinId)) {
              continue;
            }
            const nextInput = manualInputRefs.current.get(nextBinId);
            if (nextInput) {
              setTimeout(() => nextInput.focus(), 50);
              break;
            }
          }
        }
      } else {
        // Clear error when user is typing (less than 3 digits)
        setValidationErrors((prev) => {
          const { [binId]: _, ...rest } = prev;
          return rest;
        });
      }
    },
    [sortedActiveBinIds, scannedBins, activeBins],
  );

  /**
   * Handle manual input blur - validate ending serial against pack range
   * Shows validation error in a modal dialog to avoid layout disruption
   * MCP: FE-002 FORM_VALIDATION - Validate on blur for immediate feedback
   */
  const handleManualInputBlur = useCallback(
    async (
      binId: string,
      binNumber: number,
      value: string,
      pack: { starting_serial: string; serial_end: string },
    ) => {
      // Only validate if we have 3 digits (complete entry)
      if (value.length !== 3) return;

      const result = await validateManualEntryEnding(value, {
        starting_serial: pack.starting_serial,
        serial_end: pack.serial_end,
      });

      if (result.valid) {
        // Clear any existing error for this bin
        setValidationErrors((prev) => {
          const { [binId]: _, ...rest } = prev;
          return rest;
        });
      } else {
        // Set error state and show modal
        const errorMessage = result.error || "Invalid ending number";
        setValidationErrors((prev) => ({
          ...prev,
          [binId]: { message: errorMessage },
        }));
        // Show error in modal
        setValidationErrorModal({
          open: true,
          binNumber,
          message: errorMessage,
        });
      }
    },
    [],
  );

  /**
   * Submit closing data to API (scan mode)
   * Now uses two-phase commit: prepare-close stores pending data,
   * actual commit happens in Step 3 when day close is confirmed.
   * MCP: API-001 VALIDATION - Validated data to backend
   */
  const handleSubmit = useCallback(async () => {
    if (!allBinsScanned) {
      toast({
        title: "Incomplete scan",
        description: "Please scan all active bins before closing lottery",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const closings = scannedBins.map((bin) => ({
        pack_id: bin.pack_id,
        closing_serial: bin.closing_serial,
      }));

      // Phase 1: Prepare close - validates and stores pending data
      // Does NOT commit lottery records - that happens in Step 3
      const response = await prepareLotteryDayClose(storeId, {
        closings,
        entry_method: "SCAN",
        current_shift_id: currentShiftId,
      });

      if (response.success && response.data) {
        playSuccess();
        toast({
          title: "Lottery scanning complete",
          description: `Scanned ${response.data.closings_count} pack(s). Complete day close in Step 3 to finalize.`,
        });

        // Reset state and notify parent with prepare response data
        setScannedBins([]);
        setInputValue("");
        onSuccess({
          closings_created: response.data.closings_count,
          business_day: response.data.business_date,
          lottery_total: response.data.estimated_lottery_total,
          bins_closed: response.data.bins_preview,
          day_id: response.data.day_id,
          pending_close_expires_at: response.data.pending_close_expires_at,
        });
      } else {
        throw new Error("Failed to prepare lottery close");
      }
    } catch (error) {
      playError();

      // Check for specific error codes
      const apiError = error as {
        code?: string;
        message?: string;
      };

      if (apiError.code === "SHIFTS_STILL_OPEN") {
        toast({
          title: "Cannot Close Lottery",
          description:
            "All shifts must be closed before lottery can be closed.",
          variant: "destructive",
        });
      } else {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to prepare lottery close";
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [
    allBinsScanned,
    scannedBins,
    setScannedBins,
    storeId,
    currentShiftId,
    toast,
    onSuccess,
    playSuccess,
    playError,
  ]);

  /**
   * Submit closing data from manual entry mode to API
   * Now uses two-phase commit: prepare-close stores pending data,
   * actual commit happens in Step 3 when day close is confirmed.
   * Combines already-scanned bins with manually entered values
   * Includes audit trail with authorizing user
   */
  const handleManualSubmit = useCallback(async () => {
    if (!canCloseManualEntry) {
      toast({
        title: "Incomplete entry",
        description: "Please enter valid 3-digit ending serials for all bins",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Build closings array: combine scanned bins + manually entered values
      const closings = activeBins.map((bin) => {
        // Check if this bin was scanned
        const scannedBin = scannedBins.find((s) => s.bin_id === bin.bin_id);
        if (scannedBin) {
          return {
            pack_id: scannedBin.pack_id,
            closing_serial: scannedBin.closing_serial,
          };
        }
        // Otherwise use manual entry value
        return {
          pack_id: bin.pack!.pack_id,
          closing_serial: manualEndingValues[bin.bin_id],
        };
      });

      // Phase 1: Prepare close - validates and stores pending data
      // Does NOT commit lottery records - that happens in Step 3
      const response = await prepareLotteryDayClose(storeId, {
        closings,
        entry_method: "MANUAL",
        current_shift_id: currentShiftId,
        // Include audit trail - the backend will record who authorized
        authorized_by_user_id: manualEntryState.authorizedBy?.userId,
      });

      if (response.success && response.data) {
        playSuccess();
        toast({
          title: "Lottery entry complete",
          description: `Entered ${response.data.closings_count} pack(s) via manual entry. Complete day close in Step 3 to finalize.`,
        });

        // Reset all state and notify parent with prepare response data
        setScannedBins([]);
        setInputValue("");
        setManualEntryState({
          isActive: false,
          authorizedBy: null,
          authorizedAt: null,
        });
        setManualEndingValues({});
        setValidationErrors({});
        setPendingValidations(new Set());

        onSuccess({
          closings_created: response.data.closings_count,
          business_day: response.data.business_date,
          lottery_total: response.data.estimated_lottery_total,
          bins_closed: response.data.bins_preview,
          day_id: response.data.day_id,
          pending_close_expires_at: response.data.pending_close_expires_at,
        });
      } else {
        throw new Error("Failed to prepare lottery close");
      }
    } catch (error) {
      playError();

      const apiError = error as { code?: string; message?: string };
      if (apiError.code === "SHIFTS_STILL_OPEN") {
        toast({
          title: "Cannot Close Lottery",
          description:
            "All shifts must be closed before lottery can be closed.",
          variant: "destructive",
        });
      } else {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to prepare lottery close";
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [
    canCloseManualEntry,
    activeBins,
    scannedBins,
    setScannedBins,
    manualEndingValues,
    manualEntryState.authorizedBy,
    storeId,
    currentShiftId,
    toast,
    onSuccess,
    playSuccess,
    playError,
  ]);

  /**
   * Calculate total lottery sales from scanned bins + manual entry values
   */
  const calculateTotalSales = useMemo(() => {
    return activeBins.reduce((total, bin) => {
      if (!bin.pack) return total;

      // First check scanned bins
      const scannedBin = scannedBins.find((s) => s.bin_id === bin.bin_id);
      let closingSerial: string | undefined;

      if (scannedBin) {
        closingSerial = scannedBin.closing_serial;
      } else if (manualEntryState.isActive && manualEndingValues[bin.bin_id]) {
        closingSerial = manualEndingValues[bin.bin_id];
      }

      if (!closingSerial || closingSerial.length !== 3) return total;

      const closingNum = parseInt(closingSerial, 10);
      const startingNum = parseInt(bin.pack.starting_serial, 10);
      const ticketsSold = Math.max(0, closingNum - startingNum + 1);
      return total + ticketsSold * bin.pack.game_price;
    }, 0);
  }, [activeBins, scannedBins, manualEntryState.isActive, manualEndingValues]);

  // ============ RENDER ============
  return (
    <div className="relative" data-testid="day-close-mode-scanner">
      {/* Floating Scan Bar (Fixed at top when scrolled) */}
      <div
        className={cn(
          "fixed top-0 left-0 right-0 z-40 bg-primary text-primary-foreground shadow-lg transition-transform duration-300",
          showFloatingBar ? "translate-y-0" : "-translate-y-full",
        )}
        data-testid="floating-scan-bar"
      >
        <div className="max-w-7xl mx-auto px-6 py-3">
          <div className="flex items-center gap-4">
            {/* Title */}
            <div className="flex items-center gap-2 shrink-0">
              <Scan className="w-5 h-5" />
              <span className="font-semibold">Close Lottery</span>
            </div>

            {/* Input */}
            <div className="flex-1 relative">
              <Input
                ref={floatingInputRef}
                type="text"
                value={inputValue}
                onChange={(e) => handleInputChange(e, floatingInputRef)}
                placeholder="Scan barcode..."
                maxLength={SERIAL_LENGTH}
                disabled={isSubmitting}
                className="w-full text-lg font-mono bg-white text-foreground border-2 border-white focus:border-primary/50"
                data-testid="floating-serial-input"
                aria-label="Scan lottery serial number"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">
                {inputValue.length}/{SERIAL_LENGTH}
              </span>
            </div>

            {/* Counter */}
            <div className="text-center px-3 shrink-0">
              <div className="text-2xl font-bold">
                {scannedBins.length}/{activeBins.length}
              </div>
              <div className="text-xs opacity-80">Scanned</div>
            </div>

            {/* Sound Toggle */}
            <button
              type="button"
              onClick={toggleMute}
              className="p-2 hover:bg-primary/80 rounded-md shrink-0"
              title={isMuted ? "Enable scan sounds" : "Disable scan sounds"}
              aria-label={
                isMuted ? "Enable scan sounds" : "Disable scan sounds"
              }
              data-testid="floating-sound-toggle"
            >
              {isMuted ? (
                <VolumeX className="w-6 h-6" />
              ) : (
                <Volume2 className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Blocking Banner - Open Shifts Prevent Day Close */}
      {isBlocked && (
        <div
          className="mb-4 rounded-lg border-2 border-destructive bg-destructive/10 p-4"
          data-testid="open-shifts-blocking-banner"
          role="alert"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <AlertCircle
              className="h-6 w-6 text-destructive flex-shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <h3 className="font-semibold text-destructive">
                Cannot Close Day – Open Shifts Found
              </h3>
              {blockingShifts.map((shift) => (
                <p
                  key={shift.shift_id}
                  className="text-sm text-muted-foreground"
                >
                  {shift.terminal_name || "Unknown Terminal"} • Shift #
                  {shift.shift_number || "?"} • {shift.cashier_name}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div
        className={cn(
          "bg-card rounded-lg border overflow-hidden flex flex-col max-h-[calc(100vh-280px)]",
          isBlocked && "opacity-60 pointer-events-none",
        )}
      >
        {/* Sticky Header with scan input - stays at top when scrolling */}
        <div className="sticky top-0 z-20 bg-card border-b shadow-sm">
          {/* Title and controls */}
          <div className="px-6 py-4 border-b bg-muted/30">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">
                  Close Lottery
                  {manualEntryState.isActive && (
                    <span className="ml-2 text-sm font-normal text-amber-600 dark:text-amber-400">
                      (Manual Entry Mode)
                    </span>
                  )}
                </h2>
                <p className="text-muted-foreground">
                  {isBlocked
                    ? "Scanning disabled – close all shifts first"
                    : manualEntryState.isActive
                      ? `Manual entry enabled by ${manualEntryState.authorizedBy?.name}. Enter 3-digit ending serials.`
                      : "Scan the barcode on the current ticket of each active bin"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-muted-foreground">
                  <span className="text-lg font-bold text-primary">
                    {scannedBins.length}
                  </span>
                  /{activeBins.length} scanned
                </span>

                {/* Manual Entry Button - only show when not in manual mode */}
                {!manualEntryState.isActive && !isBlocked && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleManualEntryClick}
                    disabled={isSubmitting}
                    data-testid="manual-entry-button"
                  >
                    <PenLine className="mr-2 h-4 w-4" />
                    Manual Entry
                  </Button>
                )}

                {/* Cancel Manual Entry Button */}
                {manualEntryState.isActive && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelManualEntry}
                    disabled={isSubmitting}
                    data-testid="cancel-manual-entry-button"
                  >
                    <X className="mr-2 h-4 w-4" />
                    Exit Manual Mode
                  </Button>
                )}

                <button
                  type="button"
                  onClick={toggleMute}
                  className="p-2 hover:bg-muted rounded-md"
                  title={isMuted ? "Enable scan sounds" : "Disable scan sounds"}
                  aria-label={
                    isMuted ? "Enable scan sounds" : "Disable scan sounds"
                  }
                  data-testid="inline-sound-toggle"
                >
                  {isMuted ? (
                    <VolumeX className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <Volume2 className="w-5 h-5 text-green-600" />
                  )}
                </button>
              </div>
            </div>

            {/* Inline Scan Input - hide in manual entry mode */}
            {!manualEntryState.isActive && (
              <div ref={inlineScanSectionRef} className="mt-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1 relative">
                    <Input
                      ref={inlineInputRef}
                      type="text"
                      value={inputValue}
                      onChange={(e) => handleInputChange(e, inlineInputRef)}
                      placeholder="Scan barcode or enter 24-digit serial..."
                      maxLength={SERIAL_LENGTH}
                      disabled={isSubmitting}
                      className="w-full text-lg font-mono"
                      data-testid="inline-serial-input"
                      aria-label="Enter 24-digit serialized number"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-mono">
                      {inputValue.length}/{SERIAL_LENGTH}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Progress Bar */}
          <div className="px-6 py-3 bg-muted/10">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">Progress</span>
              <Progress value={progressPercent} className="flex-1" />
              <span className="text-sm text-muted-foreground">
                {progressPercent}%
              </span>
            </div>
          </div>
        </div>

        {/* Bins Table - scrollable content */}
        <div className="overflow-x-auto flex-1 overflow-y-auto">
          <table className="w-full">
            <thead className="bg-card border-b sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">
                  Bin
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">
                  Game
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">
                  Price
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">
                  Pack #
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">
                  Starting
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">
                  Ending
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">
                  Sold
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {activeBins
                .sort((a, b) => a.bin_number - b.bin_number)
                .map((bin) => {
                  const scannedBin = scannedBins.find(
                    (s) => s.bin_id === bin.bin_id,
                  );
                  const isScanned = !!scannedBin;
                  const isJustScanned = lastScannedBinId === bin.bin_id;

                  // Get manual entry value and validation error
                  const manualValue = manualEndingValues[bin.bin_id] || "";
                  const validationError = validationErrors[bin.bin_id];
                  const hasError = !!validationError;

                  // Calculate sold and amount from either scanned or manual entry
                  let ticketsSold = 0;
                  let salesAmount = 0;
                  let closingSerial: string | undefined;

                  if (isScanned && bin.pack) {
                    closingSerial = scannedBin.closing_serial;
                  } else if (
                    manualEntryState.isActive &&
                    manualValue.length === 3 &&
                    bin.pack
                  ) {
                    closingSerial = manualValue;
                  }

                  if (closingSerial && bin.pack) {
                    const closingNum = parseInt(closingSerial, 10);
                    const startingNum = parseInt(bin.pack.starting_serial, 10);
                    ticketsSold = Math.max(0, closingNum - startingNum + 1);
                    salesAmount = ticketsSold * bin.pack.game_price;
                  }

                  const hasValidEntry = !!closingSerial;

                  return (
                    <tr
                      key={bin.bin_id}
                      id={`bin-row-${bin.bin_id}`}
                      className={cn(
                        "transition-colors",
                        isScanned && !manualEntryState.isActive
                          ? "bg-green-50 dark:bg-green-950/20 cursor-pointer hover:bg-green-100 dark:hover:bg-green-950/30"
                          : manualEntryState.isActive && hasValidEntry
                            ? "bg-green-50 dark:bg-green-950/20"
                            : "hover:bg-muted/50",
                        isJustScanned && "animate-pulse",
                        manualEntryState.isActive &&
                          !isScanned &&
                          "bg-amber-50/30 dark:bg-amber-950/10",
                      )}
                      onClick={() =>
                        !manualEntryState.isActive &&
                        isScanned &&
                        handleRemoveBin(bin.bin_id)
                      }
                      title={
                        !manualEntryState.isActive && isScanned
                          ? "Click to undo scan"
                          : undefined
                      }
                      data-testid={`bin-row-${bin.bin_id}`}
                    >
                      <td className="px-4 py-3 font-mono font-semibold">
                        {bin.bin_number}
                      </td>
                      <td className="px-4 py-3">{bin.pack?.game_name}</td>
                      <td className="px-4 py-3">
                        ${bin.pack?.game_price.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {bin.pack?.pack_number}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {bin.pack?.starting_serial}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {/* In manual entry mode, show editable inputs for unscanned bins */}
                        {manualEntryState.isActive && !isScanned && bin.pack ? (
                          <div className="flex flex-col gap-1">
                            <Input
                              ref={(el) => setManualInputRef(bin.bin_id, el)}
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              maxLength={3}
                              value={manualValue}
                              onChange={(e) =>
                                handleManualEndingChange(
                                  bin.bin_id,
                                  e.target.value,
                                )
                              }
                              onBlur={() =>
                                handleManualInputBlur(
                                  bin.bin_id,
                                  bin.bin_number,
                                  manualValue,
                                  {
                                    starting_serial: bin.pack!.starting_serial,
                                    serial_end: bin.pack!.serial_end,
                                  },
                                )
                              }
                              onClick={(e) => e.stopPropagation()}
                              placeholder="000"
                              disabled={isSubmitting}
                              className={cn(
                                "w-16 h-8 text-center font-mono font-bold text-sm",
                                hasError
                                  ? "border-red-500 bg-red-50 dark:bg-red-950/20 focus:border-red-500 focus:ring-red-500"
                                  : manualValue.length === 3
                                    ? "border-green-500 bg-green-50 dark:bg-green-950/20"
                                    : "border-amber-500 bg-amber-50/50 dark:bg-amber-950/20",
                              )}
                              data-testid={`manual-ending-input-${bin.bin_id}`}
                              aria-label={`Ending serial for bin ${bin.bin_number}`}
                              aria-invalid={hasError}
                            />
                          </div>
                        ) : isScanned ||
                          (manualEntryState.isActive &&
                            manualValue.length === 3) ? (
                          <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 font-bold">
                            <CheckCircle2 className="w-4 h-4" />
                            {isScanned
                              ? scannedBin.closing_serial
                              : manualValue}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">---</span>
                        )}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right",
                          hasValidEntry ? "" : "text-muted-foreground",
                        )}
                      >
                        {hasValidEntry ? ticketsSold : "-"}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right font-semibold",
                          hasValidEntry
                            ? "text-green-600 dark:text-green-400"
                            : "text-muted-foreground",
                        )}
                      >
                        {hasValidEntry ? `$${salesAmount.toFixed(2)}` : "-"}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
            {/* Show footer when we have any valid entries (scanned or manual) */}
            {(scannedBins.length > 0 ||
              (manualEntryState.isActive &&
                Object.keys(manualEndingValues).some(
                  // eslint-disable-next-line security/detect-object-injection -- Object key from Object.keys is safe
                  (id) => manualEndingValues[id]?.length === 3,
                ))) && (
              <tfoot className="bg-muted/50 font-semibold">
                <tr>
                  <td colSpan={6} className="px-4 py-3 text-right">
                    Total Lottery Sales:
                  </td>
                  <td className="px-4 py-3 text-right">
                    {/* Calculate total tickets sold from all sources */}
                    {activeBins.reduce((total, bin) => {
                      if (!bin.pack) return total;
                      const scannedBin = scannedBins.find(
                        (s) => s.bin_id === bin.bin_id,
                      );
                      let closingSerial: string | undefined;
                      if (scannedBin) {
                        closingSerial = scannedBin.closing_serial;
                      } else if (
                        manualEntryState.isActive &&
                        manualEndingValues[bin.bin_id]?.length === 3
                      ) {
                        closingSerial = manualEndingValues[bin.bin_id];
                      }
                      if (!closingSerial) return total;
                      const closingNum = parseInt(closingSerial, 10);
                      const startingNum = parseInt(
                        bin.pack.starting_serial,
                        10,
                      );
                      return total + Math.max(0, closingNum - startingNum + 1);
                    }, 0)}
                  </td>
                  <td className="px-4 py-3 text-right text-lg text-green-600 dark:text-green-400">
                    ${calculateTotalSales.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* All Scanned Success Banner (scan mode only) */}
        {!manualEntryState.isActive && allBinsScanned && (
          <div
            className="px-6 py-3 bg-green-50 dark:bg-green-950/20 border-t border-green-200 dark:border-green-800"
            data-testid="all-scanned-banner"
          >
            <p className="text-center font-medium text-green-700 dark:text-green-400 flex items-center justify-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              All bins scanned - Ready to close lottery
            </p>
          </div>
        )}

        {/* Manual Entry Ready Banner */}
        {manualEntryState.isActive && canCloseManualEntry && (
          <div
            className="px-6 py-3 bg-green-50 dark:bg-green-950/20 border-t border-green-200 dark:border-green-800"
            data-testid="manual-entry-ready-banner"
          >
            <p className="text-center font-medium text-green-700 dark:text-green-400 flex items-center justify-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              All ending serials entered - Ready to close lottery
            </p>
          </div>
        )}

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t bg-muted/30 flex justify-between items-center">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
            data-testid="cancel-day-close-button"
          >
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>

          {/* Submit button - different behavior for scan vs manual mode */}
          {manualEntryState.isActive ? (
            <Button
              onClick={handleManualSubmit}
              disabled={isSubmitting || !canCloseManualEntry}
              data-testid="close-lottery-manual-button"
              className={cn(
                canCloseManualEntry
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : "",
              )}
            >
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Close Lottery (Manual)
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !allBinsScanned}
              data-testid="close-lottery-button"
              className={cn(
                allBinsScanned
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : "",
              )}
            >
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Close Lottery & Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Manual Entry Auth Modal */}
      <ManualEntryAuthModal
        open={manualEntryAuthModalOpen}
        onOpenChange={setManualEntryAuthModalOpen}
        storeId={storeId}
        onAuthorized={handleManualEntryAuthorized}
      />

      {/* Validation Error Modal */}
      <Dialog
        open={validationErrorModal.open}
        onOpenChange={(open) =>
          setValidationErrorModal((prev) => ({ ...prev, open }))
        }
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Invalid Ending Serial
            </DialogTitle>
            <DialogDescription>
              {validationErrorModal.binNumber !== null && (
                <span className="block mb-2 font-semibold">
                  Bin #{validationErrorModal.binNumber}
                </span>
              )}
              {validationErrorModal.message}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() =>
                setValidationErrorModal({
                  open: false,
                  binNumber: null,
                  message: "",
                })
              }
              data-testid="validation-error-modal-ok-button"
            >
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
