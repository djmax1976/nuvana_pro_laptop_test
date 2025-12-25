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
import { Check, AlertTriangle, XCircle } from "lucide-react";

/**
 * Shift status type
 */
type ShiftStatus = "active" | "closed" | "review" | "flagged";

/**
 * Variance status type
 */
type VarianceStatus = "ok" | "warning" | "critical";

/**
 * Badge variant mapping for shift status
 */
const STATUS_VARIANTS: Record<
  ShiftStatus,
  "default" | "success" | "warning" | "destructive"
> = {
  active: "default",
  closed: "success",
  review: "warning",
  flagged: "destructive",
};

const STATUS_LABELS: Record<ShiftStatus, string> = {
  active: "Active",
  closed: "Closed",
  review: "Review",
  flagged: "Flagged",
};

/**
 * Color mapping for variance status
 */
const VARIANCE_STYLES: Record<
  VarianceStatus,
  { class: string; Icon: typeof Check }
> = {
  ok: { class: "text-green-600", Icon: Check },
  warning: { class: "text-orange-500", Icon: AlertTriangle },
  critical: { class: "text-red-500", Icon: XCircle },
};

interface ShiftVariance {
  value: string;
  status: VarianceStatus;
}

interface Shift {
  id: string;
  shiftId: string;
  cashier: string;
  time: string;
  totalSales: number;
  transactions: number;
  cashVariance: ShiftVariance;
  lotteryVariance: ShiftVariance;
  status: ShiftStatus;
}

interface ShiftHistoryTableProps {
  className?: string;
  shifts?: Shift[];
  onViewAll?: () => void;
}

/**
 * Default mock shifts
 */
const DEFAULT_SHIFTS: Shift[] = [
  {
    id: "1",
    shiftId: "SFT-000446",
    cashier: "Sarah Miller",
    time: "2:00 PM - Now",
    totalSales: 2145.5,
    transactions: 86,
    cashVariance: { value: "$0.00", status: "ok" },
    lotteryVariance: { value: "0", status: "ok" },
    status: "active",
  },
  {
    id: "2",
    shiftId: "SFT-000445",
    cashier: "John Davis",
    time: "6:00 AM - 2:00 PM",
    totalSales: 3245.0,
    transactions: 142,
    cashVariance: { value: "$0.00", status: "ok" },
    lotteryVariance: { value: "0", status: "ok" },
    status: "closed",
  },
  {
    id: "3",
    shiftId: "SFT-000444",
    cashier: "Mike Johnson",
    time: "10:00 PM - 6:00 AM",
    totalSales: 1892.25,
    transactions: 78,
    cashVariance: { value: "-$2.50", status: "warning" },
    lotteryVariance: { value: "0", status: "ok" },
    status: "review",
  },
  {
    id: "4",
    shiftId: "SFT-000443",
    cashier: "Emily Chen",
    time: "2:00 PM - 10:00 PM",
    totalSales: 4125.75,
    transactions: 168,
    cashVariance: { value: "$0.00", status: "ok" },
    lotteryVariance: { value: "-2", status: "critical" },
    status: "flagged",
  },
];

/**
 * Formats a number as currency
 */
function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

/**
 * VarianceIndicator - Displays variance with status icon
 */
function VarianceIndicator({ variance }: { variance: ShiftVariance }) {
  const { class: className, Icon } = VARIANCE_STYLES[variance.status];

  return (
    <span className={cn("flex items-center gap-1 text-sm", className)}>
      <Icon className="w-3 h-3" aria-hidden="true" />
      {variance.value}
    </span>
  );
}

/**
 * ShiftHistoryTable - Recent shift history with variances
 *
 * @description Enterprise-grade shift history table with:
 * - Shift ID in monospace font
 * - Variance indicators with status icons
 * - Status badges with color coding
 * - View all action
 *
 * @accessibility WCAG 2.1 AA compliant with proper table semantics
 */
export function ShiftHistoryTable({
  className,
  shifts = DEFAULT_SHIFTS,
  onViewAll,
}: ShiftHistoryTableProps) {
  return (
    <Card
      className={cn("shadow-sm", className)}
      data-testid="shift-history-card"
      role="region"
      aria-labelledby="shift-history-title"
    >
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle id="shift-history-title" className="text-base font-semibold">
          Recent Shift History
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={onViewAll}
          data-testid="view-all-shifts"
        >
          View All Shifts
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Shift ID
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Cashier
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Time
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-right">
                Total Sales
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-right">
                Transactions
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Cash Variance
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Lottery Variance
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Status
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shifts.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center py-8 text-muted-foreground"
                >
                  No shift history found
                </TableCell>
              </TableRow>
            ) : (
              shifts.map((shift) => (
                <TableRow
                  key={shift.id}
                  data-testid={`shift-row-${shift.shiftId}`}
                >
                  <TableCell className="font-mono text-sm text-primary">
                    {shift.shiftId}
                  </TableCell>
                  <TableCell className="text-sm">{shift.cashier}</TableCell>
                  <TableCell className="text-sm">{shift.time}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(shift.totalSales)}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {shift.transactions}
                  </TableCell>
                  <TableCell>
                    <VarianceIndicator variance={shift.cashVariance} />
                  </TableCell>
                  <TableCell>
                    <VarianceIndicator variance={shift.lotteryVariance} />
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANTS[shift.status]}>
                      {STATUS_LABELS[shift.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/**
 * ShiftHistoryTableSkeleton - Loading state
 */
export function ShiftHistoryTableSkeleton() {
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
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-3 w-20 bg-muted rounded" />
            ))}
          </div>
          {/* Rows */}
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 p-4 border-b last:border-0"
            >
              <div className="h-4 w-24 bg-muted rounded" />
              <div className="h-4 w-24 bg-muted rounded" />
              <div className="h-4 w-32 bg-muted rounded" />
              <div className="h-4 w-20 bg-muted rounded" />
              <div className="h-4 w-12 bg-muted rounded" />
              <div className="h-4 w-16 bg-muted rounded" />
              <div className="h-4 w-12 bg-muted rounded" />
              <div className="h-5 w-16 bg-muted rounded-full" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export type { Shift, ShiftVariance, ShiftStatus, VarianceStatus };
