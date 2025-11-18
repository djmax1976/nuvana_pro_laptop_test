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

        if (userId) {
          // Set session variable for RLS policies
          // Use $executeRawUnsafe to set session variable on the connection
          await this.$executeRawUnsafe(
            `SET LOCAL app.current_user_id = '${userId}'`,
          );
        } else {
          // Clear session variable if no user context
          await this.$executeRawUnsafe(`SET LOCAL app.current_user_id = NULL`);
        }

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
