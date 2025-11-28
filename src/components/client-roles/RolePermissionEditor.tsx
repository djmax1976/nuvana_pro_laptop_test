"use client";

/**
 * Role Permission Editor Component
 * Allows Client Owners to toggle permissions for a specific role
 * Displays permissions grouped by category with save/reset functionality
 *
 * Story: 2.92 - Client Role Permission Management
 */

import { useState, useMemo, useEffect } from "react";
import {
  useRolePermissions,
  useUpdateRolePermissions,
  useResetRoleDefaults,
  groupPermissionsByCategory,
  getCategoryDisplayName,
  hasClientOverrides,
  type PermissionWithState,
  type PermissionUpdate,
} from "@/lib/api/client-roles";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Save,
  RotateCcw,
  AlertCircle,
  RefreshCw,
  ArrowLeft,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface RolePermissionEditorProps {
  roleId: string;
  onBack: () => void;
}

/**
 * Get a friendly display name for a role code
 */
function getRoleDisplayName(code: string): string {
  const names: Record<string, string> = {
    STORE_MANAGER: "Store Manager",
    SHIFT_MANAGER: "Shift Manager",
    CASHIER: "Cashier",
  };
  return names[code] || code.replace(/_/g, " ");
}

/**
 * Get icon for a category
 */
function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    SHIFTS: "clock",
    TRANSACTIONS: "credit-card",
    INVENTORY: "package",
    LOTTERY: "ticket",
    REPORTS: "bar-chart",
    EMPLOYEES: "users",
    STORE: "building",
  };
  return icons[category] || "folder";
}

