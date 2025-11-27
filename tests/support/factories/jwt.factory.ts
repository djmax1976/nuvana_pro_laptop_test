/**
 * JWT Test Data Factories
 *
 * Pure functions for generating test data related to JWT tokens:
 * - JWT access tokens (15 min expiry)
 * - JWT refresh tokens (7 days expiry)
 * - JWT token payloads with user claims
 * Uses faker for dynamic values to prevent collisions in parallel tests.
 *
 * Generates REAL signed JWT tokens using jsonwebtoken library.
 * Tokens are signed with JWT_SECRET from environment or test default.
 */

import { faker } from "@faker-js/faker";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { createClient, RedisClientType } from "redis";

export type JWTTokenPayload = {
  user_id: string;
  email: string;
  roles?: string[];
  permissions?: string[];
  exp?: number; // Expiration timestamp (Unix seconds)
  iat?: number; // Issued at timestamp (Unix seconds)
  type?: "access" | "refresh"; // Token type
};

/**
 * Creates a JWT access token payload (15 minute expiry)
 * Defaults to standard user role with READ permission.
 * Note: exp and iat are omitted - jwt.sign() will add them based on options
 */
export const createJWTAccessTokenPayload = (
  overrides: Partial<JWTTokenPayload> = {},
): JWTTokenPayload => ({
  user_id: faker.string.uuid(),
  email: faker.internet.email(),
  roles: ["USER"],
  permissions: ["READ"],
  type: "access",
  ...overrides,
});

/**
 * Creates a JWT refresh token payload (7 days expiry)
 * Refresh tokens typically don't include roles/permissions.
 * Note: exp and iat are omitted - jwt.sign() will add them based on options
 */
export const createJWTRefreshTokenPayload = (
  overrides: Partial<JWTTokenPayload> = {},
): JWTTokenPayload => {
  return {
    user_id: faker.string.uuid(),
    email: faker.internet.email(),
    type: "refresh",
    ...overrides,
  };
};

/**
 * Creates a real signed JWT access token (for testing purposes)
 * Returns a properly signed JWT that the backend auth middleware can verify.
 */
export const createJWTAccessToken = (
  overrides: Partial<JWTTokenPayload> = {},
): string => {
  const payload = createJWTAccessTokenPayload(overrides);
  const secret =
    process.env.JWT_SECRET || "test-secret-key-change-in-production";

  return jwt.sign(payload, secret, {
    expiresIn: "15m",
    issuer: "nuvana-backend",
    audience: "nuvana-api",
  });
};

// Lazy-loaded Redis client for test factories (avoids importing backend code)
let testRedisClient: RedisClientType | null = null;

async function getTestRedisClient(): Promise<RedisClientType | null> {
  if (testRedisClient && testRedisClient.isOpen) {
    return testRedisClient;
  }

  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

  try {
    testRedisClient = createClient({ url: redisUrl });
    testRedisClient.on("error", () => {
      // Silently ignore Redis errors in tests
    });
    await testRedisClient.connect();
    return testRedisClient;
  } catch {
    // Redis unavailable - graceful degradation
    testRedisClient = null;
    return null;
  }
}

/**
 * Creates a real signed JWT refresh token with JTI for Redis tracking
 * NOW ASYNC: Returns Promise<string> because it stores JTI in Redis
 * @param overrides - Optional payload overrides
 * @returns Promise resolving to signed JWT refresh token
 */
export const createJWTRefreshToken = async (
  overrides: Partial<JWTTokenPayload> = {},
): Promise<string> => {
  // Generate JTI for token tracking (matches production behavior)
  const jti = randomUUID();

  const payload = {
    ...createJWTRefreshTokenPayload(overrides),
    jti, // Add JTI to payload
  };

  const secret =
    process.env.JWT_REFRESH_SECRET ||
    "test-refresh-secret-key-change-in-production";

  const token = jwt.sign(payload, secret, {
    expiresIn: "7d",
    issuer: "nuvana-backend",
    audience: "nuvana-api",
  });

  // Store JTI in Redis for validation (matches production behavior)
  // This allows token rotation tests to work correctly
  try {
    const redis = await getTestRedisClient();
    if (redis && payload.user_id) {
      await redis.setEx(
        `refresh_token:${jti}`,
        7 * 24 * 60 * 60,
        payload.user_id,
      );
    }
  } catch (error) {
    console.warn("Failed to store test refresh token in Redis:", error);
    // Continue anyway - token will still work but rotation won't be testable
  }

  return token;
};

