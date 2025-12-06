"use client";

import { useState } from "react";
import {
  useStoresByCompany,
  useUpdateStore,
  useDeleteStore,
  type Store,
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
import { Plus, Pencil, Power, Trash2 } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EditStoreModal } from "@/components/stores/EditStoreModal";
import { useQueryClient } from "@tanstack/react-query";

interface StoreListProps {
  companyId: string;
}

/**
 * StoreList component
 * Displays a list of stores for a company in a table format (Corporate Admin)
 * Shows store_id, name, address (formatted), timezone, status, created_at columns
 * Includes "Create Store" button and "Edit"/"Activate"/"Delete" actions (matching Companies/Users pattern)
 */
export function StoreList({ companyId }: StoreListProps) {
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Confirmation dialog states
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [pendingStatus, setPendingStatus] = useState<StoreStatus | null>(null);

  // Edit store modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedStoreForEdit, setSelectedStoreForEdit] =
    useState<Store | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useStoresByCompany(companyId);
  const updateMutation = useUpdateStore();
  const deleteMutation = useDeleteStore();

  // Handle edit click
  const handleEditClick = (store: Store) => {
    setSelectedStoreForEdit(store);
    setShowEditModal(true);
  };

  // Handle successful store edit
  const handleStoreUpdated = () => {
    queryClient.invalidateQueries({
      queryKey: ["stores"],
      refetchType: "all",
    });
  };

  // Handle status toggle request
  const handleStatusToggle = (store: Store) => {
    setSelectedStore(store);
    // Determine the most appropriate next status (toggle between ACTIVE and INACTIVE)
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
  const handleDeleteRequest = (store: Store) => {
    setSelectedStore(store);
    setShowDeleteDialog(true);
  };

  // Confirm and execute delete
  const confirmDelete = async () => {
    if (!selectedStore) return;

    // Check if the store is ACTIVE
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
        companyId: companyId,
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

  const stores = data?.data || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Stores</h1>
        <Link href={`/stores/new?companyId=${companyId}`}>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Store
          </Button>
        </Link>
      </div>

      {stores.length === 0 ? (
        <div className="rounded-lg border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No stores found. Create your first store to get started.
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Timezone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stores.map((store) => (
                <TableRow key={store.store_id}>
                  <TableCell className="font-mono text-xs">
                    {store.store_id.slice(0, 8)}...
                  </TableCell>
                  <TableCell className="font-medium">{store.name}</TableCell>
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
        <div className="h-10 w-40 animate-pulse rounded bg-muted" />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Name</TableHead>
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
                  <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-4 w-32 animate-pulse rounded bg-muted" />
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
