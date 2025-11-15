import { config } from "dotenv";
import { test as base, APIRequestContext } from "@playwright/test";
import { createUser, createCompany, createStore } from "../factories";
import {
  createSuperadminRole,
  createCorporateAdminRole,
  createStoreManagerRole,
} from "../factories";
// Import Prisma client from backend (where schema is defined)
import { PrismaClient } from "../../../backend/node_modules/@prisma/client";
import { createJWTAccessToken } from "../factories";

// Load environment variables from .env.local for Playwright tests
config({ path: ".env.local" });

/**
 * RBAC Test Fixtures
 *
 * Provides fixtures for RBAC testing:
 * - Authenticated users with specific roles and permissions
 * - API requests with role-based access tokens
 * - Auto-cleanup of test data
 *
 * Follows fixture architecture pattern: pure functions wrapped in fixtures
 */

type RBACFixture = {
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
    delete: (
      path: string,
      options?: { headers?: Record<string, string> },
    ) => Promise<import("@playwright/test").APIResponse>;
  };
  superadminApiRequest: {
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
    delete: (
      path: string,
      options?: { headers?: Record<string, string> },
    ) => Promise<import("@playwright/test").APIResponse>;
  };
  corporateAdminApiRequest: {
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
    delete: (
      path: string,
      options?: { headers?: Record<string, string> },
    ) => Promise<import("@playwright/test").APIResponse>;
  };
  storeManagerApiRequest: {
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
    delete: (
      path: string,
      options?: { headers?: Record<string, string> },
    ) => Promise<import("@playwright/test").APIResponse>;
  };
  superadminUser: {
    user_id: string;
    email: string;
    name: string;
    roles: string[];
    permissions: string[];
    token: string;
  };
  corporateAdminUser: {
    user_id: string;
    email: string;
    name: string;
    company_id: string;
    roles: string[];
    permissions: string[];
    token: string;
  };
  storeManagerUser: {
    user_id: string;
    email: string;
    name: string;
    company_id: string;
    store_id: string;
    roles: string[];
    permissions: string[];
    token: string;
  };
  prismaClient: PrismaClient;
};

