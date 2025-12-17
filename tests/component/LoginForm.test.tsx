import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  renderWithProviders,
  screen,
  waitFor,
  fireEvent,
} from "../support/test-utils";
import { LoginForm } from "@/components/auth/LoginForm";
import userEvent from "@testing-library/user-event";

// Mock Next.js navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/login",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock the toast hook
const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

// Mock AuthContext with controllable login function
const mockLogin = vi.fn();
const mockAuthContext = {
  user: null,
  isLoading: false,
  login: mockLogin,
  logout: vi.fn(),
  userRole: null,
  isStoreUser: false,
  isClientUser: false,
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockAuthContext,
}));

describe("2.1-COMPONENT: LoginForm Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockAuthContext.user = null;
    mockAuthContext.userRole = null;
    mockAuthContext.isStoreUser = false;
    mockAuthContext.isClientUser = false;
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("Form Rendering", () => {
    it("[P0] 2.1-COMPONENT-001: should render all required form fields", () => {
      // GIVEN: LoginForm component
      // WHEN: Component is rendered
      renderWithProviders(<LoginForm />);

      // THEN: All required fields should be visible
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /sign in/i }),
      ).toBeInTheDocument();
    });

    it("[P1] 2.1-COMPONENT-002: should have email input with type=email for browser validation", () => {
      // GIVEN: LoginForm component
      // WHEN: Component is rendered
      renderWithProviders(<LoginForm />);

      // THEN: Email input should have type="email"
      const emailInput = screen.getByLabelText(/email/i);
      expect(emailInput).toHaveAttribute("type", "email");
    });

    it("[P1] 2.1-COMPONENT-003: should have password input with type=password", () => {
      // GIVEN: LoginForm component
      // WHEN: Component is rendered
      renderWithProviders(<LoginForm />);

      // THEN: Password input should have type="password"
      const passwordInput = screen.getByLabelText(/password/i);
      expect(passwordInput).toHaveAttribute("type", "password");
    });

    it("[P1] 2.1-COMPONENT-004: should toggle password visibility when clicking eye icon", async () => {
      // GIVEN: LoginForm component
      const user = userEvent.setup();
      renderWithProviders(<LoginForm />);

      const passwordInput = screen.getByLabelText(/password/i);
      const toggleButton = screen.getByRole("button", { name: "Show" });

      // THEN: Password should be hidden by default
      expect(passwordInput).toHaveAttribute("type", "password");

      // WHEN: User clicks the toggle button
      await user.click(toggleButton);

      // THEN: Password should be visible
      expect(passwordInput).toHaveAttribute("type", "text");
      expect(screen.getByRole("button", { name: "Hide" })).toBeInTheDocument();

      // WHEN: User clicks the toggle button again
      await user.click(screen.getByRole("button", { name: "Hide" }));

      // THEN: Password should be hidden again
      expect(passwordInput).toHaveAttribute("type", "password");
    });
  });

  describe("AuthContext Integration", () => {
    it("[P0] 2.1-COMPONENT-010: should call AuthContext login() with email and password", async () => {
      // GIVEN: LoginForm component with AuthContext
      const user = userEvent.setup();
      mockLogin.mockResolvedValueOnce(undefined);

      // Set up localStorage to simulate successful login response
      localStorage.setItem(
        "auth_session",
        JSON.stringify({
          userRole: "SUPERADMIN",
          isStoreUser: false,
          user: { id: "user-123", email: "test@test.com" },
        }),
      );

      renderWithProviders(<LoginForm />);

      // WHEN: User fills in form and submits
      await user.type(screen.getByLabelText(/email/i), "test@test.com");
      await user.type(screen.getByLabelText(/password/i), "Password123!");
      await user.click(screen.getByRole("button", { name: /sign in/i }));

      // THEN: AuthContext login() should be called with credentials
      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith("test@test.com", "Password123!");
      });
    });

    it("[P0] 2.1-COMPONENT-011: should NOT make direct fetch call - uses AuthContext instead", async () => {
      // GIVEN: LoginForm component with AuthContext
      const user = userEvent.setup();
      const fetchSpy = vi.spyOn(global, "fetch");
      mockLogin.mockResolvedValueOnce(undefined);

      localStorage.setItem(
        "auth_session",
        JSON.stringify({
          userRole: "SUPERADMIN",
          isStoreUser: false,
        }),
      );

      renderWithProviders(<LoginForm />);

      // WHEN: User submits form
      await user.type(screen.getByLabelText(/email/i), "test@test.com");
      await user.type(screen.getByLabelText(/password/i), "Password123!");
      await user.click(screen.getByRole("button", { name: /sign in/i }));

      // THEN: Direct fetch should NOT be called (AuthContext handles the API call)
      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalled();
      });

      // The component should delegate to AuthContext, not make its own fetch
      // AuthContext's login() makes the fetch, not LoginForm directly
      expect(fetchSpy).not.toHaveBeenCalled();

      fetchSpy.mockRestore();
    });

    it("[P0] 2.1-COMPONENT-012: should display error message when login fails", async () => {
      // GIVEN: LoginForm component where login will fail
      const user = userEvent.setup();
      mockLogin.mockRejectedValueOnce(new Error("Invalid credentials"));

      renderWithProviders(<LoginForm />);

      // WHEN: User submits form with invalid credentials
      await user.type(screen.getByLabelText(/email/i), "wrong@test.com");
      await user.type(screen.getByLabelText(/password/i), "wrongpassword");
      await user.click(screen.getByRole("button", { name: /sign in/i }));

      // THEN: Error message should be displayed
      await waitFor(() => {
        expect(screen.getByText(/Invalid credentials/i)).toBeInTheDocument();
      });
    });

    it("[P1] 2.1-COMPONENT-013: should show loading state during login", async () => {
      // GIVEN: LoginForm component where login is slow
      const user = userEvent.setup();

      // Make login hang for a while
      mockLogin.mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(resolve, 1000)),
      );

      renderWithProviders(<LoginForm />);

      // Fill in form
      await user.type(screen.getByLabelText(/email/i), "test@test.com");
      await user.type(screen.getByLabelText(/password/i), "Password123!");

      // WHEN: User submits form
      await user.click(screen.getByRole("button", { name: /sign in/i }));

      // THEN: Button should show loading state
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /signing in/i }),
        ).toBeInTheDocument();
      });
    });
  });

  describe("Role-Based Redirect", () => {
    it("[P0] 2.1-COMPONENT-020: should redirect SUPERADMIN to /dashboard", async () => {
      // GIVEN: LoginForm component with successful SUPERADMIN login
      const user = userEvent.setup();
      mockLogin.mockResolvedValueOnce(undefined);

      localStorage.setItem(
        "auth_session",
        JSON.stringify({
          userRole: "SUPERADMIN",
          isStoreUser: false,
          user: { id: "user-123" },
        }),
      );

      renderWithProviders(<LoginForm />);

      // WHEN: SUPERADMIN logs in
      await user.type(screen.getByLabelText(/email/i), "admin@test.com");
      await user.type(screen.getByLabelText(/password/i), "Password123!");
      await user.click(screen.getByRole("button", { name: /sign in/i }));

      // THEN: Should redirect to /dashboard
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/dashboard");
      });
    });

    it("[P0] 2.1-COMPONENT-021: should redirect CLIENT_OWNER to /client-dashboard", async () => {
      // GIVEN: LoginForm component with successful CLIENT_OWNER login
      const user = userEvent.setup();
      mockLogin.mockResolvedValueOnce(undefined);

      localStorage.setItem(
        "auth_session",
        JSON.stringify({
          userRole: "CLIENT_OWNER",
          isStoreUser: false,
          user: { id: "user-456" },
        }),
      );

      renderWithProviders(<LoginForm />);

      // WHEN: CLIENT_OWNER logs in
      await user.type(screen.getByLabelText(/email/i), "owner@test.com");
      await user.type(screen.getByLabelText(/password/i), "Password123!");
      await user.click(screen.getByRole("button", { name: /sign in/i }));

      // THEN: Should redirect to /client-dashboard
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/client-dashboard");
      });
    });

    it("[P0] 2.1-COMPONENT-022: should redirect store users (CASHIER) to /mystore", async () => {
      // GIVEN: LoginForm component with successful store user login
      const user = userEvent.setup();
      mockLogin.mockResolvedValueOnce(undefined);

      localStorage.setItem(
        "auth_session",
        JSON.stringify({
          userRole: "CASHIER",
          isStoreUser: true,
          user: { id: "user-789" },
        }),
      );

      renderWithProviders(<LoginForm />);

      // WHEN: Store user logs in
      await user.type(screen.getByLabelText(/email/i), "cashier@test.com");
      await user.type(screen.getByLabelText(/password/i), "Password123!");
      await user.click(screen.getByRole("button", { name: /sign in/i }));

      // THEN: Should redirect to /mystore
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/mystore");
      });
    });

    it("[P0] 2.1-COMPONENT-023: should redirect store users (STORE_MANAGER) to /mystore", async () => {
      // GIVEN: LoginForm component with successful STORE_MANAGER login
      const user = userEvent.setup();
      mockLogin.mockResolvedValueOnce(undefined);

      localStorage.setItem(
        "auth_session",
        JSON.stringify({
          userRole: "STORE_MANAGER",
          isStoreUser: true,
          user: { id: "user-101" },
        }),
      );

      renderWithProviders(<LoginForm />);

      // WHEN: Store manager logs in
      await user.type(screen.getByLabelText(/email/i), "manager@test.com");
      await user.type(screen.getByLabelText(/password/i), "Password123!");
      await user.click(screen.getByRole("button", { name: /sign in/i }));

      // THEN: Should redirect to /mystore
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/mystore");
      });
    });
  });

  describe("onSuccess Callback", () => {
    it("[P1] 2.1-COMPONENT-030: should call onSuccess callback instead of redirecting", async () => {
      // GIVEN: LoginForm component with onSuccess callback
      const user = userEvent.setup();
      const onSuccess = vi.fn();
      mockLogin.mockResolvedValueOnce(undefined);

      localStorage.setItem(
        "auth_session",
        JSON.stringify({
          userRole: "SUPERADMIN",
          isStoreUser: false,
        }),
      );

      renderWithProviders(<LoginForm onSuccess={onSuccess} />);

      // WHEN: User logs in successfully
      await user.type(screen.getByLabelText(/email/i), "test@test.com");
      await user.type(screen.getByLabelText(/password/i), "Password123!");
      await user.click(screen.getByRole("button", { name: /sign in/i }));

      // THEN: onSuccess should be called instead of redirect
      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
        expect(mockPush).not.toHaveBeenCalled();
      });
    });
  });

  describe("Error Handling", () => {
    it("[P1] 2.1-COMPONENT-040: should show toast for invalid role error", async () => {
      // GIVEN: LoginForm component where login returns invalid role error
      const user = userEvent.setup();
      mockLogin.mockRejectedValueOnce(new Error("invalid role detected"));

      renderWithProviders(<LoginForm />);

      // WHEN: User logs in with account that has invalid role
      await user.type(screen.getByLabelText(/email/i), "baduser@test.com");
      await user.type(screen.getByLabelText(/password/i), "Password123!");
      await user.click(screen.getByRole("button", { name: /sign in/i }));

      // THEN: Toast should be shown for invalid role
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Authentication Error",
            variant: "destructive",
          }),
        );
      });
    });

    it("[P1] 2.1-COMPONENT-041: should display generic error for other failures", async () => {
      // GIVEN: LoginForm component where login fails with network error
      const user = userEvent.setup();
      mockLogin.mockRejectedValueOnce(new Error("Network error"));

      renderWithProviders(<LoginForm />);

      // WHEN: Login fails due to network
      await user.type(screen.getByLabelText(/email/i), "test@test.com");
      await user.type(screen.getByLabelText(/password/i), "Password123!");
      await user.click(screen.getByRole("button", { name: /sign in/i }));

      // THEN: Error message should be displayed
      await waitFor(() => {
        expect(screen.getByText(/Network error/i)).toBeInTheDocument();
      });
    });
  });
});

