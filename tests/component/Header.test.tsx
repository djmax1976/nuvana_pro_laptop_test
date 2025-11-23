import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../support/test-utils";
import { Header } from "@/components/layout/Header";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock next-themes for ThemeToggle
const mockUseTheme = vi.fn();
vi.mock("next-themes", () => ({
  useTheme: () => mockUseTheme(),
}));

// Mock AuthContext
const mockUseAuth = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

describe("Header Component - Theme Toggle Visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTheme.mockReturnValue({
      theme: "light",
      setTheme: vi.fn(),
      resolvedTheme: "light",
    });
  });

  it("[P2] should NOT display theme toggle when user is not authenticated", async () => {
    // GIVEN: User is not authenticated
    mockUseAuth.mockReturnValue({
      user: null,
      isLoading: false,
      logout: vi.fn(),
    });

    // WHEN: Header component is rendered
    renderWithProviders(<Header />);

    // THEN: Theme toggle should NOT be visible
    await waitFor(() => {
      expect(
        screen.queryByTestId("theme-toggle"),
        "Theme toggle should NOT be visible for unauthenticated users",
      ).not.toBeInTheDocument();
    });

    // AND: Login button should be visible instead
    expect(
      screen.getByTestId("login-button"),
      "Login button should be visible for unauthenticated users",
    ).toBeInTheDocument();
  });

  it("[P2] should display theme toggle when user is authenticated", async () => {
    // GIVEN: User is authenticated
    mockUseAuth.mockReturnValue({
      user: {
        user_id: "user-123",
        email: "test@example.com",
        name: "Test User",
        status: "ACTIVE",
      },
      isLoading: false,
      logout: vi.fn(),
    });

    // WHEN: Header component is rendered
    renderWithProviders(<Header />);

    // THEN: Theme toggle should be visible
    await waitFor(() => {
      expect(
        screen.getByTestId("theme-toggle"),
        "Theme toggle should be visible for authenticated users",
      ).toBeInTheDocument();
    });

    // AND: User menu should be visible
    expect(
      screen.getByTestId("user-menu-trigger"),
      "User menu should be visible for authenticated users",
    ).toBeInTheDocument();

    // AND: Login button should NOT be visible
    expect(
      screen.queryByTestId("login-button"),
      "Login button should NOT be visible for authenticated users",
    ).not.toBeInTheDocument();
  });

  it("[P2] should not display theme toggle during loading state", async () => {
    // GIVEN: Authentication is loading
    mockUseAuth.mockReturnValue({
      user: null,
      isLoading: true,
      logout: vi.fn(),
    });

    // WHEN: Header component is rendered
    renderWithProviders(<Header />);

    // THEN: Theme toggle should NOT be visible during loading
    expect(
      screen.queryByTestId("theme-toggle"),
      "Theme toggle should NOT be visible while authentication is loading",
    ).not.toBeInTheDocument();
  });

  it("[P2] should display theme toggle in correct order with user menu", async () => {
    // GIVEN: User is authenticated
    mockUseAuth.mockReturnValue({
      user: {
        user_id: "user-123",
        email: "test@example.com",
        name: "Test User",
        status: "ACTIVE",
      },
      isLoading: false,
      logout: vi.fn(),
    });

    // WHEN: Header component is rendered
    renderWithProviders(<Header />);

    // THEN: Theme toggle should appear before user menu in DOM order
    await waitFor(() => {
      const header = screen.getByTestId("header");
      const themeToggle = screen.getByTestId("theme-toggle");
      const userMenu = screen.getByTestId("user-menu-trigger");

      const headerChildren = Array.from(
        header.querySelectorAll("[data-testid]"),
      );
      const themeToggleIndex = headerChildren.indexOf(themeToggle);
      const userMenuIndex = headerChildren.indexOf(userMenu);

      expect(
        themeToggleIndex,
        "Theme toggle should appear before user menu in header",
      ).toBeLessThan(userMenuIndex);
    });
  });
});
