import { Prisma } from "@prisma/client";
import { prisma } from "../utils/db";
import { getRedisClient } from "../utils/redis";
import {
  CLIENT_ASSIGNABLE_PERMISSIONS,
  PERMISSION_CATEGORIES,
  PERMISSION_DESCRIPTIONS,
  isClientAssignablePermission,
  type PermissionCode,
} from "../constants/permissions";

/**
 * Audit context for logging operations
 */
export interface AuditContext {
  userId: string;
  userEmail: string;
  userRoles: string[];
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Permission with category and state information
 */
export interface PermissionWithState {
  permission_id: string;
  code: string;
  description: string;
  category: string;
  category_name: string;
  is_enabled: boolean;
  is_system_default: boolean;
  is_client_override: boolean;
}

/**
 * Role with permissions grouped by category
 */
export interface RoleWithPermissions {
  role_id: string;
  code: string;
  description: string | null;
  scope: string;
  permissions: PermissionWithState[];
  permission_badges: string[];
}

/**
 * Permission update input
 */
export interface PermissionUpdateInput {
  permission_id: string;
  is_enabled: boolean;
}

/**
 * Client Role Permission Service
 *
 * Handles client-level customization of STORE scope role permissions.
 * Clients can toggle permissions on/off for roles within their organization.
 *
 * SECURITY:
 * - All operations are scoped to owner_user_id for tenant isolation
 * - Only CLIENT_ASSIGNABLE_PERMISSIONS can be modified
 * - Client overrides take precedence over system defaults
 * - All changes are logged to AuditLog for compliance
 */
export class ClientRolePermissionService {
  private readonly cacheTTL = 300; // 5 minutes cache TTL

  /**
   * Get STORE scope roles that are allowed for the client's company.
   * Merges system defaults with client overrides.
   *
   * SECURITY: Only returns roles that Super Admin has explicitly
   * allowed for the user's company via CompanyAllowedRole table.
   *
   * @param ownerUserId - Client owner's user_id for tenant isolation
   * @returns Array of allowed STORE scope roles with permission badges
   */
  async getClientRoles(ownerUserId: string): Promise<RoleWithPermissions[]> {
    // First, find the company owned by this user
    const company = await prisma.company.findFirst({
      where: { owner_user_id: ownerUserId },
      select: { company_id: true },
    });

    if (!company) {
      // No company found for this owner - return empty array
      return [];
    }

    // Get STORE scope roles that are allowed for this company via CompanyAllowedRole
    const storeRoles = await prisma.role.findMany({
      where: {
        scope: "STORE",
        deleted_at: null, // Only active roles
        company_allowed_roles: {
          some: {
            company_id: company.company_id,
          },
        },
      },
      include: {
        role_permissions: {
          include: {
            permission: true,
          },
        },
      },
      orderBy: { code: "asc" },
    });

    // Get all assignable permissions from database (needed to find permission_id for non-default permissions)
    const allAssignablePermissions = await prisma.permission.findMany({
      where: {
        code: { in: CLIENT_ASSIGNABLE_PERMISSIONS as string[] },
      },
    });

    // Create a map of permission code -> permission for quick lookup
    const permissionByCode = new Map(
      allAssignablePermissions.map((p) => [p.code, p]),
    );

    // Get all client overrides for this owner
    const clientOverrides = await prisma.clientRolePermission.findMany({
      where: { owner_user_id: ownerUserId },
      include: {
        permission: true,
      },
    });

    // Create a map for quick lookup of client overrides
    const overrideMap = new Map<string, boolean>();
    for (const override of clientOverrides) {
      const key = `${override.role_id}:${override.permission_id}`;
      overrideMap.set(key, override.is_enabled);
    }

    // Transform roles with merged permissions
    const rolesWithPermissions: RoleWithPermissions[] = storeRoles.map(
      (role) => {
        // Get system default permissions for this role
        const systemPermissions = new Set(
          role.role_permissions.map((rp) => rp.permission.code),
        );

        // Build permission states for assignable permissions
        const permissions: PermissionWithState[] = [];
        const enabledPermissionCodes: string[] = [];

        for (const permCode of CLIENT_ASSIGNABLE_PERMISSIONS) {
          // Get permission from our map (this ensures we always have permission_id)
          const perm = permissionByCode.get(permCode);
          if (!perm) {
            continue; // Skip if permission doesn't exist in database
          }

          const permissionId = perm.permission_id;

          // Determine if enabled (client override > system default)
          const overrideKey = `${role.role_id}:${permissionId}`;
          const hasClientOverride = overrideMap.has(overrideKey);
          const clientOverrideValue = hasClientOverride
            ? overrideMap.get(overrideKey)
            : null;
          const systemDefault = systemPermissions.has(permCode);

          // Final enabled state: client override if exists, otherwise system default
          const isEnabled =
            clientOverrideValue !== null ? clientOverrideValue : systemDefault;

          // Get category for this permission
          let category = "OTHER";
          let categoryName = "Other";
          for (const [catKey, catDef] of Object.entries(
            PERMISSION_CATEGORIES,
          )) {
            if ((catDef.permissions as readonly string[]).includes(permCode)) {
              category = catKey;
              categoryName = catDef.name;
              break;
            }
          }

          if (isEnabled) {
            enabledPermissionCodes.push(permCode);
          }

          permissions.push({
            permission_id: permissionId,
            code: permCode,
            description:
              PERMISSION_DESCRIPTIONS[permCode as PermissionCode] || permCode,
            category,
            category_name: categoryName,
            is_enabled: isEnabled ?? false,
            is_system_default: systemDefault,
            is_client_override: hasClientOverride,
          });
        }

        return {
          role_id: role.role_id,
          code: role.code,
          description: role.description,
          scope: role.scope,
          permissions,
          permission_badges: enabledPermissionCodes,
        };
      },
    );

    return rolesWithPermissions;
  }

