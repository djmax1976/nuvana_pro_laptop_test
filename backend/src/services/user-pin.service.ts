/**
 * User PIN Service
 *
 * Handles PIN authentication for STORE_MANAGER and SHIFT_MANAGER roles.
 * Follows the same patterns as CashierService for PIN handling.
 *
 * Enterprise Standards Compliance:
 * - SEC-001 PASSWORD_HASHING: bcrypt with salt rounds 10, per-user salts
 * - DB-006 TENANT_ISOLATION: PIN uniqueness scoped per-store via UserRole
 * - DB-001 ORM_USAGE: Prisma ORM only, no raw SQL concatenation
 *
 * @module services/user-pin.service
 */

import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash } from "crypto";
import { prisma } from "../utils/db";

/**
 * Audit context for logging PIN operations
 */
export interface PINAuditContext {
  userId: string;
  userEmail: string;
  userRoles: string[];
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Result of PIN verification
 */
export interface PINVerificationResult {
  valid: boolean;
  userId: string;
  userName: string;
  userEmail: string;
  roles: string[];
  permissions: string[];
}

/**
 * Roles that support PIN authentication
 */
export const PIN_ENABLED_ROLES = ["STORE_MANAGER", "SHIFT_MANAGER"] as const;
export type PINEnabledRole = (typeof PIN_ENABLED_ROLES)[number];

/**
 * Check if a role supports PIN authentication
 * @param roleCode - Role code to check
 * @returns True if role supports PIN
 */
export function isPINEnabledRole(roleCode: string): roleCode is PINEnabledRole {
  return PIN_ENABLED_ROLES.includes(roleCode as PINEnabledRole);
}

/**
 * User PIN Service
 * Handles PIN authentication for STORE_MANAGER and SHIFT_MANAGER roles
 */
class UserPINService {
  /**
   * Validate PIN format (exactly 4 numeric digits)
   * @param pin - PIN to validate
   * @returns True if valid
   * @throws Error if PIN format is invalid
   */
  validatePIN(pin: string): boolean {
    const pinRegex = /^\d{4}$/;
    if (!pinRegex.test(pin)) {
      throw new Error("PIN must be exactly 4 numeric digits");
    }
    return true;
  }

  /**
   * Compute SHA-256 fingerprint of PIN for fast uniqueness checks
   * Uses deterministic hashing for efficient duplicate detection
   * @param pin - PIN to fingerprint
   * @returns SHA-256 hex digest (64 characters)
   */
  computePINFingerprint(pin: string): string {
    return createHash("sha256").update(pin).digest("hex");
  }

  /**
   * Hash PIN using bcrypt with salt rounds 10
   * SEC-001 PASSWORD_HASHING: bcrypt with per-user salts
   * @param pin - PIN to hash
   * @returns Hashed PIN (bcrypt format)
   */
  async hashPIN(pin: string): Promise<string> {
    this.validatePIN(pin);
    return await bcrypt.hash(pin, 10);
  }

  /**
   * Verify PIN matches stored hash using constant-time comparison
   * @param pin - Plain text PIN to verify
   * @param pinHash - Stored bcrypt hash
   * @returns True if PIN matches
   */
  async verifyPINHash(pin: string, pinHash: string): Promise<boolean> {
    return await bcrypt.compare(pin, pinHash);
  }

  /**
   * Check if user has PIN configured
   * @param userId - User UUID
   * @param prismaClient - Prisma client for transaction support
   * @returns True if user has PIN set
   */
  async hasUserPIN(
    userId: string,
    prismaClient: PrismaClient | Prisma.TransactionClient = prisma,
  ): Promise<boolean> {
    const user = await prismaClient.user.findUnique({
      where: { user_id: userId },
      select: { pin_hash: true },
    });

    return user !== null && user.pin_hash !== null;
  }

