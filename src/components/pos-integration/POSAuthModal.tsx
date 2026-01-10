"use client";

/**
 * POS Authentication Modal Component
 *
 * Enterprise-grade step-up authentication modal for POS Integration access.
 * Requires users to re-enter email and password before accessing POS Integration features.
 *
 * IMPORTANT: This modal uses a dedicated verification endpoint that does NOT modify
 * the user's session. It returns a short-lived elevation token that must be passed
 * to POS API calls.
 *
 * Security Standards Applied:
 * - SEC-010: AUTHZ - Step-up authentication without session modification
 * - SEC-012: SESSION_TIMEOUT - Short-lived elevation tokens (5 minutes)
 * - SEC-014: INPUT_VALIDATION - Strict schema validation for email and password
 * - FE-002: FORM_VALIDATION - Client-side validation mirroring backend constraints
 * - API-003: ERROR_HANDLING - Generic error messages, no sensitive data leakage
 *
 * @module components/pos-integration/POSAuthModal
 */

import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Shield } from "lucide-react";
import { PERMISSION_CODES } from "@/config/menu-permissions";
import { useElevationToken } from "@/contexts/ElevationTokenContext";

// ============================================================================
// Constants
// ============================================================================

const BACKEND_URL =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001"
    : "http://localhost:3001";

/** Request timeout for authentication (5 seconds) */
const AUTH_TIMEOUT_MS = 5000;

/** Required permission for POS Integration access */
const REQUIRED_PERMISSION = PERMISSION_CODES.POS_SYNC_TRIGGER;

// ============================================================================
// Validation Schema
// ============================================================================

/**
 * Form validation schema for POS authentication
 *
 * SEC-014: INPUT_VALIDATION
 * - Email: RFC 5322 compliant format, max 254 characters
 * - Password: Required, no minimum for re-auth (user already has password set)
 *
 * FE-002: FORM_VALIDATION
 * - Mirrors backend validation constraints
 */
const posAuthFormSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .max(254, "Email must not exceed 254 characters")
    .email("Please enter a valid email address")
    .transform((val) => val.toLowerCase().trim()),
  password: z.string().min(1, "Password is required"),
});

type POSAuthFormValues = z.infer<typeof posAuthFormSchema>;

// ============================================================================
// Types
// ============================================================================

interface POSAuthModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Callback when modal open state changes */
  onOpenChange: (open: boolean) => void;
  /** Target URL to navigate to after successful authentication */
  targetUrl?: string;
  /** Store ID for scope binding (optional, extracted from targetUrl if not provided) */
  storeId?: string;
}

interface ElevatedAccessResponse {
  success: boolean;
  data?: {
    elevation_token: string;
    expires_in: number;
    expires_at: string;
    permission: string;
    store_id: string | null;
  };
  error?: {
    code: string;
    message: string;
    retry_after_seconds?: number;
  };
}

// ============================================================================
// Component
// ============================================================================

/**
 * POS Authentication Modal
 *
 * Displays a modal dialog requiring email/password re-authentication
 * before allowing access to POS Integration features.
 *
 * ENTERPRISE-GRADE FLOW:
 * 1. User clicks POS Integration link in sidebar
 * 2. Modal opens requesting email and password
 * 3. On submit, calls /api/auth/verify-elevated-access (NOT /login)
 * 4. Endpoint verifies credentials and POS_SYNC_TRIGGER permission
 * 5. Returns a short-lived elevation token (does NOT modify session)
 * 6. Token is stored in ElevationTokenContext
 * 7. User navigates to POS Integration page
 * 8. POS API calls include the elevation token in X-Elevation-Token header
 *
 * This approach:
 * - Does NOT modify the user's session (no cookie changes)
 * - Uses short-lived tokens (5 minutes default)
 * - Tokens are single-use (replay protection)
 * - Tokens are scoped to specific permission and store
 * - All attempts are audit logged
 *
 * @example
 * ```tsx
 * <POSAuthModal
 *   open={showAuthModal}
 *   onOpenChange={setShowAuthModal}
 *   targetUrl="/mystore/pos-integration?storeId=xxx"
 *   storeId="xxx"
 * />
 * ```
 */
