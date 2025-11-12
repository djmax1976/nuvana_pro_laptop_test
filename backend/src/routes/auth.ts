import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createClient } from "@supabase/supabase-js";
import { getUserOrCreate } from "../services/user.service";

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

        // Validate required code parameter
        if (!query.code) {
          reply.code(400);
          return {
            error: "Missing required parameter: code",
            message: "OAuth code is required for authentication",
          };
        }

        // Handle OAuth errors from provider
        if (query.error) {
          reply.code(401);
          return {
            error: "OAuth authentication failed",
            message: query.error,
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

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
        reply.code(500);
        return {
          error: "Internal server error",
          message: "An error occurred during authentication",
        };
      }
    },
  );
}