describe("2.1-COMPONENT: LoginForm - React State Synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("[P0] 2.1-COMPONENT-050: should use AuthContext login() which updates React state", async () => {
    /**
     * This test verifies that LoginForm uses AuthContext's login() function
     * which properly updates React state, enabling components like Header
     * to re-render when auth state changes.
     *
     * The fix was to change LoginForm from:
     * - BEFORE: Making direct fetch() calls that only updated localStorage
     * - AFTER: Calling useAuth().login() which updates both React state AND localStorage
     *
     * This ensures the navbar updates immediately after login without page refresh.
     */
    const user = userEvent.setup();

    // Mock successful login
    mockLogin.mockResolvedValueOnce(undefined);

    localStorage.setItem(
      "auth_session",
      JSON.stringify({
        userRole: "SUPERADMIN",
        isStoreUser: false,
      }),
    );

    renderWithProviders(<LoginForm />);

    // Submit login form
    await user.type(screen.getByLabelText(/email/i), "test@test.com");
    await user.type(screen.getByLabelText(/password/i), "Password123!");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    // VERIFY: AuthContext.login() was called (not a direct fetch)
    // This is the critical assertion - the component delegates to AuthContext
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledTimes(1);
      expect(mockLogin).toHaveBeenCalledWith("test@test.com", "Password123!");
    });
  });
});
