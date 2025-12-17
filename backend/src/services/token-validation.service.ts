import jwt from "jsonwebtoken";
import type { JWTPayload } from "./auth.service";

/**
 * Token validation metrics for monitoring
 */
export interface TokenValidationMetrics {
  totalValidations: number;
  successCount: number;
  failureCount: number;
  expiredCount: number;
  invalidSignatureCount: number;
  malformedCount: number;
  lastValidationTime: Date | null;
  averageValidationMs: number;
}

/**
 * Token validation result with timing info
 */
export interface TokenValidationResult {
  success: boolean;
  payload?: JWTPayload;
  error?: string;
  validationTimeMs: number;
}

/**
 * Centralized JWT Token Validation Service (Singleton)
 *
 * This service provides a single point of JWT validation with:
 * - Consistent configuration across all requests
 * - Metrics tracking for monitoring and alerting
 * - Proper issuer/audience claim validation per JWT-003 standard
 * - Clock skew tolerance for distributed systems
 *
 * @security Token validation follows OWASP JWT Cheat Sheet guidelines
 * @production Monitor metrics for anomaly detection (high failure rates)
 */
class TokenValidationService {
  private readonly jwtSecret: string;
  private readonly jwtRefreshSecret: string;
  private readonly issuer: string = "nuvana-backend";
  private readonly audience: string = "nuvana-api";
  private readonly clockToleranceSeconds: number = 30; // 30 second clock skew tolerance

  // Metrics tracking
  private metrics: TokenValidationMetrics = {
    totalValidations: 0,
    successCount: 0,
    failureCount: 0,
    expiredCount: 0,
    invalidSignatureCount: 0,
    malformedCount: 0,
    lastValidationTime: null,
    averageValidationMs: 0,
  };

  // Running sum for average calculation
  private totalValidationTimeMs: number = 0;

  constructor() {
    const jwtSecret = process.env.JWT_SECRET;
    const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;

    if (!jwtSecret || !jwtRefreshSecret) {
      throw new Error(
        "JWT_SECRET and JWT_REFRESH_SECRET must be set in environment variables",
      );
    }

    this.jwtSecret = jwtSecret;
    this.jwtRefreshSecret = jwtRefreshSecret;

    // Log initialization confirmation only (no secrets or sensitive config)
    if (process.env.NODE_ENV !== "production") {
      console.log("[TokenValidationService] Singleton initialized");
    }
  }

