import { prisma } from "../utils/db";
import { rbacService } from "./rbac.service";

/**
 * Audit context for logging changes
 */
export interface AuditContext {
  userId: string;
  userEmail: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Role with full details including permissions
 */
export interface RoleWithDetails {
  role_id: string;
  code: string;
  scope: string;
  description: string | null;
  is_system_role: boolean;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  deleted_by: string | null;
  permissions: Array<{
    permission_id: string;
    code: string;
    description: string | null;
  }>;
  user_count: number;
  company_count: number;
}

/**
 * Role creation input
 */
export interface CreateRoleInput {
  code: string;
  scope: "SYSTEM" | "COMPANY" | "STORE";
  description?: string;
  permissions?: string[]; // Permission IDs
}

/**
 * Role update input
 */
export interface UpdateRoleInput {
  code?: string;
  description?: string;
}

/**
 * Role permission update input
 */
export interface UpdateRolePermissionsInput {
  permissions: string[]; // Array of permission IDs to set
}

/**
 * Company role access input
 */
export interface CompanyRoleAccessInput {
  company_id: string;
  role_ids: string[]; // Role IDs to allow for this company
}

/**
 * Role Admin Service for Super Admin role management
 * Handles CRUD operations for roles, permission assignment, and company role access
 * Only Super Admins can use this service
 */
export class RoleAdminService {
  /**
   * Get all roles with details (including soft-deleted if requested)
   * @param includeDeleted - Whether to include soft-deleted roles
   * @returns Array of roles with permissions and usage counts
   */
  async getAllRoles(includeDeleted = false): Promise<RoleWithDetails[]> {
    const whereClause = includeDeleted ? {} : { deleted_at: null };

    const roles = await prisma.role.findMany({
      where: whereClause,
      include: {
        role_permissions: {
          include: {
            permission: true,
          },
        },
        creator: {
          select: {
            user_id: true,
            name: true,
            email: true,
          },
        },
        deleter: {
          select: {
            user_id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            user_roles: {
              where: { status: "ACTIVE" },
            },
            company_allowed_roles: true,
          },
        },
      },
      orderBy: [{ scope: "asc" }, { code: "asc" }],
    });

    return roles.map((role) => ({
      role_id: role.role_id,
      code: role.code,
      scope: role.scope,
      description: role.description,
      is_system_role: role.is_system_role,
      deleted_at: role.deleted_at,
      created_at: role.created_at,
      updated_at: role.updated_at,
      created_by: role.created_by,
      deleted_by: role.deleted_by,
      permissions: role.role_permissions.map((rp) => ({
        permission_id: rp.permission.permission_id,
        code: rp.permission.code,
        description: rp.permission.description,
      })),
      user_count: role._count.user_roles,
      company_count: role._count.company_allowed_roles,
    }));
  }

  /**
   * Get a single role by ID with full details
   * @param roleId - Role ID
   * @returns Role with details or null if not found
   */
  async getRoleById(roleId: string): Promise<RoleWithDetails | null> {
    const role = await prisma.role.findUnique({
      where: { role_id: roleId },
      include: {
        role_permissions: {
          include: {
            permission: true,
          },
        },
        creator: {
          select: {
            user_id: true,
            name: true,
            email: true,
          },
        },
        deleter: {
          select: {
            user_id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            user_roles: {
              where: { status: "ACTIVE" },
            },
            company_allowed_roles: true,
          },
        },
      },
    });

    if (!role) {
      return null;
    }

    return {
      role_id: role.role_id,
      code: role.code,
      scope: role.scope,
      description: role.description,
      is_system_role: role.is_system_role,
      deleted_at: role.deleted_at,
      created_at: role.created_at,
      updated_at: role.updated_at,
      created_by: role.created_by,
      deleted_by: role.deleted_by,
      permissions: role.role_permissions.map((rp) => ({
        permission_id: rp.permission.permission_id,
        code: rp.permission.code,
        description: rp.permission.description,
      })),
      user_count: role._count.user_roles,
      company_count: role._count.company_allowed_roles,
    };
  }

