import { PrismaClient, Prisma } from "@prisma/client";
import {
  CreateCompanyInput,
  UpdateCompanyInput,
  CompanyListOptions,
  PaginatedCompanyResult,
  CompanyWithClient,
  AuditContext,
} from "../types/company.types";
import { generatePublicId, PUBLIC_ID_PREFIXES } from "../utils/public-id";

const prisma = new PrismaClient();

/**
 * Company service for managing company CRUD operations
 * Handles company creation, retrieval, updates, and soft deletion
 */
export class CompanyService {
  /**
   * Validate that a client exists
   * @param clientId - Client UUID to validate
   * @throws Error if client does not exist or is deleted
   */
  private async validateClientExists(clientId: string): Promise<void> {
    const client = await prisma.client.findUnique({
      where: { client_id: clientId },
    });

    if (!client) {
      throw new Error(`Client with ID ${clientId} not found`);
    }

    if (client.deleted_at) {
      throw new Error(`Client with ID ${clientId} has been deleted`);
    }
  }

  /**
   * Create a new company
   * @param data - Company creation data
   * @param auditContext - Audit context for logging
   * @returns Created company record with client information
   * @throws Error if validation fails or database error occurs
   */
  async createCompany(
    data: CreateCompanyInput,
    auditContext: AuditContext,
  ): Promise<CompanyWithClient> {
    // Validate client_id is provided
    if (!data.client_id) {
      throw new Error("Client ID is required for company creation");
    }

    // Validate client exists
    await this.validateClientExists(data.client_id);

    // Validate name
    if (!data.name || data.name.trim().length === 0) {
      throw new Error(
        "Company name is required and cannot be empty or whitespace",
      );
    }

    // Reject whitespace-only names
    if (data.name.trim() !== data.name.replace(/\s+/g, " ").trim()) {
      throw new Error("Company name cannot contain excessive whitespace");
    }

    // Check max length (255 chars)
    if (data.name.trim().length > 255) {
      throw new Error("Company name cannot exceed 255 characters");
    }

    if (
      data.status &&
      !["ACTIVE", "INACTIVE", "SUSPENDED", "PENDING"].includes(data.status)
    ) {
      throw new Error(
        "Invalid status. Must be ACTIVE, INACTIVE, SUSPENDED, or PENDING",
      );
    }

    try {
      const company = await prisma.company.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
          client_id: data.client_id,
          name: data.name.trim(),
          status: data.status || "ACTIVE",
        },
        include: {
          client: {
            select: {
              client_id: true,
              name: true,
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
            table_name: "companies",
            record_id: company.company_id,
            new_values: company as unknown as Prisma.InputJsonValue,
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
            reason: `Company created by ${auditContext.userEmail} (roles: ${auditContext.userRoles.join(", ")})`,
          },
        });
      } catch (auditError) {
        // Log the audit failure but don't fail the creation operation
        console.error(
          "Failed to create audit log for company creation:",
          auditError,
        );
      }

