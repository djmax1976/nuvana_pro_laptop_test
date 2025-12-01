"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useUpdateStore,
  useStoreTerminals,
  useCreateTerminal,
  useUpdateTerminal,
  useDeleteTerminal,
  type Store,
  type Terminal,
  type TerminalWithStatus,
} from "@/lib/api/stores";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Edit2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * Validate IANA timezone format (safer implementation to avoid ReDoS)
 * Supports multi-segment zones (e.g., America/Argentina/Buenos_Aires)
 * and UTC/GMT offsets
 */
function validateIANATimezoneFormat(timezone: string): boolean {
  if (timezone === "UTC") {
    return true;
  }
  if (/^GMT[+-]\d{1,2}$/.test(timezone)) {
    return true;
  }
  // Limit length to prevent ReDoS
  if (timezone.length > 50) {
    return false;
  }
  // Split and validate each segment instead of using nested quantifiers
  const parts = timezone.split("/");
  if (parts.length < 2 || parts.length > 3) {
    return false;
  }
  // Each part should contain only letters and underscores
  const segmentPattern = /^[A-Za-z_]+$/;
  return parts.every((part) => segmentPattern.test(part));
}

/**
 * Cache for supported timezones from Intl API
 */
let supportedTimezonesCache: Set<string> | null = null;

/**
 * Get supported timezones from Intl API, with caching
 */
function getSupportedTimezones(): Set<string> | null {
  if (supportedTimezonesCache !== null) {
    return supportedTimezonesCache;
  }

  try {
    // Check if Intl.supportedValuesOf is available (ES2022+)
    if (
      typeof Intl !== "undefined" &&
      typeof Intl.supportedValuesOf === "function"
    ) {
      const timezones = Intl.supportedValuesOf("timeZone");
      supportedTimezonesCache = new Set(timezones);
      return supportedTimezonesCache;
    }
  } catch (error) {
    // If Intl.supportedValuesOf throws (e.g., not supported), fall back to regex
    console.warn("Intl.supportedValuesOf not available, using regex fallback");
  }

  return null;
}

/**
 * Validate IANA timezone format
 * Prefers Intl.supportedValuesOf when available, falls back to permissive regex
 */
function validateIANATimezone(timezone: string): boolean {
  if (!timezone || typeof timezone !== "string") {
    return false;
  }

  // Try Intl.supportedValuesOf first (most accurate)
  const supportedTimezones = getSupportedTimezones();
  if (supportedTimezones !== null) {
    return supportedTimezones.has(timezone);
  }

  // Fallback to safer validation function
  return validateIANATimezoneFormat(timezone);
}

/**
 * Store edit form validation schema
 */
const editStoreSchema = z.object({
  name: z
    .string()
    .min(1, "Store name is required")
    .max(255, "Store name must be 255 characters or less"),
  timezone: z
    .string()
    .min(1, "Timezone is required")
    .refine(
      (val) => validateIANATimezone(val),
      "Timezone must be in IANA format (e.g., America/New_York, Europe/London)",
    ),
  address: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "CLOSED"], {
    message: "Please select a status",
  }),
});

type EditStoreFormValues = z.infer<typeof editStoreSchema>;

interface EditStoreModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  store: Store | null;
  onSuccess?: () => void;
}

/**
 * EditStoreModal component
 * Modal dialog for editing an existing store
 * Uses Shadcn/ui Dialog and Form components with Zod validation
 */
