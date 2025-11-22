import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcrypt";
import {
  ClientStatus,
  CreateClientInput,
  UpdateClientInput,
  ClientListOptions,
  PaginatedClientResult,
  ClientWithCompanyCount,
} from "../types/client.types";
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
 * Helper function to safely create audit log entry
 * Only creates audit log if the user exists in the database
 * @param auditContext - Audit context with user information
 * @param action - Action performed (CREATE, UPDATE, DELETE)
 * @param tableName - Table name
 * @param recordId - Record ID
 * @param oldValues - Old values (for UPDATE/DELETE)
 * @param newValues - New values (for CREATE/UPDATE)
 */
async function createAuditLogSafely(
  auditContext: AuditContext,
  action: string,
  tableName: string,
  recordId: string,
  oldValues?: Prisma.InputJsonValue,
  newValues?: Prisma.InputJsonValue,
): Promise<void> {
  try {
    if (auditContext.userId) {
      const assigningUser = await prisma.user.findUnique({
        where: { user_id: auditContext.userId },
        select: { user_id: true },
      });

      if (assigningUser) {
        await prisma.auditLog.create({
          data: {
            user_id: auditContext.userId,
            action,
            table_name: tableName,
            record_id: recordId,
            old_values: oldValues ?? Prisma.DbNull,
            new_values: newValues ?? Prisma.DbNull,
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
            reason: `${action} by ${auditContext.userEmail} (roles: ${auditContext.userRoles.join(", ")})`,
          },
        });
      } else {
        console.warn(
          `Skipping audit log: user ${auditContext.userId} not found`,
        );
      }
    } else {
      console.warn("Skipping audit log: no userId in audit context");
    }
  } catch (auditError) {
    console.error(`Failed to create audit log for ${action}:`, auditError);
    if (process.env.NODE_ENV === "test") {
      console.warn(
        `Audit log creation failed (non-blocking): ${
          auditError instanceof Error ? auditError.message : "Unknown error"
        }`,
      );
    }
  }
}

/**
 * Client service for managing client CRUD operations
 * Handles client creation, retrieval, updates, and soft deletion
 * with audit logging for compliance
 */
export class ClientService {
  /**
   * Create a new client with unified authentication
   * Creates User (for auth) + Client (for business data) + UserRole link
   * @param data - Client creation data
   * @param auditContext - Audit context for logging
   * @returns Created client record
   * @throws Error if validation fails or database error occurs
   */
  async createClient(
    data: CreateClientInput,
    auditContext: AuditContext,
  ): Promise<ClientWithCompanyCount> {
    // Validate name
    if (!data.name || data.name.trim().length === 0) {
      throw new Error("Client name is required and cannot be empty");
    }

    if (data.name.trim().length > 255) {
      throw new Error("Client name cannot exceed 255 characters");
    }

    // Validate email
    if (!data.email || data.email.trim().length === 0) {
      throw new Error("Client email is required and cannot be empty");
    }

    if (data.email.trim().length > 255) {
      throw new Error("Client email cannot exceed 255 characters");
    }

    // Validate password (required for client authentication)
    if (!data.password || data.password.trim().length === 0) {
      throw new Error("Password is required for client authentication");
    }

    if (data.password.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }

    // Validate status if provided
    if (data.status && !["ACTIVE", "INACTIVE"].includes(data.status)) {
      throw new Error("Invalid status. Must be ACTIVE or INACTIVE");
    }

    try {
      // Hash password for User table (authentication)
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(data.password, saltRounds);

      // Get CLIENT_OWNER role
      const clientOwnerRole = await prisma.role.findUnique({
        where: { code: "CLIENT_OWNER" },
      });

      if (!clientOwnerRole) {
        throw new Error(
          "CLIENT_OWNER role not found. Please run RBAC seed script.",
        );
      }

      // Verify that the assigning user exists in database (before transaction)
      let assignedBy: string | null = null;
      if (auditContext.userId) {
        const assigningUser = await prisma.user.findUnique({
          where: { user_id: auditContext.userId },
          select: { user_id: true },
        });
        assignedBy = assigningUser ? auditContext.userId : null;
      }

      // Use transaction to create User + Client + UserRole atomically
      const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // 1. Create User record (for authentication)
        const user = await tx.user.create({
          data: {
            public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
            email: data.email.trim().toLowerCase(),
            name: data.name.trim(),
            password_hash: passwordHash,
            status: data.status || ClientStatus.ACTIVE,
          },
        });

        // 2. Create Client record (for business data)
        const client = await tx.client.create({
          data: {
            public_id: generatePublicId(PUBLIC_ID_PREFIXES.CLIENT),
            name: data.name.trim(),
            email: data.email.trim().toLowerCase(),
            status: data.status || ClientStatus.ACTIVE,
            metadata: data.metadata
              ? (data.metadata as Prisma.InputJsonValue)
              : Prisma.DbNull,
          },
          include: {
            _count: {
              select: { companies: true },
            },
            companies: {
              where: {
                deleted_at: null,
              },
              select: {
                company_id: true,
                public_id: true,
                name: true,
              },
              orderBy: {
                name: "asc",
              },
            },
          },
        });

        // 3. Link User to Client with CLIENT_OWNER role
        await tx.userRole.create({
          data: {
            user_id: user.user_id,
            role_id: clientOwnerRole.role_id,
            client_id: client.client_id,
            assigned_by: assignedBy,
          },
        });

        return { user, client };
      });

