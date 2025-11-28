import { prisma } from "../utils/db";
import { getRedisClient } from "../utils/redis";

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
 * Company with allowed roles
 */
export interface CompanyWithAllowedRoles {
  company_id: string;
  name: string;
  public_id: string;
  status: string;
  owner: {
    user_id: string;
    name: string;
    email: string;
  };
  allowed_roles: Array<{
    company_allowed_role_id: string;
    role_id: string;
    role_code: string;
    role_scope: string;
    role_description: string | null;
    assigned_at: Date;
    assigned_by: {
      user_id: string;
      name: string;
      email: string;
    };
  }>;
}

/**
 * Role with company access info
 */
export interface RoleWithCompanyAccess {
  role_id: string;
  code: string;
  scope: string;
  description: string | null;
  is_system_role: boolean;
  companies: Array<{
    company_id: string;
    company_name: string;
    company_public_id: string;
    assigned_at: Date;
  }>;
}

/**
 * Company Role Access Service
 * Manages which roles are available to each company
 * Super Admin controls role access - Client Owners can only see/customize allowed roles
 */
export class CompanyRoleAccessService {
  private readonly cacheTTL = 300; // 5 minutes cache TTL

  /**
   * Get all roles allowed for a specific company
   * @param companyId - Company ID
   * @returns Array of allowed role IDs
   */
  async getCompanyAllowedRoleIds(companyId: string): Promise<string[]> {
    const cacheKey = `company_allowed_roles:${companyId}`;

    // Try cache first
    const redis = await getRedisClient();
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (error) {
        console.error("Redis error in getCompanyAllowedRoleIds:", error);
      }
    }

    const allowedRoles = await prisma.companyAllowedRole.findMany({
      where: { company_id: companyId },
      select: { role_id: true },
    });

    const roleIds = allowedRoles.map((ar) => ar.role_id);

    // Cache result
    if (redis) {
      try {
        await redis.setEx(cacheKey, this.cacheTTL, JSON.stringify(roleIds));
      } catch (error) {
        console.error("Failed to cache company allowed roles:", error);
      }
    }

