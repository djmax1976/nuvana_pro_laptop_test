import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getSupabaseClient } from "../utils/supabase";
import { getUserOrCreate, getUserById } from "../services/user.service";
import { AuthService } from "../services/auth.service";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { stateService } from "../services/state.service";

/**
 * OAuth callback endpoint that handles Supabase OAuth authentication
 * GET /api/auth/callback
 */
export async function authRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/api/auth/callback",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Extract query parameters
        const query = request.query as {
          code?: string;
          state?: string;
          error?: string;
        };

        // Handle OAuth errors from provider FIRST (takes precedence)
        // OAuth providers return error parameter when user denies access or other errors occur
        if (query.error) {
          reply.code(401);
          return {
            error: `OAuth authentication failed: ${query.error}`,
            message: query.error,
          };
        }

        // Validate required code parameter
        if (!query.code) {
          reply.code(400);
          return {
            error: "Missing required parameter: code",
            message: "OAuth code is required for authentication",
          };
        }

        // Validate state parameter for CSRF protection
        // State must be present, non-empty, and match a previously stored value
        if (!query.state || query.state.trim() === "") {
          fastify.log.warn(
            "OAuth callback received without state parameter - CSRF vulnerability",
          );
          reply.code(400);
          return {
            error: "Missing required parameter: state",
            message:
              "State parameter is required for CSRF protection in OAuth flow",
          };
        }

        // Validate state against stored values (single-use, auto-deleted after validation)
        // In production, replace in-memory state store with Redis for distributed systems
        const isValidState = stateService.validateState(query.state);
        if (!isValidState) {
          fastify.log.warn(
            { state: query.state },
            "OAuth callback received with invalid or expired state - CSRF attack attempt",
          );
          reply.code(400);
          return {
            error: "Invalid state parameter",
            message:
              "State parameter is invalid, expired, or already used. Please restart the OAuth flow.",
          };
        }

        // Initialize Supabase client for token validation
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
          fastify.log.error("Missing Supabase configuration");
          reply.code(500);
          return {
            error: "Server configuration error",
            message: "Supabase configuration is missing",
          };
        }

        const supabase = getSupabaseClient(supabaseUrl, supabaseServiceKey);

        // Exchange OAuth code for session (Supabase handles this)
        // Note: In production, the frontend typically handles the OAuth flow
        // and sends the access token to the backend for validation
        // For this implementation, we'll validate the code directly
        const { data: sessionData, error: sessionError } =
          await supabase.auth.exchangeCodeForSession(query.code);

        if (sessionError || !sessionData.session) {
          fastify.log.error(
            { error: sessionError },
            "Failed to exchange code for session",
          );
          reply.code(401);
          return {
            error: "Invalid OAuth code",
            message: "The provided authorization code is invalid or expired",
          };
        }

        // Extract user identity from session
        const user = sessionData.user;
        if (!user || !user.id || !user.email) {
          reply.code(401);
          return {
            error: "Invalid user data",
            message: "Unable to extract user identity from OAuth token",
          };
        }

        // Get or create user in local database
        const localUser = await getUserOrCreate(
          user.id, // auth_provider_id (Supabase user ID)
          user.email,
          user.user_metadata?.name ||
            user.user_metadata?.full_name ||
            undefined,
        );

        // Generate JWT tokens with roles and permissions from database
        const authService = new AuthService();
        const { accessToken, refreshToken } =
          await authService.generateTokenPairWithRBAC(
            localUser.user_id,
            localUser.email,
          );

        // Set httpOnly cookies with secure flags
        // Access token cookie (15 min expiry)
        (reply as any).setCookie("access_token", accessToken, {
          httpOnly: true,
          secure: true, // HTTPS only
          sameSite: "strict", // CSRF protection
          path: "/",
          maxAge: 15 * 60, // 15 minutes in seconds
        });

        // Refresh token cookie (7 days expiry)
        (reply as any).setCookie("refresh_token", refreshToken, {
          httpOnly: true,
          secure: true, // HTTPS only
          sameSite: "strict", // CSRF protection
          path: "/",
          maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
        });

        // Return user identity
        reply.code(200);
        return {
          user: {
            id: localUser.user_id,
            email: localUser.email,
            name: localUser.name,
            auth_provider_id: localUser.auth_provider_id,
          },
        };
      } catch (error) {
        fastify.log.error({ error }, "OAuth callback error");
        console.error("OAuth callback error details:", error);
        console.error(
          "Error stack:",
          error instanceof Error ? error.stack : "No stack",
        );
        reply.code(500);
        return {
          error: "Internal server error",
          message: "An error occurred during authentication",
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
          error: "Unauthorized",
          message:
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
