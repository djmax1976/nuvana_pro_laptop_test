"use client";

/**
 * Depleted Packs Section Component
 *
 * Story: MyStore Lottery Page Redesign
 * Enhancement: Enterprise Close-to-Close Business Day Model
 *
 * Displays depleted packs for the current OPEN business period (close-to-close model).
 * Shows pack number, game name, amount, bin number, and datetime depleted.
 *
 * Enterprise Pattern:
 * - Business day = period from last day close to next day close (not midnight-to-midnight)
 * - Shows ALL packs depleted since last closed day, preventing orphaned data
 * - Displays warning when multiple calendar days have passed without day close
 */

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Package,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { DepletedPackDay, OpenBusinessPeriod } from "@/lib/api/lottery";

/**
 * Props for DepletedPacksSection component
 */
export interface DepletedPacksSectionProps {
  /** Depleted packs since last day close (enterprise close-to-close model) */
  depletedPacks: DepletedPackDay[];
  /** Open business period metadata for context display */
  openBusinessPeriod?: OpenBusinessPeriod;
  /** Default open state */
  defaultOpen?: boolean;
}

/**
 * Format datetime from ISO string to readable format with date when spanning multiple days
 */
function formatDateTime(isoString: string, showDate: boolean = false): string {
  if (!isoString) return "--";
  try {
    const date = new Date(isoString);
    if (showDate) {
      // Show date + time when business period spans multiple days
      return date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "--";
  }
}

/**
 * DepletedPacksSection component
 * Collapsible section showing packs that were depleted during the current open business period.
 * Uses enterprise close-to-close model - shows all packs since last day close.
 */
export function DepletedPacksSection({
  depletedPacks,
  openBusinessPeriod,
  defaultOpen = false,
}: DepletedPacksSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (!depletedPacks || depletedPacks.length === 0) {
    return null; // Don't render section if no depleted packs
  }

  // Determine if we need to show dates (when period spans multiple calendar days)
  const daysSinceClose = openBusinessPeriod?.days_since_last_close;
  const showDates =
    daysSinceClose !== null &&
    daysSinceClose !== undefined &&
    daysSinceClose > 0;
  const isMultipleDays =
    daysSinceClose !== null &&
    daysSinceClose !== undefined &&
    daysSinceClose > 1;

  // Build the section title based on context
  const sectionTitle = openBusinessPeriod?.is_first_period
    ? `Sold Out Packs (${depletedPacks.length})`
    : showDates
      ? `Sold Out Packs - Current Period (${depletedPacks.length})`
      : `Sold Out Packs Today (${depletedPacks.length})`;

  return (
    <div className="space-y-2">
      {/* Warning when multiple calendar days have passed without day close */}
      {isMultipleDays && (
        <Alert
          variant="default"
          className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950"
          data-testid="multi-day-warning"
        >
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertDescription className="text-amber-800 dark:text-amber-200">
            <strong>{daysSinceClose} days</strong> since last day close
            {openBusinessPeriod?.last_closed_date && (
              <span className="text-amber-600 dark:text-amber-400">
                {" "}
                (last closed: {openBusinessPeriod.last_closed_date})
              </span>
            )}
            . Sold out packs from all days in this period are shown below.
          </AlertDescription>
        </Alert>
      )}

      <Collapsible
        open={isOpen}
        onOpenChange={setIsOpen}
        className="rounded-lg border"
        data-testid="depleted-packs-section"
      >
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full flex items-center justify-between p-4 hover:bg-muted/50"
            data-testid="depleted-packs-trigger"
          >
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{sectionTitle}</span>
            </div>
            {isOpen ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t" data-testid="depleted-packs-content">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col" className="w-16">
                    Bin
                  </TableHead>
                  <TableHead scope="col" className="min-w-[120px]">
                    Game
                  </TableHead>
                  <TableHead scope="col" className="w-20">
                    Amount
                  </TableHead>
                  <TableHead scope="col" className="w-28">
                    Pack #
                  </TableHead>
                  <TableHead
                    scope="col"
                    className={showDates ? "w-32" : "w-24"}
                  >
                    {showDates ? "Sold Out" : "Sold Out At"}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {depletedPacks.map((pack) => (
                  <TableRow
                    key={pack.pack_id}
                    data-testid={`depleted-pack-row-${pack.pack_id}`}
                  >
                    <TableCell className="font-mono text-primary font-semibold">
                      {pack.bin_number || "--"}
                    </TableCell>
                    <TableCell>{pack.game_name}</TableCell>
                    <TableCell>${pack.game_price.toFixed(2)}</TableCell>
                    <TableCell className="font-mono">
                      {pack.pack_number}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(pack.depleted_at, showDates)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
