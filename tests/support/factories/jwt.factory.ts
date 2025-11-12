/**
 * JWT Test Data Factories
 *
 * Pure functions for generating test data related to JWT tokens:
 * - JWT access tokens (15 min expiry)
 * - JWT refresh tokens (7 days expiry)
 * - JWT token payloads with user claims
 * Uses faker for dynamic values to prevent collisions in parallel tests.
 *
 * Note: These factories generate simplified token representations for testing.
 * In production, tokens are actual JWTs signed with JWT_SECRET. The backend
 * middleware should handle both formats during testing.
 */

import { faker } from "@faker-js/faker";

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
 */
export const createJWTAccessTokenPayload = (
  overrides: Partial<JWTTokenPayload> = {},
): JWTTokenPayload => {
  const now = Math.floor(Date.now() / 1000);
  return {
    user_id: faker.string.uuid(),
    email: faker.internet.email(),
    roles: ["USER"],
    permissions: ["READ"],
    exp: now + 15 * 60, // Expires in 15 minutes
    iat: now,
    type: "access",
    ...overrides,
  };
};

/**
 * Creates a JWT refresh token payload (7 days expiry)
 * Refresh tokens typically don't include roles/permissions.
 */
export const createJWTRefreshTokenPayload = (
  overrides: Partial<JWTTokenPayload> = {},
): JWTTokenPayload => {
  const now = Math.floor(Date.now() / 1000);
  return {
    user_id: faker.string.uuid(),
    email: faker.internet.email(),
    exp: now + 7 * 24 * 60 * 60, // Expires in 7 days
    iat: now,
    type: "refresh",
    ...overrides,
  };
};

/**
 * Creates a mock JWT access token string (for testing purposes)
 * Returns a JSON-serialized payload that the backend can parse.
 * In production, this would be a properly signed JWT (header.payload.signature).
 */
export const createJWTAccessToken = (
  overrides: Partial<JWTTokenPayload> = {},
): string => {
  const payload = createJWTAccessTokenPayload(overrides);
  // Return token string (in real implementation, this would be a signed JWT)
  // Format: base64(header).base64(payload).signature
  // For testing, we'll use a simple format that the backend can parse
  return JSON.stringify(payload);
};

/**
 * Creates a mock JWT refresh token string
 */
export const createJWTRefreshToken = (
  overrides: Partial<JWTTokenPayload> = {},
): string => {
  const payload = createJWTRefreshTokenPayload(overrides);
  return JSON.stringify(payload);
};

/**
 * Creates expired JWT access token (for testing error handling)
 * Useful for testing token expiration scenarios.
 */
export const createExpiredJWTAccessToken = (
  overrides: Partial<JWTTokenPayload> = {},
): string => {
  const now = Math.floor(Date.now() / 1000);
  const payload = createJWTAccessTokenPayload({
    exp: now - 3600, // Expired 1 hour ago
    ...overrides,
  });
  return JSON.stringify(payload);
};

/**
 * Creates expired JWT refresh token (for testing error handling)
 */
export const createExpiredJWTRefreshToken = (
  overrides: Partial<JWTTokenPayload> = {},
): string => {
  const now = Math.floor(Date.now() / 1000);
  const payload = createJWTRefreshTokenPayload({
    exp: now - 3600, // Expired 1 hour ago
    ...overrides,
  });
  return JSON.stringify(payload);
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
