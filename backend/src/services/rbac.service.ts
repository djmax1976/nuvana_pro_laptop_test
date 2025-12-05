import { getRedisClient } from "../utils/redis";
import type { PermissionCode } from "../constants/permissions";
import { prisma } from "../utils/db";
import { clientRolePermissionService } from "./client-role-permission.service";

// RBAC service MUST use RLS-aware Prisma client because:
// 1. RLS policies on user_roles table require app.current_user_id to be set
// 2. Without RLS context, queries return zero rows (all policy conditions fail)
// 3. This causes permission checks to fail incorrectly with 403 errors
// Note: Permission checks still work across tenants - RLS policies allow
// viewing roles where user_id matches current_user_id OR company/store matches

/**
 * User role with scope information
 */
export interface UserRole {
  user_role_id: string;
  user_id: string;
  role_id: string;
  role_code: string;
  scope: "SYSTEM" | "COMPANY" | "STORE" | "CLIENT";
  client_id: string | null;
  company_id: string | null;
  store_id: string | null;
  permissions: string[];
}

/**
 * Scope for permission checking
 */
export interface PermissionScope {
  companyId?: string;
  storeId?: string;
}

/**
 * RBAC Service for role and permission management
 * Handles permission checking with scope support and Redis caching
 */
export class RBACService {
  private readonly cacheTTL = 300; // 5 minutes cache TTL

  /**
   * Get all roles for a user with company_id and store_id
   * @param userId - User ID
   * @returns Array of user roles with scope information
   */
  async getUserRoles(userId: string): Promise<UserRole[]> {
    const cacheKey = `user_roles:${userId}`;

    // Try to get from cache first (if Redis is available)
    const redis = await getRedisClient();
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (error) {
        console.error(
          "Redis error in getUserRoles, falling back to DB:",
          error,
        );
      }
    }

    // Fetch from database
    const userRoles = await prisma.userRole.findMany({
      where: {
        user_id: userId,
      },
      include: {
        role: {
          include: {
            role_permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    // Transform to UserRole format
    const roles: UserRole[] = userRoles.map((ur: any) => ({
      user_role_id: ur.user_role_id,
      user_id: ur.user_id,
      role_id: ur.role_id,
      role_code: ur.role.code,
      scope: ur.role.scope as "SYSTEM" | "COMPANY" | "STORE" | "CLIENT",
      client_id: ur.client_id,
      company_id: ur.company_id,
      store_id: ur.store_id,
      permissions: ur.role.role_permissions.map(
        (rp: any) => rp.permission.code,
      ),
    }));

    // Cache the result (if Redis is available)
    if (redis) {
      try {
        await redis.setEx(cacheKey, this.cacheTTL, JSON.stringify(roles));
      } catch (error) {
        console.error("Failed to cache user roles:", error);
      }
    }

    return roles;
  }

  /**
   * Get all permissions for a role
   * @param roleId - Role ID
   * @returns Array of permission codes
   */
  async getRolePermissions(roleId: string): Promise<string[]> {
    const cacheKey = `role_permissions:${roleId}`;

    // Try to get from cache first (if Redis is available)
    const redis = await getRedisClient();
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (error) {
        console.error(
          "Redis error in getRolePermissions, falling back to DB:",
          error,
        );
      }
    }

    // Fetch from database
    const rolePermissions = await prisma.rolePermission.findMany({
      where: {
        role_id: roleId,
      },
      include: {
        permission: true,
      },
    });

    const permissions = rolePermissions.map((rp: any) => rp.permission.code);

    // Cache the result (if Redis is available)
    if (redis) {
      try {
        await redis.setEx(cacheKey, this.cacheTTL, JSON.stringify(permissions));
      } catch (error) {
        console.error("Failed to cache role permissions:", error);
      }
    }

    return permissions;
  }

  /**
   * Check if user has required permission with scope support
   * Handles scope hierarchy: SYSTEM roles apply everywhere, COMPANY roles apply to company and stores,
   * STORE roles apply only to specific store
   * @param userId - User ID
   * @param permission - Permission code to check
   * @param scope - Optional scope (companyId, storeId) for COMPANY/STORE scoped permissions
   * @returns true if user has permission, false otherwise
   */
  async checkPermission(
    userId: string,
    permission: PermissionCode,
    scope?: PermissionScope,
  ): Promise<boolean> {
    const cacheKey = `permission_check:${userId}:${permission}:${scope?.companyId || ""}:${scope?.storeId || ""}`;

    // Try to get from cache first (if Redis is available)
    const redis = await getRedisClient();
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached !== null) {
          return cached === "true";
        }
      } catch (error) {
        console.error("Redis error in checkPermission, using DB:", error);
      }
    }

    // Get user roles
    const userRoles = await this.getUserRoles(userId);

    // Check each role for the permission
    for (const role of userRoles) {
      // Check if role has the permission
      if (!role.permissions.includes(permission)) {
        continue;
      }

      // Check scope hierarchy
      // SYSTEM scope: applies everywhere
      if (role.scope === "SYSTEM") {
        await this.cachePermissionCheck(cacheKey, true);
        return true;
      }

      // COMPANY scope: applies to company and all stores within company
      if (role.scope === "COMPANY") {
        if (!role.company_id) {
          continue; // COMPANY scope role must have company_id
        }

        // If no scope provided, grant permission - the service layer handles data filtering
        // This allows COMPANY-scoped users to access endpoints that don't specify a company/store
        if (!scope?.companyId && !scope?.storeId) {
          await this.cachePermissionCheck(cacheKey, true);
          return true;
        }

        // Company role applies if companyId matches (applies to company and all its stores)
        if (scope?.companyId && role.company_id === scope.companyId) {
          await this.cachePermissionCheck(cacheKey, true);
          return true;
        }
        // If only storeId provided, verify store belongs to company (requires DB query)
        if (scope?.storeId && !scope.companyId) {
          const store = await prisma.store.findUnique({
            where: { store_id: scope.storeId },
            select: { company_id: true },
          });
          // If store exists AND belongs to user's company, grant permission
          if (store && store.company_id === role.company_id) {
            await this.cachePermissionCheck(cacheKey, true);
            return true;
          }
        }
      }

      // STORE scope: applies only to specific store
      // For STORE scope roles, we need to check client permission overrides
      if (role.scope === "STORE") {
        if (!role.store_id) {
          continue; // STORE scope role must have store_id
        }

        // Check if the permission is in the role's default permissions
        const hasSystemDefault = role.permissions.includes(permission);

        // Get the client owner for this user to check for permission overrides
        // Client overrides can grant OR revoke permissions
        const ownerUserId =
          await clientRolePermissionService.getUserOwner(userId);

        // Determine effective permission: client override > system default
        let effectivePermission = hasSystemDefault;

        if (ownerUserId) {
          // Check for client override
          const clientOverride =
            await clientRolePermissionService.getClientPermissionOverride(
              role.role_id,
              permission,
              ownerUserId,
            );

          // If client override exists, use it; otherwise use system default
          if (clientOverride !== null) {
            effectivePermission = clientOverride;
          }
        }

        // Skip this role if user doesn't have the permission
        if (!effectivePermission) {
          continue;
        }

        // Store role applies if storeId matches
        if (scope?.storeId && role.store_id === scope.storeId) {
          // Also verify company matches if companyId provided in scope
          if (scope.companyId) {
            if (role.company_id === scope.companyId) {
              await this.cachePermissionCheck(cacheKey, true);
              return true;
            }
          } else {
            await this.cachePermissionCheck(cacheKey, true);
            return true;
          }
        }

        // If no scope provided (general endpoint), grant permission for STORE scope users
        // This allows store employees to access endpoints that don't require specific store context
        if (!scope?.storeId && !scope?.companyId) {
          await this.cachePermissionCheck(cacheKey, true);
          return true;
        }
      }
    }

    // Permission denied
    await this.cachePermissionCheck(cacheKey, false);
    return false;
  }

