"use client";

/**
 * Admin Role Permission Editor Component
 * Allows Super Admins to edit a role's system default permissions
 *
 * Features:
 * - Grouped permissions by category
 * - Toggle individual permissions
 * - Save/Cancel with confirmation
 * - Shows permission descriptions
 */

import { useState, useMemo, useEffect, useRef } from "react";
import {
  useAdminRole,
  useAllPermissions,
  useUpdateRolePermissions,
  Permission,
  RoleWithDetails,
  getScopeDisplayName,
  getScopeBadgeColor,
} from "@/lib/api/admin-roles";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Shield,
  AlertCircle,
  RefreshCw,
  Save,
  X,
  Lock,
  Check,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

interface AdminRolePermissionEditorProps {
  roleId: string;
  onClose?: () => void;
}

// Permission categories for grouping
const PERMISSION_CATEGORIES: Record<
  string,
  { name: string; description: string; prefixes: string[] }
> = {
  USER: {
    name: "User Management",
    description: "Permissions for managing users and cashiers",
    prefixes: ["USER_", "CASHIER_"],
  },
  COMPANY: {
    name: "Company Management",
    description: "Permissions for managing companies",
    prefixes: ["COMPANY_"],
  },
  STORE: {
    name: "Store Management",
    description: "Permissions for managing stores",
    prefixes: ["STORE_"],
  },
  SHIFT: {
    name: "Shift Operations",
    description: "Permissions for shift management",
    prefixes: ["SHIFT_"],
  },
  TRANSACTION: {
    name: "Transactions",
    description: "Permissions for transaction processing",
    prefixes: ["TRANSACTION_"],
  },
  INVENTORY: {
    name: "Inventory",
    description: "Permissions for inventory management",
    prefixes: ["INVENTORY_"],
  },
  LOTTERY: {
    name: "Lottery",
    description: "Permissions for lottery operations",
    prefixes: ["LOTTERY_"],
  },
  REPORT: {
    name: "Reports",
    description: "Permissions for report generation and X/Z reports",
    prefixes: ["REPORT_", "X_REPORT_", "Z_REPORT_"],
  },
  ADMIN: {
    name: "Administration",
    description: "System administration permissions",
    prefixes: ["ADMIN_"],
  },
  CLIENT: {
    name: "Client Dashboard",
    description: "Client dashboard and employee management",
    prefixes: ["CLIENT_"],
  },
  POS_CONFIG: {
    name: "POS Configuration",
    description:
      "POS integration, NAXML file management, and system configuration",
    prefixes: [
      "TENDER_TYPE_",
      "DEPARTMENT_",
      "TAX_RATE_",
      "CONFIG_",
      "POS_",
      "NAXML_",
    ],
  },
};

function getPermissionCategory(permissionCode: string): string {
  for (const [category, config] of Object.entries(PERMISSION_CATEGORIES)) {
    if (config.prefixes.some((prefix) => permissionCode.startsWith(prefix))) {
      return category;
    }
  }
  return "OTHER";
}

