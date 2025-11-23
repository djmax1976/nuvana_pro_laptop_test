import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { permissionMiddleware } from "../middleware/permission.middleware";
import { PERMISSIONS } from "../constants/permissions";
import { clientService, AuditContext } from "../services/client.service";
import { ClientStatus } from "../types/client.types";
import {
  isValidPublicId,
  validatePrefix,
  PUBLIC_ID_PREFIXES,
} from "../utils/public-id";

const prisma = new PrismaClient();

// UUID validation helper - accepts standard UUIDs including nil UUID
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

/**
 * Resolve client identifier to internal UUID
 * Accepts both UUID (backward compatibility) and public_id (new standard)
 * @param identifier - Either UUID or public_id (clt_xxxxx)
 * @returns Internal client_id (UUID)
 * @throws Error if identifier is invalid or client not found
 */
async function resolveClientId(identifier: string): Promise<string> {
  // Check if it's a UUID (backward compatibility)
  if (isValidUUID(identifier)) {
    return identifier;
  }

  // Check if it's a valid public_id format
  if (
    isValidPublicId(identifier) &&
    validatePrefix(identifier, PUBLIC_ID_PREFIXES.CLIENT)
  ) {
    // Look up the client by public_id
    const client = await prisma.client.findUnique({
      where: { public_id: identifier },
      select: { client_id: true },
    });

    if (!client) {
      throw new Error(`Client with public ID ${identifier} not found`);
    }

    return client.client_id;
  }

  throw new Error(
    "Invalid client identifier format. Must be UUID or public ID (clt_xxxxx)",
  );
}

// Zod validation schemas
const createClientSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name cannot exceed 255 characters"),
  email: z
    .string()
    .email("Invalid email address")
    .max(255, "Email cannot exceed 255 characters"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

const updateClientSchema = z.object({
  name: z
    .string()
    .min(1, "Name cannot be empty")
    .max(255, "Name cannot exceed 255 characters")
    .optional(),
  email: z
    .string()
    .email("Invalid email address")
    .max(255, "Email cannot exceed 255 characters")
    .optional(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
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

        const { name, email, password, status, metadata } = parseResult.data;
        const auditContext = getAuditContext(request, user);

        const client = await clientService.createClient(
          {
            name,
            email,
            password,
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
   * Accepts both UUID (backward compatibility) and public_id (clt_xxxxx)
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
        const { clientId: identifier } = request.params as { clientId: string };

        // Resolve identifier to internal UUID (supports both UUID and public_id)
        const clientId = await resolveClientId(identifier);

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

        if (
          message.includes("not found") ||
          message.includes("Invalid client identifier")
        ) {
          reply.code(404);
          return {
            success: false,
            error: "Not found",
            message: "Client not found",
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
   * Accepts both UUID (backward compatibility) and public_id (clt_xxxxx)
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
        const { clientId: identifier } = request.params as { clientId: string };
        const user = (request as unknown as { user: UserIdentity }).user;

        // Resolve identifier to internal UUID (supports both UUID and public_id)
        const clientId = await resolveClientId(identifier);

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

        const { name, email, password, status, metadata } = parseResult.data;
        const auditContext = getAuditContext(request, user);

        const client = await clientService.updateClient(
          clientId,
          {
            name,
            email,
            password,
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

        if (
          message.includes("not found") ||
          message.includes("Invalid client identifier")
        ) {
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
   * Accepts both UUID (backward compatibility) and public_id (clt_xxxxx)
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
        const { clientId: identifier } = request.params as { clientId: string };
        const user = (request as unknown as { user: UserIdentity }).user;

        // Resolve identifier to internal UUID (supports both UUID and public_id)
        const clientId = await resolveClientId(identifier);

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

        if (
          message.includes("not found") ||
          message.includes("Invalid client identifier")
        ) {
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

  /**
   * GET /api/clients/dropdown
   * Get minimal client data for dropdown selection
   * Returns only active, non-deleted clients with public_id and name
   */
  fastify.get(
    "/api/clients/dropdown",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const clients = await prisma.client.findMany({
          where: {
            status: "ACTIVE",
            deleted_at: null,
          },
          select: {
            client_id: true,
            public_id: true,
            name: true,
          },
          orderBy: {
            name: "asc",
          },
        });

        reply.code(200);
        return {
          success: true,
          data: clients,
        };
      } catch (error) {
        fastify.log.error({ error }, "Error fetching clients for dropdown");
        reply.code(500);
        return {
          success: false,
          error: "Internal server error",
          message: "Failed to fetch clients",
        };
      }
    },
  );
}
