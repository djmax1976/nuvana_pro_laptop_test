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
 * Client service for managing client CRUD operations
 * Handles client creation, retrieval, updates, and soft deletion
 * with audit logging for compliance
 */
export class ClientService {
  /**
   * Create a new client
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

    // Validate status if provided
    if (data.status && !["ACTIVE", "INACTIVE"].includes(data.status)) {
      throw new Error("Invalid status. Must be ACTIVE or INACTIVE");
    }

    try {
      // Hash password if provided
      let passwordHash: string | null = null;
      if (data.password) {
        const saltRounds = 10;
        passwordHash = await bcrypt.hash(data.password, saltRounds);
      }

      const client = await prisma.client.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.CLIENT),
          name: data.name.trim(),
          email: data.email.trim(),
          password_hash: passwordHash,
          status: data.status || ClientStatus.ACTIVE,
          metadata: data.metadata
            ? (data.metadata as Prisma.InputJsonValue)
            : Prisma.JsonNull,
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

      // Create audit log entry (non-blocking - don't fail the creation if audit fails)
      try {
        await prisma.auditLog.create({
          data: {
            user_id: auditContext.userId,
            action: "CREATE",
            table_name: "clients",
            record_id: client.client_id,
            new_values: client as unknown as Prisma.JsonObject,
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
            reason: `Client created by ${auditContext.userEmail} (roles: ${auditContext.userRoles.join(", ")})`,
          },
        });
      } catch (auditError) {
        // Log the audit failure but don't fail the creation operation
        console.error(
          "Failed to create audit log for client creation:",
          auditError,
        );
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
   * Update client
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
        },
      });

      if (!existingClient || existingClient.deleted_at) {
        throw new Error(`Client with ID ${clientId} not found`);
      }

      // Prepare update data
      const updateData: Prisma.ClientUpdateInput = {};
      if (data.name !== undefined) {
        updateData.name = data.name.trim();
      }
      if (data.email !== undefined) {
        updateData.email = data.email.trim();
      }
      if (data.password) {
        // Hash password if provided
        const saltRounds = 10;
        updateData.password_hash = await bcrypt.hash(data.password, saltRounds);
      }
      if (data.status !== undefined) {
        updateData.status = data.status;
      }
      if (data.metadata !== undefined) {
        updateData.metadata = data.metadata as Prisma.InputJsonValue;
      }

      const client = await prisma.client.update({
        where: { client_id: clientId },
        data: updateData,
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

      // Create audit log entry (non-blocking - don't fail the update if audit fails)
      try {
        await prisma.auditLog.create({
          data: {
            user_id: auditContext.userId,
            action: "UPDATE",
            table_name: "clients",
            record_id: client.client_id,
            old_values: existingClient as unknown as Prisma.JsonObject,
            new_values: client as unknown as Prisma.JsonObject,
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
            reason: `Client updated by ${auditContext.userEmail} (roles: ${auditContext.userRoles.join(", ")})`,
          },
        });
      } catch (auditError) {
        // Log the audit failure but don't fail the update operation
        console.error(
          "Failed to create audit log for client update:",
          auditError,
        );
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
      console.error("Error updating client:", error);
      throw error;
    }
  }

  /**
   * Soft delete client (set deleted_at timestamp)
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

      // Soft delete by setting deleted_at timestamp
      const deletedAt = new Date();

      // Cascade soft delete to associated companies
      await prisma.company.updateMany({
        where: {
          client_id: clientId,
          deleted_at: null,
        },
        data: {
          deleted_at: deletedAt,
          status: "INACTIVE",
        },
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
      try {
        await prisma.auditLog.create({
          data: {
            user_id: auditContext.userId,
            action: "DELETE",
            table_name: "clients",
            record_id: client.client_id,
            old_values: existingClient as unknown as Prisma.JsonObject,
            new_values: client as unknown as Prisma.JsonObject,
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
            reason: `Client soft deleted by ${auditContext.userEmail} (roles: ${auditContext.userRoles.join(", ")})`,
          },
        });
      } catch (auditError) {
        // Log the audit failure but don't fail the deletion operation
        console.error(
          "Failed to create audit log for client deletion:",
          auditError,
        );
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
