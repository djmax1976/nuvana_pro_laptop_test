"use client";

/**
 * Client wrapper for AdminRoleList component
 * Receives authorization status from server component and passes it down
 * Also provides defensive client-side authorization checks
 */

import { AdminRoleList } from "./AdminRoleList";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface AdminRoleListClientProps {
  isAuthorized: boolean;
  userPermissions: string[];
}

const ADMIN_SYSTEM_CONFIG_PERMISSION = "ADMIN_SYSTEM_CONFIG";

/**
 * Top-level BACKEND_URL constant with environment validation at module initialization.
 * This ensures configuration failures fail fast and are not masked as authorization errors.
 */
const BACKEND_URL: string = (() => {
  const backendUrlEnv = process.env.NEXT_PUBLIC_BACKEND_URL;
  const isProduction = process.env.NODE_ENV === "production";

  if (!backendUrlEnv) {
    if (isProduction) {
      throw new Error(
        "NEXT_PUBLIC_BACKEND_URL is required in production but is undefined. Please set this environment variable before deploying.",
      );
    } else {
      console.warn(
        "NEXT_PUBLIC_BACKEND_URL is not set. Falling back to http://localhost:3001 for local development.",
      );
      return "http://localhost:3001";
    }
  }

  return backendUrlEnv;
})();

/**
 * Check if user has Super Admin permission on the client side
 * This is a defensive check that validates permissions from the API
 */
async function checkClientSuperAdminPermission(): Promise<{
  isAuthorized: boolean;
  permissions: string[];
}> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/auth/me`, {
      method: "GET",
      credentials: "include", // Send httpOnly cookies
      cache: "no-store",
    });

    if (!response.ok) {
      return { isAuthorized: false, permissions: [] };
    }

    const data = await response.json();
    const permissions = data.user?.permissions || [];

    const hasPermission =
      permissions.includes(ADMIN_SYSTEM_CONFIG_PERMISSION) ||
      permissions.includes("*"); // Wildcard permission grants all access

    return {
      isAuthorized: hasPermission,
      permissions,
    };
  } catch (error) {
    console.error("Error checking Super Admin permission:", error);
    return { isAuthorized: false, permissions: [] };
  }
}

export function AdminRoleListClient({
  isAuthorized: serverIsAuthorized,
  userPermissions: serverUserPermissions,
}: AdminRoleListClientProps) {
  const router = useRouter();
  const [clientAuth, setClientAuth] = useState<{
    isAuthorized: boolean;
    permissions: string[];
  }>({
    isAuthorized: serverIsAuthorized,
    permissions: serverUserPermissions,
  });
  const [isValidating, setIsValidating] = useState(true);

  // Defensive client-side authorization check
  // This validates permissions on the client side as an additional security layer
  useEffect(() => {
    const validateClientAuth = async () => {
      setIsValidating(true);
      const clientCheck = await checkClientSuperAdminPermission();
      setClientAuth(clientCheck);
      setIsValidating(false);

      // If client-side check fails, redirect (defensive measure)
      // Note: Server-side check should have already prevented access,
      // but this provides an additional layer of protection
      if (!clientCheck.isAuthorized) {
        router.push("/dashboard?error=unauthorized");
      }
    };

    // Only validate if server said we're authorized (optimization)
    if (serverIsAuthorized) {
      validateClientAuth();
    } else {
      setIsValidating(false);
    }
  }, [serverIsAuthorized, router]);

  // Show loading state while validating
  if (isValidating) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="space-y-4 text-center">
          <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Verifying permissions...</p>
        </div>
      </div>
    );
  }

  // Don't render if not authorized (defensive check)
  if (!clientAuth.isAuthorized) {
    return null;
  }

  return (
    <AdminRoleList
      isAuthorized={clientAuth.isAuthorized}
      userPermissions={clientAuth.permissions}
    />
  );
}
