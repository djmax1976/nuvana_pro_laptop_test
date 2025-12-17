/**
 * Session Management Components
 *
 * Enterprise-grade session expiration handling for all authenticated areas.
 * Implements 2025 best practices for session management:
 * - Real-time session monitoring
 * - Graceful warning before expiration
 * - Automatic logout on expiry
 * - Cross-tab synchronization
 * - API response interceptor for 401 handling
 *
 * Coding Standards Compliance:
 * - SEC-012: SESSION_TIMEOUT - 15-minute inactivity timeout with forced re-auth
 * - FE-009: SESSION_STORAGE - Clear session data on logout
 * - FE-001: STATE_MANAGEMENT - Tokens in HttpOnly cookies, not localStorage
 */

export {
  SessionExpirationGuard,
  withSessionExpirationGuard,
} from "./SessionExpirationGuard";
