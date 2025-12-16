"use client";

/**
 * Depleted Packs Section Component
 *
 * Story: MyStore Lottery Page Redesign
 *
 * Displays depleted packs for the current business day in a collapsible section.
 * Shows pack number, game name, amount, bin number, and time depleted.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, Package } from "lucide-react";
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
import type { DepletedPackDay } from "@/lib/api/lottery";

/**
 * Props for DepletedPacksSection component
 */
export interface DepletedPacksSectionProps {
  /** Depleted packs for the day */
  depletedPacks: DepletedPackDay[];
  /** Default open state */
  defaultOpen?: boolean;
}

/**
 * Format time from ISO string to readable format
 */
function formatTime(isoString: string): string {
  if (!isoString) return "--";
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "--";
  }
}

/**
 * DepletedPacksSection component
 * Collapsible section showing packs that were depleted during the business day
 */
export function DepletedPacksSection({
  depletedPacks,
  defaultOpen = false,
}: DepletedPacksSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (!depletedPacks || depletedPacks.length === 0) {
    return null; // Don't render section if no depleted packs
  }

  return (
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
            <span className="font-medium">
              Sold Out Packs Today ({depletedPacks.length})
            </span>
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
                <TableHead scope="col" className="w-24">
                  Sold Out At
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
                    {formatTime(pack.depleted_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
