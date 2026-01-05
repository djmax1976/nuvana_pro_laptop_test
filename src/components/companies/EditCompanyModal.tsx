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
import { useUpdateCompany, type Company } from "@/lib/api/companies";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AddressFields, type AddressFieldsValue } from "@/components/address";

/**
 * UUID validation regex for address field validation
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Company edit form validation schema
 *
 * @enterprise-standards
 * - FE-002: FORM_VALIDATION - Mirrors backend validation
 * - SEC-014: INPUT_VALIDATION - UUID validation for geographic IDs
 */
const editCompanySchema = z.object({
  name: z
    .string()
    .min(1, "Company name is required")
    .max(255, "Company name must be 255 characters or less"),
  status: z.enum(["ACTIVE", "INACTIVE"], {
    message: "Please select a status",
  }),
  // === Structured Address Fields (All Required) ===
  address_line1: z
    .string()
    .min(1, "Street address is required")
    .max(255, "Street address must be 255 characters or less"),
  address_line2: z
    .string()
    .max(255, "Address line 2 must be 255 characters or less")
    .optional(),
  state_id: z
    .string()
    .min(1, "State is required")
    .refine((val) => UUID_REGEX.test(val), "Invalid state selection"),
  county_id: z
    .string()
    .min(1, "County is required")
    .refine((val) => UUID_REGEX.test(val), "Invalid county selection"),
  city: z
    .string()
    .min(1, "City is required")
    .max(100, "City must be 100 characters or less"),
  zip_code: z
    .string()
    .min(1, "ZIP code is required")
    .regex(
      // eslint-disable-next-line security/detect-unsafe-regex -- Safe: Linear regex for ZIP code validation
      /^[0-9]{5}(-[0-9]{4})?$/,
      "ZIP code must be in format 12345 or 12345-6789",
    ),
});

type EditCompanyFormValues = z.infer<typeof editCompanySchema>;

interface EditCompanyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: Company | null;
  onSuccess?: () => void;
}

/**
 * EditCompanyModal component
 * Modal dialog for editing an existing company
 * Uses Shadcn/ui Dialog and Form components with Zod validation
 * Note: owner (user) cannot be changed after company creation
 */
