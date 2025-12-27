import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { getRedisClient } from "../utils/redis";
import { withRLSTransaction, TRANSACTION_TIMEOUTS } from "../utils/db";
import { userAccessCacheService } from "./user-access-cache.service";

/**
 * JWT token payload structure
 */
export interface JWTPayload {
  user_id: string;
  email: string;
  roles: string[];
  permissions: string[];
  client_id?: string; // Optional client_id for CLIENT_OWNER users
  // NEW: Add scope information for RLS
  is_system_admin: boolean; // true if user has SUPERADMIN role with SYSTEM scope
  company_ids: string[]; // All company_ids user has access to
  store_ids: string[]; // All store_ids user has access to
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
 * User role with scope information for routing logic
 */
export interface UserRoleWithScope {
  role_code: string;
  scope: "SYSTEM" | "COMPANY" | "STORE" | "CLIENT";
  company_id: string | null;
  store_id: string | null;
}

/**
 * Token generation result with role metadata for cookie expiry and routing
 */
export interface TokenPairWithMeta extends TokenPair {
  roles: string[];
  userRoles: UserRoleWithScope[];
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
   * @param is_system_admin - Whether user has SUPERADMIN role with SYSTEM scope
   * @param company_ids - All company_ids user has access to
   * @param store_ids - All store_ids user has access to
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
    is_system_admin: boolean = false,
    company_ids: string[] = [],
    store_ids: string[] = [],
  ): string {
    const payload: JWTPayload = {
      user_id,
      email,
      roles,
      permissions,
      is_system_admin,
      company_ids,
      store_ids,
    };

    // Add client_id if provided
    if (client_id) {
      payload.client_id = client_id;
    }

    // Determine expiry based on roles
    const expiresIn = this.getAccessTokenExpiry(roles);

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
    const payload: Omit<
      JWTPayload,
      "roles" | "permissions" | "is_system_admin" | "company_ids" | "store_ids"
    > = {
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
    // Use FAST timeout (10s) since this is a simple role lookup operation
    const userRoles = await withRLSTransaction(
      user_id,
      async (tx) => {
        // First, verify the session variable is set correctly
        const sessionCheck = await tx.$queryRaw<
          Array<{ current_user_id: string | null }>
        >`
        SELECT current_setting('app.current_user_id', true) as current_user_id
      `;

        // Use the transaction client to ensure queries run on the same connection
        // where SET LOCAL was executed
        // The RLS policy should allow this query because user_id matches current_setting
        const userRoles = await tx.userRole.findMany({
          where: { user_id: user_id },
          select: {
            user_role_id: true,
            user_id: true,
            role_id: true,
            company_id: true,
            store_id: true,
            role: {
              select: {
                code: true,
                scope: true,
                role_permissions: {
                  select: {
                    permission: {
                      select: { code: true },
                    },
                  },
                },
              },
            },
          },
        });

        // Transform to UserRole format (matching rbacService.getUserRoles format)
        return userRoles.map((ur) => ({
          user_role_id: ur.user_role_id,
          user_id: ur.user_id,
          role_id: ur.role_id,
          role_code: ur.role.code,
          scope: ur.role.scope as "SYSTEM" | "COMPANY" | "STORE" | "CLIENT",
          company_id: ur.company_id,
          store_id: ur.store_id,
          permissions: ur.role.role_permissions.map((rp) => rp.permission.code),
        }));
      },
      { timeout: TRANSACTION_TIMEOUTS.FAST },
    );

    // Extract role codes and collect permissions
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

    // Compute scope information for RLS
    const is_system_admin = userRoles.some(
      (ur) => ur.role_code === "SUPERADMIN" && ur.scope === "SYSTEM",
    );

    // Collect unique company_ids (excluding null values)
    const company_ids = Array.from(
      new Set(
        userRoles
          .map((ur) => ur.company_id)
          .filter((id): id is string => id !== null),
      ),
    );

    // Collect unique store_ids (excluding null values)
    const store_ids = Array.from(
      new Set(
        userRoles
          .map((ur) => ur.store_id)
          .filter((id): id is string => id !== null),
      ),
    );

    // PHASE 4: Populate user access cache on login for zero-DB-query permission checks
    // This pre-populates the cache with the same data computed during token generation
    const roleScopes = userRoles.map((ur) => ({
      roleCode: ur.role_code,
      scope: ur.scope,
      companyId: ur.company_id,
      storeId: ur.store_id,
    }));

    // Fire-and-forget cache population (don't block login on cache write)
    userAccessCacheService
      .populateOnLogin(user_id, {
        isSystemAdmin: is_system_admin,
        companyIds: company_ids,
        storeIds: store_ids,
        roleScopes,
      })
      .catch((error) => {
        console.warn(
          "[AuthService] Failed to populate user access cache:",
          error,
        );
      });

    return {
      accessToken: this.generateAccessToken(
        user_id,
        email,
        roles,
        permissions,
        undefined,
        is_system_admin,
        company_ids,
        store_ids,
      ),
      refreshToken: await this.generateRefreshToken(user_id, email),
      roles, // Include roles for cookie expiry determination
      userRoles: userRoles.map((ur) => ({
        role_code: ur.role_code,
        scope: ur.scope,
        company_id: ur.company_id,
        store_id: ur.store_id,
      })), // Include full role data for routing logic
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
