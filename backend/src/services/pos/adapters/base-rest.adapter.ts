/**
 * Base REST Adapter
 *
 * Abstract base class for JSON REST API POS integrations.
 * Provides common HTTP client, OAuth 2.0 handling, rate limiting,
 * retry logic with exponential backoff, and request/response logging.
 *
 * @module services/pos/adapters/base-rest.adapter
 * @security All credentials are handled securely; tokens are never logged
 * @see coding-rules: API-001 (Validation), API-002 (Rate Limiting), API-003 (Error Handling), API-004 (Authentication)
 */

import { BasePOSAdapter } from "../base-adapter";
import type {
  POSConnectionConfig,
  POSOAuth2Credentials,
} from "../../../types/pos-integration.types";

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * HTTP methods supported by the REST adapter
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Maximum requests per window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Whether to queue requests when rate limited */
  queueRequests: boolean;
}

/**
 * Rate limit state tracking
 */
interface RateLimitState {
  /** Number of requests made in current window */
  requestCount: number;
  /** Window start timestamp */
  windowStart: number;
  /** Remaining requests in current window */
  remaining: number;
  /** When the rate limit resets (from server headers) */
  resetAt?: number;
}

/**
 * OAuth 2.0 token response
 */
export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

/**
 * REST request options
 */
export interface RestRequestOptions {
  /** Request path (will be appended to base URL) */
  path: string;
  /** HTTP method */
  method?: HttpMethod;
  /** Query parameters */
  query?: Record<string, string | number | boolean | undefined>;
  /** Request body (will be JSON stringified) */
  body?: unknown;
  /** Additional headers */
  headers?: Record<string, string>;
  /** Override timeout for this request */
  timeoutMs?: number;
  /** Skip rate limiting for this request */
  skipRateLimit?: boolean;
  /** Number of retries (overrides default) */
  retries?: number;
}

/**
 * REST response wrapper
 */
export interface RestResponse<T = unknown> {
  /** Response data */
  data: T;
  /** HTTP status code */
  status: number;
  /** Response headers */
  headers: Record<string, string>;
  /** Request duration in milliseconds */
  durationMs: number;
}

/**
 * REST API error with structured information
 */
export class RestApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errorCode: string,
    public readonly details?: Record<string, unknown>,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "RestApiError";
  }
}

// ============================================================================
// Base REST Adapter Implementation
// ============================================================================

/**
 * Abstract Base REST Adapter
 *
 * Extends BasePOSAdapter to provide REST-specific functionality:
 * - JSON HTTP client with proper error handling
 * - OAuth 2.0 client credentials flow
 * - Rate limiting with token bucket algorithm
 * - Retry logic with exponential backoff
 * - Request/response logging with credential redaction
 *
 * @example
 * ```typescript
 * class CloverAdapter extends BaseRESTAdapter {
 *   protected readonly baseUrl = 'https://api.clover.com/v3';
 *
 *   async syncDepartments(config: POSConnectionConfig): Promise<POSDepartment[]> {
 *     const response = await this.get<CloverCategoriesResponse>(
 *       config,
 *       `/merchants/${config.merchantId}/categories`
 *     );
 *     return this.mapCategoriesToDepartments(response.data.elements);
 *   }
 * }
 * ```
 */
export abstract class BaseRESTAdapter extends BasePOSAdapter {
  /**
   * Base URL for the REST API (must be set by subclass)
   */
  protected abstract readonly baseUrl: string;

  /**
   * Default rate limit configuration
   * Subclasses can override based on vendor API limits
   */
  protected readonly rateLimitConfig: RateLimitConfig = {
    maxRequests: 100,
    windowMs: 60000, // 1 minute
    queueRequests: true,
  };

  /**
   * Rate limit state per host
   */
  private rateLimitStates: Map<string, RateLimitState> = new Map();

  /**
   * Cached OAuth tokens per integration
   */
  private tokenCache: Map<string, { token: string; expiresAt: Date }> =
    new Map();

