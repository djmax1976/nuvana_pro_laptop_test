/**
 * Cashier Session Service
 *
 * Implements the Cashier Session Token pattern for enterprise-grade terminal operations.
 * This service manages the lifecycle of cashier sessions on terminals.
 *
 * Security Model:
 * - CLIENT_USER authenticates via web login (JWT in httpOnly cookie)
 * - CASHIER authenticates via PIN (creates CashierSession with token)
 * - Terminal operations require BOTH valid JWT AND valid CashierSession
 * - Authorization checks use CASHIER's permissions (SHIFT_OPEN, TRANSACTION_CREATE, etc.)
 *
 * Industry Pattern Reference:
 * - Square POS: Device session + cashier PIN
 * - Toast: Terminal session management
 * - Clover: Employee shifts with PIN authentication
 *
 * @module services/cashier-session.service
 */

import crypto from "crypto";
import { prisma } from "../utils/db";
import type { CashierSession } from "@prisma/client";
import { Prisma } from "@prisma/client";

/**
 * Session token response returned to frontend
 */
export interface CashierSessionResponse {
  session_id: string;
  session_token: string; // Plain token (only returned once on creation)
  cashier_id: string;
  cashier_name: string;
  terminal_id: string;
  store_id: string;
  expires_at: Date;
}

/**
 * Session validation result
 */
export interface SessionValidationResult {
  valid: boolean;
  session?: CashierSession & {
    cashier: {
      cashier_id: string;
      name: string;
      store_id: string;
      is_active: boolean;
    };
  };
  error?: string;
}

/**
 * Configuration for session management
 */
const SESSION_CONFIG = {
  /** Session token length in bytes (32 bytes = 256 bits) */
  TOKEN_LENGTH: 32,
  /** Default session duration in hours */
  DEFAULT_EXPIRY_HOURS: 12,
  /** Maximum concurrent sessions per cashier per terminal */
  MAX_SESSIONS_PER_CASHIER_TERMINAL: 1,
};

/**
 * Generate a cryptographically secure session token
 * @returns Plain text token (hex encoded)
 */
function generateSessionToken(): string {
  return crypto.randomBytes(SESSION_CONFIG.TOKEN_LENGTH).toString("hex");
}

/**
 * Hash a session token for storage
 * Uses SHA-256 for consistent, fast lookups
 * @param token - Plain text token
 * @returns SHA-256 hash (hex encoded)
 */
function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Create a new cashier session
 *
 * Called after successful PIN authentication. Creates a session token
 * that must be included in subsequent terminal operation requests.
 *
 * @param params.cashierId - Authenticated cashier's ID
 * @param params.terminalId - Terminal being accessed
 * @param params.storeId - Store the terminal belongs to
 * @param params.authenticatedBy - CLIENT_USER who initiated the authentication
 * @param params.expiryHours - Optional custom expiry (default: 12 hours)
 * @returns Session response with plain token (only returned once)
 */
export async function createCashierSession(params: {
  cashierId: string;
  terminalId: string;
  storeId: string;
  authenticatedBy: string;
  expiryHours?: number;
}): Promise<CashierSessionResponse> {
  const {
    cashierId,
    terminalId,
    storeId,
    authenticatedBy,
    expiryHours = SESSION_CONFIG.DEFAULT_EXPIRY_HOURS,
  } = params;

  // Invalidate any existing active sessions for this cashier on this terminal
  await invalidateExistingSessions(cashierId, terminalId);

  // Generate new session token
  const plainToken = generateSessionToken();
  const tokenHash = hashSessionToken(plainToken);

  // Calculate expiry (UTC-safe, timezone-independent)
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

  // Create session in database
  const session = await prisma.cashierSession.create({
    data: {
      cashier_id: cashierId,
      terminal_id: terminalId,
      store_id: storeId,
      session_token_hash: tokenHash,
      authenticated_by: authenticatedBy,
      expires_at: expiresAt,
      is_active: true,
    },
    include: {
      cashier: {
        select: {
          cashier_id: true,
          name: true,
          store_id: true,
        },
      },
    },
  });

  return {
    session_id: session.session_id,
    session_token: plainToken, // Only returned once!
    cashier_id: session.cashier_id,
    cashier_name: session.cashier.name,
    terminal_id: session.terminal_id,
    store_id: session.store_id,
    expires_at: session.expires_at,
  };
}

/**
 * Invalidate existing active sessions for a cashier on a terminal
 * Ensures only one active session per cashier per terminal
 */
async function invalidateExistingSessions(
  cashierId: string,
  terminalId: string,
): Promise<void> {
  await prisma.cashierSession.updateMany({
    where: {
      cashier_id: cashierId,
      terminal_id: terminalId,
      is_active: true,
    },
    data: {
      is_active: false,
      ended_at: new Date(),
    },
  });
}

/**
 * Validate a session token
 *
 * Checks if the token is valid, not expired, and the session is active.
 * Returns the full session with cashier details for authorization checks.
 *
 * @param token - Plain text session token from request header
 * @returns Validation result with session details if valid
 */
