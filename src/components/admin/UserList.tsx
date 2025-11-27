"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  useAdminUsers,
  useUpdateUserStatus,
  useDeleteUser,
} from "@/lib/api/admin-users";
import { AdminUser, UserStatus, UserRoleDetail } from "@/types/admin-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useDebounce } from "@/hooks/useDebounce";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EditUserModal } from "@/components/admin/EditUserModal";
import { useQueryClient } from "@tanstack/react-query";
import { useTableSort } from "@/hooks/useTableSort";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { BulkActionsBar } from "@/components/ui/bulk-actions-bar";

/**
 * UserList component
 * Displays a list of users in a table format (System Admin only)
 * Includes search, filter by status, pagination, sorting, and bulk actions
 * Shows role badges with color coding by scope
 */
export function UserList() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  // Confirmation dialog states
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [pendingStatus, setPendingStatus] = useState<UserStatus | null>(null);

  // Delete confirmation dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null);

  // Bulk action dialog states
  const [showBulkStatusDialog, setShowBulkStatusDialog] = useState(false);
  const [pendingBulkStatus, setPendingBulkStatus] = useState<UserStatus | null>(
    null,
  );
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  // Edit user modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUserForEdit, setSelectedUserForEdit] =
    useState<AdminUser | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Debounce search to avoid excessive API calls
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading, error } = useAdminUsers({
    page,
    limit: 20,
    search: debouncedSearch || undefined,
    status: statusFilter !== "all" ? (statusFilter as UserStatus) : undefined,
  });

  const updateMutation = useUpdateUserStatus();
  const deleteMutation = useDeleteUser();

  const users = data?.data || [];
  const meta = data?.meta;

  // Helper functions to extract sortable values from roles
  const getRolesString = useCallback((user: AdminUser) => {
    return (
      user.roles
        .map((r) => r.role.code)
        .sort()
        .join(", ") || ""
    );
  }, []);

  const getCompanyString = useCallback((user: AdminUser) => {
    const companies = new Map<string, string>();
    user.roles.forEach((role) => {
      if (role.company_id && role.company_name) {
        companies.set(role.company_id, role.company_name);
      }
    });
    return Array.from(companies.values()).sort().join(", ") || "";
  }, []);

  const getStoreString = useCallback((user: AdminUser) => {
    const stores = new Map<string, string>();
    user.roles.forEach((role) => {
      if (role.store_id && role.store_name) {
        stores.set(role.store_id, role.store_name);
      }
    });
    return Array.from(stores.values()).sort().join(", ") || "";
  }, []);

  // Sorting hook - applies to the current page's data
  const {
    sortedData: baseSortedData,
    sortKey,
    sortDirection,
    handleSort,
  } = useTableSort<AdminUser>({
    data: users,
  });

  // Custom sorting for computed fields (roles, company, store)
  const sortedData = useMemo(() => {
    if (!sortKey || !sortDirection) return baseSortedData;

    if (sortKey === "roles" || sortKey === "company" || sortKey === "store") {
      const getValueFn =
        sortKey === "roles"
          ? getRolesString
          : sortKey === "company"
            ? getCompanyString
            : getStoreString;

      return [...baseSortedData].sort((a, b) => {
        const aVal = getValueFn(a).toLowerCase();
        const bVal = getValueFn(b).toLowerCase();

        // Empty values go to the end
        if (!aVal && !bVal) return 0;
        if (!aVal) return 1;
        if (!bVal) return -1;

        const comparison = aVal.localeCompare(bVal);
        return sortDirection === "asc" ? comparison : -comparison;
      });
    }

    return baseSortedData;
  }, [
    baseSortedData,
    sortKey,
    sortDirection,
    getRolesString,
    getCompanyString,
    getStoreString,
  ]);

  // Bulk selection hook
  const {
    selectedItems,
    isAllSelected,
    isPartiallySelected,
    isSelected,
    toggleSelection,
    toggleSelectAll,
    clearSelection,
    selectedCount,
  } = useBulkSelection<AdminUser>({
    data: sortedData,
    getItemId: (user) => user.user_id,
  });

  // Check if any selected users are ACTIVE (for delete button)
  const hasActiveSelected = useMemo(() => {
    return selectedItems.some((user) => user.status === UserStatus.ACTIVE);
  }, [selectedItems]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  // Handle status toggle request
  const handleStatusToggle = (user: AdminUser) => {
    setSelectedUser(user);
    const newStatus: UserStatus =
      user.status === UserStatus.ACTIVE
        ? UserStatus.INACTIVE
        : UserStatus.ACTIVE;
    setPendingStatus(newStatus);
    setShowStatusDialog(true);
  };

  // Confirm and execute status change
  const confirmStatusChange = async () => {
    if (!selectedUser || !pendingStatus) return;

    setActionInProgress(selectedUser.user_id);
    try {
      await updateMutation.mutateAsync({
        userId: selectedUser.user_id,
        data: { status: pendingStatus },
      });

      toast({
        title: "Success",
        description: `User ${pendingStatus === UserStatus.ACTIVE ? "activated" : "deactivated"} successfully`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to update user status",
        variant: "destructive",
      });
    } finally {
      setActionInProgress(null);
      setShowStatusDialog(false);
      setSelectedUser(null);
      setPendingStatus(null);
    }
  };

  // Handle edit click
  const handleEditClick = (user: AdminUser) => {
    setSelectedUserForEdit(user);
    setShowEditModal(true);
  };

  // Handle successful user edit
  const handleUserUpdated = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  };

  // Handle delete click
  const handleDeleteClick = (user: AdminUser) => {
    setUserToDelete(user);
    setShowDeleteDialog(true);
  };

  // Confirm and execute user deletion
  const confirmDelete = async () => {
    if (!userToDelete) return;

    setActionInProgress(userToDelete.user_id);
    try {
      console.log("Deleting user:", userToDelete.user_id);
      const result = await deleteMutation.mutateAsync(userToDelete.user_id);
      console.log("Delete result:", result);

      toast({
        title: "Success",
        description: `User "${userToDelete.name}" deleted successfully`,
      });
    } catch (error) {
      console.error("Delete error:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to delete user",
        variant: "destructive",
      });
    } finally {
      setActionInProgress(null);
      setShowDeleteDialog(false);
      setUserToDelete(null);
    }
  };

  // Bulk activate handler
  const handleBulkActivate = useCallback(() => {
    setPendingBulkStatus(UserStatus.ACTIVE);
    setShowBulkStatusDialog(true);
  }, []);

  // Bulk deactivate handler
  const handleBulkDeactivate = useCallback(() => {
    setPendingBulkStatus(UserStatus.INACTIVE);
    setShowBulkStatusDialog(true);
  }, []);

  // Confirm bulk status change
  const confirmBulkStatusChange = async () => {
    if (!pendingBulkStatus || selectedItems.length === 0) return;

    setBulkActionLoading(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const user of selectedItems) {
        try {
          await updateMutation.mutateAsync({
            userId: user.user_id,
            data: { status: pendingBulkStatus },
          });
          successCount++;
        } catch {
          errorCount++;
        }
      }

      if (successCount > 0) {
        toast({
          title: "Success",
          description: `${successCount} user${successCount !== 1 ? "s" : ""} ${pendingBulkStatus === UserStatus.ACTIVE ? "activated" : "deactivated"} successfully${errorCount > 0 ? `, ${errorCount} failed` : ""}`,
        });
      }

      if (errorCount > 0 && successCount === 0) {
        toast({
          title: "Error",
          description: `Failed to update ${errorCount} user${errorCount !== 1 ? "s" : ""}`,
          variant: "destructive",
        });
      }

      clearSelection();
    } finally {
      setBulkActionLoading(false);
      setShowBulkStatusDialog(false);
      setPendingBulkStatus(null);
    }
  };

  // Handle bulk delete request
  const handleBulkDelete = useCallback(() => {
    setShowBulkDeleteDialog(true);
  }, []);

  // Confirm bulk delete
  const confirmBulkDelete = async () => {
    if (selectedItems.length === 0) return;

    // Filter out active users
    const usersToDelete = selectedItems.filter(
      (user) => user.status !== UserStatus.ACTIVE,
    );

    if (usersToDelete.length === 0) {
      toast({
        title: "Cannot Delete Active Users",
        description: "All selected users are active. Deactivate them first.",
        variant: "destructive",
      });
      setShowBulkDeleteDialog(false);
      return;
    }

    setBulkActionLoading(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const user of usersToDelete) {
        try {
          await deleteMutation.mutateAsync(user.user_id);
          successCount++;
        } catch {
          errorCount++;
        }
      }

      if (successCount > 0) {
        toast({
          title: "Success",
          description: `${successCount} user${successCount !== 1 ? "s" : ""} deleted successfully${errorCount > 0 ? `, ${errorCount} failed` : ""}`,
        });
      }

      if (errorCount > 0 && successCount === 0) {
        toast({
          title: "Error",
          description: `Failed to delete ${errorCount} user${errorCount !== 1 ? "s" : ""}`,
          variant: "destructive",
        });
      }

      clearSelection();
    } finally {
      setBulkActionLoading(false);
      setShowBulkDeleteDialog(false);
    }
  };

  if (isLoading) {
    return <UserListSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p className="text-sm font-medium text-destructive">
          Error loading users
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
        <h1 className="text-2xl font-bold">Users</h1>
        <Link href="/admin/users/new">
          <Button data-testid="create-user-button">
            <Plus className="mr-2 h-4 w-4" />
            Create User
          </Button>
        </Link>
      </div>

      {/* Search and Filter Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="user-search-input"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]" data-testid="user-status-filter">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk Actions Bar */}
      <BulkActionsBar
        selectedCount={selectedCount}
        onClearSelection={clearSelection}
        onBulkActivate={handleBulkActivate}
        onBulkDeactivate={handleBulkDeactivate}
        onBulkDelete={handleBulkDelete}
        isLoading={bulkActionLoading}
        hasActiveItems={hasActiveSelected}
      />

      {users.length === 0 ? (
        <div className="rounded-lg border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {search || statusFilter !== "all"
              ? "No users match your search criteria."
              : "No users found. Create your first user to get started."}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table data-testid="user-list-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={isAllSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all users"
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
                    sortKey="email"
                    currentSortKey={sortKey}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                  >
                    Email
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="roles"
                    currentSortKey={sortKey}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                  >
                    Roles
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="company"
                    currentSortKey={sortKey}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                  >
                    Company
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="store"
                    currentSortKey={sortKey}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                  >
                    Store
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="created_at"
                    currentSortKey={sortKey}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                  >
                    Created
                  </SortableTableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.map((user) => (
                  <TableRow
                    key={user.user_id}
                    data-testid={`user-row-${user.user_id}`}
                    className={
                      isSelected(user.user_id) ? "bg-muted/50" : undefined
                    }
                  >
                    <TableCell>
                      <Checkbox
                        checked={isSelected(user.user_id)}
                        onCheckedChange={() => toggleSelection(user.user_id)}
                        aria-label={`Select ${user.name}`}
                      />
                    </TableCell>
                    <TableCell
                      className="font-medium"
                      data-testid={`user-name-${user.user_id}`}
                    >
                      {user.name}
                    </TableCell>
                    <TableCell data-testid={`user-email-${user.user_id}`}>
                      {user.email}
                    </TableCell>
                    <TableCell data-testid={`user-roles-${user.user_id}`}>
                      <div className="flex flex-wrap gap-1">
                        {user.roles.length > 0 ? (
                          user.roles.map((role) => (
                            <RoleBadge
                              key={role.user_role_id}
                              code={role.role.code}
                              scope={role.role.scope}
                            />
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            No roles
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell data-testid={`user-company-${user.user_id}`}>
                      <UserCompanyDisplay roles={user.roles} />
                    </TableCell>
                    <TableCell data-testid={`user-store-${user.user_id}`}>
                      <UserStoreDisplay roles={user.roles} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(user.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell
                      className="text-right"
                      data-testid={`user-actions-${user.user_id}`}
                    >
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditClick(user)}
                          disabled={actionInProgress === user.user_id}
                        >
                          <Pencil className="h-4 w-4" />
                          <span className="sr-only">Edit</span>
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleStatusToggle(user)}
                          disabled={actionInProgress === user.user_id}
                          className={
                            user.status === UserStatus.ACTIVE
                              ? "text-green-600 hover:text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950"
                              : "text-gray-400 hover:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-900"
                          }
                        >
                          <Power className="h-4 w-4" />
                          <span className="sr-only">
                            {user.status === UserStatus.ACTIVE
                              ? "Deactivate"
                              : "Activate"}
                          </span>
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteClick(user)}
                          disabled={
                            actionInProgress === user.user_id ||
                            user.status === UserStatus.ACTIVE
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

          {/* Pagination Controls */}
          {meta && meta.totalPages > 1 && (
            <div
              className="flex items-center justify-between"
              data-testid="pagination-controls"
            >
              <p className="text-sm text-muted-foreground">
                Showing {(meta.page - 1) * meta.limit + 1} to{" "}
                {Math.min(meta.page * meta.limit, meta.total)} of {meta.total}{" "}
                users
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
      {selectedUser && (
        <ConfirmDialog
          open={showStatusDialog}
          onOpenChange={setShowStatusDialog}
          title={`${pendingStatus === UserStatus.ACTIVE ? "Activate" : "Deactivate"} User?`}
          description={`Are you sure you want to ${pendingStatus === UserStatus.ACTIVE ? "activate" : "deactivate"} "${selectedUser.name}"? ${
            pendingStatus === UserStatus.INACTIVE
              ? "This will disable their access immediately."
              : "This will enable their access."
          }`}
          confirmText={
            pendingStatus === UserStatus.ACTIVE ? "Activate" : "Deactivate"
          }
          cancelText="Cancel"
          onConfirm={confirmStatusChange}
          destructive={pendingStatus === UserStatus.INACTIVE}
          isLoading={actionInProgress === selectedUser.user_id}
        />
      )}

      {/* Edit User Modal */}
      <EditUserModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        user={selectedUserForEdit}
        onSuccess={handleUserUpdated}
      />

      {/* Delete User Confirmation Dialog */}
      {userToDelete && (
        <ConfirmDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          title="Delete User?"
          description={`Are you sure you want to delete "${userToDelete.name}"? This action cannot be undone.`}
          confirmText="Delete Permanently"
          cancelText="Cancel"
          onConfirm={confirmDelete}
          destructive={true}
          isLoading={actionInProgress === userToDelete.user_id}
          requiresTextConfirmation={true}
          confirmationText="DELETE"
        />
      )}

      {/* Bulk Status Change Confirmation Dialog */}
      <ConfirmDialog
        open={showBulkStatusDialog}
        onOpenChange={setShowBulkStatusDialog}
        title={`${pendingBulkStatus === UserStatus.ACTIVE ? "Activate" : "Deactivate"} ${selectedCount} User${selectedCount !== 1 ? "s" : ""}?`}
        description={`Are you sure you want to ${pendingBulkStatus === UserStatus.ACTIVE ? "activate" : "deactivate"} ${selectedCount} selected user${selectedCount !== 1 ? "s" : ""}?`}
        confirmText={
          pendingBulkStatus === UserStatus.ACTIVE
            ? "Activate All"
            : "Deactivate All"
        }
        cancelText="Cancel"
        onConfirm={confirmBulkStatusChange}
        destructive={pendingBulkStatus === UserStatus.INACTIVE}
        isLoading={bulkActionLoading}
      />

      {/* Bulk Delete Confirmation Dialog */}
      <ConfirmDialog
        open={showBulkDeleteDialog}
        onOpenChange={setShowBulkDeleteDialog}
        title={`Delete ${selectedCount} User${selectedCount !== 1 ? "s" : ""}?`}
        description={`Are you sure you want to delete ${selectedCount} selected user${selectedCount !== 1 ? "s" : ""}? This action cannot be undone.${hasActiveSelected ? " Note: Active users will be skipped." : ""}`}
        confirmText="Delete Selected"
        cancelText="Cancel"
        onConfirm={confirmBulkDelete}
        destructive={true}
        isLoading={bulkActionLoading}
        requiresTextConfirmation={true}
        confirmationText="DELETE"
      />
    </div>
  );
}

/**
 * Status badge component
 * Displays user status with appropriate styling
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
 * Role badge component
 * Displays role code with color coding by scope type
 */
function RoleBadge({ code, scope }: { code: string; scope: string }) {
  const scopeStyles = {
    SYSTEM:
      "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
    COMPANY: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
    STORE:
      "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        scopeStyles[scope as keyof typeof scopeStyles] || scopeStyles.SYSTEM
      }`}
      title={`${scope} scope`}
    >
      {code}
    </span>
  );
}

/**
 * User company display component
 * Extracts and displays unique company names from user roles
 */
function UserCompanyDisplay({ roles }: { roles: UserRoleDetail[] }) {
  const companies = useMemo(() => {
    const uniqueCompanies = new Map<string, string>();
    roles.forEach((role) => {
      if (role.company_id && role.company_name) {
        uniqueCompanies.set(role.company_id, role.company_name);
      }
    });
    return Array.from(uniqueCompanies.values());
  }, [roles]);

  if (companies.length === 0) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  if (companies.length === 1) {
    return <span className="text-sm">{companies[0]}</span>;
  }

  return (
    <span className="text-sm" title={companies.join(", ")}>
      {companies[0]}{" "}
      <span className="text-muted-foreground">+{companies.length - 1}</span>
    </span>
  );
}

/**
 * User store display component
 * Extracts and displays unique store names from user roles
 */
function UserStoreDisplay({ roles }: { roles: UserRoleDetail[] }) {
  const stores = useMemo(() => {
    const uniqueStores = new Map<string, string>();
    roles.forEach((role) => {
      if (role.store_id && role.store_name) {
        uniqueStores.set(role.store_id, role.store_name);
      }
    });
    return Array.from(uniqueStores.values());
  }, [roles]);

  if (stores.length === 0) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  if (stores.length === 1) {
    return <span className="text-sm">{stores[0]}</span>;
  }

  return (
    <span className="text-sm" title={stores.join(", ")}>
      {stores[0]}{" "}
      <span className="text-muted-foreground">+{stores.length - 1}</span>
    </span>
  );
}

/**
 * Loading skeleton for UserList
 */
function UserListSkeleton() {
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
              <TableHead className="w-[50px]">
                <div className="h-4 w-4 animate-pulse rounded bg-muted" />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Store</TableHead>
              <TableHead>Created</TableHead>
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
                  <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
                    <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                </TableCell>
                <TableCell>
                  <div className="h-4 w-20 animate-pulse rounded bg-muted" />
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
