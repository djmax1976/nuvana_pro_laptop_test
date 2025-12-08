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

/**
 * Lottery management routes
 * Provides operations for lottery pack reception and management
 * All routes require LOTTERY_* permissions and enforce store isolation
 */
export async function lotteryRoutes(fastify: FastifyInstance) {
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
          required: ["game_id", "pack_number", "serial_start", "serial_end"],
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
              description: "Starting serial number in the pack",
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
        serial_start: string;
        serial_end: string;
        store_id?: string;
        bin_id?: string;
      };

      // Normalize string fields by trimming whitespace
      // This ensures consistent behavior across duplicate checks, validations, and database writes
      const normalizedPackNumber = body.pack_number.trim();
      const normalizedSerialStart = body.serial_start.trim();
      const normalizedSerialEnd = body.serial_end.trim();

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

        // Determine store_id from request body or user's store role
        let storeId: string;
        if (body.store_id) {
          storeId = body.store_id;
        } else {
          // If store_id not provided, get from user's STORE scope role
          const storeRole = userRoles.find(
            (role) => role.scope === "STORE" && role.store_id,
          );
          if (!storeRole || !storeRole.store_id) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message:
                  "store_id is required. Either provide store_id in request body or ensure user has STORE scope role",
              },
            };
          }
          storeId = storeRole.store_id;
        }

        // Validate store_id matches user's store (RLS enforcement)
        // System admins can access any store
        if (!hasSystemScope) {
          const userStoreRole = userRoles.find(
            (role) => role.scope === "STORE" && role.store_id === storeId,
          );
          if (!userStoreRole) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "FORBIDDEN",
                message:
                  "You can only receive packs for your assigned store. store_id does not match your store access",
              },
            };
          }
        }

        // Validate store exists
        const store = await prisma.store.findUnique({
          where: { store_id: storeId },
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

        // Validate serial numbers are numeric-only (lottery serial barcodes are numeric)
        const numericOnlyRegex = /^\d+$/;
        if (!numericOnlyRegex.test(normalizedSerialStart)) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "serial_start must contain only numeric characters",
            },
          };
        }
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

        // Validate serial range using BigInt comparison
        // Serial numbers can be very long (24+ digits), exceeding JavaScript's Number.MAX_SAFE_INTEGER
        const serialStartBigInt = BigInt(normalizedSerialStart);
        const serialEndBigInt = BigInt(normalizedSerialEnd);

        // serial_start must be strictly less than serial_end (they cannot be equal)
        if (serialStartBigInt >= serialEndBigInt) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message:
                "Invalid serial range: serial_start must be less than serial_end",
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

        // Get user roles to determine store access
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        // Determine store_id from request body or user's store role
        let storeId: string;
        if (body.store_id) {
          storeId = body.store_id;
        } else {
          // If store_id not provided, get from user's STORE scope role
          const storeRole = userRoles.find(
            (role) => role.scope === "STORE" && role.store_id,
          );
          if (!storeRole || !storeRole.store_id) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message:
                  "store_id is required. Either provide store_id in request body or ensure user has STORE scope role",
              },
            };
          }
          storeId = storeRole.store_id;
        }

        // Validate store_id matches user's store (RLS enforcement)
        if (!hasSystemScope) {
          const userStoreRole = userRoles.find(
            (role) => role.scope === "STORE" && role.store_id === storeId,
          );
          if (!userStoreRole) {
            reply.code(403);
            return {
              success: false,
              error: {
                code: "FORBIDDEN",
                message:
                  "You can only receive packs for your assigned store. store_id does not match your store access",
              },
            };
          }
        }

        // Validate store exists
        const store = await prisma.store.findUnique({
          where: { store_id: storeId },
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

        // Process batch in transaction for atomicity
        const result = await prisma.$transaction(
          async (tx) => {
            const created: any[] = [];
            const duplicates: string[] = [];
            const errors: Array<{ serial: string; error: string }> = [];

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

                // Lookup game by game code
                let game;
                try {
                  game = await lookupGameByCode(parsed.game_code);
                } catch (lookupError: any) {
                  errors.push({
                    serial,
                    error: lookupError.message || "Game code not found",
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

                // Calculate serial_end from serial_start (assuming 150 tickets per pack)
                // Note: This is a simplified calculation - adjust based on actual pack size
                const serialStartNum = BigInt(parsed.serial_start);
                const serialEndNum = serialStartNum + BigInt(149); // 150 tickets (0-149)
                const serialEnd = serialEndNum
                  .toString()
                  .padStart(parsed.serial_start.length, "0");

                // Create pack
                const newPack = await tx.lotteryPack.create({
                  data: {
                    game_id: game.game_id,
                    store_id: storeId,
                    pack_number: parsed.pack_number,
                    serial_start: parsed.serial_start,
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
            try {
              await tx.auditLog.create({
                data: {
                  user_id: user.id,
                  action: "BATCH_PACK_RECEIVED",
                  table_name: "lottery_packs",
                  record_id: null,
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

        // Validate store_id matches authenticated user's store (RLS enforcement)
        // System admins can access any store
        if (!hasSystemScope) {
          const userStoreRole = userRoles.find(
            (role) => role.scope === "STORE" && role.store_id === pack.store_id,
          );
          if (!userStoreRole) {
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
          const activatedPack = await tx.lotteryPack.findUnique({
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
                    name: { type: "string" },
                    description: { type: "string", nullable: true },
                    price: { type: "number", nullable: true },
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

        // Query active lottery games using Prisma ORM (prevents SQL injection)
        const games = await prisma.lotteryGame.findMany({
          where: {
            status: "ACTIVE",
          },
          select: {
            game_id: true,
            name: true,
            description: true,
            price: true,
            status: true,
            created_at: true,
            updated_at: true,
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
          data: games.map((game) => ({
            game_id: game.game_id,
            name: game.name,
            description: game.description,
            price: game.price ? Number(game.price) : null,
            status: game.status,
            created_at: game.created_at.toISOString(),
            updated_at: game.updated_at.toISOString(),
          })),
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
                  "You do not have access to this store. Access is limited to your assigned stores or company.",
              },
            };
          }
        }

        // Build query filter using Prisma ORM (prevents SQL injection)
        const whereClause: any = {
          store_id: query.store_id, // RLS enforced via store_id filter
        };

        if (query.status) {
          whereClause.status = query.status;
        }

        if (query.game_id) {
          whereClause.game_id = query.game_id;
        }

        // Query packs with relationships using Prisma ORM
        const packs = await prisma.lotteryPack.findMany({
          where: whereClause,
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

        // Validate store_id matches authenticated user's store (RLS enforcement)
        // System admins can access any store
        if (!hasSystemScope) {
          const userStoreRole = userRoles.find(
            (role) => role.scope === "STORE" && role.store_id === pack.store_id,
          );
          if (!userStoreRole) {
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
        // RLS enforced via store_id filter
        const bins = await prisma.lotteryBin.findMany({
          where: {
            store_id: query.store_id, // RLS enforced via store_id filter
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
                  "You do not have access to this store. Access is limited to your assigned stores or company.",
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
                  "You do not have access to this store. Access is limited to your assigned stores or company.",
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
                  "You do not have access to this store. Access is limited to your assigned stores or company.",
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
   * Get all active bins for a store with display order
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
        description: "Get all active bins for a store",
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
                  "You do not have access to this store. Access is limited to your assigned stores or company.",
              },
            };
          }
        }

        // Query active bins using Prisma ORM (prevents SQL injection, enforces RLS)
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
          },
        });

        // Create audit log entry (non-blocking)
        try {
          await prisma.auditLog.create({
            data: {
              user_id: user.id,
              action: "LOTTERY_BIN_READ",
              table_name: "lottery_bins",
              record_id: null,
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
                  "You do not have access to this store. Access is limited to your assigned stores or company.",
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
                  "You do not have access to this store. Access is limited to your assigned stores or company.",
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
                  "You do not have access to this store. Access is limited to your assigned stores or company.",
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
                  "You do not have access to this store. Access is limited to your assigned stores or company.",
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
              record_id: null,
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
}
