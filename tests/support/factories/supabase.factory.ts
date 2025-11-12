/**
 * Supabase Test Data Factories
 *
 * Pure functions for generating test data related to Supabase OAuth:
 * - Supabase tokens (JWT format)
 * - OAuth callback data
 * Uses faker for dynamic values to prevent collisions in parallel tests.
 */

import { faker } from "@faker-js/faker";

export type SupabaseTokenData = {
  email: string;
  name: string;
  sub: string; // Supabase user ID
  exp?: number; // Expiration timestamp (Unix seconds)
  iat?: number; // Issued at timestamp (Unix seconds)
};

/**
 * Creates a mock Supabase JWT token payload
 * Note: This is a simplified representation for testing.
 * In real implementation, tokens would be actual JWTs from Supabase.
 */
export const createSupabaseToken = (
  overrides: Partial<SupabaseTokenData> = {},
): string => {
  const now = Math.floor(Date.now() / 1000);
  const tokenData: SupabaseTokenData = {
    email: faker.internet.email(),
    name: faker.person.fullName(),
    sub: faker.string.uuid(),
    exp: now + 3600, // Expires in 1 hour
    iat: now,
    ...overrides,
  };

  // Return token string (in real implementation, this would be a JWT)
  // For testing purposes, we'll use a simple format that the backend can parse
  return JSON.stringify(tokenData);
};

/**
 * Creates OAuth callback query parameters
 */
export const createOAuthCallbackParams = (
  overrides: {
    code?: string;
    state?: string;
    error?: string;
  } = {},
) => {
  return {
    code: overrides.code || faker.string.alphanumeric(32),
    state: overrides.state || faker.string.alphanumeric(16),
    error: overrides.error,
  };
};

/**
 * Creates a Supabase user identity object (as returned from Supabase Auth)
 */
export const createSupabaseUserIdentity = (
  overrides: Partial<SupabaseTokenData> = {},
) => {
  return {
    email: overrides.email || faker.internet.email(),
    name: overrides.name || faker.person.fullName(),
    sub: overrides.sub || faker.string.uuid(),
  };
};
