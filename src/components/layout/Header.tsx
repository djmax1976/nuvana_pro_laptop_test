"use client";

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
import { useAuth } from "@/contexts/AuthContext";

export function Header() {
  const router = useRouter();
  const { user, isLoading, logout } = useAuth();

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
      className="flex h-16 items-center justify-between border-b bg-background px-6"
      data-testid="header"
    >
      <div className="flex items-center gap-4">
        {/* Placeholder for breadcrumbs or page title */}
      </div>
      <div className="flex items-center gap-4">
        {user ? (
          <>
            <ThemeToggle />
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
                      data-testid="dropdown-user-name"
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
          </>
        ) : (
          <Button
            variant="outline"
            onClick={() => router.push("/login")}
            data-testid="login-button"
          >
            Login
          </Button>
        )}
      </div>
    </header>
  );
}