      const { client } = result;

      // Create audit log entry (non-blocking - don't fail the creation if audit fails)
      await createAuditLogSafely(
        auditContext,
        "CREATE",
        "clients",
        client.client_id,
        undefined,
        client as unknown as Prisma.InputJsonValue,
      );

      return {
        client_id: client.client_id,
        public_id: client.public_id,
        name: client.name,
        email: client.email,
        status: client.status as ClientStatus,
        metadata: client.metadata as Record<string, unknown> | null,
        created_at: client.created_at,
        updated_at: client.updated_at,
        deleted_at: client.deleted_at,
        companyCount: client._count.companies,
        companies: client.companies,
      };
    } catch (error) {
      console.error("Error creating client:", error);
      throw error;
    }
  }

  /**
   * Get clients with pagination and filtering
   * @param options - List options (page, limit, search, status)
   * @returns Paginated client results
   */
  async getClients(
    options: ClientListOptions = {},
  ): Promise<PaginatedClientResult> {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      includeDeleted = false,
    } = options;

    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.ClientWhereInput = {};

    // Exclude soft-deleted by default
    if (!includeDeleted) {
      where.deleted_at = null;
    }

    // Filter by status
    if (status) {
      where.status = status;
    }

    // Search by name
    if (search) {
      where.name = {
        contains: search,
        mode: "insensitive",
      };
    }

    try {
      const [clients, total] = await Promise.all([
        prisma.client.findMany({
          where,
          skip,
          take: limit,
          orderBy: { created_at: "desc" },
          include: {
            _count: {
              select: { companies: true },
            },
            companies: {
              where: {
                deleted_at: null,
              },
              select: {
                company_id: true,
                public_id: true,
                name: true,
              },
              orderBy: {
                name: "asc",
              },
            },
          },
        }),
        prisma.client.count({ where }),
      ]);

      const clientsWithCount: ClientWithCompanyCount[] = clients.map(
        (client) => ({
          client_id: client.client_id,
          public_id: client.public_id,
          name: client.name,
          email: client.email,
          status: client.status as ClientStatus,
          metadata: client.metadata as Record<string, unknown> | null,
          created_at: client.created_at,
          updated_at: client.updated_at,
          deleted_at: client.deleted_at,
          companyCount: client._count.companies,
          companies: client.companies,
        }),
      );

      return {
        data: clientsWithCount,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error("Error retrieving clients:", error);
      throw error;
    }
  }

  /**
   * Get client by ID with company count
   * @param clientId - Client UUID
   * @returns Client record with company count
   * @throws Error if client not found
   */
  async getClientById(clientId: string): Promise<ClientWithCompanyCount> {
    try {
      const client = await prisma.client.findUnique({
        where: {
          client_id: clientId,
        },
        include: {
          _count: {
            select: { companies: true },
          },
          companies: {
            where: {
              deleted_at: null,
            },
            select: {
              company_id: true,
              public_id: true,
              name: true,
            },
            orderBy: {
              name: "asc",
            },
          },
        },
      });

      if (!client) {
        throw new Error(`Client with ID ${clientId} not found`);
      }

      // Don't return soft-deleted clients
      if (client.deleted_at) {
        throw new Error(`Client with ID ${clientId} not found`);
      }

      return {
        client_id: client.client_id,
        public_id: client.public_id,
        name: client.name,
        email: client.email,
        status: client.status as ClientStatus,
        metadata: client.metadata as Record<string, unknown> | null,
        created_at: client.created_at,
        updated_at: client.updated_at,
        deleted_at: client.deleted_at,
        companyCount: client._count.companies,
        companies: client.companies,
      };
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("not found")) {
        throw error;
      }
      console.error("Error retrieving client:", error);
      throw error;
    }
  }

  /**
   * Update client and associated user
   * Updates both User (auth) and Client (business data) records
   * @param clientId - Client UUID
   * @param data - Client update data
   * @param auditContext - Audit context for logging
   * @returns Updated client record
   * @throws Error if client not found or validation fails
   */
  async updateClient(
    clientId: string,
    data: UpdateClientInput,
    auditContext: AuditContext,
  ): Promise<ClientWithCompanyCount> {
    // Validate name if provided
    if (data.name !== undefined && data.name.trim().length === 0) {
      throw new Error("Client name cannot be empty");
    }

    if (data.name !== undefined && data.name.trim().length > 255) {
      throw new Error("Client name cannot exceed 255 characters");
    }

    // Validate email if provided
    if (data.email !== undefined && data.email.trim().length === 0) {
      throw new Error("Client email cannot be empty");
    }

    if (data.email !== undefined && data.email.trim().length > 255) {
      throw new Error("Client email cannot exceed 255 characters");
    }

    // Validate password if provided
    if (data.password !== undefined && data.password.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }

    // Validate status if provided
    if (data.status && !["ACTIVE", "INACTIVE"].includes(data.status)) {
      throw new Error("Invalid status. Must be ACTIVE or INACTIVE");
    }

    try {
      // Check if client exists and is not deleted
      const existingClient = await prisma.client.findUnique({
        where: { client_id: clientId },
        include: {
          _count: {
            select: { companies: true },
          },
          companies: {
            where: {
              deleted_at: null,
            },
            select: {
              company_id: true,
              public_id: true,
              name: true,
            },
            orderBy: {
              name: "asc",
            },
          },
          user_roles: {
            include: {
              user: true,
            },
          },
        },
      });

      if (!existingClient || existingClient.deleted_at) {
        throw new Error(`Client with ID ${clientId} not found`);
      }

      // Find the associated user via UserRole
      const userRole = existingClient.user_roles.find(
        (ur: any) => ur.client_id === clientId,
      );
      if (!userRole) {
        throw new Error(
          `User account not found for client ${clientId}. Data integrity issue.`,
        );
      }

      const userId = userRole.user_id;

      // Use transaction to update both User and Client atomically
      const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Prepare User update data
        const userUpdateData: Prisma.UserUpdateInput = {};
        if (data.name !== undefined) {
          userUpdateData.name = data.name.trim();
        }
        if (data.email !== undefined) {
          userUpdateData.email = data.email.trim().toLowerCase();
        }
        if (data.password) {
          const saltRounds = 10;
          userUpdateData.password_hash = await bcrypt.hash(
            data.password,
            saltRounds,
          );
        }
        if (data.status !== undefined) {
          userUpdateData.status = data.status;
        }

        // Update User (authentication data)
        if (Object.keys(userUpdateData).length > 0) {
          await tx.user.update({
            where: { user_id: userId },
            data: userUpdateData,
          });
        }

        // Prepare Client update data
        const clientUpdateData: Prisma.ClientUpdateInput = {};
        if (data.name !== undefined) {
          clientUpdateData.name = data.name.trim();
        }
        if (data.email !== undefined) {
          clientUpdateData.email = data.email.trim().toLowerCase();
        }
        if (data.status !== undefined) {
          clientUpdateData.status = data.status;
        }
        if (data.metadata !== undefined) {
          clientUpdateData.metadata = data.metadata as Prisma.InputJsonValue;
        }

        // Update Client (business data)
        const client = await tx.client.update({
          where: { client_id: clientId },
          data: clientUpdateData,
          include: {
            _count: {
              select: { companies: true },
            },
            companies: {
              where: {
                deleted_at: null,
              },
              select: {
                company_id: true,
                public_id: true,
                name: true,
              },
              orderBy: {
                name: "asc",
              },
            },
          },
        });

        return client;
      });

      const client = result;

      // Create audit log entry (non-blocking - don't fail the update if audit fails)
      await createAuditLogSafely(
        auditContext,
        "UPDATE",
        "clients",
        client.client_id,
        existingClient as unknown as Prisma.InputJsonValue,
        client as unknown as Prisma.InputJsonValue,
      );

      return {
        client_id: client.client_id,
        public_id: client.public_id,
        name: client.name,
        email: client.email,
        status: client.status as ClientStatus,
        metadata: client.metadata as Record<string, unknown> | null,
        created_at: client.created_at,
        updated_at: client.updated_at,
        deleted_at: client.deleted_at,
        companyCount: client._count.companies,
        companies: client.companies,
      };
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("not found")) {
        throw error;
      }
      console.error("Error updating client:", error);
      throw error;
    }
  }

  /**
   * Soft delete client and associated user (set deleted_at timestamp)
   * Also deactivates the associated User account
   * @param clientId - Client UUID
   * @param auditContext - Audit context for logging
   * @returns Updated client record with deleted_at set
   * @throws Error if client not found or if client is ACTIVE
   */
  async softDeleteClient(
    clientId: string,
    auditContext: AuditContext,
  ): Promise<ClientWithCompanyCount> {
    try {
      // Check if client exists and is not already deleted
      const existingClient = await prisma.client.findUnique({
        where: { client_id: clientId },
        include: {
          _count: {
            select: { companies: true },
          },
          companies: {
            where: {
              deleted_at: null,
            },
            select: {
              company_id: true,
              public_id: true,
              name: true,
            },
            orderBy: {
              name: "asc",
            },
          },
          user_roles: {
            include: {
              user: true,
            },
          },
        },
      });

      if (!existingClient || existingClient.deleted_at) {
        throw new Error(`Client with ID ${clientId} not found`);
      }

      // Prevent deletion of ACTIVE clients
      if (existingClient.status === "ACTIVE") {
        throw new Error(
          "Cannot delete ACTIVE client. Set status to INACTIVE first.",
        );
      }

      // Find the associated user via UserRole (may not exist for test data)
      const userRole = existingClient.user_roles.find(
        (ur: any) => ur.client_id === clientId,
      );
      const userId = userRole?.user_id;

      // Soft delete by setting deleted_at timestamp
      const deletedAt = new Date();

      // Use transaction to soft delete Client, User, Companies, Stores, and UserRoles atomically
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Deactivate the associated User account (if exists)
        if (userId) {
          await tx.user.update({
            where: { user_id: userId },
            data: { status: "INACTIVE" },
          });
        }

        // Get all companies for this client
        const companies = await tx.company.findMany({
          where: {
            client_id: clientId,
            deleted_at: null,
          },
          select: { company_id: true },
        });

        const companyIds = companies.map((c: any) => c.company_id);

        // Cascade soft delete to associated companies
        await tx.company.updateMany({
          where: {
            client_id: clientId,
            deleted_at: null,
          },
          data: {
            deleted_at: deletedAt,
            status: "INACTIVE",
          },
        });

        // Cascade soft delete to all stores under those companies
        if (companyIds.length > 0) {
          await tx.store.updateMany({
            where: {
              company_id: { in: companyIds },
              deleted_at: null,
            },
            data: {
              deleted_at: deletedAt,
              status: "INACTIVE",
            },
          });
        }

        // Cascade soft delete to all UserRoles associated with this client hierarchy
        // This includes roles at client, company, and store levels
        await tx.userRole.updateMany({
          where: {
            client_id: clientId,
            deleted_at: null,
          },
          data: {
            status: "INACTIVE",
            deleted_at: deletedAt,
          },
        });
      });

      const client = await prisma.client.update({
        where: { client_id: clientId },
        data: {
          deleted_at: deletedAt,
        },
        include: {
          _count: {
            select: { companies: true },
          },
          companies: {
            where: {
              deleted_at: null,
            },
            select: {
              company_id: true,
              public_id: true,
              name: true,
            },
            orderBy: {
              name: "asc",
            },
          },
        },
      });

      // Create audit log entry (non-blocking - don't fail the deletion if audit fails)
      await createAuditLogSafely(
        auditContext,
        "DELETE",
        "clients",
        client.client_id,
        existingClient as unknown as Prisma.InputJsonValue,
        client as unknown as Prisma.InputJsonValue,
      );

      return {
        client_id: client.client_id,
        public_id: client.public_id,
        name: client.name,
        email: client.email,
        status: client.status as ClientStatus,
        metadata: client.metadata as Record<string, unknown> | null,
        created_at: client.created_at,
        updated_at: client.updated_at,
        deleted_at: client.deleted_at,
        companyCount: client._count.companies,
        companies: client.companies,
      };
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.message.includes("not found") ||
          error.message.includes("ACTIVE client"))
      ) {
        throw error;
      }
      console.error("Error deleting client:", error);
      throw error;
    }
  }
}

// Export singleton instance
export const clientService = new ClientService();
