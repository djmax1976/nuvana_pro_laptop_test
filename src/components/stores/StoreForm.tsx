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
  useStoreTerminals,
  useCreateTerminal,
  useUpdateTerminal,
  useDeleteTerminal,
  type Store,
  type StoreStatus,
  type Terminal,
  type TerminalWithStatus,
} from "@/lib/api/stores";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Edit2, X, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

/**
 * Validate IANA timezone format (safer implementation to avoid ReDoS)
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
      (val) => validateIANATimezoneFormat(val),
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
      address: locationData?.address ?? undefined,
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
        // Always include location_json if address is defined (even empty string clears it)
        ...(values.address != null
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

        {/* Terminal Management Section - Only show when editing existing store */}
        {store && <TerminalManagementSection storeId={store.store_id} />}

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

/**
 * Terminal Management Section Component
 * Allows adding, editing, and deleting terminals for a store
 */
function TerminalManagementSection({ storeId }: { storeId: string }) {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTerminal, setEditingTerminal] =
    useState<TerminalWithStatus | null>(null);
  const [terminalName, setTerminalName] = useState("");
  const [terminalDeviceId, setTerminalDeviceId] = useState("");
  const [terminalStatus, setTerminalStatus] = useState<
    "ACTIVE" | "INACTIVE" | "MAINTENANCE"
  >("ACTIVE");

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
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Terminal</DialogTitle>
            <DialogDescription>
              Create a new POS terminal for this store
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Terminal Name</label>
              <Input
                value={terminalName}
                onChange={(e) => setTerminalName(e.target.value)}
                placeholder="e.g., Terminal 1"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">
                Device ID (Optional)
              </label>
              <Input
                value={terminalDeviceId}
                onChange={(e) => setTerminalDeviceId(e.target.value)}
                placeholder="e.g., DEV-001"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Status</label>
              <Select
                value={terminalStatus}
                onValueChange={(value) =>
                  setTerminalStatus(
                    value as "ACTIVE" | "INACTIVE" | "MAINTENANCE",
                  )
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                  <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreateDialogOpen(false);
                  setTerminalName("");
                  setTerminalDeviceId("");
                  setTerminalStatus("ACTIVE");
                }}
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
              <label className="text-sm font-medium">Terminal Name</label>
              <Input
                value={terminalName}
                onChange={(e) => setTerminalName(e.target.value)}
                placeholder="e.g., Terminal 1"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">
                Device ID (Optional)
              </label>
              <Input
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
