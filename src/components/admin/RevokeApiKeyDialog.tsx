"use client";

import { useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRevokeApiKey, ApiKeyRevocationReason } from "@/lib/api/api-keys";

/**
 * Revocation reasons matching backend enum
 */
const REVOCATION_REASONS: {
  value: ApiKeyRevocationReason;
  label: string;
  description: string;
}[] = [
  {
    value: "ADMIN_ACTION",
    label: "Admin Action",
    description: "Manual revocation by administrator",
  },
  {
    value: "COMPROMISED",
    label: "Compromised",
    description: "Key may have been exposed or leaked",
  },
  {
    value: "STORE_CLOSED",
    label: "Store Closed",
    description: "The associated store has been closed",
  },
  {
    value: "QUOTA_ABUSE",
    label: "Quota Abuse",
    description: "Excessive or abusive usage detected",
  },
  {
    value: "ROTATION",
    label: "Rotation",
    description: "Key is being replaced with a new one",
  },
];

/**
 * Form validation schema for key revocation
 */
const revokeApiKeyFormSchema = z.object({
  reason: z.string().min(1, "Please select a reason"),
  notes: z.string().max(1000, "Notes cannot exceed 1000 characters").optional(),
  notify_admins: z.boolean(),
});

type RevokeApiKeyFormValues = z.infer<typeof revokeApiKeyFormSchema>;

interface RevokeApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keyId: string | null;
  keyLabel: string;
}

/**
 * RevokeApiKeyDialog component
 * Dialog for permanently revoking an API key
 *
 * Enterprise Standards Applied:
 * - FE-002: FORM_VALIDATION - Requires reason selection
 * - SEC-014: INPUT_VALIDATION - Strict enum for reason
 */
export function RevokeApiKeyDialog({
  open,
  onOpenChange,
  keyId,
  keyLabel,
}: RevokeApiKeyDialogProps) {
  const { toast } = useToast();

  const revokeMutation = useRevokeApiKey();

  const form = useForm<RevokeApiKeyFormValues>({
    resolver: zodResolver(revokeApiKeyFormSchema),
    defaultValues: {
      reason: "",
      notes: "",
      notify_admins: false,
    },
  });

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      form.reset();
    }
  }, [open, form]);

  const onSubmit = async (data: RevokeApiKeyFormValues) => {
    if (!keyId) return;

    try {
      await revokeMutation.mutateAsync({
        keyId,
        data: {
          reason: data.reason as ApiKeyRevocationReason,
          notes: data.notes || undefined,
          notify_admins: data.notify_admins,
        },
      });

      toast({
        title: "API Key Revoked",
        description: "The API key has been permanently revoked",
      });

      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to revoke API key",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <XCircle className="h-5 w-5" />
            Revoke API Key
          </DialogTitle>
          <DialogDescription>
            Permanently revoke this API key. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Warning</AlertTitle>
          <AlertDescription>
            Revoking this key will immediately disconnect the desktop
            application from the cloud. The application will not be able to sync
            until a new key is configured.
          </AlertDescription>
        </Alert>

        <div className="p-3 bg-muted rounded-lg">
          <p className="text-sm font-medium">Key to Revoke</p>
          <p className="text-sm text-muted-foreground">{keyLabel}</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Reason Selection */}
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="revoke-reason-select">
                        <SelectValue placeholder="Select a reason" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {REVOCATION_REASONS.map((reason) => (
                        <SelectItem key={reason.value} value={reason.value}>
                          <div className="flex flex-col">
                            <span>{reason.label}</span>
                            <span className="text-xs text-muted-foreground">
                              {reason.description}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Additional details about this revocation..."
                      rows={3}
                      {...field}
                      data-testid="revoke-notes-input"
                    />
                  </FormControl>
                  <FormDescription>Max 1000 characters</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Notify Admins */}
            <FormField
              control={form.control}
              name="notify_admins"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Notify Admins</FormLabel>
                    <FormDescription>
                      Send notification to other administrators
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
                variant="destructive"
                disabled={revokeMutation.isPending}
                data-testid="revoke-api-key-submit"
              >
                {revokeMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Revoke Key
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
