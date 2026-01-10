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
import { optionalElevatedAccessMiddleware } from "../middleware/elevated-access.middleware";
import {
  POS_CONNECTION_READ,
  POS_CONNECTION_MANAGE,
  POS_SYNC_TRIGGER,
  POS_SYNC_LOG_READ,
} from "../constants/permissions";
import { posSyncService } from "../services/pos/pos-sync.service";
import {
  startWatcherForStore,
  stopWatcherForStore,
  restartWatcherForStore,
} from "../services/pos/file-watcher-autostart.service";
import { prisma } from "../utils/db";
import {
  StoreIdParamSchema,
  POSIntegrationCreateSchema,
  POSIntegrationUpdateSchema,
  POSSyncLogQuerySchema,
  POSSyncTriggerSchema,
  POSConnectionTestSchema,
} from "../schemas/pos-integration.schema";
import { Prisma, type POSAuthType, type POSSystemType } from "@prisma/client";

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
  // Check both is_system_admin flag and SUPERADMIN role for backwards compatibility
  // (older JWTs may not have is_system_admin flag)
  if (user.is_system_admin || user.roles?.includes("SUPERADMIN")) {
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
  // eslint-disable-next-line security/detect-object-injection -- authType validated by Object.hasOwn
  return Object.hasOwn(mapping, authType) ? mapping[authType] : "NONE";
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
   * Security Standards:
   * - SEC-010: AUTHZ - Authorization via permissionMiddleware + optionalElevatedAccessMiddleware
   * - SEC-012: SESSION_TIMEOUT - Elevation tokens expire in 5 minutes
   *
   * Requires: POS_CONNECTION_READ permission
   * Optional: Elevation token via X-Elevation-Token header for step-up auth
   *
   * The elevation token allows a user who re-authenticated to access the page
   * even if their original session doesn't have store access.
   */
  fastify.get(
    "/",
    {
      preHandler: [
        authMiddleware,
        optionalElevatedAccessMiddleware(POS_CONNECTION_READ),
        permissionMiddleware(POS_CONNECTION_READ),
      ],
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
   * Security Standards:
   * - SEC-010: AUTHZ - Authorization via permissionMiddleware + optionalElevatedAccessMiddleware
   * - SEC-012: SESSION_TIMEOUT - Elevation tokens expire in 5 minutes
   *
   * Requires: POS_CONNECTION_MANAGE permission
   * Optional: Elevation token via X-Elevation-Token header for step-up auth
   */
  fastify.post(
    "/",
    {
      preHandler: [
        authMiddleware,
        optionalElevatedAccessMiddleware(POS_CONNECTION_MANAGE),
        permissionMiddleware(POS_CONNECTION_MANAGE),
      ],
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

        // Auto-start file watcher for file-based POS integrations (Gilbarco NAXML, etc.)
        // This ensures transaction data polling begins immediately after setup
        // File-based POS types that use XMLGateway/file exchange
        const fileBasedPosTypes = [
          "GILBARCO_PASSPORT",
          "GILBARCO_NAXML",
          "GILBARCO_COMMANDER",
          "VERIFONE_COMMANDER",
          "VERIFONE_RUBY2",
        ];
        const isFileBasedConnection = fileBasedPosTypes.includes(
          bodyResult.data.pos_type,
        );

        if (isFileBasedConnection && integration.sync_enabled) {
          try {
            const watcherResult = await startWatcherForStore(storeId);
            console.log(
              `[POS Integration] File watcher ${watcherResult.success ? "started" : "failed"} for store ${storeId}: ${watcherResult.message}`,
            );
          } catch (watcherError) {
            // Log error but don't fail the integration creation
            console.error(
              `[POS Integration] Failed to start file watcher for store ${storeId}:`,
              watcherError,
            );
          }
        }

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
   * Security Standards:
   * - SEC-010: AUTHZ - Authorization via permissionMiddleware + optionalElevatedAccessMiddleware
   * - SEC-012: SESSION_TIMEOUT - Elevation tokens expire in 5 minutes
   *
   * Requires: POS_CONNECTION_MANAGE permission
   * Optional: Elevation token via X-Elevation-Token header for step-up auth
   */
  fastify.patch(
    "/",
    {
      preHandler: [
        authMiddleware,
        optionalElevatedAccessMiddleware(POS_CONNECTION_MANAGE),
        permissionMiddleware(POS_CONNECTION_MANAGE),
      ],
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
        // File paths for file-based POS systems (Gilbarco NAXML, etc.)
        // export_path maps to xml_gateway_path (BOOutbox)
        // import_path maps to host field for file-based connections (BOInbox)
        if (body.export_path !== undefined)
          updateData.xmlGatewayPath = body.export_path;
        if (body.import_path !== undefined) updateData.host = body.import_path;
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

        // Restart file watcher if paths or sync settings changed
        // This ensures the watcher uses updated paths and polling intervals
        const pathsOrSyncChanged =
          updateData.xmlGatewayPath !== undefined ||
          updateData.host !== undefined ||
          updateData.syncEnabled !== undefined ||
          updateData.isActive !== undefined;

        if (pathsOrSyncChanged) {
          try {
            // Determine if integration should have active watcher
            const shouldWatch =
              integration.is_active &&
              integration.sync_enabled &&
              (integration.xml_gateway_path || integration.host);

            if (shouldWatch) {
              const watcherResult = await restartWatcherForStore(storeId);
              console.log(
                `[POS Integration] File watcher restarted for store ${storeId}: ${watcherResult.message}`,
              );
            } else {
              // Stop watcher if integration is no longer active or sync disabled
              await stopWatcherForStore(storeId);
              console.log(
                `[POS Integration] File watcher stopped for store ${storeId}`,
              );
            }
          } catch (watcherError) {
            // Log error but don't fail the update
            console.error(
              `[POS Integration] Failed to update file watcher for store ${storeId}:`,
              watcherError,
            );
          }
        }

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
   * Security Standards:
   * - SEC-010: AUTHZ - Authorization via permissionMiddleware + optionalElevatedAccessMiddleware
   * - SEC-012: SESSION_TIMEOUT - Elevation tokens expire in 5 minutes
   *
   * Requires: POS_CONNECTION_MANAGE permission
   * Optional: Elevation token via X-Elevation-Token header for step-up auth
   */
  fastify.delete(
    "/",
    {
      preHandler: [
        authMiddleware,
        optionalElevatedAccessMiddleware(POS_CONNECTION_MANAGE),
        permissionMiddleware(POS_CONNECTION_MANAGE),
      ],
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

        // Stop file watcher before deactivating integration
        try {
          await stopWatcherForStore(storeId);
          console.log(
            `[POS Integration] File watcher stopped for store ${storeId} (integration deleted)`,
          );
        } catch (watcherError) {
          // Log but don't fail deletion
          console.error(
            `[POS Integration] Failed to stop file watcher for store ${storeId}:`,
            watcherError,
          );
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
   * Supports two modes:
   * 1. Empty body: Test existing saved integration (requires integration to exist)
   * 2. Body with config: Test new configuration before saving (pre-save validation)
   *
   * This enables the setup wizard flow where users test connection BEFORE saving.
   *
   * Security Standards:
   * - SEC-010: AUTHZ - Authorization via permissionMiddleware + optionalElevatedAccessMiddleware
   * - SEC-012: SESSION_TIMEOUT - Elevation tokens expire in 5 minutes
   * - SEC-014: INPUT_VALIDATION - Zod schema validation for all inputs
   * - API-001: VALIDATION - Schema validation before business logic
   * - API-003: ERROR_HANDLING - Generic errors, no sensitive data leakage
   * - API-009: IDOR - Store access verified via verifyStoreAccess
   *
   * Requires: POS_CONNECTION_MANAGE permission
   * Optional: Elevation token via X-Elevation-Token header for step-up auth
   */
  fastify.post(
    "/test",
    {
      preHandler: [
        authMiddleware,
        optionalElevatedAccessMiddleware(POS_SYNC_TRIGGER),
        permissionMiddleware(POS_CONNECTION_MANAGE),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;

        // SEC-014: Validate store ID parameter
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

        // API-009: IDOR - Verify user has access to this store
        await verifyStoreAccess(storeId, user);

        // SEC-014: Validate optional request body
        // Empty body or undefined = test existing integration
        // Body with config = test pre-save configuration
        const body = request.body;
        const hasConfigInBody =
          body !== null &&
          body !== undefined &&
          typeof body === "object" &&
          Object.keys(body).length > 0;

        if (hasConfigInBody) {
          // MODE 2: Test pre-save configuration (wizard flow)
          // SEC-014: Strict schema validation for connection test config
          const bodyResult = POSConnectionTestSchema.safeParse(body);

          if (!bodyResult.success) {
            return reply.code(400).send({
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: bodyResult.error.issues[0].message,
                details: bodyResult.error.issues.map((issue) => ({
                  path: issue.path.join("."),
                  message: issue.message,
                })),
              },
            });
          }

          const config = bodyResult.data;

          // config is guaranteed to be defined here because hasConfigInBody is true
          // and validation passed
          if (!config) {
            return reply.code(400).send({
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Invalid configuration provided",
              },
            });
          }

          // Map credentials if provided
          let credentials: Record<string, unknown> = {};
          if (config.credentials) {
            credentials = mapCredentials(config.credentials);
          }

          // For file-based POS systems, use export_path as host if provided
          // This allows testing file paths for Gilbarco NAXML, Verifone, etc.
          const effectiveHost = config.export_path || config.host;

          // Test connection with provided config (before saving)
          const result = await posSyncService.testConnectionConfig(
            config.pos_type as POSSystemType,
            effectiveHost,
            config.port ?? 8080,
            config.use_ssl ?? true,
            mapAuthType(config.auth_type ?? "NONE"),
            credentials,
          );

          return reply.send({
            success: result.success,
            data: {
              connected: result.success,
              message: result.message,
              posVersion: result.posVersion,
              latencyMs: result.latencyMs,
              errorCode: result.errorCode,
              preview: result.preview,
            },
          });
        } else {
          // MODE 1: Test existing saved integration
          // SEC-006: Parameterized query via Prisma ORM
          const existing = await prisma.pOSIntegration.findUnique({
            where: { store_id: storeId },
          });

          if (!existing) {
            return reply.code(404).send({
              success: false,
              error: {
                code: "NOT_FOUND",
                message:
                  "No POS integration found for this store. Provide connection configuration in request body to test before saving.",
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
              preview: result.preview,
            },
          });
        }
      } catch (error: any) {
        // API-003: ERROR_HANDLING - Return generic errors, log details server-side
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        // Log full error server-side for debugging
        request.log.error(error, "Failed to test POS connection");

        // Return generic error to client
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
   * Security Standards:
   * - SEC-010: AUTHZ - Authorization via permissionMiddleware + optionalElevatedAccessMiddleware
   * - SEC-012: SESSION_TIMEOUT - Elevation tokens expire in 5 minutes
   *
   * Requires: POS_SYNC_TRIGGER permission
   * Optional: Elevation token via X-Elevation-Token header for step-up auth
   */
  fastify.post(
    "/sync",
    {
      preHandler: [
        authMiddleware,
        optionalElevatedAccessMiddleware(POS_SYNC_TRIGGER),
        permissionMiddleware(POS_SYNC_TRIGGER),
      ],
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
   * Security Standards:
   * - SEC-010: AUTHZ - Authorization via permissionMiddleware + optionalElevatedAccessMiddleware
   * - SEC-012: SESSION_TIMEOUT - Elevation tokens expire in 5 minutes
   *
   * Requires: POS_SYNC_LOG_READ permission
   * Optional: Elevation token via X-Elevation-Token header for step-up auth
   */
  fastify.get(
    "/logs",
    {
      preHandler: [
        authMiddleware,
        optionalElevatedAccessMiddleware(POS_SYNC_LOG_READ),
        permissionMiddleware(POS_SYNC_LOG_READ),
      ],
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
