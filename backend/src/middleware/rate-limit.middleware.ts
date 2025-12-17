/**
 * Enhanced Rate Limiting Middleware
 *
 * Provides per-company and per-endpoint rate limiting beyond the global limits.
 * Designed for high-cost operations like reporting, bulk imports, and file uploads.
 *
 * Features:
 * - Per-company rate limiting for fair resource distribution
 * - Stricter limits for sensitive endpoints (login, password reset)
 * - Redis-backed for distributed rate limiting
 * - Graceful degradation when Redis is unavailable
 *
 * @module rate-limit.middleware
 */

import { FastifyRequest, FastifyReply } from "fastify";
import { getRedisClient } from "../utils/redis";

/**
 * Rate limit configuration for different endpoint types
 */
export interface RateLimitConfig {
  /** Maximum requests per window */
  max: number;
  /** Time window in seconds */
  windowSeconds: number;
  /** Key prefix for Redis storage */
  keyPrefix: string;
  /** Whether to skip rate limiting when Redis is unavailable */
  skipOnRedisUnavailable?: boolean;
  /** Custom error message */
  errorMessage?: string;
}

/**
 * Pre-defined rate limit configurations
 */
export const RateLimitPresets = {
  /**
   * Per-company rate limit for shared resources
   * 500 requests per minute per company
   */
  COMPANY: {
    max: 500,
    windowSeconds: 60,
    keyPrefix: "rl:company",
    skipOnRedisUnavailable: true,
    errorMessage:
      "Company rate limit exceeded. Please distribute requests across time.",
  } as RateLimitConfig,

  /**
   * Stricter rate limit for authentication endpoints
   * 5 requests per minute per IP (brute force protection)
   */
  AUTH: {
    max: 5,
    windowSeconds: 60,
    keyPrefix: "rl:auth",
    skipOnRedisUnavailable: false, // Fail secure - don't allow auth without rate limit
    errorMessage: "Too many login attempts. Please wait before trying again.",
  } as RateLimitConfig,

  /**
   * Rate limit for password reset requests
   * 3 requests per 15 minutes per email/IP
   */
  PASSWORD_RESET: {
    max: 3,
    windowSeconds: 900, // 15 minutes
    keyPrefix: "rl:pwreset",
    skipOnRedisUnavailable: false,
    errorMessage:
      "Too many password reset requests. Please wait before trying again.",
  } as RateLimitConfig,

  /**
   * Rate limit for high-cost reporting/analytics APIs
   * 10 requests per minute per user
   */
  REPORTING: {
    max: 10,
    windowSeconds: 60,
    keyPrefix: "rl:report",
    skipOnRedisUnavailable: true,
    errorMessage:
      "Report generation limit reached. Please wait before generating more reports.",
  } as RateLimitConfig,

  /**
   * Rate limit for bulk import operations
   * 5 imports per hour per company
   */
  BULK_IMPORT: {
    max: 5,
    windowSeconds: 3600, // 1 hour
    keyPrefix: "rl:import",
    skipOnRedisUnavailable: true,
    errorMessage:
      "Bulk import limit reached. Please wait before starting another import.",
  } as RateLimitConfig,

  /**
   * Rate limit for file upload operations
   * 5 uploads per minute per user
   */
  UPLOAD: {
    max: 5,
    windowSeconds: 60,
    keyPrefix: "rl:upload",
    skipOnRedisUnavailable: true,
    errorMessage:
      "Upload limit reached. Please wait before uploading more files.",
  } as RateLimitConfig,
} as const;

/**
 * Result of a rate limit check
 */
interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  total: number;
}

/**
 * Check rate limit using Redis
 * Uses sliding window counter with atomic operations
 */
