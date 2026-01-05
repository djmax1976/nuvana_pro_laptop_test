import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { permissionMiddleware } from "../middleware/permission.middleware";
import { PERMISSIONS } from "../constants/permissions";
import { companyService } from "../services/company.service";
import { AuditContext } from "../types/company.types";

/**
 * Company management routes
 * Provides CRUD operations for companies with RBAC enforcement
 * All routes require ADMIN_SYSTEM_CONFIG permission
 *
 * NOTE: Companies are now created through the user creation flow when
 * CLIENT_OWNER role is assigned. Direct company creation via POST is disabled.
 */
export async function companyRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/companies
   * List all companies with pagination (System Admin only)
   * Protected route - requires ADMIN_SYSTEM_CONFIG permission
   * Query params: page (default 1), limit (default 20, max 100), status (optional filter), ownerUserId (optional filter), search (optional filter by name)
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
            ownerUserId: {
              type: "string",
              format: "uuid",
              description: "Filter by owner user UUID",
            },
            search: {
              type: "string",
              description:
                "Search by company name (case-insensitive partial match)",
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
                    owner_user_id: { type: "string", format: "uuid" },
                    owner_name: { type: "string" },
                    owner_email: { type: "string" },
                    name: { type: "string" },
                    address: { type: "string", nullable: true },
                    // Structured address fields
                    address_line1: { type: "string", nullable: true },
                    address_line2: { type: "string", nullable: true },
                    city: { type: "string", nullable: true },
                    state_id: {
                      type: "string",
                      format: "uuid",
                      nullable: true,
                    },
                    county_id: {
                      type: "string",
                      format: "uuid",
                      nullable: true,
                    },
                    zip_code: { type: "string", nullable: true },
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
                  total: { type: "integer" },
                  totalPages: { type: "integer" },
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
          ownerUserId?: string;
          search?: string;
        };

        const page = query.page || 1;
        const limit = Math.min(query.limit || 20, 100);

        // Get paginated data using service
        const result = await companyService.getCompanies({
          page,
          limit,
          status: query.status,
          ownerUserId: query.ownerUserId,
          search: query.search,
        });

        const responseTime = Date.now() - startTime;

        reply.code(200);
        return {
          data: result.data,
          meta: result.meta,
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
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to fetch companies",
          },
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
              owner_user_id: { type: "string", format: "uuid" },
              owner_name: { type: "string" },
              owner_email: { type: "string" },
              name: { type: "string" },
              address: { type: "string", nullable: true },
              // Structured address fields
              address_line1: { type: "string", nullable: true },
              address_line2: { type: "string", nullable: true },
              city: { type: "string", nullable: true },
              state_id: { type: "string", format: "uuid", nullable: true },
              county_id: { type: "string", format: "uuid", nullable: true },
              zip_code: { type: "string", nullable: true },
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
            success: false,
            error: {
              code: "NOT_FOUND",
              message: error.message || "Company not found",
            },
          };
        }
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to fetch company",
          },
        };
      }
    },
  );

  /**
   * PUT /api/companies/:companyId
   * Update company (name, address, status only - owner cannot be changed)
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
            address: {
              type: "string",
              maxLength: 500,
              description:
                "Company address (DEPRECATED - use structured fields)",
            },
            status: {
              type: "string",
              enum: ["ACTIVE", "INACTIVE", "SUSPENDED", "PENDING"],
              description: "Company status",
            },
            // === Structured Address Fields ===
            address_line1: {
              type: "string",
              maxLength: 255,
              description: "Street address line 1 (e.g., '123 Main Street')",
            },
            address_line2: {
              type: ["string", "null"],
              maxLength: 255,
              description: "Street address line 2 (e.g., 'Suite 100')",
            },
            city: {
              type: "string",
              maxLength: 100,
              description: "City name",
            },
            state_id: {
              type: "string",
              format: "uuid",
              description: "State UUID - determines lottery game visibility",
            },
            county_id: {
              type: "string",
              format: "uuid",
              description: "County UUID - for tax jurisdiction",
            },
            zip_code: {
              type: "string",
              pattern: "^[0-9]{5}(-[0-9]{4})?$",
              description: "ZIP code (5-digit or ZIP+4 format)",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              company_id: { type: "string", format: "uuid" },
              owner_user_id: { type: "string", format: "uuid" },
              owner_name: { type: "string" },
              owner_email: { type: "string" },
              name: { type: "string" },
              address: { type: "string", nullable: true },
              // Structured address fields in response
              address_line1: { type: ["string", "null"] },
              address_line2: { type: ["string", "null"] },
              city: { type: ["string", "null"] },
              state_id: { type: ["string", "null"], format: "uuid" },
              county_id: { type: ["string", "null"], format: "uuid" },
              zip_code: { type: ["string", "null"] },
              state: {
                type: ["object", "null"],
                properties: {
                  state_id: { type: "string", format: "uuid" },
                  code: { type: "string" },
                  name: { type: "string" },
                },
              },
              county: {
                type: ["object", "null"],
                properties: {
                  county_id: { type: "string", format: "uuid" },
                  name: { type: "string" },
                },
              },
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
          address?: string;
          status?: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING";
          // Structured address fields
          address_line1?: string;
          address_line2?: string | null;
          city?: string;
          state_id?: string;
          county_id?: string;
          zip_code?: string;
        };
        const user = (request as any).user as UserIdentity;

        // Build audit context
        const auditContext: AuditContext = {
          userId: user.id,
          userEmail: user.email,
          userRoles: user.roles,
          ipAddress:
            (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
            request.ip ||
            request.socket.remoteAddress ||
            null,
          userAgent: request.headers["user-agent"] || null,
        };

        const company = await companyService.updateCompany(
          params.companyId,
          {
            name: body.name,
            address: body.address,
            status: body.status,
            // Structured address fields
            address_line1: body.address_line1,
            address_line2: body.address_line2,
            city: body.city,
            state_id: body.state_id,
            county_id: body.county_id,
            zip_code: body.zip_code,
          },
          auditContext,
        );

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
            success: false,
            error: {
              code: "NOT_FOUND",
              message: error.message || "Company not found",
            },
          };
        }
        if (
          error.message.includes("cannot be empty") ||
          error.message.includes("Invalid") ||
          error.message.includes("Cannot activate")
        ) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: error.message,
            },
          };
        }
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to update company",
          },
        };
      }
    },
  );

  /**
   * DELETE /api/companies/:companyId
   * Hard delete company - permanently removes the company
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
        description: "Permanently delete company",
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
              success: { type: "boolean" },
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
        const user = (request as any).user as UserIdentity;

        // Build audit context
        const auditContext: AuditContext = {
          userId: user.id,
          userEmail: user.email,
          userRoles: user.roles,
          ipAddress:
            (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
            request.ip ||
            request.socket.remoteAddress ||
            null,
          userAgent: request.headers["user-agent"] || null,
        };

        await companyService.deleteCompany(params.companyId, auditContext);

        reply.code(200);
        return {
          success: true,
          message: "Company permanently deleted",
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error deleting company");
        if (error.message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: error.message || "Company not found",
            },
          };
        }
        if (error.message.includes("ACTIVE company")) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: error.message,
            },
          };
        }
        if (error.message.includes("active store")) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: error.message,
            },
          };
        }
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to delete company",
          },
        };
      }
    },
  );
}
