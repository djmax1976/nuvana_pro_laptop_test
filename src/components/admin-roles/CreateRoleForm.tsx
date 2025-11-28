"use client";

/**
 * Create Role Form Component
 * Form for Super Admins to create new roles
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateRole, useAllPermissions } from "@/lib/api/admin-roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Shield, AlertCircle } from "lucide-react";
import Link from "next/link";

// Validation schema
const createRoleSchema = z.object({
  code: z
    .string()
    .min(2, "Role code must be at least 2 characters")
    .max(100, "Role code must be at most 100 characters")
    .regex(
      /^[A-Z][A-Z0-9_]*$/,
      "Role code must be uppercase, start with a letter, and contain only letters, numbers, and underscores",
    ),
  scope: z.enum(["SYSTEM", "COMPANY", "STORE"], {
    message: "Please select a scope",
  }),
  description: z.string().max(500).optional(),
  permissions: z.array(z.string()).optional(),
});

type CreateRoleFormData = z.infer<typeof createRoleSchema>;

// Permission categories
const PERMISSION_CATEGORIES: Record<
  string,
  { name: string; prefixes: string[] }
> = {
  USER: { name: "User Management", prefixes: ["USER_"] },
  COMPANY: { name: "Company Management", prefixes: ["COMPANY_"] },
  STORE: { name: "Store Management", prefixes: ["STORE_"] },
  SHIFT: { name: "Shift Operations", prefixes: ["SHIFT_"] },
  TRANSACTION: { name: "Transactions", prefixes: ["TRANSACTION_"] },
  INVENTORY: { name: "Inventory", prefixes: ["INVENTORY_"] },
  LOTTERY: { name: "Lottery", prefixes: ["LOTTERY_"] },
  REPORT: { name: "Reports", prefixes: ["REPORT_"] },
  ADMIN: { name: "Administration", prefixes: ["ADMIN_"] },
  CLIENT: { name: "Client Dashboard", prefixes: ["CLIENT_"] },
};

function getPermissionCategory(permissionCode: string): string {
  for (const [category, config] of Object.entries(PERMISSION_CATEGORIES)) {
    if (config.prefixes.some((prefix) => permissionCode.startsWith(prefix))) {
      return category;
    }
  }
  return "OTHER";
}

export function CreateRoleForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(
    new Set(),
  );

  const createMutation = useCreateRole();
  const { data: allPermissions, isLoading: permissionsLoading } =
    useAllPermissions();

  const form = useForm<CreateRoleFormData>({
    resolver: zodResolver(createRoleSchema),
    defaultValues: {
      code: "",
      scope: undefined,
      description: "",
      permissions: [],
    },
  });

  // Group permissions by category
  const groupedPermissions = allPermissions
    ? allPermissions.reduce(
        (acc, perm) => {
          const category = getPermissionCategory(perm.code);
          if (!acc[category]) acc[category] = [];
          acc[category].push(perm);
          return acc;
        },
        {} as Record<string, typeof allPermissions>,
      )
    : {};

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
  };

  // Handle form submission
  const onSubmit = async (data: CreateRoleFormData) => {
    try {
      const result = await createMutation.mutateAsync({
        ...data,
        permissions: Array.from(selectedPermissions),
      });
      toast({
        title: "Role Created",
        description: `Role "${data.code}" has been created successfully.`,
      });
      router.push(`/admin/roles/${result.data.role_id}`);
    } catch (err) {
      toast({
        title: "Creation Failed",
        description:
          err instanceof Error ? err.message : "Failed to create role",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6" data-testid="create-role-form">
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
            <Shield className="h-6 w-6" />
            Create New Role
          </h1>
          <p className="text-muted-foreground">
            Define a new role with permissions
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Basic Info Card */}
          <Card>
            <CardHeader>
              <CardTitle>Role Details</CardTitle>
              <CardDescription>
                Basic information about the role
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role Code *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="CUSTOM_ROLE"
                        className="font-mono uppercase"
                        onChange={(e) =>
                          field.onChange(e.target.value.toUpperCase())
                        }
                        data-testid="role-code-input"
                      />
                    </FormControl>
                    <FormDescription>
                      Unique identifier for the role. Must be uppercase with
                      underscores only.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="scope"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scope *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="scope-select">
                          <SelectValue placeholder="Select scope" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="SYSTEM">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-red-100 text-red-800">
                              System
                            </Badge>
                            <span className="text-muted-foreground text-xs">
                              Global access
                            </span>
                          </div>
                        </SelectItem>
                        <SelectItem value="COMPANY">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-blue-100 text-blue-800">
                              Company
                            </Badge>
                            <span className="text-muted-foreground text-xs">
                              Company-level access
                            </span>
                          </div>
                        </SelectItem>
                        <SelectItem value="STORE">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-green-100 text-green-800">
                              Store
                            </Badge>
                            <span className="text-muted-foreground text-xs">
                              Store-level access
                            </span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Determines the access level for users with this role
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Describe the purpose of this role..."
                        rows={3}
                        data-testid="role-description-input"
                      />
                    </FormControl>
                    <FormDescription>
                      Optional description of the role&apos;s purpose
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Permissions Card */}
          <Card>
            <CardHeader>
              <CardTitle>Permissions</CardTitle>
              <CardDescription>
                Select the permissions for this role. You can also configure
                these later.
              </CardDescription>
              <div className="text-sm text-muted-foreground">
                Selected: <strong>{selectedPermissions.size}</strong> /{" "}
                {allPermissions?.length || 0} permissions
              </div>
            </CardHeader>
            <CardContent>
              {permissionsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="h-5 w-32" />
                      <div className="grid grid-cols-2 gap-2">
                        {[1, 2, 3, 4].map((j) => (
                          <Skeleton key={j} className="h-6 w-full" />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid gap-6 md:grid-cols-2">
                  {Object.entries(PERMISSION_CATEGORIES).map(
                    ([category, config]) => {
                      const categoryPerms = groupedPermissions[category];
                      if (!categoryPerms || categoryPerms.length === 0)
                        return null;

                      return (
                        <div key={category} className="space-y-2">
                          <h4 className="font-medium text-sm">{config.name}</h4>
                          <div className="space-y-1">
                            {categoryPerms.map((perm) => (
                              <div
                                key={perm.permission_id}
                                className="flex items-center gap-2"
                              >
                                <Checkbox
                                  id={`perm-${perm.permission_id}`}
                                  checked={selectedPermissions.has(
                                    perm.permission_id,
                                  )}
                                  onCheckedChange={() =>
                                    togglePermission(perm.permission_id)
                                  }
                                />
                                <label
                                  htmlFor={`perm-${perm.permission_id}`}
                                  className="text-sm cursor-pointer"
                                >
                                  {perm.code.replace(/_/g, " ")}
                                </label>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    },
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex items-center justify-end gap-4">
            <Link href="/admin/roles">
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Link>
            <Button
              type="submit"
              disabled={createMutation.isPending}
              data-testid="create-role-submit"
            >
              <Save className="h-4 w-4 mr-2" />
              {createMutation.isPending ? "Creating..." : "Create Role"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
