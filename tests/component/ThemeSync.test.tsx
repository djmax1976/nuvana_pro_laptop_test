import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithProviders } from "../support/test-utils";
import { ThemeSync } from "@/components/providers/ThemeSync";
import { act } from "@testing-library/react";

// Mock next-themes
const mockSetTheme = vi.fn();
const mockUseTheme = vi.fn();
vi.mock("next-themes", () => ({
  useTheme: () => mockUseTheme(),
}));

// Mock AuthContext
const mockUser = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: mockUser(),
  }),
}));

describe("ThemeSync Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Reset DOM
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "";

    mockSetTheme.mockClear();
    mockUseTheme.mockReturnValue({
      theme: "light",
      setTheme: mockSetTheme,
      resolvedTheme: "light",
    });
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "";
  });

  describe("Theme Sync to User-Specific localStorage", () => {
    it("should save theme preference to user-specific localStorage when user is authenticated", () => {
      // GIVEN: User is authenticated and theme changes
      const user = {
        id: "user-123",
        email: "user@example.com",
        name: "Test User",
      };
      mockUser.mockReturnValue(user);
      mockUseTheme.mockReturnValue({
        theme: "dark",
        setTheme: mockSetTheme,
        resolvedTheme: "dark",
      });

      // WHEN: Component renders and theme is dark
      renderWithProviders(<ThemeSync />);

      // THEN: Theme should be saved to user-specific key
      const userThemeKey = `nuvana-theme-${user.id}`;
      expect(
        localStorage.getItem(userThemeKey),
        "Theme preference should be saved to user-specific localStorage key",
      ).toBe("dark");
    });

    it("should NOT save theme preference when user is not authenticated", () => {
      // GIVEN: User is not authenticated
      mockUser.mockReturnValue(null);
      mockUseTheme.mockReturnValue({
        theme: "dark",
        setTheme: mockSetTheme,
        resolvedTheme: "dark",
      });

      // WHEN: Component renders
      renderWithProviders(<ThemeSync />);

      // THEN: No theme should be saved
      expect(
        localStorage.getItem("nuvana-theme-user-123"),
        "Theme preference should NOT be saved when user is not authenticated",
      ).toBeNull();
    });

    it("should NOT save 'system' theme", () => {
      // GIVEN: User is authenticated but theme is 'system'
      const user = {
        id: "user-123",
        email: "user@example.com",
        name: "Test User",
      };
      mockUser.mockReturnValue(user);
      mockUseTheme.mockReturnValue({
        theme: "system",
        setTheme: mockSetTheme,
        resolvedTheme: "light",
      });

      // WHEN: Component renders
      renderWithProviders(<ThemeSync />);

      // THEN: System theme should NOT be saved
      const userThemeKey = `nuvana-theme-${user.id}`;
      expect(
        localStorage.getItem(userThemeKey),
        "System theme should NOT be saved to localStorage",
      ).toBeNull();
    });
  });

  describe("Theme Restoration on User Login", () => {
    it("should restore dark theme when user with dark preference logs in", () => {
      // GIVEN: User has dark theme preference saved
      const user = {
        id: "user-123",
        email: "user@example.com",
        name: "Test User",
      };
      const userThemeKey = `nuvana-theme-${user.id}`;
      localStorage.setItem(userThemeKey, "dark");

      // Initially no user (logged out)
      mockUser.mockReturnValue(null);
      mockUseTheme.mockReturnValue({
        theme: "light",
        setTheme: mockSetTheme,
        resolvedTheme: "light",
      });

      const { rerender } = renderWithProviders(<ThemeSync />);

      // WHEN: User logs in
      act(() => {
        mockUser.mockReturnValue(user);
        rerender(<ThemeSync />);
      });

      // THEN: Theme should be restored to dark
      expect(
        mockSetTheme,
        "setTheme should be called with 'dark' when user with dark preference logs in",
      ).toHaveBeenCalledWith("dark");
      expect(
        localStorage.getItem("nuvana-theme"),
        "Theme should be set in next-themes storage key",
      ).toBe("dark");
      expect(
        document.documentElement.classList.contains("dark"),
        "DOM should have dark class applied",
      ).toBe(true);
    });

    it("should restore light theme when user with light preference logs in", () => {
      // GIVEN: User has light theme preference saved
      const user = {
        id: "user-456",
        email: "user2@example.com",
        name: "User 2",
      };
      const userThemeKey = `nuvana-theme-${user.id}`;
      localStorage.setItem(userThemeKey, "light");

      // Initially no user (logged out)
      mockUser.mockReturnValue(null);
      mockUseTheme.mockReturnValue({
        theme: "light",
        setTheme: mockSetTheme,
        resolvedTheme: "light",
      });

      const { rerender } = renderWithProviders(<ThemeSync />);

      // WHEN: User logs in
      act(() => {
        mockUser.mockReturnValue(user);
        rerender(<ThemeSync />);
      });

      // THEN: Theme should be restored to light
      expect(
        mockSetTheme,
        "setTheme should be called with 'light' when user with light preference logs in",
      ).toHaveBeenCalledWith("light");
      expect(
        localStorage.getItem("nuvana-theme"),
        "Theme should be set in next-themes storage key",
      ).toBe("light");
      expect(
        document.documentElement.classList.contains("dark"),
        "DOM should NOT have dark class",
      ).toBe(false);
    });

    it("should default to light theme when user with no preference logs in", () => {
      // GIVEN: User has NO theme preference saved
      const user = {
        id: "user-789",
        email: "newuser@example.com",
        name: "New User",
      };
      // No localStorage entry for this user

      // Initially no user (logged out)
      mockUser.mockReturnValue(null);
      mockUseTheme.mockReturnValue({
        theme: "light",
        setTheme: mockSetTheme,
        resolvedTheme: "light",
      });

      const { rerender } = renderWithProviders(<ThemeSync />);

      // WHEN: User logs in
      act(() => {
        mockUser.mockReturnValue(user);
        rerender(<ThemeSync />);
      });

      // THEN: Theme should remain light (default)
      expect(
        mockSetTheme,
        "setTheme should NOT be called when user has no saved preference",
      ).not.toHaveBeenCalled();
      expect(
        document.documentElement.classList.contains("dark"),
        "DOM should NOT have dark class (defaults to light)",
      ).toBe(false);
    });
  });

  describe("User Isolation - Different Users Have Different Preferences", () => {
    it("should apply User A's dark preference when User A logs in", () => {
      // GIVEN: User A has dark preference saved
      const userA = {
        id: "user-a",
        email: "usera@example.com",
        name: "User A",
      };
      const userAThemeKey = `nuvana-theme-${userA.id}`;
      localStorage.setItem(userAThemeKey, "dark");

      mockUser.mockReturnValue(null);
      mockUseTheme.mockReturnValue({
        theme: "light",
        setTheme: mockSetTheme,
        resolvedTheme: "light",
      });

      const { rerender } = renderWithProviders(<ThemeSync />);

      // WHEN: User A logs in
      act(() => {
        mockUser.mockReturnValue(userA);
        rerender(<ThemeSync />);
      });

      // THEN: User A's dark theme should be applied
      expect(mockSetTheme).toHaveBeenCalledWith("dark");
      expect(localStorage.getItem("nuvana-theme")).toBe("dark");
    });

    it("should apply User B's light preference when User B logs in (after User A)", () => {
      // GIVEN: User A has dark preference, User B has light preference
      const userA = {
        id: "user-a",
        email: "usera@example.com",
        name: "User A",
      };
      const userB = {
        id: "user-b",
        email: "userb@example.com",
        name: "User B",
      };
      const userAThemeKey = `nuvana-theme-${userA.id}`;
      const userBThemeKey = `nuvana-theme-${userB.id}`;
      localStorage.setItem(userAThemeKey, "dark");
      localStorage.setItem(userBThemeKey, "light");

      // User A logs in first
      mockUser.mockReturnValue(userA);
      mockUseTheme.mockReturnValue({
        theme: "dark",
        setTheme: mockSetTheme,
        resolvedTheme: "dark",
      });

      const { rerender } = renderWithProviders(<ThemeSync />);
      mockSetTheme.mockClear();

      // WHEN: User A logs out and User B logs in
      act(() => {
        mockUser.mockReturnValue(null);
        rerender(<ThemeSync />);
      });

      act(() => {
        mockUser.mockReturnValue(userB);
        mockUseTheme.mockReturnValue({
          theme: "light",
          setTheme: mockSetTheme,
          resolvedTheme: "light",
        });
        rerender(<ThemeSync />);
      });

      // THEN: User B's light theme should be applied (NOT User A's dark)
      expect(
        mockSetTheme,
        "User B's light theme should be applied, not User A's dark theme",
      ).toHaveBeenCalledWith("light");
      expect(
        localStorage.getItem("nuvana-theme"),
        "Theme should be set to User B's light preference",
      ).toBe("light");
      expect(
        document.documentElement.classList.contains("dark"),
        "DOM should NOT have dark class (User B prefers light)",
      ).toBe(false);
    });
  });

  describe("Theme Reset on Logout", () => {
    it("should reset to light theme when user logs out", () => {
      // GIVEN: User is logged in with dark theme
      const user = {
        id: "user-123",
        email: "user@example.com",
        name: "Test User",
      };
      mockUser.mockReturnValue(user);
      mockUseTheme.mockReturnValue({
        theme: "dark",
        setTheme: mockSetTheme,
        resolvedTheme: "dark",
      });

      // Set dark theme in DOM
      document.documentElement.classList.add("dark");
      document.documentElement.style.colorScheme = "dark";

      const { rerender } = renderWithProviders(<ThemeSync />);
      mockSetTheme.mockClear();

      // WHEN: User logs out
      act(() => {
        mockUser.mockReturnValue(null);
        rerender(<ThemeSync />);
      });

      // THEN: Theme should be reset to light
      expect(
        mockSetTheme,
        "setTheme should be called with 'light' on logout",
      ).toHaveBeenCalledWith("light");
      expect(
        localStorage.getItem("nuvana-theme"),
        "Theme should be reset to light in localStorage",
      ).toBe("light");
      expect(
        document.documentElement.classList.contains("dark"),
        "DOM should NOT have dark class after logout",
      ).toBe(false);
      expect(
        document.documentElement.style.colorScheme,
        "Color scheme should be reset to light",
      ).toBe("light");
    });
  });

  describe("DOM Manipulation Fallback", () => {
    it("should apply dark class to DOM when restoring dark theme", () => {
      // GIVEN: User has dark preference
      const user = {
        id: "user-123",
        email: "user@example.com",
        name: "Test User",
      };
      const userThemeKey = `nuvana-theme-${user.id}`;
      localStorage.setItem(userThemeKey, "dark");

      mockUser.mockReturnValue(null);
      mockUseTheme.mockReturnValue({
        theme: "light",
        setTheme: mockSetTheme,
        resolvedTheme: "light",
      });

      const { rerender } = renderWithProviders(<ThemeSync />);

      // WHEN: User logs in
      act(() => {
        mockUser.mockReturnValue(user);
        rerender(<ThemeSync />);
      });

      // THEN: DOM should have dark class and colorScheme
      expect(document.documentElement.classList.contains("dark")).toBe(true);
      expect(document.documentElement.style.colorScheme).toBe("dark");
    });

    it("should remove dark class from DOM when restoring light theme", () => {
      // GIVEN: DOM has dark class, user has light preference
      document.documentElement.classList.add("dark");
      document.documentElement.style.colorScheme = "dark";

      const user = {
        id: "user-123",
        email: "user@example.com",
        name: "Test User",
      };
      const userThemeKey = `nuvana-theme-${user.id}`;
      localStorage.setItem(userThemeKey, "light");

      mockUser.mockReturnValue(null);
      mockUseTheme.mockReturnValue({
        theme: "dark",
        setTheme: mockSetTheme,
        resolvedTheme: "dark",
      });

      const { rerender } = renderWithProviders(<ThemeSync />);

      // WHEN: User logs in
      act(() => {
        mockUser.mockReturnValue(user);
        rerender(<ThemeSync />);
      });

      // THEN: DOM should NOT have dark class
      expect(document.documentElement.classList.contains("dark")).toBe(false);
      expect(document.documentElement.style.colorScheme).toBe("light");
    });
  });
});