  /**
   * Create a new role
   * @param input - Role creation input
   * @param auditContext - Audit context for logging
   * @returns Created role
   */
  async createRole(
    input: CreateRoleInput,
    auditContext: AuditContext,
  ): Promise<RoleWithDetails> {
    // Validate code format (uppercase, underscores, alphanumeric)
    const codeRegex = /^[A-Z][A-Z0-9_]*$/;
    if (!codeRegex.test(input.code)) {
      throw new Error(
        "Role code must be uppercase, start with a letter, and contain only letters, numbers, and underscores",
      );
    }

    // Check if code already exists
    const existingRole = await prisma.role.findUnique({
      where: { code: input.code },
    });

    if (existingRole) {
      throw new Error(`Role with code '${input.code}' already exists`);
    }

    // Validate scope
    const validScopes = ["SYSTEM", "COMPANY", "STORE"];
    if (!validScopes.includes(input.scope)) {
      throw new Error(
        `Invalid scope. Must be one of: ${validScopes.join(", ")}`,
      );
    }

    // Validate permission IDs if provided
    if (input.permissions && input.permissions.length > 0) {
      const permissions = await prisma.permission.findMany({
        where: {
          permission_id: { in: input.permissions },
        },
      });

      if (permissions.length !== input.permissions.length) {
        throw new Error("One or more permission IDs are invalid");
      }
    }

    // Create role with permissions in a transaction
    const role = await prisma.$transaction(async (tx) => {
      const newRole = await tx.role.create({
        data: {
          code: input.code,
          scope: input.scope,
          description: input.description,
          is_system_role: false, // Custom roles are never system roles
          created_by: auditContext.userId,
        },
      });

      // Add permissions if provided
      if (input.permissions && input.permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: input.permissions.map((permissionId) => ({
            role_id: newRole.role_id,
            permission_id: permissionId,
          })),
        });
      }

      // Create audit log
      await tx.auditLog.create({
        data: {
          user_id: auditContext.userId,
          action: "CREATE",
          table_name: "roles",
          record_id: newRole.role_id,
          new_values: {
            code: input.code,
            scope: input.scope,
            description: input.description,
            permissions: input.permissions,
          },
          reason: `Created new role: ${input.code}`,
          ip_address: auditContext.ipAddress,
          user_agent: auditContext.userAgent,
        },
      });

      return newRole;
    });

    // Return full role details
    const fullRole = await this.getRoleById(role.role_id);
    if (!fullRole) {
      throw new Error("Failed to retrieve created role");
    }

