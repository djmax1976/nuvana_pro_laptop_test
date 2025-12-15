import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { permissionMiddleware } from "../middleware/permission.middleware";
import { PERMISSIONS } from "../constants/permissions";
import {
  clientEmployeeService,
  AuditContext,
} from "../services/client-employee.service";
import { z } from "zod";

// UUID validation helper
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

/**
 * Zod schema for creating an employee
 */
const createEmployeeSchema = z.object({
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
  store_id: z.string().uuid("Invalid store ID format"),
  role_id: z.string().uuid("Invalid role ID format"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(255, "Password cannot exceed 255 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(
      /[!@#$%^&*(),.?":{}|<>]/,
      "Password must contain at least one special character",
    )
    .optional(),
});

/**
 * Zod schema for list query parameters
 */
const listEmployeesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  store_id: z.string().uuid("Invalid store ID format").optional(),
});

/**
 * Validation middleware for POST /api/client/employees
 * Validates request body using Zod schema before authentication/authorization checks
 * This ensures input validation errors (400) are returned before auth errors (403)
 */
async function validateCreateEmployeeBody(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parseResult = createEmployeeSchema.safeParse(request.body);
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
 * Client Employee Management Routes
 *
 * Provides CRUD operations for client-managed employees.
 * All endpoints require:
 * - Authentication
 * - Client user status (is_client_user = true)
 * - Appropriate CLIENT_EMPLOYEE permissions
 *
 * Clients can only:
 * - Create employees with STORE scope roles
 * - Assign employees to their owned stores only
 * - View employees in their owned stores only
 * - Delete employees they created (STORE scope only)
 */
export async function clientEmployeeRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/client/employees
   * Create a new employee for client's store
   *
   * @security Requires CLIENT_EMPLOYEE_CREATE permission
   * @body { email, name, store_id, role_id, password? }
   * @returns Created employee data
   */
  fastify.post(
    "/api/client/employees",
    {
      preHandler: [
        validateCreateEmployeeBody, // Validation runs BEFORE auth to ensure 400 for invalid input
        authMiddleware,
        permissionMiddleware(PERMISSIONS.CLIENT_EMPLOYEE_CREATE),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as unknown as { user: UserIdentity }).user;

        // Get validated body from middleware (already validated in preHandler)
        const { email, name, store_id, role_id, password } = (request as any)
          .validatedBody;
        const auditContext = getAuditContext(request, user);

        const employee = await clientEmployeeService.createEmployee(
          { email, name, store_id, role_id, password },
          user.id,
          auditContext,
        );

        reply.code(201);
        return {
          success: true,
          data: employee,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error creating employee");

        // Handle specific validation errors
        if (
          message.includes("Invalid email") ||
          message.includes("required") ||
          message.includes("whitespace") ||
          message.includes("already exists")
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
          message.includes("does not belong") ||
          message.includes("STORE scope") ||
          message.includes("not allowed")
        ) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message:
                "You can only assign employees to your own stores with STORE scope roles",
            },
          };
        }

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to create employee",
          },
        };
      }
    },
  );

  /**
   * GET /api/client/employees
   * List employees in client's stores with pagination
   *
   * @security Requires CLIENT_EMPLOYEE_READ permission
   * @query { page?, limit?, search?, store_id? }
   * @returns Paginated list of employees
   */
  fastify.get(
    "/api/client/employees",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.CLIENT_EMPLOYEE_READ),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as unknown as { user: UserIdentity }).user;

        // Validate query parameters
        const parseResult = listEmployeesQuerySchema.safeParse(request.query);
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

        const { page, limit, search, store_id } = parseResult.data;

        const result = await clientEmployeeService.getEmployees(user.id, {
          page,
          limit,
          search,
          store_id,
        });

        reply.code(200);
        return {
          success: true,
          data: result.data,
          meta: result.meta,
        };
      } catch (error) {
        fastify.log.error({ error }, "Error fetching employees");
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to fetch employees",
          },
        };
      }
    },
  );

  /**
   * DELETE /api/client/employees/:userId
   * Delete an employee from client's store
   *
   * @security Requires CLIENT_EMPLOYEE_DELETE permission
   * @param userId - Employee user UUID to delete
   * @returns Success message
   */
  fastify.delete(
    "/api/client/employees/:userId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.CLIENT_EMPLOYEE_DELETE),
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
            error: {
              code: "VALIDATION_ERROR",
              message: "User ID must be a valid UUID",
            },
          };
        }

        // Prevent self-deletion
        if (userId === user.id) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "You cannot delete your own account",
            },
          };
        }

        const auditContext = getAuditContext(request, user);

        await clientEmployeeService.deleteEmployee(
          userId,
          user.id,
          auditContext,
        );

        reply.code(200);
        return {
          success: true,
          message: "Employee deleted successfully",
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error deleting employee");

        if (message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Employee not found",
            },
          };
        }

        // Handle authorization errors
        if (
          message.includes("SYSTEM") ||
          message.includes("COMPANY") ||
          message.includes("does not belong") ||
          message.includes("not a store employee")
        ) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message:
                "You can only delete employees with STORE scope roles in your stores",
            },
          };
        }

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to delete employee",
          },
        };
      }
    },
  );

  /**
   * GET /api/client/employees/roles
   * Get available STORE scope roles for employee assignment
   *
   * @security Requires CLIENT_EMPLOYEE_READ permission
   * @returns List of STORE scope roles
   */
  fastify.get(
    "/api/client/employees/roles",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.CLIENT_EMPLOYEE_READ),
      ],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const roles = await clientEmployeeService.getStoreRoles();

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
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to fetch roles",
          },
        };
      }
    },
  );

  /**
   * PUT /api/client/employees/:userId/email
   * Update employee email address
   *
   * @security Requires CLIENT_EMPLOYEE_MANAGE permission
   * @param userId - Employee user UUID
   * @body { email: string }
   * @returns Updated user data
   */
  fastify.put(
    "/api/client/employees/:userId/email",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.CLIENT_EMPLOYEE_MANAGE),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as unknown as { user: UserIdentity }).user;
        const { userId } = request.params as { userId: string };

        // Validate userId format
        if (!isValidUUID(userId)) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "User ID must be a valid UUID",
            },
          };
        }

        // Validate request body
        const bodySchema = z.object({
          email: z
            .string()
            .email("Invalid email format")
            .max(255, "Email cannot exceed 255 characters"),
        });

        const parseResult = bodySchema.safeParse(request.body);
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

        const { email } = parseResult.data;
        const auditContext = getAuditContext(request, user);

        const updatedUser = await clientEmployeeService.updateEmployeeEmail(
          userId,
          email,
          user.id,
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
        fastify.log.error({ error }, "Error updating employee email");

        // Handle validation errors
        if (
          message.includes("Invalid email") ||
          message.includes("already exists") ||
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
          message.includes("does not belong") ||
          message.includes("Forbidden") ||
          message.includes("not a store employee")
        ) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: "You can only update email for employees in your stores",
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
              message: "Employee not found",
            },
          };
        }

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to update employee email",
          },
        };
      }
    },
  );

  /**
   * PUT /api/client/employees/:userId/password
   * Reset employee password
   *
   * @security Requires CLIENT_EMPLOYEE_MANAGE permission
   * @param userId - Employee user UUID
   * @body { password: string }
   * @returns Success message
   */
  fastify.put(
    "/api/client/employees/:userId/password",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.CLIENT_EMPLOYEE_CREATE),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as unknown as { user: UserIdentity }).user;
        const { userId } = request.params as { userId: string };

        // Validate userId format
        if (!isValidUUID(userId)) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "User ID must be a valid UUID",
            },
          };
        }

        // Validate request body
        const bodySchema = z.object({
          password: z
            .string()
            .min(8, "Password must be at least 8 characters")
            .max(255, "Password cannot exceed 255 characters")
            .refine(
              (val) => {
                // Password strength validation: min 8 chars, uppercase, lowercase, number, special char
                const hasUpperCase = /[A-Z]/.test(val);
                const hasLowerCase = /[a-z]/.test(val);
                const hasNumber = /[0-9]/.test(val);
                const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(val);
                return (
                  hasUpperCase && hasLowerCase && hasNumber && hasSpecialChar
                );
              },
              {
                message:
                  "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
              },
            ),
        });

        const parseResult = bodySchema.safeParse(request.body);
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

        const { password } = parseResult.data;
        const auditContext = getAuditContext(request, user);

        await clientEmployeeService.resetEmployeePassword(
          userId,
          password,
          user.id,
          auditContext,
        );

        reply.code(200);
        return {
          success: true,
          message: "Password reset successfully",
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error resetting employee password");

        // Handle validation errors
        if (
          message.includes("Password must") ||
          message.includes("required") ||
          message.includes("must contain")
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
          message.includes("does not belong") ||
          message.includes("Forbidden") ||
          message.includes("not a store employee")
        ) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message:
                "You can only reset passwords for employees in your stores",
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
              message: "Employee not found",
            },
          };
        }

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to reset employee password",
          },
        };
      }
    },
  );
}
