"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useUpdateUserStatus,
  useRoles,
  useAssignRole,
  useRevokeRole,
} from "@/lib/api/admin-users";
import { AdminUser, UserStatus, ScopeType } from "@/types/admin-user";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { X, Plus } from "lucide-react";

/**
 * User edit form validation schema
 * Note: Only status can be changed. Email and name cannot be modified after creation.
 */
const editUserSchema = z.object({
  status: z.nativeEnum(UserStatus, {
    message: "Please select a status",
  }),
});

type EditUserFormValues = z.infer<typeof editUserSchema>;

interface EditUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AdminUser | null;
  onSuccess?: () => void;
}

/**
 * EditUserModal component
 * Modal dialog for editing an existing user's status and roles
 * Uses Shadcn/ui Dialog and Form components with Zod validation
 * Note: Only status can be changed - email and name cannot be modified
 */
export function EditUserModal({
  open,
  onOpenChange,
  user,
  onSuccess,
}: EditUserModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showStatusChangeDialog, setShowStatusChangeDialog] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<UserStatus | null>(null);
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [pendingRevokeRoleId, setPendingRevokeRoleId] = useState<string | null>(
    null,
  );
  const [selectedRoleToAdd, setSelectedRoleToAdd] = useState<string>("");

  const updateMutation = useUpdateUserStatus();
  const assignRoleMutation = useAssignRole();
  const revokeRoleMutation = useRevokeRole();
  const { data: rolesData } = useRoles();

  const form = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      status: UserStatus.ACTIVE,
    },
  });

  // Sync form state when user prop changes
  useEffect(() => {
    if (user && open) {
      form.reset({
        status: user.status || UserStatus.ACTIVE,
      });
      setSelectedRoleToAdd("");
    }
  }, [user, open, form]);

  const handleStatusChange = (newStatus: UserStatus) => {
    if (user && user.status !== newStatus) {
      setPendingStatus(newStatus);
      setShowStatusChangeDialog(true);
    } else {
      form.setValue("status", newStatus);
    }
  };

  const confirmStatusChange = () => {
    if (pendingStatus) {
      form.setValue("status", pendingStatus);
    }
    setShowStatusChangeDialog(false);
    setPendingStatus(null);
  };

  const onSubmit = async (values: EditUserFormValues) => {
    if (!user) return;

    setIsSubmitting(true);
    try {
      await updateMutation.mutateAsync({
        userId: user.user_id,
        data: {
          status: values.status,
        },
      });

      toast({
        title: "Success",
        description: "User status updated successfully",
      });

      // Reset form and close modal
      form.reset();
      onOpenChange(false);

      // Call onSuccess callback if provided
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to update user status. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddRole = async () => {
    if (!user || !selectedRoleToAdd) return;

    try {
      // Find the selected role to get its scope
      const selectedRole = rolesData?.data.find(
        (r) => r.role_id === selectedRoleToAdd,
      );
      if (!selectedRole) return;

      await assignRoleMutation.mutateAsync({
        userId: user.user_id,
        roleAssignment: {
          role_id: selectedRoleToAdd,
          scope_type: selectedRole.scope as ScopeType,
        },
      });

      toast({
        title: "Success",
        description: `Role "${selectedRole.code}" assigned successfully`,
      });

      setSelectedRoleToAdd("");

      // Call onSuccess to refresh user data
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to assign role. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleRevokeRole = (userRoleId: string) => {
    setPendingRevokeRoleId(userRoleId);
    setShowRevokeDialog(true);
  };

  const confirmRevokeRole = async () => {
    if (!user || !pendingRevokeRoleId) return;

    try {
      await revokeRoleMutation.mutateAsync({
        userId: user.user_id,
        userRoleId: pendingRevokeRoleId,
      });

      toast({
        title: "Success",
        description: "Role revoked successfully",
      });

      // Call onSuccess to refresh user data
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to revoke role. Please try again.",
        variant: "destructive",
      });
    } finally {
      setShowRevokeDialog(false);
      setPendingRevokeRoleId(null);
    }
  };

  const handleCancel = () => {
    form.reset();
    onOpenChange(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && open) {
      form.reset();
    }
    onOpenChange(newOpen);
  };

  // Get all roles that user doesn't already have
  const availableRoles =
    rolesData?.data.filter((role) => {
      // Filter out roles user already has
      return !user?.roles.some((ur) => ur.role.role_id === role.role_id);
    }) || [];

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user status and manage role assignments. Note: Email and
              name cannot be changed after user creation.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-6"
              noValidate
            >
              {/* Display user info (read-only) */}
              {user && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium">Name</label>
                    <div className="mt-2 rounded-md border bg-muted px-3 py-2 text-sm">
                      {user.name}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Email</label>
                    <div className="mt-2 rounded-md border bg-muted px-3 py-2 text-sm">
                      {user.email}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Name and email cannot be changed after creation
                  </p>
                </div>
              )}

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select
                      onValueChange={handleStatusChange}
                      value={field.value}
                      disabled={isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="edit-user-status-select">
                          <SelectValue placeholder="Select a status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ACTIVE">Active</SelectItem>
                        <SelectItem value="INACTIVE">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      The current status of the user
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Current Roles Section */}
              {user && (
                <div className="space-y-3">
                  <label className="text-sm font-medium">Current Roles</label>
                  <div className="flex flex-wrap gap-2">
                    {user.roles.length > 0 ? (
                      user.roles.map((userRole) => (
                        <span
                          key={userRole.user_role_id}
                          className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-sm font-medium text-secondary-foreground"
                        >
                          <span>{userRole.role.code}</span>
                          {userRole.company_name && (
                            <span className="text-xs text-muted-foreground">
                              ({userRole.company_name})
                            </span>
                          )}
                          {userRole.store_name && (
                            <span className="text-xs text-muted-foreground">
                              ({userRole.store_name})
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              handleRevokeRole(userRole.user_role_id)
                            }
                            className="ml-1 rounded-full p-0.5 hover:bg-destructive hover:text-destructive-foreground"
                            disabled={
                              user.roles.length <= 1 ||
                              revokeRoleMutation.isPending
                            }
                            title={
                              user.roles.length <= 1
                                ? "Cannot remove last role"
                                : "Remove role"
                            }
                            data-testid={`revoke-role-${userRole.role.code}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        No roles assigned
                      </span>
                    )}
                  </div>
                  {user.roles.length <= 1 && (
                    <p className="text-xs text-muted-foreground">
                      Users must have at least one role
                    </p>
                  )}
                </div>
              )}

              {/* Add Role Section */}
              {user && availableRoles.length > 0 && (
                <div className="space-y-3">
                  <label className="text-sm font-medium">Add Role</label>
                  <div className="flex gap-2">
                    <Select
                      value={selectedRoleToAdd}
                      onValueChange={setSelectedRoleToAdd}
                      disabled={assignRoleMutation.isPending}
                    >
                      <SelectTrigger
                        className="flex-1"
                        data-testid="add-role-select"
                      >
                        <SelectValue placeholder="Select a role to add" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableRoles.map((role) => (
                          <SelectItem key={role.role_id} value={role.role_id}>
                            {role.code}
                            <span className="text-muted-foreground ml-2">
                              ({role.scope})
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleAddRole}
                      disabled={
                        !selectedRoleToAdd || assignRoleMutation.isPending
                      }
                      data-testid="add-role-button"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Note: COMPANY and STORE scope roles require additional
                    context (company/store selection) which will be configured
                    separately.
                  </p>
                </div>
              )}

              <div className="flex gap-4 justify-end pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancel}
                  disabled={isSubmitting}
                  data-testid="edit-user-cancel-button"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  data-testid="edit-user-submit-button"
                >
                  {isSubmitting ? "Updating..." : "Update User"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Status Change Confirmation Dialog */}
      <ConfirmDialog
        open={showStatusChangeDialog}
        onOpenChange={setShowStatusChangeDialog}
        title={`Change status to ${pendingStatus}?`}
        description={`Are you sure you want to change this user's status to ${pendingStatus}? ${
          pendingStatus === "INACTIVE"
            ? "This will disable their access."
            : "This will enable their access."
        }`}
        confirmText={`Change to ${pendingStatus}`}
        cancelText="Cancel"
        onConfirm={confirmStatusChange}
        destructive={pendingStatus === "INACTIVE"}
      />

      {/* Revoke Role Confirmation Dialog */}
      <ConfirmDialog
        open={showRevokeDialog}
        onOpenChange={setShowRevokeDialog}
        title="Revoke Role?"
        description="Are you sure you want to revoke this role from the user? This action cannot be undone."
        confirmText="Revoke Role"
        cancelText="Cancel"
        onConfirm={confirmRevokeRole}
        destructive
      />
    </>
  );
}
