/**
 * Cashier Session Middleware
 *
 * Validates cashier session tokens for terminal operations.
 * Used in conjunction with auth middleware to implement the dual-auth pattern:
 * - JWT cookie authenticates the CLIENT_USER (web session)
 * - X-Cashier-Session header authenticates the CASHIER (terminal session)
 *
 * Terminal operations require BOTH valid JWT AND valid cashier session.
 * Authorization checks use the CASHIER's permissions (SHIFT_OPEN, etc.)
 *
 * @module middleware/cashier-session.middleware
 */

import { FastifyRequest, FastifyReply } from "fastify";
import { cashierSessionService } from "../services/cashier-session.service";
import { rbacService } from "../services/rbac.service";
import type { PermissionCode } from "../constants/permissions";

/**
 * Session data attached to request after validation
 */
export interface CashierSessionData {
  sessionId: string;
  cashierId: string;
  cashierName: string;
  terminalId: string;
  storeId: string;
}

/**
 * Extended request type with cashier session
 */
export interface RequestWithCashierSession extends FastifyRequest {
  cashierSession?: CashierSessionData;
}

/**
 * Header name for cashier session token
 */
const CASHIER_SESSION_HEADER = "x-cashier-session";

/**
 * Extract cashier session token from request headers
 */
function extractSessionToken(request: FastifyRequest): string | null {
  // Access header directly using the constant key
  // eslint-disable-next-line security/detect-object-injection
  const token = request.headers[CASHIER_SESSION_HEADER];
  if (Array.isArray(token)) {
    return token[0] || null;
  }
  return token || null;
}

/**
 * Cashier session validation middleware
 *
 * Validates the X-Cashier-Session header and attaches session data to request.
 * Returns 401 if session is invalid, expired, or missing.
 *
 * @example
 * fastify.post('/api/terminals/:terminalId/shifts/start', {
 *   preHandler: [authMiddleware, cashierSessionMiddleware]
 * }, handler);
 */
export async function cashierSessionMiddleware(
  request: RequestWithCashierSession,
  reply: FastifyReply,
): Promise<void> {
  const token = extractSessionToken(request);

  if (!token) {
    return reply.code(401).send({
      success: false,
      error: {
        code: "CASHIER_SESSION_REQUIRED",
        message: "Cashier session token is required for terminal operations",
      },
    });
  }

  const result = await cashierSessionService.validateToken(token);

  if (!result.valid || !result.session) {
    return reply.code(401).send({
      success: false,
      error: {
        code: "CASHIER_SESSION_INVALID",
        message: result.error || "Invalid or expired cashier session",
      },
    });
  }

  // Attach session data to request for use in route handlers
  request.cashierSession = {
    sessionId: result.session.session_id,
    cashierId: result.session.cashier_id,
    cashierName: result.session.cashier.name,
    terminalId: result.session.terminal_id,
    storeId: result.session.store_id,
  };
}

/**
 * Create middleware that validates cashier session AND checks cashier permission
 *
 * This middleware:
 * 1. Validates the cashier session token
 * 2. Checks if the CASHIER role has the required permission
 *
 * Note: This checks the CASHIER role's permissions, not the CLIENT_USER's permissions.
 * This is the key difference from the standard permissionMiddleware.
 *
 * @param requiredPermission - Permission code required (checked against CASHIER role)
 * @returns Fastify middleware function
 *
 * @example
 * fastify.post('/api/terminals/:terminalId/shifts/start', {
 *   preHandler: [
 *     authMiddleware, // Validates JWT (CLIENT_USER)
 *     cashierSessionWithPermission(PERMISSIONS.SHIFT_OPEN) // Validates session + cashier permission
 *   ]
 * }, handler);
 */
export function cashierSessionWithPermission(
  requiredPermission: PermissionCode,
) {
  return async (
    request: RequestWithCashierSession,
    reply: FastifyReply,
  ): Promise<void> => {
    // First validate the session
    const token = extractSessionToken(request);

    if (!token) {
      return reply.code(401).send({
        success: false,
        error: {
          code: "CASHIER_SESSION_REQUIRED",
          message: "Cashier session token is required for terminal operations",
        },
      });
    }

    const result = await cashierSessionService.validateToken(token);

    if (!result.valid || !result.session) {
      return reply.code(401).send({
        success: false,
        error: {
          code: "CASHIER_SESSION_INVALID",
          message: result.error || "Invalid or expired cashier session",
        },
      });
    }

    // Attach session data to request
    request.cashierSession = {
      sessionId: result.session.session_id,
      cashierId: result.session.cashier_id,
      cashierName: result.session.cashier.name,
      terminalId: result.session.terminal_id,
      storeId: result.session.store_id,
    };

    // Now check if CASHIER role has the required permission
    // We check against the 'CASHIER' role, scoped to the session's store
    const hasPermission = await rbacService.checkRoleHasPermission(
      "CASHIER",
      requiredPermission,
      { storeId: result.session.store_id },
    );

    if (!hasPermission) {
      return reply.code(403).send({
        success: false,
        error: {
          code: "PERMISSION_DENIED",
          message: `Cashier permission denied: ${requiredPermission} is required`,
        },
      });
    }

    // Both session validation and permission check passed
  };
}

/**
 * Validate terminal ID matches session
 *
 * Additional middleware to ensure the terminal ID in the route matches
 * the terminal ID in the cashier session. Prevents session hijacking.
 *
 * @example
 * fastify.post('/api/terminals/:terminalId/shifts/start', {
 *   preHandler: [
 *     authMiddleware,
 *     cashierSessionMiddleware,
 *     validateTerminalMatch
 *   ]
 * }, handler);
 */
export async function validateTerminalMatch(
  request: RequestWithCashierSession,
  reply: FastifyReply,
): Promise<void> {
  const { terminalId } = request.params as { terminalId?: string };

  if (!terminalId) {
    // No terminal ID in route, skip validation
    return;
  }

  if (!request.cashierSession) {
    return reply.code(401).send({
      success: false,
      error: {
        code: "CASHIER_SESSION_REQUIRED",
        message: "Cashier session is required",
      },
    });
  }

  if (request.cashierSession.terminalId !== terminalId) {
    return reply.code(403).send({
      success: false,
      error: {
        code: "TERMINAL_MISMATCH",
        message: "Session is not valid for this terminal",
      },
    });
  }
}
