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
import { useStoresByCompany } from "@/lib/api/stores";
import { CompanySearchCombobox } from "@/components/companies/CompanySearchCombobox";
import { AdminUser, UserStatus, ScopeType } from "@/types/admin-user";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { X, Plus, Loader2 } from "lucide-react";

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

  // State for role assignment with scope-based fields
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");

  // Fetch stores when company is selected and role is STORE-scoped
  const selectedRole = rolesData?.data.find(
    (r) => r.role_id === selectedRoleToAdd,
  );
  const selectedRoleScope = selectedRole?.scope as ScopeType | undefined;
  const isClientOwnerRole = selectedRole?.code === "CLIENT_OWNER";
  const isStoreScopedRole = selectedRoleScope === "STORE";
  const isCompanyScopedRole = selectedRoleScope === "COMPANY";

  const { data: storesData } = useStoresByCompany(
    selectedCompanyId || undefined,
    { limit: 100 },
    { enabled: !!selectedCompanyId && isStoreScopedRole },
  );

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
      // Reset scope-related fields when modal opens
      setSelectedCompanyId("");
      setSelectedStoreId("");
    }
  }, [user, open, form]);

  // Reset company/store when role changes
  useEffect(() => {
    setSelectedCompanyId("");
    setSelectedStoreId("");
  }, [selectedRoleToAdd]);

  // Reset store when company changes
  useEffect(() => {
    setSelectedStoreId("");
  }, [selectedCompanyId]);

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

    // Find the selected role to get its scope
    const roleToAssign = rolesData?.data.find(
      (r) => r.role_id === selectedRoleToAdd,
    );
    if (!roleToAssign) return;

    const roleScope = roleToAssign.scope as ScopeType;
    const isStoreScoped = roleScope === "STORE";
    const isCompanyScoped = roleScope === "COMPANY";

    // Validate required fields based on role scope
    if (isStoreScoped) {
      if (!selectedCompanyId) {
        toast({
          title: "Validation Error",
          description: `Company selection is required for ${roleToAssign.code} role`,
          variant: "destructive",
        });
        return;
      }
      if (!selectedStoreId) {
        toast({
          title: "Validation Error",
          description: `Store selection is required for ${roleToAssign.code} role`,
          variant: "destructive",
        });
        return;
      }
    }

    // COMPANY-scoped roles (including CLIENT_OWNER) require company selection
    if (isCompanyScoped) {
      if (!selectedCompanyId) {
        toast({
          title: "Validation Error",
          description: `Company selection is required for ${roleToAssign.code} role`,
          variant: "destructive",
        });
        return;
      }
    }

    try {
      await assignRoleMutation.mutateAsync({
        userId: user.user_id,
        roleAssignment: {
          role_id: selectedRoleToAdd,
          scope_type: roleScope,
          // Include company_id for COMPANY/STORE scoped roles
          ...((isCompanyScoped || isStoreScoped) && selectedCompanyId
            ? { company_id: selectedCompanyId }
            : {}),
          // Include store_id for STORE scoped roles
          ...(isStoreScoped && selectedStoreId
            ? { store_id: selectedStoreId }
            : {}),
        },
      });

      toast({
        title: "Success",
        description: `Role "${roleToAssign.code}" assigned successfully`,
      });

      // Reset all role assignment fields
      setSelectedRoleToAdd("");
      setSelectedCompanyId("");
      setSelectedStoreId("");

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
                  <div className="space-y-4">
                    {/* Role Selection */}
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
                    </div>

                    {/* CLIENT_OWNER fields - Assign to existing company */}
                    {isClientOwnerRole && (
                      <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-4">
                        <div>
                          <h4 className="text-sm font-medium text-foreground">
                            Company Assignment
                          </h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            Select the company this user will own. To create a
                            new company with a Client Owner, use the &quot;Add
                            New User&quot; flow instead.
                          </p>
                        </div>
                        <CompanySearchCombobox
                          value={selectedCompanyId}
                          onValueChange={(companyId) => {
                            setSelectedCompanyId(companyId);
                          }}
                          label="Company *"
                          placeholder="Search or select a company..."
                          testId="edit-user-client-owner-company-select"
                        />
                      </div>
                    )}

                    {/* STORE-scoped roles - Company and Store selection */}
                    {isStoreScopedRole && (
                      <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-4">
                        <div>
                          <h4 className="text-sm font-medium text-foreground">
                            Store Assignment
                          </h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            Select the company and store for this{" "}
                            {selectedRole?.code} role.
                          </p>
                        </div>
                        <div className="space-y-3">
                          <CompanySearchCombobox
                            value={selectedCompanyId}
                            onValueChange={(companyId) => {
                              setSelectedCompanyId(companyId);
                            }}
                            label="Company *"
                            placeholder="Search or select a company..."
                            testId="edit-user-store-company-select"
                          />
                          <div>
                            <label className="text-sm font-medium">
                              Store *
                            </label>
                            <Select
                              value={selectedStoreId}
                              onValueChange={setSelectedStoreId}
                              disabled={!selectedCompanyId || !storesData?.data}
                            >
                              <SelectTrigger
                                className="mt-1.5"
                                data-testid="edit-user-store-select"
                              >
                                <SelectValue
                                  placeholder={
                                    !selectedCompanyId
                                      ? "Select a company first"
                                      : "Select a store"
                                  }
                                />
                              </SelectTrigger>
                              <SelectContent>
                                {storesData?.data?.map((store) => (
                                  <SelectItem
                                    key={store.store_id}
                                    value={store.store_id}
                                  >
                                    {store.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* COMPANY-scoped roles (not CLIENT_OWNER) - Company selection only */}
                    {isCompanyScopedRole && !isClientOwnerRole && (
                      <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-4">
                        <div>
                          <h4 className="text-sm font-medium text-foreground">
                            Company Assignment
                          </h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            Select the company for this {selectedRole?.code}{" "}
                            role.
                          </p>
                        </div>
                        <CompanySearchCombobox
                          value={selectedCompanyId}
                          onValueChange={(companyId) => {
                            setSelectedCompanyId(companyId);
                          }}
                          label="Company *"
                          placeholder="Search or select a company..."
                          testId="edit-user-company-select"
                        />
                      </div>
                    )}

                    {/* Add Role Button */}
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleAddRole}
                      disabled={
                        !selectedRoleToAdd || assignRoleMutation.isPending
                      }
                      className="w-full"
                      data-testid="add-role-button"
                    >
                      {assignRoleMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Assigning Role...
                        </>
                      ) : (
                        <>
                          <Plus className="mr-2 h-4 w-4" />
                          Add Role
                        </>
                      )}
                    </Button>
                  </div>
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
