/**
 * Tax Rate Routes
 *
 * API endpoints for managing tax rates.
 * Phase 1.3: Shift & Day Summary Implementation Plan
 *
 * Routes:
 * - GET    /api/config/tax-rates           - List all tax rates
 * - GET    /api/config/tax-rates/:id       - Get single tax rate
 * - POST   /api/config/tax-rates           - Create client-specific tax rate
 * - PATCH  /api/config/tax-rates/:id       - Update tax rate
 * - DELETE /api/config/tax-rates/:id       - Soft delete (set is_active=false)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { permissionMiddleware } from "../middleware/permission.middleware";
import { PERMISSIONS } from "../constants/permissions";
import {
  taxRateService,
  TaxRateNotFoundError,
  TaxRateCodeExistsError,
  SystemTaxRateError,
  OverlappingDateRangeError,
} from "../services/tax-rate.service";
import {
  TaxRateCreateSchema,
  TaxRateUpdateSchema,
  TaxRateQuerySchema,
} from "../schemas/tax-rate.schema";
import { z } from "zod";

/**
 * ID param schema
 */
const TaxRateIdSchema = z.object({
  id: z.string().uuid("Invalid tax rate ID"),
});

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
 * Register tax rate routes
 */
export async function taxRateRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/config/tax-rates
   * List all tax rates for the authenticated user's scope
   *
   * Requires: TAX_RATE_READ permission
   */
  fastify.get(
    "/",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.TAX_RATE_READ),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const queryResult = TaxRateQuerySchema.safeParse(request.query);

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
          jurisdiction_level,
          effective_date,
          include_store,
        } = queryResult.data;

        // Get client_id from user or query param (for system admins)
        let clientId = getClientIdFromUser(user);
        if (queryResult.data.client_id && user.is_system_admin) {
          // System admin can filter by specific client_id
          clientId = queryResult.data.client_id;
        }

        // Get store_id from query if provided
        const storeId = queryResult.data.store_id || null;

        const taxRates = await taxRateService.list({
          client_id: clientId,
          store_id: storeId,
          include_inactive,
          include_system,
          jurisdiction_level,
          effective_date,
          include_store,
        });

        return reply.send({
          success: true,
          data: taxRates,
        });
      } catch (error) {
        request.log.error(error, "Failed to list tax rates");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to list tax rates",
          },
        });
      }
    },
  );

  /**
   * GET /api/config/tax-rates/:id
   * Get a single tax rate by ID
   *
   * Requires: TAX_RATE_READ permission
   */
  fastify.get(
    "/:id",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.TAX_RATE_READ),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const paramsResult = TaxRateIdSchema.safeParse(request.params);

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        const taxRate = await taxRateService.getById(
          paramsResult.data.id,
          true,
        );

        if (!taxRate) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Tax rate not found",
            },
          });
        }

        return reply.send({
          success: true,
          data: taxRate,
        });
      } catch (error) {
        request.log.error(error, "Failed to get tax rate");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to get tax rate",
          },
        });
      }
    },
  );

  /**
   * POST /api/config/tax-rates
   * Create a new client-specific tax rate
   *
   * Requires: TAX_RATE_MANAGE permission
   */
  fastify.post(
    "/",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.TAX_RATE_MANAGE),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const bodyResult = TaxRateCreateSchema.safeParse(request.body);

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
                "Cannot create tax rate without a client context. System admins must specify a client_id.",
            },
          });
        }

        const taxRate = await taxRateService.create(
          bodyResult.data,
          clientId,
          user.id,
        );

        return reply.code(201).send({
          success: true,
          data: taxRate,
        });
      } catch (error) {
        if (error instanceof TaxRateCodeExistsError) {
          return reply.code(409).send({
            success: false,
            error: {
              code: "DUPLICATE_CODE",
              message: error.message,
            },
          });
        }

        if (error instanceof OverlappingDateRangeError) {
          return reply.code(409).send({
            success: false,
            error: {
              code: "OVERLAPPING_DATES",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to create tax rate");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to create tax rate",
          },
        });
      }
    },
  );

  /**
   * PATCH /api/config/tax-rates/:id
   * Update an existing tax rate
   *
   * Requires: TAX_RATE_MANAGE permission
   */
  fastify.patch(
    "/:id",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.TAX_RATE_MANAGE),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const paramsResult = TaxRateIdSchema.safeParse(request.params);
        const bodyResult = TaxRateUpdateSchema.safeParse(request.body);

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

        // Verify user has access to this tax rate
        const user = (request as any).user as UserIdentity;
        const clientId = getClientIdFromUser(user);
        const existing = await taxRateService.getById(paramsResult.data.id);

        if (!existing) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Tax rate not found",
            },
          });
        }

        // Check access: client can only update their own rates, system admins can update any
        if (
          clientId !== null &&
          existing.client_id !== clientId &&
          !existing.is_system
        ) {
          return reply.code(403).send({
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "Cannot update tax rate from another client",
            },
          });
        }

        const taxRate = await taxRateService.update(
          paramsResult.data.id,
          bodyResult.data,
        );

        return reply.send({
          success: true,
          data: taxRate,
        });
      } catch (error) {
        if (error instanceof TaxRateNotFoundError) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: error.message,
            },
          });
        }

        if (error instanceof SystemTaxRateError) {
          return reply.code(403).send({
            success: false,
            error: {
              code: "FORBIDDEN",
              message: error.message,
            },
          });
        }

        if (error instanceof OverlappingDateRangeError) {
          return reply.code(409).send({
            success: false,
            error: {
              code: "OVERLAPPING_DATES",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to update tax rate");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to update tax rate",
          },
        });
      }
    },
  );

  /**
   * DELETE /api/config/tax-rates/:id
   * Soft delete (deactivate) a tax rate
   *
   * Requires: TAX_RATE_MANAGE permission
   */
  fastify.delete(
    "/:id",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.TAX_RATE_MANAGE),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const paramsResult = TaxRateIdSchema.safeParse(request.params);

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        // Verify user has access to this tax rate
        const user = (request as any).user as UserIdentity;
        const clientId = getClientIdFromUser(user);
        const existing = await taxRateService.getById(paramsResult.data.id);

        if (!existing) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Tax rate not found",
            },
          });
        }

        // Check access: client can only delete their own rates
        if (clientId !== null && existing.client_id !== clientId) {
          return reply.code(403).send({
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "Cannot delete tax rate from another client",
            },
          });
        }

        const taxRate = await taxRateService.deactivate(paramsResult.data.id);

        return reply.send({
          success: true,
          data: taxRate,
          message: "Tax rate deactivated successfully",
        });
      } catch (error) {
        if (error instanceof TaxRateNotFoundError) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: error.message,
            },
          });
        }

        if (error instanceof SystemTaxRateError) {
          return reply.code(403).send({
            success: false,
            error: {
              code: "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to delete tax rate");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to delete tax rate",
          },
        });
      }
    },
  );
}
