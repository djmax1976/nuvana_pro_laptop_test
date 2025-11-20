"use client";

import { useState, useEffect } from "react";
import {
  useClients,
  useUpdateClient,
  useDeleteClient,
  getClientById,
} from "@/lib/api/clients";
import { Client, ClientStatus } from "@/types/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Pencil,
  Search,
  ChevronLeft,
  ChevronRight,
  Power,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { useDebounce } from "@/hooks/useDebounce";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * ClientList component
 * Displays a list of clients in a table format (System Admin only)
 * Includes search, filter by status, and pagination
 */
export function ClientList() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Confirmation dialog states
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [pendingStatus, setPendingStatus] = useState<ClientStatus | null>(null);

  // Debounce search to avoid excessive API calls
  const debouncedSearch = useDebounce(search, 300);
  const { toast } = useToast();

  const { data, isLoading, error } = useClients({
    page,
    limit: 20,
    search: debouncedSearch || undefined,
    status: statusFilter !== "all" ? (statusFilter as ClientStatus) : undefined,
  });

  const updateMutation = useUpdateClient();
  const deleteMutation = useDeleteClient();

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  // Handle status toggle request
  const handleStatusToggle = (client: Client) => {
    setSelectedClient(client);
    const newStatus =
      client.status === ClientStatus.ACTIVE
        ? ClientStatus.INACTIVE
        : ClientStatus.ACTIVE;
    setPendingStatus(newStatus);
    setShowStatusDialog(true);
  };

  // Confirm and execute status change
  const confirmStatusChange = async () => {
    if (!selectedClient || !pendingStatus) return;

    setActionInProgress(selectedClient.client_id);
    try {
      await updateMutation.mutateAsync({
        clientId: selectedClient.public_id,
        data: { status: pendingStatus },
      });

      toast({
        title: "Success",
        description: `Client ${pendingStatus === ClientStatus.ACTIVE ? "activated" : "deactivated"} successfully`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to update client status",
        variant: "destructive",
      });
    } finally {
      setActionInProgress(null);
      setShowStatusDialog(false);
      setSelectedClient(null);
      setPendingStatus(null);
    }
  };

  // Handle delete request
  const handleDeleteRequest = (client: Client) => {
    setSelectedClient(client);
    setShowDeleteDialog(true);
  };

  // Confirm and execute delete
  const confirmDelete = async () => {
    if (!selectedClient) return;

    setActionInProgress(selectedClient.client_id);
    try {
      // Refetch the latest client data to ensure we have the current status
      const freshClientData = await getClientById(selectedClient.public_id);
      const freshClient = freshClientData.data;

      // Check if the client is still ACTIVE
      if (freshClient.status === ClientStatus.ACTIVE) {
        toast({
          title: "Cannot Delete Active Client",
          description:
            "The client is currently ACTIVE. Please deactivate it first before deleting.",
          variant: "destructive",
        });
        setActionInProgress(null);
        setShowDeleteDialog(false);
        setSelectedClient(null);
        return;
      }

      await deleteMutation.mutateAsync(selectedClient.public_id);

      toast({
        title: "Success",
        description: "Client deleted successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to delete client",
        variant: "destructive",
      });
    } finally {
      setActionInProgress(null);
      setShowDeleteDialog(false);
      setSelectedClient(null);
    }
  };

  if (isLoading) {
    return <ClientListSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p className="text-sm font-medium text-destructive">
          Error loading clients
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "An unknown error occurred"}
        </p>
      </div>
    );
  }

  const clients = data?.data || [];
  const meta = data?.meta;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clients</h1>
        <Link href="/clients/new">
          <Button data-testid="client-create-button">
            <Plus className="mr-2 h-4 w-4" />
            Create Client
          </Button>
        </Link>
      </div>

      {/* Search and Filter Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search clients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="client-search-input"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger
            className="w-[180px]"
            data-testid="client-status-filter"
          >
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {clients.length === 0 ? (
        <div className="rounded-lg border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {search || statusFilter !== "all"
              ? "No clients match your search criteria."
              : "No clients found. Create your first client to get started."}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table data-testid="client-list-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Companies</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((client) => (
                  <TableRow
                    key={client.client_id}
                    data-testid={`client-row-${client.client_id}`}
                  >
                    <TableCell
                      className="font-medium"
                      data-testid={`client-name-${client.client_id}`}
                    >
                      {client.name}
                    </TableCell>
                    <TableCell
                      data-testid={`client-status-${client.client_id}`}
                    >
                      <StatusBadge status={client.status} />
                    </TableCell>
                    <TableCell
                      data-testid={`client-company-count-${client.client_id}`}
                    >
                      {client.companyCount ?? client._count?.companies ?? 0}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(client.created_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell
                      className="text-right"
                      data-testid={`client-actions-${client.client_id}`}
                    >
                      <div className="flex justify-end gap-2">
                        <Link href={`/clients/${client.public_id}`}>
                          <Button
                            variant="ghost"
                            size="icon"
                            data-testid={`client-edit-${client.client_id}`}
                          >
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">Edit</span>
                          </Button>
                        </Link>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleStatusToggle(client)}
                          disabled={actionInProgress === client.client_id}
                          data-testid={`client-toggle-status-${client.client_id}`}
                          className={
                            client.status === ClientStatus.ACTIVE
                              ? "text-green-600 hover:text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950"
                              : "text-gray-400 hover:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-900"
                          }
                        >
                          <Power className="h-4 w-4" />
                          <span className="sr-only">
                            {client.status === ClientStatus.ACTIVE
                              ? "Deactivate"
                              : "Activate"}
                          </span>
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteRequest(client)}
                          disabled={actionInProgress === client.client_id}
                          data-testid={`client-delete-${client.client_id}`}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
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

          {/* Pagination Controls */}
          {meta && meta.totalPages > 1 && (
            <div
              className="flex items-center justify-between"
              data-testid="pagination-controls"
            >
              <p className="text-sm text-muted-foreground">
                Showing {(meta.page - 1) * meta.limit + 1} to{" "}
                {Math.min(meta.page * meta.limit, meta.total)} of {meta.total}{" "}
                clients
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm">
                  Page {meta.page} of {meta.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPage((p) => Math.min(meta.totalPages, p + 1))
                  }
                  disabled={page >= meta.totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Status Change Confirmation Dialog */}
      {selectedClient && (
        <ConfirmDialog
          open={showStatusDialog}
          onOpenChange={setShowStatusDialog}
          title={`${pendingStatus === ClientStatus.ACTIVE ? "Activate" : "Deactivate"} Client?`}
          description={`Are you sure you want to ${pendingStatus === ClientStatus.ACTIVE ? "activate" : "deactivate"} "${selectedClient.name}"? ${
            pendingStatus === ClientStatus.INACTIVE
              ? "This will disable their access immediately."
              : "This will enable their access."
          }`}
          confirmText={
            pendingStatus === ClientStatus.ACTIVE ? "Activate" : "Deactivate"
          }
          cancelText="Cancel"
          onConfirm={confirmStatusChange}
          destructive={pendingStatus === ClientStatus.INACTIVE}
          isLoading={actionInProgress === selectedClient.client_id}
        />
      )}

      {/* Delete Confirmation Dialog with Text Input */}
      {selectedClient && (
        <ConfirmDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          title="Delete Client?"
          description={`This will permanently delete "${selectedClient.name}". This action cannot be undone. All data will be permanently removed.${
            selectedClient.status === ClientStatus.ACTIVE
              ? "\n\nNote: This client is currently ACTIVE. You must deactivate it first before deleting."
              : ""
          }`}
          confirmText="Delete Permanently"
          cancelText="Cancel"
          requiresTextConfirmation={true}
          confirmationText="DELETE"
          confirmationLabel='Type "DELETE" to confirm'
          onConfirm={confirmDelete}
          destructive={true}
          isLoading={actionInProgress === selectedClient.client_id}
        />
      )}
    </div>
  );
}

/**
 * Status badge component
 * Displays client status with appropriate styling
 */
function StatusBadge({ status }: { status: string }) {
  const statusStyles = {
    ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
    INACTIVE: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
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
 * Loading skeleton for ClientList
 */
function ClientListSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        <div className="h-10 w-40 animate-pulse rounded bg-muted" />
      </div>
      <div className="flex gap-4">
        <div className="h-10 flex-1 animate-pulse rounded bg-muted" />
        <div className="h-10 w-[180px] animate-pulse rounded bg-muted" />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Companies</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3, 4, 5].map((i) => (
              <TableRow key={i}>
                <TableCell>
                  <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-4 w-8 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
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