export function POSAuthModal({
  open,
  onOpenChange,
  targetUrl = "/mystore/pos-integration",
  storeId,
}: POSAuthModalProps): JSX.Element {
  const router = useRouter();
  const { setToken } = useElevationToken();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Extract storeId from targetUrl if not provided directly
  const effectiveStoreId =
    storeId ||
    (() => {
      try {
        const url = new URL(targetUrl, window.location.origin);
        return url.searchParams.get("storeId") || undefined;
      } catch {
        return undefined;
      }
    })();

  const form = useForm<POSAuthFormValues>({
    resolver: zodResolver(posAuthFormSchema),
    mode: "onTouched", // Show errors after field is touched/blurred
    reValidateMode: "onChange", // Re-validate on every change after first error
    defaultValues: {
      email: "",
      password: "",
    },
  });

  /**
   * Reset form state when modal opens/closes
   */
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        form.reset();
        setAuthError(null);
        setIsSubmitting(false);
      }
      onOpenChange(newOpen);
    },
    [form, onOpenChange],
  );

  /**
   * Handle form submission
   *
   * SEC-010: AUTHZ - Step-up authentication via verify-elevated-access
   * - Validates credentials against dedicated endpoint
   * - Does NOT modify session cookies
   * - Returns short-lived elevation token
   *
   * API-003: ERROR_HANDLING
   * - Returns generic error messages to prevent enumeration attacks
   */
  const handleSubmit = useCallback(
    async (values: POSAuthFormValues) => {
      setIsSubmitting(true);
      setAuthError(null);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);

      try {
        // Call the dedicated elevated access endpoint
        // This does NOT modify session cookies - it returns an elevation token
        const response = await fetch(
          `${BACKEND_URL}/api/auth/verify-elevated-access`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            // Note: credentials: "include" is still needed for the existing session
            // cookies to be sent (for rate limiting based on authenticated user)
            credentials: "include",
            body: JSON.stringify({
              email: values.email,
              password: values.password,
              required_permission: REQUIRED_PERMISSION,
              store_id: effectiveStoreId,
            }),
            signal: controller.signal,
          },
        );

        clearTimeout(timeoutId);

        const responseData: ElevatedAccessResponse = await response.json();

        if (!response.ok || !responseData.success) {
          // Handle rate limiting
          if (response.status === 429) {
            const retryAfter = responseData.error?.retry_after_seconds || 900;
            const minutes = Math.ceil(retryAfter / 60);
            setAuthError(
              `Too many attempts. Please try again in ${minutes} minute${minutes > 1 ? "s" : ""}.`,
            );
            return;
          }

          // API-003: Generic error message, no credential enumeration
          setAuthError(
            responseData.error?.message ||
              "Authentication failed. Please check your credentials.",
          );
          return;
        }

        // Success - store the elevation token
        const tokenData = responseData.data!;
        setToken({
          token: tokenData.elevation_token,
          expiresAt: new Date(tokenData.expires_at),
          permission: tokenData.permission,
          storeId: tokenData.store_id || undefined,
        });

        // Navigate to POS Integration page
        // The token is now stored in context and will be included in API calls
        handleOpenChange(false);
        router.push(targetUrl);
      } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof Error && error.name === "AbortError") {
          setAuthError("Request timed out. Please try again.");
        } else {
          // API-003: Generic error for network/unexpected errors
          setAuthError("Unable to authenticate. Please try again.");
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [handleOpenChange, router, targetUrl, effectiveStoreId, setToken],
  );

  /**
   * Handle cancel button click
   */
  const handleCancel = useCallback(() => {
    handleOpenChange(false);
  }, [handleOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]" data-testid="pos-auth-modal">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <DialogTitle>POS Integration Authentication</DialogTitle>
          </div>
          <DialogDescription>
            For security, please re-enter your credentials to access POS
            Integration settings.
          </DialogDescription>
        </DialogHeader>

        {/* Error Alert */}
        {authError && (
          <Alert variant="destructive" data-testid="pos-auth-error">
            <AlertDescription>{authError}</AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
            data-testid="pos-auth-form"
            noValidate // Disable browser's native validation to use Zod validation messages
          >
            {/* Email Field */}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="Enter your email"
                      autoComplete="email"
                      autoFocus
                      disabled={isSubmitting}
                      data-testid="pos-auth-email-input"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage data-testid="pos-auth-email-error" />
                </FormItem>
              )}
            />

            {/* Password Field */}
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      disabled={isSubmitting}
                      data-testid="pos-auth-password-input"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage data-testid="pos-auth-password-error" />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={isSubmitting}
                data-testid="pos-auth-cancel-button"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                data-testid="pos-auth-submit-button"
              >
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Authenticate
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default POSAuthModal;