export function EditStoreModal({
  open,
  onOpenChange,
  store,
  onSuccess,
}: EditStoreModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showStatusChangeDialog, setShowStatusChangeDialog] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);

  const updateMutation = useUpdateStore();

  const form = useForm<EditStoreFormValues>({
    resolver: zodResolver(editStoreSchema),
    defaultValues: {
      name: "",
      timezone: "America/New_York",
      address: "",
      status: "ACTIVE",
    },
  });

  // Sync form state when store prop changes
  useEffect(() => {
    if (store && open) {
      form.reset({
        name: store.name || "",
        timezone: store.timezone || "America/New_York",
        address: store.location_json?.address || "",
        status: store.status || "ACTIVE",
      });
    }
  }, [store, open, form]);

  const handleStatusChange = (newStatus: string) => {
    const currentFormStatus = form.getValues("status");
    // Compare against current form value to detect any status change from the form's current state
    if (currentFormStatus !== newStatus) {
      // Only show confirmation for INACTIVE or CLOSED (destructive changes)
      // Changing to ACTIVE is non-destructive and doesn't need confirmation
      if (newStatus === "INACTIVE" || newStatus === "CLOSED") {
        setPendingStatus(newStatus);
        setShowStatusChangeDialog(true);
      } else {
        form.setValue("status", newStatus as EditStoreFormValues["status"]);
      }
    }
  };

  const confirmStatusChange = () => {
    if (pendingStatus) {
      form.setValue("status", pendingStatus as EditStoreFormValues["status"]);
    }
    setShowStatusChangeDialog(false);
    setPendingStatus(null);
  };

  const onSubmit = async (values: EditStoreFormValues) => {
    if (!store) return;

    setIsSubmitting(true);
    try {
      const updateData = {
        name: values.name,
        timezone: values.timezone,
        status: values.status,
        // Always include location_json if address is provided (even empty string clears it)
        ...(values.address !== undefined
          ? { location_json: { address: values.address } }
          : {}),
      };

      await updateMutation.mutateAsync({
        storeId: store.store_id,
        data: updateData,
      });

      toast({
        title: "Success",
        description: "Store updated successfully",
      });

      // Reset form and close modal
      form.reset();
      onOpenChange(false);

      // Call onSuccess callback if provided
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to update store. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    form.reset();
    onOpenChange(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && open) {
      form.reset();
    }
    onOpenChange(newOpen);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Store</DialogTitle>
            <DialogDescription>
              Update store information including name, timezone, address, and
              status.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-6"
              noValidate
            >
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
                      IANA timezone format (e.g., America/New_York,
                      Europe/London, UTC)
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
                      onValueChange={handleStatusChange}
                      value={field.value}
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
                    <FormDescription>
                      The current status of the store
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Terminal Management Section */}
              {store && <TerminalManagementSection storeId={store.store_id} />}

              <div className="flex gap-4 justify-end pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancel}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Updating..." : "Update Store"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Status Change Confirmation Dialog */}
      <ConfirmDialog
        open={showStatusChangeDialog}
        onOpenChange={setShowStatusChangeDialog}
        title={`Change status to ${pendingStatus}?`}
        description={`Are you sure you want to change this store's status to ${pendingStatus}?`}
        confirmText={`Change to ${pendingStatus}`}
        cancelText="Cancel"
        onConfirm={confirmStatusChange}
        destructive={pendingStatus === "INACTIVE" || pendingStatus === "CLOSED"}
      />
    </>
  );
}

/**
 * Terminal Management Section Component
 * Allows adding, editing, and deleting terminals for a store
 * Reused in both StoreForm and EditStoreModal
 */
