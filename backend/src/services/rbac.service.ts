import { getRedisClient } from "../utils/redis";
import type { PermissionCode } from "../constants/permissions";
import { prisma } from "../utils/db";

/**
 * User role with scope information
 */
export interface UserRole {
  user_role_id: string;
  user_id: string;
  role_id: string;
  role_code: string;
  scope: "SYSTEM" | "COMPANY" | "STORE";
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
      scope: ur.role.scope as "SYSTEM" | "COMPANY" | "STORE",
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
          // If store doesn't exist, allow request to proceed to route handler (which will return 404)
          // This ensures we return 404 for non-existent resources before 403 for unauthorized access
          if (!store) {
            await this.cachePermissionCheck(cacheKey, true);
            return true;
          }
          // If store exists, check if it belongs to user's company
          if (store.company_id === role.company_id) {
            await this.cachePermissionCheck(cacheKey, true);
            return true;
          }
        }
      }

      // STORE scope: applies only to specific store
      if (role.scope === "STORE") {
        if (!role.store_id) {
          continue; // STORE scope role must have store_id
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
}

// Export singleton instance
export const rbacService = new RBACService();
