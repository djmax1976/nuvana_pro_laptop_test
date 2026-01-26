/**
 * Terminal Sync Service
 *
 * Provides POS connection configuration and terminal information for desktop apps.
 *
 * ARCHITECTURE (Corrected):
 * - POS connection config lives on the STORE (pos_type, pos_connection_type, pos_connection_config)
 * - Terminals are DISCOVERED dynamically after connecting to the POS
 * - Desktop app gets store config → connects to POS → discovers registers
 *
 * Workflow:
 * 1. Admin configures Store with pos_type and pos_connection_config
 * 2. Desktop app activates API key → receives Store POS config
 * 3. Desktop app connects to external POS using that config
 * 4. Desktop app discovers registers/terminals from POS data:
 *    - NAXML: RegisterID field in files
 *    - Square: GET /v2/devices
 *    - Clover: GET /merchants/{mId}/devices
 * 5. Desktop app creates/updates POSTerminal records for discovered registers
 *
 * Security Controls:
 * - DB-006: TENANT_ISOLATION - All queries scoped by store_id from API key
 * - SEC-004: AUDIT_LOGGING - All operations logged
 * - API-003: ERROR_HANDLING - Consistent error responses without stack traces
 *
 * @module services/api-key/terminal-sync.service
 */

import { prisma } from "../../utils/db";
import { apiKeyAuditService } from "./api-key-audit.service";
import type {
  ApiKeyIdentity,
  TerminalSyncRecord,
  TerminalInfoResponse,
  StorePOSConnectionConfig,
  POSConnectionConfigResponse,
} from "../../types/api-key.types";

// =============================================================================
// Types
// =============================================================================

/**
 * Audit context for logging terminal operations
 */
export interface TerminalAuditContext {
  apiKeyId: string;
  ipAddress: string;
  deviceFingerprint?: string;
}

// =============================================================================
// Service Implementation
// =============================================================================

class TerminalSyncService {
  /**
   * Get Store-level POS connection configuration (PRIMARY METHOD)
   *
   * Returns the POS connection settings configured at the Store level.
   * This is the recommended way for desktop apps to get POS config.
   *
   * Desktop apps should:
   * 1. Call this to get connection config (pos_type, pos_connection_config)
   * 2. Connect to the external POS using that config
   * 3. Discover terminals/registers dynamically
   * 4. Create/update POSTerminal records for discovered registers
   *
   * DB-006: TENANT_ISOLATION - Queries scoped by store_id from API key
   *
   * @param identity - API key identity from middleware
   * @param auditContext - Context for audit logging
   * @returns Store POS connection configuration
   */
  async getPOSConnectionConfig(
    identity: ApiKeyIdentity,
    auditContext: TerminalAuditContext,
  ): Promise<POSConnectionConfigResponse> {
    // Query store with POS config fields
    // SEC-006: Using Prisma ORM with parameterized queries
    const store = await prisma.store.findUnique({
      where: { store_id: identity.storeId },
      select: {
        store_id: true,
        name: true,
        pos_type: true,
        pos_connection_type: true,
        pos_connection_config: true,
      },
    });

    if (!store) {
      throw new Error("STORE_NOT_FOUND: Store not found");
    }

    // Log audit event (fire and forget)
    this.logPOSConfigRequest(auditContext, store.pos_type).catch((err) =>
      console.error("[TerminalSyncService] Audit log error:", err),
    );

    const config: StorePOSConnectionConfig = {
      pos_type: store.pos_type,
      pos_connection_type: store.pos_connection_type,
      pos_connection_config: store.pos_connection_config as Record<
        string,
        unknown
      > | null,
    };

    return {
      config,
      store_id: store.store_id,
      store_name: store.name,
      is_configured: store.pos_type !== "MANUAL_ENTRY",
      server_time: new Date().toISOString(),
    };
  }

