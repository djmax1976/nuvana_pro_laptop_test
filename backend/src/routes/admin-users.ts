import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { permissionMiddleware } from "../middleware/permission.middleware";
import { PERMISSIONS } from "../constants/permissions";
import {
  userAdminService,
  AuditContext,
  UserStatus,
  ScopeType,
} from "../services/user-admin.service";
import {
  createUserSchema,
  strictRoleAssignmentSchema,
  updateUserStatusSchema,
  listUsersQuerySchema,
} from "../schemas/user.schema";

// UUID validation helper - accepts standard UUIDs including nil UUID
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

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
 * Admin user management routes
 * Provides CRUD operations for users and role assignment with RBAC enforcement
 * All routes require ADMIN_SYSTEM_CONFIG permission (System Admin only)
 */
export async function adminUserRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/admin/users
   * Create a new user with optional initial role assignments
   */
  fastify.post(
    "/api/admin/users",
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
        const parseResult = createUserSchema.safeParse(request.body);
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

        const {
          email,
          name,
          password,
          roles,
          companyName,
          companyAddress,
          company_id,
          store_id,
        } = parseResult.data;

        const auditContext = getAuditContext(request, user);

        const createdUser = await userAdminService.createUser(
          {
            email,
            name,
            password,
            roles: roles as Array<{
              role_id: string;
              scope_type: ScopeType;
              company_id?: string;
              store_id?: string;
            }>,
            companyName,
            companyAddress,
            company_id,
            store_id,
          },
          auditContext,
        );

        reply.code(201);
        reply.send({
          success: true,
          data: createdUser,
        });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error creating user");

        // 409 Conflict for duplicate email
        if (message.includes("already exists")) {
          reply.code(409);
          reply.send({
            success: false,
            error: {
              code: "CONFLICT",
              message,
            },
          });
          return;
        }

        if (
          message.includes("Invalid email") ||
          message.includes("required") ||
          message.includes("whitespace") ||
          message.includes("scope requires") ||
          message.includes("does not belong") ||
          message.includes("not found") ||
          message.includes("inactive store") ||
          message.includes("inactive company")
        ) {
          reply.code(400);
          reply.send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message,
            },
          });
          return;
        }

        reply.code(500);
        reply.send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to create user",
          },
        });
      }
    },
  );

  /**
   * GET /api/admin/users
   * List all users with pagination, search, and filtering
   */
  fastify.get(
    "/api/admin/users",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Validate query parameters
        const parseResult = listUsersQuerySchema.safeParse(request.query);
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

        const { page, limit, search, status } = parseResult.data;

        const result = await userAdminService.getUsers({
          page,
          limit,
          search,
          status: status as UserStatus | undefined,
        });

        reply.code(200);
        reply.send({
          success: true,
          data: result.data,
          meta: {
            page: result.meta.page,
            limit: result.meta.limit,
            total: result.meta.total,
            totalPages: result.meta.totalPages,
          },
        });
      } catch (error) {
        fastify.log.error({ error }, "Error fetching users");
        reply.code(500);
        reply.send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to fetch users",
          },
        });
      }
    },
  );

  /**
   * GET /api/admin/users/:userId
   * Get user by ID with full role details
   */
  fastify.get(
    "/api/admin/users/:userId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { userId } = request.params as { userId: string };

        // Validate UUID format
        if (!isValidUUID(userId)) {
          reply.code(400);
          return {
            success: false,
            error: "Invalid user ID",
            message: "User ID must be a valid UUID",
          };
        }

        const user = await userAdminService.getUserById(userId);

        reply.code(200);
        return {
          success: true,
          data: user,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error fetching user");

        if (message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: "Not found",
            message: "User not found",
          };
        }

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to fetch user",
          },
        };
      }
    },
  );

  /**
   * PATCH /api/admin/users/:userId/status
   * Update user status (activate/deactivate)
   */
  fastify.patch(
    "/api/admin/users/:userId/status",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { userId } = request.params as { userId: string };
        const user = (request as unknown as { user: UserIdentity }).user;

        // Validate UUID format
        if (!isValidUUID(userId)) {
          reply.code(400);
          reply.send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "User ID must be a valid UUID",
            },
          });
          return;
        }

        // Validate request body
        const parseResult = updateUserStatusSchema.safeParse(request.body);
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

        const { status } = parseResult.data;

        // Prevent self-deactivation: users cannot deactivate their own account
        if (userId === user.id && status === "INACTIVE") {
          reply.code(400);
          reply.send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "You cannot deactivate your own account",
            },
          });
          return;
        }

        const auditContext = getAuditContext(request, user);

        const updatedUser = await userAdminService.updateUserStatus(
          userId,
          status as UserStatus,
          auditContext,
        );

        reply.code(200);
        reply.send({
          success: true,
          data: updatedUser,
        });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error updating user status");

        if (message.includes("not found")) {
          reply.code(404);
          reply.send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "User not found",
            },
          });
          return;
        }

        if (message.includes("Invalid status")) {
          reply.code(400);
          reply.send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message,
            },
          });
          return;
        }

        reply.code(500);
        reply.send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to update user status",
          },
        });
      }
    },
  );

  /**
   * POST /api/admin/users/:userId/roles
   * Assign a role to a user with scope validation
   */
  fastify.post(
    "/api/admin/users/:userId/roles",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { userId } = request.params as { userId: string };
        const user = (request as unknown as { user: UserIdentity }).user;

        // Validate UUID format
        if (!isValidUUID(userId)) {
          reply.code(400);
          reply.send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "User ID must be a valid UUID",
            },
          });
          return;
        }

        // Validate request body - use strict schema for adding roles to existing users
        const parseResult = strictRoleAssignmentSchema.safeParse(request.body);
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

        const roleAssignment = parseResult.data;
        const auditContext = getAuditContext(request, user);

        const userRole = await userAdminService.assignRole(
          userId,
          {
            role_id: roleAssignment.role_id,
            scope_type: roleAssignment.scope_type as ScopeType,
            company_id: roleAssignment.company_id,
            store_id: roleAssignment.store_id,
          },
          auditContext,
        );

        reply.code(201);
        reply.send({
          success: true,
          data: userRole,
        });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error assigning role");

        if (message.includes("not found")) {
          reply.code(404);
          reply.send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message,
            },
          });
          return;
        }

        if (
          message.includes("scope requires") ||
          message.includes("does not belong") ||
          message.includes("Invalid scope") ||
          message.includes("already has this role")
        ) {
          reply.code(400);
          reply.send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message,
            },
          });
          return;
        }

        reply.code(500);
        reply.send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to assign role",
          },
        });
      }
    },
  );

  /**
   * DELETE /api/admin/users/:userId/roles/:userRoleId
   * Revoke a role from a user
   */
  fastify.delete(
    "/api/admin/users/:userId/roles/:userRoleId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { userId, userRoleId } = request.params as {
          userId: string;
          userRoleId: string;
        };
        const user = (request as unknown as { user: UserIdentity }).user;

        // Validate UUID formats
        if (!isValidUUID(userId)) {
          reply.code(400);
          reply.send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "User ID must be a valid UUID",
            },
          });
          return;
        }

        if (!isValidUUID(userRoleId)) {
          reply.code(400);
          reply.send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "User role ID must be a valid UUID",
            },
          });
          return;
        }

        const auditContext = getAuditContext(request, user);

        // Check if this is the user's last role - users must have at least one role
        const userWithRoles = await userAdminService.getUserById(userId);
        if (userWithRoles.roles.length <= 1) {
          reply.code(400);
          reply.send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message:
                "Cannot revoke the user's last role. Users must have at least one role.",
            },
          });
          return;
        }

        await userAdminService.revokeRole(userId, userRoleId, auditContext);

        reply.code(200);
        reply.send({
          success: true,
          message: "Role revoked successfully",
        });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error revoking role");

        if (message.includes("not found")) {
          reply.code(404);
          reply.send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message,
            },
          });
          return;
        }

        if (message.includes("does not belong")) {
          reply.code(400);
          reply.send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message,
            },
          });
          return;
        }

        reply.code(500);
        reply.send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to revoke role",
          },
        });
      }
    },
  );

  /**
   * DELETE /api/admin/users/:userId
   * Permanently delete a user (must be INACTIVE first)
   */
  fastify.delete(
    "/api/admin/users/:userId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { userId } = request.params as { userId: string };
        const user = (request as unknown as { user: UserIdentity }).user;

        // Validate UUID format
        if (!isValidUUID(userId)) {
          reply.code(400);
          reply.send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "User ID must be a valid UUID",
            },
          });
          return;
        }

        // Prevent self-deletion
        if (userId === user.id) {
          reply.code(400);
          reply.send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "You cannot delete your own account",
            },
          });
          return;
        }

        const auditContext = getAuditContext(request, user);

        const deletedUser = await userAdminService.deleteUser(
          userId,
          auditContext,
        );

        reply.code(200);
        reply.send({
          success: true,
          data: deletedUser,
          message: "User deleted successfully",
        });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error deleting user");

        if (message.includes("not found")) {
          reply.code(404);
          reply.send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "User not found",
            },
          });
          return;
        }

        if (message.includes("ACTIVE user")) {
          reply.code(400);
          reply.send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message,
            },
          });
          return;
        }

        if (
          message.includes("active company") ||
          message.includes("active store")
        ) {
          reply.code(400);
          reply.send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message,
            },
          });
          return;
        }

        reply.code(500);
        reply.send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to delete user",
          },
        });
      }
    },
  );
}