    return fullRole;
  }

  /**
   * Update a role's basic info (code, description)
   * System roles can only have description updated
   * @param roleId - Role ID
   * @param input - Update input
   * @param auditContext - Audit context
   * @returns Updated role
   */
  async updateRole(
    roleId: string,
    input: UpdateRoleInput,
    auditContext: AuditContext,
  ): Promise<RoleWithDetails> {
    const existingRole = await prisma.role.findUnique({
      where: { role_id: roleId },
    });

    if (!existingRole) {
      throw new Error("Role not found");
    }

    if (existingRole.deleted_at) {
      throw new Error("Cannot update a deleted role. Restore it first.");
    }

    // System roles can only have description updated
    if (existingRole.is_system_role && input.code) {
      throw new Error("System role codes cannot be changed");
    }

    // Validate code format if provided
    if (input.code) {
      const codeRegex = /^[A-Z][A-Z0-9_]*$/;
      if (!codeRegex.test(input.code)) {
        throw new Error(
          "Role code must be uppercase, start with a letter, and contain only letters, numbers, and underscores",
        );
      }

      // Check for duplicate code
      const duplicateRole = await prisma.role.findFirst({
        where: {
          code: input.code,
          role_id: { not: roleId },
        },
      });

      if (duplicateRole) {
        throw new Error(`Role with code '${input.code}' already exists`);
      }
    }

    const role = await prisma.$transaction(async (tx) => {
      const updatedRole = await tx.role.update({
        where: { role_id: roleId },
        data: {
          ...(input.code &&
            !existingRole.is_system_role && { code: input.code }),
          ...(input.description !== undefined && {
            description: input.description,
          }),
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          user_id: auditContext.userId,
          action: "UPDATE",
          table_name: "roles",
          record_id: roleId,
          old_values: {
            code: existingRole.code,
            description: existingRole.description,
          },
          new_values: {
            code: updatedRole.code,
            description: updatedRole.description,
          },
          reason: `Updated role: ${updatedRole.code}`,
          ip_address: auditContext.ipAddress,
          user_agent: auditContext.userAgent,
        },
      });

      return updatedRole;
    });

    // Invalidate caches
    await rbacService.invalidateRolePermissionsCache(roleId);

    const fullRole = await this.getRoleById(role.role_id);
    if (!fullRole) {
      throw new Error("Failed to retrieve updated role");
    }

    return fullRole;
  }

  /**
   * Update a role's permissions (system defaults)
   * @param roleId - Role ID
   * @param input - Permission update input
   * @param auditContext - Audit context
   * @returns Updated role
   */
  async updateRolePermissions(
    roleId: string,
    input: UpdateRolePermissionsInput,
    auditContext: AuditContext,
  ): Promise<RoleWithDetails> {
    const existingRole = await prisma.role.findUnique({
      where: { role_id: roleId },
      include: {
        role_permissions: {
          include: { permission: true },
        },
      },
    });

    if (!existingRole) {
      throw new Error("Role not found");
    }

    if (existingRole.deleted_at) {
      throw new Error("Cannot update permissions of a deleted role");
    }

    // Validate all permission IDs
    if (input.permissions.length > 0) {
      const permissions = await prisma.permission.findMany({
        where: {
          permission_id: { in: input.permissions },
        },
      });

      if (permissions.length !== input.permissions.length) {
        throw new Error("One or more permission IDs are invalid");
      }
    }

    const oldPermissions = existingRole.role_permissions.map(
      (rp) => rp.permission.code,
    );

    await prisma.$transaction(async (tx) => {
      // Delete existing permissions
      await tx.rolePermission.deleteMany({
        where: { role_id: roleId },
      });

      // Add new permissions
      if (input.permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: input.permissions.map((permissionId) => ({
            role_id: roleId,
            permission_id: permissionId,
          })),
        });
      }

      // Get new permission codes for audit log
      const newPermissions = await tx.permission.findMany({
        where: { permission_id: { in: input.permissions } },
        select: { code: true },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          user_id: auditContext.userId,
          action: "UPDATE",
          table_name: "role_permissions",
          record_id: roleId,
          old_values: { permissions: oldPermissions },
          new_values: { permissions: newPermissions.map((p) => p.code) },
          reason: `Updated permissions for role: ${existingRole.code}`,
          ip_address: auditContext.ipAddress,
          user_agent: auditContext.userAgent,
        },
      });
    });

    // Invalidate caches
    await rbacService.invalidateRolePermissionsCache(roleId);
    await this.invalidateAllUserCachesForRole(roleId);

    const fullRole = await this.getRoleById(roleId);
    if (!fullRole) {
      throw new Error("Failed to retrieve updated role");
    }

    return fullRole;
  }

  /**
   * Soft delete a role
   * Cannot delete system roles or roles with active user assignments
   * @param roleId - Role ID
   * @param auditContext - Audit context
   */
  async softDeleteRole(
    roleId: string,
    auditContext: AuditContext,
  ): Promise<void> {
    const existingRole = await prisma.role.findUnique({
      where: { role_id: roleId },
      include: {
        _count: {
          select: {
            user_roles: {
              where: { status: "ACTIVE" },
            },
          },
        },
      },
    });

    if (!existingRole) {
      throw new Error("Role not found");
    }

    if (existingRole.is_system_role) {
      throw new Error(
        "System roles cannot be deleted. They are required for core system functionality.",
      );
    }

    if (existingRole.deleted_at) {
      throw new Error("Role is already deleted");
    }

    if (existingRole._count.user_roles > 0) {
      throw new Error(
        `Cannot delete role with active user assignments. ${existingRole._count.user_roles} user(s) currently have this role. Please reassign them first.`,
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { role_id: roleId },
        data: {
          deleted_at: new Date(),
          deleted_by: auditContext.userId,
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          user_id: auditContext.userId,
          action: "DELETE",
          table_name: "roles",
          record_id: roleId,
          old_values: {
            code: existingRole.code,
            scope: existingRole.scope,
            deleted_at: null,
          },
          new_values: {
            deleted_at: new Date().toISOString(),
            deleted_by: auditContext.userId,
          },
          reason: `Soft-deleted role: ${existingRole.code}`,
          ip_address: auditContext.ipAddress,
          user_agent: auditContext.userAgent,
        },
      });
    });

    // Invalidate caches
    await rbacService.invalidateRolePermissionsCache(roleId);
  }

  /**
   * Restore a soft-deleted role
   * @param roleId - Role ID
   * @param auditContext - Audit context
   * @returns Restored role
   */
  async restoreRole(
    roleId: string,
    auditContext: AuditContext,
  ): Promise<RoleWithDetails> {
    const existingRole = await prisma.role.findUnique({
      where: { role_id: roleId },
    });

    if (!existingRole) {
      throw new Error("Role not found");
    }

    if (!existingRole.deleted_at) {
      throw new Error("Role is not deleted");
    }

    await prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { role_id: roleId },
        data: {
          deleted_at: null,
          deleted_by: null,
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          user_id: auditContext.userId,
          action: "RESTORE",
          table_name: "roles",
          record_id: roleId,
          old_values: {
            deleted_at: existingRole.deleted_at?.toISOString(),
            deleted_by: existingRole.deleted_by,
          },
          new_values: {
            deleted_at: null,
            deleted_by: null,
          },
          reason: `Restored role: ${existingRole.code}`,
          ip_address: auditContext.ipAddress,
          user_agent: auditContext.userAgent,
        },
      });
    });

    const fullRole = await this.getRoleById(roleId);
    if (!fullRole) {
      throw new Error("Failed to retrieve restored role");
    }

    return fullRole;
  }

  /**
   * Permanently delete a soft-deleted role (purge)
   * Only for soft-deleted roles, cannot purge active roles
   * @param roleId - Role ID
   * @param auditContext - Audit context
   */
  async purgeRole(roleId: string, auditContext: AuditContext): Promise<void> {
    const existingRole = await prisma.role.findUnique({
      where: { role_id: roleId },
    });

    if (!existingRole) {
      throw new Error("Role not found");
    }

    if (!existingRole.deleted_at) {
      throw new Error(
        "Cannot permanently delete an active role. Soft-delete it first and wait for the retention period.",
      );
    }

    if (existingRole.is_system_role) {
      throw new Error("System roles cannot be permanently deleted");
    }

    await prisma.$transaction(async (tx) => {
      // Create audit log before deletion
      await tx.auditLog.create({
        data: {
          user_id: auditContext.userId,
          action: "PURGE",
          table_name: "roles",
          record_id: roleId,
          old_values: {
            code: existingRole.code,
            scope: existingRole.scope,
            deleted_at: existingRole.deleted_at?.toISOString(),
          },
          new_values: {},
          reason: `Permanently deleted role: ${existingRole.code}`,
          ip_address: auditContext.ipAddress,
          user_agent: auditContext.userAgent,
        },
      });

      // Delete the role (cascades to role_permissions, company_allowed_roles, client_role_permissions)
      await tx.role.delete({
        where: { role_id: roleId },
      });
    });
  }

  /**
   * Get all permissions available in the system
   * @returns Array of all permissions
   */
  async getAllPermissions(): Promise<
    Array<{
      permission_id: string;
      code: string;
      description: string | null;
    }>
  > {
    const permissions = await prisma.permission.findMany({
      orderBy: { code: "asc" },
    });

    return permissions.map((p) => ({
      permission_id: p.permission_id,
      code: p.code,
      description: p.description,
    }));
  }

  /**
   * Get soft-deleted roles (within retention period)
   * @returns Array of deleted roles
   */
  async getDeletedRoles(): Promise<RoleWithDetails[]> {
    const roles = await prisma.role.findMany({
      where: {
        deleted_at: { not: null },
      },
      include: {
        role_permissions: {
          include: {
            permission: true,
          },
        },
        creator: {
          select: {
            user_id: true,
            name: true,
            email: true,
          },
        },
        deleter: {
          select: {
            user_id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            user_roles: true,
            company_allowed_roles: true,
          },
        },
      },
      orderBy: { deleted_at: "desc" },
    });

    return roles.map((role) => ({
      role_id: role.role_id,
      code: role.code,
      scope: role.scope,
      description: role.description,
      is_system_role: role.is_system_role,
      deleted_at: role.deleted_at,
      created_at: role.created_at,
      updated_at: role.updated_at,
      created_by: role.created_by,
      deleted_by: role.deleted_by,
      permissions: role.role_permissions.map((rp) => ({
        permission_id: rp.permission.permission_id,
        code: rp.permission.code,
        description: rp.permission.description,
      })),
      user_count: role._count.user_roles,
      company_count: role._count.company_allowed_roles,
    }));
  }

  /**
   * Invalidate all user caches for users who have a specific role
   * Called when role permissions change
   * @param roleId - Role ID
   */
  private async invalidateAllUserCachesForRole(roleId: string): Promise<void> {
    const userRoles = await prisma.userRole.findMany({
      where: { role_id: roleId },
      select: { user_id: true },
    });

    for (const userRole of userRoles) {
      await rbacService.invalidateUserRolesCache(userRole.user_id);
    }
  }
}

// Export singleton instance
export const roleAdminService = new RoleAdminService();
