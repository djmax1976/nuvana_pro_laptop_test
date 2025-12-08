"use client";

/**
 * LotteryPackCard Component
 * Displays lottery pack information in a card format with status indicators
 *
 * Story: 6.10 - Lottery Management UI
 * AC #1: View packs with status indicators (RECEIVED, ACTIVE, DEPLETED, RETURNED)
 * AC #4: View pack details (serial range, tickets remaining, status, game, bin)
 */

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  getPackStatusBadgeVariant,
  getPackStatusText,
} from "./pack-status-badge";

export type PackStatus = "RECEIVED" | "ACTIVE" | "DEPLETED" | "RETURNED";

export interface LotteryPackCardProps {
  pack: {
    pack_id: string;
    pack_number: string;
    serial_start: string;
    serial_end: string;
    status: PackStatus;
    game: {
      game_id: string;
      name: string;
    };
    tickets_remaining?: number;
    bin?: {
      bin_id: string;
      bin_number?: string;
      name?: string;
    } | null;
  };
  onDetailsClick?: (packId: string) => void;
  className?: string;
}

/**
 * Calculate tickets remaining from serial range
 * Formula: (serial_end - serial_start + 1) - sold_count
 * For display purposes, if tickets_remaining is provided, use it; otherwise calculate from range
 */
function calculateTicketsRemaining(
  serialStart: string,
  serialEnd: string,
  providedRemaining?: number,
): number {
  if (providedRemaining !== undefined) {
    return providedRemaining;
  }
  // Parse serial numbers (assuming numeric format)
  const start = parseInt(serialStart, 10);
  const end = parseInt(serialEnd, 10);
  if (!isNaN(start) && !isNaN(end) && end >= start) {
    return end - start + 1;
  }
  return 0;
}

export function LotteryPackCard({
  pack,
  onDetailsClick,
  className,
}: LotteryPackCardProps) {
  const statusVariant = getPackStatusBadgeVariant(pack.status);
  const statusText = getPackStatusText(pack.status);
  const ticketsRemaining = calculateTicketsRemaining(
    pack.serial_start,
    pack.serial_end,
    pack.tickets_remaining,
  );
  const binDisplay = pack.bin?.bin_number || pack.bin?.name || null;

  const handleClick = () => {
    if (onDetailsClick) {
      onDetailsClick(pack.pack_id);
    }
  };

  return (
    <Card
      className={cn(
        "cursor-pointer transition-shadow hover:shadow-md",
        className,
      )}
      onClick={handleClick}
      data-testid="pack-card"
      role={onDetailsClick ? "button" : "article"}
      tabIndex={onDetailsClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onDetailsClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-label={`Pack ${pack.pack_number} - ${pack.game.name}`}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg font-semibold">
              {pack.pack_number}
            </CardTitle>
            <CardDescription className="text-sm">
              {pack.game.name}
            </CardDescription>
          </div>
          <Badge
            variant={statusVariant}
            data-testid={`status-badge-${pack.pack_id}`}
          >
            {statusText}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-sm">
          <span className="font-medium text-muted-foreground">
            Serial Range:{" "}
          </span>
          <span className="text-foreground">
            {pack.serial_start} - {pack.serial_end}
          </span>
        </div>
        <div className="text-sm">
          <span className="font-medium text-muted-foreground">
            Tickets Remaining:{" "}
          </span>
          <span className="text-foreground">{ticketsRemaining}</span>
        </div>
        {binDisplay && (
          <div className="text-sm">
            <span className="font-medium text-muted-foreground">Bin: </span>
            <span className="text-foreground">{binDisplay}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
