import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { permissionMiddleware } from "../middleware/permission.middleware";
import { PERMISSIONS } from "../constants/permissions";
import { prisma } from "../utils/db";
import { rbacService } from "../services/rbac.service";
import {
  parseSerializedNumber,
  InvalidSerialNumberError,
} from "../utils/lottery-serial-parser";
import {
  lookupGameByCode,
  movePackBetweenBins,
} from "../services/lottery.service";
import {
  validateBinTemplate,
  validateStoreId,
} from "../utils/lottery-bin-configuration-validator";
import type { UserRole } from "../services/rbac.service";
import {
  getCalendarDayBoundaries,
  getCurrentStoreDate,
  DEFAULT_STORE_TIMEZONE,
} from "../utils/timezone.utils";
import {
  syncPackActivation,
  syncPackDeactivation,
} from "../services/lottery/pack-pos-sync.service";

/**
 * Validate user has access to a store via SYSTEM, COMPANY, or STORE scope
 * SYSTEM scope: Access to all stores
 * COMPANY scope: Access to all stores in the assigned company
 * STORE scope: Access to specifically assigned stores
 *
 * @param userRoles - User's roles from rbacService.getUserRoles()
 * @param storeId - The store_id to validate access for
 * @param storeCompanyId - The company_id of the store (fetched from DB)
 * @returns true if user has access, false otherwise
 */
function validateUserStoreAccess(
  userRoles: UserRole[],
  storeId: string,
  storeCompanyId: string,
): boolean {
  // SYSTEM scope grants access to all stores
  const hasSystemScope = userRoles.some((role) => role.scope === "SYSTEM");
  if (hasSystemScope) {
    return true;
  }

  // COMPANY scope grants access to all stores within the company
  const hasCompanyAccess = userRoles.some(
    (role) => role.scope === "COMPANY" && role.company_id === storeCompanyId,
  );
  if (hasCompanyAccess) {
    return true;
  }

  // STORE scope grants access to specifically assigned stores
  const hasStoreAccess = userRoles.some(
    (role) => role.scope === "STORE" && role.store_id === storeId,
  );
  if (hasStoreAccess) {
    return true;
  }

  return false;
}

/**
 * Get a store_id from user roles if not explicitly provided
 * Priority: STORE scope role first, then any store from COMPANY scope
 *
 * @param userRoles - User's roles from rbacService.getUserRoles()
 * @returns store_id if found, null otherwise
 */
async function getDefaultStoreIdFromRoles(
  userRoles: UserRole[],
): Promise<string | null> {
  // First check for direct STORE scope assignment
  const storeRole = userRoles.find(
    (role) => role.scope === "STORE" && role.store_id,
  );
  if (storeRole?.store_id) {
    return storeRole.store_id;
  }

  // For COMPANY scope users, get the first store in their company
  const companyRole = userRoles.find(
    (role) => role.scope === "COMPANY" && role.company_id,
  );
  if (companyRole?.company_id) {
    const firstStore = await prisma.store.findFirst({
      where: { company_id: companyRole.company_id },
      select: { store_id: true },
      orderBy: { name: "asc" },
    });
    if (firstStore) {
      return firstStore.store_id;
    }
  }

  return null;
}

/**
 * Lottery management routes
 * Provides operations for lottery pack reception and management
 * All routes require LOTTERY_* permissions and enforce store isolation
 */
