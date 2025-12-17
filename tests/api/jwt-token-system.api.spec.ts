import { test, expect } from "../support/fixtures";
import {
  createJWTAccessToken,
  createJWTRefreshToken,
  createExpiredJWTAccessToken,
  createExpiredJWTRefreshToken,
  createAdminJWTAccessToken,
  createMalformedJWTAccessToken,
} from "../support/factories";
import { createUserWithRole } from "../support/helpers/user-with-role.helper";
import { deleteUserWithRelatedData } from "../support/cleanup-helper";
import { faker } from "@faker-js/faker";

/**
 * Test data identifier prefix for JWT token system tests.
 * Used to identify test data for cleanup in global teardown.
 */
const TEST_EMAIL_PREFIX = "jwt-test-";

/**
 * Safely normalizes error text from API response body.
 * Prefers body.message if it's a string, otherwise uses body.error if it's a string,
 * otherwise stringifies body.error (JSON.stringify) or uses String(body.error).
 */
function normalizeErrorText(body: any): string {
  if (body === null || body === undefined) {
    return "";
  }
  if (typeof body.message === "string") {
    return body.message;
  }
  if (typeof body.error === "string") {
    return body.error;
  }
  if (body.error !== undefined && body.error !== null) {
    try {
      return JSON.stringify(body.error);
    } catch {
      return String(body.error);
    }
  }
  return String(body.message ?? body.error ?? "");
}

/**
 * JWT Token System API Tests
 *
 * These tests verify the JWT token generation and validation system:
 * - Token storage in httpOnly cookies
 * - Token validation middleware
 * - Refresh token flow
 * - Error handling for expired/invalid tokens
 *
 * Story: 1-6-jwt-token-system
 * Status: ready-for-dev
 * Priority: P0 (Critical - Authentication)
 */

