"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";

/**
 * Lottery pack status
 */
type PackStatus = "active" | "low-stock" | "critical";

/**
 * Badge variant mapping for pack status
 */
const STATUS_VARIANTS: Record<
  PackStatus,
  "success" | "warning" | "destructive"
> = {
  active: "success",
  "low-stock": "warning",
  critical: "destructive",
};

const STATUS_LABELS: Record<PackStatus, string> = {
  active: "Active",
  "low-stock": "Low Stock",
  critical: "Critical",
};

interface LotteryPack {
  id: string;
  packNumber: string;
  game: string;
  price: number;
  binLocation: string;
  remaining: number;
  total: number;
  status: PackStatus;
}

interface LotteryPacksTableProps {
  className?: string;
  packs?: LotteryPack[];
  onViewAll?: () => void;
}

/**
 * Default mock lottery packs
 */
const DEFAULT_PACKS: LotteryPack[] = [
  {
    id: "1",
    packNumber: "PKG-004821",
    game: "Lucky 7s",
    price: 1,
    binLocation: "Bin A-1",
    remaining: 195,
    total: 300,
    status: "active",
  },
  {
    id: "2",
    packNumber: "PKG-004820",
    game: "Cash Bonanza",
    price: 2,
    binLocation: "Bin A-2",
    remaining: 50,
    total: 150,
    status: "active",
  },
  {
    id: "3",
    packNumber: "PKG-004819",
    game: "Diamond Doubler",
    price: 5,
    binLocation: "Bin B-1",
    remaining: 80,
    total: 90,
    status: "active",
  },
  {
    id: "4",
    packNumber: "PKG-004818",
    game: "Mega Millions",
    price: 10,
    binLocation: "Bin B-2",
    remaining: 8,
    total: 45,
    status: "low-stock",
  },
  {
    id: "5",
    packNumber: "PKG-004817",
    game: "Jackpot Fortune",
    price: 20,
    binLocation: "Bin C-1",
    remaining: 1,
    total: 18,
    status: "critical",
  },
];

/**
 * Formats a number as currency
 */
function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * LotteryPacksTable - Active lottery packs status table
 *
 * @description Enterprise-grade lottery packs table with:
 * - Pack number in monospace font
 * - Progress bar for remaining tickets
 * - Status badges with color coding
 * - View all action
 *
 * @accessibility WCAG 2.1 AA compliant with proper table semantics
 */
export function LotteryPacksTable({
  className,
  packs = DEFAULT_PACKS,
  onViewAll,
}: LotteryPacksTableProps) {
  return (
    <Card
      className={cn("shadow-sm", className)}
      data-testid="lottery-packs-card"
      role="region"
      aria-labelledby="lottery-packs-title"
    >
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle id="lottery-packs-title" className="text-base font-semibold">
          Active Lottery Packs
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={onViewAll}
          data-testid="view-all-packs"
        >
          View All Packs
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Pack Number
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Game
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Price
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Bin Location
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider w-[180px]">
                Remaining
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Status
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {packs.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center py-8 text-muted-foreground"
                >
                  No active lottery packs found
                </TableCell>
              </TableRow>
            ) : (
              packs.map((pack) => {
                const percentRemaining = Math.round(
                  (pack.remaining / pack.total) * 100,
                );
                return (
                  <TableRow
                    key={pack.id}
                    data-testid={`pack-row-${pack.packNumber}`}
                  >
                    <TableCell className="font-mono text-sm text-primary">
                      {pack.packNumber}
                    </TableCell>
                    <TableCell className="text-sm">{pack.game}</TableCell>
                    <TableCell className="text-sm">
                      {formatCurrency(pack.price)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {pack.binLocation}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress
                          value={percentRemaining}
                          className="h-1.5 flex-1"
                          aria-label={`${percentRemaining}% remaining`}
                        />
                        <span className="text-xs text-muted-foreground whitespace-nowrap min-w-[60px] text-right">
                          {pack.remaining}/{pack.total}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[pack.status]}>
                        {STATUS_LABELS[pack.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/**
 * LotteryPacksTableSkeleton - Loading state
 */
export function LotteryPacksTableSkeleton() {
  return (
    <Card className="shadow-sm animate-pulse">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div className="h-5 w-36 bg-muted rounded" />
        <div className="h-8 w-28 bg-muted rounded" />
      </CardHeader>
      <CardContent className="p-0">
        <div className="border-t">
          {/* Header */}
          <div className="flex gap-4 p-4 border-b">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-3 w-20 bg-muted rounded" />
            ))}
          </div>
          {/* Rows */}
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 p-4 border-b last:border-0"
            >
              <div className="h-4 w-24 bg-muted rounded" />
              <div className="h-4 w-28 bg-muted rounded" />
              <div className="h-4 w-12 bg-muted rounded" />
              <div className="h-4 w-16 bg-muted rounded" />
              <div className="flex-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 bg-muted rounded" />
                <div className="h-3 w-12 bg-muted rounded" />
              </div>
              <div className="h-5 w-16 bg-muted rounded-full" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export type { LotteryPack, PackStatus };
