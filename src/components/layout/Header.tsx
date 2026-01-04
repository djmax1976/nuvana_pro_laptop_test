"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { CurrentDateTime } from "@/components/layout/CurrentDateTime";
import { useAuth } from "@/contexts/AuthContext";
import { useClientDashboard } from "@/lib/api/client-dashboard";
import { usePageTitleSafe } from "@/contexts/PageTitleContext";

/**
 * Header component props
 */
export interface HeaderProps {
  /**
   * Variant controls the header layout:
   * - "full": Full header with page title centered (default, for desktop)
   * - "controls-only": Only renders the right-side controls (for mobile embedded use)
   */
  variant?: "full" | "controls-only";
}

/**
 * Header Component
 *
 * Displays the main header for the dashboard with:
 * - Centered page title (from PageTitleContext) - only in "full" variant
 * - Store name (right-aligned, above controls)
 * - Current date/time display
 * - Dark mode toggle
 * - Logout button
 *
 * Security Considerations (FE-005: UI_SECURITY):
 * - No sensitive data exposed in DOM
 * - Store name is display-only, non-sensitive information
 *
 * Security Considerations (SEC-004: XSS):
 * - All text content uses React's automatic escaping
 * - No dangerouslySetInnerHTML usage
 *
 * @requirements
 * - Shows page title centered in header (from context) when variant="full"
 * - Shows store name for authenticated users
 * - Provides quick access to logout functionality
 * - Displays current date and time
 */
export function Header({ variant = "full" }: HeaderProps) {
  const router = useRouter();
  const { user, isLoading, logout } = useAuth();
  const { data: dashboardData, isLoading: dashboardLoading } =
    useClientDashboard();
  const { title: pageTitle } = usePageTitleSafe();

  // Get the first active store or first store
  const store =
    dashboardData?.stores.find((s) => s.status === "ACTIVE") ||
    dashboardData?.stores[0];

  const storeName = store?.name;

  // Memoized logout handler (FE-020: REACT_OPTIMIZATION)
  const handleLogout = useCallback(async () => {
    await logout();
  }, [logout]);

  // Memoized login navigation handler
  const handleLoginClick = useCallback(() => {
    router.push("/login");
  }, [router]);

  // Controls-only variant: render just the right-side controls for mobile embedding
  if (variant === "controls-only") {
    if (isLoading) {
      return <div className="h-8 w-20 animate-pulse rounded bg-muted" />;
    }

    if (!user) {
      return (
        <Button
          variant="outline"
          size="sm"
          onClick={handleLoginClick}
          data-testid="login-button"
        >
          Login
        </Button>
      );
    }

    return (
      <div className="flex flex-col items-end justify-center">
        {/* Store name - top row */}
        {dashboardLoading ? (
          <div
            className="h-3 w-16 animate-pulse rounded bg-muted mb-1"
            aria-label="Loading store display name"
            data-testid="header-store-name-loading"
          />
        ) : (
          storeName && (
            <span
              className="text-xs font-semibold text-foreground"
              data-testid="header-store-name"
            >
              {storeName}
            </span>
          )
        )}
        {/* Controls row - dark mode, logout (no datetime on mobile) */}
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleLogout}
            data-testid="logout-button"
            aria-label="Logout"
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  // Full variant: render complete header with page title
  if (isLoading) {
    return (
      <header
        className="flex h-16 items-center justify-between border-b bg-background px-6"
        data-testid="header"
      >
        {/* Left spacer for layout balance */}
        <div className="flex-1" />
        {/* Center loading placeholder */}
        <div className="flex-1 flex justify-center">
          <div
            className="h-6 w-40 animate-pulse rounded bg-muted"
            aria-label="Loading page title"
          />
        </div>
        {/* Right loading placeholder */}
        <div className="flex-1 flex justify-end">
          <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        </div>
      </header>
    );
  }

  return (
    <header
      className="flex h-16 items-center justify-between border-b bg-background px-4 sm:px-6"
      data-testid="header"
    >
      {user ? (
        <>
          {/* Left spacer for layout balance */}
          <div className="flex-1" />

          {/* Center - Page Title */}
          <div className="flex-1 flex justify-center">
            {pageTitle && (
              <h1
                className="text-lg font-semibold text-foreground truncate max-w-xs sm:max-w-md"
                data-testid="header-page-title"
              >
                {pageTitle}
              </h1>
            )}
          </div>

          {/* Right - Store info and controls */}
          <div className="flex-1 flex justify-end">
            <div className="flex flex-col items-end justify-center">
              {/* Store name - top row */}
              {dashboardLoading ? (
                <div
                  className="h-4 w-24 animate-pulse rounded bg-muted mb-1"
                  aria-label="Loading store display name"
                  data-testid="header-store-name-loading"
                />
              ) : (
                storeName && (
                  <span
                    className="text-sm font-semibold text-foreground"
                    data-testid="header-store-name"
                  >
                    {storeName}
                  </span>
                )
              )}
              {/* Controls row - date/time, dark mode, logout */}
              <div className="flex items-center gap-2">
                <CurrentDateTime />
                <ThemeToggle />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleLogout}
                  data-testid="logout-button"
                  aria-label="Logout"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Left spacer */}
          <div className="flex-1" />
          {/* Center - no title when logged out */}
          <div className="flex-1" />
          {/* Right - Login button */}
          <div className="flex-1 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoginClick}
              data-testid="login-button"
            >
              Login
            </Button>
          </div>
        </>
      )}
    </header>
  );
}