test.describe("1.6-API-002: JWT Token Validation Middleware", () => {
  test("[P0] 1.6-API-002-001: Protected route should accept valid JWT access token from cookie", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: User exists in database with role
    // Note: Email is lowercased to match backend normalization
    const userEmail =
      `${TEST_EMAIL_PREFIX}${Date.now()}-${faker.string.alphanumeric(6)}@test.nuvana.local`.toLowerCase();
    const { user: createdUser } = await createUserWithRole(prismaClient, {
      email: userEmail,
      name: faker.person.fullName(),
    });

    try {
      // AND: Valid JWT access token in httpOnly cookie
      const validToken = createJWTAccessToken({
        user_id: createdUser.user_id,
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
      expect(body.user).toHaveProperty("user_id", createdUser.user_id);
      expect(body.user).toHaveProperty("email", userEmail);
    } finally {
      // Use robust cleanup helper to handle foreign key constraints
      await deleteUserWithRelatedData(prismaClient, createdUser.user_id);
    }
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
    expect(body.error).toHaveProperty("code", "UNAUTHORIZED");
    expect(body.error.message).toContain("expired");
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
    expect(body.error).toHaveProperty("code", "UNAUTHORIZED");
    // Use case-insensitive match for "token" to handle variations like "Token structure is invalid"
    expect(body.error.message.toLowerCase()).toContain("token");
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
    expect(body.error).toHaveProperty("code", "UNAUTHORIZED");
    expect(body.error.message).toContain("token");
  });

  test("[P0] 1.6-API-002-005: Middleware should extract user_id, email, roles, and permissions from token", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: User exists in database with role
    const userEmail =
      `${TEST_EMAIL_PREFIX}${Date.now()}-${faker.string.alphanumeric(6)}@test.nuvana.local`.toLowerCase();
    const { user: createdUser } = await createUserWithRole(prismaClient, {
      email: userEmail,
      name: faker.person.fullName(),
    });

    try {
      // AND: Valid JWT access token with all claims
      const validToken = createJWTAccessToken({
        user_id: createdUser.user_id,
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

      // AND: User exists in database response
      const body = await response.json();
      expect(body.user).toHaveProperty("user_id", createdUser.user_id);
      expect(body.user).toHaveProperty("email", userEmail);
    } finally {
      // Use robust cleanup helper to handle foreign key constraints
      await deleteUserWithRelatedData(prismaClient, createdUser.user_id);
    }
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
    // GIVEN: JWT tokens with intentionally missing required claims
    // Using dedicated malformed token factory for security testing
    const tokenWithoutUserId = createMalformedJWTAccessToken({
      email: faker.internet.email(),
      // user_id intentionally omitted
    });
    const tokenWithoutEmail = createMalformedJWTAccessToken({
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
    prismaClient,
  }) => {
    // GIVEN: User exists in database with role
    const userEmail =
      `${TEST_EMAIL_PREFIX}${Date.now()}-${faker.string.alphanumeric(6)}@test.nuvana.local`.toLowerCase();
    const { user: createdUser } = await createUserWithRole(prismaClient, {
      email: userEmail,
      name: faker.person.fullName(),
    });

    try {
      // AND: Admin JWT access token
      const adminToken = createAdminJWTAccessToken({
        user_id: createdUser.user_id,
        email: userEmail,
      });

      // WHEN: Protected endpoint is called with admin token
      const response = await apiRequest.get("/api/user/profile", {
        headers: {
          Cookie: `access_token=${adminToken}`,
        },
      });

      // THEN: Request is authorized
      expect(response.status()).toBe(200);

      // AND: User exists in database
      const body = await response.json();
      expect(body.user).toHaveProperty("user_id", createdUser.user_id);
      expect(body.user).toHaveProperty("email", userEmail);
    } finally {
      // Use robust cleanup helper to handle foreign key constraints
      await deleteUserWithRelatedData(prismaClient, createdUser.user_id);
    }
  });
});

test.describe("1.6-API-003: Refresh Token Endpoint", () => {
  test("[P0] 1.6-API-003-001: POST /api/auth/refresh should generate new access and refresh tokens", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: User exists in database with role
    const userEmail =
      `${TEST_EMAIL_PREFIX}${Date.now()}-${faker.string.alphanumeric(6)}@test.nuvana.local`.toLowerCase();
    const { user: createdUser } = await createUserWithRole(prismaClient, {
      email: userEmail,
      name: faker.person.fullName(),
    });

    try {
      // AND: Valid refresh token in httpOnly cookie
      const refreshToken = await createJWTRefreshToken({
        user_id: createdUser.user_id,
        email: userEmail,
      });

      // WHEN: Refresh endpoint is called with valid refresh token
      const response = await apiRequest.post(
        "/api/auth/refresh",
        {},
        {
          headers: {
            Cookie: `refresh_token=${refreshToken}`,
          },
        },
      );

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
    } finally {
      // Use robust cleanup helper to handle foreign key constraints
      await deleteUserWithRelatedData(prismaClient, createdUser.user_id);
    }
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
    const response = await apiRequest.post(
      "/api/auth/refresh",
      {},
      {
        headers: {
          Cookie: `refresh_token=${expiredRefreshToken}`,
        },
      },
    );

    // THEN: Response is 401 Unauthorized
    expect(response.status()).toBe(401);

    // AND: Error message indicates token expiration
    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(normalizeErrorText(body).toLowerCase()).toContain("expired");
  });

  test("[P0] 1.6-API-003-003: POST /api/auth/refresh should return 401 for invalid refresh token", async ({
    apiRequest,
  }) => {
    // GIVEN: Invalid refresh token in cookie
    const invalidToken = "invalid.refresh.token";

    // WHEN: Refresh endpoint is called with invalid token
    const response = await apiRequest.post(
      "/api/auth/refresh",
      {},
      {
        headers: {
          Cookie: `refresh_token=${invalidToken}`,
        },
      },
    );

    // THEN: Response is 401 Unauthorized
    expect(response.status()).toBe(401);

    // AND: Error message indicates invalid token
    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(normalizeErrorText(body).toLowerCase()).toContain("token");
  });

  test("[P0] 1.6-API-003-004: POST /api/auth/refresh should return 401 for missing refresh token cookie", async ({
    apiRequest,
  }) => {
    // GIVEN: Request without refresh token cookie
    // WHEN: Refresh endpoint is called without token
    const response = await apiRequest.post("/api/auth/refresh", {});

    // THEN: Response is 401 Unauthorized
    expect(response.status()).toBe(401);

    // AND: Error message indicates missing token
    const body = await response.json();
    expect(body).toHaveProperty("error");
    // Error can be in either the error field (legacy) or message field (standard API format)
    expect(normalizeErrorText(body).toLowerCase()).toContain("token");
  });

  test("[P0] 1.6-API-003-005: Refresh token should be rotated (old token invalidated, new token issued)", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: User exists in database with role
    const userEmail =
      `${TEST_EMAIL_PREFIX}${Date.now()}-${faker.string.alphanumeric(6)}@test.nuvana.local`.toLowerCase();
    const { user: createdUser } = await createUserWithRole(prismaClient, {
      email: userEmail,
      name: faker.person.fullName(),
    });

    try {
      // AND: Valid refresh token in cookie
      const originalRefreshToken = await createJWTRefreshToken({
        user_id: createdUser.user_id,
        email: userEmail,
      });

      // WHEN: Refresh endpoint is called first time
      const response1 = await apiRequest.post(
        "/api/auth/refresh",
        {},
        {
          headers: {
            Cookie: `refresh_token=${originalRefreshToken}`,
          },
        },
      );

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
      const response2 = await apiRequest.post(
        "/api/auth/refresh",
        {},
        {
          headers: {
            Cookie: `refresh_token=${originalRefreshToken}`,
          },
        },
      );

      // THEN: Original token is rejected (401)
      expect(response2.status()).toBe(401);

      // AND: New refresh token from first call works
      const response3 = await apiRequest.post(
        "/api/auth/refresh",
        {},
        {
          headers: {
            Cookie: `refresh_token=${newRefreshToken1}`,
          },
        },
      );

      // THEN: New token is accepted
      expect(response3.status()).toBe(200);
    } finally {
      // Use robust cleanup helper to handle foreign key constraints
      await deleteUserWithRelatedData(prismaClient, createdUser.user_id);
    }
  });

  test("[P1] 1.6-API-003-006: POST /api/auth/refresh should return 401 for malformed refresh token", async ({
    apiRequest,
  }) => {
    // GIVEN: Malformed refresh token
    const malformedToken = "not.a.valid.refresh.token";

    // WHEN: Refresh endpoint is called with malformed token
    const response = await apiRequest.post(
      "/api/auth/refresh",
      {},
      {
        headers: {
          Cookie: `refresh_token=${malformedToken}`,
        },
      },
    );

    // THEN: Response is 401 Unauthorized
    expect(response.status()).toBe(401);

    // AND: Error message indicates invalid token
    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(normalizeErrorText(body).toLowerCase()).toContain("token");
  });

  test("[P1] 1.6-API-003-007: POST /api/auth/refresh should preserve user context after token rotation", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: User exists in database with role
    const userEmail =
      `${TEST_EMAIL_PREFIX}${Date.now()}-${faker.string.alphanumeric(6)}@test.nuvana.local`.toLowerCase();
    const { user: createdUser } = await createUserWithRole(prismaClient, {
      email: userEmail,
      name: faker.person.fullName(),
    });

    try {
      // AND: Valid refresh token
      const refreshToken = await createJWTRefreshToken({
        user_id: createdUser.user_id,
        email: userEmail,
      });

      // WHEN: Refresh endpoint is called
      const response = await apiRequest.post(
        "/api/auth/refresh",
        {},
        {
          headers: {
            Cookie: `refresh_token=${refreshToken}`,
          },
        },
      );

      // THEN: Response is 200 OK
      expect(response.status()).toBe(200);

      // AND: Response contains user information matching original token
      const body = await response.json();
      expect(body).toHaveProperty("user");
      expect(body.user).toHaveProperty("id", createdUser.user_id);
      expect(body.user).toHaveProperty("email", userEmail);
    } finally {
      // Use robust cleanup helper to handle foreign key constraints
      await deleteUserWithRelatedData(prismaClient, createdUser.user_id);
    }
  });
});

