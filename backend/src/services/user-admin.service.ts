import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { generatePublicId, PUBLIC_ID_PREFIXES } from "../utils/public-id";

const prisma = new PrismaClient();

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
 * User status enum
 */
export type UserStatus = "ACTIVE" | "INACTIVE";

/**
 * Scope type for role assignments
 */
export type ScopeType = "SYSTEM" | "COMPANY" | "STORE";

/**
 * Role assignment request
 */
export interface AssignRoleRequest {
  role_id: string;
  scope_type: ScopeType;
  client_id?: string;
  company_id?: string;
  store_id?: string;
}

/**
 * Create user input
 */
export interface CreateUserInput {
  email: string;
  name: string;
  password?: string;
  roles?: AssignRoleRequest[];
}

/**
 * User list options
 */
export interface UserListOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: UserStatus;
}

/**
 * User with roles response
 */
export interface UserWithRoles {
  user_id: string;
  email: string;
  name: string;
  status: UserStatus;
  created_at: Date;
  updated_at: Date;
  roles: UserRoleDetail[];
}

/**
 * User role detail
 */
export interface UserRoleDetail {
  user_role_id: string;
  role: {
    role_id: string;
    code: string;
    description: string | null;
    scope: string;
  };
  client_id: string | null;
  client_name: string | null;
  company_id: string | null;
  company_name: string | null;
  store_id: string | null;
  store_name: string | null;
  assigned_at: Date;
}

/**
 * Paginated user result
 */
