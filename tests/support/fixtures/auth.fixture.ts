import { test as base, APIRequestContext } from "@playwright/test";
import { createSupabaseToken, createUser } from "../factories";
import { PrismaClient } from "@prisma/client";

/**
 * Auth Test Fixtures
 *
 * Provides fixtures for authenticated API testing:
 * - Authenticated API request helper
 * - User with valid Supabase token
 * - Auto-cleanup of test users
 *
 * Follows fixture architecture pattern: pure functions wrapped in fixtures
 */

type AuthFixture = {
  backendUrl: string;
  authenticatedApiRequest: {
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
  };
  authenticatedUser: {
    email: string;
    name: string;
    auth_provider_id: string;
    token: string;
  };
  prismaClient: PrismaClient;
};

export const test = base.extend<AuthFixture>({
  backendUrl: async ({}, use) => {
    const url = process.env.BACKEND_URL || "http://localhost:3001";
    await use(url);
  },

  authenticatedUser: async ({}, use) => {
    // Setup: Create test user and generate token
    const userData = createUser({
      email: "test@example.com",
      name: "Test User",
      auth_provider_id: "test_supabase_user_id",
    });

    const token = createSupabaseToken({
      email: userData.email,
      name: userData.name,
      sub: userData.auth_provider_id!,
    });

    const authenticatedUser = {
      email: userData.email,
      name: userData.name,
      auth_provider_id: userData.auth_provider_id!,
      token,
    };

    // Provide to test
    await use(authenticatedUser);

    // Cleanup: Token cleanup handled by Supabase (stateless)
    // User cleanup handled by prismaClient fixture
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

  authenticatedApiRequest: async (
    { request, authenticatedUser, backendUrl },
    use,
  ) => {
    // Setup: Create API request helper with authentication header
    const authenticatedApiRequest = {
      get: async (
        path: string,
        options?: { headers?: Record<string, string> },
      ) => {
        return request.get(`${backendUrl}${path}`, {
          headers: {
            Authorization: `Bearer ${authenticatedUser.token}`,
            ...options?.headers,
          },
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
            Authorization: `Bearer ${authenticatedUser.token}`,
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
            Authorization: `Bearer ${authenticatedUser.token}`,
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
            Authorization: `Bearer ${authenticatedUser.token}`,
            ...options?.headers,
          },
        });
      },
      delete: async (
        path: string,
        options?: { headers?: Record<string, string> },
      ) => {
        return request.delete(`${backendUrl}${path}`, {
          headers: {
            Authorization: `Bearer ${authenticatedUser.token}`,
            ...options?.headers,
          },
        });
      },
    };

    // Provide to test
    await use(authenticatedApiRequest);

    // Cleanup: No cleanup needed for API requests (stateless)
  },
});

export { expect } from "@playwright/test";
