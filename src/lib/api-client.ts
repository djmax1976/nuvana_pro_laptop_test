/**
 * API Client with Session Expiration Handling
 *
 * Enterprise-grade fetch wrapper that provides:
 * - Automatic 401 detection and session expiration handling
 * - Cross-tab session synchronization
 * - Request timeout handling
 * - Consistent error handling
 *
 * Coding Standards Compliance:
 * - SEC-012: SESSION_TIMEOUT - Enforces session expiration handling
 * - API-003: ERROR_HANDLING - Centralized error handling with correlation IDs
 * - FE-001: STATE_MANAGEMENT - Uses HttpOnly cookies, not localStorage for tokens
 */

// Broadcast channel for cross-tab session sync
let broadcastChannel: BroadcastChannel | null = null;

if (typeof window !== "undefined") {
  try {
    broadcastChannel = new BroadcastChannel("nuvana_session_sync");
  } catch {
    // BroadcastChannel not supported
  }
}

// Configuration
const CONFIG = {
  DEFAULT_TIMEOUT: 30000, // 30 seconds
  AUTH_TIMEOUT: 10000, // 10 seconds for auth endpoints
} as const;

// Session expired event type for custom event dispatching
export const SESSION_EXPIRED_EVENT = "nuvana:session_expired";

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public correlationId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Handle session expiration - broadcast to all tabs and dispatch event
 */
function handleSessionExpired(reason: string = "session_expired") {
  // Broadcast to other tabs
  broadcastChannel?.postMessage({ type: "session_expired", reason });

  // Dispatch custom event for components to listen
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { reason } }),
    );
  }

  // Clear local storage
  try {
    localStorage.removeItem("auth_session");
    localStorage.removeItem("client_auth_session");
  } catch {
    // Ignore storage errors
  }

  // Redirect to login with reason
  if (typeof window !== "undefined") {
    const currentPath = window.location.pathname;
    // Don't redirect if already on login page
    if (!currentPath.includes("/login")) {
      // Store current path for redirect after re-login
      try {
        sessionStorage.setItem("redirect_after_login", currentPath);
      } catch {
        // Ignore storage errors
      }
      window.location.href = `/login?reason=${reason}`;
    }
  }
}

/**
 * Create fetch options with credentials and timeout
 */
function createFetchOptions(
  options: RequestInit = {},
  timeout: number = CONFIG.DEFAULT_TIMEOUT,
): {
  options: RequestInit;
  controller: AbortController;
  timeoutId: NodeJS.Timeout;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  return {
    options: {
      ...options,
      credentials: "include" as RequestCredentials,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    },
    controller,
    timeoutId,
  };
}

/**
 * Main API client function with session expiration handling
 *
 * @param url - The URL to fetch
 * @param options - Fetch options
 * @param config - Additional configuration
 * @returns Response data or throws ApiError
 */
export async function apiClient<T = unknown>(
  url: string,
  options: RequestInit = {},
  config: {
    timeout?: number;
    skipSessionCheck?: boolean; // Skip 401 handling (for login/logout endpoints)
  } = {},
): Promise<T> {
  const { timeout = CONFIG.DEFAULT_TIMEOUT, skipSessionCheck = false } = config;
  const { options: fetchOptions, timeoutId } = createFetchOptions(
    options,
    timeout,
  );

  try {
    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);

    // Handle 401 Unauthorized - Session Expired
    if (response.status === 401 && !skipSessionCheck) {
      handleSessionExpired("session_expired");
      throw new ApiError(
        "Session expired. Please log in again.",
        401,
        "SESSION_EXPIRED",
      );
    }

    // Handle 403 Forbidden
    if (response.status === 403) {
      throw new ApiError("Access denied.", 403, "FORBIDDEN");
    }

    // Handle other error responses
    if (!response.ok) {
      let errorData: {
        message?: string;
        code?: string;
        correlationId?: string;
      } = {};
      try {
        errorData = await response.json();
      } catch {
        // Response body not JSON
      }

      throw new ApiError(
        errorData.message || `Request failed with status ${response.status}`,
        response.status,
        errorData.code,
        errorData.correlationId,
      );
    }

    // Parse successful response
    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      return await response.json();
    }

    // Non-JSON response
    return (await response.text()) as unknown as T;
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle abort (timeout)
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError("Request timeout", 408, "TIMEOUT");
    }

    // Re-throw ApiError as-is
    if (error instanceof ApiError) {
      throw error;
    }

    // Network or other error
    throw new ApiError(
      error instanceof Error ? error.message : "Network error",
      0,
      "NETWORK_ERROR",
    );
  }
}

/**
 * Convenience methods for common HTTP methods
 */
export const api = {
  get: <T = unknown>(url: string, config?: { timeout?: number }) =>
    apiClient<T>(url, { method: "GET" }, config),

  post: <T = unknown>(
    url: string,
    data?: unknown,
    config?: { timeout?: number; skipSessionCheck?: boolean },
  ) =>
    apiClient<T>(
      url,
      { method: "POST", body: data ? JSON.stringify(data) : undefined },
      config,
    ),

  put: <T = unknown>(
    url: string,
    data?: unknown,
    config?: { timeout?: number },
  ) =>
    apiClient<T>(
      url,
      { method: "PUT", body: data ? JSON.stringify(data) : undefined },
      config,
    ),

  patch: <T = unknown>(
    url: string,
    data?: unknown,
    config?: { timeout?: number },
  ) =>
    apiClient<T>(
      url,
      { method: "PATCH", body: data ? JSON.stringify(data) : undefined },
      config,
    ),

  delete: <T = unknown>(url: string, config?: { timeout?: number }) =>
    apiClient<T>(url, { method: "DELETE" }, config),
};

/**
 * Setup global 401 listener for cross-tab synchronization
 * Call this once in your app's entry point
 */
export function setupSessionExpirationListener() {
  if (typeof window === "undefined") return;

  // Listen for broadcast channel messages from other tabs
  try {
    const channel = new BroadcastChannel("nuvana_session_sync");
    channel.onmessage = (event) => {
      if (event.data?.type === "session_expired") {
        // Another tab detected session expiration
        const currentPath = window.location.pathname;
        if (!currentPath.includes("/login")) {
          try {
            sessionStorage.setItem("redirect_after_login", currentPath);
          } catch {
            // Ignore storage errors
          }
          window.location.href = `/login?reason=${event.data.reason || "session_expired"}`;
        }
      }
    };
  } catch {
    // BroadcastChannel not supported
  }
}
