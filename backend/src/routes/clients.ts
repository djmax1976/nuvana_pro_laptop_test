import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { permissionMiddleware } from "../middleware/permission.middleware";
import { PERMISSIONS } from "../constants/permissions";
import { clientService, AuditContext } from "../services/client.service";
import { ClientStatus } from "../types/client.types";

// UUID validation helper - accepts standard UUIDs including nil UUID
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

// Zod validation schemas
const createClientSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name cannot exceed 255 characters"),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

const updateClientSchema = z.object({
  name: z
    .string()
    .min(1, "Name cannot be empty")
    .max(255, "Name cannot exceed 255 characters")
    .optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

const listClientsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

/**
 * Helper to extract audit context from request
 */
function getAuditContext(
  request: FastifyRequest,
  user: UserIdentity,
): AuditContext {
  const ipAddress =
    (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
    request.ip ||
    request.socket.remoteAddress ||
    null;
  const userAgent = request.headers["user-agent"] || null;

  return {
    userId: user.id,
    userEmail: user.email,
    userRoles: user.roles,
    ipAddress,
    userAgent,
  };
}

/**
 * Client management routes
 * Provides CRUD operations for clients with RBAC enforcement
 * All routes require ADMIN_SYSTEM_CONFIG permission (System Admin only)
 */
export async function clientRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/clients
   * Create a new client
   */
  fastify.post(
    "/api/clients",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as unknown as { user: UserIdentity }).user;

        // Validate request body
        const parseResult = createClientSchema.safeParse(request.body);
        if (!parseResult.success) {
          reply.code(400);
          return {
            success: false,
            error: "Validation error",
            message: parseResult.error.issues[0].message,
          };
        }

        const { name, status, metadata } = parseResult.data;
        const auditContext = getAuditContext(request, user);

        const client = await clientService.createClient(
          {
            name,
            status: status as ClientStatus | undefined,
            metadata: metadata ?? undefined,
          },
          auditContext,
        );

        reply.code(201);
        return {
          success: true,
          data: client,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error creating client");

        if (
          message.includes("required") ||
          message.includes("Invalid") ||
          message.includes("cannot exceed")
        ) {
          reply.code(400);
          return {
            success: false,
            error: "Validation error",
            message,
          };
        }

        reply.code(500);
        return {
          success: false,
          error: "Internal server error",
          message: "Failed to create client",
        };
      }
    },
  );

  /**
   * GET /api/clients
   * List all clients with pagination, search, and filtering
   */
  fastify.get(
    "/api/clients",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Validate query parameters
        const parseResult = listClientsQuerySchema.safeParse(request.query);
        if (!parseResult.success) {
          reply.code(400);
          return {
            success: false,
            error: "Validation error",
            message: parseResult.error.issues[0].message,
          };
        }

        const { page, limit, search, status } = parseResult.data;

        const result = await clientService.getClients({
          page,
          limit,
          search,
          status: status as ClientStatus | undefined,
        });

        reply.code(200);
        return {
          success: true,
          data: result.data,
          meta: {
            page: result.meta.page,
            limit: result.meta.limit,
            total: result.meta.total,
            totalPages: result.meta.totalPages,
          },
        };
      } catch (error) {
        fastify.log.error({ error }, "Error fetching clients");
        reply.code(500);
        return {
          success: false,
          error: "Internal server error",
          message: "Failed to fetch clients",
        };
      }
    },
  );

  /**
   * GET /api/clients/:clientId
   * Get client by ID with company count
   */
  fastify.get(
    "/api/clients/:clientId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { clientId } = request.params as { clientId: string };

        // Validate UUID format
        if (!isValidUUID(clientId)) {
          reply.code(400);
          return {
            success: false,
            error: "Invalid client ID",
            message: "Client ID must be a valid UUID",
          };
        }

        const client = await clientService.getClientById(clientId);

        reply.code(200);
        return {
          success: true,
          data: client,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error fetching client");

        if (message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: "Not found",
            message: `Client not found`,
          };
        }

        reply.code(500);
        return {
          success: false,
          error: "Internal server error",
          message: "Failed to fetch client",
        };
      }
    },
  );

  /**
   * PUT /api/clients/:clientId
   * Update client
   */
  fastify.put(
    "/api/clients/:clientId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { clientId } = request.params as { clientId: string };
        const user = (request as unknown as { user: UserIdentity }).user;

        // Validate UUID format
        if (!isValidUUID(clientId)) {
          reply.code(400);
          return {
            success: false,
            error: "Invalid client ID",
            message: "Client ID must be a valid UUID",
          };
        }

        // Validate request body
        const parseResult = updateClientSchema.safeParse(request.body);
        if (!parseResult.success) {
          reply.code(400);
          return {
            success: false,
            error: "Validation error",
            message: parseResult.error.issues[0].message,
          };
        }

        const { name, status, metadata } = parseResult.data;
        const auditContext = getAuditContext(request, user);

        const client = await clientService.updateClient(
          clientId,
          {
            name,
            status: status as ClientStatus | undefined,
            metadata: metadata ?? undefined,
          },
          auditContext,
        );

        reply.code(200);
        return {
          success: true,
          data: client,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error updating client");

        if (message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: "Not found",
            message: "Client not found",
          };
        }

        if (
          message.includes("cannot be empty") ||
          message.includes("Invalid") ||
          message.includes("cannot exceed")
        ) {
          reply.code(400);
          return {
            success: false,
            error: "Validation error",
            message,
          };
        }

        reply.code(500);
        return {
          success: false,
          error: "Internal server error",
          message: "Failed to update client",
        };
      }
    },
  );

  /**
   * DELETE /api/clients/:clientId
   * Soft delete client (requires client to be INACTIVE first)
   */
  fastify.delete(
    "/api/clients/:clientId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { clientId } = request.params as { clientId: string };
        const user = (request as unknown as { user: UserIdentity }).user;

        // Validate UUID format
        if (!isValidUUID(clientId)) {
          reply.code(400);
          return {
            success: false,
            error: "Invalid client ID",
            message: "Client ID must be a valid UUID",
          };
        }

        const auditContext = getAuditContext(request, user);

        const client = await clientService.softDeleteClient(
          clientId,
          auditContext,
        );

        reply.code(200);
        return {
          success: true,
          data: client,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error deleting client");

        if (message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: "Not found",
            message: "Client not found",
          };
        }

        if (message.includes("ACTIVE client")) {
          reply.code(400);
          return {
            success: false,
            error: "Cannot delete active client",
            message,
          };
        }

        reply.code(500);
        return {
          success: false,
          error: "Internal server error",
          message: "Failed to delete client",
        };
      }
    },
  );
}
