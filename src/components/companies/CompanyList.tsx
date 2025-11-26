"use client";

import { useState, useCallback } from "react";
import {
  useCompanies,
  useUpdateCompany,
  useDeleteCompany,
  type Company,
  type CompanyStatus,
} from "@/lib/api/companies";
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
import { Pencil, Power, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EditCompanyModal } from "@/components/companies/EditCompanyModal";
import { useQueryClient } from "@tanstack/react-query";
import { useTableSort } from "@/hooks/useTableSort";
import { useBulkSelection } from "@/hooks/useBulkSelection";

/**
 * CompanyList component
 * Displays a list of companies in a table format (System Admin only)
 * Shows owner, name, status, created_at, updated_at columns
 * Includes sortable columns and bulk actions
 */
export function CompanyList() {
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [bulkActionInProgress, setBulkActionInProgress] = useState(false);

  // Confirmation dialog states
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBulkStatusDialog, setShowBulkStatusDialog] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [pendingStatus, setPendingStatus] = useState<CompanyStatus | null>(
    null,
  );
  const [bulkPendingStatus, setBulkPendingStatus] =
    useState<CompanyStatus | null>(null);

  // Edit company modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCompanyForEdit, setSelectedCompanyForEdit] =
    useState<Company | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useCompanies();

  const updateMutation = useUpdateCompany();
  const deleteMutation = useDeleteCompany();

  const companies = data?.data || [];

  // Sorting
  const { sortedData, sortKey, sortDirection, handleSort } =
    useTableSort<Company>({
      data: companies,
    });

  // Bulk selection
  const {
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
    getItemId: (company) => company.company_id,
  });

  // Check if any selected items are ACTIVE
  const hasActiveSelectedItems = selectedItems.some(
    (company) => company.status === "ACTIVE",
  );

  // Handle status toggle request
  const handleStatusToggle = (company: Company) => {
    setSelectedCompany(company);
    const newStatus: CompanyStatus =
      company.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setPendingStatus(newStatus);
    setShowStatusDialog(true);
  };

  // Confirm and execute status change
  const confirmStatusChange = async () => {
    if (!selectedCompany || !pendingStatus) return;

    setActionInProgress(selectedCompany.company_id);
    try {
      await updateMutation.mutateAsync({
        companyId: selectedCompany.company_id,
        data: { status: pendingStatus },
      });

      toast({
        title: "Success",
        description: `Company ${pendingStatus === "ACTIVE" ? "activated" : "deactivated"} successfully`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to update company status",
        variant: "destructive",
      });
    } finally {
      setActionInProgress(null);
      setShowStatusDialog(false);
      setSelectedCompany(null);
      setPendingStatus(null);
    }
  };

  // Handle delete request
  const handleDeleteRequest = (company: Company) => {
    setSelectedCompany(company);
    setShowDeleteDialog(true);
  };

  // Confirm and execute delete
  const confirmDelete = async () => {
    if (!selectedCompany) return;

    if (selectedCompany.status === "ACTIVE") {
      toast({
        title: "Cannot Delete Active Company",
        description:
          "The company is currently ACTIVE. Please deactivate it first before deleting.",
        variant: "destructive",
      });
      setShowDeleteDialog(false);
      setSelectedCompany(null);
      return;
    }

    setActionInProgress(selectedCompany.company_id);
    try {
      await deleteMutation.mutateAsync(selectedCompany.company_id);

      toast({
        title: "Success",
        description: "Company deleted successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to delete company",
        variant: "destructive",
      });
    } finally {
      setActionInProgress(null);
      setShowDeleteDialog(false);
      setSelectedCompany(null);
    }
  };

  // Handle edit click
  const handleEditClick = (company: Company) => {
    setSelectedCompanyForEdit(company);
    setShowEditModal(true);
  };

  // Handle successful company edit
  const handleCompanyUpdated = () => {
    queryClient.invalidateQueries({ queryKey: ["companies"] });
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

    for (const company of selectedItems) {
      try {
        await updateMutation.mutateAsync({
          companyId: company.company_id,
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
        description: `${successCount} ${successCount !== 1 ? "companies" : "company"} ${bulkPendingStatus === "ACTIVE" ? "activated" : "deactivated"} successfully`,
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
      (company) => company.status !== "ACTIVE",
    );

    if (deletableItems.length === 0) {
      toast({
        title: "Cannot Delete",
        description:
          "All selected companies are ACTIVE. Deactivate them first.",
        variant: "destructive",
      });
      setShowBulkDeleteDialog(false);
      return;
    }

    setBulkActionInProgress(true);
    let successCount = 0;
    let errorCount = 0;

    for (const company of deletableItems) {
      try {
        await deleteMutation.mutateAsync(company.company_id);
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
        description: `${successCount} ${successCount !== 1 ? "companies" : "company"} deleted successfully`,
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
    return <CompanyListSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p className="text-sm font-medium text-destructive">
          Error loading companies
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
        <h1 className="text-2xl font-bold">Companies</h1>
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

      {companies.length === 0 ? (
        <div className="rounded-lg border p-8 text-center">
          <p className="text-sm text-muted-foreground">No companies found.</p>
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
                  sortKey="owner_name"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                >
                  Owner
                </SortableTableHead>
                <SortableTableHead
                  sortKey="name"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                >
                  Name
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
                <SortableTableHead
                  sortKey="updated_at"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                >
                  Updated At
                </SortableTableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((company) => (
                <TableRow
                  key={company.company_id}
                  data-state={
                    isSelected(company.company_id) ? "selected" : undefined
                  }
                >
                  <TableCell>
                    <Checkbox
                      checked={isSelected(company.company_id)}
                      onCheckedChange={() =>
                        toggleSelection(company.company_id)
                      }
                      aria-label={`Select ${company.name}`}
                    />
                  </TableCell>
                  <TableCell className="text-sm">
                    <div>
                      <div className="font-medium">
                        {company.owner_name || "-"}
                      </div>
                      {company.owner_email && (
                        <div className="text-xs text-muted-foreground">
                          {company.owner_email}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{company.name}</TableCell>
                  <TableCell>
                    <StatusBadge status={company.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(company.created_at), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(company.updated_at), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditClick(company)}
                        disabled={actionInProgress === company.company_id}
                      >
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Edit</span>
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleStatusToggle(company)}
                        disabled={actionInProgress === company.company_id}
                        className={
                          company.status === "ACTIVE"
                            ? "text-green-600 hover:text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950"
                            : company.status === "SUSPENDED"
                              ? "text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900"
                              : company.status === "PENDING"
                                ? "text-yellow-400 hover:text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900"
                                : "text-gray-400 hover:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-900"
                        }
                      >
                        <Power className="h-4 w-4" />
                        <span className="sr-only">
                          {company.status === "ACTIVE"
                            ? "Deactivate"
                            : "Activate"}
                        </span>
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteRequest(company)}
                        disabled={
                          actionInProgress === company.company_id ||
                          company.status === "ACTIVE"
                        }
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 disabled:opacity-40 disabled:cursor-not-allowed"
                        title={
                          company.status === "ACTIVE"
                            ? "Deactivate company before deleting"
                            : "Delete company"
                        }
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
      {selectedCompany && (
        <ConfirmDialog
          open={showStatusDialog}
          onOpenChange={setShowStatusDialog}
          title={`${pendingStatus === "ACTIVE" ? "Activate" : "Deactivate"} Company?`}
          description={`Are you sure you want to ${pendingStatus === "ACTIVE" ? "activate" : "deactivate"} "${selectedCompany.name}"?`}
          confirmText={pendingStatus === "ACTIVE" ? "Activate" : "Deactivate"}
          cancelText="Cancel"
          onConfirm={confirmStatusChange}
          destructive={
            pendingStatus === "INACTIVE" || pendingStatus === "SUSPENDED"
          }
          isLoading={actionInProgress === selectedCompany.company_id}
        />
      )}

      {/* Bulk Status Change Confirmation Dialog */}
      <ConfirmDialog
        open={showBulkStatusDialog}
        onOpenChange={setShowBulkStatusDialog}
        title={`${bulkPendingStatus === "ACTIVE" ? "Activate" : "Deactivate"} ${selectedCount} ${selectedCount !== 1 ? "Companies" : "Company"}?`}
        description={`Are you sure you want to ${bulkPendingStatus === "ACTIVE" ? "activate" : "deactivate"} ${selectedCount} selected ${selectedCount !== 1 ? "companies" : "company"}?`}
        confirmText={`${bulkPendingStatus === "ACTIVE" ? "Activate" : "Deactivate"} All`}
        cancelText="Cancel"
        onConfirm={confirmBulkStatusChange}
        destructive={bulkPendingStatus === "INACTIVE"}
        isLoading={bulkActionInProgress}
      />

      {/* Delete Confirmation Dialog with Text Input */}
      {selectedCompany && (
        <ConfirmDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          title="Delete Company?"
          description={`This will permanently delete "${selectedCompany.name}". This action cannot be undone. All data will be permanently removed.${
            selectedCompany.status === "ACTIVE"
              ? "\n\nNote: This company is currently ACTIVE. You must deactivate it first before deleting."
              : ""
          }`}
          confirmText="Delete Permanently"
          cancelText="Cancel"
          requiresTextConfirmation={true}
          confirmationText="DELETE"
          confirmationLabel='Type "DELETE" to confirm'
          onConfirm={confirmDelete}
          destructive={true}
          isLoading={actionInProgress === selectedCompany.company_id}
        />
      )}

      {/* Bulk Delete Confirmation Dialog */}
      <ConfirmDialog
        open={showBulkDeleteDialog}
        onOpenChange={setShowBulkDeleteDialog}
        title={`Delete ${selectedCount} ${selectedCount !== 1 ? "Companies" : "Company"}?`}
        description={`Are you sure you want to delete ${selectedCount} selected ${selectedCount !== 1 ? "companies" : "company"}? This action cannot be undone.${hasActiveSelectedItems ? " Note: Active companies will be skipped." : ""}`}
        confirmText="Delete All"
        cancelText="Cancel"
        onConfirm={confirmBulkDelete}
        destructive={true}
        isLoading={bulkActionInProgress}
        requiresTextConfirmation={true}
        confirmationText="DELETE"
      />

      {/* Edit Company Modal */}
      <EditCompanyModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        company={selectedCompanyForEdit}
        onSuccess={handleCompanyUpdated}
      />
    </div>
  );
}

/**
 * Status badge component
 * Displays company status with appropriate styling
 */
function StatusBadge({ status }: { status: string }) {
  const statusStyles = {
    ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
    INACTIVE: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
    SUSPENDED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
    PENDING:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
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
 * Loading skeleton for CompanyList
 */
function CompanyListSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 animate-pulse rounded bg-muted" />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12" />
              <TableHead>Owner</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead>Updated At</TableHead>
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
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
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