  /**
   * Get permission configuration for a specific role
   * Returns all assignable permissions grouped by category with their current state
   *
   * SECURITY: Validates that the role is allowed for the client's company
   * via CompanyAllowedRole before returning permissions.
   *
   * @param roleId - Role UUID
   * @param ownerUserId - Client owner's user_id for tenant isolation
   * @returns Role with permissions grouped by category
   * @throws Error if role not found, not STORE scope, or not allowed for company
   */
  async getRolePermissions(
    roleId: string,
    ownerUserId: string,
  ): Promise<RoleWithPermissions> {
    // First, find the company owned by this user
    const company = await prisma.company.findFirst({
      where: { owner_user_id: ownerUserId },
      select: { company_id: true },
    });

    if (!company) {
      throw new Error("Company not found for this user");
    }

    // Verify role exists, is STORE scope, is not deleted, and is allowed for this company
    const role = await prisma.role.findFirst({
      where: {
        role_id: roleId,
        deleted_at: null,
        company_allowed_roles: {
          some: {
            company_id: company.company_id,
          },
        },
      },
      include: {
        role_permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (!role) {
      throw new Error("Role not found or not available for your company");
    }

    if (role.scope !== "STORE") {
      throw new Error(
        "Only STORE scope roles can be customized. SYSTEM and COMPANY scope roles are managed by administrators.",
      );
    }

    // Get client overrides for this role
    const clientOverrides = await prisma.clientRolePermission.findMany({
      where: {
        owner_user_id: ownerUserId,
        role_id: roleId,
      },
      include: {
        permission: true,
      },
    });

    // Create override map
    const overrideMap = new Map<string, boolean>();
    for (const override of clientOverrides) {
      overrideMap.set(override.permission_id, override.is_enabled);
    }

    // Get all assignable permissions from database
    const allPermissions = await prisma.permission.findMany({
      where: {
        code: { in: CLIENT_ASSIGNABLE_PERMISSIONS as string[] },
      },
    });

    // System default permissions for this role
    const systemDefaults = new Set(
      role.role_permissions.map((rp) => rp.permission_id),
    );

    // Build permission states
    const permissions: PermissionWithState[] = [];
    const enabledPermissionCodes: string[] = [];

    for (const perm of allPermissions) {
      const hasClientOverride = overrideMap.has(perm.permission_id);
      const clientOverrideValue = hasClientOverride
        ? overrideMap.get(perm.permission_id)
        : null;
      const systemDefault = systemDefaults.has(perm.permission_id);
      const isEnabled =
        clientOverrideValue !== null ? clientOverrideValue : systemDefault;

      // Get category
      let category = "OTHER";
      let categoryName = "Other";
      for (const [catKey, catDef] of Object.entries(PERMISSION_CATEGORIES)) {
        if ((catDef.permissions as readonly string[]).includes(perm.code)) {
          category = catKey;
          categoryName = catDef.name;
          break;
        }
      }

      if (isEnabled) {
        enabledPermissionCodes.push(perm.code);
      }

      permissions.push({
        permission_id: perm.permission_id,
        code: perm.code,
        description:
          PERMISSION_DESCRIPTIONS[perm.code as PermissionCode] || perm.code,
        category,
        category_name: categoryName,
        is_enabled: isEnabled ?? false,
        is_system_default: systemDefault,
        is_client_override: hasClientOverride,
      });
    }

    // Sort permissions by category then by code
    permissions.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.code.localeCompare(b.code);
    });

    return {
      role_id: role.role_id,
      code: role.code,
      description: role.description,
      scope: role.scope,
      permissions,
      permission_badges: enabledPermissionCodes,
    };
  }

  /**
   * Update role permissions for a client
   * Creates or updates ClientRolePermission records
   *
   * SECURITY: Validates that the role is allowed for the client's company
   * via CompanyAllowedRole before allowing updates.
   *
   * @param roleId - Role UUID
   * @param ownerUserId - Client owner's user_id for tenant isolation
   * @param updates - Array of permission updates
   * @param auditContext - Audit context for logging
   * @returns Updated role with permissions
   * @throws Error if validation fails or role not allowed for company
   */
  async updateRolePermissions(
    roleId: string,
    ownerUserId: string,
    updates: PermissionUpdateInput[],
    auditContext: AuditContext,
  ): Promise<RoleWithPermissions> {
    // First, find the company owned by this user
    const company = await prisma.company.findFirst({
      where: { owner_user_id: ownerUserId },
      select: { company_id: true },
    });

    if (!company) {
      throw new Error("Company not found for this user");
    }

    // Verify role exists, is STORE scope, is not deleted, and is allowed for this company
    const role = await prisma.role.findFirst({
      where: {
        role_id: roleId,
        deleted_at: null,
        company_allowed_roles: {
          some: {
            company_id: company.company_id,
          },
        },
      },
    });

    if (!role) {
      throw new Error("Role not found or not available for your company");
    }

    if (role.scope !== "STORE") {
      throw new Error(
        "Only STORE scope roles can be customized. SYSTEM and COMPANY scope roles are managed by administrators.",
      );
    }

    // Validate all permissions are assignable
    const permissionIds = updates.map((u) => u.permission_id);
    const permissions = await prisma.permission.findMany({
      where: { permission_id: { in: permissionIds } },
    });

    const permissionMap = new Map(
      permissions.map((p) => [p.permission_id, p.code]),
    );

    for (const update of updates) {
      const permCode = permissionMap.get(update.permission_id);
      if (!permCode) {
        throw new Error(`Permission not found: ${update.permission_id}`);
      }
      if (!isClientAssignablePermission(permCode)) {
        throw new Error(
          `Permission ${permCode} is restricted and cannot be assigned by clients. ` +
            "Only operational permissions (shifts, transactions, inventory, etc.) can be customized.",
        );
      }
    }

    // Get current state for audit log
    const currentOverrides = await prisma.clientRolePermission.findMany({
      where: {
        owner_user_id: ownerUserId,
        role_id: roleId,
        permission_id: { in: permissionIds },
      },
    });
    const currentStateMap = new Map(
      currentOverrides.map((o) => [o.permission_id, o.is_enabled]),
    );

    // Process updates in transaction
    await prisma.$transaction(async (tx) => {
      for (const update of updates) {
        await tx.clientRolePermission.upsert({
          where: {
            owner_user_id_role_id_permission_id: {
              owner_user_id: ownerUserId,
              role_id: roleId,
              permission_id: update.permission_id,
            },
          },
          update: {
            is_enabled: update.is_enabled,
          },
          create: {
            owner_user_id: ownerUserId,
            role_id: roleId,
            permission_id: update.permission_id,
            is_enabled: update.is_enabled,
          },
        });
      }
    });

    // Invalidate cache for all users in this client's stores
    await this.invalidateClientPermissionCache(ownerUserId);

    // Create audit log
    try {
      const changes = updates.map((u) => ({
        permission_id: u.permission_id,
        permission_code: permissionMap.get(u.permission_id),
        old_value: currentStateMap.get(u.permission_id) ?? null,
        new_value: u.is_enabled,
      }));

      await prisma.auditLog.create({
        data: {
          user_id: ownerUserId,
          action: "UPDATE",
          table_name: "client_role_permissions",
          record_id: roleId,
          old_values: {
            permissions: changes.map((c) => ({ ...c, value: c.old_value })),
          } as Prisma.InputJsonValue,
          new_values: {
            permissions: changes.map((c) => ({ ...c, value: c.new_value })),
          } as Prisma.InputJsonValue,
          ip_address: auditContext.ipAddress,
          user_agent: auditContext.userAgent,
          reason: `Role ${role.code} permissions updated by client ${auditContext.userEmail}`,
        },
      });
    } catch (auditError) {
      console.error(
        "Failed to create audit log for permission update:",
        auditError,
      );
    }

    // Return updated role
    return this.getRolePermissions(roleId, ownerUserId);
  }

  /**
   * Reset role to system default permissions
   * Removes all client overrides for the specified role
   *
   * SECURITY: Validates that the role is allowed for the client's company
   * via CompanyAllowedRole before allowing reset.
   *
   * @param roleId - Role UUID
   * @param ownerUserId - Client owner's user_id for tenant isolation
   * @param auditContext - Audit context for logging
   * @returns Updated role with default permissions
   * @throws Error if role not found, not STORE scope, or not allowed for company
   */
  async resetRoleToDefaults(
    roleId: string,
    ownerUserId: string,
    auditContext: AuditContext,
  ): Promise<RoleWithPermissions> {
    // First, find the company owned by this user
    const company = await prisma.company.findFirst({
      where: { owner_user_id: ownerUserId },
      select: { company_id: true },
    });

    if (!company) {
      throw new Error("Company not found for this user");
    }

    // Verify role exists, is STORE scope, is not deleted, and is allowed for this company
    const role = await prisma.role.findFirst({
      where: {
        role_id: roleId,
        deleted_at: null,
        company_allowed_roles: {
          some: {
            company_id: company.company_id,
          },
        },
      },
    });

    if (!role) {
      throw new Error("Role not found or not available for your company");
    }

    if (role.scope !== "STORE") {
      throw new Error(
        "Only STORE scope roles can be reset. SYSTEM and COMPANY scope roles are managed by administrators.",
      );
    }

    // Get current overrides for audit log
    const currentOverrides = await prisma.clientRolePermission.findMany({
      where: {
        owner_user_id: ownerUserId,
        role_id: roleId,
      },
      include: {
        permission: true,
      },
    });

    if (currentOverrides.length === 0) {
      // No overrides to reset
      return this.getRolePermissions(roleId, ownerUserId);
    }

    // Delete all overrides for this role
    await prisma.clientRolePermission.deleteMany({
      where: {
        owner_user_id: ownerUserId,
        role_id: roleId,
      },
    });

    // Invalidate cache
    await this.invalidateClientPermissionCache(ownerUserId);

    // Create audit log
    try {
      const deletedOverrides = currentOverrides.map((o) => ({
        permission_code: o.permission.code,
        was_enabled: o.is_enabled,
      }));

      await prisma.auditLog.create({
        data: {
          user_id: ownerUserId,
          action: "DELETE",
          table_name: "client_role_permissions",
          record_id: roleId,
          old_values: { overrides: deletedOverrides } as Prisma.InputJsonValue,
          ip_address: auditContext.ipAddress,
          user_agent: auditContext.userAgent,
          reason: `Role ${role.code} reset to defaults by client ${auditContext.userEmail}. ${currentOverrides.length} overrides removed.`,
        },
      });
    } catch (auditError) {
      console.error(
        "Failed to create audit log for permission reset:",
        auditError,
      );
    }

    // Return role with default permissions
    return this.getRolePermissions(roleId, ownerUserId);
  }

  /**
   * Check if a user has a specific permission considering client overrides
   * This is used by the RBAC service to resolve effective permissions
   *
   * @param userId - User ID to check
   * @param roleId - Role ID the user has
   * @param permissionCode - Permission code to check
   * @param ownerUserId - Client owner's user_id (owner of the user's company)
   * @returns true if permission is granted (override or default), false if revoked, null if no override
   */
  async getClientPermissionOverride(
    roleId: string,
    permissionCode: string,
    ownerUserId: string,
  ): Promise<boolean | null> {
    const cacheKey = `client_perm_override:${ownerUserId}:${roleId}:${permissionCode}`;

    // Try cache first
    const redis = await getRedisClient();
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached !== null) {
          if (cached === "null") return null;
          return cached === "true";
        }
      } catch (error) {
        console.error("Redis error in getClientPermissionOverride:", error);
      }
    }

