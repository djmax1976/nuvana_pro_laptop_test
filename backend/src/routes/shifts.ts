/**
 * Shift Routes
 *
 * API endpoints for shift operations.
 * Story 4.2: Shift Opening API
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { permissionMiddleware } from "../middleware/permission.middleware";
import { PERMISSIONS } from "../constants/permissions";
import {
  shiftService,
  ShiftServiceError,
  ShiftErrorCode,
  AuditContext,
} from "../services/shift.service";
import { validateOpenShiftInput } from "../schemas/shift.schema";
import { ZodError } from "zod";

/**
 * Get audit context from request
 * @param request - Fastify request
 * @param user - User identity
 * @returns Audit context
 */
function getAuditContext(
  request: FastifyRequest,
  user: UserIdentity,
): AuditContext {
  const ipAddress =
    (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
    request.ip ||
    request.socket.remoteAddress ||
    null;
  const userAgent = request.headers["user-agent"] || null;

  return {
    userId: user.id,
    userEmail: user.email,
    userRoles: user.roles || [],
    ipAddress,
    userAgent,
  };
}

/**
 * Shift routes
 * Provides POST /api/shifts/open endpoint for opening shifts
 */
export async function shiftRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/shifts/open
   * Open a new shift with starting cash amount
   * Protected route - requires SHIFT_OPEN permission
   */
  fastify.post(
    "/api/shifts/open",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.SHIFT_OPEN),
      ],
      schema: {
        description: "Open a new shift with starting cash amount",
        tags: ["shifts"],
        body: {
          type: "object",
          required: [
            "store_id",
            "cashier_id",
            "pos_terminal_id",
            "opening_cash",
          ],
          properties: {
            store_id: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
            cashier_id: {
              type: "string",
              format: "uuid",
              description: "Cashier UUID",
            },
            pos_terminal_id: {
              type: "string",
              format: "uuid",
              description: "POS Terminal UUID",
            },
            opening_cash: {
              type: "number",
              minimum: 0,
              description: "Opening cash amount (non-negative)",
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
                  shift_id: { type: "string", format: "uuid" },
                  store_id: { type: "string", format: "uuid" },
                  opened_by: { type: "string", format: "uuid" },
                  cashier_id: { type: "string", format: "uuid" },
                  pos_terminal_id: {
                    type: "string",
                    format: "uuid",
                    nullable: true,
                  },
                  opened_at: { type: "string", format: "date-time" },
                  opening_cash: { type: "number" },
                  status: { type: "string", enum: ["OPEN"] },
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
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;

        // Validate request body using Zod schema
        const validatedData = validateOpenShiftInput(request.body);

        // Get audit context
        const auditContext = getAuditContext(request, user);

        // Open shift using service layer
        const shift = await shiftService.openShift(validatedData, auditContext);

        // Return success response with created shift
        return reply.code(201).send({
          success: true,
          data: {
            shift_id: shift.shift_id,
            store_id: shift.store_id,
            opened_by: shift.opened_by,
            cashier_id: shift.cashier_id,
            pos_terminal_id: shift.pos_terminal_id,
            opened_at: shift.opened_at.toISOString(),
            opening_cash: Number(shift.opening_cash),
            status: shift.status,
          },
        });
      } catch (error) {
        // Handle Zod validation errors
        if (error instanceof ZodError) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid request data",
              details: error.issues.map((issue) => ({
                field: issue.path.join("."),
                message: issue.message,
              })),
            },
          });
        }

        // Handle ShiftServiceError
        if (error instanceof ShiftServiceError) {
          const statusCode =
            error.code === ShiftErrorCode.SHIFT_ALREADY_ACTIVE ? 409 : 400;

          return reply.code(statusCode).send({
            success: false,
            error: {
              code: error.code,
              message: error.message,
              details: error.details,
            },
          });
        }

        // Handle unexpected errors
        fastify.log.error({ error }, "Unexpected error in shift opening");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "An unexpected error occurred",
          },
        });
      }
    },
  );

  /**
   * POST /api/shifts/:shiftId/close
   * Initiate shift closing
   * Protected route - requires SHIFT_CLOSE permission
   */
  fastify.post(
    "/api/shifts/:shiftId/close",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.SHIFT_CLOSE),
      ],
      schema: {
        description: "Initiate shift closing",
        tags: ["shifts"],
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
                  shift_id: { type: "string", format: "uuid" },
                  status: { type: "string", enum: ["CLOSING"] },
                  closing_initiated_at: { type: "string", format: "date-time" },
                  closing_initiated_by: { type: "string", format: "uuid" },
                  expected_cash: { type: "number" },
                  opening_cash: { type: "number" },
                  cash_transactions_total: { type: "number" },
                  calculated_at: { type: "string", format: "date-time" },
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
                  details: { type: "object" },
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
        const params = request.params as { shiftId: string };

        // shiftId is already validated by Fastify schema (UUID format)
        const shiftId = params.shiftId;

        // Get audit context
        const auditContext = getAuditContext(request, user);

        // Initiate shift closing using service layer
        const result = await shiftService.initiateClosing(
          shiftId,
          auditContext,
        );

        // Return success response
        return reply.code(200).send({
          success: true,
          data: {
            shift_id: result.shift_id,
            status: result.status,
            closing_initiated_at: result.closing_initiated_at.toISOString(),
            closing_initiated_by: result.closing_initiated_by,
            expected_cash: result.expected_cash,
            opening_cash: result.opening_cash,
            cash_transactions_total: result.cash_transactions_total,
            calculated_at: result.calculated_at.toISOString(),
          },
        });
      } catch (error) {
        // Handle Zod validation errors
        if (error instanceof ZodError) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid request data",
              details: error.issues.map((issue) => ({
                field: issue.path.join("."),
                message: issue.message,
              })),
            },
          });
        }

        // Handle ShiftServiceError
        if (error instanceof ShiftServiceError) {
          let statusCode = 400;
          if (error.code === ShiftErrorCode.SHIFT_NOT_FOUND) {
            statusCode = 404;
          } else if (
            error.code === ShiftErrorCode.SHIFT_ALREADY_CLOSING ||
            error.code === ShiftErrorCode.SHIFT_ALREADY_CLOSED
          ) {
            statusCode = 409;
          }

          return reply.code(statusCode).send({
            success: false,
            error: {
              code: error.code,
              message: error.message,
              details: error.details,
            },
          });
        }

        // Handle unexpected errors
        fastify.log.error({ error }, "Unexpected error in shift closing");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "An unexpected error occurred",
          },
        });
      }
    },
  );
}
