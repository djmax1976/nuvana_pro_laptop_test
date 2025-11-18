import { test, expect } from "../support/fixtures";
import {
  createJWTAccessToken,
  createJWTRefreshToken,
  createExpiredJWTAccessToken,
  createExpiredJWTRefreshToken,
  createAdminJWTAccessToken,
  createUser,
} from "../support/factories";
import { faker } from "@faker-js/faker";

/**
 * JWT Token System API Tests
 *
 * These tests verify the JWT token generation and validation system:
 * - Token generation after OAuth authentication
 * - Token storage in httpOnly cookies
 * - Token validation middleware
 * - Refresh token flow
 * - Error handling for expired/invalid tokens
 *
 * Story: 1-6-jwt-token-system
 * Status: ready-for-dev
 * Priority: P0 (Critical - Authentication)
 */

/**
 * Helper function to store OAuth state for CSRF validation
 * Required before calling OAuth callback endpoint
 * @param apiRequest - Playwright API request context
 * @param state - State string to store
 * @param ttl - Optional time-to-live in milliseconds
 */
async function storeOAuthState(
  apiRequest: any,
  state: string,
  ttl?: number,
): Promise<void> {
  const payload = JSON.stringify({ state, ttl });

  const response = await apiRequest.post("/api/auth/test/store-state", {
    data: payload,
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(
      `Failed to store OAuth state: ${response.status()} - ${body}`,
    );
  }
}

test.describe("1.6-API-001: JWT Token Generation in OAuth Callback", () => {
  test("[P0] 1.6-API-001-001: GET /api/auth/callback should generate access and refresh tokens after successful OAuth", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: User has authenticated via Supabase OAuth
    const oauthCode = faker.string.alphanumeric(32);
    const state = faker.string.alphanumeric(16);

    // Store state for CSRF validation (required before callback)
    await storeOAuthState(apiRequest, state);

    // WHEN: OAuth callback endpoint is called (after successful OAuth)
    const response = await apiRequest.get(
      `/api/auth/callback?code=${oauthCode}&state=${state}`,
    );

    // THEN: Response is 200 OK
    expect(response.status()).toBe(200);

    // AND: Access token is set in httpOnly cookie
    const setCookieHeader = response.headers()["set-cookie"];
    const cookies = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : setCookieHeader
        ? [setCookieHeader]
        : [];
    const accessTokenCookie = cookies.find((cookie: string) =>
      cookie.includes("access_token"),
    );
    expect(accessTokenCookie).toBeTruthy();
    expect(accessTokenCookie).toContain("HttpOnly");
    expect(accessTokenCookie).toContain("Secure");
    expect(accessTokenCookie).toContain("SameSite=Strict");

    // AND: Refresh token is set in httpOnly cookie
    const refreshTokenCookie = cookies.find((cookie: string) =>
      cookie.includes("refresh_token"),
    );
    expect(refreshTokenCookie).toBeTruthy();
    expect(refreshTokenCookie).toContain("HttpOnly");
    expect(refreshTokenCookie).toContain("Secure");
    expect(refreshTokenCookie).toContain("SameSite=Strict");

    // AND: Response contains user information
    const body = await response.json();
    expect(body).toHaveProperty("user");
    expect(body.user).toHaveProperty("id");
    expect(body.user).toHaveProperty("email");
  });

  test("[P0] 1.6-API-001-002: Access token should have 15 minute expiry", async ({
    apiRequest,
  }) => {
    // GIVEN: User has authenticated via Supabase OAuth
    const oauthCode = faker.string.alphanumeric(32);
    const state = faker.string.alphanumeric(16);

    // Store state for CSRF validation (required before callback)
    await storeOAuthState(apiRequest, state);

    // WHEN: OAuth callback endpoint is called
    const response = await apiRequest.get(
      `/api/auth/callback?code=${oauthCode}&state=${state}`,
    );

    // THEN: Response is 200 OK
    expect(response.status()).toBe(200);

    // AND: Access token cookie has Max-Age of 900 seconds (15 minutes)
    const setCookieHeader = response.headers()["set-cookie"];
    const cookies = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : setCookieHeader
        ? [setCookieHeader]
        : [];
    const accessTokenCookie = cookies.find((cookie: string) =>
      cookie.includes("access_token"),
    );
    expect(accessTokenCookie).toContain("Max-Age=900");
  });

  test("[P0] 1.6-API-001-003: Refresh token should have 7 day expiry", async ({
    apiRequest,
  }) => {
    // GIVEN: User has authenticated via Supabase OAuth
    const oauthCode = faker.string.alphanumeric(32);
    const state = faker.string.alphanumeric(16);

    // Store state for CSRF validation (required before callback)
    await storeOAuthState(apiRequest, state);

    // WHEN: OAuth callback endpoint is called
    const response = await apiRequest.get(
      `/api/auth/callback?code=${oauthCode}&state=${state}`,
    );

    // THEN: Response is 200 OK
    expect(response.status()).toBe(200);

    // AND: Refresh token cookie has Max-Age of 604800 seconds (7 days)
    const setCookieHeader = response.headers()["set-cookie"];
    const cookies = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : setCookieHeader
        ? [setCookieHeader]
        : [];
    const refreshTokenCookie = cookies.find((cookie: string) =>
      cookie.includes("refresh_token"),
    );
    expect(refreshTokenCookie).toContain("Max-Age=604800");
  });

  test("[P0] 1.6-API-001-004: JWT access token should contain user_id, email, roles, and permissions", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: User exists in database
    const user = createUser({
      email: faker.internet.email(),
      name: faker.person.fullName(),
      auth_provider_id: faker.string.uuid(),
    });
    const createdUser = await prismaClient.user.create({
      data: user,
    });

    const oauthCode = faker.string.alphanumeric(32);
    const state = faker.string.alphanumeric(16);

    // Store state for CSRF validation (required before callback)
    await storeOAuthState(apiRequest, state);

    // WHEN: OAuth callback endpoint is called
    const response = await apiRequest.get(
      `/api/auth/callback?code=${oauthCode}&state=${state}`,
    );

    // THEN: Response is 200 OK
    expect(response.status()).toBe(200);

    // AND: Access token cookie contains JWT with required claims
    const setCookieHeader = response.headers()["set-cookie"];
    const cookies = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : setCookieHeader
        ? [setCookieHeader]
        : [];
    const accessTokenCookie = cookies.find((cookie: string) =>
      cookie.includes("access_token"),
    );
    expect(accessTokenCookie).toBeTruthy();

    // Extract token from cookie (format: access_token=TOKEN; ...)
    const tokenMatch = accessTokenCookie?.match(/access_token=([^;]+)/);
    expect(tokenMatch).toBeTruthy();
    const token = tokenMatch![1];

    // Decode JWT payload (base64 decode second part)
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64").toString(),
    );
    expect(payload).toHaveProperty("user_id");
    expect(payload).toHaveProperty("email", user.email);
    expect(payload).toHaveProperty("roles");
    expect(payload).toHaveProperty("permissions");

    // Cleanup
    await prismaClient.user.delete({
      where: { user_id: createdUser.user_id },
    });
  });
});

