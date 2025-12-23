import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { permissionMiddleware } from "../middleware/permission.middleware";
import { PERMISSIONS } from "../constants/permissions";
import { storeService } from "../services/store.service";
import { rbacService } from "../services/rbac.service";
import { z } from "zod";
import { OperatingHours } from "../services/store.service";
import { prisma } from "../utils/db";

/**
 * Get user's accessible stores based on RBAC scope
 * @param userId - User ID
 * @returns Object with company_id and store_ids arrays for filtering
 */
async function getUserStoreAccess(userId: string): Promise<{
  isSystemAdmin: boolean;
  companyIds: string[];
  storeIds: string[];
}> {
  const userRoles = await rbacService.getUserRoles(userId);

  // Check for SYSTEM scope (System Admin)
  const hasSystemScope = userRoles.some((role) => role.scope === "SYSTEM");
  if (hasSystemScope) {
    return { isSystemAdmin: true, companyIds: [], storeIds: [] };
  }

  // Collect company_ids and store_ids from user's roles
  const companyIds = new Set<string>();
  const storeIds = new Set<string>();

  for (const role of userRoles) {
    if (role.company_id) {
      companyIds.add(role.company_id);
    }
    if (role.store_id) {
      storeIds.add(role.store_id);
    }
  }

  return {
    isSystemAdmin: false,
    companyIds: Array.from(companyIds),
    storeIds: Array.from(storeIds),
  };
}

// UUID validation helper
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

/**
 * Zod schema for operating hours
 */
const dayOperatingHoursSchema = z.object({
  open: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: "Time must be in HH:mm format (e.g., 09:00)",
  }),
  close: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: "Time must be in HH:mm format (e.g., 17:00)",
  }),
  closed: z.boolean().optional(),
});

/**
 * Zod schema for updating store settings
 */
const updateStoreSettingsSchema = z.object({
  address: z
    .string()
    .max(500, "Address cannot exceed 500 characters")
    .optional(),
  timezone: z
    .string()
    .max(50, "Timezone cannot exceed 50 characters")
    .optional(),
  contact_email: z
    .string()
    .email("Invalid email format")
    .max(255, "Email cannot exceed 255 characters")
    .optional()
    .nullable(),
  operating_hours: z
    .object({
      monday: dayOperatingHoursSchema.optional(),
      tuesday: dayOperatingHoursSchema.optional(),
      wednesday: dayOperatingHoursSchema.optional(),
      thursday: dayOperatingHoursSchema.optional(),
      friday: dayOperatingHoursSchema.optional(),
      saturday: dayOperatingHoursSchema.optional(),
      sunday: dayOperatingHoursSchema.optional(),
    })
    .optional(),
});

/**
 * Validation middleware for PUT /api/client/stores/:storeId/settings
 * Validates request body using Zod schema before authentication/authorization checks
 */
async function validateUpdateStoreSettingsBody(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parseResult = updateStoreSettingsSchema.safeParse(request.body);
  if (!parseResult.success) {
    reply.code(400);
    reply.send({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parseResult.error.issues[0].message,
      },
    });
    return;
  }
  // Attach validated data to request for use in handler
  (request as any).validatedBody = parseResult.data;
}

/**
 * Client Store Settings Routes
 *
 * Provides endpoints for managing store settings in the client dashboard.
 * All endpoints require:
 * - Authentication
 * - Client user status (is_client_user = true)
 * - Appropriate permissions (STORE_READ, STORE_UPDATE)
 *
 * Clients can only:
 * - View settings for stores they own (via company.owner_user_id)
 * - Update settings for stores they own
 */
