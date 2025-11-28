"use client";

/**
 * Admin Role List Component
 * Displays all roles with their permissions and scope information
 * Allows Super Admins to manage roles (view, edit, delete)
 *
 * Features:
 * - Filter by scope (SYSTEM, COMPANY, STORE)
 * - Search by role code/description
 * - View permissions count and usage stats
 * - Edit role details and permissions
 * - Soft delete with restore capability
 */

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  useAdminRoles,
  useDeleteRole,
  useRestoreRole,
  RoleWithDetails,
  getScopeDisplayName,
  getScopeBadgeColor,
  canDeleteRole,
} from "@/lib/api/admin-roles";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/useDebounce";
import {
  Plus,
  Search,
  Shield,
  AlertCircle,
  RefreshCw,
  Settings,
  Trash2,
  RotateCcw,
  Users,
  Building2,
  Lock,
  Pencil,
} from "lucide-react";

interface AdminRoleListProps {
  onSelectRole?: (roleId: string) => void;
  selectedRoleId?: string | null;
}

export function AdminRoleList({
  onSelectRole,
  selectedRoleId,
}: AdminRoleListProps) {
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [selectedRole, setSelectedRole] = useState<RoleWithDetails | null>(
    null,
  );

  const { toast } = useToast();
  const debouncedSearch = useDebounce(search, 300);

  const {
    data: roles,
    isLoading,
    isError,
    error,
    refetch,
  } = useAdminRoles(false); // Don't include deleted

  const deleteMutation = useDeleteRole();
  const restoreMutation = useRestoreRole();

  // Filter roles based on search and scope
  const filteredRoles = useMemo(() => {
    if (!roles) return [];

    return roles.filter((role) => {
      // Scope filter
      if (scopeFilter !== "all" && role.scope !== scopeFilter) {
        return false;
      }

      // Search filter
      if (debouncedSearch) {
        const searchLower = debouncedSearch.toLowerCase();
        return (
          role.code.toLowerCase().includes(searchLower) ||
          (role.description?.toLowerCase().includes(searchLower) ?? false)
        );
      }

      return true;
    });
  }, [roles, scopeFilter, debouncedSearch]);

  // Handle delete role
  const handleDelete = (role: RoleWithDetails) => {
    const deleteCheck = canDeleteRole(role);
    if (!deleteCheck.canDelete) {
      toast({
        title: "Cannot Delete Role",
        description: deleteCheck.reason,
        variant: "destructive",
      });
      return;
    }
    setSelectedRole(role);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!selectedRole) return;

    try {
      await deleteMutation.mutateAsync(selectedRole.role_id);
      toast({
        title: "Role Deleted",
        description: `Role "${selectedRole.code}" has been deleted. It can be restored within 30 days.`,
      });
      setShowDeleteDialog(false);
      setSelectedRole(null);
    } catch (err) {
      toast({
        title: "Delete Failed",
        description:
          err instanceof Error ? err.message : "Failed to delete role",
        variant: "destructive",
      });
    }
  };

  // Handle restore role (for deleted roles view)
  const confirmRestore = async () => {
    if (!selectedRole) return;

    try {
      await restoreMutation.mutateAsync(selectedRole.role_id);
      toast({
        title: "Role Restored",
        description: `Role "${selectedRole.code}" has been restored.`,
      });
      setShowRestoreDialog(false);
      setSelectedRole(null);
    } catch (err) {
      toast({
        title: "Restore Failed",
        description:
          err instanceof Error ? err.message : "Failed to restore role",
        variant: "destructive",
      });
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="admin-roles-loading">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Skeleton className="h-4 w-20" />
                </TableHead>
                <TableHead>
                  <Skeleton className="h-4 w-16" />
                </TableHead>
                <TableHead>
                  <Skeleton className="h-4 w-32" />
                </TableHead>
                <TableHead>
                  <Skeleton className="h-4 w-24" />
                </TableHead>
                <TableHead>
                  <Skeleton className="h-4 w-16" />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3, 4, 5].map((i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-5 w-28" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-48" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-8" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-20" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div
        className="rounded-lg border border-destructive p-6"
        data-testid="admin-roles-error"
      >
        <div className="flex items-center gap-2 text-destructive mb-4">
          <AlertCircle className="h-5 w-5" />
          <h3 className="font-semibold">Error Loading Roles</h3>
        </div>
        <p className="text-muted-foreground mb-4">
          {error instanceof Error
            ? error.message
            : "Failed to load roles. Please try again."}
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="admin-roles-list">
      {/* Header with title and create button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Role Management</h1>
          <p className="text-muted-foreground">
            Manage system roles and their permissions
          </p>
        </div>
        <Link href="/admin/roles/new">
          <Button data-testid="create-role-button">
            <Plus className="h-4 w-4 mr-2" />
            Create Role
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search roles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="role-search-input"
          />
        </div>
        <Select value={scopeFilter} onValueChange={setScopeFilter}>
          <SelectTrigger className="w-40" data-testid="scope-filter">
            <SelectValue placeholder="Filter by scope" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Scopes</SelectItem>
            <SelectItem value="SYSTEM">System</SelectItem>
            <SelectItem value="COMPANY">Company</SelectItem>
            <SelectItem value="STORE">Store</SelectItem>
          </SelectContent>
        </Select>
        <Link href="/admin/roles/companies">
          <Button variant="outline" data-testid="company-roles-button">
            <Building2 className="h-4 w-4 mr-2" />
            Company Access
          </Button>
        </Link>
        <Link href="/admin/roles/deleted">
          <Button variant="outline" data-testid="view-deleted-button">
            <Trash2 className="h-4 w-4 mr-2" />
            Deleted Roles
          </Button>
        </Link>
      </div>

      {/* Roles table */}
      {filteredRoles.length === 0 ? (
        <div
          className="text-center py-12 border rounded-lg"
          data-testid="admin-roles-empty"
        >
          <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Roles Found</h3>
          <p className="text-muted-foreground mb-4">
            {search || scopeFilter !== "all"
              ? "No roles match your current filters."
              : "Get started by creating your first role."}
          </p>
          {!search && scopeFilter === "all" && (
            <Link href="/admin/roles/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Role
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role Code</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-center">Permissions</TableHead>
                <TableHead className="text-center">Users</TableHead>
                <TableHead className="text-center">Companies</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRoles.map((role) => {
                const deleteCheck = canDeleteRole(role);
                return (
                  <TableRow
                    key={role.role_id}
                    data-testid={`role-row-${role.role_id}`}
                    className={
                      selectedRoleId === role.role_id ? "bg-muted/50" : ""
                    }
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Shield
                          className={`h-4 w-4 ${
                            role.scope === "SYSTEM"
                              ? "text-red-500"
                              : role.scope === "COMPANY"
                                ? "text-blue-500"
                                : "text-green-500"
                          }`}
                        />
                        <span className="font-medium">{role.code}</span>
                        {role.is_system_role && (
                          <Lock className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getScopeBadgeColor(role.scope)}>
                        {getScopeDisplayName(role.scope)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {role.description || (
                        <span className="text-muted-foreground italic">
                          No description
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">
                        {role.permissions.length}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Users className="h-3 w-3 text-muted-foreground" />
                        <span>{role.user_count}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Building2 className="h-3 w-3 text-muted-foreground" />
                        <span>{role.company_count}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onSelectRole?.(role.role_id)}
                          data-testid={`edit-role-${role.role_id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Link href={`/admin/roles/${role.role_id}`}>
                          <Button
                            variant="ghost"
                            size="sm"
                            data-testid={`manage-role-${role.role_id}`}
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(role)}
                          disabled={!deleteCheck.canDelete}
                          title={deleteCheck.reason}
                          data-testid={`delete-role-${role.role_id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Stats summary */}
      <div className="flex items-center gap-6 text-sm text-muted-foreground">
        <span>
          Total: <strong>{filteredRoles.length}</strong> roles
        </span>
        <span>
          System:{" "}
          <strong>
            {filteredRoles.filter((r) => r.scope === "SYSTEM").length}
          </strong>
        </span>
        <span>
          Company:{" "}
          <strong>
            {filteredRoles.filter((r) => r.scope === "COMPANY").length}
          </strong>
        </span>
        <span>
          Store:{" "}
          <strong>
            {filteredRoles.filter((r) => r.scope === "STORE").length}
          </strong>
        </span>
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Role"
        description={`Are you sure you want to delete the role "${selectedRole?.code}"? This action can be undone within 30 days.`}
        confirmText="Delete"
        onConfirm={confirmDelete}
        destructive
        isLoading={deleteMutation.isPending}
      />

      {/* Restore confirmation dialog */}
      <ConfirmDialog
        open={showRestoreDialog}
        onOpenChange={setShowRestoreDialog}
        title="Restore Role"
        description={`Are you sure you want to restore the role "${selectedRole?.code}"?`}
        confirmText="Restore"
        onConfirm={confirmRestore}
        isLoading={restoreMutation.isPending}
      />
    </div>
  );
}
