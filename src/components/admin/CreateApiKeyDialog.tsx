"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, Copy, Check, Key } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCreateApiKey, CreateApiKeyResponse } from "@/lib/api/api-keys";
import { useAllStores, StoreWithCompany } from "@/lib/api/stores";

/**
 * Form validation schema
 * Mirrors backend Zod schema for consistent validation
 *
 * Enterprise Standards Applied:
 * - API-001: VALIDATION - Schema validation matches backend
 * - FE-002: FORM_VALIDATION - Client-side validation mirrors server-side
 * - SEC-014: INPUT_VALIDATION - Strict allowlists and format validation
 */
const createApiKeyFormSchema = z.object({
  store_id: z.string().min(1, "Please select a store"),
  label: z.string().max(100, "Label must be at most 100 characters").optional(),
  expires_at: z.string().optional(),
  ip_allowlist: z.string().optional(),
  ip_enforcement_enabled: z.boolean(),
  rate_limit_rpm: z.string().optional(),
  daily_sync_quota: z.string().optional(),
  monthly_data_quota_mb: z.string().optional(),
});

type CreateApiKeyFormValues = z.infer<typeof createApiKeyFormSchema>;

interface CreateApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * CreateApiKeyDialog component
 * Dialog for creating a new API key with store selection and configuration
 *
 * CRITICAL: Shows the raw API key ONCE after creation - must be copied immediately
 *
 * Enterprise Standards Applied:
 * - FE-005: UI_SECURITY - Shows raw key once, provides copy functionality
 * - FE-002: FORM_VALIDATION - Comprehensive validation
 * - API-001: VALIDATION - Matches backend schema
 */
