import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/support/vitest-setup.ts"],
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    pool: "forks",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@/tests": path.resolve(__dirname, "tests"),
    },
  },
});