  /**
   * Get Store-level POS config for activation response
   *
   * Simpler version that returns just the config object.
   * Used when including POS config in activation response.
   *
   * @param storeId - Store ID
   * @returns Store POS connection config
   */
  async getStorePOSConfig(storeId: string): Promise<StorePOSConnectionConfig> {
    const store = await prisma.store.findUnique({
      where: { store_id: storeId },
      select: {
        pos_type: true,
        pos_connection_type: true,
        pos_connection_config: true,
      },
    });

    if (!store) {
      // Return default manual config if store not found
      return {
        pos_type: "MANUAL_ENTRY",
        pos_connection_type: "MANUAL",
        pos_connection_config: null,
      };
    }

    return {
      pos_type: store.pos_type,
      pos_connection_type: store.pos_connection_type,
      pos_connection_config: store.pos_connection_config as Record<
        string,
        unknown
      > | null,
    };
  }

  /**
   * @deprecated Use getPOSConnectionConfig instead.
   * Get terminal info for an API key.
   *
   * Returns the terminal bound to this API key, if any.
   * This represents a DISCOVERED terminal, not the connection config.
   * DB-006: TENANT_ISOLATION - Validates terminal belongs to same store as API key
   *
   * @param identity - API key identity from middleware
   * @param auditContext - Context for audit logging
   * @returns Terminal info response
   */
  async getTerminalInfo(
    identity: ApiKeyIdentity,
    auditContext: TerminalAuditContext,
  ): Promise<TerminalInfoResponse> {
    // Get the API key with terminal relation
    const apiKey = await prisma.apiKey.findUnique({
      where: { api_key_id: identity.apiKeyId },
      include: {
        terminal: {
          select: {
            pos_terminal_id: true,
            name: true,
            device_id: true,
            connection_type: true,
            connection_config: true,
            pos_type: true,
            terminal_status: true,
            last_sync_at: true,
            sync_status: true,
            updated_at: true,
            store_id: true, // For tenant isolation validation
            deleted_at: true, // Check soft delete status
          },
        },
      },
    });

    if (!apiKey) {
      throw new Error("API_KEY_NOT_FOUND: API key not found");
    }

    // Log audit event (fire and forget)
    this.logTerminalInfoRequest(
      auditContext,
      apiKey.terminal?.pos_terminal_id,
    ).catch((err) =>
      console.error("[TerminalSyncService] Audit log error:", err),
    );

    // No terminal bound
    if (!apiKey.terminal) {
      return {
        terminal: null,
        is_bound: false,
        server_time: new Date().toISOString(),
      };
    }

    // Tenant isolation check - terminal must belong to same store
    if (apiKey.terminal.store_id !== identity.storeId) {
      console.error(
        `[TerminalSyncService] SECURITY: Terminal ${apiKey.terminal.pos_terminal_id} ` +
          `belongs to store ${apiKey.terminal.store_id}, but API key is bound to store ${identity.storeId}`,
      );
      throw new Error("STORE_MISMATCH: Terminal does not belong to this store");
    }

    // Check if terminal is soft-deleted
    if (apiKey.terminal.deleted_at) {
      return {
        terminal: null,
        is_bound: false,
        server_time: new Date().toISOString(),
      };
    }

    // Build terminal record
    const terminal: TerminalSyncRecord = {
      pos_terminal_id: apiKey.terminal.pos_terminal_id,
      name: apiKey.terminal.name,
      device_id: apiKey.terminal.device_id,
      connection_type: apiKey.terminal.connection_type,
      connection_config: apiKey.terminal.connection_config as Record<
        string,
        unknown
      > | null,
      pos_type: apiKey.terminal.pos_type,
      terminal_status: apiKey.terminal.terminal_status,
      last_sync_at: apiKey.terminal.last_sync_at?.toISOString() || null,
      sync_status: apiKey.terminal.sync_status,
      updated_at: apiKey.terminal.updated_at.toISOString(),
    };

    return {
      terminal,
      is_bound: true,
      server_time: new Date().toISOString(),
    };
  }

