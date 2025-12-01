import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { permissionMiddleware } from "../middleware/permission.middleware";
import { PERMISSIONS } from "../constants/permissions";
import { storeService } from "../services/store.service";
import { rbacService } from "../services/rbac.service";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

/**
 * Validate IANA timezone using Intl.DateTimeFormat
 * This validates that the timezone is an actual valid IANA timezone,
 * not just a format that looks valid.
 * @param timezone - Timezone string to validate
 * @returns true if valid IANA timezone
 */
function isValidIANATimezone(timezone: string): boolean {
  // Limit to reasonable length to prevent abuse
  if (!timezone || timezone.length > 50) {
    return false;
  }

  // Use Intl.DateTimeFormat to validate actual timezone existence
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Helper function to extract user's company_id from their roles
 * @param userId - User ID
 * @returns Company ID if user has COMPANY or STORE scope role, null otherwise
 */
async function getUserCompanyId(userId: string): Promise<string | null> {
  const userRoles = await rbacService.getUserRoles(userId);

  // Find COMPANY scope role first
  const companyRole = userRoles.find(
    (role) => role.scope === "COMPANY" && role.company_id,
  );
  if (companyRole) {
    return companyRole.company_id;
  }

  // If no COMPANY role, check for STORE scope role and get company_id from the store
  const storeRole = userRoles.find(
    (role) => role.scope === "STORE" && role.store_id && role.company_id,
  );
  if (storeRole) {
    return storeRole.company_id;
  }

  // Check for SYSTEM scope (can access all companies)
  const systemRole = userRoles.find((role) => role.scope === "SYSTEM");
  if (systemRole) {
    // System admins don't have a specific company, return null
    // They should be handled separately with permission checks
    return null;
  }

  return null;
}

/**
 * Store management routes
 * Provides CRUD operations for stores with RBAC enforcement
 * All routes require STORE_* permissions and enforce company isolation
 */
export async function storeRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/stores
   * List all stores (System Admin only)
   * Protected route - requires STORE_READ permission and SYSTEM scope
   */
  fastify.get(
    "/api/stores",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.STORE_READ),
      ],
      schema: {
        description: "List all stores (System Admin only)",
        tags: ["stores"],
        querystring: {
          type: "object",
          properties: {
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 100,
              default: 20,
              description: "Items per page (max 100)",
            },
            offset: {
              type: "integer",
              minimum: 0,
              default: 0,
              description: "Pagination offset",
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
                    store_id: { type: "string", format: "uuid" },
                    company_id: { type: "string", format: "uuid" },
                    name: { type: "string" },
                    location_json: {
                      type: "object",
                      additionalProperties: true,
                    },
                    timezone: { type: "string" },
                    status: { type: "string" },
                    created_at: { type: "string", format: "date-time" },
                    updated_at: { type: "string", format: "date-time" },
                    company: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                      },
                    },
                  },
                },
              },
              meta: {
                type: "object",
                properties: {
                  total: { type: "integer" },
                  limit: { type: "integer" },
                  offset: { type: "integer" },
                },
              },
            },
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
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
        const user = (request as any).user as UserIdentity;
        const query = request.query as { limit?: number; offset?: number };

        // Check if user has SYSTEM scope (System Admin)
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        if (!hasSystemScope) {
          // Log permission denial to audit_logs
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
                action: "PERMISSION_DENIED",
                table_name: "api_route",
                record_id: crypto.randomUUID(),
                reason: `Permission denied: STORE_READ for resource: GET /api/stores - Only System Administrators can view all stores`,
                ip_address: ipAddress,
                user_agent: userAgent,
              },
            });
          } catch (auditError) {
            // Log error but don't fail the request
            fastify.log.error(
              { error: auditError },
              "Failed to log permission denial",
            );
          }

          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: "Only System Administrators can view all stores",
            },
          };
        }

        const limit = query.limit || 20;
        const offset = query.offset || 0;

        // Get all stores with company info
        // Use deterministic ordering: created_at desc, then store_id desc as tiebreaker
        // This ensures pagination is stable even when stores have identical created_at timestamps
        const [stores, total] = await Promise.all([
          prisma.store.findMany({
            skip: offset,
            take: limit,
            orderBy: [{ created_at: "desc" }, { store_id: "desc" }],
            include: {
              company: {
                select: {
                  name: true,
                },
              },
            },
          }),
          prisma.store.count(),
        ]);

        reply.code(200);
        return {
          data: stores,
          meta: {
            total,
            limit,
            offset,
          },
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error retrieving all stores");
        reply.code(500);
        return {
          error: "Internal server error",
          message: "Failed to retrieve stores",
        };
      }
    },
  );

  /**
   * POST /api/companies/:companyId/stores
   * Create a new store
   * Protected route - requires STORE_CREATE permission
   */
  fastify.post(
    "/api/companies/:companyId/stores",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.STORE_CREATE),
      ],
      schema: {
        description: "Create a new store",
        tags: ["stores"],
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
          required: ["name"],
          properties: {
            name: {
              type: "string",
              minLength: 1,
              maxLength: 255,
              description: "Store name",
            },
            location_json: {
              type: "object",
              properties: {
                address: {
                  type: "string",
                  description: "Store address",
                },
              },
              description: "Store location (address only)",
            },
            timezone: {
              type: "string",
              description:
                "IANA timezone format (e.g., America/New_York, Europe/London) - validated by service layer",
              default: "America/New_York",
            },
            status: {
              type: "string",
              enum: ["ACTIVE", "INACTIVE", "CLOSED"],
              description: "Store status (defaults to ACTIVE)",
            },
          },
        },
        response: {
          201: {
            type: "object",
            properties: {
              store_id: { type: "string", format: "uuid" },
              company_id: { type: "string", format: "uuid" },
              name: { type: "string" },
              location_json: {
                type: "object",
                additionalProperties: true,
              },
              timezone: { type: "string" },
              status: { type: "string" },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
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
          name: string;
          location_json?: {
            address?: string;
          };
          timezone?: string;
          status?: "ACTIVE" | "INACTIVE" | "CLOSED";
        };
        const user = (request as any).user as UserIdentity;

        // Verify user can create stores for this company (company isolation)
        // System Admins (SYSTEM scope) can create stores for ANY company
        // Company Admins (COMPANY scope) can only create stores for their assigned company
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        if (!hasSystemScope) {
          // Non-system admin: must create store for their assigned company only
          const userCompanyId = await getUserCompanyId(user.id);
          if (!userCompanyId || userCompanyId !== params.companyId) {
            // Log permission denial to audit_logs
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
                  action: "PERMISSION_DENIED",
                  table_name: "api_route",
                  record_id: crypto.randomUUID(),
                  reason: `Permission denied: STORE_CREATE for resource: POST /api/companies/${params.companyId}/stores - Company isolation violation: attempted to create store for different company`,
                  ip_address: ipAddress,
                  user_agent: userAgent,
                },
              });
            } catch (auditError) {
              // Log error but don't fail the request
              fastify.log.error(
                { error: auditError },
                "Failed to log permission denial",
              );
            }

            reply.code(403);
            return {
              success: false,
              error: {
                code: "PERMISSION_DENIED",
                message: "You can only create stores for your assigned company",
              },
            };
          }
        }
        // System admins bypass company isolation - they can create stores for any company

        // Validate location_json.address if provided
        if (body.location_json?.address !== undefined) {
          // Ensure address is a string
          if (typeof body.location_json.address !== "string") {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "location_json.address must be a string",
              },
            };
          }
          // TODO: Replace regex-based XSS protection with a dedicated sanitization library (e.g., DOMPurify, sanitize-html)
          // XSS protection: Reject addresses containing script tags or other dangerous HTML
          const xssPattern = /<script|<iframe|javascript:|onerror=|onload=/i;
          if (xssPattern.test(body.location_json.address)) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message:
                  "Invalid address: HTML tags and scripts are not allowed",
              },
            };
          }
        }

        // Create store (with validation from service)
        const store = await storeService.createStore({
          company_id: params.companyId,
          name: body.name,
          location_json: body.location_json,
          timezone: body.timezone,
          status: body.status,
        });

        // Log store creation to AuditLog (BLOCKING - if this fails, rollback)
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
              table_name: "stores",
              record_id: store.store_id,
              new_values: JSON.stringify(store) as any,
              ip_address: ipAddress,
              user_agent: userAgent,
              reason: `Store created by ${user.email} (roles: ${user.roles.join(", ")})`,
            },
          });
        } catch (auditError) {
          // If audit log fails, delete the store and fail the request
          await prisma.store.delete({
            where: { store_id: store.store_id },
          });
          throw new Error("Failed to create audit log - operation rolled back");
        }

        reply.code(201);
        return {
          ...store,
          request_metadata: {
            timestamp: new Date().toISOString(),
            request_id: request.id,
          },
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error creating store");
        if (
          error.message.includes("required") ||
          error.message.includes("Invalid") ||
          error.message.includes("cannot")
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
        if (error.message.includes("Forbidden")) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: error.message,
            },
          };
        }
        if (error.message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: error.message,
            },
          };
        }
        reply.code(500);
        return {
          error: "Internal server error",
          message: "Failed to create store",
        };
      }
    },
  );

  /**
   * GET /api/companies/:companyId/stores
   * List all stores for a company
   * Protected route - requires STORE_READ permission
   */
  fastify.get(
    "/api/companies/:companyId/stores",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.STORE_READ),
      ],
      schema: {
        description: "List all stores for a company",
        tags: ["stores"],
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
        querystring: {
          type: "object",
          properties: {
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 100,
              default: 20,
              description: "Items per page (max 100)",
            },
            offset: {
              type: "integer",
              minimum: 0,
              default: 0,
              description: "Pagination offset",
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
                    store_id: { type: "string", format: "uuid" },
                    company_id: { type: "string", format: "uuid" },
                    name: { type: "string" },
                    location_json: {
                      type: "object",
                      additionalProperties: true,
                    },
                    timezone: { type: "string" },
                    status: { type: "string" },
                    created_at: { type: "string", format: "date-time" },
                    updated_at: { type: "string", format: "date-time" },
                  },
                },
              },
              meta: {
                type: "object",
                properties: {
                  total: { type: "integer" },
                  limit: { type: "integer" },
                  offset: { type: "integer" },
                },
              },
            },
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
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

        // Verify user can view stores for this company (company isolation)
        // System Admins can view stores for ANY company
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        if (!hasSystemScope) {
          const userCompanyId = await getUserCompanyId(user.id);
          if (!userCompanyId || userCompanyId !== params.companyId) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "PERMISSION_DENIED",
                message: "You can only view stores for your assigned company",
              },
            };
          }
        }

        const stores = await storeService.getStoresByCompany(params.companyId);

        reply.code(200);
        return {
          data: stores,
          meta: {
            total: stores.length,
            limit: (request.query as any)?.limit || 20,
            offset: (request.query as any)?.offset || 0,
          },
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error retrieving stores");
        if (error.message.includes("Forbidden")) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: error.message,
            },
          };
        }
        reply.code(500);
        return {
          error: "Internal server error",
          message: "Failed to retrieve stores",
        };
      }
    },
  );

  /**
   * GET /api/stores/:storeId
   * Get store by ID
   * Protected route - requires STORE_READ permission
   */
  fastify.get(
    "/api/stores/:storeId",
    {
      preHandler: [authMiddleware],
      schema: {
        description: "Get store by ID",
        tags: ["stores"],
        params: {
          type: "object",
          required: ["storeId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              store_id: { type: "string", format: "uuid" },
              company_id: { type: "string", format: "uuid" },
              name: { type: "string" },
              location_json: {
                type: "object",
                additionalProperties: true,
              },
              timezone: { type: "string" },
              status: { type: "string" },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
            },
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
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
        const params = request.params as { storeId: string };
        const user = (request as any).user as UserIdentity;

        // Check if store exists FIRST (before permission check)
        // This ensures we return 404 for non-existent stores, not 403
        const store = await prisma.store.findUnique({
          where: { store_id: params.storeId },
        });

        if (!store) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Store not found",
            },
          };
        }

        // Get user's company_id for isolation check
        // System Admins can access ANY store
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        let userCompanyId: string | null = null;
        if (!hasSystemScope) {
          userCompanyId = await getUserCompanyId(user.id);
          if (!userCompanyId) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "PERMISSION_DENIED",
                message: "You must have a COMPANY scope role to access stores",
              },
            };
          }

          // Check company isolation
          if (store.company_id !== userCompanyId) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "PERMISSION_DENIED",
                message: "You can only access stores for your assigned company",
              },
            };
          }
        }

        // Check permission (after existence and ownership checks)
        const hasPermission = await rbacService.checkPermission(
          user.id,
          PERMISSIONS.STORE_READ,
          { storeId: params.storeId, companyId: userCompanyId || undefined },
        );

        if (!hasPermission) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: `Permission denied: ${PERMISSIONS.STORE_READ} is required`,
            },
          };
        }

        reply.code(200);
        return store;
      } catch (error: any) {
        fastify.log.error({ error }, "Error retrieving store");
        if (error.message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: error.message,
            },
          };
        }
        if (error.message.includes("Forbidden")) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: error.message,
            },
          };
        }
        reply.code(500);
        return {
          error: "Internal server error",
          message: "Failed to retrieve store",
        };
      }
    },
  );

  /**
   * PUT /api/stores/:storeId
   * Update store
   * Protected route - requires STORE_UPDATE permission
   */
  fastify.put(
    "/api/stores/:storeId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.STORE_UPDATE),
      ],
      schema: {
        description: "Update store",
        tags: ["stores"],
        params: {
          type: "object",
          required: ["storeId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
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
              description: "Store name",
            },
            location_json: {
              type: "object",
              properties: {
                address: {
                  type: "string",
                  description: "Store address",
                },
              },
              description: "Store location (address only)",
            },
            timezone: {
              type: "string",
              description:
                "IANA timezone format (e.g., America/New_York, Europe/London) - validated by service layer",
            },
            status: {
              type: "string",
              enum: ["ACTIVE", "INACTIVE", "CLOSED"],
              description: "Store status",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              store_id: { type: "string", format: "uuid" },
              company_id: { type: "string", format: "uuid" },
              name: { type: "string" },
              location_json: {
                type: "object",
                additionalProperties: true,
              },
              timezone: { type: "string" },
              status: { type: "string" },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
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
        const params = request.params as { storeId: string };
        const body = request.body as {
          name?: string;
          location_json?: {
            address?: string;
          };
          timezone?: string;
          status?: "ACTIVE" | "INACTIVE" | "CLOSED";
        };
        const user = (request as any).user as UserIdentity;

        // Check if store exists FIRST (before permission check)
        // This ensures we return 404 for non-existent stores, not 403
        const oldStore = await prisma.store.findUnique({
          where: { store_id: params.storeId },
        });

        if (!oldStore) {
          reply.code(404);
          return {
            error: "Not found",
            message: "Store not found",
          };
        }

        // Get user's company_id for isolation check
        // System Admins can update ANY store
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        let userCompanyId: string | null = null;
        if (!hasSystemScope) {
          userCompanyId = await getUserCompanyId(user.id);
          if (!userCompanyId) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "PERMISSION_DENIED",
                message: "You must have a COMPANY scope role to update stores",
              },
            };
          }

          // Check company isolation
          if (oldStore.company_id !== userCompanyId) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "PERMISSION_DENIED",
                message: "You can only update stores for your assigned company",
              },
            };
          }
        }

        // Validate location_json.address if provided
        if (body.location_json?.address !== undefined) {
          // Ensure address is a string
          if (typeof body.location_json.address !== "string") {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "location_json.address must be a string",
              },
            };
          }
          // TODO: Replace regex-based XSS protection with a dedicated sanitization library (e.g., DOMPurify, sanitize-html)
          // XSS protection: Reject addresses containing script tags or other dangerous HTML
          const xssPattern = /<script|<iframe|javascript:|onerror=|onload=/i;
          if (xssPattern.test(body.location_json.address)) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message:
                  "Invalid address: HTML tags and scripts are not allowed",
              },
            };
          }
        }

        // Update store (service will verify company isolation)
        const store = await storeService.updateStore(
          params.storeId,
          userCompanyId || oldStore.company_id,
          {
            name: body.name,
            location_json: body.location_json,
            timezone: body.timezone,
            status: body.status,
          },
        );

        // Log store update to AuditLog (BLOCKING)
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
              table_name: "stores",
              record_id: store.store_id,
              old_values: JSON.stringify(oldStore) as any,
              new_values: JSON.stringify(store) as any,
              ip_address: ipAddress,
              user_agent: userAgent,
              reason: `Store updated by ${user.email} (roles: ${user.roles.join(", ")})`,
            },
          });
        } catch (auditError) {
          // If audit log fails, revert the update and fail the request
          await storeService.updateStore(
            params.storeId,
            userCompanyId || oldStore.company_id,
            {
              name: oldStore.name,
              location_json: oldStore.location_json as any,
              timezone: oldStore.timezone,
              status: oldStore.status as any,
            },
          );
          throw new Error("Failed to create audit log - operation rolled back");
        }

        reply.code(200);
        return store;
      } catch (error: any) {
        fastify.log.error({ error }, "Error updating store");
        if (
          error.message.includes("required") ||
          error.message.includes("Invalid") ||
          error.message.includes("cannot")
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
        if (error.message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: error.message,
            },
          };
        }
        if (error.message.includes("Forbidden")) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: error.message,
            },
          };
        }
        reply.code(500);
        return {
          error: "Internal server error",
          message: "Failed to update store",
        };
      }
    },
  );

  /**
   * PUT /api/stores/:storeId/configuration
   * Update store configuration (timezone, location, operating hours)
   * Protected route - requires STORE_UPDATE permission
   * Only Store Managers can update their store's configuration
   */
  fastify.put(
    "/api/stores/:storeId/configuration",
    {
      preHandler: [authMiddleware],
      schema: {
        description: "Update store configuration",
        tags: ["stores"],
        params: {
          type: "object",
          required: ["storeId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
          },
        },
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            timezone: {
              type: "string",
              description:
                "IANA timezone format (e.g., America/New_York, Europe/London) - validated by service layer",
            },
            location_json: {
              type: "object",
              properties: {
                address: {
                  type: "string",
                  description: "Store address",
                },
              },
              description: "Store location (address only)",
            },
            location: {
              type: "object",
              properties: {
                address: {
                  type: "string",
                  description: "Store address",
                },
              },
              description:
                "Store location (address only) - deprecated, use location_json",
            },
            operating_hours: {
              type: "object",
              properties: {
                monday: {
                  type: "object",
                  properties: {
                    open: {
                      type: "string",
                      pattern: "^([0-1][0-9]|2[0-3]):[0-5][0-9]$",
                      description: "Open time in HH:mm format",
                    },
                    close: {
                      type: "string",
                      pattern: "^([0-1][0-9]|2[0-3]):[0-5][0-9]$",
                      description: "Close time in HH:mm format",
                    },
                    closed: {
                      type: "boolean",
                      description: "If true, store is closed on this day",
                    },
                  },
                },
                tuesday: {
                  type: "object",
                  properties: {
                    open: {
                      type: "string",
                      pattern: "^([0-1][0-9]|2[0-3]):[0-5][0-9]$",
                    },
                    close: {
                      type: "string",
                      pattern: "^([0-1][0-9]|2[0-3]):[0-5][0-9]$",
                    },
                    closed: { type: "boolean" },
                  },
                },
                wednesday: {
                  type: "object",
                  properties: {
                    open: {
                      type: "string",
                      pattern: "^([0-1][0-9]|2[0-3]):[0-5][0-9]$",
                    },
                    close: {
                      type: "string",
                      pattern: "^([0-1][0-9]|2[0-3]):[0-5][0-9]$",
                    },
                    closed: { type: "boolean" },
                  },
                },
                thursday: {
                  type: "object",
                  properties: {
                    open: {
                      type: "string",
                      pattern: "^([0-1][0-9]|2[0-3]):[0-5][0-9]$",
                    },
                    close: {
                      type: "string",
                      pattern: "^([0-1][0-9]|2[0-3]):[0-5][0-9]$",
                    },
                    closed: { type: "boolean" },
                  },
                },
                friday: {
                  type: "object",
                  properties: {
                    open: {
                      type: "string",
                      pattern: "^([0-1][0-9]|2[0-3]):[0-5][0-9]$",
                    },
                    close: {
                      type: "string",
                      pattern: "^([0-1][0-9]|2[0-3]):[0-5][0-9]$",
                    },
                    closed: { type: "boolean" },
                  },
                },
                saturday: {
                  type: "object",
                  properties: {
                    open: {
                      type: "string",
                      pattern: "^([0-1][0-9]|2[0-3]):[0-5][0-9]$",
                    },
                    close: {
                      type: "string",
                      pattern: "^([0-1][0-9]|2[0-3]):[0-5][0-9]$",
                    },
                    closed: { type: "boolean" },
                  },
                },
                sunday: {
                  type: "object",
                  properties: {
                    open: {
                      type: "string",
                      pattern: "^([0-1][0-9]|2[0-3]):[0-5][0-9]$",
                    },
                    close: {
                      type: "string",
                      pattern: "^([0-1][0-9]|2[0-3]):[0-5][0-9]$",
                    },
                    closed: { type: "boolean" },
                  },
                },
              },
              description: "Operating hours for each day of the week",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              store_id: { type: "string", format: "uuid" },
              company_id: { type: "string", format: "uuid" },
              name: { type: "string" },
              timezone: { type: "string" },
              location_json: {
                type: "object",
                additionalProperties: true,
              },
              status: { type: "string" },
              configuration: { type: "object" },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
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
        const params = request.params as { storeId: string };
        const body = request.body as {
          timezone?: string;
          location_json?: {
            address?: string;
          };
          location?: {
            address?: string;
          };
          operating_hours?: {
            monday?: { open?: string; close?: string; closed?: boolean };
            tuesday?: { open?: string; close?: string; closed?: boolean };
            wednesday?: { open?: string; close?: string; closed?: boolean };
            thursday?: { open?: string; close?: string; closed?: boolean };
            friday?: { open?: string; close?: string; closed?: boolean };
            saturday?: { open?: string; close?: string; closed?: boolean };
            sunday?: { open?: string; close?: string; closed?: boolean };
          };
        };
        const user = (request as any).user as UserIdentity;

        // Check if store exists FIRST (before permission check)
        const oldStore = await prisma.store.findUnique({
          where: { store_id: params.storeId },
        });

        if (!oldStore) {
          reply.code(404);
          return {
            error: "Not found",
            message: "Store not found",
          };
        }

        // Get user's company_id for isolation check
        // System Admins can update ANY store configuration
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        let userCompanyId: string | null = null;
        if (!hasSystemScope) {
          userCompanyId = await getUserCompanyId(user.id);
          if (!userCompanyId) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "PERMISSION_DENIED",
                message:
                  "You must have a COMPANY scope role to update store configuration",
              },
            };
          }

          // Check company isolation
          if (oldStore.company_id !== userCompanyId) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "PERMISSION_DENIED",
                message: "You can only update stores for your assigned company",
              },
            };
          }
        }

        // Check permission (after ownership check to give specific error)
        const hasPermission = await rbacService.checkPermission(
          user.id,
          PERMISSIONS.STORE_UPDATE,
          { storeId: params.storeId, companyId: userCompanyId || undefined },
        );

        if (!hasPermission) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: `Permission denied: ${PERMISSIONS.STORE_UPDATE} is required`,
            },
          };
        }

        // Update store configuration (service will verify company isolation and validate)
        // Support both location_json (preferred) and location (deprecated) for backward compatibility
        const locationData = body.location_json || body.location;

        // Track which fields were updated and their old values for audit
        const fieldsUpdated: {
          timezone?: boolean;
          location_json?: boolean;
          configuration?: boolean;
        } = {};

        // Validate timezone format before transaction (same validation as storeService)
        if (body.timezone !== undefined) {
          if (!isValidIANATimezone(body.timezone)) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message:
                  "Invalid timezone format. Must be IANA timezone format (e.g., America/New_York, Europe/London)",
              },
            };
          }
          fieldsUpdated.timezone = true;
        }

        // Validate location_json structure if provided (same validation as storeService)
        if (locationData !== undefined) {
          if (
            locationData.address !== undefined &&
            typeof locationData.address !== "string"
          ) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "location_json.address must be a string",
              },
            };
          }
          // TODO: Replace regex-based XSS protection with a dedicated sanitization library (e.g., DOMPurify, sanitize-html)
          // XSS protection: Reject addresses containing script tags or other dangerous HTML
          if (
            locationData.address &&
            typeof locationData.address === "string"
          ) {
            const xssPattern = /<script|<iframe|javascript:|onerror=|onload=/i;
            if (xssPattern.test(locationData.address)) {
              reply.code(400);
              return {
                success: false,
                error: {
                  code: "VALIDATION_ERROR",
                  message:
                    "Invalid address: HTML tags and scripts are not allowed",
                },
              };
            }
          }
          fieldsUpdated.location_json = true;
        }

        // Track if configuration is being updated
        if (body.operating_hours !== undefined) {
          fieldsUpdated.configuration = true;
        }

        // If no fields are being updated, return early
        if (
          !fieldsUpdated.timezone &&
          !fieldsUpdated.location_json &&
          !fieldsUpdated.configuration
        ) {
          reply.code(200);
          return oldStore;
        }

        // Prepare old values for audit (capture before any updates)
        const oldValues: any = {};
        const newValues: any = {};
        const updatedFields: string[] = [];

        if (fieldsUpdated.timezone) {
          oldValues.timezone = oldStore.timezone;
          newValues.timezone = body.timezone;
          updatedFields.push("timezone");
        }

        if (fieldsUpdated.location_json) {
          oldValues.location_json = oldStore.location_json;
          newValues.location_json = locationData;
          updatedFields.push("location_json");
        }

        if (fieldsUpdated.configuration) {
          oldValues.configuration = oldStore.configuration;
          // Will be set after merge below
          updatedFields.push("configuration");
        }

        // Perform all updates in a single Prisma transaction
        // This ensures atomicity: if any update or audit log creation fails, everything rolls back
        const store = await prisma.$transaction(async (tx) => {
          // Prepare update data for store fields (timezone and location_json)
          const updateData: any = {};
          if (fieldsUpdated.timezone) {
            updateData.timezone = body.timezone;
          }
          if (fieldsUpdated.location_json) {
            updateData.location_json = locationData;
          }

          // Prepare configuration update if operating_hours is provided
          if (fieldsUpdated.configuration) {
            // Merge new configuration with existing configuration (deep merge)
            // Same logic as storeService.updateStoreConfiguration
            const existingConfig = (oldStore.configuration as any) || {};
            const mergedConfig = {
              ...existingConfig,
              operating_hours: {
                ...(existingConfig.operating_hours || {}),
                ...body.operating_hours,
              },
            };
            updateData.configuration = mergedConfig;
            newValues.configuration = mergedConfig;
          }

          // Update store with all fields atomically
          const updatedStore = await tx.store.update({
            where: { store_id: params.storeId },
            data: updateData,
          });

          // Create audit log within the same transaction
          // If this fails, the entire transaction (including store update) will roll back
          if (Object.keys(oldValues).length > 0) {
            const ipAddress =
              (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
              request.ip ||
              request.socket.remoteAddress ||
              null;
            const userAgent = request.headers["user-agent"] || null;

            await tx.auditLog.create({
              data: {
                user_id: user.id,
                action: "UPDATE",
                table_name: "stores",
                record_id: updatedStore.store_id,
                old_values: oldValues as any,
                new_values: newValues as any,
                ip_address: ipAddress,
                user_agent: userAgent,
                reason: `Store ${updatedFields.join(", ")} updated by ${user.email} (roles: ${user.roles.join(", ")})`,
              },
            });
          }

          return updatedStore;
        });

        reply.code(200);
        return store;
      } catch (error: any) {
        const errorParams = request.params as { storeId?: string } | undefined;
        const errorUser = (request as any).user as UserIdentity | undefined;
        fastify.log.error(
          {
            error,
            storeId: errorParams?.storeId,
            userId: errorUser?.id,
          },
          "Error updating store configuration",
        );
        if (
          error.message.includes("required") ||
          error.message.includes("Invalid") ||
          error.message.includes("cannot") ||
          error.message.includes("must be")
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
        if (error.message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: error.message,
            },
          };
        }
        if (error.message.includes("Forbidden")) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: error.message,
            },
          };
        }
        reply.code(500);
        return {
          error: "Internal server error",
          message: "Failed to update store configuration",
        };
      }
    },
  );

  /**
   * DELETE /api/stores/:storeId
   * Hard delete store (permanently removes the store)
   * Protected route - requires STORE_DELETE permission
   */
  fastify.delete(
    "/api/stores/:storeId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.STORE_DELETE),
      ],
      schema: {
        description: "Hard delete store",
        tags: ["stores"],
        params: {
          type: "object",
          required: ["storeId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
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
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
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
        const params = request.params as { storeId: string };
        const user = (request as any).user as UserIdentity;

        // Check if store exists FIRST (before permission check)
        // This ensures we return 404 for non-existent stores, not 403
        const oldStore = await prisma.store.findUnique({
          where: { store_id: params.storeId },
        });

        if (!oldStore) {
          reply.code(404);
          return {
            error: "Not found",
            message: "Store not found",
          };
        }

        // Get user's company_id for isolation check
        // System Admins can delete ANY store
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        let userCompanyId: string | null = null;
        if (!hasSystemScope) {
          userCompanyId = await getUserCompanyId(user.id);
          if (!userCompanyId) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "PERMISSION_DENIED",
                message: "You must have a COMPANY scope role to delete stores",
              },
            };
          }

          // Check company isolation
          if (oldStore.company_id !== userCompanyId) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "PERMISSION_DENIED",
                message: "You can only delete stores for your assigned company",
              },
            };
          }
        } else {
          // System admin: use the store's company_id for the service call
          userCompanyId = oldStore.company_id;
        }

        // Hard delete store (service will verify company isolation and ACTIVE status)
        await storeService.deleteStore(params.storeId, userCompanyId!);

        // Log store deletion to AuditLog (non-blocking - don't fail the deletion if audit fails)
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
              table_name: "stores",
              record_id: params.storeId,
              old_values: JSON.stringify(oldStore) as any,
              new_values: {} as any,
              ip_address: ipAddress,
              user_agent: userAgent,
              reason: `Store permanently deleted by ${user.email} (roles: ${user.roles.join(", ")})`,
            },
          });
        } catch (auditError) {
          // Log the audit failure but don't fail the deletion operation
          console.error(
            "Failed to create audit log for store deletion:",
            auditError,
          );
        }

        reply.code(200);
        return {
          success: true,
          message: "Store permanently deleted",
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error deleting store");
        if (error.message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: error.message,
            },
          };
        }
        if (error.message.includes("Forbidden")) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: error.message,
            },
          };
        }
        if (error.message.includes("ACTIVE store")) {
          reply.code(400);
          return {
            error: "Bad Request",
            message: error.message,
          };
        }
        reply.code(500);
        return {
          error: "Internal server error",
          message: "Failed to delete store",
        };
      }
    },
  );

  /**
   * GET /api/stores/:storeId/terminals
   * Get terminals for a store with active shift status
   * Story 4.8: Cashier Shift Start Flow
   * Protected route - requires STORE_READ permission
   */
  fastify.get(
    "/api/stores/:storeId/terminals",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.STORE_READ),
      ],
      schema: {
        description: "Get terminals for a store with active shift status",
        tags: ["stores"],
        params: {
          type: "object",
          required: ["storeId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
          },
        },
        response: {
          200: {
            type: "array",
            items: {
              type: "object",
              properties: {
                pos_terminal_id: { type: "string", format: "uuid" },
                store_id: { type: "string", format: "uuid" },
                name: { type: "string" },
                device_id: { type: "string", nullable: true },
                status: { type: "string" },
                has_active_shift: { type: "boolean" },
                created_at: { type: "string", format: "date-time" },
                updated_at: { type: "string", format: "date-time" },
              },
            },
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
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
        const params = request.params as { storeId: string };
        const user = (request as any).user as UserIdentity;

        // Get user's company_id for isolation check
        // System Admins can access terminals for ANY store
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        let userCompanyId: string | null = null;
        if (!hasSystemScope) {
          userCompanyId = await getUserCompanyId(user.id);
          if (!userCompanyId) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "PERMISSION_DENIED",
                message:
                  "You must have a COMPANY scope role to access terminals",
              },
            };
          }
        } else {
          // System admin: get company_id from store
          const store = await prisma.store.findUnique({
            where: { store_id: params.storeId },
            select: { company_id: true },
          });
          if (store) {
            userCompanyId = store.company_id;
          }
        }

        // Get terminals with active shift status (service handles RLS)
        const terminals = await storeService.getStoreTerminals(
          params.storeId,
          userCompanyId!,
        );

        reply.code(200);
        return terminals;
      } catch (error: any) {
        fastify.log.error({ error }, "Error retrieving store terminals");
        if (error.message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: error.message,
            },
          };
        }
        if (error.message.includes("Forbidden")) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: error.message,
            },
          };
        }
        reply.code(500);
        return {
          error: "Internal server error",
          message: "Failed to retrieve store terminals",
        };
      }
    },
  );

  /**
   * POST /api/stores/:storeId/terminals
   * Create a new POS terminal for a store
   * Protected route - requires STORE_CREATE permission
   */
  fastify.post(
    "/api/stores/:storeId/terminals",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.STORE_CREATE),
      ],
      schema: {
        description: "Create a new POS terminal for a store",
        tags: ["stores"],
        params: {
          type: "object",
          required: ["storeId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
          },
        },
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name: {
              type: "string",
              minLength: 1,
              maxLength: 100,
              description: "Terminal name",
            },
            device_id: {
              type: "string",
              maxLength: 255,
              description: "Device ID (optional, must be globally unique)",
            },
          },
        },
        response: {
          201: {
            type: "object",
            properties: {
              pos_terminal_id: { type: "string", format: "uuid" },
              store_id: { type: "string", format: "uuid" },
              name: { type: "string" },
              device_id: { type: "string", nullable: true },
              deleted_at: {
                type: "string",
                nullable: true,
                format: "date-time",
              },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
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
        const params = request.params as { storeId: string };
        const body = request.body as {
          name: string;
          device_id?: string;
        };
        const user = (request as any).user as UserIdentity;

        // Get user's company_id for isolation check
        // System Admins can create terminals for ANY store
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        let userCompanyId: string | null = null;
        if (!hasSystemScope) {
          userCompanyId = await getUserCompanyId(user.id);
          if (!userCompanyId) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "PERMISSION_DENIED",
                message:
                  "You must have a COMPANY scope role to create terminals",
              },
            };
          }
        } else {
          // System admin: get company_id from store
          const store = await prisma.store.findUnique({
            where: { store_id: params.storeId },
            select: { company_id: true },
          });
          if (!store) {
            reply.code(404);
            return {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: "Store not found",
              },
            };
          }
          userCompanyId = store.company_id;
        }

        // Create terminal
        const terminal = await storeService.createTerminal(
          params.storeId,
          body,
          userCompanyId,
        );

        reply.code(201);
        return terminal;
      } catch (error: any) {
        fastify.log.error({ error }, "Error creating terminal");
        if (error.message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: error.message,
            },
          };
        }
        if (error.message.includes("Forbidden")) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: error.message,
            },
          };
        }
        if (
          error.message.includes("required") ||
          error.message.includes("must be") ||
          error.message.includes("already in use")
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
          error: "Internal server error",
          message: "Failed to create terminal",
        };
      }
    },
  );

  /**
   * PUT /api/stores/:storeId/terminals/:terminalId
   * Update a POS terminal
   * Protected route - requires STORE_UPDATE permission
   */
  fastify.put(
    "/api/stores/:storeId/terminals/:terminalId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.STORE_UPDATE),
      ],
      schema: {
        description: "Update a POS terminal",
        tags: ["stores"],
        params: {
          type: "object",
          required: ["storeId", "terminalId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
            terminalId: {
              type: "string",
              format: "uuid",
              description: "Terminal UUID",
            },
          },
        },
        body: {
          type: "object",
          properties: {
            name: {
              type: "string",
              minLength: 1,
              maxLength: 100,
              description: "Terminal name",
            },
            device_id: {
              type: "string",
              maxLength: 255,
              description: "Device ID (optional, must be globally unique)",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              pos_terminal_id: { type: "string", format: "uuid" },
              store_id: { type: "string", format: "uuid" },
              name: { type: "string" },
              device_id: { type: "string", nullable: true },
              deleted_at: {
                type: "string",
                nullable: true,
                format: "date-time",
              },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
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
        const params = request.params as {
          storeId: string;
          terminalId: string;
        };
        const body = request.body as {
          name?: string;
          device_id?: string;
        };
        const user = (request as any).user as UserIdentity;

        // Get user's company_id for isolation check
        // System Admins can update terminals for ANY store
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        let userCompanyId: string | null = null;
        if (!hasSystemScope) {
          userCompanyId = await getUserCompanyId(user.id);
          if (!userCompanyId) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "PERMISSION_DENIED",
                message:
                  "You must have a COMPANY scope role to update terminals",
              },
            };
          }
        } else {
          // System admin: get company_id from store
          const store = await prisma.store.findUnique({
            where: { store_id: params.storeId },
            select: { company_id: true },
          });
          if (!store) {
            reply.code(404);
            return {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: "Store not found",
              },
            };
          }
          userCompanyId = store.company_id;
        }

        // Update terminal
        const terminal = await storeService.updateTerminal(
          params.terminalId,
          body,
          userCompanyId!,
        );

        reply.code(200);
        return terminal;
      } catch (error: any) {
        fastify.log.error({ error }, "Error updating terminal");
        if (error.message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: error.message,
            },
          };
        }
        if (error.message.includes("Forbidden")) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: error.message,
            },
          };
        }
        if (
          error.message.includes("required") ||
          error.message.includes("must be") ||
          error.message.includes("already in use")
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
          error: "Internal server error",
          message: "Failed to update terminal",
        };
      }
    },
  );

  /**
   * DELETE /api/stores/:storeId/terminals/:terminalId
   * Delete a POS terminal
   * Protected route - requires STORE_DELETE permission
   */
  fastify.delete(
    "/api/stores/:storeId/terminals/:terminalId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.STORE_DELETE),
      ],
      schema: {
        description: "Delete a POS terminal",
        tags: ["stores"],
        params: {
          type: "object",
          required: ["storeId", "terminalId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
            terminalId: {
              type: "string",
              format: "uuid",
              description: "Terminal UUID",
            },
          },
        },
        response: {
          204: {
            type: "null",
            description: "Terminal deleted successfully",
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
                required: ["code", "message"],
              },
            },
            required: ["success", "error"],
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
        const params = request.params as {
          storeId: string;
          terminalId: string;
        };
        const user = (request as any).user as UserIdentity;

        // Get user's company_id for isolation check
        // System Admins can delete terminals for ANY store
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        let userCompanyId: string | null = null;
        if (!hasSystemScope) {
          userCompanyId = await getUserCompanyId(user.id);
          if (!userCompanyId) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "PERMISSION_DENIED",
                message:
                  "You must have a COMPANY scope role to delete terminals",
              },
            };
          }
        } else {
          // System admin: get company_id from store
          const store = await prisma.store.findUnique({
            where: { store_id: params.storeId },
            select: { company_id: true },
          });
          if (!store) {
            reply.code(404);
            return {
              success: false,
              error: {
                code: "STORE_NOT_FOUND",
                message: `Store with ID ${params.storeId} not found`,
              },
            };
          }
          userCompanyId = store.company_id;
        }

        // Ensure userCompanyId is set before proceeding
        if (!userCompanyId) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: "You must have a COMPANY scope role to delete terminals",
            },
          };
        }

        // Delete terminal
        await storeService.deleteTerminal(
          params.terminalId,
          params.storeId,
          userCompanyId,
        );

        reply.code(204);
        return null;
      } catch (error: any) {
        fastify.log.error({ error }, "Error deleting terminal");
        if (error.message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: error.message,
            },
          };
        }
        if (error.message.includes("Forbidden")) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: error.message,
            },
          };
        }
        if (error.message.includes("active shift")) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: error.message,
            },
          };
        }
        reply.code(500);
        return {
          error: "Internal server error",
          message: "Failed to delete terminal",
        };
      }
    },
  );
}
