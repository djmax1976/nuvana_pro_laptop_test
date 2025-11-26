"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
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
import {
  useCreateStore,
  useUpdateStore,
  type Store,
  type StoreStatus,
} from "@/lib/api/stores";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

/**
 * IANA timezone validation regex
 * Matches IANA timezone database format (e.g., America/New_York, Europe/London, UTC)
 * Format: Continent/City or Continent/Region/City where City can have mixed case
 */
const IANA_TIMEZONE_REGEX =
  /^[A-Z][a-z]+(\/[A-Z][a-zA-Z_]+)+$|^UTC$|^GMT(\+|-)?\d*$/;

/**
 * Store form validation schema
 */
const storeFormSchema = z.object({
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

type StoreFormValues = z.infer<typeof storeFormSchema>;

interface StoreFormProps {
  companyId: string;
  store?: Store;
  onSuccess?: () => void;
}

/**
 * StoreForm component
 * Form for creating or editing a store
 * Uses Shadcn/ui Form components with Zod validation
 * Validates timezone (IANA format) and location_json structure
 */
export function StoreForm({ companyId, store, onSuccess }: StoreFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createMutation = useCreateStore();
  const updateMutation = useUpdateStore();

  // Extract location data from store
  const locationData = store?.location_json;

  const form = useForm<StoreFormValues>({
    resolver: zodResolver(storeFormSchema),
    defaultValues: {
      name: store?.name || "",
      timezone: store?.timezone || "America/New_York",
      address: locationData?.address || "",
      status: store?.status || "ACTIVE",
    },
  });

  const onSubmit = async (values: StoreFormValues) => {
    setIsSubmitting(true);
    try {
      // Build form data with location_json
      const formData = {
        name: values.name,
        timezone: values.timezone,
        status: values.status,
        // Always include location_json if address is provided (even empty string clears it)
        ...(values.address
          ? { location_json: { address: values.address } }
          : {}),
      };

      if (store) {
        // Update existing store
        await updateMutation.mutateAsync({
          storeId: store.store_id,
          data: formData,
        });
        toast({
          title: "Success",
          description: "Store updated successfully",
        });
      } else {
        // Create new store
        await createMutation.mutateAsync({
          companyId,
          data: formData,
        });
        toast({
          title: "Success",
          description: "Store created successfully",
        });
      }

      // Reset form if creating
      if (!store) {
        form.reset();
      }

      // Call onSuccess callback if provided
      if (onSuccess) {
        onSuccess();
      } else {
        // Default: navigate to stores list
        router.push(`/stores?companyId=${companyId}`);
      }
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to save store. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                IANA timezone format (e.g., America/New_York, Europe/London,
                UTC)
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
                onValueChange={field.onChange}
                defaultValue={field.value}
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
              <FormDescription>The current status of the store</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? "Saving..."
              : store
                ? "Update Store"
                : "Create Store"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
