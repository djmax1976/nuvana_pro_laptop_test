"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateUser } from "@/lib/api/admin-users";
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
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

// Zod validation schema for user creation
const userFormSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Invalid email format")
    .max(255, "Email cannot exceed 255 characters"),
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name cannot exceed 255 characters")
    .refine((val) => val.trim().length > 0, {
      message: "Name cannot be whitespace only",
    }),
});

type UserFormValues = z.infer<typeof userFormSchema>;

/**
 * UserForm component
 * Form for creating new users (System Admin only)
 * Uses Shadcn/ui Form with react-hook-form and Zod validation
 */
export function UserForm() {
  const router = useRouter();
  const { toast } = useToast();
  const createUserMutation = useCreateUser();

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      email: "",
      name: "",
    },
  });

  async function onSubmit(data: UserFormValues) {
    try {
      await createUserMutation.mutateAsync({
        email: data.email.trim(),
        name: data.name.trim(),
      });

      toast({
        title: "User created",
        description: `Successfully created user ${data.name}`,
      });

      // Navigate to user list
      router.push("/admin/users");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error creating user",
        description:
          error instanceof Error ? error.message : "An unknown error occurred",
      });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="user@example.com"
                  data-testid="user-email-input"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                The user&apos;s email address for login
              </FormDescription>
              <FormMessage data-testid="user-form-error" />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="John Doe"
                  data-testid="user-name-input"
                  {...field}
                />
              </FormControl>
              <FormDescription>The user&apos;s display name</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-4">
          <Button
            type="submit"
            disabled={createUserMutation.isPending}
            data-testid="user-form-submit"
          >
            {createUserMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Create User
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/admin/users")}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
