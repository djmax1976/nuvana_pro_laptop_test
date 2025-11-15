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
): JWTTokenPayload => {
  return {
    user_id: faker.string.uuid(),
    email: faker.internet.email(),
    roles: ["USER"],
    permissions: ["READ"],
    type: "access",
    ...overrides,
  };
};

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

/**
 * Creates a real signed JWT refresh token
 */
export const createJWTRefreshToken = (
  overrides: Partial<JWTTokenPayload> = {},
): string => {
  const payload = createJWTRefreshTokenPayload(overrides);
  const secret =
    process.env.JWT_REFRESH_SECRET ||
    "test-refresh-secret-key-change-in-production";

  return jwt.sign(payload, secret, {
    expiresIn: "7d",
    issuer: "nuvana-backend",
    audience: "nuvana-api",
  });
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
 */
export const createExpiredJWTRefreshToken = (
  overrides: Partial<JWTTokenPayload> = {},
): string => {
  const payload = createJWTRefreshTokenPayload(overrides);
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
