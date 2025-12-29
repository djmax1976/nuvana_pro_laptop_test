"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { CurrentDateTime } from "@/components/layout/CurrentDateTime";
import { useAuth } from "@/contexts/AuthContext";
import { useClientDashboard } from "@/lib/api/client-dashboard";

/**
 * Header Component
 *
 * Displays the main header for the dashboard with:
 * - Store name (right-aligned, above controls)
 * - Current date/time display
 * - Dark mode toggle
 * - Logout button
 *
 * @requirements
 * - Shows store name for authenticated users
 * - Provides quick access to logout functionality
 * - Displays current date and time
 */
export function Header() {
  const router = useRouter();
  const { user, isLoading, logout } = useAuth();
  const { data: dashboardData, isLoading: dashboardLoading } =
    useClientDashboard();

  // Get the first active store or first store
  const store =
    dashboardData?.stores.find((s) => s.status === "ACTIVE") ||
    dashboardData?.stores[0];

  const storeName = store?.name;

  const handleLogout = async () => {
    await logout();
  };

  if (isLoading) {
    return (
      <header className="flex h-16 items-center justify-between border-b bg-background px-6">
        <div className="flex items-center gap-4">
          <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        </div>
      </header>
    );
  }

  return (
    <header
      className="flex h-16 items-center justify-end border-b bg-background px-4 sm:px-6"
      data-testid="header"
    >
      {user ? (
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
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/login")}
          data-testid="login-button"
        >
          Login
        </Button>
      )}
    </header>
  );
}
