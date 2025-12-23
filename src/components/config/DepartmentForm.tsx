"use client";

/**
 * DepartmentForm Component
 *
 * Form for creating and editing departments (product categories).
 *
 * Phase 6.2: Shift & Day Summary Implementation Plan
 *
 * Enterprise coding standards applied:
 * - FE-002: Form validation mirroring backend
 * - SEC-014: Input validation with strict schemas
 * - FE-007: CSRF tokens in form submissions (handled by API client)
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  useCreateDepartment,
  useUpdateDepartment,
  useDepartment,
  useDepartments,
  Department,
  CreateDepartmentInput,
  UpdateDepartmentInput,
} from "@/lib/api/departments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

interface DepartmentFormProps {
  departmentId?: string;
  mode: "create" | "edit";
}

interface FormData {
  code: string;
  name: string;
  description: string;
  parent_id: string | null;
  is_lottery: boolean;
  display_order: number;
}

interface FormErrors {
  code?: string;
  name?: string;
  description?: string;
  parent_id?: string;
  display_order?: string;
}

const initialFormData: FormData = {
  code: "",
  name: "",
  description: "",
  parent_id: null,
  is_lottery: false,
  display_order: 0,
};

/**
 * Validate form data
 */
function validateForm(data: FormData, mode: "create" | "edit"): FormErrors {
  const errors: FormErrors = {};

  if (mode === "create") {
    if (!data.code.trim()) {
      errors.code = "Code is required";
    } else if (!/^[A-Z0-9_]{2,20}$/.test(data.code.toUpperCase())) {
      errors.code =
        "Code must be 2-20 uppercase letters, numbers, or underscores";
    }
  }

  if (!data.name.trim()) {
    errors.name = "Name is required";
  } else if (data.name.length > 100) {
    errors.name = "Name must be 100 characters or less";
  }

  if (data.description && data.description.length > 500) {
    errors.description = "Description must be 500 characters or less";
  }

  if (data.display_order < 0 || data.display_order > 9999) {
    errors.display_order = "Display order must be between 0 and 9999";
  }

  return errors;
}

