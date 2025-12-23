"use client";

/**
 * Active Shift View Component for Client Owner Dashboard
 *
 * Displays ongoing/active shift information in a read-only dashboard view.
 * Similar layout to the terminal shift page but customized for client owner viewing.
 *
 * Features:
 * - Shift information (cashier, start time, shift number)
 * - Transaction metrics placeholders (Total Sales, Tax, Voids)
 * - No action buttons (read-only view for client owners)
 *
 * This component is independent and can be customized for client owner
 * specific features without affecting the cashier terminal pages.
 *
 * @security
 * - FE-005: UI_SECURITY - Read-only display, no sensitive data exposed
 * - SEC-004: XSS - All data properly escaped through React rendering
 */

import { format } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign,
  Receipt,
  XCircle,
  Clock,
  User,
  Store,
  Calendar,
} from "lucide-react";
import { ShiftStatusBadge } from "@/components/shifts/ShiftStatusBadge";
import type { ShiftDetailResponse } from "@/lib/api/shifts";
import { formatCurrency } from "@/lib/utils";

interface ActiveShiftViewProps {
  shift: ShiftDetailResponse;
}

/**
 * ActiveShiftView component
 * Displays active/ongoing shift information for client owner dashboard
 */
export function ActiveShiftView({ shift }: ActiveShiftViewProps) {
  // Format shift start time
  const shiftStartTime = format(new Date(shift.opened_at), "h:mm a");
  const shiftStartDate = format(new Date(shift.opened_at), "MMMM d, yyyy");

  // Format shift ID for display (truncated)
  const shortShiftId = shift.shift_id.slice(0, 8);

  return (
    <div className="space-y-6" data-testid="active-shift-view">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Clock className="h-8 w-8" aria-hidden="true" />
              Active Shift
            </h1>
            <p className="text-muted-foreground">
              {shift.store_name || "Store"} - Shift {shortShiftId}
            </p>
          </div>
          <ShiftStatusBadge status={shift.status} shiftId={shift.shift_id} />
        </div>
      </div>

      {/* Shift Information Card */}
      <Card data-testid="shift-info-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" aria-hidden="true" />
            Shift Information
          </CardTitle>
          <CardDescription>Current shift details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Cashier */}
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Cashier
              </p>
              <p className="text-xl font-bold">
                {shift.cashier_name || "Unknown"}
              </p>
            </div>

            {/* Store */}
            <div>
              <p className="text-sm font-medium text-muted-foreground">Store</p>
              <p className="text-xl font-bold flex items-center gap-2">
                <Store className="h-4 w-4 text-muted-foreground" />
                {shift.store_name || "Unknown"}
              </p>
            </div>

            {/* Started At */}
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Started at
              </p>
              <p className="text-lg">{shiftStartTime}</p>
              <p className="text-sm text-muted-foreground">{shiftStartDate}</p>
            </div>

            {/* Opening Cash */}
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Opening Cash
              </p>
              <p className="text-xl font-bold text-green-600">
                {formatCurrency(shift.opening_cash)}
              </p>
            </div>

            {/* Opened By */}
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Opened By
              </p>
              <p className="text-lg">{shift.opener_name || "Unknown"}</p>
            </div>

            {/* Shift ID */}
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Shift ID
              </p>
              <Badge variant="outline" className="font-mono text-xs">
                {shortShiftId}...
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transaction Metrics Card */}
      <Card data-testid="transaction-metrics-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" aria-hidden="true" />
            Transaction Metrics
          </CardTitle>
          <CardDescription>
            Real-time metrics (placeholder - will be populated from POS data)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Total Sales */}
            <div
              className="space-y-2 p-4 bg-muted/50 rounded-lg"
              data-testid="metric-total-sales"
            >
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm font-medium text-muted-foreground">
                  Total Sales
                </p>
              </div>
              <p className="text-2xl font-bold">$0.00</p>
              <p className="text-xs text-muted-foreground">
                Pending POS integration
              </p>
            </div>

            {/* Total Tax Collected */}
            <div
              className="space-y-2 p-4 bg-muted/50 rounded-lg"
              data-testid="metric-total-tax"
            >
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm font-medium text-muted-foreground">
                  Total Tax Collected
                </p>
              </div>
              <p className="text-2xl font-bold">$0.00</p>
              <p className="text-xs text-muted-foreground">
                Pending POS integration
              </p>
            </div>

            {/* Total Voids */}
            <div
              className="space-y-2 p-4 bg-muted/50 rounded-lg"
              data-testid="metric-total-voids"
            >
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm font-medium text-muted-foreground">
                  Total Voids
                </p>
              </div>
              <p className="text-2xl font-bold">$0.00</p>
              <p className="text-xs text-muted-foreground">
                Pending POS integration
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transaction Count Card */}
      <Card data-testid="transaction-count-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" aria-hidden="true" />
            Shift Activity
          </CardTitle>
          <CardDescription>Transaction count for this shift</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="text-4xl font-bold">{shift.transaction_count}</div>
            <div className="text-muted-foreground">
              {shift.transaction_count === 1 ? "Transaction" : "Transactions"}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
