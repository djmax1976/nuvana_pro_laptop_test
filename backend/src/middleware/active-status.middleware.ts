import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../utils/db";
import { getRedisClient } from "../utils/redis";

/**
 * Cached user status entry
 */
interface CachedUserStatus {
  status: string;
  cachedAt: number;
}

/**
 * Active Status Middleware
 *
 * CRITICAL SECURITY MIDDLEWARE: Validates that user, their company, and store
 * are still active on EVERY authenticated request.
 *
 * This prevents deactivated users from continuing to use the system with
 * their existing JWT tokens.
 *
 * Flow:
 * 1. Extract user ID from request.user (set by auth middleware)
 * 2. Check Redis cache for user status (TTL: 30 seconds for quick propagation)
 * 3. If cache miss, query database for current status
 * 4. Block request if user is INACTIVE
 *
 * Performance optimizations:
 * - Short TTL (30s) for quick propagation of deactivation
 * - Redis caching to avoid DB query on every request
 * - Graceful fallback to DB if Redis unavailable
 *
 * @security This is a CRITICAL security control. DO NOT disable or bypass.
 */

const STATUS_CACHE_PREFIX = "user_status:";
const STATUS_CACHE_TTL = 30; // 30 seconds - short for quick deactivation propagation

/**
 * Get user status from cache or database
 */
async function getUserStatus(userId: string): Promise<string | null> {
  const redis = await getRedisClient();
  const cacheKey = `${STATUS_CACHE_PREFIX}${userId}`;

  // Try cache first
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed: CachedUserStatus = JSON.parse(cached);
        return parsed.status;
      }
    } catch (error) {
      console.warn("[ActiveStatusMiddleware] Redis read error:", error);
    }
  }

  // Cache miss - fetch from database
  try {
    const user = await prisma.user.findUnique({
      where: { user_id: userId },
      select: { status: true },
    });

    if (!user) {
      return null; // User doesn't exist
    }

    // Cache the status
    if (redis) {
      try {
        const cacheEntry: CachedUserStatus = {
          status: user.status,
          cachedAt: Date.now(),
        };
        await redis.setEx(
          cacheKey,
          STATUS_CACHE_TTL,
          JSON.stringify(cacheEntry),
        );
      } catch (error) {
        console.warn("[ActiveStatusMiddleware] Redis write error:", error);
      }
    }

    return user.status;
  } catch (error) {
    console.error("[ActiveStatusMiddleware] Database error:", error);
    // On DB error, fail open for availability but log for monitoring
    // In high-security environments, you might want to fail closed instead
    return "ACTIVE";
  }
}

/**
 * Invalidate user status cache
 * Call this when user status is changed to force immediate re-check
 */
export async function invalidateUserStatusCache(userId: string): Promise<void> {
  const redis = await getRedisClient();
  if (redis) {
    try {
      await redis.del(`${STATUS_CACHE_PREFIX}${userId}`);
      console.log(
        `[ActiveStatusMiddleware] Invalidated status cache for user ${userId}`,
      );
    } catch (error) {
      console.error(
        "[ActiveStatusMiddleware] Failed to invalidate cache:",
        error,
      );
    }
  }
}

/**
 * Invalidate status cache for multiple users
 */
export async function invalidateMultipleUserStatusCache(
  userIds: string[],
): Promise<void> {
  if (userIds.length === 0) return;

  const redis = await getRedisClient();
  if (redis) {
    try {
      const keys = userIds.map((id) => `${STATUS_CACHE_PREFIX}${id}`);
      await redis.del(keys);
      console.log(
        `[ActiveStatusMiddleware] Invalidated status cache for ${userIds.length} users`,
      );
    } catch (error) {
      console.error(
        "[ActiveStatusMiddleware] Failed to batch invalidate cache:",
        error,
      );
    }
  }
}

/**
 * Active Status Middleware
 *
 * MUST be used AFTER authMiddleware.
 * Checks if the authenticated user's account is still active.
 */
