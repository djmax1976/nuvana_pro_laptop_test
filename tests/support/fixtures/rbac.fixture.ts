import { config } from "dotenv";
import { test as base, APIRequestContext } from "@playwright/test";
import { createUser, createCompany, createStore } from "../factories";
import {
  createSuperadminRole,
  createCorporateAdminRole,
  createStoreManagerRole,
} from "../factories";
import { PrismaClient } from "@prisma/client";
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
    // TODO: Create user in database and assign SUPERADMIN role when RBAC is implemented
    // const user = await prismaClient.user.create({ data: userData });
    // const role = await prismaClient.role.findUnique({ where: { code: 'SUPERADMIN' } });
    // await prismaClient.userRole.create({ data: { user_id: user.user_id, role_id: role.role_id } });

    const token = createJWTAccessToken({
      user_id: "superadmin-user-id", // TODO: Use actual user.user_id
      email: userData.email,
      roles: ["SUPERADMIN"],
      permissions: ["*"], // Superadmin has all permissions
    });

    const superadminUser = {
      user_id: "superadmin-user-id", // TODO: Use actual user.user_id
      email: userData.email,
      name: userData.name,
      roles: ["SUPERADMIN"],
      permissions: ["*"],
      token,
    };

    await use(superadminUser);

    // Cleanup: Delete user and roles when RBAC is implemented
    // await prismaClient.userRole.deleteMany({ where: { user_id: user.user_id } });
    // await prismaClient.user.delete({ where: { user_id: user.user_id } });
  },

  corporateAdminUser: async ({ prismaClient }, use) => {
    // Setup: Create corporate admin user with COMPANY scope role
    const userData = createUser();
    const companyData = createCompany();
    // TODO: Create user, company, and assign CORPORATE_ADMIN role when RBAC is implemented

    const token = createJWTAccessToken({
      user_id: "corporate-admin-user-id", // TODO: Use actual user.user_id
      email: userData.email,
      roles: ["CORPORATE_ADMIN"],
      permissions: ["USER_READ", "STORE_CREATE", "STORE_READ"], // Corporate admin permissions
    });

    const corporateAdminUser = {
      user_id: "corporate-admin-user-id", // TODO: Use actual user.user_id
      email: userData.email,
      name: userData.name,
      company_id: "company-123", // TODO: Use actual company.company_id
      roles: ["CORPORATE_ADMIN"],
      permissions: ["USER_READ", "STORE_CREATE", "STORE_READ"],
      token,
    };

    await use(corporateAdminUser);

    // Cleanup: Delete user, company, and roles when RBAC is implemented
  },

  storeManagerUser: async ({ prismaClient }, use) => {
    // Setup: Create store manager user with STORE scope role
    const userData = createUser();
    const companyData = createCompany();
    const storeData = createStore({ company_id: "company-123" }); // TODO: Use actual company_id
    // TODO: Create user, company, store, and assign STORE_MANAGER role when RBAC is implemented

    const token = createJWTAccessToken({
      user_id: "store-manager-user-id", // TODO: Use actual user.user_id
      email: userData.email,
      roles: ["STORE_MANAGER"],
      permissions: ["SHIFT_OPEN", "SHIFT_CLOSE", "INVENTORY_READ"], // Store manager permissions
    });

    const storeManagerUser = {
      user_id: "store-manager-user-id", // TODO: Use actual user.user_id
      email: userData.email,
      name: userData.name,
      company_id: "company-123", // TODO: Use actual company.company_id
      store_id: "store-789", // TODO: Use actual store.store_id
      roles: ["STORE_MANAGER"],
      permissions: ["SHIFT_OPEN", "SHIFT_CLOSE", "INVENTORY_READ"],
      token,
    };

    await use(storeManagerUser);

    // Cleanup: Delete user, company, store, and roles when RBAC is implemented
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
            Cookie: `accessToken=${superadminUser.token}`,
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
            Cookie: `accessToken=${superadminUser.token}`,
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
            Cookie: `accessToken=${superadminUser.token}`,
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
            Cookie: `accessToken=${superadminUser.token}`,
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
            Cookie: `accessToken=${corporateAdminUser.token}`,
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
            Cookie: `accessToken=${corporateAdminUser.token}`,
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
            Cookie: `accessToken=${corporateAdminUser.token}`,
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
            Cookie: `accessToken=${corporateAdminUser.token}`,
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
            Cookie: `accessToken=${storeManagerUser.token}`,
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
            Cookie: `accessToken=${storeManagerUser.token}`,
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
            Cookie: `accessToken=${storeManagerUser.token}`,
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
            Cookie: `accessToken=${storeManagerUser.token}`,
            ...options?.headers,
          },
        });
      },
    };

    await use(storeManagerApiRequest);
  },
});

export { expect } from "@playwright/test";
