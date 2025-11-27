"use client";

/**
 * Employee Form Component
 * Form for creating new employees with store and role selection
 * Only STORE scope roles are available for client employee creation
 *
 * Story: 2.91 - Client Employee Management
 */

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateEmployee, useStoreRoles } from "@/lib/api/client-employees";
import { useClientDashboard } from "@/lib/api/client-dashboard";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Loader2 } from "lucide-react";

/**
 * Zod schema for employee creation form
 */
const employeeFormSchema = z.object({
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
  store_id: z.string().min(1, "Store is required"),
  role_id: z.string().min(1, "Role is required"),
});

type EmployeeFormValues = z.infer<typeof employeeFormSchema>;

interface EmployeeFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function EmployeeForm({ onSuccess, onCancel }: EmployeeFormProps) {
  const { toast } = useToast();

  // Fetch stores from dashboard
  const { data: dashboardData, isLoading: isLoadingStores } =
    useClientDashboard();

  // Fetch STORE scope roles
  const { data: rolesData, isLoading: isLoadingRoles } = useStoreRoles();

  // Create employee mutation
  const createEmployeeMutation = useCreateEmployee();

  // Form setup
  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: {
      email: "",
      name: "",
      store_id: "",
      role_id: "",
    },
  });

  // Get stores and roles
  const stores = dashboardData?.stores || [];
  const roles = rolesData?.data || [];

  // Handle form submission
  async function onSubmit(data: EmployeeFormValues) {
    try {
      await createEmployeeMutation.mutateAsync(data);
      toast({
        title: "Employee created",
        description: `${data.name} has been added successfully.`,
      });
      onSuccess();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to create employee",
      });
    }
  }

  const isLoading = isLoadingStores || isLoadingRoles;
  const isSubmitting = createEmployeeMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Email Field */}
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="employee@example.com"
                  disabled={isSubmitting}
                  data-testid="employee-email"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                The employee will use this email to log in
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Name Field */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="John Doe"
                  disabled={isSubmitting}
                  data-testid="employee-name"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Store Selection */}
        <FormField
          control={form.control}
          name="store_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Store</FormLabel>
              <Select
                onValueChange={field.onChange}
                defaultValue={field.value}
                disabled={isLoading || isSubmitting}
              >
                <FormControl>
                  <SelectTrigger data-testid="employee-store">
                    <SelectValue placeholder="Select a store" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {stores.map((store) => (
                    <SelectItem key={store.store_id} value={store.store_id}>
                      {store.name}
                      {store.company_name && (
                        <span className="text-muted-foreground ml-2">
                          ({store.company_name})
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                The store where this employee will work
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Role Selection */}
        <FormField
          control={form.control}
          name="role_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <Select
                onValueChange={field.onChange}
                defaultValue={field.value}
                disabled={isLoading || isSubmitting}
              >
                <FormControl>
                  <SelectTrigger data-testid="employee-role">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.role_id} value={role.role_id}>
                      {role.code}
                      {role.description && (
                        <span className="text-muted-foreground ml-2">
                          - {role.description}
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                Only store-level roles can be assigned to employees
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Form Actions */}
        <div className="flex justify-end gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isLoading || isSubmitting}
            data-testid="submit-employee"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? "Creating..." : "Create Employee"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default EmployeeForm;
