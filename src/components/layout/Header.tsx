"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { User, LogOut, Settings } from "lucide-react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

interface UserInfo {
  name?: string;
  email?: string;
}

export function Header() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Get user info from localStorage (set by auth callback)
    const authSession = localStorage.getItem("auth_session");
    if (authSession) {
      try {
        const userData = JSON.parse(authSession);
        setUser({
          name: userData.name || userData.user_metadata?.full_name || "User",
          email: userData.email || userData.user_metadata?.email || "",
        });
      } catch (error) {
        console.error("Failed to parse auth session:", error);
      }
    }
    setIsLoading(false);
  }, []);

  const handleLogout = async () => {
    try {
      // Clear localStorage
      localStorage.removeItem("auth_session");

      // Call backend logout endpoint to clear cookies
      const backendUrl =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      await fetch(`${backendUrl}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });

      // Redirect to login
      router.push("/login");
    } catch (error) {
      console.error("Logout error:", error);
      // Still redirect even if backend call fails
      router.push("/login");
    }
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
      className="flex h-16 items-center justify-between border-b bg-background px-6"
      data-testid="header"
    >
      <div className="flex items-center gap-4">
        {/* Placeholder for breadcrumbs or page title */}
      </div>
      <div className="flex items-center gap-4">
        <ThemeToggle />
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center gap-2"
                data-testid="user-menu-trigger"
              >
                <User className="h-4 w-4" />
                <span
                  className="hidden sm:inline-block"
                  data-testid="user-name"
                >
                  {user.name || user.email || "User"}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56"
              data-testid="user-menu-dropdown"
            >
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p
                    className="text-sm font-medium leading-none"
                    data-testid="user-name"
                  >
                    {user.name || "User"}
                  </p>
                  {user.email && (
                    <p
                      className="text-xs leading-none text-muted-foreground"
                      data-testid="user-email"
                    >
                      {user.email}
                    </p>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem data-testid="user-menu-profile">
                <Settings className="mr-2 h-4 w-4" />
                <span>Profile Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                data-testid="user-menu-logout"
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Logout</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            variant="outline"
            onClick={() => router.push("/login")}
            data-testid="logout-button"
          >
            Login
          </Button>
        )}
      </div>
    </header>
  );
}
