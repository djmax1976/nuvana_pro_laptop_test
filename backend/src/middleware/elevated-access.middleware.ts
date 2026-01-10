/**
 * Elevated Access Middleware
 *
 * Validates elevation tokens for step-up authentication on sensitive operations.
 * Used by POS routes and other endpoints that require elevated access.
 *
 * Security Standards:
 * - SEC-010: AUTHZ - Validates elevation tokens for specific permissions
 * - SEC-012: SESSION_TIMEOUT - Enforces token expiry
 * - SEC-014: INPUT_VALIDATION - Validates token structure
 *
 * @module middleware/elevated-access.middleware
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { elevationTokenService } from "../services/auth/elevation-token.service";
import { elevatedAccessAuditService } from "../services/auth/elevated-access-audit.service";

// ============================================================================
// Types
// ============================================================================

/**
 * Extended request with elevation token info
 */
export interface ElevatedAccessRequest extends FastifyRequest {
  elevationToken?: {
    userId: string;
    email: string;
    permission: string;
    storeId?: string;
    jti: string;
  };
}

// ============================================================================
// Middleware Factory
// ============================================================================

/**
 * Create elevated access middleware for a specific permission
 *
 * This middleware:
 * 1. Extracts elevation token from X-Elevation-Token header
 * 2. Validates the token (signature, expiry, replay)
 * 3. Verifies the token permission matches the required permission
 * 4. Optionally verifies the token store matches the request store
 * 5. Marks the token as used (single-use enforcement)
 * 6. Attaches token info to request for downstream use
 *
 * @param requiredPermission - The permission the token must grant
 * @param options - Additional options
 * @param options.requireStoreMatch - If true, token storeId must match route :storeId param
 * @param options.allowFallbackToSession - If true, allows session-based auth as fallback
 */