  // ============================================================================
  // HTTP Methods (Convenience wrappers)
  // ============================================================================

  /**
   * Make a GET request
   */
  protected async get<T>(
    config: POSConnectionConfig,
    path: string,
    options?: Omit<RestRequestOptions, "path" | "method" | "body">,
  ): Promise<RestResponse<T>> {
    return this.request<T>(config, { ...options, path, method: "GET" });
  }

  /**
   * Make a POST request
   */
  protected async post<T>(
    config: POSConnectionConfig,
    path: string,
    body?: unknown,
    options?: Omit<RestRequestOptions, "path" | "method" | "body">,
  ): Promise<RestResponse<T>> {
    return this.request<T>(config, { ...options, path, method: "POST", body });
  }

  /**
   * Make a PUT request
   */
  protected async put<T>(
    config: POSConnectionConfig,
    path: string,
    body?: unknown,
    options?: Omit<RestRequestOptions, "path" | "method" | "body">,
  ): Promise<RestResponse<T>> {
    return this.request<T>(config, { ...options, path, method: "PUT", body });
  }

  /**
   * Make a PATCH request
   */
  protected async patch<T>(
    config: POSConnectionConfig,
    path: string,
    body?: unknown,
    options?: Omit<RestRequestOptions, "path" | "method" | "body">,
  ): Promise<RestResponse<T>> {
    return this.request<T>(config, { ...options, path, method: "PATCH", body });
  }

  /**
   * Make a DELETE request
   */
  protected async delete<T>(
    config: POSConnectionConfig,
    path: string,
    options?: Omit<RestRequestOptions, "path" | "method" | "body">,
  ): Promise<RestResponse<T>> {
    return this.request<T>(config, { ...options, path, method: "DELETE" });
  }

  // ============================================================================
  // Core Request Handler
  // ============================================================================

