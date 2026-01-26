"use client";

/**
 * HierarchicalUserList component
 * Displays users in a hierarchical accordion structure for Super Admin dashboard
 *
 * Structure:
 * - System Users section (flat table at top)
 * - Client Owner accordions (expandable)
 *   - Flat table with Company/Store columns
 *   - Client owner as first row
 *   - All associated users below
 *
 * @enterprise-standards
 * - FE-005 UI_SECURITY: No sensitive data in DOM
 * - SEC-004 XSS: React auto-escaping for all user content
 * - FE-001 STATE_MANAGEMENT: UI state only, no sensitive tokens
 * - PERF: Memoized callbacks and components
 */

import { useState, useCallback, useMemo } from "react";
import {
  useHierarchicalUsers,
  useUpdateUserStatus,
  useDeleteUser,
} from "@/lib/api/admin-users";
import {
  AdminUser,
  UserStatus,
  ClientOwnerGroup,
  UserRoleDetail,
} from "@/types/admin-user";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  ChevronDown,
  ChevronRight,
  Power,
  Trash2,
  Users,
  Shield,
  Headphones,
} from "lucide-react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EditUserModal } from "@/components/admin/EditUserModal";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import { BulkActionsBar } from "@/components/ui/bulk-actions-bar";

/**
 * Role badge component with scope-based styling
 * Uses React auto-escaping for XSS prevention (SEC-004)
 */
function RoleBadge({ code, scope }: { code: string; scope: string }) {
  const scopeStyles = {
    SYSTEM:
      "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
    SUPPORT: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300",
    COMPANY: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
    STORE:
      "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        scopeStyles[scope as keyof typeof scopeStyles] || scopeStyles.SYSTEM,
      )}
      title={`${scope} scope`}
    >
      {code}
    </span>
  );
}

/**
 * Status indicator dot
 */
function StatusDot({ status }: { status: UserStatus }) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        status === UserStatus.ACTIVE ? "bg-green-500" : "bg-gray-400",
      )}
      title={status}
    />
  );
}

/**
 * Extract unique company names from user roles
 * Memoization-friendly pure function
 */
function getCompanyFromRoles(roles: UserRoleDetail[]): string {
  const companies = new Map<string, string>();
  roles.forEach((role) => {
    if (role.company_id && role.company_name) {
      companies.set(role.company_id, role.company_name);
    }
  });
  const companyList = Array.from(companies.values());
  if (companyList.length === 0) return "—";
  if (companyList.length === 1) return companyList[0];
  return `${companyList[0]} +${companyList.length - 1}`;
}

/**
 * Extract unique store names from user roles
 * Memoization-friendly pure function
 */
function getStoreFromRoles(roles: UserRoleDetail[]): string {
  const stores = new Map<string, string>();
  roles.forEach((role) => {
    if (role.store_id && role.store_name) {
      stores.set(role.store_id, role.store_name);
    }
  });
  const storeList = Array.from(stores.values());
  if (storeList.length === 0) return "—";
  if (storeList.length === 1) return storeList[0];
  return `${storeList[0]} +${storeList.length - 1}`;
}

/**
 * User row component for consistent user display
 * Includes checkbox for bulk selection, Company and Store columns
 */
