import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generatePublicId, PUBLIC_ID_PREFIXES } from "../utils/public-id";
import { prisma } from "../utils/db";
import {
  invalidateUserStatusCache,
  invalidateMultipleUserStatusCache,
} from "../middleware/active-status.middleware";

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
export enum UserStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
}

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
  // Company fields for CLIENT_OWNER role (creates new company)
  companyName?: string;
  companyAddress?: string;
  // Company and store IDs for CLIENT_USER role (assigns to existing company/store)
  company_id?: string;
  store_id?: string;
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
 * Update user profile input
 */
export interface UpdateUserProfileInput {
  name?: string;
  email?: string;
  password?: string;
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
   * If CLIENT_OWNER role is assigned, also creates a company owned by this user
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

    // Check for CLIENT_OWNER and CLIENT_USER roles
    // We'll verify this after fetching the roles
    let hasClientOwnerRole = false;
    let hasClientUserRole = false;
    for (const roleAssignment of data.roles) {
      const role = await prisma.role.findUnique({
        where: { role_id: roleAssignment.role_id },
      });
      if (role?.code === "CLIENT_OWNER") {
        hasClientOwnerRole = true;
      }
      if (role?.code === "CLIENT_USER") {
        hasClientUserRole = true;
      }
    }

    // Determine if this user should be marked as a client user
    // Client users can access the client dashboard and use client-login
    const isClientUser = hasClientOwnerRole || hasClientUserRole;

    // Validate company fields if CLIENT_OWNER role is being assigned
    if (hasClientOwnerRole) {
      if (!data.companyName || data.companyName.trim().length === 0) {
        throw new Error("Company name is required for Client Owner role");
      }
      if (data.companyName.trim().length > 255) {
        throw new Error("Company name cannot exceed 255 characters");
      }
      if (!data.companyAddress || data.companyAddress.trim().length === 0) {
        throw new Error("Company address is required for Client Owner role");
      }
      if (data.companyAddress.trim().length > 500) {
        throw new Error("Company address cannot exceed 500 characters");
      }
    }

    // Validate company and store assignment if CLIENT_USER role is being assigned
    // Note: Basic validation happens here, but critical validations (active status, ownership)
    // are re-checked inside the transaction to prevent TOCTOU vulnerabilities
    if (hasClientUserRole) {
      // Validate that company_id and store_id are provided for CLIENT_USER
      for (const roleAssignment of data.roles) {
        const role = await prisma.role.findUnique({
          where: { role_id: roleAssignment.role_id },
        });
        if (role?.code === "CLIENT_USER") {
          if (!roleAssignment.company_id) {
            throw new Error(
              "Company ID is required for CLIENT_USER role assignment",
            );
          }
          if (!roleAssignment.store_id) {
            throw new Error(
              "Store ID is required for CLIENT_USER role assignment",
            );
          }

          // Basic existence checks (full validation happens in transaction)
          // Check company first - if company doesn't exist, no point checking store
          const company = await prisma.company.findUnique({
            where: { company_id: roleAssignment.company_id },
            select: { company_id: true },
          });

          if (!company) {
            throw new Error(
              `Company with ID ${roleAssignment.company_id} not found`,
            );
          }

          const store = await prisma.store.findUnique({
            where: { store_id: roleAssignment.store_id },
            select: { company_id: true },
          });

          if (!store) {
            throw new Error(
              `Store with ID ${roleAssignment.store_id} not found`,
            );
          }
        }
      }
    }

