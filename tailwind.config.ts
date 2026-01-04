import type { Config } from "tailwindcss";

/**
 * Design Token System
 *
 * This configuration defines semantic design tokens for consistent styling across the application.
 * Tokens are organized by component type and size variant.
 *
 * Usage:
 * - Tables: Use `size` prop on Table component ("default" | "compact" | "dense")
 * - Spacing: Use semantic spacing tokens (e.g., `p-table-cell-compact`)
 *
 * To modify global table density, update the corresponding token values below.
 */

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      /**
       * Semantic Spacing Tokens
       * Organized by component type for maintainability
       */
      spacing: {
        // Table cell padding - vertical (py)
        "table-cell-y-default": "1rem", // 16px - standard padding
        "table-cell-y-compact": "0.375rem", // 6px - compact rows
        "table-cell-y-dense": "0.25rem", // 4px - maximum density

        // Table cell padding - horizontal (px)
        "table-cell-x-default": "1rem", // 16px
        "table-cell-x-compact": "1rem", // 16px - maintain horizontal spacing
        "table-cell-x-dense": "0.75rem", // 12px

        // Table header heights
        "table-header-default": "3rem", // 48px
        "table-header-compact": "2.25rem", // 36px
        "table-header-dense": "1.75rem", // 28px

        // Nested/accordion table spacing
        "table-nested-padding": "0.375rem", // 6px - wrapper padding for nested tables
      },

      /**
       * Component Height Tokens
       * Used for consistent interactive element sizing within tables
       */
      height: {
        // Table header row heights
        "table-header-default": "3rem", // 48px
        "table-header-compact": "2.25rem", // 36px
        "table-header-dense": "1.75rem", // 28px

        // Button heights within tables
        "table-button-default": "2.25rem", // 36px
        "table-button-compact": "1.75rem", // 28px
        "table-button-dense": "1.5rem", // 24px

        // Icon button heights (expand/collapse)
        "table-icon-button-default": "1.5rem", // 24px
        "table-icon-button-compact": "1.25rem", // 20px
        "table-icon-button-dense": "1rem", // 16px
      },

      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "#0066FF",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "#00C853",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "#F44336",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        mono: ["Fira Code", "monospace"],
      },
      fontSize: {
        // Headings: Inter Bold 24px-48px
        "heading-1": ["48px", { lineHeight: "1.2", fontWeight: "700" }],
        "heading-2": ["36px", { lineHeight: "1.2", fontWeight: "700" }],
        "heading-3": ["24px", { lineHeight: "1.2", fontWeight: "700" }],
        // Body: Inter Regular 14px-16px
        "body-lg": ["16px", { lineHeight: "1.5", fontWeight: "400" }],
        body: ["14px", { lineHeight: "1.5", fontWeight: "400" }],
        // Mono: Fira Code 12px-14px
        "mono-sm": ["12px", { lineHeight: "1.5" }],
        mono: ["14px", { lineHeight: "1.5" }],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
