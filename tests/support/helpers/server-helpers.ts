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

/**
 * Configuration for retry with exponential backoff
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds (default: 100) */
  initialDelayMs?: number;
  /** Maximum delay in milliseconds (default: 5000) */
  maxDelayMs?: number;
  /** Jitter factor (0-1) to add randomness (default: 0.1) */
  jitterFactor?: number;
  /** HTTP status codes to retry on (default: [429, 503, 502, 504]) */
  retryableStatuses?: number[];
}

const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  jitterFactor: 0.1,
  retryableStatuses: [429, 502, 503, 504],
};

/**
 * Calculate delay with exponential backoff and jitter
 * Formula: min(maxDelay, initialDelay * 2^attempt) * (1 + random * jitter)
 */
function calculateBackoffDelay(
  attempt: number,
  config: Required<RetryConfig>,
): number {
  const exponentialDelay = config.initialDelayMs * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
  const jitter = 1 + Math.random() * config.jitterFactor;
  return Math.floor(cappedDelay * jitter);
}

/**
 * Sleep utility for async delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps a Playwright API response fetch with retry logic for rate limiting
 *
 * Enterprise-grade retry implementation with:
 * - Exponential backoff
 * - Jitter to prevent thundering herd
 * - Configurable retry conditions
 * - Respects Retry-After headers
 *
 * @example
 * ```typescript
 * const response = await withRetry(() =>
 *   request.get(`${backendUrl}/api/endpoint`)
 * );
 * ```
 */
export async function withRetry<
  T extends { status: () => number; headers: () => Record<string, string> },
>(fetchFn: () => Promise<T>, config: RetryConfig = {}): Promise<T> {
  const mergedConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | undefined;
  let lastResponse: T | undefined;

  for (let attempt = 0; attempt <= mergedConfig.maxRetries; attempt++) {
    try {
      const response = await fetchFn();
      lastResponse = response;

      // Check if we should retry based on status code
      if (mergedConfig.retryableStatuses.includes(response.status())) {
        if (attempt < mergedConfig.maxRetries) {
          // Check for Retry-After header
          const headers = response.headers();
          const retryAfterHeader = headers["retry-after"];
          let delayMs: number;

          if (retryAfterHeader) {
            // Retry-After can be a number (seconds) or HTTP-date
            const retryAfterSeconds = parseInt(retryAfterHeader, 10);
            if (!isNaN(retryAfterSeconds)) {
              delayMs = retryAfterSeconds * 1000;
            } else {
              // Fallback to exponential backoff
              delayMs = calculateBackoffDelay(attempt, mergedConfig);
            }
          } else {
            delayMs = calculateBackoffDelay(attempt, mergedConfig);
          }

          // Cap delay at maxDelayMs
          delayMs = Math.min(delayMs, mergedConfig.maxDelayMs);

          await sleep(delayMs);
          continue;
        }
      }

      // Success or non-retryable status
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < mergedConfig.maxRetries) {
        const delayMs = calculateBackoffDelay(attempt, mergedConfig);
        await sleep(delayMs);
        continue;
      }
    }
  }

  // If we have a response (even if it's a retryable status), return it
  // This allows tests to assert on the actual status code
  if (lastResponse) {
    return lastResponse;
  }

  // If all retries failed with exceptions, throw the last error
  throw lastError || new Error("Retry failed with no response or error");
}
