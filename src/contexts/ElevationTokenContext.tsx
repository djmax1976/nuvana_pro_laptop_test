"use client";

/**
 * Elevation Token Context
 *
 * Manages short-lived elevation tokens for step-up authentication.
 * Tokens are stored in memory (not localStorage) for security.
 *
 * Security Features:
 * - In-memory storage only (no persistence)
 * - Auto-expiry with countdown timer
 * - Token cleared on logout/page unload
 * - Scoped to specific permission and store
 *
 * Security Standards Applied:
 * - SEC-010: AUTHZ - Elevation tokens for step-up authentication
 * - SEC-012: SESSION_TIMEOUT - Auto-expiry enforcement
 *
 * @module contexts/ElevationTokenContext
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Elevation token data structure
 */
export interface ElevationToken {
  /** The JWT token string */
  token: string;
  /** When the token expires */
  expiresAt: Date;
  /** The permission this token grants */
  permission: string;
  /** Optional store scope */
  storeId?: string;
}

/**
 * Context value interface
 */
interface ElevationTokenContextType {
  /** Current elevation token (null if not elevated) */
  elevationToken: ElevationToken | null;
  /** Whether we have a valid (non-expired) elevation token */
  isElevated: boolean;
  /** Time remaining until token expires (in seconds), 0 if not elevated */
  timeRemaining: number;
  /** Set a new elevation token */
  setToken: (token: ElevationToken) => void;
  /** Clear the current elevation token */
  clearToken: () => void;
  /** Get the token string for API calls (returns null if expired) */
  getTokenForRequest: () => string | null;
  /** Check if token is valid for a specific permission and optionally store */
  isValidFor: (permission: string, storeId?: string) => boolean;
}

// ============================================================================
// Context
// ============================================================================

const ElevationTokenContext = createContext<
  ElevationTokenContextType | undefined
>(undefined);

// ============================================================================
// Provider
// ============================================================================

/**
 * ElevationTokenProvider
 *
 * Provides elevation token state and management to the component tree.
 * Tokens are stored in memory only and auto-expire.
 *
 * @example
 * ```tsx
 * <ElevationTokenProvider>
 *   <App />
 * </ElevationTokenProvider>
 * ```
 */
export function ElevationTokenProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<ElevationToken | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);

  /**
   * Calculate if token is currently valid (not expired)
   */
  const isTokenValid = useCallback((t: ElevationToken | null): boolean => {
    if (!t) return false;
    return new Date() < t.expiresAt;
  }, []);

  /**
   * Set a new elevation token
   */
  const setToken = useCallback((newToken: ElevationToken) => {
    setTokenState(newToken);
    // Calculate initial time remaining
    const remaining = Math.max(
      0,
      Math.floor((newToken.expiresAt.getTime() - Date.now()) / 1000),
    );
    setTimeRemaining(remaining);
  }, []);

  /**
   * Clear the current elevation token
   */
  const clearToken = useCallback(() => {
    setTokenState(null);
    setTimeRemaining(0);
  }, []);

  /**
   * Get the token string for API calls
   * Returns null if token is expired or not present
   */
  const getTokenForRequest = useCallback((): string | null => {
    if (!token || !isTokenValid(token)) {
      return null;
    }
    return token.token;
  }, [token, isTokenValid]);

  /**
   * Check if token is valid for a specific permission and optionally store
   */
  const isValidFor = useCallback(
    (permission: string, storeId?: string): boolean => {
      if (!token || !isTokenValid(token)) {
        return false;
      }
      // Check permission matches
      if (token.permission !== permission) {
        return false;
      }
      // Check store scope if provided
      if (storeId && token.storeId && token.storeId !== storeId) {
        return false;
      }
      return true;
    },
    [token, isTokenValid],
  );

  /**
   * Countdown timer effect
   * Updates timeRemaining every second and clears token on expiry
   */
  useEffect(() => {
    if (!token) {
      return;
    }

    // Update time remaining every second
    const intervalId = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.floor((token.expiresAt.getTime() - Date.now()) / 1000),
      );
      setTimeRemaining(remaining);

      // Clear token when expired
      if (remaining <= 0) {
        setTokenState(null);
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [token]);

  /**
   * Clear token on page unload for security
   * Prevents token from being accessible after user closes tab
   */
  useEffect(() => {
    const handleBeforeUnload = () => {
      setTokenState(null);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  return (
    <ElevationTokenContext.Provider
      value={{
        elevationToken: token,
        isElevated: isTokenValid(token),
        timeRemaining,
        setToken,
        clearToken,
        getTokenForRequest,
        isValidFor,
      }}
    >
      {children}
    </ElevationTokenContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * useElevationToken hook
 *
 * Access elevation token state and management functions.
 *
 * @throws Error if used outside of ElevationTokenProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isElevated, timeRemaining, getTokenForRequest } = useElevationToken();
 *
 *   const makeApiCall = async () => {
 *     const token = getTokenForRequest();
 *     if (!token) {
 *       // Need to re-authenticate
 *       return;
 *     }
 *
 *     await fetch('/api/pos/sync', {
 *       headers: {
 *         'X-Elevation-Token': token,
 *       },
 *     });
 *   };
 *
 *   return (
 *     <div>
 *       {isElevated && <span>Session expires in {timeRemaining}s</span>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useElevationToken(): ElevationTokenContextType {
  const context = useContext(ElevationTokenContext);
  if (context === undefined) {
    throw new Error(
      "useElevationToken must be used within an ElevationTokenProvider",
    );
  }
  return context;
}
