import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { generatePublicId, PUBLIC_ID_PREFIXES } from "../utils/public-id";
import { prisma } from "../utils/db";

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
 * Client employee creation input
 */
export interface CreateClientEmployeeInput {
  email: string;
  name: string;
  store_id: string;
  role_id: string;
  password?: string;
}

/**
 * Client employee list options
 */
export interface ClientEmployeeListOptions {
  page?: number;
  limit?: number;
  search?: string;
  store_id?: string;
}

/**
 * Employee with roles response
 */
export interface EmployeeWithRoles {
  user_id: string;
  email: string;
  name: string;
  status: string;
  created_at: Date;
  store_id: string | null;
  store_name: string | null;
  company_id: string | null;
  company_name: string | null;
  roles: Array<{
    user_role_id: string;
    role_code: string;
    role_description: string | null;
  }>;
}

/**
 * Paginated employee result
 */
export interface PaginatedEmployeeResult {
  data: EmployeeWithRoles[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Client Employee Service
 * Handles CRUD operations for client-managed employees with proper authorization
 * Clients can only manage employees in their owned stores with STORE scope roles
 */
export class ClientEmployeeService {
  /**
   * Get all store IDs owned by a client user
   * @param clientUserId - Client user UUID
   * @returns Array of store IDs owned by the client
   */
  async getClientStoreIds(clientUserId: string): Promise<string[]> {
    const companies = await prisma.company.findMany({
      where: {
        owner_user_id: clientUserId,
      },
      select: {
        company_id: true,
      },
    });

    const companyIds = companies.map((c) => c.company_id);

    if (companyIds.length === 0) {
      return [];
    }

    const stores = await prisma.store.findMany({
      where: {
        company_id: { in: companyIds },
      },
      select: {
        store_id: true,
      },
    });

    return stores.map((s) => s.store_id);
  }

  /**
   * Verify if a store belongs to the client user
   * @param storeId - Store UUID
   * @param clientUserId - Client user UUID
   * @returns True if store belongs to client
   */
  async verifyStoreOwnership(
    storeId: string,
    clientUserId: string,
  ): Promise<boolean> {
    const store = await prisma.store.findFirst({
      where: {
        store_id: storeId,
        company: {
          owner_user_id: clientUserId,
        },
      },
    });

    return store !== null;
  }

  /**
   * Verify if a role has STORE scope
   * @param roleId - Role UUID
   * @returns Role data if STORE scope, null otherwise
   */
  async verifyStoreScopeRole(
    roleId: string,
  ): Promise<{ role_id: string; code: string; scope: string } | null> {
    const role = await prisma.role.findUnique({
      where: { role_id: roleId },
      select: {
        role_id: true,
        code: true,
        scope: true,
      },
    });

    if (!role || role.scope !== "STORE") {
      return null;
    }

    return role;
  }

  /**
   * Create a new employee for a client's store
   * @param data - Employee creation data
   * @param clientUserId - Client user UUID performing the action
   * @param auditContext - Audit context for logging
   * @returns Created employee with roles
   * @throws Error if validation fails
   */
  async createEmployee(
    data: CreateClientEmployeeInput,
    clientUserId: string,
    auditContext: AuditContext,
  ): Promise<EmployeeWithRoles> {
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!data.email || !emailRegex.test(data.email)) {
      throw new Error("Invalid email format");
    }

    // Validate name
    if (!data.name || data.name.trim().length === 0) {
      throw new Error("Name is required and cannot be empty");
    }

    // Validate store_id is provided
    if (!data.store_id) {
      throw new Error("Store ID is required");
    }

    // Validate role_id is provided
    if (!data.role_id) {
      throw new Error("Role ID is required");
    }

    // Check for duplicate email
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase().trim() },
    });

    if (existingUser) {
      throw new Error("Email already exists");
    }

    // Verify store belongs to this client
    const storeOwned = await this.verifyStoreOwnership(
      data.store_id,
      clientUserId,
    );
    if (!storeOwned) {
      throw new Error(
        "Store does not belong to your organization or does not exist",
      );
    }

    // Verify role is STORE scope
    const role = await this.verifyStoreScopeRole(data.role_id);
    if (!role) {
      throw new Error(
        "Only STORE scope roles can be assigned to employees. SYSTEM and COMPANY scope roles are not allowed.",
      );
    }

    // Get store info for response
    const store = await prisma.store.findUnique({
      where: { store_id: data.store_id },
      select: {
        store_id: true,
        name: true,
        company_id: true,
        company: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!store) {
      throw new Error("Store not found");
    }

    try {
      // Hash password if provided, otherwise generate a random one
      const password = data.password || this.generateRandomPassword();
      const passwordHash = await bcrypt.hash(password, 10);

      // Use transaction to create user and role assignment atomically
      const result = await prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          // Create user
          // Employees created by clients ARE client users - they access client dashboard
          const user = await tx.user.create({
            data: {
              public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
              email: data.email.toLowerCase().trim(),
              name: data.name.trim(),
              password_hash: passwordHash,
              status: "ACTIVE",
              is_client_user: true, // Employees access the client dashboard
            },
          });

          // Create role assignment with STORE scope
          const userRole = await tx.userRole.create({
            data: {
              user_id: user.user_id,
              role_id: data.role_id,
              store_id: data.store_id,
              company_id: store.company_id,
              assigned_by: clientUserId,
            },
          });

          return { user, userRole };
        },
      );

      // Create audit log (non-blocking)
      try {
        await prisma.auditLog.create({
          data: {
            user_id: clientUserId,
            action: "CREATE",
            table_name: "users",
            record_id: result.user.user_id,
            new_values: {
              user_id: result.user.user_id,
              email: result.user.email,
              name: result.user.name,
              status: result.user.status,
              store_id: data.store_id,
              role_id: data.role_id,
              created_by_client: clientUserId,
            } as Prisma.InputJsonValue,
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
            reason: `Employee created by client ${auditContext.userEmail} for store ${store.name}`,
          },
        });
      } catch (auditError) {
        console.error(
          "Failed to create audit log for employee creation:",
          auditError,
        );
      }

      return {
        user_id: result.user.user_id,
        email: result.user.email,
        name: result.user.name,
        status: result.user.status,
        created_at: result.user.created_at,
        store_id: store.store_id,
        store_name: store.name,
        company_id: store.company_id,
        company_name: store.company.name,
        roles: [
          {
            user_role_id: result.userRole.user_role_id,
            role_code: role.code,
            role_description: null,
          },
        ],
      };
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.message.includes("already exists") ||
          error.message.includes("required") ||
          error.message.includes("not found") ||
          error.message.includes("does not belong") ||
          error.message.includes("STORE scope"))
      ) {
        throw error;
      }
      console.error("Error creating employee:", error);
      throw error;
    }
  }

  /**
   * Get employees for a client user's stores with pagination
   * @param clientUserId - Client user UUID
   * @param options - List options (page, limit, search, store_id filter)
   * @returns Paginated employee results
   */
  async getEmployees(
    clientUserId: string,
    options: ClientEmployeeListOptions = {},
  ): Promise<PaginatedEmployeeResult> {
    const { page = 1, limit = 20, search, store_id } = options;
    const skip = (page - 1) * limit;

    // Get all store IDs owned by client
    const clientStoreIds = await this.getClientStoreIds(clientUserId);

    if (clientStoreIds.length === 0) {
      return {
        data: [],
        meta: { page, limit, total: 0, totalPages: 0 },
      };
    }

    // Filter by specific store if provided
    const targetStoreIds = store_id
      ? clientStoreIds.filter((id) => id === store_id)
      : clientStoreIds;

    if (targetStoreIds.length === 0) {
      return {
        data: [],
        meta: { page, limit, total: 0, totalPages: 0 },
      };
    }

    // Build where clause for user roles - employees have STORE scope roles in client's stores
    const userRoleWhere: Prisma.UserRoleWhereInput = {
      store_id: { in: targetStoreIds },
      user_id: { not: clientUserId }, // Exclude the client user themselves
      role: {
        scope: "STORE", // Only employees with STORE scope roles
      },
    };

    // Get distinct user IDs that have STORE scope roles in client's stores
    const employeeUserRoles = await prisma.userRole.findMany({
      where: userRoleWhere,
      select: {
        user_id: true,
      },
      distinct: ["user_id"],
    });

    const employeeUserIds = employeeUserRoles.map((ur) => ur.user_id);

    if (employeeUserIds.length === 0) {
      return {
        data: [],
        meta: { page, limit, total: 0, totalPages: 0 },
      };
    }

    // Build user where clause
    const userWhere: Prisma.UserWhereInput = {
      user_id: { in: employeeUserIds },
    };

    // Add search filter
    if (search) {
      userWhere.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    try {
      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where: userWhere,
          skip,
          take: limit,
          orderBy: { created_at: "desc" },
          include: {
            user_roles: {
              where: {
                store_id: { in: targetStoreIds },
              },
              include: {
                role: true,
                store: true,
                company: true,
              },
            },
          },
        }),
        prisma.user.count({ where: userWhere }),
      ]);

      const employeesWithRoles: EmployeeWithRoles[] = users.map((user) => {
        // Get primary store assignment (first one)
        const primaryRole = user.user_roles[0];

        return {
          user_id: user.user_id,
          email: user.email,
          name: user.name,
          status: user.status,
          created_at: user.created_at,
          store_id: primaryRole?.store_id || null,
          store_name: primaryRole?.store?.name || null,
          company_id: primaryRole?.company_id || null,
          company_name: primaryRole?.company?.name || null,
          roles: user.user_roles.map((ur) => ({
            user_role_id: ur.user_role_id,
            role_code: ur.role.code,
            role_description: ur.role.description,
          })),
        };
      });

      return {
        data: employeesWithRoles,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error("Error retrieving employees:", error);
      throw error;
    }
  }

  /**
   * Delete an employee created by the client
   * @param employeeId - Employee user UUID to delete
   * @param clientUserId - Client user UUID performing the action
   * @param auditContext - Audit context for logging
   * @throws Error if validation fails or employee cannot be deleted
   */
  async deleteEmployee(
    employeeId: string,
    clientUserId: string,
    auditContext: AuditContext,
  ): Promise<void> {
    // Get the employee user
    const employee = await prisma.user.findUnique({
      where: { user_id: employeeId },
      include: {
        user_roles: {
          include: {
            role: true,
            store: {
              include: {
                company: true,
              },
            },
          },
        },
      },
    });

    if (!employee) {
      throw new Error("Employee not found");
    }

    // Check if user has any SYSTEM or COMPANY scope roles - cannot delete these
    const hasSystemOrCompanyRole = employee.user_roles.some(
      (ur) => ur.role.scope === "SYSTEM" || ur.role.scope === "COMPANY",
    );

    if (hasSystemOrCompanyRole) {
      throw new Error(
        "Cannot delete users with SYSTEM or COMPANY scope roles. Only employees with STORE scope roles can be deleted.",
      );
    }

    // Verify employee has STORE scope role in one of client's stores
    const clientStoreIds = await this.getClientStoreIds(clientUserId);
    const employeeInClientStore = employee.user_roles.some(
      (ur) =>
        ur.store_id !== null &&
        clientStoreIds.includes(ur.store_id) &&
        ur.role.scope === "STORE",
    );

    if (!employeeInClientStore) {
      throw new Error(
        "Employee does not belong to your stores or is not a store employee",
      );
    }

    // Get employee info for audit log before deletion
    const employeeInfo = {
      user_id: employee.user_id,
      email: employee.email,
      name: employee.name,
      roles: employee.user_roles.map((ur) => ({
        role: ur.role.code,
        store: ur.store?.name,
      })),
    };

    try {
      // Use transaction to delete user roles and user
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Delete all user roles first
        await tx.userRole.deleteMany({
          where: { user_id: employeeId },
        });

        // Delete the user
        await tx.user.delete({
          where: { user_id: employeeId },
        });
      });

      // Create audit log (non-blocking)
      try {
        await prisma.auditLog.create({
          data: {
            user_id: clientUserId,
            action: "DELETE",
            table_name: "users",
            record_id: employeeId,
            old_values: employeeInfo as Prisma.InputJsonValue,
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
            reason: `Employee ${employee.email} permanently deleted by client ${auditContext.userEmail}`,
          },
        });
      } catch (auditError) {
        console.error(
          "Failed to create audit log for employee deletion:",
          auditError,
        );
      }
    } catch (error) {
      console.error("Error deleting employee:", error);
      throw error;
    }
  }

  /**
   * Get available STORE scope roles for dropdown
   * @returns Array of roles with STORE scope
   */
  async getStoreRoles(): Promise<
    Array<{
      role_id: string;
      code: string;
      description: string | null;
    }>
  > {
    try {
      const roles = await prisma.role.findMany({
        where: { scope: "STORE" },
        select: {
          role_id: true,
          code: true,
          description: true,
        },
        orderBy: { code: "asc" },
      });

      return roles;
    } catch (error) {
      console.error("Error fetching store roles:", error);
      throw error;
    }
  }

  /**
   * Generate a random password for employee initial setup
   * @returns Random password meeting requirements
   */
  private generateRandomPassword(): string {
    const length = 16;
    const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lowercase = "abcdefghijklmnopqrstuvwxyz";
    const numbers = "0123456789";
    const special = "!@#$%^&*";
    const all = uppercase + lowercase + numbers + special;

    // Ensure at least one of each required character type
    let password =
      uppercase[Math.floor(Math.random() * uppercase.length)] +
      lowercase[Math.floor(Math.random() * lowercase.length)] +
      numbers[Math.floor(Math.random() * numbers.length)] +
      special[Math.floor(Math.random() * special.length)];

    // Fill the rest randomly
    for (let i = password.length; i < length; i++) {
      password += all[Math.floor(Math.random() * all.length)];
    }

    // Shuffle the password
    return password
      .split("")
      .sort(() => Math.random() - 0.5)
      .join("");
  }
}

// Export singleton instance
export const clientEmployeeService = new ClientEmployeeService();
