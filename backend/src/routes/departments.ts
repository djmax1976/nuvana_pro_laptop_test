/**
 * Department Routes
 *
 * API endpoints for managing departments (product categories).
 * Phase 1.2: Shift & Day Summary Implementation Plan
 *
 * Routes:
 * - GET    /api/config/departments           - List all departments
 * - GET    /api/config/departments/tree      - Get hierarchical department tree
 * - GET    /api/config/departments/:id       - Get single department
 * - POST   /api/config/departments           - Create client-specific department
 * - PATCH  /api/config/departments/:id       - Update department
 * - DELETE /api/config/departments/:id       - Soft delete (set is_active=false)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { permissionMiddleware } from "../middleware/permission.middleware";
import { PERMISSIONS } from "../constants/permissions";
import {
  departmentService,
  DepartmentNotFoundError,
  DepartmentCodeExistsError,
  SystemDepartmentError,
  CircularHierarchyError,
} from "../services/department.service";
import {
  DepartmentCreateSchema,
  DepartmentUpdateSchema,
  DepartmentQuerySchema,
  DepartmentIdSchema,
} from "../schemas/department.schema";

/**
 * Get client_id (company_id) from the authenticated user
 * Uses JWT claims for efficient access without database queries
 *
 * Priority:
 * 1. System admin (is_system_admin) - returns null for system-wide access
 * 2. client_id from JWT (for CLIENT_OWNER)
 * 3. First company_id from JWT company_ids array
 */
function getClientIdFromUser(user: UserIdentity): string | null {
  // System admins have system-wide access (no client filter)
  if (user.is_system_admin) {
    return null;
  }

  // CLIENT_OWNER has client_id in JWT
  if (user.client_id) {
    return user.client_id;
  }

  // For company-scoped users, use first company_id
  if (user.company_ids && user.company_ids.length > 0) {
    return user.company_ids[0];
  }

  // No company context available
  return null;
}

/**
 * Register department routes
 */
