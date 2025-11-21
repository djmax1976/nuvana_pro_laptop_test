import { FastifyRequest, FastifyReply } from "fastify";
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
  client_id?: string; // Optional client_id for CLIENT_OWNER users
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
      return reply.code(401).send({
        error: "Missing access token cookie",
      });
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
      client_id: decoded.client_id, // Include client_id if present (for CLIENT_OWNER users)
    };

    // Attach user identity to request for use in route handlers
    (request as any).user = userIdentity;
  } catch (error) {
    return reply.code(401).send({
      error: error instanceof Error ? error.message : "Token validation failed",
    });
  }
}
