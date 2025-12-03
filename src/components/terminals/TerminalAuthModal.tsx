"use client";

/**
 * Terminal Authentication Modal Component
 * Dialog form for cashier authentication when selecting a terminal
 *
 * Story: 4.9 - MyStore Terminal Dashboard
 *
 * @requirements
 * - AC #3: Modal with cashier authentication form
 * - Cashier Name dropdown with static placeholders
 * - PIN Number masked input field
 * - Cancel and Submit buttons
 * - Form validation (cashier name required, PIN required)
 */

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useCashiers, useAuthenticateCashier } from "@/lib/api/cashiers";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Form validation schema for terminal authentication
 * Validates cashier name (required) and PIN number (required, exactly 4 numeric digits)
 *
 * MCP Guidance Applied:
 * - FORM_VALIDATION: Mirror backend validation client-side, sanitize all user input
 * - INPUT_VALIDATION: Define strict schemas with length, type, and format constraints
 */
const terminalAuthFormSchema = z.object({
  cashier_name: z
    .string({ message: "Cashier name is required" })
    .min(1, { message: "Cashier name is required" }),
  pin_number: z
    .string({ message: "PIN number is required" })
    .min(1, { message: "PIN number is required" })
    .regex(/^\d{4}$/, { message: "PIN must be exactly 4 numeric digits" }),
});

type TerminalAuthFormValues = z.infer<typeof terminalAuthFormSchema>;

interface TerminalAuthModalProps {
  terminalId: string;
  terminalName: string;
  storeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit?: (values: TerminalAuthFormValues) => void | Promise<void>;
}

/**
 * TerminalAuthModal component
 * Dialog form for cashier authentication when selecting a terminal
 * Uses React Hook Form with Zod validation
 *
 * MCP Guidance Applied:
 * - FORM_VALIDATION: Display validation errors clearly, disable submission until fields pass checks
 * - INPUT_VALIDATION: Apply length, type, and format constraints at the boundary
 * - XSS: React automatically escapes output, no manual sanitization needed for text inputs
 */
export function TerminalAuthModal({
  terminalId: _terminalId,
  terminalName,
  storeId,
  open,
  onOpenChange,
  onSubmit,
}: TerminalAuthModalProps) {
  const form = useForm<TerminalAuthFormValues>({
    resolver: zodResolver(terminalAuthFormSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    shouldFocusError: true,
    defaultValues: {
      cashier_name: "",
      pin_number: "",
    },
  });

  // Fetch cashiers for the store
  const {
    data: cashiers = [],
    isLoading: isLoadingCashiers,
    error: cashiersError,
  } = useCashiers(storeId, { is_active: true }, { enabled: open });

  // Authenticate cashier mutation
  const authenticateMutation = useAuthenticateCashier();

  const isSubmitting =
    form.formState.isSubmitting || authenticateMutation.isPending;

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      form.reset({
        cashier_name: "",
        pin_number: "",
      });
      authenticateMutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSubmit = async (values: TerminalAuthFormValues) => {
    if (onSubmit) {
      await onSubmit(values);
      return;
    }

    try {
      // Authenticate cashier
      await authenticateMutation.mutateAsync({
        storeId,
        identifier: { name: values.cashier_name },
        pin: values.pin_number,
      });

      // Success - close modal
      onOpenChange(false);
    } catch (error) {
      // Error is handled by mutation state
      console.error("Authentication failed:", error);
    }
  };

  const handleCancel = () => {
    form.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[425px]"
        data-testid="terminal-auth-modal"
      >
        <DialogHeader>
          <DialogTitle>Terminal Authentication</DialogTitle>
          <DialogDescription>
            Authenticate to access terminal: {terminalName}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
          >
            {cashiersError && (
              <Alert variant="destructive">
                <AlertDescription>
                  Failed to load cashiers. Please try again.
                </AlertDescription>
              </Alert>
            )}

            {authenticateMutation.isError && (
              <Alert variant="destructive">
                <AlertDescription>
                  {authenticateMutation.error instanceof Error
                    ? authenticateMutation.error.message
                    : "Authentication failed. Please check your credentials."}
                </AlertDescription>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="cashier_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cashier Name</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={isSubmitting || isLoadingCashiers}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="cashier-name-select">
                        <SelectValue
                          placeholder={
                            isLoadingCashiers
                              ? "Loading cashiers..."
                              : "Select cashier name"
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {cashiers.map((cashier) => (
                        <SelectItem
                          key={cashier.cashier_id}
                          value={cashier.name}
                        >
                          {cashier.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage data-testid="cashier-name-error" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="pin_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>PIN Number</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Enter PIN number"
                      disabled={isSubmitting}
                      data-testid="pin-number-input"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage data-testid="pin-number-error" />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={isSubmitting}
                data-testid="terminal-auth-cancel-button"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                data-testid="terminal-auth-submit-button"
              >
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Submit
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
