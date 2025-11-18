"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ComponentProps } from "react";

type ThemeProviderProps = ComponentProps<typeof NextThemesProvider>;

/**
 * ThemeProvider component
 * Wraps the app with next-themes ThemeProvider for dark mode support
 * Configures theme storage, modes, and Tailwind dark mode class strategy
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="nuvana-theme"
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
