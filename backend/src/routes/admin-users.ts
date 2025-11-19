import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { permissionMiddleware } from "../middleware/permission.middleware";
import { PERMISSIONS } from "../constants/permissions";
import {
  userAdminService,
  AuditContext,
  UserStatus,
  ScopeType,
} from "../services/user-admin.service";

// UUID validation helper - accepts standard UUIDs including nil UUID
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

// Zod validation schemas for role assignment
const roleAssignmentSchema = z.object({
  role_id: z.string().uuid("Invalid role ID format"),
  scope_type: z.enum(["SYSTEM", "COMPANY", "STORE"]),
  client_id: z.string().uuid("Invalid client ID format").optional(),
  company_id: z.string().uuid("Invalid company ID format").optional(),
  store_id: z.string().uuid("Invalid store ID format").optional(),
});

// Zod validation schemas
const createUserSchema = z.object({
  email: z
    .string()
    .email("Invalid email format")
    .max(255, "Email cannot exceed 255 characters"),
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name cannot exceed 255 characters")
    .refine((val) => val.trim().length > 0, {
      message: "Name cannot be whitespace only",
    }),
  roles: z.array(roleAssignmentSchema).optional(),
});

const updateUserStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

const listUsersQuerySchema = z.object({
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
          return {
            success: false,
            error: "Validation error",
            message: parseResult.error.issues[0].message,
          };
        }

        const { email, name, roles } = parseResult.data;
        const auditContext = getAuditContext(request, user);

        const createdUser = await userAdminService.createUser(
          {
            email,
            name,
            roles: roles as Array<{
              role_id: string;
              scope_type: ScopeType;
              client_id?: string;
              company_id?: string;
              store_id?: string;
            }>,
          },
          auditContext,
        );

        reply.code(201);
        return {
          success: true,
          data: createdUser,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error creating user");

        if (
          message.includes("Invalid email") ||
          message.includes("required") ||
          message.includes("whitespace") ||
          message.includes("already exists") ||
          message.includes("scope requires")
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
          message: "Failed to create user",
        };
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
          return {
            success: false,
            error: "Validation error",
            message: parseResult.error.issues[0].message,
          };
        }

        const { page, limit, search, status } = parseResult.data;

        const result = await userAdminService.getUsers({
          page,
          limit,
          search,
          status: status as UserStatus | undefined,
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
        fastify.log.error({ error }, "Error fetching users");
        reply.code(500);
        return {
          success: false,
          error: "Internal server error",
          message: "Failed to fetch users",
        };
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
          error: "Internal server error",
          message: "Failed to fetch user",
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
          return {
            success: false,
            error: "Invalid user ID",
            message: "User ID must be a valid UUID",
          };
        }

        // Validate request body
        const parseResult = updateUserStatusSchema.safeParse(request.body);
        if (!parseResult.success) {
          reply.code(400);
          return {
            success: false,
            error: "Validation error",
            message: parseResult.error.issues[0].message,
          };
        }

        const { status } = parseResult.data;
        const auditContext = getAuditContext(request, user);

        const updatedUser = await userAdminService.updateUserStatus(
          userId,
          status as UserStatus,
          auditContext,
        );

        reply.code(200);
        return {
          success: true,
          data: updatedUser,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error updating user status");

        if (message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: "Not found",
            message: "User not found",
          };
        }

        if (message.includes("Invalid status")) {
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
          message: "Failed to update user status",
        };
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
          return {
            success: false,
            error: "Invalid user ID",
            message: "User ID must be a valid UUID",
          };
        }

        // Validate request body
        const parseResult = roleAssignmentSchema.safeParse(request.body);
        if (!parseResult.success) {
          reply.code(400);
          return {
            success: false,
            error: "Validation error",
            message: parseResult.error.issues[0].message,
          };
        }

        const roleAssignment = parseResult.data;
        const auditContext = getAuditContext(request, user);

        const userRole = await userAdminService.assignRole(
          userId,
          {
            role_id: roleAssignment.role_id,
            scope_type: roleAssignment.scope_type as ScopeType,
            client_id: roleAssignment.client_id,
            company_id: roleAssignment.company_id,
            store_id: roleAssignment.store_id,
          },
          auditContext,
        );

        reply.code(201);
        return {
          success: true,
          data: userRole,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error assigning role");

        if (message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: "Not found",
            message,
          };
        }

        if (
          message.includes("scope requires") ||
          message.includes("does not belong") ||
          message.includes("Invalid scope") ||
          message.includes("already has this role")
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
          message: "Failed to assign role",
        };
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
          return {
            success: false,
            error: "Invalid user ID",
            message: "User ID must be a valid UUID",
          };
        }

        if (!isValidUUID(userRoleId)) {
          reply.code(400);
          return {
            success: false,
            error: "Invalid user role ID",
            message: "User role ID must be a valid UUID",
          };
        }

        const auditContext = getAuditContext(request, user);

        await userAdminService.revokeRole(userId, userRoleId, auditContext);

        reply.code(200);
        return {
          success: true,
          message: "Role revoked successfully",
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error revoking role");

        if (message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: "Not found",
            message,
          };
        }

        if (message.includes("does not belong")) {
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
          message: "Failed to revoke role",
        };
      }
    },
  );

  /**
   * GET /api/admin/roles
   * Get available roles for dropdown selection
   */
  fastify.get(
    "/api/admin/roles",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const roles = await userAdminService.getRoles();

        reply.code(200);
        return {
          success: true,
          data: roles,
        };
      } catch (error) {
        fastify.log.error({ error }, "Error fetching roles");
        reply.code(500);
        return {
          success: false,
          error: "Internal server error",
          message: "Failed to fetch roles",
        };
      }
    },
  );
}