export function AdminRolePermissionEditor({
  roleId,
  onClose,
}: AdminRolePermissionEditorProps) {
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(
    new Set(),
  );
  const [hasChanges, setHasChanges] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const initRef = useRef(false);

  const { toast } = useToast();

  const {
    data: role,
    isLoading: roleLoading,
    isError: roleError,
    error: roleErrorMessage,
    refetch: refetchRole,
  } = useAdminRole(roleId);

  const {
    data: allPermissions,
    isLoading: permissionsLoading,
    isError: permissionsError,
    refetch: refetchPermissions,
  } = useAllPermissions();

  const updateMutation = useUpdateRolePermissions();

  // Reset initialization ref when roleId changes (e.g., navigating to different role)
  useEffect(() => {
    initRef.current = false;
    setHasChanges(false);
    setSelectedPermissions(new Set());
  }, [roleId]);

  // Initialize selected permissions when role data loads
  // Only initialize once per mount or when there are no unsaved changes
  useEffect(() => {
    if (role) {
      // On first role load, always initialize
      // On subsequent role refetches, only initialize if there are no unsaved changes
      if (!initRef.current || !hasChanges) {
        const permIds = new Set(role.permissions.map((p) => p.permission_id));
        setSelectedPermissions(permIds);
        setHasChanges(false);
        initRef.current = true;
      }
    }
  }, [role, hasChanges]);

  // Group permissions by category using Map for safe dynamic access
  const groupedPermissions = useMemo(() => {
    if (!allPermissions) return new Map<string, Permission[]>();

    const groups = new Map<string, Permission[]>();

    for (const perm of allPermissions) {
      const category = getPermissionCategory(perm.code);
      const existing = groups.get(category);
      if (existing) {
        existing.push(perm);
      } else {
        groups.set(category, [perm]);
      }
    }

    // Sort permissions within each category
    groups.forEach((perms) => {
      perms.sort((a: Permission, b: Permission) =>
        a.code.localeCompare(b.code),
      );
    });

    return groups;
  }, [allPermissions]);

  // Toggle permission
  const togglePermission = (permissionId: string) => {
    setSelectedPermissions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(permissionId)) {
        newSet.delete(permissionId);
      } else {
        newSet.add(permissionId);
      }
      return newSet;
    });
    setHasChanges(true);
  };

  // Select all in category
  const selectAllInCategory = (category: string) => {
    const categoryPerms = groupedPermissions.get(category) ?? [];
    setSelectedPermissions((prev) => {
      const newSet = new Set(prev);
      categoryPerms.forEach((p) => newSet.add(p.permission_id));
      return newSet;
    });
    setHasChanges(true);
  };

  // Deselect all in category
  const deselectAllInCategory = (category: string) => {
    const categoryPerms = groupedPermissions.get(category) ?? [];
    setSelectedPermissions((prev) => {
      const newSet = new Set(prev);
      categoryPerms.forEach((p) => newSet.delete(p.permission_id));
      return newSet;
    });
    setHasChanges(true);
  };

  // Check if all in category are selected
  const isAllSelectedInCategory = (category: string): boolean => {
    const categoryPerms = groupedPermissions.get(category) ?? [];
    return categoryPerms.every((p) => selectedPermissions.has(p.permission_id));
  };

  // Check if some in category are selected
  const isSomeSelectedInCategory = (category: string): boolean => {
    const categoryPerms = groupedPermissions.get(category) ?? [];
    return (
      categoryPerms.some((p) => selectedPermissions.has(p.permission_id)) &&
      !isAllSelectedInCategory(category)
    );
  };

  // Save changes
  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        roleId,
        data: { permissions: Array.from(selectedPermissions) },
      });
      toast({
        title: "Permissions Updated",
        description: `Role "${role?.code}" permissions have been saved.`,
      });
      setHasChanges(false);
      setShowSaveDialog(false);
    } catch (err) {
      toast({
        title: "Save Failed",
        description:
          err instanceof Error ? err.message : "Failed to save permissions",
        variant: "destructive",
      });
    }
  };

  // Discard changes
  const handleDiscard = () => {
    if (role) {
      const permIds = new Set(role.permissions.map((p) => p.permission_id));
      setSelectedPermissions(permIds);
      setHasChanges(false);
    }
    setShowDiscardDialog(false);
  };

  // Close handler
  const handleClose = () => {
    if (hasChanges) {
      setShowDiscardDialog(true);
    } else {
      onClose?.();
    }
  };

  // Loading state
  if (roleLoading || permissionsLoading) {
    return (
      <div className="space-y-4" data-testid="permission-editor-loading">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-48" />
              </CardHeader>
              <CardContent className="space-y-3">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="h-4 w-40" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (roleError || permissionsError) {
    return (
      <div
        className="rounded-lg border border-destructive p-6"
        data-testid="permission-editor-error"
      >
        <div className="flex items-center gap-2 text-destructive mb-4">
          <AlertCircle className="h-5 w-5" />
          <h3 className="font-semibold">Error Loading Data</h3>
        </div>
        <p className="text-muted-foreground mb-4">
          {roleErrorMessage instanceof Error
            ? roleErrorMessage.message
            : "Failed to load role data. Please try again."}
        </p>
        <Button
          variant="outline"
          onClick={() => Promise.all([refetchRole(), refetchPermissions()])}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  if (!role || !allPermissions) {
    return null;
  }

  return (
    <div className="space-y-6" data-testid="permission-editor">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/admin/roles">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            </Link>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="h-6 w-6" />
              {role.code}
              {role.is_system_role && (
                <Lock className="h-4 w-4 text-muted-foreground" />
              )}
            </h1>
            <Badge className={getScopeBadgeColor(role.scope)}>
              {getScopeDisplayName(role.scope)}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            {role.description || "No description"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {hasChanges && (
            <>
              <Button
                variant="outline"
                onClick={() => setShowDiscardDialog(true)}
              >
                <X className="h-4 w-4 mr-2" />
                Discard
              </Button>
              <Button onClick={() => setShowSaveDialog(true)}>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Change indicator */}
      {hasChanges && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-yellow-600" />
          <span className="text-sm text-yellow-800 dark:text-yellow-200">
            You have unsaved changes
          </span>
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center gap-6 text-sm">
        <span>
          Selected: <strong>{selectedPermissions.size}</strong> /{" "}
          {allPermissions.length} permissions
        </span>
        <span>
          Users with this role: <strong>{role.user_count}</strong>
        </span>
        <span>
          Companies: <strong>{role.company_count}</strong>
        </span>
      </div>

      {/* Permission categories */}
      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(PERMISSION_CATEGORIES).map(([category, config]) => {
          const categoryPerms = groupedPermissions.get(category);
          if (!categoryPerms || categoryPerms.length === 0) return null;

          const allSelected = isAllSelectedInCategory(category);
          const someSelected = isSomeSelectedInCategory(category);
          const selectedCount = categoryPerms.filter((p) =>
            selectedPermissions.has(p.permission_id),
          ).length;

          return (
            <Card key={category} data-testid={`category-${category}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{config.name}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {selectedCount}/{categoryPerms.length}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7 px-2"
                      onClick={() =>
                        allSelected
                          ? deselectAllInCategory(category)
                          : selectAllInCategory(category)
                      }
                    >
                      {allSelected ? "Deselect All" : "Select All"}
                    </Button>
                  </div>
                </div>
                <CardDescription className="text-xs">
                  {config.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2">
                  {categoryPerms.map((perm) => (
                    <div
                      key={perm.permission_id}
                      className="flex items-start gap-2 group"
                      data-testid={`permission-${perm.code}`}
                    >
                      <Checkbox
                        id={perm.permission_id}
                        checked={selectedPermissions.has(perm.permission_id)}
                        onCheckedChange={() =>
                          togglePermission(perm.permission_id)
                        }
                        className="mt-0.5"
                      />
                      <label
                        htmlFor={perm.permission_id}
                        className="flex-1 cursor-pointer"
                      >
                        <div className="text-sm font-medium leading-none">
                          {perm.code.replace(/_/g, " ")}
                        </div>
                        {perm.description && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {perm.description}
                          </p>
                        )}
                      </label>
                      {selectedPermissions.has(perm.permission_id) && (
                        <Check className="h-4 w-4 text-green-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* Other permissions (if any don't match categories) */}
        {groupedPermissions.get("OTHER") &&
          (groupedPermissions.get("OTHER")?.length ?? 0) > 0 && (
            <Card data-testid="category-OTHER">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Other</CardTitle>
                <CardDescription className="text-xs">
                  Miscellaneous permissions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2">
                  {(groupedPermissions.get("OTHER") ?? []).map(
                    (perm: Permission) => (
                      <div
                        key={perm.permission_id}
                        className="flex items-start gap-2"
                        data-testid={`permission-${perm.code}`}
                      >
                        <Checkbox
                          id={perm.permission_id}
                          checked={selectedPermissions.has(perm.permission_id)}
                          onCheckedChange={() =>
                            togglePermission(perm.permission_id)
                          }
                          className="mt-0.5"
                        />
                        <label
                          htmlFor={perm.permission_id}
                          className="flex-1 cursor-pointer"
                        >
                          <div className="text-sm font-medium leading-none">
                            {perm.code.replace(/_/g, " ")}
                          </div>
                          {perm.description && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {perm.description}
                            </p>
                          )}
                        </label>
                      </div>
                    ),
                  )}
                </div>
              </CardContent>
            </Card>
          )}
      </div>

      {/* Save confirmation dialog */}
      <ConfirmDialog
        open={showSaveDialog}
        onOpenChange={setShowSaveDialog}
        title="Save Permission Changes"
        description={`Are you sure you want to save these permission changes to "${role.code}"? This will affect all users with this role.`}
        confirmText="Save Changes"
        onConfirm={handleSave}
        isLoading={updateMutation.isPending}
      />

      {/* Discard confirmation dialog */}
      <ConfirmDialog
        open={showDiscardDialog}
        onOpenChange={setShowDiscardDialog}
        title="Discard Changes"
        description="Are you sure you want to discard your unsaved changes?"
        confirmText="Discard"
        onConfirm={handleDiscard}
        destructive
      />
    </div>
  );
}
