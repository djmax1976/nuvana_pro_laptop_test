/**
 * API Key Authentication Middleware
 *
 * Enterprise-grade middleware for authenticating requests using API keys.
 * Used by desktop POS applications to authenticate with the server.
 *
 * Security Features:
 * - SHA-256 key validation
 * - Redis-based revocation cache
 * - IP allowlist enforcement
 * - Per-key rate limiting
 * - Comprehensive audit logging
 *
 * @module middleware/api-key.middleware
 */

import { FastifyRequest, FastifyReply } from "fastify";
import { apiKeyService, apiKeyAuditService } from "../services/api-key";
import type { ApiKeyIdentity } from "../types/api-key.types";

// ============================================================================
// Types
// ============================================================================

/**
 * Extended FastifyRequest with API key identity
 */
export interface ApiKeyAuthenticatedRequest extends FastifyRequest {
  apiKey?: ApiKeyIdentity;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract API key from request headers
 *
 * Supports:
 * - Authorization: Bearer nuvpos_sk_...
 * - X-API-Key: nuvpos_sk_...
 */
function extractApiKey(request: FastifyRequest): string | null {
  // Check Authorization header first (preferred)
  const authHeader = request.headers["authorization"];
  if (authHeader && typeof authHeader === "string") {
    if (authHeader.startsWith("Bearer nuvpos_sk_")) {
      return authHeader.substring(7); // Remove "Bearer "
    }
  }

  // Check X-API-Key header
  const apiKeyHeader = request.headers["x-api-key"];
  if (apiKeyHeader && typeof apiKeyHeader === "string") {
    if (apiKeyHeader.startsWith("nuvpos_sk_")) {
      return apiKeyHeader;
    }
  }

  return null;
}

/**
 * Extract client IP address from request
 */
function extractClientIp(request: FastifyRequest): string {
  // Check for forwarded headers (proxy/load balancer)
  const forwarded = request.headers["x-forwarded-for"];
  if (forwarded) {
    const ips = Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded.split(",")[0];
    return ips.trim();
  }

  const realIp = request.headers["x-real-ip"];
  if (realIp && typeof realIp === "string") {
    return realIp;
  }

  // Fall back to direct connection IP
  return request.ip || "unknown";
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * API Key Authentication Middleware
 *
 * Validates API key from request headers and attaches identity to request.
 *
 * Validation order (optimized for performance):
 * 1. Extract key from headers
 * 2. Format validation
 * 3. Redis revocation check (fast path)
 * 4. Database lookup by hash
 * 5. Status and expiration checks
 * 6. IP allowlist check
 * 7. Rate limit check
 *
 * On success: Attaches ApiKeyIdentity to request.apiKey
 */
export async function apiKeyMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // 1. Extract API key from headers
  const rawKey = extractApiKey(request);

  if (!rawKey) {
    return reply.code(401).send({
      success: false,
      error: {
        code: "MISSING_API_KEY",
        message:
          "API key is required. Use Authorization: Bearer or X-API-Key header.",
      },
    });
  }

  // 2. Extract client IP for logging and allowlist check
  const clientIp = extractClientIp(request);

  // 3. Validate the API key
  const validationResult = await apiKeyService.validateApiKey(rawKey, clientIp);

  if (!validationResult.valid) {
    // Log failed authentication attempts (except for common errors)
    if (validationResult.errorCode !== "INVALID_FORMAT") {
      console.warn("[ApiKeyMiddleware] Authentication failed:", {
        errorCode: validationResult.errorCode,
        ip: clientIp,
        path: request.url,
        timestamp: new Date().toISOString(),
      });
    }

    // Map error codes to HTTP status codes
    let statusCode = 401;
    if (validationResult.errorCode === "IP_NOT_ALLOWED") {
      statusCode = 403;
    } else if (validationResult.errorCode === "RATE_LIMIT_EXCEEDED") {
      statusCode = 429;
    } else if (validationResult.errorCode === "QUOTA_EXCEEDED") {
      statusCode = 429;
    }

    return reply.code(statusCode).send({
      success: false,
      error: {
        code: validationResult.errorCode || "AUTHENTICATION_FAILED",
        message:
          validationResult.errorMessage || "API key authentication failed",
      },
    });
  }

  // 4. Check rate limit
  const rateCheck = await apiKeyService.checkRateLimit(
    validationResult.apiKey!.keyHash,
    validationResult.apiKey!.rateLimitRpm,
  );

  // Set rate limit headers
  reply.header("X-RateLimit-Limit", validationResult.apiKey!.rateLimitRpm);
  reply.header("X-RateLimit-Remaining", rateCheck.remaining);
  reply.header("X-RateLimit-Reset", rateCheck.resetAt.toISOString());

  if (!rateCheck.allowed) {
    // Log rate limit event
    await apiKeyAuditService.logRateLimited(
      validationResult.identity!.apiKeyId,
      validationResult.apiKey!.rateLimitRpm - rateCheck.remaining + 1,
      validationResult.apiKey!.rateLimitRpm,
      clientIp,
    );

    return reply.code(429).send({
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "API rate limit exceeded. Please try again later.",
      },
    });
  }