function TerminalManagementSection({ storeId }: { storeId: string }) {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTerminal, setEditingTerminal] =
    useState<TerminalWithStatus | null>(null);
  const [terminalName, setTerminalName] = useState("");
  const [terminalDeviceId, setTerminalDeviceId] = useState("");

  const { data: terminals, isLoading } = useStoreTerminals(storeId);
  const createMutation = useCreateTerminal();
  const updateMutation = useUpdateTerminal();
  const deleteMutation = useDeleteTerminal();

  const handleCreateTerminal = async () => {
    if (!terminalName.trim()) {
      toast({
        title: "Error",
        description: "Terminal name is required",
        variant: "destructive",
      });
      return;
    }

    try {
      await createMutation.mutateAsync({
        storeId,
        data: {
          name: terminalName.trim(),
          device_id: terminalDeviceId.trim() || undefined,
        },
      });
      toast({
        title: "Success",
        description: "Terminal created successfully",
      });
      setIsCreateDialogOpen(false);
      setTerminalName("");
      setTerminalDeviceId("");
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to create terminal. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleUpdateTerminal = async () => {
    if (!editingTerminal) return;
    if (!terminalName.trim()) {
      toast({
        title: "Error",
        description: "Terminal name is required",
        variant: "destructive",
      });
      return;
    }

    try {
      await updateMutation.mutateAsync({
        storeId,
        terminalId: editingTerminal.pos_terminal_id,
        data: {
          name: terminalName.trim(),
          device_id: terminalDeviceId.trim() || undefined,
        },
      });
      toast({
        title: "Success",
        description: "Terminal updated successfully",
      });
      setEditingTerminal(null);
      setTerminalName("");
      setTerminalDeviceId("");
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to update terminal. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteTerminal = async (terminal: TerminalWithStatus) => {
    if (
      !confirm(
        `Are you sure you want to delete terminal "${terminal.name}"? This action cannot be undone.`,
      )
    ) {
      return;
    }

    try {
      await deleteMutation.mutateAsync({
        storeId,
        terminalId: terminal.pos_terminal_id,
      });
      toast({
        title: "Success",
        description: "Terminal deleted successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to delete terminal. Please try again.",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (terminal: TerminalWithStatus) => {
    setEditingTerminal(terminal);
    setTerminalName(terminal.name);
    setTerminalDeviceId(terminal.device_id || "");
  };

  const closeEditDialog = () => {
    setEditingTerminal(null);
    setTerminalName("");
    setTerminalDeviceId("");
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>POS Terminals</CardTitle>
            <Button
              type="button"
              size="sm"
              onClick={() => setIsCreateDialogOpen(true)}
              disabled={
                createMutation.isPending ||
                updateMutation.isPending ||
                deleteMutation.isPending
              }
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Terminal
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading terminals...
            </p>
          ) : !terminals || terminals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No terminals configured. Add a terminal to get started.
            </p>
          ) : (
            <div className="space-y-2">
              {terminals.map((terminal) => (
                <div
                  key={terminal.pos_terminal_id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{terminal.name}</span>
                      {terminal.has_active_shift && (
                        <Badge variant="outline">Active Shift</Badge>
                      )}
                    </div>
                    {terminal.device_id && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Device ID: {terminal.device_id}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(terminal)}
                      disabled={
                        createMutation.isPending ||
                        updateMutation.isPending ||
                        deleteMutation.isPending
                      }
                      aria-label={`Edit ${terminal.name}`}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteTerminal(terminal)}
                      disabled={
                        createMutation.isPending ||
                        updateMutation.isPending ||
                        deleteMutation.isPending ||
                        terminal.has_active_shift
                      }
                      aria-label={`Delete ${terminal.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Terminal Dialog */}
      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          setIsCreateDialogOpen(open);
          if (!open) {
            setTerminalName("");
            setTerminalDeviceId("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Terminal</DialogTitle>
            <DialogDescription>
              Create a new POS terminal for this store
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label htmlFor="terminal-name" className="text-sm font-medium">
                Terminal Name
              </label>
              <Input
                id="terminal-name"
                value={terminalName}
                onChange={(e) => setTerminalName(e.target.value)}
                placeholder="e.g., Terminal 1"
                className="mt-1"
              />
            </div>
            <div>
              <label
                htmlFor="terminal-device-id"
                className="text-sm font-medium"
              >
                Device ID (Optional)
              </label>
              <Input
                id="terminal-device-id"
                value={terminalDeviceId}
                onChange={(e) => setTerminalDeviceId(e.target.value)}
                placeholder="e.g., DEV-001"
                className="mt-1"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateTerminal}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "Creating..." : "Create Terminal"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Terminal Dialog */}
      <Dialog
        open={!!editingTerminal}
        onOpenChange={(open) => !open && closeEditDialog()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Terminal</DialogTitle>
            <DialogDescription>Update terminal information</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="edit-terminal-name"
                className="text-sm font-medium"
              >
                Terminal Name
              </label>
              <Input
                id="edit-terminal-name"
                value={terminalName}
                onChange={(e) => setTerminalName(e.target.value)}
                placeholder="e.g., Terminal 1"
                className="mt-1"
              />
            </div>
            <div>
              <label
                htmlFor="edit-terminal-device-id"
                className="text-sm font-medium"
              >
                Device ID (Optional)
              </label>
              <Input
                id="edit-terminal-device-id"
                value={terminalDeviceId}
                onChange={(e) => setTerminalDeviceId(e.target.value)}
                placeholder="e.g., DEV-001"
                className="mt-1"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeEditDialog}>
                Cancel
              </Button>
              <Button
                onClick={handleUpdateTerminal}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "Updating..." : "Update Terminal"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