test.describe("1.6-API-002: JWT Token Validation Middleware", () => {
  test("[P0] 1.6-API-002-001: Protected route should accept valid JWT access token from cookie", async ({
    apiRequest,
  }) => {
    // GIVEN: Valid JWT access token in httpOnly cookie
    const userId = faker.string.uuid();
    const userEmail = faker.internet.email();
    const validToken = createJWTAccessToken({
      user_id: userId,
      email: userEmail,
      roles: ["USER"],
      permissions: ["READ"],
    });

    // WHEN: Protected endpoint is called with valid token in cookie
    const response = await apiRequest.get("/api/user/profile", {
      headers: {
        Cookie: `access_token=${validToken}`,
      },
    });

    // THEN: Request is authorized (200 OK)
    expect(response.status()).toBe(200);

    // AND: User context is available in response
    const body = await response.json();
    expect(body).toHaveProperty("user");
    expect(body.user).toHaveProperty("id", userId);
    expect(body.user).toHaveProperty("email", userEmail);
  });

  test("[P0] 1.6-API-002-002: Protected route should return 401 for expired access token", async ({
    apiRequest,
  }) => {
    // GIVEN: Expired JWT access token in cookie
    const expiredToken = createExpiredJWTAccessToken({
      user_id: faker.string.uuid(),
      email: faker.internet.email(),
    });

    // WHEN: Protected endpoint is called with expired token
    const response = await apiRequest.get("/api/user/profile", {
      headers: {
        Cookie: `access_token=${expiredToken}`,
      },
    });

    // THEN: Response is 401 Unauthorized
    expect(response.status()).toBe(401);

    // AND: Error message indicates token expiration
    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("expired");
  });

  test("[P0] 1.6-API-002-003: Protected route should return 401 for invalid JWT token", async ({
    apiRequest,
  }) => {
    // GIVEN: Invalid JWT token in cookie
    const invalidToken = "invalid.jwt.token.string";

    // WHEN: Protected endpoint is called with invalid token
    const response = await apiRequest.get("/api/user/profile", {
      headers: {
        Cookie: `access_token=${invalidToken}`,
      },
    });

    // THEN: Response is 401 Unauthorized
    expect(response.status()).toBe(401);

    // AND: Error message indicates invalid token
    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("token");
  });

  test("[P0] 1.6-API-002-004: Protected route should return 401 for missing access token cookie", async ({
    apiRequest,
  }) => {
    // GIVEN: Request without access token cookie
    // WHEN: Protected endpoint is called without token
    const response = await apiRequest.get("/api/user/profile");

    // THEN: Response is 401 Unauthorized
    expect(response.status()).toBe(401);

    // AND: Error message indicates missing token
    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("token");
  });

  test("[P0] 1.6-API-002-005: Middleware should extract user_id, email, roles, and permissions from token", async ({
    apiRequest,
  }) => {
    // GIVEN: Valid JWT access token with all claims
    const userId = faker.string.uuid();
    const userEmail = faker.internet.email();
    const validToken = createJWTAccessToken({
      user_id: userId,
      email: userEmail,
      roles: ["USER", "ADMIN"],
      permissions: ["READ", "WRITE", "DELETE"],
    });

    // WHEN: Protected endpoint is called with token
    const response = await apiRequest.get("/api/user/profile", {
      headers: {
        Cookie: `access_token=${validToken}`,
      },
    });

    // THEN: Request is authorized
    expect(response.status()).toBe(200);

    // AND: User context contains all claims
    const body = await response.json();
    expect(body.user).toHaveProperty("id", userId);
    expect(body.user).toHaveProperty("email", userEmail);
    expect(body.user).toHaveProperty("roles", ["USER", "ADMIN"]);
    expect(body.user).toHaveProperty("permissions", [
      "READ",
      "WRITE",
      "DELETE",
    ]);
  });

  test("[P1] 1.6-API-002-006: Protected route should return 401 for malformed JWT token", async ({
    apiRequest,
  }) => {
    // GIVEN: Malformed JWT token (not properly formatted)
    const malformedTokens = [
      "not.a.jwt", // Missing parts
      "header.payload", // Missing signature
      "header", // Only header
      "", // Empty string
      "header.payload.signature.extra", // Too many parts
    ];

    // WHEN/THEN: Each malformed token should be rejected
    for (const malformedToken of malformedTokens) {
      const response = await apiRequest.get("/api/user/profile", {
        headers: {
          Cookie: `access_token=${malformedToken}`,
        },
      });

      expect(response.status()).toBe(401);

      const body = await response.json();
      expect(body).toHaveProperty("error");
    }
  });

  test("[P1] 1.6-API-002-007: Protected route should return 401 for token with missing required claims", async ({
    apiRequest,
  }) => {
    // GIVEN: JWT token missing required claims (user_id or email)
    const tokenWithoutUserId = createJWTAccessToken({
      email: faker.internet.email(),
      // user_id intentionally omitted
    });
    const tokenWithoutEmail = createJWTAccessToken({
      user_id: faker.string.uuid(),
      // email intentionally omitted
    });

    // WHEN: Protected endpoint is called with token missing user_id
    const response1 = await apiRequest.get("/api/user/profile", {
      headers: {
        Cookie: `access_token=${tokenWithoutUserId}`,
      },
    });

    // THEN: Response is 401 Unauthorized
    expect(response1.status()).toBe(401);

    // WHEN: Protected endpoint is called with token missing email
    const response2 = await apiRequest.get("/api/user/profile", {
      headers: {
        Cookie: `access_token=${tokenWithoutEmail}`,
      },
    });

    // THEN: Response is 401 Unauthorized
    expect(response2.status()).toBe(401);
  });

  test("[P1] 1.6-API-002-008: Middleware should handle admin role tokens correctly", async ({
    apiRequest,
  }) => {
    // GIVEN: Admin JWT access token
    const adminToken = createAdminJWTAccessToken({
      user_id: faker.string.uuid(),
      email: faker.internet.email(),
    });

    // WHEN: Protected endpoint is called with admin token
    const response = await apiRequest.get("/api/user/profile", {
      headers: {
        Cookie: `access_token=${adminToken}`,
      },
    });

    // THEN: Request is authorized
    expect(response.status()).toBe(200);

    // AND: User context contains admin role and permissions
    const body = await response.json();
    expect(body.user).toHaveProperty("roles");
    expect(body.user.roles).toContain("ADMIN");
    expect(body.user).toHaveProperty("permissions");
    expect(body.user.permissions).toContain("ADMIN");
  });
});

