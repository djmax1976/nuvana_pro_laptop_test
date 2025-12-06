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

        // Validate serial range (serial_start should be <= serial_end)
        // Note: Serial numbers are strings, so we compare them as strings
        // This is a basic validation - more complex validation may be needed based on barcode format
        if (body.serial_start > body.serial_end) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message:
                "Invalid serial range: serial_start must be less than or equal to serial_end",
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
                pack_number: body.pack_number,
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
              pack_number: body.pack_number.trim(),
              serial_start: body.serial_start.trim(),
              serial_end: body.serial_end.trim(),
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
                reason: `Lottery pack received by ${user.email} (roles: ${user.roles.join(", ")}) - Pack #${body.pack_number}`,
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
              message: `Pack number ${body.pack_number} already exists for this store`,
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
              message: `Pack number ${body.pack_number} already exists for this store`,
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
}
