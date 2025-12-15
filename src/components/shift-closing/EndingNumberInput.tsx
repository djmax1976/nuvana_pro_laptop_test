"use client";

/**
 * Ending Number Input Component
 *
 * Story: 10.1 - Lottery Shift Closing Page UI
 * Story: 10.3 - Ending Number Scanning & Validation (Enhanced)
 *
 * A specialized input component for entering 3-digit ending serial numbers.
 * Supports both manual entry and barcode scanning (24-digit serial numbers).
 * Enforces strict numeric-only input with exactly 3 digits.
 *
 * @requirements
 * - AC #4: Only accept numeric input (0-9), exactly 3 digits
 * - AC #4: Monospace font, centered text, "000" placeholder
 * - AC #5: Call onComplete callback when 3 digits entered (triggers auto-advance)
 * - AC #1: Detect 24-digit barcode scans and validate
 * - AC #6: Auto-fill 3-digit ending from valid scan
 * - AC #7: Display validation errors with red border
 * - AC #8: Handle rapid scanning (< 100ms between scans)
 *
 * @security
 * - INPUT_VALIDATION: Strict allowlist (numeric 0-9 only), length constraint (exactly 3 or 24)
 * - FORM_VALIDATION: Client-side validation mirrors backend requirements
 * - XSS: Input is sanitized (numeric only) before processing, error messages are escaped
 */

import { useRef, useEffect, forwardRef, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  validateEndingSerial,
  validateManualEntryEnding,
  BinValidationData,
} from "@/lib/services/lottery-closing-validation";

/**
 * Props for EndingNumberInput component
 */
export interface EndingNumberInputProps {
  /** Current value (0-3 digits) */
  value: string;
  /** Callback when value changes (sanitized numeric value) */
  onChange: (value: string) => void;
  /** Callback when 3 digits are entered (triggers auto-advance) */
  onComplete?: (binId: string) => void;
  /** Whether input is disabled */
  disabled?: boolean;
  /** Bin ID for identification and data-testid */
  binId: string;
  /** Pack number for validation (required for barcode scanning) */
  packNumber?: string;
  /** Starting serial for validation (required for barcode scanning) */
  startingSerial?: string;
  /** Serial end (pack maximum) for validation (required for barcode scanning) */
  serialEnd?: string;
  /** Whether manual entry mode is active (skips pack number validation) */
  manualEntryMode?: boolean;
}

/**
 * EndingNumberInput component
 *
 * Validates and sanitizes input to ensure:
 * - Only numeric characters (0-9) are accepted
 * - Exactly 3 digits maximum
 * - onComplete callback triggered when 3 digits entered
 */
export const EndingNumberInput = forwardRef<
  HTMLInputElement,
  EndingNumberInputProps