  /**
   * Make an HTTP request with full error handling, retries, and rate limiting
   *
   * @param config - POS connection configuration
   * @param options - Request options
   * @returns Response wrapper with data, status, headers, and timing
   * @throws RestApiError for HTTP errors
   */
  protected async request<T>(
    config: POSConnectionConfig,
    options: RestRequestOptions,
  ): Promise<RestResponse<T>> {
    const {
      path,
      method = "GET",
      query,
      body,
      headers: customHeaders = {},
      timeoutMs,
      skipRateLimit = false,
      retries = this.maxRetries,
    } = options;

    // Check rate limit before proceeding
    if (!skipRateLimit) {
      await this.checkRateLimit(config.host);
    }

    // Build full URL with query parameters
    const url = this.buildUrl(path, query);

    // Build headers with authentication
    const headers = await this.buildRequestHeaders(config, customHeaders);

    // Prepare request body
    const requestBody = body ? JSON.stringify(body) : undefined;

    // Log request (with redacted credentials)
    this.logRequest(method, url, customHeaders, body);

    const startTime = Date.now();
    let lastError: Error | null = null;

    // Retry loop with exponential backoff
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await this.executeRestRequest<T>(
          config,
          url,
          method,
          headers,
          requestBody,
          timeoutMs,
        );

        // Update rate limit state from response headers
        this.updateRateLimitFromHeaders(config.host, response.headers);

        // Log successful response
        this.logResponse(method, url, response.status, Date.now() - startTime);

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable
        if (!this.isRetryableError(error)) {
          throw this.normalizeError(error);
        }

        // Handle rate limit errors specially
        if (this.isRateLimitError(error)) {
          const retryAfter = this.getRetryAfterMs(error);
          this.log("warn", `Rate limited, waiting ${retryAfter}ms`, {
            attempt,
            path,
          });
          await this.delay(retryAfter);
          continue;
        }

        // Log retry attempt
        this.log("warn", `Request failed, retrying`, {
          attempt,
          maxRetries: retries,
          error: lastError.message,
          path,
        });

        // Wait before retry with exponential backoff
        if (attempt < retries) {
          const backoffMs = this.calculateBackoff(attempt);
          await this.delay(backoffMs);
        }
      }
    }

    // All retries exhausted
    throw this.normalizeError(lastError);
  }

  /**
   * Execute the actual HTTP request using fetch or native http
   */
  private async executeRestRequest<T>(
    config: POSConnectionConfig,
    url: string,
    method: HttpMethod,
    headers: Record<string, string>,
    body: string | undefined,
    timeoutMs?: number,
  ): Promise<RestResponse<T>> {
    const timeout = timeoutMs || config.timeoutMs || this.defaultTimeoutMs;
    const startTime = Date.now();

    // Use native fetch API (available in Node.js 18+)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Parse response headers
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key.toLowerCase()] = value;
      });

      // Parse response body
      const contentType = responseHeaders["content-type"] || "";
      let data: T;

      if (contentType.includes("application/json")) {
        data = (await response.json()) as T;
      } else {
        // For non-JSON responses, wrap in a text property
        const text = await response.text();
        data = { text } as unknown as T;
      }

      // Check for error responses
      if (!response.ok) {
        throw new RestApiError(
          this.extractErrorMessage(data, response.statusText),
          response.status,
          this.extractErrorCode(data, response.status),
          typeof data === "object"
            ? (data as Record<string, unknown>)
            : undefined,
          this.isRetryableStatusCode(response.status),
        );
      }

      return {
        data,
        status: response.status,
        headers: responseHeaders,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle abort/timeout
      if (error instanceof Error && error.name === "AbortError") {
        throw new RestApiError(
          `Request timeout after ${timeout}ms`,
          408,
          "TIMEOUT",
          undefined,
          true,
        );
      }

      throw error;
    }
  }

  // ============================================================================
  // OAuth 2.0 Handling
  // ============================================================================

  /**
   * Get a valid OAuth access token, refreshing if necessary
   *
   * @param config - POS connection configuration with OAuth2 credentials
   * @returns Valid access token
   * @throws RestApiError if token refresh fails
   */
  protected async getOAuthToken(config: POSConnectionConfig): Promise<string> {
    if (config.credentials.type !== "OAUTH2") {
      throw new Error("OAuth2 credentials required");
    }

    const credentials = config.credentials as POSOAuth2Credentials;
    const cacheKey = this.getTokenCacheKey(credentials);

    // Check cache for valid token
    const cached = this.tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > new Date()) {
      return cached.token;
    }

    // Check if we have a valid token in the config
    if (
      credentials.accessToken &&
      credentials.tokenExpiresAt &&
      credentials.tokenExpiresAt > new Date()
    ) {
      // Cache it and return
      this.tokenCache.set(cacheKey, {
        token: credentials.accessToken,
        expiresAt: credentials.tokenExpiresAt,
      });
      return credentials.accessToken;
    }

    // Need to refresh the token
    return this.refreshOAuthToken(credentials);
  }

  /**
   * Refresh the OAuth access token using client credentials flow
   *
   * @param credentials - OAuth2 credentials
   * @returns New access token
   * @throws RestApiError if refresh fails
   */
  protected async refreshOAuthToken(
    credentials: POSOAuth2Credentials,
  ): Promise<string> {
    this.log("info", "Refreshing OAuth token");

    try {
      const response = await fetch(credentials.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret,
        }).toString(),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new RestApiError(
          `OAuth token refresh failed: ${response.statusText}`,
          response.status,
          "OAUTH_REFRESH_FAILED",
          errorData as Record<string, unknown>,
          false,
        );
      }

      const tokenData = (await response.json()) as OAuthTokenResponse;

      // Calculate expiry (subtract 60 seconds for safety margin)
      const expiresAt = new Date(
        Date.now() + (tokenData.expires_in - 60) * 1000,
      );

      // Cache the new token
      const cacheKey = this.getTokenCacheKey(credentials);
      this.tokenCache.set(cacheKey, {
        token: tokenData.access_token,
        expiresAt,
      });

      this.log("info", "OAuth token refreshed successfully", {
        expiresIn: tokenData.expires_in,
      });

      return tokenData.access_token;
    } catch (error) {
      if (error instanceof RestApiError) {
        throw error;
      }

      throw new RestApiError(
        `OAuth token refresh failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        500,
        "OAUTH_REFRESH_FAILED",
        undefined,
        false,
      );
    }
  }

  /**
   * Generate cache key for OAuth token
   */
  private getTokenCacheKey(credentials: POSOAuth2Credentials): string {
    return `${credentials.tokenUrl}:${credentials.clientId}`;
  }

  // ============================================================================
  // Rate Limiting
  // ============================================================================

  /**
   * Check rate limit and wait if necessary
   *
   * @param host - Host to check rate limit for
   */
  private async checkRateLimit(host: string): Promise<void> {
    const state = this.getRateLimitState(host);
    const now = Date.now();

    // Reset window if expired
    if (now - state.windowStart >= this.rateLimitConfig.windowMs) {
      state.windowStart = now;
      state.requestCount = 0;
      state.remaining = this.rateLimitConfig.maxRequests;
    }

    // Check if we're over the limit
    if (state.requestCount >= this.rateLimitConfig.maxRequests) {
      if (this.rateLimitConfig.queueRequests) {
        // Wait until window resets
        const waitMs =
          this.rateLimitConfig.windowMs - (now - state.windowStart);
        this.log("warn", `Rate limit reached, waiting ${waitMs}ms`, { host });
        await this.delay(waitMs);

        // Reset state after waiting
        state.windowStart = Date.now();
        state.requestCount = 0;
        state.remaining = this.rateLimitConfig.maxRequests;
      } else {
        throw new RestApiError(
          "Rate limit exceeded",
          429,
          "RATE_LIMIT_EXCEEDED",
          {
            retryAfterMs:
              this.rateLimitConfig.windowMs - (now - state.windowStart),
          },
          true,
        );
      }
    }

    // Increment request count
    state.requestCount++;
    state.remaining = this.rateLimitConfig.maxRequests - state.requestCount;
  }

  /**
   * Get or initialize rate limit state for a host
   */
  private getRateLimitState(host: string): RateLimitState {
    let state = this.rateLimitStates.get(host);
    if (!state) {
      state = {
        requestCount: 0,
        windowStart: Date.now(),
        remaining: this.rateLimitConfig.maxRequests,
      };
      this.rateLimitStates.set(host, state);
    }
    return state;
  }

  /**
   * Update rate limit state from response headers
   * Handles common rate limit header patterns
   */
  private updateRateLimitFromHeaders(
    host: string,
    headers: Record<string, string>,
  ): void {
    const state = this.getRateLimitState(host);

    // Check for standard rate limit headers
    const remaining =
      headers["x-ratelimit-remaining"] || headers["x-rate-limit-remaining"];
    const reset = headers["x-ratelimit-reset"] || headers["x-rate-limit-reset"];
    const retryAfter = headers["retry-after"];

    if (remaining !== undefined) {
      state.remaining = parseInt(remaining, 10);
    }

    if (reset) {
      // Reset can be Unix timestamp or seconds until reset
      const resetValue = parseInt(reset, 10);
      state.resetAt =
        resetValue > 1e10 ? resetValue : Date.now() + resetValue * 1000;
    }

    if (retryAfter) {
      const retryValue = parseInt(retryAfter, 10);
      state.resetAt = Date.now() + retryValue * 1000;
    }
  }

  // ============================================================================
  // URL and Header Building
  // ============================================================================

  /**
   * Build full URL with query parameters
   */
  protected buildUrl(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
  ): string {
    // Ensure path starts with /
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;

    // Build base URL
    let url = `${this.baseUrl}${normalizedPath}`;

    // Add query parameters
    if (query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          params.append(key, String(value));
        }
      }
      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    return url;
  }

  /**
   * Build request headers with authentication
   */
  private async buildRequestHeaders(
    config: POSConnectionConfig,
    customHeaders: Record<string, string>,
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": `Nuvana-POS-Adapter/${this.posType}/1.0`,
      ...customHeaders,
    };

    // Add authentication
    switch (config.credentials.type) {
      case "OAUTH2": {
        const token = await this.getOAuthToken(config);
        headers["Authorization"] = `Bearer ${token}`;
        break;
      }

      case "API_KEY": {
        const headerName = config.credentials.headerName || "X-API-Key";
        headers[headerName] = config.credentials.apiKey;
        break;
      }

      case "BASIC_AUTH": {
        const auth = Buffer.from(
          `${config.credentials.username}:${config.credentials.password}`,
        ).toString("base64");
        headers["Authorization"] = `Basic ${auth}`;
        break;
      }

      case "NONE":
        // No authentication
        break;
    }

    return headers;
  }

  // ============================================================================
  // Error Handling
  // ============================================================================

  /**
   * Extract error message from response data
   */
  protected extractErrorMessage(data: unknown, fallback: string): string {
    if (typeof data === "object" && data !== null) {
      const obj = data as Record<string, unknown>;
      // Try common error message fields
      if (typeof obj.message === "string") return obj.message;
      if (typeof obj.error === "string") return obj.error;
      if (typeof obj.error_description === "string")
        return obj.error_description;
      if (obj.errors && Array.isArray(obj.errors) && obj.errors.length > 0) {
        const firstError = obj.errors[0];
        if (typeof firstError === "string") return firstError;
        if (typeof firstError === "object" && firstError !== null) {
          const errObj = firstError as Record<string, unknown>;
          if (typeof errObj.message === "string") return errObj.message;
        }
      }
    }
    return fallback;
  }

  /**
   * Extract error code from response data
   */
  protected extractErrorCode(data: unknown, statusCode: number): string {
    if (typeof data === "object" && data !== null) {
      const obj = data as Record<string, unknown>;
      if (typeof obj.code === "string") return obj.code;
      if (typeof obj.error_code === "string") return obj.error_code;
      if (typeof obj.error === "string" && !obj.error.includes(" "))
        return obj.error;
    }
    return `HTTP_${statusCode}`;
  }

  /**
   * Normalize any error into a RestApiError
   */
  private normalizeError(error: unknown): RestApiError {
    if (error instanceof RestApiError) {
      return error;
    }

    if (error instanceof Error) {
      const message = error.message;
      let statusCode = 500;
      let errorCode = "UNKNOWN_ERROR";
      let retryable = false;

      // Infer status code from error message
      if (message.includes("ECONNREFUSED")) {
        statusCode = 503;
        errorCode = "CONNECTION_REFUSED";
        retryable = true;
      } else if (message.includes("ENOTFOUND")) {
        statusCode = 503;
        errorCode = "HOST_NOT_FOUND";
        retryable = false;
      } else if (message.includes("ETIMEDOUT") || message.includes("timeout")) {
        statusCode = 408;
        errorCode = "TIMEOUT";
        retryable = true;
      } else if (message.includes("ECONNRESET")) {
        statusCode = 503;
        errorCode = "CONNECTION_RESET";
        retryable = true;
      }

      return new RestApiError(
        message,
        statusCode,
        errorCode,
        undefined,
        retryable,
      );
    }

    return new RestApiError(
      String(error),
      500,
      "UNKNOWN_ERROR",
      undefined,
      false,
    );
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof RestApiError) {
      return error.retryable;
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes("timeout") ||
        message.includes("econnreset") ||
        message.includes("econnrefused") ||
        message.includes("socket hang up")
      );
    }

    return false;
  }

  /**
   * Check if status code is retryable
   */
  private isRetryableStatusCode(statusCode: number): boolean {
    return (
      statusCode === 408 || // Request Timeout
      statusCode === 429 || // Too Many Requests
      statusCode === 500 || // Internal Server Error
      statusCode === 502 || // Bad Gateway
      statusCode === 503 || // Service Unavailable
      statusCode === 504 // Gateway Timeout
    );
  }

  /**
   * Check if error is a rate limit error
   */
  private isRateLimitError(error: unknown): boolean {
    if (error instanceof RestApiError) {
      return error.statusCode === 429;
    }
    return false;
  }

  /**
   * Get retry-after time in milliseconds from error
   */
  private getRetryAfterMs(error: unknown): number {
    if (error instanceof RestApiError && error.details?.retryAfterMs) {
      return error.details.retryAfterMs as number;
    }
    // Default to 1 second
    return 1000;
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoff(attempt: number): number {
    // Base delay * 2^attempt with jitter
    const baseDelay = this.retryDelayMs;
    const exponential = Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.3 + 0.85; // 0.85 to 1.15
    return Math.min(baseDelay * exponential * jitter, 30000); // Cap at 30 seconds
  }

  // ============================================================================
  // Logging
  // ============================================================================

  /**
   * Log outgoing request (with credential redaction)
   */
  private logRequest(
    method: HttpMethod,
    url: string,
    headers: Record<string, string>,
    body?: unknown,
  ): void {
    // Redact sensitive headers
    const safeHeaders = { ...headers };
    for (const key of Object.keys(safeHeaders)) {
      if (
        key.toLowerCase().includes("authorization") ||
        key.toLowerCase().includes("api-key") ||
        key.toLowerCase().includes("secret")
      ) {
        safeHeaders[key] = "[REDACTED]";
      }
    }

    this.log("info", `${method} ${url}`, {
      headers: safeHeaders,
      bodySize: body ? JSON.stringify(body).length : 0,
    });
  }

  /**
   * Log response
   */
  private logResponse(
    method: HttpMethod,
    url: string,
    status: number,
    durationMs: number,
  ): void {
    this.log("info", `${method} ${url} -> ${status} (${durationMs}ms)`);
  }

  // ============================================================================
  // Utility Methods for Subclasses
  // ============================================================================

  /**
   * Paginate through all results from an API endpoint
   *
   * @param config - POS connection configuration
   * @param path - API path
   * @param options - Pagination options
   * @returns All items from all pages
   */
  protected async paginateAll<T>(
    config: POSConnectionConfig,
    path: string,
    options: {
      /** Query parameter for page offset */
      offsetParam?: string;
      /** Query parameter for page limit */
      limitParam?: string;
      /** Items per page */
      pageSize?: number;
      /** Maximum total items to fetch */
      maxItems?: number;
      /** Function to extract items from response */
      extractItems: (data: unknown) => T[];
      /** Function to check if more pages exist */
      hasMore: (data: unknown, itemsFetched: number) => boolean;
      /** Additional query parameters */
      query?: Record<string, string | number | boolean | undefined>;
    },
  ): Promise<T[]> {
    const {
      offsetParam = "offset",
      limitParam = "limit",
      pageSize = 100,
      maxItems = Infinity,
      extractItems,
      hasMore,
      query = {},
    } = options;

    const allItems: T[] = [];
    let offset = 0;

    while (allItems.length < maxItems) {
      const response = await this.get<unknown>(config, path, {
        query: {
          ...query,
          [offsetParam]: offset,
          [limitParam]: Math.min(pageSize, maxItems - allItems.length),
        },
      });

      const items = extractItems(response.data);
      allItems.push(...items);

      if (items.length === 0 || !hasMore(response.data, allItems.length)) {
        break;
      }

      offset += items.length;
    }

    return allItems.slice(0, maxItems);
  }

  /**
   * Clear cached OAuth tokens (useful for testing or token invalidation)
   */
  protected clearTokenCache(): void {
    this.tokenCache.clear();
  }

  /**
   * Reset rate limit state (useful for testing)
   */
  protected resetRateLimits(): void {
    this.rateLimitStates.clear();
  }
}
