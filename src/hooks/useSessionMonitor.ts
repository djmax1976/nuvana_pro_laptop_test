"use client";

/**
 * useSessionMonitor Hook
 *
 * Enterprise-grade session monitoring hook that provides:
 * - Real-time session validity checking
 * - Proactive warning before session expiration
 * - Automatic logout on session expiry
 * - Tab synchronization for multi-tab sessions
 * - Activity-based session extension
 *
 * 2025 Best Practices Implementation:
 * - Polling-based session validation (not just cookie expiry)
 * - Server-side session verification
 * - Graceful degradation on network issues
 * - Cross-tab communication via BroadcastChannel
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

// Session monitoring configuration
const CONFIG = {
  // How often to check session validity (30 seconds)
  POLL_INTERVAL: 30 * 1000,
  // Show warning this many milliseconds before expiry (2 minutes)
  WARNING_THRESHOLD: 2 * 60 * 1000,
  // Consider session about to expire at this threshold (5 minutes)
  EXPIRING_SOON_THRESHOLD: 5 * 60 * 1000,
  // Timeout for session validation requests
  REQUEST_TIMEOUT: 5000,
  // Activity debounce (don't refresh session more than once per minute)
  ACTIVITY_DEBOUNCE: 60 * 1000,
  // Broadcast channel name for cross-tab communication
  BROADCAST_CHANNEL: "nuvana_session_sync",
} as const;

export type SessionStatus =
  | "active" // Session is valid and not expiring soon
  | "expiring" // Session is valid but will expire soon (show warning)
  | "expired" // Session has expired (force logout)
  | "refreshing" // Session is being refreshed
  | "error" // Error checking session (will retry)
  | "loading"; // Initial loading state

export interface SessionMonitorState {
  status: SessionStatus;
  expiresAt: Date | null;
  timeRemaining: number | null; // milliseconds until expiry
  showWarning: boolean;
  isRefreshing: boolean;
  lastChecked: Date | null;
  error: string | null;
}

export interface UseSessionMonitorOptions {
  enabled?: boolean;
  onSessionExpired?: () => void;
  onSessionWarning?: () => void;
  onSessionRefreshed?: () => void;
}

export interface UseSessionMonitorReturn extends SessionMonitorState {
  refreshSession: () => Promise<boolean>;
  extendSession: () => Promise<boolean>;
  forceLogout: () => Promise<void>;
  dismissWarning: () => void;
}

/**
 * Custom hook for monitoring session state and handling expiration
 */
