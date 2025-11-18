import { PrismaClient } from "@prisma/client";
import { AsyncLocalStorage } from "async_hooks";

/**
 * AsyncLocalStorage for RLS context
 * Stores user ID per request/async context
 */
const rlsContext = new AsyncLocalStorage<string | null>();

/**
 * RLS-aware Prisma Client
 * Automatically sets app.current_user_id session variable before queries using middleware
 */
class RLSPrismaClient extends PrismaClient {
  constructor() {
    super();

    // Add middleware to set RLS context before each query
    // Using type assertion because $use is not properly typed in extended classes
    (this as any).$use(
      async (params: any, next: (params: any) => Promise<any>) => {
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
              await this.$executeRaw`SET app.current_user_id = ${userId}`;
              variableSet = true;
            } catch (setError: any) {
              // If SET fails, log but continue - RLS policies will use NULL/default
              console.warn(
                `Failed to set RLS context: ${setError?.message || setError}`,
              );
            }
            // Execute the query
            const result = await next(params);
            // Clear the session variable after query completes (if it was set)
            if (variableSet) {
              try {
                await this.$executeRaw`RESET app.current_user_id`;
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
                await this.$executeRaw`RESET app.current_user_id`;
              } catch (resetError) {
                // Ignore reset errors
              }
            }
            throw error;
          }
        }

        // No RLS context needed - execute query normally
        return next(params);
      },
    );
  }
}

// Export singleton instance
export const prisma = new RLSPrismaClient();

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
