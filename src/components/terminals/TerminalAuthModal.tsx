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
import { useActiveShift, useShiftStart } from "@/lib/api/shifts";
import { useRouter } from "next/navigation";
import { useCashierSession } from "@/contexts/CashierSessionContext";

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
  terminalId,
  terminalName,
  storeId,
  open,
  onOpenChange,
  onSubmit,
}: TerminalAuthModalProps) {
  const router = useRouter();
  const { setSession } = useCashierSession();

  // Check for active shift when modal opens
  const {
    data: activeShift,
    isLoading: isLoadingActiveShift,
    error: activeShiftError,
  } = useActiveShift(terminalId, { enabled: open });

  // Shift start mutation
  const startShiftMutation = useShiftStart();
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
    form.formState.isSubmitting ||
    authenticateMutation.isPending ||
    startShiftMutation.isPending;

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      form.reset({
        cashier_name: "",
        pin_number: "",
      });
      authenticateMutation.reset();
      startShiftMutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSubmit = async (values: TerminalAuthFormValues) => {
    if (onSubmit) {
      await onSubmit(values);
      return;
    }

    try {
      // Authenticate cashier and create session token for this terminal
      // The session token is required for terminal operations (enterprise POS pattern)
      const authResult = await authenticateMutation.mutateAsync({
        storeId,
        identifier: { name: values.cashier_name },
        pin: values.pin_number,
        terminalId, // Pass terminal ID to create session token
      });

      // Verify session was created (required for terminal operations)
      if (!authResult.session?.session_token) {
        form.setError("root", {
          type: "manual",
          message: "Failed to create cashier session",
        });
        return;
      }

      // Store session in context for subsequent terminal operations
      // This enables other components to access the session token
      setSession({
        sessionId: authResult.session.session_id,
        sessionToken: authResult.session.session_token,
        cashierId: authResult.cashier_id,
        cashierName: values.cashier_name,
        terminalId,
        expiresAt: authResult.session.expires_at,
      });

      // Check if there's already an active shift for this terminal
      // If so, just navigate to it. If not, start a new shift.
      if (activeShift) {
        // Active shift exists - just navigate to it (PIN auth creates session for operations)
        router.push(`/terminal/${terminalId}/shift`);
        onOpenChange(false);
      } else {
        // No active shift - start a new one
        // Use session token instead of cashier ID for proper authorization
        const shiftResult = await startShiftMutation.mutateAsync({
          terminalId,
          sessionToken: authResult.session.session_token,
        });

        // Success - redirect to shift page
        // Note: Route is /terminal/... not /mystore/terminal/... because (mystore) is a route group
        router.push(`/terminal/${terminalId}/shift`);
        onOpenChange(false);
      }
    } catch (error) {
      // Set form error for non-mutation errors (e.g., missing session token)
      // Mutation errors are handled by mutation state
      if (
        error instanceof Error &&
        error.message === "Failed to create cashier session"
      ) {
        form.setError("root", {
          type: "manual",
          message: error.message,
        });
      }
      // Other errors are handled by mutation state - no console logging to avoid exposing sensitive data
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

            {isLoadingActiveShift && (
              <Alert>
                <AlertDescription>
                  Checking for active shift...
                </AlertDescription>
              </Alert>
            )}

            {activeShift && !isLoadingActiveShift && (
              <Alert>
                <AlertDescription>
                  This terminal has an active shift. Authenticate to resume.
                </AlertDescription>
              </Alert>
            )}

            {activeShiftError && (
              <Alert variant="destructive">
                <AlertDescription>
                  Failed to check for active shift. Please try again.
                </AlertDescription>
              </Alert>
            )}

            {startShiftMutation.isError && (
              <Alert variant="destructive">
                <AlertDescription>
                  {startShiftMutation.error instanceof Error
                    ? startShiftMutation.error.message
                    : "Failed to start shift. Please try again."}
                </AlertDescription>
              </Alert>
            )}

            {authenticateMutation.isError && (
              <Alert variant="destructive">
                <AlertDescription>
                  {authenticateMutation.error instanceof Error
                    ? authenticateMutation.error.message ===
                      "Authentication failed"
                      ? "Invalid PIN. Please try again."
                      : authenticateMutation.error.message
                    : "Authentication failed. Please check your credentials."}
                </AlertDescription>
              </Alert>
            )}

            {form.formState.errors.root && (
              <Alert variant="destructive">
                <AlertDescription>
                  {form.formState.errors.root.message}
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
                      autoComplete="off"
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
                disabled={isSubmitting || isLoadingActiveShift}
                data-testid="terminal-auth-submit-button"
              >
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {activeShift ? "Resume Shift" : "Start Shift"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
