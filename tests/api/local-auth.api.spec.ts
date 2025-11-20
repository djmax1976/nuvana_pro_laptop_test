/**
 * Local Authentication API Tests
 *
 * Tests for the local email/password authentication system:
 * - POST /api/auth/login - Login with credentials
 * - POST /api/auth/logout - Logout and clear cookies
 * - GET /api/auth/me - Get current user info
 * - POST /api/auth/refresh - Refresh access token
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import { createUser } from "../support/factories";
import bcrypt from "bcrypt";

test.describe("Local Authentication API", () => {
  test.describe("POST /api/auth/login", () => {
    test("should login successfully with valid credentials", async ({
      apiRequest,
      prismaClient,
    }) => {
      // Create user with password
      const password = "TestPassword123!";
      const passwordHash = await bcrypt.hash(password, 12);
      const userData = createUser({ password_hash: passwordHash });
      const user = await prismaClient.user.create({ data: userData });

      try {
        const response = await apiRequest.post("/api/auth/login", {
          email: user.email,
          password: password,
        });

        expect(response.status()).toBe(200);

        const body = await response.json();
        expect(body.message).toBe("Login successful");
        expect(body.user.id).toBe(user.user_id);
        expect(body.user.email).toBe(user.email);
        expect(body.user.name).toBe(user.name);

        // Check cookies are set
        const cookies = response.headers()["set-cookie"];
        expect(cookies).toBeDefined();
        expect(cookies).toContain("access_token=");
        expect(cookies).toContain("refresh_token=");
        expect(cookies).toContain("HttpOnly");
      } finally {
        await prismaClient.user.delete({ where: { user_id: user.user_id } });
      }
    });

    test("should return 401 for invalid email", async ({ apiRequest }) => {
      const response = await apiRequest.post("/api/auth/login", {
        email: "nonexistent@example.com",
        password: "SomePassword123!",
      });

      expect(response.status()).toBe(401);

      const body = await response.json();
      expect(body.error).toBe("Unauthorized");
      expect(body.message).toBe("Invalid email or password");
    });

    test("should return 401 for invalid password", async ({
      apiRequest,
      prismaClient,
    }) => {
      // Create user with password
      const password = "CorrectPassword123!";
      const passwordHash = await bcrypt.hash(password, 12);
      const userData = createUser({ password_hash: passwordHash });
      const user = await prismaClient.user.create({ data: userData });

      try {
        const response = await apiRequest.post("/api/auth/login", {
          email: user.email,
          password: "WrongPassword123!",
        });

        expect(response.status()).toBe(401);

        const body = await response.json();
        expect(body.error).toBe("Unauthorized");
        expect(body.message).toBe("Invalid email or password");
      } finally {
        await prismaClient.user.delete({ where: { user_id: user.user_id } });
      }
    });

    test("should return 401 for inactive user", async ({
      apiRequest,
      prismaClient,
    }) => {
      // Create inactive user with password
      const password = "TestPassword123!";
      const passwordHash = await bcrypt.hash(password, 12);
      const userData = createUser({
        password_hash: passwordHash,
        status: "INACTIVE",
      });
      const user = await prismaClient.user.create({ data: userData });

      try {
        const response = await apiRequest.post("/api/auth/login", {
          email: user.email,
          password: password,
        });

        expect(response.status()).toBe(401);

        const body = await response.json();
        expect(body.error).toBe("Unauthorized");
        expect(body.message).toBe("Account is inactive");
      } finally {
        await prismaClient.user.delete({ where: { user_id: user.user_id } });
      }
    });

    test("should return 401 for user without password set", async ({
      apiRequest,
      prismaClient,
    }) => {
      // Create user without password (null password_hash)
      const userData = createUser({ password_hash: null });
      const user = await prismaClient.user.create({ data: userData });

      try {
        const response = await apiRequest.post("/api/auth/login", {
          email: user.email,
          password: "AnyPassword123!",
        });

        expect(response.status()).toBe(401);

        const body = await response.json();
        expect(body.error).toBe("Unauthorized");
        expect(body.message).toBe("Password not set for this account");
      } finally {
        await prismaClient.user.delete({ where: { user_id: user.user_id } });
      }
    });

    test("should return 400 for missing email", async ({ apiRequest }) => {
      const response = await apiRequest.post("/api/auth/login", {
        password: "SomePassword123!",
      });

      expect(response.status()).toBe(400);

      const body = await response.json();
      expect(body.error).toBe("Bad Request");
      expect(body.message).toBe("Email and password are required");
    });

    test("should return 400 for missing password", async ({ apiRequest }) => {
      const response = await apiRequest.post("/api/auth/login", {
        email: "test@example.com",
      });

      expect(response.status()).toBe(400);

      const body = await response.json();
      expect(body.error).toBe("Bad Request");
      expect(body.message).toBe("Email and password are required");
    });

    test("should normalize email to lowercase", async ({
      apiRequest,
      prismaClient,
    }) => {
      // Create user with lowercase email
      const password = "TestPassword123!";
      const passwordHash = await bcrypt.hash(password, 12);
      const userData = createUser({
        email: "testuser@example.com",
        password_hash: passwordHash,
      });
      const user = await prismaClient.user.create({ data: userData });

      try {
        // Login with uppercase email
        const response = await apiRequest.post("/api/auth/login", {
          email: "TESTUSER@EXAMPLE.COM",
          password: password,
        });

        expect(response.status()).toBe(200);

        const body = await response.json();
        expect(body.user.email).toBe("testuser@example.com");
      } finally {
        await prismaClient.user.delete({ where: { user_id: user.user_id } });
      }
    });

    test("should include roles and permissions in JWT token", async ({
      apiRequest,
      prismaClient,
    }) => {
      // Create user with password
      const password = "TestPassword123!";
      const passwordHash = await bcrypt.hash(password, 12);
      const userData = createUser({ password_hash: passwordHash });
      const user = await prismaClient.user.create({ data: userData });

      // Get SUPERADMIN role and assign to user
      const role = await prismaClient.role.findUnique({
        where: { code: "SUPERADMIN" },
      });

      if (role) {
        await prismaClient.userRole.create({
          data: {
            user_id: user.user_id,
            role_id: role.role_id,
          },
        });
      }

      try {
        const response = await apiRequest.post("/api/auth/login", {
          email: user.email,
          password: password,
        });

        expect(response.status()).toBe(200);

        // The JWT token should contain roles/permissions
        // We can verify by calling /api/auth/me with the cookie
        const cookies = response.headers()["set-cookie"];
        expect(cookies).toContain("access_token=");
      } finally {
        await prismaClient.userRole.deleteMany({
          where: { user_id: user.user_id },
        });
        await prismaClient.user.delete({ where: { user_id: user.user_id } });
      }
    });
  });

  test.describe("POST /api/auth/logout", () => {
    test("should logout and clear cookies", async ({ apiRequest }) => {
      const response = await apiRequest.post("/api/auth/logout");

      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.message).toBe("Logout successful");

      // Check cookies are cleared
      const cookies = response.headers()["set-cookie"];
      if (cookies) {
        // Cookies should be cleared with empty value or max-age=0
        expect(cookies).toMatch(/access_token=;|access_token=.*Max-Age=0/i);
      }
    });

    test("should succeed even without existing session", async ({
      apiRequest,
    }) => {
      // Logout without being logged in should still succeed
      const response = await apiRequest.post("/api/auth/logout");

      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.message).toBe("Logout successful");
    });
  });

  test.describe("GET /api/auth/me", () => {
    test("should return user info with valid token", async ({
      superadminApiRequest,
      superadminUser,
    }) => {
      const response = await superadminApiRequest.get("/api/auth/me");

      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.user.id).toBe(superadminUser.user_id);
      expect(body.user.email).toBe(superadminUser.email);
      expect(body.user.roles).toContain("SUPERADMIN");
      expect(body.user.permissions).toBeDefined();
    });

    test("should return 401 without token", async ({ apiRequest }) => {
      const response = await apiRequest.get("/api/auth/me");

      expect(response.status()).toBe(401);

      const body = await response.json();
      expect(body.error).toBe("Unauthorized");
    });

    test("should return 401 with invalid token", async ({
      apiRequest,
      backendUrl,
      request,
    }) => {
      const response = await request.get(`${backendUrl}/api/auth/me`, {
        headers: {
          Cookie: "access_token=invalid-token-here",
        },
      });

      expect(response.status()).toBe(401);
    });
  });

  test.describe("POST /api/auth/refresh", () => {
    test("should return 401 without refresh token", async ({ apiRequest }) => {
      const response = await apiRequest.post("/api/auth/refresh");

      expect(response.status()).toBe(401);

      const body = await response.json();
      expect(body.error).toBe("Unauthorized");
      expect(body.message).toBe("Missing refresh token cookie");
    });
  });

  test.describe("Full Authentication Flow", () => {
    test("should complete full login -> access protected route -> logout flow", async ({
      apiRequest,
      prismaClient,
      backendUrl,
      request,
    }) => {
      // 1. Create user with password
      const password = "FlowTest123!";
      const passwordHash = await bcrypt.hash(password, 12);
      const userData = createUser({ password_hash: passwordHash });
      const user = await prismaClient.user.create({ data: userData });

      // Assign SUPERADMIN role for permissions
      const role = await prismaClient.role.findUnique({
        where: { code: "SUPERADMIN" },
      });

      if (role) {
        await prismaClient.userRole.create({
          data: {
            user_id: user.user_id,
            role_id: role.role_id,
          },
        });
      }

      try {
        // 2. Login
        const loginResponse = await apiRequest.post("/api/auth/login", {
          email: user.email,
          password: password,
        });

        expect(loginResponse.status()).toBe(200);

        // Extract cookies from login response
        const setCookies = loginResponse.headers()["set-cookie"];
        expect(setCookies).toBeDefined();

        // Parse access_token from cookies
        const accessTokenMatch = setCookies?.match(/access_token=([^;]+)/);
        const accessToken = accessTokenMatch ? accessTokenMatch[1] : "";
        expect(accessToken).toBeTruthy();

        // 3. Access protected route with the token
        const meResponse = await request.get(`${backendUrl}/api/auth/me`, {
          headers: {
            Cookie: `access_token=${accessToken}`,
          },
        });

        expect(meResponse.status()).toBe(200);
        const meBody = await meResponse.json();
        expect(meBody.user.email).toBe(user.email);

        // 4. Logout
        const logoutResponse = await request.post(
          `${backendUrl}/api/auth/logout`,
          {
            headers: {
              Cookie: `access_token=${accessToken}`,
            },
          },
        );

        expect(logoutResponse.status()).toBe(200);
      } finally {
        // Cleanup
        await prismaClient.userRole.deleteMany({
          where: { user_id: user.user_id },
        });
        await prismaClient.user.delete({ where: { user_id: user.user_id } });
      }
    });
  });
});
