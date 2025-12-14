import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { getRedisClient } from "../utils/redis";
import { withRLSTransaction } from "../utils/db";

/**
 * JWT token payload structure
 */
export interface JWTPayload {
  user_id: string;
  email: string;
  roles: string[];
  permissions: string[];
  client_id?: string; // Optional client_id for CLIENT_OWNER users
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
 * Token generation result with role metadata for cookie expiry
 */
export interface TokenPairWithMeta extends TokenPair {
  roles: string[];
}

/**
 * JWT service for token generation and validation
 * Implements secure JWT token generation with access and refresh tokens
 */
export class AuthService {
  private readonly jwtSecret: string;
  private readonly jwtRefreshSecret: string;
  private readonly defaultAccessTokenExpiry: string;
  private readonly superAdminAccessTokenExpiry: string;
  private readonly clientUserAccessTokenExpiry: string;
  private readonly refreshTokenExpiry: string;

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || "";
    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || "";

    if (!this.jwtSecret || !this.jwtRefreshSecret) {
      throw new Error(
        "JWT_SECRET and JWT_REFRESH_SECRET must be set in environment variables",
      );
    }

    // Configure token expiry times from environment variables with defaults
    this.defaultAccessTokenExpiry = process.env.ACCESS_TOKEN_EXPIRY || "1h";
    this.superAdminAccessTokenExpiry =
      process.env.SUPER_ADMIN_TOKEN_EXPIRY || "8h";
    // CLIENT_USER gets 30 days - effectively "indefinite" for session-based login
    this.clientUserAccessTokenExpiry =
      process.env.CLIENT_USER_TOKEN_EXPIRY || "30d";
    this.refreshTokenExpiry = process.env.REFRESH_TOKEN_EXPIRY || "7d";

    // Log configuration in non-production environments for debugging
    if (process.env.NODE_ENV !== "production") {
      console.log("[AuthService] Token expiry configuration:", {
        defaultAccessTokenExpiry: this.defaultAccessTokenExpiry,
        superAdminAccessTokenExpiry: this.superAdminAccessTokenExpiry,
        clientUserAccessTokenExpiry: this.clientUserAccessTokenExpiry,
        refreshTokenExpiry: this.refreshTokenExpiry,
      });
    }
  }

  /**
   * Determine access token expiry based on user roles
   * - SUPERADMIN: 8 hours (configurable via SUPER_ADMIN_TOKEN_EXPIRY)
   * - CLIENT_USER: 30 days (configurable via CLIENT_USER_TOKEN_EXPIRY) - effectively "indefinite"
   * - All others (CLIENT_OWNER): 1 hour (configurable via ACCESS_TOKEN_EXPIRY)
   * @param roles - User roles array
   * @returns Token expiry string (e.g., "1h", "8h", or "30d")
   */
  private getAccessTokenExpiry(roles: string[] = []): string {
    if (roles.includes("SUPERADMIN")) {
      return this.superAdminAccessTokenExpiry;
    }
    if (roles.includes("CLIENT_USER")) {
      return this.clientUserAccessTokenExpiry;
    }
    return this.defaultAccessTokenExpiry;
  }

  /**
   * Get cookie maxAge in seconds based on user roles
   * - SUPERADMIN: 8 hours (28800 seconds)
   * - CLIENT_USER: 30 days (2592000 seconds) - effectively "indefinite" for long-term login
   * - All others (CLIENT_OWNER): 1 hour (3600 seconds)
   * @param roles - User roles array
   * @returns Cookie maxAge in seconds
   */
  static getCookieMaxAge(roles: string[] = []): number {
    // SUPERADMIN gets 8 hours
    if (roles.includes("SUPERADMIN")) {
      return 8 * 60 * 60; // 8 hours in seconds
    }
    // CLIENT_USER gets 30 days - effectively "indefinite" for long-term login
    if (roles.includes("CLIENT_USER")) {
      return 30 * 24 * 60 * 60; // 30 days in seconds
    }
    // All other users (CLIENT_OWNER) get 1 hour
    return 60 * 60; // 1 hour in seconds
  }

