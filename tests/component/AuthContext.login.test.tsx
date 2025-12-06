/**
 * AuthContext Login Integration Tests
 *
 * These tests verify the ACTUAL login() function in AuthContext works correctly
 * by mocking fetch with REAL backend response formats.
 *
 * IMPORTANT: These tests exist because unit tests that mock useAuth() entirely
 * will NOT catch bugs in the AuthContext implementation itself.
 *
 * The bug caught here: Backend returns { success: true, data: { user: {...} } }
 * but code was accessing data.user instead of data.data.user
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock useRouter
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Test component that exposes login function
function LoginTestComponent({
  onLoginResult,
}: {
  onLoginResult: (result: { success: boolean; error?: string }) => void;
}) {
  const { login, user, isLoading, userRole, isStoreUser } = useAuth();

  const handleLogin = async () => {
    try {
      await login("test@example.com", "password123");
      onLoginResult({ success: true });
    } catch (error) {
      onLoginResult({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  return (
    <div>
      <button onClick={handleLogin} data-testid="login-button">
        Login
      </button>
      {isLoading && <div data-testid="loading">Loading...</div>}
      {user && (
        <div data-testid="user-info">
          <span data-testid="user-email">{user.email}</span>
          <span data-testid="user-id">{user.id}</span>
          <span data-testid="user-role">{userRole}</span>
          <span data-testid="is-store-user">{String(isStoreUser)}</span>
        </div>
      )}
      {!user && !isLoading && <div data-testid="no-user">No user</div>}
    </div>
  );
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{ui}</AuthProvider>
    </QueryClientProvider>,
  );
}

describe("AuthContext Login - Real Backend Response Format", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockFetch.mockClear();
    mockPush.mockClear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("Backend Response Parsing", () => {
    it("[P0] should correctly parse backend response format: { success: true, data: { user: {...} } }", async () => {
      /**
       * This test verifies the EXACT backend response format is handled correctly.
       * The bug was: code accessed data.user instead of data.data.user
       */
      const user = userEvent.setup();
      let loginResult: { success: boolean; error?: string } | null = null;

      // Mock the EXACT backend response format
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            message: "Login successful",
            user: {
              id: "user-123",
              email: "test@example.com",
              name: "Test User",
              is_client_user: false,
              user_role: "SUPERADMIN",
              roles: ["SUPERADMIN"],
            },
          },
        }),
      });

      renderWithProviders(
        <LoginTestComponent onLoginResult={(r) => (loginResult = r)} />,
      );

      // Click login button
      await user.click(screen.getByTestId("login-button"));

      // Wait for login to complete
      await waitFor(() => {
        expect(loginResult).not.toBeNull();
      });

      // THEN: Login should succeed
      expect(loginResult!.success).toBe(true);
      expect(loginResult!.error).toBeUndefined();

      // AND: User should be set in state
      await waitFor(() => {
        expect(screen.getByTestId("user-email")).toHaveTextContent(
          "test@example.com",
        );
        expect(screen.getByTestId("user-id")).toHaveTextContent("user-123");
        expect(screen.getByTestId("user-role")).toHaveTextContent("SUPERADMIN");
      });

      // AND: localStorage should have correct data
      const authSession = JSON.parse(
        localStorage.getItem("auth_session") || "{}",
      );
      expect(authSession.user.id).toBe("user-123");
      expect(authSession.user.email).toBe("test@example.com");
      expect(authSession.userRole).toBe("SUPERADMIN");
    });

    it("[P0] should handle CLIENT_OWNER role correctly", async () => {
      const user = userEvent.setup();
      let loginResult: { success: boolean; error?: string } | null = null;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            user: {
              id: "owner-456",
              email: "owner@example.com",
              name: "Client Owner",
              is_client_user: true,
              user_role: "CLIENT_OWNER",
              roles: ["CLIENT_OWNER"],
            },
          },
        }),
      });

      renderWithProviders(
        <LoginTestComponent onLoginResult={(r) => (loginResult = r)} />,
      );

      await user.click(screen.getByTestId("login-button"));

      await waitFor(() => {
        expect(loginResult?.success).toBe(true);
      });

      await waitFor(() => {
        expect(screen.getByTestId("user-role")).toHaveTextContent(
          "CLIENT_OWNER",
        );
      });

      const authSession = JSON.parse(
        localStorage.getItem("auth_session") || "{}",
      );
      expect(authSession.userRole).toBe("CLIENT_OWNER");
      expect(authSession.isClientUser).toBe(true);
    });

    it("[P0] should handle store user roles (CASHIER) correctly", async () => {
      const user = userEvent.setup();
      let loginResult: { success: boolean; error?: string } | null = null;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            user: {
              id: "cashier-789",
              email: "cashier@example.com",
              name: "Store Cashier",
              is_client_user: false,
              user_role: "CASHIER",
              roles: ["CASHIER"],
            },
          },
        }),
      });

      renderWithProviders(
        <LoginTestComponent onLoginResult={(r) => (loginResult = r)} />,
      );

      await user.click(screen.getByTestId("login-button"));

      await waitFor(() => {
        expect(loginResult?.success).toBe(true);
      });

      await waitFor(() => {
        expect(screen.getByTestId("is-store-user")).toHaveTextContent("true");
      });

      const authSession = JSON.parse(
        localStorage.getItem("auth_session") || "{}",
      );
      expect(authSession.isStoreUser).toBe(true);
    });

    it("[P0] should handle store user roles (STORE_MANAGER) correctly", async () => {
      const user = userEvent.setup();
      let loginResult: { success: boolean; error?: string } | null = null;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            user: {
              id: "manager-101",
              email: "manager@example.com",
              name: "Store Manager",
              is_client_user: false,
              user_role: "STORE_MANAGER",
              roles: ["STORE_MANAGER"],
            },
          },
        }),
      });

      renderWithProviders(
        <LoginTestComponent onLoginResult={(r) => (loginResult = r)} />,
      );

      await user.click(screen.getByTestId("login-button"));

      await waitFor(() => {
        expect(loginResult?.success).toBe(true);
      });

      await waitFor(() => {
        expect(screen.getByTestId("is-store-user")).toHaveTextContent("true");
        expect(screen.getByTestId("user-role")).toHaveTextContent(
          "STORE_MANAGER",
        );
      });
    });
  });

  describe("Error Handling", () => {
    it("[P0] should handle login failure with error message", async () => {
      const user = userEvent.setup();
      let loginResult: { success: boolean; error?: string } | null = null;

      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          success: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid email or password",
          },
        }),
      });

      renderWithProviders(
        <LoginTestComponent onLoginResult={(r) => (loginResult = r)} />,
      );

      await user.click(screen.getByTestId("login-button"));

      await waitFor(() => {
        expect(loginResult?.success).toBe(false);
        expect(loginResult?.error).toBe("Invalid email or password");
      });
    });

    it("[P0] should handle malformed response (missing user data)", async () => {
      const user = userEvent.setup();
      let loginResult: { success: boolean; error?: string } | null = null;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            message: "Login successful",
            // Missing user object!
          },
        }),
      });

      renderWithProviders(
        <LoginTestComponent onLoginResult={(r) => (loginResult = r)} />,
      );

      await user.click(screen.getByTestId("login-button"));

      await waitFor(() => {
        expect(loginResult?.success).toBe(false);
        expect(loginResult?.error).toContain("Invalid response");
      });
    });

    it("[P0] should handle network error gracefully", async () => {
      const user = userEvent.setup();
      let loginResult: { success: boolean; error?: string } | null = null;

      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      renderWithProviders(
        <LoginTestComponent onLoginResult={(r) => (loginResult = r)} />,
      );

      await user.click(screen.getByTestId("login-button"));

      await waitFor(() => {
        expect(loginResult?.success).toBe(false);
        expect(loginResult?.error).toBe("Network error");
      });
    });
  });

  describe("Theme Restoration on Login", () => {
    it("[P1] should restore user's saved theme preference on login", async () => {
      const user = userEvent.setup();
      let loginResult: { success: boolean; error?: string } | null = null;

      // Pre-save dark theme preference for this user
      localStorage.setItem("nuvana-theme-user-123", "dark");

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            user: {
              id: "user-123",
              email: "test@example.com",
              name: "Test User",
              user_role: "SUPERADMIN",
              roles: ["SUPERADMIN"],
            },
          },
        }),
      });

      renderWithProviders(
        <LoginTestComponent onLoginResult={(r) => (loginResult = r)} />,
      );

      await user.click(screen.getByTestId("login-button"));

      await waitFor(() => {
        expect(loginResult?.success).toBe(true);
      });

      // Theme should be restored
      expect(localStorage.getItem("nuvana-theme")).toBe("dark");
    });
  });

  describe("localStorage Session Storage", () => {
    it("[P0] should store complete session data in localStorage", async () => {
      const user = userEvent.setup();
      let loginResult: { success: boolean; error?: string } | null = null;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            user: {
              id: "user-123",
              email: "test@example.com",
              name: "Test User",
              is_client_user: false,
              user_role: "SUPERADMIN",
              roles: ["SUPERADMIN"],
            },
          },
        }),
      });

      renderWithProviders(
        <LoginTestComponent onLoginResult={(r) => (loginResult = r)} />,
      );

      await user.click(screen.getByTestId("login-button"));

      await waitFor(() => {
        expect(loginResult?.success).toBe(true);
      });

      // Verify localStorage structure
      const authSession = JSON.parse(
        localStorage.getItem("auth_session") || "{}",
      );

      expect(authSession).toEqual({
        user: {
          id: "user-123",
          email: "test@example.com",
          name: "Test User",
          is_client_user: false,
          user_role: "SUPERADMIN",
          roles: ["SUPERADMIN"],
        },
        authenticated: true,
        isClientUser: false,
        isStoreUser: false,
        userRole: "SUPERADMIN",
      });
    });

    it("[P1] should clear legacy client_auth_session key on login", async () => {
      const user = userEvent.setup();
      let loginResult: { success: boolean; error?: string } | null = null;

      // Set legacy key
      localStorage.setItem("client_auth_session", "legacy-data");

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            user: {
              id: "user-123",
              email: "test@example.com",
              name: "Test User",
              user_role: "SUPERADMIN",
              roles: ["SUPERADMIN"],
            },
          },
        }),
      });

      renderWithProviders(
        <LoginTestComponent onLoginResult={(r) => (loginResult = r)} />,
      );

      await user.click(screen.getByTestId("login-button"));

      await waitFor(() => {
        expect(loginResult?.success).toBe(true);
      });

      // Legacy key should be cleared
      expect(localStorage.getItem("client_auth_session")).toBeNull();
    });
  });
});

describe("AuthContext Login - Backward Compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockFetch.mockClear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("[P1] should handle alternative response format: { user: {...} } (no data wrapper)", async () => {
    /**
     * Some endpoints might return user directly without the data wrapper.
     * The code should handle both formats.
     */
    const user = userEvent.setup();
    let loginResult: { success: boolean; error?: string } | null = null;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        user: {
          id: "user-123",
          email: "test@example.com",
          name: "Test User",
          user_role: "SUPERADMIN",
          roles: ["SUPERADMIN"],
        },
      }),
    });

    renderWithProviders(
      <LoginTestComponent onLoginResult={(r) => (loginResult = r)} />,
    );

    await user.click(screen.getByTestId("login-button"));

    await waitFor(() => {
      expect(loginResult?.success).toBe(true);
    });

    await waitFor(() => {
      expect(screen.getByTestId("user-email")).toHaveTextContent(
        "test@example.com",
      );
    });
  });
});
