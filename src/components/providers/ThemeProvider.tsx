"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ComponentProps } from "react";

type ThemeProviderProps = ComponentProps<typeof NextThemesProvider>;

/**
 * ThemeProvider component
 * Wraps the app with next-themes ThemeProvider for dark mode support
 * Theme preference is persisted per-user in localStorage
 * - Unauthenticated: Uses light theme (default), no persistence
 * - Authenticated: Theme preference is saved to localStorage with user-specific key (nuvana-theme-{userId})
 * - On logout: Theme resets to light but user's preference is preserved for next login
 * - On login: User's previous theme preference is automatically restored
 * Theme sync is handled by ThemeSync component in layout.tsx
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      storageKey="nuvana-theme"
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
