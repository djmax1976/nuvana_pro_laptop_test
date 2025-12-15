"use client";

/**
 * Change Email Modal Component
 * Modal for changing an employee's email address
 *
 * Story 6.14: Store Settings Page with Employee/Cashier Management
 * AC #5: Modal opens, allows entering new email, validates format and uniqueness, saves and closes
 */

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Button } from "@/components/ui/button";
import {
  useUpdateEmployeeEmail,
  type Employee,
} from "@/lib/api/client-employees";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

/**
 * Email update form schema
 */
const emailFormSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Invalid email format")
    .max(255, "Email cannot exceed 255 characters"),
});

type EmailFormValues = z.infer<typeof emailFormSchema>;

interface ChangeEmailModalProps {
  employee: Employee;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangeEmailModal({
  employee,
  open,
  onOpenChange,
}: ChangeEmailModalProps) {
  const { toast } = useToast();
  const updateEmailMutation = useUpdateEmployeeEmail();

  const form = useForm<EmailFormValues>({
    resolver: zodResolver(emailFormSchema),
    defaultValues: {
      email: employee.email,
    },
  });

  const onSubmit = async (values: EmailFormValues) => {
    try {
      await updateEmailMutation.mutateAsync({
        userId: employee.user_id,
        email: values.email,
      });

      toast({
        title: "Email updated",
        description: `Employee email has been updated successfully.`,
      });

      onOpenChange(false);
      form.reset();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update email",
        variant: "destructive",
      });
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      form.reset({ email: employee.email });
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change Email</DialogTitle>
          <DialogDescription>
            Update email address for {employee.name}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New Email Address</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="employee@example.com"
                      {...field}
                      disabled={updateEmailMutation.isPending}
                      data-testid="email-input"
                    />
                  </FormControl>
                  <FormDescription>
                    Enter the new email address for this employee
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={updateEmailMutation.isPending}
                data-testid="cancel-button"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateEmailMutation.isPending}
                data-testid="save-button"
              >
                {updateEmailMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
