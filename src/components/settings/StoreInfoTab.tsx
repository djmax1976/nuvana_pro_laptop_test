"use client";

/**
 * Store Info Tab Component
 * Displays and allows editing of store configuration (address, timezone, contact email, operating hours)
 *
 * Story 6.14: Store Settings Page with Employee/Cashier Management
 * AC #3: Display store name (read-only), Address, Timezone, Contact Email, Operating Hours
 *        and allow editing and saving changes
 */

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  useStoreSettings,
  useUpdateStoreSettings,
  type OperatingHours,
} from "@/lib/api/store-settings";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

/**
 * Common IANA timezones for dropdown
 */
const COMMON_TIMEZONES = [
  { value: "America/New_York", label: "America/New_York (EST/EDT)" },
  { value: "America/Chicago", label: "America/Chicago (CST/CDT)" },
  { value: "America/Denver", label: "America/Denver (MST/MDT)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PST/PDT)" },
  { value: "America/Phoenix", label: "America/Phoenix (MST)" },
  { value: "America/Anchorage", label: "America/Anchorage (AKST/AKDT)" },
  { value: "America/Honolulu", label: "America/Honolulu (HST)" },
  { value: "America/Toronto", label: "America/Toronto (EST/EDT)" },
  { value: "America/Vancouver", label: "America/Vancouver (PST/PDT)" },
  { value: "Europe/London", label: "Europe/London (GMT/BST)" },
  { value: "Europe/Paris", label: "Europe/Paris (CET/CEST)" },
  { value: "Europe/Berlin", label: "Europe/Berlin (CET/CEST)" },
  { value: "Europe/Rome", label: "Europe/Rome (CET/CEST)" },
  { value: "Europe/Madrid", label: "Europe/Madrid (CET/CEST)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (JST)" },
  { value: "Asia/Shanghai", label: "Asia/Shanghai (CST)" },
  { value: "Asia/Hong_Kong", label: "Asia/Hong_Kong (HKT)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (GST)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (AEST/AEDT)" },
  { value: "Australia/Melbourne", label: "Australia/Melbourne (AEST/AEDT)" },
  { value: "UTC", label: "UTC" },
];

/**
 * Time format validation (HH:mm)
 */
const TIME_FORMAT_REGEX = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;

/**
 * Day operating hours schema
 */
const dayOperatingHoursSchema = z
  .object({
    open: z
      .string()
      .regex(TIME_FORMAT_REGEX, "Time must be in HH:mm format (e.g., 09:00)")
      .optional(),
    close: z
      .string()
      .regex(TIME_FORMAT_REGEX, "Time must be in HH:mm format (e.g., 17:00)")
      .optional(),
    closed: z.boolean().optional(),
  })
  .refine(
    (data) => {
      // If closed is true, open and close are not required
      if (data.closed) return true;
      // If not closed, both open and close are required
      return !!data.open && !!data.close;
    },
    {
      message: "Both open and close times are required when not closed",
      path: ["open"],
    },
  );

/**
 * Store settings form schema
 */
const storeSettingsSchema = z.object({
  address: z
    .string()
    .max(500, "Address cannot exceed 500 characters")
    .optional(),
  timezone: z
    .string()
    .max(50, "Timezone cannot exceed 50 characters")
    .optional(),
  contact_email: z
    .string()
    .email("Invalid email format")
    .max(255, "Email cannot exceed 255 characters")
    .optional()
    .nullable(),
  operating_hours: z
    .object({
      monday: dayOperatingHoursSchema.optional(),
      tuesday: dayOperatingHoursSchema.optional(),
      wednesday: dayOperatingHoursSchema.optional(),
      thursday: dayOperatingHoursSchema.optional(),
      friday: dayOperatingHoursSchema.optional(),
      saturday: dayOperatingHoursSchema.optional(),
      sunday: dayOperatingHoursSchema.optional(),
    })
    .optional(),
});

type StoreSettingsFormValues = z.infer<typeof storeSettingsSchema>;

interface StoreInfoTabProps {
  storeId: string;
}

/**
 * Render operating hours fields for a specific day
 */
