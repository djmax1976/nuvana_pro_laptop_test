"use client";

/**
 * Transaction List Component
 * Displays a list of transactions in a table with filtering and pagination
 * Allows users to click transactions to view full details
 *
 * Story: 3.5 - Transaction Display UI
 */

import {
  useTransactions,
  type TransactionResponse,
} from "@/lib/api/transactions";
import type {
  TransactionQueryFilters,
  PaginationOptions,
} from "@/lib/api/transactions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, RefreshCw, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import * as React from "react";

interface TransactionListProps {
  filters?: TransactionQueryFilters;
  pagination?: PaginationOptions;
  onTransactionClick?: (transaction: TransactionResponse) => void;
  onMetaChange?: (meta: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  }) => void;
}

/**
 * Format currency value
 */
function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return format(date, "MMM dd, yyyy HH:mm");
  } catch {
    return timestamp;
  }
}

export function TransactionList({
  filters,
  pagination,
  onTransactionClick,
  onMetaChange,
}: TransactionListProps) {
  const { data, isLoading, isError, error, refetch } = useTransactions(
    filters,
    pagination,
  );

  // Notify parent of meta changes
  React.useEffect(() => {
    if (data?.meta && onMetaChange) {
      onMetaChange(data.meta);
    }
  }, [data?.meta, onMetaChange]);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="transaction-list-loading">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Skeleton className="h-4 w-24" />
                </TableHead>
                <TableHead>
                  <Skeleton className="h-4 w-32" />
                </TableHead>
                <TableHead>
                  <Skeleton className="h-4 w-24" />
                </TableHead>
                <TableHead>
                  <Skeleton className="h-4 w-32" />
                </TableHead>
                <TableHead>
                  <Skeleton className="h-4 w-32" />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3, 4, 5].map((i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-5 w-28" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-32" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div
        className="rounded-lg border border-destructive p-6"
        data-testid="transaction-list-error"
      >
        <div className="flex items-center gap-2 text-destructive mb-4">
          <AlertCircle className="h-5 w-5" />
          <h3 className="font-semibold">Error Loading Transactions</h3>
        </div>
        <p className="text-muted-foreground mb-4">
          {error instanceof Error
            ? error.message
            : "Failed to load transactions. Please try again."}
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  // Empty state
  if (!data || !data.transactions || data.transactions.length === 0) {
    return (
      <div
        className="text-center py-12 border rounded-lg"
        data-testid="transaction-list-empty"
      >
        <Receipt className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">No Transactions Found</h3>
        <p className="text-muted-foreground">
          {filters && Object.keys(filters).length > 0
            ? "No transactions match your current filters."
            : "No transactions available."}
        </p>
      </div>
    );
  }

  // Render transaction table
  return (
    <div className="space-y-4" data-testid="transaction-list-table">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Transaction ID</TableHead>
              <TableHead>Timestamp</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Cashier</TableHead>
              <TableHead>Store</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.transactions.map((transaction) => (
              <TableRow
                key={transaction.transaction_id}
                data-testid={`transaction-row-${transaction.transaction_id}`}
                className={
                  onTransactionClick ? "cursor-pointer hover:bg-muted/50" : ""
                }
                onClick={() => onTransactionClick?.(transaction)}
              >
                <TableCell className="font-medium">
                  {transaction.public_id}
                </TableCell>
                <TableCell>{formatTimestamp(transaction.timestamp)}</TableCell>
                <TableCell>{formatCurrency(transaction.total)}</TableCell>
                <TableCell>{transaction.cashier_name || "Unknown"}</TableCell>
                <TableCell>{transaction.store_name || "Unknown"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