    try {
      // Hash password if provided
      const passwordHash = data.password
        ? await bcrypt.hash(data.password, 10)
        : null;

      // Use transaction to create user and company atomically
      // Critical validations (active status, ownership) happen inside transaction
      // to prevent TOCTOU vulnerabilities
      const result = await prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          // Create user
          // Set is_client_user flag for users with CLIENT_OWNER or CLIENT_USER roles
          const user = await tx.user.create({
            data: {
              public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
              email: data.email.toLowerCase().trim(),
              name: data.name.trim(),
              password_hash: passwordHash,
              status: "ACTIVE",
              is_client_user: isClientUser,
            },
          });

          // If CLIENT_OWNER, create a company owned by this user
          let createdCompany = null;
          if (hasClientOwnerRole && data.companyName && data.companyAddress) {
            createdCompany = await tx.company.create({
              data: {
                public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
                name: data.companyName.trim(),
                address: data.companyAddress.trim(),
                owner_user_id: user.user_id,
                status: "ACTIVE",
              },
            });
          }

          // Create role assignments
          for (const roleAssignment of data.roles!) {
            const role = await tx.role.findUnique({
              where: { role_id: roleAssignment.role_id },
            });

            if (!role) {
              throw new Error(
                `Role with ID ${roleAssignment.role_id} not found`,
              );
            }

            // Determine company_id and store_id for the user role
            // For CLIENT_OWNER with a newly created company, link to that company
            // For CLIENT_USER, use the provided company_id and store_id
            let companyIdForRole: string | null = null;
            let storeIdForRole: string | null = null;

            if (roleAssignment.scope_type !== "SYSTEM") {
              if (role.code === "CLIENT_OWNER" && createdCompany) {
                // Link CLIENT_OWNER to their newly created company
                companyIdForRole = createdCompany.company_id;
              } else if (role.code === "CLIENT_USER") {
                // CLIENT_USER must have company_id and store_id from role assignment
                // Re-validate inside transaction to prevent TOCTOU vulnerability
                if (!roleAssignment.company_id || !roleAssignment.store_id) {
                  throw new Error(
                    "Company ID and Store ID are required for CLIENT_USER role assignment",
                  );
                }

                // Re-validate store exists, belongs to company, and is active
                // This validation happens inside the transaction to prevent race conditions
                const store = await tx.store.findUnique({
                  where: { store_id: roleAssignment.store_id },
                  select: { company_id: true, status: true },
                });

                if (!store) {
                  throw new Error(
                    `Store with ID ${roleAssignment.store_id} not found`,
                  );
                }

                if (store.company_id !== roleAssignment.company_id) {
                  throw new Error(
                    "Store does not belong to the specified company. This is a security violation.",
                  );
                }

                if (store.status !== "ACTIVE") {
                  throw new Error(
                    "Cannot assign CLIENT_USER to an inactive store",
                  );
                }

                // Re-validate company exists and is active
                // This validation happens inside the transaction to prevent race conditions
                const company = await tx.company.findUnique({
                  where: { company_id: roleAssignment.company_id },
                  select: { company_id: true, status: true },
                });

                if (!company) {
                  throw new Error(
                    `Company with ID ${roleAssignment.company_id} not found`,
                  );
                }

                if (company.status !== "ACTIVE") {
                  throw new Error(
                    "Cannot assign CLIENT_USER to an inactive company",
                  );
                }

                companyIdForRole = roleAssignment.company_id;
                storeIdForRole = roleAssignment.store_id;
              } else if (role.scope === "STORE") {
                // ALL STORE-scoped roles require company_id and store_id
                // This ensures STORE_MANAGER, SHIFT_MANAGER, CASHIER, etc. are always assigned to a specific store
                if (!roleAssignment.company_id || !roleAssignment.store_id) {
                  throw new Error(
                    `Company ID and Store ID are required for STORE-scoped role '${role.code}'. A store-level role must be assigned to a specific store.`,
                  );
                }

                // Re-validate store exists, belongs to company, and is active
                // This validation happens inside the transaction to prevent race conditions
                const store = await tx.store.findUnique({
                  where: { store_id: roleAssignment.store_id },
                  select: { company_id: true, status: true },
                });

                if (!store) {
                  throw new Error(
                    `Store with ID ${roleAssignment.store_id} not found`,
                  );
                }

                if (store.company_id !== roleAssignment.company_id) {
                  throw new Error(
                    "Store does not belong to the specified company. This is a security violation.",
                  );
                }

                if (store.status !== "ACTIVE") {
                  throw new Error(
                    `Cannot assign ${role.code} to an inactive store`,
                  );
                }

                // Re-validate company exists and is active
                const company = await tx.company.findUnique({
                  where: { company_id: roleAssignment.company_id },
                  select: { company_id: true, status: true },
                });

                if (!company) {
                  throw new Error(
                    `Company with ID ${roleAssignment.company_id} not found`,
                  );
                }

                if (company.status !== "ACTIVE") {
                  throw new Error(
                    `Cannot assign ${role.code} to an inactive company`,
                  );
                }

                companyIdForRole = roleAssignment.company_id;
                storeIdForRole = roleAssignment.store_id;
              } else {
                // For COMPANY-scoped roles, use provided company_id (no store_id needed)
                companyIdForRole = roleAssignment.company_id || null;
              }
            }

            await tx.userRole.create({
              data: {
                user_id: user.user_id,
                role_id: roleAssignment.role_id,
                company_id: companyIdForRole,
                store_id: storeIdForRole,
                assigned_by: auditContext.userId,
              },
            });
          }

          return { user, company: createdCompany };
        },
      );

      // Create audit log for user creation (non-blocking)
      try {
        await prisma.auditLog.create({
          data: {
            user_id: auditContext.userId,
            action: "CREATE",
            table_name: "users",
            record_id: result.user.user_id,
            new_values: {
              user_id: result.user.user_id,
              email: result.user.email,
              name: result.user.name,
              status: result.user.status,
              company_created: result.company
                ? result.company.company_id
                : null,
            } as unknown as Record<string, any>,
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
            reason: `User created by ${auditContext.userEmail} (roles: ${auditContext.userRoles.join(", ")})${result.company ? ` with company ${result.company.name}` : ""}`,
          },
        });
      } catch (auditError) {
        // Log the audit failure but don't fail the user creation
        console.error(
          "Failed to create audit log for user creation:",
          auditError,
        );
      }

      // Return user with roles
      return this.getUserById(result.user.user_id);
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.message.includes("already exists") ||
          error.message.includes("required") ||
          error.message.includes("not found"))
      ) {
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
          select: {
            user_id: true,
            email: true,
            name: true,
            status: true,
            created_at: true,
            updated_at: true,
            user_roles: {
              select: {
                user_role_id: true,
                assigned_at: true,
                company_id: true,
                store_id: true,
                role: {
                  select: {
                    role_id: true,
                    code: true,
                    description: true,
                    scope: true,
                  },
                },
                company: {
                  select: { name: true },
                },
                store: {
                  select: { name: true },
                },
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
        select: {
          user_id: true,
          email: true,
          name: true,
          status: true,
          created_at: true,
          updated_at: true,
          user_roles: {
            select: {
              user_role_id: true,
              assigned_at: true,
              company_id: true,
              store_id: true,
              role: {
                select: {
                  role_id: true,
                  code: true,
                  description: true,
                  scope: true,
                },
              },
              company: {
                select: { name: true },
              },
              store: {
                select: { name: true },
              },
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
   * Cascades status changes to owned companies and their stores if user is a CLIENT_OWNER
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
      // Check if user exists and get their roles
      const existingUser = await prisma.user.findUnique({
        where: { user_id: userId },
        include: {
          user_roles: {
            include: {
              role: true,
            },
          },
          owned_companies: true,
        },
      });

      if (!existingUser) {
        throw new Error(`User with ID ${userId} not found`);
      }

      // Check if user has CLIENT_OWNER role
      const hasClientOwnerRole = existingUser.user_roles.some(
        (ur: any) => ur.role?.code === "CLIENT_OWNER",
      );

      // Get list of affected user IDs before the transaction (for cache invalidation)
      let affectedUserIds: string[] = [];
      if (hasClientOwnerRole && existingUser.owned_companies.length > 0) {
        const companyIds = existingUser.owned_companies.map(
          (c: any) => c.company_id,
        );
        const affectedUserRoles = await prisma.userRole.findMany({
          where: {
            company_id: { in: companyIds },
            user_id: { not: userId }, // Don't include the owner
          },
          select: { user_id: true },
        });
        affectedUserIds = Array.from(
          new Set(affectedUserRoles.map((ur: any) => ur.user_id)),
        );
      }

      // Use transaction to update user and cascade to owned companies if applicable
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Update user status
        await tx.user.update({
          where: { user_id: userId },
          data: { status },
        });

        // CASCADE: If user is a CLIENT_OWNER with owned companies, update them
        if (hasClientOwnerRole && existingUser.owned_companies.length > 0) {
          // Update all companies owned by this user
          await tx.company.updateMany({
            where: { owner_user_id: userId },
            data: { status },
          });

          // Update all stores under companies owned by this user
          await tx.store.updateMany({
            where: {
              company: { owner_user_id: userId },
            },
            data: { status },
          });

          // CRITICAL: Also deactivate/activate ALL users who have roles in these companies
          // This ensures that when a CLIENT_OWNER is deactivated, all their employees
          // (CLIENT_USER, STORE_MANAGER, CASHIER, etc.) are also deactivated
          if (affectedUserIds.length > 0) {
            await tx.user.updateMany({
              where: {
                user_id: { in: affectedUserIds },
              },
              data: { status },
            });
            console.log(
              `[UserAdminService] Cascaded status ${status} to ${affectedUserIds.length} users in owned companies`,
            );
          }
        }
      });

      // SECURITY: Immediately invalidate user status cache to prevent continued access
      // This ensures deactivated users cannot use their existing JWT tokens
      await invalidateUserStatusCache(userId);

      // If updating a CLIENT_OWNER, also invalidate cache for all affected users
      if (affectedUserIds.length > 0) {
        await invalidateMultipleUserStatusCache(affectedUserIds);
        console.log(
          `[UserAdminService] Invalidated status cache for ${affectedUserIds.length} users in owned companies`,
        );
      }

      // Create audit log (non-blocking)
      try {
        let auditReason = `User ${status === "INACTIVE" ? "deactivated" : "activated"} by ${auditContext.userEmail} (roles: ${auditContext.userRoles.join(", ")})`;
        if (hasClientOwnerRole && existingUser.owned_companies.length > 0) {
          auditReason += `. CASCADE: ${existingUser.owned_companies.length} company/companies, their stores, and ${affectedUserIds.length} employee(s) also ${status === "INACTIVE" ? "deactivated" : "activated"}.`;
        }

        await prisma.auditLog.create({
          data: {
            user_id: auditContext.userId,
            action: "UPDATE",
            table_name: "users",
            record_id: userId,
            old_values: {
              status: existingUser.status,
            } as unknown as Record<string, any>,
            new_values: {
              status: status,
            } as unknown as Record<string, any>,
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
            reason: auditReason,
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
   * Update user profile (name, email, and/or password)
   * System Admin only - allows updating any user's profile
   * @param userId - User UUID to update
   * @param data - Profile update data (name, email, password)
   * @param auditContext - Audit context for logging
   * @returns Updated user with roles
   * @throws Error if user not found, email already exists, or validation fails
   */
  async updateUserProfile(
    userId: string,
    data: UpdateUserProfileInput,
    auditContext: AuditContext,
  ): Promise<UserWithRoles> {
    // Validate at least one field is provided
    if (!data.name && !data.email && !data.password) {
      throw new Error(
        "At least one field (name, email, or password) must be provided",
      );
    }

    try {
      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { user_id: userId },
        select: {
          user_id: true,
          email: true,
          name: true,
          status: true,
        },
      });

      if (!existingUser) {
        throw new Error(`User with ID ${userId} not found`);
      }

      // If email is being changed, check for duplicates
      if (
        data.email &&
        data.email.toLowerCase().trim() !== existingUser.email
      ) {
        const emailExists = await prisma.user.findUnique({
          where: { email: data.email.toLowerCase().trim() },
        });

        if (emailExists) {
          throw new Error("Email already exists");
        }
      }

      // Prepare update data
      const updateData: {
        name?: string;
        email?: string;
        password_hash?: string;
      } = {};

      if (data.name) {
        updateData.name = data.name.trim();
      }

      if (data.email) {
        updateData.email = data.email.toLowerCase().trim();
      }

      if (data.password) {
        updateData.password_hash = await bcrypt.hash(data.password, 10);
      }

      // Update user
      await prisma.user.update({
        where: { user_id: userId },
        data: updateData,
      });

      // Build old values and new values for audit log
      const oldValues: Record<string, string> = {};
      const newValues: Record<string, string> = {};
      const changes: string[] = [];

      if (data.name && data.name.trim() !== existingUser.name) {
        oldValues.name = existingUser.name;
        newValues.name = data.name.trim();
        changes.push("name");
      }

      if (
        data.email &&
        data.email.toLowerCase().trim() !== existingUser.email
      ) {
        oldValues.email = existingUser.email;
        newValues.email = data.email.toLowerCase().trim();
        changes.push("email");
      }

      if (data.password) {
        // Don't log actual password values, just indicate it was changed
        newValues.password = "[CHANGED]";
        changes.push("password");
      }

      // Create audit log (non-blocking)
      try {
        await prisma.auditLog.create({
          data: {
            user_id: auditContext.userId,
            action: "UPDATE",
            table_name: "users",
            record_id: userId,
            old_values: oldValues as unknown as Record<string, any>,
            new_values: newValues as unknown as Record<string, any>,
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
            reason: `User profile updated (${changes.join(", ")}) by ${auditContext.userEmail} (roles: ${auditContext.userRoles.join(", ")})`,
          },
        });
      } catch (auditError) {
        // Log the audit failure but don't fail the update
        console.error(
          "Failed to create audit log for user profile update:",
          auditError,
        );
      }

      return this.getUserById(userId);
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.message.includes("not found") ||
          error.message.includes("already exists") ||
          error.message.includes("At least one field"))
      ) {
        throw error;
      }
      console.error("Error updating user profile:", error);
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
    const { role_id, scope_type, company_id, store_id } = roleAssignment;

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

    // Validate scope requirements (basic validation)
    // Note: Critical validations (active status, ownership) are re-checked
    // inside the transaction to prevent TOCTOU vulnerabilities
    if (scope_type === "SYSTEM") {
      // SYSTEM scope - no additional IDs required
    } else if (scope_type === "COMPANY") {
      // COMPANY scope - requires company_id
      if (!company_id) {
        throw new Error("COMPANY scope requires company_id");
      }

      // Basic existence check (full validation happens in transaction)
      const company = await prisma.company.findUnique({
        where: { company_id },
        select: { company_id: true },
      });

      if (!company) {
        throw new Error(`Company with ID ${company_id} not found`);
      }
    } else if (scope_type === "STORE") {
      // STORE scope - requires company_id and store_id for ALL store-scoped roles
      if (!company_id || !store_id) {
        throw new Error(
          `Company ID and Store ID are required for STORE-scoped role '${role.code}'. A store-level role must be assigned to a specific store.`,
        );
      }

      // Basic existence checks (full validation happens in transaction)
      const company = await prisma.company.findUnique({
        where: { company_id },
        select: { company_id: true },
      });

      if (!company) {
        throw new Error(`Company with ID ${company_id} not found`);
      }

      const store = await prisma.store.findUnique({
        where: { store_id },
        select: { company_id: true },
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
      // Check if the role being assigned is a client role
      const isClientRole =
        role.code === "CLIENT_OWNER" || role.code === "CLIENT_USER";

      // Use transaction to create role assignment atomically
      // Critical validations (active status) happen inside transaction
      // to prevent TOCTOU vulnerabilities
      const result = await prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          // Re-validate scope requirements inside transaction
          if (scope_type === "COMPANY") {
            // Re-validate company exists and is active
            const company = await tx.company.findUnique({
              where: { company_id: company_id! },
              select: { company_id: true, status: true },
            });

            if (!company) {
              throw new Error(`Company with ID ${company_id} not found`);
            }

            // For CLIENT_USER role, ensure company is active
            if (role.code === "CLIENT_USER" && company.status !== "ACTIVE") {
              throw new Error(
                "Cannot assign CLIENT_USER to an inactive company",
              );
            }
          } else if (scope_type === "STORE") {
            // Re-validate company exists and is active
            const company = await tx.company.findUnique({
              where: { company_id: company_id! },
              select: { company_id: true, status: true },
            });

            if (!company) {
              throw new Error(`Company with ID ${company_id} not found`);
            }

            // ALL STORE-scoped roles require active company
            if (company.status !== "ACTIVE") {
              throw new Error(
                `Cannot assign ${role.code} to an inactive company`,
              );
            }

            // Re-validate store exists, belongs to company, and is active
            const store = await tx.store.findUnique({
              where: { store_id: store_id! },
              select: { company_id: true, status: true },
            });

            if (!store) {
              throw new Error(`Store with ID ${store_id} not found`);
            }

            if (store.company_id !== company_id) {
              throw new Error(
                "Store does not belong to the specified company. This is a security violation.",
              );
            }

            // ALL STORE-scoped roles require active store
            if (store.status !== "ACTIVE") {
              throw new Error(
                `Cannot assign ${role.code} to an inactive store`,
              );
            }
          }

          // BUSINESS RULE: One role per user - users can only have one role assigned
          const existingUserRoles = await tx.userRole.findMany({
            where: { user_id: userId },
            select: { user_role_id: true, role: { select: { code: true } } },
          });

          if (existingUserRoles.length > 0) {
            const existingRoleCodes = existingUserRoles
              .map((ur) => ur.role.code)
              .join(", ");
            throw new Error(
              `User already has a role assigned (${existingRoleCodes}). A user can only have one role.`,
            );
          }

          // BUSINESS RULE: One CLIENT_OWNER per company
          // If assigning CLIENT_OWNER role, check if company already has a CLIENT_OWNER
          if (role.code === "CLIENT_OWNER" && company_id) {
            const existingClientOwner = await tx.userRole.findFirst({
              where: {
                company_id: company_id,
                role: { code: "CLIENT_OWNER" },
              },
              include: { user: { select: { email: true } } },
            });

            if (existingClientOwner) {
              throw new Error(
                `Company already has a CLIENT_OWNER assigned (${existingClientOwner.user.email}). Each company can only have one owner.`,
              );
            }
          }

          // Create user role assignment
          const userRole = await tx.userRole.create({
            data: {
              user_id: userId,
              role_id,
              company_id: scope_type === "SYSTEM" ? null : company_id,
              store_id: scope_type === "STORE" ? store_id : null,
              assigned_by: auditContext.userId,
            },
            include: {
              role: true,
              company: true,
              store: true,
            },
          });

          // If assigning a client role, ensure user's is_client_user flag is set
          if (isClientRole) {
            await tx.user.update({
              where: { user_id: userId },
              data: { is_client_user: true },
            });
          }

          return userRole;
        },
      );

      const userRole = result;

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
   * Hard delete user (permanently remove from database)
   * Cascades deletion to owned companies if user is a CLIENT_OWNER
   * @param userId - User UUID
   * @param auditContext - Audit context for logging
   * @returns Deleted user data (before deletion)
   * @throws Error if user not found or if user is ACTIVE
   */
  async deleteUser(
    userId: string,
    auditContext: AuditContext,
  ): Promise<UserWithRoles> {
    try {
      // Check if user exists and get full user data including owned companies
      const existingUser = await prisma.user.findUnique({
        where: { user_id: userId },
        include: {
          user_roles: {
            include: {
              role: true,
              company: true,
              store: true,
            },
          },
          owned_companies: {
            include: {
              stores: true,
            },
          },
        },
      });

      if (!existingUser) {
        throw new Error(`User with ID ${userId} not found`);
      }

      // Prevent deletion of ACTIVE users - they must be set to INACTIVE first
      if (existingUser.status === "ACTIVE") {
        throw new Error(
          "Cannot delete ACTIVE user. Set status to INACTIVE first.",
        );
      }

      // Check if user has CLIENT_OWNER role
      const hasClientOwnerRole = existingUser.user_roles.some(
        (ur: any) => ur.role?.code === "CLIENT_OWNER",
      );

      // If user owns companies, check if they can be deleted
      if (hasClientOwnerRole && existingUser.owned_companies.length > 0) {
        // Check for active companies
        const activeCompanies = existingUser.owned_companies.filter(
          (c: any) => c.status === "ACTIVE",
        );
        if (activeCompanies.length > 0) {
          const companyNames = activeCompanies
            .map((c: any) => c.name)
            .join(", ");
          throw new Error(
            `Cannot delete user with ${activeCompanies.length} active company/companies (${companyNames}). Deactivate all companies first.`,
          );
        }

        // Check for active stores under ANY owned company (even if company is inactive)
        const activeStores: Array<{ name: string; companyName: string }> = [];
        for (const company of existingUser.owned_companies) {
          const companyStores = company.stores || [];
          for (const store of companyStores) {
            if (store.status === "ACTIVE") {
              activeStores.push({
                name: store.name,
                companyName: company.name,
              });
            }
          }
        }

        if (activeStores.length > 0) {
          const storeList = activeStores
            .map((s) => `${s.name} (${s.companyName})`)
            .join(", ");
          throw new Error(
            `Cannot delete user with ${activeStores.length} active store(s): ${storeList}. Deactivate all stores first.`,
          );
        }
      }

      // Prepare user data for return (before deletion)
      const userData: UserWithRoles = {
        user_id: existingUser.user_id,
        email: existingUser.email,
        name: existingUser.name,
        status: existingUser.status as UserStatus,
        created_at: existingUser.created_at,
        updated_at: existingUser.updated_at,
        roles: existingUser.user_roles.map((ur: any) => ({
          user_role_id: ur.user_role_id,
          role: {
            role_id: ur.role.role_id,
            code: ur.role.code,
            description: ur.role.description,
            scope: ur.role.scope,
          },
          company_id: ur.company_id,
          company_name: ur.company?.name || null,
          store_id: ur.store_id,
          store_name: ur.store?.name || null,
          assigned_at: ur.assigned_at,
        })),
      };

      // Use transaction to delete user and cascade to owned companies
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // If user owns companies, delete them and their stores
        if (existingUser.owned_companies.length > 0) {
          for (const company of existingUser.owned_companies) {
            // Get store IDs for this company
            const storeIds = company.stores.map((s: any) => s.store_id);

            // Delete user roles for stores
            if (storeIds.length > 0) {
              await tx.userRole.deleteMany({
                where: { store_id: { in: storeIds } },
              });
            }

            // Delete user roles for company
            await tx.userRole.deleteMany({
              where: { company_id: company.company_id },
            });

            // Delete stores (cascade should handle this, but being explicit)
            await tx.store.deleteMany({
              where: { company_id: company.company_id },
            });
          }

          // Delete all owned companies
          await tx.company.deleteMany({
            where: { owner_user_id: userId },
          });
        }

        // Delete all remaining user roles for this user
        await tx.userRole.deleteMany({
          where: { user_id: userId },
        });

        // Hard delete the user
        await tx.user.delete({
          where: { user_id: userId },
        });
      });

      // Create audit log (non-blocking)
      try {
        const auditReason =
          existingUser.owned_companies.length > 0
            ? `User ${existingUser.email} and ${existingUser.owned_companies.length} owned company/companies permanently deleted by ${auditContext.userEmail}`
            : `User ${existingUser.email} permanently deleted by ${auditContext.userEmail}`;

        await prisma.auditLog.create({
          data: {
            user_id: auditContext.userId,
            action: "DELETE",
            table_name: "users",
            record_id: existingUser.user_id,
            old_values: existingUser as unknown as Record<string, any>,
            new_values: undefined,
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
            reason: auditReason,
          },
        });
      } catch (auditError) {
        // Log the audit failure but don't fail the deletion
        console.error(
          "Failed to create audit log for user deletion:",
          auditError,
        );
      }

      return userData;
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes("not found") ||
          error.message.includes("ACTIVE user") ||
          error.message.includes("active company") ||
          error.message.includes("active store"))
      ) {
        throw error;
      }
      console.error("Error deleting user:", error);
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