  /**
   * Validate PIN uniqueness within a store
   * Checks all users with roles at the same store to ensure no duplicate PINs
   *
   * DB-006 TENANT_ISOLATION: PIN uniqueness scoped per-store via UserRole
   *
   * @param storeId - Store UUID for uniqueness scope
   * @param pin - Plain text PIN to check
   * @param excludeUserId - User ID to exclude (for updates)
   * @param prismaClient - Prisma client for transaction support
   * @returns True if unique
   * @throws Error if PIN is already in use
   */
  async validatePINUniquenessInStore(
    storeId: string,
    pin: string,
    excludeUserId?: string,
    prismaClient: PrismaClient | Prisma.TransactionClient = prisma,
  ): Promise<boolean> {
    // Compute SHA-256 fingerprint for fast deterministic check
    const pinFingerprint = this.computePINFingerprint(pin);

    // Find all users with roles at this store who have a PIN fingerprint matching
    // This uses the index on sha256_pin_fingerprint for efficient lookup
    const usersWithMatchingFingerprint = await prismaClient.user.findMany({
      where: {
        sha256_pin_fingerprint: pinFingerprint,
        user_id: excludeUserId ? { not: excludeUserId } : undefined,
        // Must have an active role at this store
        user_roles: {
          some: {
            store_id: storeId,
            status: "ACTIVE",
          },
        },
      },
      select: {
        user_id: true,
        pin_hash: true,
      },
    });

    // Fast path: check fingerprint matches
    for (const user of usersWithMatchingFingerprint) {
      if (user.pin_hash && (await bcrypt.compare(pin, user.pin_hash))) {
        throw new Error(
          "PIN already in use by another user at this store. Please choose a different PIN.",
        );
      }
    }

    // Fallback: check all users at this store who have PINs but might not have fingerprints (legacy)
    // This handles edge cases where sha256_pin_fingerprint might be null
    const usersAtStore = await prismaClient.user.findMany({
      where: {
        pin_hash: { not: null },
        sha256_pin_fingerprint: null, // Only check those without fingerprints
        user_id: excludeUserId ? { not: excludeUserId } : undefined,
        user_roles: {
          some: {
            store_id: storeId,
            status: "ACTIVE",
          },
        },
      },
      select: {
        user_id: true,
        pin_hash: true,
      },
    });

    for (const user of usersAtStore) {
      if (user.pin_hash && (await bcrypt.compare(pin, user.pin_hash))) {
        throw new Error(
          "PIN already in use by another user at this store. Please choose a different PIN.",
        );
      }
    }

    return true;
  }

