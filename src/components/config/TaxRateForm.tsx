"use client";

/**
 * TaxRateForm Component
 *
 * Form for creating and editing tax rates.
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
  useCreateTaxRate,
  useUpdateTaxRate,
  useTaxRate,
  TaxRate,
  CreateTaxRateInput,
  UpdateTaxRateInput,
  TaxRateType,
  TaxJurisdictionLevel,
  formatTaxRate,
} from "@/lib/api/tax-rates";
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

interface TaxRateFormProps {
  taxRateId?: string;
  mode: "create" | "edit";
}

interface FormData {
  code: string;
  display_name: string;
  description: string;
  rate: string; // Store as string for input handling
  rate_type: TaxRateType;
  jurisdiction_level: TaxJurisdictionLevel;
  jurisdiction_code: string;
  effective_from: string;
  effective_to: string;
  sort_order: number;
  is_compound: boolean;
}

interface FormErrors {
  code?: string;
  display_name?: string;
  description?: string;
  rate?: string;
  jurisdiction_code?: string;
  effective_from?: string;
  effective_to?: string;
  sort_order?: string;
}

const initialFormData: FormData = {
  code: "",
  display_name: "",
  description: "",
  rate: "",
  rate_type: "PERCENTAGE",
  jurisdiction_level: "STATE",
  jurisdiction_code: "",
  effective_from: new Date().toISOString().split("T")[0],
  effective_to: "",
  sort_order: 0,
  is_compound: false,
};

const jurisdictionLevels: { value: TaxJurisdictionLevel; label: string }[] = [
  { value: "FEDERAL", label: "Federal" },
  { value: "STATE", label: "State" },
  { value: "COUNTY", label: "County" },
  { value: "CITY", label: "City" },
  { value: "DISTRICT", label: "District" },
  { value: "COMBINED", label: "Combined" },
];

const rateTypes: { value: TaxRateType; label: string }[] = [
  { value: "PERCENTAGE", label: "Percentage" },
  { value: "FIXED", label: "Fixed Amount" },
];

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
    errors.display_name = "Display name is required";
  } else if (data.display_name.length > 100) {
    errors.display_name = "Display name must be 100 characters or less";
  }

  if (data.description && data.description.length > 500) {
    errors.description = "Description must be 500 characters or less";
  }

  const rateNum = parseFloat(data.rate);
  if (isNaN(rateNum) || data.rate.trim() === "") {
    errors.rate = "Rate is required";
  } else if (data.rate_type === "PERCENTAGE") {
    if (rateNum < 0 || rateNum > 1) {
      errors.rate =
        "Percentage rate must be between 0 and 1 (e.g., 0.0825 for 8.25%)";
    }
  } else {
    if (rateNum < 0) {
      errors.rate = "Fixed rate must be 0 or greater";
    }
  }

  if (!data.effective_from) {
    errors.effective_from = "Effective from date is required";
  }

  if (data.effective_to && data.effective_from) {
    const fromDate = new Date(data.effective_from);
    const toDate = new Date(data.effective_to);
    if (toDate <= fromDate) {
      errors.effective_to =
        "Effective to date must be after effective from date";
    }
  }

  if (data.sort_order < 0 || data.sort_order > 9999) {
    errors.sort_order = "Sort order must be between 0 and 9999";
  }

  return errors;
}

export function TaxRateForm({ taxRateId, mode }: TaxRateFormProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch existing tax rate for edit mode
  const { data: existingTaxRate, isLoading: isLoadingTaxRate } = useTaxRate(
    mode === "edit" ? taxRateId || null : null,
  );

  const createMutation = useCreateTaxRate();
  const updateMutation = useUpdateTaxRate();

  // Populate form with existing data in edit mode
  useEffect(() => {
    if (mode === "edit" && existingTaxRate) {
      setFormData({
        code: existingTaxRate.code,
        display_name: existingTaxRate.display_name,
        description: existingTaxRate.description || "",
        rate: existingTaxRate.rate.toString(),
        rate_type: existingTaxRate.rate_type,
        jurisdiction_level: existingTaxRate.jurisdiction_level,
        jurisdiction_code: existingTaxRate.jurisdiction_code || "",
        effective_from: existingTaxRate.effective_from.split("T")[0],
        effective_to: existingTaxRate.effective_to
          ? existingTaxRate.effective_to.split("T")[0]
          : "",
        sort_order: existingTaxRate.sort_order,
        is_compound: existingTaxRate.is_compound,
      });
    }
  }, [mode, existingTaxRate]);

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

  // Handle select changes
  const handleSelectChange = (name: keyof FormData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
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
        const input: CreateTaxRateInput = {
          code: formData.code.trim(),
          display_name: formData.display_name.trim(),
          description: formData.description.trim() || undefined,
          rate: parseFloat(formData.rate),
          rate_type: formData.rate_type,
          jurisdiction_level: formData.jurisdiction_level,
          jurisdiction_code: formData.jurisdiction_code.trim() || undefined,
          effective_from: formData.effective_from,
          effective_to: formData.effective_to || undefined,
          sort_order: formData.sort_order,
          is_compound: formData.is_compound,
        };

        await createMutation.mutateAsync(input);
        toast({
          title: "Success",
          description: "Tax rate created successfully",
        });
      } else {
        const input: UpdateTaxRateInput = {
          display_name: formData.display_name.trim(),
          description: formData.description.trim() || undefined,
          rate: parseFloat(formData.rate),
          rate_type: formData.rate_type,
          jurisdiction_level: formData.jurisdiction_level,
          jurisdiction_code: formData.jurisdiction_code.trim() || undefined,
          effective_from: formData.effective_from,
          effective_to: formData.effective_to || undefined,
          sort_order: formData.sort_order,
          is_compound: formData.is_compound,
        };

        await updateMutation.mutateAsync({
          id: taxRateId!,
          data: input,
        });
        toast({
          title: "Success",
          description: "Tax rate updated successfully",
        });
      }

      router.push("/client-dashboard/config/tax-rates");
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error
            ? err.message
            : `Failed to ${mode === "create" ? "create" : "update"} tax rate`,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculate preview of rate
  const getRatePreview = () => {
    const rateNum = parseFloat(formData.rate);
    if (isNaN(rateNum)) return "";
    return formatTaxRate(rateNum, formData.rate_type);
  };

  if (mode === "edit" && isLoadingTaxRate) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (mode === "edit" && !existingTaxRate && !isLoadingTaxRate) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p className="text-sm font-medium text-destructive">
          Tax rate not found
        </p>
      </div>
    );
  }

  if (mode === "edit" && existingTaxRate?.is_system) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p className="text-sm font-medium text-destructive">
          System tax rates cannot be edited
        </p>
        <Link
          href="/client-dashboard/config/tax-rates"
          className="mt-2 inline-block text-sm text-muted-foreground hover:underline"
        >
          Back to tax rates
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/client-dashboard/config/tax-rates">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">
            {mode === "create" ? "Create Tax Rate" : "Edit Tax Rate"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === "create"
              ? "Add a new tax rate"
              : `Editing ${existingTaxRate?.display_name}`}
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Tax Rate Details</CardTitle>
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
                  placeholder="e.g., STATE_TAX, LOCAL_TAX"
                  maxLength={20}
                  className={errors.code ? "border-destructive" : ""}
                  data-testid="tax-rate-code-input"
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

            {/* Display Name */}
            <div className="space-y-2">
              <Label htmlFor="display_name">
                Display Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="display_name"
                name="display_name"
                value={formData.display_name}
                onChange={handleChange}
                placeholder="e.g., State Sales Tax"
                maxLength={100}
                className={errors.display_name ? "border-destructive" : ""}
                data-testid="tax-rate-display-name-input"
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
                data-testid="tax-rate-description-input"
              />
              {errors.description && (
                <p className="text-sm text-destructive">{errors.description}</p>
              )}
            </div>

            {/* Rate Type and Rate */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="rate_type">Rate Type</Label>
                <Select
                  value={formData.rate_type}
                  onValueChange={(value) =>
                    handleSelectChange("rate_type", value as TaxRateType)
                  }
                >
                  <SelectTrigger data-testid="tax-rate-type-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {rateTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rate">
                  Rate <span className="text-destructive">*</span>
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="rate"
                    name="rate"
                    type="text"
                    inputMode="decimal"
                    value={formData.rate}
                    onChange={handleChange}
                    placeholder={
                      formData.rate_type === "PERCENTAGE"
                        ? "e.g., 0.0825"
                        : "e.g., 1.50"
                    }
                    className={errors.rate ? "border-destructive" : ""}
                    data-testid="tax-rate-rate-input"
                  />
                  {getRatePreview() && (
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      = {getRatePreview()}
                    </span>
                  )}
                </div>
                {errors.rate && (
                  <p className="text-sm text-destructive">{errors.rate}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {formData.rate_type === "PERCENTAGE"
                    ? "Enter as decimal (0.0825 = 8.25%)"
                    : "Enter fixed dollar amount"}
                </p>
              </div>
            </div>

            {/* Jurisdiction */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="jurisdiction_level">Jurisdiction Level</Label>
                <Select
                  value={formData.jurisdiction_level}
                  onValueChange={(value) =>
                    handleSelectChange(
                      "jurisdiction_level",
                      value as TaxJurisdictionLevel,
                    )
                  }
                >
                  <SelectTrigger data-testid="tax-rate-jurisdiction-level-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {jurisdictionLevels.map((level) => (
                      <SelectItem key={level.value} value={level.value}>
                        {level.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="jurisdiction_code">Jurisdiction Code</Label>
                <Input
                  id="jurisdiction_code"
                  name="jurisdiction_code"
                  value={formData.jurisdiction_code}
                  onChange={handleChange}
                  placeholder="e.g., TX, CA, NYC"
                  maxLength={20}
                  className={
                    errors.jurisdiction_code ? "border-destructive" : ""
                  }
                  data-testid="tax-rate-jurisdiction-code-input"
                />
                {errors.jurisdiction_code && (
                  <p className="text-sm text-destructive">
                    {errors.jurisdiction_code}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Optional state/county/city code
                </p>
              </div>
            </div>

            {/* Effective Dates */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="effective_from">
                  Effective From <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="effective_from"
                  name="effective_from"
                  type="date"
                  value={formData.effective_from}
                  onChange={handleChange}
                  className={errors.effective_from ? "border-destructive" : ""}
                  data-testid="tax-rate-effective-from-input"
                />
                {errors.effective_from && (
                  <p className="text-sm text-destructive">
                    {errors.effective_from}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="effective_to">Effective To</Label>
                <Input
                  id="effective_to"
                  name="effective_to"
                  type="date"
                  value={formData.effective_to}
                  onChange={handleChange}
                  className={errors.effective_to ? "border-destructive" : ""}
                  data-testid="tax-rate-effective-to-input"
                />
                {errors.effective_to && (
                  <p className="text-sm text-destructive">
                    {errors.effective_to}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Leave empty for no end date
                </p>
              </div>
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
                data-testid="tax-rate-sort-order-input"
              />
              {errors.sort_order && (
                <p className="text-sm text-destructive">{errors.sort_order}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Lower numbers appear first in lists
              </p>
            </div>

            {/* Compound Checkbox */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_compound"
                  checked={formData.is_compound}
                  onCheckedChange={(checked) =>
                    handleCheckboxChange("is_compound", !!checked)
                  }
                  data-testid="tax-rate-is-compound-checkbox"
                />
                <Label htmlFor="is_compound" className="font-normal">
                  This is a compound tax
                </Label>
              </div>
              <p className="text-xs text-muted-foreground ml-6">
                Compound taxes are calculated on the subtotal plus other taxes
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-4 pt-4">
              <Button
                type="submit"
                disabled={isSubmitting}
                data-testid="tax-rate-submit-button"
              >
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {mode === "create" ? "Create Tax Rate" : "Save Changes"}
              </Button>
              <Link href="/client-dashboard/config/tax-rates">
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