export function CreateApiKeyDialog({
  open,
  onOpenChange,
}: CreateApiKeyDialogProps) {
  const { toast } = useToast();
  const [createdKey, setCreatedKey] = useState<CreateApiKeyResponse | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const { data: storesData, isLoading: loadingStores } = useAllStores(
    { limit: 100 },
    { enabled: open },
  );

  const stores = storesData?.data || [];

  const createMutation = useCreateApiKey();

  const form = useForm<CreateApiKeyFormValues>({
    resolver: zodResolver(createApiKeyFormSchema),
    defaultValues: {
      store_id: "",
      label: "",
      expires_at: "",
      ip_allowlist: "",
      ip_enforcement_enabled: false,
      rate_limit_rpm: "",
      daily_sync_quota: "",
      monthly_data_quota_mb: "",
    },
  });

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      form.reset();
      setCreatedKey(null);
      setCopied(false);
      setShowAdvanced(false);
    }
  }, [open, form]);

  const handleCopyKey = useCallback(async () => {
    if (!createdKey?.raw_key) return;

    try {
      await navigator.clipboard.writeText(createdKey.raw_key);
      setCopied(true);
      toast({
        title: "API Key Copied",
        description: "The API key has been copied to your clipboard",
      });
      // Reset copied state after 3 seconds
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast({
        title: "Failed to copy",
        description:
          "Could not copy to clipboard. Please select and copy manually.",
        variant: "destructive",
      });
    }
  }, [createdKey, toast]);

  const onSubmit = async (data: CreateApiKeyFormValues) => {
    try {
      // Parse IP allowlist from textarea
      const ipAllowlist = data.ip_allowlist
        ? data.ip_allowlist
            .split(/[\n,]/)
            .map((ip) => ip.trim())
            .filter((ip) => ip.length > 0)
        : undefined;

      // Parse numeric fields from strings
      const rateLimitRpm = data.rate_limit_rpm
        ? parseInt(data.rate_limit_rpm, 10)
        : undefined;
      const dailySyncQuota = data.daily_sync_quota
        ? parseInt(data.daily_sync_quota, 10)
        : undefined;
      const monthlyDataQuotaMb = data.monthly_data_quota_mb
        ? parseInt(data.monthly_data_quota_mb, 10)
        : undefined;

      // Convert datetime-local format to ISO 8601 format
      // datetime-local gives "2025-01-20T10:00", backend expects "2025-01-20T10:00:00.000Z"
      const expiresAt = data.expires_at
        ? new Date(data.expires_at).toISOString()
        : undefined;

      const response = await createMutation.mutateAsync({
        store_id: data.store_id,
        label: data.label || undefined,
        expires_at: expiresAt,
        ip_allowlist: ipAllowlist,
        ip_enforcement_enabled: data.ip_enforcement_enabled,
        rate_limit_rpm:
          rateLimitRpm && !isNaN(rateLimitRpm) ? rateLimitRpm : undefined,
        daily_sync_quota:
          dailySyncQuota && !isNaN(dailySyncQuota) ? dailySyncQuota : undefined,
        monthly_data_quota_mb:
          monthlyDataQuotaMb && !isNaN(monthlyDataQuotaMb)
            ? monthlyDataQuotaMb
            : undefined,
      });

      setCreatedKey(response.data);

      toast({
        title: "API Key Created",
        description: "Copy the key now - it will not be shown again!",
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to create API key",
        variant: "destructive",
      });
    }
  };

  // If key was created, show the success state with copy functionality
  if (createdKey) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-green-600" />
              API Key Created
            </DialogTitle>
            <DialogDescription>
              Your new API key has been created. Copy it now - it will not be
              shown again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Alert
              variant="destructive"
              className="border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
            >
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Important</AlertTitle>
              <AlertDescription>
                This is the only time you will see this API key. Copy it now and
                store it securely. You will not be able to retrieve it later.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <label className="text-sm font-medium">API Key</label>
              <div className="flex gap-2">
                <Input
                  value={createdKey.raw_key}
                  readOnly
                  className="font-mono text-sm"
                  data-testid="created-api-key-value"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCopyKey}
                  data-testid="copy-api-key-button"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Key ID:</span>
                <p className="font-mono text-xs">{createdKey.api_key_id}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Label:</span>
                <p>{createdKey.label || "—"}</p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              disabled={!copied}
              variant={copied ? "default" : "outline"}
            >
              {copied ? "Done" : "Copy Key First"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create API Key</DialogTitle>
          <DialogDescription>
            Create a new API key for a desktop application to connect to this
            store.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Store Selection */}
            <FormField
              control={form.control}
              name="store_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Store *</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={loadingStores}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="store-select">
                        <SelectValue placeholder="Select a store" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {stores.map((store: StoreWithCompany) => (
                        <SelectItem key={store.store_id} value={store.store_id}>
                          <div className="flex flex-col">
                            <span>{store.name}</span>
                            {store.company?.name && (
                              <span className="text-xs text-muted-foreground">
                                {store.company.name}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    The store this API key will be bound to
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Label */}
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Label</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Main POS Terminal"
                      {...field}
                      data-testid="label-input"
                    />
                  </FormControl>
                  <FormDescription>
                    Optional name to identify this key
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Advanced Settings Toggle */}
            <div className="flex items-center gap-2">
              <Switch
                checked={showAdvanced}
                onCheckedChange={setShowAdvanced}
                id="show-advanced"
              />
              <label
                htmlFor="show-advanced"
                className="text-sm font-medium cursor-pointer"
              >
                Show advanced settings
              </label>
            </div>

            {showAdvanced && (
              <div className="space-y-4 border-t pt-4">
                {/* Expiration */}
                <FormField
                  control={form.control}
                  name="expires_at"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expiration Date</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} />
                      </FormControl>
                      <FormDescription>
                        Leave empty for no expiration
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* IP Allowlist */}
                <FormField
                  control={form.control}
                  name="ip_allowlist"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>IP Allowlist</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="192.168.1.0/24&#10;10.0.0.1"
                          className="font-mono text-sm"
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        One IP address or CIDR range per line
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* IP Enforcement */}
                <FormField
                  control={form.control}
                  name="ip_enforcement_enabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel>Enforce IP Allowlist</FormLabel>
                        <FormDescription>
                          Only allow connections from listed IPs
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Rate Limit */}
                <FormField
                  control={form.control}
                  name="rate_limit_rpm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rate Limit (RPM)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="100"
                          min={1}
                          max={10000}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Requests per minute (default: 100)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Daily Sync Quota */}
                <FormField
                  control={form.control}
                  name="daily_sync_quota"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Daily Sync Quota</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="1000"
                          min={1}
                          max={1000000}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Maximum syncs per day (default: 1000)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Monthly Data Quota */}
                <FormField
                  control={form.control}
                  name="monthly_data_quota_mb"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Monthly Data Quota (MB)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="10000"
                          min={1}
                          max={1000000}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Maximum data transfer per month (default: 10000 MB)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                data-testid="create-api-key-submit"
              >
                {createMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create API Key
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