export async function departmentRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * GET /api/config/departments
   * List all departments for the authenticated user's scope
   *
   * Requires: DEPARTMENT_READ permission
   */
  fastify.get(
    "/",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.DEPARTMENT_READ),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const queryResult = DepartmentQuerySchema.safeParse(request.query);

        if (!queryResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: queryResult.error.issues[0].message,
            },
          });
        }

        const {
          include_inactive,
          include_system,
          parent_id,
          is_lottery,
          include_children,
        } = queryResult.data;

        // Get client_id from user or query param (for system admins)
        let clientId = getClientIdFromUser(user);
        if (queryResult.data.client_id && user.is_system_admin) {
          // System admin can filter by specific client_id
          clientId = queryResult.data.client_id;
        }

        const departments = await departmentService.list({
          client_id: clientId,
          include_inactive,
          include_system,
          parent_id,
          is_lottery,
          include_children,
        });

        return reply.send({
          success: true,
          data: departments,
        });
      } catch (error) {
        request.log.error(error, "Failed to list departments");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to list departments",
          },
        });
      }
    },
  );

  /**
   * GET /api/config/departments/tree
   * Get hierarchical department tree
   *
   * Requires: DEPARTMENT_READ permission
   */
  fastify.get(
    "/tree",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.DEPARTMENT_READ),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const clientId = getClientIdFromUser(user);

        const tree = await departmentService.getTree(
          clientId ?? undefined,
          true,
        );

        return reply.send({
          success: true,
          data: tree,
        });
      } catch (error) {
        request.log.error(error, "Failed to get department tree");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to get department tree",
          },
        });
      }
    },
  );

  /**
   * GET /api/config/departments/:id
   * Get a single department by ID
   *
   * Requires: DEPARTMENT_READ permission
   */
  fastify.get(
    "/:id",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.DEPARTMENT_READ),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const paramsResult = DepartmentIdSchema.safeParse(request.params);

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        const department = await departmentService.getById(
          paramsResult.data.id,
          true,
        );

        if (!department) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Department not found",
            },
          });
        }

        return reply.send({
          success: true,
          data: department,
        });
      } catch (error) {
        request.log.error(error, "Failed to get department");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to get department",
          },
        });
      }
    },
  );

  /**
   * POST /api/config/departments
   * Create a new client-specific department
   *
   * Requires: DEPARTMENT_MANAGE permission
   */
  fastify.post(
    "/",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.DEPARTMENT_MANAGE),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const bodyResult = DepartmentCreateSchema.safeParse(request.body);

        if (!bodyResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: bodyResult.error.issues[0].message,
            },
          });
        }

        const clientId = getClientIdFromUser(user);
        if (!clientId) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "CLIENT_REQUIRED",
              message:
                "Cannot create department without a client context. System admins must specify a client_id.",
            },
          });
        }

        const department = await departmentService.create(
          bodyResult.data,
          clientId,
          user.id,
        );

        return reply.code(201).send({
          success: true,
          data: department,
        });
      } catch (error) {
        if (error instanceof DepartmentCodeExistsError) {
          return reply.code(409).send({
            success: false,
            error: {
              code: "DUPLICATE_CODE",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to create department");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to create department",
          },
        });
      }
    },
  );

  /**
   * PATCH /api/config/departments/:id
   * Update an existing department
   *
   * Requires: DEPARTMENT_MANAGE permission
   */
  fastify.patch(
    "/:id",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.DEPARTMENT_MANAGE),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const paramsResult = DepartmentIdSchema.safeParse(request.params);
        const bodyResult = DepartmentUpdateSchema.safeParse(request.body);

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        if (!bodyResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: bodyResult.error.issues[0].message,
            },
          });
        }

        // Verify user has access to this department
        const user = (request as any).user as UserIdentity;
        const clientId = getClientIdFromUser(user);
        const existing = await departmentService.getById(paramsResult.data.id);

        if (!existing) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Department not found",
            },
          });
        }

        // Check access: client can only update their own types, system admins can update any
        if (
          clientId !== null &&
          existing.client_id !== clientId &&
          !existing.is_system
        ) {
          return reply.code(403).send({
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "Cannot update department from another client",
            },
          });
        }

        const department = await departmentService.update(
          paramsResult.data.id,
          bodyResult.data,
        );

        return reply.send({
          success: true,
          data: department,
        });
      } catch (error) {
        if (error instanceof DepartmentNotFoundError) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: error.message,
            },
          });
        }

        if (error instanceof SystemDepartmentError) {
          return reply.code(403).send({
            success: false,
            error: {
              code: "FORBIDDEN",
              message: error.message,
            },
          });
        }

        if (error instanceof CircularHierarchyError) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "CIRCULAR_HIERARCHY",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to update department");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to update department",
          },
        });
      }
    },
  );

  /**
   * DELETE /api/config/departments/:id
   * Soft delete (deactivate) a department
   *
   * Requires: DEPARTMENT_MANAGE permission
   */
  fastify.delete(
    "/:id",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.DEPARTMENT_MANAGE),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const paramsResult = DepartmentIdSchema.safeParse(request.params);

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        // Verify user has access to this department
        const user = (request as any).user as UserIdentity;
        const clientId = getClientIdFromUser(user);
        const existing = await departmentService.getById(paramsResult.data.id);

        if (!existing) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Department not found",
            },
          });
        }

        // Check access: client can only delete their own types
        if (clientId !== null && existing.client_id !== clientId) {
          return reply.code(403).send({
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "Cannot delete department from another client",
            },
          });
        }

        const department = await departmentService.deactivate(
          paramsResult.data.id,
        );

        return reply.send({
          success: true,
          data: department,
          message: "Department deactivated successfully",
        });
      } catch (error) {
        if (error instanceof DepartmentNotFoundError) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: error.message,
            },
          });
        }

        if (error instanceof SystemDepartmentError) {
          return reply.code(403).send({
            success: false,
            error: {
              code: "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to delete department");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to delete department",
          },
        });
      }
    },
  );
}
