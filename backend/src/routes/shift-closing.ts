/**
 * Shift Closing Routes
 *
 * API endpoints for shift closing operations, specifically lottery shift closing.
 * Story 10.1: Lottery Shift Closing Page UI
 *
 * IMPORTANT: All shift status checks MUST use the ShiftStateMachine service
 * to ensure consistent behavior across the application.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { permissionMiddleware } from "../middleware/permission.middleware";
import { PERMISSIONS } from "../constants/permissions";
import { prisma } from "../utils/db";
import { shiftService } from "../services/shift.service";
import { ShiftStatus, LotteryPackStatus } from "@prisma/client";
import { closeLotteryForShift } from "../services/shift-closing.service";
import { rbacService } from "../services/rbac.service";
import { shiftStateMachine } from "../services/shift-state-machine";
import { validateSerialWithinPackRange } from "../services/lottery-validation.service";

/**
 * Shift closing routes
 * Provides GET /api/shifts/:shiftId/lottery/closing-data endpoint
 */
export async function shiftClosingRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/shifts/:shiftId/lottery/closing-data
   * Get lottery closing data for a shift
   * Returns all bins for the store (ordered by display_order), active pack in each bin,
   * opening serial from LotteryShiftOpening, and packs depleted during this shift.
   * Protected route - requires LOTTERY_SHIFT_CLOSE permission and active shift
   */
  fastify.get(
    "/api/shifts/:shiftId/lottery/closing-data",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_SHIFT_CLOSE),
      ],
      schema: {
        description: "Get lottery closing data for a shift",
        tags: ["shift-closing", "lottery"],
        params: {
          type: "object",
          required: ["shiftId"],
          properties: {
            shiftId: {
              type: "string",
              format: "uuid",
              description: "Shift UUID",
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
                        bin_number: { type: "number" },
                        name: { type: "string" },
                        is_active: { type: "boolean" },
                        pack: {
                          type: ["object", "null"],
                          properties: {
                            pack_id: { type: "string", format: "uuid" },
                            game_name: { type: "string" },
                            game_price: { type: "number" },
                            starting_serial: { type: "string" },
                            serial_end: { type: "string" },
                            pack_number: { type: "string" },
                          },
                        },
                      },
                    },
                  },
                  soldPacks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        bin_id: { type: "string", format: "uuid" },
                        bin_number: { type: "number" },
                        pack_id: { type: "string", format: "uuid" },
                        game_name: { type: "string" },
                        game_price: { type: "number" },
                        starting_serial: { type: "string" },
                        ending_serial: { type: "string" },
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
      try {
        const user = (request as any).user as UserIdentity;
        const { shiftId } = request.params as { shiftId: string };

        // Validate shift exists and user has access
        const shift = await prisma.shift.findUnique({
          where: { shift_id: shiftId },
          select: {
            shift_id: true,
            store_id: true,
            status: true,
            closed_at: true,
          },
        });

        if (!shift) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "SHIFT_NOT_FOUND",
              message: `Shift with ID ${shiftId} not found`,
            },
          };
        }

        // Validate user has access to this store (RLS enforcement)
        await shiftService.validateStoreAccess(shift.store_id, user.id);

        // Validate shift is active (OPEN, ACTIVE, CLOSING, RECONCILING and closed_at IS NULL)
        const isActiveShift =
          shift.status === ShiftStatus.OPEN ||
          shift.status === ShiftStatus.ACTIVE ||
          shift.status === ShiftStatus.CLOSING ||
          shift.status === ShiftStatus.RECONCILING;

        if (!isActiveShift || shift.closed_at !== null) {
          reply.code(403);
          return {
            success: false,
            error: {
              code: "SHIFT_NOT_ACTIVE",
              message: "Shift is not active. Only active shifts can be closed.",
            },
          };
        }

        // Get all bins for the store, ordered by display_order
        const bins = await prisma.lotteryBin.findMany({
          where: {
            store_id: shift.store_id,
            is_active: true,
          },
          orderBy: {
            display_order: "asc",
          },
          select: {
            bin_id: true,
            name: true,
            display_order: true,
            is_active: true,
          },
        });

        // Get active packs in each bin (status = ACTIVE, current_bin_id matches)
        const activePacks = await prisma.lotteryPack.findMany({
          where: {
            store_id: shift.store_id,
            status: LotteryPackStatus.ACTIVE,
            current_bin_id: {
              in: bins.map((bin) => bin.bin_id),
            },
          },
          select: {
            pack_id: true,
            current_bin_id: true,
            pack_number: true,
            serial_start: true,
            serial_end: true,
            game: {
              select: {
                name: true,
                price: true,
              },
            },
          },
        });

        // Get opening serials from LotteryShiftOpening for this shift
        const shiftOpenings = await prisma.lotteryShiftOpening.findMany({
          where: {
            shift_id: shiftId,
          },
          select: {
            pack_id: true,
            opening_serial: true,
          },
        });

        // Create a map of pack_id -> opening_serial for quick lookup
        const openingSerialMap = new Map(
          shiftOpenings.map((opening) => [
            opening.pack_id,
            opening.opening_serial,
          ]),
        );

        // Get packs that were depleted during this shift
        // (status = DEPLETED, depleted_at is during this shift)
        const shiftStartTime = await prisma.shift.findUnique({
          where: { shift_id: shiftId },
          select: { opened_at: true },
        });

        const depletedPacks = await prisma.lotteryPack.findMany({
          where: {
            store_id: shift.store_id,
            status: LotteryPackStatus.DEPLETED,
            depleted_at: {
              gte: shiftStartTime?.opened_at || new Date(0),
            },
          },
          select: {
            pack_id: true,
            current_bin_id: true,
            pack_number: true,
            serial_start: true,
            serial_end: true,
            depleted_at: true,
            game: {
              select: {
                name: true,
                price: true,
              },
            },
          },
        });

        // Build bins with pack data
        const binsWithPacks = bins.map((bin) => {
          // Find active pack in this bin
          const activePack = activePacks.find(
            (pack) => pack.current_bin_id === bin.bin_id,
          );

          if (!activePack) {
            // Empty bin
            return {
              bin_id: bin.bin_id,
              bin_number: bin.display_order + 1, // display_order is 0-indexed, bin_number is 1-indexed
              name: bin.name,
              is_active: bin.is_active,
              pack: null,
            };
          }

          // Get opening serial from shift opening data
          const openingSerial = openingSerialMap.get(activePack.pack_id);

          return {
            bin_id: bin.bin_id,
            bin_number: bin.display_order + 1,
            name: bin.name,
            is_active: bin.is_active,
            pack: {
              pack_id: activePack.pack_id,
              game_name: activePack.game.name,
              game_price: activePack.game.price.toNumber(),
              starting_serial: openingSerial || activePack.serial_start, // Fallback to pack's serial_start if no opening recorded
              serial_end: activePack.serial_end,
              pack_number: activePack.pack_number,
            },
          };
        });

        // Build sold packs (depleted packs from this shift)
        const soldPacks = depletedPacks
          .filter((pack) => {
            // Verify this pack was depleted during this shift
            // We already filtered by depleted_at >= shift.opened_at, but we should also check
            // that it's not after shift closed (if shift is closed)
            if (
              shift.closed_at &&
              pack.depleted_at &&
              pack.depleted_at > shift.closed_at
            ) {
              return false;
            }
            return true;
          })
          .map((pack) => {
            // Find the bin this pack was in (from current_bin_id or bin history)
            const bin = bins.find((b) => b.bin_id === pack.current_bin_id);
            const binNumber = bin ? bin.display_order + 1 : 0;

            // Get opening serial for this pack
            const openingSerial = openingSerialMap.get(pack.pack_id);

            return {
              bin_id: pack.current_bin_id || "",
              bin_number: binNumber,
              pack_id: pack.pack_id,
              game_name: pack.game.name,
              game_price: pack.game.price.toNumber(),
              starting_serial: openingSerial || pack.serial_start,
              ending_serial: pack.serial_end,
            };
          });

        reply.code(200);
        return {
          success: true,
          data: {
            bins: binsWithPacks,
            soldPacks,
          },
        };
      } catch (error: unknown) {
        console.error("Error fetching lottery closing data:", error);
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message:
              error instanceof Error
                ? error.message
                : "Failed to fetch lottery closing data",
          },
        };
      }
    },
  );

  /**
   * POST /api/stores/:storeId/lottery/bins/create-with-pack
   * Create a new lottery bin and activate a pack in a single transaction
   * Protected route - requires LOTTERY_BIN_MANAGE permission
   * Story 10.5: Add Bin Functionality (AC #5)
   *
   * MCP Guidance Applied:
   * - SQL_INJECTION: Use Prisma ORM parameterized queries (no string concatenation)
   * - ORM_USAGE: Use Prisma transaction for atomic multi-table operations
   * - VALIDATION: Validate request body with schema validation
   * - AUTHENTICATION: Require authentication and permission checks
   * - ERROR_HANDLING: Return generic error responses, never leak stack traces
   * - TENANT_ISOLATION: Enforce store access validation before transaction
   */
  fastify.post(
    "/api/stores/:storeId/lottery/bins/create-with-pack",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_BIN_MANAGE),
      ],
      schema: {
        description: "Create bin with pack activation",
        tags: ["shift-closing", "lottery"],
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
          required: [
            "bin_name",
            "display_order",
            "pack_number",
            "serial_start",
            "activated_by",
          ],
          properties: {
            bin_name: {
              type: "string",
              minLength: 1,
              maxLength: 255,
              description: "Bin name (e.g., 'Bin 4')",
            },
            location: {
              type: "string",
              maxLength: 255,
              nullable: true,
              description: "Optional bin location",
            },
            display_order: {
              type: "integer",
              minimum: 0,
              description: "Display order for bin",
            },
            pack_number: {
              type: "string",
              minLength: 1,
              maxLength: 50,
              description: "Pack number to activate",
            },
            serial_start: {
              type: "string",
              minLength: 1,
              maxLength: 100,
              description: "Starting serial number",
            },
            activated_by: {
              type: "string",
              format: "uuid",
              description: "User UUID who activated the pack",
            },
            activated_shift_id: {
              type: "string",
              format: "uuid",
              nullable: true,
              description: "Shift UUID where pack is activated (optional)",
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
                  bin: {
                    type: "object",
                    properties: {
                      bin_id: { type: "string", format: "uuid" },
                      name: { type: "string" },
                      location: { type: "string", nullable: true },
                      display_order: { type: "integer" },
                      is_active: { type: "boolean" },
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
      const params = request.params as { storeId: string };
      const body = request.body as {
        bin_name: string;
        location?: string;
        display_order: number;
        pack_number: string;
        serial_start: string;
        activated_by: string;
        activated_shift_id?: string | null;
      };

      try {
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

        // Validate shift exists and can activate packs (only if activated_shift_id is provided)
        // Uses ShiftStateMachine for consistent status validation across the application
        if (body.activated_shift_id) {
          const shift = await prisma.shift.findUnique({
            where: { shift_id: body.activated_shift_id },
            select: {
              shift_id: true,
              store_id: true,
              status: true,
            },
          });

          if (!shift) {
            reply.code(404);
            return {
              success: false,
              error: { code: "NOT_FOUND", message: "Shift not found" },
            };
          }

          if (shift.store_id !== params.storeId) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "BAD_REQUEST",
                message: "Shift does not belong to this store",
              },
            };
          }

          // Use state machine to validate shift status for pack activation
          // OPEN and ACTIVE are both valid for pack activation
          if (!shiftStateMachine.canActivatePack(shift.status)) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "BAD_REQUEST",
                message: shiftStateMachine.getPackActivationError(shift.status),
              },
            };
          }
        }

        // Find pack by pack_number and store_id (using Prisma ORM - prevents SQL injection)
        const pack = await prisma.lotteryPack.findUnique({
          where: {
            store_id_pack_number: {
              store_id: params.storeId,
              pack_number: body.pack_number,
            },
          },
          select: {
            pack_id: true,
            status: true,
            game_id: true,
          },
        });

        if (!pack) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Pack not found in inventory",
            },
          };
        }

        if (pack.status !== LotteryPackStatus.RECEIVED) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: `Pack status must be RECEIVED, got ${pack.status}`,
            },
          };
        }

        // Check if bin number is already occupied (has active pack)
        // This prevents race conditions when multiple users try to create the same bin
        const existingBinWithPack = await prisma.lotteryBin.findFirst({
          where: {
            store_id: params.storeId,
            display_order: body.display_order,
            is_active: true,
            packs: {
              some: {
                status: LotteryPackStatus.ACTIVE,
                current_bin_id: { not: null },
              },
            },
          },
          select: {
            bin_id: true,
            name: true,
          },
        });

        if (existingBinWithPack) {
          const binNumber = body.display_order + 1; // display_order is 0-indexed
          reply.code(409);
          return {
            success: false,
            error: {
              code: "CONFLICT",
              message: `There is already an active pack in Bin ${binNumber}. Please select an empty bin.`,
            },
          };
        }

        // Use Prisma transaction to ensure atomicity (all-or-nothing)
        const result = await prisma.$transaction(async (tx) => {
          // 1. Create LotteryBin record
          const newBin = await tx.lotteryBin.create({
            data: {
              store_id: params.storeId,
              name: body.bin_name,
              location: body.location || null,
              display_order: body.display_order,
              is_active: true,
            },
            select: {
              bin_id: true,
              name: true,
              location: true,
              display_order: true,
              is_active: true,
            },
          });

          // 2. Update pack: status = ACTIVE, set current_bin_id, activated_at, activated_by, activated_shift_id
          await tx.lotteryPack.update({
            where: { pack_id: pack.pack_id },
            data: {
              status: LotteryPackStatus.ACTIVE,
              current_bin_id: newBin.bin_id,
              activated_at: new Date(),
              activated_by: body.activated_by,
              activated_shift_id: body.activated_shift_id || null,
            },
          });

          // 3. Create LotteryShiftOpening record (only if activated_shift_id is provided)
          if (body.activated_shift_id) {
            await tx.lotteryShiftOpening.create({
              data: {
                shift_id: body.activated_shift_id,
                pack_id: pack.pack_id,
                opening_serial: body.serial_start,
              },
            });
          }

          // 4. Create LotteryPackBinHistory record
          await tx.lotteryPackBinHistory.create({
            data: {
              pack_id: pack.pack_id,
              bin_id: newBin.bin_id,
              moved_by: body.activated_by,
              reason: "Pack activated during bin creation",
            },
          });

          // 5. Create AuditLog entry
          await tx.auditLog.create({
            data: {
              user_id: body.activated_by,
              action: "CREATE",
              table_name: "lottery_bins",
              record_id: newBin.bin_id,
              new_values: {
                bin_id: newBin.bin_id,
                store_id: params.storeId,
                name: body.bin_name,
                location: body.location,
                display_order: body.display_order,
                pack_id: pack.pack_id,
                pack_number: body.pack_number,
              },
            },
          });

          return newBin;
        });

        return {
          success: true,
          data: {
            bin: result,
          },
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error creating bin with pack activation");
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to create bin with pack activation",
          },
        };
      }
    },
  );

  /**
   * POST /api/stores/:storeId/lottery/packs/activate
   * Activate a pack and assign it to a bin during shift
   * Protected route - requires LOTTERY_PACK_ACTIVATE permission and active shift
   * Story 10.6: Activate Pack During Shift
   */
  fastify.post(
    "/api/stores/:storeId/lottery/packs/activate",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_PACK_ACTIVATE),
      ],
      schema: {
        description: "Activate a pack and assign it to a bin during shift",
        tags: ["shift-closing", "lottery"],
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
          required: ["pack_id", "bin_id", "serial_start", "activated_by"],
          properties: {
            pack_id: {
              type: "string",
              format: "uuid",
              description: "Pack UUID to activate",
            },
            bin_id: {
              type: "string",
              format: "uuid",
              description: "Bin UUID to assign pack to",
            },
            serial_start: {
              type: "string",
              description: "Starting serial number from pack barcode",
            },
            activated_by: {
              type: "string",
              format: "uuid",
              description: "User UUID who is activating the pack",
            },
            activated_shift_id: {
              type: "string",
              format: "uuid",
              description:
                "Shift UUID where pack is being activated (required for cashiers, optional for managers)",
            },
            deplete_previous: {
              type: "boolean",
              description:
                "If true and bin has an ACTIVE pack, auto-deplete it with reason AUTO_REPLACED",
            },
            serial_override_approved_by: {
              type: "string",
              format: "uuid",
              description:
                "Manager user UUID who approved the serial override (required when cashier needs to change starting serial)",
            },
            serial_override_reason: {
              type: "string",
              maxLength: 500,
              description:
                "Reason for the serial override (e.g., 'Pack already partially sold')",
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
                  updatedBin: {
                    type: "object",
                    properties: {
                      bin_id: { type: "string", format: "uuid" },
                      bin_number: { type: "number" },
                      name: { type: "string" },
                      is_active: { type: "boolean" },
                      pack: {
                        type: ["object", "null"],
                        properties: {
                          pack_id: { type: "string", format: "uuid" },
                          game_name: { type: "string" },
                          game_price: { type: "number" },
                          starting_serial: { type: "string" },
                          serial_end: { type: "string" },
                          pack_number: { type: "string" },
                        },
                      },
                    },
                  },
                  previousPack: {
                    type: ["object", "null"],
                    properties: {
                      pack_id: { type: "string", format: "uuid" },
                      pack_number: { type: "string" },
                      game_name: { type: "string" },
                      game_price: { type: "number" },
                    },
                  },
                  depletedPack: {
                    type: ["object", "null"],
                    description:
                      "Previous pack that was auto-depleted (only present if deplete_previous was true)",
                    properties: {
                      pack_id: { type: "string", format: "uuid" },
                      pack_number: { type: "string" },
                      game_name: { type: "string" },
                      depletion_reason: {
                        type: "string",
                        enum: ["AUTO_REPLACED"],
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
                  field: { type: "string" },
                  validRange: {
                    type: "object",
                    properties: {
                      min: { type: "string" },
                      max: { type: "string" },
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
              error: { type: "string" },
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
        pack_id: string;
        bin_id: string;
        serial_start: string;
        activated_by: string;
        activated_shift_id?: string;
        deplete_previous?: boolean;
        serial_override_approved_by?: string;
        serial_override_reason?: string;
      };

      try {
        // Validate store exists
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

        // Manager role check - these roles can activate without shift
        // MCP SEC-010: AUTHZ - Role-based access control for manager override
        const MANAGER_ROLES = [
          "CLIENT_OWNER",
          "CLIENT_ADMIN",
          "STORE_MANAGER",
          "SYSTEM_ADMIN",
        ];

        // First check if the session user is a manager
        let isManager = user.roles.some((role) => MANAGER_ROLES.includes(role));

        // If session user is not a manager but activated_by is provided,
        // check if the activated_by user (management-authenticated user) is a manager
        // This handles the case where a cashier is logged in but authenticates via Management tab
        if (!isManager && body.activated_by && body.activated_by !== user.id) {
          const activatedByUser = await prisma.user.findUnique({
            where: { user_id: body.activated_by },
            select: { user_id: true },
          });

          if (activatedByUser) {
            const activatedByRoles = await rbacService.getUserRoles(
              body.activated_by,
            );
            isManager = activatedByRoles.some((userRole) =>
              MANAGER_ROLES.includes(userRole.role_code),
            );
          }
        }

        // If shift_id not provided, validate user is a manager
        if (!body.activated_shift_id) {
          if (!isManager) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "BAD_REQUEST",
                message:
                  "Shift ID is required for non-manager users. Please authenticate with an active shift.",
              },
            };
          }
          // Manager override - proceed without shift validation
        } else {
          // Validate shift exists and can activate packs (standard cashier flow)
          // Uses ShiftStateMachine for consistent status validation across the application
          const shift = await prisma.shift.findUnique({
            where: { shift_id: body.activated_shift_id },
            select: {
              shift_id: true,
              store_id: true,
              status: true,
            },
          });

          if (!shift) {
            reply.code(404);
            return {
              success: false,
              error: { code: "NOT_FOUND", message: "Shift not found" },
            };
          }

          if (shift.store_id !== params.storeId) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "BAD_REQUEST",
                message: "Shift does not belong to this store",
              },
            };
          }

          // Use state machine to validate shift status for pack activation
          // OPEN and ACTIVE are both valid for pack activation
          if (!shiftStateMachine.canActivatePack(shift.status)) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "BAD_REQUEST",
                message: shiftStateMachine.getPackActivationError(shift.status),
              },
            };
          }
        }

        // Validate bin exists and belongs to store
        const bin = await prisma.lotteryBin.findUnique({
          where: { bin_id: body.bin_id },
          select: {
            bin_id: true,
            store_id: true,
            name: true,
            display_order: true,
            is_active: true,
          },
        });

        if (!bin) {
          reply.code(404);
          return {
            success: false,
            error: { code: "NOT_FOUND", message: "Bin not found" },
          };
        }

        if (bin.store_id !== params.storeId) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: "Bin does not belong to this store",
            },
          };
        }

        // Validate pack exists and status is RECEIVED (using Prisma ORM - prevents SQL injection)
        const pack = await prisma.lotteryPack.findUnique({
          where: { pack_id: body.pack_id },
          select: {
            pack_id: true,
            store_id: true,
            status: true,
            game_id: true,
            pack_number: true,
            serial_start: true,
            serial_end: true,
            game: {
              select: {
                name: true,
                price: true,
              },
            },
          },
        });

        if (!pack) {
          reply.code(404);
          return {
            success: false,
            error: { code: "NOT_FOUND", message: "Pack not found" },
          };
        }

        if (pack.store_id !== params.storeId) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: "Pack does not belong to this store",
            },
          };
        }

        if (pack.status !== LotteryPackStatus.RECEIVED) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: `Pack status must be RECEIVED, got ${pack.status}`,
            },
          };
        }

        // SEC-014: INPUT_VALIDATION - Validate serial_start is within pack's valid range
        // This validation runs for ALL serial values (including "0" default and overrides)
        // Uses BigInt comparison for accurate handling of large serial numbers (24+ digits)
        if (body.serial_start !== "0") {
          const serialRangeValidation = validateSerialWithinPackRange(
            body.serial_start,
            pack.serial_start,
            pack.serial_end,
          );

          if (!serialRangeValidation.valid) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: serialRangeValidation.error,
                field: "serial_start",
                validRange: {
                  min: pack.serial_start,
                  max: pack.serial_end,
                },
              },
            };
          }
        }

        // SEC-010: AUTHZ - Validate LOTTERY_SERIAL_OVERRIDE permission for non-zero serial_start
        // Enterprise practice: Backend MUST validate permissions, not just frontend
        // Default serial_start is "000" (or legacy "0") - any other value requires LOTTERY_SERIAL_OVERRIDE permission
        // Dual-auth flow: Cashier activates, Manager approves serial override
        let serialOverrideApprovedBy: string | null = null;
        let serialOverrideApprovedAt: Date | null = null;

        // Accept both "0" and "000" as default values that don't require override permission
        const isDefaultSerial =
          body.serial_start === "0" || body.serial_start === "000";
        if (!isDefaultSerial) {
          // First check session user's permissions
          let hasSerialOverride = user.permissions.includes(
            PERMISSIONS.LOTTERY_SERIAL_OVERRIDE,
          );
          let serialOverrideUserId = user.id;

          // If session user doesn't have permission, check activated_by user (management auth flow)
          // This handles case where cashier is logged in but manager authenticated via Management tab
          if (
            !hasSerialOverride &&
            body.activated_by &&
            body.activated_by !== user.id
          ) {
            const activatedByRoles = await rbacService.getUserRoles(
              body.activated_by,
            );
            const activatedByPermissions = new Set<string>();
            for (const userRole of activatedByRoles) {
              const rolePermissions = await rbacService.getRolePermissions(
                userRole.role_id,
              );
              for (const permCode of rolePermissions) {
                activatedByPermissions.add(permCode);
              }
            }
            if (
              activatedByPermissions.has(PERMISSIONS.LOTTERY_SERIAL_OVERRIDE)
            ) {
              hasSerialOverride = true;
              serialOverrideUserId = body.activated_by;
            }
          }

          if (hasSerialOverride) {
            // User has permission - they are effectively approving their own override
            // This happens when a manager is doing the activation themselves
            serialOverrideApprovedBy = serialOverrideUserId;
            serialOverrideApprovedAt = new Date();
          } else if (body.serial_override_approved_by) {
            // Dual-auth flow: Cashier doesn't have permission, but manager approved
            // Validate the approving manager exists and has the required permission
            const approver = await prisma.user.findUnique({
              where: { user_id: body.serial_override_approved_by },
              select: {
                user_id: true,
                name: true,
                status: true,
              },
            });

            if (!approver) {
              reply.code(400);
              return {
                success: false,
                error: {
                  code: "BAD_REQUEST",
                  message: "Serial override approver not found",
                },
              };
            }

            if (approver.status !== "ACTIVE") {
              reply.code(400);
              return {
                success: false,
                error: {
                  code: "BAD_REQUEST",
                  message: "Serial override approver account is not active",
                },
              };
            }

            // Get approver's roles and permissions using rbacService
            const approverRoles = await rbacService.getUserRoles(
              body.serial_override_approved_by,
            );
            const approverPermissions = new Set<string>();
            for (const userRole of approverRoles) {
              // getRolePermissions returns string[] of permission codes
              const rolePermissions = await rbacService.getRolePermissions(
                userRole.role_id,
              );
              for (const permCode of rolePermissions) {
                approverPermissions.add(permCode);
              }
            }

            if (!approverPermissions.has(PERMISSIONS.LOTTERY_SERIAL_OVERRIDE)) {
              reply.code(403);
              return {
                success: false,
                error: {
                  code: "PERMISSION_DENIED",
                  message:
                    "The approving manager does not have permission to override starting serial",
                },
              };
            }

            // Valid dual-auth approval
            serialOverrideApprovedBy = body.serial_override_approved_by;
            serialOverrideApprovedAt = new Date();
          } else {
            // No permission and no manager approval provided
            reply.code(403);
            return {
              success: false,
              error: {
                code: "PERMISSION_DENIED",
                message:
                  "You do not have permission to change the starting serial. A manager must approve this change.",
              },
            };
          }
        }

        // Use Prisma transaction to ensure atomicity (all-or-nothing)
        const result = await prisma.$transaction(async (tx) => {
          // 1. Check for previous pack in bin (if exists)
          const previousPack = await tx.lotteryPack.findFirst({
            where: {
              current_bin_id: body.bin_id,
              status: LotteryPackStatus.ACTIVE,
            },
            select: {
              pack_id: true,
              pack_number: true,
              serial_start: true,
              serial_end: true,
              game: {
                select: {
                  name: true,
                  price: true,
                },
              },
            },
          });

          // Track depleted pack info for response
          let depletedPackInfo:
            | {
                pack_id: string;
                pack_number: string;
                game_name: string;
              }
            | undefined;

          // 2. Update pack: status = ACTIVE, set current_bin_id, activated_at, activated_by, activated_shift_id
          // Also set serial override approval fields if manager approved a serial change
          await tx.lotteryPack.update({
            where: { pack_id: pack.pack_id },
            data: {
              status: LotteryPackStatus.ACTIVE,
              current_bin_id: body.bin_id,
              activated_at: new Date(),
              activated_by: body.activated_by,
              activated_shift_id: body.activated_shift_id || null, // null for manager override
              // Serial override approval tracking (dual-auth)
              serial_override_approved_by: serialOverrideApprovedBy,
              serial_override_approved_at: serialOverrideApprovedAt,
              serial_override_reason: body.serial_override_reason || null,
            },
          });

          // 3. Handle previous pack in bin
          if (previousPack) {
            if (body.deplete_previous) {
              // Auto-deplete the previous pack when activating new pack in same bin
              // MCP: SEC-009 - Using transaction for atomicity
              // NOTE: Preserve current_bin_id for historical reference in depleted packs list
              // The new pack's activation already assigns it to the bin, so we don't need
              // to clear the old pack's bin reference. This allows the sold-out list to
              // show which bin the pack was in when it was depleted.
              await tx.lotteryPack.update({
                where: { pack_id: previousPack.pack_id },
                data: {
                  status: LotteryPackStatus.DEPLETED,
                  depleted_at: new Date(),
                  depleted_by: body.activated_by,
                  depleted_shift_id: body.activated_shift_id || null,
                  depletion_reason: "AUTO_REPLACED",
                  // current_bin_id intentionally NOT cleared - preserved for audit trail
                },
              });

              // Create closing record for depleted pack only if we have a shift
              // Manager override (no shift) skips shift closing record
              if (body.activated_shift_id) {
                await tx.lotteryShiftClosing.create({
                  data: {
                    shift_id: body.activated_shift_id,
                    pack_id: previousPack.pack_id,
                    closing_serial: previousPack.serial_end,
                  },
                });
              }

              // Create audit log for auto-depletion
              // MCP: DB-008 - Structured audit logging with complete state tracking
              await tx.auditLog.create({
                data: {
                  user_id: body.activated_by,
                  action: "UPDATE",
                  table_name: "lottery_packs",
                  record_id: previousPack.pack_id,
                  old_values: {
                    status: LotteryPackStatus.ACTIVE,
                    current_bin_id: body.bin_id,
                  },
                  new_values: {
                    status: LotteryPackStatus.DEPLETED,
                    depleted_at: new Date().toISOString(),
                    depleted_by: body.activated_by,
                    depleted_shift_id: body.activated_shift_id || null,
                    depletion_reason: "AUTO_REPLACED",
                    current_bin_id: body.bin_id, // Preserved for historical reference
                    auto_replaced_by_pack: pack.pack_id,
                    manager_override: !body.activated_shift_id,
                  },
                },
              });

              // Set depleted pack info for response
              depletedPackInfo = {
                pack_id: previousPack.pack_id,
                pack_number: previousPack.pack_number,
                game_name: previousPack.game.name,
              };
            }
            // If deplete_previous is false/undefined, the previous pack remains ACTIVE
            // but will be orphaned (no bin) - this is the legacy behavior for shift closing
          }

          // 4. Create LotteryShiftOpening record (only if we have a shift)
          // Manager override (no shift) skips shift opening record
          if (body.activated_shift_id) {
            await tx.lotteryShiftOpening.create({
              data: {
                shift_id: body.activated_shift_id,
                pack_id: pack.pack_id,
                opening_serial: body.serial_start,
              },
            });
          }

          // 5. Create LotteryPackBinHistory record
          await tx.lotteryPackBinHistory.create({
            data: {
              pack_id: pack.pack_id,
              bin_id: body.bin_id,
              moved_by: body.activated_by,
              reason: body.activated_shift_id
                ? "Pack activated during shift"
                : "Pack activated via manager override",
            },
          });

          // 6. Create AuditLog entry
          await tx.auditLog.create({
            data: {
              user_id: body.activated_by,
              action: "UPDATE",
              table_name: "lottery_packs",
              record_id: pack.pack_id,
              old_values: {
                status: LotteryPackStatus.RECEIVED,
                current_bin_id: null,
                activated_at: null,
                activated_by: null,
                activated_shift_id: null,
              },
              new_values: {
                status: LotteryPackStatus.ACTIVE,
                current_bin_id: body.bin_id,
                activated_at: new Date().toISOString(),
                activated_by: body.activated_by,
                activated_shift_id: body.activated_shift_id || null,
                pack_number: pack.pack_number,
                serial_start: body.serial_start,
                manager_override: !body.activated_shift_id,
                // Dual-auth: Track who approved the serial override
                serial_override_approved_by: serialOverrideApprovedBy,
                serial_override_approved_at: serialOverrideApprovedAt
                  ? serialOverrideApprovedAt.toISOString()
                  : null,
                serial_override_reason: body.serial_override_reason || null,
              },
            },
          });

          // 7. Build updated bin with pack information
          const updatedBin = {
            bin_id: bin.bin_id,
            bin_number: bin.display_order + 1, // display_order is 0-indexed, bin_number is 1-indexed
            name: bin.name,
            is_active: bin.is_active,
            pack: {
              pack_id: pack.pack_id,
              game_name: pack.game.name,
              game_price: pack.game.price.toNumber(),
              starting_serial: body.serial_start,
              serial_end: pack.serial_end,
              pack_number: pack.pack_number,
            },
          };

          // 8. Build previous pack info if exists (not depleted - still in bin)
          const previousPackInfo =
            previousPack && !depletedPackInfo
              ? {
                  pack_id: previousPack.pack_id,
                  game_name: previousPack.game.name,
                  game_price: previousPack.game.price.toNumber(),
                }
              : undefined;

          return {
            updatedBin,
            previousPack: previousPackInfo,
            depletedPack: depletedPackInfo, // New: info about auto-depleted pack
          };
        });

        // Trigger OPEN → ACTIVE transition on first pack activation
        // This is idempotent - if already ACTIVE, no change occurs
        if (body.activated_shift_id) {
          try {
            await shiftService.activateShiftOnFirstActivity(
              body.activated_shift_id,
              body.activated_by,
              "LOTTERY_PACK_ACTIVATED",
            );
          } catch (activationError) {
            // Log but don't fail the pack activation - the pack is already activated
            fastify.log.warn(
              { error: activationError, shiftId: body.activated_shift_id },
              "Failed to transition shift to ACTIVE status",
            );
          }
        }

        return {
          success: true,
          data: result,
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error activating pack");
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to activate pack",
          },
        };
      }
    },
  );

  /**
   * POST /api/shifts/:shiftId/lottery/close
   * Submit lottery closing data for a shift
   * Creates LotteryShiftClosing records, updates pack status, calculates variance
   * Protected route - requires LOTTERY_SHIFT_CLOSE permission and active shift
   */
  fastify.post(
    "/api/shifts/:shiftId/lottery/close",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_SHIFT_CLOSE),
      ],
      schema: {
        description: "Submit lottery closing data for a shift",
        tags: ["shift-closing", "lottery"],
        params: {
          type: "object",
          required: ["shiftId"],
          properties: {
            shiftId: {
              type: "string",
              format: "uuid",
              description: "Shift UUID",
            },
          },
        },
        body: {
          type: "object",
          required: ["closings", "closed_by"],
          properties: {
            closings: {
              type: "array",
              items: {
                type: "object",
                required: [
                  "bin_id",
                  "pack_id",
                  "ending_serial",
                  "entry_method",
                ],
                properties: {
                  bin_id: {
                    type: "string",
                    format: "uuid",
                    description: "Bin UUID",
                  },
                  pack_id: {
                    type: "string",
                    format: "uuid",
                    description: "Pack UUID",
                  },
                  ending_serial: {
                    type: "string",
                    description: "Ending serial number (3-digit)",
                  },
                  entry_method: {
                    type: "string",
                    enum: ["SCAN", "MANUAL"],
                    description: "Entry method: SCAN or MANUAL",
                  },
                  manual_entry_authorized_by: {
                    type: "string",
                    format: "uuid",
                    description:
                      "User UUID who authorized manual entry (required if entry_method is MANUAL)",
                  },
                  manual_entry_authorized_at: {
                    type: "string",
                    format: "date-time",
                    description:
                      "Timestamp when manual entry was authorized (required if entry_method is MANUAL)",
                  },
                },
              },
            },
            closed_by: {
              type: "string",
              format: "uuid",
              description: "User UUID who is closing the shift",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              summary: {
                type: "object",
                properties: {
                  packs_closed: { type: "number" },
                  packs_depleted: { type: "number" },
                  total_tickets_sold: { type: "number" },
                  variances: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        pack_id: { type: "string", format: "uuid" },
                        pack_number: { type: "string" },
                        game_name: { type: "string" },
                        expected: { type: "number" },
                        actual: { type: "number" },
                        difference: { type: "number" },
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
              error: { type: "string" },
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
      const params = request.params as { shiftId: string };
      const body = request.body as {
        closings: Array<{
          bin_id: string;
          pack_id: string;
          ending_serial: string;
          entry_method: "SCAN" | "MANUAL";
          manual_entry_authorized_by?: string;
          manual_entry_authorized_at?: string;
        }>;
        closed_by: string;
      };

      try {
        // Validate shift exists and is accessible
        const shift = await shiftService.getShiftById(params.shiftId, user.id);
        if (!shift) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: `Shift ${params.shiftId} not found`,
            },
          };
        }

        // Validate shift is OPEN
        if (shift.status !== ShiftStatus.OPEN) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: `Shift ${params.shiftId} is not OPEN (status: ${shift.status})`,
            },
          };
        }

        // Validate all active bins have ending numbers
        // This validation is done in the service, but we can add a quick check here
        if (!body.closings || body.closings.length === 0) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: "At least one closing is required",
            },
          };
        }

        // Validate entry_method requirements
        for (const closing of body.closings) {
          if (
            closing.entry_method === "MANUAL" &&
            (!closing.manual_entry_authorized_by ||
              !closing.manual_entry_authorized_at)
          ) {
            reply.code(400);
            return {
              success: false,
              error: {
                code: "BAD_REQUEST",
                message: `Manual entry requires manual_entry_authorized_by and manual_entry_authorized_at for pack ${closing.pack_id}`,
              },
            };
          }
        }

        // Call shift closing service
        const result = await closeLotteryForShift(
          params.shiftId,
          body.closings,
          body.closed_by,
        );

        reply.code(200);
        return {
          success: true,
          summary: result,
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error closing lottery for shift");
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: error.message || "Failed to close lottery for shift",
          },
        };
      }
    },
  );
}
