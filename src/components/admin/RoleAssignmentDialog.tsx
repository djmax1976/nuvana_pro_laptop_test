"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRoles, useAssignRole, useRevokeRole } from "@/lib/api/admin-users";
import { useCompanies } from "@/lib/api/companies";
import { useStoresByCompany } from "@/lib/api/stores";
import { AdminUser, UserRoleDetail, ScopeType } from "@/types/admin-user";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
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
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2 } from "lucide-react";

// Zod validation schema for role assignment
// SEC-010 AUTHZ: SUPPORT scope does NOT require company_id or store_id
// SUPPORT users have cross-company read access for troubleshooting
const roleAssignmentSchema = z
  .object({
    role_id: z.string().min(1, "Role is required"),
    scope_type: z.enum(["SYSTEM", "SUPPORT", "COMPANY", "STORE"]),
    company_id: z.string().optional(),
    store_id: z.string().optional(),
  })
  .refine(
    (data) => {
      // SYSTEM and SUPPORT scopes don't require company_id
      if (data.scope_type === "COMPANY" || data.scope_type === "STORE") {
        return data.company_id;
      }
      return true;
    },
    {
      message: "Company is required for this scope",
      path: ["company_id"],
    },
  )
  .refine(
    (data) => {
      if (data.scope_type === "STORE") {
        return data.store_id;
      }
      return true;
    },
    {
      message: "Store is required for STORE scope",
      path: ["store_id"],
    },
  );

type RoleAssignmentFormValues = z.infer<typeof roleAssignmentSchema>;

interface RoleAssignmentDialogProps {
  user: AdminUser;
  onRoleChange?: () => void;
}

/**
 * RoleAssignmentDialog component
 * Dialog for assigning and revoking roles to/from users
 * Includes cascading selectors for company -> store
 */
export function RoleAssignmentDialog({
  user,
  onRoleChange,
}: RoleAssignmentDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const { data: rolesData, isLoading: rolesLoading } = useRoles();
  const { data: companiesData } = useCompanies();
  const assignRoleMutation = useAssignRole();
  const revokeRoleMutation = useRevokeRole();

  // State for cascading selectors
  const [selectedScopeType, setSelectedScopeType] =
    useState<ScopeType>("SYSTEM");

  const form = useForm<RoleAssignmentFormValues>({
    resolver: zodResolver(roleAssignmentSchema),
    defaultValues: {
      role_id: "",
      scope_type: "SYSTEM",
      company_id: "",
      store_id: "",
    },
  });

  // Watch company_id for store fetching
  const watchCompanyId = form.watch("company_id");

  // Fetch stores when a company is selected and scope is STORE
  const { data: storesData } = useStoresByCompany(
    watchCompanyId || undefined,
    { limit: 100 },
    { enabled: !!watchCompanyId && selectedScopeType === "STORE" },
  );

  // Update scope type when role changes
  const watchRoleId = form.watch("role_id");
  useEffect(() => {
    if (watchRoleId && rolesData?.data) {
      const selectedRole = rolesData.data.find(
        (r) => r.role_id === watchRoleId,
      );
      if (selectedRole) {
        setSelectedScopeType(selectedRole.scope as ScopeType);
        form.setValue("scope_type", selectedRole.scope as ScopeType);
        // Reset scope fields when role changes
        form.setValue("company_id", "");
        form.setValue("store_id", "");
      }
    }
  }, [watchRoleId, rolesData, form]);

  // Reset store_id when company changes
  useEffect(() => {
    if (watchCompanyId) {
      form.setValue("store_id", "");
    }
  }, [watchCompanyId, form]);

  async function onSubmit(data: RoleAssignmentFormValues) {
    try {
      await assignRoleMutation.mutateAsync({
        userId: user.user_id,
        roleAssignment: {
          role_id: data.role_id,
          scope_type: data.scope_type,
          company_id: data.company_id || undefined,
          store_id: data.store_id || undefined,
        },
      });

      toast({
        title: "Role assigned",
        description: "Role has been successfully assigned to the user",
      });

      form.reset();
      onRoleChange?.();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error assigning role",
        description:
          error instanceof Error ? error.message : "An unknown error occurred",
      });
    }
  }

  async function handleRevokeRole(userRoleId: string, roleCode: string) {
    try {
      await revokeRoleMutation.mutateAsync({
        userId: user.user_id,
        userRoleId,
      });

      toast({
        title: "Role revoked",
        description: `${roleCode} has been revoked from the user`,
      });

      onRoleChange?.();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error revoking role",
        description:
          error instanceof Error ? error.message : "An unknown error occurred",
      });
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Manage Roles
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage Roles for {user.name}</DialogTitle>
          <DialogDescription>
            Assign or revoke roles for this user. Roles determine what actions
            they can perform.
          </DialogDescription>
        </DialogHeader>

        {/* Current Roles */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Current Roles</h4>
          {user.roles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No roles assigned</p>
          ) : (
            <div className="space-y-2" data-testid="role-list">
              {user.roles.map((role) => (
                <div
                  key={role.user_role_id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="font-medium">{role.role.code}</p>
                    <p className="text-xs text-muted-foreground">
                      {role.role.scope} scope
                      {role.company_name && ` • ${role.company_name}`}
                      {role.store_name && ` • ${role.store_name}`}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      handleRevokeRole(role.user_role_id, role.role.code)
                    }
                    disabled={revokeRoleMutation.isPending}
                    data-testid={`remove-role-button-${role.user_role_id}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                    <span className="sr-only">Remove role</span>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Assign New Role Form */}
        <div className="border-t pt-4">
          <h4 className="mb-4 text-sm font-medium">Assign New Role</h4>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="role_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={rolesLoading}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="role-select">
                          <SelectValue placeholder="Select a role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {rolesData?.data.map((role) => (
                          <SelectItem key={role.role_id} value={role.role_id}>
                            {role.code} ({role.scope})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Scope Type Indicator */}
              {selectedScopeType && (
                <div
                  className="rounded-lg bg-muted p-3"
                  data-testid="scope-type-indicator"
                >
                  <p className="text-sm font-medium">
                    Scope: {selectedScopeType}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedScopeType === "SYSTEM" &&
                      "No additional selection required"}
                    {selectedScopeType === "COMPANY" && "Select a company"}
                    {selectedScopeType === "STORE" &&
                      "Select a company and store"}
                  </p>
                </div>
              )}

              {/* Company Selector (for COMPANY and STORE scopes) */}
              {(selectedScopeType === "COMPANY" ||
                selectedScopeType === "STORE") && (
                <FormField
                  control={form.control}
                  name="company_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="company-select">
                            <SelectValue placeholder="Select a company" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {companiesData?.data?.map((company) => (
                            <SelectItem
                              key={company.company_id}
                              value={company.company_id}
                            >
                              {company.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Store Selector (for STORE scope only) */}
              {selectedScopeType === "STORE" && (
                <FormField
                  control={form.control}
                  name="store_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Store</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={
                          !form.watch("company_id") || !storesData?.data
                        }
                      >
                        <FormControl>
                          <SelectTrigger data-testid="store-select">
                            <SelectValue
                              placeholder={
                                !form.watch("company_id")
                                  ? "Select a company first"
                                  : "Select a store"
                              }
                            />
                          </SelectTrigger>
                        </FormControl>
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
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <DialogFooter>
                <Button
                  type="submit"
                  disabled={assignRoleMutation.isPending}
                  data-testid="assign-role-button"
                >
                  {assignRoleMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Assign Role
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
