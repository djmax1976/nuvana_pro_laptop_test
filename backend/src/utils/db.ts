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
 * Connection pool configuration values (for logging/debugging)
 */
interface PoolConfig {
  connectionLimit: number;
  poolTimeout: number;
  connectTimeout: number;
}

let _poolConfig: PoolConfig | null = null;

/**
 * Get the current connection pool configuration
 * Useful for debugging and health checks
 */
export function getPoolConfig(): PoolConfig {
  if (!_poolConfig) {
    const defaultConnectionLimit =
      process.env.NODE_ENV === "production" ? 20 : 10;
    _poolConfig = {
      connectionLimit: parseInt(
        process.env.DB_CONNECTION_LIMIT || String(defaultConnectionLimit),
        10,
      ),
      poolTimeout: parseInt(process.env.DB_POOL_TIMEOUT || "30", 10),
      connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT || "10", 10),
    };
  }
  return _poolConfig;
}

/**
 * Connection pool configuration from environment variables
 * These can be set differently per deployment (Railway, AWS, local)
 *
 * Environment variables:
 *   DB_CONNECTION_LIMIT - Max concurrent connections (default: 10 dev, 20 prod)
 *   DB_POOL_TIMEOUT     - Seconds to wait for connection (default: 30)
 *   DB_CONNECT_TIMEOUT  - TCP connection timeout seconds (default: 10)
 */
