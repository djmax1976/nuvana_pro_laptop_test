/**
 * User Deactivation Security Tests
 *
 * CRITICAL SECURITY TESTS: Verify that deactivated users, companies, and stores
 * are properly blocked from accessing the system.
 *
 * These tests verify the fix for the critical security bug where deactivated
 * users could continue operating with their existing JWT tokens.
 *
 * Test scenarios:
 * 1. Deactivated user cannot access API with existing JWT
 * 2. Deactivated user cannot login
 * 3. Proper error messages are returned for deactivated accounts
 * 4. Reactivated user can access API again
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import { createUser } from "../support/factories";
import bcrypt from "bcrypt";
import { withBypassClient } from "../support/prisma-bypass";

test.describe("User Deactivation Security", () => {
  test.describe("CRITICAL: Deactivated users must be blocked immediately", () => {
    test("deactivated user cannot access API endpoints even with valid JWT", async ({
      apiRequest,
      prismaClient,
      backendUrl,
      request,
    }) => {
      // 1. Create an active user with password
      const password = "TestPassword123!";
      const passwordHash = await bcrypt.hash(password, 10);
      const userData = createUser({
        password_hash: passwordHash,
        status: "ACTIVE",
      });
      const user = await prismaClient.user.create({ data: userData });

      // 2. Get SUPERADMIN role (system-level, no company needed)
      const role = await prismaClient.role.findUnique({
        where: { code: "SUPERADMIN" },
      });
      expect(role).not.toBeNull();

      // 3. Assign SUPERADMIN role
      await withBypassClient(async (bypassClient) => {
        await bypassClient.userRole.create({
          data: {
            user_id: user.user_id,
            role_id: role!.role_id,
          },
        });
      });

      // 4. Login to get a valid JWT token
      const loginResponse = await apiRequest.post("/api/auth/login", {
        email: user.email,
        password: password,
      });

      expect(loginResponse.status()).toBe(200);
      const loginBody = await loginResponse.json();
      expect(loginBody.success).toBe(true);

      // Extract cookies for authenticated requests
      // The set-cookie header contains full cookie strings with attributes (e.g., "name=value; Path=/; HttpOnly")
      // We need to extract just the name=value part for the Cookie request header
      const cookies = loginResponse.headers()["set-cookie"];
      const parseCookieValue = (cookieStr: string): string => {
        // Extract just the "name=value" part before any semicolon
        return cookieStr.split(";")[0].trim();
      };
      const cookieString = Array.isArray(cookies)
        ? cookies.map(parseCookieValue).join("; ")
        : parseCookieValue(cookies || "");

      // 5. Verify user CAN access API before deactivation
      const meResponseBefore = await request.get(`${backendUrl}/api/auth/me`, {
        headers: { Cookie: cookieString },
      });
      expect(meResponseBefore.status()).toBe(200);

      // 6. DEACTIVATE the user directly in database (simulating admin action)
      await prismaClient.user.update({
        where: { user_id: user.user_id },
        data: { status: "INACTIVE" },
      });

      // Clear any status cache to ensure immediate effect
      // (In production, the admin endpoint does this automatically)
      const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
      try {
        const { createClient } = await import("redis");
        const redis = createClient({ url: redisUrl });
        await redis.connect();
        await redis.del(`user_status:${user.user_id}`);
        await redis.disconnect();
      } catch {
        // Redis not available, cache will expire naturally
      }

      // 7. CRITICAL: User should NOT be able to access API after deactivation
      const meResponseAfter = await request.get(`${backendUrl}/api/auth/me`, {
        headers: { Cookie: cookieString },
      });

      // Should be blocked with 403 Forbidden
      expect(meResponseAfter.status()).toBe(403);
      const errorBody = await meResponseAfter.json();
      expect(errorBody.success).toBe(false);
      expect(errorBody.error.code).toBe("ACCOUNT_DEACTIVATED");
      expect(errorBody.error.message).toContain("deactivated");
      expect(errorBody.error.message).toContain("contact support");

      // Cleanup
      await withBypassClient(async (bypassClient) => {
        await bypassClient.userRole.deleteMany({
          where: { user_id: user.user_id },
        });
        await bypassClient.user.delete({ where: { user_id: user.user_id } });
      });
    });

    test("deactivated user cannot login - returns inactive message", async ({
      apiRequest,
      prismaClient,
    }) => {
      // 1. Create an INACTIVE user with password and a role
      const password = "TestPassword123!";
      const passwordHash = await bcrypt.hash(password, 10);
      const userData = createUser({
        password_hash: passwordHash,
        status: "INACTIVE",
      });
      const user = await prismaClient.user.create({ data: userData });

      // 2. Assign a role (needed for login to proceed past auth checks)
      const role = await prismaClient.role.findUnique({
        where: { code: "SUPERADMIN" },
      });
      expect(role).not.toBeNull();

      await withBypassClient(async (bypassClient) => {
        await bypassClient.userRole.create({
          data: {
            user_id: user.user_id,
            role_id: role!.role_id,
          },
        });
      });

      // 3. Attempt login with inactive user
      const loginResponse = await apiRequest.post("/api/auth/login", {
        email: user.email,
        password: password,
      });

      // Should be blocked at login with 401
      expect(loginResponse.status()).toBe(401);
      const errorBody = await loginResponse.json();
      expect(errorBody.success).toBe(false);
      // The login endpoint returns "Account is inactive" for inactive users
      expect(errorBody.error.message).toContain("inactive");

      // Cleanup
      await withBypassClient(async (bypassClient) => {
        await bypassClient.userRole.deleteMany({
          where: { user_id: user.user_id },
        });
        await bypassClient.user.delete({ where: { user_id: user.user_id } });
      });
    });

    test("error message contains proper guidance for deactivated users", async ({
      apiRequest,
      prismaClient,
      backendUrl,
      request,
    }) => {
      // 1. Create an active user
      const password = "TestPassword123!";
      const passwordHash = await bcrypt.hash(password, 10);
      const userData = createUser({
        password_hash: passwordHash,
        status: "ACTIVE",
      });
      const user = await prismaClient.user.create({ data: userData });

      // 2. Assign SUPERADMIN role
      const role = await prismaClient.role.findUnique({
        where: { code: "SUPERADMIN" },
      });
      expect(role).not.toBeNull();

      await withBypassClient(async (bypassClient) => {
        await bypassClient.userRole.create({
          data: {
            user_id: user.user_id,
            role_id: role!.role_id,
          },
        });
      });

      // 3. Login
      const loginResponse = await apiRequest.post("/api/auth/login", {
        email: user.email,
        password: password,
      });
      expect(loginResponse.status()).toBe(200);

      // Extract cookies for authenticated requests
      // The set-cookie header contains full cookie strings with attributes (e.g., "name=value; Path=/; HttpOnly")
      // We need to extract just the name=value part for the Cookie request header
      const cookies = loginResponse.headers()["set-cookie"];
      const parseCookieValue = (cookieStr: string): string => {
        return cookieStr.split(";")[0].trim();
      };
      const cookieString = Array.isArray(cookies)
        ? cookies.map(parseCookieValue).join("; ")
        : parseCookieValue(cookies || "");

      // 4. Deactivate
      await prismaClient.user.update({
        where: { user_id: user.user_id },
        data: { status: "INACTIVE" },
      });

      // Clear cache
      try {
        const { createClient } = await import("redis");
        const redis = createClient({
          url: process.env.REDIS_URL || "redis://localhost:6379",
        });
        await redis.connect();
        await redis.del(`user_status:${user.user_id}`);
        await redis.disconnect();
      } catch {
        // Redis not available
      }

      // 5. Verify error message
      const meResponse = await request.get(`${backendUrl}/api/auth/me`, {
        headers: { Cookie: cookieString },
      });

      expect(meResponse.status()).toBe(403);
      const errorBody = await meResponse.json();

      // Verify error structure and message content
      expect(errorBody).toHaveProperty("success", false);
      expect(errorBody).toHaveProperty("error");
      expect(errorBody.error).toHaveProperty("code", "ACCOUNT_DEACTIVATED");
      expect(errorBody.error).toHaveProperty("message");
      expect(errorBody.error.message.toLowerCase()).toContain("deactivated");
      expect(errorBody.error.message.toLowerCase()).toContain(
        "contact support",
      );

      // Cleanup
      await withBypassClient(async (bypassClient) => {
        await bypassClient.userRole.deleteMany({
          where: { user_id: user.user_id },
        });
        await bypassClient.user.delete({ where: { user_id: user.user_id } });
      });
    });
  });

  test.describe("Reactivation allows access", () => {
    test("reactivated user can access API again", async ({
      apiRequest,
      prismaClient,
      backendUrl,
      request,
    }) => {
      // 1. Create user
      const password = "TestPassword123!";
      const passwordHash = await bcrypt.hash(password, 10);
      const userData = createUser({
        password_hash: passwordHash,
        status: "ACTIVE",
      });
      const user = await prismaClient.user.create({ data: userData });

      // 2. Assign role
      const role = await prismaClient.role.findUnique({
        where: { code: "SUPERADMIN" },
      });
      await withBypassClient(async (bypassClient) => {
        await bypassClient.userRole.create({
          data: { user_id: user.user_id, role_id: role!.role_id },
        });
      });

      // 3. Login
      const loginResponse = await apiRequest.post("/api/auth/login", {
        email: user.email,
        password: password,
      });
      expect(loginResponse.status()).toBe(200);

      // Extract cookies for authenticated requests
      // The set-cookie header contains full cookie strings with attributes (e.g., "name=value; Path=/; HttpOnly")
      // We need to extract just the name=value part for the Cookie request header
      const cookies = loginResponse.headers()["set-cookie"];
      const parseCookieValue = (cookieStr: string): string => {
        return cookieStr.split(";")[0].trim();
      };
      const cookieString = Array.isArray(cookies)
        ? cookies.map(parseCookieValue).join("; ")
        : parseCookieValue(cookies || "");

      // 4. Deactivate
      await prismaClient.user.update({
        where: { user_id: user.user_id },
        data: { status: "INACTIVE" },
      });

      // Clear cache
      try {
        const { createClient } = await import("redis");
        const redis = createClient({
          url: process.env.REDIS_URL || "redis://localhost:6379",
        });
        await redis.connect();
        await redis.del(`user_status:${user.user_id}`);
        await redis.disconnect();
      } catch {
        // Redis not available
      }

      // 5. Verify blocked
      const blockedResponse = await request.get(`${backendUrl}/api/auth/me`, {
        headers: { Cookie: cookieString },
      });
      expect(blockedResponse.status()).toBe(403);

      // 6. REACTIVATE
      await prismaClient.user.update({
        where: { user_id: user.user_id },
        data: { status: "ACTIVE" },
      });

      // Clear cache again
      try {
        const { createClient } = await import("redis");
        const redis = createClient({
          url: process.env.REDIS_URL || "redis://localhost:6379",
        });
        await redis.connect();
        await redis.del(`user_status:${user.user_id}`);
        await redis.disconnect();
      } catch {
        // Redis not available
      }

      // 7. Verify can access again
      const reactivatedResponse = await request.get(
        `${backendUrl}/api/auth/me`,
        {
          headers: { Cookie: cookieString },
        },
      );
      expect(reactivatedResponse.status()).toBe(200);

      // Cleanup
      await withBypassClient(async (bypassClient) => {
        await bypassClient.userRole.deleteMany({
          where: { user_id: user.user_id },
        });
        await bypassClient.user.delete({ where: { user_id: user.user_id } });
      });
    });
  });
});
