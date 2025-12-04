import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { permissionMiddleware } from "../middleware/permission.middleware";
import { PERMISSIONS } from "../constants/permissions";
import {
  clientRolePermissionService,
  AuditContext,
} from "../services/client-role-permission.service";
import { z } from "zod";

// UUID validation regex
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Zod schema for permission update request
 */
const updatePermissionsSchema = z.object({
  permissions: z
    .array(
      z.object({
        permission_id: z.string().uuid("Invalid permission ID format"),
        is_enabled: z.boolean(),
      }),
    )
    .min(1, "At least one permission update is required")
    .max(50, "Cannot update more than 50 permissions at once"),
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
 * Client Role Permission Management Routes
 *
 * Provides endpoints for Client Owners to customize STORE scope role permissions.
 * All endpoints require:
 * - Authentication
 * - CLIENT_ROLE_MANAGE permission
 *
 * Clients can only:
 * - View STORE scope roles (SYSTEM and COMPANY scope roles are hidden)
 * - Modify permissions from CLIENT_ASSIGNABLE_PERMISSIONS list
 * - Reset roles to system defaults
 *
 * All changes are scoped to the client's organization via owner_user_id filtering.
 */
export async function clientRoleRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/client/roles
   * List all STORE scope roles with their current permission configuration
   *
   * @security Requires CLIENT_ROLE_MANAGE permission
   * @returns Array of roles with permission badges
   */
  fastify.get(
    "/api/client/roles",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.CLIENT_ROLE_MANAGE),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as unknown as { user: UserIdentity }).user;

        const roles = await clientRolePermissionService.getClientRoles(user.id);

        return {
          success: true,
          data: roles,
        };
      } catch (error: unknown) {
        fastify.log.error({ error }, "Error fetching client roles");

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to fetch roles. Please try again later.",
          },
        };
      }
    },
  );

  /**
   * GET /api/client/roles/:roleId/permissions
   * Get permission configuration for a specific role
   *
   * @security Requires CLIENT_ROLE_MANAGE permission
   * @param roleId - Role UUID
   * @returns Role with permissions grouped by category
   */
  fastify.get(
    "/api/client/roles/:roleId/permissions",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.CLIENT_ROLE_MANAGE),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { roleId } = request.params as { roleId: string };
      try {
        const user = (request as unknown as { user: UserIdentity }).user;

        // Validate UUID format
        if (!UUID_REGEX.test(roleId)) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid role ID format",
            },
          };
        }

        const role = await clientRolePermissionService.getRolePermissions(
          roleId,
          user.id,
        );

        return {
          success: true,
          data: role,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error fetching role permissions");

        // Handle specific errors
        if (message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Role not found",
            },
          };
        }

        if (message.includes("Only STORE scope")) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "INVALID_SCOPE",
              message: message,
            },
          };
        }

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message:
              "Failed to fetch role permissions. Please try again later.",
          },
        };
      }
    },
  );

  /**
   * PUT /api/client/roles/:roleId/permissions
   * Update permission configuration for a role
   *
   * @security Requires CLIENT_ROLE_MANAGE permission
   * @param roleId - Role UUID
   * @body { permissions: [{ permission_id, is_enabled }] }
   * @returns Updated role with permissions
   */
  fastify.put(
    "/api/client/roles/:roleId/permissions",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.CLIENT_ROLE_MANAGE),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { roleId } = request.params as { roleId: string };
      try {
        const user = (request as unknown as { user: UserIdentity }).user;

        // Validate UUID format
        if (!UUID_REGEX.test(roleId)) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid role ID format",
            },
          };
        }

        // Validate request body
        const parseResult = updatePermissionsSchema.safeParse(request.body);
        if (!parseResult.success) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: parseResult.error.issues[0].message,
            },
          };
        }

        const { permissions } = parseResult.data;
        const auditContext = getAuditContext(request, user);

        const updatedRole =
          await clientRolePermissionService.updateRolePermissions(
            roleId,
            user.id,
            permissions,
            auditContext,
          );

        return {
          success: true,
          data: updatedRole,
          message: "Role permissions updated successfully",
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error updating role permissions");

        // Handle specific errors
        if (message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: message.includes("Permission")
                ? "One or more permissions not found"
                : "Role not found",
            },
          };
        }

        if (message.includes("Only STORE scope")) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "INVALID_SCOPE",
              message: message,
            },
          };
        }

        if (message.includes("restricted")) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "RESTRICTED_PERMISSION",
              message: message,
            },
          };
        }

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message:
              "Failed to update role permissions. Please try again later.",
          },
        };
      }
    },
  );

  /**
   * POST /api/client/roles/:roleId/reset
   * Reset role to system default permissions
   * Removes all client overrides for the specified role
   *
   * @security Requires CLIENT_ROLE_MANAGE permission
   * @param roleId - Role UUID
   * @returns Reset role with default permissions
   */
  fastify.post(
    "/api/client/roles/:roleId/reset",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.CLIENT_ROLE_MANAGE),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { roleId } = request.params as { roleId: string };
      try {
        const user = (request as unknown as { user: UserIdentity }).user;

        // Validate UUID format
        if (!UUID_REGEX.test(roleId)) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid role ID format",
            },
          };
        }

        const auditContext = getAuditContext(request, user);

        const resetRole = await clientRolePermissionService.resetRoleToDefaults(
          roleId,
          user.id,
          auditContext,
        );

        return {
          success: true,
          data: resetRole,
          message: "Role permissions reset to system defaults",
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error resetting role permissions");

        // Handle specific errors
        if (message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Role not found",
            },
          };
        }

        if (message.includes("Only STORE scope")) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "INVALID_SCOPE",
              message: message,
            },
          };
        }

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message:
              "Failed to reset role permissions. Please try again later.",
          },
        };
      }
    },
  );
}