function buildDatabaseUrl(): string {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  // Parse existing URL to check for existing params
  const url = new URL(baseUrl);
  const existingParams = url.searchParams;

  // Get pool config (also caches it for getPoolConfig())
  const config = getPoolConfig();

  // Only add pool params if not already specified in DATABASE_URL
  // This allows DATABASE_URL to override defaults if needed
  if (!existingParams.has("connection_limit")) {
    url.searchParams.set("connection_limit", String(config.connectionLimit));
  }

  if (!existingParams.has("pool_timeout")) {
    url.searchParams.set("pool_timeout", String(config.poolTimeout));
  }

  if (!existingParams.has("connect_timeout")) {
    url.searchParams.set("connect_timeout", String(config.connectTimeout));
  }

  // Log pool configuration at startup (only once)
  const finalConfig = {
    connectionLimit:
      existingParams.get("connection_limit") || String(config.connectionLimit),
    poolTimeout:
      existingParams.get("pool_timeout") || String(config.poolTimeout),
    connectTimeout:
      existingParams.get("connect_timeout") || String(config.connectTimeout),
  };
  console.log(
    `[Prisma] Connection pool configured: connection_limit=${finalConfig.connectionLimit}, pool_timeout=${finalConfig.poolTimeout}s, connect_timeout=${finalConfig.connectTimeout}s`,
  );

  return url.toString();
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
 *
 * CONNECTION POOL CONFIGURATION:
 * Pool settings are automatically applied based on environment:
 *   - Development: connection_limit=10 (lower for local resources)
 *   - Production: connection_limit=20 (higher for concurrent requests)
 *
 * Override via environment variables:
 *   DB_CONNECTION_LIMIT=20  - Max concurrent connections
 *   DB_POOL_TIMEOUT=30      - Seconds to wait for available connection
 *   DB_CONNECT_TIMEOUT=10   - Seconds for TCP connection establishment
 *
 * Or include directly in DATABASE_URL:
 *   ?connection_limit=20&pool_timeout=30&connect_timeout=10
 */
export const prisma =
  global.__prisma ??
  (global.__prisma = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasources: {
      db: {
        url: buildDatabaseUrl(),
      },
    },
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
 * RLS context for database transactions
 * Contains user identity and permissions information for RLS enforcement
 */
export interface RLSContext {
  userId: string;
  isAdmin?: boolean;
  companyIds?: string[];
  storeIds?: string[];
}

/**
 * Options for RLS transaction execution
 */
export interface RLSTransactionOptions {
  /** Transaction timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Transaction isolation level (default: ReadCommitted) */
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

/**
 * Preset timeout values for common operation types
 */
export const TRANSACTION_TIMEOUTS = {
  /** Fast operations: permission checks, simple lookups (10s) */
  FAST: 10000,
  /** Standard CRUD operations (30s) */
  STANDARD: 30000,
  /** Bulk operations: imports, migrations, reports (120s) */
  BULK: 120000,
} as const;

/**
 * Execute a function within an RLS-enforced transaction
 * This guarantees that SET LOCAL and all database operations run on the same connection
 *
 * Use this for operations that MUST enforce RLS (e.g., checking data access, updates)
 *
 * @param context - User ID string (legacy) or RLSContext object with user permissions
 * @param fn - Function receiving the transaction client to execute operations
 * @param options - Optional transaction settings (timeout, isolation level)
 * @returns Result of the function
 *
 * @example
 * ```typescript
 * // Legacy usage (still supported)
 * const shift = await withRLSTransaction(userId, async (tx) => {
 *   return await tx.shift.findUnique({ where: { shift_id: shiftId } });
 * });
 *
 * // New usage with full context
 * const result = await withRLSTransaction({
 *   userId: user.id,
 *   isAdmin: user.is_admin,
 *   companyIds: user.company_ids,
 *   storeIds: user.store_ids
 * }, async (tx) => {
 *   return await tx.company.findMany();
 * });
 *
 * // With custom timeout for fast operations
 * const roles = await withRLSTransaction(userId, async (tx) => {
 *   return await tx.userRole.findMany({ where: { user_id: userId } });
 * }, { timeout: TRANSACTION_TIMEOUTS.FAST });
 * ```
 */
export async function withRLSTransaction<T>(
  context: string | RLSContext,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: RLSTransactionOptions,
): Promise<T> {
  // Normalize context to RLSContext object
  const ctx: RLSContext =
    typeof context === "string" ? { userId: context } : context;

  // Validate UUID format
  if (!isValidUUID(ctx.userId)) {
    throw new Error(
      `Invalid user ID format for RLS transaction: ${ctx.userId}. Expected valid UUID.`,
    );
  }

  // Use interactive transaction to ensure SET LOCAL and operations share the same connection
  return prisma.$transaction(
    async (tx) => {
      // Set user ID (required)
      // Note: UUID is validated above. Using Prisma.sql with Prisma.raw for the validated value
      // because SET LOCAL requires a literal value, not a parameter placeholder.
      await tx.$executeRaw(
        Prisma.sql`SET LOCAL app.current_user_id = ${Prisma.raw(`'${ctx.userId}'`)}`,
      );

      // Set admin flag if provided
      if (ctx.isAdmin !== undefined) {
        await tx.$executeRaw(
          Prisma.sql`SET LOCAL app.is_admin = ${Prisma.raw(`'${ctx.isAdmin ? "true" : "false"}'`)}`,
        );
      }

      // Set company IDs if provided
      if (ctx.companyIds && ctx.companyIds.length > 0) {
        const companyIdsStr = ctx.companyIds.join(",");
        await tx.$executeRaw(
          Prisma.sql`SET LOCAL app.company_ids = ${Prisma.raw(`'${companyIdsStr}'`)}`,
        );
      }

      // Set store IDs if provided
      if (ctx.storeIds && ctx.storeIds.length > 0) {
        const storeIdsStr = ctx.storeIds.join(",");
        await tx.$executeRaw(
          Prisma.sql`SET LOCAL app.store_ids = ${Prisma.raw(`'${storeIdsStr}'`)}`,
        );
      }

      // Execute the function with the transaction client
      return fn(tx);
    },
    {
      timeout: options?.timeout ?? TRANSACTION_TIMEOUTS.STANDARD,
      isolationLevel:
        options?.isolationLevel ??
        Prisma.TransactionIsolationLevel.ReadCommitted,
    },
  );
}