function UserRow({
  user,
  isSelected,
  onToggleSelect,
  onEdit,
  onStatusToggle,
  onDelete,
  isActionInProgress,
}: {
  user: AdminUser;
  isSelected: boolean;
  onToggleSelect: () => void;
  onEdit: (user: AdminUser) => void;
  onStatusToggle: (user: AdminUser) => void;
  onDelete: (user: AdminUser) => void;
  isActionInProgress: boolean;
}) {
  return (
    <TableRow
      data-testid={`user-row-${user.user_id}`}
      className={isSelected ? "bg-muted/50" : undefined}
    >
      <TableCell className="w-[50px]">
        <Checkbox
          checked={isSelected}
          onCheckedChange={onToggleSelect}
          aria-label={`Select ${user.name}`}
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <StatusDot status={user.status} />
          <span className="font-medium">{user.name}</span>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">{user.email}</TableCell>
      <TableCell className="text-sm">
        {getCompanyFromRoles(user.roles)}
      </TableCell>
      <TableCell className="text-sm">{getStoreFromRoles(user.roles)}</TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {user.roles.map((role) => (
            <RoleBadge
              key={role.user_role_id}
              code={role.role.code}
              scope={role.role.scope}
            />
          ))}
        </div>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {new Date(user.created_at).toLocaleDateString()}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(user)}
            disabled={isActionInProgress}
            className="h-8 w-8"
          >
            <Pencil className="h-4 w-4" />
            <span className="sr-only">Edit</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onStatusToggle(user)}
            disabled={isActionInProgress}
            className={cn(
              "h-8 w-8",
              user.status === UserStatus.ACTIVE
                ? "text-green-600 hover:text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950"
                : "text-gray-400 hover:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-900",
            )}
          >
            <Power className="h-4 w-4" />
            <span className="sr-only">
              {user.status === UserStatus.ACTIVE ? "Deactivate" : "Activate"}
            </span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(user)}
            disabled={isActionInProgress || user.status === UserStatus.ACTIVE}
            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Delete</span>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * Client Owner Accordion - Simplified header with flat user list
 * Header: Name (email) + stats on right
 * Content: Flat table with Company/Store columns, client owner as first row
 */
