"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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
 * RecentShiftHistory Component
 *
 * Displays a full-width table of recent shifts with variance indicators
 *
 * Story: MyStore Dashboard Redesign
 */

// Sample shift data - will be replaced with real API data
const shifts = [
  {
    id: "SFT-000446",
    cashier: "Sarah Miller",
    time: "2:00 PM - Now",
    totalSales: 2145.5,
    transactions: 86,
    cashVariance: { amount: 0, status: "ok" as const },
    lotteryVariance: { count: 0, status: "ok" as const },
    status: "active" as const,
  },
  {
    id: "SFT-000445",
    cashier: "John Davis",
    time: "6:00 AM - 2:00 PM",
    totalSales: 3245.0,
    transactions: 142,
    cashVariance: { amount: 0, status: "ok" as const },
    lotteryVariance: { count: 0, status: "ok" as const },
    status: "closed" as const,
  },
  {
    id: "SFT-000444",
    cashier: "Mike Johnson",
    time: "10:00 PM - 6:00 AM",
    totalSales: 1892.25,
    transactions: 78,
    cashVariance: { amount: -2.5, status: "warning" as const },
    lotteryVariance: { count: 0, status: "ok" as const },
    status: "review" as const,
  },
  {
    id: "SFT-000443",
    cashier: "Emily Chen",
    time: "2:00 PM - 10:00 PM",
    totalSales: 4125.75,
    transactions: 168,
    cashVariance: { amount: 0, status: "ok" as const },
    lotteryVariance: { count: -2, status: "critical" as const },
    status: "flagged" as const,
  },
];

const statusVariants: Record<
  string,
  "default" | "success" | "warning" | "destructive"
> = {
  active: "default",
  closed: "success",
  review: "warning",
  flagged: "destructive",
};

const statusLabels: Record<string, string> = {
  active: "Active",
  closed: "Closed",
  review: "Review",
  flagged: "Flagged",
};

function VarianceIndicator({
  status,
  value,
  isCurrency = true,
}: {
  status: "ok" | "warning" | "critical";
  value: number;
  isCurrency?: boolean;
}) {
  const icons = {
    ok: <Check className="w-3 h-3" />,
    warning: <AlertTriangle className="w-3 h-3" />,
    critical: <XCircle className="w-3 h-3" />,
  };

  const colors = {
    ok: "text-success",
    warning: "text-warning",
    critical: "text-destructive",
  };

  const displayValue = isCurrency
    ? `$${Math.abs(value).toFixed(2)}`
    : value.toString();

  const colorClass = colors[status as keyof typeof colors];
  const iconElement = icons[status as keyof typeof icons];

  return (
    <span className={`flex items-center gap-1 text-sm ${colorClass}`}>
      {iconElement}
      {value < 0 && isCurrency ? "-" : ""}
      {displayValue}
    </span>
  );
}

export function RecentShiftHistory() {
  return (
    <Card data-testid="recent-shift-history">
      <CardHeader className="flex flex-row items-center justify-between p-5 border-b">
        <CardTitle className="text-base font-semibold">
          Recent Shift History
        </CardTitle>
        <Button variant="outline" size="sm" className="text-xs">
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
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Total Sales
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
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
            {shifts.map((shift) => (
              <TableRow key={shift.id}>
                <TableCell>
                  <span className="font-mono text-sm text-primary">
                    {shift.id}
                  </span>
                </TableCell>
                <TableCell>{shift.cashier}</TableCell>
                <TableCell>{shift.time}</TableCell>
                <TableCell>
                  <span className="font-semibold">
                    $
                    {shift.totalSales.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </TableCell>
                <TableCell>{shift.transactions}</TableCell>
                <TableCell>
                  <VarianceIndicator
                    status={shift.cashVariance.status}
                    value={shift.cashVariance.amount}
                  />
                </TableCell>
                <TableCell>
                  <VarianceIndicator
                    status={shift.lotteryVariance.status}
                    value={shift.lotteryVariance.count}
                    isCurrency={false}
                  />
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariants[shift.status]}>
                    {statusLabels[shift.status]}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