    return roleIds;
  }

  /**
   * Get company with all allowed roles details
   * @param companyId - Company ID
   * @returns Company with allowed roles or null
   */
  async getCompanyWithAllowedRoles(
    companyId: string,
  ): Promise<CompanyWithAllowedRoles | null> {
    const company = await prisma.company.findUnique({
      where: { company_id: companyId },
      include: {
        owner: {
          select: {
            user_id: true,
            name: true,
            email: true,
          },
        },
        allowed_roles: {
          include: {
            role: true,
            assigner: {
              select: {
                user_id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: {
            role: {
              code: "asc",
            },
          },
        },
      },
    });

    if (!company) {
      return null;
    }

    return {
      company_id: company.company_id,
      name: company.name,
      public_id: company.public_id,
      status: company.status,
      owner: company.owner,
      allowed_roles: company.allowed_roles.map((ar) => ({
        company_allowed_role_id: ar.company_allowed_role_id,
        role_id: ar.role_id,
        role_code: ar.role.code,
        role_scope: ar.role.scope,
        role_description: ar.role.description,
        assigned_at: ar.assigned_at,
        assigned_by: ar.assigner,
      })),
    };
  }

  /**
   * Get all companies with their allowed roles
   * For Super Admin view
   * @returns Array of companies with allowed roles
   */
  async getAllCompaniesWithAllowedRoles(): Promise<CompanyWithAllowedRoles[]> {
    const companies = await prisma.company.findMany({
      where: { status: "ACTIVE" },
      include: {
        owner: {
          select: {
            user_id: true,
            name: true,
            email: true,
          },
        },
        allowed_roles: {
          where: {
            role: { deleted_at: null }, // Only include non-deleted roles
          },
          include: {
            role: true,
            assigner: {
              select: {
                user_id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return companies.map((company) => ({
      company_id: company.company_id,
      name: company.name,
      public_id: company.public_id,
      status: company.status,
      owner: company.owner,
      allowed_roles: company.allowed_roles.map((ar) => ({
        company_allowed_role_id: ar.company_allowed_role_id,
        role_id: ar.role_id,
        role_code: ar.role.code,
        role_scope: ar.role.scope,
        role_description: ar.role.description,
        assigned_at: ar.assigned_at,
        assigned_by: ar.assigner,
      })),
    }));
  }

  /**
   * Get a role with all companies that have access to it
   * @param roleId - Role ID
   * @returns Role with company access info
   */
  async getRoleWithCompanyAccess(
    roleId: string,
  ): Promise<RoleWithCompanyAccess | null> {
    const role = await prisma.role.findUnique({
      where: { role_id: roleId },
      include: {
        company_allowed_roles: {
          include: {
            company: {
              select: {
                company_id: true,
                name: true,
                public_id: true,
              },
            },
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
      companies: role.company_allowed_roles.map((car) => ({
        company_id: car.company.company_id,
        company_name: car.company.name,
        company_public_id: car.company.public_id,
        assigned_at: car.assigned_at,
      })),
    };
  }

  /**
   * Set allowed roles for a company
   * Replaces all existing role access with the new set
   * @param companyId - Company ID
   * @param roleIds - Array of role IDs to allow
   * @param auditContext - Audit context
   * @returns Updated company with allowed roles
   */
  async setCompanyAllowedRoles(
    companyId: string,
    roleIds: string[],
    auditContext: AuditContext,
  ): Promise<CompanyWithAllowedRoles> {
    // Verify company exists
    const company = await prisma.company.findUnique({
      where: { company_id: companyId },
    });

    if (!company) {
      throw new Error("Company not found");
    }

    // Verify all role IDs are valid and not deleted
    if (roleIds.length > 0) {
      const roles = await prisma.role.findMany({
        where: {
          role_id: { in: roleIds },
          deleted_at: null,
        },
      });

      if (roles.length !== roleIds.length) {
        throw new Error("One or more role IDs are invalid or deleted");
      }

      // Validate scope - only COMPANY and STORE scope roles should be assigned to companies
      const invalidScopeRoles = roles.filter((r) => r.scope === "SYSTEM");
      if (invalidScopeRoles.length > 0) {
        throw new Error(
          `SYSTEM scope roles cannot be assigned to companies: ${invalidScopeRoles.map((r) => r.code).join(", ")}`,
        );
      }
    }

    // Get current allowed roles for audit log
    const currentAllowedRoles = await prisma.companyAllowedRole.findMany({
      where: { company_id: companyId },
      include: { role: { select: { code: true } } },
    });

    await prisma.$transaction(async (tx) => {
      // Delete all existing allowed roles for this company
      await tx.companyAllowedRole.deleteMany({
        where: { company_id: companyId },
      });

      // Create new allowed roles
      if (roleIds.length > 0) {
        await tx.companyAllowedRole.createMany({
          data: roleIds.map((roleId) => ({
            company_id: companyId,
            role_id: roleId,
            assigned_by: auditContext.userId,
          })),
        });
      }

      // Get new role codes for audit log
      const newRoles = await tx.role.findMany({
        where: { role_id: { in: roleIds } },
        select: { code: true },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          user_id: auditContext.userId,
          action: "UPDATE",
          table_name: "company_allowed_roles",
          record_id: companyId,
          old_values: {
            roles: currentAllowedRoles.map((car) => car.role.code),
          },
          new_values: {
            roles: newRoles.map((r) => r.code),
          },
          reason: `Updated allowed roles for company: ${company.name}`,
          ip_address: auditContext.ipAddress,
          user_agent: auditContext.userAgent,
        },
      });
    });

    // Invalidate cache
    await this.invalidateCompanyAllowedRolesCache(companyId);

    const result = await this.getCompanyWithAllowedRoles(companyId);
    if (!result) {
      throw new Error("Failed to retrieve updated company");
    }

    return result;
  }

  /**
   * Add a single role to a company's allowed roles
   * @param companyId - Company ID
   * @param roleId - Role ID to add
   * @param auditContext - Audit context
   */
  async addRoleToCompany(
    companyId: string,
    roleId: string,
    auditContext: AuditContext,
  ): Promise<void> {
    // Verify company exists
    const company = await prisma.company.findUnique({
      where: { company_id: companyId },
    });

    if (!company) {
      throw new Error("Company not found");
    }

    // Verify role exists and is not deleted
    const role = await prisma.role.findUnique({
      where: { role_id: roleId },
    });

    if (!role) {
      throw new Error("Role not found");
    }

    if (role.deleted_at) {
      throw new Error("Cannot assign a deleted role");
    }

    if (role.scope === "SYSTEM") {
      throw new Error("SYSTEM scope roles cannot be assigned to companies");
    }

    // Check if already assigned
    const existing = await prisma.companyAllowedRole.findUnique({
      where: {
        company_id_role_id: {
          company_id: companyId,
          role_id: roleId,
        },
      },
    });

    if (existing) {
      throw new Error(
        `Role '${role.code}' is already assigned to this company`,
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.companyAllowedRole.create({
        data: {
          company_id: companyId,
          role_id: roleId,
          assigned_by: auditContext.userId,
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          user_id: auditContext.userId,
          action: "CREATE",
          table_name: "company_allowed_roles",
          record_id: companyId,
          new_values: {
            role_code: role.code,
            role_id: roleId,
          },
          reason: `Added role '${role.code}' to company: ${company.name}`,
          ip_address: auditContext.ipAddress,
          user_agent: auditContext.userAgent,
        },
      });
    });

    // Invalidate cache
    await this.invalidateCompanyAllowedRolesCache(companyId);
  }

  /**
   * Remove a single role from a company's allowed roles
   * @param companyId - Company ID
   * @param roleId - Role ID to remove
   * @param auditContext - Audit context
   */
  async removeRoleFromCompany(
    companyId: string,
    roleId: string,
    auditContext: AuditContext,
  ): Promise<void> {
    // Verify company exists
    const company = await prisma.company.findUnique({
      where: { company_id: companyId },
    });

    if (!company) {
      throw new Error("Company not found");
    }

    // Verify role exists
    const role = await prisma.role.findUnique({
      where: { role_id: roleId },
    });

    if (!role) {
      throw new Error("Role not found");
    }

    // Check if assigned
    const existing = await prisma.companyAllowedRole.findUnique({
      where: {
        company_id_role_id: {
          company_id: companyId,
          role_id: roleId,
        },
      },
    });

    if (!existing) {
      throw new Error(`Role '${role.code}' is not assigned to this company`);
    }

    // Check if any users in this company have this role assigned
    const usersWithRole = await prisma.userRole.count({
      where: {
        role_id: roleId,
        company_id: companyId,
        status: "ACTIVE",
      },
    });

    if (usersWithRole > 0) {
      throw new Error(
        `Cannot remove role '${role.code}' - ${usersWithRole} user(s) in this company have this role assigned. Please reassign them first.`,
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.companyAllowedRole.delete({
        where: {
          company_id_role_id: {
            company_id: companyId,
            role_id: roleId,
          },
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          user_id: auditContext.userId,
          action: "DELETE",
          table_name: "company_allowed_roles",
          record_id: companyId,
          old_values: {
            role_code: role.code,
            role_id: roleId,
          },
          reason: `Removed role '${role.code}' from company: ${company.name}`,
          ip_address: auditContext.ipAddress,
          user_agent: auditContext.userAgent,
        },
      });
    });

    // Invalidate cache
    await this.invalidateCompanyAllowedRolesCache(companyId);
  }

  /**
   * Assign default roles to a new company
   * Called when a new company is created
   * @param companyId - Company ID
   * @param assignedBy - User ID of the admin creating the company
   */
  async assignDefaultRolesToCompany(
    companyId: string,
    assignedBy: string,
  ): Promise<void> {
    // Get default STORE scope roles (these are typically what new companies need)
    const defaultRoles = await prisma.role.findMany({
      where: {
        scope: "STORE",
        is_system_role: true,
        deleted_at: null,
      },
    });

    if (defaultRoles.length > 0) {
      await prisma.companyAllowedRole.createMany({
        data: defaultRoles.map((role) => ({
          company_id: companyId,
          role_id: role.role_id,
          assigned_by: assignedBy,
        })),
        skipDuplicates: true,
      });
    }
  }

  /**
   * Check if a company has access to a specific role
   * @param companyId - Company ID
   * @param roleId - Role ID
   * @returns true if company has access to the role
   */
  async companyHasRoleAccess(
    companyId: string,
    roleId: string,
  ): Promise<boolean> {
    const allowedRoleIds = await this.getCompanyAllowedRoleIds(companyId);
    return allowedRoleIds.includes(roleId);
  }

  /**
   * Get roles available for a client owner to customize
   * Only returns STORE scope roles that the company has access to
   * @param ownerUserId - Client owner's user ID
   * @returns Array of roles available for customization
   */
  async getClientCustomizableRoles(ownerUserId: string): Promise<
    Array<{
      role_id: string;
      code: string;
      scope: string;
      description: string | null;
    }>
  > {
    // Get the company owned by this user
    const company = await prisma.company.findFirst({
      where: {
        owner_user_id: ownerUserId,
        status: "ACTIVE",
      },
    });

    if (!company) {
      return [];
    }

    // Get allowed roles that are STORE scope (customizable by client)
    const allowedRoles = await prisma.companyAllowedRole.findMany({
      where: {
        company_id: company.company_id,
        role: {
          scope: "STORE",
          deleted_at: null,
        },
      },
      include: {
        role: true,
      },
    });

    return allowedRoles.map((ar) => ({
      role_id: ar.role.role_id,
      code: ar.role.code,
      scope: ar.role.scope,
      description: ar.role.description,
    }));
  }

  /**
   * Invalidate company allowed roles cache
   * @param companyId - Company ID
   */
  private async invalidateCompanyAllowedRolesCache(
    companyId: string,
  ): Promise<void> {
    const redis = await getRedisClient();
    if (redis) {
      try {
        await redis.del(`company_allowed_roles:${companyId}`);
      } catch (error) {
        console.error(
          "Failed to invalidate company allowed roles cache:",
          error,
        );
      }
    }
  }
}

// Export singleton instance
export const companyRoleAccessService = new CompanyRoleAccessService();
