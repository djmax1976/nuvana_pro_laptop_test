"use client";

import { useState, useCallback } from "react";
import {
  useAllStores,
  useUpdateStore,
  useDeleteStore,
  StoreWithCompany,
  type StoreStatus,
} from "@/lib/api/stores";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { BulkActionsBar } from "@/components/ui/bulk-actions-bar";
import { Checkbox } from "@/components/ui/checkbox";
import { Pencil, RefreshCw, Plus, Power, Trash2 } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EditStoreModal } from "@/components/stores/EditStoreModal";
import { useQueryClient } from "@tanstack/react-query";
import { useTableSort } from "@/hooks/useTableSort";
import { useBulkSelection } from "@/hooks/useBulkSelection";

/**
 * Stores page
 * Displays list of all stores for System Admin
 * Includes sortable columns and bulk actions
 */
export default function StoresPage() {
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [bulkActionInProgress, setBulkActionInProgress] = useState(false);

  // Confirmation dialog states
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBulkStatusDialog, setShowBulkStatusDialog] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [selectedStore, setSelectedStore] = useState<StoreWithCompany | null>(
    null,
  );
  const [pendingStatus, setPendingStatus] = useState<StoreStatus | null>(null);
  const [bulkPendingStatus, setBulkPendingStatus] =
    useState<StoreStatus | null>(null);

  // Edit store modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedStoreForEdit, setSelectedStoreForEdit] =
    useState<StoreWithCompany | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch, isRefetching } = useAllStores();
  const updateMutation = useUpdateStore();
  const deleteMutation = useDeleteStore();

  const stores = data?.data || [];

  // Sorting
  const { sortedData, sortKey, sortDirection, handleSort } =
    useTableSort<StoreWithCompany>({
      data: stores,
    });

  // Bulk selection
  const {
    selectedIds,
    selectedItems,
    isAllSelected,
    isPartiallySelected,
    isSelected,
    toggleSelection,
    toggleSelectAll,
    clearSelection,
    selectedCount,
  } = useBulkSelection({
    data: sortedData,
    getItemId: (store) => store.store_id,
  });

  // Check if any selected items are ACTIVE
  const hasActiveSelectedItems = selectedItems.some(
    (store) => store.status === "ACTIVE",
  );

  // Handle edit click
  const handleEditClick = (store: StoreWithCompany) => {
    setSelectedStoreForEdit(store);
    setShowEditModal(true);
  };

  // Handle successful store edit
  const handleStoreUpdated = () => {
    queryClient.invalidateQueries({ queryKey: ["stores"] });
  };

  // Handle status toggle request
  const handleStatusToggle = (store: StoreWithCompany) => {
    setSelectedStore(store);
    const newStatus: StoreStatus =
      store.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setPendingStatus(newStatus);
    setShowStatusDialog(true);
  };

  // Confirm and execute status change
  const confirmStatusChange = async () => {
    if (!selectedStore || !pendingStatus) return;

    setActionInProgress(selectedStore.store_id);
    try {
      await updateMutation.mutateAsync({
        storeId: selectedStore.store_id,
        data: { status: pendingStatus },
      });

      toast({
        title: "Success",
        description: `Store ${pendingStatus === "ACTIVE" ? "activated" : "deactivated"} successfully`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to update store status",
        variant: "destructive",
      });
    } finally {
      setActionInProgress(null);
      setShowStatusDialog(false);
      setSelectedStore(null);
      setPendingStatus(null);
    }
  };

  // Handle delete request
  const handleDeleteRequest = (store: StoreWithCompany) => {
    setSelectedStore(store);
    setShowDeleteDialog(true);
  };

  // Confirm and execute delete
  const confirmDelete = async () => {
    if (!selectedStore) return;

    if (selectedStore.status === "ACTIVE") {
      toast({
        title: "Cannot Delete Active Store",
        description:
          "The store is currently ACTIVE. Please deactivate it first before deleting.",
        variant: "destructive",
      });
      setShowDeleteDialog(false);
      setSelectedStore(null);
      return;
    }

    setActionInProgress(selectedStore.store_id);
    try {
      await deleteMutation.mutateAsync({
        storeId: selectedStore.store_id,
        companyId: selectedStore.company_id,
      });

      toast({
        title: "Success",
        description: "Store deleted successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to delete store",
        variant: "destructive",
      });
    } finally {
      setActionInProgress(null);
      setShowDeleteDialog(false);
      setSelectedStore(null);
    }
  };

  // Bulk activate
  const handleBulkActivate = useCallback(() => {
    setBulkPendingStatus("ACTIVE");
    setShowBulkStatusDialog(true);
  }, []);

  // Bulk deactivate
  const handleBulkDeactivate = useCallback(() => {
    setBulkPendingStatus("INACTIVE");
    setShowBulkStatusDialog(true);
  }, []);

  // Confirm bulk status change
  const confirmBulkStatusChange = async () => {
    if (!bulkPendingStatus || selectedItems.length === 0) return;

    setBulkActionInProgress(true);
    let successCount = 0;
    let errorCount = 0;

    for (const store of selectedItems) {
      try {
        await updateMutation.mutateAsync({
          storeId: store.store_id,
          data: { status: bulkPendingStatus },
        });
        successCount++;
      } catch {
        errorCount++;
      }
    }

    setBulkActionInProgress(false);
    setShowBulkStatusDialog(false);
    setBulkPendingStatus(null);
    clearSelection();

    if (errorCount === 0) {
      toast({
        title: "Success",
        description: `${successCount} store${successCount !== 1 ? "s" : ""} ${bulkPendingStatus === "ACTIVE" ? "activated" : "deactivated"} successfully`,
      });
    } else {
      toast({
        title: "Partial Success",
        description: `${successCount} succeeded, ${errorCount} failed`,
        variant: "destructive",
      });
    }
  };

  // Bulk delete
  const handleBulkDelete = useCallback(() => {
    setShowBulkDeleteDialog(true);
  }, []);

  // Confirm bulk delete
  const confirmBulkDelete = async () => {
    const deletableItems = selectedItems.filter(
      (store) => store.status !== "ACTIVE",
    );

    if (deletableItems.length === 0) {
      toast({
        title: "Cannot Delete",
        description: "All selected stores are ACTIVE. Deactivate them first.",
        variant: "destructive",
      });
      setShowBulkDeleteDialog(false);
      return;
    }

    setBulkActionInProgress(true);
    let successCount = 0;
    let errorCount = 0;

    for (const store of deletableItems) {
      try {
        await deleteMutation.mutateAsync({
          storeId: store.store_id,
          companyId: store.company_id,
        });
        successCount++;
      } catch {
        errorCount++;
      }
    }

    setBulkActionInProgress(false);
    setShowBulkDeleteDialog(false);
    clearSelection();

    if (errorCount === 0) {
      toast({
        title: "Success",
        description: `${successCount} store${successCount !== 1 ? "s" : ""} deleted successfully`,
      });
    } else {
      toast({
        title: "Partial Success",
        description: `${successCount} deleted, ${errorCount} failed`,
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return <StoreListSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p className="text-sm font-medium text-destructive">
          Error loading stores
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "An unknown error occurred"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Stores</h1>
          <p className="text-sm text-muted-foreground">
            Manage all stores across all companies
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${isRefetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Link href="/stores/new">
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Create Store
            </Button>
          </Link>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      <BulkActionsBar
        selectedCount={selectedCount}
        onClearSelection={clearSelection}
        onBulkActivate={handleBulkActivate}
        onBulkDeactivate={handleBulkDeactivate}
        onBulkDelete={handleBulkDelete}
        isLoading={bulkActionInProgress}
        hasActiveItems={hasActiveSelectedItems}
      />

      {stores.length === 0 ? (
        <div className="rounded-lg border p-8 text-center">
          <p className="text-sm text-muted-foreground">No stores found.</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={isAllSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                    className={isPartiallySelected ? "opacity-50" : ""}
                  />
                </TableHead>
                <SortableTableHead
                  sortKey="name"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                >
                  Name
                </SortableTableHead>
                <SortableTableHead
                  sortKey="company.name"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                >
                  Company
                </SortableTableHead>
                <TableHead>Address</TableHead>
                <SortableTableHead
                  sortKey="timezone"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                >
                  Timezone
                </SortableTableHead>
                <SortableTableHead
                  sortKey="status"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                >
                  Status
                </SortableTableHead>
                <SortableTableHead
                  sortKey="created_at"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                >
                  Created At
                </SortableTableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((store: StoreWithCompany) => (
                <TableRow
                  key={store.store_id}
                  data-state={
                    isSelected(store.store_id) ? "selected" : undefined
                  }
                >
                  <TableCell>
                    <Checkbox
                      checked={isSelected(store.store_id)}
                      onCheckedChange={() => toggleSelection(store.store_id)}
                      aria-label={`Select ${store.name}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{store.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {store.company?.name || "—"}
                  </TableCell>
                  <TableCell>
                    <AddressDisplay location={store.location_json} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {store.timezone}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={store.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(store.created_at), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditClick(store)}
                        disabled={actionInProgress === store.store_id}
                      >
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Edit</span>
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleStatusToggle(store)}
                        disabled={actionInProgress === store.store_id}
                        className={
                          store.status === "ACTIVE"
                            ? "text-green-600 hover:text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950"
                            : store.status === "CLOSED"
                              ? "text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900"
                              : "text-gray-400 hover:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-900"
                        }
                      >
                        <Power className="h-4 w-4" />
                        <span className="sr-only">
                          {store.status === "ACTIVE"
                            ? "Deactivate"
                            : "Activate"}
                        </span>
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteRequest(store)}
                        disabled={
                          actionInProgress === store.store_id ||
                          store.status === "ACTIVE"
                        }
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Delete</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Status Change Confirmation Dialog */}
      {selectedStore && (
        <ConfirmDialog
          open={showStatusDialog}
          onOpenChange={setShowStatusDialog}
          title={`${pendingStatus === "ACTIVE" ? "Activate" : "Deactivate"} Store?`}
          description={`Are you sure you want to ${pendingStatus === "ACTIVE" ? "activate" : "deactivate"} "${selectedStore.name}"?`}
          confirmText={pendingStatus === "ACTIVE" ? "Activate" : "Deactivate"}
          cancelText="Cancel"
          onConfirm={confirmStatusChange}
          destructive={
            pendingStatus === "INACTIVE" || pendingStatus === "CLOSED"
          }
          isLoading={actionInProgress === selectedStore.store_id}
        />
      )}

      {/* Bulk Status Change Confirmation Dialog */}
      <ConfirmDialog
        open={showBulkStatusDialog}
        onOpenChange={setShowBulkStatusDialog}
        title={`${bulkPendingStatus === "ACTIVE" ? "Activate" : "Deactivate"} ${selectedCount} Store${selectedCount !== 1 ? "s" : ""}?`}
        description={`Are you sure you want to ${bulkPendingStatus === "ACTIVE" ? "activate" : "deactivate"} ${selectedCount} selected store${selectedCount !== 1 ? "s" : ""}?`}
        confirmText={`${bulkPendingStatus === "ACTIVE" ? "Activate" : "Deactivate"} All`}
        cancelText="Cancel"
        onConfirm={confirmBulkStatusChange}
        destructive={bulkPendingStatus === "INACTIVE"}
        isLoading={bulkActionInProgress}
      />

      {/* Edit Store Modal */}
      <EditStoreModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        store={selectedStoreForEdit}
        onSuccess={handleStoreUpdated}
      />

      {/* Delete Confirmation Dialog with Text Input */}
      {selectedStore && (
        <ConfirmDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          title="Delete Store?"
          description={`Are you sure you want to delete "${selectedStore.name}"? This action cannot be undone.`}
          confirmText="Delete Permanently"
          cancelText="Cancel"
          onConfirm={confirmDelete}
          destructive={true}
          isLoading={actionInProgress === selectedStore.store_id}
          requiresTextConfirmation={true}
          confirmationText="DELETE"
        />
      )}

      {/* Bulk Delete Confirmation Dialog */}
      <ConfirmDialog
        open={showBulkDeleteDialog}
        onOpenChange={setShowBulkDeleteDialog}
        title={`Delete ${selectedCount} Store${selectedCount !== 1 ? "s" : ""}?`}
        description={`Are you sure you want to delete ${selectedCount} selected store${selectedCount !== 1 ? "s" : ""}? This action cannot be undone.${hasActiveSelectedItems ? " Note: Active stores will be skipped." : ""}`}
        confirmText="Delete All"
        cancelText="Cancel"
        onConfirm={confirmBulkDelete}
        destructive={true}
        isLoading={bulkActionInProgress}
        requiresTextConfirmation={true}
        confirmationText="DELETE"
      />
    </div>
  );
}

/**
 * Address display component
 * Formats location_json address for display
 */
function AddressDisplay({
  location,
}: {
  location: { address?: string; gps?: { lat: number; lng: number } } | null;
}) {
  if (!location) {
    return <span className="text-muted-foreground">—</span>;
  }

  if (location.address) {
    return <span className="text-sm">{location.address}</span>;
  }

  return <span className="text-muted-foreground">—</span>;
}

/**
 * Status badge component
 * Displays store status with appropriate styling
 */
function StatusBadge({ status }: { status: string }) {
  const statusStyles = {
    ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
    INACTIVE: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
    CLOSED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        statusStyles[status as keyof typeof statusStyles] ||
        statusStyles.INACTIVE
      }`}
    >
      {status}
    </span>
  );
}

/**
 * Loading skeleton for StoreList
 */
function StoreListSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        <div className="h-10 w-24 animate-pulse rounded bg-muted" />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12" />
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Timezone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3, 4, 5].map((i) => (
              <TableRow key={i}>
                <TableCell>
                  <div className="h-4 w-4 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-4 w-28 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <div className="h-8 w-8 animate-pulse rounded bg-muted" />
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
