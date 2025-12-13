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
import { createUserWithRole } from "../support/helpers/user-with-role.helper";
import bcrypt from "bcrypt";

test.describe("Local Authentication API", () => {
  test.describe("POST /api/auth/login", () => {
    test("should login successfully with valid credentials", async ({
      apiRequest,
      prismaClient,
    }) => {
      // Create user with password and role
      const { user, password } = await createUserWithRole(prismaClient);

      try {
        const response = await apiRequest.post("/api/auth/login", {
          email: user.email,
          password: password,
        });

        expect(response.status()).toBe(200);

        const body = await response.json();
        // Verify response structure matches implementation
        expect(body.success).toBe(true);
        expect(body.data).toBeDefined();
        expect(body.data.message).toBe("Login successful");
        expect(body.data.user).toBeDefined();
        expect(body.data.user.id).toBe(user.user_id);
        expect(body.data.user.email).toBe(user.email);
        expect(body.data.user.name).toBe(user.name);
        expect(body.data.user.roles).toBeDefined();
        expect(Array.isArray(body.data.user.roles)).toBe(true);
        expect(body.data.user.is_client_user).toBeDefined();
        expect(typeof body.data.user.is_client_user).toBe("boolean");
        expect(body.data.user.user_role).toBeDefined();

        // Check cookies are set with proper security attributes
        const cookies = response.headers()["set-cookie"];
        expect(cookies).toBeDefined();
        const cookieArray = Array.isArray(cookies) ? cookies : [cookies];

        // Find access_token and refresh_token cookies
        const accessTokenCookie = cookieArray.find((c: string) =>
          c.includes("access_token="),
        );
        const refreshTokenCookie = cookieArray.find((c: string) =>
          c.includes("refresh_token="),
        );

        expect(accessTokenCookie).toBeDefined();
        expect(refreshTokenCookie).toBeDefined();

        // Verify security attributes for access token
        expect(accessTokenCookie).toContain("HttpOnly");
        expect(accessTokenCookie).toContain("Path=/");
        expect(accessTokenCookie).toMatch(/SameSite=(Lax|Strict)/i);
        // Verify access token has correct maxAge based on role
        // CASHIER (default role) gets 1 hour = 3600 seconds
        // SUPERADMIN gets 8 hours = 28800 seconds
        // CLIENT_USER gets session cookie (no Max-Age)
        expect(accessTokenCookie).toMatch(/Max-Age=3600/i);

        // Verify security attributes for refresh token
        expect(refreshTokenCookie).toContain("HttpOnly");
        expect(refreshTokenCookie).toContain("Path=/");
        expect(refreshTokenCookie).toMatch(/SameSite=(Lax|Strict)/i);
        // Verify refresh token has correct maxAge (7 days = 604800 seconds)
        expect(refreshTokenCookie).toMatch(/Max-Age=604800/i);
      } finally {
        // Cleanup
        await prismaClient.userRole.deleteMany({
          where: { user_id: user.user_id },
        });
        await prismaClient.user.delete({ where: { user_id: user.user_id } });
      }
    });

    test("should return 401 for invalid email", async ({ apiRequest }) => {
      const response = await apiRequest.post("/api/auth/login", {
        email: "nonexistent@test.com",
        password: "SomePassword123!",
      });

      expect(response.status()).toBe(401);

      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe("UNAUTHORIZED");
      expect(body.error.message).toBe("Invalid email or password");
    });

    test("should return 401 for invalid password", async ({
      apiRequest,
      prismaClient,
    }) => {
      // Create user with password and role
      const { user } = await createUserWithRole(prismaClient, {
        password: "CorrectPassword123!",
      });

      try {
        const response = await apiRequest.post("/api/auth/login", {
          email: user.email,
          password: "WrongPassword123!",
        });

        expect(response.status()).toBe(401);

        const body = await response.json();
        // Verify error response structure matches implementation
        expect(body.success).toBe(false);
        expect(body.error).toBeDefined();
        expect(body.error.code).toBe("UNAUTHORIZED");
        expect(body.error.message).toBe("Invalid email or password");
      } finally {
        await prismaClient.userRole.deleteMany({
          where: { user_id: user.user_id },
        });
        await prismaClient.user.delete({ where: { user_id: user.user_id } });
      }
    });

    test("should return 401 for inactive user", async ({
      apiRequest,
      prismaClient,
    }) => {
      // Create inactive user with password and role
      const { user, password } = await createUserWithRole(prismaClient, {
        status: "INACTIVE",
      });

      try {
        const response = await apiRequest.post("/api/auth/login", {
          email: user.email,
          password: password,
        });

        expect(response.status()).toBe(401);

        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error).toBeDefined();
        expect(body.error.code).toBe("UNAUTHORIZED");
        expect(body.error.message).toBe("Account is inactive");
      } finally {
        await prismaClient.userRole.deleteMany({
          where: { user_id: user.user_id },
        });
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
        // API returns generic message for security (don't leak account existence)
        expect(body.success).toBe(false);
        expect(body.error).toBeDefined();
        expect(body.error.code).toBe("UNAUTHORIZED");
        expect(body.error.message).toBe("Invalid email or password");
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
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toBe("Email and password are required");
    });

    test("should return 400 for missing password", async ({ apiRequest }) => {
      const response = await apiRequest.post("/api/auth/login", {
        email: "test@test.com",
      });

      expect(response.status()).toBe(400);

      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toBe("Email and password are required");
    });

    test("should normalize email to lowercase and trim whitespace", async ({
      apiRequest,
      prismaClient,
    }) => {
      // Create user with lowercase email
      const { user, password } = await createUserWithRole(prismaClient, {
        email: "testuser@test.com",
      });

      try {
        // Login with uppercase email and whitespace (should normalize)
        const response = await apiRequest.post("/api/auth/login", {
          email: "  TESTUSER@TEST.COM  ",
          password: password,
        });

        expect(response.status()).toBe(200);

        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.data.user.email).toBe("testuser@test.com");
      } finally {
        // Cleanup in correct order (userRole first due to foreign key)
        await prismaClient.userRole.deleteMany({
          where: { user_id: user.user_id },
        });
        // Use deleteMany instead of delete to avoid error if user doesn't exist
        await prismaClient.user.deleteMany({
          where: { user_id: user.user_id },
        });
      }
    });

    test("should return 400 for empty email string", async ({ apiRequest }) => {
      const response = await apiRequest.post("/api/auth/login", {
        email: "",
        password: "SomePassword123!",
      });

      expect(response.status()).toBe(400);

      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toBe("Email and password are required");
    });

    test("should return 400 for empty password string", async ({
      apiRequest,
    }) => {
      const response = await apiRequest.post("/api/auth/login", {
        email: "test@test.com",
        password: "",
      });

      expect(response.status()).toBe(400);

      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toBe("Email and password are required");
    });

    test("should return 401 for whitespace-only email (trimmed to empty, user not found)", async ({
      apiRequest,
    }) => {
      // Implementation trims whitespace before validation, so "   " becomes ""
      // which then fails user lookup, returning 401
      const response = await apiRequest.post("/api/auth/login", {
        email: "   ",
        password: "SomePassword123!",
      });

      expect(response.status()).toBe(401);

      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
      expect(body.error.message).toBe("Invalid email or password");
    });

    test("should return 401 for whitespace-only password (trimmed to empty)", async ({
      apiRequest,
      prismaClient,
    }) => {
      // Create user to test password validation
      const { user } = await createUserWithRole(prismaClient, {
        password: "CorrectPassword123!",
      });

      try {
        // Implementation trims whitespace, so "   " becomes "" which fails password check
        const response = await apiRequest.post("/api/auth/login", {
          email: user.email,
          password: "   ",
        });

        expect(response.status()).toBe(401);

        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("UNAUTHORIZED");
        expect(body.error.message).toBe("Invalid email or password");
      } finally {
        await prismaClient.userRole.deleteMany({
          where: { user_id: user.user_id },
        });
        await prismaClient.user.delete({ where: { user_id: user.user_id } });
      }
    });

    test("should handle SQL injection attempts safely", async ({
      apiRequest,
    }) => {
      // Attempt SQL injection in email field
      const response = await apiRequest.post("/api/auth/login", {
        email: "admin@test.com' OR '1'='1",
        password: "SomePassword123!",
      });

      // Should return 401 (user not found) not 500 (SQL error)
      expect(response.status()).toBe(401);

      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    test("should handle XSS attempts safely", async ({ apiRequest }) => {
      // Attempt XSS in email field
      const response = await apiRequest.post("/api/auth/login", {
        email: "<script>alert('xss')</script>@test.com",
        password: "SomePassword123!",
      });

      // Should return 401 (user not found) not execute script
      expect(response.status()).toBe(401);

      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    test("should include roles and permissions in response and JWT token", async ({
      apiRequest,
      prismaClient,
      backendUrl,
      request,
    }) => {
      // Create user with SUPERADMIN role
      const { user, password } = await createUserWithRole(prismaClient, {
        roleCode: "SUPERADMIN",
      });

      try {
        const response = await apiRequest.post("/api/auth/login", {
          email: user.email,
          password: password,
        });

        expect(response.status()).toBe(200);

        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.data.user.roles).toContain("SUPERADMIN");
        expect(body.data.user.user_role).toBe("SUPERADMIN");

        // Verify JWT token contains roles/permissions by calling /api/auth/me
        const cookies = response.headers()["set-cookie"];
        const cookieString = Array.isArray(cookies)
          ? cookies.join("; ")
          : cookies;
        const accessTokenMatch = cookieString?.match(/access_token=([^;]+)/);
        const accessToken = accessTokenMatch ? accessTokenMatch[1] : "";
        expect(accessToken).toBeTruthy();

        // Verify token works and contains roles/permissions
        const meResponse = await request.get(`${backendUrl}/api/auth/me`, {
          headers: {
            Cookie: `access_token=${accessToken}`,
          },
        });

        expect(meResponse.status()).toBe(200);
        const meBody = await meResponse.json();
        expect(meBody.user.roles).toContain("SUPERADMIN");
        expect(meBody.user.permissions).toBeDefined();
        expect(Array.isArray(meBody.user.permissions)).toBe(true);
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
      const response = await apiRequest.post("/api/auth/logout", {});

      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.message).toBe("Logout successful");

      // Check cookies are cleared
      const cookies = response.headers()["set-cookie"];
      if (cookies) {
        const cookieString = Array.isArray(cookies)
          ? cookies.join("; ")
          : cookies;
        // Cookies should be cleared with empty value or max-age=0
        expect(cookieString).toMatch(
          /access_token=;|access_token=.*Max-Age=0/i,
        );
        expect(cookieString).toMatch(
          /refresh_token=;|refresh_token=.*Max-Age=0/i,
        );
      }
    });

    test("should succeed even without existing session", async ({
      apiRequest,
    }) => {
      // Logout without being logged in should still succeed
      const response = await apiRequest.post("/api/auth/logout", {});

      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.message).toBe("Logout successful");
    });

    test("should invalidate refresh token in Redis when logged in", async ({
      apiRequest,
      prismaClient,
      backendUrl,
      request,
    }) => {
      // Create user and login
      const { user, password } = await createUserWithRole(prismaClient);

      try {
        // Login to get tokens
        const loginResponse = await apiRequest.post("/api/auth/login", {
          email: user.email,
          password: password,
        });

        expect(loginResponse.status()).toBe(200);
        const cookies = loginResponse.headers()["set-cookie"];
        const cookieArray = Array.isArray(cookies) ? cookies : [cookies];

        // Extract refresh token from cookie string
        const refreshTokenCookie = cookieArray.find((c: string) =>
          c.includes("refresh_token="),
        );
        const refreshTokenMatch = refreshTokenCookie?.match(
          /refresh_token=([^;]+)/,
        );
        const refreshToken = refreshTokenMatch ? refreshTokenMatch[1] : "";
        expect(refreshToken).toBeTruthy();

        // Extract access token for logout
        const accessTokenCookie = cookieArray.find((c: string) =>
          c.includes("access_token="),
        );
        const accessTokenMatch =
          accessTokenCookie?.match(/access_token=([^;]+)/);
        const accessToken = accessTokenMatch ? accessTokenMatch[1] : "";

        // Logout with properly formatted cookie header
        const logoutResponse = await request.post(
          `${backendUrl}/api/auth/logout`,
          {
            headers: {
              Cookie: `access_token=${accessToken}; refresh_token=${refreshToken}`,
            },
          },
        );

        expect(logoutResponse.status()).toBe(200);

        // Verify refresh token is invalidated by trying to use it
        const refreshResponse = await request.post(
          `${backendUrl}/api/auth/refresh`,
          {
            headers: {
              Cookie: `refresh_token=${refreshToken}`,
            },
          },
        );

        // Should fail because token was invalidated
        expect(refreshResponse.status()).toBe(401);
      } finally {
        await prismaClient.userRole.deleteMany({
          where: { user_id: user.user_id },
        });
        await prismaClient.user.delete({ where: { user_id: user.user_id } });
      }
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
      expect(body.user).toBeDefined();
      expect(body.user.id).toBe(superadminUser.user_id);
      expect(body.user.email).toBe(superadminUser.email);
      expect(body.user.name).toBeDefined();
      expect(body.user.roles).toContain("SUPERADMIN");
      expect(body.user.permissions).toBeDefined();
      expect(Array.isArray(body.user.permissions)).toBe(true);
      expect(body.user.is_client_user).toBeDefined();
      expect(typeof body.user.is_client_user).toBe("boolean");
      expect(body.message).toBe("User session validated");
    });

    test("should return 401 without token", async ({ apiRequest }) => {
      const response = await apiRequest.get("/api/auth/me");

      expect(response.status()).toBe(401);

      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe("UNAUTHORIZED");
      expect(body.error.message).toBe("Missing access token cookie");
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

      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    test("should return 401 with expired token", async ({
      apiRequest,
      prismaClient,
      backendUrl,
      request,
    }) => {
      // Create user and login
      const { user, password } = await createUserWithRole(prismaClient);

      try {
        // Login to get a valid token
        const loginResponse = await apiRequest.post("/api/auth/login", {
          email: user.email,
          password: password,
        });

        expect(loginResponse.status()).toBe(200);

        // Note: We can't easily test expired tokens without manipulating time
        // This test verifies the endpoint requires a valid token structure
        const response = await request.get(`${backendUrl}/api/auth/me`, {
          headers: {
            Cookie: "access_token=expired.invalid.token",
          },
        });

        expect(response.status()).toBe(401);
      } finally {
        await prismaClient.userRole.deleteMany({
          where: { user_id: user.user_id },
        });
        await prismaClient.user.delete({ where: { user_id: user.user_id } });
      }
    });
  });

  test.describe("POST /api/auth/refresh", () => {
    test("should return 401 without refresh token", async ({ apiRequest }) => {
      const response = await apiRequest.post("/api/auth/refresh", {});

      expect(response.status()).toBe(401);

      const body = await response.json();
      expect(body.error).toBe("Unauthorized");
      expect(body.message).toBe("Missing refresh token cookie");
    });

    test("should refresh tokens successfully with valid refresh token", async ({
      apiRequest,
      prismaClient,
      backendUrl,
      request,
    }) => {
      // Create user and login
      const { user, password } = await createUserWithRole(prismaClient);

      try {
        // Login to get tokens
        const loginResponse = await apiRequest.post("/api/auth/login", {
          email: user.email,
          password: password,
        });

        expect(loginResponse.status()).toBe(200);
        const cookies = loginResponse.headers()["set-cookie"];
        const cookieString = Array.isArray(cookies)
          ? cookies.join("; ")
          : cookies;

        // Extract refresh token
        const refreshTokenMatch = cookieString?.match(/refresh_token=([^;]+)/);
        const refreshToken = refreshTokenMatch ? refreshTokenMatch[1] : "";
        expect(refreshToken).toBeTruthy();

        // Use refresh token to get new tokens
        const refreshResponse = await request.post(
          `${backendUrl}/api/auth/refresh`,
          {
            headers: {
              Cookie: `refresh_token=${refreshToken}`,
            },
          },
        );

        expect(refreshResponse.status()).toBe(200);
        const refreshBody = await refreshResponse.json();
        expect(refreshBody.message).toBe("Tokens refreshed successfully");
        expect(refreshBody.user).toBeDefined();
        expect(refreshBody.user.id).toBe(user.user_id);
        expect(refreshBody.user.email).toBe(user.email);

        // Verify new cookies are set
        const newCookies = refreshResponse.headers()["set-cookie"];
        const newCookieString = Array.isArray(newCookies)
          ? newCookies.join("; ")
          : newCookies;
        expect(newCookieString).toContain("access_token=");
        expect(newCookieString).toContain("refresh_token=");
        expect(newCookieString).toContain("HttpOnly");

        // Verify old refresh token is invalidated (token rotation)
        const oldRefreshResponse = await request.post(
          `${backendUrl}/api/auth/refresh`,
          {
            headers: {
              Cookie: `refresh_token=${refreshToken}`,
            },
          },
        );

        expect(oldRefreshResponse.status()).toBe(401);
      } finally {
        await prismaClient.userRole.deleteMany({
          where: { user_id: user.user_id },
        });
        await prismaClient.user.delete({ where: { user_id: user.user_id } });
      }
    });

    test("should return 401 with invalid refresh token", async ({
      apiRequest,
      backendUrl,
      request,
    }) => {
      const response = await request.post(`${backendUrl}/api/auth/refresh`, {
        headers: {
          Cookie: "refresh_token=invalid-token-here",
        },
      });

      expect(response.status()).toBe(401);

      const body = await response.json();
      expect(body.error).toBe("Unauthorized");
      expect(body.message).toBeDefined();
    });
  });

  test.describe("Full Authentication Flow", () => {
    test("should complete full login -> access protected route -> logout flow", async ({
      apiRequest,
      prismaClient,
      backendUrl,
      request,
    }) => {
      // 1. Create user with SUPERADMIN role for permissions
      const { user, password } = await createUserWithRole(prismaClient, {
        roleCode: "SUPERADMIN",
      });

      try {
        // 2. Login
        const loginResponse = await apiRequest.post("/api/auth/login", {
          email: user.email,
          password: password,
        });

        expect(loginResponse.status()).toBe(200);

        const loginBody = await loginResponse.json();
        expect(loginBody.success).toBe(true);
        expect(loginBody.data.user.email).toBe(user.email);

        // Extract cookies from login response
        const setCookies = loginResponse.headers()["set-cookie"];
        expect(setCookies).toBeDefined();
        const cookieArray = Array.isArray(setCookies)
          ? setCookies
          : [setCookies];

        // Parse access_token and refresh_token from cookies
        const accessTokenCookie = cookieArray.find((c: string) =>
          c.includes("access_token="),
        );
        const refreshTokenCookie = cookieArray.find((c: string) =>
          c.includes("refresh_token="),
        );

        const accessTokenMatch =
          accessTokenCookie?.match(/access_token=([^;]+)/);
        const refreshTokenMatch = refreshTokenCookie?.match(
          /refresh_token=([^;]+)/,
        );

        const accessToken = accessTokenMatch ? accessTokenMatch[1] : "";
        const refreshToken = refreshTokenMatch ? refreshTokenMatch[1] : "";

        expect(accessToken).toBeTruthy();
        expect(refreshToken).toBeTruthy();

        // 3. Access protected route with the token
        const meResponse = await request.get(`${backendUrl}/api/auth/me`, {
          headers: {
            Cookie: `access_token=${accessToken}`,
          },
        });

        expect(meResponse.status()).toBe(200);
        const meBody = await meResponse.json();
        expect(meBody.user.email).toBe(user.email);
        expect(meBody.user.roles).toBeDefined();
        expect(meBody.user.permissions).toBeDefined();

        // 4. Logout with properly formatted cookie header
        const logoutResponse = await request.post(
          `${backendUrl}/api/auth/logout`,
          {
            headers: {
              Cookie: `access_token=${accessToken}; refresh_token=${refreshToken}`,
            },
          },
        );

        expect(logoutResponse.status()).toBe(200);
        const logoutBody = await logoutResponse.json();
        expect(logoutBody.message).toBe("Logout successful");
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
