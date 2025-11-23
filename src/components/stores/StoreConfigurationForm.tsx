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
import { Checkbox } from "@/components/ui/checkbox";
import {
  useUpdateStoreConfiguration,
  type Store,
} from "@/lib/api/stores";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

/**
 * IANA timezone validation regex
 */
const IANA_TIMEZONE_REGEX =
  /^[A-Z][a-z]+(\/[A-Z][a-zA-Z_]+)+$|^UTC$|^GMT(\+|-)?\d*$/;

/**
 * Time format validation (HH:mm)
 */
const TIME_FORMAT_REGEX = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;

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
 * Day operating hours schema
 */
const dayOperatingHoursSchema = z
  .object({
    open: z.string().optional(),
    close: z.string().optional(),
    closed: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.closed) return true;
      if (!data.open || !data.close) return false;
      if (!TIME_FORMAT_REGEX.test(data.open)) return false;
      if (!TIME_FORMAT_REGEX.test(data.close)) return false;
      const [openHour, openMin] = data.open.split(":").map(Number);
      const [closeHour, closeMin] = data.close.split(":").map(Number);
      const openMinutes = openHour * 60 + openMin;
      const closeMinutes = closeHour * 60 + closeMin;
      return closeMinutes > openMinutes;
    },
    {
      message: "Close time must be after open time",
    },
  );

/**
 * Store configuration form validation schema
 */
const storeConfigurationFormSchema = z.object({
  timezone: z
    .string()
    .optional()
    .refine(
      (val) => !val || IANA_TIMEZONE_REGEX.test(val),
      "Timezone must be in IANA format (e.g., America/New_York, Europe/London)",
    ),
  address: z.string().optional(),
  gpsLat: z
    .string()
    .optional()
    .refine((val) => {
      if (!val) return true;
      const num = parseFloat(val);
      return !isNaN(num) && num >= -90 && num <= 90;
    }, "Latitude must be between -90 and 90"),
  gpsLng: z
    .string()
    .optional()
    .refine((val) => {
      if (!val) return true;
      const num = parseFloat(val);
      return !isNaN(num) && num >= -180 && num <= 180;
    }, "Longitude must be between -180 and 180"),
  monday: dayOperatingHoursSchema.optional(),
  tuesday: dayOperatingHoursSchema.optional(),
  wednesday: dayOperatingHoursSchema.optional(),
  thursday: dayOperatingHoursSchema.optional(),
  friday: dayOperatingHoursSchema.optional(),
  saturday: dayOperatingHoursSchema.optional(),
  sunday: dayOperatingHoursSchema.optional(),
});

type StoreConfigurationFormValues = z.infer<
  typeof storeConfigurationFormSchema
>;

interface StoreConfigurationFormProps {
  store: Store;
  onSuccess?: () => void;
}

/**
 * StoreConfigurationForm component
 * Form for updating store configuration (timezone, location, operating hours)
 * Uses Shadcn/ui Form components with Zod validation
 */
