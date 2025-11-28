/**
 * Server-side authentication utilities
 * Used in Next.js server components and API routes
 */

import { cookies } from "next/headers";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
const ADMIN_SYSTEM_CONFIG_PERMISSION = "ADMIN_SYSTEM_CONFIG";

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
 * @returns Object with isAuthorized boolean and user info if authorized
 * @throws Error if authentication fails
 */
export async function checkSuperAdminPermission(): Promise<{
  isAuthorized: boolean;
  user: ServerUser | null;
}> {
  try {
    // Get cookies from Next.js server-side API
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("access_token");

    if (!accessToken) {
      return { isAuthorized: false, user: null };
    }

    // Make server-side request to backend to verify user and get permissions
    const response = await fetch(`${BACKEND_URL}/api/auth/me`, {
      method: "GET",
      headers: {
        Cookie: `access_token=${accessToken.value}`,
      },
      // Disable caching to ensure fresh permission checks
      cache: "no-store",
    });

    if (!response.ok) {
      return { isAuthorized: false, user: null };
    }

    const data: AuthMeResponse = await response.json();

    // Check if user has ADMIN_SYSTEM_CONFIG permission
    const hasPermission =
      data.user.permissions.includes(ADMIN_SYSTEM_CONFIG_PERMISSION) ||
      data.user.permissions.includes("*"); // Wildcard permission grants all access

    return {
      isAuthorized: hasPermission,
      user: hasPermission ? data.user : null,
    };
  } catch (error) {
    console.error("Error checking Super Admin permission:", error);
    return { isAuthorized: false, user: null };
  }
}
