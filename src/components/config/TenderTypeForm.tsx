"use client";

/**
 * TenderTypeForm Component
 *
 * Form for creating and editing tender types (payment methods).
 *
 * Phase 6.1: Shift & Day Summary Implementation Plan
 *
 * Enterprise coding standards applied:
 * - FE-002: Form validation mirroring backend
 * - SEC-014: Input validation with strict schemas
 * - FE-007: CSRF tokens in form submissions (handled by API client)
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  useCreateTenderType,
  useUpdateTenderType,
  useTenderType,
  TenderType,
  CreateTenderTypeInput,
  UpdateTenderTypeInput,
} from "@/lib/api/tender-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

interface TenderTypeFormProps {
  tenderTypeId?: string;
  mode: "create" | "edit";
}

interface FormData {
  code: string;
  display_name: string;
  description: string;
  is_cash_equivalent: boolean;
  requires_reference: boolean;
  sort_order: number;
}

interface FormErrors {
  code?: string;
  display_name?: string;
  description?: string;
  sort_order?: string;
}

const initialFormData: FormData = {
  code: "",
  display_name: "",
  description: "",
  is_cash_equivalent: false,
  requires_reference: false,
  sort_order: 0,
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

  if (!data.display_name.trim()) {
    errors.display_name = "Name is required";
  } else if (data.display_name.length > 100) {
    errors.display_name = "Name must be 100 characters or less";
  }

  if (data.description && data.description.length > 500) {
    errors.description = "Description must be 500 characters or less";
  }

  if (data.sort_order < 0 || data.sort_order > 9999) {
    errors.sort_order = "Sort order must be between 0 and 9999";
  }

  return errors;
}

export function TenderTypeForm({ tenderTypeId, mode }: TenderTypeFormProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch existing tender type for edit mode
  const { data: existingTenderType, isLoading: isLoadingTenderType } =
    useTenderType(mode === "edit" ? tenderTypeId || null : null);

  const createMutation = useCreateTenderType();
  const updateMutation = useUpdateTenderType();

  // Populate form with existing data in edit mode
  useEffect(() => {
    if (mode === "edit" && existingTenderType) {
      setFormData({
        code: existingTenderType.code,
        display_name: existingTenderType.display_name,
        description: existingTenderType.description || "",
        is_cash_equivalent: existingTenderType.is_cash_equivalent,
        requires_reference: existingTenderType.requires_reference,
        sort_order: existingTenderType.sort_order,
      });
    }
  }, [mode, existingTenderType]);

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
        const input: CreateTenderTypeInput = {
          code: formData.code.trim(),
          display_name: formData.display_name.trim(),
          description: formData.description.trim() || undefined,
          is_cash_equivalent: formData.is_cash_equivalent,
          requires_reference: formData.requires_reference,
          sort_order: formData.sort_order,
        };

        await createMutation.mutateAsync(input);
        toast({
          title: "Success",
          description: "Tender type created successfully",
        });
      } else {
        const input: UpdateTenderTypeInput = {
          display_name: formData.display_name.trim(),
          description: formData.description.trim() || undefined,
          is_cash_equivalent: formData.is_cash_equivalent,
          requires_reference: formData.requires_reference,
          sort_order: formData.sort_order,
        };

        await updateMutation.mutateAsync({
          id: tenderTypeId!,
          data: input,
        });
        toast({
          title: "Success",
          description: "Tender type updated successfully",
        });
      }

      router.push("/client-dashboard/config/tender-types");
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error
            ? err.message
            : `Failed to ${mode === "create" ? "create" : "update"} tender type`,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (mode === "edit" && isLoadingTenderType) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (mode === "edit" && !existingTenderType && !isLoadingTenderType) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p className="text-sm font-medium text-destructive">
          Tender type not found
        </p>
      </div>
    );
  }

  if (mode === "edit" && existingTenderType?.is_system) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p className="text-sm font-medium text-destructive">
          System tender types cannot be edited
        </p>
        <Link
          href="/client-dashboard/config/tender-types"
          className="mt-2 inline-block text-sm text-muted-foreground hover:underline"
        >
          Back to tender types
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/client-dashboard/config/tender-types">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">
            {mode === "create" ? "Create Tender Type" : "Edit Tender Type"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === "create"
              ? "Add a new payment method"
              : `Editing ${existingTenderType?.display_name}`}
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Tender Type Details</CardTitle>
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
                  placeholder="e.g., VISA, MASTER, CHECK"
                  maxLength={20}
                  className={errors.code ? "border-destructive" : ""}
                  data-testid="tender-type-code-input"
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
              <Label htmlFor="display_name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="display_name"
                name="display_name"
                value={formData.display_name}
                onChange={handleChange}
                placeholder="e.g., Visa Credit Card"
                maxLength={100}
                className={errors.display_name ? "border-destructive" : ""}
                data-testid="tender-type-name-input"
              />
              {errors.display_name && (
                <p className="text-sm text-destructive">
                  {errors.display_name}
                </p>
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
                data-testid="tender-type-description-input"
              />
              {errors.description && (
                <p className="text-sm text-destructive">{errors.description}</p>
              )}
            </div>

            {/* Sort Order */}
            <div className="space-y-2">
              <Label htmlFor="sort_order">Sort Order</Label>
              <Input
                id="sort_order"
                name="sort_order"
                type="number"
                value={formData.sort_order}
                onChange={handleChange}
                min={0}
                max={9999}
                className={
                  errors.sort_order ? "border-destructive w-32" : "w-32"
                }
                data-testid="tender-type-sort-order-input"
              />
              {errors.sort_order && (
                <p className="text-sm text-destructive">{errors.sort_order}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Lower numbers appear first in lists
              </p>
            </div>

            {/* Checkboxes */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_cash_equivalent"
                  checked={formData.is_cash_equivalent}
                  onCheckedChange={(checked) =>
                    handleCheckboxChange("is_cash_equivalent", !!checked)
                  }
                  data-testid="tender-type-is-cash-checkbox"
                />
                <Label htmlFor="is_cash_equivalent" className="font-normal">
                  This is a cash equivalent payment method
                </Label>
              </div>
              <p className="text-xs text-muted-foreground ml-6">
                Cash equivalent payments are tracked separately for drawer
                reconciliation
              </p>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="requires_reference"
                  checked={formData.requires_reference}
                  onCheckedChange={(checked) =>
                    handleCheckboxChange("requires_reference", !!checked)
                  }
                  data-testid="tender-type-requires-reference-checkbox"
                />
                <Label htmlFor="requires_reference" className="font-normal">
                  Requires reference number
                </Label>
              </div>
              <p className="text-xs text-muted-foreground ml-6">
                Transactions with this tender will require a reference (e.g.,
                check number)
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-4 pt-4">
              <Button
                type="submit"
                disabled={isSubmitting}
                data-testid="tender-type-submit-button"
              >
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {mode === "create" ? "Create Tender Type" : "Save Changes"}
              </Button>
              <Link href="/client-dashboard/config/tender-types">
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
