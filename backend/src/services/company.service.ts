import { PrismaClient, Prisma } from "@prisma/client";
import {
  CreateCompanyInput,
  UpdateCompanyInput,
  CompanyListOptions,
  PaginatedCompanyResult,
  CompanyWithOwner,
  AuditContext,
} from "../types/company.types";
import { generatePublicId, PUBLIC_ID_PREFIXES } from "../utils/public-id";

const prisma = new PrismaClient();

/**
 * Company service for managing company CRUD operations
 * Handles company creation, retrieval, updates, and hard deletion
 */
export class CompanyService {
  /**
   * Validate that an owner user exists
   * @param ownerUserId - User UUID to validate
   * @throws Error if user does not exist
   */
  private async validateOwnerExists(ownerUserId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { user_id: ownerUserId },
    });

    if (!user) {
      throw new Error(`User with ID ${ownerUserId} not found`);
    }
  }

  /**
   * Create a new company
   * @param data - Company creation data
   * @param auditContext - Audit context for logging
   * @returns Created company record with owner information
   * @throws Error if validation fails or database error occurs
   */
  async createCompany(
    data: CreateCompanyInput,
    auditContext: AuditContext,
  ): Promise<CompanyWithOwner> {
    // Validate owner_user_id is provided
    if (!data.owner_user_id) {
      throw new Error("Owner user ID is required for company creation");
    }

    // Validate owner exists
    await this.validateOwnerExists(data.owner_user_id);

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

    // Validate address if provided
    if (data.address) {
      if (typeof data.address !== "string") {
        throw new Error("Address must be a string");
      }
      if (data.address.trim().length > 500) {
        throw new Error("Address cannot exceed 500 characters");
      }
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
          owner_user_id: data.owner_user_id,
          name: data.name.trim(),
          address: data.address ? data.address.trim() : null,
          status: data.status || "ACTIVE",
        },
        include: {
          owner: {
            select: {
              user_id: true,
              name: true,
              email: true,
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
            new_values: company as unknown as Record<string, any>,
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
        owner_user_id: company.owner_user_id,
        owner_name: company.owner?.name,
        owner_email: company.owner?.email,
        name: company.name,
        address: company.address,
        status: company.status,
        created_at: company.created_at,
        updated_at: company.updated_at,
        owner: company.owner,
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
   * @returns Company record with owner information
   * @throws Error if company not found
   */
  async getCompanyById(companyId: string): Promise<CompanyWithOwner> {
    try {
      const company = await prisma.company.findUnique({
        where: {
          company_id: companyId,
        },
        include: {
          owner: {
            select: {
              user_id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      if (!company) {
        throw new Error(`Company with ID ${companyId} not found`);
      }

      return {
        company_id: company.company_id,
        owner_user_id: company.owner_user_id,
        owner_name: company.owner?.name,
        owner_email: company.owner?.email,
        name: company.name,
        address: company.address,
        status: company.status,
        created_at: company.created_at,
        updated_at: company.updated_at,
        owner: company.owner,
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
   * @param options - List options (page, limit, status, ownerUserId, search)
   * @returns Paginated company results with owner information
   */
  async getCompanies(
    options: CompanyListOptions = {},
  ): Promise<PaginatedCompanyResult> {
    const { page = 1, limit = 20, status, ownerUserId, search } = options;

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    // Filter by status
    if (status) {
      where.status = status;
    }

    // Filter by owner_user_id
    if (ownerUserId) {
      where.owner_user_id = ownerUserId;
    }

    // Search by company name, owner name, or owner email (case-insensitive partial match)
    // Minimum 2 characters required for search - if search is provided but too short, return empty
    if (search !== undefined && search !== null) {
      const searchTerm = search.trim();
      if (searchTerm.length < 2) {
        // Return empty results for searches less than 2 characters
        return {
          data: [],
          meta: {
            page,
            limit,
            total: 0,
            totalPages: 0,
          },
        };
      }
      where.OR = [
        {
          name: {
            contains: searchTerm,
            mode: "insensitive",
          },
        },
        {
          owner: {
            name: {
              contains: searchTerm,
              mode: "insensitive",
            },
          },
        },
        {
          owner: {
            email: {
              contains: searchTerm,
              mode: "insensitive",
            },
          },
        },
      ];
    }

    try {
      const [companies, total] = await Promise.all([
        prisma.company.findMany({
          where,
          skip,
          take: limit,
          orderBy: { created_at: "desc" },
          include: {
            owner: {
              select: {
                user_id: true,
                name: true,
                email: true,
              },
            },
          },
        }),
        prisma.company.count({ where }),
      ]);

      const companiesWithOwner: CompanyWithOwner[] = companies.map(
        (company: any) => ({
          company_id: company.company_id,
          owner_user_id: company.owner_user_id,
          owner_name: company.owner?.name,
          owner_email: company.owner?.email,
          name: company.name,
          address: company.address,
          status: company.status,
          created_at: company.created_at,
          updated_at: company.updated_at,
          owner: company.owner,
        }),
      );

      return {
        data: companiesWithOwner,
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
   * @returns Updated company record with owner information
   * @throws Error if company not found or validation fails
   */
  async updateCompany(
    companyId: string,
    data: UpdateCompanyInput,
    auditContext: AuditContext,
  ): Promise<CompanyWithOwner> {
    // Validate name if provided
    if (data.name !== undefined && data.name.trim().length === 0) {
      throw new Error("Company name cannot be empty or whitespace");
    }

    // Check max length if name is being updated
    if (data.name !== undefined && data.name.trim().length > 255) {
      throw new Error("Company name cannot exceed 255 characters");
    }

    // Validate address if provided
    if (data.address !== undefined) {
      if (data.address !== null && typeof data.address !== "string") {
        throw new Error("Address must be a string or null");
      }
      if (data.address && data.address.trim().length > 500) {
        throw new Error("Address cannot exceed 500 characters");
      }
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
      // Check if company exists
      const existingCompany = await prisma.company.findUnique({
        where: {
          company_id: companyId,
        },
        include: {
          owner: {
            select: {
              user_id: true,
              name: true,
              email: true,
              status: true,
            },
          },
        },
      });

      if (!existingCompany) {
        throw new Error(`Company with ID ${companyId} not found`);
      }

      // Prevent activating a company if its owner is inactive
      if (
        data.status === "ACTIVE" &&
        existingCompany.status === "INACTIVE" &&
        existingCompany.owner &&
        existingCompany.owner.status === "INACTIVE"
      ) {
        throw new Error(
          "Cannot activate company because its owner is inactive. Please activate the owner first.",
        );
      }

      // Prepare update data
      const updateData: any = {};
      if (data.name !== undefined) {
        updateData.name = data.name.trim();
      }
      if (data.address !== undefined) {
        updateData.address = data.address ? data.address.trim() : null;
      }
      if (data.status !== undefined) {
        updateData.status = data.status;
      }
      // Note: owner_user_id is immutable - cannot be changed after creation

      const company = await prisma.company.update({
        where: {
          company_id: companyId,
        },
        data: updateData,
        include: {
          owner: {
            select: {
              user_id: true,
              name: true,
              email: true,
              status: true,
            },
          },
        },
      });

      // Create audit log entry (non-blocking)
      try {
        await prisma.auditLog.create({
          data: {
            user_id: auditContext.userId,
            action: "UPDATE",
            table_name: "companies",
            record_id: company.company_id,
            old_values: existingCompany as unknown as Record<string, any>,
            new_values: company as unknown as Record<string, any>,
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
        owner_user_id: company.owner_user_id,
        owner_name: company.owner?.name,
        owner_email: company.owner?.email,
        name: company.name,
        address: company.address,
        status: company.status,
        created_at: company.created_at,
        updated_at: company.updated_at,
        owner: company.owner,
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
   * Hard delete company and all associated data
   * Permanently removes company, stores, and user roles under this company
   * @param companyId - Company UUID
   * @param auditContext - Audit context for logging
   * @throws Error if company not found or if company is ACTIVE
   */
  async deleteCompany(
    companyId: string,
    auditContext: AuditContext,
  ): Promise<void> {
    try {
      // Check if company exists
      const existingCompany = await prisma.company.findUnique({
        where: {
          company_id: companyId,
        },
        include: {
          owner: {
            select: {
              user_id: true,
              name: true,
              email: true,
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

      // Check for active stores - cannot delete company with active stores
      const activeStoresCount = await prisma.store.count({
        where: {
          company_id: companyId,
          status: "ACTIVE",
        },
      });

      if (activeStoresCount > 0) {
        throw new Error(
          `Cannot delete company with ${activeStoresCount} active store(s). Deactivate all stores first.`,
        );
      }

      // Use transaction to hard delete company, stores, and user roles
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Get all stores for this company to delete their user roles
        const stores = await tx.store.findMany({
          where: { company_id: companyId },
          select: { store_id: true },
        });
        const storeIds = stores.map((s: any) => s.store_id);

        // Delete all UserRoles associated with stores under this company
        if (storeIds.length > 0) {
          await tx.userRole.deleteMany({
            where: {
              store_id: { in: storeIds },
            },
          });
        }

        // Delete all UserRoles associated with this company (company-level roles)
        await tx.userRole.deleteMany({
          where: {
            company_id: companyId,
          },
        });

        // Delete all stores under this company
        await tx.store.deleteMany({
          where: {
            company_id: companyId,
          },
        });

        // Delete the company
        await tx.company.delete({
          where: { company_id: companyId },
        });
      });

      // Create audit log entry (non-blocking - don't fail the deletion if audit fails)
      try {
        await prisma.auditLog.create({
          data: {
            user_id: auditContext.userId,
            action: "DELETE",
            table_name: "companies",
            record_id: companyId,
            old_values: existingCompany as unknown as Record<string, any>,
            new_values: {} as any,
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
            reason: `Company permanently deleted by ${auditContext.userEmail} (roles: ${auditContext.userRoles.join(", ")})`,
          },
        });
      } catch (auditError) {
        // Log the audit failure but don't fail the deletion operation
        console.error(
          "Failed to create audit log for company deletion:",
          auditError,
        );
      }
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.message.includes("not found") ||
          error.message.includes("ACTIVE company") ||
          error.message.includes("active store"))
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