export interface PaginatedUserResult {
  data: UserWithRoles[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * User admin service for managing user CRUD and role assignment operations
 * Handles user creation, retrieval, status updates, and role management
 * with comprehensive audit logging for compliance
 */
export class UserAdminService {
  /**
   * Create a new user with optional initial role assignments
   * @param data - User creation data
   * @param auditContext - Audit context for logging
   * @returns Created user with roles
   * @throws Error if validation fails or database error occurs
   */
  async createUser(
    data: CreateUserInput,
    auditContext: AuditContext,
  ): Promise<UserWithRoles> {
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!data.email || !emailRegex.test(data.email)) {
      throw new Error("Invalid email format");
    }

    // Validate name
    if (!data.name || data.name.trim().length === 0) {
      throw new Error("Name is required and cannot be empty");
    }

    // Check for whitespace-only name
    if (data.name.trim() !== data.name.trim().replace(/\s+/g, " ")) {
      // Allow spaces but check if it's not just whitespace
    }
    if (data.name.trim().length === 0) {
      throw new Error("Name cannot be whitespace only");
    }

    // Validate password if provided (optional for SSO users)
    if (data.password && data.password.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }

    // Check for duplicate email
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase().trim() },
    });

    if (existingUser) {
      throw new Error("Email already exists");
    }

    // Validate that at least one role is provided
    if (!data.roles || data.roles.length === 0) {
      throw new Error("User must be assigned at least one role");
    }

    try {
      // Hash password if provided
      const passwordHash = data.password
        ? await bcrypt.hash(data.password, 10)
        : null;

      // Create user
      const user = await prisma.user.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
          email: data.email.toLowerCase().trim(),
          name: data.name.trim(),
          password_hash: passwordHash,
          status: "ACTIVE",
        },
      });

      // Create audit log for user creation (non-blocking)
      try {
        await prisma.auditLog.create({
          data: {
            user_id: auditContext.userId,
            action: "CREATE",
            table_name: "users",
            record_id: user.user_id,
            new_values: {
              user_id: user.user_id,
              email: user.email,
              name: user.name,
              status: user.status,
            } as unknown as Record<string, any>,
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
            reason: `User created by ${auditContext.userEmail} (roles: ${auditContext.userRoles.join(", ")})`,
          },
        });
      } catch (auditError) {
        // Log the audit failure but don't fail the user creation
        console.error(
          "Failed to create audit log for user creation:",
          auditError,
        );
      }

      // Assign initial roles (required, already validated)
      for (const roleAssignment of data.roles) {
        await this.assignRole(user.user_id, roleAssignment, auditContext);
      }

      // Return user with roles
      return this.getUserById(user.user_id);
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("already exists")) {
        throw error;
      }
      console.error("Error creating user:", error);
      throw error;
    }
  }

  /**
   * Get users with pagination and filtering
   * @param options - List options (page, limit, search, status)
   * @returns Paginated user results with roles
   */
  async getUsers(options: UserListOptions = {}): Promise<PaginatedUserResult> {
    const { page = 1, limit = 20, search, status } = options;

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    // Filter by status
    if (status) {
      where.status = status;
    }

    // Search by name or email
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    try {
      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: limit,
          orderBy: { created_at: "desc" },
          include: {
            user_roles: {
              include: {
                role: true,
                company: {
                  include: {
                    client: true,
                  },
                },
                store: true,
              },
            },
          },
        }),
        prisma.user.count({ where }),
      ]);

      const usersWithRoles: UserWithRoles[] = users.map((user: any) => ({
        user_id: user.user_id,
        email: user.email,
        name: user.name,
        status: user.status as UserStatus,
        created_at: user.created_at,
        updated_at: user.updated_at,
        roles: user.user_roles.map((ur: any) => ({
          user_role_id: ur.user_role_id,
          role: {
            role_id: ur.role.role_id,
            code: ur.role.code,
            description: ur.role.description,
            scope: ur.role.scope,
          },
          client_id: ur.company?.client_id || null,
          client_name: ur.company?.client?.name || null,
          company_id: ur.company_id,
          company_name: ur.company?.name || null,
          store_id: ur.store_id,
          store_name: ur.store?.name || null,
          assigned_at: ur.assigned_at,
        })),
      }));

      return {
        data: usersWithRoles,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error("Error retrieving users:", error);
      throw error;
    }
  }

  /**
   * Get user by ID with full role details
   * @param userId - User UUID
   * @returns User with roles
   * @throws Error if user not found
   */
  async getUserById(userId: string): Promise<UserWithRoles> {
    try {
      const user = await prisma.user.findUnique({
        where: { user_id: userId },
        include: {
          user_roles: {
            include: {
              role: true,
              company: {
                include: {
                  client: true,
                },
              },
              store: true,
            },
          },
        },
      });

      if (!user) {
        throw new Error(`User with ID ${userId} not found`);
      }

      return {
        user_id: user.user_id,
        email: user.email,
        name: user.name,
        status: user.status as UserStatus,
        created_at: user.created_at,
        updated_at: user.updated_at,
        roles: user.user_roles.map((ur: any) => ({
          user_role_id: ur.user_role_id,
          role: {
            role_id: ur.role.role_id,
            code: ur.role.code,
            description: ur.role.description,
            scope: ur.role.scope,
          },
          client_id: ur.company?.client_id || null,
          client_name: ur.company?.client?.name || null,
          company_id: ur.company_id,
          company_name: ur.company?.name || null,
          store_id: ur.store_id,
          store_name: ur.store?.name || null,
          assigned_at: ur.assigned_at,
        })),
      };
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("not found")) {
        throw error;
      }
      console.error("Error retrieving user:", error);
      throw error;
    }
  }

  /**
   * Update user status (activate/deactivate)
   * @param userId - User UUID
   * @param status - New status (ACTIVE or INACTIVE)
   * @param auditContext - Audit context for logging
   * @returns Updated user with roles
   * @throws Error if user not found or validation fails
   */
  async updateUserStatus(
    userId: string,
    status: UserStatus,
    auditContext: AuditContext,
  ): Promise<UserWithRoles> {
    // Validate status
    if (!["ACTIVE", "INACTIVE"].includes(status)) {
      throw new Error("Invalid status. Must be ACTIVE or INACTIVE");
    }

    try {
      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { user_id: userId },
      });

      if (!existingUser) {
        throw new Error(`User with ID ${userId} not found`);
      }

      // Update user status
      const user = await prisma.user.update({
        where: { user_id: userId },
        data: { status },
      });

      // Create audit log (non-blocking)
      try {
        await prisma.auditLog.create({
          data: {
            user_id: auditContext.userId,
            action: "UPDATE",
            table_name: "users",
            record_id: user.user_id,
            old_values: {
              status: existingUser.status,
            } as unknown as Record<string, any>,
            new_values: {
              status: user.status,
            } as unknown as Record<string, any>,
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
            reason: `User ${status === "INACTIVE" ? "deactivated" : "activated"} by ${auditContext.userEmail} (roles: ${auditContext.userRoles.join(", ")})`,
          },
        });
      } catch (auditError) {
        // Log the audit failure but don't fail the status update
        console.error(
          "Failed to create audit log for user status update:",
          auditError,
        );
      }

      return this.getUserById(userId);
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("not found")) {
        throw error;
      }
      console.error("Error updating user status:", error);
      throw error;
    }
  }

  /**
   * Assign a role to a user with scope validation
   * @param userId - User UUID
   * @param roleAssignment - Role assignment details
   * @param auditContext - Audit context for logging
   * @returns Created user role
   * @throws Error if validation fails
   */
  async assignRole(
    userId: string,
    roleAssignment: AssignRoleRequest,
    auditContext: AuditContext,
  ): Promise<UserRoleDetail> {
    const { role_id, scope_type, client_id, company_id, store_id } =
      roleAssignment;

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { user_id: userId },
    });

    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    // Verify role exists and get its scope
    const role = await prisma.role.findUnique({
      where: { role_id },
    });

    if (!role) {
      throw new Error(`Role with ID ${role_id} not found`);
    }

    // Validate scope requirements
    if (scope_type === "SYSTEM") {
      // SYSTEM scope - no additional IDs required
      // But we should not have company_id or store_id
    } else if (scope_type === "COMPANY") {
      // COMPANY scope - requires client_id and company_id
      if (!client_id || !company_id) {
        throw new Error("COMPANY scope requires both client_id and company_id");
      }

      // Validate company exists and belongs to client
      const company = await prisma.company.findUnique({
        where: { company_id },
      });

      if (!company) {
        throw new Error(`Company with ID ${company_id} not found`);
      }

      if (company.client_id !== client_id) {
        throw new Error("Company does not belong to the specified client");
      }
    } else if (scope_type === "STORE") {
      // STORE scope - requires client_id, company_id, and store_id
      if (!client_id || !company_id || !store_id) {
        throw new Error(
          "STORE scope requires client_id, company_id, and store_id",
        );
      }

      // Validate company exists and belongs to client
      const company = await prisma.company.findUnique({
        where: { company_id },
      });

      if (!company) {
        throw new Error(`Company with ID ${company_id} not found`);
      }

      if (company.client_id !== client_id) {
        throw new Error("Company does not belong to the specified client");
      }

      // Validate store exists and belongs to company
      const store = await prisma.store.findUnique({
        where: { store_id },
      });

      if (!store) {
        throw new Error(`Store with ID ${store_id} not found`);
      }

      if (store.company_id !== company_id) {
        throw new Error("Store does not belong to the specified company");
      }
    } else {
      throw new Error("Invalid scope_type. Must be SYSTEM, COMPANY, or STORE");
    }

    try {
      // Create user role assignment
      const userRole = await prisma.userRole.create({
        data: {
          user_id: userId,
          role_id,
          company_id: scope_type === "SYSTEM" ? null : company_id,
          store_id: scope_type === "STORE" ? store_id : null,
          assigned_by: auditContext.userId,
        },
        include: {
          role: true,
          company: {
            include: {
              client: true,
            },
          },
          store: true,
        },
      });

      // Create audit log (non-blocking)
      try {
        await prisma.auditLog.create({
          data: {
            user_id: auditContext.userId,
            action: "CREATE",
            table_name: "user_roles",
            record_id: userRole.user_role_id,
            new_values: {
              user_role_id: userRole.user_role_id,
              user_id: userRole.user_id,
              role_id: userRole.role_id,
              role_code: role.code,
              scope_type,
              company_id: userRole.company_id,
              store_id: userRole.store_id,
            } as unknown as Record<string, any>,
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
            reason: `Role ${role.code} assigned to user ${user.email} by ${auditContext.userEmail}`,
          },
        });
      } catch (auditError) {
        // Log the audit failure but don't fail the role assignment
        console.error(
          "Failed to create audit log for role assignment:",
          auditError,
        );
      }

      return {
        user_role_id: userRole.user_role_id,
        role: {
          role_id: userRole.role.role_id,
          code: userRole.role.code,
          description: userRole.role.description,
          scope: userRole.role.scope,
        },
        client_id: userRole.company?.client_id || null,
        client_name: userRole.company?.client?.name || null,
        company_id: userRole.company_id,
        company_name: userRole.company?.name || null,
        store_id: userRole.store_id,
        store_name: userRole.store?.name || null,
        assigned_at: userRole.assigned_at,
      };
    } catch (error: any) {
      // Handle unique constraint violation
      if (error && error.code === "P2002") {
        throw new Error("User already has this role assignment");
      }
      console.error("Error assigning role:", error);
      throw error;
    }
  }

  /**
   * Revoke a role from a user
   * @param userId - User UUID
   * @param userRoleId - User role UUID to revoke
   * @param auditContext - Audit context for logging
   * @throws Error if role assignment not found
   */
  async revokeRole(
    userId: string,
    userRoleId: string,
    auditContext: AuditContext,
  ): Promise<void> {
    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { user_id: userId },
    });

    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    // Find the user role
    const userRole = await prisma.userRole.findUnique({
      where: { user_role_id: userRoleId },
      include: {
        role: true,
        company: true,
        store: true,
      },
    });

    if (!userRole) {
      throw new Error(`User role with ID ${userRoleId} not found`);
    }

    // Verify the role belongs to the specified user
    if (userRole.user_id !== userId) {
      throw new Error("User role does not belong to the specified user");
    }

    try {
      // Delete the user role
      await prisma.userRole.delete({
        where: { user_role_id: userRoleId },
      });

      // Create audit log (non-blocking)
      try {
        await prisma.auditLog.create({
          data: {
            user_id: auditContext.userId,
            action: "DELETE",
            table_name: "user_roles",
            record_id: userRoleId,
            old_values: {
              user_role_id: userRole.user_role_id,
              user_id: userRole.user_id,
              role_id: userRole.role_id,
              role_code: userRole.role.code,
              company_id: userRole.company_id,
              store_id: userRole.store_id,
            } as unknown as Record<string, any>,
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
            reason: `Role ${userRole.role.code} revoked from user ${user.email} by ${auditContext.userEmail}`,
          },
        });
      } catch (auditError) {
        // Log the audit failure but don't fail the role removal
        console.error(
          "Failed to create audit log for role removal:",
          auditError,
        );
      }
    } catch (error) {
      console.error("Error revoking role:", error);
      throw error;
    }
  }

  /**
   * Get available roles for dropdown
   * @returns Array of roles with id, code, scope
   */
  async getRoles(): Promise<
    Array<{
      role_id: string;
      code: string;
      description: string | null;
      scope: string;
    }>
  > {
    try {
      const roles = await prisma.role.findMany({
        select: {
          role_id: true,
          code: true,
          description: true,
          scope: true,
        },
        orderBy: { code: "asc" },
      });

      return roles;
    } catch (error) {
      console.error("Error fetching roles:", error);
      throw error;
    }
  }
}

// Export singleton instance
export const userAdminService = new UserAdminService();
