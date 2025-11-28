import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import bcrypt from "bcrypt";
import { getUserById } from "../services/user.service";
import { AuthService } from "../services/auth.service";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();

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
          return {
            error: "Bad Request",
            message: "Email and password are required",
          };
        }

        // Find user by email
        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase().trim() },
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
            message: "Password not set for this account",
          };
        }

        // Verify password
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

        // Generate JWT tokens with RBAC
        const authService = new AuthService();
        const { accessToken, refreshToken } =
          await authService.generateTokenPairWithRBAC(user.user_id, user.email);

        // Set httpOnly cookies
        // Access token cookie (15 min expiry)
        (reply as any).setCookie("access_token", accessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 15 * 60, // 15 minutes in seconds
        });

        // Refresh token cookie (7 days expiry)
        (reply as any).setCookie("refresh_token", refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
        });

        // Determine if user should access client dashboard
        // A user is a client user if:
        // 1. They have is_client_user = true in database, OR
        // 2. They have COMPANY or STORE scope roles (CLIENT_OWNER, STORE_MANAGER, etc.)
        // This ensures employees created before the is_client_user fix still work
        let isClientUser = user.is_client_user;

        if (!isClientUser) {
          // Check if user has any COMPANY or STORE scope roles
          const userRoles = await prisma.userRole.findMany({
            where: { user_id: user.user_id },
            include: { role: { select: { scope: true } } },
          });

          const hasClientRole = userRoles.some(
            (ur) => ur.role.scope === "COMPANY" || ur.role.scope === "STORE",
          );

          if (hasClientRole) {
            isClientUser = true;
            // Update the database to fix the is_client_user flag for future logins
            await prisma.user.update({
              where: { user_id: user.user_id },
              data: { is_client_user: true },
            });
          }
        }

        // Return success response with user data (including is_client_user for routing)
        reply.code(200);
        return {
          message: "Login successful",
          user: {
            id: user.user_id,
            email: user.email,
            name: user.name,
            is_client_user: isClientUser,
          },
        };
      } catch (error) {
        fastify.log.error({ error }, "Login error");
        reply.code(500);
        return {
          error: "Internal Server Error",
          message: "An error occurred during login",
        };
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
        const { accessToken, refreshToken } =
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
        // Access token cookie (15 min expiry)
        (reply as any).setCookie("access_token", accessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 15 * 60, // 15 minutes in seconds
        });

        // Refresh token cookie (7 days expiry)
        (reply as any).setCookie("refresh_token", refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
        });

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
            error: "Missing refresh token cookie",
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
        const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
          await authService.generateTokenPairWithRBAC(
            localUser.user_id,
            localUser.email,
          );

        // Set new httpOnly cookies with secure flags
        // Access token cookie (15 min expiry)
        (reply as any).setCookie("access_token", newAccessToken, {
          httpOnly: true,
          secure: true, // HTTPS only
          sameSite: "strict", // CSRF protection
          path: "/",
          maxAge: 15 * 60, // 15 minutes in seconds
        });

        // Refresh token cookie (7 days expiry) - rotated
        (reply as any).setCookie("refresh_token", newRefreshToken, {
          httpOnly: true,
          secure: true, // HTTPS only
          sameSite: "strict", // CSRF protection
          path: "/",
          maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
        });

        // Return success response
        reply.code(200);
        return {
          message: "Tokens refreshed successfully",
          user: {
            id: localUser.user_id,
            email: localUser.email,
          },
        };
      } catch (error) {
        fastify.log.error({ error }, "Refresh token error");

        // Clear invalid cookies
        (reply as any).clearCookie("access_token", { path: "/" });
        (reply as any).clearCookie("refresh_token", { path: "/" });

        reply.code(401);
        return {
          error:
            error instanceof Error
              ? error.message
              : "Refresh token validation failed",
        };
      }
    },
  );

  /**
   * Get current user information
   * GET /api/auth/me
   * Requires valid JWT access token in httpOnly cookie
   * Returns user info including is_client_user for proper routing
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
        message: "User session validated",
      };
    },
  );
}
