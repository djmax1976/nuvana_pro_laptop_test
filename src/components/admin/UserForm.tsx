"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateUser, useRoles } from "@/lib/api/admin-users";
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
    },
  });

  // Watch the role_id to determine if company fields should be shown
  const selectedRoleId = form.watch("role_id");
  const selectedRole = rolesData?.data.find(
    (role) => role.role_id === selectedRoleId,
  );
  const isClientOwner = selectedRole?.code === "CLIENT_OWNER";

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

      // Create role assignment based on selected role
      const roleAssignment: AssignRoleRequest = {
        role_id: data.role_id,
        scope_type: roleForSubmit.scope as ScopeType,
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
