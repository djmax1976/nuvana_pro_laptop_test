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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Loader2,
  AlertTriangle,
  Copy,
  Check,
  RotateCw,
  Key,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRotateApiKey, RotateApiKeyResponse } from "@/lib/api/api-keys";

/**
 * Form validation schema for key rotation
 */
const rotateApiKeyFormSchema = z.object({
  grace_period_days: z.string(),
  new_label: z
    .string()
    .max(100, "Label must be at most 100 characters")
    .optional(),
  preserve_metadata: z.boolean(),
  preserve_ip_allowlist: z.boolean(),
});

type RotateApiKeyFormValues = z.infer<typeof rotateApiKeyFormSchema>;

interface RotateApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keyId: string | null;
  keyLabel: string;
}

/**
 * RotateApiKeyDialog component
 * Dialog for rotating an API key with grace period configuration
 *
 * CRITICAL: Shows the new raw API key ONCE after rotation - must be copied immediately
 *
 * Enterprise Standards Applied:
 * - FE-005: UI_SECURITY - Shows raw key once, provides copy functionality
 * - FE-002: FORM_VALIDATION - Comprehensive validation
 */
export function RotateApiKeyDialog({
  open,
  onOpenChange,
  keyId,
  keyLabel,
}: RotateApiKeyDialogProps) {
  const { toast } = useToast();
  const [rotatedKey, setRotatedKey] = useState<RotateApiKeyResponse | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  const rotateMutation = useRotateApiKey();

  const form = useForm<RotateApiKeyFormValues>({
    resolver: zodResolver(rotateApiKeyFormSchema),
    defaultValues: {
      grace_period_days: "7",
      new_label: "",
      preserve_metadata: true,
      preserve_ip_allowlist: true,
    },
  });

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      form.reset();
      setRotatedKey(null);
      setCopied(false);
    }
  }, [open, form]);

  const handleCopyKey = useCallback(async () => {
    if (!rotatedKey?.new_key?.raw_key) return;

    try {
      await navigator.clipboard.writeText(rotatedKey.new_key.raw_key);
      setCopied(true);
      toast({
        title: "API Key Copied",
        description: "The new API key has been copied to your clipboard",
      });
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast({
        title: "Failed to copy",
        description:
          "Could not copy to clipboard. Please select and copy manually.",
        variant: "destructive",
      });
    }
  }, [rotatedKey, toast]);

  const onSubmit = async (data: RotateApiKeyFormValues) => {
    if (!keyId) return;

    try {
      const gracePeriod = data.grace_period_days
        ? parseInt(data.grace_period_days, 10)
        : 7;
      const response = await rotateMutation.mutateAsync({
        keyId,
        data: {
          grace_period_days: !isNaN(gracePeriod) ? gracePeriod : 7,
          new_label: data.new_label || undefined,
          preserve_metadata: data.preserve_metadata,
          preserve_ip_allowlist: data.preserve_ip_allowlist,
        },
      });

      setRotatedKey(response.data);

      toast({
        title: "API Key Rotated",
        description: "Copy the new key now - it will not be shown again!",
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to rotate API key",
        variant: "destructive",
      });
    }
  };

  // If key was rotated, show the success state with copy functionality
  if (rotatedKey) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCw className="h-5 w-5 text-green-600" />
              API Key Rotated
            </DialogTitle>
            <DialogDescription>
              Your API key has been rotated. Copy the new key now - it will not
              be shown again.
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
                This is the only time you will see the new API key. Copy it now
                and update your desktop application.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <label className="text-sm font-medium">New API Key</label>
              <div className="flex gap-2">
                <Input
                  value={rotatedKey.new_key.raw_key}
                  readOnly
                  className="font-mono text-sm"
                  data-testid="rotated-api-key-value"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCopyKey}
                  data-testid="copy-rotated-key-button"
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
                <span className="text-muted-foreground">New Key ID:</span>
                <p className="font-mono text-xs">
                  {rotatedKey.new_key.api_key_id}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Old Key:</span>
                <p className="font-mono text-xs">
                  {rotatedKey.old_key.api_key_id}
                </p>
              </div>
            </div>

            {rotatedKey.old_key.grace_period_ends_at && (
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p className="font-medium">Grace Period Active</p>
                <p className="text-muted-foreground">
                  The old key will continue to work until{" "}
                  {new Date(
                    rotatedKey.old_key.grace_period_ends_at,
                  ).toLocaleString()}
                </p>
              </div>
            )}
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
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCw className="h-5 w-5" />
            Rotate API Key
          </DialogTitle>
          <DialogDescription>
            Rotating will create a new key and optionally allow a grace period
            for the old key.
          </DialogDescription>
        </DialogHeader>

        <div className="mb-4 p-3 bg-muted rounded-lg">
          <p className="text-sm font-medium">Current Key</p>
          <p className="text-sm text-muted-foreground">{keyLabel}</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Grace Period */}
            <FormField
              control={form.control}
              name="grace_period_days"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Grace Period (Days)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      max={30}
                      {...field}
                      data-testid="grace-period-input"
                    />
                  </FormControl>
                  <FormDescription>
                    How long the old key will continue to work (0-30 days)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* New Label */}
            <FormField
              control={form.control}
              name="new_label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New Label (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Leave empty to keep current label"
                      {...field}
                      data-testid="new-label-input"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Preserve Metadata */}
            <FormField
              control={form.control}
              name="preserve_metadata"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Preserve Metadata</FormLabel>
                    <FormDescription>
                      Copy metadata to the new key
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

            {/* Preserve IP Allowlist */}
            <FormField
              control={form.control}
              name="preserve_ip_allowlist"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Preserve IP Allowlist</FormLabel>
                    <FormDescription>
                      Copy IP allowlist to the new key
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
                disabled={rotateMutation.isPending}
                data-testid="rotate-api-key-submit"
              >
                {rotateMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Rotate Key
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