      return {
        company_id: company.company_id,
        client_id: company.client_id,
        client_name: company.client?.name,
        name: company.name,
        status: company.status,
        created_at: company.created_at,
        updated_at: company.updated_at,
        deleted_at: company.deleted_at,
        client: company.client,
      };
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("not found")) {
        throw error;
      }
      console.error("Error creating company:", error);
      throw error;
    }
  }

  /**
   * Get company by ID
   * @param companyId - Company UUID
   * @returns Company record with client information
   * @throws Error if company not found
   */
  async getCompanyById(companyId: string): Promise<CompanyWithClient> {
    try {
      const company = await prisma.company.findUnique({
        where: {
          company_id: companyId,
        },
        include: {
          client: {
            select: {
              client_id: true,
              name: true,
            },
          },
        },
      });

      if (!company) {
        throw new Error(`Company with ID ${companyId} not found`);
      }

      return {
        company_id: company.company_id,
        client_id: company.client_id,
        client_name: company.client?.name,
        name: company.name,
        status: company.status,
        created_at: company.created_at,
        updated_at: company.updated_at,
        deleted_at: company.deleted_at,
        client: company.client,
      };
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("not found")) {
        throw error;
      }
      console.error("Error retrieving company:", error);
      throw error;
    }
  }

  /**
   * Get companies with pagination and filtering
   * @param options - List options (page, limit, status, clientId)
   * @returns Paginated company results with client information
   */
  async getCompanies(
    options: CompanyListOptions = {},
  ): Promise<PaginatedCompanyResult> {
    const { page = 1, limit = 20, status, clientId } = options;

    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.CompanyWhereInput = {};

    // Filter by status
    if (status) {
      where.status = status;
    }

    // Filter by client_id
    if (clientId) {
      where.client_id = clientId;
    }

    try {
      const [companies, total] = await Promise.all([
        prisma.company.findMany({
          where,
          skip,
          take: limit,
          orderBy: { created_at: "desc" },
          include: {
            client: {
              select: {
                client_id: true,
                name: true,
              },
            },
          },
        }),
        prisma.company.count({ where }),
      ]);

      const companiesWithClient: CompanyWithClient[] = companies.map(
        (company) => ({
          company_id: company.company_id,
          client_id: company.client_id,
          client_name: company.client?.name,
          name: company.name,
          status: company.status,
          created_at: company.created_at,
          updated_at: company.updated_at,
          deleted_at: company.deleted_at,
          client: company.client,
        }),
      );

      return {
        data: companiesWithClient,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error("Error retrieving companies:", error);
      throw error;
    }
  }

  /**
   * Update company
   * @param companyId - Company UUID
   * @param data - Company update data
   * @param auditContext - Audit context for logging
   * @returns Updated company record with client information
   * @throws Error if company not found or validation fails
   */
  async updateCompany(
    companyId: string,
    data: UpdateCompanyInput,
    auditContext: AuditContext,
  ): Promise<CompanyWithClient> {
    // Validate name if provided
    if (data.name !== undefined && data.name.trim().length === 0) {
      throw new Error("Company name cannot be empty or whitespace");
    }

    // Check max length if name is being updated
    if (data.name !== undefined && data.name.trim().length > 255) {
      throw new Error("Company name cannot exceed 255 characters");
    }

    if (
      data.status &&
      !["ACTIVE", "INACTIVE", "SUSPENDED", "PENDING"].includes(data.status)
    ) {
      throw new Error(
        "Invalid status. Must be ACTIVE, INACTIVE, SUSPENDED, or PENDING",
      );
    }

    // Validate client_id if provided
    if (data.client_id) {
      await this.validateClientExists(data.client_id);
    }

    try {
      // Check if company exists
      const existingCompany = await prisma.company.findUnique({
        where: {
          company_id: companyId,
        },
        include: {
          client: {
            select: {
              client_id: true,
              name: true,
            },
          },
        },
      });

      if (!existingCompany) {
        throw new Error(`Company with ID ${companyId} not found`);
      }

      // Prepare update data
      const updateData: Prisma.CompanyUpdateInput = {};
      if (data.name !== undefined) {
        updateData.name = data.name.trim();
      }
      if (data.status !== undefined) {
        updateData.status = data.status;
      }
      if (data.client_id !== undefined) {
        updateData.client = {
          connect: { client_id: data.client_id },
        };
      }

      const company = await prisma.company.update({
        where: {
          company_id: companyId,
        },
        data: updateData,
        include: {
          client: {
            select: {
              client_id: true,
              name: true,
            },
          },
        },
      });

      // Create audit log entry with old and new client_id (non-blocking)
      try {
        await prisma.auditLog.create({
          data: {
            user_id: auditContext.userId,
            action: "UPDATE",
            table_name: "companies",
            record_id: company.company_id,
            old_values: existingCompany as unknown as Prisma.InputJsonValue,
            new_values: company as unknown as Prisma.InputJsonValue,
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
            reason: `Company updated by ${auditContext.userEmail} (roles: ${auditContext.userRoles.join(", ")})`,
          },
        });
      } catch (auditError) {
        // Log the audit failure but don't fail the update operation
        console.error(
          "Failed to create audit log for company update:",
          auditError,
        );
      }

      return {
        company_id: company.company_id,
        client_id: company.client_id,
        client_name: company.client?.name,
        name: company.name,
        status: company.status,
        created_at: company.created_at,
        updated_at: company.updated_at,
        deleted_at: company.deleted_at,
        client: company.client,
      };
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("not found")) {
        throw error;
      }
      console.error("Error updating company:", error);
      throw error;
    }
  }

  /**
   * Soft delete company (set status to INACTIVE and deleted_at timestamp)
   * Cascades to all stores and user roles under this company
   * @param companyId - Company UUID
   * @param auditContext - Audit context for logging
   * @returns Updated company record with INACTIVE status
   * @throws Error if company not found or if company is ACTIVE
   */
  async deleteCompany(
    companyId: string,
    auditContext: AuditContext,
  ): Promise<CompanyWithClient> {
    try {
      // Check if company exists
      const existingCompany = await prisma.company.findUnique({
        where: {
          company_id: companyId,
        },
        include: {
          client: {
            select: {
              client_id: true,
              name: true,
            },
          },
        },
      });

      if (!existingCompany) {
        throw new Error(`Company with ID ${companyId} not found`);
      }

      // Prevent deletion of ACTIVE companies - they must be set to INACTIVE first
      if (existingCompany.status === "ACTIVE") {
        throw new Error(
          "Cannot delete ACTIVE company. Set status to INACTIVE first.",
        );
      }

      // Soft delete by setting status to INACTIVE and deleted_at timestamp
      const deletedAt = new Date();

      // Use transaction to cascade soft delete to stores and user roles
      await prisma.$transaction(async (tx) => {
        // Cascade soft delete to all stores under this company
        await tx.store.updateMany({
          where: {
            company_id: companyId,
            deleted_at: null,
          },
          data: {
            deleted_at: deletedAt,
            status: "INACTIVE",
          },
        });

        // Cascade soft delete to all UserRoles associated with this company
        // This includes company-level and store-level roles
        await tx.userRole.updateMany({
          where: {
            company_id: companyId,
            deleted_at: null,
          },
          data: {
            status: "INACTIVE",
            deleted_at: deletedAt,
          },
        });
      });

      const company = await prisma.company.update({
        where: {
          company_id: companyId,
        },
        data: {
          status: "INACTIVE",
          deleted_at: deletedAt,
        },
        include: {
          client: {
            select: {
              client_id: true,
              name: true,
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
            table_name: "companies",
            record_id: company.company_id,
            old_values: existingCompany as unknown as Prisma.InputJsonValue,
            new_values: company as unknown as Prisma.InputJsonValue,
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
            reason: `Company soft deleted by ${auditContext.userEmail} (roles: ${auditContext.userRoles.join(", ")})`,
          },
        });
      } catch (auditError) {
        // Log the audit failure but don't fail the deletion operation
        console.error(
          "Failed to create audit log for company deletion:",
          auditError,
        );
      }

      return {
        company_id: company.company_id,
        client_id: company.client_id,
        client_name: company.client?.name,
        name: company.name,
        status: company.status,
        created_at: company.created_at,
        updated_at: company.updated_at,
        deleted_at: company.deleted_at,
        client: company.client,
      };
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.message.includes("not found") ||
          error.message.includes("ACTIVE company"))
      ) {
        throw error;
      }
      console.error("Error deleting company:", error);
      throw error;
    }
  }
}

// Export singleton instance
export const companyService = new CompanyService();