function ClientOwnerAccordion({
  group,
  onEdit,
  onStatusToggle,
  onDelete,
  actionInProgress,
}: {
  group: ClientOwnerGroup;
  onEdit: (user: AdminUser) => void;
  onStatusToggle: (user: AdminUser) => void;
  onDelete: (user: AdminUser) => void;
  actionInProgress: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const owner = group.client_owner;

  // Calculate stats
  const totalCompanies = group.companies.length;
  const totalStores = group.companies.reduce(
    (sum, c) => sum + c.stores.length,
    0,
  );
  const totalStoreUsers = group.companies.reduce(
    (sum, c) => sum + c.stores.reduce((s, st) => s + st.users.length, 0),
    0,
  );
  // Total users = client owner + all store users
  const totalUsers = 1 + totalStoreUsers;

  // Flatten all users: client owner first, then all store users
  const allUsers = useMemo(() => {
    const users: AdminUser[] = [owner];
    group.companies.forEach((company) => {
      company.stores.forEach((store) => {
        users.push(...store.users);
      });
    });
    return users;
  }, [owner, group.companies]);

  // Bulk selection for this accordion's users
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
    data: allUsers,
    getItemId: (user) => user.user_id,
  });

  // Check if any selected users are ACTIVE (for delete button)
  const hasActiveSelected = useMemo(() => {
    return selectedItems.some((user) => user.status === UserStatus.ACTIVE);
  }, [selectedItems]);

  // Bulk action states
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [showBulkStatusDialog, setShowBulkStatusDialog] = useState(false);
  const [pendingBulkStatus, setPendingBulkStatus] = useState<UserStatus | null>(
    null,
  );
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  const { toast } = useToast();
  const updateMutation = useUpdateUserStatus();
  const deleteMutation = useDeleteUser();

  // Bulk handlers
  const handleBulkActivate = useCallback(() => {
    setPendingBulkStatus(UserStatus.ACTIVE);
    setShowBulkStatusDialog(true);
  }, []);

  const handleBulkDeactivate = useCallback(() => {
    setPendingBulkStatus(UserStatus.INACTIVE);
    setShowBulkStatusDialog(true);
  }, []);

  const handleBulkDelete = useCallback(() => {
    setShowBulkDeleteDialog(true);
  }, []);

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

  const confirmBulkDelete = async () => {
    if (selectedItems.length === 0) return;

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

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border rounded-lg mb-2 overflow-hidden">
        {/* Simplified Accordion Header: Name (email) + stats */}
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              "w-full flex items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors",
              isOpen && "bg-muted/30",
            )}
            data-testid={`client-owner-accordion-${owner.user_id}`}
          >
            <div className="flex items-center gap-3">
              {isOpen ? (
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              )}
              <StatusDot status={owner.status} />
              <div className="flex items-center gap-2">
                <span className="font-medium">{owner.name}</span>
                <span className="text-sm text-muted-foreground">
                  ({owner.email})
                </span>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              {totalCompanies} {totalCompanies === 1 ? "company" : "companies"}{" "}
              • {totalStores} {totalStores === 1 ? "store" : "stores"} •{" "}
              {totalUsers} {totalUsers === 1 ? "user" : "users"}
            </div>
          </button>
        </CollapsibleTrigger>

        {/* Accordion Content: Flat table with bulk actions */}
        <CollapsibleContent>
          <div className="border-t">
            {/* Bulk Actions Bar */}
            <div className="p-2">
              <BulkActionsBar
                selectedCount={selectedCount}
                onClearSelection={clearSelection}
                onBulkActivate={handleBulkActivate}
                onBulkDeactivate={handleBulkDeactivate}
                onBulkDelete={handleBulkDelete}
                isLoading={bulkActionLoading}
                hasActiveItems={hasActiveSelected}
              />
            </div>

            {/* Flat User Table with Company/Store columns */}
            {allUsers.length > 0 ? (
              <Table>
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
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Store</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allUsers.map((user) => (
                    <UserRow
                      key={user.user_id}
                      user={user}
                      isSelected={isSelected(user.user_id)}
                      onToggleSelect={() => toggleSelection(user.user_id)}
                      onEdit={onEdit}
                      onStatusToggle={onStatusToggle}
                      onDelete={onDelete}
                      isActionInProgress={actionInProgress === user.user_id}
                    />
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No users yet
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>

      {/* Bulk Status Change Dialog */}
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

      {/* Bulk Delete Dialog */}
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
    </Collapsible>
  );
}

/**
 * Main HierarchicalUserList component
 */
export function HierarchicalUserList() {
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Status dialog state
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [pendingStatus, setPendingStatus] = useState<UserStatus | null>(null);

  // Delete dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null);

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUserForEdit, setSelectedUserForEdit] =
    useState<AdminUser | null>(null);

  // Bulk action states for system and support users
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [showBulkStatusDialog, setShowBulkStatusDialog] = useState(false);
  const [pendingBulkStatus, setPendingBulkStatus] = useState<UserStatus | null>(
    null,
  );
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [bulkActionTarget, setBulkActionTarget] = useState<
    "system" | "support"
  >("system");

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useHierarchicalUsers();
  const updateMutation = useUpdateUserStatus();
  const deleteMutation = useDeleteUser();

  const systemUsers = data?.system_users || [];
  const supportUsers = data?.support_users || [];

  // Bulk selection for system users
  const {
    selectedItems: selectedSystemUsers,
    isAllSelected: isAllSystemSelected,
    isPartiallySelected: isPartiallySystemSelected,
    isSelected: isSystemUserSelected,
    toggleSelection: toggleSystemUserSelection,
    toggleSelectAll: toggleSelectAllSystemUsers,
    clearSelection: clearSystemSelection,
    selectedCount: selectedSystemCount,
  } = useBulkSelection<AdminUser>({
    data: systemUsers,
    getItemId: (user) => user.user_id,
  });

  const hasActiveSystemSelected = useMemo(() => {
    return selectedSystemUsers.some(
      (user) => user.status === UserStatus.ACTIVE,
    );
  }, [selectedSystemUsers]);

  // Bulk selection for support users
  const {
    selectedItems: selectedSupportUsers,
    isAllSelected: isAllSupportSelected,
    isPartiallySelected: isPartiallySupportSelected,
    isSelected: isSupportUserSelected,
    toggleSelection: toggleSupportUserSelection,
    toggleSelectAll: toggleSelectAllSupportUsers,
    clearSelection: clearSupportSelection,
    selectedCount: selectedSupportCount,
  } = useBulkSelection<AdminUser>({
    data: supportUsers,
    getItemId: (user) => user.user_id,
  });

  const hasActiveSupportSelected = useMemo(() => {
    return selectedSupportUsers.some(
      (user) => user.status === UserStatus.ACTIVE,
    );
  }, [selectedSupportUsers]);

  // Handlers
  const handleEdit = useCallback((user: AdminUser) => {
    setSelectedUserForEdit(user);
    setShowEditModal(true);
  }, []);

  const handleStatusToggle = useCallback((user: AdminUser) => {
    setSelectedUser(user);
    const newStatus =
      user.status === UserStatus.ACTIVE
        ? UserStatus.INACTIVE
        : UserStatus.ACTIVE;
    setPendingStatus(newStatus);
    setShowStatusDialog(true);
  }, []);

  const handleDelete = useCallback((user: AdminUser) => {
    setUserToDelete(user);
    setShowDeleteDialog(true);
  }, []);

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

  const confirmDelete = async () => {
    if (!userToDelete) return;

    setActionInProgress(userToDelete.user_id);
    try {
      await deleteMutation.mutateAsync(userToDelete.user_id);

      toast({
        title: "Success",
        description: `User "${userToDelete.name}" deleted successfully`,
      });
    } catch (error) {
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

  const handleUserUpdated = () => {
    queryClient.invalidateQueries({
      queryKey: ["admin-users"],
      refetchType: "all",
    });
  };

  // System users bulk handlers
  const handleSystemBulkActivate = useCallback(() => {
    setBulkActionTarget("system");
    setPendingBulkStatus(UserStatus.ACTIVE);
    setShowBulkStatusDialog(true);
  }, []);

  const handleSystemBulkDeactivate = useCallback(() => {
    setBulkActionTarget("system");
    setPendingBulkStatus(UserStatus.INACTIVE);
    setShowBulkStatusDialog(true);
  }, []);

  const handleSystemBulkDelete = useCallback(() => {
    setBulkActionTarget("system");
    setShowBulkDeleteDialog(true);
  }, []);

  // Support users bulk handlers
  const handleSupportBulkActivate = useCallback(() => {
    setBulkActionTarget("support");
    setPendingBulkStatus(UserStatus.ACTIVE);
    setShowBulkStatusDialog(true);
  }, []);

  const handleSupportBulkDeactivate = useCallback(() => {
    setBulkActionTarget("support");
    setPendingBulkStatus(UserStatus.INACTIVE);
    setShowBulkStatusDialog(true);
  }, []);

  const handleSupportBulkDelete = useCallback(() => {
    setBulkActionTarget("support");
    setShowBulkDeleteDialog(true);
  }, []);

  const confirmBulkStatusChange = async () => {
    const selectedUsers =
      bulkActionTarget === "system"
        ? selectedSystemUsers
        : selectedSupportUsers;
    const clearSelection =
      bulkActionTarget === "system"
        ? clearSystemSelection
        : clearSupportSelection;

    if (!pendingBulkStatus || selectedUsers.length === 0) return;

    setBulkActionLoading(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const user of selectedUsers) {
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

  const confirmBulkDelete = async () => {
    const selectedUsers =
      bulkActionTarget === "system"
        ? selectedSystemUsers
        : selectedSupportUsers;
    const clearSelection =
      bulkActionTarget === "system"
        ? clearSystemSelection
        : clearSupportSelection;

    if (selectedUsers.length === 0) return;

    const usersToDelete = selectedUsers.filter(
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

  // Loading state
  if (isLoading) {
    return <HierarchicalUserListSkeleton />;
  }

  // Error state
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

  const { system_users, support_users, client_owners, meta } = data || {
    system_users: [],
    support_users: [],
    client_owners: [],
    meta: {
      total_system_users: 0,
      total_support_users: 0,
      total_client_owners: 0,
      total_companies: 0,
      total_stores: 0,
      total_store_users: 0,
    },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-sm text-muted-foreground">
            {meta.total_system_users +
              (meta.total_support_users || 0) +
              meta.total_client_owners +
              meta.total_store_users}{" "}
            total users • {meta.total_companies} companies • {meta.total_stores}{" "}
            stores
          </p>
        </div>
        <Link href="/admin/users/new">
          <Button data-testid="create-user-button">
            <Plus className="mr-2 h-4 w-4" />
            Create User
          </Button>
        </Link>
      </div>

      {/* System Users Section */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Shield className="h-5 w-5 text-purple-600" />
          <h2 className="text-lg font-semibold">System Users</h2>
          <span className="text-sm text-muted-foreground">
            ({system_users.length})
          </span>
        </div>

        {/* Bulk Actions Bar for System Users */}
        <BulkActionsBar
          selectedCount={selectedSystemCount}
          onClearSelection={clearSystemSelection}
          onBulkActivate={handleSystemBulkActivate}
          onBulkDeactivate={handleSystemBulkDeactivate}
          onBulkDelete={handleSystemBulkDelete}
          isLoading={bulkActionLoading}
          hasActiveItems={hasActiveSystemSelected}
          className="mb-2"
        />

        {system_users.length > 0 ? (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={isAllSystemSelected}
                      onCheckedChange={toggleSelectAllSystemUsers}
                      aria-label="Select all system users"
                      className={isPartiallySystemSelected ? "opacity-50" : ""}
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {system_users.map((user) => (
                  <TableRow
                    key={user.user_id}
                    data-testid={`user-row-${user.user_id}`}
                    className={
                      isSystemUserSelected(user.user_id)
                        ? "bg-muted/50"
                        : undefined
                    }
                  >
                    <TableCell>
                      <Checkbox
                        checked={isSystemUserSelected(user.user_id)}
                        onCheckedChange={() =>
                          toggleSystemUserSelection(user.user_id)
                        }
                        aria-label={`Select ${user.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <StatusDot status={user.status} />
                        <span className="font-medium">{user.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.email}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.roles.map((role) => (
                          <RoleBadge
                            key={role.user_role_id}
                            code={role.role.code}
                            scope={role.role.scope}
                          />
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(user.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(user)}
                          disabled={actionInProgress === user.user_id}
                          className="h-8 w-8"
                        >
                          <Pencil className="h-4 w-4" />
                          <span className="sr-only">Edit</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleStatusToggle(user)}
                          disabled={actionInProgress === user.user_id}
                          className={cn(
                            "h-8 w-8",
                            user.status === UserStatus.ACTIVE
                              ? "text-green-600 hover:text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950"
                              : "text-gray-400 hover:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-900",
                          )}
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
                          onClick={() => handleDelete(user)}
                          disabled={
                            actionInProgress === user.user_id ||
                            user.status === UserStatus.ACTIVE
                          }
                          className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
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
        ) : (
          <div className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
            No system users found
          </div>
        )}
      </section>

      {/* Support Users Section */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Headphones className="h-5 w-5 text-teal-600" />
          <h2 className="text-lg font-semibold">Support Users</h2>
          <span className="text-sm text-muted-foreground">
            ({support_users.length})
          </span>
        </div>

        {/* Bulk Actions Bar for Support Users */}
        <BulkActionsBar
          selectedCount={selectedSupportCount}
          onClearSelection={clearSupportSelection}
          onBulkActivate={handleSupportBulkActivate}
          onBulkDeactivate={handleSupportBulkDeactivate}
          onBulkDelete={handleSupportBulkDelete}
          isLoading={bulkActionLoading}
          hasActiveItems={hasActiveSupportSelected}
          className="mb-2"
        />

        {support_users.length > 0 ? (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={isAllSupportSelected}
                      onCheckedChange={toggleSelectAllSupportUsers}
                      aria-label="Select all support users"
                      className={isPartiallySupportSelected ? "opacity-50" : ""}
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {support_users.map((user) => (
                  <TableRow
                    key={user.user_id}
                    data-testid={`user-row-${user.user_id}`}
                    className={
                      isSupportUserSelected(user.user_id)
                        ? "bg-muted/50"
                        : undefined
                    }
                  >
                    <TableCell>
                      <Checkbox
                        checked={isSupportUserSelected(user.user_id)}
                        onCheckedChange={() =>
                          toggleSupportUserSelection(user.user_id)
                        }
                        aria-label={`Select ${user.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <StatusDot status={user.status} />
                        <span className="font-medium">{user.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.email}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.roles.map((role) => (
                          <RoleBadge
                            key={role.user_role_id}
                            code={role.role.code}
                            scope={role.role.scope}
                          />
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(user.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(user)}
                          disabled={actionInProgress === user.user_id}
                          className="h-8 w-8"
                        >
                          <Pencil className="h-4 w-4" />
                          <span className="sr-only">Edit</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleStatusToggle(user)}
                          disabled={actionInProgress === user.user_id}
                          className={cn(
                            "h-8 w-8",
                            user.status === UserStatus.ACTIVE
                              ? "text-green-600 hover:text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950"
                              : "text-gray-400 hover:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-900",
                          )}
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
                          onClick={() => handleDelete(user)}
                          disabled={
                            actionInProgress === user.user_id ||
                            user.status === UserStatus.ACTIVE
                          }
                          className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
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
        ) : (
          <div className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
            No support users found
          </div>
        )}
      </section>

      {/* Client Owners Section */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-semibold">Client Owners</h2>
          <span className="text-sm text-muted-foreground">
            ({client_owners.length})
          </span>
        </div>

        {client_owners.length > 0 ? (
          <div className="space-y-2">
            {client_owners.map((group) => (
              <ClientOwnerAccordion
                key={group.client_owner.user_id}
                group={group}
                onEdit={handleEdit}
                onStatusToggle={handleStatusToggle}
                onDelete={handleDelete}
                actionInProgress={actionInProgress}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
            No client owners found
          </div>
        )}
      </section>

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

      {/* Edit User Modal */}
      <EditUserModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        user={selectedUserForEdit}
        onSuccess={handleUserUpdated}
      />

      {/* Bulk Status Change Dialog (shared for system and support users) */}
      <ConfirmDialog
        open={showBulkStatusDialog}
        onOpenChange={setShowBulkStatusDialog}
        title={`${pendingBulkStatus === UserStatus.ACTIVE ? "Activate" : "Deactivate"} ${bulkActionTarget === "system" ? selectedSystemCount : selectedSupportCount} User${(bulkActionTarget === "system" ? selectedSystemCount : selectedSupportCount) !== 1 ? "s" : ""}?`}
        description={`Are you sure you want to ${pendingBulkStatus === UserStatus.ACTIVE ? "activate" : "deactivate"} ${bulkActionTarget === "system" ? selectedSystemCount : selectedSupportCount} selected ${bulkActionTarget} user${(bulkActionTarget === "system" ? selectedSystemCount : selectedSupportCount) !== 1 ? "s" : ""}?`}
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

      {/* Bulk Delete Dialog (shared for system and support users) */}
      <ConfirmDialog
        open={showBulkDeleteDialog}
        onOpenChange={setShowBulkDeleteDialog}
        title={`Delete ${bulkActionTarget === "system" ? selectedSystemCount : selectedSupportCount} User${(bulkActionTarget === "system" ? selectedSystemCount : selectedSupportCount) !== 1 ? "s" : ""}?`}
        description={`Are you sure you want to delete ${bulkActionTarget === "system" ? selectedSystemCount : selectedSupportCount} selected ${bulkActionTarget} user${(bulkActionTarget === "system" ? selectedSystemCount : selectedSupportCount) !== 1 ? "s" : ""}? This action cannot be undone.${(bulkActionTarget === "system" ? hasActiveSystemSelected : hasActiveSupportSelected) ? " Note: Active users will be skipped." : ""}`}
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
 * Loading skeleton for HierarchicalUserList
 */
function HierarchicalUserListSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-32 animate-pulse rounded bg-muted" />
          <div className="h-4 w-64 animate-pulse rounded bg-muted mt-1" />
        </div>
        <div className="h-10 w-32 animate-pulse rounded bg-muted" />
      </div>

      {/* System Users skeleton */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <div className="h-5 w-5 animate-pulse rounded bg-muted" />
          <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        </div>
        <div className="rounded-lg border">
          <div className="p-4 space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="h-4 w-4 animate-pulse rounded bg-muted" />
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                <div className="h-4 w-48 animate-pulse rounded bg-muted" />
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Support Users skeleton */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <div className="h-5 w-5 animate-pulse rounded bg-muted" />
          <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        </div>
        <div className="rounded-lg border">
          <div className="p-4 space-y-3">
            {[1].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="h-4 w-4 animate-pulse rounded bg-muted" />
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                <div className="h-4 w-48 animate-pulse rounded bg-muted" />
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Client Owners skeleton */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <div className="h-5 w-5 animate-pulse rounded bg-muted" />
          <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-5 w-5 animate-pulse rounded bg-muted" />
                  <div>
                    <div className="h-5 w-40 animate-pulse rounded bg-muted" />
                    <div className="h-4 w-56 animate-pulse rounded bg-muted mt-1" />
                  </div>
                </div>
                <div className="h-6 w-48 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
