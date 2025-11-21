import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { rbacService } from "./rbac.service";
import { getRedisClient } from "../utils/redis";

/**
 * JWT token payload structure
 */
export interface JWTPayload {
  user_id: string;
  email: string;
  roles: string[];
  permissions: string[];
  jti?: string; // JWT ID for token tracking/invalidation
  iat?: number;
  exp?: number;
}

/**
 * Token generation result
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * JWT service for token generation and validation
 * Implements secure JWT token generation with access and refresh tokens
 */
export class AuthService {
  private readonly jwtSecret: string;
  private readonly jwtRefreshSecret: string;
  private readonly accessTokenExpiry: string = "15m"; // 15 minutes
  private readonly refreshTokenExpiry: string = "7d"; // 7 days

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || "";
    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || "";

    if (!this.jwtSecret || !this.jwtRefreshSecret) {
      throw new Error(
        "JWT_SECRET and JWT_REFRESH_SECRET must be set in environment variables",
      );
    }
  }

  /**
   * Generate access token with 15 minute expiry
   * @param user_id - User ID from database
   * @param email - User email
   * @param roles - User roles array (empty array if no roles assigned yet)
   * @param permissions - User permissions array (empty array if no permissions assigned yet)
   * @returns Signed JWT access token
   */
  generateAccessToken(
    user_id: string,
    email: string,
    roles: string[] = [],
    permissions: string[] = [],
  ): string {
    const payload: JWTPayload = {
      user_id,
      email,
      roles,
      permissions,
    };

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.accessTokenExpiry as string,
      issuer: "nuvana-backend",
      audience: "nuvana-api",
    } as jwt.SignOptions);
  }

  /**
   * Generate refresh token with 7 day expiry
   * Stores token JTI in Redis for rotation/invalidation
   * @param user_id - User ID from database
   * @param email - User email
   * @returns Signed JWT refresh token
   */
  async generateRefreshToken(user_id: string, email: string): Promise<string> {
    const jti = randomUUID();
    const payload: Omit<JWTPayload, "roles" | "permissions"> = {
      user_id,
      email,
      jti,
    };

    const token = jwt.sign(payload, this.jwtRefreshSecret, {
      expiresIn: this.refreshTokenExpiry as string,
      issuer: "nuvana-backend",
      audience: "nuvana-api",
    } as jwt.SignOptions);

    // Store token JTI in Redis for tracking (7 days TTL)
    try {
      const redis = await getRedisClient();
      if (redis) {
        await redis.setEx(`refresh_token:${jti}`, 7 * 24 * 60 * 60, user_id);
      }
    } catch (error) {
      console.error("Failed to store refresh token in Redis:", error);
      // Continue even if Redis fails - token will still work but won't be revocable
    }

    return token;
  }

  /**
   * Generate both access and refresh tokens with roles and permissions from database
   * @param user_id - User ID from database
   * @param email - User email
   * @returns Token pair with access and refresh tokens, including roles and permissions
   */
  async generateTokenPairWithRBAC(
    user_id: string,
    email: string,
  ): Promise<TokenPair> {
    // Fetch user roles from database
    const userRoles = await rbacService.getUserRoles(user_id);

    // Extract role codes and collect all unique permissions
    const roles: string[] = [];
    const permissionsSet = new Set<string>();

    for (const userRole of userRoles) {
      roles.push(userRole.role_code);
      // Add all permissions from this role
      for (const permission of userRole.permissions) {
        permissionsSet.add(permission);
      }
    }

    const permissions = Array.from(permissionsSet);

    return {
      accessToken: this.generateAccessToken(user_id, email, roles, permissions),
      refreshToken: await this.generateRefreshToken(user_id, email),
    };
  }

  /**
   * Generate both access and refresh tokens
   * @param user_id - User ID from database
   * @param email - User email
   * @param roles - User roles array (optional, will fetch from DB if not provided)
   * @param permissions - User permissions array (optional, will fetch from DB if not provided)
   * @returns Token pair with access and refresh tokens
   */
  async generateTokenPair(
    user_id: string,
    email: string,
    roles?: string[],
    permissions?: string[],
  ): Promise<TokenPair> {
    // If roles/permissions not provided, fetch from database
    if (roles === undefined || permissions === undefined) {
      return this.generateTokenPairWithRBAC(user_id, email);
    }

    return {
      accessToken: this.generateAccessToken(user_id, email, roles, permissions),
      refreshToken: await this.generateRefreshToken(user_id, email),
    };
  }

  /**
   * Verify and decode access token
   * @param token - JWT access token
   * @returns Decoded token payload
   * @throws Error if token is invalid, expired, or missing
   */
  verifyAccessToken(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, this.jwtSecret, {
        issuer: "nuvana-backend",
        audience: "nuvana-api",
      }) as JWTPayload;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error("Access token has expired");
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error("Invalid access token");
      }
      throw new Error("Token verification failed");
    }
  }

  /**
   * Verify and decode refresh token
   * Checks Redis to ensure token hasn't been invalidated
   * @param token - JWT refresh token
   * @returns Decoded token payload with user_id, email, and jti
   * @throws Error if token is invalid, expired, revoked, or missing
   */
  async verifyRefreshToken(
    token: string,
  ): Promise<{ user_id: string; email: string; jti?: string }> {
    try {
      const decoded = jwt.verify(token, this.jwtRefreshSecret, {
        issuer: "nuvana-backend",
        audience: "nuvana-api",
      }) as { user_id: string; email: string; jti?: string };

      // Check if token exists in Redis (not revoked)
      if (decoded.jti) {
        const redis = await getRedisClient();
        if (redis) {
          const exists = await redis.exists(`refresh_token:${decoded.jti}`);
          if (!exists) {
            throw new Error("Refresh token has been revoked");
          }
        }
        // If Redis is unavailable, we cannot verify token validity - fail securely
        else {
          throw new Error(
            "Cannot verify refresh token - token validation service unavailable",
          );
        }
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error("Refresh token has expired");
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error("Invalid refresh token");
      } else if (error instanceof Error && error.message.includes("revoked")) {
        throw error; // Re-throw revoked token error
      }
      throw new Error("Token verification failed");
    }
  }

  /**
   * Invalidate a refresh token by removing it from Redis
   * @param jti - JWT ID of the token to invalidate
   */
  async invalidateRefreshToken(jti: string): Promise<void> {
    try {
      const redis = await getRedisClient();
      if (redis) {
        await redis.del(`refresh_token:${jti}`);
      }
    } catch (error) {
      console.error("Failed to invalidate refresh token in Redis:", error);
      // Don't throw - this is a best-effort operation
    }
  }
}
