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
 * @returns Company ID if user has COMPANY scope role, null otherwise
 */
async function getUserCompanyId(userId: string): Promise<string | null> {
  const userRoles = await rbacService.getUserRoles(userId);
  // Find COMPANY scope role
  const companyRole = userRoles.find(
    (role) => role.scope === "COMPANY" && role.company_id,
  );
  return companyRole?.company_id || null;
}

/**
 * Store management routes
 * Provides CRUD operations for stores with RBAC enforcement
 * All routes require STORE_* permissions and enforce company isolation
 */
export async function storeRoutes(fastify: FastifyInstance) {
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
                gps: {
                  type: "object",
                  properties: {
                    lat: {
                      type: "number",
                      minimum: -90,
                      maximum: 90,
                      description: "GPS latitude",
                    },
                    lng: {
                      type: "number",
                      minimum: -180,
                      maximum: 180,
                      description: "GPS longitude",
                    },
                  },
                  required: ["lat", "lng"],
                },
              },
              description: "Store location (address and/or GPS coordinates)",
            },
            timezone: {
              type: "string",
              pattern: "^[A-Z][a-z]+(\\/[A-Z][a-z_]+)+$|^UTC$|^GMT(\\+|-)\\d+$",
              description:
                "IANA timezone format (e.g., America/New_York, Europe/London)",
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
            gps?: { lat: number; lng: number };
          };
          timezone?: string;
          status?: "ACTIVE" | "INACTIVE" | "CLOSED";
        };
        const user = (request as any).user as UserIdentity;

        // Verify user can create stores for this company (company isolation)
        const userCompanyId = await getUserCompanyId(user.id);
        if (!userCompanyId || userCompanyId !== params.companyId) {
          reply.code(403);
          return {
            error: "Forbidden",
            message: "You can only create stores for your assigned company",
          };
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
              new_values: store as any,
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
        const userCompanyId = await getUserCompanyId(user.id);
        if (!userCompanyId || userCompanyId !== params.companyId) {
          reply.code(403);
          return {
            error: "Forbidden",
            message: "You can only view stores for your assigned company",
          };
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
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.STORE_READ),
      ],
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
        const storeExists = await prisma.store.findUnique({
          where: { store_id: params.storeId },
        });

        if (!storeExists) {
          reply.code(404);
          return {
            error: "Not found",
            message: "Store not found",
          };
        }

        // Get user's company_id for isolation check
        const userCompanyId = await getUserCompanyId(user.id);
        if (!userCompanyId) {
          reply.code(403);
          return {
            error: "Forbidden",
            message: "You must have a COMPANY scope role to access stores",
          };
        }

        // Get store (service will verify company isolation)
        const store = await storeService.getStoreById(
          params.storeId,
          userCompanyId,
        );

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
                gps: {
                  type: "object",
                  properties: {
                    lat: {
                      type: "number",
                      minimum: -90,
                      maximum: 90,
                      description: "GPS latitude",
                    },
                    lng: {
                      type: "number",
                      minimum: -180,
                      maximum: 180,
                      description: "GPS longitude",
                    },
                  },
                  required: ["lat", "lng"],
                },
              },
              description: "Store location (address and/or GPS coordinates)",
            },
            timezone: {
              type: "string",
              pattern: "^[A-Z][a-z]+(\\/[A-Z][a-z_]+)+$|^UTC$|^GMT(\\+|-)\\d+$",
              description:
                "IANA timezone format (e.g., America/New_York, Europe/London)",
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
            gps?: { lat: number; lng: number };
          };
          timezone?: string;
          status?: "ACTIVE" | "INACTIVE" | "CLOSED";
        };
        const user = (request as any).user as UserIdentity;

        // Check if store exists FIRST (before permission check)
        // This ensures we return 404 for non-existent stores, not 403
        const storeExists = await prisma.store.findUnique({
          where: { store_id: params.storeId },
        });

        if (!storeExists) {
          reply.code(404);
          return {
            error: "Not found",
            message: "Store not found",
          };
        }

        // Get user's company_id for isolation check
        const userCompanyId = await getUserCompanyId(user.id);
        if (!userCompanyId) {
          reply.code(403);
          return {
            error: "Forbidden",
            message: "You must have a COMPANY scope role to update stores",
          };
        }

        // Get old values before update
        const oldStore = await storeService.getStoreById(
          params.storeId,
          userCompanyId,
        );

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
              old_values: oldStore as any,
              new_values: store as any,
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
   * DELETE /api/stores/:storeId
   * Soft delete store (set status to INACTIVE or CLOSED)
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
        description: "Soft delete store",
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
              status: { type: "string" },
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
        const storeExists = await prisma.store.findUnique({
          where: { store_id: params.storeId },
        });

        if (!storeExists) {
          reply.code(404);
          return {
            error: "Not found",
            message: "Store not found",
          };
        }

        // Get user's company_id for isolation check
        const userCompanyId = await getUserCompanyId(user.id);
        if (!userCompanyId) {
          reply.code(403);
          return {
            error: "Forbidden",
            message: "You must have a COMPANY scope role to delete stores",
          };
        }

        // Get old values before soft delete
        const oldStore = await storeService.getStoreById(
          params.storeId,
          userCompanyId,
        );

        // Soft delete store (service will verify company isolation)
        const store = await storeService.deleteStore(
          params.storeId,
          userCompanyId,
        );

        // Log store deletion to AuditLog (BLOCKING)
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
              record_id: store.store_id,
              old_values: oldStore as any,
              new_values: store as any,
              ip_address: ipAddress,
              user_agent: userAgent,
              reason: `Store deleted by ${user.email} (roles: ${user.roles.join(", ")})`,
            },
          });
        } catch (auditError) {
          // If audit log fails, revert the soft delete and fail the request
          await storeService.updateStore(params.storeId, userCompanyId, {
            status: oldStore.status as any,
          });
          throw new Error("Failed to create audit log - operation rolled back");
        }

        reply.code(200);
        return {
          store_id: store.store_id,
          company_id: store.company_id,
          name: store.name,
          status: store.status,
          updated_at: store.updated_at,
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
        reply.code(500);
        return {
          error: "Internal server error",
          message: "Failed to delete store",
        };
      }
    },
  );
}
