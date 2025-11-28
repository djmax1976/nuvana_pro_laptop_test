"use client";

/**
 * Deleted Roles List Component
 * Displays soft-deleted roles with options to restore or permanently delete
 */

import { useState } from "react";
import Link from "next/link";
import {
  useDeletedRoles,
  useRestoreRole,
  usePurgeRole,
  RoleWithDetails,
  getScopeDisplayName,
  getScopeBadgeColor,
} from "@/lib/api/admin-roles";
import { Button } from "@/components/ui/button";
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
import {
  ArrowLeft,
  Shield,
  AlertCircle,
  RefreshCw,
  RotateCcw,
  Trash2,
  Clock,
  AlertTriangle,
} from "lucide-react";

export function DeletedRolesList() {
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [showPurgeDialog, setShowPurgeDialog] = useState(false);
  const [selectedRole, setSelectedRole] = useState<RoleWithDetails | null>(
    null,
  );

  const { toast } = useToast();

  const { data: roles, isLoading, isError, error, refetch } = useDeletedRoles();

  const restoreMutation = useRestoreRole();
  const purgeMutation = usePurgeRole();

  // Format deleted date
  const formatDeletedDate = (dateStr: string | null) => {
    if (!dateStr) return "Unknown";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Calculate days until purge (30 day retention)
  const getDaysUntilPurge = (dateStr: string | null) => {
    if (!dateStr) return null;
    const deletedDate = new Date(dateStr);
    const purgeDate = new Date(deletedDate);
    purgeDate.setDate(purgeDate.getDate() + 30);
    const now = new Date();
    const diffTime = purgeDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  // Handle restore
  const handleRestore = (role: RoleWithDetails) => {
    setSelectedRole(role);
    setShowRestoreDialog(true);
  };

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

  // Handle purge
  const handlePurge = (role: RoleWithDetails) => {
    setSelectedRole(role);
    setShowPurgeDialog(true);
  };

  const confirmPurge = async () => {
    if (!selectedRole) return;

    try {
      await purgeMutation.mutateAsync(selectedRole.role_id);
      toast({
        title: "Role Permanently Deleted",
        description: `Role "${selectedRole.code}" has been permanently deleted.`,
      });
      setShowPurgeDialog(false);
      setSelectedRole(null);
    } catch (err) {
      toast({
        title: "Purge Failed",
        description:
          err instanceof Error
            ? err.message
            : "Failed to permanently delete role",
        variant: "destructive",
      });
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="deleted-roles-loading">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {[1, 2, 3, 4, 5].map((i) => (
                  <TableHead key={i}>
                    <Skeleton className="h-4 w-20" />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3].map((i) => (
                <TableRow key={i}>
                  {[1, 2, 3, 4, 5].map((j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-5 w-24" />
                    </TableCell>
                  ))}
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
        data-testid="deleted-roles-error"
      >
        <div className="flex items-center gap-2 text-destructive mb-4">
          <AlertCircle className="h-5 w-5" />
          <h3 className="font-semibold">Error Loading Deleted Roles</h3>
        </div>
        <p className="text-muted-foreground mb-4">
          {error instanceof Error
            ? error.message
            : "Failed to load deleted roles. Please try again."}
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="deleted-roles-list">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/roles">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trash2 className="h-6 w-6" />
            Deleted Roles
          </h1>
          <p className="text-muted-foreground">
            Roles are retained for 30 days before permanent deletion
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
        <div>
          <h4 className="font-medium text-yellow-800 dark:text-yellow-200">
            Retention Policy
          </h4>
          <p className="text-sm text-yellow-700 dark:text-yellow-300">
            Deleted roles are automatically purged after 30 days. Restore a role
            to prevent permanent deletion.
          </p>
        </div>
      </div>

      {/* Roles table or empty state */}
      {!roles || roles.length === 0 ? (
        <div
          className="text-center py-12 border rounded-lg"
          data-testid="deleted-roles-empty"
        >
          <Trash2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Deleted Roles</h3>
          <p className="text-muted-foreground mb-4">
            There are no deleted roles in the system.
          </p>
          <Link href="/admin/roles">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Roles
            </Button>
          </Link>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role Code</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Deleted At</TableHead>
                <TableHead>Days Until Purge</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((role) => {
                const daysUntilPurge = getDaysUntilPurge(role.deleted_at);
                return (
                  <TableRow
                    key={role.role_id}
                    data-testid={`deleted-role-row-${role.role_id}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{role.code}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getScopeBadgeColor(role.scope)}>
                        {getScopeDisplayName(role.scope)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDeletedDate(role.deleted_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        {daysUntilPurge !== null ? (
                          <span
                            className={
                              daysUntilPurge <= 7 ? "text-destructive" : ""
                            }
                          >
                            {daysUntilPurge} days
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Unknown</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRestore(role)}
                          data-testid={`restore-role-${role.role_id}`}
                        >
                          <RotateCcw className="h-4 w-4 mr-1" />
                          Restore
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handlePurge(role)}
                          data-testid={`purge-role-${role.role_id}`}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Purge
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

      {/* Restore confirmation dialog */}
      <ConfirmDialog
        open={showRestoreDialog}
        onOpenChange={setShowRestoreDialog}
        title="Restore Role"
        description={`Are you sure you want to restore the role "${selectedRole?.code}"? It will be available for assignment again.`}
        confirmText="Restore"
        onConfirm={confirmRestore}
        isLoading={restoreMutation.isPending}
      />

      {/* Purge confirmation dialog */}
      <ConfirmDialog
        open={showPurgeDialog}
        onOpenChange={setShowPurgeDialog}
        title="Permanently Delete Role"
        description={`Are you sure you want to permanently delete the role "${selectedRole?.code}"? This action cannot be undone.`}
        confirmText="Permanently Delete"
        onConfirm={confirmPurge}
        destructive
        isLoading={purgeMutation.isPending}
      />
    </div>
  );
}