export async function activeStatusMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = (request as any).user;

  if (!user?.id) {
    // No user attached - auth middleware should have blocked this
    // But if we reach here, block anyway
    return reply.code(401).send({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    });
  }

  const status = await getUserStatus(user.id);

  if (status === null) {
    // User doesn't exist in database - token might be for deleted user
    console.warn(
      `[ActiveStatusMiddleware] User ${user.id} not found in database`,
    );
    return reply.code(401).send({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Account not found",
      },
    });
  }

  if (status !== "ACTIVE") {
    console.log(
      `[ActiveStatusMiddleware] Blocked inactive user ${user.id} (status: ${status})`,
    );
    return reply.code(403).send({
      success: false,
      error: {
        code: "ACCOUNT_DEACTIVATED",
        message: "Your account has been deactivated. Please contact support.",
      },
    });
  }

  // User is active - continue to next handler
}

/**
 * Company Active Status Check
 *
 * Verifies that the company is active before allowing access.
 * Use this for company-scoped operations.
 */
export async function checkCompanyActiveStatus(companyId: string): Promise<{
  isActive: boolean;
  status: string | null;
}> {
  try {
    const company = await prisma.company.findUnique({
      where: { company_id: companyId },
      select: { status: true },
    });

    if (!company) {
      return { isActive: false, status: null };
    }

    return {
      isActive: company.status === "ACTIVE",
      status: company.status,
    };
  } catch (error) {
    console.error(
      "[ActiveStatusMiddleware] Company status check error:",
      error,
    );
    return { isActive: true, status: "ACTIVE" }; // Fail open for availability
  }
}

/**
 * Store Active Status Check
 *
 * Verifies that the store (and its parent company) is active before allowing access.
 * Use this for store-scoped operations.
 */
export async function checkStoreActiveStatus(storeId: string): Promise<{
  isActive: boolean;
  storeStatus: string | null;
  companyStatus: string | null;
}> {
  try {
    const store = await prisma.store.findUnique({
      where: { store_id: storeId },
      select: {
        status: true,
        company: {
          select: { status: true },
        },
      },
    });

    if (!store) {
      return { isActive: false, storeStatus: null, companyStatus: null };
    }

    const isActive =
      store.status === "ACTIVE" && store.company.status === "ACTIVE";

    return {
      isActive,
      storeStatus: store.status,
      companyStatus: store.company.status,
    };
  } catch (error) {
    console.error("[ActiveStatusMiddleware] Store status check error:", error);
    return { isActive: true, storeStatus: "ACTIVE", companyStatus: "ACTIVE" }; // Fail open
  }
}

/**
 * Combined middleware factory for checking user + company/store status
 *
 * @param options.requireCompany - Check company status (from query/params/body companyId)
 * @param options.requireStore - Check store status (from query/params/body storeId)
 */
export function createActiveStatusMiddleware(options?: {
  requireCompany?: boolean;
  requireStore?: boolean;
}) {
  return async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    // First check user status
    await activeStatusMiddleware(request, reply);

    // If already sent response (user inactive), stop here
    if (reply.sent) {
      return;
    }

    // Check company status if required
    if (options?.requireCompany) {
      const companyId =
        (request.params as any)?.companyId ||
        (request.query as any)?.companyId ||
        (request.body as any)?.companyId ||
        (request as any).user?.company_ids?.[0];

      if (companyId) {
        const { isActive, status } = await checkCompanyActiveStatus(companyId);
        if (!isActive) {
          console.log(
            `[ActiveStatusMiddleware] Blocked access to inactive company ${companyId} (status: ${status})`,
          );
          return reply.code(403).send({
            success: false,
            error: {
              code: "COMPANY_DEACTIVATED",
              message:
                "This company has been deactivated. Please contact support.",
            },
          });
        }
      }
    }

    // Check store status if required
    if (options?.requireStore) {
      const storeId =
        (request.params as any)?.storeId ||
        (request.query as any)?.storeId ||
        (request.body as any)?.storeId;

      if (storeId) {
        const { isActive, storeStatus, companyStatus } =
          await checkStoreActiveStatus(storeId);
        if (!isActive) {
          const message =
            companyStatus !== "ACTIVE"
              ? "This company has been deactivated. Please contact support."
              : "This store has been deactivated. Please contact support.";

          console.log(
            `[ActiveStatusMiddleware] Blocked access to inactive store ${storeId} (store: ${storeStatus}, company: ${companyStatus})`,
          );
          return reply.code(403).send({
            success: false,
            error: {
              code:
                storeStatus !== "ACTIVE"
                  ? "STORE_DEACTIVATED"
                  : "COMPANY_DEACTIVATED",
              message,
            },
          });
        }
      }
    }
  };
}
