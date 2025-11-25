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
import { useUpdateCompany, type Company } from "@/lib/api/companies";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * Company edit form validation schema
 */
const editCompanySchema = z.object({
  name: z
    .string()
    .min(1, "Company name is required")
    .max(255, "Company name must be 255 characters or less"),
  address: z
    .string()
    .max(500, "Address must be 500 characters or less")
    .optional()
    .or(z.literal("")),
  status: z.enum(["ACTIVE", "INACTIVE"], {
    message: "Please select a status",
  }),
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
      address: "",
      status: "ACTIVE",
    },
  });

  // Sync form state when company prop changes
  useEffect(() => {
    if (company && open) {
      form.reset({
        name: company.name || "",
        address: company.address || "",
        status:
          company.status === "ACTIVE" || company.status === "INACTIVE"
            ? company.status
            : "ACTIVE",
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
          address: values.address,
          status: values.status,
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
            <DialogTitle>Edit Company</DialogTitle>
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
                <div>
                  <label className="text-sm font-medium">Owner</label>
                  <div className="mt-2 rounded-md border bg-muted px-3 py-2 text-sm">
                    <div>{company.owner_name || "N/A"}</div>
                    {company.owner_email && (
                      <div className="text-xs text-muted-foreground">
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

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter company address (optional)"
                        {...field}
                        disabled={isSubmitting}
                        data-testid="edit-company-address-input"
                      />
                    </FormControl>
                    <FormDescription>
                      The physical address of the company (optional, max 500
                      characters)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
