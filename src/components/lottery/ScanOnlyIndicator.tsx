"use client";

/**
 * Scan Only Indicator Component
 *
 * Visual indicator that shows scan-only input is required.
 * Displays real-time feedback about scan detection status.
 *
 * Story: Scan-Only Pack Reception Security
 *
 * Features:
 * - Shows scan-only badge when input is empty
 * - Real-time feedback during input (scanning/typing detection)
 * - Clear rejection message for manual entry
 * - Success indicator for valid scans
 * - Accessible with proper ARIA attributes
 */

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Scan,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import type { ScanDetectionResult } from "@/types/scan-detection";
import { cn } from "@/lib/utils";

/**
 * Props for ScanOnlyIndicator
 */
export interface ScanOnlyIndicatorProps {
  /**
   * Current detection result from useScanDetector
   */
  result: ScanDetectionResult;

  /**
   * Current keystroke count
   */
  keystrokeCount: number;

  /**
   * Expected character count
   */
  expectedLength: number;

  /**
   * Whether input is complete
   */
  isComplete: boolean;

  /**
   * Quick check for real-time feedback
   */
  quickCheck: { likelyScan: boolean; confidence: number };

  /**
   * Additional CSS classes
   */
  className?: string;

  /**
   * Whether to show the indicator
   * @default true
   */
  show?: boolean;
}

/**
 * ScanOnlyBadge - Shows the scan-only requirement badge
 */
export function ScanOnlyBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "gap-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
        className,
      )}
    >
      <Scan className="h-3 w-3" />
      Barcode Scanning Only
    </Badge>
  );
}

/**
 * Status indicator during scanning
 */
function ScanningStatus({
  keystrokeCount,
  expectedLength,
  likelyScan,
}: {
  keystrokeCount: number;
  expectedLength: number;
  likelyScan: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      <span className="text-muted-foreground">
        Scanning... {keystrokeCount}/{expectedLength}
      </span>
      {keystrokeCount >= 3 && (
        <Badge
          variant="outline"
          className={cn(
            "text-xs",
            likelyScan
              ? "border-green-300 text-green-600"
              : "border-yellow-300 text-yellow-600",
          )}
        >
          {likelyScan ? "Scan detected" : "Check speed"}
        </Badge>
      )}
    </div>
  );
}

/**
 * Success indicator for valid scan
 */
function ScanSuccess({ confidence }: { confidence: number }) {
  return (
    <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
      <CheckCircle2 className="h-4 w-4" />
      <span>
        Barcode scanned successfully ({(confidence * 100).toFixed(0)}%
        confidence)
      </span>
    </div>
  );
}

/**
 * Rejection message for manual entry
 */
function ManualEntryRejection({
  rejectionReason,
}: {
  rejectionReason?: string;
}) {
  return (
    <Alert variant="destructive" className="py-2">
      <XCircle className="h-4 w-4" />
      <AlertDescription className="ml-2">
        <strong>Manual entry not allowed.</strong> Please use a barcode scanner.
        {rejectionReason && (
          <span className="mt-1 block text-xs opacity-80">
            Detection: {rejectionReason}
          </span>
        )}
      </AlertDescription>
    </Alert>
  );
}

/**
 * Warning for ambiguous detection
 */
function AmbiguousWarning({ confidence }: { confidence: number }) {
  return (
    <div className="flex items-center gap-2 text-sm text-yellow-600 dark:text-yellow-400">
      <AlertTriangle className="h-4 w-4" />
      <span>
        Input method unclear ({(confidence * 100).toFixed(0)}% confidence).
        Verify with scanner.
      </span>
    </div>
  );
}

/**
 * ScanOnlyIndicator component
 *
 * Displays appropriate indicator based on scan detection state:
 * - Empty: Shows scan-only badge
 * - Scanning: Shows progress with real-time detection
 * - Complete + Scanned: Shows success
 * - Complete + Manual: Shows rejection
 * - Ambiguous: Shows warning
 */
export function ScanOnlyIndicator({
  result,
  keystrokeCount,
  expectedLength,
  isComplete,
  quickCheck,
  className,
  show = true,
}: ScanOnlyIndicatorProps) {
  const content = useMemo(() => {
    // Empty state - show scan-only badge
    if (keystrokeCount === 0) {
      return <ScanOnlyBadge />;
    }

    // Still scanning - show progress
    if (!isComplete) {
      return (
        <ScanningStatus
          keystrokeCount={keystrokeCount}
          expectedLength={expectedLength}
          likelyScan={quickCheck.likelyScan}
        />
      );
    }

    // Complete - show final result
    if (result.isScanned) {
      return <ScanSuccess confidence={result.confidence} />;
    }

    if (result.isManual) {
      return <ManualEntryRejection rejectionReason={result.rejectionReason} />;
    }

    // Ambiguous
    if (result.isPending || result.inputMethod === "UNKNOWN") {
      return <AmbiguousWarning confidence={result.confidence} />;
    }

    // Fallback
    return <ScanOnlyBadge />;
  }, [
    keystrokeCount,
    expectedLength,
    isComplete,
    result,
    quickCheck.likelyScan,
  ]);

  if (!show) return null;

  return (
    <div
      className={cn("transition-all duration-200", className)}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {content}
    </div>
  );
}

/**
 * Compact version for inline display
 */
export function ScanOnlyIndicatorCompact({
  result,
  keystrokeCount,
  isComplete,
  quickCheck,
  className,
}: Omit<ScanOnlyIndicatorProps, "expectedLength" | "show">) {
  if (keystrokeCount === 0) {
    return (
      <Badge
        variant="outline"
        className={cn("gap-1 text-xs border-blue-300 text-blue-600", className)}
      >
        <Scan className="h-3 w-3" />
        Scan only
      </Badge>
    );
  }

  if (!isComplete) {
    return (
      <Badge
        variant="outline"
        className={cn(
          "gap-1 text-xs",
          quickCheck.likelyScan
            ? "border-green-300 text-green-600"
            : "border-yellow-300 text-yellow-600",
          className,
        )}
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        Scanning...
      </Badge>
    );
  }

  if (result.isScanned) {
    return (
      <Badge
        variant="outline"
        className={cn(
          "gap-1 text-xs border-green-300 text-green-600",
          className,
        )}
      >
        <CheckCircle2 className="h-3 w-3" />
        Scanned
      </Badge>
    );
  }

  if (result.isManual) {
    return (
      <Badge variant="destructive" className={cn("gap-1 text-xs", className)}>
        <XCircle className="h-3 w-3" />
        Manual - Rejected
      </Badge>
    );
  }

  return null;
}

/**
 * Help text explaining scan-only requirement
 */
export function ScanOnlyHelpText({ className }: { className?: string }) {
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      <Scan className="mr-1 inline h-3 w-3" />
      Barcode scanning is required for pack reception. Manual entry is not
      permitted for security and accuracy.
    </p>
  );
}
