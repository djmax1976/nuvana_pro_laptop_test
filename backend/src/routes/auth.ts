import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import bcrypt from "bcrypt";
import { getUserById } from "../services/user.service";
import { AuthService } from "../services/auth.service";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { stateService } from "../services/state.service";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// NOTE: OAuth and signup are disabled in this application
// Using local email/password authentication with bcrypt

/**
 * OAuth callback endpoint - DISABLED
 * OAuth authentication is not supported in this application.
 * GET /api/auth/callback
 */
export async function authRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/api/auth/callback",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      // OAuth is disabled - return 403 Forbidden
      reply.code(403);
      return {
        error: "OAuth disabled",
        message:
          "OAuth authentication is not supported. Please use email/password login.",
      };
    },
  );

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
   * Logout endpoint - Clear auth cookies
   * POST /api/auth/logout
   * Clears httpOnly cookies to end session
   */
  fastify.post(
    "/api/auth/logout",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      // Clear both auth cookies
      (reply as any).clearCookie("access_token", { path: "/" });
      (reply as any).clearCookie("refresh_token", { path: "/" });

      reply.code(200);
      return {
        message: "Logout successful",
      };
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
        const decoded = authService.verifyRefreshToken(refreshToken);

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
   * Test protected endpoint to verify JWT middleware
   * GET /api/auth/me
   * Requires valid JWT access token in httpOnly cookie
   */
  fastify.get(
    "/api/auth/me",
    { preHandler: authMiddleware },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // User context is attached by authMiddleware
      const user = (request as any).user as UserIdentity;

      reply.code(200);
      return {
        user: {
          id: user.id,
          email: user.email,
          roles: user.roles,
          permissions: user.permissions,
        },
        message: "JWT middleware successfully extracted user context",
      };
    },
  );

  /**
   * Test helper endpoint to store OAuth state for CSRF testing
   * POST /api/auth/test/store-state
   * Only available in test environment
   */
  if (process.env.NODE_ENV === "test") {
    fastify.post(
      "/api/auth/test/store-state",
      async (request: FastifyRequest, reply: FastifyReply) => {
        let body = request.body as any;

        // Handle Playwright's data wrapping format
        if (body && typeof body === "object" && "data" in body) {
          // If data is a string, parse it
          if (typeof body.data === "string") {
            try {
              body = JSON.parse(body.data);
            } catch (e) {
              // If parsing fails, use as-is
            }
          } else {
            // If data is already an object, use it directly
            body = body.data;
          }
        }

        if (!body || !body.state) {
          fastify.log.error({ body }, "Missing state parameter in request");
          reply.code(400);
          return {
            error: "Missing required parameter: state",
          };
        }

        stateService.storeState(body.state, body.ttl);

        reply.code(200);
        return {
          message: "State stored successfully",
          state: body.state,
        };
      },
    );
  }
}
