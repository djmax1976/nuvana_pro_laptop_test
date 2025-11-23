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
  useCreateClient,
  useUpdateClient,
  useDeleteClient,
  getClientById,
} from "@/lib/api/clients";
import { Client, ClientStatus } from "@/types/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Trash2, Eye, EyeOff } from "lucide-react";

/**
 * Client form validation schema
 */
const clientFormSchema = z
  .object({
    name: z
      .string()
      .min(1, "Client name is required")
      .max(255, "Client name must be 255 characters or less"),
    email: z
      .string()
      .email("Invalid email address")
      .max(255, "Email must be 255 characters or less"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .optional()
      .or(z.literal("")),
    confirmPassword: z.string().optional().or(z.literal("")),
    status: z.nativeEnum(ClientStatus, {
      message: "Please select a status",
    }),
    metadata: z
      .string()
      .optional()
      .refine(
        (val) => {
          if (!val || val.trim() === "") return true;
          try {
            JSON.parse(val);
            return true;
          } catch {
            return false;
          }
        },
        { message: "Invalid JSON format" },
      ),
  })
  .refine(
    (data) => {
      // If password is provided, confirmPassword must match
      if (data.password && data.password.trim() !== "") {
        return data.password === data.confirmPassword;
      }
      return true;
    },
    {
      message: "Passwords do not match",
      path: ["confirmPassword"],
    },
  );

type ClientFormValues = z.infer<typeof clientFormSchema>;

interface ClientFormProps {
  client?: Client;
  onSuccess?: () => void;
}

/**
 * ClientForm component
 * Form for creating or editing a client
 * Uses Shadcn/ui Form components with Zod validation
 */
export function ClientForm({ client, onSuccess }: ClientFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showStatusChangeDialog, setShowStatusChangeDialog] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<ClientStatus | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const createMutation = useCreateClient();
  const updateMutation = useUpdateClient();
  const deleteMutation = useDeleteClient();

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: {
      name: client?.name || "",
      email: client?.email || "",
      password: "",
      confirmPassword: "",
      status: client?.status || ClientStatus.ACTIVE,
      metadata: client?.metadata
        ? JSON.stringify(client.metadata, null, 2)
        : "",
    },
  });

  const onSubmit = async (values: ClientFormValues) => {
    setIsSubmitting(true);
    try {
      const metadata =
        values.metadata && values.metadata.trim()
          ? JSON.parse(values.metadata)
          : undefined;

      if (client) {
        // Update existing client (using public_id for cleaner URLs)
        const updateData: Record<string, unknown> = {
          name: values.name,
          email: values.email,
          status: values.status,
          metadata,
        };

        // Only include password if it's not empty
        if (values.password && values.password.trim()) {
          updateData.password = values.password;
        }

        await updateMutation.mutateAsync({
          clientId: client.public_id,
          data: updateData,
        });
        toast({
          title: "Success",
          description: "Client updated successfully",
        });
      } else {
        // Create new client
        await createMutation.mutateAsync({
          name: values.name,
          email: values.email,
          password: values.password,
          status: values.status,
          metadata,
        });
        toast({
          title: "Success",
          description: "Client created successfully",
        });
      }

      // Reset form if creating
      if (!client) {
        form.reset();
      }

      // Call onSuccess callback if provided, otherwise do nothing (stay on page)
      if (onSuccess) {
        onSuccess();
      }
      // Don't redirect - stay on the same page after update
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to save client. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = (newStatus: ClientStatus) => {
    // Only show confirmation for editing existing clients
    if (client && client.status !== newStatus) {
      setPendingStatus(newStatus);
      setShowStatusChangeDialog(true);
    } else {
      // For new clients, just set the value
      form.setValue("status", newStatus);
    }
  };

  const confirmStatusChange = () => {
    if (pendingStatus) {
      form.setValue("status", pendingStatus);
    }
    setShowStatusChangeDialog(false);
    setPendingStatus(null);
  };

  const handleDelete = async () => {
    if (!client) return;

    setIsDeleting(true);
    try {
      // Refetch the latest client data to ensure we have the current status (using public_id)
      const freshClientData = await getClientById(client.public_id);
      const freshClient = freshClientData.data;

      // Check if the client is still ACTIVE
      if (freshClient.status === "ACTIVE") {
        toast({
          title: "Cannot Delete Active Client",
          description:
            "Please set the client status to INACTIVE and save before deleting.",
          variant: "destructive",
        });
        setIsDeleting(false);
        return;
      }

      await deleteMutation.mutateAsync(client.public_id);
      toast({
        title: "Success",
        description: "Client deleted successfully",
      });
      router.push("/clients");
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to delete client. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
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
              <FormLabel>Client Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="Enter client name"
                  {...field}
                  disabled={isSubmitting}
                  data-testid="client-name-input"
                />
              </FormControl>
              <FormDescription>
                The name of the client organization (required, max 255
                characters)
              </FormDescription>
              <FormMessage data-testid="form-error-message" />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="client@example.com"
                  autoComplete="email"
                  {...field}
                  disabled={isSubmitting}
                  data-testid="client-email-input"
                />
              </FormControl>
              <FormDescription>
                Client email address (required, max 255 characters)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Password {client && "(leave blank to keep current)"}
              </FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder={client ? "••••••••" : "Enter password"}
                    autoComplete="new-password"
                    {...field}
                    disabled={isSubmitting}
                    data-testid="client-password-input"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isSubmitting}
                    data-testid="toggle-password-visibility"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </FormControl>
              <FormDescription>
                {client
                  ? "Enter a new password only if you want to change it (min 8 characters)"
                  : "Password for the client (optional, min 8 characters if provided)"}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Confirm Password {client && "(leave blank to keep current)"}
              </FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder={client ? "••••••••" : "Confirm password"}
                    autoComplete="new-password"
                    {...field}
                    disabled={isSubmitting}
                    data-testid="client-confirm-password-input"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    disabled={isSubmitting}
                    data-testid="toggle-confirm-password-visibility"
                    aria-label={
                      showConfirmPassword
                        ? "Hide confirm password"
                        : "Show confirm password"
                    }
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </FormControl>
              <FormDescription>
                Re-enter the password to confirm
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
                  <SelectTrigger data-testid="client-status-select">
                    <SelectValue placeholder="Select a status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                The current status of the client
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="metadata"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Metadata (Optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder='{"key": "value"}'
                  className="font-mono text-sm"
                  rows={4}
                  {...field}
                  disabled={isSubmitting}
                  data-testid="client-metadata-textarea"
                />
              </FormControl>
              <FormDescription>
                Optional JSON metadata for custom fields
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-4">
          <Button
            type="submit"
            disabled={isSubmitting || isDeleting}
            data-testid="client-submit-button"
          >
            {isSubmitting
              ? "Saving..."
              : client
                ? "Update Client"
                : "Create Client"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isSubmitting || isDeleting}
            data-testid="client-cancel-button"
          >
            Cancel
          </Button>

          {client && (
            <Button
              type="button"
              variant="destructive"
              disabled={
                isSubmitting || isDeleting || client.status === "ACTIVE"
              }
              className="ml-auto"
              data-testid="client-delete-button"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          )}
        </div>
      </form>

      {/* Status Change Confirmation Dialog */}
      <ConfirmDialog
        open={showStatusChangeDialog}
        onOpenChange={setShowStatusChangeDialog}
        title={`Change status to ${pendingStatus}?`}
        description={`Are you sure you want to change this client's status to ${pendingStatus}? ${
          pendingStatus === "INACTIVE"
            ? "This will disable their access."
            : "This will enable their access."
        }`}
        confirmText={`Change to ${pendingStatus}`}
        cancelText="Cancel"
        onConfirm={confirmStatusChange}
        destructive={pendingStatus === "INACTIVE"}
      />

      {/* Delete Confirmation Dialog with Text Input */}
      {client && (
        <ConfirmDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          title="Delete Client?"
          description={`This will permanently delete "${client.name}". This action cannot be undone. All data will be permanently removed.${
            client.status === "ACTIVE"
              ? "\n\nNote: You must set the client status to INACTIVE and save before deleting."
              : ""
          }`}
          confirmText="Delete Permanently"
          cancelText="Cancel"
          requiresTextConfirmation={true}
          confirmationText="DELETE"
          confirmationLabel='Type "DELETE" to confirm'
          onConfirm={handleDelete}
          destructive={true}
          isLoading={isDeleting}
        />
      )}
    </Form>
  );
}