    // Look up permission_id
    const permission = await prisma.permission.findUnique({
      where: { code: permissionCode },
    });

    if (!permission) {
      return null;
    }

    // Check for override
    const override = await prisma.clientRolePermission.findUnique({
      where: {
        owner_user_id_role_id_permission_id: {
          owner_user_id: ownerUserId,
          role_id: roleId,
          permission_id: permission.permission_id,
        },
      },
    });

    const result = override ? override.is_enabled : null;

    // Cache the result
    if (redis) {
      try {
        await redis.setEx(
          cacheKey,
          this.cacheTTL,
          result === null ? "null" : result ? "true" : "false",
        );
      } catch (error) {
        console.error("Failed to cache permission override:", error);
      }
    }

    return result;
  }

  /**
   * Get the owner_user_id for a user (finds their company owner)
   * Used to determine which client's overrides apply
   *
   * @param userId - User ID to look up
   * @returns Owner user_id or null if not found
   */
  async getUserOwner(userId: string): Promise<string | null> {
    const cacheKey = `user_owner:${userId}`;

    // Try cache first
    const redis = await getRedisClient();
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached !== null) {
          return cached === "null" ? null : cached;
        }
      } catch (error) {
        console.error("Redis error in getUserOwner:", error);
      }
    }

    // Find user's company and get owner
    const userRole = await prisma.userRole.findFirst({
      where: { user_id: userId },
      include: {
        company: true,
      },
    });

    const ownerUserId = userRole?.company?.owner_user_id || null;

    // Cache the result
    if (redis) {
      try {
        await redis.setEx(cacheKey, this.cacheTTL, ownerUserId || "null");
      } catch (error) {
        console.error("Failed to cache user owner:", error);
      }
    }

    return ownerUserId;
  }

  /**
   * Invalidate permission cache for all users in a client's organization
   *
   * @param ownerUserId - Client owner's user_id
   */
  async invalidateClientPermissionCache(ownerUserId: string): Promise<void> {
    const redis = await getRedisClient();
    if (!redis) return;

    try {
      // Delete all client permission overrides for this owner using SCAN (non-blocking)
      const overrideKeys: string[] = [];
      let cursor = 0;
      const pattern = `client_perm_override:${ownerUserId}:*`;

      do {
        const result: { cursor: number; keys: string[] } = await redis.scan(
          cursor,
          {
            MATCH: pattern,
            COUNT: 100,
          },
        );
        cursor = result.cursor;
        overrideKeys.push(...result.keys);
      } while (cursor !== 0);

      if (overrideKeys.length > 0) {
        await redis.del(overrideKeys);
      }

      // Get all users in this client's companies
      const companies = await prisma.company.findMany({
        where: { owner_user_id: ownerUserId },
        select: { company_id: true },
      });

      const companyIds = companies.map((c) => c.company_id);

      const userRoles = await prisma.userRole.findMany({
        where: { company_id: { in: companyIds } },
        select: { user_id: true },
        distinct: ["user_id"],
      });

      // Invalidate user_roles and permission_check caches
      for (const ur of userRoles) {
        const userRolesKey = `user_roles:${ur.user_id}`;
        await redis.del(userRolesKey);

        // Delete permission_check keys using SCAN (non-blocking)
        const permCheckKeys: string[] = [];
        let permCursor = 0;
        const permPattern = `permission_check:${ur.user_id}:*`;

        do {
          const scanResult: { cursor: number; keys: string[] } =
            await redis.scan(permCursor, {
              MATCH: permPattern,
              COUNT: 100,
            });
          permCursor = scanResult.cursor;
          permCheckKeys.push(...scanResult.keys);
        } while (permCursor !== 0);

        if (permCheckKeys.length > 0) {
          await redis.del(permCheckKeys);
        }
      }
    } catch (error) {
      console.error("Failed to invalidate client permission cache:", error);
    }
  }
}

// Export singleton instance
export const clientRolePermissionService = new ClientRolePermissionService();
