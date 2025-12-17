import { FastifyRequest, FastifyReply } from "fastify";
import { tokenValidationService } from "../services/token-validation.service";

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
  // Scope information from JWT
  is_system_admin: boolean;
  company_ids: string[];
  store_ids: string[];
}

/**
 * Fastify middleware to validate JWT token from httpOnly cookie
 * Attaches user identity to request object
 *
 * Uses centralized TokenValidationService singleton for:
 * - Consistent JWT validation configuration
 * - Metrics tracking for monitoring
 * - Efficient single instance (no per-request instantiation)
 */
export async function authMiddleware(
  request: FastifyRequest & { cookies?: { access_token?: string } },
  reply: FastifyReply,
): Promise<void> {
  // Extract access token from httpOnly cookie
  const accessToken = request.cookies?.access_token;

  if (!accessToken) {
    return reply.code(401).send({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Missing access token cookie",
      },
    });
  }

  // Validate JWT token using centralized singleton service
  // Returns structured result instead of throwing
  const validationResult =
    tokenValidationService.verifyAccessToken(accessToken);

  if (!validationResult.success || !validationResult.payload) {
    // Log validation failures for security monitoring (non-PII)
    console.warn("[AuthMiddleware] Token validation failed:", {
      error: validationResult.error,
      validationTimeMs: validationResult.validationTimeMs,
      requestPath: request.url,
      timestamp: new Date().toISOString(),
    });

    return reply.code(401).send({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: validationResult.error || "Token validation failed",
      },
    });
  }

  const decoded = validationResult.payload;

  // Extract user identity from token payload
  const userIdentity: UserIdentity = {
    id: decoded.user_id,
    email: decoded.email,
    roles: decoded.roles || [],
    permissions: decoded.permissions || [],
    client_id: decoded.client_id, // Include client_id if present (for CLIENT_OWNER users)
    // Extract scope from JWT
    is_system_admin: decoded.is_system_admin || false,
    company_ids: decoded.company_ids || [],
    store_ids: decoded.store_ids || [],
  };

  // Attach user identity to request for use in route handlers
  (request as any).user = userIdentity;
}
