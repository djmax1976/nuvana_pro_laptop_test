import { PrismaClient } from "@prisma/client";
import { AsyncLocalStorage } from "async_hooks";

/**
 * AsyncLocalStorage for RLS context
 * Stores user ID per request/async context
 */
const rlsContext = new AsyncLocalStorage<string | null>();

/**
 * Create RLS-aware Prisma Client using modern client extensions
 * Automatically sets app.current_user_id session variable before queries
 *
 * Uses Prisma Client Extensions (query component) instead of deprecated $use middleware
 */
function createRLSPrismaClient() {
  const baseClient = new PrismaClient();

  // Extend client with RLS middleware using query extensions
  const extendedClient = baseClient.$extends({
    name: "rls-middleware",
    query: {
      async $allOperations({ args, query }) {
        const userId = rlsContext.getStore();

        // Only set RLS context if userId is provided
        // Use SET instead of SET LOCAL because SET LOCAL only works in transactions
        // SET sets the variable for the current session (connection)
        // We clear it after the query to prevent leakage between requests
        if (userId) {
          let variableSet = false;
          try {
            // Set session variable for RLS policies
            // Use parameterized query to prevent SQL injection
            try {
              await baseClient.$executeRaw`SET app.current_user_id = ${userId}`;
              variableSet = true;
            } catch (setError: any) {
              // If SET fails, log but continue - RLS policies will use NULL/default
              console.warn(
                `Failed to set RLS context: ${setError?.message || setError}`,
              );
            }
            // Execute the query
            const result = await query(args);
            // Clear the session variable after query completes (if it was set)
            if (variableSet) {
              try {
                await baseClient.$executeRaw`RESET app.current_user_id`;
              } catch (resetError) {
                // Ignore reset errors - variable will be cleared when connection is reused
                console.warn(
                  `Failed to reset RLS context: ${resetError instanceof Error ? resetError.message : resetError}`,
                );
              }
            }
            return result;
          } catch (error) {
            // Ensure we clear the variable even if query fails
            if (variableSet) {
              try {
                await baseClient.$executeRaw`RESET app.current_user_id`;
              } catch (resetError) {
                // Ignore reset errors
              }
            }
            throw error;
          }
        }

        // No RLS context needed - execute query normally
        return query(args);
      },
    },
  });

  return extendedClient;
}

// Export singleton instance
export const prisma = createRLSPrismaClient();

/**
 * Run a function with RLS context
 * Sets user ID in AsyncLocalStorage for the duration of the function
 * @param userId - User ID from authenticated request
 * @param fn - Function to execute with RLS context
 * @returns Result of function
 * @example
 * ```typescript
 * const user = (request as any).user as UserIdentity;
 * const companies = await withRLSContext(user.id, async () => {
 *   return await prisma.company.findMany();
 * });
 * ```
 */
export async function withRLSContext<T>(
  userId: string | null,
  fn: () => Promise<T>,
): Promise<T> {
  return rlsContext.run(userId, fn);
}

/**
 * Get current RLS context user ID
 * @returns Current user ID or null
 */
export function getRLSContext(): string | null {
  return rlsContext.getStore() ?? null;
}