  /**
   * Verify and decode access token with full claim validation
   *
   * Validates:
   * - Token signature (cryptographic verification)
   * - Issuer claim (must match expected issuer)
   * - Audience claim (must match expected audience)
   * - Expiration claim (with clock skew tolerance)
   * - Required payload fields (user_id, email)
   *
   * @param token - JWT access token string
   * @returns TokenValidationResult with payload on success or error details
   *
   * @security Never throws - returns structured error for logging
   */
  verifyAccessToken(token: string): TokenValidationResult {
    const startTime = performance.now();

    try {
      this.metrics.totalValidations++;

      // Validate token is present and properly formatted
      if (!token || typeof token !== "string") {
        this.recordFailure("malformed", startTime);
        return {
          success: false,
          error: "Token is missing or not a string",
          validationTimeMs: this.calculateElapsed(startTime),
        };
      }

      // Basic structure check (three dot-separated segments)
      const segments = token.split(".");
      if (segments.length !== 3) {
        this.recordFailure("malformed", startTime);
        return {
          success: false,
          error: "Token structure is invalid",
          validationTimeMs: this.calculateElapsed(startTime),
        };
      }

      // Verify token with all claim validations
      const decoded = jwt.verify(token, this.jwtSecret, {
        issuer: this.issuer,
        audience: this.audience,
        clockTolerance: this.clockToleranceSeconds,
      }) as JWTPayload;

      // Validate required claims are present
      if (!decoded.user_id || !decoded.email) {
        this.recordFailure("malformed", startTime);
        return {
          success: false,
          error: "Token missing required claims (user_id or email)",
          validationTimeMs: this.calculateElapsed(startTime),
        };
      }

      // Success - record metrics
      this.recordSuccess(startTime);

      return {
        success: true,
        payload: decoded,
        validationTimeMs: this.calculateElapsed(startTime),
      };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        this.recordFailure("expired", startTime);
        return {
          success: false,
          error: "Access token has expired",
          validationTimeMs: this.calculateElapsed(startTime),
        };
      }

      if (error instanceof jwt.JsonWebTokenError) {
        // Distinguish between signature and other JWT errors
        const message = error.message.toLowerCase();
        if (
          message.includes("signature") ||
          message.includes("invalid token")
        ) {
          this.recordFailure("invalidSignature", startTime);
          return {
            success: false,
            error: "Invalid token signature",
            validationTimeMs: this.calculateElapsed(startTime),
          };
        }

        this.recordFailure("malformed", startTime);
        return {
          success: false,
          error: "Invalid access token",
          validationTimeMs: this.calculateElapsed(startTime),
        };
      }

      // Unexpected error - log and return generic message
      console.error("[TokenValidationService] Unexpected validation error:", {
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });

      this.recordFailure("malformed", startTime);
      return {
        success: false,
        error: "Token verification failed",
        validationTimeMs: this.calculateElapsed(startTime),
      };
    }
  }

  /**
   * Legacy method for backward compatibility with AuthService
   * Throws errors instead of returning result object
   *
   * @deprecated Use verifyAccessToken() which returns structured result
   */
  verifyAccessTokenOrThrow(token: string): JWTPayload {
    const result = this.verifyAccessToken(token);

    if (!result.success || !result.payload) {
      throw new Error(result.error || "Token validation failed");
    }

    return result.payload;
  }

  /**
   * Verify refresh token (delegates to existing AuthService pattern)
   * Refresh tokens require Redis lookup for revocation checking
   *
   * @param token - JWT refresh token string
   * @returns Decoded payload with user_id, email, jti
   * @throws Error if token is invalid, expired, or revoked
   */
  verifyRefreshToken(token: string): {
    user_id: string;
    email: string;
    jti?: string;
  } {
    try {
      const decoded = jwt.verify(token, this.jwtRefreshSecret, {
        issuer: this.issuer,
        audience: this.audience,
        clockTolerance: this.clockToleranceSeconds,
      }) as { user_id: string; email: string; jti?: string };

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error("Refresh token has expired");
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error("Invalid refresh token");
      }
      throw new Error("Token verification failed");
    }
  }

  /**
   * Get current validation metrics
   * Use for monitoring dashboards and alerting
   */
  getMetrics(): TokenValidationMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics (useful for testing or periodic reset)
   */
  resetMetrics(): void {
    this.metrics = {
      totalValidations: 0,
      successCount: 0,
      failureCount: 0,
      expiredCount: 0,
      invalidSignatureCount: 0,
      malformedCount: 0,
      lastValidationTime: null,
      averageValidationMs: 0,
    };
    this.totalValidationTimeMs = 0;
  }

  /**
   * Check if failure rate exceeds threshold
   * @param thresholdPercent - Failure rate threshold (e.g., 10 for 10%)
   * @returns true if failure rate exceeds threshold
   */
  isFailureRateHigh(thresholdPercent: number = 10): boolean {
    if (this.metrics.totalValidations === 0) return false;

    const failureRate =
      (this.metrics.failureCount / this.metrics.totalValidations) * 100;
    return failureRate > thresholdPercent;
  }

  // Private helper methods

  private calculateElapsed(startTime: number): number {
    return performance.now() - startTime;
  }

  private recordSuccess(startTime: number): void {
    const elapsed = this.calculateElapsed(startTime);
    this.metrics.successCount++;
    this.metrics.lastValidationTime = new Date();
    this.totalValidationTimeMs += elapsed;
    this.metrics.averageValidationMs =
      this.totalValidationTimeMs / this.metrics.totalValidations;
  }

  private recordFailure(
    type: "expired" | "invalidSignature" | "malformed",
    startTime: number,
  ): void {
    const elapsed = this.calculateElapsed(startTime);
    this.metrics.failureCount++;
    this.metrics.lastValidationTime = new Date();
    this.totalValidationTimeMs += elapsed;
    this.metrics.averageValidationMs =
      this.totalValidationTimeMs / this.metrics.totalValidations;

    switch (type) {
      case "expired":
        this.metrics.expiredCount++;
        break;
      case "invalidSignature":
        this.metrics.invalidSignatureCount++;
        break;
      case "malformed":
        this.metrics.malformedCount++;
        break;
    }
  }
}

// Lazy singleton instance - created on first access to allow env vars to be loaded
let _instance: TokenValidationService | null = null;

/**
 * Get the singleton TokenValidationService instance
 * Uses lazy initialization to allow environment variables to be set before first access
 */
export const tokenValidationService = {
  get instance(): TokenValidationService {
    if (!_instance) {
      _instance = new TokenValidationService();
    }
    return _instance;
  },

  // Delegate all methods to the lazy instance
  verifyAccessToken(token: string): TokenValidationResult {
    return this.instance.verifyAccessToken(token);
  },

  verifyAccessTokenOrThrow(token: string): JWTPayload {
    return this.instance.verifyAccessTokenOrThrow(token);
  },

  verifyRefreshToken(token: string): {
    user_id: string;
    email: string;
    jti?: string;
  } {
    return this.instance.verifyRefreshToken(token);
  },

  getMetrics(): TokenValidationMetrics {
    return this.instance.getMetrics();
  },

  resetMetrics(): void {
    this.instance.resetMetrics();
  },

  isFailureRateHigh(thresholdPercent?: number): boolean {
    return this.instance.isFailureRateHigh(thresholdPercent);
  },

  // Allow resetting singleton for tests
  _resetInstance(): void {
    _instance = null;
  },
};

// Export class for testing purposes only
export { TokenValidationService };
