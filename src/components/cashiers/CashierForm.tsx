"use client";

/**
 * Cashier Form Component
 * Form for creating and editing cashiers with store selection
 *
 * Story: 4.9 - Cashier Management
 */

import { useEffect, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useCreateCashier,
  useUpdateCashier,
  type Cashier,
} from "@/lib/api/cashiers";
import { useClientDashboard } from "@/lib/api/client-dashboard";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Loader2 } from "lucide-react";

/**
 * Zod schema for cashier form
 * PIN must be exactly 4 digits
 */
const cashierFormSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name cannot exceed 255 characters")
    .refine((val) => val.trim().length > 0, {
      message: "Name cannot be whitespace only",
    }),
  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 numeric digits"),
  hired_on: z.string().min(1, "Hired date is required"),
  store_id: z.string().min(1, "Store is required"),
  termination_date: z.string().optional().nullable(),
});

/**
 * Schema for editing (PIN is optional)
 */
const cashierEditFormSchema = cashierFormSchema.extend({
  pin: z
    .string()
    .regex(/^\d{4}$/, "PIN must be exactly 4 numeric digits")
    .optional()
    .or(z.literal("")),
});

type CashierFormValues = z.infer<typeof cashierFormSchema>;
type CashierEditFormValues = z.infer<typeof cashierEditFormSchema>;

interface CashierFormProps {
  cashier?: Cashier | null;
  storeId?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function CashierForm({
  cashier,
  storeId,
  onSuccess,
  onCancel,
}: CashierFormProps) {
  const { toast } = useToast();
  const isEditing = !!cashier;

  // Fetch stores from dashboard
  const { data: dashboardData, isLoading: isLoadingStores } =
    useClientDashboard();

  // Create and update mutations
  const createCashierMutation = useCreateCashier();
  const updateCashierMutation = useUpdateCashier();

  // Get stores - memoized to avoid dependency changes on every render
  const stores = useMemo(
    () => dashboardData?.stores || [],
    [dashboardData?.stores],
  );

  // Form setup
  const form = useForm<CashierFormValues | CashierEditFormValues>({
    resolver: zodResolver(
      isEditing ? cashierEditFormSchema : cashierFormSchema,
    ),
    defaultValues: {
      name: cashier?.name || "",
      pin: "",
      hired_on: cashier?.hired_on
        ? new Date(cashier.hired_on).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
      store_id: cashier?.store_id || storeId || "",
      termination_date: cashier?.termination_date
        ? new Date(cashier.termination_date).toISOString().split("T")[0]
        : "",
    },
  });

  // Track if we've set the store_id to avoid race conditions
  const storeIdSetRef = useRef(false);

  // Auto-select single store when data loads and no store is selected
  // Use a ref to ensure we only set this once per mount
  useEffect(() => {
    if (!isEditing && stores.length === 1 && !storeIdSetRef.current) {
      const currentStoreId = form.getValues("store_id");
      if (!currentStoreId) {
        storeIdSetRef.current = true;
        form.setValue("store_id", stores[0].store_id, {
          shouldValidate: true,
          shouldDirty: false,
          shouldTouch: false,
        });
      }
    }
  }, [stores, isEditing, form]);

  // Handle form submission
  async function onSubmit(data: CashierFormValues | CashierEditFormValues) {
    try {
      if (isEditing && cashier) {
        // Update existing cashier
        const updateData: {
          name?: string;
          pin?: string;
          hired_on?: string;
          termination_date?: string | null;
        } = {};

        if (data.name !== cashier.name) {
          updateData.name = data.name;
        }
        if (data.pin && data.pin.length === 4) {
          updateData.pin = data.pin;
        }

        // Get original values in YYYY-MM-DD format for comparison
        const originalHiredOn = cashier.hired_on
          ? new Date(cashier.hired_on).toISOString().split("T")[0]
          : null;
        const originalTerminationDate = cashier.termination_date
          ? new Date(cashier.termination_date).toISOString().split("T")[0]
          : null;

        // Only include hired_on if it's non-empty and different from original
        if (data.hired_on && data.hired_on !== originalHiredOn) {
          updateData.hired_on = data.hired_on;
        }

        // Normalize termination_date: empty string -> null
        const normalizedTerminationDate = data.termination_date || null;
        // Only include termination_date if it's different from original
        if (normalizedTerminationDate !== originalTerminationDate) {
          updateData.termination_date = normalizedTerminationDate;
        }

        await updateCashierMutation.mutateAsync({
          storeId: cashier.store_id,
          cashierId: cashier.cashier_id,
          data: updateData,
        });

        toast({
          title: "Cashier updated",
          description: `${data.name} has been updated successfully.`,
        });
      } else {
        // Create new cashier
        await createCashierMutation.mutateAsync({
          storeId: data.store_id,
          data: {
            name: data.name,
            pin: data.pin as string,
            hired_on: data.hired_on,
            termination_date: data.termination_date || null,
          },
        });

        toast({
          title: "Cashier created",
          description: `${data.name} has been added successfully.`,
        });
      }

      onSuccess();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : `Failed to ${isEditing ? "update" : "create"} cashier`,
      });
    }
  }

  const isLoading = isLoadingStores;
  const isSubmitting =
    createCashierMutation.isPending || updateCashierMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Store Selection (only for new cashiers) */}
        {!isEditing && (
          <FormField
            control={form.control}
            name="store_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Store</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={isLoading || isSubmitting || stores.length === 1}
                >
                  <FormControl>
                    <SelectTrigger data-testid="cashier-store">
                      {stores.length === 1 ? (
                        <span>
                          {stores[0].name}
                          {stores[0].company_name && (
                            <span className="text-muted-foreground ml-2">
                              ({stores[0].company_name})
                            </span>
                          )}
                        </span>
                      ) : (
                        <SelectValue placeholder="Select a store" />
                      )}
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {stores.map((store) => (
                      <SelectItem key={store.store_id} value={store.store_id}>
                        {store.name}
                        {store.company_name && (
                          <span className="text-muted-foreground ml-2">
                            ({store.company_name})
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  The store where this cashier will work
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Name Field */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="Enter name"
                  disabled={isSubmitting}
                  data-testid="cashier-name"
                  {...field}
                />
              </FormControl>
              <FormDescription>Full name of the cashier</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* PIN Field */}
        <FormField
          control={form.control}
          name="pin"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {isEditing ? "New PIN (leave blank to keep current)" : "PIN"}
              </FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder="Enter a 4 digit pin number"
                  maxLength={4}
                  disabled={isSubmitting}
                  data-testid="cashier-pin"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                4-digit PIN for terminal authentication
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Hired On Field */}
        <FormField
          control={form.control}
          name="hired_on"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Hired Date</FormLabel>
              <FormControl>
                <Input
                  type="date"
                  disabled={isSubmitting}
                  data-testid="cashier-hired-on"
                  {...field}
                />
              </FormControl>
              <FormDescription>The date this cashier was hired</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Termination Date Field (optional) */}
        <FormField
          control={form.control}
          name="termination_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Termination Date (optional)</FormLabel>
              <FormControl>
                <Input
                  type="date"
                  disabled={isSubmitting}
                  data-testid="cashier-termination-date"
                  {...field}
                  value={field.value || ""}
                />
              </FormControl>
              <FormDescription>
                Leave blank if the cashier is still employed
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Form Actions */}
        <div className="flex justify-end gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isLoading || isSubmitting}
            data-testid="submit-cashier"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting
              ? isEditing
                ? "Updating..."
                : "Creating..."
              : isEditing
                ? "Update Cashier"
                : "Create Cashier"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default CashierForm;
