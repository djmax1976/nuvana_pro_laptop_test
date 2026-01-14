/**
 * Store Manager Sync Service
 *
 * Enterprise-grade store manager data synchronization for desktop POS applications.
 * Enables offline manager authentication following industry patterns (NCR Aloha,
 * Microsoft Dynamics 365, Oracle MICROS) for manager override/approval operations.
 *
 * Security Controls:
 * - Store isolation: Only returns the manager for the API key's bound store
 * - No password exposure: Only PIN hash is returned, never password hash
 * - Audit logging: All sync operations are logged
 *
 * @module services/api-key/store-manager-sync.service
 */

import { prisma } from "../../utils/db";
import { apiKeyAuditService } from "./api-key-audit.service";
import type {
  StoreManagerSyncRecord,
  ApiKeyIdentity,
} from "../../types/api-key.types";

// ============================================================================
// Types
// ============================================================================

/**
 * Audit context for logging store manager sync operations
 */
export interface StoreManagerSyncAuditContext {
  apiKeyId: string;
  ipAddress: string;
  eventType: "ACTIVATION" | "SYNC";
}

// ============================================================================
// Service Implementation
// ============================================================================

class StoreManagerSyncService {
  /**
   * Get store manager data for the specified store
   *
   * Security: Only returns the manager linked via store_login_user_id.
   * Never includes password_hash - only pin_hash for terminal authentication.
   *
   * @param storeId - Store ID (from validated API key identity)
   * @param syncSequence - Optional sequence number for sync ordering
   * @returns Store manager sync record or null if no store login configured
   */
  async getStoreManagerForSync(
    storeId: string,
    syncSequence: number = 1,
  ): Promise<StoreManagerSyncRecord | null> {
    // Fetch store with store_login user and their roles
    const store = await prisma.store.findUnique({
      where: { store_id: storeId },
      select: {
        store_id: true,
        name: true,
        public_id: true,
        store_login_user_id: true,
        store_login: {
          select: {
            user_id: true,
            public_id: true,
            name: true,
            email: true,
            status: true,
            pin_hash: true,
            // SECURITY: Never select password_hash - only pin_hash for terminal auth
            updated_at: true,
            user_roles: {
              where: {
                status: "ACTIVE",
                store_id: storeId, // Only roles for this specific store
              },
              include: {
                role: {
                  select: {
                    code: true,
                    description: true,
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
        },
      },
    });

    // Return null if store not found or no store login configured
    if (!store || !store.store_login) {
      return null;
    }

    const manager = store.store_login;
    const isActive = manager.status === "ACTIVE";

    // Get the primary role for this store (first active role)
    const primaryUserRole = manager.user_roles[0];
    const role = primaryUserRole?.role || {
      code: "UNKNOWN",
      description: null,
    };

    // Aggregate all permissions from all roles for this store
    const permissionsSet = new Set<string>();
    for (const userRole of manager.user_roles) {
      for (const rp of userRole.role.role_permissions) {
        permissionsSet.add(rp.permission.code);
      }
    }

    return {
      userId: manager.user_id,
      publicId: manager.public_id,
      name: manager.name,
      email: manager.email,
      pinHash: manager.pin_hash,
      isActive,
      role: {
        code: role.code,
        description: role.description,
      },
      storeAssignments: [
        {
          storeId: store.store_id,
          storeName: store.name,
          storePublicId: store.public_id,
        },
      ],
      permissions: Array.from(permissionsSet),
      updatedAt: manager.updated_at.toISOString(),
      syncSequence,
    };
  }

  /**
   * Get store manager for API key activation with audit logging
   *
   * @param identity - API key identity from middleware
   * @param auditContext - Context for audit logging
   * @returns Store manager sync record or null
   */
  async getStoreManagerForActivation(
    identity: ApiKeyIdentity,
    auditContext: StoreManagerSyncAuditContext,
  ): Promise<StoreManagerSyncRecord | null> {
    const storeManager = await this.getStoreManagerForSync(identity.storeId);

    // Log sync operation (async, non-blocking)
    this.logStoreManagerSync(auditContext, storeManager !== null).catch((err) =>
      console.error("[StoreManagerSyncService] Audit log error:", err),
    );

    return storeManager;
  }

  /**
   * Log store manager sync operation for audit trail
   */
  private async logStoreManagerSync(
    context: StoreManagerSyncAuditContext,
    managerFound: boolean,
  ): Promise<void> {
    await apiKeyAuditService.logCustomEvent(
      context.apiKeyId,
      context.eventType === "ACTIVATION" ? "ACTIVATED" : "SYNC_STARTED",
      "DEVICE",
      context.ipAddress,
      undefined,
      {
        syncType: "STORE_MANAGER_SYNC",
        managerFound,
      },
    );
  }
}

// Export singleton instance
export const storeManagerSyncService = new StoreManagerSyncService();