export function DepartmentForm({ departmentId, mode }: DepartmentFormProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch existing department for edit mode
  const { data: existingDepartment, isLoading: isLoadingDepartment } =
    useDepartment(mode === "edit" ? departmentId || null : null);

  // Fetch all departments for parent selection
  const { data: allDepartments } = useDepartments({
    include_inactive: false,
    include_system: true,
  });

  const createMutation = useCreateDepartment();
  const updateMutation = useUpdateDepartment();

  // Filter out current department and its children for parent selection
  const availableParents = allDepartments?.filter((d) => {
    if (mode === "edit" && departmentId) {
      // Can't be its own parent
      if (d.department_id === departmentId) return false;
      // Can't have child as parent (would create circular reference)
      if (d.parent_id === departmentId) return false;
    }
    return true;
  });

  // Populate form with existing data in edit mode
  useEffect(() => {
    if (mode === "edit" && existingDepartment) {
      setFormData({
        code: existingDepartment.code,
        name: existingDepartment.name,
        description: existingDepartment.description || "",
        parent_id: existingDepartment.parent_id,
        is_lottery: existingDepartment.is_lottery,
        display_order: existingDepartment.display_order,
      });
    }
  }, [mode, existingDepartment]);

  // Handle form field changes
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value, type } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]:
        type === "number"
          ? parseInt(value, 10) || 0
          : name === "code"
            ? value.toUpperCase()
            : value,
    }));

    // Clear error when field is modified
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  // Handle checkbox changes
  const handleCheckboxChange = (name: keyof FormData, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      [name]: checked,
    }));
  };

  // Handle parent selection
  const handleParentChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      parent_id: value === "none" ? null : value,
    }));
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form
    const validationErrors = validateForm(formData, mode);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === "create") {
        const input: CreateDepartmentInput = {
          code: formData.code.trim(),
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          parent_id: formData.parent_id || undefined,
          is_lottery: formData.is_lottery,
          display_order: formData.display_order,
        };

        await createMutation.mutateAsync(input);
        toast({
          title: "Success",
          description: "Department created successfully",
        });
      } else {
        const input: UpdateDepartmentInput = {
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          parent_id: formData.parent_id,
          is_lottery: formData.is_lottery,
          display_order: formData.display_order,
        };

        await updateMutation.mutateAsync({
          id: departmentId!,
          data: input,
        });
        toast({
          title: "Success",
          description: "Department updated successfully",
        });
      }

      router.push("/client-dashboard/config/departments");
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error
            ? err.message
            : `Failed to ${mode === "create" ? "create" : "update"} department`,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (mode === "edit" && isLoadingDepartment) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (mode === "edit" && !existingDepartment && !isLoadingDepartment) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p className="text-sm font-medium text-destructive">
          Department not found
        </p>
      </div>
    );
  }

  if (mode === "edit" && existingDepartment?.is_system) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p className="text-sm font-medium text-destructive">
          System departments cannot be edited
        </p>
        <Link
          href="/client-dashboard/config/departments"
          className="mt-2 inline-block text-sm text-muted-foreground hover:underline"
        >
          Back to departments
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/client-dashboard/config/departments">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">
            {mode === "create" ? "Create Department" : "Edit Department"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === "create"
              ? "Add a new product category"
              : `Editing ${existingDepartment?.name}`}
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Department Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Code (only for create) */}
            {mode === "create" && (
              <div className="space-y-2">
                <Label htmlFor="code">
                  Code <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="code"
                  name="code"
                  value={formData.code}
                  onChange={handleChange}
                  placeholder="e.g., GROCERY, DAIRY, LOTTERY"
                  maxLength={20}
                  className={errors.code ? "border-destructive" : ""}
                  data-testid="department-code-input"
                />
                {errors.code && (
                  <p className="text-sm text-destructive">{errors.code}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Unique identifier (uppercase, 2-20 characters). Cannot be
                  changed after creation.
                </p>
              </div>
            )}

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g., Grocery Items"
                maxLength={100}
                className={errors.name ? "border-destructive" : ""}
                data-testid="department-name-input"
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Optional description..."
                maxLength={500}
                rows={3}
                className={errors.description ? "border-destructive" : ""}
                data-testid="department-description-input"
              />
              {errors.description && (
                <p className="text-sm text-destructive">{errors.description}</p>
              )}
            </div>

            {/* Parent Department */}
            <div className="space-y-2">
              <Label htmlFor="parent_id">Parent Department</Label>
              <Select
                value={formData.parent_id || "none"}
                onValueChange={handleParentChange}
              >
                <SelectTrigger
                  id="parent_id"
                  data-testid="department-parent-select"
                >
                  <SelectValue placeholder="Select parent department..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Parent (Top Level)</SelectItem>
                  {availableParents?.map((dept) => (
                    <SelectItem
                      key={dept.department_id}
                      value={dept.department_id}
                    >
                      {dept.name} ({dept.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Optionally nest this department under another
              </p>
            </div>

            {/* Display Order */}
            <div className="space-y-2">
              <Label htmlFor="display_order">Display Order</Label>
              <Input
                id="display_order"
                name="display_order"
                type="number"
                value={formData.display_order}
                onChange={handleChange}
                min={0}
                max={9999}
                className={
                  errors.display_order ? "border-destructive w-32" : "w-32"
                }
                data-testid="department-display-order-input"
              />
              {errors.display_order && (
                <p className="text-sm text-destructive">
                  {errors.display_order}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Lower numbers appear first in lists
              </p>
            </div>

            {/* Checkboxes */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_lottery"
                  checked={formData.is_lottery}
                  onCheckedChange={(checked) =>
                    handleCheckboxChange("is_lottery", !!checked)
                  }
                  data-testid="department-is-lottery-checkbox"
                />
                <Label htmlFor="is_lottery" className="font-normal">
                  This is a lottery department
                </Label>
              </div>
              <p className="text-xs text-muted-foreground ml-6">
                Lottery departments have special tracking and reconciliation
                requirements
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-4 pt-4">
              <Button
                type="submit"
                disabled={isSubmitting}
                data-testid="department-submit-button"
              >
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {mode === "create" ? "Create Department" : "Save Changes"}
              </Button>
              <Link href="/client-dashboard/config/departments">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
