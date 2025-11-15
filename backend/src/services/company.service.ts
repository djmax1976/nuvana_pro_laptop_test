import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Company status enum values
 */
export type CompanyStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING";

/**
 * Company creation input
 */
export interface CreateCompanyInput {
  name: string;
  status?: CompanyStatus;
}

/**
 * Company update input
 */
export interface UpdateCompanyInput {
  name?: string;
  status?: CompanyStatus;
}

/**
 * Company service for managing company CRUD operations
 * Handles company creation, retrieval, updates, and soft deletion
 */
export class CompanyService {
  /**
   * Create a new company
   * @param data - Company creation data
   * @returns Created company record
   * @throws Error if validation fails or database error occurs
   */
  async createCompany(data: CreateCompanyInput) {
    // Validate input
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
          name: data.name.trim(),
          status: data.status || "ACTIVE",
        },
      });

      return company;
    } catch (error: any) {
      console.error("Error creating company:", error);
      throw error;
    }
  }

  /**
   * Get company by ID
   * @param companyId - Company UUID
   * @returns Company record
   * @throws Error if company not found
   */
  async getCompanyById(companyId: string) {
    try {
      const company = await prisma.company.findUnique({
        where: {
          company_id: companyId,
        },
      });

      if (!company) {
        throw new Error(`Company with ID ${companyId} not found`);
      }

      return company;
    } catch (error: any) {
      if (error.message.includes("not found")) {
        throw error;
      }
      console.error("Error retrieving company:", error);
      throw error;
    }
  }

  /**
   * Get all companies (System Admin only)
   * @returns Array of all companies
   */
  async getAllCompanies() {
    try {
      const companies = await prisma.company.findMany({
        orderBy: {
          created_at: "desc",
        },
      });

      return companies;
    } catch (error: any) {
      console.error("Error retrieving companies:", error);
      throw error;
    }
  }

  /**
   * Update company
   * @param companyId - Company UUID
   * @param data - Company update data
   * @returns Updated company record
   * @throws Error if company not found or validation fails
   */
  async updateCompany(companyId: string, data: UpdateCompanyInput) {
    // Validate input
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

    try {
      // Check if company exists
      const existingCompany = await prisma.company.findUnique({
        where: {
          company_id: companyId,
        },
      });

      if (!existingCompany) {
        throw new Error(`Company with ID ${companyId} not found`);
      }

      // Prepare update data
      const updateData: any = {};
      if (data.name !== undefined) {
        updateData.name = data.name.trim();
      }
      if (data.status !== undefined) {
        updateData.status = data.status;
      }

      const company = await prisma.company.update({
        where: {
          company_id: companyId,
        },
        data: updateData,
      });

      return company;
    } catch (error: any) {
      if (error.message.includes("not found")) {
        throw error;
      }
      console.error("Error updating company:", error);
      throw error;
    }
  }

  /**
   * Soft delete company (set status to INACTIVE)
   * @param companyId - Company UUID
   * @returns Updated company record with INACTIVE status
   * @throws Error if company not found or if company is ACTIVE
   */
  async deleteCompany(companyId: string) {
    try {
      // Check if company exists
      const existingCompany = await prisma.company.findUnique({
        where: {
          company_id: companyId,
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

      // Soft delete by setting status to INACTIVE
      const company = await prisma.company.update({
        where: {
          company_id: companyId,
        },
        data: {
          status: "INACTIVE",
        },
      });

      return company;
    } catch (error: any) {
      if (
        error.message.includes("not found") ||
        error.message.includes("ACTIVE company")
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