export function useSessionMonitor(
  options: UseSessionMonitorOptions = {},
): UseSessionMonitorReturn {
  const {
    enabled = true,
    onSessionExpired,
    onSessionWarning,
    onSessionRefreshed,
  } = options;

  const router = useRouter();
  const backendUrl =
    typeof window !== "undefined"
      ? process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001"
      : "";

  // State
  const [state, setState] = useState<SessionMonitorState>({
    status: "loading",
    expiresAt: null,
    timeRemaining: null,
    showWarning: false,
    isRefreshing: false,
    lastChecked: null,
    error: null,
  });

  // Refs for cleanup and debouncing
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const warningShownRef = useRef<boolean>(false);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  /**
   * Check session validity with the backend
   */
  const checkSession = useCallback(async (): Promise<{
    valid: boolean;
    expiresAt?: Date;
    error?: string;
  }> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      CONFIG.REQUEST_TIMEOUT,
    );

    try {
      const response = await fetch(`${backendUrl}/api/auth/me`, {
        method: "GET",
        credentials: "include",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        // Backend should return session expiry info
        // If not available, estimate based on access token lifetime (15 min default)
        const expiresAt = data.expiresAt
          ? new Date(data.expiresAt)
          : new Date(Date.now() + 15 * 60 * 1000);

        return { valid: true, expiresAt };
      }

      if (response.status === 401) {
        return { valid: false, error: "Session expired" };
      }

      return { valid: false, error: `Server error: ${response.status}` };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        return { valid: false, error: "Request timeout" };
      }

      return {
        valid: false,
        error: error instanceof Error ? error.message : "Network error",
      };
    }
  }, [backendUrl]);

  /**
   * Refresh the session by calling the refresh endpoint
   */
  const refreshSession = useCallback(async (): Promise<boolean> => {
    setState((prev) => ({ ...prev, isRefreshing: true, status: "refreshing" }));

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      CONFIG.REQUEST_TIMEOUT,
    );

    try {
      const response = await fetch(`${backendUrl}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const expiresAt = data.expiresAt
          ? new Date(data.expiresAt)
          : new Date(Date.now() + 15 * 60 * 1000);

        setState((prev) => ({
          ...prev,
          status: "active",
          expiresAt,
          timeRemaining: expiresAt.getTime() - Date.now(),
          showWarning: false,
          isRefreshing: false,
          lastChecked: new Date(),
          error: null,
        }));

        warningShownRef.current = false;
        onSessionRefreshed?.();

        // Broadcast session refresh to other tabs
        broadcastChannelRef.current?.postMessage({
          type: "session_refreshed",
          expiresAt: expiresAt.toISOString(),
        });

        return true;
      }

      // Refresh failed - session is expired
      setState((prev) => ({
        ...prev,
        status: "expired",
        isRefreshing: false,
        error: "Session refresh failed",
      }));

      return false;
    } catch (error) {
      clearTimeout(timeoutId);

      setState((prev) => ({
        ...prev,
        status: "error",
        isRefreshing: false,
        error: error instanceof Error ? error.message : "Refresh failed",
      }));

      return false;
    }
  }, [backendUrl, onSessionRefreshed]);

  /**
   * Extend session based on user activity
   */
  const extendSession = useCallback(async (): Promise<boolean> => {
    const now = Date.now();

    // Debounce activity-based refresh
    if (now - lastActivityRef.current < CONFIG.ACTIVITY_DEBOUNCE) {
      return true; // Skip, too soon since last activity
    }

    lastActivityRef.current = now;
    return refreshSession();
  }, [refreshSession]);

  /**
   * Force logout the user
   */
  const forceLogout = useCallback(async () => {
    // Clear intervals
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    // Broadcast logout to other tabs
    broadcastChannelRef.current?.postMessage({ type: "session_expired" });

    // Clear local storage
    try {
      localStorage.removeItem("auth_session");
      localStorage.removeItem("client_auth_session");
    } catch {
      // Ignore storage errors
    }

    // Call logout endpoint (best effort)
    try {
      await fetch(`${backendUrl}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Ignore logout errors - we're redirecting anyway
    }

    // Trigger callback
    onSessionExpired?.();

    // Redirect to login with session expired message
    router.push("/login?reason=session_expired");
  }, [backendUrl, onSessionExpired, router]);

  /**
   * Dismiss the warning modal (user chose to continue without extending)
   */
  const dismissWarning = useCallback(() => {
    setState((prev) => ({ ...prev, showWarning: false }));
  }, []);

  /**
   * Update countdown timer
   */
  const updateCountdown = useCallback(() => {
    setState((prev) => {
      if (!prev.expiresAt) return prev;

      const timeRemaining = prev.expiresAt.getTime() - Date.now();

      // Session expired
      if (timeRemaining <= 0) {
        return {
          ...prev,
          status: "expired",
          timeRemaining: 0,
          showWarning: false,
        };
      }

      // Show warning if within threshold and not already shown
      const shouldShowWarning =
        timeRemaining <= CONFIG.WARNING_THRESHOLD && !warningShownRef.current;

      if (shouldShowWarning) {
        warningShownRef.current = true;
        onSessionWarning?.();
      }

      // Determine status based on time remaining
      let status: SessionStatus = prev.status;
      if (timeRemaining <= CONFIG.EXPIRING_SOON_THRESHOLD) {
        status = "expiring";
      } else if (prev.status !== "refreshing") {
        status = "active";
      }

      return {
        ...prev,
        status,
        timeRemaining,
        showWarning: shouldShowWarning || prev.showWarning,
      };
    });
  }, [onSessionWarning]);

  /**
   * Main polling function to check session validity
   */
  const pollSession = useCallback(async () => {
    const result = await checkSession();

    if (result.valid && result.expiresAt) {
      setState((prev) => ({
        ...prev,
        status: "active",
        expiresAt: result.expiresAt!,
        timeRemaining: result.expiresAt!.getTime() - Date.now(),
        lastChecked: new Date(),
        error: null,
      }));
    } else if (!result.valid) {
      // Only treat as expired if it's explicitly a 401/session expired error
      // Network errors, 500s, etc. should NOT trigger logout
      const isSessionExpired = result.error === "Session expired";

      if (isSessionExpired) {
        setState((prev) => ({
          ...prev,
          status: "expired",
          error: result.error || "Session invalid",
        }));
      } else {
        // For other errors (network, 500, timeout), set error state but don't expire
        setState((prev) => ({
          ...prev,
          status: "error",
          error: result.error || "Session check failed",
          lastChecked: new Date(),
        }));
      }
    }
  }, [checkSession]);

  /**
   * Handle messages from other tabs
   */
  const handleBroadcastMessage = useCallback(
    (event: MessageEvent) => {
      const { type, expiresAt } = event.data;

      if (type === "session_expired") {
        forceLogout();
      } else if (type === "session_refreshed" && expiresAt) {
        setState((prev) => ({
          ...prev,
          status: "active",
          expiresAt: new Date(expiresAt),
          timeRemaining: new Date(expiresAt).getTime() - Date.now(),
          showWarning: false,
          error: null,
        }));
        warningShownRef.current = false;
      }
    },
    [forceLogout],
  );

  // Store callbacks in refs to avoid effect re-runs
  const pollSessionRef = useRef(pollSession);
  const updateCountdownRef = useRef(updateCountdown);
  const handleBroadcastMessageRef = useRef(handleBroadcastMessage);

  // Keep refs updated with latest callbacks
  useEffect(() => {
    pollSessionRef.current = pollSession;
    updateCountdownRef.current = updateCountdown;
    handleBroadcastMessageRef.current = handleBroadcastMessage;
  }, [pollSession, updateCountdown, handleBroadcastMessage]);

  /**
   * Setup and cleanup effects
   */
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    // Setup BroadcastChannel for cross-tab communication
    try {
      broadcastChannelRef.current = new BroadcastChannel(
        CONFIG.BROADCAST_CHANNEL,
      );
      broadcastChannelRef.current.onmessage = (event) =>
        handleBroadcastMessageRef.current(event);
    } catch {
      // BroadcastChannel not supported, single-tab only
    }

    // Initial session check (only once on mount)
    pollSessionRef.current();

    // Setup polling interval
    pollIntervalRef.current = setInterval(
      () => pollSessionRef.current(),
      CONFIG.POLL_INTERVAL,
    );

    // Setup countdown interval (every second)
    countdownIntervalRef.current = setInterval(
      () => updateCountdownRef.current(),
      1000,
    );

    // Cleanup
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
      broadcastChannelRef.current?.close();
    };
  }, [enabled]); // Only re-run if enabled changes

  /**
   * Handle session expired state
   */
  useEffect(() => {
    if (state.status === "expired") {
      forceLogout();
    }
  }, [state.status, forceLogout]);

  return {
    ...state,
    refreshSession,
    extendSession,
    forceLogout,
    dismissWarning,
  };
}