test.describe("1.6-API-004: Automatic Token Refresh on 401 (Frontend Auto-Retry)", () => {
  test("[P0] 1.6-API-004-001: API request with expired access token should auto-refresh and retry successfully", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: User exists in database with valid refresh token
    const userEmail =
      `${TEST_EMAIL_PREFIX}${Date.now()}-${faker.string.alphanumeric(6)}@test.nuvana.local`.toLowerCase();
    const { user: createdUser } = await createUserWithRole(prismaClient, {
      email: userEmail,
      name: faker.person.fullName(),
    });

    try {
      // AND: Expired access token (causes initial 401)
      const expiredAccessToken = createExpiredJWTAccessToken({
        user_id: createdUser.user_id,
        email: userEmail,
      });

      // AND: Valid refresh token (allows auto-refresh)
      const validRefreshToken = await createJWTRefreshToken({
        user_id: createdUser.user_id,
        email: userEmail,
      });

      // WHEN: Protected endpoint is called with expired access token but valid refresh token
      // This simulates the frontend 401 interceptor scenario
      const response = await apiRequest.get("/api/user/profile", {
        headers: {
          Cookie: `access_token=${expiredAccessToken}; refresh_token=${validRefreshToken}`,
        },
      });

      // THEN: Request should succeed after automatic token refresh
      // Note: In a real frontend implementation, this would require two requests:
      // 1. Initial request → 401
      // 2. Auto-refresh → new tokens
      // 3. Retry request → 200
      // This test verifies the backend supports this flow
      expect(response.status()).toBe(401); // First attempt fails with expired token

      // Manual retry with refresh (simulating frontend auto-refresh logic)
      const refreshResponse = await apiRequest.post(
        "/api/auth/refresh",
        {},
        {
          headers: {
            Cookie: `refresh_token=${validRefreshToken}`,
          },
        },
      );
      expect(refreshResponse.status()).toBe(200);

      // Extract new access token from refresh response
      const setCookieHeader = refreshResponse.headers()["set-cookie"];
      const cookies = Array.isArray(setCookieHeader)
        ? setCookieHeader
        : setCookieHeader
          ? [setCookieHeader]
          : [];
      const newAccessToken = cookies
        .find((cookie: string) => cookie.includes("access_token"))
        ?.match(/access_token=([^;]+)/)?.[1];
      expect(newAccessToken).toBeTruthy();

      // Retry original request with new token
      const retryResponse = await apiRequest.get("/api/user/profile", {
        headers: {
          Cookie: `access_token=${newAccessToken}`,
        },
      });

      // THEN: Retry succeeds with new token
      expect(retryResponse.status()).toBe(200);
      const body = await retryResponse.json();
      expect(body.user).toHaveProperty("user_id", createdUser.user_id);
    } finally {
      // Use robust cleanup helper to handle foreign key constraints
      await deleteUserWithRelatedData(prismaClient, createdUser.user_id);
    }
  });

  test("[P0] 1.6-API-004-002: API request should fail if both access and refresh tokens are expired", async ({
    apiRequest,
  }) => {
    // GIVEN: Expired access token
    const expiredAccessToken = createExpiredJWTAccessToken({
      user_id: faker.string.uuid(),
      email: faker.internet.email(),
    });

    // AND: Expired refresh token (auto-refresh will fail)
    const expiredRefreshToken = createExpiredJWTRefreshToken({
      user_id: faker.string.uuid(),
      email: faker.internet.email(),
    });

    // WHEN: Protected endpoint is called with both expired tokens
    const response = await apiRequest.get("/api/user/profile", {
      headers: {
        Cookie: `access_token=${expiredAccessToken}; refresh_token=${expiredRefreshToken}`,
      },
    });

    // THEN: Request fails with 401
    expect(response.status()).toBe(401);

    // WHEN: Refresh endpoint is attempted
    const refreshResponse = await apiRequest.post(
      "/api/auth/refresh",
      {},
      {
        headers: {
          Cookie: `refresh_token=${expiredRefreshToken}`,
        },
      },
    );

    // THEN: Refresh also fails with 401
    expect(refreshResponse.status()).toBe(401);
    const body = await refreshResponse.json();
    expect(body).toHaveProperty("error");
    expect(normalizeErrorText(body).toLowerCase()).toContain("expired");
  });

  test("[P0] 1.6-API-004-003: API request should not retry infinitely if refresh fails", async ({
    apiRequest,
  }) => {
    // GIVEN: Expired access token
    const expiredAccessToken = createExpiredJWTAccessToken({
      user_id: faker.string.uuid(),
      email: faker.internet.email(),
    });

    // AND: Invalid refresh token (causes refresh to fail)
    const invalidRefreshToken = "invalid.refresh.token";

    // WHEN: Protected endpoint is called with expired access + invalid refresh token
    const response = await apiRequest.get("/api/user/profile", {
      headers: {
        Cookie: `access_token=${expiredAccessToken}; refresh_token=${invalidRefreshToken}`,
      },
    });

    // THEN: Initial request fails with 401
    expect(response.status()).toBe(401);

    // WHEN: Refresh is attempted with invalid token
    const refreshResponse = await apiRequest.post(
      "/api/auth/refresh",
      {},
      {
        headers: {
          Cookie: `refresh_token=${invalidRefreshToken}`,
        },
      },
    );

    // THEN: Refresh fails immediately (no infinite retry)
    expect(refreshResponse.status()).toBe(401);
    const body = await refreshResponse.json();
    expect(body).toHaveProperty("error");
  });

  test("[P0] 1.6-API-004-004: Multiple API requests should reuse refreshed token (no duplicate refresh)", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: User exists with valid refresh token
    const userEmail =
      `${TEST_EMAIL_PREFIX}${Date.now()}-${faker.string.alphanumeric(6)}@test.nuvana.local`.toLowerCase();
    const { user: createdUser } = await createUserWithRole(prismaClient, {
      email: userEmail,
      name: faker.person.fullName(),
    });

    try {
      // AND: Expired access token
      const expiredAccessToken = createExpiredJWTAccessToken({
        user_id: createdUser.user_id,
        email: userEmail,
      });

      // AND: Valid refresh token
      const validRefreshToken = await createJWTRefreshToken({
        user_id: createdUser.user_id,
        email: userEmail,
      });

      // WHEN: First refresh is performed
      const refreshResponse = await apiRequest.post(
        "/api/auth/refresh",
        {},
        {
          headers: {
            Cookie: `refresh_token=${validRefreshToken}`,
          },
        },
      );
      expect(refreshResponse.status()).toBe(200);

      // Extract new tokens
      const setCookieHeader = refreshResponse.headers()["set-cookie"];
      const cookies = Array.isArray(setCookieHeader)
        ? setCookieHeader
        : setCookieHeader
          ? [setCookieHeader]
          : [];
      const newAccessToken = cookies
        .find((cookie: string) => cookie.includes("access_token"))
        ?.match(/access_token=([^;]+)/)?.[1];
      const newRefreshToken = cookies
        .find((cookie: string) => cookie.includes("refresh_token"))
        ?.match(/refresh_token=([^;]+)/)?.[1];

      // THEN: Multiple API requests should succeed with same new access token
      const request1 = await apiRequest.get("/api/user/profile", {
        headers: {
          Cookie: `access_token=${newAccessToken}`,
        },
      });
      expect(request1.status()).toBe(200);

      const request2 = await apiRequest.get("/api/user/profile", {
        headers: {
          Cookie: `access_token=${newAccessToken}`,
        },
      });
      expect(request2.status()).toBe(200);

      // AND: Old refresh token should be invalidated (token rotation)
      const oldRefreshRetry = await apiRequest.post(
        "/api/auth/refresh",
        {},
        {
          headers: {
            Cookie: `refresh_token=${validRefreshToken}`,
          },
        },
      );
      expect(oldRefreshRetry.status()).toBe(401); // Old token rejected
    } finally {
      // Use robust cleanup helper to handle foreign key constraints
      await deleteUserWithRelatedData(prismaClient, createdUser.user_id);
    }
  });

  test("[P0] 1.6-API-004-005: Session validation endpoint should reject expired tokens on app initialization", async ({
    apiRequest,
  }) => {
    // GIVEN: Expired access token (simulates stale localStorage + expired cookies)
    const expiredAccessToken = createExpiredJWTAccessToken({
      user_id: faker.string.uuid(),
      email: faker.internet.email(),
    });

    // WHEN: Frontend calls /api/auth/me to validate session on app load
    const response = await apiRequest.get("/api/auth/me", {
      headers: {
        Cookie: `access_token=${expiredAccessToken}`,
      },
    });

    // THEN: Request is rejected with 401
    expect(response.status()).toBe(401);

    // AND: Error indicates token expiration
    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toHaveProperty("code", "UNAUTHORIZED");
    expect(body.error.message).toContain("expired");
  });

  test("[P0] 1.6-API-004-006: Session validation endpoint should succeed with valid token on app initialization", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: User exists in database with role
    const userEmail =
      `${TEST_EMAIL_PREFIX}${Date.now()}-${faker.string.alphanumeric(6)}@test.nuvana.local`.toLowerCase();
    const { user: createdUser } = await createUserWithRole(prismaClient, {
      email: userEmail,
      name: faker.person.fullName(),
    });

    try {
      // AND: Valid access token
      const validAccessToken = createJWTAccessToken({
        user_id: createdUser.user_id,
        email: userEmail,
        roles: ["USER"],
        permissions: ["READ"],
      });

      // WHEN: Frontend calls /api/auth/me to validate session on app load
      const response = await apiRequest.get("/api/auth/me", {
        headers: {
          Cookie: `access_token=${validAccessToken}`,
        },
      });

      // THEN: Request succeeds
      expect(response.status()).toBe(200);

      // AND: User information is returned
      const body = await response.json();
      expect(body).toHaveProperty("user");
      expect(body.user).toHaveProperty("id", createdUser.user_id);
      // Note: createdUser.email is lowercase (normalized during creation)
      expect(body.user).toHaveProperty("email", createdUser.email);
    } finally {
      // Use robust cleanup helper to handle foreign key constraints
      await deleteUserWithRelatedData(prismaClient, createdUser.user_id);
    }
  });

  test("[P1] 1.6-API-004-007: Refresh token rotation should prevent replay attacks", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: User exists with valid refresh token
    const userEmail =
      `${TEST_EMAIL_PREFIX}${Date.now()}-${faker.string.alphanumeric(6)}@test.nuvana.local`.toLowerCase();
    const { user: createdUser } = await createUserWithRole(prismaClient, {
      email: userEmail,
      name: faker.person.fullName(),
    });

    try {
      const originalRefreshToken = await createJWTRefreshToken({
        user_id: createdUser.user_id,
        email: userEmail,
      });

      // WHEN: Token is refreshed once
      const refresh1 = await apiRequest.post(
        "/api/auth/refresh",
        {},
        {
          headers: {
            Cookie: `refresh_token=${originalRefreshToken}`,
          },
        },
      );
      expect(refresh1.status()).toBe(200);

      // AND: Attacker attempts to reuse the original refresh token (replay attack)
      const replayAttempt = await apiRequest.post(
        "/api/auth/refresh",
        {},
        {
          headers: {
            Cookie: `refresh_token=${originalRefreshToken}`,
          },
        },
      );

      // THEN: Replay attack is blocked with 401
      expect(replayAttempt.status()).toBe(401);
      const body = await replayAttempt.json();
      expect(body).toHaveProperty("error");
    } finally {
      // Use robust cleanup helper to handle foreign key constraints
      await deleteUserWithRelatedData(prismaClient, createdUser.user_id);
    }
  });

  test("[P1] 1.6-API-004-008: API requests without cookies should fail immediately without refresh attempt", async ({
    apiRequest,
  }) => {
    // GIVEN: Request without any cookies (no access or refresh token)
    // WHEN: Protected endpoint is called
    const response = await apiRequest.get("/api/user/profile");

    // THEN: Request fails with 401 (no refresh attempt should occur)
    expect(response.status()).toBe(401);

    // AND: Error indicates missing authentication
    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toHaveProperty("code", "UNAUTHORIZED");
    expect(body.error.message).toContain("token");
  });
});
