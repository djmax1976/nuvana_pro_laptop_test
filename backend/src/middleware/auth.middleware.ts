import { FastifyRequest, FastifyReply } from "fastify";
import { createClient } from "@supabase/supabase-js";
import { AuthService } from "../services/auth.service";

/**
 * User identity extracted from validated JWT token
 */
export interface UserIdentity {
  id: string;
  email: string;
  name?: string;
  roles: string[];
  permissions: string[];
}

/**
 * Validate Supabase OAuth token and extract user identity
 * @param token - Supabase JWT token from Authorization header
 * @returns User identity if token is valid
 * @throws Error if token is invalid, expired, or missing
 */
export async function validateSupabaseToken(
  token: string,
): Promise<UserIdentity> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase configuration is missing");
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Verify the JWT token with Supabase
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new Error("Invalid or expired token");
  }

  // Check token expiration (Supabase tokens include exp claim)
  // The getUser call above validates the token, but we can also check exp manually
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64").toString(),
    );
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      throw new Error("Token has expired");
    }
  } catch (parseError) {
    // If we can't parse the token, Supabase validation above will catch it
    // This is just an additional check
  }

  if (!user.id || !user.email) {
    throw new Error("Invalid user data in token");
  }

  return {
    id: user.id,
    email: user.email,
    name: user.user_metadata?.name || user.user_metadata?.full_name,
    roles: [], // Supabase token doesn't include roles
    permissions: [], // Supabase token doesn't include permissions
  };
}

/**
 * Fastify middleware to validate JWT token from httpOnly cookie
 * Attaches user identity to request object
 */
export async function authMiddleware(
  request: FastifyRequest & { cookies?: { access_token?: string } },
  reply: FastifyReply,
): Promise<void> {
  try {
    // Extract access token from httpOnly cookie
    const accessToken = request.cookies?.access_token;

    if (!accessToken) {
      reply.code(401);
      reply.send({
        error: "Unauthorized",
        message: "Missing access token cookie",
      });
      return;
    }

    // Validate JWT token and extract user identity
    const authService = new AuthService();
    const decoded = authService.verifyAccessToken(accessToken);

    // Extract user identity from token payload
    const userIdentity: UserIdentity = {
      id: decoded.user_id,
      email: decoded.email,
      roles: decoded.roles || [],
      permissions: decoded.permissions || [],
    };

    // Attach user identity to request for use in route handlers
    (request as any).user = userIdentity;
  } catch (error) {
    reply.code(401);
    reply.send({
      error: "Unauthorized",
      message:
        error instanceof Error ? error.message : "Token validation failed",
    });
  }
}