  /**
   * Bind a terminal to an API key
   * Admin operation - called when creating/updating API keys
   *
   * @param apiKeyId - API key ID to bind
   * @param posTerminalId - Terminal ID to bind
   * @param storeId - Store ID for validation
   * @param actorUserId - User performing the action
   */
  async bindTerminalToApiKey(
    apiKeyId: string,
    posTerminalId: string,
    storeId: string,
    actorUserId: string,
  ): Promise<void> {
    // Verify terminal exists and belongs to store
    const terminal = await prisma.pOSTerminal.findFirst({
      where: {
        pos_terminal_id: posTerminalId,
        store_id: storeId,
        deleted_at: null,
      },
    });

    if (!terminal) {
      throw new Error(
        "TERMINAL_NOT_FOUND: Terminal not found or does not belong to this store",
      );
    }

    // Check if terminal is already bound to another active API key
    const existingBinding = await prisma.apiKey.findFirst({
      where: {
        pos_terminal_id: posTerminalId,
        status: "ACTIVE",
        api_key_id: { not: apiKeyId },
      },
    });

    if (existingBinding) {
      throw new Error(
        "TERMINAL_ALREADY_BOUND: Terminal is already bound to another active API key",
      );
    }

    // Update API key with terminal binding
    await prisma.apiKey.update({
      where: { api_key_id: apiKeyId },
      data: { pos_terminal_id: posTerminalId },
    });

    // Log audit event
    await apiKeyAuditService.logEvent({
      apiKeyId,
      eventType: "ACTIVATED",
      actorUserId,
      actorType: "ADMIN",
      eventDetails: {
        operation: "TERMINAL_BOUND",
        posTerminalId,
        terminalName: terminal.name,
      },
    });
  }

  /**
   * Unbind terminal from API key
   *
   * @param apiKeyId - API key ID to unbind
   * @param actorUserId - User performing the action
   */
  async unbindTerminalFromApiKey(
    apiKeyId: string,
    actorUserId: string,
  ): Promise<void> {
    const apiKey = await prisma.apiKey.findUnique({
      where: { api_key_id: apiKeyId },
      select: { pos_terminal_id: true },
    });

    if (!apiKey?.pos_terminal_id) {
      return; // No terminal to unbind - idempotent
    }

    const previousTerminalId = apiKey.pos_terminal_id;

    await prisma.apiKey.update({
      where: { api_key_id: apiKeyId },
      data: { pos_terminal_id: null },
    });

    await apiKeyAuditService.logEvent({
      apiKeyId,
      eventType: "ACTIVATED",
      actorUserId,
      actorType: "ADMIN",
      eventDetails: {
        operation: "TERMINAL_UNBOUND",
        previousTerminalId,
      },
    });
  }

  /**
   * Get terminal by ID (for admin operations)
   *
   * @param posTerminalId - Terminal ID
   * @param storeId - Store ID for validation
   * @returns Terminal info or null
   */
  async getTerminalById(
    posTerminalId: string,
    storeId: string,
  ): Promise<TerminalSyncRecord | null> {
    const terminal = await prisma.pOSTerminal.findFirst({
      where: {
        pos_terminal_id: posTerminalId,
        store_id: storeId,
        deleted_at: null,
      },
    });

    if (!terminal) {
      return null;
    }

    return {
      pos_terminal_id: terminal.pos_terminal_id,
      name: terminal.name,
      device_id: terminal.device_id,
      connection_type: terminal.connection_type,
      connection_config: terminal.connection_config as Record<
        string,
        unknown
      > | null,
      pos_type: terminal.pos_type,
      terminal_status: terminal.terminal_status,
      last_sync_at: terminal.last_sync_at?.toISOString() || null,
      sync_status: terminal.sync_status,
      updated_at: terminal.updated_at.toISOString(),
    };
  }

  /**
   * Log terminal info request for audit
   */
  private async logTerminalInfoRequest(
    context: TerminalAuditContext,
    terminalId?: string,
  ): Promise<void> {
    await apiKeyAuditService.logCustomEvent(
      context.apiKeyId,
      "USED",
      "DEVICE",
      context.ipAddress,
      undefined,
      {
        operation: "TERMINAL_INFO_REQUEST",
        terminalId,
        deviceFingerprint: context.deviceFingerprint,
      },
    );
  }

  /**
   * Log POS config request for audit
   */
  private async logPOSConfigRequest(
    context: TerminalAuditContext,
    posType: string,
  ): Promise<void> {
    await apiKeyAuditService.logCustomEvent(
      context.apiKeyId,
      "USED",
      "DEVICE",
      context.ipAddress,
      undefined,
      {
        operation: "POS_CONFIG_REQUEST",
        posType,
        deviceFingerprint: context.deviceFingerprint,
      },
    );
  }
}

// Export singleton instance
export const terminalSyncService = new TerminalSyncService();