export function StoreConfigurationForm({
  store,
  onSuccess,
}: StoreConfigurationFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateMutation = useUpdateStoreConfiguration();

  // Extract configuration data from store
  const config = (store.configuration as any) || {};
  const locationData = config.location || {};

  // Extract operating hours
  const operatingHours = config.operating_hours || {};

  const form = useForm<StoreConfigurationFormValues>({
    resolver: zodResolver(storeConfigurationFormSchema),
    defaultValues: {
      timezone: config.timezone || store.timezone || "",
      address: locationData.address || "",
      gpsLat: locationData.gps?.lat?.toString() || "",
      gpsLng: locationData.gps?.lng?.toString() || "",
      monday: operatingHours.monday || { open: "", close: "", closed: false },
      tuesday: operatingHours.tuesday || { open: "", close: "", closed: false },
      wednesday:
        operatingHours.wednesday || { open: "", close: "", closed: false },
      thursday:
        operatingHours.thursday || { open: "", close: "", closed: false },
      friday: operatingHours.friday || { open: "", close: "", closed: false },
      saturday:
        operatingHours.saturday || { open: "", close: "", closed: false },
      sunday: operatingHours.sunday || { open: "", close: "", closed: false },
    },
  });

  const onSubmit = async (values: StoreConfigurationFormValues) => {
    setIsSubmitting(true);
    try {
      // Build location object
      const location: {
        address?: string;
        gps?: { lat: number; lng: number };
      } = {};

      if (values.address) {
        location.address = values.address;
      }

      if (values.gpsLat && values.gpsLng) {
        location.gps = {
          lat: parseFloat(values.gpsLat),
          lng: parseFloat(values.gpsLng),
        };
      }

      // Build operating hours object
      const operating_hours: any = {};
      const days = [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ];

      for (const day of days) {
        const dayData = values[day as keyof StoreConfigurationFormValues] as {
          open?: string;
          close?: string;
          closed?: boolean;
        };
        if (dayData) {
          if (dayData.closed) {
            operating_hours[day] = { closed: true };
          } else if (dayData.open && dayData.close) {
            operating_hours[day] = {
              open: dayData.open,
              close: dayData.close,
            };
          }
        }
      }

      const configData: {
        timezone?: string;
        location?: typeof location;
        operating_hours?: typeof operating_hours;
      } = {};

      if (values.timezone) {
        configData.timezone = values.timezone;
      }

      if (Object.keys(location).length > 0) {
        configData.location = location;
      }

      if (Object.keys(operating_hours).length > 0) {
        configData.operating_hours = operating_hours;
      }

      await updateMutation.mutateAsync({
        storeId: store.store_id,
        config: configData,
      });

      toast({
        title: "Success",
        description: "Store configuration updated successfully",
      });

      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to update store configuration. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderDayFields = (dayName: string, dayLabel: string) => {
    return (
      <div key={dayName} className="space-y-4 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium capitalize">{dayLabel}</h3>
          <FormField
            control={form.control}
            name={`${dayName}.closed` as any}
            render={({ field }) => (
              <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={isSubmitting}
                  />
                </FormControl>
                <FormLabel className="text-sm font-normal">
                  Closed on {dayLabel}
                </FormLabel>
              </FormItem>
            )}
          />
        </div>

        {!form.watch(`${dayName}.closed` as any) && (
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name={`${dayName}.open` as any}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Open Time</FormLabel>
                  <FormControl>
                    <Input
                      type="time"
                      {...field}
                      disabled={isSubmitting}
                      placeholder="09:00"
                    />
                  </FormControl>
                  <FormDescription>Opening time (HH:mm)</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name={`${dayName}.close` as any}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Close Time</FormLabel>
                  <FormControl>
                    <Input
                      type="time"
                      {...field}
                      disabled={isSubmitting}
                      placeholder="17:00"
                    />
                  </FormControl>
                  <FormDescription>Closing time (HH:mm)</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="timezone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Timezone</FormLabel>
              <Select
                onValueChange={field.onChange}
                defaultValue={field.value}
                disabled={isSubmitting}
              >
                <FormControl>
                  <SelectTrigger>
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

        <div className="space-y-4 rounded-lg border p-4">
          <h3 className="text-sm font-medium">Location</h3>

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

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="gpsLat"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>GPS Latitude</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="any"
                      placeholder="-90 to 90"
                      {...field}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormDescription>Latitude (-90 to 90)</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="gpsLng"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>GPS Longitude</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="any"
                      placeholder="-180 to 180"
                      {...field}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormDescription>Longitude (-180 to 180)</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-medium">Operating Hours</h3>
          {renderDayFields("monday", "Monday")}
          {renderDayFields("tuesday", "Tuesday")}
          {renderDayFields("wednesday", "Wednesday")}
          {renderDayFields("thursday", "Thursday")}
          {renderDayFields("friday", "Friday")}
          {renderDayFields("saturday", "Saturday")}
          {renderDayFields("sunday", "Sunday")}
        </div>

        <div className="flex gap-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Update Configuration"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

