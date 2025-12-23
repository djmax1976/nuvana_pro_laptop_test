/**
 * POS Integration Routes
 *
 * API endpoints for managing POS system connections and synchronization.
 * Phase 1.6: POS Integration & Auto-Onboarding
 *
 * Routes:
 * - GET    /api/stores/:storeId/pos-integration           - Get POS integration details
 * - POST   /api/stores/:storeId/pos-integration           - Create POS integration
 * - PATCH  /api/stores/:storeId/pos-integration           - Update POS integration
 * - DELETE /api/stores/:storeId/pos-integration           - Delete POS integration
 * - POST   /api/stores/:storeId/pos-integration/test      - Test POS connection
 * - POST   /api/stores/:storeId/pos-integration/sync      - Trigger manual sync
 * - GET    /api/stores/:storeId/pos-integration/logs      - Get sync history
 *
 * @module routes/pos-integrations
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { permissionMiddleware } from "../middleware/permission.middleware";
import {
  POS_CONNECTION_READ,
  POS_CONNECTION_MANAGE,
  POS_SYNC_TRIGGER,
  POS_SYNC_LOG_READ,
} from "../constants/permissions";
import { posSyncService } from "../services/pos/pos-sync.service";
import { prisma } from "../utils/db";
import {
  StoreIdParamSchema,
  POSIntegrationCreateSchema,
  POSIntegrationUpdateSchema,
  POSSyncLogQuerySchema,
  POSSyncTriggerSchema,
} from "../schemas/pos-integration.schema";
import { Prisma, type POSAuthType } from "@prisma/client";

/**
 * Verify user has access to the store
 * Returns the store if access is granted, throws otherwise
 */
async function verifyStoreAccess(
  storeId: string,
  user: UserIdentity,
): Promise<{ store_id: string; company_id: string }> {
  const store = await prisma.store.findUnique({
    where: { store_id: storeId },
    select: { store_id: true, company_id: true },
  });

  if (!store) {
    throw { statusCode: 404, message: "Store not found" };
  }

  // System admin has access to all stores
  if (user.is_system_admin) {
    return store;
  }

  // Check if user has access to this store
  const hasAccess =
    user.store_ids?.includes(storeId) ||
    user.company_ids?.includes(store.company_id) ||
    user.client_id === store.company_id;

  if (!hasAccess) {
    throw { statusCode: 403, message: "Access denied to this store" };
  }

  return store;
}

/**
 * Sanitize integration for response (remove sensitive data)
 */
function sanitizeIntegration(integration: any): any {
  const { auth_credentials, ...safe } = integration;
  return {
    ...safe,
    has_credentials: !!auth_credentials,
  };
}

/**
 * Map API schema fields to service input fields
 */
function mapToServiceInput(body: any, storeId: string) {
  return {
    storeId,
    posType: body.pos_type,
    posName: body.connection_name,
    host: body.host,
    port: body.port,
    useSsl: body.use_ssl,
    timeout: body.timeout_ms,
    authType: mapAuthType(body.auth_type),
    authCredentials: body.credentials
      ? mapCredentials(body.credentials)
      : undefined,
    syncEnabled: body.sync_enabled,
    syncIntervalMins: body.sync_interval_minutes,
    syncDepartments: body.sync_departments,
    syncTenderTypes: body.sync_tender_types,
    syncCashiers: body.sync_cashiers,
    syncTaxRates: body.sync_tax_rates,
  };
}

/**
 * Map API auth type to Prisma enum
 */
function mapAuthType(authType: string): POSAuthType {
  const mapping: Record<string, POSAuthType> = {
    NONE: "NONE",
    API_KEY: "API_KEY",
    BASIC_AUTH: "BASIC_AUTH",
    OAUTH2: "OAUTH2",
    CERTIFICATE: "CERTIFICATE",
    CUSTOM: "CUSTOM",
  };
  return mapping[authType] || "NONE";
}

/**
 * Map API credentials to service format
 */
function mapCredentials(creds: any): Record<string, unknown> {
  switch (creds.type) {
    case "API_KEY":
      return {
        apiKey: creds.api_key,
        headerName: creds.header_name,
      };
    case "BASIC_AUTH":
      return {
        username: creds.username,
        password: creds.password,
      };
    case "OAUTH2":
      return {
        clientId: creds.client_id,
        clientSecret: creds.client_secret,
        tokenUrl: creds.token_url,
        scope: creds.scope,
      };
    case "CERTIFICATE":
      return {
        certPath: creds.certificate,
        keyPath: creds.private_key,
        passphrase: creds.passphrase,
      };
    default:
      return {};
  }
}

/**
 * Register POS integration routes
 */
