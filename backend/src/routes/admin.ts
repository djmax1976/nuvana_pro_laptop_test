import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware } from "../middleware/auth.middleware";
import { permissionMiddleware } from "../middleware/permission.middleware";
import { PERMISSIONS } from "../constants/permissions";

/**
 * Admin routes with permission middleware examples
 * These routes demonstrate how to use permission middleware
 */
export async function adminRoutes(fastify: FastifyInstance) {
  /**
   * System configuration endpoint - requires ADMIN_SYSTEM_CONFIG permission
   * GET /api/admin/system-config
   * Example of permission middleware usage
   */
  fastify.get(
    "/api/admin/system-config",
    {
      preHandler: [
        authMiddleware, // First authenticate
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG), // Then check permission
      ],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      reply.code(200);
      return {
        message: "System configuration accessed successfully",
        config: {
          // Example system config
        },
      };
    },
  );

  /**
   * Audit log view endpoint - requires ADMIN_AUDIT_VIEW permission
   * GET /api/admin/audit-logs
   * Example of permission middleware usage
   */
  fastify.get(
    "/api/admin/audit-logs",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_AUDIT_VIEW),
      ],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      reply.code(200);
      return {
        message: "Audit logs accessed successfully",
        logs: [],
      };
    },
  );
}
