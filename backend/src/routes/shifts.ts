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
import { reportService } from "../services/report.service";
import {
  validateOpenShiftInput,
  validateReconcileCashInput,
  validateApproveVarianceInput,
  validateShiftId,
  validateShiftQueryInput,
} from "../schemas/shift.schema";
import { ZodError } from "zod";
import { ShiftStatus } from "@prisma/client";
import { prisma } from "../utils/db";

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
          required: ["store_id", "pos_terminal_id", "opening_cash"],
          properties: {
            store_id: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
            cashier_id: {
              type: "string",
              format: "uuid",
              description:
                "Cashier UUID (optional - if not provided, auto-assigned from authenticated user)",
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

        // Story 4.8: Auto-assign cashier_id if not provided (cashier self-service flow)
        // If cashier_id IS provided, use it (backward compatibility for manager flow)
        const isCashierSelfService = !validatedData.cashier_id;
        if (isCashierSelfService) {
          validatedData.cashier_id = user.id;
        }

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
   * GET /api/shifts
   * Query shifts with filters, pagination, and RLS enforcement
   * Protected route - requires SHIFT_READ permission (or appropriate shift permission)
   * Story 4.7: Shift Management UI
   */
  fastify.get(
    "/api/shifts",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.SHIFT_READ),
      ],
      schema: {
        description: "Query shifts with filters and pagination",
        tags: ["shifts"],
        querystring: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: [
                "NOT_STARTED",
                "OPEN",
                "ACTIVE",
                "CLOSING",
                "RECONCILING",
                "CLOSED",
                "VARIANCE_REVIEW",
              ],
              description: "Filter by shift status",
            },
            store_id: {
              type: "string",
              format: "uuid",
              description: "Filter by store UUID",
            },
            from: {
              type: "string",
              format: "date-time",
              description: "Start date (ISO 8601)",
            },
            to: {
              type: "string",
              format: "date-time",
              description: "End date (ISO 8601)",
            },
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 200,
              default: 50,
              description: "Number of results per page (default: 50, max: 200)",
            },
            offset: {
              type: "integer",
              minimum: 0,
              default: 0,
              description: "Pagination offset",
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
                  shifts: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        shift_id: { type: "string", format: "uuid" },
                        store_id: { type: "string", format: "uuid" },
                        opened_by: { type: "string", format: "uuid" },
                        cashier_id: { type: "string", format: "uuid" },
                        pos_terminal_id: { type: "string", format: "uuid" },
                        status: { type: "string" },
                        opening_cash: { type: "number" },
                        closing_cash: { type: "number", nullable: true },
                        expected_cash: { type: "number", nullable: true },
                        variance_amount: { type: "number", nullable: true },
                        variance_percentage: { type: "number", nullable: true },
                        opened_at: { type: "string" },
                        closed_at: { type: "string", nullable: true },
                        store_name: { type: "string" },
                        cashier_name: { type: "string" },
                        opener_name: { type: "string" },
                      },
                    },
                  },
                  meta: {
                    type: "object",
                    properties: {
                      total: { type: "integer" },
                      limit: { type: "integer" },
                      offset: { type: "integer" },
                      has_more: { type: "boolean" },
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
                  details: {
                    type: "array",
                    items: { type: "object" },
                  },
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
        const query = request.query as any;

        // Validate query parameters using Zod schema
        const validatedQuery = validateShiftQueryInput(query);

        // Extract filters and pagination
        const filters = {
          status: validatedQuery.status as ShiftStatus | undefined,
          store_id: validatedQuery.store_id,
          from: validatedQuery.from,
          to: validatedQuery.to,
        };

        const pagination = {
          limit: validatedQuery.limit,
          offset: validatedQuery.offset,
        };

        // Query shifts using service
        const result = await shiftService.getShifts(
          user.id,
          filters,
          pagination,
        );

        return reply.code(200).send({
          success: true,
          data: result,
        });
      } catch (error) {
        // Handle Zod validation errors
        if (error instanceof ZodError) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid query parameters",
              details: error.issues.map((issue) => ({
                field: issue.path.join("."),
                message: issue.message,
              })),
            },
          });
        }

        // Handle unexpected errors
        fastify.log.error({ error }, "Unexpected error in shift query");
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
   * GET /api/shifts/:shiftId
   * Get shift details by ID
   * Protected route - requires SHIFT_READ permission
   * Story 4.7: Shift Management UI
   */
  fastify.get(
    "/api/shifts/:shiftId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.SHIFT_READ),
      ],
      schema: {
        description: "Get shift details by ID",
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
                  store_id: { type: "string", format: "uuid" },
                  opened_by: { type: "string", format: "uuid" },
                  cashier_id: { type: "string", format: "uuid" },
                  pos_terminal_id: { type: "string", format: "uuid" },
                  status: {
                    type: "string",
                    enum: [
                      "NOT_STARTED",
                      "OPEN",
                      "ACTIVE",
                      "CLOSING",
                      "RECONCILING",
                      "CLOSED",
                      "VARIANCE_REVIEW",
                    ],
                  },
                  opening_cash: { type: "number" },
                  closing_cash: { type: "number", nullable: true },
                  expected_cash: { type: "number", nullable: true },
                  variance_amount: { type: "number", nullable: true },
                  variance_percentage: { type: "number", nullable: true },
                  opened_at: { type: "string", format: "date-time" },
                  closed_at: {
                    type: "string",
                    format: "date-time",
                    nullable: true,
                  },
                  store_name: { type: "string", nullable: true },
                  cashier_name: { type: "string", nullable: true },
                  opener_name: { type: "string", nullable: true },
                  transaction_count: { type: "integer" },
                  variance_reason: { type: "string", nullable: true },
                  approved_by: {
                    type: "string",
                    format: "uuid",
                    nullable: true,
                  },
                  approved_by_name: { type: "string", nullable: true },
                  approved_at: {
                    type: "string",
                    format: "date-time",
                    nullable: true,
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
                  details: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        field: { type: "string" },
                        message: { type: "string" },
                      },
                      required: ["field", "message"],
                    },
                  },
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
      try {
        const user = (request as any).user as UserIdentity;
        const params = request.params as { shiftId: string };

        // Validate shiftId using Zod schema
        const shiftId = validateShiftId(params.shiftId);

        // Get shift details using service layer
        const shiftDetail = await shiftService.getShiftById(shiftId, user.id);

        // Return success response
        return reply.code(200).send({
          success: true,
          data: shiftDetail,
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
        fastify.log.error({ error }, "Unexpected error in shift detail query");
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

  /**
   * PUT /api/shifts/:shiftId/reconcile
   * Reconcile cash for a shift in CLOSING status
   * Protected route - requires SHIFT_RECONCILE permission
   */
  fastify.put(
    "/api/shifts/:shiftId/reconcile",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.SHIFT_RECONCILE),
      ],
      schema: {
        description:
          "Reconcile cash for a shift in CLOSING status or approve variance for a shift in VARIANCE_REVIEW status",
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
        body: {
          type: "object",
          properties: {
            closing_cash: {
              type: "number",
              minimum: 0.01,
              description:
                "Actual cash count (required for CLOSING status, not needed for VARIANCE_REVIEW)",
            },
            variance_reason: {
              type: "string",
              description:
                "Reason for variance (required for VARIANCE_REVIEW status, optional for CLOSING)",
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
                  status: {
                    type: "string",
                    enum: ["RECONCILING", "VARIANCE_REVIEW", "CLOSED"],
                  },
                  closing_cash: { type: "number" },
                  expected_cash: { type: "number" },
                  variance_amount: { type: "number" },
                  variance_percentage: { type: "number" },
                  variance_reason: {
                    type: "string",
                    nullable: true,
                  },
                  reconciled_at: {
                    type: "string",
                    format: "date-time",
                    nullable: true,
                  },
                  reconciled_by: {
                    type: "string",
                    format: "uuid",
                    nullable: true,
                  },
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
                  closed_at: {
                    type: "string",
                    format: "date-time",
                    nullable: true,
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
      try {
        const user = (request as any).user as UserIdentity;
        const params = request.params as { shiftId: string };

        // shiftId is already validated by Fastify schema (UUID format)
        const shiftId = params.shiftId;

        // Get shift to check current status
        const shift = await prisma.shift.findUnique({
          where: { shift_id: shiftId },
          select: { status: true },
        });

        if (!shift) {
          return reply.code(404).send({
            success: false,
            error: {
              code: ShiftErrorCode.SHIFT_NOT_FOUND,
              message: `Shift with ID ${shiftId} not found`,
            },
          });
        }

        // Check if shift is locked (CLOSED) - must check before any operations
        if (shift.status === ShiftStatus.CLOSED) {
          return reply.code(400).send({
            success: false,
            error: {
              code: ShiftErrorCode.SHIFT_LOCKED,
              message: "Shift is CLOSED and cannot be modified",
              details: {
                current_status: shift.status,
              },
            },
          });
        }

        // Get audit context
        const auditContext = getAuditContext(request, user);

        // Route based on shift status
        if (shift.status === ShiftStatus.VARIANCE_REVIEW) {
          // Variance approval flow - validate request body
          let validatedData;
          try {
            validatedData = validateApproveVarianceInput(request.body);
          } catch (error) {
            if (error instanceof ZodError) {
              // Check if variance_reason is missing
              const body = request.body as any;
              if (
                !body.variance_reason ||
                body.variance_reason.trim().length === 0
              ) {
                return reply.code(400).send({
                  success: false,
                  error: {
                    code: ShiftErrorCode.VARIANCE_REASON_REQUIRED,
                    message:
                      "variance_reason is required when approving variance",
                  },
                });
              }
              // Other validation errors
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
            throw error;
          }

          const result = await shiftService.approveVariance(
            shiftId,
            validatedData.variance_reason,
            auditContext,
          );

          // Return success response for variance approval
          return reply.code(200).send({
            success: true,
            data: {
              shift_id: result.shift_id,
              status: result.status,
              closing_cash: result.closing_cash,
              expected_cash: result.expected_cash,
              variance_amount: result.variance_amount,
              variance_percentage: result.variance_percentage,
              variance_reason: result.variance_reason,
              approved_by: result.approved_by,
              approved_at: result.approved_at.toISOString(),
              closed_at: result.closed_at.toISOString(),
            },
          });
        } else if (shift.status === ShiftStatus.CLOSING) {
          // Cash reconciliation flow
          const body = request.body as any;

          // If trying to approve (has variance_reason but no closing_cash), return error
          if (body.variance_reason && !body.closing_cash) {
            return reply.code(400).send({
              success: false,
              error: {
                code: ShiftErrorCode.SHIFT_INVALID_STATUS,
                message: `Shift is not in VARIANCE_REVIEW status. Current status: ${shift.status}. Only shifts in VARIANCE_REVIEW status can be approved.`,
                details: {
                  current_status: shift.status,
                  expected_status: ShiftStatus.VARIANCE_REVIEW,
                },
              },
            });
          }

          const validatedData = validateReconcileCashInput(request.body);

          // Validate closing_cash is provided for reconciliation
          if (!validatedData.closing_cash) {
            return reply.code(400).send({
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "closing_cash is required for reconciliation",
              },
            });
          }

          const result = await shiftService.reconcileCash(
            shiftId,
            validatedData.closing_cash,
            validatedData.variance_reason,
            auditContext,
          );

          // Return success response for reconciliation
          return reply.code(200).send({
            success: true,
            data: {
              shift_id: result.shift_id,
              status: result.status,
              closing_cash: result.closing_cash,
              expected_cash: result.expected_cash,
              variance_amount: result.variance_amount,
              variance_percentage: result.variance_percentage,
              variance_reason: result.variance_reason || null,
              reconciled_at: result.reconciled_at.toISOString(),
              reconciled_by: result.reconciled_by,
            },
          });
        } else {
          // Invalid status for this endpoint
          // If trying to approve (has variance_reason but no closing_cash), return SHIFT_NOT_VARIANCE_REVIEW
          const body = request.body as any;
          if (body.variance_reason && !body.closing_cash) {
            return reply.code(400).send({
              success: false,
              error: {
                code: ShiftErrorCode.SHIFT_NOT_VARIANCE_REVIEW,
                message: `Shift is not in VARIANCE_REVIEW status. Current status: ${shift.status}. Only shifts in VARIANCE_REVIEW status can be approved.`,
                details: {
                  current_status: shift.status,
                  expected_status: ShiftStatus.VARIANCE_REVIEW,
                },
              },
            });
          }
          // Otherwise return generic invalid status
          return reply.code(400).send({
            success: false,
            error: {
              code: ShiftErrorCode.SHIFT_INVALID_STATUS,
              message: `Shift is not in CLOSING or VARIANCE_REVIEW status. Current status: ${shift.status}`,
              details: {
                current_status: shift.status,
                expected_statuses: [
                  ShiftStatus.CLOSING,
                  ShiftStatus.VARIANCE_REVIEW,
                ],
              },
            },
          });
        }
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
            error.code === ShiftErrorCode.SHIFT_NOT_CLOSING ||
            error.code === ShiftErrorCode.SHIFT_INVALID_STATUS ||
            error.code === ShiftErrorCode.SHIFT_NOT_VARIANCE_REVIEW ||
            error.code === ShiftErrorCode.SHIFT_LOCKED
          ) {
            statusCode = 400;
          } else if (error.code === ShiftErrorCode.VARIANCE_REASON_REQUIRED) {
            statusCode = 400;
          } else if (error.code === ShiftErrorCode.INVALID_CASH_AMOUNT) {
            statusCode = 400;
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
        fastify.log.error({ error }, "Unexpected error in cash reconciliation");
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
   * GET /api/shifts/:shiftId/report
   * Get shift report for a CLOSED shift
   * Protected route - requires SHIFT_REPORT_VIEW permission
   */
  fastify.get(
    "/api/shifts/:shiftId/report",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.SHIFT_REPORT_VIEW),
      ],
      schema: {
        description: "Get shift report for a CLOSED shift",
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
                description: "Shift report data",
                additionalProperties: true,
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

        // Validate shiftId using Zod schema
        const shiftId = validateShiftId(params.shiftId);

        // Get audit context
        const auditContext = getAuditContext(request, user);

        // Generate shift report using service layer
        // Note: generateShiftReport() will be implemented in Task 2
        const report = await shiftService.generateShiftReport(
          shiftId,
          auditContext.userId,
        );

        // Return success response with report data
        return reply.code(200).send({
          success: true,
          data: report,
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
          } else if (error.code === ShiftErrorCode.SHIFT_NOT_CLOSED) {
            statusCode = 400;
          } else if (error.code === ShiftErrorCode.STORE_NOT_FOUND) {
            statusCode = 404;
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
        fastify.log.error(
          { error },
          "Unexpected error in shift report generation",
        );
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
   * GET /api/shifts/:shiftId/report/export
   * Export shift report as PDF
   * Protected route - requires SHIFT_REPORT_VIEW permission
   */
  fastify.get(
    "/api/shifts/:shiftId/report/export",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.SHIFT_REPORT_VIEW),
      ],
      schema: {
        description: "Export shift report as PDF",
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
        querystring: {
          type: "object",
          properties: {
            format: {
              type: "string",
              enum: ["pdf"],
              default: "pdf",
              description: "Export format (currently only PDF supported)",
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const params = request.params as { shiftId: string };
        const query = request.query as { format?: string };

        // Validate format (currently only PDF supported)
        const format = query.format || "pdf";
        if (format !== "pdf") {
          return reply.code(400).send({
            success: false,
            error: {
              code: "INVALID_FORMAT",
              message: `Unsupported export format: ${format}. Only 'pdf' is supported.`,
            },
          });
        }

        // Validate shiftId using Zod schema
        const shiftId = validateShiftId(params.shiftId);

        // Get audit context
        const auditContext = getAuditContext(request, user);

        // Generate shift report data
        const reportData = await shiftService.generateShiftReport(
          shiftId,
          auditContext.userId,
        );

        // Generate PDF from report data
        const pdfBuffer =
          await reportService.generateShiftReportPDF(reportData);

        // Return PDF file with appropriate headers
        reply
          .code(200)
          .header("Content-Type", "application/pdf")
          .header(
            "Content-Disposition",
            `attachment; filename="shift-report-${shiftId}.pdf"`,
          )
          .send(pdfBuffer);
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
          } else if (error.code === ShiftErrorCode.SHIFT_NOT_CLOSED) {
            statusCode = 400;
          } else if (error.code === ShiftErrorCode.STORE_NOT_FOUND) {
            statusCode = 404;
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
        fastify.log.error(
          { error },
          "Unexpected error in shift report PDF export",
        );
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
