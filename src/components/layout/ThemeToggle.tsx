"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

/**
 * ThemeToggle component
 * Displays a button to toggle between light and dark themes
 * Shows Sun icon for light theme, Moon icon for dark theme
 */
export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch by only rendering after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle theme"
        disabled
        className="h-10 w-10"
      >
        <Sun className="h-4 w-4" />
      </Button>
    );
  }

  const currentTheme = resolvedTheme || theme;

  const toggleTheme = () => {
    if (currentTheme === "light") {
      setTheme("dark");
    } else {
      setTheme("light");
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={`Switch to ${currentTheme === "light" ? "dark" : "light"} mode`}
      role="button"
      data-testid="theme-toggle"
      className="h-10 w-10"
    >
      {currentTheme === "light" ? (
        <Sun className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
    </Button>
  );
}
