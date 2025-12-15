"use client";

/**
 * Store Cashiers Tab Component
 * Displays cashiers at a store with PIN reset action
 *
 * Story 6.14: Store Settings Page with Employee/Cashier Management
 * AC #7: Display cashier table with Employee ID, Name, Hired On, Status
 *        Each row has a "Reset PIN" action button
 */

import { useState } from "react";
import { useCashiers, type Cashier } from "@/lib/api/cashiers";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { KeyRound } from "lucide-react";
import { ResetPINModal } from "./ResetPINModal";
import { format } from "date-fns";

interface StoreCashiersTabProps {
  storeId: string;
}

export function StoreCashiersTab({ storeId }: StoreCashiersTabProps) {
  const [resetPINCashier, setResetPINCashier] = useState<Cashier | null>(null);

  // Fetch cashiers filtered by store
  const {
    data: cashiers,
    isLoading,
    isError,
    error,
  } = useCashiers(storeId, { is_active: true });

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="store-cashiers-tab">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load cashiers"}
        </p>
      </div>
    );
  }

  if (!cashiers || cashiers.length === 0) {
    return (
      <div className="space-y-4" data-testid="store-cashiers-tab">
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">
            No cashiers found for this store
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="store-cashiers-tab">
      <Table data-testid="cashier-table">
        <TableHeader>
          <TableRow>
            <TableHead>Employee ID</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Hired On</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cashiers.map((cashier, index) => (
            <TableRow key={cashier.cashier_id}>
              <TableCell className="font-mono text-sm">
                {cashier.employee_id}
              </TableCell>
              <TableCell className="font-medium">{cashier.name}</TableCell>
              <TableCell>
                {cashier.hired_on
                  ? format(new Date(cashier.hired_on), "MMM d, yyyy")
                  : "—"}
              </TableCell>
              <TableCell>
                <Badge variant={cashier.is_active ? "default" : "outline"}>
                  {cashier.is_active ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setResetPINCashier(cashier)}
                  data-testid={`reset-pin-button-${index}`}
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  Reset PIN
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Reset PIN Modal */}
      {resetPINCashier && (
        <ResetPINModal
          cashier={resetPINCashier}
          storeId={storeId}
          open={!!resetPINCashier}
          onOpenChange={(open) => {
            if (!open) setResetPINCashier(null);
          }}
        />
      )}
    </div>
  );
}
