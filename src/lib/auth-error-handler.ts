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
 *
 * Security Standards:
 * - SEC-010: AUTHZ - Distinguish session expiration from credential verification
 * - LM-001: LOGGING - Structured security event logging
 * - OWASP A09: Security Logging and Monitoring
 */

import { logSecurityEvent } from "@/lib/utils/security";

/**
 * Handle 401 errors globally - redirect to login
 * This catches expired sessions during any API call
 *
 * LM-001: LOGGING - Log session expiration events for security monitoring
 */
export function handleUnauthorizedError(): void {
  // Only redirect if not already on login page
  if (
    typeof window !== "undefined" &&
    !window.location.pathname.includes("/login")
  ) {
    // OWASP A09: Log session expiration for security monitoring
    logSecurityEvent("SESSION_EXPIRED", "warn", {
      context: window.location.pathname,
    });

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
 * Error codes that are actual SECURITY events (credential failures that should be logged)
 * These indicate potential brute-force attempts or unauthorized access
 */
const SECURITY_EVENT_ERROR_CODES = [
  "AUTHENTICATION_FAILED",
  "INVALID_CREDENTIALS",
  "INVALID_PIN",
] as const;

/**
 * Error codes that indicate NON-session-expiration errors (but are NOT security events)
 * These are business rule validations, not credential failures
 */
const BUSINESS_RULE_ERROR_CODES = [
  "INSUFFICIENT_PERMISSIONS",
  "NO_ACTIVE_SHIFT",
] as const;

/**
 * Check if an error is a credential verification error (NOT session expiration)
 * These are 401s from endpoints that verify OTHER users' credentials.
 *
 * Only logs SECURITY events for actual credential failures (brute-force detection)
 * Business rule errors (no active shift, insufficient permissions) are NOT logged
 */
function isCredentialVerificationError(error: unknown): boolean {
  if (error && typeof error === "object") {
    // Check for ApiError.code property
    if ("code" in error) {
      const code = (error as { code?: string }).code;

      // Check if it's a security event (actual credential failure)
      if (
        code &&
        SECURITY_EVENT_ERROR_CODES.includes(
          code as (typeof SECURITY_EVENT_ERROR_CODES)[number],
        )
      ) {
        // Log credential verification failure for security monitoring
        logSecurityEvent("CREDENTIAL_VERIFICATION_FAILED", "warn", {
          errorCode: code,
        });
        return true;
      }

      // Check if it's a business rule error (not a security event, but not session expiration)
      if (
        code &&
        BUSINESS_RULE_ERROR_CODES.includes(
          code as (typeof BUSINESS_RULE_ERROR_CODES)[number],
        )
      ) {
        // Don't log - this is a normal business flow, not a security event
        return true;
      }
    }

    // Check error message for credential verification indicators
    if ("message" in error) {
      const message = (error as { message?: string }).message;
      if (message) {
        const lowerMessage = message.toLowerCase();

        // Security events - actual credential failures (log these)
        if (
          lowerMessage.includes("invalid email or password") ||
          lowerMessage.includes("invalid credentials") ||
          lowerMessage.includes("invalid pin") ||
          lowerMessage.includes("authentication failed")
        ) {
          logSecurityEvent("CREDENTIAL_VERIFICATION_FAILED", "warn", {
            context: "message_pattern_match",
          });
          return true;
        }

        // Business rule errors - not security events (don't log)
        if (
          lowerMessage.includes("insufficient permissions") ||
          lowerMessage.includes("does not have manager permissions") ||
          lowerMessage.includes("no active shift") ||
          lowerMessage.includes("user does not have manager")
        ) {
          // Don't log - this is a normal business flow
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Check if an error is a 401 Unauthorized error that indicates SESSION EXPIRATION
 * Handles various error shapes from different sources:
 * - Axios errors (error.response.status)
 * - Fetch errors (error.status)
 * - Custom ApiError (error.status or error.message)
 *
 * IMPORTANT: Returns FALSE for credential verification errors (invalid password, etc.)
 * These are NOT session expiration - they're just failed authentication attempts.
 */
export function isUnauthorizedError(error: unknown): boolean {
  // First, check if this is a credential verification error - NOT session expiration
  if (isCredentialVerificationError(error)) {
    return false;
  }

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