export async function posIntegrationRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * GET /api/stores/:storeId/pos-integration
   * Get POS integration details for a store
   *
   * Requires: POS_CONNECTION_READ permission
   */
  fastify.get(
    "/",
    {
      preHandler: [authMiddleware, permissionMiddleware(POS_CONNECTION_READ)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = StoreIdParamSchema.safeParse(request.params);

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        const { storeId } = paramsResult.data;
        await verifyStoreAccess(storeId, user);

        const integration = await prisma.pOSIntegration.findUnique({
          where: { store_id: storeId },
        });

        if (!integration) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "No POS integration found for this store",
            },
          });
        }

        return reply.send({
          success: true,
          data: sanitizeIntegration(integration),
        });
      } catch (error: any) {
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        console.error("[POS Integration GET] Error:", error);
        request.log.error(error, "Failed to get POS integration");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to get POS integration",
          },
        });
      }
    },
  );

  /**
   * POST /api/stores/:storeId/pos-integration
   * Create a new POS integration for a store
   *
   * Requires: POS_CONNECTION_MANAGE permission
   */
  fastify.post(
    "/",
    {
      preHandler: [authMiddleware, permissionMiddleware(POS_CONNECTION_MANAGE)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = StoreIdParamSchema.safeParse(request.params);
        const bodyResult = POSIntegrationCreateSchema.safeParse(request.body);

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
              details: bodyResult.error.issues,
            },
          });
        }

        const { storeId } = paramsResult.data;
        await verifyStoreAccess(storeId, user);

        // Check if integration already exists
        const existing = await prisma.pOSIntegration.findUnique({
          where: { store_id: storeId },
        });

        if (existing) {
          return reply.code(409).send({
            success: false,
            error: {
              code: "ALREADY_EXISTS",
              message:
                "POS integration already exists for this store. Use PATCH to update.",
            },
          });
        }

        const input = mapToServiceInput(bodyResult.data, storeId);
        const integration = await posSyncService.createIntegration(
          input,
          user.id,
        );

        return reply.code(201).send({
          success: true,
          data: sanitizeIntegration(integration),
          message: "POS integration created successfully",
        });
      } catch (error: any) {
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to create POS integration");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to create POS integration",
          },
        });
      }
    },
  );

  /**
   * PATCH /api/stores/:storeId/pos-integration
   * Update an existing POS integration
   *
   * Requires: POS_CONNECTION_MANAGE permission
   */
  fastify.patch(
    "/",
    {
      preHandler: [authMiddleware, permissionMiddleware(POS_CONNECTION_MANAGE)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = StoreIdParamSchema.safeParse(request.params);
        const bodyResult = POSIntegrationUpdateSchema.safeParse(request.body);

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

        const { storeId } = paramsResult.data;
        await verifyStoreAccess(storeId, user);

        // Get existing integration
        const existing = await prisma.pOSIntegration.findUnique({
          where: { store_id: storeId },
        });

        if (!existing) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "No POS integration found for this store",
            },
          });
        }

        const updateData: any = {};
        const body = bodyResult.data;

        if (body.connection_name !== undefined)
          updateData.posName = body.connection_name;
        if (body.host !== undefined) updateData.host = body.host;
        if (body.port !== undefined) updateData.port = body.port;
        if (body.use_ssl !== undefined) updateData.useSsl = body.use_ssl;
        if (body.timeout_ms !== undefined) updateData.timeout = body.timeout_ms;
        if (body.auth_type !== undefined)
          updateData.authType = mapAuthType(body.auth_type);
        if (body.credentials !== undefined)
          updateData.authCredentials = mapCredentials(body.credentials);
        if (body.sync_enabled !== undefined)
          updateData.syncEnabled = body.sync_enabled;
        if (body.sync_interval_minutes !== undefined)
          updateData.syncIntervalMins = body.sync_interval_minutes;
        if (body.sync_departments !== undefined)
          updateData.syncDepartments = body.sync_departments;
        if (body.sync_tender_types !== undefined)
          updateData.syncTenderTypes = body.sync_tender_types;
        if (body.sync_cashiers !== undefined)
          updateData.syncCashiers = body.sync_cashiers;
        if (body.sync_tax_rates !== undefined)
          updateData.syncTaxRates = body.sync_tax_rates;
        if (body.is_active !== undefined) updateData.isActive = body.is_active;

        const integration = await posSyncService.updateIntegration(
          existing.pos_integration_id,
          updateData,
        );

        return reply.send({
          success: true,
          data: sanitizeIntegration(integration),
          message: "POS integration updated successfully",
        });
      } catch (error: any) {
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to update POS integration");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to update POS integration",
          },
        });
      }
    },
  );

  /**
   * DELETE /api/stores/:storeId/pos-integration
   * Delete (deactivate) a POS integration
   *
   * Requires: POS_CONNECTION_MANAGE permission
   */
  fastify.delete(
    "/",
    {
      preHandler: [authMiddleware, permissionMiddleware(POS_CONNECTION_MANAGE)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = StoreIdParamSchema.safeParse(request.params);

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        const { storeId } = paramsResult.data;
        await verifyStoreAccess(storeId, user);

        // Get existing integration
        const existing = await prisma.pOSIntegration.findUnique({
          where: { store_id: storeId },
        });

        if (!existing) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "No POS integration found for this store",
            },
          });
        }

        // Soft delete by setting is_active to false and clearing credentials
        await prisma.pOSIntegration.update({
          where: { pos_integration_id: existing.pos_integration_id },
          data: {
            is_active: false,
            sync_enabled: false,
            auth_credentials: Prisma.JsonNull, // Clear sensitive data
          },
        });

        return reply.send({
          success: true,
          message: "POS integration deactivated successfully",
        });
      } catch (error: any) {
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to delete POS integration");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to delete POS integration",
          },
        });
      }
    },
  );

  /**
   * POST /api/stores/:storeId/pos-integration/test
   * Test POS connection
   *
   * Requires: POS_CONNECTION_MANAGE permission
   */
  fastify.post(
    "/test",
    {
      preHandler: [authMiddleware, permissionMiddleware(POS_CONNECTION_MANAGE)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = StoreIdParamSchema.safeParse(request.params);

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        const { storeId } = paramsResult.data;
        await verifyStoreAccess(storeId, user);

        // Get existing integration
        const existing = await prisma.pOSIntegration.findUnique({
          where: { store_id: storeId },
        });

        if (!existing) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "No POS integration found for this store",
            },
          });
        }

        const result = await posSyncService.testConnection(
          existing.pos_integration_id,
        );

        return reply.send({
          success: result.success,
          data: {
            connected: result.success,
            message: result.message,
            posVersion: result.posVersion,
            latencyMs: result.latencyMs,
            errorCode: result.errorCode,
          },
        });
      } catch (error: any) {
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to test POS connection");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to test POS connection",
          },
        });
      }
    },
  );

  /**
   * POST /api/stores/:storeId/pos-integration/sync
   * Trigger a manual sync
   *
   * Requires: POS_SYNC_TRIGGER permission
   */
  fastify.post(
    "/sync",
    {
      preHandler: [authMiddleware, permissionMiddleware(POS_SYNC_TRIGGER)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = StoreIdParamSchema.safeParse(request.params);
        const bodyResult = POSSyncTriggerSchema.safeParse(request.body || {});

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

        const { storeId } = paramsResult.data;
        await verifyStoreAccess(storeId, user);

        // Get existing integration
        const existing = await prisma.pOSIntegration.findUnique({
          where: { store_id: storeId },
        });

        if (!existing) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "No POS integration found for this store",
            },
          });
        }

        if (!existing.is_active) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "INTEGRATION_INACTIVE",
              message: "POS integration is inactive",
            },
          });
        }

        const syncOptions = bodyResult.data;
        const result = await posSyncService.triggerSync(storeId, {
          triggeredBy: user.id,
          departments: syncOptions.sync_departments,
          tenderTypes: syncOptions.sync_tender_types,
          cashiers: syncOptions.sync_cashiers,
          taxRates: syncOptions.sync_tax_rates,
        });

        return reply.send({
          success: result.success,
          data: {
            status: result.status,
            durationMs: result.durationMs,
            departments: result.departments,
            tenderTypes: result.tenderTypes,
            taxRates: result.taxRates,
            errors: result.errors,
          },
        });
      } catch (error: any) {
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to trigger POS sync");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to trigger POS sync",
          },
        });
      }
    },
  );

  /**
   * GET /api/stores/:storeId/pos-integration/logs
   * Get sync history for a store
   *
   * Requires: POS_SYNC_LOG_READ permission
   */
  fastify.get(
    "/logs",
    {
      preHandler: [authMiddleware, permissionMiddleware(POS_SYNC_LOG_READ)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = StoreIdParamSchema.safeParse(request.params);
        const queryResult = POSSyncLogQuerySchema.safeParse(request.query);

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        if (!queryResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: queryResult.error.issues[0].message,
            },
          });
        }

        const { storeId } = paramsResult.data;
        await verifyStoreAccess(storeId, user);

        // Get existing integration
        const existing = await prisma.pOSIntegration.findUnique({
          where: { store_id: storeId },
        });

        if (!existing) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "No POS integration found for this store",
            },
          });
        }

        const { limit, offset, status, from_date, to_date } = queryResult.data;

        // Build where clause
        const where: any = {
          pos_integration_id: existing.pos_integration_id,
        };

        if (status) {
          where.status = status;
        }

        if (from_date) {
          where.started_at = { gte: new Date(from_date) };
        }

        if (to_date) {
          where.started_at = {
            ...where.started_at,
            lte: new Date(to_date),
          };
        }

        // Get logs with pagination
        const [logs, total] = await Promise.all([
          prisma.pOSSyncLog.findMany({
            where,
            orderBy: { started_at: "desc" },
            take: limit,
            skip: offset,
            include: {
              triggered_by_user: {
                select: {
                  user_id: true,
                  email: true,
                  name: true,
                },
              },
            },
          }),
          prisma.pOSSyncLog.count({ where }),
        ]);

        return reply.send({
          success: true,
          data: logs,
          pagination: {
            total,
            limit,
            offset,
            hasMore: offset + logs.length < total,
          },
        });
      } catch (error: any) {
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to get POS sync logs");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to get POS sync logs",
          },
        });
      }
    },
  );
}