  /**
   * Cache permission check result
   * @param cacheKey - Cache key
   * @param hasPermission - Permission check result
   */
  private async cachePermissionCheck(
    cacheKey: string,
    hasPermission: boolean,
  ): Promise<void> {
    const redis = await getRedisClient();
    if (redis) {
      try {
        await redis.setEx(
          cacheKey,
          this.cacheTTL,
          hasPermission ? "true" : "false",
        );
      } catch (error) {
        // Ignore cache errors, permission check already completed
        console.error("Failed to cache permission check:", error);
      }
    }
  }

  /**
   * Invalidate user roles cache (call when roles/permissions change)
   * @param userId - User ID
   */
  async invalidateUserRolesCache(userId: string): Promise<void> {
    const redis = await getRedisClient();
    if (redis) {
      try {
        await redis.del(`user_roles:${userId}`);
        // Also invalidate all permission checks for this user
        const keys = await redis.keys(`permission_check:${userId}:*`);
        if (keys.length > 0) {
          await redis.del(keys);
        }
      } catch (error) {
        console.error("Failed to invalidate user roles cache:", error);
      }
    }
  }

  /**
   * Invalidate role permissions cache (call when role-permission mappings change)
   * @param roleId - Role ID
   */
  async invalidateRolePermissionsCache(roleId: string): Promise<void> {
    const redis = await getRedisClient();
    if (redis) {
      try {
        await redis.del(`role_permissions:${roleId}`);
      } catch (error) {
        console.error("Failed to invalidate role permissions cache:", error);
      }
    }
  }

  /**
   * Check if a role has a specific permission
   *
   * This is used for cashier session authorization where we need to check
   * if the CASHIER role has a permission, independent of any user.
   *
   * @param roleCode - Role code (e.g., 'CASHIER', 'STORE_MANAGER')
   * @param permission - Permission code to check
   * @param scope - Optional scope for client permission overrides
   * @returns true if role has permission, false otherwise
   */
  async checkRoleHasPermission(
    roleCode: string,
    permission: PermissionCode,
    scope?: { storeId?: string },
  ): Promise<boolean> {
    const cacheKey = `role_has_permission:${roleCode}:${permission}:${scope?.storeId || ""}`;

    // Try to get from cache first (if Redis is available)
    const redis = await getRedisClient();
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached !== null) {
          return cached === "true";
        }
      } catch (error) {
        console.error(
          "Redis error in checkRoleHasPermission, using DB:",
          error,
        );
      }
    }

    // Find the role by code
    const role = await prisma.role.findUnique({
      where: { code: roleCode },
      include: {
        role_permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (!role) {
      await this.cachePermissionCheck(cacheKey, false);
      return false;
    }

    // Check if the role has the permission in its default permissions
    const hasSystemDefault = role.role_permissions.some(
      (rp: any) => rp.permission.code === permission,
    );

    // For STORE scope roles, we might need to check client overrides
    // But for the CASHIER role check, we use the system default since
    // cashier sessions are not tied to a specific client owner
    const effectivePermission = hasSystemDefault;

    await this.cachePermissionCheck(cacheKey, effectivePermission);
    return effectivePermission;
  }
}

// Export singleton instance
export const rbacService = new RBACService();