  /**
   * Generate access token with role-based expiry
   * Super admins: 8 hours (default), Regular users: 1 hour (default)
   * Configurable via ACCESS_TOKEN_EXPIRY and SUPER_ADMIN_TOKEN_EXPIRY environment variables
   *
   * @param user_id - User ID from database
   * @param email - User email
   * @param roles - User roles array (empty array if no roles assigned yet)
   * @param permissions - User permissions array (empty array if no permissions assigned yet)
   * @param client_id - Optional client_id for CLIENT_OWNER users
   * @returns Signed JWT access token
   *
   * @security Audit log entry is created when super admin tokens are generated
   * @production Monitor super admin token generation patterns for anomaly detection
   */
  generateAccessToken(
    user_id: string,
    email: string,
    roles: string[] = [],
    permissions: string[] = [],
    client_id?: string,
  ): string {
    const payload: JWTPayload = {
      user_id,
      email,
      roles,
      permissions,
    };

    // Add client_id if provided
    if (client_id) {
      payload.client_id = client_id;
    }

    // Determine expiry based on roles
    const expiresIn = this.getAccessTokenExpiry(roles);
    const isSuperAdmin = roles.includes("SUPERADMIN");

    // Audit logging for super admin token generation
    if (isSuperAdmin) {
      console.log("[AUDIT] Super admin token generated:", {
        user_id,
        email,
        expiresIn,
        timestamp: new Date().toISOString(),
        client_id: client_id || "N/A",
      });
    }

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn,
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
   * Includes client_id in token if user has CLIENT_OWNER role
   * @param user_id - User ID from database
   * @param email - User email
   * @returns Token pair with access and refresh tokens, including roles, permissions, and client_id
   */
  async generateTokenPairWithRBAC(
    user_id: string,
    email: string,
  ): Promise<TokenPairWithMeta> {
    // Fetch user roles from database with RLS transaction
    // RLS policies on user_roles table require app.current_user_id PostgreSQL session variable
    // Using withRLSTransaction ensures the session variable is set on the same connection
    // This is critical in AWS environments with connection pooling (RDS Proxy/PgBouncer)
    //
    // IMPORTANT: The RLS policy has a condition: user_id::text = current_setting('app.current_user_id', true)
    // This allows users to see their own roles, bypassing the circular dependency with app.is_system_admin()
    const userRoles = await withRLSTransaction(user_id, async (tx) => {
      // First, verify the session variable is set correctly
      const sessionCheck = await tx.$queryRaw<
        Array<{ current_user_id: string | null }>
      >`
        SELECT current_setting('app.current_user_id', true) as current_user_id
      `;

      // Log in all environments to debug staging issues
      console.log("[AuthService] RLS context check:", {
        user_id,
        sessionUserId: sessionCheck[0]?.current_user_id,
        match: sessionCheck[0]?.current_user_id === user_id,
        environment: process.env.NODE_ENV,
      });

      // Use the transaction client to ensure queries run on the same connection
      // where SET LOCAL was executed
      // The RLS policy should allow this query because user_id matches current_setting
      const userRoles = await tx.userRole.findMany({
        where: {
          user_id: user_id,
        },
        include: {
          role: {
            include: {
              role_permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      });

      // Log in all environments to debug staging issues
      console.log("[AuthService] Fetched user roles:", {
        user_id,
        roleCount: userRoles.length,
        roles: userRoles.map((ur) => ur.role.code),
        permissions: userRoles.flatMap((ur) =>
          ur.role.role_permissions.map((rp: any) => rp.permission.code),
        ),
        environment: process.env.NODE_ENV,
      });

      // If no roles found, this is a critical error - log it
      if (userRoles.length === 0) {
        console.error(
          "[AuthService] CRITICAL: No roles found for user during token generation!",
          {
            user_id,
            email,
            sessionUserId: sessionCheck[0]?.current_user_id,
            environment: process.env.NODE_ENV,
          },
        );
      }

      // Transform to UserRole format (matching rbacService.getUserRoles format)
      return userRoles.map((ur: any) => ({
        user_role_id: ur.user_role_id,
        user_id: ur.user_id,
        role_id: ur.role_id,
        role_code: ur.role.code,
        scope: ur.role.scope as "SYSTEM" | "COMPANY" | "STORE" | "CLIENT",
        client_id: ur.client_id,
        company_id: ur.company_id,
        store_id: ur.store_id,
        permissions: ur.role.role_permissions.map(
          (rp: any) => rp.permission.code,
        ),
      }));
    });

    // Extract role codes, collect permissions, and find client_id
    const roles: string[] = [];
    const permissionsSet = new Set<string>();
    let client_id: string | undefined;

    for (const userRole of userRoles) {
      roles.push(userRole.role_code);
      // Add all permissions from this role
      for (const permission of userRole.permissions) {
        permissionsSet.add(permission);
      }
      // If user has CLIENT_OWNER role, extract client_id
      if (userRole.role_code === "CLIENT_OWNER" && userRole.client_id) {
        client_id = userRole.client_id;
      }
    }

    const permissions = Array.from(permissionsSet);

    // Log final token generation details
    console.log("[AuthService] Token generation summary:", {
      user_id,
      email,
      roles,
      permissions,
      hasAdminPermission: permissions.includes("ADMIN_SYSTEM_CONFIG"),
      environment: process.env.NODE_ENV,
    });

    return {
      accessToken: this.generateAccessToken(
        user_id,
        email,
        roles,
        permissions,
        client_id,
      ),
      refreshToken: await this.generateRefreshToken(user_id, email),
      roles, // Include roles for cookie expiry determination
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