export async function lotteryRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/lottery/config-values
   * Get predefined configuration values for lottery dropdowns (ticket prices and pack values)
   * Protected route - requires LOTTERY_GAME_READ permission
   * Story 6.x: Lottery Configuration Values Enhancement
   */
  fastify.get(
    "/api/lottery/config-values",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_GAME_READ),
      ],
      schema: {
        description:
          "Get predefined configuration values for lottery dropdowns",
        tags: ["lottery"],
        querystring: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["PACK_VALUE", "TICKET_PRICE"],
              description:
                "Filter by config type. If not provided, returns all types.",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  ticket_prices: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        config_value_id: { type: "string", format: "uuid" },
                        amount: { type: "number" },
                        display_order: { type: "integer" },
                      },
                    },
                  },
                  pack_values: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        config_value_id: { type: "string", format: "uuid" },
                        amount: { type: "number" },
                        display_order: { type: "integer" },
                      },
                    },
                  },
                },
              },
            },
          },
          401: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          500: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = request.query as { type?: string };
        const { type } = query;

        // Build where clause for optional type filtering
        const whereClause: {
          config_type?: "PACK_VALUE" | "TICKET_PRICE";
          is_active: boolean;
        } = {
          is_active: true,
        };

        if (type === "PACK_VALUE" || type === "TICKET_PRICE") {
          whereClause.config_type = type;
        }

        // Fetch all active config values, ordered by display_order
        const configValues = await prisma.lotteryConfigValue.findMany({
          where: whereClause,
          orderBy: [{ config_type: "asc" }, { display_order: "asc" }],
          select: {
            config_value_id: true,
            config_type: true,
            amount: true,
            display_order: true,
          },
        });

        // Group by type for easier frontend consumption
        const ticketPrices = configValues
          .filter((v) => v.config_type === "TICKET_PRICE")
          .map((v) => ({
            config_value_id: v.config_value_id,
            amount: Number(v.amount),
            display_order: v.display_order,
          }));

        const packValues = configValues
          .filter((v) => v.config_type === "PACK_VALUE")
          .map((v) => ({
            config_value_id: v.config_value_id,
            amount: Number(v.amount),
            display_order: v.display_order,
          }));

        return {
          success: true,
          data: {
            ticket_prices: ticketPrices,
            pack_values: packValues,
          },
        };
      } catch (error) {
        fastify.log.error({ error }, "Failed to fetch lottery config values");
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to fetch configuration values",
          },
        };
      }
    },
  );

  /**
   * POST /api/lottery/packs/receive
   * Receive a lottery pack and record it in the system
   * Protected route - requires LOTTERY_PACK_RECEIVE permission
   */
  fastify.post(
    "/api/lottery/packs/receive",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_PACK_RECEIVE),
      ],
      schema: {
        description: "Receive a lottery pack",
        tags: ["lottery"],
        body: {
          type: "object",
          required: ["game_id", "pack_number", "serial_end"],
          properties: {
            game_id: {
              type: "string",
              format: "uuid",
              description: "Lottery game UUID",
            },
            pack_number: {
              type: "string",
              minLength: 1,
              maxLength: 50,
              description: "Pack number (must be unique per store)",
            },
            serial_start: {
              type: "string",
              minLength: 1,
              maxLength: 100,
              description:
                "Starting serial number (optional, always forced to 000)",
            },
            serial_end: {
              type: "string",
              minLength: 1,
              maxLength: 100,
              description: "Ending serial number in the pack",
            },
            store_id: {
              type: "string",
              format: "uuid",
              description: "Store UUID (must match authenticated user's store)",
            },
            bin_id: {
              type: "string",
              format: "uuid",
              description: "Optional bin UUID for physical location",
            },
          },
        },
        response: {
          201: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  pack_id: { type: "string", format: "uuid" },
                  game_id: { type: "string", format: "uuid" },
                  pack_number: { type: "string" },
                  serial_start: { type: "string" },
                  serial_end: { type: "string" },
                  status: { type: "string", enum: ["RECEIVED"] },
                  current_bin_id: {
                    type: "string",
                    format: "uuid",
                    nullable: true,
                  },
                  received_at: { type: "string", format: "date-time" },
                  game: {
                    type: "object",
                    properties: {
                      game_id: { type: "string", format: "uuid" },
                      name: { type: "string" },
                    },
                  },
                  store: {
                    type: "object",
                    properties: {
                      store_id: { type: "string", format: "uuid" },
                      name: { type: "string" },
                    },
                  },
                  bin: {
                    type: "object",
                    nullable: true,
                    properties: {
                      bin_id: { type: "string", format: "uuid" },
                      name: { type: "string" },
                      location: { type: "string", nullable: true },
                    },
                  },
                },
              },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          401: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          409: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          500: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;
      const body = request.body as {
        game_id: string;
        pack_number: string;
        serial_start?: string; // Optional - always forced to "000" regardless of value
        serial_end: string;
        store_id?: string;
        bin_id?: string;
      };

      // Normalize string fields by trimming whitespace
      // This ensures consistent behavior across duplicate checks, validations, and database writes
      const normalizedPackNumber = body.pack_number.trim();
      const normalizedSerialEnd = body.serial_end.trim();

      // IMPORTANT: Always force serial_start to "000" regardless of what was scanned
      // Pack serial tracking starts from zero, and any scanned serial in barcode is ignored
      // Pad with leading zeros to match serial_end length for consistent storage
      const normalizedSerialStart = "0".padStart(
        normalizedSerialEnd.length,
        "0",
      );

      try {
        // Extract IP address and user agent for audit logging
        const ipAddress =
          (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
          request.ip ||
          request.socket.remoteAddress ||
          null;
        const userAgent = request.headers["user-agent"] || null;

        // Get user roles to determine store access
        const userRoles = await rbacService.getUserRoles(user.id);

        // Determine store_id from request body or user's role assignment
        let storeId: string;
        if (body.store_id) {
          storeId = body.store_id;
        } else {
          // If store_id not provided, derive from user's role assignments
          const defaultStoreId = await getDefaultStoreIdFromRoles(userRoles);
          if (!defaultStoreId) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message:
                  "store_id is required. Either provide store_id in request body or ensure user has store access via STORE or COMPANY scope role",
              },
            };
          }
          storeId = defaultStoreId;
        }

        // Validate store exists and get company_id for access check
        const store = await prisma.store.findUnique({
          where: { store_id: storeId },
          select: { store_id: true, name: true, company_id: true },
        });

        if (!store) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Store not found",
            },
          };
        }

        // Validate user has access to this store (SYSTEM, COMPANY, or STORE scope)
        if (!validateUserStoreAccess(userRoles, storeId, store.company_id)) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "FORBIDDEN",
              message:
                "You do not have access to this store. Please contact your manager.",
            },
          };
        }

        // Validate serial_end is numeric-only (lottery serial barcodes are numeric)
        // Note: serial_start is auto-generated as "000...0" so no validation needed
        const numericOnlyRegex = /^\d+$/;
        if (!numericOnlyRegex.test(normalizedSerialEnd)) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "serial_end must contain only numeric characters",
            },
          };
        }

        // Validate serial_end is greater than zero (since serial_start is always 0)
        const serialEndBigInt = BigInt(normalizedSerialEnd);
        if (serialEndBigInt <= 0n) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "serial_end must be greater than zero",
            },
          };
        }

        // Validate game exists
        const game = await prisma.lotteryGame.findUnique({
          where: { game_id: body.game_id },
          select: { game_id: true, name: true },
        });

        if (!game) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "GAME_NOT_FOUND",
              message: "Lottery game not found",
            },
          };
        }

        // Validate bin exists and belongs to store (if provided)
        if (body.bin_id) {
          // First check if bin exists
          const bin = await prisma.lotteryBin.findUnique({
            where: { bin_id: body.bin_id },
            select: {
              bin_id: true,
              store_id: true,
              name: true,
              location: true,
            },
          });

          if (!bin) {
            reply.code(404);
            return {
              success: false,
              error: {
                code: "BIN_NOT_FOUND",
                message: "Bin not found",
              },
            };
          }

          // Then check if bin belongs to the store (RLS enforcement)
          if (bin.store_id !== storeId) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "FORBIDDEN",
                message:
                  "Bin does not belong to the specified store (RLS violation)",
              },
            };
          }
        }

        // Create pack in transaction to ensure atomicity
        const pack = await prisma.$transaction(async (tx) => {
          // Check for duplicate pack_number for this store
          const existingPack = await tx.lotteryPack.findUnique({
            where: {
              store_id_pack_number: {
                store_id: storeId,
                pack_number: normalizedPackNumber,
              },
            },
          });

          if (existingPack) {
            throw new Error("DUPLICATE_PACK_NUMBER");
          }

          // Create LotteryPack record with status RECEIVED
          const newPack = await tx.lotteryPack.create({
            data: {
              game_id: body.game_id,
              store_id: storeId,
              pack_number: normalizedPackNumber,
              serial_start: normalizedSerialStart,
              serial_end: normalizedSerialEnd,
              status: "RECEIVED",
              current_bin_id: body.bin_id || null,
              received_at: new Date(),
            },
            include: {
              game: {
                select: {
                  game_id: true,
                  name: true,
                },
              },
              store: {
                select: {
                  store_id: true,
                  name: true,
                },
              },
              bin: body.bin_id
                ? {
                    select: {
                      bin_id: true,
                      name: true,
                      location: true,
                    },
                  }
                : false,
            },
          });

          // Create audit log entry (non-blocking - don't fail if audit fails)
          try {
            await tx.auditLog.create({
              data: {
                user_id: user.id,
                action: "PACK_RECEIVED",
                table_name: "lottery_packs",
                record_id: newPack.pack_id,
                new_values: {
                  pack_id: newPack.pack_id,
                  game_id: newPack.game_id,
                  store_id: newPack.store_id,
                  pack_number: newPack.pack_number,
                  serial_start: newPack.serial_start,
                  serial_end: newPack.serial_end,
                  status: newPack.status,
                  current_bin_id: newPack.current_bin_id,
                  received_at: newPack.received_at?.toISOString(),
                } as Record<string, any>,
                ip_address: ipAddress,
                user_agent: userAgent,
                reason: `Lottery pack received by ${user.email} (roles: ${user.roles.join(", ")}) - Pack #${normalizedPackNumber}`,
              },
            });
          } catch (auditError) {
            // Log the audit failure but don't fail the pack creation
            fastify.log.error(
              { error: auditError },
              "Failed to create audit log for pack reception",
            );
          }

          return newPack;
        });

        reply.code(201);
        return {
          success: true,
          data: {
            pack_id: pack.pack_id,
            game_id: pack.game_id,
            pack_number: pack.pack_number,
            serial_start: pack.serial_start,
            serial_end: pack.serial_end,
            status: pack.status,
            current_bin_id: pack.current_bin_id || null,
            received_at: pack.received_at?.toISOString() || null,
            game: pack.game,
            store: pack.store,
            bin: pack.bin || null,
          },
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error receiving lottery pack");

        // Handle duplicate pack_number error
        if (error.message === "DUPLICATE_PACK_NUMBER") {
          reply.code(409);
          return {
            success: false,
            error: {
              code: "DUPLICATE_PACK_NUMBER",
              message: `Pack number ${normalizedPackNumber} already exists for this store`,
            },
          };
        }

        // Handle Prisma unique constraint violation
        if (
          error.code === "P2002" &&
          error.meta?.target?.includes("pack_number")
        ) {
          reply.code(409);
          return {
            success: false,
            error: {
              code: "DUPLICATE_PACK_NUMBER",
              message: `Pack number ${normalizedPackNumber} already exists for this store`,
            },
          };
        }

        // Generic error response
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to receive lottery pack",
          },
        };
      }
    },
  );

  /**
   * POST /api/lottery/packs/receive/batch
   * Receive multiple lottery packs via batch processing with serialized numbers
   * Story 6.12: Serialized Pack Reception with Batch Processing
   * Protected route - requires LOTTERY_PACK_RECEIVE permission
   */
  fastify.post(
    "/api/lottery/packs/receive/batch",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_PACK_RECEIVE),
      ],
      schema: {
        description: "Receive multiple lottery packs via batch processing",
        tags: ["lottery"],
        body: {
          type: "object",
          required: ["serialized_numbers"],
          properties: {
            serialized_numbers: {
              type: "array",
              items: {
                type: "string",
                minLength: 24,
                maxLength: 24,
                pattern: "^\\d{24}$",
              },
              minItems: 1,
              maxItems: 100, // Limit batch size for performance
              description: "Array of 24-digit serialized numbers",
            },
            store_id: {
              type: "string",
              format: "uuid",
              description: "Store UUID (must match authenticated user's store)",
            },
            scan_metrics: {
              type: "array",
              description:
                "Scan metrics for server-side validation (required when scan enforcement is enabled)",
              items: {
                type: "object",
                properties: {
                  totalInputTimeMs: { type: "number" },
                  avgInterKeyDelayMs: { type: "number" },
                  maxInterKeyDelayMs: { type: "number" },
                  minInterKeyDelayMs: { type: "number" },
                  interKeyStdDevMs: { type: "number" },
                  charCount: { type: "number" },
                  keystrokeTimestamps: {
                    type: "array",
                    items: { type: "number" },
                  },
                  inputMethod: {
                    type: "string",
                    enum: ["SCANNED", "MANUAL", "UNKNOWN"],
                  },
                  confidence: { type: "number" },
                  rejectionReason: { type: "string" },
                  analyzedAt: { type: "string" },
                },
              },
            },
            // REMOVED: enforce_scan_only - was a security vulnerability
            // Clients could bypass scan validation by sending enforce_scan_only: false
            // Scan validation is now ALWAYS enforced server-side
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  created: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        pack_id: { type: "string", format: "uuid" },
                        game_id: { type: "string", format: "uuid" },
                        pack_number: { type: "string" },
                        serial_start: { type: "string" },
                        serial_end: { type: "string" },
                        status: { type: "string" },
                        game: {
                          type: "object",
                          properties: {
                            game_id: { type: "string", format: "uuid" },
                            name: { type: "string" },
                          },
                        },
                      },
                    },
                  },
                  duplicates: {
                    type: "array",
                    items: { type: "string" },
                    description: "Serial numbers that are duplicates",
                  },
                  errors: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        serial: { type: "string" },
                        error: { type: "string" },
                      },
                    },
                    description: "Serial numbers that failed with errors",
                  },
                  games_not_found: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        serial: { type: "string" },
                        game_code: { type: "string" },
                        pack_number: { type: "string" },
                        serial_start: { type: "string" },
                      },
                    },
                    description:
                      "Packs with game codes not found in database - frontend can prompt user to create games",
                  },
                },
              },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;
      const body = request.body as {
        serialized_numbers: string[];
        store_id?: string;
        scan_metrics?: any[];
        // NOTE: enforce_scan_only is intentionally NOT accepted from client
        // It was a security vulnerability - clients could bypass scan validation
      };

      try {
        // Extract IP address and user agent for audit logging
        const ipAddress =
          (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
          request.ip ||
          request.socket.remoteAddress ||
          null;
        const userAgent = request.headers["user-agent"] || null;

        // Validate input
        if (
          !body.serialized_numbers ||
          !Array.isArray(body.serialized_numbers) ||
          body.serialized_numbers.length === 0
        ) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message:
                "serialized_numbers is required and must be a non-empty array",
            },
          };
        }

        // Limit batch size for performance
        if (body.serialized_numbers.length > 100) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Batch size cannot exceed 100 packs",
            },
          };
        }

        // SECURITY: Validate scan metrics for scan-only enforcement
        // ALWAYS enforce scan-only - this is NOT configurable by the client
        // to prevent bypass attacks. Only server configuration can disable this.
        const enforceScanOnly = true;

        if (enforceScanOnly) {
          // Import scan validation service dynamically to avoid circular deps
          const {
            validateBatchScanMetrics,
            logScanAudit,
          } = require("../services/lottery/scan-validation.service");

          const scanValidation = validateBatchScanMetrics(
            body.serialized_numbers,
            body.scan_metrics,
            enforceScanOnly,
          );

          // Log validation attempt for audit
          for (const result of scanValidation.results) {
            logScanAudit({
              timestamp: new Date(),
              storeId: body.store_id || "unknown",
              userId: user.id,
              serial: result.serial,
              inputMethod: result.inputMethod,
              accepted: result.valid,
              rejectionReason: result.rejectionReason,
              tamperedDetected: result.tamperedDetected,
              clientIp: ipAddress || undefined,
              userAgent: userAgent || undefined,
              metrics: body.scan_metrics?.[result.index]
                ? {
                    totalInputTimeMs:
                      body.scan_metrics[result.index].totalInputTimeMs || 0,
                    avgInterKeyDelayMs:
                      body.scan_metrics[result.index].avgInterKeyDelayMs || 0,
                    maxInterKeyDelayMs:
                      body.scan_metrics[result.index].maxInterKeyDelayMs || 0,
                    confidence: body.scan_metrics[result.index].confidence || 0,
                  }
                : {
                    totalInputTimeMs: 0,
                    avgInterKeyDelayMs: 0,
                    maxInterKeyDelayMs: 0,
                    confidence: 0,
                  },
            });
          }

          // If any scans were rejected, return error
          if (!scanValidation.allValid) {
            const rejectedSerials = scanValidation.results
              .filter((r: any) => !r.valid)
              .map((r: any) => r.serial);

            fastify.log.warn(
              {
                userId: user.id,
                rejectedCount: scanValidation.rejectedCount,
                tamperedCount: scanValidation.tamperedCount,
                rejectedSerials,
              },
              "Batch pack reception rejected: Manual entry detected",
            );

            reply.code(400);
            return {
              success: false,
              error: {
                code: "SCAN_VALIDATION_FAILED",
                message: `Manual entry detected for ${scanValidation.rejectedCount} pack(s). Please use a barcode scanner.`,
                details: {
                  rejectedCount: scanValidation.rejectedCount,
                  tamperedCount: scanValidation.tamperedCount,
                  rejectedSerials: rejectedSerials.slice(0, 5), // Limit to first 5
                },
              },
            };
          }

          fastify.log.info(
            {
              userId: user.id,
              packCount: body.serialized_numbers.length,
            },
            "Batch pack reception scan validation passed",
          );
        }

        // Get user roles to determine store access
        const userRoles = await rbacService.getUserRoles(user.id);

        // Determine store_id from request body or user's role assignment
        let storeId: string;
        if (body.store_id) {
          storeId = body.store_id;
        } else {
          // If store_id not provided, derive from user's role assignments
          const defaultStoreId = await getDefaultStoreIdFromRoles(userRoles);
          if (!defaultStoreId) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message:
                  "store_id is required. Either provide store_id in request body or ensure user has store access via STORE or COMPANY scope role",
              },
            };
          }
          storeId = defaultStoreId;
        }

        // Validate store exists and get company_id for access check
        const store = await prisma.store.findUnique({
          where: { store_id: storeId },
          select: { store_id: true, name: true, company_id: true },
        });

        if (!store) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Store not found",
            },
          };
        }

        // Validate user has access to this store (SYSTEM, COMPANY, or STORE scope)
        if (!validateUserStoreAccess(userRoles, storeId, store.company_id)) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "FORBIDDEN",
              message:
                "You do not have access to this store. Please contact your manager.",
            },
          };
        }

        // Process batch in transaction for atomicity
        const result = await prisma.$transaction(
          async (tx) => {
            const created: any[] = [];
            const duplicates: string[] = [];
            const errors: Array<{ serial: string; error: string }> = [];
            const gamesNotFound: Array<{
              serial: string;
              game_code: string;
              pack_number: string;
              serial_start: string;
            }> = [];

            // Track seen pack numbers in this batch to detect duplicates within batch
            const seenPackNumbers = new Set<string>();

            // Process each serialized number
            for (const serial of body.serialized_numbers) {
              try {
                // Parse serial number
                let parsed;
                try {
                  parsed = parseSerializedNumber(serial);
                } catch (parseError) {
                  if (parseError instanceof InvalidSerialNumberError) {
                    errors.push({
                      serial,
                      error: parseError.message,
                    });
                    continue;
                  }
                  throw parseError;
                }

                // Check for duplicate pack numbers within this batch
                const packKey = `${storeId}:${parsed.pack_number}`;
                if (seenPackNumbers.has(packKey)) {
                  duplicates.push(serial);
                  continue;
                }
                seenPackNumbers.add(packKey);

                // Lookup game by game code with company scoping
                // First looks for store-scoped game, falls back to global game
                let game;
                try {
                  game = await lookupGameByCode(
                    parsed.game_code,
                    store.store_id,
                  );
                } catch (lookupError: any) {
                  // Track games not found separately for frontend to handle
                  gamesNotFound.push({
                    serial,
                    game_code: parsed.game_code,
                    pack_number: parsed.pack_number,
                    serial_start: parsed.serial_start,
                  });
                  continue;
                }

                // Check for duplicate pack_number in database (per store)
                const existingPack = await tx.lotteryPack.findUnique({
                  where: {
                    store_id_pack_number: {
                      store_id: storeId,
                      pack_number: parsed.pack_number,
                    },
                  },
                });

                if (existingPack) {
                  duplicates.push(serial);
                  continue;
                }

                // IMPORTANT: Always force serial_start to "000...0" regardless of scanned barcode
                // Calculate serial_end based on game's tickets_per_pack
                // tickets_per_pack is always set (computed from pack_value / price)
                const ticketsPerPack = game.tickets_per_pack!;
                const serialEndNum = BigInt(ticketsPerPack - 1); // e.g., 149 for 150 tickets (0-149)
                const serialStartLength = parsed.serial_start?.length || 3;
                const serialStart = "0".padStart(serialStartLength, "0");
                const serialEnd = serialEndNum
                  .toString()
                  .padStart(serialStartLength, "0");

                // Create pack
                const newPack = await tx.lotteryPack.create({
                  data: {
                    game_id: game.game_id,
                    store_id: storeId,
                    pack_number: parsed.pack_number,
                    serial_start: serialStart,
                    serial_end: serialEnd,
                    status: "RECEIVED",
                    received_at: new Date(),
                  },
                  include: {
                    game: {
                      select: {
                        game_id: true,
                        name: true,
                      },
                    },
                  },
                });

                created.push({
                  pack_id: newPack.pack_id,
                  game_id: newPack.game_id,
                  pack_number: newPack.pack_number,
                  serial_start: newPack.serial_start,
                  serial_end: newPack.serial_end,
                  status: newPack.status,
                  game: newPack.game,
                });

                // Create audit log entry (non-blocking)
                try {
                  await tx.auditLog.create({
                    data: {
                      user_id: user.id,
                      action: "PACK_RECEIVED_BATCH",
                      table_name: "lottery_packs",
                      record_id: newPack.pack_id,
                      new_values: {
                        pack_id: newPack.pack_id,
                        game_id: newPack.game_id,
                        store_id: newPack.store_id,
                        pack_number: newPack.pack_number,
                        serial_start: newPack.serial_start,
                        serial_end: newPack.serial_end,
                        status: newPack.status,
                        received_at: newPack.received_at?.toISOString(),
                        serialized_number: serial,
                      } as Record<string, any>,
                      ip_address: ipAddress,
                      user_agent: userAgent,
                      reason: `Lottery pack received via batch by ${user.email} - Pack #${parsed.pack_number} (Serial: ${serial})`,
                    },
                  });
                } catch (auditError) {
                  // Log but don't fail
                  fastify.log.error(
                    { error: auditError },
                    "Failed to create audit log for batch pack reception",
                  );
                }
              } catch (error: any) {
                // Catch any unexpected errors for this serial
                errors.push({
                  serial,
                  error: error.message || "Unexpected error processing pack",
                });
              }
            }

            // Create batch-level audit log entry
            // Use store_id as record_id for batch operations since record_id requires UUID format
            try {
              await tx.auditLog.create({
                data: {
                  user_id: user.id,
                  action: "BATCH_PACK_RECEIVED",
                  table_name: "lottery_packs",
                  record_id: storeId, // Use store_id as the record reference for batch operations
                  new_values: {
                    total_serials: body.serialized_numbers.length,
                    created_count: created.length,
                    duplicates_count: duplicates.length,
                    errors_count: errors.length,
                    store_id: storeId,
                  } as Record<string, any>,
                  ip_address: ipAddress,
                  user_agent: userAgent,
                  reason: `Batch pack reception by ${user.email} - Created: ${created.length}, Duplicates: ${duplicates.length}, Errors: ${errors.length}`,
                },
              });
            } catch (auditError) {
              // Log but don't fail
              fastify.log.error(
                { error: auditError },
                "Failed to create batch audit log",
              );
            }

            return {
              created,
              duplicates,
              errors,
              games_not_found: gamesNotFound,
            };
          },
          {
            timeout: 30000, // 30 second timeout for large batches
          },
        );

        reply.code(200);
        return {
          success: true,
          data: result,
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error in batch pack reception");

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to process batch pack reception",
          },
        };
      }
    },
  );

  /**
   * PUT /api/lottery/packs/:packId/activate
   * Activate a lottery pack (change status from RECEIVED to ACTIVE)
   * Protected route - requires LOTTERY_PACK_ACTIVATE permission
   */
  fastify.put(
    "/api/lottery/packs/:packId/activate",
    {
      preHandler: [authMiddleware],
      schema: {
        description: "Activate a lottery pack",
        tags: ["lottery"],
        params: {
          type: "object",
          required: ["packId"],
          properties: {
            packId: {
              type: "string",
              format: "uuid",
              description: "Lottery pack UUID",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  pack_id: { type: "string", format: "uuid" },
                  game_id: { type: "string", format: "uuid" },
                  pack_number: { type: "string" },
                  serial_start: { type: "string" },
                  serial_end: { type: "string" },
                  status: { type: "string", enum: ["ACTIVE"] },
                  activated_at: { type: "string", format: "date-time" },
                  game: {
                    type: "object",
                    properties: {
                      game_id: { type: "string", format: "uuid" },
                      name: { type: "string" },
                    },
                  },
                  store: {
                    type: "object",
                    properties: {
                      store_id: { type: "string", format: "uuid" },
                      name: { type: "string" },
                    },
                  },
                  bin: {
                    type: "object",
                    nullable: true,
                    properties: {
                      bin_id: { type: "string", format: "uuid" },
                      name: { type: "string" },
                      location: { type: "string", nullable: true },
                    },
                  },
                },
              },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          401: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          500: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;
      const params = request.params as { packId: string };

      try {
        // Extract IP address and user agent for audit logging
        const ipAddress =
          (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
          request.ip ||
          request.socket.remoteAddress ||
          null;
        const userAgent = request.headers["user-agent"] || null;

        // Get user roles to determine store access
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        // Validate pack exists and fetch with relationships
        const pack = await prisma.lotteryPack.findUnique({
          where: { pack_id: params.packId },
          include: {
            game: {
              select: {
                game_id: true,
                name: true,
              },
            },
            store: {
              select: {
                store_id: true,
                name: true,
                company_id: true, // Added for COMPANY scope RLS check
              },
            },
            bin: {
              select: {
                bin_id: true,
                name: true,
                location: true,
              },
            },
          },
        });

        if (!pack) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "PACK_NOT_FOUND",
              message: "Lottery pack not found",
            },
          };
        }

        // Validate store access based on user's role scope (RLS enforcement)
        // Scope hierarchy: SYSTEM > COMPANY > STORE
        if (!hasSystemScope) {
          // Check for STORE scope: user has direct store assignment
          const hasStoreAccess = userRoles.some(
            (role) => role.scope === "STORE" && role.store_id === pack.store_id,
          );

          // Check for COMPANY scope: user has company-level access (e.g., CLIENT_OWNER)
          // They can access any store within their assigned company
          const hasCompanyAccess = userRoles.some(
            (role) =>
              role.scope === "COMPANY" &&
              role.company_id === pack.store.company_id,
          );

          if (!hasStoreAccess && !hasCompanyAccess) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "FORBIDDEN",
                message:
                  "You can only activate packs for your assigned store. Pack belongs to a different store (RLS violation)",
              },
            };
          }
        }

        // Store initial pack status to distinguish between bad request and concurrent modification
        const initialPackStatus = pack.status;

        // Try to find active shift for this store (Story 10.2: Pack activation tracking)
        // Active shifts are those with status: OPEN, ACTIVE, CLOSING, RECONCILING and closed_at IS NULL
        const activeShift = await prisma.shift.findFirst({
          where: {
            store_id: pack.store_id,
            status: {
              in: ["OPEN", "ACTIVE", "CLOSING", "RECONCILING"],
            },
            closed_at: null,
          },
          orderBy: {
            opened_at: "desc",
          },
          select: {
            shift_id: true,
          },
        });

        // Atomically update pack status to ACTIVE only if status is RECEIVED
        // This prevents TOCTOU race conditions by combining verification and update
        const updatedPack = await prisma.$transaction(async (tx) => {
          // Use updateMany with status condition to atomically verify and update
          const updateResult = await tx.lotteryPack.updateMany({
            where: {
              pack_id: params.packId,
              status: "RECEIVED",
            },
            data: {
              status: "ACTIVE",
              activated_at: new Date(),
              activated_by: user.id, // Story 10.2: Track who activated the pack
              activated_shift_id: activeShift?.shift_id || null, // Story 10.2: Track which shift the pack was activated in
            },
          });

          // If no rows were affected, determine if it's a bad request or concurrent modification
          if (updateResult.count === 0) {
            // Fetch current pack status to provide accurate error message
            const currentPack = await tx.lotteryPack.findUnique({
              where: { pack_id: params.packId },
              select: { status: true },
            });

            if (!currentPack) {
              // Pack was deleted concurrently
              reply.code(404);
              throw {
                success: false,
                error: {
                  code: "PACK_NOT_FOUND",
                  message: "Lottery pack not found",
                },
              };
            }

            // If pack was previously in RECEIVED state, this is a concurrent modification
            if (initialPackStatus === "RECEIVED") {
              reply.code(409);
              throw {
                success: false,
                error: {
                  code: "CONCURRENT_MODIFICATION",
                  message: `Pack status was changed concurrently. Pack was RECEIVED but is now ${currentPack.status}. Please retry the operation.`,
                },
              };
            }

            // Pack was never in RECEIVED state - this is a bad request
            reply.code(400);
            throw {
              success: false,
              error: {
                code: "INVALID_PACK_STATUS",
                message: `Only packs with RECEIVED status can be activated. Current status is ${currentPack.status}.`,
              },
            };
          }

          // Fetch the updated pack with relationships
          // Include game fields needed for UPC generation (game_code, tickets_per_pack, price)
          const activatedPack = await tx.lotteryPack.findUnique({
            where: { pack_id: params.packId },
            include: {
              game: {
                select: {
                  game_id: true,
                  name: true,
                  game_code: true, // For UPC generation
                  tickets_per_pack: true, // For UPC generation
                  price: true, // For UPC generation
                },
              },
              store: {
                select: {
                  store_id: true,
                  name: true,
                },
              },
              bin: {
                select: {
                  bin_id: true,
                  name: true,
                  location: true,
                },
              },
            },
          });

          if (!activatedPack) {
            // This should never happen, but handle it defensively
            reply.code(404);
            throw {
              success: false,
              error: {
                code: "PACK_NOT_FOUND",
                message: "Lottery pack not found after update",
              },
            };
          }

          // Create audit log entry (non-blocking - don't fail if audit fails)
          try {
            await tx.auditLog.create({
              data: {
                user_id: user.id,
                action: "PACK_ACTIVATED",
                table_name: "lottery_packs",
                record_id: activatedPack.pack_id,
                new_values: {
                  pack_id: activatedPack.pack_id,
                  game_id: activatedPack.game_id,
                  store_id: activatedPack.store_id,
                  pack_number: activatedPack.pack_number,
                  status: activatedPack.status,
                  previous_status: "RECEIVED",
                  activated_at: activatedPack.activated_at?.toISOString(),
                  activated_by: activatedPack.activated_by, // Story 10.2: Track who activated
                  activated_shift_id: activatedPack.activated_shift_id, // Story 10.2: Track which shift
                  current_bin_id: activatedPack.current_bin_id, // Story 10.2: Track which bin
                } as Record<string, any>,
                ip_address: ipAddress,
                user_agent: userAgent,
                reason: `Lottery pack activated by ${user.email} (roles: ${user.roles.join(", ")}) - Pack #${activatedPack.pack_number}`,
              },
            });
          } catch (auditError) {
            // Log the audit failure but don't fail the pack activation
            fastify.log.error(
              { error: auditError },
              "Failed to create audit log for pack activation",
            );
          }

          return activatedPack;
        });

        // === UPC-A GENERATION AND POS SYNC (BLOCKING) ===
        // Generate UPC-A barcodes for the pack and sync with POS system
        // THIS IS A BLOCKING OPERATION - if POS export fails, activation is blocked
        if (updatedPack.game.game_code && updatedPack.game.tickets_per_pack) {
          try {
            const syncResult = await syncPackActivation({
              packId: updatedPack.pack_id,
              packNumber: updatedPack.pack_number,
              gameCode: updatedPack.game.game_code,
              gameName: updatedPack.game.name,
              ticketsPerPack: updatedPack.game.tickets_per_pack,
              ticketPrice: Number(updatedPack.game.price),
              storeId: updatedPack.store_id,
              startingSerial: updatedPack.serial_start || "000",
            });

            // BLOCKING: If POS export fails, block activation and show error
            if (!syncResult.success) {
              fastify.log.error(
                {
                  packId: updatedPack.pack_id,
                  error: syncResult.error,
                  redisStored: syncResult.redisStored,
                },
                "Pack activation BLOCKED - POS export failed",
              );

              // Note: Pack status was already updated to ACTIVE in transaction
              // We need to revert it back to RECEIVED
              try {
                await prisma.lotteryPack.update({
                  where: { pack_id: updatedPack.pack_id },
                  data: {
                    status: "RECEIVED",
                    activated_at: null,
                    activated_by: null,
                    activated_shift_id: null,
                  },
                });

                fastify.log.info(
                  { packId: updatedPack.pack_id },
                  "Pack status reverted to RECEIVED after POS export failure",
                );
              } catch (revertError) {
                fastify.log.error(
                  { error: revertError, packId: updatedPack.pack_id },
                  "Failed to revert pack status after POS export failure",
                );
              }

              reply.code(503);
              return {
                success: false,
                error: {
                  code: "POS_EXPORT_FAILED",
                  message:
                    syncResult.error || "Pack activation failed. Try again.",
                },
              };
            }

            if (syncResult.posExported) {
              fastify.log.info(
                {
                  packId: updatedPack.pack_id,
                  upcCount: syncResult.upcCount,
                  posFilePath: syncResult.posFilePath,
                },
                "Pack UPC-A barcodes exported to POS",
              );
            } else if (syncResult.upcCount > 0) {
              fastify.log.info(
                {
                  packId: updatedPack.pack_id,
                  upcCount: syncResult.upcCount,
                },
                "Pack UPC-A barcodes generated (no POS configured)",
              );
            }
          } catch (syncError) {
            // Unexpected error during sync - block activation
            fastify.log.error(
              { error: syncError, packId: updatedPack.pack_id },
              "Pack activation BLOCKED - Unexpected error during UPC sync",
            );

            // Revert pack status
            try {
              await prisma.lotteryPack.update({
                where: { pack_id: updatedPack.pack_id },
                data: {
                  status: "RECEIVED",
                  activated_at: null,
                  activated_by: null,
                  activated_shift_id: null,
                },
              });
            } catch (revertError) {
              fastify.log.error(
                { error: revertError, packId: updatedPack.pack_id },
                "Failed to revert pack status after sync error",
              );
            }

            reply.code(503);
            return {
              success: false,
              error: {
                code: "POS_SYNC_ERROR",
                message: "Pack activation failed. Try again.",
              },
            };
          }
        }

        reply.code(200);
        return {
          success: true,
          data: {
            pack_id: updatedPack.pack_id,
            game_id: updatedPack.game_id,
            pack_number: updatedPack.pack_number,
            serial_start: updatedPack.serial_start,
            serial_end: updatedPack.serial_end,
            status: updatedPack.status,
            activated_at: updatedPack.activated_at?.toISOString() || null,
            game: updatedPack.game,
            store: updatedPack.store,
            bin: updatedPack.bin || null,
          },
        };
      } catch (error: any) {
        // If error is a structured error response (from concurrent modification or not found),
        // return it directly
        if (error && typeof error === "object" && error.success === false) {
          return error;
        }

        fastify.log.error({ error }, "Error activating lottery pack");

        // Generic error response
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to activate lottery pack",
          },
        };
      }
    },
  );

  /**
   * PUT /api/lottery/packs/:packId/move
   * Move a lottery pack between bins
   * Protected route - requires LOTTERY_BIN_MANAGE permission
   * Story 6.13: Lottery Database Enhancements & Bin Management (AC #5)
   */
  fastify.put(
    "/api/lottery/packs/:packId/move",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_BIN_MANAGE),
      ],
      schema: {
        description: "Move a lottery pack between bins",
        tags: ["lottery"],
        params: {
          type: "object",
          required: ["packId"],
          properties: {
            packId: {
              type: "string",
              format: "uuid",
              description: "Pack UUID",
            },
          },
        },
        body: {
          type: "object",
          required: ["bin_id"],
          properties: {
            bin_id: {
              type: ["string", "null"],
              format: "uuid",
              description: "Target bin UUID (null to unassign from bin)",
            },
            reason: {
              type: "string",
              maxLength: 500,
              description: "Optional reason for movement",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  pack_id: { type: "string", format: "uuid" },
                  current_bin_id: {
                    type: ["string", "null"],
                    format: "uuid",
                  },
                  history_id: { type: "string", format: "uuid" },
                },
              },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: { type: "object" },
            },
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: { type: "object" },
            },
          },
          500: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: { type: "object" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;
      const params = request.params as { packId: string };
      const body = request.body as { bin_id: string | null; reason?: string };

      try {
        // Move pack between bins
        const result = await movePackBetweenBins(
          params.packId,
          body.bin_id,
          user.id,
          body.reason,
        );

        return {
          success: true,
          data: result,
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error moving pack between bins");

        // Handle specific error types
        if (error.message?.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: error.message,
            },
          };
        }

        if (
          error.message?.includes("must belong to the same store") ||
          error.message?.includes("not active") ||
          error.message?.includes("must be 500 characters")
        ) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: error.message,
            },
          };
        }

        // Generic error response
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to move pack between bins",
          },
        };
      }
    },
  );

  /**
   * POST /api/lottery/packs/:packId/deplete
   * Manually mark a lottery pack as sold out (depleted)
   * Protected route - requires LOTTERY_SHIFT_CLOSE permission
   *
   * This endpoint allows users to manually mark an ACTIVE pack as DEPLETED
   * when all tickets have been sold. It creates appropriate audit trails
   * and closing records.
   *
   * MCP Guidance Applied:
   * - DB-006: TENANT_ISOLATION - Validate user has store access via role scope
   * - API-001: VALIDATION - Schema validation for request parameters
   * - API-003: ERROR_HANDLING - Return generic errors, never leak internals
   * - DB-001: ORM_USAGE - Use Prisma ORM with transactions for atomicity
   */
  fastify.post(
    "/api/lottery/packs/:packId/deplete",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_SHIFT_CLOSE),
      ],
      schema: {
        description: "Manually mark a lottery pack as sold out (depleted)",
        tags: ["lottery"],
        params: {
          type: "object",
          required: ["packId"],
          properties: {
            packId: {
              type: "string",
              format: "uuid",
              description: "Pack UUID to mark as depleted",
            },
          },
        },
        body: {
          type: "object",
          properties: {
            closing_serial: {
              type: "string",
              maxLength: 100,
              description:
                "Optional closing serial number (defaults to pack serial_end)",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  pack_id: { type: "string", format: "uuid" },
                  pack_number: { type: "string" },
                  status: { type: "string", enum: ["DEPLETED"] },
                  depleted_at: { type: "string", format: "date-time" },
                  depletion_reason: {
                    type: "string",
                    enum: ["MANUAL_SOLD_OUT"],
                  },
                  game_name: { type: "string" },
                  bin_name: { type: "string", nullable: true },
                },
              },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          500: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;
      const params = request.params as { packId: string };
      const body = (request.body as { closing_serial?: string }) || {};

      try {
        // Extract audit metadata
        const ipAddress =
          (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
          request.ip ||
          request.socket.remoteAddress ||
          null;
        const userAgent = request.headers["user-agent"] || null;

        // Fetch pack with relationships for validation
        const pack = await prisma.lotteryPack.findUnique({
          where: { pack_id: params.packId },
          include: {
            game: {
              select: {
                game_id: true,
                name: true,
              },
            },
            store: {
              select: {
                store_id: true,
                name: true,
                company_id: true,
              },
            },
            bin: {
              select: {
                bin_id: true,
                name: true,
              },
            },
          },
        });

        if (!pack) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "PACK_NOT_FOUND",
              message: "Lottery pack not found",
            },
          };
        }

        // Validate user has access to this store (TENANT_ISOLATION - DB-006)
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasAccess = validateUserStoreAccess(
          userRoles,
          pack.store_id,
          pack.store.company_id,
        );

        if (!hasAccess) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "FORBIDDEN",
              message:
                "You do not have access to this store's lottery packs (RLS violation)",
            },
          };
        }

        // Validate pack is in ACTIVE status (only ACTIVE packs can be manually depleted)
        if (pack.status !== "ACTIVE") {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "INVALID_PACK_STATUS",
              message: `Pack must be ACTIVE to mark as sold out. Current status: ${pack.status}`,
            },
          };
        }

        // Determine closing serial (use provided or default to serial_end)
        // NOTE: closing_serial is stored as a string and used in shift closing records.
        // Validation against serial_end is deferred to the UI layer for flexibility.
        const closingSerial = body.closing_serial || pack.serial_end;

        // Find active shift for this store (if any)
        const activeShift = await prisma.shift.findFirst({
          where: {
            store_id: pack.store_id,
            status: {
              in: ["OPEN", "ACTIVE", "CLOSING", "RECONCILING"],
            },
            closed_at: null,
          },
          orderBy: {
            opened_at: "desc",
          },
          select: {
            shift_id: true,
            cashier_id: true, // Include for lottery closing records
          },
        });

        // Perform atomic update in transaction (ORM_USAGE - DB-001)
        const result = await prisma.$transaction(async (tx) => {
          const now = new Date();

          // 1. Update pack status to DEPLETED with manual sold out reason
          const updatedPack = await tx.lotteryPack.update({
            where: { pack_id: params.packId },
            data: {
              status: "DEPLETED",
              depleted_at: now,
              depleted_by: user.id,
              depleted_shift_id: activeShift?.shift_id || null,
              depletion_reason: "MANUAL_SOLD_OUT",
            },
            include: {
              game: { select: { name: true } },
              bin: { select: { name: true } },
            },
          });

          // 2. Create shift closing record if there's an active shift
          if (activeShift) {
            // Check if closing record already exists for this shift/pack
            const existingClosing = await tx.lotteryShiftClosing.findUnique({
              where: {
                shift_id_pack_id: {
                  shift_id: activeShift.shift_id,
                  pack_id: params.packId,
                },
              },
            });

            if (!existingClosing) {
              await tx.lotteryShiftClosing.create({
                data: {
                  shift_id: activeShift.shift_id,
                  pack_id: params.packId,
                  cashier_id: activeShift.cashier_id, // Direct cashier reference
                  closing_serial: closingSerial,
                  entry_method: "MANUAL",
                  manual_entry_authorized_by: user.id,
                  manual_entry_authorized_at: now,
                },
              });
            }
          }

          // 3. Create audit log entry
          try {
            await tx.auditLog.create({
              data: {
                user_id: user.id,
                action: "PACK_MANUALLY_DEPLETED",
                table_name: "lottery_packs",
                record_id: params.packId,
                new_values: {
                  status: "DEPLETED",
                  depleted_at: now.toISOString(),
                  depleted_by: user.id,
                  depleted_shift_id: activeShift?.shift_id || null,
                  depletion_reason: "MANUAL_SOLD_OUT",
                  closing_serial: closingSerial,
                },
                ip_address: ipAddress,
                user_agent: userAgent,
                reason: `Lottery pack ${pack.pack_number} manually marked as sold out by user`,
              },
            });
          } catch (auditError) {
            // Log audit failure but don't fail the operation
            fastify.log.error(
              { error: auditError },
              "Failed to create audit log for manual pack depletion",
            );
          }

          return updatedPack;
        });

        // === UPC CLEANUP FROM REDIS AND POS ===
        // Remove UPCs when pack is depleted
        try {
          const cleanupResult = await syncPackDeactivation(
            params.packId,
            pack.store_id,
          );

          if (cleanupResult.redisDeleted || cleanupResult.posRemoved) {
            fastify.log.info(
              {
                packId: params.packId,
                redisDeleted: cleanupResult.redisDeleted,
                posRemoved: cleanupResult.posRemoved,
              },
              "Pack UPCs cleaned up on depletion",
            );
          }
        } catch (cleanupError) {
          // Log but don't fail depletion - UPC cleanup is non-critical
          fastify.log.error(
            { error: cleanupError, packId: params.packId },
            "Failed to cleanup pack UPCs on depletion (non-fatal)",
          );
        }

        reply.code(200);
        return {
          success: true,
          data: {
            pack_id: result.pack_id,
            pack_number: pack.pack_number,
            status: result.status,
            depleted_at: result.depleted_at?.toISOString(),
            depletion_reason: result.depletion_reason,
            game_name: result.game.name,
            bin_name: result.bin?.name || null,
          },
        };
      } catch (error: unknown) {
        fastify.log.error({ error }, "Error manually depleting lottery pack");

        // Generic error response (ERROR_HANDLING - API-003)
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to mark pack as sold out",
          },
        };
      }
    },
  );

  /**
   * GET /api/lottery/games
   * Query active lottery games
   * Protected route - requires LOTTERY_GAME_READ permission
   * Story 6.11: Lottery Query API Endpoints (AC #1)
   */
  fastify.get(
    "/api/lottery/games",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_GAME_READ),
      ],
      schema: {
        description: "Get all active lottery games",
        tags: ["lottery"],
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    game_id: { type: "string", format: "uuid" },
                    game_code: { type: "string" },
                    name: { type: "string" },
                    description: { type: "string", nullable: true },
                    price: { type: "number", nullable: true },
                    pack_value: { type: "number", nullable: true },
                    total_tickets: { type: "integer", nullable: true },
                    status: { type: "string" },
                    created_at: { type: "string", format: "date-time" },
                    updated_at: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          401: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          500: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;

      try {
        // Extract IP address and user agent for audit logging
        const ipAddress =
          (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
          request.ip ||
          request.socket.remoteAddress ||
          null;
        const userAgent = request.headers["user-agent"] || null;

        // Build where clause based on user role
        // - SUPERADMIN sees ALL games (global + all store-scoped)
        // - Other users see global games + games from stores they have access to
        const isSuperAdmin = user.roles.includes("SUPERADMIN");
        const userRoles = await rbacService.getUserRoles(user.id);

        let whereClause: any = { status: "ACTIVE" };
        if (!isSuperAdmin) {
          // Get store IDs the user has access to
          const accessibleStoreIds: string[] = [];

          // Check for COMPANY scope - gives access to all stores in that company
          const companyRoles = userRoles.filter(
            (role) => role.scope === "COMPANY" && role.company_id,
          );
          if (companyRoles.length > 0) {
            const companyIds = companyRoles.map((r) => r.company_id!);
            const companyStores = await prisma.store.findMany({
              where: { company_id: { in: companyIds } },
              select: { store_id: true },
            });
            accessibleStoreIds.push(...companyStores.map((s) => s.store_id));
          }

          // Check for STORE scope - gives access to specific stores
          const storeRoles = userRoles.filter(
            (role) => role.scope === "STORE" && role.store_id,
          );
          accessibleStoreIds.push(...storeRoles.map((r) => r.store_id!));

          // Non-super admins see:
          // 1. Global games (store_id IS NULL)
          // 2. Games from stores they have access to
          whereClause = {
            status: "ACTIVE",
            OR: [{ store_id: null }, { store_id: { in: accessibleStoreIds } }],
          };
        }

        // Query active lottery games using Prisma ORM (prevents SQL injection)
        const games = await prisma.lotteryGame.findMany({
          where: whereClause,
          select: {
            game_id: true,
            game_code: true,
            name: true,
            description: true,
            price: true,
            pack_value: true,
            status: true,
            created_at: true,
            updated_at: true,
            store_id: true,
          },
          orderBy: {
            name: "asc",
          },
        });

        // Create audit log entry (non-blocking)
        try {
          await prisma.auditLog.create({
            data: {
              user_id: user.id,
              action: "LOTTERY_GAMES_QUERIED",
              table_name: "lottery_games",
              record_id: crypto.randomUUID(),
              new_values: {
                query_type: "GET_GAMES",
                filter_status: "ACTIVE",
              } as Record<string, any>,
              ip_address: ipAddress,
              user_agent: userAgent,
              reason: `Lottery games queried by ${user.email} (roles: ${user.roles.join(", ")})`,
            },
          });
        } catch (auditError) {
          fastify.log.error(
            { error: auditError },
            "Failed to create audit log for lottery games query",
          );
        }

        return {
          success: true,
          data: games.map((game) => {
            const price = game.price ? Number(game.price) : null;
            const packValue = game.pack_value ? Number(game.pack_value) : null;
            const totalTickets =
              price && packValue ? Math.floor(packValue / price) : null;
            return {
              game_id: game.game_id,
              game_code: game.game_code,
              name: game.name,
              description: game.description,
              price,
              pack_value: packValue,
              total_tickets: totalTickets,
              status: game.status,
              created_at: game.created_at.toISOString(),
              updated_at: game.updated_at.toISOString(),
              is_global: game.store_id === null,
            };
          }),
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error querying lottery games");

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to query lottery games",
          },
        };
      }
    },
  );

  /**
   * POST /api/lottery/games
   * Create a new lottery game
   * Protected route - requires LOTTERY_PACK_RECEIVE permission (game creation is part of pack reception workflow)
   * Used when receiving packs with unknown game codes
   * Enhanced: Now requires pack_value for serial number calculation (Story 6.x)
   */
  fastify.post(
    "/api/lottery/games",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_PACK_RECEIVE),
      ],
      schema: {
        description: "Create a new lottery game",
        tags: ["lottery"],
        body: {
          type: "object",
          required: ["game_code", "name", "price", "pack_value"],
          properties: {
            game_code: {
              type: "string",
              pattern: "^\\d{4}$",
              description: "4-digit game code",
            },
            name: {
              type: "string",
              minLength: 1,
              maxLength: 255,
              description: "Game name (will be stored uppercase)",
            },
            price: {
              type: "number",
              minimum: 0.01,
              description: "Ticket price (required, must be > 0)",
            },
            pack_value: {
              type: "number",
              minimum: 1,
              description:
                "Total pack value in dollars (required for calculating ticket count)",
            },
            description: {
              type: "string",
              maxLength: 500,
              description: "Optional game description",
            },
            store_id: {
              type: "string",
              format: "uuid",
              description:
                "Store ID for store-scoped games (required for non-SuperAdmin users, ignored for SuperAdmin)",
            },
          },
        },
        response: {
          201: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  game_id: { type: "string", format: "uuid" },
                  game_code: { type: "string" },
                  name: { type: "string" },
                  price: { type: "number" },
                  pack_value: { type: "number" },
                  total_tickets: { type: "integer" },
                  status: { type: "string" },
                },
              },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          409: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;
      const body = request.body as {
        game_code: string;
        name: string;
        price: number;
        pack_value: number;
        description?: string;
        store_id?: string;
      };

      try {
        // Validate game_code format
        if (!/^\d{4}$/.test(body.game_code)) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Game code must be exactly 4 digits",
            },
          };
        }

        // Normalize name to uppercase
        const normalizedName = body.name.trim().toUpperCase();

        if (normalizedName.length === 0) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Game name is required",
            },
          };
        }

        // Validate price is positive
        if (!body.price || body.price <= 0) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Ticket price is required and must be greater than 0",
            },
          };
        }

        // Validate pack_value is positive
        if (!body.pack_value || body.pack_value <= 0) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Pack value is required and must be greater than 0",
            },
          };
        }

        // Validate pack_value is divisible by price (whole number of tickets)
        const totalTickets = body.pack_value / body.price;
        if (!Number.isInteger(totalTickets)) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: `Pack value ($${body.pack_value}) must be evenly divisible by ticket price ($${body.price}) to yield a whole number of tickets`,
            },
          };
        }

        // Determine game scope based on user role
        // - SUPERADMIN creates global games (store_id = null)
        // - Other users create store-scoped games (store_id required in body)
        const isSuperAdmin = user.roles.includes("SUPERADMIN");
        let storeId: string | null = null;

        if (!isSuperAdmin) {
          // Non-SuperAdmin users MUST provide store_id
          if (!body.store_id) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "store_id is required for creating store-scoped games",
              },
            };
          }

          // Validate store exists and user has access to it
          const store = await prisma.store.findUnique({
            where: { store_id: body.store_id },
            select: { store_id: true, company_id: true, name: true },
          });

          if (!store) {
            reply.code(404);
            return {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: "Store not found",
              },
            };
          }

          // Validate user has access to this store
          const userRoles = await rbacService.getUserRoles(user.id);
          if (
            !validateUserStoreAccess(userRoles, body.store_id, store.company_id)
          ) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "FORBIDDEN",
                message: "You do not have access to this store",
              },
            };
          }

          storeId = body.store_id;
        }

        // Check if game_code already exists for this scope
        // For global games: check if a global game with this code exists
        // For store games: check if a store game with this code exists for this store
        const existingGame = await prisma.lotteryGame.findFirst({
          where: {
            game_code: body.game_code,
            store_id: storeId,
          },
        });

        if (existingGame) {
          reply.code(409);
          return {
            success: false,
            error: {
              code: "DUPLICATE_GAME_CODE",
              message: isSuperAdmin
                ? `Global game with code ${body.game_code} already exists`
                : `Game with code ${body.game_code} already exists for this store`,
            },
          };
        }

        // Create the game with pack_value, tickets_per_pack, and scoping
        const newGame = await prisma.lotteryGame.create({
          data: {
            game_code: body.game_code,
            name: normalizedName,
            price: body.price,
            pack_value: body.pack_value,
            tickets_per_pack: totalTickets, // Store computed tickets for serial range calculation
            description: body.description?.trim() || null,
            status: "ACTIVE",
            created_by_user_id: user.id,
            store_id: storeId,
          },
        });

        // Audit log
        const ipAddress =
          (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
          request.ip ||
          request.socket.remoteAddress ||
          null;
        const userAgent = request.headers["user-agent"] || null;

        try {
          const scopeDescription = isSuperAdmin
            ? "global"
            : `store-scoped (${storeId})`;
          await prisma.auditLog.create({
            data: {
              user_id: user.id,
              action: "LOTTERY_GAME_CREATED",
              table_name: "lottery_games",
              record_id: newGame.game_id,
              new_values: {
                game_id: newGame.game_id,
                game_code: newGame.game_code,
                name: newGame.name,
                price: Number(newGame.price),
                pack_value: Number(newGame.pack_value),
                total_tickets: totalTickets,
                store_id: storeId,
                is_global: isSuperAdmin,
              } as Record<string, any>,
              ip_address: ipAddress,
              user_agent: userAgent,
              reason: `Lottery game created by ${user.email} - ${newGame.name} (${newGame.game_code}) - $${body.price} ticket, $${body.pack_value} pack (${totalTickets} tickets) - ${scopeDescription}`,
            },
          });
        } catch (auditError) {
          fastify.log.error(
            { error: auditError },
            "Failed to create audit log for game creation",
          );
        }

        reply.code(201);
        return {
          success: true,
          data: {
            game_id: newGame.game_id,
            game_code: newGame.game_code,
            name: newGame.name,
            price: Number(newGame.price),
            pack_value: Number(newGame.pack_value),
            total_tickets: totalTickets,
            status: newGame.status,
            is_global: isSuperAdmin,
          },
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error creating lottery game");

        // Handle unique constraint violation
        if (error.code === "P2002") {
          reply.code(409);
          return {
            success: false,
            error: {
              code: "DUPLICATE_GAME_CODE",
              message: `Game with code ${body.game_code} already exists`,
            },
          };
        }

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to create lottery game",
          },
        };
      }
    },
  );

  /**
   * GET /api/lottery/packs
   * Query lottery packs with filters
   * Protected route - requires LOTTERY_PACK_READ permission
   * Story 6.11: Lottery Query API Endpoints (AC #2)
   */
  fastify.get(
    "/api/lottery/packs",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_PACK_READ),
      ],
      schema: {
        description: "Query lottery packs with filters",
        tags: ["lottery"],
        querystring: {
          type: "object",
          required: ["store_id"],
          properties: {
            store_id: {
              type: "string",
              format: "uuid",
              description: "Store UUID (required)",
            },
            status: {
              type: "string",
              enum: ["RECEIVED", "ACTIVE", "DEPLETED", "RETURNED"],
              description: "Filter by pack status",
            },
            game_id: {
              type: "string",
              format: "uuid",
              description: "Filter by game UUID",
            },
            search: {
              type: "string",
              minLength: 2,
              maxLength: 100,
              description:
                "Search by game name or pack number (case-insensitive, min 2 chars)",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    pack_id: { type: "string", format: "uuid" },
                    game_id: { type: "string", format: "uuid" },
                    pack_number: { type: "string" },
                    serial_start: { type: "string" },
                    serial_end: { type: "string" },
                    status: { type: "string" },
                    store_id: { type: "string", format: "uuid" },
                    current_bin_id: {
                      type: "string",
                      format: "uuid",
                      nullable: true,
                    },
                    received_at: {
                      type: "string",
                      format: "date-time",
                      nullable: true,
                    },
                    activated_at: {
                      type: "string",
                      format: "date-time",
                      nullable: true,
                    },
                    game: {
                      type: "object",
                      properties: {
                        game_id: { type: "string", format: "uuid" },
                        game_code: { type: "string" },
                        name: { type: "string" },
                        price: { type: "number", nullable: true },
                      },
                    },
                    store: {
                      type: "object",
                      properties: {
                        store_id: { type: "string", format: "uuid" },
                        name: { type: "string" },
                      },
                    },
                    bin: {
                      type: "object",
                      nullable: true,
                      properties: {
                        bin_id: { type: "string", format: "uuid" },
                        name: { type: "string" },
                        location: { type: "string", nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          401: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          500: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;
      const query = request.query as {
        store_id: string;
        status?: "RECEIVED" | "ACTIVE" | "DEPLETED" | "RETURNED";
        game_id?: string;
        search?: string;
      };

      try {
        // Extract IP address and user agent for audit logging
        const ipAddress =
          (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
          request.ip ||
          request.socket.remoteAddress ||
          null;
        const userAgent = request.headers["user-agent"] || null;

        // Get user roles to determine store access (RLS enforcement)
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        // Validate store exists and get its company_id for COMPANY scope validation
        const store = await prisma.store.findUnique({
          where: { store_id: query.store_id },
          select: { store_id: true, name: true, company_id: true },
        });

        if (!store) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Store not found",
            },
          };
        }

        // Validate store access based on user's role scope (RLS enforcement)
        // Scope hierarchy: SYSTEM > COMPANY > STORE
        if (!hasSystemScope) {
          // Check for STORE scope: user has direct store assignment
          const hasStoreAccess = userRoles.some(
            (role) =>
              role.scope === "STORE" && role.store_id === query.store_id,
          );

          // Check for COMPANY scope: user has company-level access (e.g., CLIENT_OWNER)
          // They can access any store within their assigned company
          const hasCompanyAccess = userRoles.some(
            (role) =>
              role.scope === "COMPANY" &&
              role.company_id !== null &&
              role.company_id === store.company_id,
          );

          if (!hasStoreAccess && !hasCompanyAccess) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "FORBIDDEN",
                message:
                  "You do not have access to this store. Please contact your manager.",
              },
            };
          }
        }

        // Build query filter using Prisma ORM (prevents SQL injection)
        // MCP SEC-006: SQL_INJECTION - Using Prisma ORM parameterized queries
        const whereClause: any = {
          store_id: query.store_id, // RLS enforced via store_id filter
        };

        if (query.status) {
          whereClause.status = query.status;
        }

        if (query.game_id) {
          whereClause.game_id = query.game_id;
        }

        // Add search filter for game name or pack number (case-insensitive)
        // MCP SEC-006: Using Prisma's contains with mode: insensitive (no SQL injection)
        if (query.search && query.search.length >= 2) {
          whereClause.OR = [
            { game: { name: { contains: query.search, mode: "insensitive" } } },
            { pack_number: { contains: query.search, mode: "insensitive" } },
          ];
        }

        // Query packs with relationships using Prisma ORM
        const packs = await prisma.lotteryPack.findMany({
          where: whereClause,
          include: {
            game: {
              select: {
                game_id: true,
                game_code: true,
                name: true,
                price: true,
              },
            },
            store: {
              select: {
                store_id: true,
                name: true,
              },
            },
            bin: {
              select: {
                bin_id: true,
                name: true,
                location: true,
              },
            },
          },
          orderBy: {
            received_at: "desc",
          },
        });

        // Create audit log entry (non-blocking)
        try {
          await prisma.auditLog.create({
            data: {
              user_id: user.id,
              action: "LOTTERY_PACKS_QUERIED",
              table_name: "lottery_packs",
              record_id: crypto.randomUUID(),
              new_values: {
                query_type: "GET_PACKS",
                store_id: query.store_id,
                status_filter: query.status || null,
                game_id_filter: query.game_id || null,
              } as Record<string, any>,
              ip_address: ipAddress,
              user_agent: userAgent,
              reason: `Lottery packs queried by ${user.email} (roles: ${user.roles.join(", ")}) - Store: ${query.store_id}`,
            },
          });
        } catch (auditError) {
          fastify.log.error(
            { error: auditError },
            "Failed to create audit log for lottery packs query",
          );
        }

        return {
          success: true,
          data: packs.map((pack) => ({
            pack_id: pack.pack_id,
            game_id: pack.game_id,
            pack_number: pack.pack_number,
            serial_start: pack.serial_start,
            serial_end: pack.serial_end,
            status: pack.status,
            store_id: pack.store_id,
            current_bin_id: pack.current_bin_id,
            received_at: pack.received_at?.toISOString() || null,
            activated_at: pack.activated_at?.toISOString() || null,
            game: pack.game,
            store: pack.store,
            bin: pack.bin || null,
          })),
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error querying lottery packs");

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to query lottery packs",
          },
        };
      }
    },
  );

  /**
   * GET /api/lottery/packs/check/:storeId/:packNumber
   * Check if a pack exists in a store by pack number
   * Used for real-time duplicate detection during pack reception
   * Protected route - requires LOTTERY_PACK_READ permission
   */
  fastify.get(
    "/api/lottery/packs/check/:storeId/:packNumber",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_PACK_READ),
      ],
      schema: {
        description: "Check if a pack exists in a store by pack number",
        tags: ["lottery"],
        params: {
          type: "object",
          required: ["storeId", "packNumber"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
            packNumber: {
              type: "string",
              description: "Pack number to check",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  exists: { type: "boolean" },
                  pack: {
                    type: "object",
                    nullable: true,
                    properties: {
                      pack_id: { type: "string", format: "uuid" },
                      status: { type: "string" },
                      game: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;
      const params = request.params as { storeId: string; packNumber: string };

      try {
        // Get user roles to validate store access
        const userRoles = await rbacService.getUserRoles(user.id);

        // Validate store exists and get its company_id
        const store = await prisma.store.findUnique({
          where: { store_id: params.storeId },
          select: { store_id: true, company_id: true },
        });

        if (!store) {
          reply.code(404);
          return {
            success: false,
            error: { code: "NOT_FOUND", message: "Store not found" },
          };
        }

        // Validate store access
        if (
          !validateUserStoreAccess(userRoles, params.storeId, store.company_id)
        ) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "Access denied to this store",
            },
          };
        }

        // Check if pack exists
        const existingPack = await prisma.lotteryPack.findUnique({
          where: {
            store_id_pack_number: {
              store_id: params.storeId,
              pack_number: params.packNumber,
            },
          },
          select: {
            pack_id: true,
            status: true,
            game: {
              select: {
                name: true,
              },
            },
          },
        });

        return {
          success: true,
          data: {
            exists: !!existingPack,
            pack: existingPack || null,
          },
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error checking pack existence");
        reply.code(500);
        return {
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Failed to check pack" },
        };
      }
    },
  );

  /**
   * GET /api/lottery/packs/:packId
   * Get detailed pack information by ID
   * Protected route - requires LOTTERY_PACK_READ permission
   * Story 6.11: Lottery Query API Endpoints (AC #3)
   */
  fastify.get(
    "/api/lottery/packs/:packId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_PACK_READ),
      ],
      schema: {
        description: "Get detailed pack information by ID",
        tags: ["lottery"],
        params: {
          type: "object",
          required: ["packId"],
          properties: {
            packId: {
              type: "string",
              format: "uuid",
              description: "Pack UUID",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  pack_id: { type: "string", format: "uuid" },
                  game_id: { type: "string", format: "uuid" },
                  pack_number: { type: "string" },
                  serial_start: { type: "string" },
                  serial_end: { type: "string" },
                  status: { type: "string" },
                  store_id: { type: "string", format: "uuid" },
                  current_bin_id: {
                    type: "string",
                    format: "uuid",
                    nullable: true,
                  },
                  received_at: {
                    type: "string",
                    format: "date-time",
                    nullable: true,
                  },
                  activated_at: {
                    type: "string",
                    format: "date-time",
                    nullable: true,
                  },
                  depleted_at: {
                    type: "string",
                    format: "date-time",
                    nullable: true,
                  },
                  returned_at: {
                    type: "string",
                    format: "date-time",
                    nullable: true,
                  },
                  tickets_remaining: { type: "number", nullable: true },
                  game: {
                    type: "object",
                    properties: {
                      game_id: { type: "string", format: "uuid" },
                      name: { type: "string" },
                    },
                  },
                  store: {
                    type: "object",
                    properties: {
                      store_id: { type: "string", format: "uuid" },
                      name: { type: "string" },
                    },
                  },
                  bin: {
                    type: "object",
                    nullable: true,
                    properties: {
                      bin_id: { type: "string", format: "uuid" },
                      name: { type: "string" },
                      location: { type: "string", nullable: true },
                    },
                  },
                  shift_openings: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        opening_id: { type: "string", format: "uuid" },
                        shift_id: { type: "string", format: "uuid" },
                        opening_serial: { type: "string" },
                        opened_at: { type: "string", format: "date-time" },
                      },
                    },
                  },
                  shift_closings: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        closing_id: { type: "string", format: "uuid" },
                        shift_id: { type: "string", format: "uuid" },
                        closing_serial: { type: "string" },
                        opening_serial: { type: "string" },
                        expected_count: { type: "number" },
                        actual_count: { type: "number" },
                        difference: { type: "number" },
                        has_variance: { type: "boolean" },
                        variance_id: {
                          type: "string",
                          format: "uuid",
                          nullable: true,
                        },
                        closed_at: { type: "string", format: "date-time" },
                      },
                    },
                  },
                },
              },
            },
          },
          401: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          500: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;
      const params = request.params as { packId: string };

      try {
        // Extract IP address and user agent for audit logging
        const ipAddress =
          (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
          request.ip ||
          request.socket.remoteAddress ||
          null;
        const userAgent = request.headers["user-agent"] || null;

        // Get user roles to determine store access (RLS enforcement)
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        // Query pack with relationships using Prisma ORM (prevents SQL injection)
        const pack = await prisma.lotteryPack.findUnique({
          where: { pack_id: params.packId },
          include: {
            game: {
              select: {
                game_id: true,
                name: true,
              },
            },
            store: {
              select: {
                store_id: true,
                name: true,
                company_id: true, // Added for COMPANY scope RLS check
              },
            },
            bin: {
              select: {
                bin_id: true,
                name: true,
                location: true,
              },
            },
            shift_openings: {
              select: {
                opening_id: true,
                shift_id: true,
                opening_serial: true,
                created_at: true,
              },
              orderBy: {
                created_at: "desc",
              },
            },
            shift_closings: {
              select: {
                closing_id: true,
                shift_id: true,
                closing_serial: true,
                created_at: true,
              },
              orderBy: {
                created_at: "desc",
              },
            },
          },
        });

        if (!pack) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "PACK_NOT_FOUND",
              message: "Lottery pack not found",
            },
          };
        }

        // Validate store access based on user's role scope (RLS enforcement)
        // Scope hierarchy: SYSTEM > COMPANY > STORE
        if (!hasSystemScope) {
          // Check for STORE scope: user has direct store assignment
          const hasStoreAccess = userRoles.some(
            (role) => role.scope === "STORE" && role.store_id === pack.store_id,
          );

          // Check for COMPANY scope: user has company-level access (e.g., CLIENT_OWNER)
          // They can access any store within their assigned company
          const hasCompanyAccess = userRoles.some(
            (role) =>
              role.scope === "COMPANY" &&
              role.company_id === pack.store.company_id,
          );

          if (!hasStoreAccess && !hasCompanyAccess) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "FORBIDDEN",
                message:
                  "You can only access packs for your assigned store. Pack belongs to a different store (RLS violation)",
              },
            };
          }
        }

        // Calculate tickets_remaining
        // Formula: (serial_end - serial_start + 1) - COUNT(LotteryTicketSerial WHERE pack_id = packId AND sold_at IS NOT NULL)
        // Note: LotteryTicketSerial model doesn't exist yet, so for now we'll calculate based on serial range
        // TODO: Replace with actual ticket serial tracking when model is implemented
        let ticketsRemaining: number | null = null;
        try {
          const serialStartBigInt = BigInt(pack.serial_start);
          const serialEndBigInt = BigInt(pack.serial_end);
          const totalTickets = Number(
            serialEndBigInt - serialStartBigInt + BigInt(1),
          );

          // For now, assume no tickets sold until LotteryTicketSerial model is implemented
          // When implemented, query: COUNT(LotteryTicketSerial WHERE pack_id = packId AND sold_at IS NOT NULL)
          ticketsRemaining = totalTickets;
        } catch (error) {
          // If serial numbers are not numeric, set to null
          ticketsRemaining = null;
        }

        // Get shift closings with variance information
        const shiftClosingsWithVariance = await Promise.all(
          pack.shift_closings.map(async (closing) => {
            // Find corresponding opening for this closing
            const opening = pack.shift_openings.find(
              (o) => o.shift_id === closing.shift_id,
            );

            // Find variance for this shift and pack
            const variance = await prisma.lotteryVariance.findFirst({
              where: {
                shift_id: closing.shift_id,
                pack_id: pack.pack_id,
              },
              select: {
                variance_id: true,
                expected: true,
                actual: true,
                difference: true,
              },
            });

            // Calculate expected count from opening/closing serials
            let expectedCount = 0;
            let actualCount = 0;
            if (opening) {
              try {
                const openingSerialBigInt = BigInt(opening.opening_serial);
                const closingSerialBigInt = BigInt(closing.closing_serial);
                expectedCount = Number(
                  closingSerialBigInt - openingSerialBigInt + BigInt(1),
                );
              } catch (error) {
                // If serials are not numeric, use variance data if available
                expectedCount = variance?.expected || 0;
              }
            }

            // Use variance actual count if available, otherwise use expected
            actualCount = variance?.actual || expectedCount;

            return {
              closing_id: closing.closing_id,
              shift_id: closing.shift_id,
              closing_serial: closing.closing_serial,
              opening_serial: opening?.opening_serial || "",
              expected_count: expectedCount,
              actual_count: actualCount,
              difference: variance?.difference || 0,
              has_variance: variance !== null,
              variance_id: variance?.variance_id || null,
              closed_at: closing.created_at.toISOString(),
            };
          }),
        );

        // Create audit log entry (non-blocking)
        try {
          await prisma.auditLog.create({
            data: {
              user_id: user.id,
              action: "LOTTERY_PACK_DETAILS_QUERIED",
              table_name: "lottery_packs",
              record_id: pack.pack_id,
              new_values: {
                query_type: "GET_PACK_DETAILS",
                pack_id: pack.pack_id,
              } as Record<string, any>,
              ip_address: ipAddress,
              user_agent: userAgent,
              reason: `Lottery pack details queried by ${user.email} (roles: ${user.roles.join(", ")}) - Pack: ${pack.pack_number}`,
            },
          });
        } catch (auditError) {
          fastify.log.error(
            { error: auditError },
            "Failed to create audit log for lottery pack details query",
          );
        }

        return {
          success: true,
          data: {
            pack_id: pack.pack_id,
            game_id: pack.game_id,
            pack_number: pack.pack_number,
            serial_start: pack.serial_start,
            serial_end: pack.serial_end,
            status: pack.status,
            store_id: pack.store_id,
            current_bin_id: pack.current_bin_id,
            received_at: pack.received_at?.toISOString() || null,
            activated_at: pack.activated_at?.toISOString() || null,
            depleted_at: pack.depleted_at?.toISOString() || null,
            returned_at: pack.returned_at?.toISOString() || null,
            tickets_remaining: ticketsRemaining,
            game: pack.game,
            store: pack.store,
            bin: pack.bin || null,
            shift_openings: pack.shift_openings.map((opening) => ({
              opening_id: opening.opening_id,
              shift_id: opening.shift_id,
              opening_serial: opening.opening_serial,
              opened_at: opening.created_at.toISOString(),
            })),
            shift_closings: shiftClosingsWithVariance,
          },
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error querying lottery pack details");

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to query lottery pack details",
          },
        };
      }
    },
  );

  /**
   * GET /api/lottery/variances
   * Query lottery variances with filters
   * Protected route - requires LOTTERY_VARIANCE_READ permission
   * Story 6.11: Lottery Query API Endpoints (AC #4)
   */
  fastify.get(
    "/api/lottery/variances",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_VARIANCE_READ),
      ],
      schema: {
        description: "Query lottery variances with filters",
        tags: ["lottery"],
        querystring: {
          type: "object",
          required: ["store_id"],
          properties: {
            store_id: {
              type: "string",
              format: "uuid",
              description: "Store UUID (required)",
            },
            status: {
              type: "string",
              enum: ["unresolved", "resolved"],
              description:
                "Filter by variance status (unresolved = approved_by is null)",
            },
            shift_id: {
              type: "string",
              format: "uuid",
              description: "Filter by shift UUID",
            },
            pack_id: {
              type: "string",
              format: "uuid",
              description: "Filter by pack UUID",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    variance_id: { type: "string", format: "uuid" },
                    shift_id: { type: "string", format: "uuid" },
                    pack_id: { type: "string", format: "uuid" },
                    expected_count: { type: "number" },
                    actual_count: { type: "number" },
                    difference: { type: "number" },
                    variance_reason: { type: "string", nullable: true },
                    approved_by: {
                      type: "string",
                      format: "uuid",
                      nullable: true,
                    },
                    approved_at: {
                      type: "string",
                      format: "date-time",
                      nullable: true,
                    },
                    created_at: { type: "string", format: "date-time" },
                    pack: {
                      type: "object",
                      nullable: true,
                      properties: {
                        pack_id: { type: "string", format: "uuid" },
                        pack_number: { type: "string" },
                        game: {
                          type: "object",
                          properties: {
                            game_id: { type: "string", format: "uuid" },
                            name: { type: "string" },
                          },
                        },
                      },
                    },
                    shift: {
                      type: "object",
                      nullable: true,
                      properties: {
                        shift_id: { type: "string", format: "uuid" },
                        status: { type: "string" },
                        opened_at: { type: "string", format: "date-time" },
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          401: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          500: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;
      const query = request.query as {
        store_id: string;
        status?: "unresolved" | "resolved";
        shift_id?: string;
        pack_id?: string;
      };

      try {
        // Extract IP address and user agent for audit logging
        const ipAddress =
          (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
          request.ip ||
          request.socket.remoteAddress ||
          null;
        const userAgent = request.headers["user-agent"] || null;

        // Get user roles to determine store access (RLS enforcement)
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        // Validate store_id matches user's store (RLS enforcement)
        // System admins can access any store
        if (!hasSystemScope) {
          const userStoreRole = userRoles.find(
            (role) =>
              role.scope === "STORE" && role.store_id === query.store_id,
          );
          if (!userStoreRole) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "FORBIDDEN",
                message:
                  "You can only query variances for your assigned store. store_id does not match your store access",
              },
            };
          }
        }

        // Validate store exists
        const store = await prisma.store.findUnique({
          where: { store_id: query.store_id },
          select: { store_id: true, name: true },
        });

        if (!store) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Store not found",
            },
          };
        }

        // Build query filter using Prisma ORM (prevents SQL injection)
        // RLS: Filter variances by store_id through pack relationship
        const whereClause: any = {
          pack: {
            store_id: query.store_id, // RLS enforced via pack.store_id
          },
        };

        if (query.status) {
          if (query.status === "unresolved") {
            whereClause.approved_by = null;
          } else if (query.status === "resolved") {
            whereClause.approved_by = { not: null };
          }
        }

        if (query.shift_id) {
          whereClause.shift_id = query.shift_id;
        }

        if (query.pack_id) {
          whereClause.pack_id = query.pack_id;
        }

        // Query variances with relationships using Prisma ORM
        const variances = await prisma.lotteryVariance.findMany({
          where: whereClause,
          include: {
            pack: {
              select: {
                pack_id: true,
                pack_number: true,
                game: {
                  select: {
                    game_id: true,
                    name: true,
                  },
                },
              },
            },
            shift: {
              select: {
                shift_id: true,
                status: true,
                opened_at: true,
              },
            },
          },
          orderBy: {
            created_at: "desc",
          },
        });

        // Create audit log entry (non-blocking)
        try {
          await prisma.auditLog.create({
            data: {
              user_id: user.id,
              action: "LOTTERY_VARIANCES_QUERIED",
              table_name: "lottery_variances",
              record_id: crypto.randomUUID(),
              new_values: {
                query_type: "GET_VARIANCES",
                store_id: query.store_id,
                status_filter: query.status || null,
                shift_id_filter: query.shift_id || null,
                pack_id_filter: query.pack_id || null,
              } as Record<string, any>,
              ip_address: ipAddress,
              user_agent: userAgent,
              reason: `Lottery variances queried by ${user.email} (roles: ${user.roles.join(", ")}) - Store: ${query.store_id}`,
            },
          });
        } catch (auditError) {
          fastify.log.error(
            { error: auditError },
            "Failed to create audit log for lottery variances query",
          );
        }

        return {
          success: true,
          data: variances.map((variance) => ({
            variance_id: variance.variance_id,
            shift_id: variance.shift_id,
            pack_id: variance.pack_id,
            expected_count: variance.expected,
            actual_count: variance.actual,
            difference: variance.difference,
            variance_reason: variance.reason,
            approved_by: variance.approved_by,
            approved_at: variance.approved_at?.toISOString() || null,
            created_at: variance.created_at.toISOString(),
            pack: variance.pack
              ? {
                  pack_id: variance.pack.pack_id,
                  pack_number: variance.pack.pack_number,
                  game: variance.pack.game,
                }
              : null,
            shift: variance.shift
              ? {
                  shift_id: variance.shift.shift_id,
                  status: variance.shift.status,
                  opened_at: variance.shift.opened_at.toISOString(),
                }
              : null,
          })),
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error querying lottery variances");

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to query lottery variances",
          },
        };
      }
    },
  );

  /**
   * GET /api/lottery/bins
   * Query lottery bins for a store
   * Protected route - requires LOTTERY_BIN_READ permission
   * Story 6.11: Lottery Query API Endpoints (AC #5)
   */
  fastify.get(
    "/api/lottery/bins",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_BIN_READ),
      ],
      schema: {
        description: "Query lottery bins for a store",
        tags: ["lottery"],
        querystring: {
          type: "object",
          required: ["store_id"],
          properties: {
            store_id: {
              type: "string",
              format: "uuid",
              description: "Store UUID (required)",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    bin_id: { type: "string", format: "uuid" },
                    store_id: { type: "string", format: "uuid" },
                    name: { type: "string" },
                    location: { type: "string", nullable: true },
                    created_at: { type: "string", format: "date-time" },
                    updated_at: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          401: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          500: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;
      const query = request.query as {
        store_id: string;
      };

      try {
        // Extract IP address and user agent for audit logging
        const ipAddress =
          (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
          request.ip ||
          request.socket.remoteAddress ||
          null;
        const userAgent = request.headers["user-agent"] || null;

        // Get user roles to determine store access (RLS enforcement)
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        // Validate store_id matches user's store (RLS enforcement)
        // System admins can access any store
        if (!hasSystemScope) {
          const userStoreRole = userRoles.find(
            (role) =>
              role.scope === "STORE" && role.store_id === query.store_id,
          );
          if (!userStoreRole) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "FORBIDDEN",
                message:
                  "You can only query bins for your assigned store. store_id does not match your store access",
              },
            };
          }
        }

        // Validate store exists
        const store = await prisma.store.findUnique({
          where: { store_id: query.store_id },
          select: { store_id: true, name: true },
        });

        if (!store) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Store not found",
            },
          };
        }

        // Query bins using Prisma ORM (prevents SQL injection)
        // RLS enforced via store_id filter, only active bins (soft-deleted excluded)
        const bins = await prisma.lotteryBin.findMany({
          where: {
            store_id: query.store_id,
            is_active: true,
          },
          orderBy: {
            name: "asc",
          },
        });

        // Create audit log entry (non-blocking)
        try {
          await prisma.auditLog.create({
            data: {
              user_id: user.id,
              action: "LOTTERY_BINS_QUERIED",
              table_name: "lottery_bins",
              record_id: crypto.randomUUID(),
              new_values: {
                query_type: "GET_BINS",
                store_id: query.store_id,
              } as Record<string, any>,
              ip_address: ipAddress,
              user_agent: userAgent,
              reason: `Lottery bins queried by ${user.email} (roles: ${user.roles.join(", ")}) - Store: ${query.store_id}`,
            },
          });
        } catch (auditError) {
          fastify.log.error(
            { error: auditError },
            "Failed to create audit log for lottery bins query",
          );
        }

        return {
          success: true,
          data: bins.map((bin) => ({
            bin_id: bin.bin_id,
            store_id: bin.store_id,
            name: bin.name,
            location: bin.location,
            created_at: bin.created_at.toISOString(),
            updated_at: bin.updated_at.toISOString(),
          })),
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error querying lottery bins");

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to query lottery bins",
          },
        };
      }
    },
  );

  /**
   * GET /api/lottery/bins/configuration/:storeId
   * Get bin configuration for a store
   * Protected route - requires LOTTERY_BIN_CONFIG_READ permission
   * Story 6.13: Lottery Database Enhancements & Bin Management (AC #1)
   */
  fastify.get(
    "/api/lottery/bins/configuration/:storeId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_BIN_CONFIG_READ),
      ],
      schema: {
        description: "Get bin configuration for a store",
        tags: ["lottery"],
        params: {
          type: "object",
          required: ["storeId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  config_id: { type: "string", format: "uuid" },
                  store_id: { type: "string", format: "uuid" },
                  bin_template: { type: "array" },
                  created_at: { type: "string", format: "date-time" },
                  updated_at: { type: "string", format: "date-time" },
                },
              },
            },
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;
      const params = request.params as { storeId: string };

      try {
        // Extract IP address and user agent for audit logging
        const ipAddress =
          (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
          request.ip ||
          request.socket.remoteAddress ||
          null;
        const userAgent = request.headers["user-agent"] || null;

        // Get user roles to determine store access (RLS enforcement)
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        // Validate store exists and get store details
        const store = await prisma.store.findUnique({
          where: { store_id: params.storeId },
          select: { store_id: true, company_id: true, name: true },
        });

        if (!store) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Store not found",
            },
          };
        }

        // Validate store access based on user's role scope (RLS enforcement)
        if (!hasSystemScope) {
          // Check for STORE scope: user has direct store assignment
          const hasStoreAccess = userRoles.some(
            (role) =>
              role.scope === "STORE" && role.store_id === params.storeId,
          );

          // Check for COMPANY scope: user has company-level access (e.g., CLIENT_OWNER)
          // They can access any store within their assigned company
          const hasCompanyAccess = userRoles.some(
            (role) =>
              role.scope === "COMPANY" &&
              role.company_id !== null &&
              role.company_id === store.company_id,
          );

          // Check for CLIENT_OWNER or STORE_MANAGER role codes
          const hasRequiredRole = userRoles.some(
            (role) =>
              role.role_code === "CLIENT_OWNER" ||
              role.role_code === "STORE_MANAGER",
          );

          if (!hasStoreAccess && !hasCompanyAccess) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "FORBIDDEN",
                message:
                  "You do not have access to this store. Please contact your manager.",
              },
            };
          }

          if (!hasRequiredRole) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "FORBIDDEN",
                message:
                  "You must have CLIENT_OWNER or STORE_MANAGER role to access bin configurations.",
              },
            };
          }
        }

        // Query configuration using Prisma ORM (prevents SQL injection)
        const config = await prisma.lotteryBinConfiguration.findUnique({
          where: { store_id: params.storeId },
        });

        if (!config) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Bin configuration not found for this store",
            },
          };
        }

        // Create audit log entry (non-blocking)
        try {
          await prisma.auditLog.create({
            data: {
              user_id: user.id,
              action: "LOTTERY_BIN_CONFIG_READ",
              table_name: "lottery_bin_configurations",
              record_id: config.config_id,
              new_values: {
                config_id: config.config_id,
                store_id: config.store_id,
              } as Record<string, any>,
              ip_address: ipAddress,
              user_agent: userAgent,
              reason: `Bin configuration queried by ${user.email} (roles: ${user.roles.join(", ")}) - Store: ${params.storeId}`,
            },
          });
        } catch (auditError) {
          fastify.log.error(
            { error: auditError },
            "Failed to create audit log for bin configuration query",
          );
        }

        return {
          success: true,
          data: {
            config_id: config.config_id,
            store_id: config.store_id,
            bin_template: config.bin_template,
            created_at: config.created_at.toISOString(),
            updated_at: config.updated_at.toISOString(),
          },
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error querying bin configuration");

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to query bin configuration",
          },
        };
      }
    },
  );

  /**
   * POST /api/lottery/bins/configuration/:storeId
   * Create bin configuration for a store
   * Protected route - requires LOTTERY_BIN_CONFIG_WRITE permission
   * Story 6.13: Lottery Database Enhancements & Bin Management (AC #1)
   */
  fastify.post(
    "/api/lottery/bins/configuration/:storeId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_BIN_CONFIG_WRITE),
      ],
      schema: {
        description: "Create bin configuration for a store",
        tags: ["lottery"],
        params: {
          type: "object",
          required: ["storeId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
          },
        },
        body: {
          type: "object",
          required: ["bin_template"],
          properties: {
            bin_template: {
              type: "array",
              minItems: 1,
              maxItems: 200,
              items: {
                type: "object",
                required: ["name", "display_order"],
                properties: {
                  name: { type: "string", minLength: 1 },
                  location: { type: "string" },
                  display_order: { type: "integer", minimum: 0 },
                },
              },
            },
          },
        },
        response: {
          201: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  config_id: { type: "string", format: "uuid" },
                  store_id: { type: "string", format: "uuid" },
                  bin_template: { type: "array" },
                  created_at: { type: "string", format: "date-time" },
                  updated_at: { type: "string", format: "date-time" },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;
      const params = request.params as { storeId: string };
      const body = request.body as { bin_template: any[] };

      try {
        // Extract IP address and user agent for audit logging
        const ipAddress =
          (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
          request.ip ||
          request.socket.remoteAddress ||
          null;
        const userAgent = request.headers["user-agent"] || null;

        // Validate store_id format
        const storeIdValidation = validateStoreId(params.storeId);
        if (!storeIdValidation.valid) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: storeIdValidation.error,
            },
          };
        }

        // Validate bin_template structure
        const templateValidation = validateBinTemplate(body.bin_template);
        if (!templateValidation.valid) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: templateValidation.error,
            },
          };
        }

        // Validate display_order uniqueness per store
        const displayOrders = body.bin_template.map((bin) => bin.display_order);
        const uniqueDisplayOrders = new Set(displayOrders);
        if (displayOrders.length !== uniqueDisplayOrders.size) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message:
                "display_order must be unique for each bin within a store",
            },
          };
        }

        // Get user roles to determine store access (RLS enforcement)
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        // Validate store exists and get store details
        const store = await prisma.store.findUnique({
          where: { store_id: params.storeId },
          select: { store_id: true, company_id: true, name: true },
        });

        if (!store) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Store not found",
            },
          };
        }

        // Validate store access based on user's role scope (RLS enforcement)
        if (!hasSystemScope) {
          // Check for STORE scope: user has direct store assignment
          const hasStoreAccess = userRoles.some(
            (role) =>
              role.scope === "STORE" && role.store_id === params.storeId,
          );

          // Check for COMPANY scope: user has company-level access (e.g., CLIENT_OWNER)
          const hasCompanyAccess = userRoles.some(
            (role) =>
              role.scope === "COMPANY" &&
              role.company_id !== null &&
              role.company_id === store.company_id,
          );

          // Check for CLIENT_OWNER or STORE_MANAGER role codes
          const hasRequiredRole = userRoles.some(
            (role) =>
              role.role_code === "CLIENT_OWNER" ||
              role.role_code === "STORE_MANAGER",
          );

          if (!hasStoreAccess && !hasCompanyAccess) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "FORBIDDEN",
                message:
                  "You do not have access to this store. Please contact your manager.",
              },
            };
          }

          if (!hasRequiredRole) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "FORBIDDEN",
                message:
                  "You must have CLIENT_OWNER or STORE_MANAGER role to manage bin configurations.",
              },
            };
          }
        }

        // Check if configuration already exists
        const existingConfig = await prisma.lotteryBinConfiguration.findUnique({
          where: { store_id: params.storeId },
        });

        if (existingConfig) {
          reply.code(409);
          return {
            success: false,
            error: {
              code: "CONFLICT",
              message:
                "Bin configuration already exists for this store. Use PUT to update.",
            },
          };
        }

        // Create configuration using Prisma ORM (prevents SQL injection)
        const config = await prisma.$transaction(async (tx) => {
          const newConfig = await tx.lotteryBinConfiguration.create({
            data: {
              store_id: params.storeId,
              bin_template: body.bin_template,
            },
          });

          // Create audit log entry (non-blocking - don't fail if audit fails)
          try {
            await tx.auditLog.create({
              data: {
                user_id: user.id,
                action: "LOTTERY_BIN_CONFIG_CREATED",
                table_name: "lottery_bin_configurations",
                record_id: newConfig.config_id,
                new_values: {
                  config_id: newConfig.config_id,
                  store_id: newConfig.store_id,
                  bin_template: newConfig.bin_template,
                  bin_count: body.bin_template.length,
                } as Record<string, any>,
                ip_address: ipAddress,
                user_agent: userAgent,
                reason: `Bin configuration created by ${user.email} (roles: ${user.roles.join(", ")}) - Store: ${params.storeId}, Bins: ${body.bin_template.length}`,
              },
            });
          } catch (auditError) {
            fastify.log.error(
              { error: auditError },
              "Failed to create audit log for bin configuration creation",
            );
          }

          return newConfig;
        });

        reply.code(201);
        return {
          success: true,
          data: {
            config_id: config.config_id,
            store_id: config.store_id,
            bin_template: config.bin_template,
            created_at: config.created_at.toISOString(),
            updated_at: config.updated_at.toISOString(),
          },
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error creating bin configuration");

        // Handle unique constraint violation
        if (
          error.code === "P2002" &&
          error.meta?.target?.includes("store_id")
        ) {
          reply.code(409);
          return {
            success: false,
            error: {
              code: "CONFLICT",
              message:
                "Bin configuration already exists for this store. Use PUT to update.",
            },
          };
        }

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to create bin configuration",
          },
        };
      }
    },
  );

  /**
   * PUT /api/lottery/bins/configuration/:storeId
   * Update bin configuration for a store
   * Protected route - requires LOTTERY_BIN_CONFIG_WRITE permission
   * Story 6.13: Lottery Database Enhancements & Bin Management (AC #1)
   */
  fastify.put(
    "/api/lottery/bins/configuration/:storeId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_BIN_CONFIG_WRITE),
      ],
      schema: {
        description: "Update bin configuration for a store",
        tags: ["lottery"],
        params: {
          type: "object",
          required: ["storeId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
          },
        },
        body: {
          type: "object",
          required: ["bin_template"],
          properties: {
            bin_template: {
              type: "array",
              minItems: 1,
              maxItems: 200,
              items: {
                type: "object",
                required: ["name", "display_order"],
                properties: {
                  name: { type: "string", minLength: 1 },
                  location: { type: "string" },
                  display_order: { type: "integer", minimum: 0 },
                },
              },
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  config_id: { type: "string", format: "uuid" },
                  store_id: { type: "string", format: "uuid" },
                  bin_template: { type: "array" },
                  created_at: { type: "string", format: "date-time" },
                  updated_at: { type: "string", format: "date-time" },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;
      const params = request.params as { storeId: string };
      const body = request.body as { bin_template: any[] };

      try {
        // Extract IP address and user agent for audit logging
        const ipAddress =
          (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
          request.ip ||
          request.socket.remoteAddress ||
          null;
        const userAgent = request.headers["user-agent"] || null;

        // Validate store_id format
        const storeIdValidation = validateStoreId(params.storeId);
        if (!storeIdValidation.valid) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: storeIdValidation.error,
            },
          };
        }

        // Validate bin_template structure
        const templateValidation = validateBinTemplate(body.bin_template);
        if (!templateValidation.valid) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: templateValidation.error,
            },
          };
        }

        // Validate display_order uniqueness per store
        const displayOrders = body.bin_template.map((bin) => bin.display_order);
        const uniqueDisplayOrders = new Set(displayOrders);
        if (displayOrders.length !== uniqueDisplayOrders.size) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message:
                "display_order must be unique for each bin within a store",
            },
          };
        }

        // Get user roles to determine store access (RLS enforcement)
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        // Validate store exists and get store details
        const store = await prisma.store.findUnique({
          where: { store_id: params.storeId },
          select: { store_id: true, company_id: true, name: true },
        });

        if (!store) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Store not found",
            },
          };
        }

        // Validate store access based on user's role scope (RLS enforcement)
        if (!hasSystemScope) {
          // Check for STORE scope: user has direct store assignment
          const hasStoreAccess = userRoles.some(
            (role) =>
              role.scope === "STORE" && role.store_id === params.storeId,
          );

          // Check for COMPANY scope: user has company-level access (e.g., CLIENT_OWNER)
          const hasCompanyAccess = userRoles.some(
            (role) =>
              role.scope === "COMPANY" &&
              role.company_id !== null &&
              role.company_id === store.company_id,
          );

          // Check for CLIENT_OWNER or STORE_MANAGER role codes
          const hasRequiredRole = userRoles.some(
            (role) =>
              role.role_code === "CLIENT_OWNER" ||
              role.role_code === "STORE_MANAGER",
          );

          if (!hasStoreAccess && !hasCompanyAccess) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "FORBIDDEN",
                message:
                  "You do not have access to this store. Please contact your manager.",
              },
            };
          }

          if (!hasRequiredRole) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "FORBIDDEN",
                message:
                  "You must have CLIENT_OWNER or STORE_MANAGER role to manage bin configurations.",
              },
            };
          }
        }

        // Get existing configuration for audit log
        const existingConfig = await prisma.lotteryBinConfiguration.findUnique({
          where: { store_id: params.storeId },
        });

        if (!existingConfig) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message:
                "Bin configuration not found for this store. Use POST to create.",
            },
          };
        }

        // Update configuration using Prisma ORM (prevents SQL injection)
        const config = await prisma.$transaction(async (tx) => {
          const updatedConfig = await tx.lotteryBinConfiguration.update({
            where: { store_id: params.storeId },
            data: {
              bin_template: body.bin_template,
            },
          });

          // Create audit log entry (non-blocking - don't fail if audit fails)
          try {
            await tx.auditLog.create({
              data: {
                user_id: user.id,
                action: "LOTTERY_BIN_CONFIG_UPDATED",
                table_name: "lottery_bin_configurations",
                record_id: updatedConfig.config_id,
                old_values: {
                  bin_template: existingConfig.bin_template,
                  bin_count: Array.isArray(existingConfig.bin_template)
                    ? existingConfig.bin_template.length
                    : 0,
                } as Record<string, any>,
                new_values: {
                  bin_template: updatedConfig.bin_template,
                  bin_count: body.bin_template.length,
                } as Record<string, any>,
                ip_address: ipAddress,
                user_agent: userAgent,
                reason: `Bin configuration updated by ${user.email} (roles: ${user.roles.join(", ")}) - Store: ${params.storeId}, Bins: ${body.bin_template.length}`,
              },
            });
          } catch (auditError) {
            fastify.log.error(
              { error: auditError },
              "Failed to create audit log for bin configuration update",
            );
          }

          return updatedConfig;
        });

        return {
          success: true,
          data: {
            config_id: config.config_id,
            store_id: config.store_id,
            bin_template: config.bin_template,
            created_at: config.created_at.toISOString(),
            updated_at: config.updated_at.toISOString(),
          },
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error updating bin configuration");

        if (error.code === "P2025") {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message:
                "Bin configuration not found for this store. Use POST to create.",
            },
          };
        }

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to update bin configuration",
          },
        };
      }
    },
  );

  /**
   * GET /api/lottery/bins/:storeId
   * Get all active bins for a store with display order and current pack information
   * Protected route - requires LOTTERY_BIN_READ permission
   * Story 6.13: Lottery Database Enhancements & Bin Management (AC #1)
   */
  fastify.get(
    "/api/lottery/bins/:storeId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_BIN_READ),
      ],
      schema: {
        description:
          "Get all active bins for a store with current pack information",
        tags: ["lottery"],
        params: {
          type: "object",
          required: ["storeId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    bin_id: { type: "string", format: "uuid" },
                    store_id: { type: "string", format: "uuid" },
                    name: { type: "string" },
                    location: { type: "string", nullable: true },
                    display_order: { type: "integer" },
                    is_active: { type: "boolean" },
                    current_pack: {
                      type: "object",
                      nullable: true,
                      properties: {
                        pack_id: { type: "string", format: "uuid" },
                        pack_number: { type: "string" },
                        status: { type: "string" },
                        activated_at: {
                          type: "string",
                          format: "date-time",
                          nullable: true,
                        },
                        game: {
                          type: "object",
                          properties: {
                            name: { type: "string" },
                            game_code: { type: "string" },
                            price: { type: "number" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: { type: "object" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;
      const params = request.params as { storeId: string };

      try {
        // Extract IP address and user agent for audit logging
        const ipAddress =
          (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
          request.ip ||
          request.socket.remoteAddress ||
          null;
        const userAgent = request.headers["user-agent"] || null;

        // Get user roles to determine store access (RLS enforcement)
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        // Validate store exists and get store details
        const store = await prisma.store.findUnique({
          where: { store_id: params.storeId },
          select: { store_id: true, company_id: true, name: true },
        });

        if (!store) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Store not found",
            },
          };
        }

        // Validate store access based on user's role scope (RLS enforcement)
        if (!hasSystemScope) {
          // Check for STORE scope: user has direct store assignment
          const hasStoreAccess = userRoles.some(
            (role) =>
              role.scope === "STORE" && role.store_id === params.storeId,
          );

          // Check for COMPANY scope: user has company-level access (e.g., CLIENT_OWNER)
          // They can access any store within their assigned company
          const hasCompanyAccess = userRoles.some(
            (role) =>
              role.scope === "COMPANY" &&
              role.company_id !== null &&
              role.company_id === store.company_id,
          );

          if (!hasStoreAccess && !hasCompanyAccess) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "FORBIDDEN",
                message:
                  "You do not have access to this store. Please contact your manager.",
              },
            };
          }
        }

        // Query active bins using Prisma ORM (prevents SQL injection, enforces RLS)
        // Include current pack information if a pack is assigned to the bin
        const bins = await prisma.lotteryBin.findMany({
          where: {
            store_id: params.storeId,
            is_active: true,
          },
          orderBy: {
            display_order: "asc",
          },
          select: {
            bin_id: true,
            store_id: true,
            name: true,
            location: true,
            display_order: true,
            is_active: true,
            packs: {
              where: {
                current_bin_id: {
                  not: null,
                },
              },
              select: {
                pack_id: true,
                pack_number: true,
                status: true,
                activated_at: true,
                game: {
                  select: {
                    name: true,
                    game_code: true,
                    price: true,
                  },
                },
              },
              take: 1,
            },
          },
        });

        // Create audit log entry (non-blocking)
        try {
          await prisma.auditLog.create({
            data: {
              user_id: user.id,
              action: "LOTTERY_BIN_READ",
              table_name: "lottery_bins",
              record_id: "query-operation",
              new_values: {
                store_id: params.storeId,
                bin_count: bins.length,
              } as Record<string, any>,
              ip_address: ipAddress,
              user_agent: userAgent,
              reason: `Bins queried by ${user.email} (roles: ${user.roles.join(", ")}) - Store: ${params.storeId}`,
            },
          });
        } catch (auditError) {
          fastify.log.error(
            { error: auditError },
            "Failed to create audit log for bin query",
          );
        }

        return {
          success: true,
          data: bins.map((bin) => ({
            bin_id: bin.bin_id,
            store_id: bin.store_id,
            name: bin.name,
            location: bin.location,
            display_order: bin.display_order,
            is_active: bin.is_active,
            current_pack:
              bin.packs.length > 0
                ? {
                    pack_id: bin.packs[0].pack_id,
                    pack_number: bin.packs[0].pack_number,
                    status: bin.packs[0].status,
                    activated_at: bin.packs[0].activated_at,
                    game: bin.packs[0].game,
                  }
                : null,
          })),
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error querying bins");

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to query bins",
          },
        };
      }
    },
  );

  /**
   * POST /api/lottery/bins
   * Create a new bin for a store
   * Protected route - requires LOTTERY_BIN_MANAGE permission
   * Story 6.13: Lottery Database Enhancements & Bin Management (AC #1)
   */
  fastify.post(
    "/api/lottery/bins",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_BIN_MANAGE),
      ],
      schema: {
        description: "Create a new bin for a store",
        tags: ["lottery"],
        body: {
          type: "object",
          required: ["store_id", "name", "display_order"],
          properties: {
            store_id: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
            name: {
              type: "string",
              minLength: 1,
              maxLength: 255,
              description: "Bin name",
            },
            location: {
              type: "string",
              maxLength: 255,
              description: "Bin location (optional)",
            },
            display_order: {
              type: "integer",
              minimum: 0,
              description: "Display order for UI sorting",
            },
          },
        },
        response: {
          201: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  bin_id: { type: "string", format: "uuid" },
                  store_id: { type: "string", format: "uuid" },
                  name: { type: "string" },
                  location: { type: "string", nullable: true },
                  display_order: { type: "integer" },
                  is_active: { type: "boolean" },
                },
              },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: { type: "object" },
            },
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: { type: "object" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;
      const body = request.body as {
        store_id: string;
        name: string;
        location?: string;
        display_order: number;
      };

      try {
        // Extract IP address and user agent for audit logging
        const ipAddress =
          (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
          request.ip ||
          request.socket.remoteAddress ||
          null;
        const userAgent = request.headers["user-agent"] || null;

        // Get user roles to determine store access (RLS enforcement)
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        // Validate store exists and get store details
        const store = await prisma.store.findUnique({
          where: { store_id: body.store_id },
          select: { store_id: true, company_id: true, name: true },
        });

        if (!store) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Store not found",
            },
          };
        }

        // Validate store access based on user's role scope (RLS enforcement)
        if (!hasSystemScope) {
          // Check for STORE scope: user has direct store assignment
          const hasStoreAccess = userRoles.some(
            (role) => role.scope === "STORE" && role.store_id === body.store_id,
          );

          // Check for COMPANY scope: user has company-level access (e.g., CLIENT_OWNER)
          // They can access any store within their assigned company
          const hasCompanyAccess = userRoles.some(
            (role) =>
              role.scope === "COMPANY" &&
              role.company_id !== null &&
              role.company_id === store.company_id,
          );

          if (!hasStoreAccess && !hasCompanyAccess) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "FORBIDDEN",
                message:
                  "You do not have access to this store. Please contact your manager.",
              },
            };
          }
        }

        // Create bin using Prisma ORM (prevents SQL injection, enforces RLS)
        const bin = await prisma.lotteryBin.create({
          data: {
            store_id: body.store_id,
            name: body.name,
            location: body.location || null,
            display_order: body.display_order,
            is_active: true,
          },
        });

        // Create audit log entry (non-blocking)
        try {
          await prisma.auditLog.create({
            data: {
              user_id: user.id,
              action: "LOTTERY_BIN_CREATE",
              table_name: "lottery_bins",
              record_id: bin.bin_id,
              new_values: {
                bin_id: bin.bin_id,
                store_id: bin.store_id,
                name: bin.name,
                location: bin.location,
                display_order: bin.display_order,
              } as Record<string, any>,
              ip_address: ipAddress,
              user_agent: userAgent,
              reason: `Bin created by ${user.email} (roles: ${user.roles.join(", ")}) - Store: ${body.store_id}`,
            },
          });
        } catch (auditError) {
          fastify.log.error(
            { error: auditError },
            "Failed to create audit log for bin creation",
          );
        }

        reply.code(201);
        return {
          success: true,
          data: {
            bin_id: bin.bin_id,
            store_id: bin.store_id,
            name: bin.name,
            location: bin.location,
            display_order: bin.display_order,
            is_active: bin.is_active,
          },
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error creating bin");

        // Handle unique constraint violations
        if (error.code === "P2002") {
          reply.code(409);
          return {
            success: false,
            error: {
              code: "CONFLICT",
              message: "Bin with this name already exists for this store",
            },
          };
        }

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to create bin",
          },
        };
      }
    },
  );

  /**
   * PUT /api/lottery/bins/:binId
   * Update an existing bin
   * Protected route - requires LOTTERY_BIN_MANAGE permission
   * Story 6.13: Lottery Database Enhancements & Bin Management (AC #1)
   */
  fastify.put(
    "/api/lottery/bins/:binId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_BIN_MANAGE),
      ],
      schema: {
        description: "Update an existing bin",
        tags: ["lottery"],
        params: {
          type: "object",
          required: ["binId"],
          properties: {
            binId: {
              type: "string",
              format: "uuid",
              description: "Bin UUID",
            },
          },
        },
        body: {
          type: "object",
          properties: {
            name: {
              type: "string",
              minLength: 1,
              maxLength: 255,
              description: "Bin name",
            },
            location: {
              type: "string",
              maxLength: 255,
              description: "Bin location (optional)",
            },
            display_order: {
              type: "integer",
              minimum: 0,
              description: "Display order for UI sorting",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  bin_id: { type: "string", format: "uuid" },
                  store_id: { type: "string", format: "uuid" },
                  name: { type: "string" },
                  location: { type: "string", nullable: true },
                  display_order: { type: "integer" },
                  is_active: { type: "boolean" },
                },
              },
            },
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: { type: "object" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;
      const params = request.params as { binId: string };
      const body = request.body as {
        name?: string;
        location?: string;
        display_order?: number;
      };

      try {
        // Extract IP address and user agent for audit logging
        const ipAddress =
          (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
          request.ip ||
          request.socket.remoteAddress ||
          null;
        const userAgent = request.headers["user-agent"] || null;

        // Get user roles to determine store access (RLS enforcement)
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        // Find bin and validate it exists
        const bin = await prisma.lotteryBin.findUnique({
          where: { bin_id: params.binId },
          select: {
            bin_id: true,
            store_id: true,
            name: true,
            location: true,
            display_order: true,
            is_active: true,
          },
        });

        if (!bin) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Bin not found",
            },
          };
        }

        // Validate store exists and get store details
        const store = await prisma.store.findUnique({
          where: { store_id: bin.store_id },
          select: { store_id: true, company_id: true, name: true },
        });

        if (!store) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Store not found",
            },
          };
        }

        // Validate store access based on user's role scope (RLS enforcement)
        if (!hasSystemScope) {
          // Check for STORE scope: user has direct store assignment
          const hasStoreAccess = userRoles.some(
            (role) => role.scope === "STORE" && role.store_id === bin.store_id,
          );

          // Check for COMPANY scope: user has company-level access (e.g., CLIENT_OWNER)
          // They can access any store within their assigned company
          const hasCompanyAccess = userRoles.some(
            (role) =>
              role.scope === "COMPANY" &&
              role.company_id !== null &&
              role.company_id === store.company_id,
          );

          if (!hasStoreAccess && !hasCompanyAccess) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "FORBIDDEN",
                message:
                  "You do not have access to this store. Please contact your manager.",
              },
            };
          }
        }

        // Prepare update data (only include provided fields)
        const updateData: {
          name?: string;
          location?: string | null;
          display_order?: number;
        } = {};

        if (body.name !== undefined) {
          updateData.name = body.name;
        }
        if (body.location !== undefined) {
          updateData.location = body.location || null;
        }
        if (body.display_order !== undefined) {
          updateData.display_order = body.display_order;
        }

        // Update bin using Prisma ORM (prevents SQL injection, enforces RLS)
        const updatedBin = await prisma.lotteryBin.update({
          where: { bin_id: params.binId },
          data: updateData,
        });

        // Create audit log entry (non-blocking)
        try {
          await prisma.auditLog.create({
            data: {
              user_id: user.id,
              action: "LOTTERY_BIN_UPDATE",
              table_name: "lottery_bins",
              record_id: updatedBin.bin_id,
              old_values: {
                name: bin.name,
                location: bin.location,
                display_order: bin.display_order,
              } as Record<string, any>,
              new_values: updateData as Record<string, any>,
              ip_address: ipAddress,
              user_agent: userAgent,
              reason: `Bin updated by ${user.email} (roles: ${user.roles.join(", ")}) - Bin: ${params.binId}`,
            },
          });
        } catch (auditError) {
          fastify.log.error(
            { error: auditError },
            "Failed to create audit log for bin update",
          );
        }

        return {
          success: true,
          data: {
            bin_id: updatedBin.bin_id,
            store_id: updatedBin.store_id,
            name: updatedBin.name,
            location: updatedBin.location,
            display_order: updatedBin.display_order,
            is_active: updatedBin.is_active,
          },
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error updating bin");

        if (error.code === "P2025") {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Bin not found",
            },
          };
        }

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to update bin",
          },
        };
      }
    },
  );

  /**
   * DELETE /api/lottery/bins/:binId
   * Soft delete a bin (set is_active = false)
   * Protected route - requires LOTTERY_BIN_MANAGE permission
   * Story 6.13: Lottery Database Enhancements & Bin Management (AC #1)
   */
  fastify.delete(
    "/api/lottery/bins/:binId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_BIN_MANAGE),
      ],
      schema: {
        description: "Soft delete a bin (set is_active = false)",
        tags: ["lottery"],
        params: {
          type: "object",
          required: ["binId"],
          properties: {
            binId: {
              type: "string",
              format: "uuid",
              description: "Bin UUID",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  bin_id: { type: "string", format: "uuid" },
                  message: { type: "string" },
                },
              },
            },
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: { type: "object" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;
      const params = request.params as { binId: string };

      try {
        // Extract IP address and user agent for audit logging
        const ipAddress =
          (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
          request.ip ||
          request.socket.remoteAddress ||
          null;
        const userAgent = request.headers["user-agent"] || null;

        // Get user roles to determine store access (RLS enforcement)
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        // Find bin and validate it exists
        const bin = await prisma.lotteryBin.findUnique({
          where: { bin_id: params.binId },
          select: {
            bin_id: true,
            store_id: true,
            name: true,
            is_active: true,
          },
        });

        if (!bin) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Bin not found",
            },
          };
        }

        // Validate store exists and get store details
        const store = await prisma.store.findUnique({
          where: { store_id: bin.store_id },
          select: { store_id: true, company_id: true, name: true },
        });

        if (!store) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Store not found",
            },
          };
        }

        // Validate store access based on user's role scope (RLS enforcement)
        if (!hasSystemScope) {
          // Check for STORE scope: user has direct store assignment
          const hasStoreAccess = userRoles.some(
            (role) => role.scope === "STORE" && role.store_id === bin.store_id,
          );

          // Check for COMPANY scope: user has company-level access (e.g., CLIENT_OWNER)
          // They can access any store within their assigned company
          const hasCompanyAccess = userRoles.some(
            (role) =>
              role.scope === "COMPANY" &&
              role.company_id !== null &&
              role.company_id === store.company_id,
          );

          if (!hasStoreAccess && !hasCompanyAccess) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "FORBIDDEN",
                message:
                  "You do not have access to this store. Please contact your manager.",
              },
            };
          }
        }

        // Soft delete bin using Prisma ORM (prevents SQL injection, enforces RLS)
        const deletedBin = await prisma.lotteryBin.update({
          where: { bin_id: params.binId },
          data: { is_active: false },
        });

        // Create audit log entry (non-blocking)
        try {
          await prisma.auditLog.create({
            data: {
              user_id: user.id,
              action: "LOTTERY_BIN_DELETE",
              table_name: "lottery_bins",
              record_id: deletedBin.bin_id,
              old_values: {
                bin_id: deletedBin.bin_id,
                store_id: deletedBin.store_id,
                name: deletedBin.name,
                is_active: true,
              } as Record<string, any>,
              new_values: {
                is_active: false,
              } as Record<string, any>,
              ip_address: ipAddress,
              user_agent: userAgent,
              reason: `Bin soft deleted by ${user.email} (roles: ${user.roles.join(", ")}) - Bin: ${params.binId}`,
            },
          });
        } catch (auditError) {
          fastify.log.error(
            { error: auditError },
            "Failed to create audit log for bin deletion",
          );
        }

        return {
          success: true,
          data: {
            bin_id: deletedBin.bin_id,
            message: "Bin successfully soft deleted",
          },
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error deleting bin");

        if (error.code === "P2025") {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Bin not found",
            },
          };
        }

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to delete bin",
          },
        };
      }
    },
  );

  /**
   * GET /api/lottery/bins/display/:storeId
   * Get optimized bin display data with packs, game info, and sold counts
   * Protected route - requires LOTTERY_BIN_READ permission
   * Story 6.13: Lottery Database Enhancements & Bin Management (AC #2, #3)
   */
  fastify.get(
    "/api/lottery/bins/display/:storeId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_BIN_READ),
      ],
      schema: {
        description: "Get optimized bin display data with packs and game info",
        tags: ["lottery"],
        params: {
          type: "object",
          required: ["storeId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    bin_id: { type: "string", format: "uuid" },
                    bin_name: { type: "string" },
                    display_order: { type: "integer" },
                    game_code: { type: "string", nullable: true },
                    game_name: { type: "string", nullable: true },
                    price: { type: "number", nullable: true },
                    pack_number: { type: "string", nullable: true },
                    serial_start: { type: "string", nullable: true },
                    serial_end: { type: "string", nullable: true },
                    total_sold: { type: "integer" },
                    status: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: { type: "object" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;
      const params = request.params as { storeId: string };

      try {
        // Extract IP address and user agent for audit logging
        const ipAddress =
          (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
          request.ip ||
          request.socket.remoteAddress ||
          null;
        const userAgent = request.headers["user-agent"] || null;

        // Get user roles to determine store access (RLS enforcement)
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        // Validate store exists and get store details
        const store = await prisma.store.findUnique({
          where: { store_id: params.storeId },
          select: { store_id: true, company_id: true, name: true },
        });

        if (!store) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Store not found",
            },
          };
        }

        // Validate store access based on user's role scope (RLS enforcement)
        if (!hasSystemScope) {
          // Check for STORE scope: user has direct store assignment
          const hasStoreAccess = userRoles.some(
            (role) =>
              role.scope === "STORE" && role.store_id === params.storeId,
          );

          // Check for COMPANY scope: user has company-level access (e.g., CLIENT_OWNER)
          // They can access any store within their assigned company
          const hasCompanyAccess = userRoles.some(
            (role) =>
              role.scope === "COMPANY" &&
              role.company_id !== null &&
              role.company_id === store.company_id,
          );

          if (!hasStoreAccess && !hasCompanyAccess) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "FORBIDDEN",
                message:
                  "You do not have access to this store. Please contact your manager.",
              },
            };
          }
        }

        // Optimized query using Prisma's parameterized query (prevents SQL injection)
        // Uses LEFT JOINs to include bins with no packs, uses denormalized tickets_sold_count
        const displayData = await prisma.$queryRaw<
          Array<{
            bin_id: string;
            bin_name: string;
            display_order: number;
            game_code: string | null;
            game_name: string | null;
            price: number | null;
            pack_number: string | null;
            serial_start: string | null;
            serial_end: string | null;
            total_sold: number;
            status: string | null;
          }>
        >`
          SELECT 
            b.bin_id,
            b.name AS bin_name,
            b.display_order,
            g.game_code,
            g.name AS game_name,
            g.price,
            p.pack_number,
            p.serial_start,
            p.serial_end,
            COALESCE(p.tickets_sold_count, 0) AS total_sold,
            p.status
          FROM lottery_bins b
          LEFT JOIN lottery_packs p ON p.current_bin_id = b.bin_id AND p.status = 'ACTIVE'
          LEFT JOIN lottery_games g ON g.game_id = p.game_id
          WHERE b.store_id = ${params.storeId}::uuid AND b.is_active = true
          ORDER BY b.display_order, g.game_code, p.pack_number
        `;

        // Create audit log entry (non-blocking)
        try {
          await prisma.auditLog.create({
            data: {
              user_id: user.id,
              action: "LOTTERY_BIN_DISPLAY_READ",
              table_name: "lottery_bins",
              record_id: "query-operation",
              new_values: {
                store_id: params.storeId,
                bin_count: displayData.length,
              } as Record<string, any>,
              ip_address: ipAddress,
              user_agent: userAgent,
              reason: `Bin display data queried by ${user.email} (roles: ${user.roles.join(", ")}) - Store: ${params.storeId}`,
            },
          });
        } catch (auditError) {
          fastify.log.error(
            { error: auditError },
            "Failed to create audit log for bin display query",
          );
        }

        return {
          success: true,
          data: displayData.map((row) => ({
            bin_id: row.bin_id,
            bin_name: row.bin_name,
            display_order: row.display_order,
            game_code: row.game_code,
            game_name: row.game_name,
            price: row.price ? Number(row.price) : null,
            pack_number: row.pack_number,
            serial_start: row.serial_start,
            serial_end: row.serial_end,
            total_sold: Number(row.total_sold),
            status: row.status,
          })),
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error querying bin display data");

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to query bin display data",
          },
        };
      }
    },
  );

  /**
   * GET /api/lottery/packs/validate-for-activation/:storeId/:packNumber
   * Validate pack for activation (check exists, status is RECEIVED, return game info)
   * Protected route - requires LOTTERY_PACK_READ permission
   * Story 10.5: Add Bin Functionality (AC #3, #4)
   *
   * MCP Guidance Applied:
   * - SQL_INJECTION: Use Prisma ORM parameterized queries (no string concatenation)
   * - VALIDATION: Validate route parameters with schema validation
   * - AUTHENTICATION: Require authentication and permission checks
   * - ERROR_HANDLING: Return generic error responses, never leak stack traces
   */
  fastify.get(
    "/api/lottery/packs/validate-for-activation/:storeId/:packNumber",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_PACK_READ),
      ],
      schema: {
        description: "Validate pack for activation",
        tags: ["lottery"],
        params: {
          type: "object",
          required: ["storeId", "packNumber"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
            packNumber: {
              type: "string",
              description: "Pack number to validate",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  valid: { type: "boolean" },
                  error: {
                    type: "string",
                    nullable: true,
                  },
                  game: {
                    type: "object",
                    nullable: true,
                    properties: {
                      name: { type: "string" },
                      price: { type: "number" },
                    },
                  },
                  pack: {
                    type: "object",
                    nullable: true,
                    properties: {
                      pack_id: { type: "string", format: "uuid" },
                      pack_number: { type: "string" },
                      serial_start: { type: "string" },
                      serial_end: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;
      const params = request.params as {
        storeId: string;
        packNumber: string;
      };

      try {
        // Get user roles to validate store access
        const userRoles = await rbacService.getUserRoles(user.id);

        // Validate store exists and get its company_id
        const store = await prisma.store.findUnique({
          where: { store_id: params.storeId },
          select: { store_id: true, company_id: true },
        });

        if (!store) {
          reply.code(404);
          return {
            success: false,
            error: { code: "NOT_FOUND", message: "Store not found" },
          };
        }

        // Validate store access
        if (
          !validateUserStoreAccess(userRoles, params.storeId, store.company_id)
        ) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "Access denied to this store",
            },
          };
        }

        // Find pack by pack_number and store_id (using Prisma ORM - prevents SQL injection)
        const pack = await prisma.lotteryPack.findUnique({
          where: {
            store_id_pack_number: {
              store_id: params.storeId,
              pack_number: params.packNumber,
            },
          },
          select: {
            pack_id: true,
            pack_number: true,
            status: true,
            serial_start: true,
            serial_end: true,
            game: {
              select: {
                game_id: true,
                name: true,
                price: true,
                game_code: true,
              },
            },
          },
        });

        // Pack not found
        if (!pack) {
          return {
            success: true,
            data: {
              valid: false,
              error: "Pack not found in inventory. Receive it first.",
            },
          };
        }

        // Check pack status - must be RECEIVED
        if (pack.status !== "RECEIVED") {
          let errorMessage = "Pack not available";
          if (pack.status === "ACTIVE") {
            errorMessage = "Pack already active in another bin";
          } else if (pack.status === "DEPLETED") {
            errorMessage = "Pack not available (depleted)";
          } else if (pack.status === "RETURNED") {
            errorMessage = "Pack not available (returned)";
          }

          return {
            success: true,
            data: {
              valid: false,
              error: errorMessage,
            },
          };
        }

        // Validate game exists (should always exist if pack exists, but check anyway)
        if (!pack.game) {
          return {
            success: true,
            data: {
              valid: false,
              error: "Unknown game code. Please add game first.",
            },
          };
        }

        // Pack is valid - return success with game and pack info
        return {
          success: true,
          data: {
            valid: true,
            game: {
              name: pack.game.name,
              price: pack.game.price,
            },
            pack: {
              pack_id: pack.pack_id,
              pack_number: pack.pack_number,
              serial_start: pack.serial_start,
              serial_end: pack.serial_end,
            },
          },
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error validating pack for activation");
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to validate pack",
          },
        };
      }
    },
  );

  /**
   * GET /api/lottery/bins/day/:storeId
   * Get lottery bins with day-based tracking for the MyStore lottery page
   * Returns bins with active packs, starting/ending serials for the business day,
   * and depleted packs for the day.
   *
   * Protected route - requires LOTTERY_PACK_READ permission
   * Story: MyStore Lottery Page Redesign
   *
   * Business Day Definition:
   * - Start: opened_at of the first shift that started on that calendar day (in store timezone)
   * - End: closed_at of the last shift that started on that same calendar day
   *
   * Starting Serial Logic:
   * 1. If shift opened today -> use today's opening_serial from lottery_shift_openings
   * 2. If no shift today but pack has history -> use most recent closing_serial
   * 3. If pack just activated (no history) -> use pack's serial_start
   *
   * Ending Serial Logic:
   * - Shows the closing_serial from the most recent completed shift closing for that pack today
   * - If no closing exists yet today, returns null
   */
  fastify.get(
    "/api/lottery/bins/day/:storeId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_PACK_READ),
      ],
      schema: {
        description:
          "Get lottery bins with day-based tracking for MyStore lottery page",
        tags: ["lottery"],
        params: {
          type: "object",
          required: ["storeId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
          },
        },
        querystring: {
          type: "object",
          properties: {
            date: {
              type: "string",
              format: "date",
              description:
                "ISO date string (YYYY-MM-DD). Defaults to today in store timezone.",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  bins: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        bin_id: { type: "string", format: "uuid" },
                        bin_number: { type: "integer" },
                        name: { type: "string" },
                        is_active: { type: "boolean" },
                        pack: {
                          type: "object",
                          nullable: true,
                          properties: {
                            pack_id: { type: "string", format: "uuid" },
                            pack_number: { type: "string" },
                            game_name: { type: "string" },
                            game_price: { type: "number" },
                            starting_serial: { type: "string" },
                            ending_serial: { type: "string", nullable: true },
                            serial_end: { type: "string" },
                          },
                        },
                      },
                    },
                  },
                  business_day: {
                    type: "object",
                    properties: {
                      date: { type: "string", format: "date" },
                      day_id: {
                        type: "string",
                        format: "uuid",
                        nullable: true,
                      },
                      status: { type: "string", nullable: true },
                      first_shift_opened_at: {
                        type: "string",
                        format: "date-time",
                        nullable: true,
                      },
                      last_shift_closed_at: {
                        type: "string",
                        format: "date-time",
                        nullable: true,
                      },
                      shifts_count: { type: "integer" },
                    },
                  },
                  depleted_packs: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        pack_id: { type: "string", format: "uuid" },
                        pack_number: { type: "string" },
                        game_name: { type: "string" },
                        game_price: { type: "number" },
                        bin_number: { type: "integer" },
                        depleted_at: { type: "string", format: "date-time" },
                      },
                    },
                  },
                  // Lottery summary - populated when day is CLOSED
                  // Provides lottery totals from the closed day for display
                  lottery_summary: {
                    type: "object",
                    nullable: true,
                    description:
                      "Lottery totals from the closed day. Only populated when business_day.status is CLOSED.",
                    properties: {
                      lottery_total: {
                        type: "number",
                        description:
                          "Total lottery sales for the closed day (sum of all bins)",
                      },
                      bins_closed: {
                        type: "array",
                        description: "Detailed breakdown per bin",
                        items: {
                          type: "object",
                          properties: {
                            bin_number: { type: "integer" },
                            pack_number: { type: "string" },
                            game_name: { type: "string" },
                            starting_serial: { type: "string" },
                            closing_serial: { type: "string" },
                            game_price: { type: "number" },
                            tickets_sold: { type: "integer" },
                            sales_amount: { type: "number" },
                          },
                        },
                      },
                    },
                  },
                  // Enterprise close-to-close business period metadata
                  // Provides information about the current open business period for UI warnings
                  // and multi-day depleted pack visibility
                  open_business_period: {
                    type: "object",
                    properties: {
                      // When the current open period started (last day close timestamp)
                      started_at: {
                        type: "string",
                        format: "date-time",
                        nullable: true,
                        description:
                          "Timestamp when the current open business period started (last day close)",
                      },
                      // The business date of the last closed day
                      last_closed_date: {
                        type: "string",
                        format: "date",
                        nullable: true,
                        description:
                          "The business date of the most recently closed day (YYYY-MM-DD)",
                      },
                      // Days since last close (for UI warning if > 1)
                      days_since_last_close: {
                        type: "integer",
                        nullable: true,
                        description:
                          "Number of days since the last day close (null if first period)",
                      },
                      // Whether the store has never closed a day (first-time setup)
                      is_first_period: {
                        type: "boolean",
                        description:
                          "True if no business day has ever been closed for this store",
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          401: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          500: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;
      const params = request.params as { storeId: string };
      const query = request.query as { date?: string };

      try {
        // Get user roles to determine store access (RLS enforcement)
        const userRoles = await rbacService.getUserRoles(user.id);

        // Validate store exists and get store details including timezone
        const store = await prisma.store.findUnique({
          where: { store_id: params.storeId },
          select: {
            store_id: true,
            company_id: true,
            name: true,
            timezone: true,
          },
        });

        if (!store) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Store not found",
            },
          };
        }

        // Validate store access based on user's role scope (RLS enforcement)
        const hasAccess = validateUserStoreAccess(
          userRoles,
          params.storeId,
          store.company_id,
        );
        if (!hasAccess) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "FORBIDDEN",
              message:
                "You do not have access to this store. Please contact your manager.",
            },
          };
        }

        // Determine the target date in store timezone
        // If date param provided, parse it; otherwise use current date in store timezone
        const storeTimezone = store.timezone || DEFAULT_STORE_TIMEZONE;
        let targetDate: Date;
        let targetDateStr: string;

        if (query.date) {
          // Validate date format (YYYY-MM-DD)
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (!dateRegex.test(query.date)) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Invalid date format. Use YYYY-MM-DD.",
              },
            };
          }
          targetDateStr = query.date;
          // Parse the date string as the start of day in store timezone
          targetDate = new Date(query.date + "T00:00:00");
        } else {
          // Get current date in store timezone using shared utility
          targetDateStr = getCurrentStoreDate(storeTimezone);
          targetDate = new Date(targetDateStr + "T00:00:00");
        }

        // Calculate day boundaries in UTC using shared timezone utility
        // This correctly handles timezone offsets and DST transitions
        const { startUTC: dayStartUtc, endUTC: dayEndUtc } =
          getCalendarDayBoundaries(targetDateStr, storeTimezone);

        // Check for LotteryBusinessDay record for this date
        const lotteryBusinessDay = await prisma.lotteryBusinessDay.findUnique({
          where: {
            store_id_business_date: {
              store_id: params.storeId,
              business_date: targetDate,
            },
          },
          include: {
            day_packs: {
              include: {
                pack: {
                  include: {
                    game: {
                      select: {
                        name: true,
                        price: true,
                      },
                    },
                  },
                },
                bin: {
                  select: {
                    bin_id: true,
                    display_order: true,
                    name: true,
                  },
                },
              },
            },
          },
        });

        // Find all shifts for the business day (shifts that OPENED on target date)
        // Still needed for backward compatibility and business_day metadata
        const dayShifts = await prisma.shift.findMany({
          where: {
            store_id: params.storeId,
            opened_at: {
              gte: dayStartUtc,
              lte: dayEndUtc,
            },
          },
          orderBy: { opened_at: "asc" },
          select: {
            shift_id: true,
            opened_at: true,
            closed_at: true,
            status: true,
          },
        });

        const shiftIds = dayShifts.map((s) => s.shift_id);
        const firstShift = dayShifts[0] || null;
        const lastShift = dayShifts[dayShifts.length - 1] || null;

        // Get all bins for the store with active packs
        const bins = await prisma.lotteryBin.findMany({
          where: {
            store_id: params.storeId,
            is_active: true,
          },
          orderBy: { display_order: "asc" },
          include: {
            packs: {
              where: { status: "ACTIVE" },
              take: 1,
              include: {
                game: {
                  select: {
                    name: true,
                    price: true,
                  },
                },
              },
            },
          },
        });

        // Get pack IDs for active packs in bins
        const activePackIds = bins
          .filter((bin) => bin.packs.length > 0)
          .map((bin) => bin.packs[0].pack_id);

        // Get starting serials for today (first opening of the day for each pack)
        // Query lottery_shift_openings for shifts that opened today
        const todayOpenings =
          shiftIds.length > 0
            ? await prisma.lotteryShiftOpening.findMany({
                where: {
                  shift_id: { in: shiftIds },
                  pack_id: { in: activePackIds },
                },
                include: {
                  shift: {
                    select: { opened_at: true },
                  },
                },
                orderBy: {
                  shift: { opened_at: "asc" },
                },
              })
            : [];

        // Map: pack_id -> first opening serial of the day
        const firstOpeningByPack = new Map<string, string>();
        for (const opening of todayOpenings) {
          if (!firstOpeningByPack.has(opening.pack_id)) {
            firstOpeningByPack.set(opening.pack_id, opening.opening_serial);
          }
        }

        // Get ending serials for today (most recent closing of the day for each pack)
        const todayClosings =
          shiftIds.length > 0
            ? await prisma.lotteryShiftClosing.findMany({
                where: {
                  shift_id: { in: shiftIds },
                  pack_id: { in: activePackIds },
                },
                include: {
                  shift: {
                    select: { opened_at: true },
                  },
                },
                orderBy: {
                  shift: { opened_at: "desc" },
                },
              })
            : [];

        // Map: pack_id -> most recent closing serial of the day
        const lastClosingByPack = new Map<string, string>();
        for (const closing of todayClosings) {
          if (!lastClosingByPack.has(closing.pack_id)) {
            lastClosingByPack.set(closing.pack_id, closing.closing_serial);
          }
        }

        // For packs without today's opening, get the most recent closing serial (from any prior day)
        const packsNeedingHistory = activePackIds.filter(
          (packId) => !firstOpeningByPack.has(packId),
        );

        const historicalClosings =
          packsNeedingHistory.length > 0
            ? await prisma.lotteryShiftClosing.findMany({
                where: {
                  pack_id: { in: packsNeedingHistory },
                },
                orderBy: {
                  created_at: "desc",
                },
              })
            : [];

        // Map: pack_id -> most recent historical closing serial
        const historicalClosingByPack = new Map<string, string>();
        for (const closing of historicalClosings) {
          if (!historicalClosingByPack.has(closing.pack_id)) {
            historicalClosingByPack.set(
              closing.pack_id,
              closing.closing_serial,
            );
          }
        }

        // Build map of LotteryDayPack data by pack_id for quick lookup
        const dayPackByPackId = new Map<
          string,
          { starting_serial: string; ending_serial: string | null }
        >();
        if (lotteryBusinessDay?.day_packs) {
          for (const dayPack of lotteryBusinessDay.day_packs) {
            dayPackByPackId.set(dayPack.pack_id, {
              starting_serial: dayPack.starting_serial,
              ending_serial: dayPack.ending_serial,
            });
          }
        }

        // ============================================================================
        // ENTERPRISE BUSINESS DAY MODEL: Close-to-Close
        // ============================================================================
        // In enterprise POS systems, a "business day" is defined as the period from
        // the last day close to the next day close - NOT calendar midnight-to-midnight.
        // This ensures no transactions are orphaned when a day close is missed.
        //
        // Example: If Day 1 closes at 11:30 PM and Day 2 hasn't closed yet (even if
        // it's now Day 4), all activity since Day 1's close belongs to the current
        // open business period and should be visible.
        // ============================================================================

        // Always find the most recent CLOSED business day for this store
        // This is the boundary for the current open business period
        const lastClosedBusinessDay = await prisma.lotteryBusinessDay.findFirst(
          {
            where: {
              store_id: params.storeId,
              status: "CLOSED",
            },
            orderBy: { closed_at: "desc" },
            select: {
              day_id: true,
              business_date: true,
              closed_at: true,
              day_packs: {
                where: {
                  pack_id: { in: activePackIds },
                  ending_serial: { not: null },
                },
                select: {
                  pack_id: true,
                  ending_serial: true,
                },
              },
            },
          },
        );

        // The open business period starts from the last closed day's closed_at timestamp
        // If no day has ever been closed, use the beginning of time (epoch)
        const openBusinessPeriodStart = lastClosedBusinessDay?.closed_at
          ? new Date(lastClosedBusinessDay.closed_at)
          : new Date(0); // Epoch - beginning of time

        // Look for the most recent CLOSED day's ending serials to use as starting serials
        // This handles two scenarios:
        // 1. No LotteryDayPack for today yet -> use previous closed day's ending serials
        // 2. Today's LotteryBusinessDay exists but is CLOSED -> use today's ending serials as "current" position
        //    (for when the same calendar day has been closed and we need to show where we are now)
        const previousDayEndingByPack = new Map<string, string>();

        // If today's day is CLOSED, use today's ending serials as the "current" position
        // This handles the case where you close the lottery day and want to see where you ended up
        if (
          lotteryBusinessDay?.status === "CLOSED" &&
          lotteryBusinessDay.day_packs.length > 0
        ) {
          for (const dayPack of lotteryBusinessDay.day_packs) {
            if (dayPack.ending_serial) {
              previousDayEndingByPack.set(
                dayPack.pack_id,
                dayPack.ending_serial,
              );
            }
          }
        } else if (
          !lotteryBusinessDay ||
          lotteryBusinessDay.day_packs.length === 0
        ) {
          // Use the already-fetched lastClosedBusinessDay for ending serials
          if (lastClosedBusinessDay?.day_packs) {
            for (const dayPack of lastClosedBusinessDay.day_packs) {
              if (dayPack.ending_serial) {
                previousDayEndingByPack.set(
                  dayPack.pack_id,
                  dayPack.ending_serial,
                );
              }
            }
          }
        }

        // Build bin response data
        const binsData = bins.map((bin) => {
          const pack = bin.packs[0] || null;

          if (!pack) {
            return {
              bin_id: bin.bin_id,
              bin_number: bin.display_order + 1,
              name: bin.name,
              is_active: bin.is_active,
              pack: null,
            };
          }

          // Determine starting serial:
          // Priority 1: If there's a closed day ending serial (either today closed, or previous day closed)
          //             -> use that as the current/starting position
          // Priority 2: Use LotteryDayPack data if available for today and day is OPEN (day-based tracking)
          // Priority 3: Use shift-based data (backward compatibility)
          //   a. If opened today -> use today's opening serial
          //   b. If no opening today but has history -> use most recent closing serial
          //   c. If no history -> use pack's serial_start
          let startingSerial: string;
          let endingSerial: string | null;

          const dayPackData = dayPackByPackId.get(pack.pack_id);

          if (previousDayEndingByPack.has(pack.pack_id)) {
            // Use closed day's ending serial as the current/starting position
            // This handles: today closed (show where we ended), or new day after close (carry forward)
            startingSerial = previousDayEndingByPack.get(pack.pack_id)!;
            endingSerial = null; // No new ending yet for the next period
          } else if (dayPackData && lotteryBusinessDay?.status === "OPEN") {
            // Use day-based tracking data for today (only if day is still OPEN)
            startingSerial = dayPackData.starting_serial;
            endingSerial = dayPackData.ending_serial;
          } else {
            // Fall back to shift-based data
            if (firstOpeningByPack.has(pack.pack_id)) {
              startingSerial = firstOpeningByPack.get(pack.pack_id)!;
            } else if (historicalClosingByPack.has(pack.pack_id)) {
              startingSerial = historicalClosingByPack.get(pack.pack_id)!;
            } else {
              startingSerial = pack.serial_start;
            }
            endingSerial = lastClosingByPack.get(pack.pack_id) || null;
          }

          return {
            bin_id: bin.bin_id,
            bin_number: bin.display_order + 1,
            name: bin.name,
            is_active: bin.is_active,
            pack: {
              pack_id: pack.pack_id,
              pack_number: pack.pack_number,
              game_name: pack.game.name,
              game_price: Number(pack.game.price),
              starting_serial: startingSerial,
              ending_serial: endingSerial,
              serial_end: pack.serial_end,
            },
          };
        });

        // ============================================================================
        // DEPLETED PACKS QUERY: Enterprise Close-to-Close Model
        // ============================================================================
        // Show ALL packs depleted since the last closed business day, not just today.
        // This ensures no depleted packs are hidden when a day close is missed.
        //
        // The query uses openBusinessPeriodStart (from lastClosedBusinessDay.closed_at)
        // as the lower bound, ensuring all activity in the current open period is visible.
        // ============================================================================
        const depletedPacks = await prisma.lotteryPack.findMany({
          where: {
            store_id: params.storeId,
            status: "DEPLETED",
            depleted_at: {
              // Use the open business period start (last day close) as lower bound
              // This ensures depleted packs are visible even if day close was missed
              gte: openBusinessPeriodStart,
            },
          },
          include: {
            game: {
              select: {
                name: true,
                price: true,
              },
            },
            bin: {
              select: {
                display_order: true,
              },
            },
          },
          orderBy: { depleted_at: "desc" },
        });

        const depletedPacksData = depletedPacks.map((pack) => ({
          pack_id: pack.pack_id,
          pack_number: pack.pack_number,
          game_name: pack.game.name,
          game_price: Number(pack.game.price),
          bin_number: pack.bin ? pack.bin.display_order + 1 : 0,
          depleted_at: pack.depleted_at?.toISOString() || "",
        }));

        // Calculate days since last close for UI warning display
        const daysSinceLastClose = lastClosedBusinessDay?.closed_at
          ? Math.floor(
              (Date.now() -
                new Date(lastClosedBusinessDay.closed_at).getTime()) /
                (1000 * 60 * 60 * 24),
            )
          : null;

        return {
          success: true,
          data: {
            bins: binsData,
            business_day: {
              date: targetDateStr,
              // Use LotteryBusinessDay data if available, fall back to shift data
              day_id: lotteryBusinessDay?.day_id || null,
              status:
                lotteryBusinessDay?.status ||
                (dayShifts.length > 0 ? "OPEN" : null),
              first_shift_opened_at:
                lotteryBusinessDay?.opened_at?.toISOString() ||
                firstShift?.opened_at.toISOString() ||
                null,
              last_shift_closed_at:
                lotteryBusinessDay?.closed_at?.toISOString() ||
                lastShift?.closed_at?.toISOString() ||
                null,
              shifts_count: dayShifts.length,
            },
            // Enterprise close-to-close business period metadata
            open_business_period: {
              // When the current open period started (last day close timestamp)
              started_at:
                lastClosedBusinessDay?.closed_at?.toISOString() || null,
              // The business date of the last closed day
              last_closed_date: lastClosedBusinessDay?.business_date
                ? new Date(lastClosedBusinessDay.business_date)
                    .toISOString()
                    .split("T")[0]
                : null,
              // Days since last close (for UI warning if > 1)
              days_since_last_close: daysSinceLastClose,
              // Whether the store has never closed a day (first-time setup)
              is_first_period: !lastClosedBusinessDay,
            },
            depleted_packs: depletedPacksData,
          },
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error fetching lottery day bins");
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to fetch lottery day bins",
          },
        };
      }
    },
  );

  /**
   * POST /api/lottery/bins/day/:storeId/close
   * Close the business day by recording ending serial numbers for all active lottery packs
   *
   * Protected route - requires LOTTERY_SHIFT_CLOSE permission
   * Story: MyStore Lottery Day Closing Feature
   *
   * This endpoint records the ending serial numbers for all active packs at the end of the business day.
   * The ending numbers become the next day's starting numbers.
   *
   * Business Logic:
   * 1. Validates all active packs are included in the closings array
   * 2. Validates closing serials are valid 3-digit numbers
   * 3. Validates closing serials are within the pack's serial range
   * 4. Creates LotteryShiftClosing records for the most recent shift of the day
   */
  fastify.post(
    "/api/lottery/bins/day/:storeId/close",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_SHIFT_CLOSE),
      ],
      schema: {
        description:
          "Close the business day by recording ending serial numbers for all active lottery packs",
        tags: ["lottery"],
        params: {
          type: "object",
          required: ["storeId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
          },
        },
        body: {
          type: "object",
          required: ["closings"],
          properties: {
            closings: {
              type: "array",
              description: "Array of pack closings with ending serial numbers",
              items: {
                type: "object",
                required: ["pack_id", "closing_serial"],
                properties: {
                  pack_id: {
                    type: "string",
                    format: "uuid",
                    description: "UUID of the pack",
                  },
                  closing_serial: {
                    type: "string",
                    pattern: "^[0-9]{3}$",
                    description: "3-digit ending serial number (e.g., '045')",
                  },
                },
              },
            },
            entry_method: {
              type: "string",
              enum: ["SCAN", "MANUAL"],
              default: "SCAN",
              description: "Method used to enter the serial numbers",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  closings_created: { type: "integer" },
                  business_day: { type: "string", format: "date" },
                  day_closed: { type: "boolean" },
                  bins_closed: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        bin_number: { type: "integer" },
                        pack_number: { type: "string" },
                        game_name: { type: "string" },
                        closing_serial: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                  details: { type: "object", additionalProperties: true },
                },
              },
            },
          },
          401: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          500: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;
      const params = request.params as { storeId: string };
      const body = request.body as {
        closings: Array<{ pack_id: string; closing_serial: string }>;
        entry_method?: "SCAN" | "MANUAL";
        current_shift_id?: string; // Exclude this shift from open shifts check
      };

      try {
        // Get user roles to determine store access (RLS enforcement)
        const userRoles = await rbacService.getUserRoles(user.id);

        // Validate store exists and get store details including timezone
        const store = await prisma.store.findUnique({
          where: { store_id: params.storeId },
          select: {
            store_id: true,
            company_id: true,
            name: true,
            timezone: true,
          },
        });

        if (!store) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Store not found",
            },
          };
        }

        // Validate store access based on user's role scope (RLS enforcement)
        const hasAccess = validateUserStoreAccess(
          userRoles,
          params.storeId,
          store.company_id,
        );
        if (!hasAccess) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "FORBIDDEN",
              message:
                "You do not have access to this store. Please contact your manager.",
            },
          };
        }

        // Get store timezone for accurate date calculations
        // Uses shared timezone utility for consistency with open-check endpoint
        const storeTimezone = store.timezone || DEFAULT_STORE_TIMEZONE;

        // Get current business day in store's timezone
        const businessDayStr = getCurrentStoreDate(storeTimezone);

        // targetDate is the business date in the store's timezone (used for LotteryBusinessDay lookup)
        // Parse as midnight UTC (the date component is what matters for the unique constraint)
        const targetDate = new Date(businessDayStr + "T00:00:00Z");

        // Calculate day boundaries in UTC for eligible shift query
        // Still needed for finding shifts opened today (for day-pack recording)
        const { startUTC: dayStartUtc, endUTC: dayEndUtc } =
          getCalendarDayBoundaries(businessDayStr, storeTimezone);

        // VALIDATION: Check for OTHER open shifts before allowing lottery close
        // BUSINESS RULE: Any open shift (other than the current cashier's) blocks lottery close.
        // The current_shift_id is excluded because the cashier closing lottery is doing so
        // from their own shift - they can't close their shift before closing lottery!
        // DB-001: Using ORM query builder for safe parameterized queries
        // DB-006: Tenant isolation via store_id scoping
        const openShifts = await prisma.shift.findMany({
          where: {
            store_id: params.storeId,
            status: { in: ["OPEN", "ACTIVE", "CLOSING", "RECONCILING"] },
            // Exclude the current shift if provided
            ...(body.current_shift_id && {
              shift_id: { not: body.current_shift_id },
            }),
          },
          select: {
            shift_id: true,
            status: true,
            opened_at: true,
            pos_terminal: {
              select: { name: true }, // Correct field name per Prisma schema
            },
            cashier: {
              select: { name: true }, // Cashier model has single 'name' field
            },
          },
        });

        if (openShifts.length > 0) {
          // API-003: Structured error with actionable details
          reply.code(400);
          return {
            success: false,
            error: {
              code: "SHIFTS_STILL_OPEN",
              message: `All shifts must be closed before lottery can be closed. ${openShifts.length} shift(s) still open.`,
              details: {
                open_shifts: openShifts.map((s) => ({
                  shift_id: s.shift_id,
                  terminal_name: s.pos_terminal?.name || "Unknown Terminal",
                  cashier_name: s.cashier.name,
                  status: s.status,
                  opened_at: s.opened_at.toISOString(),
                })),
              },
            },
          };
        }

        // Find eligible shifts: either opened today OR currently open (regardless of when opened)
        // This handles cases where a shift opened yesterday is still active
        const eligibleShifts = await prisma.shift.findMany({
          where: {
            store_id: params.storeId,
            OR: [
              // Shifts opened today
              {
                opened_at: {
                  gte: dayStartUtc,
                  lte: dayEndUtc,
                },
              },
              // Currently unclosed shifts (opened any time, not yet closed)
              // Must check ALL active statuses - a shift from yesterday could be ACTIVE, not OPEN
              {
                closed_at: null,
                status: { in: ["OPEN", "ACTIVE", "CLOSING", "RECONCILING"] },
              },
            ],
          },
          orderBy: { opened_at: "desc" },
          select: {
            shift_id: true,
            cashier_id: true, // Include cashier_id for lottery closing records
            opened_at: true,
            closed_at: true,
            status: true,
          },
        });

        if (eligibleShifts.length === 0) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "NO_SHIFT_TODAY",
              message:
                "No shift has been opened today. Please open at least one shift before closing the day.",
            },
          };
        }

        // Prefer the most recent shift opened today, otherwise use the currently open shift
        const todayShifts = eligibleShifts.filter(
          (s) => s.opened_at >= dayStartUtc && s.opened_at <= dayEndUtc,
        );
        const targetShift =
          todayShifts.length > 0 ? todayShifts[0] : eligibleShifts[0];

        // Get all active bins with their active packs for the store
        const activeBins = await prisma.lotteryBin.findMany({
          where: {
            store_id: params.storeId,
            is_active: true,
          },
          include: {
            packs: {
              where: { status: "ACTIVE" },
              include: {
                game: {
                  select: {
                    name: true,
                    price: true,
                  },
                },
              },
            },
          },
          orderBy: { display_order: "asc" },
        });

        // Get all active packs from the bins
        const activePacks = activeBins
          .flatMap((bin) => bin.packs)
          .filter((pack) => pack !== null);

        // Validate that each pack_id appears only once in the request
        const closingPackIds = new Set(body.closings.map((c) => c.pack_id));
        if (closingPackIds.size !== body.closings.length) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "DUPLICATE_PACKS",
              message: "Duplicate pack_id values are not allowed in closings.",
            },
          };
        }

        // Validate that all active packs are included in the closings array
        const activePackIds = new Set(activePacks.map((p) => p.pack_id));

        const missingPackIds = Array.from(activePackIds).filter(
          (id) => !closingPackIds.has(id),
        );
        if (missingPackIds.length > 0) {
          const missingPacks = activePacks
            .filter((p) => missingPackIds.includes(p.pack_id))
            .map((p) => ({
              pack_id: p.pack_id,
              pack_number: p.pack_number,
              game_name: p.game.name,
            }));

          reply.code(400);
          return {
            success: false,
            error: {
              code: "MISSING_PACKS",
              message:
                "Not all active packs are included in the closings. Please include all active packs.",
              details: {
                missing_packs: missingPacks,
              },
            },
          };
        }

        // Validate that all provided pack_ids exist and are active in this store
        const invalidPackIds = Array.from(closingPackIds).filter(
          (id) => !activePackIds.has(id),
        );
        if (invalidPackIds.length > 0) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "INVALID_PACKS",
              message: "Some pack IDs are not active in this store.",
              details: {
                invalid_pack_ids: invalidPackIds,
              },
            },
          };
        }

        // Validate each closing
        const validationErrors: Array<{ pack_id: string; error: string }> = [];
        const packMap = new Map(activePacks.map((p) => [p.pack_id, p]));

        for (const closing of body.closings) {
          const pack = packMap.get(closing.pack_id);
          if (!pack) continue; // Already validated above

          // Validate closing_serial is a 3-digit number
          if (!/^[0-9]{3}$/.test(closing.closing_serial)) {
            validationErrors.push({
              pack_id: closing.pack_id,
              error: `Invalid serial format: '${closing.closing_serial}'. Must be a 3-digit number.`,
            });
            continue;
          }

          // Parse serial numbers for comparison
          let closingSerial: number;
          let serialStart: number;
          let serialEnd: number;

          try {
            closingSerial = parseInt(closing.closing_serial, 10);
            serialStart = parseInt(pack.serial_start, 10);
            serialEnd = parseInt(pack.serial_end, 10);
          } catch (error) {
            validationErrors.push({
              pack_id: closing.pack_id,
              error: `Failed to parse serial numbers for pack ${pack.pack_number}`,
            });
            continue;
          }

          // Get the starting serial for today
          // Check if there's already an opening for this pack today
          const todayOpening = await prisma.lotteryShiftOpening.findFirst({
            where: {
              shift_id: { in: todayShifts.map((s) => s.shift_id) },
              pack_id: closing.pack_id,
            },
            orderBy: {
              created_at: "asc",
            },
          });

          let effectiveStartingSerial: number;
          if (todayOpening) {
            effectiveStartingSerial = parseInt(todayOpening.opening_serial, 10);
          } else {
            // Check for historical closing
            const lastClosing = await prisma.lotteryShiftClosing.findFirst({
              where: {
                pack_id: closing.pack_id,
              },
              orderBy: {
                created_at: "desc",
              },
            });

            if (lastClosing) {
              effectiveStartingSerial = parseInt(
                lastClosing.closing_serial,
                10,
              );
            } else {
              effectiveStartingSerial = serialStart;
            }
          }

          // Validate closing_serial >= starting_serial
          if (closingSerial < effectiveStartingSerial) {
            validationErrors.push({
              pack_id: closing.pack_id,
              error: `Closing serial ${closing.closing_serial} is less than starting serial ${effectiveStartingSerial.toString().padStart(3, "0")} for pack ${pack.pack_number}`,
            });
            continue;
          }

          // Validate closing_serial <= serial_end
          if (closingSerial > serialEnd) {
            validationErrors.push({
              pack_id: closing.pack_id,
              error: `Closing serial ${closing.closing_serial} exceeds pack's ending serial ${pack.serial_end} for pack ${pack.pack_number}`,
            });
            continue;
          }
        }

        // If there are validation errors, return them
        if (validationErrors.length > 0) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Some closing serials are invalid.",
              details: {
                validation_errors: validationErrors,
              },
            },
          };
        }

        // Check if closings already exist for this shift and these packs
        const existingClosings = await prisma.lotteryShiftClosing.findMany({
          where: {
            shift_id: targetShift.shift_id,
            pack_id: { in: body.closings.map((c) => c.pack_id) },
          },
        });

        if (existingClosings.length > 0) {
          const existingPackIds = existingClosings.map((c) => c.pack_id);
          const duplicatePacks = activePacks
            .filter((p) => existingPackIds.includes(p.pack_id))
            .map((p) => ({
              pack_id: p.pack_id,
              pack_number: p.pack_number,
              game_name: p.game.name,
            }));

          reply.code(400);
          return {
            success: false,
            error: {
              code: "CLOSINGS_ALREADY_EXIST",
              message:
                "Closings already exist for some packs in today's most recent shift.",
              details: {
                duplicate_packs: duplicatePacks,
              },
            },
          };
        }

        // Create LotteryShiftClosing records and update LotteryDayPack records
        const entryMethod = body.entry_method || "SCAN";
        const closingsToCreate = body.closings.map((closing) => ({
          shift_id: targetShift.shift_id,
          pack_id: closing.pack_id,
          cashier_id: targetShift.cashier_id, // Direct cashier reference for efficient querying
          closing_serial: closing.closing_serial,
          entry_method: entryMethod,
          manual_entry_authorized_by: entryMethod === "MANUAL" ? user.id : null,
          manual_entry_authorized_at:
            entryMethod === "MANUAL" ? new Date() : null,
        }));

        if (closingsToCreate.length > 0) {
          await prisma.lotteryShiftClosing.createMany({
            data: closingsToCreate,
          });
        }

        // Update LotteryBusinessDay and LotteryDayPack records
        // Find or create the LotteryBusinessDay record for today
        let lotteryBusinessDay = await prisma.lotteryBusinessDay.findUnique({
          where: {
            store_id_business_date: {
              store_id: params.storeId,
              business_date: targetDate,
            },
          },
        });

        if (!lotteryBusinessDay) {
          // Create the LotteryBusinessDay record if it doesn't exist
          lotteryBusinessDay = await prisma.lotteryBusinessDay.create({
            data: {
              store_id: params.storeId,
              business_date: targetDate,
              status: "OPEN",
              opened_by: user.id,
              opened_at: new Date(),
            },
          });
        }

        // For each closing, find the starting serial and create/update LotteryDayPack
        for (const closing of body.closings) {
          const pack = packMap.get(closing.pack_id)!;
          const bin = activeBins.find((b) =>
            b.packs.some((p) => p.pack_id === closing.pack_id),
          );

          // Determine the starting serial for this pack today
          // Check if there's already an opening for this pack today
          const todayOpening = await prisma.lotteryShiftOpening.findFirst({
            where: {
              shift_id: { in: todayShifts.map((s) => s.shift_id) },
              pack_id: closing.pack_id,
            },
            orderBy: {
              created_at: "asc",
            },
          });

          let startingSerial: string;
          if (todayOpening) {
            startingSerial = todayOpening.opening_serial;
          } else {
            // Check for historical closing
            const lastClosing = await prisma.lotteryShiftClosing.findFirst({
              where: {
                pack_id: closing.pack_id,
                shift_id: { notIn: [targetShift.shift_id] }, // Exclude closings just created
              },
              orderBy: {
                created_at: "desc",
              },
            });

            if (lastClosing) {
              startingSerial = lastClosing.closing_serial;
            } else {
              startingSerial = pack.serial_start;
            }
          }

          // Check if LotteryDayPack already exists for this pack and day
          const existingDayPack = await prisma.lotteryDayPack.findUnique({
            where: {
              day_id_pack_id: {
                day_id: lotteryBusinessDay.day_id,
                pack_id: closing.pack_id,
              },
            },
          });

          if (existingDayPack) {
            // Update ending_serial
            await prisma.lotteryDayPack.update({
              where: {
                day_pack_id: existingDayPack.day_pack_id,
              },
              data: {
                ending_serial: closing.closing_serial,
              },
            });
          } else {
            // Create new LotteryDayPack record
            await prisma.lotteryDayPack.create({
              data: {
                day_id: lotteryBusinessDay.day_id,
                pack_id: closing.pack_id,
                bin_id: bin?.bin_id || null,
                starting_serial: startingSerial,
                ending_serial: closing.closing_serial,
              },
            });
          }
        }

        // Mark the LotteryBusinessDay as CLOSED
        await prisma.lotteryBusinessDay.update({
          where: {
            day_id: lotteryBusinessDay.day_id,
          },
          data: {
            status: "CLOSED",
            closed_by: user.id,
            closed_at: new Date(),
          },
        });

        // Build response with bin information and sales data
        // We need to get the starting serials that were determined during the closing process
        // Re-fetch the LotteryDayPack records we just created/updated to get accurate starting serials
        const dayPackRecords = await prisma.lotteryDayPack.findMany({
          where: {
            day_id: lotteryBusinessDay.day_id,
            pack_id: { in: body.closings.map((c) => c.pack_id) },
          },
        });
        const dayPackMap = new Map(
          dayPackRecords.map((dp) => [dp.pack_id, dp]),
        );

        let lotteryTotal = 0;

        const binsClosed = body.closings.map((closing) => {
          const pack = packMap.get(closing.pack_id)!;
          const bin = activeBins.find((b) =>
            b.packs.some((p) => p.pack_id === closing.pack_id),
          );
          const dayPack = dayPackMap.get(closing.pack_id);

          // Calculate tickets sold and sales amount
          const startingSerial = dayPack?.starting_serial || pack.serial_start;
          const closingSerialNum = parseInt(closing.closing_serial, 10);
          const startingSerialNum = parseInt(startingSerial, 10);
          const ticketsSold = Math.max(0, closingSerialNum - startingSerialNum);
          const gamePrice = Number(pack.game.price);
          const salesAmount = ticketsSold * gamePrice;

          lotteryTotal += salesAmount;

          return {
            bin_number: bin ? bin.display_order + 1 : 0,
            pack_number: pack.pack_number,
            game_name: pack.game.name,
            closing_serial: closing.closing_serial,
            starting_serial: startingSerial,
            game_price: gamePrice,
            tickets_sold: ticketsSold,
            sales_amount: salesAmount,
          };
        });

        return {
          success: true,
          data: {
            closings_created: body.closings.length,
            business_day: businessDayStr,
            day_closed: true,
            bins_closed: binsClosed,
            lottery_total: lotteryTotal,
          },
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error closing lottery day");
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to close lottery day",
          },
        };
      }
    },
  );

  // ============================================================================
  // TWO-PHASE COMMIT ENDPOINTS FOR ATOMIC DAY CLOSE
  // ============================================================================
  // These endpoints implement the two-phase commit pattern:
  //   1. prepare-close: Store lottery closings as PENDING_CLOSE (Step 1 of wizard)
  //   2. commit-close: Atomically finalize lottery and day close (Step 3 of wizard)
  //   3. cancel-close: Revert pending state if user cancels
  //   4. status: Get current lottery day status (for resuming wizard)
  // ============================================================================

  /**
   * POST /api/lottery/bins/day/:storeId/prepare-close
   * Phase 1: Prepare lottery day close by validating and storing pending close data
   *
   * This endpoint does NOT commit any lottery records. It only:
   * 1. Validates all closings (serial ranges, pack existence, etc.)
   * 2. Stores the closings in pending_close_data JSONB column
   * 3. Updates status to PENDING_CLOSE
   * 4. Sets expiration time (1 hour by default)
   *
   * Protected route - requires LOTTERY_SHIFT_CLOSE permission
   * Story: MyStore Day Close Atomic Transaction
   *
   * MCP Guidance Applied:
   * - DB-006: TENANT_ISOLATION - Store-scoped operations with RLS
   * - API-001: VALIDATION - Schema validation for all inputs
   * - SEC-006: SQL_INJECTION - Uses Prisma ORM
   * - API-003: ERROR_HANDLING - Standardized error responses
   */
  fastify.post(
    "/api/lottery/bins/day/:storeId/prepare-close",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_SHIFT_CLOSE),
      ],
      schema: {
        description:
          "Phase 1: Prepare lottery day close by storing pending closings without committing",
        tags: ["lottery"],
        params: {
          type: "object",
          required: ["storeId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
          },
        },
        body: {
          type: "object",
          required: ["closings"],
          properties: {
            closings: {
              type: "array",
              description: "Array of pack closings with ending serial numbers",
              items: {
                type: "object",
                required: ["pack_id", "closing_serial"],
                properties: {
                  pack_id: {
                    type: "string",
                    format: "uuid",
                    description: "UUID of the pack",
                  },
                  closing_serial: {
                    type: "string",
                    pattern: "^[0-9]{3}$",
                    description: "3-digit ending serial number (e.g., '045')",
                  },
                },
              },
            },
            entry_method: {
              type: "string",
              enum: ["SCAN", "MANUAL"],
              default: "SCAN",
              description: "Method used to enter the serial numbers",
            },
            current_shift_id: {
              type: "string",
              format: "uuid",
              description: "Current shift ID - excluded from open shifts check",
            },
            authorized_by_user_id: {
              type: "string",
              format: "uuid",
              description: "User who authorized manual entry (for audit)",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  day_id: { type: "string", format: "uuid" },
                  business_date: { type: "string", format: "date" },
                  status: { type: "string", enum: ["PENDING_CLOSE"] },
                  pending_close_at: { type: "string", format: "date-time" },
                  pending_close_expires_at: {
                    type: "string",
                    format: "date-time",
                  },
                  closings_count: { type: "integer" },
                  estimated_lottery_total: { type: "number" },
                  bins_preview: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        bin_number: { type: "integer" },
                        pack_number: { type: "string" },
                        game_name: { type: "string" },
                        starting_serial: { type: "string" },
                        closing_serial: { type: "string" },
                        game_price: { type: "number" },
                        tickets_sold: { type: "integer" },
                        sales_amount: { type: "number" },
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                  details: { type: "object" },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;
      const params = request.params as { storeId: string };
      const body = request.body as {
        closings: Array<{ pack_id: string; closing_serial: string }>;
        entry_method?: "SCAN" | "MANUAL";
        current_shift_id?: string;
        authorized_by_user_id?: string;
      };

      try {
        // Import the service dynamically to avoid circular dependencies
        const { prepareClose, DayCloseError } =
          await import("../services/lottery-day-close.service");

        // Build RLS context from user identity
        const rlsContext = {
          userId: user.id,
          isAdmin: false, // Day close is store-level, not admin
          companyIds: user.company_ids || [],
          storeIds: user.store_ids || [],
        };

        const result = await prepareClose(
          rlsContext,
          params.storeId,
          body.closings,
          body.entry_method || "SCAN",
          {
            currentShiftId: body.current_shift_id,
            authorizedByUserId: body.authorized_by_user_id,
          },
        );

        return {
          success: true,
          data: result,
        };
      } catch (error: any) {
        // Handle DayCloseError with specific error codes
        if (error.name === "DayCloseError") {
          reply.code(400);
          return {
            success: false,
            error: {
              code: error.code,
              message: error.message,
              details: error.details,
            },
          };
        }

        fastify.log.error({ error }, "Error preparing lottery day close");
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to prepare lottery day close",
          },
        };
      }
    },
  );

  /**
   * POST /api/lottery/bins/day/:storeId/commit-close
   * Phase 2: Atomically commit lottery close and day close together
   *
   * This endpoint:
   * 1. Validates the day is in PENDING_CLOSE status
   * 2. Validates pending close hasn't expired
   * 3. Creates LotteryDayPack records from pending_close_data
   * 4. Updates pack status if depleted
   * 5. Updates business day to CLOSED status with same timestamp
   *
   * Protected route - requires LOTTERY_SHIFT_CLOSE permission
   * Story: MyStore Day Close Atomic Transaction
   */
  fastify.post(
    "/api/lottery/bins/day/:storeId/commit-close",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_SHIFT_CLOSE),
      ],
      schema: {
        description:
          "Phase 2: Atomically commit lottery close and day close together",
        tags: ["lottery"],
        params: {
          type: "object",
          required: ["storeId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  day_id: { type: "string", format: "uuid" },
                  business_date: { type: "string", format: "date" },
                  closed_at: { type: "string", format: "date-time" },
                  closings_created: { type: "integer" },
                  lottery_total: { type: "number" },
                  bins_closed: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        bin_number: { type: "integer" },
                        pack_number: { type: "string" },
                        game_name: { type: "string" },
                        starting_serial: { type: "string" },
                        closing_serial: { type: "string" },
                        game_price: { type: "number" },
                        tickets_sold: { type: "integer" },
                        sales_amount: { type: "number" },
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                  details: { type: "object" },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;
      const params = request.params as { storeId: string };

      try {
        const { commitClose, DayCloseError } =
          await import("../services/lottery-day-close.service");

        const rlsContext = {
          userId: user.id,
          isAdmin: false,
          companyIds: user.company_ids || [],
          storeIds: user.store_ids || [],
        };

        const result = await commitClose(rlsContext, params.storeId);

        return {
          success: true,
          data: result,
        };
      } catch (error: any) {
        if (error.name === "DayCloseError") {
          reply.code(400);
          return {
            success: false,
            error: {
              code: error.code,
              message: error.message,
              details: error.details,
            },
          };
        }

        fastify.log.error({ error }, "Error committing lottery day close");
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to commit lottery day close",
          },
        };
      }
    },
  );

  /**
   * POST /api/lottery/bins/day/:storeId/cancel-close
   * Cancel pending lottery day close and revert to OPEN status
   *
   * Protected route - requires LOTTERY_SHIFT_CLOSE permission
   * Story: MyStore Day Close Atomic Transaction
   */
  fastify.post(
    "/api/lottery/bins/day/:storeId/cancel-close",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_SHIFT_CLOSE),
      ],
      schema: {
        description: "Cancel pending lottery day close and revert to OPEN",
        tags: ["lottery"],
        params: {
          type: "object",
          required: ["storeId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  cancelled: { type: "boolean" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;
      const params = request.params as { storeId: string };

      try {
        const { cancelClose } =
          await import("../services/lottery-day-close.service");

        const rlsContext = {
          userId: user.id,
          isAdmin: false,
          companyIds: user.company_ids || [],
          storeIds: user.store_ids || [],
        };

        const cancelled = await cancelClose(rlsContext, params.storeId);

        return {
          success: true,
          data: {
            cancelled,
            message: cancelled
              ? "Pending lottery close cancelled successfully"
              : "No pending close found to cancel",
          },
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error cancelling lottery day close");
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to cancel lottery day close",
          },
        };
      }
    },
  );

  /**
   * GET /api/lottery/bins/day/:storeId/close-status
   * Get current lottery day close status
   *
   * Protected route - requires LOTTERY_SHIFT_CLOSE permission
   * Story: MyStore Day Close Atomic Transaction
   */
  fastify.get(
    "/api/lottery/bins/day/:storeId/close-status",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_SHIFT_CLOSE),
      ],
      schema: {
        description: "Get current lottery day close status",
        tags: ["lottery"],
        params: {
          type: "object",
          required: ["storeId"],
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                nullable: true,
                properties: {
                  day_id: { type: "string", format: "uuid" },
                  status: { type: "string" },
                  pending_close_at: {
                    type: "string",
                    format: "date-time",
                    nullable: true,
                  },
                  pending_close_expires_at: {
                    type: "string",
                    format: "date-time",
                    nullable: true,
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as { storeId: string };

      try {
        const { getDayStatus } =
          await import("../services/lottery-day-close.service");

        const status = await getDayStatus(params.storeId);

        return {
          success: true,
          data: status,
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error getting lottery day status");
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to get lottery day status",
          },
        };
      }
    },
  );

  /**
   * PUT /api/lottery/games/:gameId
   * Update an existing lottery game's details
   * Protected route - requires LOTTERY_PACK_RECEIVE permission (game management is part of pack workflow)
   *
   * MCP Guidance Applied:
   * - DB-006: TENANT_ISOLATION - Validate user has store access for store-scoped games
   * - API-001: VALIDATION - Schema validation for request parameters
   * - API-003: ERROR_HANDLING - Return generic errors, never leak internals
   * - API-009: IDOR - Validate ownership before allowing updates
   * - DB-001: ORM_USAGE - Use Prisma ORM for safe database operations
   */
  fastify.put(
    "/api/lottery/games/:gameId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_PACK_RECEIVE),
      ],
      schema: {
        description: "Update an existing lottery game",
        tags: ["lottery"],
        params: {
          type: "object",
          required: ["gameId"],
          properties: {
            gameId: {
              type: "string",
              format: "uuid",
              description: "Game UUID to update",
            },
          },
        },
        body: {
          type: "object",
          properties: {
            name: {
              type: "string",
              minLength: 1,
              maxLength: 255,
              description: "Game name (will be stored uppercase)",
            },
            game_code: {
              type: "string",
              pattern: "^\\d{4}$",
              description: "4-digit game code",
            },
            price: {
              type: "number",
              minimum: 0.01,
              description: "Ticket price (must be > 0)",
            },
            pack_value: {
              type: "number",
              minimum: 1,
              description: "Total pack value in dollars",
            },
            description: {
              type: "string",
              maxLength: 500,
              description: "Optional game description",
            },
            status: {
              type: "string",
              enum: ["ACTIVE", "INACTIVE", "DISCONTINUED"],
              description: "Game status",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  game_id: { type: "string", format: "uuid" },
                  game_code: { type: "string" },
                  name: { type: "string" },
                  price: { type: "number", nullable: true },
                  pack_value: { type: "number", nullable: true },
                  total_tickets: { type: "integer", nullable: true },
                  description: { type: "string", nullable: true },
                  status: { type: "string" },
                  store_id: { type: "string", format: "uuid", nullable: true },
                  updated_at: { type: "string", format: "date-time" },
                },
              },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          409: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          500: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;
      const params = request.params as { gameId: string };
      const body = request.body as {
        name?: string;
        game_code?: string;
        price?: number;
        pack_value?: number;
        description?: string;
        status?: "ACTIVE" | "INACTIVE" | "DISCONTINUED";
      };

      try {
        // Fetch existing game to validate ownership (IDOR - API-009)
        const existingGame = await prisma.lotteryGame.findUnique({
          where: { game_id: params.gameId },
          include: {
            store: {
              select: {
                store_id: true,
                company_id: true,
              },
            },
          },
        });

        if (!existingGame) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "GAME_NOT_FOUND",
              message: "Lottery game not found",
            },
          };
        }

        // Validate user access (TENANT_ISOLATION - DB-006)
        // For store-scoped games, validate user has access to that store
        // For global games (store_id = null), only SUPERADMIN can update
        const userRoles = await rbacService.getUserRoles(user.id);
        const isSuperAdmin = userRoles.some((role) => role.scope === "SYSTEM");

        if (existingGame.store_id) {
          // Store-scoped game - validate store access
          const hasAccess = validateUserStoreAccess(
            userRoles,
            existingGame.store_id,
            existingGame.store!.company_id,
          );

          if (!hasAccess) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "FORBIDDEN",
                message:
                  "You do not have access to update this store's games (RLS violation)",
              },
            };
          }
        } else {
          // Global game - only SUPERADMIN can update
          if (!isSuperAdmin) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "FORBIDDEN",
                message: "Only system administrators can update global games",
              },
            };
          }
        }

        // Build update data object (only include provided fields)
        const updateData: {
          name?: string;
          game_code?: string;
          price?: number;
          pack_value?: number;
          tickets_per_pack?: number;
          description?: string | null;
          status?: "ACTIVE" | "INACTIVE" | "DISCONTINUED";
        } = {};

        // Validate and process name (VALIDATION - API-001)
        if (body.name !== undefined) {
          const normalizedName = body.name.trim().toUpperCase();
          if (normalizedName.length === 0) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Game name cannot be empty",
              },
            };
          }
          updateData.name = normalizedName;
        }

        // Validate game_code format and uniqueness
        if (body.game_code !== undefined) {
          if (!/^\d{4}$/.test(body.game_code)) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Game code must be exactly 4 digits",
              },
            };
          }

          // Check for duplicate game code (excluding self)
          const duplicateGame = await prisma.lotteryGame.findFirst({
            where: {
              game_code: body.game_code,
              game_id: { not: params.gameId },
              // For store-scoped games, check within same store
              // For global games, check global scope
              store_id: existingGame.store_id,
            },
          });

          if (duplicateGame) {
            reply.code(409);
            return {
              success: false,
              error: {
                code: "DUPLICATE_GAME_CODE",
                message: `Game code ${body.game_code} already exists${existingGame.store_id ? " for this store" : ""}`,
              },
            };
          }

          updateData.game_code = body.game_code;
        }

        // Validate price
        if (body.price !== undefined) {
          if (body.price <= 0) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Price must be greater than 0",
              },
            };
          }
          updateData.price = body.price;
        }

        // Validate pack_value and recalculate total_tickets
        if (body.pack_value !== undefined) {
          if (body.pack_value < 1) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Pack value must be at least 1",
              },
            };
          }
          updateData.pack_value = body.pack_value;
        }

        // Recalculate tickets_per_pack if price or pack_value changed
        const finalPrice =
          updateData.price ?? (existingGame.price?.toNumber() || null);
        const finalPackValue =
          updateData.pack_value ??
          (existingGame.pack_value?.toNumber() || null);

        if (finalPrice && finalPackValue) {
          updateData.tickets_per_pack = Math.floor(finalPackValue / finalPrice);
        }

        // Process description (can be set to null/empty)
        if (body.description !== undefined) {
          updateData.description = body.description.trim() || null;
        }

        // Process status
        if (body.status !== undefined) {
          updateData.status = body.status;
        }

        // Check if there's anything to update
        if (Object.keys(updateData).length === 0) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "No valid fields provided for update",
            },
          };
        }

        // Perform update (ORM_USAGE - DB-001)
        const updatedGame = await prisma.lotteryGame.update({
          where: { game_id: params.gameId },
          data: updateData,
        });

        fastify.log.info(
          {
            gameId: params.gameId,
            userId: user.id,
            updatedFields: Object.keys(updateData),
          },
          "Lottery game updated",
        );

        return {
          success: true,
          data: {
            game_id: updatedGame.game_id,
            game_code: updatedGame.game_code,
            name: updatedGame.name,
            price: updatedGame.price?.toNumber() ?? null,
            pack_value: updatedGame.pack_value?.toNumber() ?? null,
            tickets_per_pack: updatedGame.tickets_per_pack,
            description: updatedGame.description,
            status: updatedGame.status,
            store_id: updatedGame.store_id,
            updated_at: updatedGame.updated_at.toISOString(),
          },
        };
      } catch (error: any) {
        fastify.log.error(
          { error, gameId: params.gameId },
          "Error updating lottery game",
        );
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to update lottery game",
          },
        };
      }
    },
  );

  /**
   * PUT /api/lottery/packs/:packId
   * Update an existing lottery pack's details
   * Protected route - requires LOTTERY_PACK_RECEIVE permission
   *
   * IMPORTANT: Only RECEIVED packs can be edited. Once a pack is ACTIVE,
   * it's tied to shift records and cannot be modified to maintain audit integrity.
   *
   * MCP Guidance Applied:
   * - DB-006: TENANT_ISOLATION - Validate user has store access via role scope
   * - API-001: VALIDATION - Schema validation for request parameters
   * - API-003: ERROR_HANDLING - Return generic errors, never leak internals
   * - API-009: IDOR - Validate ownership via store access before allowing updates
   * - DB-001: ORM_USAGE - Use Prisma ORM with transactions for atomicity
   */
  fastify.put(
    "/api/lottery/packs/:packId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_PACK_RECEIVE),
      ],
      schema: {
        description:
          "Update an existing lottery pack (only RECEIVED packs can be edited)",
        tags: ["lottery"],
        params: {
          type: "object",
          required: ["packId"],
          properties: {
            packId: {
              type: "string",
              format: "uuid",
              description: "Pack UUID to update",
            },
          },
        },
        body: {
          type: "object",
          properties: {
            game_id: {
              type: "string",
              format: "uuid",
              description: "Game UUID to assign pack to",
            },
            pack_number: {
              type: "string",
              minLength: 1,
              maxLength: 50,
              description: "Pack number (unique per store)",
            },
            serial_start: {
              type: "string",
              minLength: 1,
              maxLength: 100,
              pattern: "^\\d+$",
              description: "Starting serial number (numeric only)",
            },
            serial_end: {
              type: "string",
              minLength: 1,
              maxLength: 100,
              pattern: "^\\d+$",
              description:
                "Ending serial number (numeric only, must be >= serial_start)",
            },
            bin_id: {
              type: ["string", "null"],
              format: "uuid",
              description: "Bin UUID to assign pack to (null to unassign)",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  pack_id: { type: "string", format: "uuid" },
                  game_id: { type: "string", format: "uuid" },
                  pack_number: { type: "string" },
                  serial_start: { type: "string" },
                  serial_end: { type: "string" },
                  status: { type: "string" },
                  store_id: { type: "string", format: "uuid" },
                  current_bin_id: {
                    type: "string",
                    format: "uuid",
                    nullable: true,
                  },
                  game: {
                    type: "object",
                    properties: {
                      game_id: { type: "string" },
                      game_code: { type: "string" },
                      name: { type: "string" },
                      price: { type: "number", nullable: true },
                    },
                  },
                  bin: {
                    type: "object",
                    nullable: true,
                    properties: {
                      bin_id: { type: "string" },
                      name: { type: "string" },
                    },
                  },
                  updated_at: { type: "string", format: "date-time" },
                },
              },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          409: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          500: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;
      const params = request.params as { packId: string };
      const body = request.body as {
        game_id?: string;
        pack_number?: string;
        serial_start?: string;
        serial_end?: string;
        bin_id?: string | null;
      };

      try {
        // Fetch existing pack with relationships (IDOR - API-009)
        const existingPack = await prisma.lotteryPack.findUnique({
          where: { pack_id: params.packId },
          include: {
            store: {
              select: {
                store_id: true,
                company_id: true,
              },
            },
            game: {
              select: {
                game_id: true,
                name: true,
                game_code: true,
                price: true,
              },
            },
            bin: {
              select: {
                bin_id: true,
                name: true,
              },
            },
          },
        });

        if (!existingPack) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "PACK_NOT_FOUND",
              message: "Lottery pack not found",
            },
          };
        }

        // Validate user has store access (TENANT_ISOLATION - DB-006)
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasAccess = validateUserStoreAccess(
          userRoles,
          existingPack.store_id,
          existingPack.store.company_id,
        );

        if (!hasAccess) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "FORBIDDEN",
              message:
                "You do not have access to this store's lottery packs (RLS violation)",
            },
          };
        }

        // CRITICAL: Only RECEIVED packs can be edited
        // ACTIVE/DEPLETED/RETURNED packs are tied to shift records
        if (existingPack.status !== "RECEIVED") {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "INVALID_PACK_STATUS",
              message: `Only RECEIVED packs can be edited. This pack is ${existingPack.status} and tied to operational records.`,
            },
          };
        }

        // Build update data object
        const updateData: {
          game_id?: string;
          pack_number?: string;
          serial_start?: string;
          serial_end?: string;
          current_bin_id?: string | null;
        } = {};

        // Validate game_id if provided
        if (body.game_id !== undefined) {
          const game = await prisma.lotteryGame.findUnique({
            where: { game_id: body.game_id },
            select: { game_id: true, store_id: true, status: true },
          });

          if (!game) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "INVALID_GAME",
                message: "Game not found",
              },
            };
          }

          // Ensure game is accessible to this store
          if (game.store_id && game.store_id !== existingPack.store_id) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "INVALID_GAME",
                message: "Game is not available for this store",
              },
            };
          }

          if (game.status !== "ACTIVE") {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "INVALID_GAME",
                message: "Cannot assign pack to inactive or discontinued game",
              },
            };
          }

          updateData.game_id = body.game_id;
        }

        // Validate pack_number uniqueness
        if (body.pack_number !== undefined) {
          const trimmedPackNumber = body.pack_number.trim();
          if (trimmedPackNumber.length === 0) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Pack number cannot be empty",
              },
            };
          }

          // Check for duplicate pack number (excluding self)
          const duplicatePack = await prisma.lotteryPack.findFirst({
            where: {
              store_id: existingPack.store_id,
              pack_number: trimmedPackNumber,
              pack_id: { not: params.packId },
            },
          });

          if (duplicatePack) {
            reply.code(409);
            return {
              success: false,
              error: {
                code: "DUPLICATE_PACK_NUMBER",
                message: `Pack number ${trimmedPackNumber} already exists for this store`,
              },
            };
          }

          updateData.pack_number = trimmedPackNumber;
        }

        // Validate serial numbers
        const finalSerialStart =
          body.serial_start?.trim() || existingPack.serial_start;
        const finalSerialEnd =
          body.serial_end?.trim() || existingPack.serial_end;

        if (body.serial_start !== undefined) {
          if (!/^\d+$/.test(body.serial_start.trim())) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Serial start must contain only numeric characters",
              },
            };
          }
          updateData.serial_start = body.serial_start.trim();
        }

        if (body.serial_end !== undefined) {
          if (!/^\d+$/.test(body.serial_end.trim())) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Serial end must contain only numeric characters",
              },
            };
          }
          updateData.serial_end = body.serial_end.trim();
        }

        // Validate serial range (end >= start)
        const startNum = parseInt(finalSerialStart, 10);
        const endNum = parseInt(finalSerialEnd, 10);
        if (!isNaN(startNum) && !isNaN(endNum) && endNum < startNum) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message:
                "Serial end must be greater than or equal to serial start",
            },
          };
        }

        // Validate bin_id if provided
        if (body.bin_id !== undefined) {
          if (body.bin_id === null || body.bin_id === "") {
            // Unassign from bin
            updateData.current_bin_id = null;
          } else {
            // Validate bin exists and belongs to same store
            const bin = await prisma.lotteryBin.findUnique({
              where: { bin_id: body.bin_id },
              select: { bin_id: true, store_id: true, is_active: true },
            });

            if (!bin) {
              reply.code(400);
              return {
                success: false,
                error: {
                  code: "INVALID_BIN",
                  message: "Bin not found",
                },
              };
            }

            if (bin.store_id !== existingPack.store_id) {
              reply.code(400);
              return {
                success: false,
                error: {
                  code: "INVALID_BIN",
                  message: "Bin does not belong to this store",
                },
              };
            }

            if (!bin.is_active) {
              reply.code(400);
              return {
                success: false,
                error: {
                  code: "INVALID_BIN",
                  message: "Cannot assign pack to inactive bin",
                },
              };
            }

            updateData.current_bin_id = body.bin_id;
          }
        }

        // Check if there's anything to update
        if (Object.keys(updateData).length === 0) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "No valid fields provided for update",
            },
          };
        }

        // Perform update with transaction (ORM_USAGE - DB-001)
        const updatedPack = await prisma.lotteryPack.update({
          where: { pack_id: params.packId },
          data: updateData,
          include: {
            game: {
              select: {
                game_id: true,
                game_code: true,
                name: true,
                price: true,
              },
            },
            bin: {
              select: {
                bin_id: true,
                name: true,
              },
            },
          },
        });

        fastify.log.info(
          {
            packId: params.packId,
            userId: user.id,
            updatedFields: Object.keys(updateData),
          },
          "Lottery pack updated",
        );

        return {
          success: true,
          data: {
            pack_id: updatedPack.pack_id,
            game_id: updatedPack.game_id,
            pack_number: updatedPack.pack_number,
            serial_start: updatedPack.serial_start,
            serial_end: updatedPack.serial_end,
            status: updatedPack.status,
            store_id: updatedPack.store_id,
            current_bin_id: updatedPack.current_bin_id,
            game: updatedPack.game
              ? {
                  game_id: updatedPack.game.game_id,
                  game_code: updatedPack.game.game_code,
                  name: updatedPack.game.name,
                  price: updatedPack.game.price?.toNumber() ?? null,
                }
              : null,
            bin: updatedPack.bin
              ? {
                  bin_id: updatedPack.bin.bin_id,
                  name: updatedPack.bin.name,
                }
              : null,
            updated_at: updatedPack.updated_at.toISOString(),
          },
        };
      } catch (error: any) {
        fastify.log.error(
          { error, packId: params.packId },
          "Error updating lottery pack",
        );
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to update lottery pack",
          },
        };
      }
    },
  );

  /**
   * DELETE /api/lottery/packs/:packId
   * Delete an existing lottery pack
   * Protected route - requires LOTTERY_PACK_RECEIVE permission
   *
   * IMPORTANT: Only RECEIVED packs can be deleted. ACTIVE/DEPLETED/RETURNED packs
   * are tied to shift records and must be preserved for audit purposes.
   *
   * MCP Guidance Applied:
   * - DB-006: TENANT_ISOLATION - Validate user has store access via role scope
   * - API-001: VALIDATION - Schema validation for request parameters
   * - API-003: ERROR_HANDLING - Return generic errors, never leak internals
   * - API-009: IDOR - Validate ownership via store access before allowing deletion
   * - DB-001: ORM_USAGE - Use Prisma ORM for safe database operations
   */
  fastify.delete(
    "/api/lottery/packs/:packId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_PACK_RECEIVE),
      ],
      schema: {
        description:
          "Delete an existing lottery pack (only RECEIVED packs can be deleted)",
        tags: ["lottery"],
        params: {
          type: "object",
          required: ["packId"],
          properties: {
            packId: {
              type: "string",
              format: "uuid",
              description: "Pack UUID to delete",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  pack_id: { type: "string", format: "uuid" },
                  message: { type: "string" },
                },
              },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          403: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          500: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;
      const params = request.params as { packId: string };

      try {
        // Fetch existing pack (IDOR - API-009)
        const existingPack = await prisma.lotteryPack.findUnique({
          where: { pack_id: params.packId },
          include: {
            store: {
              select: {
                store_id: true,
                company_id: true,
              },
            },
          },
        });

        if (!existingPack) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "PACK_NOT_FOUND",
              message: "Lottery pack not found",
            },
          };
        }

        // Validate user has store access (TENANT_ISOLATION - DB-006)
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasAccess = validateUserStoreAccess(
          userRoles,
          existingPack.store_id,
          existingPack.store.company_id,
        );

        if (!hasAccess) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "FORBIDDEN",
              message:
                "You do not have access to this store's lottery packs (RLS violation)",
            },
          };
        }

        // CRITICAL: Only RECEIVED packs can be deleted
        // ACTIVE/DEPLETED/RETURNED packs have operational history
        if (existingPack.status !== "RECEIVED") {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "INVALID_PACK_STATUS",
              message: `Only RECEIVED packs can be deleted. This pack is ${existingPack.status} and has operational history that must be preserved.`,
            },
          };
        }

        // Delete the pack (ORM_USAGE - DB-001)
        await prisma.lotteryPack.delete({
          where: { pack_id: params.packId },
        });

        fastify.log.info(
          {
            packId: params.packId,
            packNumber: existingPack.pack_number,
            userId: user.id,
          },
          "Lottery pack deleted",
        );

        return {
          success: true,
          data: {
            pack_id: params.packId,
            message: `Pack ${existingPack.pack_number} has been deleted`,
          },
        };
      } catch (error: any) {
        fastify.log.error(
          { error, packId: params.packId },
          "Error deleting lottery pack",
        );
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to delete lottery pack",
          },
        };
      }
    },
  );
}
