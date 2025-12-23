import { config } from "dotenv";
// Load environment variables from .env.local as defaults
// IMPORTANT: Do NOT use override: true here - the test script's DATABASE_URL
// (e.g., nuvana_test) must take precedence over .env.local's DATABASE_URL
// (e.g., nuvana_dev). Using override would cause fixtures to write to nuvana_dev
// while the backend reads from nuvana_test, causing 401 errors.
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { assertDatabaseSafeForTests } from "./config/database-protection";

// =============================================================================
// DATABASE PROTECTION - Uses centralized config
// =============================================================================
// Validation logic is centralized in ./config/database-protection.ts
// This ensures consistency across Vitest, Playwright, and all test infrastructure.
// =============================================================================

assertDatabaseSafeForTests();

/**
 * Create a Prisma client that bypasses RLS (Row-Level Security) for test cleanup
 *
 * This client uses the database connection in a way that disables RLS policies,
 * allowing test fixtures to clean up data without being restricted by tenant isolation.
 *
 * **IMPORTANT**: This should ONLY be used in test cleanup contexts, never in production code!
 *
 * @returns PrismaClient instance that bypasses RLS policies
 */
export function createBypassPrismaClient(): PrismaClient {
  // Create a new Prisma client without RLS context
  // By not using the RLS middleware, this client can access all data
  return new PrismaClient({
    log: process.env.DEBUG_PRISMA ? ["query", "error", "warn"] : ["error"],
  });
}

/**
 * Execute cleanup operations with RLS bypass
 *
 * This helper function creates a bypass client, executes the cleanup callback,
 * and ensures the client is properly disconnected afterwards.
 *
 * @param cleanupFn - Async function that performs cleanup operations
 * @returns Result of the cleanup function
 *
 * @example
 * ```typescript
 * await withBypassClient(async (bypassClient) => {
 *   await bypassClient.shift.deleteMany({ where: { cashier_id: userId } });
 *   await bypassClient.user.delete({ where: { user_id: userId } });
 * });
 * ```
 */
export async function withBypassClient<T>(
  cleanupFn: (client: PrismaClient) => Promise<T>,
): Promise<T> {
  const bypassClient = createBypassPrismaClient();
  try {
    const result = await cleanupFn(bypassClient);
    return result;
  } catch (error) {
    // Log errors for debugging - these should NOT be silently swallowed
    console.error("[withBypassClient] Error during bypass operation:", error);
    throw error; // Re-throw to surface the issue
  } finally {
    await bypassClient.$disconnect();
  }
}