test.describe("1.6-API-003: Refresh Token Endpoint", () => {
  test("[P0] 1.6-API-003-001: POST /api/auth/refresh should generate new access and refresh tokens", async ({
    apiRequest,
  }) => {
    // GIVEN: Valid refresh token in httpOnly cookie
    const refreshToken = createJWTRefreshToken({
      user_id: faker.string.uuid(),
      email: faker.internet.email(),
    });

    // WHEN: Refresh endpoint is called with valid refresh token
    const response = await apiRequest.post("/api/auth/refresh", undefined, {
      headers: {
        Cookie: `refresh_token=${refreshToken}`,
      },
    });

    // THEN: Response is 200 OK
    expect(response.status()).toBe(200);

    // AND: New access token is set in cookie
    const setCookieHeader = response.headers()["set-cookie"];
    const cookies = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : setCookieHeader
        ? [setCookieHeader]
        : [];
    const newAccessTokenCookie = cookies.find((cookie: string) =>
      cookie.includes("access_token"),
    );
    expect(newAccessTokenCookie).toBeTruthy();
    expect(newAccessTokenCookie).toContain("HttpOnly");

    // AND: New refresh token is set in cookie (token rotation)
    const newRefreshTokenCookie = cookies.find((cookie: string) =>
      cookie.includes("refresh_token"),
    );
    expect(newRefreshTokenCookie).toBeTruthy();
    expect(newRefreshTokenCookie).toContain("HttpOnly");
  });

  test("[P0] 1.6-API-003-002: POST /api/auth/refresh should return 401 for expired refresh token", async ({
    apiRequest,
  }) => {
    // GIVEN: Expired refresh token in cookie
    const expiredRefreshToken = createExpiredJWTRefreshToken({
      user_id: faker.string.uuid(),
      email: faker.internet.email(),
    });

    // WHEN: Refresh endpoint is called with expired refresh token
    const response = await apiRequest.post("/api/auth/refresh", undefined, {
      headers: {
        Cookie: `refresh_token=${expiredRefreshToken}`,
      },
    });

    // THEN: Response is 401 Unauthorized
    expect(response.status()).toBe(401);

    // AND: Error message indicates token expiration
    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("expired");
  });

  test("[P0] 1.6-API-003-003: POST /api/auth/refresh should return 401 for invalid refresh token", async ({
    apiRequest,
  }) => {
    // GIVEN: Invalid refresh token in cookie
    const invalidToken = "invalid.refresh.token";

    // WHEN: Refresh endpoint is called with invalid token
    const response = await apiRequest.post("/api/auth/refresh", undefined, {
      headers: {
        Cookie: `refresh_token=${invalidToken}`,
      },
    });

    // THEN: Response is 401 Unauthorized
    expect(response.status()).toBe(401);

    // AND: Error message indicates invalid token
    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("token");
  });

  test("[P0] 1.6-API-003-004: POST /api/auth/refresh should return 401 for missing refresh token cookie", async ({
    apiRequest,
  }) => {
    // GIVEN: Request without refresh token cookie
    // WHEN: Refresh endpoint is called without token
    const response = await apiRequest.post("/api/auth/refresh");

    // THEN: Response is 401 Unauthorized
    expect(response.status()).toBe(401);

    // AND: Error message indicates missing token
    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("token");
  });

  test("[P0] 1.6-API-003-005: Refresh token should be rotated (old token invalidated, new token issued)", async ({
    apiRequest,
  }) => {
    // GIVEN: Valid refresh token in cookie
    const userId = faker.string.uuid();
    const userEmail = faker.internet.email();
    const originalRefreshToken = createJWTRefreshToken({
      user_id: userId,
      email: userEmail,
    });

    // WHEN: Refresh endpoint is called first time
    const response1 = await apiRequest.post("/api/auth/refresh", undefined, {
      headers: {
        Cookie: `refresh_token=${originalRefreshToken}`,
      },
    });

    // THEN: New tokens are issued
    expect(response1.status()).toBe(200);
    const setCookieHeader1 = response1.headers()["set-cookie"];
    const cookies1 = Array.isArray(setCookieHeader1)
      ? setCookieHeader1
      : setCookieHeader1
        ? [setCookieHeader1]
        : [];
    const newRefreshToken1 = cookies1
      .find((cookie: string) => cookie.includes("refresh_token"))
      ?.match(/refresh_token=([^;]+)/)?.[1];

    // WHEN: Same original refresh token is used again (should be invalidated)
    const response2 = await apiRequest.post("/api/auth/refresh", undefined, {
      headers: {
        Cookie: `refresh_token=${originalRefreshToken}`,
      },
    });

    // THEN: Original token is rejected (401)
    expect(response2.status()).toBe(401);

    // AND: New refresh token from first call works
    const response3 = await apiRequest.post("/api/auth/refresh", undefined, {
      headers: {
        Cookie: `refresh_token=${newRefreshToken1}`,
      },
    });

    // THEN: New token is accepted
    expect(response3.status()).toBe(200);
  });

  test("[P1] 1.6-API-003-006: POST /api/auth/refresh should return 401 for malformed refresh token", async ({
    apiRequest,
  }) => {
    // GIVEN: Malformed refresh token
    const malformedToken = "not.a.valid.refresh.token";

    // WHEN: Refresh endpoint is called with malformed token
    const response = await apiRequest.post("/api/auth/refresh", undefined, {
      headers: {
        Cookie: `refresh_token=${malformedToken}`,
      },
    });

    // THEN: Response is 401 Unauthorized
    expect(response.status()).toBe(401);

    // AND: Error message indicates invalid token
    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("token");
  });

  test("[P1] 1.6-API-003-007: POST /api/auth/refresh should preserve user context after token rotation", async ({
    apiRequest,
  }) => {
    // GIVEN: Valid refresh token
    const userId = faker.string.uuid();
    const userEmail = faker.internet.email();
    const refreshToken = createJWTRefreshToken({
      user_id: userId,
      email: userEmail,
    });

    // WHEN: Refresh endpoint is called
    const response = await apiRequest.post("/api/auth/refresh", undefined, {
      headers: {
        Cookie: `refresh_token=${refreshToken}`,
      },
    });

    // THEN: Response is 200 OK
    expect(response.status()).toBe(200);

    // AND: Response contains user information matching original token
    const body = await response.json();
    expect(body).toHaveProperty("user");
    expect(body.user).toHaveProperty("id", userId);
    expect(body.user).toHaveProperty("email", userEmail);
  });
});