export function RolePermissionEditor({
  roleId,
  onBack,
}: RolePermissionEditorProps) {
  const { toast } = useToast();

  // Local state for permission toggles
  const [localPermissions, setLocalPermissions] = useState<
    Map<string, boolean>
  >(new Map());
  const [hasChanges, setHasChanges] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);

  // Fetch role permissions
  const {
    data: role,
    isLoading,
    isError,
    error,
    refetch,
  } = useRolePermissions(roleId);

  // Mutations
  const updateMutation = useUpdateRolePermissions();
  const resetMutation = useResetRoleDefaults();

  // Initialize local state when data loads
  useEffect(() => {
    if (role) {
      const permMap = new Map<string, boolean>();
      role.permissions.forEach((p) => {
        permMap.set(p.permission_id, p.is_enabled);
      });
      setLocalPermissions(permMap);
      setHasChanges(false);
    }
  }, [role]);

  // Group permissions by category
  const groupedPermissions = useMemo(() => {
    if (!role) return {};
    return groupPermissionsByCategory(role.permissions);
  }, [role]);

  // Check if there are unsaved changes
  const checkForChanges = (newMap: Map<string, boolean>) => {
    if (!role) return false;
    for (const perm of role.permissions) {
      const localValue = newMap.get(perm.permission_id);
      if (localValue !== perm.is_enabled) {
        return true;
      }
    }
    return false;
  };

  // Handle permission toggle
  const handleToggle = (permissionId: string, checked: boolean) => {
    const newMap = new Map(localPermissions);
    newMap.set(permissionId, checked);
    setLocalPermissions(newMap);
    setHasChanges(checkForChanges(newMap));
  };

  // Get pending changes
  const getPendingChanges = (): PermissionUpdate[] => {
    if (!role) return [];
    const changes: PermissionUpdate[] = [];
    for (const perm of role.permissions) {
      const localValue = localPermissions.get(perm.permission_id);
      if (localValue !== undefined && localValue !== perm.is_enabled) {
        changes.push({
          permission_id: perm.permission_id,
          is_enabled: localValue,
        });
      }
    }
    return changes;
  };

  // Handle save
  const handleSave = async () => {
    const changes = getPendingChanges();
    if (changes.length === 0) return;

    try {
      await updateMutation.mutateAsync({
        roleId,
        permissions: changes,
      });
      toast({
        title: "Permissions updated",
        description: `${changes.length} permission(s) updated successfully.`,
      });
      setHasChanges(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to update permissions",
      });
    }
  };

  // Handle reset
  const handleReset = async () => {
    try {
      await resetMutation.mutateAsync(roleId);
      toast({
        title: "Permissions reset",
        description: "Role permissions have been reset to system defaults.",
      });
      setShowResetDialog(false);
      setHasChanges(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to reset permissions",
      });
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="permission-editor-loading">
        <div className="flex items-center gap-4 mb-6">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-8 w-48" />
        </div>
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent className="space-y-4">
              {[1, 2, 3].map((j) => (
                <div key={j} className="flex items-center gap-4">
                  <Skeleton className="h-5 w-5" />
                  <Skeleton className="h-4 w-48" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <Card
        className="border-destructive"
        data-testid="permission-editor-error"
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            Error Loading Permissions
          </CardTitle>
          <CardDescription>
            {error instanceof Error
              ? error.message
              : "Failed to load role permissions. Please try again."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!role) {
    return null;
  }

  const roleHasOverrides = hasClientOverrides(role.permissions);

  return (
    <div className="space-y-6" data-testid="permission-editor">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onBack} data-testid="back-button">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              {getRoleDisplayName(role.code)}
              {roleHasOverrides && (
                <Badge variant="secondary" className="text-xs">
                  Customized
                </Badge>
              )}
            </h2>
            <p className="text-sm text-muted-foreground">
              Customize permissions for this role
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowResetDialog(true)}
            disabled={!roleHasOverrides || resetMutation.isPending}
            data-testid="reset-to-default-button"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Default
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || updateMutation.isPending}
            data-testid="save-changes-button"
          >
            <Save className="h-4 w-4 mr-2" />
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Unsaved changes indicator */}
      {hasChanges && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-yellow-600" />
          <span className="text-sm text-yellow-700 dark:text-yellow-300">
            You have unsaved changes. Click &quot;Save Changes&quot; to apply
            them.
          </span>
        </div>
      )}

      {/* Permission categories */}
      {Object.entries(groupedPermissions).map(([category, permissions]) => (
        <Card key={category} data-testid={`permission-category-${category}`}>
          <CardHeader>
            <CardTitle className="text-base">
              {getCategoryDisplayName(category)}
            </CardTitle>
            <CardDescription>
              {permissions.length} permission
              {permissions.length !== 1 ? "s" : ""} in this category
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {permissions.map((permission) => (
                <PermissionToggle
                  key={permission.permission_id}
                  permission={permission}
                  checked={
                    localPermissions.get(permission.permission_id) ??
                    permission.is_enabled
                  }
                  onCheckedChange={(checked) =>
                    handleToggle(permission.permission_id, checked)
                  }
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Reset confirmation dialog */}
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent data-testid="reset-confirmation-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to Default Permissions?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all customizations for the{" "}
              <strong>{getRoleDisplayName(role.code)}</strong> role and restore
              the system default permissions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="reset-cancel-button">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReset}
              disabled={resetMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="reset-confirm-button"
            >
              {resetMutation.isPending ? "Resetting..." : "Reset to Default"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * Individual permission toggle component
 */
interface PermissionToggleProps {
  permission: PermissionWithState;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function PermissionToggle({
  permission,
  checked,
  onCheckedChange,
}: PermissionToggleProps) {
  return (
    <div
      className="flex items-start space-x-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
      data-testid={`permission-toggle-${permission.permission_id}`}
    >
      <Checkbox
        id={permission.permission_id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <Label
          htmlFor={permission.permission_id}
          className="text-sm font-medium cursor-pointer flex items-center gap-2 flex-wrap"
        >
          <span className="truncate">{permission.code.replace(/_/g, " ")}</span>
          {permission.is_client_override && (
            <Badge variant="outline" className="text-xs shrink-0">
              Modified
            </Badge>
          )}
          {permission.is_system_default && (
            <CheckCircle2
              className="h-3 w-3 text-green-500 shrink-0"
              aria-label="System default: enabled"
            />
          )}
        </Label>
        <p
          className="text-xs text-muted-foreground mt-1 line-clamp-2"
          data-testid={`permission-description-${permission.permission_id}`}
          title={permission.description}
        >
          {permission.description}
        </p>
      </div>
    </div>
  );
}
