import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/permission.middleware";
import { USER_CREATE, USER_READ, USER_DELETE } from "../constants/permissions";
import { generatePublicId, PUBLIC_ID_PREFIXES } from "../utils/public-id";
import { prisma } from "../utils/db";

/**
 * User management routes
 * Provides CRUD operations for users with RBAC enforcement
 */
export async function userRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/user/profile
   * Get current authenticated user's profile
   * Protected route - requires valid JWT access token
   */
  fastify.get(
    "/api/user/profile",
    { preHandler: authMiddleware },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;

        // Fetch full user details from database
        const userDetails = await prisma.user.findUnique({
          where: { user_id: user.id },
          select: {
            user_id: true,
            email: true,
            name: true,
            auth_provider_id: true,
            status: true,
            created_at: true,
            updated_at: true,
          },
        });

        if (!userDetails) {
          reply.code(404);
          return {
            error: "User not found",
            message: "User profile not found in database",
          };
        }

        reply.code(200);
        return {
          user: userDetails,
        };
      } catch (error) {
        fastify.log.error({ error }, "Error fetching user profile");
        reply.code(500);
        return {
          error: "Internal server error",
          message: "Failed to fetch user profile",
        };
      }
    },
  );

  /**
   * GET /api/users
   * List all users (paginated)
   * Protected route - requires user:read permission
   */
  fastify.get(
    "/api/users",
    { preHandler: [authMiddleware, requirePermission(USER_READ)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = request.query as {
          page?: string;
          limit?: string;
          status?: string;
        };

        const page = parseInt(query.page || "1", 10);
        const limit = parseInt(query.limit || "10", 10);
        const status = query.status;

        const skip = (page - 1) * limit;

        // Build where clause
        const where: any = {};
        if (status) {
          where.status = status;
        }

        // Fetch users with pagination
        const [users, total] = await Promise.all([
          prisma.user.findMany({
            where,
            skip,
            take: limit,
            select: {
              user_id: true,
              email: true,
              name: true,
              status: true,
              created_at: true,
              updated_at: true,
            },
            orderBy: { created_at: "desc" },
          }),
          prisma.user.count({ where }),
        ]);

        reply.code(200);
        return {
          users,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        };
      } catch (error) {
        fastify.log.error({ error }, "Error fetching users");
        reply.code(500);
        return {
          error: "Internal server error",
          message: "Failed to fetch users",
        };
      }
    },
  );

  /**
   * POST /api/users
   * Create a new user
   * Protected route - requires user:create permission
   */
  fastify.post(
    "/api/users",
    { preHandler: [authMiddleware, requirePermission(USER_CREATE)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as {
          email?: string;
          name?: string;
          auth_provider_id?: string;
          status?: string;
        };

        // Validate required fields
        if (!body.email) {
          reply.code(400);
          return {
            error: "Validation error",
            message: "Email is required",
          };
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(body.email)) {
          reply.code(400);
          return {
            error: "Validation error",
            message: "Invalid email format",
          };
        }

        // Validate status if provided
        const validStatuses = ["ACTIVE", "INACTIVE", "SUSPENDED"];
        if (body.status && !validStatuses.includes(body.status)) {
          reply.code(400);
          return {
            error: "Validation error",
            message: "Status must be one of: ACTIVE, INACTIVE, SUSPENDED",
          };
        }

        // Create user
        const user = await prisma.user.create({
          data: {
            public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
            email: body.email,
            name: body.name || body.email.split("@")[0], // Default to email prefix if name not provided
            auth_provider_id: body.auth_provider_id ?? null,
            status:
              (body.status as "ACTIVE" | "INACTIVE" | "SUSPENDED") || "ACTIVE",
          },
          select: {
            user_id: true,
            email: true,
            name: true,
            auth_provider_id: true,
            status: true,
            created_at: true,
            updated_at: true,
          },
        });

        reply.code(201);
        return {
          user,
          message: "User created successfully",
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error creating user");

        // Handle unique constraint violation
        if (error.code === "P2002") {
          reply.code(409);
          return {
            error: "Conflict",
            message: "A user with this email already exists",
          };
        }

        reply.code(500);
        return {
          error: "Internal server error",
          message: "Failed to create user",
        };
      }
    },
  );

  /**
   * GET /api/users/:id
   * Get a specific user by ID
   * Protected route - requires valid JWT access token
   */
  fastify.get(
    "/api/users/:id",
    { preHandler: authMiddleware },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const params = request.params as { id: string };

        // Validate UUID format
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(params.id)) {
          reply.code(400);
          return {
            error: "Validation error",
            message: "Invalid user ID format",
          };
        }

        const user = await prisma.user.findUnique({
          where: {
            user_id: params.id,
          },
          select: {
            user_id: true,
            email: true,
            name: true,
            auth_provider_id: true,
            status: true,
            created_at: true,
            updated_at: true,
          },
        });

        if (!user) {
          reply.code(404);
          return {
            error: "User not found",
            message: "User with the specified ID does not exist",
          };
        }

        reply.code(200);
        return {
          user,
        };
      } catch (error) {
        fastify.log.error({ error }, "Error fetching user");
        reply.code(500);
        return {
          error: "Internal server error",
          message: "Failed to fetch user",
        };
      }
    },
  );

  /**
   * DELETE /api/users/:id
   * Delete a user by ID
   * Protected route - requires user:delete permission
   */
  fastify.delete(
    "/api/users/:id",
    { preHandler: [authMiddleware, requirePermission(USER_DELETE)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const params = request.params as { id: string };
        const currentUser = (request as any).user as UserIdentity;

        // Validate UUID format
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(params.id)) {
          reply.code(400);
          return {
            error: "Validation error",
            message: "Invalid user ID format",
          };
        }

        // Prevent self-deletion
        if (params.id === currentUser.id) {
          reply.code(403);
          return {
            error: "Forbidden",
            message: "Cannot delete your own user account",
          };
        }

        // Check if user exists
        const user = await prisma.user.findUnique({
          where: { user_id: params.id },
        });

        if (!user) {
          reply.code(404);
          return {
            error: "User not found",
            message: "User with the specified ID does not exist",
          };
        }

        // Delete user (cascade deletes will handle related records)
        await prisma.user.delete({
          where: { user_id: params.id },
        });

        reply.code(200);
        return {
          message: "User deleted successfully",
        };
      } catch (error) {
        fastify.log.error({ error }, "Error deleting user");
        reply.code(500);
        return {
          error: "Internal server error",
          message: "Failed to delete user",
        };
      }
    },
  );
}
