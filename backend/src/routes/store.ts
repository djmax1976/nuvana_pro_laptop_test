import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { permissionMiddleware } from "../middleware/permission.middleware";
import { PERMISSIONS } from "../constants/permissions";
import { storeService } from "../services/store.service";
import { rbacService } from "../services/rbac.service";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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
                    location_json: { type: "object" },
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
        const user = (request as any).user as UserIdentity;
        const query = request.query as { limit?: number; offset?: number };

        // Check if user has SYSTEM scope (System Admin)
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        if (!hasSystemScope) {
          reply.code(403);
          return {
            error: "Forbidden",
            message: "Only System Administrators can view all stores",
          };
        }

        const limit = query.limit || 20;
        const offset = query.offset || 0;

        // Get all stores with company info
        const [stores, total] = await Promise.all([
          prisma.store.findMany({
            skip: offset,
            take: limit,
            orderBy: { created_at: "desc" },
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
              location_json: { type: "object" },
              timezone: { type: "string" },
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
          403: {
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
            reply.code(403);
            return {
              error: "Forbidden",
              message: "You can only create stores for your assigned company",
            };
          }
        }
        // System admins bypass company isolation - they can create stores for any company

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
            error: "Validation error",
            message: error.message,
          };
        }
        if (error.message.includes("Forbidden")) {
          reply.code(403);
          return {
            error: "Forbidden",
            message: error.message,
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
                    location_json: { type: "object" },
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
              error: "Forbidden",
              message: "You can only view stores for your assigned company",
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
            error: "Forbidden",
            message: error.message,
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
              location_json: { type: "object" },
              timezone: { type: "string" },
              status: { type: "string" },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
            },
          },
          403: {
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
            error: "Not found",
            message: "Store not found",
          };
        }

        // Get user's company_id for isolation check
        // System Admins can access ANY store
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        if (!hasSystemScope) {
          const userCompanyId = await getUserCompanyId(user.id);
          if (!userCompanyId) {
            reply.code(403);
            return {
              error: "Forbidden",
              message: "You must have a COMPANY scope role to access stores",
            };
          }

          // Check company isolation
          if (store.company_id !== userCompanyId) {
            reply.code(403);
            return {
              error: "Forbidden",
              message: "You can only access stores for your assigned company",
            };
          }
        }

        // Check permission (after existence and ownership checks)
        const hasPermission = await rbacService.checkPermission(
          user.id,
          PERMISSIONS.STORE_READ,
          { storeId: params.storeId, companyId: userCompanyId },
        );

        if (!hasPermission) {
          reply.code(403);
          return {
            error: "Forbidden",
            message: `Permission denied: ${PERMISSIONS.STORE_READ} is required`,
          };
        }

        reply.code(200);
        return store;
      } catch (error: any) {
        fastify.log.error({ error }, "Error retrieving store");
        if (error.message.includes("not found")) {
          reply.code(404);
          return {
            error: "Not found",
            message: error.message,
          };
        }
        if (error.message.includes("Forbidden")) {
          reply.code(403);
          return {
            error: "Forbidden",
            message: error.message,
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
              location_json: { type: "object" },
              timezone: { type: "string" },
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
          403: {
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

        if (!hasSystemScope) {
          const userCompanyId = await getUserCompanyId(user.id);
          if (!userCompanyId) {
            reply.code(403);
            return {
              error: "Forbidden",
              message: "You must have a COMPANY scope role to update stores",
            };
          }

          // Check company isolation
          if (oldStore.company_id !== userCompanyId) {
            reply.code(403);
            return {
              error: "Forbidden",
              message: "You can only update stores for your assigned company",
            };
          }
        }

        // Update store (service will verify company isolation)
        const store = await storeService.updateStore(
          params.storeId,
          userCompanyId,
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
          await storeService.updateStore(params.storeId, userCompanyId, {
            name: oldStore.name,
            location_json: oldStore.location_json as any,
            timezone: oldStore.timezone,
            status: oldStore.status as any,
          });
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
            error: "Validation error",
            message: error.message,
          };
        }
        if (error.message.includes("not found")) {
          reply.code(404);
          return {
            error: "Not found",
            message: error.message,
          };
        }
        if (error.message.includes("Forbidden")) {
          reply.code(403);
          return {
            error: "Forbidden",
            message: error.message,
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
            location: {
              type: "object",
              properties: {
                address: {
                  type: "string",
                  description: "Store address",
                },
              },
              description: "Store location (address only)",
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
              configuration: { type: "object" },
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
          403: {
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
        const params = request.params as { storeId: string };
        const body = request.body as {
          timezone?: string;
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

        if (!hasSystemScope) {
          const userCompanyId = await getUserCompanyId(user.id);
          if (!userCompanyId) {
            reply.code(403);
            return {
              error: "Forbidden",
              message:
                "You must have a COMPANY scope role to update store configuration",
            };
          }

          // Check company isolation
          if (oldStore.company_id !== userCompanyId) {
            reply.code(403);
            return {
              error: "Forbidden",
              message: "You can only update stores for your assigned company",
            };
          }
        }

        // Check permission (after ownership check to give specific error)
        const hasPermission = await rbacService.checkPermission(
          user.id,
          PERMISSIONS.STORE_UPDATE,
          { storeId: params.storeId, companyId: userCompanyId },
        );

        if (!hasPermission) {
          reply.code(403);
          return {
            error: "Forbidden",
            message: `Permission denied: ${PERMISSIONS.STORE_UPDATE} is required`,
          };
        }

        // Update store configuration (service will verify company isolation and validate)
        const store = await storeService.updateStoreConfiguration(
          params.storeId,
          userCompanyId,
          {
            timezone: body.timezone,
            location: body.location,
            operating_hours: body.operating_hours as any,
          },
        );

        // Log configuration update to AuditLog (BLOCKING)
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
              old_values: { configuration: oldStore.configuration } as any,
              new_values: { configuration: store.configuration } as any,
              ip_address: ipAddress,
              user_agent: userAgent,
              reason: `Store configuration updated by ${user.email} (roles: ${user.roles.join(", ")})`,
            },
          });
        } catch (auditError) {
          // If audit log fails, revert the update and fail the request
          await prisma.store.update({
            where: { store_id: params.storeId },
            data: { configuration: oldStore.configuration as any },
          });
          throw new Error("Failed to create audit log - operation rolled back");
        }

        reply.code(200);
        return store;
      } catch (error: any) {
        fastify.log.error({ error }, "Error updating store configuration");
        if (
          error.message.includes("required") ||
          error.message.includes("Invalid") ||
          error.message.includes("cannot") ||
          error.message.includes("must be")
        ) {
          reply.code(400);
          return {
            error: "Validation error",
            message: error.message,
          };
        }
        if (error.message.includes("not found")) {
          reply.code(404);
          return {
            error: "Not found",
            message: error.message,
          };
        }
        if (error.message.includes("Forbidden")) {
          reply.code(403);
          return {
            error: "Forbidden",
            message: error.message,
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
              error: { type: "string" },
              message: { type: "string" },
            },
          },
          403: {
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
              error: "Forbidden",
              message: "You must have a COMPANY scope role to delete stores",
            };
          }

          // Check company isolation
          if (oldStore.company_id !== userCompanyId) {
            reply.code(403);
            return {
              error: "Forbidden",
              message: "You can only delete stores for your assigned company",
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
            error: "Not found",
            message: error.message,
          };
        }
        if (error.message.includes("Forbidden")) {
          reply.code(403);
          return {
            error: "Forbidden",
            message: error.message,
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
}
