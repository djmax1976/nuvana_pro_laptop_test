"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateUser, useRoles, adminUserKeys } from "@/lib/api/admin-users";
import { useCompanies } from "@/lib/api/companies";
import { useStoresByCompany } from "@/lib/api/stores";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
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
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AssignRoleRequest, ScopeType } from "@/types/admin-user";
import { useEffect } from "react";

// Zod validation schema for user creation
const userFormSchema = z
  .object({
    email: z
      .string()
      .min(1, "Email is required")
      .email("Invalid email format")
      .max(255, "Email cannot exceed 255 characters"),
    name: z
      .string()
      .min(1, "Name is required")
      .max(255, "Name cannot exceed 255 characters")
      .refine((val) => val.trim().length > 0, {
        message: "Name cannot be whitespace only",
      }),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(255, "Password cannot exceed 255 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[0-9]/, "Password must contain at least one number")
      .regex(
        /[^A-Za-z0-9]/,
        "Password must contain at least one special character",
      ),
    role_id: z.string().min(1, "Role is required"),
    companyName: z.string().optional(),
    companyAddress: z.string().optional(),
    company_id: z.string().optional(),
    store_id: z.string().optional(),
  })
  .refine(
    (data) => {
      // Will be validated in onSubmit where we have access to the selected role
      return true;
    },
    {
      message: "Company name and address are required for Client Owner role",
      path: ["companyName"],
    },
  );

type UserFormValues = z.infer<typeof userFormSchema>;

/**
 * UserForm component
 * Form for creating new users (System Admin only)
 * Uses Shadcn/ui Form with react-hook-form and Zod validation
 */
export function UserForm() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createUserMutation = useCreateUser();
  const { data: rolesData, isLoading: rolesLoading } = useRoles();

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      email: "",
      name: "",
      password: "",
      role_id: "",
      companyName: "",
      companyAddress: "",
      company_id: "",
      store_id: "",
    },
  });

  // Watch the role_id to determine if company fields should be shown
  const selectedRoleId = form.watch("role_id");
  const selectedRole = rolesData?.data.find(
    (role) => role.role_id === selectedRoleId,
  );
  const isClientOwner = selectedRole?.code === "CLIENT_OWNER";
  const isClientUser = selectedRole?.code === "CLIENT_USER";

  // Fetch companies for CLIENT_USER dropdown
  const { data: companiesData } = useCompanies({
    status: "ACTIVE",
    limit: 100,
  });

  // Watch company_id to fetch stores
  const selectedCompanyId = form.watch("company_id");
  const { data: storesData } = useStoresByCompany(
    selectedCompanyId || undefined,
    { limit: 100 },
    { enabled: !!selectedCompanyId && isClientUser },
  );

  // Reset store_id when company changes
  useEffect(() => {
    form.setValue("store_id", "");
  }, [selectedCompanyId, form]);

  async function onSubmit(data: UserFormValues) {
    try {
      // Find the selected role to get its scope for the role assignment
      const roleForSubmit = rolesData?.data.find(
        (role) => role.role_id === data.role_id,
      );

      if (!roleForSubmit) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Selected role not found",
        });
        return;
      }

      // Validate company fields for CLIENT_OWNER role
      const isClientOwnerRole = roleForSubmit.code === "CLIENT_OWNER";
      if (isClientOwnerRole) {
        if (!data.companyName || data.companyName.trim().length === 0) {
          form.setError("companyName", {
            type: "manual",
            message: "Company name is required for Client Owner role",
          });
          return;
        }
        if (!data.companyAddress || data.companyAddress.trim().length === 0) {
          form.setError("companyAddress", {
            type: "manual",
            message: "Company address is required for Client Owner role",
          });
          return;
        }
      }

      // Validate company and store for CLIENT_USER role
      const isClientUserRole = roleForSubmit.code === "CLIENT_USER";
      if (isClientUserRole) {
        if (!data.company_id || data.company_id.trim().length === 0) {
          form.setError("company_id", {
            type: "manual",
            message: "Company selection is required for Client User role",
          });
          return;
        }
        if (!data.store_id || data.store_id.trim().length === 0) {
          form.setError("store_id", {
            type: "manual",
            message: "Store selection is required for Client User role",
          });
          return;
        }
      }

      // Create role assignment based on selected role
      const roleAssignment: AssignRoleRequest = {
        role_id: data.role_id,
        scope_type: roleForSubmit.scope as ScopeType,
        // Include company_id and store_id for CLIENT_USER
        ...(isClientUserRole && data.company_id && data.store_id
          ? {
              company_id: data.company_id,
              store_id: data.store_id,
            }
          : {}),
      };

      // Build request payload
      const payload: {
        email: string;
        name: string;
        password: string;
        roles: AssignRoleRequest[];
        companyName?: string;
        companyAddress?: string;
      } = {
        email: data.email.trim(),
        name: data.name.trim(),
        password: data.password,
        roles: [roleAssignment],
      };

      // Add company fields if CLIENT_OWNER role
      if (isClientOwnerRole && data.companyName && data.companyAddress) {
        payload.companyName = data.companyName.trim();
        payload.companyAddress = data.companyAddress.trim();
      }

      await createUserMutation.mutateAsync(payload);

      // Invalidate user list cache BEFORE navigating to ensure fresh data
      await queryClient.invalidateQueries({ queryKey: adminUserKeys.lists() });

      toast({
        title: "User created",
        description: isClientOwnerRole
          ? `Successfully created user ${data.name} with company ${data.companyName}`
          : `Successfully created user ${data.name}`,
      });

      // Navigate to user list
      router.push("/admin/users");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error creating user",
        description:
          error instanceof Error ? error.message : "An unknown error occurred",
      });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="user@example.com"
                  data-testid="user-email-input"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                The user&apos;s email address for login
              </FormDescription>
              <FormMessage data-testid="user-form-error" />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="John Doe"
                  data-testid="user-name-input"
                  {...field}
                />
              </FormControl>
              <FormDescription>The user&apos;s display name</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder="********"
                  autoComplete="new-password"
                  data-testid="user-password-input"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Password must be at least 8 characters with uppercase,
                lowercase, number, and special character
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="role_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <Select
                onValueChange={field.onChange}
                defaultValue={field.value}
                disabled={rolesLoading}
              >
                <FormControl>
                  <SelectTrigger data-testid="user-role-select">
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
              <FormDescription>
                Assign an initial role to the user (required)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Company fields - shown only when CLIENT_OWNER role is selected */}
        {isClientOwner && (
          <>
            <div className="rounded-lg border border-border bg-muted/50 p-4">
              <h3 className="mb-4 text-sm font-medium text-foreground">
                Company Information
              </h3>
              <p className="mb-4 text-sm text-muted-foreground">
                A company will be created for this Client Owner user.
              </p>

              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="companyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Acme Corporation"
                          data-testid="company-name-input"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        The name of the company for this Client Owner
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="companyAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Address *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="123 Main St, City, State 12345"
                          data-testid="company-address-input"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        The physical address of the company
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </>
        )}

        {/* Company and Store selection - shown only when CLIENT_USER role is selected */}
        {isClientUser && (
          <>
            <div className="rounded-lg border border-border bg-muted/50 p-4">
              <h3 className="mb-4 text-sm font-medium text-foreground">
                Company and Store Assignment
              </h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Select an existing company and store for this Client User.
              </p>

              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="company_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={!companiesData?.data}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="client-user-company-select">
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
                      <FormDescription>
                        Select the company for this Client User
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="store_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Store *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={!selectedCompanyId || !storesData?.data}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="client-user-store-select">
                            <SelectValue
                              placeholder={
                                !selectedCompanyId
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
                      <FormDescription>
                        Select the store for this Client User (must belong to
                        the selected company)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </>
        )}

        <div className="flex gap-4">
          <Button
            type="submit"
            disabled={createUserMutation.isPending}
            data-testid="user-form-submit"
          >
            {createUserMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Create User
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/admin/users")}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
