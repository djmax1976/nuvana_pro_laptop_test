"use client";

/**
 * PackShiftContext Component
 * Displays lottery packs in shift context (available for opening, opened in shifts, needing closing)
 *
 * Story: 6.10 - Lottery Management UI
 * AC #7: UI integrates with shift opening/closing flows, shows packs available for opening,
 *        shows packs opened in active shifts, shows packs needing closing for shifts in CLOSING status
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LotteryPackCard, type PackStatus } from "./LotteryPackCard";
import { Package, Clock, CheckCircle2 } from "lucide-react";

export interface PackWithShiftContext {
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
    name: string;
  } | null;
  // Shift context information
  shift_openings?: Array<{
    opening_id: string;
    shift_id: string;
    shift_number?: number;
    shift_status?: string;
    opening_serial: string;
    created_at: string;
  }>;
  shift_closings?: Array<{
    closing_id: string;
    shift_id: string;
    shift_number?: number;
    shift_status?: string;
    closing_serial: string;
    created_at: string;
  }>;
}

export interface PackShiftContextProps {
  packsAvailableForOpening: PackWithShiftContext[];
  packsOpenedInActiveShifts: PackWithShiftContext[];
  packsNeedingClosing: PackWithShiftContext[];
  onPackClick?: (packId: string) => void;
  className?: string;
}

/**
 * PackShiftContext component
 * Displays lottery packs organized by shift context
 * Follows XSS prevention patterns - all output is React-escaped by default
 */
export function PackShiftContext({
  packsAvailableForOpening,
  packsOpenedInActiveShifts,
  packsNeedingClosing,
  onPackClick,
  className,
}: PackShiftContextProps) {
  return (
    <div className={className}>
      <div className="space-y-6">
        {/* Packs Available for Shift Opening */}
        {packsAvailableForOpening.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Packs Available for Shift Opening</CardTitle>
                <Badge variant="secondary">
                  {packsAvailableForOpening.length}
                </Badge>
              </div>
              <CardDescription>
                ACTIVE packs that can be selected when opening a new shift
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {packsAvailableForOpening.map((pack) => (
                  <LotteryPackCard
                    key={pack.pack_id}
                    pack={pack}
                    onDetailsClick={onPackClick}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Packs Opened in Active Shifts */}
        {packsOpenedInActiveShifts.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-600" />
                <CardTitle>Packs Opened in Active Shifts</CardTitle>
                <Badge variant="secondary">
                  {packsOpenedInActiveShifts.length}
                </Badge>
              </div>
              <CardDescription>
                Packs that are currently open in active shifts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {packsOpenedInActiveShifts.map((pack) => (
                  <div key={pack.pack_id} className="space-y-2">
                    <LotteryPackCard pack={pack} onDetailsClick={onPackClick} />
                    {pack.shift_openings && pack.shift_openings.length > 0 && (
                      <div className="text-xs text-muted-foreground pl-4">
                        {pack.shift_openings.map((opening) => (
                          <div key={opening.opening_id}>
                            Shift #
                            {opening.shift_number ||
                              opening.shift_id.slice(0, 8)}{" "}
                            - Opening Serial: {opening.opening_serial}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Packs Needing Closing for Shifts in CLOSING Status */}
        {packsNeedingClosing.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-orange-600" />
                <CardTitle>Packs Needing Closing</CardTitle>
                <Badge variant="destructive">
                  {packsNeedingClosing.length}
                </Badge>
              </div>
              <CardDescription>
                Packs that need to be closed for shifts in CLOSING status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {packsNeedingClosing.map((pack) => (
                  <div key={pack.pack_id} className="space-y-2">
                    <LotteryPackCard pack={pack} onDetailsClick={onPackClick} />
                    {pack.shift_openings && pack.shift_openings.length > 0 && (
                      <div className="text-xs text-muted-foreground pl-4">
                        {pack.shift_openings.map((opening) => (
                          <div key={opening.opening_id}>
                            Shift #
                            {opening.shift_number ||
                              opening.shift_id.slice(0, 8)}{" "}
                            - Status: {opening.shift_status || "CLOSING"}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {packsAvailableForOpening.length === 0 &&
          packsOpenedInActiveShifts.length === 0 &&
          packsNeedingClosing.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No packs in shift context. Packs will appear here when they
                  are available for shift opening, opened in active shifts, or
                  need closing.
                </p>
              </CardContent>
            </Card>
          )}
      </div>
    </div>
  );
}
