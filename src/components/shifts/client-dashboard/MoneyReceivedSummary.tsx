"use client";

/**
 * Money Received Summary Component for Client Owner Dashboard
 *
 * Read-only display of payment methods breakdown for closed shifts.
 * Similar layout to MoneyReceivedCard but without editable fields.
 *
 * Displays:
 * - Payment method totals (Cash, Credit, Debit, EBT, etc.)
 * - Transaction counts per method
 * - Net totals
 *
 * @security
 * - FE-005: UI_SECURITY - Read-only display, no sensitive data exposed
 * - SEC-004: XSS - All data properly escaped through React rendering
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface PaymentMethod {
  method: string;
  total: number;
  count: number;
}

interface MoneyReceivedSummaryProps {
  paymentMethods: PaymentMethod[];
}

/**
 * Format payment method name for display
 */
function formatMethodName(method: string): string {
  const methodMap: Record<string, string> = {
    cash: "Cash",
    CASH: "Cash",
    credit: "Credit Card",
    CREDIT: "Credit Card",
    credit_card: "Credit Card",
    CREDIT_CARD: "Credit Card",
    debit: "Debit Card",
    DEBIT: "Debit Card",
    debit_card: "Debit Card",
    DEBIT_CARD: "Debit Card",
    ebt: "EBT",
    EBT: "EBT",
    check: "Check",
    CHECK: "Check",
    other: "Other",
    OTHER: "Other",
  };
  return methodMap[method] || method;
}

/**
 * Get icon color based on payment method
 */
function getMethodColor(method: string): string {
  const lowerMethod = method.toLowerCase();
  if (lowerMethod.includes("cash")) return "text-green-600";
  if (lowerMethod.includes("credit")) return "text-blue-600";
  if (lowerMethod.includes("debit")) return "text-purple-600";
  if (lowerMethod.includes("ebt")) return "text-orange-600";
  return "text-muted-foreground";
}

/**
 * Simple horizontal separator
 */
function Separator({ className = "" }: { className?: string }) {
  return <hr className={`border-t border-border ${className}`} />;
}

/**
 * Line item for payment method display
 */
interface LineItemProps {
  label: string;
  amount: number;
  count: number;
  colorClass?: string;
}

function LineItem({ label, amount, count, colorClass = "" }: LineItemProps) {
  return (
    <div className="grid grid-cols-[1fr_100px_60px] gap-2 py-2 items-center">
      <div className={`text-sm font-medium ${colorClass}`}>{label}</div>
      <div className="text-right font-mono text-sm">
        {formatCurrency(amount)}
      </div>
      <div className="text-right text-sm text-muted-foreground">
        {count} txn{count !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

/**
 * Totals row
 */
interface TotalsRowProps {
  label: string;
  amount: number;
  count: number;
}

function TotalsRow({ label, amount, count }: TotalsRowProps) {
  return (
    <div className="grid grid-cols-[1fr_100px_60px] gap-2 py-3 bg-muted/50 px-2 rounded-md items-center">
      <div className="text-sm font-bold">{label}</div>
      <div className="text-right font-bold font-mono text-sm text-primary">
        {formatCurrency(amount)}
      </div>
      <div className="text-right text-sm font-semibold text-muted-foreground">
        {count} txn{count !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

/**
 * MoneyReceivedSummary component
 * Displays payment methods breakdown for closed shifts
 */
export function MoneyReceivedSummary({
  paymentMethods,
}: MoneyReceivedSummaryProps) {
  // Calculate totals
  const totalAmount = paymentMethods.reduce((sum, pm) => sum + pm.total, 0);
  const totalCount = paymentMethods.reduce((sum, pm) => sum + pm.count, 0);

  // Sort payment methods by total (descending)
  const sortedMethods = [...paymentMethods].sort((a, b) => b.total - a.total);

  // Separate cash-based methods from others for grouping
  const cashMethods = sortedMethods.filter((pm) =>
    pm.method.toLowerCase().includes("cash"),
  );
  const cardMethods = sortedMethods.filter(
    (pm) =>
      pm.method.toLowerCase().includes("credit") ||
      pm.method.toLowerCase().includes("debit"),
  );
  const otherMethods = sortedMethods.filter(
    (pm) =>
      !pm.method.toLowerCase().includes("cash") &&
      !pm.method.toLowerCase().includes("credit") &&
      !pm.method.toLowerCase().includes("debit"),
  );

  return (
    <Card data-testid="money-received-summary">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" aria-hidden="true" />
          Payment Methods
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {/* Column Headers */}
        <div className="grid grid-cols-[1fr_100px_60px] gap-2 pb-2 border-b border-border">
          <div className="text-sm font-medium text-muted-foreground">
            Payment Type
          </div>
          <div className="text-sm font-medium text-muted-foreground text-right">
            Amount
          </div>
          <div className="text-sm font-medium text-muted-foreground text-right">
            Count
          </div>
        </div>

        {/* No payment methods message */}
        {paymentMethods.length === 0 && (
          <div className="py-4 text-center text-muted-foreground">
            No payment transactions recorded
          </div>
        )}

        {/* Cash Methods */}
        {cashMethods.length > 0 && (
          <>
            {cashMethods.map((pm) => (
              <LineItem
                key={pm.method}
                label={formatMethodName(pm.method)}
                amount={pm.total}
                count={pm.count}
                colorClass={getMethodColor(pm.method)}
              />
            ))}
          </>
        )}

        {/* Card Methods */}
        {cardMethods.length > 0 && (
          <>
            {cashMethods.length > 0 && <Separator className="my-2" />}
            {cardMethods.map((pm) => (
              <LineItem
                key={pm.method}
                label={formatMethodName(pm.method)}
                amount={pm.total}
                count={pm.count}
                colorClass={getMethodColor(pm.method)}
              />
            ))}
          </>
        )}

        {/* Other Methods */}
        {otherMethods.length > 0 && (
          <>
            {(cashMethods.length > 0 || cardMethods.length > 0) && (
              <Separator className="my-2" />
            )}
            {otherMethods.map((pm) => (
              <LineItem
                key={pm.method}
                label={formatMethodName(pm.method)}
                amount={pm.total}
                count={pm.count}
                colorClass={getMethodColor(pm.method)}
              />
            ))}
          </>
        )}

        {/* Total */}
        {paymentMethods.length > 0 && (
          <>
            <Separator className="my-4" />
            <TotalsRow
              label="Total Received"
              amount={totalAmount}
              count={totalCount}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