async function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const redis = await getRedisClient();

  if (!redis) {
    // Redis unavailable
    if (config.skipOnRedisUnavailable) {
      return {
        allowed: true,
        remaining: config.max,
        resetAt: new Date(Date.now() + config.windowSeconds * 1000),
        total: 0,
      };
    }
    // Fail secure for critical endpoints
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + config.windowSeconds * 1000),
      total: config.max,
    };
  }

  const fullKey = `${config.keyPrefix}:${key}`;
  const now = Date.now();
  const windowStart = now - config.windowSeconds * 1000;

  try {
    // Use Redis transaction for atomic sliding window
    // Remove old entries, add new entry, get count
    const multi = redis.multi();

    // Remove entries outside the window
    multi.zRemRangeByScore(fullKey, 0, windowStart);

    // Add current request timestamp
    multi.zAdd(fullKey, { score: now, value: `${now}` });

    // Get count of requests in window
    multi.zCard(fullKey);

    // Set expiry on the key
    multi.expire(fullKey, config.windowSeconds);

    const results = await multi.exec();

    // zCard result is at index 2
    const count = results[2] as number;
    const remaining = Math.max(0, config.max - count);

    return {
      allowed: count <= config.max,
      remaining,
      resetAt: new Date(now + config.windowSeconds * 1000),
      total: count,
    };
  } catch (error) {
    console.error("Rate limit check failed:", error);

    // On error, use configured behavior
    if (config.skipOnRedisUnavailable) {
      return {
        allowed: true,
        remaining: config.max,
        resetAt: new Date(Date.now() + config.windowSeconds * 1000),
        total: 0,
      };
    }
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + config.windowSeconds * 1000),
      total: config.max,
    };
  }
}

/**
 * Extract company ID from request
 * Tries route params, query params, body, and user context
 */
function extractCompanyId(request: FastifyRequest): string | null {
  // From route params
  const params = request.params as Record<string, string>;
  if (params.companyId) return params.companyId;

  // From query params
  const query = request.query as Record<string, string>;
  if (query.company_id) return query.company_id;

  // From request body
  const body = request.body as Record<string, unknown>;
  if (body?.company_id && typeof body.company_id === "string") {
    return body.company_id;
  }

  // From user context (first company if available)
  const user = (request as any).user;
  if (user?.company_ids?.[0]) return user.company_ids[0];

  return null;
}

/**
 * Create per-company rate limit middleware
 * Uses company ID from request context for fair distribution
 *
 * @param config - Rate limit configuration (default: COMPANY preset)
 * @returns Fastify preHandler hook
 */
export function companyRateLimiter(
  config: RateLimitConfig = RateLimitPresets.COMPANY,
) {
  return async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    const companyId = extractCompanyId(request);

    if (!companyId) {
      // No company context, skip rate limiting
      // Global per-user/IP rate limit will still apply
      return;
    }

    const result = await checkRateLimit(companyId, config);

    // Add rate limit headers
    reply.header("X-RateLimit-Limit", config.max);
    reply.header("X-RateLimit-Remaining", result.remaining);
    reply.header(
      "X-RateLimit-Reset",
      Math.floor(result.resetAt.getTime() / 1000),
    );

    if (!result.allowed) {
      // Log rate limit breach for investigation (MCP guideline)
      console.warn(
        `Rate limit exceeded: company=${companyId} endpoint=${request.url} count=${result.total}`,
      );

      return reply.code(429).send({
        success: false,
        error: {
          code: "COMPANY_RATE_LIMIT_EXCEEDED",
          message:
            config.errorMessage ||
            "Company rate limit exceeded. Please try again later.",
          retryAfter: Math.ceil((result.resetAt.getTime() - Date.now()) / 1000),
        },
      });
    }
  };
}

/**
 * Create authentication rate limit middleware
 * Uses IP address for brute force protection
 *
 * @param config - Rate limit configuration (default: AUTH preset)
 * @returns Fastify preHandler hook
 */
