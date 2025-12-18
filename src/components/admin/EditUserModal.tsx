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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useUpdateUserStatus,
  useUpdateUserProfile,
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
import { X, Plus, Loader2, Eye, EyeOff } from "lucide-react";

/**
 * Password validation schema - matches backend requirements
 */
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(255, "Password cannot exceed 255 characters")
  .refine((val) => !/\s/.test(val), {
    message: "Password cannot contain whitespace",
  })
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(
    /(?=.*[^\w\s])/,
    "Password must contain at least one special character (punctuation or symbol)",
  );

/**
 * User edit form validation schema
 * Super Admin can edit name, email, password, and status
 */
const editUserSchema = z
  .object({
    name: z
      .string()
      .min(1, "Name is required")
      .max(255, "Name cannot exceed 255 characters")
      .refine((val) => val.trim().length > 0, {
        message: "Name cannot be whitespace only",
      }),
    email: z
      .string()
      .email("Invalid email format")
      .max(255, "Email cannot exceed 255 characters"),
    password: z.union([z.literal(""), passwordSchema]).optional(),
    confirmPassword: z.string().optional(),
    status: z.nativeEnum(UserStatus, {
      message: "Please select a status",
    }),
  })
  .refine(
    (data) => {
      // If password is provided and not empty, confirmPassword must match
      if (data.password && data.password.length > 0) {
        return data.confirmPassword === data.password;
      }
      return true;
    },
    {
      message: "Passwords do not match",
      path: ["confirmPassword"],
    },
  );

type EditUserFormValues = z.infer<typeof editUserSchema>;

interface EditUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AdminUser | null;
  onSuccess?: () => void;
}

/**
 * EditUserModal component
 * Modal dialog for editing an existing user's profile, status, and roles
 * Super Admin can edit: name, email, password, status, and role assignments
 * Uses Shadcn/ui Dialog and Form components with Zod validation
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const updateStatusMutation = useUpdateUserStatus();
  const updateProfileMutation = useUpdateUserProfile();
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
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      status: UserStatus.ACTIVE,
    },
  });

  // Sync form state when user prop changes
  useEffect(() => {
    if (user && open) {
      form.reset({
        name: user.name || "",
        email: user.email || "",
        password: "",
        confirmPassword: "",
        status: user.status || UserStatus.ACTIVE,
      });
      setSelectedRoleToAdd("");
      // Reset scope-related fields when modal opens
      setSelectedCompanyId("");
      setSelectedStoreId("");
      // Reset password visibility
      setShowPassword(false);
      setShowConfirmPassword(false);
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
      // Check what fields have changed
      const nameChanged = values.name.trim() !== user.name;
      const emailChanged =
        values.email.toLowerCase().trim() !== user.email.toLowerCase();
      const passwordProvided = values.password && values.password.length > 0;
      const statusChanged = values.status !== user.status;

      const profileChanged = nameChanged || emailChanged || passwordProvided;

      // Update profile if name, email, or password changed
      if (profileChanged) {
        const profileData: {
          name?: string;
          email?: string;
          password?: string;
        } = {};

        if (nameChanged) {
          profileData.name = values.name.trim();
        }
        if (emailChanged) {
          profileData.email = values.email.toLowerCase().trim();
        }
        if (passwordProvided) {
          profileData.password = values.password;
        }

        await updateProfileMutation.mutateAsync({
          userId: user.user_id,
          data: profileData,
        });
      }

      // Update status if changed
      if (statusChanged) {
        await updateStatusMutation.mutateAsync({
          userId: user.user_id,
          data: {
            status: values.status,
          },
        });
      }

      // Show appropriate success message
      const changes: string[] = [];
      if (nameChanged) changes.push("name");
      if (emailChanged) changes.push("email");
      if (passwordProvided) changes.push("password");
      if (statusChanged) changes.push("status");

      toast({
        title: "Success",
        description:
          changes.length > 0
            ? `User ${changes.join(", ")} updated successfully`
            : "No changes were made",
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
            : "Failed to update user. Please try again.",
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
              Update user profile, status, and manage role assignments.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-6"
              noValidate
            >
              {/* Editable user profile fields */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter user name"
                        {...field}
                        disabled={isSubmitting}
                        data-testid="edit-user-name-input"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="Enter email address"
                        {...field}
                        disabled={isSubmitting}
                        data-testid="edit-user-email-input"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Password Change Section */}
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-foreground">
                    Change Password (Optional)
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Leave blank to keep the current password
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter new password"
                            {...field}
                            disabled={isSubmitting}
                            data-testid="edit-user-password-input"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            tabIndex={-1}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </FormControl>
                      <FormDescription>
                        Min 8 chars, uppercase, lowercase, number, special
                        character
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm New Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showConfirmPassword ? "text" : "password"}
                            placeholder="Confirm new password"
                            {...field}
                            disabled={isSubmitting}
                            data-testid="edit-user-confirm-password-input"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setShowConfirmPassword(!showConfirmPassword)
                            }
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            tabIndex={-1}
                          >
                            {showConfirmPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

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