  // 5. Attach identity to request
  (request as ApiKeyAuthenticatedRequest).apiKey = validationResult.identity!;

  // 6. Update last used timestamp (fire-and-forget)
  apiKeyService.updateLastUsed(validationResult.identity!.apiKeyId);
}

/**
 * Hybrid Authentication Middleware
 *
 * Allows authentication via either JWT cookie OR API key.
 * Priority: JWT > API Key
 *
 * Use this for endpoints that should be accessible by both
 * web users (JWT) and desktop apps (API key).
 */
export async function hybridAuthMiddleware(
  request: FastifyRequest & { cookies?: { access_token?: string } },
  reply: FastifyReply,
): Promise<void> {
  // Check for JWT cookie first (web/admin users)
  const accessToken = request.cookies?.access_token;
  if (accessToken) {
    // Import dynamically to avoid circular dependency
    const { authMiddleware } = await import("./auth.middleware");
    return authMiddleware(request, reply);
  }

  // Fall back to API key (desktop POS)
  return apiKeyMiddleware(request, reply);
}

/**
 * Optional API Key Middleware
 *
 * Like apiKeyMiddleware, but allows requests without API key.
 * If present, validates and attaches identity.
 * If absent, continues without error.
 */
export async function optionalApiKeyMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const rawKey = extractApiKey(request);

  if (!rawKey) {
    // No key provided - continue without identity
    return;
  }

  // Validate if key is provided
  const clientIp = extractClientIp(request);
  const validationResult = await apiKeyService.validateApiKey(rawKey, clientIp);

  if (validationResult.valid) {
    (request as ApiKeyAuthenticatedRequest).apiKey = validationResult.identity!;
    apiKeyService.updateLastUsed(validationResult.identity!.apiKeyId);
  }
  // If invalid, we just don't attach identity but don't fail the request
}

/**
 * Require API Key Middleware
 *
 * Stricter version that ONLY accepts API key authentication.
 * Use for device-only endpoints that should never accept JWT.
 */
export async function requireApiKeyMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // Reject if JWT token is present
  const accessToken = (request as any).cookies?.access_token;
  if (accessToken) {
    return reply.code(400).send({
      success: false,
      error: {
        code: "JWT_NOT_ALLOWED",
        message: "This endpoint requires API key authentication only.",
      },
    });
  }

  return apiKeyMiddleware(request, reply);
}

/**
 * Extract API key identity from request
 *
 * Helper function for route handlers
 */
export function getApiKeyIdentity(
  request: FastifyRequest,
): ApiKeyIdentity | undefined {
  return (request as ApiKeyAuthenticatedRequest).apiKey;
}

/**
 * Require API key identity
 *
 * Throws if no API key identity is attached to request
 */
export function requireApiKeyIdentity(request: FastifyRequest): ApiKeyIdentity {
  const identity = getApiKeyIdentity(request);
  if (!identity) {
    throw new Error("API key identity not found on request");
  }
  return identity;
}
