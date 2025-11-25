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
import { useUpdateUserStatus } from "@/lib/api/admin-users";
import { AdminUser, UserStatus } from "@/types/admin-user";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * User edit form validation schema
 * Note: Only status can be changed. Email and name cannot be modified after creation.
 */
const editUserSchema = z.object({
  status: z.nativeEnum(UserStatus, {
    message: "Please select a status",
  }),
});

type EditUserFormValues = z.infer<typeof editUserSchema>;

interface EditUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AdminUser | null;
  onSuccess?: () => void;
}

/**
 * EditUserModal component
 * Modal dialog for editing an existing user's status
 * Uses Shadcn/ui Dialog and Form components with Zod validation
 * Note: Only status can be changed - email and name cannot be modified
 */
export function EditUserModal({
  open,
  onOpenChange,
  user,
  onSuccess,
}: EditUserModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showStatusChangeDialog, setShowStatusChangeDialog] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<UserStatus | null>(null);

  const updateMutation = useUpdateUserStatus();

  const form = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      status: UserStatus.ACTIVE,
    },
  });

  // Sync form state when user prop changes
  useEffect(() => {
    if (user && open) {
      form.reset({
        status: user.status || UserStatus.ACTIVE,
      });
    }
  }, [user, open, form]);

  const handleStatusChange = (newStatus: UserStatus) => {
    if (user && user.status !== newStatus) {
      setPendingStatus(newStatus);
      setShowStatusChangeDialog(true);
    } else {
      form.setValue("status", newStatus);
    }
  };

  const confirmStatusChange = () => {
    if (pendingStatus) {
      form.setValue("status", pendingStatus);
    }
    setShowStatusChangeDialog(false);
    setPendingStatus(null);
  };

  const onSubmit = async (values: EditUserFormValues) => {
    if (!user) return;

    setIsSubmitting(true);
    try {
      await updateMutation.mutateAsync({
        userId: user.user_id,
        data: {
          status: values.status,
        },
      });

      toast({
        title: "Success",
        description: "User status updated successfully",
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
            : "Failed to update user status. Please try again.",
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
            <DialogTitle>Edit User Status</DialogTitle>
            <DialogDescription>
              Update user status. Note: Email and name cannot be changed after
              user creation.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-6"
              noValidate
            >
              {/* Display user info (read-only) */}
              {user && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium">Name</label>
                    <div className="mt-2 rounded-md border bg-muted px-3 py-2 text-sm">
                      {user.name}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Email</label>
                    <div className="mt-2 rounded-md border bg-muted px-3 py-2 text-sm">
                      {user.email}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Name and email cannot be changed after creation
                  </p>
                </div>
              )}

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
                        <SelectTrigger data-testid="edit-user-status-select">
                          <SelectValue placeholder="Select a status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ACTIVE">Active</SelectItem>
                        <SelectItem value="INACTIVE">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      The current status of the user
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
                  data-testid="edit-user-cancel-button"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  data-testid="edit-user-submit-button"
                >
                  {isSubmitting ? "Updating..." : "Update Status"}
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
        description={`Are you sure you want to change this user's status to ${pendingStatus}? ${
          pendingStatus === "INACTIVE"
            ? "This will disable their access."
            : "This will enable their access."
        }`}
        confirmText={`Change to ${pendingStatus}`}
        cancelText="Cancel"
        onConfirm={confirmStatusChange}
        destructive={pendingStatus === "INACTIVE"}
      />
    </>
  );
}