export function elevatedAccessMiddleware(
  requiredPermission: string,
  options: {
    requireStoreMatch?: boolean;
    allowFallbackToSession?: boolean;
  } = {},
) {
  return async (request: ElevatedAccessRequest, reply: FastifyReply) => {
    const { requireStoreMatch = true, allowFallbackToSession = false } =
      options;

    // Extract request metadata for audit logging
    const ipAddress =
      (request.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      request.ip ||
      request.socket.remoteAddress ||
      "unknown";
    const userAgent = (request.headers["user-agent"] as string) || undefined;
    const requestId = (request.headers["x-request-id"] as string) || undefined;

    // Extract elevation token from header
    const elevationToken = request.headers["x-elevation-token"] as
      | string
      | undefined;

    // If no elevation token and fallback is allowed, skip this middleware
    // (let normal auth/permission middleware handle it)
    if (!elevationToken) {
      if (allowFallbackToSession) {
        // No elevation token, fall back to session-based auth
        return;
      }

      reply.code(401);
      return reply.send({
        success: false,
        error: {
          code: "ELEVATION_REQUIRED",
          message:
            "This operation requires elevated access. Please re-authenticate.",
        },
      });
    }

    // Validate the token
    const storeIdFromRoute = (request.params as { storeId?: string })?.storeId;
    const expectedStoreId = requireStoreMatch ? storeIdFromRoute : undefined;

    // Note: We don't validate against requiredPermission here because:
    // 1. The elevation token contains ALL of the elevated user's permissions
    // 2. The permissionMiddleware will check the actual required permission
    // 3. The token was created with a "primary" permission (e.g., POS_SYNC_TRIGGER)
    //    but the elevated user may have additional permissions (e.g., POS_CONNECTION_READ)
    // We only validate the token signature, expiry, and optionally the store scope.
    const validationResult = await elevationTokenService.validateToken(
      elevationToken,
      undefined, // Don't match permission - let permissionMiddleware handle it
      expectedStoreId,
    );

    if (!validationResult.valid) {
      // Log the failure
      const decodedPayload =
        elevationTokenService.decodeTokenUnsafe(elevationToken);

      if (decodedPayload) {
        await elevatedAccessAuditService.logElevationDenied({
          userId: decodedPayload.sub,
          userEmail: decodedPayload.email,
          requestedPermission: requiredPermission,
          storeId: expectedStoreId,
          ipAddress,
          userAgent,
          requestId,
          result:
            validationResult.errorCode === "EXPIRED"
              ? "FAILED_TOKEN_EXPIRED"
              : validationResult.errorCode === "USED"
                ? "FAILED_TOKEN_USED"
                : validationResult.errorCode === "SCOPE_MISMATCH"
                  ? "FAILED_SCOPE_MISMATCH"
                  : "FAILED_TOKEN_INVALID",
          errorCode: validationResult.errorCode,
          errorMessage: validationResult.error,
        });
      }

      // Return appropriate error response
      const statusCode =
        validationResult.errorCode === "EXPIRED" ||
        validationResult.errorCode === "USED"
          ? 401
          : validationResult.errorCode === "SCOPE_MISMATCH"
            ? 403
            : 401;

      reply.code(statusCode);
      return reply.send({
        success: false,
        error: {
          code: `ELEVATION_${validationResult.errorCode || "INVALID"}`,
          message:
            validationResult.errorCode === "EXPIRED"
              ? "Elevation token has expired. Please re-authenticate."
              : validationResult.errorCode === "USED"
                ? "Elevation token has already been used. Please re-authenticate."
                : validationResult.errorCode === "SCOPE_MISMATCH"
                  ? "Elevation token is not valid for this operation."
                  : "Invalid elevation token. Please re-authenticate.",
        },
      });
    }

    // Log token usage for audit trail (non-blocking, allows multi-use within lifetime)
    elevationTokenService
      .markTokenAsUsed(
        validationResult.payload!.jti,
        ipAddress,
        userAgent,
        requestId,
      )
      .catch((err) => {
        // Log but don't block - audit logging failure shouldn't prevent operation
        console.warn(
          "[ElevatedAccessMiddleware] Failed to log token usage:",
          err,
        );
      });

    // Attach elevation token info to request for downstream use
    request.elevationToken = {
      userId: validationResult.payload!.sub,
      email: validationResult.payload!.email,
      permission: validationResult.payload!.permission,
      storeId: validationResult.payload!.storeId,
      jti: validationResult.payload!.jti,
    };

    // CRITICAL: Override the session user with the elevated user's identity
    // This allows a CLIENT_USER to re-authenticate as SUPERADMIN for sensitive ops
    // The elevated user's permissions/roles are encoded in the elevation token
    if ((request as any).user) {
      const elevatedUser = validationResult.payload!;
      (request as any).user = {
        ...(request as any).user,
        // Override identity with elevated user
        id: elevatedUser.sub,
        email: elevatedUser.email,
        // Use elevated user's permissions from token payload
        roles: elevatedUser.roles || [],
        permissions: elevatedUser.permissions || [],
        // System admin flag from elevation token
        is_system_admin: elevatedUser.is_system_admin || false,
        company_ids: elevatedUser.company_ids || [],
        store_ids: elevatedUser.store_ids || [],
        // Mark this as elevated access for audit purposes
        _elevatedAccess: true,
        _originalUserId: (request as any).user.id,
      };
    }

    // Log successful token use is handled by markTokenAsUsed
  };
}

/**
 * Middleware that requires elevation token OR falls back to session auth
 *
 * Use this for operations that can be done either way:
 * - With elevation token (from re-auth modal)
 * - With session auth (from normal login)
 */
export function optionalElevatedAccessMiddleware(requiredPermission: string) {
  return elevatedAccessMiddleware(requiredPermission, {
    requireStoreMatch: true,
    allowFallbackToSession: true,
  });
}

/**
 * Middleware that strictly requires elevation token (no fallback)
 *
 * Use this for highly sensitive operations that always require step-up auth.
 */
export function strictElevatedAccessMiddleware(requiredPermission: string) {
  return elevatedAccessMiddleware(requiredPermission, {
    requireStoreMatch: true,
    allowFallbackToSession: false,
  });
}
