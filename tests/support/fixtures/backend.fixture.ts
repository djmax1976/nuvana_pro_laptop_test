import { config } from "dotenv";
import { test as base, APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

// Load environment variables from .env.local for Playwright tests
config({ path: ".env.local" });

// =============================================================================
// DATABASE PROTECTION - Block prod/staging databases in test code
// =============================================================================
const dbUrl = process.env.DATABASE_URL || "";
// Only block production/staging - allow nuvana_dev and nuvana_test for local development
if (/nuvana_prod|nuvana_production|nuvana_staging|_prod$/i.test(dbUrl)) {
  throw new Error(
    `🚨 BLOCKED: Cannot use backend.fixture with production database: ${dbUrl}`,
  );
}

/**
 * Backend Test Fixtures
 *
 * Provides fixtures for backend API testing including:
 * - Base URL configuration
 * - API request helpers with auto-cleanup
 * - PrismaClient with automatic connection/disconnection
 * - Test data setup/cleanup
 *
 * Follows fixture architecture pattern: pure functions wrapped in fixtures
 */

type BackendFixture = {
  backendUrl: string;
  apiRequest: {
    get: (
      path: string,
      options?: { headers?: Record<string, string> },
    ) => Promise<import("@playwright/test").APIResponse>;
    post: (
      path: string,
      data?: unknown,
      options?: { headers?: Record<string, string> },
    ) => Promise<import("@playwright/test").APIResponse>;
    put: (
      path: string,
      data?: unknown,
      options?: { headers?: Record<string, string> },
    ) => Promise<import("@playwright/test").APIResponse>;
    patch: (
      path: string,
      data?: unknown,
      options?: { headers?: Record<string, string> },
    ) => Promise<import("@playwright/test").APIResponse>;
    delete: (
      path: string,
      options?: { headers?: Record<string, string> },
    ) => Promise<import("@playwright/test").APIResponse>;
    options: (
      path: string,
      options?: { headers?: Record<string, string> },
    ) => Promise<import("@playwright/test").APIResponse>;
  };
  prismaClient: PrismaClient;
};

export const test = base.extend<BackendFixture>({
  backendUrl: async ({}, use) => {
    const url = process.env.BACKEND_URL || "http://localhost:3001";
    await use(url);
  },

  apiRequest: async ({ request, backendUrl }, use) => {
    // Setup: Create API request helper with base URL
    const apiRequest = {
      get: async (
        path: string,
        options?: { headers?: Record<string, string> },
      ) => {
        return request.get(`${backendUrl}${path}`, {
          headers: options?.headers,
        });
      },
      post: async (
        path: string,
        data?: unknown,
        options?: { headers?: Record<string, string> },
      ) => {
        return request.post(`${backendUrl}${path}`, {
          data,
          headers: {
            "Content-Type": "application/json",
            ...options?.headers,
          },
        });
      },
      put: async (
        path: string,
        data?: unknown,
        options?: { headers?: Record<string, string> },
      ) => {
        return request.put(`${backendUrl}${path}`, {
          data,
          headers: {
            "Content-Type": "application/json",
            ...options?.headers,
          },
        });
      },
      patch: async (
        path: string,
        data?: unknown,
        options?: { headers?: Record<string, string> },
      ) => {
        return request.fetch(`${backendUrl}${path}`, {
          method: "PATCH",
          data,
          headers: {
            "Content-Type": "application/json",
            ...options?.headers,
          },
        });
      },
      delete: async (
        path: string,
        options?: { headers?: Record<string, string> },
      ) => {
        return request.delete(`${backendUrl}${path}`, {
          headers: options?.headers,
        });
      },
      options: async (
        path: string,
        options?: { headers?: Record<string, string> },
      ) => {
        return request.fetch(`${backendUrl}${path}`, {
          method: "OPTIONS",
          headers: options?.headers,
        });
      },
    };

    // Provide to test
    await use(apiRequest);

    // Cleanup: No cleanup needed for API requests (stateless)
    // Future: Could add request logging or cleanup of test data here
  },

  prismaClient: async ({}, use: (prisma: PrismaClient) => Promise<void>) => {
    // Setup: Create and connect PrismaClient
    const prisma = new PrismaClient();
    await prisma.$connect();

    // Provide to test
    await use(prisma);

    // Cleanup: Always disconnect, even if test fails
    await prisma.$disconnect();
  },
});

export { expect } from "@playwright/test";