>(function EndingNumberInput(
  {
    value,
    onChange,
    onComplete,
    disabled = false,
    binId,
    packNumber,
    startingSerial,
    serialEnd,
    manualEntryMode = false,
  },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previousValueRef = useRef<string>(value);
  const [error, setError] = useState<string | undefined>();
  const [isValid, setIsValid] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const validationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear validation state when value changes manually (not from scan)
  useEffect(() => {
    // If value is not 24 digits, clear validation state (manual entry)
    if (value.length !== 24) {
      setError(undefined);
      setIsValid(false);
    }
  }, [value]);

  // Track value changes to detect when 3 digits are entered (manual entry)
  // In manual entry mode, validate 3-digit input against range only (skip pack validation)
  useEffect(() => {
    // Only validate and trigger onComplete when transitioning from 2 to 3 digits (manual entry)
    // Barcode scans trigger onComplete via validation callback
    if (
      value.length === 3 &&
      previousValueRef.current.length < 3 &&
      value.length !== 24 && // Not a barcode scan
      !error // Only if no validation error
    ) {
      // If manual entry mode is active, validate 3-digit input
      if (manualEntryMode && startingSerial && serialEnd) {
        // Validate manual entry (range only, skip pack validation)
        validateManualEntryEnding(value, {
          starting_serial: startingSerial,
          serial_end: serialEnd,
        })
          .then((result) => {
            if (result.valid) {
              setIsValid(true);
              setError(undefined);
              if (onComplete) {
                onComplete(binId);
              }
            } else {
              setIsValid(false);
              setError(result.error || "Validation failed");
            }
          })
          .catch((err) => {
            setIsValid(false);
            setError("Validation error occurred");
          });
      } else if (onComplete && !manualEntryMode) {
        // Non-manual entry mode: just trigger onComplete (validation happens on barcode scan)
        onComplete(binId);
      }
    }
    previousValueRef.current = value;
  }, [
    value,
    binId,
    onComplete,
    error,
    manualEntryMode,
    startingSerial,
    serialEnd,
  ]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
    };
  }, []);

  /**
   * Handle barcode scan validation
   * FE-002: FORM_VALIDATION - Client-side validation mirrors backend
   * SEC-014: INPUT_VALIDATION - Validate 24-digit format before processing
   */
  const handleBarcodeScan = useCallback(
    async (scannedValue: string) => {
      // SEC-014: Validate format before processing
      if (!/^\d{24}$/.test(scannedValue)) {
        return; // Not a valid barcode scan
      }

      // Check if validation props are available
      if (!packNumber || !startingSerial || !serialEnd) {
        // Validation props not available - treat as manual entry
        return;
      }

      setIsScanning(true);
      setError(undefined);
      setIsValid(false);

      try {
        const binData: BinValidationData = {
          pack_number: packNumber,
          starting_serial: startingSerial,
          serial_end: serialEnd,
        };

        // Call validation service
        const result = await validateEndingSerial(scannedValue, binData);

        if (result.valid && result.endingNumber) {
          // Validation passed - auto-fill ending number
          setIsValid(true);
          setError(undefined);
          onChange(result.endingNumber);

          // Trigger onComplete callback for auto-advance
          if (onComplete) {
            // Small delay to ensure UI updates before advancing
            setTimeout(() => {
              onComplete(binId);
            }, 50);
          }
        } else {
          // Validation failed - show error
          setIsValid(false);
          setError(result.error || "Validation failed");
          // Clear input for re-scan
          onChange("");
        }
      } catch (err) {
        // ERROR_HANDLING: Generic error message, don't leak implementation details
        setIsValid(false);
        setError("Validation error occurred");
        onChange("");
      } finally {
        setIsScanning(false);
      }
    },
    [packNumber, startingSerial, serialEnd, onChange, onComplete, binId],
  );

  /**
   * Handle input change with strict validation
   * SEC-014: INPUT_VALIDATION - Strict allowlist (numeric only), length constraint (max 3 or 24 for barcode)
   * FE-002: FORM_VALIDATION - Sanitize input before processing
   * AC #1: Detect 24-digit barcode scans
   */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;

    // SEC-014: Apply strict allowlist - only numeric characters (0-9)
    // FE-002: Sanitize input - remove all non-numeric characters
    const sanitized = rawValue.replace(/\D/g, "");

    // AC #1: Detect 24-digit barcode scan
    // Barcode scanners typically input all 24 digits at once (< 100ms)
    if (sanitized.length === 24) {
      // Clear any existing timeout
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }

      // Set value immediately to show scanning activity
      onChange(sanitized);

      // AC #8: Handle rapid scanning - debounce validation slightly
      // This allows barcode scanner to complete input before validation
      validationTimeoutRef.current = setTimeout(() => {
        handleBarcodeScan(sanitized);
      }, 50); // Small delay to ensure all digits are captured
      return;
    }

    // SEC-014: Apply length constraint - exactly 3 digits maximum for manual entry
    const limited = sanitized.slice(0, 3);

    // Clear validation state on manual entry
    if (limited !== value) {
      setError(undefined);
      setIsValid(false);
      onChange(limited);
    }
  };

  /**
   * Handle keydown to prevent non-numeric input
   * Additional layer of validation for better UX
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Allow: backspace, delete, tab, escape, enter, and arrow keys
    if (
      [
        "Backspace",
        "Delete",
        "Tab",
        "Escape",
        "Enter",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ].includes(e.key)
    ) {
      return;
    }

    // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
    if (e.ctrlKey && ["a", "c", "v", "x"].includes(e.key.toLowerCase())) {
      return;
    }

    // SEC-014: Reject non-numeric input at keyboard level
    // Only allow numeric keys (0-9) from main keyboard and numpad
    if (
      !/^[0-9]$/.test(e.key) &&
      !(e.keyCode >= 96 && e.keyCode <= 105) // Numpad 0-9
    ) {
      e.preventDefault();
    }
  };

  /**
   * Handle paste events to sanitize pasted content
   * SEC-014: INPUT_VALIDATION - Sanitize pasted content
   */
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData("text");

    // SEC-014: Sanitize pasted content - extract only numeric characters
    const sanitized = pastedText.replace(/\D/g, "").slice(0, 3);

    if (sanitized !== value) {
      onChange(sanitized);
    }
  };

  // Merge forwarded ref with internal ref
  const setRef = (element: HTMLInputElement | null) => {
    inputRef.current = element;
    if (typeof ref === "function") {
      ref(element);
    } else if (ref) {
      (ref as React.MutableRefObject<HTMLInputElement | null>).current =
        element;
    }
  };

  // Determine border color based on validation state
  // AC #6: Green border on valid entry
  // AC #7: Red border on error
  const borderColorClass = error
    ? "border-red-500 focus:border-red-500 focus:ring-red-500"
    : isValid && value.length === 3
      ? "border-green-500 focus:border-green-500 focus:ring-green-500"
      : "";

  return (
    <div className="flex flex-col gap-1">
      <Input
        ref={setRef}
        type="text"
        inputMode="numeric"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder="000"
        maxLength={24} // Allow 24 digits for barcode scanning
        disabled={disabled}
        className={cn(
          "w-20 md:w-24 px-2 py-2 md:py-1 text-center font-mono text-base md:text-sm",
          "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent",
          "touch-manipulation", // Improves touch responsiveness
          "min-h-[44px] md:min-h-0", // Minimum touch target size on mobile (44px)
          borderColorClass, // Dynamic border color based on validation
        )}
        data-testid={`ending-number-input-${binId}`}
        aria-label={`Ending number for bin ${binId}`}
        aria-invalid={error ? "true" : "false"}
        aria-describedby={error ? `error-message-${binId}` : undefined}
      />
      {/* AC #1: Scanning activity indicator */}
      {isScanning && (
        <div
          data-testid={`scanning-activity-${binId}`}
          className="text-xs text-muted-foreground"
          aria-live="polite"
        >
          Scanning...
        </div>
      )}
      {/* AC #7: Error message display */}
      {error && (
        <div
          id={`error-message-${binId}`}
          data-testid={`error-message-${binId}`}
          className="text-xs text-red-500"
          role="alert"
          aria-live="assertive"
        >
          {/* SEC-004: XSS - Error message is already sanitized (string from validation service) */}
          {error}
        </div>
      )}
    </div>
  );
});
