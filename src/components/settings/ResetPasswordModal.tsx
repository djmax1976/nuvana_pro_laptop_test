"use client";

/**
 * Reset Password Modal Component
 * Modal for resetting an employee's password with strength validation
 *
 * Story 6.14: Store Settings Page with Employee/Cashier Management
 * AC #6: Modal opens, allows entering new password with strength validation, saves and closes
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
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
import {
  useResetEmployeePassword,
  type Employee,
} from "@/lib/api/client-employees";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Password reset form schema
 * Matches backend validation requirements
 */
const passwordFormSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(255, "Password cannot exceed 255 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[0-9]/, "Password must contain at least one number")
      .regex(
        /[^A-Za-z0-9]/,
        "Password must contain at least one special character",
      ),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type PasswordFormValues = z.infer<typeof passwordFormSchema>;

interface ResetPasswordModalProps {
  employee: Employee;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Calculate password strength based on requirements
 */
function getPasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
} {
  if (!password) {
    return { score: 0, label: "", color: "" };
  }

  let score = 0;
  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };

  if (checks.length) score++;
  if (checks.uppercase) score++;
  if (checks.lowercase) score++;
  if (checks.number) score++;
  if (checks.special) score++;

  if (score <= 2) {
    return { score, label: "Weak", color: "text-destructive" };
  } else if (score <= 4) {
    return { score, label: "Medium", color: "text-yellow-600" };
  } else {
    return { score, label: "Strong", color: "text-green-600" };
  }
}

export function ResetPasswordModal({
  employee,
  open,
  onOpenChange,
}: ResetPasswordModalProps) {
  const { toast } = useToast();
  const resetPasswordMutation = useResetEmployeePassword();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const password = form.watch("password");
  const passwordStrength = getPasswordStrength(password);

  const onSubmit = async (values: PasswordFormValues) => {
    try {
      await resetPasswordMutation.mutateAsync({
        userId: employee.user_id,
        password: values.password,
      });

      toast({
        title: "Password reset",
        description: `Password has been reset successfully for ${employee.name}.`,
      });

      onOpenChange(false);
      form.reset();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to reset password",
        variant: "destructive",
      });
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      form.reset();
      setShowPassword(false);
      setShowConfirmPassword(false);
    }
    onOpenChange(newOpen);
  };

  // Password requirement checks
  const passwordChecks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset Password</DialogTitle>
          <DialogDescription>
            Set a new password for {employee.name}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New Password</FormLabel>
                  <FormControl>
                    <div className="space-y-2">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter new password"
                        {...field}
                        disabled={resetPasswordMutation.isPending}
                        data-testid="password-input"
                      />
                      {password && (
                        <div
                          className="space-y-1 text-xs"
                          data-testid="password-strength-indicator"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">
                              Strength:
                            </span>
                            <span
                              className={cn(
                                "font-medium",
                                passwordStrength.color,
                              )}
                            >
                              {passwordStrength.label}
                            </span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              {passwordChecks.length ? (
                                <CheckCircle2 className="h-3 w-3 text-green-600" />
                              ) : (
                                <XCircle className="h-3 w-3 text-muted-foreground" />
                              )}
                              <span
                                className={
                                  passwordChecks.length
                                    ? "text-green-600"
                                    : "text-muted-foreground"
                                }
                              >
                                At least 8 characters
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {passwordChecks.uppercase ? (
                                <CheckCircle2 className="h-3 w-3 text-green-600" />
                              ) : (
                                <XCircle className="h-3 w-3 text-muted-foreground" />
                              )}
                              <span
                                className={
                                  passwordChecks.uppercase
                                    ? "text-green-600"
                                    : "text-muted-foreground"
                                }
                              >
                                One uppercase letter
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {passwordChecks.lowercase ? (
                                <CheckCircle2 className="h-3 w-3 text-green-600" />
                              ) : (
                                <XCircle className="h-3 w-3 text-muted-foreground" />
                              )}
                              <span
                                className={
                                  passwordChecks.lowercase
                                    ? "text-green-600"
                                    : "text-muted-foreground"
                                }
                              >
                                One lowercase letter
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {passwordChecks.number ? (
                                <CheckCircle2 className="h-3 w-3 text-green-600" />
                              ) : (
                                <XCircle className="h-3 w-3 text-muted-foreground" />
                              )}
                              <span
                                className={
                                  passwordChecks.number
                                    ? "text-green-600"
                                    : "text-muted-foreground"
                                }
                              >
                                One number
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {passwordChecks.special ? (
                                <CheckCircle2 className="h-3 w-3 text-green-600" />
                              ) : (
                                <XCircle className="h-3 w-3 text-muted-foreground" />
                              )}
                              <span
                                className={
                                  passwordChecks.special
                                    ? "text-green-600"
                                    : "text-muted-foreground"
                                }
                              >
                                One special character
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm Password</FormLabel>
                  <FormControl>
                    <Input
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Confirm new password"
                      {...field}
                      disabled={resetPasswordMutation.isPending}
                      data-testid="confirm-password-input"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={resetPasswordMutation.isPending}
                data-testid="cancel-button"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={resetPasswordMutation.isPending}
                data-testid="save-button"
              >
                {resetPasswordMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
