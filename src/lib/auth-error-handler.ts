/**
 * Shared Authentication Error Handler
 *
 * Provides centralized 401/session expiration handling that can be used by:
 * - React Query's QueryCache and MutationCache
 * - Axios interceptors
 * - Direct API calls
 *
 * This ensures consistent behavior across all dashboards:
 * - Super Admin (/dashboard)
 * - Client Owner (/client-dashboard)
 * - MyStore (/mystore)
 */

/**
 * Handle 401 errors globally - redirect to login
 * This catches expired sessions during any API call
 */
export function handleUnauthorizedError(): void {
  // Only redirect if not already on login page
  if (
    typeof window !== "undefined" &&
    !window.location.pathname.includes("/login")
  ) {
    // Store current path for redirect after re-login
    try {
      sessionStorage.setItem("redirect_after_login", window.location.pathname);
    } catch {
      // Ignore storage errors
    }

    // Clear auth data
    try {
      localStorage.removeItem("auth_session");
      localStorage.removeItem("client_auth_session");
    } catch {
      // Ignore storage errors
    }

    // Broadcast to other tabs
    try {
      const channel = new BroadcastChannel("nuvana_session_sync");
      channel.postMessage({ type: "session_expired", reason: "api_401" });
      channel.close();
    } catch {
      // BroadcastChannel not supported
    }

    // Redirect to login with session expired reason
    window.location.href = "/login?reason=session_expired";
  }
}

/**
 * Check if an error is a 401 Unauthorized error
 * Handles various error shapes from different sources:
 * - Axios errors (error.response.status)
 * - Fetch errors (error.status)
 * - Custom ApiError (error.status or error.message)
 */
export function isUnauthorizedError(error: unknown): boolean {
  if (error && typeof error === "object") {
    // Check for direct status property (ApiError, custom errors)
    if ("status" in error && error.status === 401) return true;

    // Check for Axios-style response object
    if ("response" in error) {
      const response = (error as { response?: { status?: number } }).response;
      if (response?.status === 401) return true;
    }

    // Check error message for 401 indicators
    if ("message" in error) {
      const message = (error as { message?: string }).message;
      if (message) {
        const lowerMessage = message.toLowerCase();
        if (
          message.includes("401") ||
          lowerMessage.includes("unauthorized") ||
          lowerMessage.includes("missing access token") ||
          lowerMessage.includes("token expired") ||
          lowerMessage.includes("session expired")
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Session expired event name for cross-component communication
 */
export const SESSION_EXPIRED_EVENT = "nuvana:session_expired";

/**
 * Dispatch session expired event for other components to listen
 */
export function dispatchSessionExpiredEvent(reason: string = "api_401"): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { reason } }),
    );
  }
}
