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
} from "@/lib/api/clients";
import { Client, ClientStatus } from "@/types/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";

/**
 * Client form validation schema
 */
const clientFormSchema = z.object({
  name: z
    .string()
    .min(1, "Client name is required")
    .max(255, "Client name must be 255 characters or less"),
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
});

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

  const createMutation = useCreateClient();
  const updateMutation = useUpdateClient();
  const deleteMutation = useDeleteClient();

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: {
      name: client?.name || "",
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
        // Update existing client
        await updateMutation.mutateAsync({
          clientId: client.client_id,
          data: {
            name: values.name,
            status: values.status,
            metadata,
          },
        });
        toast({
          title: "Success",
          description: "Client updated successfully",
        });
      } else {
        // Create new client
        await createMutation.mutateAsync({
          name: values.name,
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

      // Call onSuccess callback if provided
      if (onSuccess) {
        onSuccess();
      } else {
        // Default: navigate to clients list
        router.push("/clients");
      }
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

  const handleDelete = async () => {
    if (!client) return;

    setIsDeleting(true);
    try {
      await deleteMutation.mutateAsync(client.client_id);
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
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={
                    isSubmitting || isDeleting || client.status === "ACTIVE"
                  }
                  className="ml-auto"
                  data-testid="client-delete-button"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {isDeleting ? "Deleting..." : "Delete"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will soft delete the client &quot;{client.name}&quot;.
                    The client will be marked as deleted but can be recovered if
                    needed.
                    {client.status === "ACTIVE" && (
                      <span className="mt-2 block font-medium text-destructive">
                        Note: You must set the client status to INACTIVE before
                        deleting.
                      </span>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </form>
    </Form>
  );
}
