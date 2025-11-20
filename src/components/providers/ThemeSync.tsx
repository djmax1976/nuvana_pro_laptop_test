"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { useAuth } from "@/contexts/AuthContext";

/**
 * ThemeSync component
 * Synchronizes theme changes with user-specific localStorage
 * Only saves theme preferences for authenticated users
 * Also restores user's theme preference when they log in
 */
export function ThemeSync() {
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const previousUserIdRef = useRef<string | null>(null);

  // Sync theme changes to user-specific localStorage
  useEffect(() => {
    // Only save theme preference if user is authenticated
    if (user && theme && theme !== "system") {
      const userThemeKey = `nuvana-theme-${user.id}`;
      localStorage.setItem(userThemeKey, theme);
    }
  }, [theme, user]);

  // Restore user's theme preference when they log in
  useEffect(() => {
    const currentUserId = user?.id || null;
    const previousUserId = previousUserIdRef.current;

    // User logged in (transition from null/other user to current user)
    if (user && currentUserId !== previousUserId) {
      const userThemeKey = `nuvana-theme-${user.id}`;
      const savedTheme = localStorage.getItem(userThemeKey);

      if (savedTheme && (savedTheme === "dark" || savedTheme === "light")) {
        // Ensure the theme is set in the key that next-themes reads
        // This is already done in AuthContext, but we do it here too for safety
        localStorage.setItem("nuvana-theme", savedTheme);

        // Force next-themes to update by calling setTheme
        // Call immediately - setTheme should work even if next-themes is still initializing
        setTheme(savedTheme);

        // Also manually apply to DOM as a fallback
        const html = document.documentElement;
        if (savedTheme === "dark") {
          html.classList.add("dark");
          html.style.colorScheme = "dark";
        } else {
          html.classList.remove("dark");
          html.style.colorScheme = "light";
        }
      }
    }
    // User logged out (transition from user to null)
    else if (!user && previousUserId !== null) {
      // Reset to light theme on logout
      localStorage.setItem("nuvana-theme", "light");
      setTheme("light");
      const html = document.documentElement;
      html.classList.remove("dark");
      html.style.colorScheme = "light";
    }

    // Update ref for next comparison
    previousUserIdRef.current = currentUserId;
  }, [user, setTheme]);

  return null;
}
