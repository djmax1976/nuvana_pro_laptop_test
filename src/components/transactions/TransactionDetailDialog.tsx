"use client";

/**
 * Transaction Detail Dialog Component
 * Displays full transaction details including line items and payments
 *
 * Story: 3.5 - Transaction Display UI
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useTransactionDetail,
  type TransactionResponse,
} from "@/lib/api/transactions";
import { format } from "date-fns";

interface TransactionDetailDialogProps {
  transactionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
    return format(date, "MMM dd, yyyy HH:mm:ss");
  } catch {
    return timestamp;
  }
}

export function TransactionDetailDialog({
  transactionId,
  open,
  onOpenChange,
}: TransactionDetailDialogProps) {
  const {
    data: transaction,
    isLoading,
    isError,
    error,
    refetch,
  } = useTransactionDetail(
    transactionId,
    { include_line_items: true, include_payments: true },
    { enabled: open && !!transactionId },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
        data-testid="transaction-detail-dialog"
      >
        <DialogHeader>
          <DialogTitle>Transaction Details</DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="space-y-4" data-testid="transaction-detail-loading">
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        )}

        {isError && (
          <div
            className="rounded-lg border border-destructive p-6"
            data-testid="transaction-detail-error"
          >
            <div className="flex items-center gap-2 text-destructive mb-4">
              <AlertCircle className="h-5 w-5" />
              <h3 className="font-semibold">Error Loading Transaction</h3>
            </div>
            <p className="text-muted-foreground mb-4">
              {error instanceof Error
                ? error.message
                : "Failed to load transaction details. Please try again."}
            </p>
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        )}

        {transaction && !isLoading && !isError && (
          <div className="space-y-6">
            {/* Transaction Header */}
            <div className="space-y-2 border-b pb-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Transaction ID
                  </p>
                  <p className="font-medium">{transaction.public_id}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Timestamp</p>
                  <p className="font-medium">
                    {formatTimestamp(transaction.timestamp)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="font-medium text-lg">
                    {formatCurrency(transaction.total)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Cashier</p>
                  <p className="font-medium">
                    {transaction.cashier_name || "Unknown"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Store</p>
                  <p className="font-medium">
                    {transaction.store_name || "Unknown"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Subtotal</p>
                  <p className="font-medium">
                    {formatCurrency(transaction.subtotal)}
                  </p>
                </div>
                {transaction.tax > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground">Tax</p>
                    <p className="font-medium">
                      {formatCurrency(transaction.tax)}
                    </p>
                  </div>
                )}
                {transaction.discount > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground">Discount</p>
                    <p className="font-medium">
                      {formatCurrency(transaction.discount)}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Line Items Table */}
            {transaction.line_items && transaction.line_items.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Line Items</h3>
                <div className="rounded-md border">
                  <Table data-testid="line-items-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Discount</TableHead>
                        <TableHead className="text-right">Line Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transaction.line_items.map((item) => (
                        <TableRow key={item.line_item_id}>
                          <TableCell className="font-medium">
                            {item.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {item.sku || "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.quantity}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(item.unit_price)}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.discount > 0
                              ? formatCurrency(item.discount)
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(item.line_total)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Payments Table */}
            {transaction.payments && transaction.payments.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Payments</h3>
                <div className="rounded-md border">
                  <Table data-testid="payments-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Method</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Reference</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transaction.payments.map((payment) => (
                        <TableRow key={payment.payment_id}>
                          <TableCell className="font-medium">
                            {payment.method}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(payment.amount)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {payment.reference || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
