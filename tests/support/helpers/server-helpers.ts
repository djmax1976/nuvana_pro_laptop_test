/**
 * Server Helper Functions
 *
 * Pure functions for server testing utilities.
 * Framework-agnostic helpers that can be used in any test context.
 */

export type HealthCheckResponse = {
  status: string;
  timestamp: string;
  uptime?: number; // Optional - /api/health doesn't include uptime
  services?: Record<string, unknown>; // Optional - /api/health includes services
  version?: string; // Optional - /api/health includes version
};

/**
 * Validates health check response structure
 * Supports both /health (simple) and /api/health (full) endpoints
 */
export function validateHealthCheckResponse(
  body: unknown,
): body is HealthCheckResponse {
  if (typeof body !== "object" || body === null) {
    return false;
  }

  const health = body as Record<string, unknown>;
  // Must have status and timestamp
  const hasRequiredFields =
    health.status === "ok" && typeof health.timestamp === "string";

  // May have uptime (simple /health) or services (full /api/health)
  const hasValidOptionalFields =
    health.uptime === undefined ||
    typeof health.uptime === "number" ||
    (health.services !== undefined && typeof health.services === "object");

  return hasRequiredFields && hasValidOptionalFields;
}

/**
 * Extracts rate limit information from response headers
 */
export function extractRateLimitInfo(headers: Record<string, string>) {
  return {
    limit: headers["x-ratelimit-limit"]
      ? parseInt(headers["x-ratelimit-limit"], 10)
      : null,
    remaining: headers["x-ratelimit-remaining"]
      ? parseInt(headers["x-ratelimit-remaining"], 10)
      : null,
    reset: headers["x-ratelimit-reset"]
      ? parseInt(headers["x-ratelimit-reset"], 10)
      : null,
    retryAfter: headers["retry-after"]
      ? parseInt(headers["retry-after"], 10)
      : null,
  };
}

/**
 * Validates CORS headers presence
 */
export function validateCorsHeaders(headers: Record<string, string>): boolean {
  return (
    "access-control-allow-origin" in headers ||
    "access-control-allow-methods" in headers ||
    "access-control-allow-headers" in headers
  );
}

/**
 * Validates security headers (Helmet)
 */
export function validateSecurityHeaders(headers: Record<string, string>): {
  hasContentTypeOptions: boolean;
  hasFrameOptions: boolean;
  hasXssProtection: boolean;
} {
  return {
    hasContentTypeOptions: headers["x-content-type-options"] === "nosniff",
    hasFrameOptions: "x-frame-options" in headers,
    hasXssProtection: "x-xss-protection" in headers,
  };
}