export const test = base.extend<RBACFixture>({
  backendUrl: async ({}, use) => {
    const url = process.env.BACKEND_URL || "http://localhost:3001";
    await use(url);
  },

  apiRequest: async ({ request, backendUrl }, use) => {
    // Setup: Create unauthenticated API request helper
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
      delete: async (
        path: string,
        options?: { headers?: Record<string, string> },
      ) => {
        return request.delete(`${backendUrl}${path}`, {
          headers: options?.headers,
        });
      },
    };

    await use(apiRequest);
  },

  prismaClient: async ({}, use: (prisma: PrismaClient) => Promise<void>) => {
    const prisma = new PrismaClient();
    await prisma.$connect();
    await use(prisma);
    await prisma.$disconnect();
  },

  superadminUser: async ({ prismaClient }, use) => {
    // Setup: Create superadmin user with SUPERADMIN role
    const userData = createUser();
    const user = await prismaClient.user.create({ data: userData });

    // Get SUPERADMIN role (must exist in database)
    const role = await prismaClient.role.findUnique({
      where: { code: "SUPERADMIN" },
    });
    if (!role) {
      throw new Error(
        "SUPERADMIN role not found in database. Run database seed first.",
      );
    }

    // Assign SUPERADMIN role to user
    await prismaClient.userRole.create({
      data: {
        user_id: user.user_id,
        role_id: role.role_id,
      },
    });

    const token = createJWTAccessToken({
      user_id: user.user_id,
      email: user.email,
      roles: ["SUPERADMIN"],
      permissions: ["*"], // Superadmin has all permissions
    });

    const superadminUser = {
      user_id: user.user_id,
      email: user.email,
      name: user.name,
      roles: ["SUPERADMIN"],
      permissions: ["*"],
      token,
    };

    await use(superadminUser);

    // Cleanup: Delete user and roles
    await prismaClient.userRole.deleteMany({
      where: { user_id: user.user_id },
    });
    await prismaClient.user.delete({ where: { user_id: user.user_id } });
  },

  corporateAdminUser: async ({ prismaClient }, use) => {
    // Setup: Create corporate admin user with COMPANY scope role
    const userData = createUser();
    const companyData = createCompany();

    // Create company
    const company = await prismaClient.company.create({ data: companyData });

    // Create user
    const user = await prismaClient.user.create({ data: userData });

    // Get CORPORATE_ADMIN role (must exist in database)
    const role = await prismaClient.role.findUnique({
      where: { code: "CORPORATE_ADMIN" },
    });
    if (!role) {
      throw new Error(
        "CORPORATE_ADMIN role not found in database. Run database seed first.",
      );
    }

    // Assign CORPORATE_ADMIN role to user
    await prismaClient.userRole.create({
      data: {
        user_id: user.user_id,
        role_id: role.role_id,
      },
    });

    const token = createJWTAccessToken({
      user_id: user.user_id,
      email: user.email,
      roles: ["CORPORATE_ADMIN"],
      permissions: ["USER_READ", "STORE_CREATE", "STORE_READ"],
    });

    const corporateAdminUser = {
      user_id: user.user_id,
      email: user.email,
      name: user.name,
      company_id: company.company_id,
      roles: ["CORPORATE_ADMIN"],
      permissions: ["USER_READ", "STORE_CREATE", "STORE_READ"],
      token,
    };

    await use(corporateAdminUser);

    // Cleanup
    await prismaClient.userRole.deleteMany({
      where: { user_id: user.user_id },
    });
    await prismaClient.user.delete({ where: { user_id: user.user_id } });
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });
  },

  storeManagerUser: async ({ prismaClient }, use) => {
    // Setup: Create store manager user with STORE scope role
    const userData = createUser();
    const companyData = createCompany();

    // Create company
    const company = await prismaClient.company.create({ data: companyData });

    // Create store
    const storeData = createStore({ company_id: company.company_id });
    const store = await prismaClient.store.create({
      data: {
        ...storeData,
        location_json: storeData.location_json as any,
      },
    });

    // Create user
    const user = await prismaClient.user.create({ data: userData });

    // Get STORE_MANAGER role (must exist in database)
    const role = await prismaClient.role.findUnique({
      where: { code: "STORE_MANAGER" },
    });
    if (!role) {
      throw new Error(
        "STORE_MANAGER role not found in database. Run database seed first.",
      );
    }

    // Assign STORE_MANAGER role to user
    await prismaClient.userRole.create({
      data: {
        user_id: user.user_id,
        role_id: role.role_id,
      },
    });

    const token = createJWTAccessToken({
      user_id: user.user_id,
      email: user.email,
      roles: ["STORE_MANAGER"],
      permissions: ["SHIFT_OPEN", "SHIFT_CLOSE", "INVENTORY_READ"],
    });

    const storeManagerUser = {
      user_id: user.user_id,
      email: user.email,
      name: user.name,
      company_id: company.company_id,
      store_id: store.store_id,
      roles: ["STORE_MANAGER"],
      permissions: ["SHIFT_OPEN", "SHIFT_CLOSE", "INVENTORY_READ"],
      token,
    };

    await use(storeManagerUser);

    // Cleanup
    await prismaClient.userRole.deleteMany({
      where: { user_id: user.user_id },
    });
    await prismaClient.user.delete({ where: { user_id: user.user_id } });
    await prismaClient.store.delete({ where: { store_id: store.store_id } });
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });
  },

  superadminApiRequest: async (
    { request, superadminUser, backendUrl },
    use,
  ) => {
    const superadminApiRequest = {
      get: async (
        path: string,
        options?: { headers?: Record<string, string> },
      ) => {
        return request.get(`${backendUrl}${path}`, {
          headers: {
            Cookie: `access_token=${superadminUser.token}`,
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
            Cookie: `access_token=${superadminUser.token}`,
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
            Cookie: `access_token=${superadminUser.token}`,
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
            Cookie: `access_token=${superadminUser.token}`,
            ...options?.headers,
          },
        });
      },
    };

    await use(superadminApiRequest);
  },

  corporateAdminApiRequest: async (
    { request, corporateAdminUser, backendUrl },
    use,
  ) => {
    const corporateAdminApiRequest = {
      get: async (
        path: string,
        options?: { headers?: Record<string, string> },
      ) => {
        return request.get(`${backendUrl}${path}`, {
          headers: {
            Cookie: `access_token=${corporateAdminUser.token}`,
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
            Cookie: `access_token=${corporateAdminUser.token}`,
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
            Cookie: `access_token=${corporateAdminUser.token}`,
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
            Cookie: `access_token=${corporateAdminUser.token}`,
            ...options?.headers,
          },
        });
      },
    };

    await use(corporateAdminApiRequest);
  },

  storeManagerApiRequest: async (
    { request, storeManagerUser, backendUrl },
    use,
  ) => {
    const storeManagerApiRequest = {
      get: async (
        path: string,
        options?: { headers?: Record<string, string> },
      ) => {
        return request.get(`${backendUrl}${path}`, {
          headers: {
            Cookie: `access_token=${storeManagerUser.token}`,
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
            Cookie: `access_token=${storeManagerUser.token}`,
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
            Cookie: `access_token=${storeManagerUser.token}`,
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
            Cookie: `access_token=${storeManagerUser.token}`,
            ...options?.headers,
          },
        });
      },
    };

    await use(storeManagerApiRequest);
  },
});

export { expect } from "@playwright/test";
