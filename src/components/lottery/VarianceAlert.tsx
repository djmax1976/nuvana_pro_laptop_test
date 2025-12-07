"use client";

/**
 * VarianceAlert Component
 * Displays lottery variance alerts prominently with grouping and highlighting
 *
 * Story: 6.10 - Lottery Management UI
 * AC #5: Variance alerts displayed prominently, variance details shown, grouped by shift/pack, unresolved variances highlighted
 */

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export interface LotteryVariance {
  variance_id: string;
  shift_id: string;
  pack_id: string;
  expected_count: number;
  actual_count: number;
  difference: number;
  approved_at: string | null;
  pack: {
    pack_number: string;
    game: {
      name: string;
    };
  };
  shift: {
    shift_id: string;
    opened_at: string;
  };
}

export interface VarianceAlertProps {
  variances: LotteryVariance[];
  onVarianceClick?: (variance: LotteryVariance) => void;
  className?: string;
}

/**
 * Group variances by shift_id
 */
function groupVariancesByShift(
  variances: LotteryVariance[],
): Map<string, LotteryVariance[]> {
  const grouped = new Map<string, LotteryVariance[]>();
  for (const variance of variances) {
    const shiftId = variance.shift_id;
    if (!grouped.has(shiftId)) {
      grouped.set(shiftId, []);
    }
    grouped.get(shiftId)!.push(variance);
  }
  return grouped;
}

/**
 * Group variances by pack_id
 */
function groupVariancesByPack(
  variances: LotteryVariance[],
): Map<string, LotteryVariance[]> {
  const grouped = new Map<string, LotteryVariance[]>();
  for (const variance of variances) {
    const packId = variance.pack_id;
    if (!grouped.has(packId)) {
      grouped.set(packId, []);
    }
    grouped.get(packId)!.push(variance);
  }
  return grouped;
}

/**
 * Check if variance is unresolved (not approved)
 */
function isUnresolved(variance: LotteryVariance): boolean {
  return variance.approved_at === null;
}

/**
 * VarianceAlert component
 * Displays lottery variances prominently with grouping and highlighting
 * Follows XSS prevention patterns - all output is React-escaped by default
 */
export function VarianceAlert({
  variances,
  onVarianceClick,
  className,
}: VarianceAlertProps) {
  // Filter unresolved variances for prominent display
  const unresolvedVariances = variances.filter(isUnresolved);
  const resolvedVariances = variances.filter((v) => !isUnresolved(v));

  // Group unresolved variances by shift for better organization
  const unresolvedByShift = groupVariancesByShift(unresolvedVariances);

  // If no variances exist, show message
  if (variances.length === 0) {
    return (
      <Alert
        className={cn(
          "border-green-500/50 bg-green-50 dark:bg-green-950/20",
          className,
        )}
      >
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        <AlertTitle>No Variances</AlertTitle>
        <AlertDescription>
          All lottery pack reconciliations are clear. No variances detected.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Unresolved Variances - Prominently Displayed */}
      {unresolvedVariances.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">
            Unresolved Variances ({unresolvedVariances.length})
          </h3>
          {Array.from(unresolvedByShift.entries()).map(
            ([shiftId, shiftVariances]) => {
              const firstVariance = shiftVariances[0];
              const shiftOpenedAt = firstVariance.shift.opened_at
                ? format(
                    new Date(firstVariance.shift.opened_at),
                    "MMM d, yyyy 'at' h:mm a",
                  )
                : "Unknown date";

              return (
                <Alert
                  key={shiftId}
                  variant="destructive"
                  className="border-destructive/50 bg-destructive/10"
                  role="alert"
                  aria-label="Variance discrepancy"
                >
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <AlertTitle>
                    Variance Detected - Shift {shiftId.slice(0, 8)}
                  </AlertTitle>
                  <AlertDescription className="mt-2 space-y-3">
                    <div className="text-xs text-muted-foreground">
                      Shift opened: {shiftOpenedAt}
                    </div>
                    <div className="space-y-2">
                      {shiftVariances.map((variance) => (
                        <div
                          key={variance.variance_id}
                          className={cn(
                            "rounded-lg border border-destructive/20 bg-background p-3",
                            onVarianceClick &&
                              "cursor-pointer hover:bg-muted/50",
                          )}
                          onClick={() => onVarianceClick?.(variance)}
                          role="button"
                          tabIndex={onVarianceClick ? 0 : undefined}
                          onKeyDown={(e) => {
                            if (
                              onVarianceClick &&
                              (e.key === "Enter" || e.key === " ")
                            ) {
                              e.preventDefault();
                              onVarianceClick(variance);
                            }
                          }}
                        >
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="font-medium text-muted-foreground">
                                Pack:
                              </span>{" "}
                              <span className="font-semibold">
                                {variance.pack.pack_number}
                              </span>
                            </div>
                            <div>
                              <span className="font-medium text-muted-foreground">
                                Game:
                              </span>{" "}
                              <span className="font-semibold">
                                {variance.pack.game.name}
                              </span>
                            </div>
                            <div>
                              <span className="font-medium text-muted-foreground">
                                Expected:
                              </span>{" "}
                              <span className="font-semibold">
                                {variance.expected_count}
                              </span>
                            </div>
                            <div>
                              <span className="font-medium text-muted-foreground">
                                Actual:
                              </span>{" "}
                              <span className="font-semibold">
                                {variance.actual_count}
                              </span>
                            </div>
                            <div className="col-span-2">
                              <span className="font-medium text-muted-foreground">
                                Difference:
                              </span>{" "}
                              <span
                                className={cn(
                                  "font-semibold",
                                  variance.difference < 0
                                    ? "text-destructive"
                                    : variance.difference > 0
                                      ? "text-green-600"
                                      : "",
                                )}
                              >
                                {variance.difference > 0 ? "+" : ""}
                                {variance.difference}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              );
            },
          )}
        </div>
      )}

      {/* Resolved Variances - Collapsed or Separate Section */}
      {resolvedVariances.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Resolved Variances ({resolvedVariances.length})
          </h3>
          <Alert className="border-muted bg-muted/30">
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            <AlertTitle className="text-muted-foreground">
              {resolvedVariances.length} variance
              {resolvedVariances.length !== 1 ? "s" : ""} resolved
            </AlertTitle>
            <AlertDescription className="text-muted-foreground">
              These variances have been approved and resolved.
            </AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );
}
