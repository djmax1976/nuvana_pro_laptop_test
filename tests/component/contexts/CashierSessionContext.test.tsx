/**
 * @test-level Component
 * @justification Component tests for CashierSessionContext - validates session state management, persistence, and expiry handling
 * @story 4-92-cashier-session-token
 *
 * CashierSessionContext Component Tests
 *
 * STORY: As a cashier using a terminal, I want my session to persist across page reloads
 * and automatically expire when the time limit is reached.
 *
 * TEST LEVEL: Component (React context behavior tests)
 * PRIMARY GOAL: Verify session state management, sessionStorage persistence, and expiry handling
 *
 * CONTEXT FUNCTIONALITY TESTED:
 * - Session state management (set, get, clear)
 * - sessionStorage persistence across page reloads
 * - Automatic expiry checking
 * - Hook usage enforcement (must be within provider)
 * - Session token retrieval with expiry check
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { render, screen } from "@testing-library/react";
import {
  CashierSessionProvider,
  useCashierSession,
  useCashierSessionToken,
} from "@/contexts/CashierSessionContext";
import type { ReactNode } from "react";

// Mock sessionStorage
const mockSessionStorage = (() => {
  let store: Record<string, string> = {};
  return {
    // eslint-disable-next-line security/detect-object-injection -- Test mock for sessionStorage
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      // eslint-disable-next-line security/detect-object-injection -- Test mock for sessionStorage
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      // eslint-disable-next-line security/detect-object-injection -- Test mock for sessionStorage
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, "sessionStorage", {
  value: mockSessionStorage,
});

// Helper: Create wrapper for hooks
function createWrapper() {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <CashierSessionProvider>{children}</CashierSessionProvider>;
  };
}

// Helper: Create valid session data
function createMockSessionData(
  overrides: Partial<{
    sessionId: string;
    sessionToken: string;
    cashierId: string;
    cashierName: string;
    terminalId: string;
    expiresAt: string;
  }> = {},
) {
  const futureExpiry = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  return {
    sessionId: "test-session-id-123",
    sessionToken:
      "abc123def456abc123def456abc123def456abc123def456abc123def456abcd",
    cashierId: "cashier-uuid-123",
    cashierName: "Test Cashier",
    terminalId: "terminal-uuid-123",
    expiresAt: futureExpiry,
    ...overrides,
  };
}

describe("4.92-COMPONENT: CashierSessionContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // SECTION 1: Provider Basic Functionality
  // ===========================================================================

  describe("Provider Basic Functionality", () => {
    it("[P0] 4.92-COMPONENT-001: should initialize with null session", () => {
      // GIVEN: A fresh provider with no stored session
      const { result } = renderHook(() => useCashierSession(), {
        wrapper: createWrapper(),
      });

      // THEN: Session should be null
      expect(result.current.session).toBeNull();
    });

    it("[P0] 4.92-COMPONENT-002: should set session correctly", () => {
      // GIVEN: Provider and session data
      const { result } = renderHook(() => useCashierSession(), {
        wrapper: createWrapper(),
      });
      const sessionData = createMockSessionData();

      // WHEN: Setting session
      act(() => {
        result.current.setSession(sessionData);
      });

      // THEN: Session is set with correct data
      expect(result.current.session).toEqual(sessionData);
      expect(result.current.session?.sessionId).toBe(sessionData.sessionId);
      expect(result.current.session?.sessionToken).toBe(
        sessionData.sessionToken,
      );
      expect(result.current.session?.cashierId).toBe(sessionData.cashierId);
      expect(result.current.session?.cashierName).toBe(sessionData.cashierName);
      expect(result.current.session?.terminalId).toBe(sessionData.terminalId);
    });

    it("[P0] 4.92-COMPONENT-003: should clear session correctly", () => {
      // GIVEN: Provider with an active session
      const { result } = renderHook(() => useCashierSession(), {
        wrapper: createWrapper(),
      });
      const sessionData = createMockSessionData();

      act(() => {
        result.current.setSession(sessionData);
      });
      expect(result.current.session).not.toBeNull();

      // WHEN: Clearing session
      act(() => {
        result.current.clearSession();
      });

      // THEN: Session is null
      expect(result.current.session).toBeNull();
    });

    it("[P0] 4.92-COMPONENT-004: should throw error when useCashierSession is used outside provider", () => {
      // GIVEN: Hook used without provider
      // WHEN/THEN: Should throw specific error
      expect(() => {
        renderHook(() => useCashierSession());
      }).toThrow(
        "useCashierSession must be used within CashierSessionProvider",
      );
    });
  });

  // ===========================================================================
  // SECTION 2: Session Persistence (sessionStorage)
  // ===========================================================================

  describe("Session Persistence", () => {
    it("[P0] 4.92-COMPONENT-005: should persist session to sessionStorage", () => {
      // GIVEN: Provider and session data
      const { result } = renderHook(() => useCashierSession(), {
        wrapper: createWrapper(),
      });
      const sessionData = createMockSessionData();

      // WHEN: Setting session
      act(() => {
        result.current.setSession(sessionData);
      });

      // THEN: Session is persisted to sessionStorage
      expect(mockSessionStorage.setItem).toHaveBeenCalledWith(
        "cashier_session",
        JSON.stringify(sessionData),
      );
    });

    it("[P0] 4.92-COMPONENT-006: should remove session from sessionStorage on clear", () => {
      // GIVEN: Provider with an active session
      const { result } = renderHook(() => useCashierSession(), {
        wrapper: createWrapper(),
      });
      const sessionData = createMockSessionData();

      act(() => {
        result.current.setSession(sessionData);
      });

      // WHEN: Clearing session
      act(() => {
        result.current.clearSession();
      });

      // THEN: Session is removed from sessionStorage
      expect(mockSessionStorage.removeItem).toHaveBeenCalledWith(
        "cashier_session",
      );
    });

    it("[P1] 4.92-COMPONENT-007: should load valid session from sessionStorage on mount", async () => {
      // GIVEN: Valid session stored in sessionStorage
      const sessionData = createMockSessionData();
      mockSessionStorage.getItem.mockReturnValueOnce(
        JSON.stringify(sessionData),
      );

      // WHEN: Provider mounts
      const { result } = renderHook(() => useCashierSession(), {
        wrapper: createWrapper(),
      });

      // THEN: Session is loaded from storage
      await waitFor(() => {
        expect(result.current.session).toEqual(sessionData);
      });
    });

    it("[P1] 4.92-COMPONENT-008: should clear expired session from sessionStorage on mount", async () => {
      // GIVEN: Expired session stored in sessionStorage
      const expiredSession = createMockSessionData({
        expiresAt: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
      });
      mockSessionStorage.getItem.mockReturnValueOnce(
        JSON.stringify(expiredSession),
      );

      // WHEN: Provider mounts
      const { result } = renderHook(() => useCashierSession(), {
        wrapper: createWrapper(),
      });

      // THEN: Expired session is cleared
      await waitFor(() => {
        expect(result.current.session).toBeNull();
      });
      expect(mockSessionStorage.removeItem).toHaveBeenCalledWith(
        "cashier_session",
      );
    });

    it("[P1] 4.92-COMPONENT-009: should handle invalid JSON in sessionStorage gracefully", async () => {
      // GIVEN: Invalid JSON stored in sessionStorage
      mockSessionStorage.getItem.mockReturnValueOnce("not-valid-json{{{");

      // WHEN: Provider mounts
      const { result } = renderHook(() => useCashierSession(), {
        wrapper: createWrapper(),
      });

      // THEN: Session is null (graceful handling)
      await waitFor(() => {
        expect(result.current.session).toBeNull();
      });
      expect(mockSessionStorage.removeItem).toHaveBeenCalledWith(
        "cashier_session",
      );
    });
  });

  // ===========================================================================
  // SECTION 3: Session Expiry Handling
  // ===========================================================================

  describe("Session Expiry Handling", () => {
    it("[P0] 4.92-COMPONENT-010: should return true from isSessionExpired when no session", () => {
      // GIVEN: Provider with no session
      const { result } = renderHook(() => useCashierSession(), {
        wrapper: createWrapper(),
      });

      // THEN: isSessionExpired returns true
      expect(result.current.isSessionExpired()).toBe(true);
    });

    it("[P0] 4.92-COMPONENT-011: should return false from isSessionExpired for valid session", () => {
      // GIVEN: Provider with a valid (not expired) session
      const { result } = renderHook(() => useCashierSession(), {
        wrapper: createWrapper(),
      });
      const sessionData = createMockSessionData();

      act(() => {
        result.current.setSession(sessionData);
      });

      // THEN: isSessionExpired returns false
      expect(result.current.isSessionExpired()).toBe(false);
    });

    it("[P0] 4.92-COMPONENT-012: should return true from isSessionExpired for expired session", () => {
      // GIVEN: Provider with an expired session
      const { result } = renderHook(() => useCashierSession(), {
        wrapper: createWrapper(),
      });
      const expiredSession = createMockSessionData({
        expiresAt: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
      });

      act(() => {
        result.current.setSession(expiredSession);
      });

      // THEN: isSessionExpired returns true
      expect(result.current.isSessionExpired()).toBe(true);
    });

    it("[P0] 4.92-COMPONENT-013: should handle session about to expire (edge case)", () => {
      // GIVEN: Provider with a session expiring in 1 second
      const { result } = renderHook(() => useCashierSession(), {
        wrapper: createWrapper(),
      });
      const almostExpiredSession = createMockSessionData({
        expiresAt: new Date(Date.now() + 1000).toISOString(), // 1 second from now
      });

      act(() => {
        result.current.setSession(almostExpiredSession);
      });

      // THEN: isSessionExpired returns false (not yet expired)
      expect(result.current.isSessionExpired()).toBe(false);
    });
  });

  // ===========================================================================
  // SECTION 4: Session Token Retrieval
  // ===========================================================================

  describe("Session Token Retrieval", () => {
    it("[P0] 4.92-COMPONENT-014: should return null from getSessionToken when no session", () => {
      // GIVEN: Provider with no session
      const { result } = renderHook(() => useCashierSession(), {
        wrapper: createWrapper(),
      });

      // THEN: getSessionToken returns null
      expect(result.current.getSessionToken()).toBeNull();
    });

    it("[P0] 4.92-COMPONENT-015: should return token from getSessionToken for valid session", () => {
      // GIVEN: Provider with a valid session
      const { result } = renderHook(() => useCashierSession(), {
        wrapper: createWrapper(),
      });
      const sessionData = createMockSessionData();

      act(() => {
        result.current.setSession(sessionData);
      });

      // THEN: getSessionToken returns the token
      expect(result.current.getSessionToken()).toBe(sessionData.sessionToken);
    });

    it("[P0] 4.92-COMPONENT-016: should return null and clear session when expired", () => {
      // GIVEN: Provider with an expired session
      const { result } = renderHook(() => useCashierSession(), {
        wrapper: createWrapper(),
      });
      const expiredSession = createMockSessionData({
        expiresAt: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
      });

      act(() => {
        result.current.setSession(expiredSession);
      });

      // WHEN: Getting session token
      let token: string | null;
      act(() => {
        token = result.current.getSessionToken();
      });

      // THEN: Returns null and clears session
      expect(token!).toBeNull();
      expect(result.current.session).toBeNull();
    });
  });

  // ===========================================================================
  // SECTION 5: useCashierSessionToken Hook
  // ===========================================================================

  describe("useCashierSessionToken Hook", () => {
    it("[P1] 4.92-COMPONENT-017: should return null when no session exists", () => {
      // GIVEN: Provider with no session
      const { result } = renderHook(() => useCashierSessionToken(), {
        wrapper: createWrapper(),
      });

      // THEN: Returns null
      expect(result.current).toBeNull();
    });

    it("[P1] 4.92-COMPONENT-018: should return token when valid session exists", () => {
      // GIVEN: Provider needs to set session first
      // We need to use a wrapper that sets session
      const sessionData = createMockSessionData();

      function TestComponent() {
        const { setSession } = useCashierSession();
        const token = useCashierSessionToken();

        // Set session on first render
        if (!token) {
          setSession(sessionData);
        }

        return <div data-testid="token">{token || "no-token"}</div>;
      }

      // WHEN: Component renders with session
      render(
        <CashierSessionProvider>
          <TestComponent />
        </CashierSessionProvider>,
      );

      // THEN: Token is displayed
      expect(screen.getByTestId("token")).toHaveTextContent(
        sessionData.sessionToken,
      );
    });

    it("[P1] 4.92-COMPONENT-019: should throw error when used outside provider", () => {
      // GIVEN: Hook used without provider
      // WHEN/THEN: Should throw specific error
      expect(() => {
        renderHook(() => useCashierSessionToken());
      }).toThrow(
        "useCashierSession must be used within CashierSessionProvider",
      );
    });
  });

  // ===========================================================================
  // SECTION 6: Security Tests
  // ===========================================================================

  describe("Security", () => {
    it("[P0] 4.92-COMPONENT-SEC-001: should not expose session token in context object keys", () => {
      // GIVEN: Provider with session
      const { result } = renderHook(() => useCashierSession(), {
        wrapper: createWrapper(),
      });
      const sessionData = createMockSessionData();

      act(() => {
        result.current.setSession(sessionData);
      });

      // THEN: Context value has expected shape (no internal implementation details exposed)
      const contextKeys = Object.keys(result.current);
      expect(contextKeys).toContain("session");
      expect(contextKeys).toContain("setSession");
      expect(contextKeys).toContain("clearSession");
      expect(contextKeys).toContain("isSessionExpired");
      expect(contextKeys).toContain("getSessionToken");

      // Should not have internal state handlers exposed
      expect(contextKeys).not.toContain("setSessionState");
      expect(contextKeys).not.toContain("sessionStorage");
    });

    it("[P1] 4.92-COMPONENT-SEC-002: should handle concurrent session updates correctly", () => {
      // GIVEN: Provider
      const { result } = renderHook(() => useCashierSession(), {
        wrapper: createWrapper(),
      });

      const session1 = createMockSessionData({ sessionId: "session-1" });
      const session2 = createMockSessionData({ sessionId: "session-2" });

      // WHEN: Setting sessions in quick succession
      act(() => {
        result.current.setSession(session1);
        result.current.setSession(session2);
      });

      // THEN: Latest session wins
      expect(result.current.session?.sessionId).toBe("session-2");
    });

    it("[P1] 4.92-COMPONENT-SEC-003: should not leak session data through toString or valueOf", () => {
      // GIVEN: Provider with session
      const { result } = renderHook(() => useCashierSession(), {
        wrapper: createWrapper(),
      });
      const sessionData = createMockSessionData();

      act(() => {
        result.current.setSession(sessionData);
      });

      // THEN: Converting to string should not reveal token
      const contextString = String(result.current);
      expect(contextString).not.toContain(sessionData.sessionToken);
    });
  });

  // ===========================================================================
  // SECTION 7: Edge Cases
  // ===========================================================================

  describe("Edge Cases", () => {
    it("[P2] 4.92-COMPONENT-020: should handle setting same session data twice", () => {
      // GIVEN: Provider
      const { result } = renderHook(() => useCashierSession(), {
        wrapper: createWrapper(),
      });
      const sessionData = createMockSessionData();

      // WHEN: Setting same session twice
      act(() => {
        result.current.setSession(sessionData);
      });
      act(() => {
        result.current.setSession(sessionData);
      });

      // THEN: Session is correctly set (idempotent)
      expect(result.current.session).toEqual(sessionData);
    });

    it("[P2] 4.92-COMPONENT-021: should handle clearing already cleared session", () => {
      // GIVEN: Provider with no session
      const { result } = renderHook(() => useCashierSession(), {
        wrapper: createWrapper(),
      });

      // WHEN: Clearing when no session exists
      act(() => {
        result.current.clearSession();
      });

      // THEN: No error, session remains null
      expect(result.current.session).toBeNull();
    });

    it("[P2] 4.92-COMPONENT-022: should handle session with expiresAt exactly at current time", () => {
      // GIVEN: Provider with session expiring exactly now
      const { result } = renderHook(() => useCashierSession(), {
        wrapper: createWrapper(),
      });
      const nowSession = createMockSessionData({
        expiresAt: new Date().toISOString(), // Exactly now
      });

      act(() => {
        result.current.setSession(nowSession);
      });

      // THEN: Session is considered expired (expiresAt <= now)
      expect(result.current.isSessionExpired()).toBe(true);
    });

    it("[P2] 4.92-COMPONENT-023: should handle empty sessionStorage gracefully", () => {
      // GIVEN: Empty sessionStorage (getItem returns null)
      mockSessionStorage.getItem.mockReturnValueOnce(null);

      // WHEN: Provider mounts
      const { result } = renderHook(() => useCashierSession(), {
        wrapper: createWrapper(),
      });

      // THEN: Session is null (no error)
      expect(result.current.session).toBeNull();
    });
  });
});
