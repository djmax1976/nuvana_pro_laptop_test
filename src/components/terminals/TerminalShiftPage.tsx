"use client";

/**
 * Terminal Shift Page Content Component
 *
 * Story 4.92: Terminal Shift Page
 *
 * Displays shift information including:
 * - Cashier name
 * - Shift start time
 * - Shift number
 * - Starting cash input (optional)
 * - Placeholder metrics (Total Sales, Tax, Voids)
 * - End Shift button (placeholder)
 */

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUpdateStartingCash } from "@/lib/api/shifts";
import { Loader2, DollarSign, Receipt, XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCashierSession } from "@/contexts/CashierSessionContext";

/**
 * Starting cash form validation schema
 * Validates that starting cash is a non-negative number or zero
 */
const startingCashSchema = z.object({
  starting_cash: z
    .number({
      error: "Starting cash must be a number",
    })
    .nonnegative("Starting cash must be a non-negative number or zero")
    .optional()
    .or(z.literal("")),
});

type StartingCashFormValues = z.infer<typeof startingCashSchema>;

interface TerminalShiftPageContentProps {
  shift: {
    shift_id: string;
    cashier_id: string;
    opened_at: string;
    shift_number: number | null;
    opening_cash: number;
  };
  cashierName: string;
  terminalId: string;
}

/**
 * TerminalShiftPageContent component
 * Displays shift information and allows updating starting cash
 */
export function TerminalShiftPageContent({
  shift,
  cashierName,
  terminalId,
}: TerminalShiftPageContentProps) {
  const [showEndShiftDialog, setShowEndShiftDialog] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const { session } = useCashierSession();
  const updateStartingCashMutation = useUpdateStartingCash();

  const form = useForm<StartingCashFormValues>({
    resolver: zodResolver(startingCashSchema),
    defaultValues: {
      starting_cash: shift.opening_cash > 0 ? shift.opening_cash : undefined,
    },
  });

  // Clear session error when a valid session exists
  useEffect(() => {
    if (session?.sessionToken) {
      setSessionError(null);
    }
  }, [session?.sessionToken]);

  const handleUpdateStartingCash = async (values: StartingCashFormValues) => {
    if (values.starting_cash === undefined || values.starting_cash === "") {
      // Optional field - allow empty
      return;
    }

    // Clear any previous session error when retrying
    setSessionError(null);

    // Session token required for terminal operations
    if (!session?.sessionToken) {
      setSessionError(
        "No active cashier session. Please re-authenticate to continue.",
      );
      return;
    }

    try {
      await updateStartingCashMutation.mutateAsync({
        shiftId: shift.shift_id,
        startingCash: values.starting_cash || 0,
        sessionToken: session.sessionToken,
      });
    } catch (error) {
      // Error is handled by mutation state
      console.error("Failed to update starting cash:", error);
    }
  };

  // Format shift start time
  const shiftStartTime = format(new Date(shift.opened_at), "h:mm a");
  const shiftStartDate = format(new Date(shift.opened_at), "MMMM d, yyyy");

  // Format shift number display
  const shiftNumberDisplay = shift.shift_number
    ? `Shift ${shift.shift_number} - ${shiftStartDate}`
    : "Shift";

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Terminal Shift</h1>
        <p className="text-muted-foreground">
          Terminal ID: {terminalId.slice(0, 8)}...
        </p>
      </div>

      {/* Shift Information Card */}
      <Card>
        <CardHeader>
          <CardTitle>Shift Information</CardTitle>
          <CardDescription>Current shift details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Cashier Name */}
          <div>
            <p className="text-sm font-medium text-muted-foreground">Cashier</p>
            <p className="text-2xl font-bold">{cashierName}</p>
          </div>

          {/* Shift Start Time */}
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Started at
            </p>
            <p className="text-lg">{shiftStartTime}</p>
          </div>

          {/* Shift Number */}
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Shift Number
            </p>
            <p className="text-lg">{shiftNumberDisplay}</p>
          </div>

          {/* Starting Cash Input */}
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleUpdateStartingCash)}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="starting_cash"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Starting Cash (Optional)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          className="pl-9"
                          {...field}
                          value={
                            field.value === undefined || field.value === ""
                              ? ""
                              : field.value
                          }
                          onChange={(e) => {
                            const value = e.target.value;
                            field.onChange(
                              value === "" ? undefined : parseFloat(value) || 0,
                            );
                          }}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {sessionError && (
                <Alert variant="destructive">
                  <AlertDescription>{sessionError}</AlertDescription>
                </Alert>
              )}
              {updateStartingCashMutation.isPending && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving...</span>
                </div>
              )}
              {updateStartingCashMutation.isSuccess && (
                <Alert>
                  <AlertDescription>
                    Starting cash updated successfully.
                  </AlertDescription>
                </Alert>
              )}
              {updateStartingCashMutation.isError && (
                <Alert variant="destructive">
                  <AlertDescription>
                    Failed to update starting cash. Please try again.
                  </AlertDescription>
                </Alert>
              )}
              <Button
                type="submit"
                disabled={updateStartingCashMutation.isPending}
                size="sm"
              >
                {updateStartingCashMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Update Starting Cash
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Metrics Card */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction Metrics</CardTitle>
          <CardDescription>
            Placeholder metrics (will be populated from 3rd party POS)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Total Sales */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm font-medium text-muted-foreground">
                  Total Sales
                </p>
              </div>
              <p className="text-2xl font-bold">$0.00</p>
            </div>

            {/* Total Tax Collected */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm font-medium text-muted-foreground">
                  Total Tax Collected
                </p>
              </div>
              <p className="text-2xl font-bold">$0.00</p>
            </div>

            {/* Total Voids */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm font-medium text-muted-foreground">
                  Total Voids
                </p>
              </div>
              <p className="text-2xl font-bold">$0.00</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions Card */}
      <Card>
        <CardHeader>
          <CardTitle>Shift Actions</CardTitle>
          <CardDescription>Manage your shift</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            onClick={() => setShowEndShiftDialog(true)}
            disabled
            className="w-full md:w-auto"
          >
            End Shift
          </Button>
          <p className="text-sm text-muted-foreground mt-2">
            End shift functionality will be available in a future update.
          </p>
        </CardContent>
      </Card>

      {/* End Shift Dialog (Placeholder) */}
      <Dialog open={showEndShiftDialog} onOpenChange={setShowEndShiftDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End Shift</DialogTitle>
            <DialogDescription>
              This feature is coming soon. End shift functionality will be
              available in a future update.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowEndShiftDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
