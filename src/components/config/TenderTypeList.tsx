"use client";

/**
 * TenderTypeList Component
 *
 * Displays a list of tender types (payment methods) in a table format.
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
  useTenderTypes,
  useUpdateTenderType,
  useDeleteTenderType,
  TenderType,
} from "@/lib/api/tender-types";
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
  CreditCard,
  Banknote,
} from "lucide-react";
import Link from "next/link";

interface TenderTypeListProps {
  onEdit?: (tenderType: TenderType) => void;
}

/**
 * Skeleton loader for the tender type list
 */
function TenderTypeListSkeleton() {
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
              <TableHead>Type</TableHead>
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

export function TenderTypeList({ onEdit }: TenderTypeListProps) {
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TenderType | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { toast } = useToast();

  const {
    data: tenderTypes,
    isLoading,
    error,
  } = useTenderTypes({
    include_inactive: showInactive,
    include_system: true,
  });

  const updateMutation = useUpdateTenderType();
  const deleteMutation = useDeleteTenderType();

  // Filter tender types by search
  const filteredTenderTypes = tenderTypes?.filter((tt) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      tt.code.toLowerCase().includes(searchLower) ||
      tt.name.toLowerCase().includes(searchLower) ||
      (tt.description && tt.description.toLowerCase().includes(searchLower))
    );
  });

  // Toggle active status
  const handleToggleStatus = useCallback(
    async (tenderType: TenderType) => {
      if (tenderType.is_system) {
        toast({
          title: "Cannot modify system tender type",
          description: "System tender types cannot be deactivated.",
          variant: "destructive",
        });
        return;
      }

      setActionLoading(tenderType.tender_type_id);
      try {
        await updateMutation.mutateAsync({
          id: tenderType.tender_type_id,
          data: { is_active: !tenderType.is_active },
        });
        toast({
          title: "Success",
          description: `Tender type ${tenderType.is_active ? "deactivated" : "activated"} successfully`,
        });
      } catch (err) {
        toast({
          title: "Error",
          description:
            err instanceof Error ? err.message : "Failed to update tender type",
          variant: "destructive",
        });
      } finally {
        setActionLoading(null);
      }
    },
    [updateMutation, toast],
  );

  // Delete (deactivate) tender type
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;

    setActionLoading(deleteTarget.tender_type_id);
    try {
      await deleteMutation.mutateAsync(deleteTarget.tender_type_id);
      toast({
        title: "Success",
        description: "Tender type deactivated successfully",
      });
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to delete tender type",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteMutation, toast]);

  if (isLoading) {
    return <TenderTypeListSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p className="text-sm font-medium text-destructive">
          Error loading tender types
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
          <h1 className="text-2xl font-bold">Tender Types</h1>
          <p className="text-sm text-muted-foreground">
            Manage payment methods for transactions
          </p>
        </div>
        <Link href="/client-dashboard/config/tender-types/new">
          <Button data-testid="create-tender-type-button">
            <Plus className="mr-2 h-4 w-4" />
            Add Tender Type
          </Button>
        </Link>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tender types..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="tender-type-search-input"
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
      {filteredTenderTypes && filteredTenderTypes.length === 0 ? (
        <div className="rounded-lg border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {search
              ? "No tender types match your search criteria."
              : "No tender types found. Create your first tender type to get started."}
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table data-testid="tender-type-list-table">
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Options</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTenderTypes?.map((tenderType) => (
                <TableRow
                  key={tenderType.tender_type_id}
                  data-testid={`tender-type-row-${tenderType.tender_type_id}`}
                  className={!tenderType.is_active ? "opacity-60" : undefined}
                >
                  <TableCell className="font-mono font-medium">
                    {tenderType.code}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {tenderType.is_cash ? (
                        <Banknote className="h-4 w-4 text-green-600" />
                      ) : (
                        <CreditCard className="h-4 w-4 text-blue-600" />
                      )}
                      <span>{tenderType.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={tenderType.is_cash ? "default" : "secondary"}
                    >
                      {tenderType.is_cash ? "Cash" : "Non-Cash"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {tenderType.is_system && (
                        <Badge variant="outline" className="text-xs">
                          System
                        </Badge>
                      )}
                      {tenderType.requires_reference && (
                        <Badge variant="outline" className="text-xs">
                          Ref Required
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={tenderType.is_active ? "default" : "secondary"}
                      className={
                        tenderType.is_active
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                          : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300"
                      }
                    >
                      {tenderType.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {!tenderType.is_system && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onEdit?.(tenderType)}
                            disabled={
                              actionLoading === tenderType.tender_type_id
                            }
                            data-testid={`edit-tender-type-${tenderType.tender_type_id}`}
                          >
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">Edit</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleToggleStatus(tenderType)}
                            disabled={
                              actionLoading === tenderType.tender_type_id
                            }
                            className={
                              tenderType.is_active
                                ? "text-green-600 hover:text-green-700"
                                : "text-gray-400 hover:text-gray-600"
                            }
                            data-testid={`toggle-tender-type-${tenderType.tender_type_id}`}
                          >
                            <Power className="h-4 w-4" />
                            <span className="sr-only">
                              {tenderType.is_active ? "Deactivate" : "Activate"}
                            </span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteTarget(tenderType)}
                            disabled={
                              actionLoading === tenderType.tender_type_id ||
                              !tenderType.is_active
                            }
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                            data-testid={`delete-tender-type-${tenderType.tender_type_id}`}
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
          title="Deactivate Tender Type?"
          description={`Are you sure you want to deactivate "${deleteTarget.name}"? This will prevent it from being used in new transactions.`}
          confirmText="Deactivate"
          cancelText="Cancel"
          onConfirm={handleDelete}
          destructive
          isLoading={actionLoading === deleteTarget.tender_type_id}
        />
      )}
    </div>
  );
}
