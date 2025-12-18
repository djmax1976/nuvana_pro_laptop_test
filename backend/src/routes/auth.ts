import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import bcrypt from "bcryptjs";
import { getUserById } from "../services/user.service";
import { AuthService } from "../services/auth.service";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { z } from "zod";
import { prisma } from "../utils/db";
import { RBACService } from "../services/rbac.service";
import { PERMISSIONS } from "../constants/permissions";
import type { AuditContext } from "../services/cashier.service";

/**
 * Helper to extract audit context from request
 */
function getAuditContext(
  request: FastifyRequest,
  user: UserIdentity | null,
): AuditContext {
  const ipAddress =
    (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
    request.ip ||
    request.socket.remoteAddress ||
    null;
  const userAgent = request.headers["user-agent"] || null;

  return {
    userId: user?.id || "system",
    userEmail: user?.email || "system",
    userRoles: user?.roles || [],
    ipAddress,
    userAgent,
  };
}

// NOTE: OAuth has been removed from this application
// Using local email/password authentication with bcrypt

// Validation schema for client login
const clientLoginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export async function authRoutes(fastify: FastifyInstance) {
  /**
   * Login endpoint - Local email/password authentication
   * POST /api/auth/login
   * Validates credentials, generates JWT tokens with RBAC
   */
  fastify.post(
    "/api/auth/login",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { email, password } = request.body as {
          email: string;
          password: string;
        };

        // Validate input
        if (!email || !password) {
          reply.code(400);
          reply.send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Email and password are required",
            },
          });
          return;
        }

        // Find user by email
        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase().trim() },
          select: {
            user_id: true,
            email: true,
            password_hash: true,
            status: true,
            name: true,
            is_client_user: true,
          },
        });

        if (!user) {
          reply.code(401);
          reply.send({
            success: false,
            error: {
              code: "UNAUTHORIZED",
              message: "Invalid email or password",
            },
          });
          return;
        }

        // Check if user is active
        if (user.status !== "ACTIVE") {
          reply.code(401);
          reply.send({
            success: false,
            error: {
              code: "UNAUTHORIZED",
              message: "Account is inactive",
            },
          });
          return;
        }

        // Check if user has a password set
        // Return generic message to not leak account existence
        if (!user.password_hash) {
          reply.code(401);
          reply.send({
            success: false,
            error: {
              code: "UNAUTHORIZED",
              message: "Invalid email or password",
            },
          });
          return;
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(
          password,
          user.password_hash,
        );

        if (!isValidPassword) {
          reply.code(401);
          reply.send({
            success: false,
            error: {
              code: "UNAUTHORIZED",
              message: "Invalid email or password",
            },
          });
          return;
        }

        // Generate JWT tokens with RBAC data using RLS-aware transaction
        // This ensures RLS policies are satisfied when querying user_roles table
        // Returns userRoles for routing logic without needing a second query
        const authService = new AuthService();
        const { accessToken, refreshToken, roles, userRoles } =
          await authService.generateTokenPairWithRBAC(user.user_id, user.email);

        // Set httpOnly cookies
        // Determine if request is over HTTPS (check protocol or x-forwarded-proto header)
        // Only use secure cookies if actually over HTTPS, not just in production
        const isSecure =
          request.protocol === "https" ||
          request.headers["x-forwarded-proto"] === "https";

        // Determine SameSite policy based on deployment context
        // For cross-origin deployments (e.g., Railway where frontend/backend are different domains),
        // we need SameSite=None with Secure=true for cookies to be sent cross-origin
        // For same-origin deployments (localhost or same domain), SameSite=Lax provides better CSRF protection
        const isCrossOrigin = isSecure && process.env.NODE_ENV === "production";
        const sameSitePolicy = isCrossOrigin ? "none" : "lax";

        // Get cookie maxAge based on role:
        // - SUPERADMIN: 8 hours
        // - CLIENT_USER: undefined (session cookie - no expiry until logout)
        // - Others: 1 hour
        const cookieMaxAge = AuthService.getCookieMaxAge(roles);

        // Access token cookie with role-based expiry
        const accessCookieOptions: any = {
          httpOnly: true,
          secure: isSecure,
          sameSite: sameSitePolicy,
          path: "/",
        };
        if (cookieMaxAge !== undefined) {
          accessCookieOptions.maxAge = cookieMaxAge;
        }
        (reply as any).setCookie(
          "access_token",
          accessToken,
          accessCookieOptions,
        );

        // Refresh token cookie (7 days expiry, or session for CLIENT_USER)
        const refreshCookieOptions: any = {
          httpOnly: true,
          secure: isSecure,
          sameSite: sameSitePolicy,
          path: "/",
        };
        if (cookieMaxAge !== undefined) {
          // For non-session cookies, refresh token gets 7 days
          refreshCookieOptions.maxAge = 7 * 24 * 60 * 60; // 7 days in seconds
        }
        (reply as any).setCookie(
          "refresh_token",
          refreshToken,
          refreshCookieOptions,
        );

        // Extract role codes for routing logic (already have from roles array)
        const roleCodes = roles;

        // Determine if user should access client dashboard
        // A user is a client user if:
        // 1. They have is_client_user = true in database, OR
        // 2. They have COMPANY or STORE scope roles (CLIENT_OWNER, STORE_MANAGER, etc.)
        // This ensures employees created before the is_client_user fix still work
        let isClientUser = user.is_client_user;

        const hasClientRole = userRoles.some(
          (ur) => ur.scope === "COMPANY" || ur.scope === "STORE",
        );

        if (!isClientUser && hasClientRole) {
          isClientUser = true;
          // Update the database to fix the is_client_user flag for future logins
          try {
            await prisma.user.update({
              where: { user_id: user.user_id },
              data: { is_client_user: true },
            });
          } catch (updateError) {
            // Log error but don't fail the login
            fastify.log.error(
              {
                error: updateError,
                user_id: user.user_id,
                context: "best-effort migration of is_client_user",
              },
              "Failed to update is_client_user flag during login",
            );
          }
        }

        // Determine primary user role for routing:
        // - CLIENT_USER goes to /mystore (terminal dashboard)
        // - CLIENT_OWNER goes to /dashboard (client owner dashboard)
        // - STORE_MANAGER, SHIFT_MANAGER, CASHIER go to /mystore
        // Priority: CLIENT_OWNER > CLIENT_USER > STORE_MANAGER > SHIFT_MANAGER > CASHIER
        let userRole: string | null = null;
        if (roleCodes.includes("CLIENT_OWNER")) {
          userRole = "CLIENT_OWNER";
        } else if (roleCodes.includes("CLIENT_USER")) {
          userRole = "CLIENT_USER";
        } else if (roleCodes.includes("STORE_MANAGER")) {
          userRole = "STORE_MANAGER";
        } else if (roleCodes.includes("SHIFT_MANAGER")) {
          userRole = "SHIFT_MANAGER";
        } else if (roleCodes.includes("CASHIER")) {
          userRole = "CASHIER";
        } else if (roleCodes.includes("SUPERADMIN")) {
          userRole = "SUPERADMIN";
        }

        // Return success response with user data (including user_role for routing)
        reply.code(200);
        reply.send({
          success: true,
          data: {
            message: "Login successful",
            user: {
              id: user.user_id,
              email: user.email,
              name: user.name,
              is_client_user: isClientUser,
              user_role: userRole,
              roles: roleCodes,
            },
          },
        });
        return;
      } catch (error) {
        fastify.log.error({ error }, "Login error");
        reply.code(500);
        reply.send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "An error occurred during login",
          },
        });
      }
    },
  );

  /**
   * Client Login endpoint - Email/password authentication for client users
   * POST /api/auth/client-login
   * Only users with is_client_user = true can use this endpoint
   * @security Client users are company owners who access the client dashboard
   */
  fastify.post(
    "/api/auth/client-login",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Guard against null/undefined body
        if (!request.body || typeof request.body !== "object") {
          reply.code(400);
          return {
            error: "Bad Request",
            message: "Request body is required",
          };
        }

        // Validate input with Zod schema
        const parseResult = clientLoginSchema.safeParse(request.body);
        if (!parseResult.success) {
          // Extract first error message from Zod issues
          const firstIssue = parseResult.error.issues[0];
          const message =
            firstIssue?.path[0] === "email" &&
            firstIssue?.code === "invalid_type"
              ? "Email is required"
              : firstIssue?.path[0] === "password" &&
                  firstIssue?.code === "invalid_type"
                ? "Password is required"
                : firstIssue?.message || "Invalid input";

          reply.code(400);
          return {
            error: "Bad Request",
            message,
          };
        }

        const { email, password } = parseResult.data;

        // Normalize email to lowercase
        const normalizedEmail = email.toLowerCase().trim();

        // Find user by email
        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
        });

        if (!user) {
          reply.code(401);
          return {
            error: "Unauthorized",
            message: "Invalid email or password",
          };
        }

        // Check if user is active
        if (user.status !== "ACTIVE") {
          reply.code(401);
          return {
            error: "Unauthorized",
            message: "Account is inactive",
          };
        }

        // Check if user has a password set
        if (!user.password_hash) {
          reply.code(401);
          return {
            error: "Unauthorized",
            message: "Invalid email or password",
          };
        }

        // Verify password first (constant-time operation)
        const isValidPassword = await bcrypt.compare(
          password,
          user.password_hash,
        );

        if (!isValidPassword) {
          reply.code(401);
          return {
            error: "Unauthorized",
            message: "Invalid email or password",
          };
        }

        // Only check if user is a client user after successful password verification
        // This prevents timing-based account enumeration attacks
        if (!user.is_client_user) {
          reply.code(401);
          return {
            error: "Unauthorized",
            message: "Invalid email or password",
          };
        }

        // Generate JWT tokens with RBAC
        const authService = new AuthService();
        const { accessToken, refreshToken, roles } =
          await authService.generateTokenPairWithRBAC(user.user_id, user.email);

        // Log client login to AuditLog
        try {
          await prisma.auditLog.create({
            data: {
              user_id: user.user_id,
              action: "CLIENT_LOGIN",
              table_name: "auth",
              record_id: user.user_id,
              new_values: {
                login_type: "client",
                timestamp: new Date().toISOString(),
              },
              ip_address:
                (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
                request.ip ||
                null,
              user_agent: request.headers["user-agent"] || null,
            },
          });
        } catch (auditError) {
          // Log error but don't fail the login
          fastify.log.error({ auditError }, "Failed to log client login audit");
        }

        // Set httpOnly cookies
        // Determine if request is over HTTPS (check protocol or x-forwarded-proto header)
        const isSecure =
          request.protocol === "https" ||
          request.headers["x-forwarded-proto"] === "https";

        // Determine SameSite policy based on deployment context
        const isCrossOrigin = isSecure && process.env.NODE_ENV === "production";
        const sameSitePolicy = isCrossOrigin ? "none" : "lax";

        // Get cookie maxAge based on role:
        // - CLIENT_USER: undefined (session cookie - no expiry until logout)
        // - Others: role-based expiry
        const cookieMaxAge = AuthService.getCookieMaxAge(roles);

        // Access token cookie with role-based expiry
        const accessCookieOptions: any = {
          httpOnly: true,
          secure: isSecure,
          sameSite: sameSitePolicy,
          path: "/",
        };
        if (cookieMaxAge !== undefined) {
          accessCookieOptions.maxAge = cookieMaxAge;
        }
        (reply as any).setCookie(
          "access_token",
          accessToken,
          accessCookieOptions,
        );

        // Refresh token cookie (7 days expiry, or session for CLIENT_USER)
        const refreshCookieOptions: any = {
          httpOnly: true,
          secure: isSecure,
          sameSite: sameSitePolicy,
          path: "/",
        };
        if (cookieMaxAge !== undefined) {
          refreshCookieOptions.maxAge = 7 * 24 * 60 * 60; // 7 days in seconds
        }
        (reply as any).setCookie(
          "refresh_token",
          refreshToken,
          refreshCookieOptions,
        );

        // Return success response with user data
        reply.code(200);
        return {
          message: "Login successful",
          user: {
            id: user.user_id,
            email: user.email,
            name: user.name,
          },
        };
      } catch (error) {
        fastify.log.error({ error }, "Client login error");
        reply.code(500);
        return {
          error: "Internal Server Error",
          message: "An error occurred during login",
        };
      }
    },
  );

  /**
   * Logout endpoint - Clear auth cookies and invalidate refresh token
   * POST /api/auth/logout
   * Clears httpOnly cookies and invalidates refresh token in Redis
   */
  fastify.post(
    "/api/auth/logout",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Extract refresh token from cookie to invalidate it
        const refreshToken = (request as any).cookies?.refresh_token;

        if (refreshToken) {
          try {
            const authService = new AuthService();
            const decoded = await authService.verifyRefreshToken(refreshToken);

            // Invalidate the refresh token in Redis
            if (decoded.jti) {
              await authService.invalidateRefreshToken(decoded.jti);
            }
          } catch (error) {
            // Token already invalid or expired - that's fine, continue with logout
            fastify.log.debug(
              { error },
              "Refresh token validation failed during logout (expected if token expired)",
            );
          }
        }

        // Clear both auth cookies
        (reply as any).clearCookie("access_token", { path: "/" });
        (reply as any).clearCookie("refresh_token", { path: "/" });

        reply.code(200);
        return {
          message: "Logout successful",
        };
      } catch (error) {
        fastify.log.error({ error }, "Logout error");

        // Even if invalidation fails, clear cookies and return success
        (reply as any).clearCookie("access_token", { path: "/" });
        (reply as any).clearCookie("refresh_token", { path: "/" });

        reply.code(200);
        return {
          message: "Logout successful",
        };
      }
    },
  );

  /**
   * Refresh token endpoint
   * POST /api/auth/refresh
   * Rotates refresh token and generates new access/refresh token pair
   */
  fastify.post(
    "/api/auth/refresh",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Extract refresh token from httpOnly cookie
        const refreshToken = (request as any).cookies?.refresh_token;

        if (!refreshToken) {
          reply.code(401);
          return {
            error: "Unauthorized",
            message: "Missing refresh token cookie",
          };
        }

        // Verify refresh token
        const authService = new AuthService();
        const decoded = await authService.verifyRefreshToken(refreshToken);

        // Invalidate old refresh token (token rotation security)
        if (decoded.jti) {
          await authService.invalidateRefreshToken(decoded.jti);
        }

        // Get user from database by user_id to retrieve current roles/permissions
        const localUser = await getUserById(decoded.user_id);

        // Generate new token pair with roles and permissions from database (token rotation - old refresh token is now invalid)
        const {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          roles,
        } = await authService.generateTokenPairWithRBAC(
          localUser.user_id,
          localUser.email,
        );

        // Set new httpOnly cookies with secure flags
        // Determine if request is over HTTPS
        const isSecure =
          request.protocol === "https" ||
          request.headers["x-forwarded-proto"] === "https";

        // Determine SameSite policy based on deployment context
        // For cross-origin deployments, use "none" with Secure=true
        // For same-origin, use "strict" for best CSRF protection
        const isCrossOrigin = isSecure && process.env.NODE_ENV === "production";
        const sameSitePolicy = isCrossOrigin ? "none" : "strict";

        // Get cookie maxAge based on role:
        // - CLIENT_USER: undefined (session cookie - no expiry until logout)
        // - SUPERADMIN: 8 hours
        // - Others: 1 hour
        const cookieMaxAge = AuthService.getCookieMaxAge(roles);

        // Access token cookie with role-based expiry
        const accessCookieOptions: any = {
          httpOnly: true,
          secure: isSecure,
          sameSite: sameSitePolicy,
          path: "/",
        };
        if (cookieMaxAge !== undefined) {
          accessCookieOptions.maxAge = cookieMaxAge;
        }
        (reply as any).setCookie(
          "access_token",
          newAccessToken,
          accessCookieOptions,
        );

        // Refresh token cookie (7 days expiry, or session for CLIENT_USER) - rotated
        const refreshCookieOptions: any = {
          httpOnly: true,
          secure: isSecure,
          sameSite: sameSitePolicy,
          path: "/",
        };
        if (cookieMaxAge !== undefined) {
          refreshCookieOptions.maxAge = 7 * 24 * 60 * 60; // 7 days in seconds
        }
        (reply as any).setCookie(
          "refresh_token",
          newRefreshToken,
          refreshCookieOptions,
        );

        // Calculate expiresAt based on role for session monitoring
        // Access token expiry: SUPERADMIN=8h, CLIENT_USER=30d, others=1h
        const accessTokenExpiryMs = roles.includes("SUPERADMIN")
          ? 8 * 60 * 60 * 1000
          : roles.includes("CLIENT_USER")
            ? 30 * 24 * 60 * 60 * 1000
            : 60 * 60 * 1000;
        const expiresAt = new Date(
          Date.now() + accessTokenExpiryMs,
        ).toISOString();

        // Return success response
        reply.code(200);
        return {
          message: "Tokens refreshed successfully",
          expiresAt,
          user: {
            id: localUser.user_id,
            email: localUser.email,
          },
        };
      } catch (error) {
        // Log full error details server-side for debugging
        if (error instanceof Error) {
          fastify.log.error(
            { error: error.message, stack: error.stack },
            "Refresh token error",
          );
        } else {
          fastify.log.error({ error }, "Refresh token error");
        }

        // Clear invalid cookies
        (reply as any).clearCookie("access_token", { path: "/" });
        (reply as any).clearCookie("refresh_token", { path: "/" });

        // Determine specific error message based on error type
        let errorMessage = "Refresh token failed";
        if (error instanceof Error) {
          if (error.message.includes("expired")) {
            errorMessage = "Refresh token has expired";
          } else if (
            error.message.includes("Invalid") ||
            error.message.includes("invalid")
          ) {
            errorMessage = "Invalid refresh token";
          } else if (error.message.includes("revoked")) {
            errorMessage = "Refresh token has been revoked";
          }
        }

        reply.code(401);
        return {
          error: "Unauthorized",
          message: errorMessage,
        };
      }
    },
  );

  /**
   * Get current user information
   * GET /api/auth/me
   * Requires valid JWT access token in httpOnly cookie
   * Returns user info including is_client_user for proper routing
   * Also returns expiresAt for session monitoring on the frontend
   */
  fastify.get(
    "/api/auth/me",
    { preHandler: authMiddleware },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // User context is attached by authMiddleware
      const user = (request as any).user as UserIdentity;

      // Fetch full user info from database to get is_client_user
      const dbUser = await prisma.user.findUnique({
        where: { user_id: user.id },
        select: {
          user_id: true,
          email: true,
          name: true,
          is_client_user: true,
        },
      });

      if (!dbUser) {
        reply.code(401);
        return {
          error: "Unauthorized",
          message: "User not found",
        };
      }

      // Get session expiry from the JWT token exp claim
      // The user object from authMiddleware includes exp from the decoded JWT
      const tokenExp = (user as any).exp;
      const expiresAt = tokenExp
        ? new Date(tokenExp * 1000).toISOString()
        : null;

      // Log permissions for debugging (especially in staging)
      console.log("[Auth] /api/auth/me response:", {
        userId: dbUser.user_id,
        email: dbUser.email,
        roles: user.roles,
        permissions: user.permissions,
        hasAdminPermission: user.permissions.includes("ADMIN_SYSTEM_CONFIG"),
        expiresAt,
        environment: process.env.NODE_ENV,
      });

      reply.code(200);
      return {
        user: {
          id: dbUser.user_id,
          email: dbUser.email,
          name: dbUser.name,
          roles: user.roles,
          permissions: user.permissions,
          is_client_user: dbUser.is_client_user,
        },
        expiresAt,
        message: "User session validated",
      };
    },
  );

  /**
   * Verify cashier PIN and check permission
   * POST /api/auth/verify-cashier-permission
   * Verifies cashier PIN and checks if the cashier's associated user has the required permission
   * Used for manual entry authorization in lottery shift closing
   */
  const verifyCashierPermissionSchema = z.object({
    cashierId: z.string().uuid("cashierId must be a valid UUID"),
    pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 numeric digits"),
    permission: z.literal("LOTTERY_MANUAL_ENTRY"),
    storeId: z.string().uuid("storeId must be a valid UUID"),
  });

  fastify.post(
    "/api/auth/verify-cashier-permission",
    {
      schema: {
        description: "Verify cashier PIN and check permission",
        tags: ["auth"],
        body: {
          type: "object",
          properties: {
            cashierId: {
              type: "string",
              format: "uuid",
              description: "Cashier UUID",
            },
            pin: {
              type: "string",
              pattern: "^\\d{4}$",
              description: "4-digit PIN",
            },
            permission: {
              type: "string",
              enum: ["LOTTERY_MANUAL_ENTRY"],
              description: "Permission to check",
            },
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
          },
          required: ["cashierId", "pin", "permission", "storeId"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              valid: { type: "boolean" },
              userId: { type: "string", format: "uuid" },
              name: { type: "string" },
              hasPermission: { type: "boolean" },
            },
          },
          400: {
            type: "object",
            properties: {
              valid: { type: "boolean" },
              error: { type: "string" },
            },
          },
          401: {
            type: "object",
            properties: {
              valid: { type: "boolean" },
              error: { type: "string" },
            },
          },
          500: {
            type: "object",
            properties: {
              valid: { type: "boolean" },
              error: { type: "string" },
            },
          },
        },
      },
      preHandler: [authMiddleware], // Requires authenticated user to make the request
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // API-001: VALIDATION - Validate request body with Zod schema
        const parseResult = verifyCashierPermissionSchema.safeParse(
          request.body,
        );
        if (!parseResult.success) {
          reply.code(400);
          return {
            valid: false,
            error: parseResult.error.issues[0]?.message || "Invalid request",
          };
        }

        const { cashierId, pin, permission, storeId } = parseResult.data;
        const user = (request as unknown as { user: UserIdentity }).user;
        const auditContext = getAuditContext(request, user);

        // Step 1: Verify cashier PIN using existing cashier authentication logic
        // Find cashier by ID
        const cashier = await prisma.cashier.findUnique({
          where: {
            cashier_id: cashierId,
            store_id: storeId, // Ensure cashier belongs to the store
            disabled_at: null, // Only active cashiers
          },
        });

        if (!cashier) {
          reply.code(401);
          return {
            valid: false,
            error: "Invalid credentials",
          };
        }

        // Verify PIN using bcrypt
        // API-004: AUTHENTICATION - Use secure password verification
        const pinValid = await bcrypt.compare(pin, cashier.pin_hash);
        if (!pinValid) {
          // Log failed authentication attempt
          await prisma.auditLog.create({
            data: {
              user_id: user.id,
              action: "AUTH_FAILURE",
              table_name: "cashiers",
              record_id: cashierId,
              new_values: {
                reason: "Invalid PIN",
                store_id: storeId,
                permission: permission,
              },
              ip_address: auditContext.ipAddress,
              user_agent: auditContext.userAgent,
            },
          });

          reply.code(401);
          return {
            valid: false,
            error: "Invalid PIN",
          };
        }

        // Step 2: Find user account associated with cashier
        // Match cashier name to user name (case-insensitive)
        // SEC-006: SQL_INJECTION - Use parameterized query via Prisma ORM
        const userAccount = await prisma.user.findFirst({
          where: {
            name: {
              equals: cashier.name,
              mode: "insensitive", // Case-insensitive match
            },
            status: "ACTIVE", // Only active users
          },
        });

        if (!userAccount) {
          // Cashier authenticated but no user account found
          // This means the cashier doesn't have a user account to check permissions
          reply.code(401);
          return {
            valid: true, // PIN was valid
            hasPermission: false,
            error: "Cashier does not have a user account",
          };
        }

        // Step 3: Check permission using RBAC service
        const rbacService = new RBACService();
        const hasPermission = await rbacService.checkPermission(
          userAccount.user_id,
          PERMISSIONS.LOTTERY_MANUAL_ENTRY,
          {
            storeId: storeId,
          },
        );

        // Log successful authentication and permission check
        await prisma.auditLog.create({
          data: {
            user_id: user.id,
            action: "AUTH_SUCCESS",
            table_name: "cashiers",
            record_id: cashierId,
            new_values: {
              reason: "Cashier PIN verified",
              store_id: storeId,
              permission: permission,
              has_permission: hasPermission,
              user_id: userAccount.user_id,
            },
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
          },
        });

        // Return result
        reply.code(200);
        return {
          valid: true,
          userId: userAccount.user_id,
          name: userAccount.name,
          hasPermission: hasPermission,
        };
      } catch (error: unknown) {
        // API-003: ERROR_HANDLING - Generic error message, don't leak implementation details
        fastify.log.error({ error }, "Error verifying cashier permission");

        reply.code(500);
        return {
          valid: false,
          error: "Failed to verify cashier permission",
        };
      }
    },
  );
}
