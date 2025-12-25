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

/**
 * Transaction payment type
 */
type PaymentType = "credit" | "cash" | "debit" | "ebt";

/**
 * Badge variant mapping for payment types
 */
const PAYMENT_VARIANTS: Record<
  PaymentType,
  "default" | "success" | "warning" | "secondary"
> = {
  credit: "default",
  debit: "default",
  cash: "success",
  ebt: "warning",
};

const PAYMENT_LABELS: Record<PaymentType, string> = {
  credit: "Credit",
  debit: "Debit",
  cash: "Cash",
  ebt: "EBT",
};

interface Transaction {
  id: string;
  type: PaymentType;
  time: string;
  amount: number;
}

interface RecentTransactionsTableProps {
  className?: string;
  transactions?: Transaction[];
  onViewAll?: () => void;
}

/**
 * Default mock transactions
 */
const DEFAULT_TRANSACTIONS: Transaction[] = [
  { id: "TXN-8847291", type: "credit", time: "4:32 PM", amount: 47.85 },
  { id: "TXN-8847290", type: "cash", time: "4:28 PM", amount: 23.5 },
  { id: "TXN-8847289", type: "ebt", time: "4:21 PM", amount: 156.32 },
  { id: "TXN-8847288", type: "debit", time: "4:15 PM", amount: 12.99 },
  { id: "TXN-8847287", type: "cash", time: "4:08 PM", amount: 8.75 },
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
 * RecentTransactionsTable - Recent transactions data table
 *
 * @description Enterprise-grade transactions table with:
 * - Transaction ID in monospace font
 * - Payment type badges
 * - Amount formatting
 * - View all action
 *
 * @accessibility WCAG 2.1 AA compliant with proper table semantics
 */
export function RecentTransactionsTable({
  className,
  transactions = DEFAULT_TRANSACTIONS,
  onViewAll,
}: RecentTransactionsTableProps) {
  return (
    <Card
      className={cn("shadow-sm", className)}
      data-testid="recent-transactions-card"
      role="region"
      aria-labelledby="recent-transactions-title"
    >
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle
          id="recent-transactions-title"
          className="text-base font-semibold"
        >
          Recent Transactions
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={onViewAll}
          data-testid="view-all-transactions"
        >
          View All
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Transaction ID
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Type
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Time
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-right">
                Amount
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center py-8 text-muted-foreground"
                >
                  No transactions found
                </TableCell>
              </TableRow>
            ) : (
              transactions.map((txn) => (
                <TableRow
                  key={txn.id}
                  data-testid={`transaction-row-${txn.id}`}
                >
                  <TableCell className="font-mono text-sm text-primary">
                    {txn.id}
                  </TableCell>
                  <TableCell>
                    <Badge variant={PAYMENT_VARIANTS[txn.type]}>
                      {PAYMENT_LABELS[txn.type]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{txn.time}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(txn.amount)}
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
 * RecentTransactionsTableSkeleton - Loading state
 */
export function RecentTransactionsTableSkeleton() {
  return (
    <Card className="shadow-sm animate-pulse">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div className="h-5 w-36 bg-muted rounded" />
        <div className="h-8 w-20 bg-muted rounded" />
      </CardHeader>
      <CardContent className="p-0">
        <div className="border-t">
          {/* Header */}
          <div className="flex gap-4 p-4 border-b">
            <div className="h-3 w-24 bg-muted rounded" />
            <div className="h-3 w-12 bg-muted rounded" />
            <div className="h-3 w-12 bg-muted rounded" />
            <div className="h-3 w-16 bg-muted rounded ml-auto" />
          </div>
          {/* Rows */}
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 p-4 border-b last:border-0"
            >
              <div className="h-4 w-28 bg-muted rounded" />
              <div className="h-5 w-14 bg-muted rounded-full" />
              <div className="h-4 w-16 bg-muted rounded" />
              <div className="h-4 w-16 bg-muted rounded ml-auto" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export type { Transaction, PaymentType };
