import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { permissionMiddleware } from "../middleware/permission.middleware";
import { PERMISSIONS } from "../constants/permissions";
import { companyService } from "../services/company.service";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Company management routes
 * Provides CRUD operations for companies with RBAC enforcement
 * All routes require ADMIN_SYSTEM_CONFIG permission
 */
export async function companyRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/companies
   * Create a new company
   * Protected route - requires ADMIN_SYSTEM_CONFIG permission
   */
  fastify.post(
    "/api/companies",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
      schema: {
        description: "Create a new company",
        tags: ["companies"],
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name: {
              type: "string",
              minLength: 1,
              maxLength: 255,
              description: "Company name",
            },
            status: {
              type: "string",
              enum: ["ACTIVE", "INACTIVE", "SUSPENDED", "PENDING"],
              description: "Company status (defaults to ACTIVE)",
            },
          },
        },
        response: {
          201: {
            type: "object",
            properties: {
              company_id: { type: "string", format: "uuid" },
              name: { type: "string" },
              status: { type: "string" },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
            },
          },
          400: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
          500: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as {
          name: string;
          status?: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING";
        };
        const user = (request as any).user as UserIdentity;

        // Create company (with validation from service)
        const company = await companyService.createCompany({
          name: body.name,
          status: body.status,
        });

        // Log company creation to AuditLog (BLOCKING - if this fails, we should handle it)
        const ipAddress =
          (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
          request.ip ||
          request.socket.remoteAddress ||
          null;
        const userAgent = request.headers["user-agent"] || null;

        try {
          await prisma.auditLog.create({
            data: {
              user_id: user.id,
              action: "CREATE",
              table_name: "companies",
              record_id: company.company_id,
              new_values: company as any,
              ip_address: ipAddress,
              user_agent: userAgent,
              reason: `Company created by ${user.email} (roles: ${user.roles.join(", ")})`,
            },
          });
        } catch (auditError) {
          // If audit log fails, delete the company and fail the request
          await prisma.company.delete({
            where: { company_id: company.company_id },
          });
          throw new Error("Failed to create audit log - operation rolled back");
        }

        reply.code(201);
        return {
          ...company,
          request_metadata: {
            timestamp: new Date().toISOString(),
            request_id: request.id,
          },
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error creating company");
        if (
          error.message.includes("required") ||
          error.message.includes("Invalid")
        ) {
          reply.code(400);
          return {
            error: "Validation error",
            message: error.message,
          };
        }
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
   * List all companies with pagination (System Admin only)
   * Protected route - requires ADMIN_SYSTEM_CONFIG permission
   * Query params: page (default 1), limit (default 20, max 100), status (optional filter)
   */
  fastify.get(
    "/api/companies",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
      schema: {
        description: "List all companies with pagination",
        tags: ["companies"],
        querystring: {
          type: "object",
          properties: {
            page: {
              type: "integer",
              minimum: 1,
              default: 1,
              description: "Page number (1-based)",
            },
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 100,
              default: 20,
              description: "Items per page (max 100)",
            },
            status: {
              type: "string",
              enum: ["ACTIVE", "INACTIVE", "SUSPENDED", "PENDING"],
              description: "Filter by status",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    company_id: { type: "string", format: "uuid" },
                    name: { type: "string" },
                    status: { type: "string" },
                    created_at: { type: "string", format: "date-time" },
                    updated_at: { type: "string", format: "date-time" },
                  },
                },
              },
              meta: {
                type: "object",
                properties: {
                  page: { type: "integer" },
                  limit: { type: "integer" },
                  total_items: { type: "integer" },
                  total_pages: { type: "integer" },
                  has_next_page: { type: "boolean" },
                  has_previous_page: { type: "boolean" },
                },
              },
              request_metadata: {
                type: "object",
                properties: {
                  timestamp: { type: "string", format: "date-time" },
                  request_id: { type: "string" },
                  response_time_ms: { type: "number" },
                },
              },
            },
          },
          500: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const startTime = Date.now();
      try {
        const query = request.query as {
          page?: number;
          limit?: number;
          status?: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING";
        };

        const page = query.page || 1;
        const limit = Math.min(query.limit || 20, 100);
        const skip = (page - 1) * limit;

        // Build filter
        const where: any = {};
        if (query.status) {
          where.status = query.status;
        }

        // Get total count
        const totalItems = await prisma.company.count({ where });

        // Get paginated data
        const companies = await prisma.company.findMany({
          where,
          skip,
          take: limit,
          orderBy: {
            created_at: "desc",
          },
        });

        const totalPages = Math.ceil(totalItems / limit);
        const responseTime = Date.now() - startTime;

        reply.code(200);
        return {
          data: companies,
          meta: {
            page,
            limit,
            total_items: totalItems,
            total_pages: totalPages,
            has_next_page: page < totalPages,
            has_previous_page: page > 1,
          },
          request_metadata: {
            timestamp: new Date().toISOString(),
            request_id: request.id,
            response_time_ms: responseTime,
          },
        };
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
   * GET /api/companies/:companyId
   * Get company by ID
   * Protected route - requires ADMIN_SYSTEM_CONFIG permission
   */
  fastify.get(
    "/api/companies/:companyId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
      schema: {
        description: "Get company by ID",
        tags: ["companies"],
        params: {
          type: "object",
          required: ["companyId"],
          properties: {
            companyId: {
              type: "string",
              format: "uuid",
              description: "Company UUID",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              company_id: { type: "string", format: "uuid" },
              name: { type: "string" },
              status: { type: "string" },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
            },
          },
          404: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
          500: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const params = request.params as { companyId: string };
        const company = await companyService.getCompanyById(params.companyId);

        reply.code(200);
        return {
          ...company,
          request_metadata: {
            timestamp: new Date().toISOString(),
            request_id: request.id,
          },
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error fetching company");
        if (error.message.includes("not found")) {
          reply.code(404);
          return {
            error: "Company not found",
            message: error.message,
          };
        }
        reply.code(500);
        return {
          error: "Internal server error",
          message: "Failed to fetch company",
        };
      }
    },
  );

  /**
   * PUT /api/companies/:companyId
   * Update company
   * Protected route - requires ADMIN_SYSTEM_CONFIG permission
   */
  fastify.put(
    "/api/companies/:companyId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
      schema: {
        description: "Update company",
        tags: ["companies"],
        params: {
          type: "object",
          required: ["companyId"],
          properties: {
            companyId: {
              type: "string",
              format: "uuid",
              description: "Company UUID",
            },
          },
        },
        body: {
          type: "object",
          properties: {
            name: {
              type: "string",
              minLength: 1,
              maxLength: 255,
              description: "Company name",
            },
            status: {
              type: "string",
              enum: ["ACTIVE", "INACTIVE", "SUSPENDED", "PENDING"],
              description: "Company status",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              company_id: { type: "string", format: "uuid" },
              name: { type: "string" },
              status: { type: "string" },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
            },
          },
          400: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
          404: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
          500: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const params = request.params as { companyId: string };
        const body = request.body as {
          name?: string;
          status?: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING";
          last_updated_at?: string;
        };
        const user = (request as any).user as UserIdentity;

        // Get old values before update
        const oldCompany = await companyService.getCompanyById(
          params.companyId,
        );

        // Check for concurrent modification if last_updated_at is provided
        if (body.last_updated_at) {
          const clientLastUpdated = new Date(body.last_updated_at);
          const serverLastUpdated = new Date(oldCompany.updated_at);

          if (serverLastUpdated > clientLastUpdated) {
            // Check recent audit logs for concurrent updates
            const recentUpdates = await prisma.auditLog.findMany({
              where: {
                table_name: "companies",
                record_id: params.companyId,
                action: "UPDATE",
                timestamp: {
                  gt: clientLastUpdated,
                },
              },
              include: {
                user: {
                  select: {
                    email: true,
                    user_id: true,
                  },
                },
              },
              orderBy: {
                timestamp: "desc",
              },
              take: 5,
            });

            reply.code(409);
            return {
              error: "Concurrent modification detected",
              message:
                "This company was modified by another user after you loaded it. Please review the changes and try again.",
              conflict_details: {
                your_last_fetch: body.last_updated_at,
                current_server_version: oldCompany.updated_at,
                current_data: oldCompany,
                recent_modifications: recentUpdates.map((log) => ({
                  modified_by: log.user?.email || "Unknown",
                  modified_at: log.timestamp,
                  changes: log.new_values,
                })),
              },
            };
          }
        }

        const company = await companyService.updateCompany(params.companyId, {
          name: body.name,
          status: body.status,
        });

        // Log company update to AuditLog (BLOCKING)
        const ipAddress =
          (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
          request.ip ||
          request.socket.remoteAddress ||
          null;
        const userAgent = request.headers["user-agent"] || null;

        try {
          await prisma.auditLog.create({
            data: {
              user_id: user.id,
              action: "UPDATE",
              table_name: "companies",
              record_id: company.company_id,
              old_values: oldCompany as any,
              new_values: company as any,
              ip_address: ipAddress,
              user_agent: userAgent,
              reason: `Company updated by ${user.email} (roles: ${user.roles.join(", ")})`,
            },
          });
        } catch (auditError) {
          // If audit log fails, revert the update and fail the request
          await companyService.updateCompany(params.companyId, {
            name: oldCompany.name,
            status: oldCompany.status as any,
          });
          throw new Error("Failed to create audit log - operation rolled back");
        }

        reply.code(200);
        return {
          ...company,
          request_metadata: {
            timestamp: new Date().toISOString(),
            request_id: request.id,
          },
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error updating company");
        if (error.message.includes("not found")) {
          reply.code(404);
          return {
            error: "Company not found",
            message: error.message,
          };
        }
        if (
          error.message.includes("cannot be empty") ||
          error.message.includes("Invalid")
        ) {
          reply.code(400);
          return {
            error: "Validation error",
            message: error.message,
          };
        }
        reply.code(500);
        return {
          error: "Internal server error",
          message: "Failed to update company",
        };
      }
    },
  );

  /**
   * DELETE /api/companies/:companyId
   * Soft delete company (set status to INACTIVE)
   * Protected route - requires ADMIN_SYSTEM_CONFIG permission
   */
  fastify.delete(
    "/api/companies/:companyId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
      schema: {
        description: "Soft delete company",
        tags: ["companies"],
        params: {
          type: "object",
          required: ["companyId"],
          properties: {
            companyId: {
              type: "string",
              format: "uuid",
              description: "Company UUID",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              company_id: { type: "string", format: "uuid" },
              name: { type: "string" },
              status: { type: "string" },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
            },
          },
          404: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
          500: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const params = request.params as { companyId: string };
        const user = (request as any).user as UserIdentity;

        // Get old values before soft delete
        const oldCompany = await companyService.getCompanyById(
          params.companyId,
        );

        const company = await companyService.deleteCompany(params.companyId);

        // Log company deletion to AuditLog (BLOCKING)
        const ipAddress =
          (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
          request.ip ||
          request.socket.remoteAddress ||
          null;
        const userAgent = request.headers["user-agent"] || null;

        try {
          await prisma.auditLog.create({
            data: {
              user_id: user.id,
              action: "DELETE",
              table_name: "companies",
              record_id: company.company_id,
              old_values: oldCompany as any,
              new_values: company as any,
              ip_address: ipAddress,
              user_agent: userAgent,
              reason: `Company deleted by ${user.email} (roles: ${user.roles.join(", ")})`,
            },
          });
        } catch (auditError) {
          // If audit log fails, revert the soft delete and fail the request
          await companyService.updateCompany(params.companyId, {
            status: oldCompany.status as any,
          });
          throw new Error("Failed to create audit log - operation rolled back");
        }

        reply.code(200);
        return {
          ...company,
          request_metadata: {
            timestamp: new Date().toISOString(),
            request_id: request.id,
          },
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error deleting company");
        if (error.message.includes("not found")) {
          reply.code(404);
          return {
            error: "Company not found",
            message: error.message,
          };
        }
        if (error.message.includes("ACTIVE company")) {
          reply.code(400);
          return {
            error: "Cannot delete ACTIVE company",
            message: error.message,
          };
        }
        reply.code(500);
        return {
          error: "Internal server error",
          message: "Failed to delete company",
        };
      }
    },
  );
}