export async function validateSessionToken(
  token: string,
): Promise<SessionValidationResult> {
  if (!token) {
    return { valid: false, error: "Session token required" };
  }

  const tokenHash = hashSessionToken(token);

  const session = await prisma.cashierSession.findUnique({
    where: {
      session_token_hash: tokenHash,
    },
    include: {
      cashier: {
        select: {
          cashier_id: true,
          name: true,
          store_id: true,
          is_active: true,
        },
      },
    },
  });

  if (!session) {
    return { valid: false, error: "Invalid session token" };
  }

  if (!session.is_active) {
    return { valid: false, error: "Session has been terminated" };
  }

  if (session.expires_at < new Date()) {
    // Auto-invalidate expired session
    await prisma.cashierSession.update({
      where: { session_id: session.session_id },
      data: { is_active: false, ended_at: new Date() },
    });
    return { valid: false, error: "Session has expired" };
  }

  if (!session.cashier) {
    return { valid: false, error: "Cashier session is missing cashier data" };
  }

  if (!session.cashier.is_active) {
    return { valid: false, error: "Cashier account is disabled" };
  }

  return { valid: true, session };
}

/**
 * End a cashier session
 *
 * Called when cashier logs out, shift ends, or session is manually terminated.
 *
 * @param sessionId - Session ID to end
 * @returns Updated session or null if not found
 */
export async function endCashierSession(
  sessionId: string,
): Promise<CashierSession | null> {
  try {
    return await prisma.cashierSession.update({
      where: { session_id: sessionId },
      data: {
        is_active: false,
        ended_at: new Date(),
      },
    });
  } catch (error: unknown) {
    // Handle "not found" case - this is expected and can return null
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      // Record not found - this is a valid case, return null
      return null;
    }

    // Log all other errors with full context for debugging
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : String(error);

    console.error(
      `Failed to end cashier session: sessionId=${sessionId}, error=${errorMessage}, stack=${errorStack}`,
    );

    // Rethrow with additional context for callers to handle
    throw new Error(
      `Failed to end cashier session (sessionId: ${sessionId}): ${errorMessage}`,
    );
  }
}

/**
 * End session by token
 *
 * Alternative method to end session using the token instead of session ID.
 *
 * @param token - Plain text session token
 * @returns Updated session or null if not found
 */
export async function endCashierSessionByToken(
  token: string,
): Promise<CashierSession | null> {
  const tokenHash = hashSessionToken(token);

  try {
    return await prisma.cashierSession.update({
      where: { session_token_hash: tokenHash },
      data: {
        is_active: false,
        ended_at: new Date(),
      },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    const errorStack = err instanceof Error ? err.stack : String(err);

    console.error(
      `Failed to end cashier session by token: function=endCashierSessionByToken, tokenHash=${tokenHash}, error=${errorMessage}, stack=${errorStack}`,
    );

    return null;
  }
}

/**
 * Link a session to a shift
 *
 * Called when a shift is started using a cashier session.
 * Links the session to the shift for audit trail.
 *
 * @param sessionId - Session ID
 * @param shiftId - Shift ID to link
 */
export async function linkSessionToShift(
  sessionId: string,
  shiftId: string,
): Promise<void> {
  await prisma.cashierSession.update({
    where: { session_id: sessionId },
    data: { shift_id: shiftId },
  });
}

/**
 * Get active session for a terminal
 *
 * Returns the currently active session for a terminal, if any.
 *
 * @param terminalId - Terminal ID
 * @returns Active session or null
 */
export async function getActiveSessionForTerminal(
  terminalId: string,
): Promise<CashierSession | null> {
  return await prisma.cashierSession.findFirst({
    where: {
      terminal_id: terminalId,
      is_active: true,
      expires_at: {
        gt: new Date(),
      },
    },
    include: {
      cashier: {
        select: {
          cashier_id: true,
          name: true,
          store_id: true,
        },
      },
    },
  });
}

/**
 * Get all active sessions for a cashier
 *
 * Used for audit and to prevent multiple simultaneous sessions.
 *
 * @param cashierId - Cashier ID
 * @returns Array of active sessions
 */
export async function getActiveSessions(
  cashierId: string,
): Promise<CashierSession[]> {
  return await prisma.cashierSession.findMany({
    where: {
      cashier_id: cashierId,
      is_active: true,
      expires_at: {
        gt: new Date(),
      },
    },
  });
}

/**
 * End all sessions for a cashier
 *
 * Used when cashier is disabled or for security purposes.
 *
 * @param cashierId - Cashier ID
 * @returns Number of sessions ended
 */
export async function endAllSessionsForCashier(
  cashierId: string,
): Promise<number> {
  const result = await prisma.cashierSession.updateMany({
    where: {
      cashier_id: cashierId,
      is_active: true,
    },
    data: {
      is_active: false,
      ended_at: new Date(),
    },
  });
  return result.count;
}

/**
 * Clean up expired sessions
 *
 * Batch operation to mark expired sessions as inactive.
 * Should be run periodically (e.g., via cron job).
 *
 * @returns Number of sessions cleaned up
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await prisma.cashierSession.updateMany({
    where: {
      is_active: true,
      expires_at: {
        lt: new Date(),
      },
    },
    data: {
      is_active: false,
      ended_at: new Date(),
    },
  });
  return result.count;
}

export const cashierSessionService = {
  createSession: createCashierSession,
  validateToken: validateSessionToken,
  endSession: endCashierSession,
  endSessionByToken: endCashierSessionByToken,
  linkToShift: linkSessionToShift,
  getActiveForTerminal: getActiveSessionForTerminal,
  getActiveSessions,
  endAllForCashier: endAllSessionsForCashier,
  cleanupExpired: cleanupExpiredSessions,
};
