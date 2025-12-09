import { PrismaClient, Prisma } from "@prisma/client";
import { AsyncLocalStorage } from "async_hooks";

/**
 * AsyncLocalStorage for RLS context
 * Stores user ID per request/async context
 */
const rlsContext = new AsyncLocalStorage<string | null>();

/**
 * Global type augmentation for PrismaClient singleton
 */
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

/**
 * Standard Prisma client singleton
 *
 * In development, the PrismaClient instance is cached on the global object
 * to prevent connection exhaustion during hot reloads. In production, a new
 * instance is created per process.
 *
 * RLS enforcement is handled via:
 * 1. PostgreSQL RLS policies that check app.current_user_id session variable
 * 2. withRLSTransaction() helper for operations that need RLS enforcement
 * 3. Service-layer access control as a defense-in-depth measure
 *
 * NOTE: Simple Prisma queries do NOT automatically enforce RLS because
 * Prisma's connection pooling makes session variables unreliable.
 * For RLS-critical operations, use withRLSTransaction() explicitly.
 */
export const prisma =
  global.__prisma ??
  (global.__prisma = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  }));

// In non-production, ensure the instance is cached on global
if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}

/**
 * UUID validation regex (RFC 4122)
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate UUID format to prevent SQL injection
 * @param userId - User ID to validate
 * @returns true if valid UUID, false otherwise
 * @exported for testing SQL injection prevention
 */
export function isValidUUID(userId: string): boolean {
  return UUID_REGEX.test(userId);
}

/**
 * Run a function with RLS context
 * Sets user ID in AsyncLocalStorage for the duration of the function
 * Validates user ID format to prevent SQL injection
 * @param userId - User ID from authenticated request (must be valid UUID)
 * @param fn - Function to execute with RLS context
 * @returns Result of function
 * @throws Error if userId is not a valid UUID format
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
  // Validate UUID format if userId is provided
  if (userId !== null && !isValidUUID(userId)) {
    throw new Error(
      `Invalid user ID format for RLS context: ${userId}. Expected valid UUID.`,
    );
  }
  return rlsContext.run(userId, fn);
}

/**
 * Get current RLS context user ID
 * @returns Current user ID or null
 */
export function getRLSContext(): string | null {
  return rlsContext.getStore() ?? null;
}

/**
 * Execute a function within an RLS-enforced transaction
 * This guarantees that SET LOCAL and all database operations run on the same connection
 *
 * Use this for operations that MUST enforce RLS (e.g., checking data access, updates)
 *
 * @param userId - User ID to set as RLS context (must be valid UUID)
 * @param fn - Function receiving the transaction client to execute operations
 * @returns Result of the function
 *
 * @example
 * ```typescript
 * const shift = await withRLSTransaction(userId, async (tx) => {
 *   return await tx.shift.findUnique({ where: { shift_id: shiftId } });
 * });
 * ```
 */
export async function withRLSTransaction<T>(
  userId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  // Validate UUID format
  if (!isValidUUID(userId)) {
    throw new Error(
      `Invalid user ID format for RLS transaction: ${userId}. Expected valid UUID.`,
    );
  }

  // Use interactive transaction to ensure SET LOCAL and operations share the same connection
  return prisma.$transaction(
    async (tx) => {
      // Set RLS context using SET LOCAL (scoped to this transaction)
      // Note: UUID is validated above. Using Prisma.sql with Prisma.raw for the validated value
      // because SET LOCAL requires a literal value, not a parameter placeholder.
      await tx.$executeRaw(
        Prisma.sql`SET LOCAL app.current_user_id = ${Prisma.raw(`'${userId}'`)}`,
      );

      // Execute the function with the transaction client
      return fn(tx);
    },
    {
      timeout: 60000, // 60 second timeout
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    },
  );
}
