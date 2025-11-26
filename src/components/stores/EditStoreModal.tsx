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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdateStore, type Store } from "@/lib/api/stores";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * IANA timezone validation regex
 * Matches IANA timezone database format (e.g., America/New_York, Europe/London, UTC)
 */
const IANA_TIMEZONE_REGEX =
  /^[A-Z][a-z]+(\/[A-Z][a-zA-Z_]+)+$|^UTC$|^GMT(\+|-)?\d*$/;

/**
 * Store edit form validation schema
 */
const editStoreSchema = z.object({
  name: z
    .string()
    .min(1, "Store name is required")
    .max(255, "Store name must be 255 characters or less"),
  timezone: z
    .string()
    .min(1, "Timezone is required")
    .refine(
      (val) => IANA_TIMEZONE_REGEX.test(val),
      "Timezone must be in IANA format (e.g., America/New_York, Europe/London)",
    ),
  address: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "CLOSED"], {
    message: "Please select a status",
  }),
});

type EditStoreFormValues = z.infer<typeof editStoreSchema>;

interface EditStoreModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  store: Store | null;
  onSuccess?: () => void;
}

/**
 * EditStoreModal component
 * Modal dialog for editing an existing store
 * Uses Shadcn/ui Dialog and Form components with Zod validation
 */
export function EditStoreModal({
  open,
  onOpenChange,
  store,
  onSuccess,
}: EditStoreModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showStatusChangeDialog, setShowStatusChangeDialog] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);

  const updateMutation = useUpdateStore();

  const form = useForm<EditStoreFormValues>({
    resolver: zodResolver(editStoreSchema),
    defaultValues: {
      name: "",
      timezone: "America/New_York",
      address: "",
      status: "ACTIVE",
    },
  });

  // Sync form state when store prop changes
  useEffect(() => {
    if (store && open) {
      form.reset({
        name: store.name || "",
        timezone: store.timezone || "America/New_York",
        address: store.location_json?.address || "",
        status: store.status || "ACTIVE",
      });
    }
  }, [store, open, form]);

  const handleStatusChange = (newStatus: string) => {
    if (store && store.status !== newStatus) {
      setPendingStatus(newStatus);
      setShowStatusChangeDialog(true);
    } else {
      form.setValue("status", newStatus as EditStoreFormValues["status"]);
    }
  };

  const confirmStatusChange = () => {
    if (pendingStatus) {
      form.setValue("status", pendingStatus as EditStoreFormValues["status"]);
    }
    setShowStatusChangeDialog(false);
    setPendingStatus(null);
  };

  const onSubmit = async (values: EditStoreFormValues) => {
    if (!store) return;

    setIsSubmitting(true);
    try {
      const updateData = {
        name: values.name,
        timezone: values.timezone,
        status: values.status,
        // Always include location_json if address is provided (even empty string clears it)
        ...(values.address
          ? { location_json: { address: values.address } }
          : {}),
      };

      await updateMutation.mutateAsync({
        storeId: store.store_id,
        data: updateData,
      });

      toast({
        title: "Success",
        description: "Store updated successfully",
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
            : "Failed to update store. Please try again.",
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
            <DialogTitle>Edit Store</DialogTitle>
            <DialogDescription>
              Update store information including name, timezone, address, and
              status.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-6"
              noValidate
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Store Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter store name"
                        {...field}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormDescription>
                      The name of the store (required, max 255 characters)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Timezone</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="America/New_York"
                        {...field}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormDescription>
                      IANA timezone format (e.g., America/New_York,
                      Europe/London, UTC)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Enter store address"
                        {...field}
                        value={field.value ?? ""}
                        disabled={isSubmitting}
                        rows={3}
                      />
                    </FormControl>
                    <FormDescription>
                      Physical address of the store (optional)
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
                        <SelectTrigger>
                          <SelectValue placeholder="Select a status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ACTIVE">Active</SelectItem>
                        <SelectItem value="INACTIVE">Inactive</SelectItem>
                        <SelectItem value="CLOSED">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      The current status of the store
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
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Updating..." : "Update Store"}
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
        description={`Are you sure you want to change this store's status to ${pendingStatus}?`}
        confirmText={`Change to ${pendingStatus}`}
        cancelText="Cancel"
        onConfirm={confirmStatusChange}
        destructive={pendingStatus === "INACTIVE" || pendingStatus === "CLOSED"}
      />
    </>
  );
}