/**
 * Creates expired JWT access token (for testing error handling)
 * Useful for testing token expiration scenarios.
 */
export const createExpiredJWTAccessToken = (
  overrides: Partial<JWTTokenPayload> = {},
): string => {
  const payload = createJWTAccessTokenPayload(overrides);
  const secret =
    process.env.JWT_SECRET || "test-secret-key-change-in-production";

  // Sign with negative expiry to create already-expired token
  return jwt.sign(payload, secret, {
    expiresIn: "-1h", // Already expired
    issuer: "nuvana-backend",
    audience: "nuvana-api",
  });
};

/**
 * Creates expired JWT refresh token (for testing error handling)
 * Includes JTI but doesn't store in Redis (token is already expired)
 */
export const createExpiredJWTRefreshToken = (
  overrides: Partial<JWTTokenPayload> = {},
): string => {
  // Generate JTI for consistency (but don't store in Redis since token is expired)
  const jti = randomUUID();

  const payload = {
    ...createJWTRefreshTokenPayload(overrides),
    jti, // Add JTI to payload
  };

  const secret =
    process.env.JWT_REFRESH_SECRET ||
    "test-refresh-secret-key-change-in-production";

  // Sign with negative expiry to create already-expired token
  return jwt.sign(payload, secret, {
    expiresIn: "-1h", // Already expired
    issuer: "nuvana-backend",
    audience: "nuvana-api",
  });
};

/**
 * Creates JWT access token with admin role and full permissions
 * Convenience factory for admin user scenarios.
 */
export const createAdminJWTAccessToken = (
  overrides: Partial<JWTTokenPayload> = {},
): string => {
  return createJWTAccessToken({
    roles: ["ADMIN"],
    permissions: ["READ", "WRITE", "DELETE", "ADMIN"],
    ...overrides,
  });
};

/**
 * Creates JWT access token with multiple roles
 * Useful for testing role-based access control.
 */
export const createMultiRoleJWTAccessToken = (
  roles: string[],
  permissions: string[],
  overrides: Partial<JWTTokenPayload> = {},
): string => {
  return createJWTAccessToken({
    roles,
    permissions,
    ...overrides,
  });
};

/**
 * Payload type for malformed tokens - allows missing required claims
 * Used exclusively for security testing scenarios (testing 401 responses)
 */
export type MalformedJWTPayload = {
  user_id?: string;
  email?: string;
  roles?: string[];
  permissions?: string[];
  type?: "access" | "refresh";
  [key: string]: unknown; // Allow arbitrary claims for edge case testing
};

/**
 * Creates a JWT token with intentionally missing or malformed claims
 *
 * SECURITY TESTING ONLY: Use this factory to test authentication
 * middleware's handling of invalid tokens.
 *
 * @param payload - Partial payload with only the claims you want to include
 * @returns Signed JWT token with missing required claims
 *
 * @example
 * // Token without user_id
 * const token = createMalformedJWTAccessToken({ email: 'test@example.com' });
 *
 * @example
 * // Token without email
 * const token = createMalformedJWTAccessToken({ user_id: 'some-id' });
 *
 * @example
 * // Token with neither required claim
 * const token = createMalformedJWTAccessToken({ roles: ['USER'] });
 */
export const createMalformedJWTAccessToken = (
  payload: MalformedJWTPayload = {},
): string => {
  const secret =
    process.env.JWT_SECRET || "test-secret-key-change-in-production";

  // Sign the payload directly without adding defaults
  // This creates a valid JWT signature but with missing claims
  return jwt.sign({ type: "access", ...payload }, secret, {
    expiresIn: "15m",
    issuer: "nuvana-backend",
    audience: "nuvana-api",
  });
};
