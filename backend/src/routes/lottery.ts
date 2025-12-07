import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { permissionMiddleware } from "../middleware/permission.middleware";
import { PERMISSIONS } from "../constants/permissions";
import { prisma } from "../utils/db";
import { rbacService } from "../services/rbac.service";

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
                  "You can only query packs for your assigned store. store_id does not match your store access",
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
}
