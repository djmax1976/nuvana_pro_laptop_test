/**
 * TenderType Routes
 *
 * API endpoints for managing tender types (payment methods).
 * Phase 1.1: Shift & Day Summary Implementation Plan
 *
 * Routes:
 * - GET    /api/config/tender-types           - List all tender types
 * - GET    /api/config/tender-types/:id       - Get single tender type
 * - POST   /api/config/tender-types           - Create client-specific tender type
 * - PATCH  /api/config/tender-types/:id       - Update tender type
 * - DELETE /api/config/tender-types/:id       - Soft delete (set is_active=false)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { permissionMiddleware } from "../middleware/permission.middleware";
import { PERMISSIONS } from "../constants/permissions";
import {
  tenderTypeService,
  TenderTypeNotFoundError,
  TenderTypeCodeExistsError,
  SystemTenderTypeError,
} from "../services/tender-type.service";
import {
  TenderTypeCreateSchema,
  TenderTypeUpdateSchema,
  TenderTypeQuerySchema,
  TenderTypeIdSchema,
} from "../schemas/tender-type.schema";

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
 * Register tender type routes
 */
export async function tenderTypeRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * GET /api/config/tender-types
   * List all tender types for the authenticated user's scope
   *
   * Requires: TENDER_TYPE_READ permission
   */
  fastify.get(
    "/",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.TENDER_TYPE_READ),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const queryResult = TenderTypeQuerySchema.safeParse(request.query);

        if (!queryResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: queryResult.error.issues[0].message,
            },
          });
        }

        const { include_inactive, include_system } = queryResult.data;

        // Get client_id from user or query param (for system admins)
        let clientId = getClientIdFromUser(user);
        if (queryResult.data.client_id && user.is_system_admin) {
          // System admin can filter by specific client_id
          clientId = queryResult.data.client_id;
        }

        const tenderTypes = await tenderTypeService.list({
          client_id: clientId,
          include_inactive,
          include_system,
        });

        return reply.send({
          success: true,
          data: tenderTypes,
        });
      } catch (error) {
        request.log.error(error, "Failed to list tender types");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to list tender types",
          },
        });
      }
    },
  );

  /**
   * GET /api/config/tender-types/:id
   * Get a single tender type by ID
   *
   * Requires: TENDER_TYPE_READ permission
   */
  fastify.get(
    "/:id",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.TENDER_TYPE_READ),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const paramsResult = TenderTypeIdSchema.safeParse(request.params);

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        const tenderType = await tenderTypeService.getById(
          paramsResult.data.id,
        );

        if (!tenderType) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Tender type not found",
            },
          });
        }

        return reply.send({
          success: true,
          data: tenderType,
        });
      } catch (error) {
        request.log.error(error, "Failed to get tender type");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to get tender type",
          },
        });
      }
    },
  );

  /**
   * POST /api/config/tender-types
   * Create a new client-specific tender type
   *
   * Requires: TENDER_TYPE_MANAGE permission
   */
  fastify.post(
    "/",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.TENDER_TYPE_MANAGE),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const bodyResult = TenderTypeCreateSchema.safeParse(request.body);

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
                "Cannot create tender type without a client context. System admins must specify a client_id.",
            },
          });
        }

        const tenderType = await tenderTypeService.create(
          bodyResult.data,
          clientId,
          user.id,
        );

        return reply.code(201).send({
          success: true,
          data: tenderType,
        });
      } catch (error) {
        if (error instanceof TenderTypeCodeExistsError) {
          return reply.code(409).send({
            success: false,
            error: {
              code: "DUPLICATE_CODE",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to create tender type");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to create tender type",
          },
        });
      }
    },
  );

  /**
   * PATCH /api/config/tender-types/:id
   * Update an existing tender type
   *
   * Requires: TENDER_TYPE_MANAGE permission
   */
  fastify.patch(
    "/:id",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.TENDER_TYPE_MANAGE),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const paramsResult = TenderTypeIdSchema.safeParse(request.params);
        const bodyResult = TenderTypeUpdateSchema.safeParse(request.body);

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

        // Verify user has access to this tender type
        const user = (request as any).user as UserIdentity;
        const clientId = getClientIdFromUser(user);
        const existing = await tenderTypeService.getById(paramsResult.data.id);

        if (!existing) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Tender type not found",
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
              message: "Cannot update tender type from another client",
            },
          });
        }

        const tenderType = await tenderTypeService.update(
          paramsResult.data.id,
          bodyResult.data,
        );

        return reply.send({
          success: true,
          data: tenderType,
        });
      } catch (error) {
        if (error instanceof TenderTypeNotFoundError) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: error.message,
            },
          });
        }

        if (error instanceof SystemTenderTypeError) {
          return reply.code(403).send({
            success: false,
            error: {
              code: "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to update tender type");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to update tender type",
          },
        });
      }
    },
  );

  /**
   * DELETE /api/config/tender-types/:id
   * Soft delete (deactivate) a tender type
   *
   * Requires: TENDER_TYPE_MANAGE permission
   */
  fastify.delete(
    "/:id",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.TENDER_TYPE_MANAGE),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const paramsResult = TenderTypeIdSchema.safeParse(request.params);

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        // Verify user has access to this tender type
        const user = (request as any).user as UserIdentity;
        const clientId = getClientIdFromUser(user);
        const existing = await tenderTypeService.getById(paramsResult.data.id);

        if (!existing) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Tender type not found",
            },
          });
        }

        // Check access: client can only delete their own types
        if (clientId !== null && existing.client_id !== clientId) {
          return reply.code(403).send({
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "Cannot delete tender type from another client",
            },
          });
        }

        const tenderType = await tenderTypeService.deactivate(
          paramsResult.data.id,
        );

        return reply.send({
          success: true,
          data: tenderType,
          message: "Tender type deactivated successfully",
        });
      } catch (error) {
        if (error instanceof TenderTypeNotFoundError) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: error.message,
            },
          });
        }

        if (error instanceof SystemTenderTypeError) {
          return reply.code(403).send({
            success: false,
            error: {
              code: "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to delete tender type");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to delete tender type",
          },
        });
      }
    },
  );
}