export async function clientStoreRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/client/stores
   * List stores accessible to the authenticated client user
   *
   * Returns stores based on user's RBAC scope:
   * - System Admin: All stores
   * - Company scope: All stores in user's companies
   * - Store scope: Only specific stores assigned to user
   *
   * @security Requires STORE_READ permission
   * @returns List of stores with company info
   */
  fastify.get(
    "/api/client/stores",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.STORE_READ),
      ],
      schema: {
        description: "List stores accessible to the authenticated client user",
        tags: ["client-stores"],
        querystring: {
          type: "object",
          properties: {
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 100,
              default: 50,
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
              success: { type: "boolean" },
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
                      nullable: true,
                    },
                    timezone: { type: "string" },
                    status: { type: "string" },
                    configuration: {
                      type: "object",
                      additionalProperties: true,
                      nullable: true,
                    },
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
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as unknown as { user: UserIdentity }).user;
        const query = request.query as { limit?: number; offset?: number };
        const limit = query.limit || 50;
        const offset = query.offset || 0;

        // Get user's store access based on RBAC
        const access = await getUserStoreAccess(user.id);

        // Build where clause based on access level
        // Note: Store uses status field, not deleted_at
        let whereClause: any = { status: { not: "DELETED" } };

        if (!access.isSystemAdmin) {
          if (access.companyIds.length > 0 && access.storeIds.length > 0) {
            // User has both company and store-level access
            whereClause.OR = [
              { company_id: { in: access.companyIds } },
              { store_id: { in: access.storeIds } },
            ];
          } else if (access.companyIds.length > 0) {
            // User has company-level access only
            whereClause.company_id = { in: access.companyIds };
          } else if (access.storeIds.length > 0) {
            // User has store-level access only
            whereClause.store_id = { in: access.storeIds };
          } else {
            // User has no store access
            return reply.code(200).send({
              success: true,
              data: [],
              meta: { total: 0, limit, offset },
            });
          }
        }

        // Get stores with company info
        const [stores, total] = await Promise.all([
          prisma.store.findMany({
            where: whereClause,
            skip: offset,
            take: limit,
            orderBy: [{ name: "asc" }, { store_id: "asc" }],
            include: {
              company: {
                select: {
                  name: true,
                },
              },
            },
          }),
          prisma.store.count({ where: whereClause }),
        ]);

        return reply.code(200).send({
          success: true,
          data: stores,
          meta: { total, limit, offset },
        });
      } catch (error: unknown) {
        fastify.log.error({ error }, "Error listing client stores");

        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to list stores",
          },
        });
      }
    },
  );

  /**
   * GET /api/client/stores/:storeId/settings
   * Get store settings (name, address, timezone, contact_email, operating_hours)
   *
   * @security Requires STORE_READ permission or CLIENT_OWNER/STORE_MANAGER role
   * @param storeId - Store UUID
   * @returns Store settings data
   */
  fastify.get(
    "/api/client/stores/:storeId/settings",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.STORE_READ),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as unknown as { user: UserIdentity }).user;
        const { storeId } = request.params as { storeId: string };

        // Validate storeId format
        if (!isValidUUID(storeId)) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid store ID format",
            },
          };
        }

        const settings = await storeService.getStoreSettings(storeId, user.id);

        reply.code(200);
        return {
          success: true,
          data: settings,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error retrieving store settings");

        // Handle authorization errors
        if (
          message.includes("Forbidden") ||
          message.includes("can only access")
        ) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: "You can only access settings for stores you own",
            },
          };
        }

        // Handle not found errors
        if (message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Store not found",
            },
          };
        }

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to retrieve store settings",
          },
        };
      }
    },
  );

  /**
   * PUT /api/client/stores/:storeId/settings
   * Update store settings (address, timezone, contact_email, operating_hours)
   *
   * @security Requires STORE_UPDATE permission or CLIENT_OWNER/STORE_MANAGER role
   * @param storeId - Store UUID
   * @body { address?, timezone?, contact_email?, operating_hours? }
   * @returns Updated store data
   */
  fastify.put(
    "/api/client/stores/:storeId/settings",
    {
      preHandler: [
        validateUpdateStoreSettingsBody, // Validation runs BEFORE auth to ensure 400 for invalid input
        authMiddleware,
        permissionMiddleware(PERMISSIONS.STORE_UPDATE),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as unknown as { user: UserIdentity }).user;
        const { storeId } = request.params as { storeId: string };

        // Validate storeId format
        if (!isValidUUID(storeId)) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid store ID format",
            },
          };
        }

        // Get validated body from middleware (already validated in preHandler)
        const { address, timezone, contact_email, operating_hours } = (
          request as any
        ).validatedBody;

        // Get old store configuration for audit logging
        const oldStore = await prisma.store.findUnique({
          where: { store_id: storeId },
          select: {
            store_id: true,
            name: true,
            configuration: true,
          },
        });

        if (!oldStore) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Store not found",
            },
          };
        }

        const store = await storeService.updateStoreSettings(storeId, user.id, {
          address,
          timezone,
          contact_email,
          operating_hours: operating_hours as OperatingHours | undefined,
        });

        // Create audit log entry (non-blocking - don't fail if audit fails)
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
              action: "STORE_SETTINGS_UPDATED",
              table_name: "stores",
              record_id: store.store_id,
              old_values: {
                configuration: oldStore.configuration,
              } as Record<string, any>,
              new_values: {
                configuration: store.configuration,
              } as Record<string, any>,
              ip_address: ipAddress,
              user_agent: userAgent,
              reason: `Store settings updated by ${user.email} (roles: ${user.roles.join(", ")}) - Store: ${store.name}`,
            },
          });
        } catch (auditError) {
          fastify.log.error(
            { error: auditError },
            "Failed to create audit log for store settings update",
          );
        }

        reply.code(200);
        return {
          success: true,
          data: store,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error updating store settings");

        // Handle validation errors
        if (
          message.includes("Invalid") ||
          message.includes("must be") ||
          message.includes("format") ||
          message.includes("required")
        ) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message,
            },
          };
        }

        // Handle authorization errors
        if (
          message.includes("Forbidden") ||
          message.includes("can only update")
        ) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: "You can only update settings for stores you own",
            },
          };
        }

        // Handle not found errors
        if (message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Store not found",
            },
          };
        }

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to update store settings",
          },
        };
      }
    },
  );
}
