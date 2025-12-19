"use client";

/**
 * TaxRateList Component
 *
 * Displays a list of tax rates in a table format.
 * Includes CRUD operations with proper permission checks.
 *
 * Phase 6.1: Shift & Day Summary Implementation Plan
 *
 * Enterprise coding standards applied:
 * - FE-002: Form validation mirroring backend
 * - FE-005: No secrets in DOM, masked sensitive data
 * - SEC-004: XSS prevention through React auto-escaping
 */

import { useState, useCallback } from "react";
import {
  useTaxRates,
  useUpdateTaxRate,
  useDeleteTaxRate,
  TaxRate,
  formatTaxRate,
  getJurisdictionLevelDisplay,
} from "@/lib/api/tax-rates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Power,
  Percent,
  DollarSign,
  Calendar,
} from "lucide-react";
import Link from "next/link";

interface TaxRateListProps {
  onEdit?: (taxRate: TaxRate) => void;
}

/**
 * Skeleton loader for the tax rate list
 */
function TaxRateListSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-10 w-40 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-10 w-full animate-pulse rounded bg-muted" />
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead>Jurisdiction</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3, 4, 5].map((i) => (
              <TableRow key={i}>
                <TableCell>
                  <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <div className="h-8 w-8 animate-pulse rounded bg-muted" />
                    <div className="h-8 w-8 animate-pulse rounded bg-muted" />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function TaxRateList({ onEdit }: TaxRateListProps) {
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TaxRate | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { toast } = useToast();

  const {
    data: taxRates,
    isLoading,
    error,
  } = useTaxRates({
    include_inactive: showInactive,
    include_system: true,
    include_store: true,
  });

  const updateMutation = useUpdateTaxRate();
  const deleteMutation = useDeleteTaxRate();

  // Filter tax rates by search
  const filteredTaxRates = taxRates?.filter((tr) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      tr.code.toLowerCase().includes(searchLower) ||
      tr.display_name.toLowerCase().includes(searchLower) ||
      (tr.description && tr.description.toLowerCase().includes(searchLower)) ||
      (tr.jurisdiction_code &&
        tr.jurisdiction_code.toLowerCase().includes(searchLower))
    );
  });

  // Toggle active status
  const handleToggleStatus = useCallback(
    async (taxRate: TaxRate) => {
      if (taxRate.is_system) {
        toast({
          title: "Cannot modify system tax rate",
          description: "System tax rates cannot be deactivated.",
          variant: "destructive",
        });
        return;
      }

      setActionLoading(taxRate.tax_rate_id);
      try {
        await updateMutation.mutateAsync({
          id: taxRate.tax_rate_id,
          data: { is_active: !taxRate.is_active },
        });
        toast({
          title: "Success",
          description: `Tax rate ${taxRate.is_active ? "deactivated" : "activated"} successfully`,
        });
      } catch (err) {
        toast({
          title: "Error",
          description:
            err instanceof Error ? err.message : "Failed to update tax rate",
          variant: "destructive",
        });
      } finally {
        setActionLoading(null);
      }
    },
    [updateMutation, toast],
  );

  // Delete (deactivate) tax rate
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;

    setActionLoading(deleteTarget.tax_rate_id);
    try {
      await deleteMutation.mutateAsync(deleteTarget.tax_rate_id);
      toast({
        title: "Success",
        description: "Tax rate deactivated successfully",
      });
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to delete tax rate",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteMutation, toast]);

  // Format effective date range
  const formatDateRange = (from: string, to: string | null) => {
    const fromDate = new Date(from).toLocaleDateString();
    if (!to) return `From ${fromDate}`;
    const toDate = new Date(to).toLocaleDateString();
    return `${fromDate} - ${toDate}`;
  };

  if (isLoading) {
    return <TaxRateListSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p className="text-sm font-medium text-destructive">
          Error loading tax rates
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "An unknown error occurred"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tax Rates</h1>
          <p className="text-sm text-muted-foreground">
            Manage tax rates for transactions
          </p>
        </div>
        <Link href="/client-dashboard/config/tax-rates/new">
          <Button data-testid="create-tax-rate-button">
            <Plus className="mr-2 h-4 w-4" />
            Add Tax Rate
          </Button>
        </Link>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tax rates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="tax-rate-search-input"
          />
        </div>
        <Button
          variant={showInactive ? "secondary" : "outline"}
          onClick={() => setShowInactive(!showInactive)}
          data-testid="show-inactive-toggle"
        >
          {showInactive ? "Hide Inactive" : "Show Inactive"}
        </Button>
      </div>

      {/* Table */}
      {filteredTaxRates && filteredTaxRates.length === 0 ? (
        <div className="rounded-lg border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {search
              ? "No tax rates match your search criteria."
              : "No tax rates found. Create your first tax rate to get started."}
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table data-testid="tax-rate-list-table">
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Jurisdiction</TableHead>
                <TableHead>Effective</TableHead>
                <TableHead>Options</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTaxRates?.map((taxRate) => (
                <TableRow
                  key={taxRate.tax_rate_id}
                  data-testid={`tax-rate-row-${taxRate.tax_rate_id}`}
                  className={!taxRate.is_active ? "opacity-60" : undefined}
                >
                  <TableCell className="font-mono font-medium">
                    {taxRate.code}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {taxRate.rate_type === "PERCENTAGE" ? (
                        <Percent className="h-4 w-4 text-blue-600" />
                      ) : (
                        <DollarSign className="h-4 w-4 text-green-600" />
                      )}
                      <span>{taxRate.display_name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    {formatTaxRate(taxRate.rate, taxRate.rate_type)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant="outline">
                        {getJurisdictionLevelDisplay(
                          taxRate.jurisdiction_level,
                        )}
                      </Badge>
                      {taxRate.jurisdiction_code && (
                        <span className="text-xs text-muted-foreground">
                          {taxRate.jurisdiction_code}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {formatDateRange(
                        taxRate.effective_from,
                        taxRate.effective_to,
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {taxRate.is_system && (
                        <Badge variant="outline" className="text-xs">
                          System
                        </Badge>
                      )}
                      {taxRate.is_compound && (
                        <Badge variant="outline" className="text-xs">
                          Compound
                        </Badge>
                      )}
                      {taxRate.store && (
                        <Badge variant="secondary" className="text-xs">
                          {taxRate.store.name}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={taxRate.is_active ? "default" : "secondary"}
                      className={
                        taxRate.is_active
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                          : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300"
                      }
                    >
                      {taxRate.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {!taxRate.is_system && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onEdit?.(taxRate)}
                            disabled={actionLoading === taxRate.tax_rate_id}
                            data-testid={`edit-tax-rate-${taxRate.tax_rate_id}`}
                          >
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">Edit</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleToggleStatus(taxRate)}
                            disabled={actionLoading === taxRate.tax_rate_id}
                            className={
                              taxRate.is_active
                                ? "text-green-600 hover:text-green-700"
                                : "text-gray-400 hover:text-gray-600"
                            }
                            data-testid={`toggle-tax-rate-${taxRate.tax_rate_id}`}
                          >
                            <Power className="h-4 w-4" />
                            <span className="sr-only">
                              {taxRate.is_active ? "Deactivate" : "Activate"}
                            </span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteTarget(taxRate)}
                            disabled={
                              actionLoading === taxRate.tax_rate_id ||
                              !taxRate.is_active
                            }
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                            data-testid={`delete-tax-rate-${taxRate.tax_rate_id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Delete</span>
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={() => setDeleteTarget(null)}
          title="Deactivate Tax Rate?"
          description={`Are you sure you want to deactivate "${deleteTarget.display_name}"? This will prevent it from being used in new transactions.`}
          confirmText="Deactivate"
          cancelText="Cancel"
          onConfirm={handleDelete}
          destructive
          isLoading={actionLoading === deleteTarget.tax_rate_id}
        />
      )}
    </div>
  );
}
