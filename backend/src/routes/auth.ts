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
        const { accessToken, refreshToken, roles, userRoles, permissions } =
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
              permissions, // Include permissions for frontend permission checks
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

  /**
   * Verify user credentials and check permission
   * POST /api/auth/verify-user-permission
   * Re-authenticates a user via email/password and checks if they have the required permission
   * Used for manual entry authorization in lottery management (MyStore dashboard)
   *
   * MCP Guidance Applied:
   * - API-001: VALIDATION - Zod schema validation for request body
   * - API-003: ERROR_HANDLING - Generic errors, no stack traces leaked
   * - API-004: AUTHENTICATION - Secure password verification with bcrypt
   * - SEC-006: SQL_INJECTION - Parameterized queries via Prisma ORM
   */
  const verifyUserPermissionSchema = z.object({
    email: z.string().email("Email must be a valid email address"),
    password: z.string().min(1, "Password is required"),
    permission: z.enum(["LOTTERY_MANUAL_ENTRY"], {
      message: "Invalid permission requested",
    }),
    storeId: z.string().uuid("storeId must be a valid UUID"),
  });

  fastify.post(
    "/api/auth/verify-user-permission",
    {
      schema: {
        description: "Verify user credentials and check permission",
        tags: ["auth"],
        body: {
          type: "object",
          properties: {
            email: {
              type: "string",
              format: "email",
              description: "User email address",
            },
            password: {
              type: "string",
              description: "User password",
            },
            permission: {
              type: "string",
              enum: ["LOTTERY_MANUAL_ENTRY"],
              description: "Permission to check",
            },
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID for permission scope",
            },
          },
          required: ["email", "password", "permission", "storeId"],
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
      preHandler: [authMiddleware], // Requires authenticated session to make the request
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // API-001: VALIDATION - Validate request body with Zod schema
        const parseResult = verifyUserPermissionSchema.safeParse(request.body);
        if (!parseResult.success) {
          reply.code(400);
          return {
            valid: false,
            error: parseResult.error.issues[0]?.message || "Invalid request",
          };
        }

        const { email, password, permission, storeId } = parseResult.data;
        const requestingUser = (request as unknown as { user: UserIdentity })
          .user;
        const auditContext = getAuditContext(request, requestingUser);

        // Step 1: Find user by email
        // SEC-006: SQL_INJECTION - Use parameterized query via Prisma ORM
        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase().trim() },
          select: {
            user_id: true,
            email: true,
            password_hash: true,
            status: true,
            name: true,
          },
        });

        if (!user) {
          // Log failed authentication attempt (user not found)
          await prisma.auditLog.create({
            data: {
              user_id: requestingUser.id,
              action: "MANUAL_ENTRY_AUTH_FAILURE",
              table_name: "users",
              record_id: requestingUser.id, // Use requesting user as record since target doesn't exist
              new_values: {
                reason: "User not found",
                email: email.toLowerCase().trim(),
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
            error: "Invalid email or password",
          };
        }

        // Step 2: Check if user is active
        if (user.status !== "ACTIVE") {
          await prisma.auditLog.create({
            data: {
              user_id: requestingUser.id,
              action: "MANUAL_ENTRY_AUTH_FAILURE",
              table_name: "users",
              record_id: user.user_id,
              new_values: {
                reason: "User account inactive",
                store_id: storeId,
                permission: permission,
                user_status: user.status,
              },
              ip_address: auditContext.ipAddress,
              user_agent: auditContext.userAgent,
            },
          });

          reply.code(401);
          return {
            valid: false,
            error: "User account is not active",
          };
        }

        // Step 3: Verify password
        // API-004: AUTHENTICATION - Secure password verification with bcrypt
        if (!user.password_hash) {
          reply.code(401);
          return {
            valid: false,
            error: "Invalid email or password",
          };
        }

        const passwordValid = await bcrypt.compare(
          password,
          user.password_hash,
        );
        if (!passwordValid) {
          // Log failed authentication attempt (invalid password)
          await prisma.auditLog.create({
            data: {
              user_id: requestingUser.id,
              action: "MANUAL_ENTRY_AUTH_FAILURE",
              table_name: "users",
              record_id: user.user_id,
              new_values: {
                reason: "Invalid password",
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
            error: "Invalid email or password",
          };
        }

        // Step 4: Check permission using RBAC service
        const rbacService = new RBACService();
        const hasPermission = await rbacService.checkPermission(
          user.user_id,
          PERMISSIONS.LOTTERY_MANUAL_ENTRY,
          {
            storeId: storeId,
          },
        );

        // Log successful authentication and permission check
        await prisma.auditLog.create({
          data: {
            user_id: requestingUser.id,
            action: "MANUAL_ENTRY_AUTH_SUCCESS",
            table_name: "users",
            record_id: user.user_id,
            new_values: {
              reason: "User credentials verified for manual entry",
              store_id: storeId,
              permission: permission,
              has_permission: hasPermission,
              authorized_user_id: user.user_id,
              authorized_user_name: user.name,
            },
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
          },
        });

        // Return result
        reply.code(200);
        return {
          valid: true,
          userId: user.user_id,
          name: user.name,
          hasPermission: hasPermission,
        };
      } catch (error: unknown) {
        // API-003: ERROR_HANDLING - Generic error message, don't leak implementation details
        fastify.log.error({ error }, "Error verifying user permission");

        reply.code(500);
        return {
          valid: false,
          error: "Failed to verify user permission",
        };
      }
    },
  );

  /**
   * Verify management credentials for pack activation
   * POST /api/auth/verify-management
   *
   * Verifies user credentials WITHOUT setting session cookies.
   * Used for management authentication in lottery pack activation modal.
   * Unlike /api/auth/login, this endpoint:
   * - Does NOT set access_token or refresh_token cookies
   * - Checks for manager-level roles (CLIENT_OWNER, CLIENT_ADMIN, STORE_MANAGER, etc.)
   * - Returns user info for audit purposes
   *
   * MCP Guidance Applied:
   * - API-001: VALIDATION - Zod schema validation for request body
   * - API-003: ERROR_HANDLING - Generic errors, no info leakage
   * - API-004: AUTHENTICATION - Secure password verification with bcrypt
   * - SEC-006: SQL_INJECTION - Parameterized queries via Prisma ORM
   * - SEC-010: AUTHZ - Role-based access control check
   */
  const verifyManagementSchema = z.object({
    email: z.string().email("Email must be a valid email address"),
    password: z.string().min(1, "Password is required"),
  });

  fastify.post(
    "/api/auth/verify-management",
    {
      schema: {
        description:
          "Verify management credentials for pack activation (no cookies set)",
        tags: ["auth"],
        body: {
          type: "object",
          properties: {
            email: {
              type: "string",
              format: "email",
              description: "User email address",
            },
            password: {
              type: "string",
              description: "User password",
            },
          },
          required: ["email", "password"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  user_id: { type: "string", format: "uuid" },
                  name: { type: "string" },
                  email: { type: "string" },
                  roles: { type: "array", items: { type: "string" } },
                  permissions: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          401: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
      preHandler: [authMiddleware], // Requires authenticated session to make the request
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // API-001: VALIDATION - Validate request body with Zod schema
        const parseResult = verifyManagementSchema.safeParse(request.body);
        if (!parseResult.success) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message:
                parseResult.error.issues[0]?.message || "Invalid request",
            },
          };
        }

        const { email, password } = parseResult.data;
        const requestingUser = (request as unknown as { user: UserIdentity })
          .user;
        const auditContext = getAuditContext(request, requestingUser);

        // Step 1: Find user by email
        // SEC-006: SQL_INJECTION - Use parameterized query via Prisma ORM
        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase().trim() },
          select: {
            user_id: true,
            email: true,
            password_hash: true,
            status: true,
            name: true,
          },
        });

        if (!user) {
          // Log failed authentication attempt (user not found)
          await prisma.auditLog.create({
            data: {
              user_id: requestingUser.id,
              action: "MGMT_AUTH_FAILURE",
              table_name: "users",
              record_id: requestingUser.id,
              new_values: {
                reason: "User not found",
                attempted_email: email,
                auth_type: "MANAGEMENT_VERIFY",
              },
              ip_address: auditContext.ipAddress,
              user_agent: auditContext.userAgent,
            },
          });

          reply.code(401);
          return {
            success: false,
            error: {
              code: "UNAUTHORIZED",
              message: "Invalid email or password",
            },
          };
        }

        // Step 2: Check user status
        if (user.status !== "ACTIVE") {
          await prisma.auditLog.create({
            data: {
              user_id: requestingUser.id,
              action: "MGMT_AUTH_FAILURE",
              table_name: "users",
              record_id: user.user_id,
              new_values: {
                reason: "User inactive",
                user_status: user.status,
                auth_type: "MANAGEMENT_VERIFY",
              },
              ip_address: auditContext.ipAddress,
              user_agent: auditContext.userAgent,
            },
          });

          reply.code(401);
          return {
            success: false,
            error: {
              code: "UNAUTHORIZED",
              message: "Account is inactive",
            },
          };
        }

        // Step 3: Verify password
        // API-004: AUTHENTICATION - Secure password verification with bcrypt
        if (!user.password_hash) {
          reply.code(401);
          return {
            success: false,
            error: {
              code: "UNAUTHORIZED",
              message: "Invalid email or password",
            },
          };
        }

        const passwordValid = await bcrypt.compare(
          password,
          user.password_hash,
        );
        if (!passwordValid) {
          await prisma.auditLog.create({
            data: {
              user_id: requestingUser.id,
              action: "MGMT_AUTH_FAILURE",
              table_name: "users",
              record_id: user.user_id,
              new_values: {
                reason: "Invalid password",
                auth_type: "MANAGEMENT_VERIFY",
              },
              ip_address: auditContext.ipAddress,
              user_agent: auditContext.userAgent,
            },
          });

          reply.code(401);
          return {
            success: false,
            error: {
              code: "UNAUTHORIZED",
              message: "Invalid email or password",
            },
          };
        }

        // Step 4: Get user roles and permissions using RBAC service
        const rbacService = new RBACService();
        const userRoles = await rbacService.getUserRoles(user.user_id);
        const roleCodes = userRoles.map((ur) => ur.role_code);
        // Collect unique permissions from all roles
        const allPermissions = new Set<string>();
        for (const ur of userRoles) {
          for (const perm of ur.permissions) {
            allPermissions.add(perm);
          }
        }

        // Step 5: Check if user has manager-level role
        const MANAGER_ROLES = [
          "CLIENT_OWNER",
          "CLIENT_ADMIN",
          "STORE_MANAGER",
          "SYSTEM_ADMIN",
          "SUPERADMIN",
        ];

        const hasManagerRole = roleCodes.some((role) =>
          MANAGER_ROLES.includes(role),
        );

        if (!hasManagerRole) {
          await prisma.auditLog.create({
            data: {
              user_id: requestingUser.id,
              action: "MGMT_AUTH_FAILURE",
              table_name: "users",
              record_id: user.user_id,
              new_values: {
                reason: "Insufficient permissions - not a manager",
                user_roles: roleCodes,
                auth_type: "MANAGEMENT_VERIFY",
              },
              ip_address: auditContext.ipAddress,
              user_agent: auditContext.userAgent,
            },
          });

          reply.code(401);
          return {
            success: false,
            error: {
              code: "INSUFFICIENT_PERMISSIONS",
              message: "User does not have manager permissions",
            },
          };
        }

        // Log successful management authentication
        await prisma.auditLog.create({
          data: {
            user_id: requestingUser.id,
            action: "MGMT_AUTH_SUCCESS",
            table_name: "users",
            record_id: user.user_id,
            new_values: {
              reason: "Management credentials verified for pack activation",
              authorized_user_id: user.user_id,
              authorized_user_name: user.name,
              user_roles: roleCodes,
              auth_type: "MANAGEMENT_VERIFY",
            },
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
          },
        });

        // Return result - NO COOKIES SET
        reply.code(200);
        return {
          success: true,
          data: {
            user_id: user.user_id,
            name: user.name,
            email: user.email,
            roles: roleCodes,
            permissions: Array.from(allPermissions),
          },
        };
      } catch (error: unknown) {
        // API-003: ERROR_HANDLING - Generic error message, don't leak implementation details
        fastify.log.error({ error }, "Error verifying management credentials");

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to verify credentials",
          },
        };
      }
    },
  );

  // ===========================================================================
  // ELEVATED ACCESS VERIFICATION (Step-Up Authentication)
  // ===========================================================================
  // Enterprise-grade step-up authentication for sensitive operations
  // Does NOT modify the user's session - returns a short-lived elevation token
  //
  // Security Standards:
  // - SEC-010: AUTHZ - Validates credentials and permission without session modification
  // - SEC-012: SESSION_TIMEOUT - Short-lived tokens (5 minutes default)
  // - SEC-014: INPUT_VALIDATION - Strict Zod schema validation
  // - API-003: ERROR_HANDLING - Generic errors, detailed server-side logging
  // ===========================================================================

  // Validation schema for elevated access request
  const elevatedAccessSchema = z.object({
    email: z.string().email("Invalid email format").max(254),
    password: z.string().min(1, "Password is required"),
    required_permission: z.string().min(1, "Permission is required").max(100),
    store_id: z.string().uuid("Invalid store ID").optional(),
  });

  /**
   * Verify Elevated Access - Step-up authentication for sensitive operations
   * POST /api/auth/verify-elevated-access
   *
   * This endpoint:
   * 1. Validates user credentials (email/password)
   * 2. Verifies user has the required permission
   * 3. Returns a short-lived elevation token (NOT session cookies)
   * 4. Logs all attempts for security audit
   *
   * The elevation token:
   * - Is short-lived (5 minutes default, configurable)
   * - Is single-use (replay protection via JTI tracking)
   * - Is scoped to a specific permission and optionally a store
   * - Does NOT modify the user's session
   *
   * Rate limited: 5 attempts per 15 minutes per IP
   */
  fastify.post(
    "/api/auth/verify-elevated-access",
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Import services here to avoid circular dependencies at module load
      const { elevatedAccessAuditService } =
        await import("../services/auth/elevated-access-audit.service");
      const { elevationTokenService } =
        await import("../services/auth/elevation-token.service");

      // Extract request metadata for audit logging
      const ipAddress =
        (request.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        request.ip ||
        request.socket.remoteAddress ||
        "unknown";
      const userAgent = (request.headers["user-agent"] as string) || undefined;
      const requestId =
        (request.headers["x-request-id"] as string) || undefined;

      try {
        // SEC-014: INPUT_VALIDATION - Validate request body
        const parseResult = elevatedAccessSchema.safeParse(request.body);

        if (!parseResult.success) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message:
                parseResult.error.issues[0]?.message || "Invalid request",
            },
          };
        }

        const { email, password, required_permission, store_id } =
          parseResult.data;
        const normalizedEmail = email.toLowerCase().trim();

        // Rate limiting check (5 attempts per 15 minutes per IP)
        const rateLimitStatus = await elevatedAccessAuditService.checkRateLimit(
          ipAddress,
          "ip",
          15 * 60 * 1000, // 15 minutes
          5, // max attempts
        );

        if (rateLimitStatus.isLimited) {
          // Log rate limit event
          await elevatedAccessAuditService.logRateLimited({
            userEmail: normalizedEmail,
            requestedPermission: required_permission,
            storeId: store_id,
            ipAddress,
            userAgent,
            requestId,
            result: "FAILED_RATE_LIMIT",
            attemptCount: rateLimitStatus.attemptCount,
            rateLimitWindow: rateLimitStatus.windowStart,
          });

          reply.code(429);
          return {
            success: false,
            error: {
              code: "RATE_LIMITED",
              message: "Too many attempts. Please try again later.",
              retry_after_seconds: 15 * 60, // 15 minutes
            },
          };
        }

        // Find user by email
        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
          select: {
            user_id: true,
            email: true,
            password_hash: true,
            status: true,
            name: true,
          },
        });

        if (!user || !user.password_hash) {
          // Log failed attempt - user not found
          await elevatedAccessAuditService.logElevationDenied({
            userEmail: normalizedEmail,
            requestedPermission: required_permission,
            storeId: store_id,
            ipAddress,
            userAgent,
            requestId,
            result: "FAILED_CREDENTIALS",
            errorCode: "USER_NOT_FOUND",
            errorMessage: "User not found or no password set",
            attemptCount: rateLimitStatus.attemptCount + 1,
          });

          // Generic error to prevent user enumeration
          reply.code(401);
          return {
            success: false,
            error: {
              code: "UNAUTHORIZED",
              message: "Invalid credentials or insufficient permissions",
            },
          };
        }

        // Check if user is active
        if (user.status !== "ACTIVE") {
          await elevatedAccessAuditService.logElevationDenied({
            userId: user.user_id,
            userEmail: normalizedEmail,
            requestedPermission: required_permission,
            storeId: store_id,
            ipAddress,
            userAgent,
            requestId,
            result: "FAILED_CREDENTIALS",
            errorCode: "USER_INACTIVE",
            errorMessage: "User account is inactive",
            attemptCount: rateLimitStatus.attemptCount + 1,
          });

          reply.code(401);
          return {
            success: false,
            error: {
              code: "UNAUTHORIZED",
              message: "Invalid credentials or insufficient permissions",
            },
          };
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(
          password,
          user.password_hash,
        );

        if (!isValidPassword) {
          await elevatedAccessAuditService.logElevationDenied({
            userId: user.user_id,
            userEmail: normalizedEmail,
            requestedPermission: required_permission,
            storeId: store_id,
            ipAddress,
            userAgent,
            requestId,
            result: "FAILED_CREDENTIALS",
            errorCode: "INVALID_PASSWORD",
            errorMessage: "Password verification failed",
            attemptCount: rateLimitStatus.attemptCount + 1,
          });

          reply.code(401);
          return {
            success: false,
            error: {
              code: "UNAUTHORIZED",
              message: "Invalid credentials or insufficient permissions",
            },
          };
        }

        // Check if user has the required permission
        // Get user's roles with their permissions
        const userRolesWithPerms = await prisma.userRole.findMany({
          where: { user_id: user.user_id },
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

        // Collect all permissions from user's roles
        const userPermissions = new Set<string>();
        for (const ur of userRolesWithPerms) {
          for (const rp of ur.role.role_permissions) {
            userPermissions.add(rp.permission.code);
          }
        }

        if (!userPermissions.has(required_permission)) {
          await elevatedAccessAuditService.logElevationDenied({
            userId: user.user_id,
            userEmail: normalizedEmail,
            requestedPermission: required_permission,
            storeId: store_id,
            ipAddress,
            userAgent,
            requestId,
            result: "FAILED_PERMISSION",
            errorCode: "MISSING_PERMISSION",
            errorMessage: `User lacks required permission: ${required_permission}`,
            attemptCount: rateLimitStatus.attemptCount + 1,
          });

          reply.code(403);
          return {
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "Invalid credentials or insufficient permissions",
            },
          };
        }

        // If store_id is provided, verify user has access to the store
        // EXCEPTION: Users with SYSTEM-scoped roles (SUPERADMIN) have global access
        if (store_id) {
          // Check if user has any SYSTEM-scoped role (e.g., SUPERADMIN)
          const hasSystemRole = userRolesWithPerms.some(
            (ur) => ur.role.scope === "SYSTEM",
          );

          let hasAccess = hasSystemRole; // SYSTEM roles bypass store/company checks

          if (!hasAccess) {
            const storeAccess = await prisma.userRole.findFirst({
              where: {
                user_id: user.user_id,
                store_id: store_id,
              },
            });

            // Also check company-level access
            const store = await prisma.store.findUnique({
              where: { store_id },
              select: { company_id: true },
            });

            const companyAccess = store
              ? await prisma.userRole.findFirst({
                  where: {
                    user_id: user.user_id,
                    company_id: store.company_id,
                  },
                })
              : null;

            hasAccess = !!(storeAccess || companyAccess);
          }

          if (!hasAccess) {
            await elevatedAccessAuditService.logElevationDenied({
              userId: user.user_id,
              userEmail: normalizedEmail,
              requestedPermission: required_permission,
              storeId: store_id,
              ipAddress,
              userAgent,
              requestId,
              result: "FAILED_STORE_ACCESS",
              errorCode: "NO_STORE_ACCESS",
              errorMessage: `User has no access to store: ${store_id}`,
              attemptCount: rateLimitStatus.attemptCount + 1,
            });

            reply.code(403);
            return {
              success: false,
              error: {
                code: "FORBIDDEN",
                message: "Invalid credentials or insufficient permissions",
              },
            };
          }
        }

        // All checks passed - compute user identity for elevation token
        // Collect roles and permissions from user's roles
        const roles: string[] = [];
        const allPermissions = new Set<string>();
        const companyIds = new Set<string>();
        const storeIds = new Set<string>();

        for (const ur of userRolesWithPerms) {
          roles.push(ur.role.code);
          for (const rp of ur.role.role_permissions) {
            allPermissions.add(rp.permission.code);
          }
          if (ur.company_id) companyIds.add(ur.company_id);
          if (ur.store_id) storeIds.add(ur.store_id);
        }

        // Compute is_system_admin (same logic as auth.service.ts)
        const is_system_admin = userRolesWithPerms.some(
          (ur) => ur.role.code === "SUPERADMIN" && ur.role.scope === "SYSTEM",
        );

        // Generate elevation token with full user identity
        const tokenResult = elevationTokenService.generateToken({
          userId: user.user_id,
          email: user.email,
          permission: required_permission,
          storeId: store_id,
          // Include full user identity for authorization override
          roles,
          permissions: Array.from(allPermissions),
          is_system_admin,
          company_ids: Array.from(companyIds),
          store_ids: Array.from(storeIds),
        });

        // Log successful elevation
        await elevatedAccessAuditService.logElevationGranted({
          userId: user.user_id,
          userEmail: user.email,
          requestedPermission: required_permission,
          storeId: store_id,
          tokenJti: tokenResult.jti,
          tokenIssuedAt: tokenResult.issuedAt,
          tokenExpiresAt: tokenResult.expiresAt,
          ipAddress,
          userAgent,
          requestId,
        });

        // Return elevation token (NOT session cookies)
        reply.code(200);
        return {
          success: true,
          data: {
            elevation_token: tokenResult.token,
            expires_in: tokenResult.expiresIn,
            expires_at: tokenResult.expiresAt.toISOString(),
            permission: required_permission,
            store_id: store_id || null,
          },
        };
      } catch (error) {
        fastify.log.error(
          { error, ipAddress },
          "Error in verify-elevated-access",
        );

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to verify elevated access",
          },
        };
      }
    },
  );

  // ===========================================================================
  // USER PIN VERIFICATION (Step-Up Authentication for Managers)
  // ===========================================================================
  // PIN-based step-up authentication for STORE_MANAGER and SHIFT_MANAGER roles
  // Returns a 30-minute elevation token for manager operations
  //
  // Security Standards:
  // - SEC-001: PASSWORD_HASHING - bcrypt PIN verification
  // - SEC-010: AUTHZ - Validates PIN and permission without session modification
  // - SEC-012: SESSION_TIMEOUT - 30-minute tokens for manager workflow
  // - SEC-014: INPUT_VALIDATION - Strict Zod schema validation
  // - API-002: RATE_LIMIT - 5 attempts per 15 minutes per IP
  // ===========================================================================

  // Validation schema for user PIN verification request
  const verifyUserPINSchema = z.object({
    user_id: z.string().uuid("Invalid user ID format"),
    pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 numeric digits"),
    required_permission: z.string().min(1, "Permission is required").max(100),
    store_id: z.string().uuid("Invalid store ID format"),
  });

  /**
   * Verify User PIN - Step-up authentication for manager operations
   * POST /api/auth/verify-user-pin
   *
   * This endpoint:
   * 1. Validates user PIN (4-digit for STORE_MANAGER/SHIFT_MANAGER)
   * 2. Verifies user has the required permission at the store
   * 3. Returns a 30-minute elevation token (NOT session cookies)
   * 4. Logs all attempts for security audit
   *
   * Rate limited: 5 attempts per 15 minutes per IP
   */
  fastify.post(
    "/api/auth/verify-user-pin",
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Import services here to avoid circular dependencies at module load
      const { elevatedAccessAuditService } =
        await import("../services/auth/elevated-access-audit.service");
      const { elevationTokenService } =
        await import("../services/auth/elevation-token.service");
      const { userPINService } = await import("../services/user-pin.service");

      // Extract request metadata for audit logging
      const ipAddress =
        (request.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        request.ip ||
        request.socket.remoteAddress ||
        "unknown";
      const userAgent = (request.headers["user-agent"] as string) || undefined;
      const requestId =
        (request.headers["x-request-id"] as string) || undefined;

      try {
        // SEC-014: INPUT_VALIDATION - Validate request body
        const parseResult = verifyUserPINSchema.safeParse(request.body);

        if (!parseResult.success) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message:
                parseResult.error.issues[0]?.message || "Invalid request",
            },
          };
        }

        const { user_id, pin, required_permission, store_id } =
          parseResult.data;

        // Rate limiting check (5 attempts per 15 minutes per IP)
        const rateLimitStatus = await elevatedAccessAuditService.checkRateLimit(
          ipAddress,
          "ip",
          15 * 60 * 1000, // 15 minutes
          5,
        );

        if (rateLimitStatus.isLimited) {
          await elevatedAccessAuditService.logElevationDenied({
            userId: user_id,
            userEmail: "unknown", // We don't have email yet
            requestedPermission: required_permission,
            storeId: store_id,
            ipAddress,
            userAgent,
            requestId,
            result: "FAILED_RATE_LIMIT",
            errorCode: "RATE_LIMIT_EXCEEDED",
            errorMessage: `Rate limit exceeded: ${rateLimitStatus.attemptCount} attempts in window`,
            attemptCount: rateLimitStatus.attemptCount,
          });

          reply.code(429);
          return {
            success: false,
            error: {
              code: "RATE_LIMITED",
              message: "Too many attempts. Please try again later.",
            },
          };
        }

        // Verify PIN and get user details
        let pinVerification;
        try {
          pinVerification = await userPINService.verifyUserPIN(
            user_id,
            pin,
            store_id,
          );
        } catch (pinError) {
          const errorMessage =
            pinError instanceof Error
              ? pinError.message
              : "Invalid credentials";

          await elevatedAccessAuditService.logElevationDenied({
            userId: user_id,
            userEmail: "unknown",
            requestedPermission: required_permission,
            storeId: store_id,
            ipAddress,
            userAgent,
            requestId,
            result: "FAILED_CREDENTIALS",
            errorCode: "INVALID_PIN",
            errorMessage,
            attemptCount: rateLimitStatus.attemptCount + 1,
          });

          // Return generic error for security (no information leakage)
          reply.code(401);
          return {
            success: false,
            error: {
              code: "UNAUTHORIZED",
              message: "Invalid credentials",
            },
          };
        }

        // Check if user has the required permission
        if (!pinVerification.permissions.includes(required_permission)) {
          await elevatedAccessAuditService.logElevationDenied({
            userId: user_id,
            userEmail: pinVerification.userEmail,
            requestedPermission: required_permission,
            storeId: store_id,
            ipAddress,
            userAgent,
            requestId,
            result: "FAILED_PERMISSION",
            errorCode: "MISSING_PERMISSION",
            errorMessage: `User lacks required permission: ${required_permission}`,
            attemptCount: rateLimitStatus.attemptCount + 1,
          });

          reply.code(403);
          return {
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "Invalid credentials or insufficient permissions",
            },
          };
        }

        // Get full user info for token generation
        const userRolesWithPerms = await prisma.userRole.findMany({
          where: {
            user_id: user_id,
            store_id: store_id,
            status: "ACTIVE",
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

        // Collect all permissions and other data for token
        const allPermissions = new Set<string>(pinVerification.permissions);
        const storeIds = new Set<string>([store_id]);
        const companyIds = new Set<string>();
        const roles = pinVerification.roles;

        for (const ur of userRolesWithPerms) {
          if (ur.company_id) {
            companyIds.add(ur.company_id);
          }
        }

        // Generate PIN elevation token with 30-minute expiry
        const tokenResult = elevationTokenService.generatePINElevationToken({
          userId: user_id,
          email: pinVerification.userEmail,
          permission: required_permission,
          storeId: store_id,
          roles,
          permissions: Array.from(allPermissions),
          is_system_admin: false, // Managers are never system admins
          company_ids: Array.from(companyIds),
          store_ids: Array.from(storeIds),
        });

        // Log successful PIN elevation
        await elevatedAccessAuditService.logElevationGranted({
          userId: user_id,
          userEmail: pinVerification.userEmail,
          requestedPermission: required_permission,
          storeId: store_id,
          tokenJti: tokenResult.jti,
          tokenIssuedAt: tokenResult.issuedAt,
          tokenExpiresAt: tokenResult.expiresAt,
          ipAddress,
          userAgent,
          requestId,
        });

        // Return elevation token
        reply.code(200);
        return {
          success: true,
          data: {
            elevation_token: tokenResult.token,
            expires_in: tokenResult.expiresIn,
            expires_at: tokenResult.expiresAt.toISOString(),
            permission: required_permission,
            store_id: store_id,
            user_name: pinVerification.userName,
          },
        };
      } catch (error) {
        fastify.log.error({ error, ipAddress }, "Error in verify-user-pin");

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to verify user PIN",
          },
        };
      }
    },
  );
}
