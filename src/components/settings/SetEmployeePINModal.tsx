"use client";

/**
 * Set Employee PIN Modal Component
 * Modal for setting or resetting an employee's PIN for terminal/desktop authentication
 *
 * Story: PIN Authentication for STORE_MANAGER and SHIFT_MANAGER roles
 * Required for step-up authentication at terminals/POS systems
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
import { useSetEmployeePIN, type Employee } from "@/lib/api/client-employees";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Hash } from "lucide-react";

/**
 * PIN form schema
 * Requires exactly 4 numeric digits with confirmation
 */
const pinFormSchema = z
  .object({
    pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 numeric digits"),
    confirmPin: z
      .string()
      .regex(/^\d{4}$/, "PIN must be exactly 4 numeric digits"),
  })
  .refine((data) => data.pin === data.confirmPin, {
    message: "PINs do not match",
    path: ["confirmPin"],
  });

type PINFormValues = z.infer<typeof pinFormSchema>;

interface SetEmployeePINModalProps {
  employee: Employee;
  storeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SetEmployeePINModal({
  employee,
  storeId,
  open,
  onOpenChange,
}: SetEmployeePINModalProps) {
  const { toast } = useToast();
  const setPINMutation = useSetEmployeePIN();

  const form = useForm<PINFormValues>({
    resolver: zodResolver(pinFormSchema),
    defaultValues: {
      pin: "",
      confirmPin: "",
    },
  });

  const onSubmit = async (values: PINFormValues) => {
    try {
      await setPINMutation.mutateAsync({
        userId: employee.user_id,
        data: {
          pin: values.pin,
          store_id: storeId,
        },
      });

      toast({
        title: employee.has_pin ? "PIN reset" : "PIN set",
        description: `PIN has been ${employee.has_pin ? "reset" : "set"} successfully for ${employee.name}.`,
      });

      onOpenChange(false);
      form.reset();
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to set PIN";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      form.reset();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hash className="h-5 w-5" />
            {employee.has_pin ? "Reset PIN" : "Set PIN"}
          </DialogTitle>
          <DialogDescription>
            {employee.has_pin
              ? `Set a new 4-digit PIN for ${employee.name}`
              : `Set up a 4-digit PIN for ${employee.name} to enable terminal authentication`}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="pin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>PIN</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={4}
                      placeholder="Enter 4-digit PIN"
                      autoComplete="off"
                      {...field}
                      onChange={(e) => {
                        // Only allow numeric input
                        const value = e.target.value.replace(/\D/g, "");
                        field.onChange(value);
                      }}
                      disabled={setPINMutation.isPending}
                      data-testid="pin-input"
                    />
                  </FormControl>
                  <FormDescription>
                    Enter exactly 4 numeric digits
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm PIN</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={4}
                      placeholder="Confirm 4-digit PIN"
                      autoComplete="off"
                      {...field}
                      onChange={(e) => {
                        // Only allow numeric input
                        const value = e.target.value.replace(/\D/g, "");
                        field.onChange(value);
                      }}
                      disabled={setPINMutation.isPending}
                      data-testid="confirm-pin-input"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={setPINMutation.isPending}
                data-testid="cancel-button"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={setPINMutation.isPending}
                data-testid="save-pin-button"
              >
                {setPINMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : employee.has_pin ? (
                  "Reset PIN"
                ) : (
                  "Set PIN"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
