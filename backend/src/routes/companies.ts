import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/permission.middleware";
import {
  COMPANY_CREATE,
  COMPANY_READ,
  COMPANY_UPDATE,
  COMPANY_DELETE,
} from "../constants/permissions";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Company management routes
 * Provides CRUD operations for companies with RBAC enforcement
 * Only System Admins can manage companies (multi-tenant foundation)
 */
export async function companyRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/companies
   * Create a new company
   * Protected route - requires COMPANY_CREATE permission (System Admin only)
   */
  fastify.post(
    "/api/companies",
    { preHandler: [authMiddleware, requirePermission(COMPANY_CREATE)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as {
          name?: string;
          status?: string;
        };
        const user = (request as any).user as UserIdentity;

        // Validate required fields
        if (!body.name || body.name.trim() === "") {
          reply.code(400);
          return {
            error: "Validation error",
            message: "Company name is required and cannot be empty",
          };
        }

        // Validate status if provided
        const validStatuses = ["ACTIVE", "INACTIVE", "SUSPENDED"];
        if (body.status && !validStatuses.includes(body.status)) {
          reply.code(400);
          return {
            error: "Validation error",
            message: "Status must be one of: ACTIVE, INACTIVE, SUSPENDED",
          };
        }

        // Create company
        const company = await prisma.company.create({
          data: {
            name: body.name.trim(),
            status:
              (body.status as "ACTIVE" | "INACTIVE" | "SUSPENDED") || "ACTIVE",
          },
        });

        // Create audit log entry
        await prisma.auditLog.create({
          data: {
            user_id: user.id,
            action: "CREATE",
            table_name: "companies",
            record_id: company.company_id,
            new_values: company as any,
            ip_address: request.ip,
            user_agent: request.headers["user-agent"],
          },
        });

        reply.code(201);
        return company;
      } catch (error: any) {
        fastify.log.error({ error }, "Error creating company");
        reply.code(500);
        return {
          error: "Internal server error",
          message: "Failed to create company",
        };
      }
    },
  );

  /**
   * GET /api/companies
   * List all companies
   * Protected route - requires COMPANY_READ permission (System Admin only)
   */
  fastify.get(
    "/api/companies",
    { preHandler: [authMiddleware, requirePermission(COMPANY_READ)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = request.query as {
          status?: string;
        };

        // Build where clause
        const where: any = {};
        if (query.status) {
          where.status = query.status;
        }

        // Fetch all companies
        const companies = await prisma.company.findMany({
          where,
          orderBy: { created_at: "desc" },
        });

        reply.code(200);
        return companies;
      } catch (error) {
        fastify.log.error({ error }, "Error fetching companies");
        reply.code(500);
        return {
          error: "Internal server error",
          message: "Failed to fetch companies",
        };
      }
    },
  );

  /**
   * GET /api/companies/:id
   * Get a specific company by ID
   * Protected route - requires COMPANY_READ permission (System Admin only)
   */
  fastify.get(
    "/api/companies/:id",
    { preHandler: [authMiddleware, requirePermission(COMPANY_READ)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const params = request.params as { id: string };

        // Validate UUID format
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(params.id)) {
          reply.code(400);
          return {
            error: "Validation error",
            message: "Invalid company ID format",
          };
        }

        const company = await prisma.company.findUnique({
          where: { company_id: params.id },
        });

        if (!company) {
          reply.code(404);
          return {
            error: "Company not found",
            message: "Company with the specified ID does not exist",
          };
        }

        reply.code(200);
        return company;
      } catch (error) {
        fastify.log.error({ error }, "Error fetching company");
        reply.code(500);
        return {
          error: "Internal server error",
          message: "Failed to fetch company",
        };
      }
    },
  );

  /**
   * PUT /api/companies/:id
   * Update a company by ID
   * Protected route - requires COMPANY_UPDATE permission (System Admin only)
   */
  fastify.put(
    "/api/companies/:id",
    { preHandler: [authMiddleware, requirePermission(COMPANY_UPDATE)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const params = request.params as { id: string };
        const body = request.body as {
          name?: string;
          status?: string;
        };
        const user = (request as any).user as UserIdentity;

        // Validate UUID format
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(params.id)) {
          reply.code(400);
          return {
            error: "Validation error",
            message: "Invalid company ID format",
          };
        }

        // Check if company exists
        const existingCompany = await prisma.company.findUnique({
          where: { company_id: params.id },
        });

        if (!existingCompany) {
          reply.code(404);
          return {
            error: "Company not found",
            message: "Company with the specified ID does not exist",
          };
        }

        // Validate status if provided
        const validStatuses = ["ACTIVE", "INACTIVE", "SUSPENDED"];
        if (body.status && !validStatuses.includes(body.status)) {
          reply.code(400);
          return {
            error: "Validation error",
            message: "Status must be one of: ACTIVE, INACTIVE, SUSPENDED",
          };
        }

        // Build update data
        const updateData: any = {};
        if (body.name !== undefined) {
          if (body.name.trim() === "") {
            reply.code(400);
            return {
              error: "Validation error",
              message: "Company name cannot be empty",
            };
          }
          updateData.name = body.name.trim();
        }
        if (body.status) {
          updateData.status = body.status;
        }

        // Update company
        const updatedCompany = await prisma.company.update({
          where: { company_id: params.id },
          data: updateData,
        });

        // Create audit log entry
        await prisma.auditLog.create({
          data: {
            user_id: user.id,
            action: "UPDATE",
            table_name: "companies",
            record_id: updatedCompany.company_id,
            old_values: existingCompany as any,
            new_values: updatedCompany as any,
            ip_address: request.ip,
            user_agent: request.headers["user-agent"],
          },
        });

        reply.code(200);
        return updatedCompany;
      } catch (error) {
        fastify.log.error({ error }, "Error updating company");
        reply.code(500);
        return {
          error: "Internal server error",
          message: "Failed to update company",
        };
      }
    },
  );

  /**
   * DELETE /api/companies/:id
   * Soft delete a company by ID (updates status to INACTIVE or DELETED)
   * Protected route - requires COMPANY_DELETE permission (System Admin only)
   */
  fastify.delete(
    "/api/companies/:id",
    { preHandler: [authMiddleware, requirePermission(COMPANY_DELETE)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const params = request.params as { id: string };
        const user = (request as any).user as UserIdentity;

        // Validate UUID format
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(params.id)) {
          reply.code(400);
          return {
            error: "Validation error",
            message: "Invalid company ID format",
          };
        }

        // Check if company exists
        const company = await prisma.company.findUnique({
          where: { company_id: params.id },
        });

        if (!company) {
          reply.code(404);
          return {
            error: "Company not found",
            message: "Company with the specified ID does not exist",
          };
        }

        // Soft delete - update status to INACTIVE
        const deletedCompany = await prisma.company.update({
          where: { company_id: params.id },
          data: { status: "INACTIVE" },
        });

        // Create audit log entry
        await prisma.auditLog.create({
          data: {
            user_id: user.id,
            action: "DELETE",
            table_name: "companies",
            record_id: deletedCompany.company_id,
            old_values: company as any,
            new_values: deletedCompany as any,
            ip_address: request.ip,
            user_agent: request.headers["user-agent"],
          },
        });

        reply.code(200);
        return deletedCompany;
      } catch (error) {
        fastify.log.error({ error }, "Error deleting company");
        reply.code(500);
        return {
          error: "Internal server error",
          message: "Failed to delete company",
        };
      }
    },
  );
}