  /**
   * Set or update PIN for a user
   * Validates format, uniqueness within store, then stores hashed PIN
   *
   * @param userId - User UUID
   * @param pin - Plain text 4-digit PIN
   * @param storeId - Store UUID for uniqueness validation
   * @param auditContext - Audit context for logging
   * @param prismaClient - Prisma client for transaction support
   * @throws Error if PIN format invalid or already in use
   */
  async setUserPIN(
    userId: string,
    pin: string,
    storeId: string,
    auditContext: PINAuditContext,
    prismaClient: PrismaClient | Prisma.TransactionClient = prisma,
  ): Promise<void> {
    // Validate PIN format
    this.validatePIN(pin);

    // Validate uniqueness within store
    await this.validatePINUniquenessInStore(storeId, pin, userId, prismaClient);

    // Hash PIN and compute fingerprint
    const pinHash = await this.hashPIN(pin);
    const pinFingerprint = this.computePINFingerprint(pin);

    // Get old PIN status for audit log
    const oldUser = await prismaClient.user.findUnique({
      where: { user_id: userId },
      select: { pin_hash: true },
    });

    const hadPIN = oldUser?.pin_hash !== null;

    // Update user with new PIN
    await prismaClient.user.update({
      where: { user_id: userId },
      data: {
        pin_hash: pinHash,
        sha256_pin_fingerprint: pinFingerprint,
      },
    });

    // Create audit log
    try {
      await prismaClient.auditLog.create({
        data: {
          user_id: auditContext.userId,
          action: hadPIN ? "PIN_UPDATE" : "PIN_SET",
          table_name: "users",
          record_id: userId,
          old_values: hadPIN
            ? ({ pin_hash: "[REDACTED]" } as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          new_values: { pin_hash: "[REDACTED]" } as Prisma.InputJsonValue,
          ip_address: auditContext.ipAddress,
          user_agent: auditContext.userAgent,
          reason: hadPIN
            ? `PIN updated by ${auditContext.userEmail} for store ${storeId}`
            : `PIN set by ${auditContext.userEmail} for store ${storeId}`,
        },
      });
    } catch (auditError) {
      // Non-blocking: log error but don't fail the operation
      console.error("Failed to create audit log for PIN update:", auditError);
    }
  }

  /**
   * Clear PIN from a user (remove PIN authentication capability)
   *
   * @param userId - User UUID
   * @param auditContext - Audit context for logging
   * @param prismaClient - Prisma client for transaction support
   */
  async clearUserPIN(
    userId: string,
    auditContext: PINAuditContext,
    prismaClient: PrismaClient | Prisma.TransactionClient = prisma,
  ): Promise<void> {
    // Get current PIN status
    const user = await prismaClient.user.findUnique({
      where: { user_id: userId },
      select: { pin_hash: true },
    });

    if (!user) {
      throw new Error("User not found");
    }

    if (!user.pin_hash) {
      // No PIN to clear - silently succeed
      return;
    }

    // Clear PIN
    await prismaClient.user.update({
      where: { user_id: userId },
      data: {
        pin_hash: null,
        sha256_pin_fingerprint: null,
      },
    });

    // Create audit log
    try {
      await prismaClient.auditLog.create({
        data: {
          user_id: auditContext.userId,
          action: "PIN_CLEAR",
          table_name: "users",
          record_id: userId,
          old_values: { pin_hash: "[REDACTED]" } as Prisma.InputJsonValue,
          new_values: { pin_hash: "[CLEARED]" } as Prisma.InputJsonValue,
          ip_address: auditContext.ipAddress,
          user_agent: auditContext.userAgent,
          reason: `PIN cleared by ${auditContext.userEmail}`,
        },
      });
    } catch (auditError) {
      console.error("Failed to create audit log for PIN clear:", auditError);
    }
  }

  /**
   * Verify user PIN and return user details if valid
   * Used for step-up authentication (elevation token generation)
   *
   * @param userId - User UUID
   * @param pin - Plain text PIN to verify
   * @param storeId - Store UUID to verify user has role at this store
   * @param prismaClient - Prisma client for transaction support
   * @returns Verification result with user details
   * @throws Error if user not found, no PIN set, or verification fails
   */
  async verifyUserPIN(
    userId: string,
    pin: string,
    storeId: string,
    prismaClient: PrismaClient | Prisma.TransactionClient = prisma,
  ): Promise<PINVerificationResult> {
    // Validate PIN format first (fail fast)
    this.validatePIN(pin);

    // Fetch user with roles and permissions for the specific store
    const user = await prismaClient.user.findUnique({
      where: { user_id: userId },
      select: {
        user_id: true,
        name: true,
        email: true,
        pin_hash: true,
        status: true,
        user_roles: {
          where: {
            store_id: storeId,
            status: "ACTIVE",
          },
          select: {
            role: {
              select: {
                code: true,
                role_permissions: {
                  select: {
                    permission: {
                      select: { code: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Generic error message for security (no information leakage)
    const genericError = new Error("Invalid credentials");

    if (!user) {
      throw genericError;
    }

    if (user.status !== "ACTIVE") {
      throw genericError;
    }

    if (!user.pin_hash) {
      throw new Error(
        "PIN not configured. Please contact your manager to set up your PIN.",
      );
    }

    // Verify user has an active role at this store
    if (user.user_roles.length === 0) {
      throw genericError;
    }

    // Verify PIN using constant-time comparison
    const pinValid = await bcrypt.compare(pin, user.pin_hash);
    if (!pinValid) {
      throw genericError;
    }

    // Extract roles and permissions
    const roles = user.user_roles.map((ur) => ur.role.code);
    const permissionsSet = new Set<string>();
    for (const userRole of user.user_roles) {
      for (const rp of userRole.role.role_permissions) {
        permissionsSet.add(rp.permission.code);
      }
    }

    return {
      valid: true,
      userId: user.user_id,
      userName: user.name,
      userEmail: user.email,
      roles,
      permissions: Array.from(permissionsSet),
    };
  }

  /**
   * Get users at a store who have PIN-enabled roles but no PIN set
   * Useful for identifying users who need PIN setup
   *
   * @param storeId - Store UUID
   * @param prismaClient - Prisma client for transaction support
   * @returns Array of users needing PIN setup
   */
  async getUsersNeedingPIN(
    storeId: string,
    prismaClient: PrismaClient | Prisma.TransactionClient = prisma,
  ): Promise<
    Array<{ user_id: string; name: string; email: string; roles: string[] }>
  > {
    const users = await prismaClient.user.findMany({
      where: {
        pin_hash: null,
        status: "ACTIVE",
        user_roles: {
          some: {
            store_id: storeId,
            status: "ACTIVE",
            role: {
              code: { in: [...PIN_ENABLED_ROLES] },
            },
          },
        },
      },
      select: {
        user_id: true,
        name: true,
        email: true,
        user_roles: {
          where: {
            store_id: storeId,
            status: "ACTIVE",
          },
          select: {
            role: {
              select: { code: true },
            },
          },
        },
      },
    });

    return users.map((u) => ({
      user_id: u.user_id,
      name: u.name,
      email: u.email,
      roles: u.user_roles.map((ur) => ur.role.code),
    }));
  }
}

// Export singleton instance
export const userPINService = new UserPINService();

// Export class for testing
export { UserPINService };
