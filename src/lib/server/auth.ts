/**
 * Server-side authentication utilities
 * Used in Next.js server components and API routes
 */

import { cookies } from "next/headers";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";
const ADMIN_SYSTEM_CONFIG_PERMISSION = "ADMIN_SYSTEM_CONFIG";

// Parse and validate AUTH_REQUEST_TIMEOUT_MS with safe fallback
const parseAuthRequestTimeout = (): number => {
  const envValue = process.env.AUTH_REQUEST_TIMEOUT_MS;
  const defaultTimeout = 5000;

  if (!envValue) {
    return defaultTimeout;
  }

  const parsed = parseInt(envValue, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(
      `Invalid AUTH_REQUEST_TIMEOUT_MS value "${envValue}". Expected a positive integer. Using default: ${defaultTimeout}ms`,
    );
    return defaultTimeout;
  }

  return parsed;
};

const AUTH_REQUEST_TIMEOUT_MS = parseAuthRequestTimeout();

/**
 * User information from /api/auth/me endpoint
 */
export interface ServerUser {
  id: string;
  email: string;
  name: string | null;
  roles: string[];
  permissions: string[];
  is_client_user: boolean;
}

/**
 * Response from /api/auth/me endpoint
 */
interface AuthMeResponse {
  user: ServerUser;
  message: string;
}

/**
 * Check if the current user has Super Admin permission (ADMIN_SYSTEM_CONFIG)
 * This function makes a server-side request to the backend API to verify permissions
 *
 * @returns Object with isAuthorized boolean, isAuthenticated boolean, and user info if authorized
 * @throws Error if authentication fails
 */
export async function checkSuperAdminPermission(): Promise<{
  isAuthorized: boolean;
  isAuthenticated: boolean;
  user: ServerUser | null;
}> {
  try {
    // Get cookies from Next.js server-side API
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("access_token");

    if (!accessToken) {
      return { isAuthorized: false, isAuthenticated: false, user: null };
    }

    // Make server-side request to backend to verify user and get permissions
    // Use AbortController to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, AUTH_REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${BACKEND_URL}/api/auth/me`, {
        method: "GET",
        headers: {
          Cookie: `access_token=${accessToken.value}`,
        },
        // Disable caching to ensure fresh permission checks
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeoutId);
      // Handle abort errors specifically - request timed out
      if (error instanceof Error && error.name === "AbortError") {
        console.error(
          `Auth request timed out after ${AUTH_REQUEST_TIMEOUT_MS}ms`,
        );
        return { isAuthorized: false, isAuthenticated: false, user: null };
      }
      // Re-throw other errors to be handled by outer catch
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      // User has a token but it's invalid or expired - treat as not authenticated
      return { isAuthorized: false, isAuthenticated: false, user: null };
    }

    const data: AuthMeResponse = await response.json();

    // Check if user has ADMIN_SYSTEM_CONFIG permission
    const hasPermission =
      data.user.permissions.includes(ADMIN_SYSTEM_CONFIG_PERMISSION) ||
      data.user.permissions.includes("*"); // Wildcard permission grants all access

    return {
      isAuthorized: hasPermission,
      isAuthenticated: true,
      user: hasPermission ? data.user : null,
    };
  } catch (error) {
    console.error("Error checking Super Admin permission:", error);
    return { isAuthorized: false, isAuthenticated: false, user: null };
  }
}