export function EditCompanyModal({
  open,
  onOpenChange,
  company,
  onSuccess,
}: EditCompanyModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showStatusChangeDialog, setShowStatusChangeDialog] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);

  const updateMutation = useUpdateCompany();

  const form = useForm<EditCompanyFormValues>({
    resolver: zodResolver(editCompanySchema),
    defaultValues: {
      name: "",
      status: "ACTIVE",
      // Structured address fields
      address_line1: "",
      address_line2: "",
      state_id: "",
      county_id: "",
      city: "",
      zip_code: "",
    },
  });

  // State for address fields (to work with AddressFields component)
  const [addressData, setAddressData] = useState<Partial<AddressFieldsValue>>({
    address_line1: "",
    address_line2: "",
    state_id: "",
    county_id: "",
    city: "",
    zip_code: "",
  });

  // Sync address data to form when it changes
  useEffect(() => {
    if (addressData.address_line1 !== undefined) {
      form.setValue("address_line1", addressData.address_line1);
    }
    if (addressData.address_line2 !== undefined) {
      form.setValue("address_line2", addressData.address_line2 || "");
    }
    if (addressData.state_id !== undefined) {
      form.setValue("state_id", addressData.state_id);
    }
    if (addressData.county_id !== undefined) {
      form.setValue("county_id", addressData.county_id);
    }
    if (addressData.city !== undefined) {
      form.setValue("city", addressData.city);
    }
    if (addressData.zip_code !== undefined) {
      form.setValue("zip_code", addressData.zip_code);
    }
  }, [addressData, form]);

  // Sync form state when company prop changes
  useEffect(() => {
    if (company && open) {
      form.reset({
        name: company.name || "",
        status:
          company.status === "ACTIVE" || company.status === "INACTIVE"
            ? company.status
            : "ACTIVE",
        // Structured address fields - now part of Company interface
        address_line1: company.address_line1 || "",
        address_line2: company.address_line2 || "",
        state_id: company.state_id || "",
        county_id: company.county_id || "",
        city: company.city || "",
        zip_code: company.zip_code || "",
      });

      // Also update addressData for the AddressFields component
      setAddressData({
        address_line1: company.address_line1 || "",
        address_line2: company.address_line2 || "",
        state_id: company.state_id || "",
        county_id: company.county_id || "",
        city: company.city || "",
        zip_code: company.zip_code || "",
      });
    }
  }, [company, open, form]);

  const handleStatusChange = (newStatus: string) => {
    if (company && company.status !== newStatus) {
      setPendingStatus(newStatus);
      setShowStatusChangeDialog(true);
    } else {
      form.setValue("status", newStatus as EditCompanyFormValues["status"]);
    }
  };

  const confirmStatusChange = () => {
    if (pendingStatus) {
      form.setValue("status", pendingStatus as EditCompanyFormValues["status"]);
    }
    setShowStatusChangeDialog(false);
    setPendingStatus(null);
  };

  const onSubmit = async (values: EditCompanyFormValues) => {
    if (!company) return;

    setIsSubmitting(true);
    try {
      await updateMutation.mutateAsync({
        companyId: company.company_id,
        data: {
          name: values.name,
          status: values.status,
          // Structured address fields (required)
          address_line1: values.address_line1,
          address_line2: values.address_line2 || null,
          city: values.city,
          state_id: values.state_id,
          county_id: values.county_id,
          zip_code: values.zip_code,
        },
      });

      toast({
        title: "Success",
        description: "Company updated successfully",
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
            : "Failed to update company. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
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

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle data-testid="edit-company-modal-title">
              Edit Company
            </DialogTitle>
            <DialogDescription>
              Update company information. The owner assignment cannot be changed
              after creation.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-6"
              noValidate
            >
              {/* Display owner name (read-only) */}
              {company && (
                <div data-testid="edit-company-owner-info">
                  <label className="text-sm font-medium">Owner</label>
                  <div className="mt-2 rounded-md border bg-muted px-3 py-2 text-sm">
                    <div data-testid="edit-company-owner-name">
                      {company.owner_name || "N/A"}
                    </div>
                    {company.owner_email && (
                      <div
                        className="text-xs text-muted-foreground"
                        data-testid="edit-company-owner-email"
                      >
                        {company.owner_email}
                      </div>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Owner assignment cannot be changed
                  </p>
                </div>
              )}

              {/* Display company name (read-only) */}
              {company && (
                <div>
                  <label className="text-sm font-medium">Company Name</label>
                  <div className="mt-2 rounded-md border bg-muted px-3 py-2 text-sm">
                    {company.name}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Company name cannot be changed
                  </p>
                </div>
              )}

              {/* Address Fields Section - Cascading Dropdowns */}
              <div className="border rounded-lg p-4">
                <AddressFields
                  value={addressData}
                  onChange={setAddressData}
                  required={true}
                  disabled={isSubmitting}
                  errors={{
                    address_line1: form.formState.errors.address_line1?.message,
                    state_id: form.formState.errors.state_id?.message,
                    county_id: form.formState.errors.county_id?.message,
                    city: form.formState.errors.city?.message,
                    zip_code: form.formState.errors.zip_code?.message,
                  }}
                  testIdPrefix="company-address"
                  sectionLabel="Headquarters Location"
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
                        <SelectTrigger data-testid="edit-company-status-select">
                          <SelectValue placeholder="Select a status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ACTIVE">Active</SelectItem>
                        <SelectItem value="INACTIVE">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      The current status of the company
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-4 justify-end pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancel}
                  disabled={isSubmitting}
                  data-testid="edit-company-cancel-button"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  data-testid="edit-company-submit-button"
                >
                  {isSubmitting ? "Updating..." : "Update Company"}
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
        description={`Are you sure you want to change this company's status to ${pendingStatus}?`}
        confirmText={`Change to ${pendingStatus}`}
        cancelText="Cancel"
        onConfirm={confirmStatusChange}
        destructive={
          pendingStatus === "INACTIVE" || pendingStatus === "SUSPENDED"
        }
      />
    </>
  );
}