function renderDayFields(
  day: keyof OperatingHours,
  dayLabel: string,
  form: any,
  isSubmitting: boolean,
) {
  return (
    <div className="space-y-2 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{dayLabel}</span>
        <FormField
          control={form.control}
          name={`operating_hours.${day}.closed`}
          render={({ field }) => (
            <FormItem className="flex flex-row items-center space-x-2 space-y-0">
              <FormControl>
                <Checkbox
                  checked={field.value || false}
                  onCheckedChange={field.onChange}
                  disabled={isSubmitting}
                />
              </FormControl>
              <FormLabel className="text-sm font-normal">Closed</FormLabel>
            </FormItem>
          )}
        />
      </div>
      {!form.watch(`operating_hours.${day}.closed`) && (
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name={`operating_hours.${day}.open`}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Open Time</FormLabel>
                <FormControl>
                  <Input
                    type="time"
                    {...field}
                    disabled={isSubmitting}
                    data-testid={`operating-hours-${day}-open`}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={`operating_hours.${day}.close`}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Close Time</FormLabel>
                <FormControl>
                  <Input
                    type="time"
                    {...field}
                    disabled={isSubmitting}
                    data-testid={`operating-hours-${day}-close`}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}
    </div>
  );
}

export function StoreInfoTab({ storeId }: StoreInfoTabProps) {
  const { toast } = useToast();
  const { data, isLoading, isError, error } = useStoreSettings(storeId);
  const updateMutation = useUpdateStoreSettings();

  const form = useForm<StoreSettingsFormValues>({
    resolver: zodResolver(storeSettingsSchema),
    defaultValues: {
      address: "",
      timezone: "America/New_York",
      contact_email: null,
      operating_hours: {},
    },
  });

  // Load data into form when it's available
  useEffect(() => {
    if (data?.data) {
      const settings = data.data;
      form.reset({
        address: settings.address || "",
        timezone: settings.timezone || "America/New_York",
        contact_email: settings.contact_email || null,
        operating_hours: settings.operating_hours || {},
      });
    }
  }, [data, form]);

  const onSubmit = async (values: StoreSettingsFormValues) => {
    try {
      await updateMutation.mutateAsync({
        storeId,
        config: {
          address: values.address || undefined,
          timezone: values.timezone || undefined,
          contact_email: values.contact_email || null,
          // Cast to OperatingHours - form validation ensures correct structure
          operating_hours: values.operating_hours as OperatingHours | undefined,
        },
      });

      toast({
        title: "Settings updated",
        description: "Store settings have been saved successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update store settings",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <p className="text-sm text-destructive">
          {error instanceof Error
            ? error.message
            : "Failed to load store settings"}
        </p>
      </div>
    );
  }

  const storeName = data?.data?.name || "";

  return (
    <div className="space-y-6" data-testid="store-info-tab">
      {/* Store Name (Read-only) */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Store Name</label>
        <Input
          value={storeName}
          disabled
          readOnly
          className="bg-muted"
          data-testid="store-name"
        />
        <p className="text-xs text-muted-foreground">
          Store name cannot be changed from this page
        </p>
      </div>

      {/* Editable Form */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Address */}
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
                    disabled={updateMutation.isPending}
                    rows={3}
                    data-testid="address-input"
                  />
                </FormControl>
                <FormDescription>
                  Physical address of the store (optional)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Timezone */}
          <FormField
            control={form.control}
            name="timezone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Timezone</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={updateMutation.isPending}
                >
                  <FormControl>
                    <SelectTrigger data-testid="timezone-select">
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {COMMON_TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  IANA timezone format (e.g., America/New_York, Europe/London)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Contact Email */}
          <FormField
            control={form.control}
            name="contact_email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contact Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="store@example.com"
                    {...field}
                    value={field.value || ""}
                    disabled={updateMutation.isPending}
                    data-testid="contact-email-input"
                  />
                </FormControl>
                <FormDescription>
                  Contact email for this store (optional)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Operating Hours */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Operating Hours</h3>
            {renderDayFields(
              "monday",
              "Monday",
              form,
              updateMutation.isPending,
            )}
            {renderDayFields(
              "tuesday",
              "Tuesday",
              form,
              updateMutation.isPending,
            )}
            {renderDayFields(
              "wednesday",
              "Wednesday",
              form,
              updateMutation.isPending,
            )}
            {renderDayFields(
              "thursday",
              "Thursday",
              form,
              updateMutation.isPending,
            )}
            {renderDayFields(
              "friday",
              "Friday",
              form,
              updateMutation.isPending,
            )}
            {renderDayFields(
              "saturday",
              "Saturday",
              form,
              updateMutation.isPending,
            )}
            {renderDayFields(
              "sunday",
              "Sunday",
              form,
              updateMutation.isPending,
            )}
          </div>

          {/* Submit Button */}
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={updateMutation.isPending}
              data-testid="save-settings-button"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Settings"
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
