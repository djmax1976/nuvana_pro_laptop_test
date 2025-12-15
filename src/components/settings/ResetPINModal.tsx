"use client";

/**
 * Reset PIN Modal Component
 * Modal for resetting a cashier's PIN
 *
 * Story 6.14: Store Settings Page with Employee/Cashier Management
 * AC #8: Modal opens, allows entering new 4-digit PIN, validates format, saves and closes
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
import { useUpdateCashier, type Cashier } from "@/lib/api/cashiers";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

/**
 * PIN reset form schema
 * PIN must be exactly 4 numeric digits
 */
const pinFormSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 numeric digits"),
});

type PINFormValues = z.infer<typeof pinFormSchema>;

interface ResetPINModalProps {
  cashier: Cashier;
  storeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ResetPINModal({
  cashier,
  storeId,
  open,
  onOpenChange,
}: ResetPINModalProps) {
  const { toast } = useToast();
  const updateCashierMutation = useUpdateCashier();

  const form = useForm<PINFormValues>({
    resolver: zodResolver(pinFormSchema),
    defaultValues: {
      pin: "",
    },
  });

  const onSubmit = async (values: PINFormValues) => {
    try {
      await updateCashierMutation.mutateAsync({
        storeId,
        cashierId: cashier.cashier_id,
        data: {
          pin: values.pin,
        },
      });

      toast({
        title: "PIN reset",
        description: `PIN has been reset successfully for ${cashier.name}.`,
      });

      onOpenChange(false);
      form.reset();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to reset PIN",
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
          <DialogTitle>Reset PIN</DialogTitle>
          <DialogDescription>
            Set a new 4-digit PIN for {cashier.name}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="pin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New PIN</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={4}
                      placeholder="0000"
                      {...field}
                      onChange={(e) => {
                        // Only allow numeric input
                        const value = e.target.value.replace(/\D/g, "");
                        field.onChange(value);
                      }}
                      disabled={updateCashierMutation.isPending}
                      data-testid="pin-input"
                    />
                  </FormControl>
                  <FormDescription>
                    Enter a 4-digit numeric PIN (0-9)
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
                disabled={updateCashierMutation.isPending}
                data-testid="cancel-button"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateCashierMutation.isPending}
                data-testid="save-button"
              >
                {updateCashierMutation.isPending ? (
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