export function authRateLimiter(
  config: RateLimitConfig = RateLimitPresets.AUTH,
) {
  return async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    // Use IP address for auth rate limiting
    const ip =
      (request.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      request.ip ||
      "unknown";

    const result = await checkRateLimit(ip, config);

    // Add rate limit headers
    reply.header("X-RateLimit-Limit", config.max);
    reply.header("X-RateLimit-Remaining", result.remaining);
    reply.header(
      "X-RateLimit-Reset",
      Math.floor(result.resetAt.getTime() / 1000),
    );

    if (!result.allowed) {
      // Log authentication rate limit breach
      console.warn(
        `Auth rate limit exceeded: ip=${ip} endpoint=${request.url} count=${result.total}`,
      );

      return reply.code(429).send({
        success: false,
        error: {
          code: "AUTH_RATE_LIMIT_EXCEEDED",
          message:
            config.errorMessage ||
            "Too many authentication attempts. Please wait.",
          retryAfter: Math.ceil((result.resetAt.getTime() - Date.now()) / 1000),
        },
      });
    }
  };
}

/**
 * Create per-user rate limit middleware
 * Uses authenticated user ID for fair distribution
 *
 * @param config - Rate limit configuration
 * @returns Fastify preHandler hook
 */
export function userRateLimiter(config: RateLimitConfig) {
  return async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    const user = (request as any).user;

    if (!user?.id) {
      // No user context, skip rate limiting
      // Global per-IP rate limit will still apply
      return;
    }

    const result = await checkRateLimit(user.id, config);

    // Add rate limit headers
    reply.header("X-RateLimit-Limit", config.max);
    reply.header("X-RateLimit-Remaining", result.remaining);
    reply.header(
      "X-RateLimit-Reset",
      Math.floor(result.resetAt.getTime() / 1000),
    );

    if (!result.allowed) {
      console.warn(
        `User rate limit exceeded: userId=${user.id} endpoint=${request.url} count=${result.total}`,
      );

      return reply.code(429).send({
        success: false,
        error: {
          code: "USER_RATE_LIMIT_EXCEEDED",
          message:
            config.errorMessage ||
            "Rate limit exceeded. Please try again later.",
          retryAfter: Math.ceil((result.resetAt.getTime() - Date.now()) / 1000),
        },
      });
    }
  };
}

/**
 * Create custom key rate limit middleware
 * Allows specifying a custom key extraction function
 *
 * @param keyExtractor - Function to extract rate limit key from request
 * @param config - Rate limit configuration
 * @returns Fastify preHandler hook
 */
export function customRateLimiter(
  keyExtractor: (request: FastifyRequest) => string | null,
  config: RateLimitConfig,
) {
  return async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    const key = keyExtractor(request);

    if (!key) {
      // No key extracted, skip rate limiting
      return;
    }

    const result = await checkRateLimit(key, config);

    // Add rate limit headers
    reply.header("X-RateLimit-Limit", config.max);
    reply.header("X-RateLimit-Remaining", result.remaining);
    reply.header(
      "X-RateLimit-Reset",
      Math.floor(result.resetAt.getTime() / 1000),
    );

    if (!result.allowed) {
      console.warn(
        `Custom rate limit exceeded: key=${key} endpoint=${request.url} count=${result.total}`,
      );

      return reply.code(429).send({
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message:
            config.errorMessage ||
            "Rate limit exceeded. Please try again later.",
          retryAfter: Math.ceil((result.resetAt.getTime() - Date.now()) / 1000),
        },
      });
    }
  };
}

/**
 * Get current rate limit status for monitoring
 * Returns rate limit info without incrementing counter
 */
export async function getRateLimitStatus(
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult | null> {
  const redis = await getRedisClient();

  if (!redis) {
    return null;
  }

  const fullKey = `${config.keyPrefix}:${key}`;
  const now = Date.now();
  const windowStart = now - config.windowSeconds * 1000;

  try {
    // Get count without adding new entry
    await redis.zRemRangeByScore(fullKey, 0, windowStart);
    const count = await redis.zCard(fullKey);

    return {
      allowed: count < config.max,
      remaining: Math.max(0, config.max - count),
      resetAt: new Date(now + config.windowSeconds * 1000),
      total: count,
    };
  } catch (error) {
    console.error("Rate limit status check failed:", error);
    return null;
  }
}
