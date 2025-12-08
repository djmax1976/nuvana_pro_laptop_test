/**
 * Shift Routes
 *
 * API endpoints for shift operations.
 * Story 4.2: Shift Opening API
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import {
  permissionMiddleware,
  requireAnyPermission,
} from "../middleware/permission.middleware";
import {
  cashierSessionWithPermission,
  validateTerminalMatch,
  RequestWithCashierSession,
} from "../middleware/cashier-session.middleware";
import { cashierSessionService } from "../services/cashier-session.service";
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
  validateUpdateStartingCashInput,
  validateShiftLotteryOpeningInput,
  validateShiftLotteryClosingInput,
} from "../schemas/shift.schema";
import { rbacService } from "../services/rbac.service";
import {
  calculateExpectedCount,
  detectVariance,
} from "../services/lottery.service";
import { ZodError } from "zod";
import { ShiftStatus, LotteryPackStatus } from "@prisma/client";
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
 * Compare two serial numbers with proper handling for numeric and alphanumeric serials.
 * For pure-numeric serials, compares numerically using BigInt to avoid string comparison issues.
 * For alphanumeric serials, performs natural ordering by splitting into numeric and non-numeric segments.
 *
 * @param serialA - First serial to compare
 * @param serialB - Second serial to compare
 * @returns Negative number if serialA < serialB, 0 if equal, positive if serialA > serialB
 */
function compareSerials(serialA: string, serialB: string): number {
  // Check if both serials are pure numeric (only digits, optionally with leading zeros)
  const isNumericA = /^\d+$/.test(serialA);
  const isNumericB = /^\d+$/.test(serialB);

  // If both are numeric, compare as BigInt to handle large numbers correctly
  if (isNumericA && isNumericB) {
    try {
      const a = BigInt(serialA);
      const b = BigInt(serialB);
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    } catch {
      // Fallback to string comparison if BigInt parsing fails
      return serialA.localeCompare(serialB, undefined, { numeric: true });
    }
  }

  // For alphanumeric serials, perform natural ordering
  // Split into segments: numeric segments and non-numeric segments
  const segmentsA = splitSerialSegments(serialA);
  const segmentsB = splitSerialSegments(serialB);

  const maxLength = Math.max(segmentsA.length, segmentsB.length);
  for (let i = 0; i < maxLength; i++) {
    // eslint-disable-next-line security/detect-object-injection -- Safe: bounded loop with array length
    const segA = segmentsA[i];
    // eslint-disable-next-line security/detect-object-injection -- Safe: bounded loop with array length
    const segB = segmentsB[i];

    // If one serial has fewer segments, it comes first
    if (segA === undefined) return -1;
    if (segB === undefined) return 1;

    // Determine if segments are numeric
    const isNumericSegA = /^\d+$/.test(segA);
    const isNumericSegB = /^\d+$/.test(segB);

    // If both segments are numeric, compare numerically
    if (isNumericSegA && isNumericSegB) {
      try {
        const a = BigInt(segA);
        const b = BigInt(segB);
        if (a < b) return -1;
        if (a > b) return 1;
        // Continue to next segment if equal
      } catch {
        // Fallback to string comparison
        const cmp = segA.localeCompare(segB, undefined, { numeric: true });
        if (cmp !== 0) return cmp;
      }
    } else {
      // At least one is non-numeric, compare lexicographically
      const cmp = segA.localeCompare(segB);
      if (cmp !== 0) return cmp;
    }
  }

  // All segments are equal
  return 0;
}

/**
 * Split a serial string into alternating numeric and non-numeric segments.
 * Example: "ABC123XYZ456" -> ["ABC", "123", "XYZ", "456"]
 *
 * @param serial - Serial string to split
 * @returns Array of segments
 */
function splitSerialSegments(serial: string): string[] {
  const segments: string[] = [];
  let currentSegment = "";
  let isNumeric = false;

  for (let i = 0; i < serial.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- Safe: bounded loop with string length
    const char = serial[i];
    const charIsNumeric = /^\d$/.test(char);

    if (i === 0) {
      // First character determines initial segment type
      isNumeric = charIsNumeric;
      currentSegment = char;
    } else if (charIsNumeric === isNumeric) {
      // Same type as current segment, append
      currentSegment += char;
    } else {
      // Type changed, save current segment and start new one
      segments.push(currentSegment);
      currentSegment = char;
      isNumeric = charIsNumeric;
    }
  }

  // Push the last segment
  if (currentSegment) {
    segments.push(currentSegment);
  }

  return segments;
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

  /**
   * POST /api/terminals/:terminalId/shifts/start
   * Start a new shift for a terminal (used in terminal authentication flow)
   * Creates a shift with calculated shift_number
   *
   * Security Model (Enterprise Cashier Session Token Pattern):
   * 1. authMiddleware - validates CLIENT_USER JWT cookie (web session)
   * 2. cashierSessionWithPermission(SHIFT_OPEN) - validates:
   *    a. X-Cashier-Session header contains valid session token
   *    b. Session is not expired
   *    c. CASHIER role has SHIFT_OPEN permission
   * 3. validateTerminalMatch - ensures session terminal matches route terminal
   *
   * This implements dual-auth: both web login AND cashier PIN required.
   * Authorization uses CASHIER's permissions, not CLIENT_USER's.
   *
   * Story 4.92: Terminal Shift Page
   */
  fastify.post(
    "/api/terminals/:terminalId/shifts/start",
    {
      preHandler: [
        authMiddleware,
        cashierSessionWithPermission(PERMISSIONS.SHIFT_OPEN),
        validateTerminalMatch,
      ],
      schema: {
        description:
          "Start a new shift for a terminal with calculated shift number",
        tags: ["shifts"],
        params: {
          type: "object",
          required: ["terminalId"],
          properties: {
            terminalId: {
              type: "string",
              format: "uuid",
              description: "POS Terminal UUID",
            },
          },
        },
        // Note: No body required - cashier_id is extracted from the validated
        // X-Cashier-Session token by cashierSessionWithPermission middleware.
        // This ensures the authenticated cashier is the one starting the shift.
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
                  shift_number: { type: "number", nullable: true },
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
      try {
        const user = (request as any).user as UserIdentity;
        const cashierSession = (request as RequestWithCashierSession)
          .cashierSession!;
        const { terminalId } = request.params as { terminalId: string };
        const auditContext = getAuditContext(request, user);

        // Use cashier_id from validated session (not from request body)
        // This ensures the cashier who authenticated via PIN is the one starting the shift
        const shift = await shiftService.startShift(
          terminalId,
          cashierSession.cashierId,
          auditContext,
        );

        // Link the session to the shift for audit trail
        await cashierSessionService.linkToShift(
          cashierSession.sessionId,
          shift.shift_id,
        );

        reply.code(201);
        return {
          success: true,
          data: {
            shift_id: shift.shift_id,
            store_id: shift.store_id,
            opened_by: shift.opened_by,
            cashier_id: shift.cashier_id,
            pos_terminal_id: shift.pos_terminal_id,
            opened_at: shift.opened_at.toISOString(),
            opening_cash: shift.opening_cash.toNumber(),
            status: shift.status,
            shift_number: shift.shift_number,
          },
        };
      } catch (error: unknown) {
        if (error instanceof ZodError) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: error.issues[0].message,
            },
          };
        }

        if (error instanceof ShiftServiceError) {
          const statusCode =
            error.code === ShiftErrorCode.SHIFT_ALREADY_ACTIVE ||
            error.code === ShiftErrorCode.TERMINAL_NOT_FOUND ||
            error.code === ShiftErrorCode.CASHIER_NOT_FOUND
              ? 400
              : 500;

          reply.code(statusCode);
          return {
            success: false,
            error: {
              code: error.code,
              message: error.message,
              details: error.details,
            },
          };
        }

        // Log detailed error for debugging
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        fastify.log.error(
          { error, errorMessage, errorStack },
          "Error starting shift",
        );
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to start shift",
          },
        };
      }
    },
  );

  /**
   * GET /api/terminals/:terminalId/shifts/active
   * Get active shift for a terminal
   * Protected route - requires SHIFT_READ permission
   * Story 4.92: Terminal Shift Page
   */
  fastify.get(
    "/api/terminals/:terminalId/shifts/active",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.SHIFT_READ),
      ],
      schema: {
        description: "Get active shift for a terminal",
        tags: ["shifts"],
        params: {
          type: "object",
          required: ["terminalId"],
          properties: {
            terminalId: {
              type: "string",
              format: "uuid",
              description: "POS Terminal UUID",
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
                  pos_terminal_id: {
                    type: "string",
                    format: "uuid",
                    nullable: true,
                  },
                  opened_at: { type: "string", format: "date-time" },
                  opening_cash: { type: "number" },
                  status: { type: "string" },
                  shift_number: { type: "number", nullable: true },
                },
                nullable: true,
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const { terminalId } = request.params as { terminalId: string };

        // Validate terminal exists and user has access
        const terminal = await prisma.pOSTerminal.findUnique({
          where: { pos_terminal_id: terminalId },
          select: { store_id: true },
        });

        if (!terminal) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "TERMINAL_NOT_FOUND",
              message: `Terminal with ID ${terminalId} not found`,
            },
          };
        }

        // Validate store access (RLS check)
        await shiftService.validateStoreAccess(terminal.store_id, user.id);

        const activeShift = await shiftService.checkActiveShift(terminalId);

        reply.code(200);
        return {
          success: true,
          data: activeShift
            ? {
                shift_id: activeShift.shift_id,
                store_id: activeShift.store_id,
                opened_by: activeShift.opened_by,
                cashier_id: activeShift.cashier_id,
                pos_terminal_id: activeShift.pos_terminal_id,
                opened_at: activeShift.opened_at.toISOString(),
                opening_cash: activeShift.opening_cash.toNumber(),
                status: activeShift.status,
                shift_number: activeShift.shift_number,
              }
            : null,
        };
      } catch (error: unknown) {
        if (error instanceof ShiftServiceError) {
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

        fastify.log.error({ error }, "Error getting active shift");
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to get active shift",
          },
        };
      }
    },
  );

  /**
   * PUT /api/shifts/:shiftId/starting-cash
   * Update starting cash for a shift
   *
   * Security Model (Enterprise Cashier Session Token Pattern):
   * 1. authMiddleware - validates CLIENT_USER JWT cookie (web session)
   * 2. cashierSessionWithPermission(SHIFT_OPEN) - validates:
   *    a. X-Cashier-Session header contains valid session token
   *    b. Session is not expired
   *    c. CASHIER role has SHIFT_OPEN permission (updating cash is part of opening)
   *
   * The cashier_id from the session is used to verify shift ownership.
   *
   * Story 4.92: Terminal Shift Page
   */
  fastify.put(
    "/api/shifts/:shiftId/starting-cash",
    {
      preHandler: [
        authMiddleware,
        cashierSessionWithPermission(PERMISSIONS.SHIFT_OPEN),
      ],
      schema: {
        description: "Update starting cash for a shift",
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
          required: ["starting_cash"],
          properties: {
            starting_cash: {
              type: "number",
              minimum: 0,
              description: "Starting cash amount (non-negative number or zero)",
            },
          },
          // Note: cashier_id is NOT in body - it's extracted from the validated
          // X-Cashier-Session token by cashierSessionWithPermission middleware.
          // This ensures the authenticated cashier is verified against shift ownership.
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
                  pos_terminal_id: {
                    type: "string",
                    format: "uuid",
                    nullable: true,
                  },
                  opened_at: { type: "string", format: "date-time" },
                  opening_cash: { type: "number" },
                  status: { type: "string" },
                  shift_number: { type: "number", nullable: true },
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
      try {
        const user = (request as any).user as UserIdentity;
        const cashierSession = (request as RequestWithCashierSession)
          .cashierSession!;
        const { shiftId } = request.params as { shiftId: string };
        const body = validateUpdateStartingCashInput(request.body);
        const auditContext = getAuditContext(request, user);

        // Use cashier_id from session for verification (body.cashier_id ignored)
        const shift = await shiftService.updateStartingCash(
          shiftId,
          cashierSession.cashierId,
          body.starting_cash,
          auditContext,
        );

        reply.code(200);
        return {
          success: true,
          data: {
            shift_id: shift.shift_id,
            store_id: shift.store_id,
            opened_by: shift.opened_by,
            cashier_id: shift.cashier_id,
            pos_terminal_id: shift.pos_terminal_id,
            opened_at: shift.opened_at.toISOString(),
            opening_cash: shift.opening_cash.toNumber(),
            status: shift.status,
            shift_number: shift.shift_number,
          },
        };
      } catch (error: unknown) {
        if (error instanceof ZodError) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: error.issues[0].message,
            },
          };
        }

        if (error instanceof ShiftServiceError) {
          const statusCode =
            error.code === ShiftErrorCode.SHIFT_NOT_FOUND ||
            error.code === ShiftErrorCode.INVALID_OPENING_CASH
              ? 400
              : 500;

          reply.code(statusCode);
          return {
            success: false,
            error: {
              code: error.code,
              message: error.message,
              details: error.details,
            },
          };
        }

        fastify.log.error({ error }, "Error updating starting cash");
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to update starting cash",
          },
        };
      }
    },
  );

  /**
   * POST /api/shifts/:shiftId/lottery/opening
   * Open a shift with lottery pack openings
   * Protected route - requires LOTTERY_SHIFT_OPEN or SHIFT_OPEN permission
   * Story 6.6: Shift Lottery Opening
   */
  fastify.post(
    "/api/shifts/:shiftId/lottery/opening",
    {
      preHandler: [
        authMiddleware,
        requireAnyPermission([
          PERMISSIONS.LOTTERY_SHIFT_OPEN,
          PERMISSIONS.SHIFT_OPEN,
        ]),
      ],
      schema: {
        description: "Open a shift with lottery pack openings",
        tags: ["shifts", "lottery"],
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
          required: ["packOpenings"],
          properties: {
            packOpenings: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                required: ["packId", "openingSerial"],
                properties: {
                  packId: {
                    type: "string",
                    format: "uuid",
                    description: "Lottery pack UUID",
                  },
                  openingSerial: {
                    type: "string",
                    minLength: 1,
                    maxLength: 100,
                    description: "Opening serial number within pack range",
                  },
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
                  shift_id: { type: "string", format: "uuid" },
                  openings: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        opening_id: { type: "string", format: "uuid" },
                        pack_id: { type: "string", format: "uuid" },
                        opening_serial: { type: "string" },
                        pack: {
                          type: "object",
                          properties: {
                            pack_id: { type: "string", format: "uuid" },
                            pack_number: { type: "string" },
                            serial_start: { type: "string" },
                            serial_end: { type: "string" },
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
                    type: "object",
                    additionalProperties: true,
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
      try {
        const user = (request as any).user as UserIdentity;
        const { shiftId } = request.params as { shiftId: string };

        // Validate shiftId
        const validatedShiftId = validateShiftId(shiftId);

        // Validate request body
        const validatedData = validateShiftLotteryOpeningInput(request.body);

        // Get audit context
        const auditContext = getAuditContext(request, user);

        // Validate shift exists and is in OPEN status
        const shift = await prisma.shift.findUnique({
          where: { shift_id: validatedShiftId },
          include: { store: true },
        });

        if (!shift) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "SHIFT_NOT_FOUND",
              message: "Shift not found",
            },
          });
        }

        if (shift.status !== ShiftStatus.OPEN) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "INVALID_SHIFT_STATUS",
              message: `Shift must be in OPEN status. Current status: ${shift.status}`,
            },
          });
        }

        // RLS Enforcement: Validate shift belongs to authenticated user's store
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        if (!hasSystemScope) {
          const userStoreRole = userRoles.find(
            (role) =>
              role.scope === "STORE" && role.store_id === shift.store_id,
          );
          if (!userStoreRole) {
            return reply.code(403).send({
              success: false,
              error: {
                code: "FORBIDDEN",
                message: "You do not have access to this shift's store",
              },
            });
          }
        }

        // Validate each pack opening
        const packOpenings = validatedData.packOpenings;
        const validatedPacks = [];
        const errors = [];

        for (const [i, packOpening] of packOpenings.entries()) {
          try {
            // Validate pack exists
            const pack = await prisma.lotteryPack.findUnique({
              where: { pack_id: packOpening.packId },
              include: { game: true },
            });

            if (!pack) {
              errors.push({
                index: i,
                packId: packOpening.packId,
                message: "Pack not found",
              });
              continue;
            }

            // Validate pack status is ACTIVE
            if (pack.status !== LotteryPackStatus.ACTIVE) {
              errors.push({
                index: i,
                packId: packOpening.packId,
                message: `Pack is not ACTIVE. Current status: ${pack.status}`,
              });
              continue;
            }

            // Validate pack belongs to same store as shift
            if (pack.store_id !== shift.store_id) {
              errors.push({
                index: i,
                packId: packOpening.packId,
                message: "Pack belongs to a different store than the shift",
              });
              continue;
            }

            // Validate opening_serial is within pack range
            const serial = packOpening.openingSerial;
            const serialStart = pack.serial_start;
            const serialEnd = pack.serial_end;

            // Compare serials (handle numeric and alphanumeric)
            const isWithinRange =
              compareSerials(serial, serialStart) >= 0 &&
              compareSerials(serial, serialEnd) <= 0;

            if (!isWithinRange) {
              errors.push({
                index: i,
                packId: packOpening.packId,
                message: `Opening serial '${serial}' must be within pack range: ${serialStart} to ${serialEnd}`,
              });
              continue;
            }

            // Check for existing LotteryShiftOpening record (duplicate prevention)
            const existingOpening = await prisma.lotteryShiftOpening.findUnique(
              {
                where: {
                  shift_id_pack_id: {
                    shift_id: validatedShiftId,
                    pack_id: packOpening.packId,
                  },
                },
              },
            );

            if (existingOpening) {
              errors.push({
                index: i,
                packId: packOpening.packId,
                message: "Pack opening already exists for this shift",
              });
              continue;
            }

            validatedPacks.push({
              pack,
              openingSerial: serial,
            });
          } catch (error) {
            errors.push({
              index: i,
              packId: packOpening.packId,
              message: `Validation error: ${error instanceof Error ? error.message : "Unknown error"}`,
            });
          }
        }

        // If any validation errors, return 400 with details
        if (errors.length > 0) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "One or more pack openings failed validation",
              details: { errors },
            },
          });
        }

        // Create LotteryShiftOpening records
        const createdOpenings = [];
        for (const validatedPack of validatedPacks) {
          const opening = await prisma.lotteryShiftOpening.create({
            data: {
              shift_id: validatedShiftId,
              pack_id: validatedPack.pack.pack_id,
              opening_serial: validatedPack.openingSerial,
            },
            include: {
              pack: {
                include: {
                  game: {
                    select: {
                      game_id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          });
          createdOpenings.push(opening);
        }

        // Create AuditLog entry
        await prisma.auditLog.create({
          data: {
            user_id: user.id,
            action: "SHIFT_LOTTERY_OPENED",
            table_name: "shifts",
            record_id: validatedShiftId,
            new_values: {
              shift_id: validatedShiftId,
              store_id: shift.store_id,
              pack_openings: createdOpenings.map((opening) => ({
                pack_id: opening.pack_id,
                pack_number: opening.pack.pack_number,
                opening_serial: opening.opening_serial,
                game_id: opening.pack.game.game_id,
              })),
            },
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
          },
        });

        // Return success response
        return reply.code(201).send({
          success: true,
          data: {
            shift_id: validatedShiftId,
            openings: createdOpenings.map((opening) => ({
              opening_id: opening.opening_id,
              pack_id: opening.pack_id,
              opening_serial: opening.opening_serial,
              pack: {
                pack_id: opening.pack.pack_id,
                pack_number: opening.pack.pack_number,
                serial_start: opening.pack.serial_start,
                serial_end: opening.pack.serial_end,
                game: {
                  game_id: opening.pack.game.game_id,
                  name: opening.pack.game.name,
                },
              },
            })),
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

        // Handle duplicate constraint violation (409)
        if (
          error instanceof Error &&
          error.message.includes("Unique constraint")
        ) {
          return reply.code(409).send({
            success: false,
            error: {
              code: "DUPLICATE_PACK_OPENING",
              message: "A pack opening already exists for this shift and pack",
            },
          });
        }

        // Handle unexpected errors
        fastify.log.error(
          { error },
          "Unexpected error in shift lottery opening",
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
   * POST /api/shifts/:shiftId/lottery/closing
   * Close a shift with lottery pack closings and reconciliation
   * Protected route - requires LOTTERY_SHIFT_CLOSE or SHIFT_CLOSE permission
   * Story 6.7: Shift Lottery Closing and Reconciliation
   */
  fastify.post(
    "/api/shifts/:shiftId/lottery/closing",
    {
      preHandler: [
        authMiddleware,
        requireAnyPermission([
          PERMISSIONS.LOTTERY_SHIFT_CLOSE,
          PERMISSIONS.SHIFT_CLOSE,
        ]),
      ],
      schema: {
        description:
          "Close a shift with lottery pack closings and reconciliation",
        tags: ["shifts", "lottery"],
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
          required: ["packClosings"],
          properties: {
            packClosings: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                required: ["packId", "closingSerial"],
                properties: {
                  packId: {
                    type: "string",
                    format: "uuid",
                    description: "Lottery pack UUID",
                  },
                  closingSerial: {
                    type: "string",
                    minLength: 1,
                    maxLength: 100,
                    description:
                      "Closing serial number within pack range and >= opening serial",
                  },
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
                  shift_id: { type: "string", format: "uuid" },
                  closings: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        closing_id: { type: "string", format: "uuid" },
                        pack_id: { type: "string", format: "uuid" },
                        closing_serial: { type: "string" },
                        opening_serial: { type: "string" },
                        expected_count: { type: "number" },
                        actual_count: { type: "number" },
                        difference: { type: "number" },
                        has_variance: { type: "boolean" },
                        variance_id: {
                          type: ["string", "null"],
                          format: "uuid",
                        },
                        pack: {
                          type: "object",
                          properties: {
                            pack_id: { type: "string", format: "uuid" },
                            pack_number: { type: "string" },
                            serial_start: { type: "string" },
                            serial_end: { type: "string" },
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
                    type: "object",
                    additionalProperties: true,
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
      try {
        const user = (request as any).user as UserIdentity;
        const { shiftId } = request.params as { shiftId: string };

        // Validate shiftId
        const validatedShiftId = validateShiftId(shiftId);

        // Validate request body
        const validatedData = validateShiftLotteryClosingInput(request.body);

        // Get audit context
        const auditContext = getAuditContext(request, user);

        // Validate shift exists and is in CLOSING or ACTIVE status
        const shift = await prisma.shift.findUnique({
          where: { shift_id: validatedShiftId },
          include: { store: true },
        });

        if (!shift) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "SHIFT_NOT_FOUND",
              message: "Shift not found",
            },
          });
        }

        if (
          shift.status !== ShiftStatus.CLOSING &&
          shift.status !== ShiftStatus.ACTIVE
        ) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "INVALID_SHIFT_STATUS",
              message: `Shift must be in CLOSING or ACTIVE status. Current status: ${shift.status}`,
            },
          });
        }

        // RLS Enforcement: Validate shift belongs to authenticated user's store
        const userRoles = await rbacService.getUserRoles(user.id);
        const hasSystemScope = userRoles.some(
          (role) => role.scope === "SYSTEM",
        );

        if (!hasSystemScope) {
          const userStoreRole = userRoles.find(
            (role) =>
              role.scope === "STORE" && role.store_id === shift.store_id,
          );
          if (!userStoreRole) {
            return reply.code(403).send({
              success: false,
              error: {
                code: "FORBIDDEN",
                message: "You do not have access to this shift's store",
              },
            });
          }
        }

        // Validate each pack closing
        const packClosings = validatedData.packClosings;
        const validatedPacks = [];
        const errors = [];

        for (const [i, packClosing] of packClosings.entries()) {
          try {
            // Validate pack exists
            const pack = await prisma.lotteryPack.findUnique({
              where: { pack_id: packClosing.packId },
              include: { game: true },
            });

            if (!pack) {
              errors.push({
                index: i,
                packId: packClosing.packId,
                message: "Pack not found",
              });
              continue;
            }

            // Validate pack belongs to same store as shift
            if (pack.store_id !== shift.store_id) {
              errors.push({
                index: i,
                packId: packClosing.packId,
                message: "Pack belongs to a different store than the shift",
              });
              continue;
            }

            // Validate LotteryShiftOpening exists for this shift and pack
            const opening = await prisma.lotteryShiftOpening.findUnique({
              where: {
                shift_id_pack_id: {
                  shift_id: validatedShiftId,
                  pack_id: packClosing.packId,
                },
              },
            });

            if (!opening) {
              errors.push({
                index: i,
                packId: packClosing.packId,
                message:
                  "Pack must have a corresponding LotteryShiftOpening record for this shift",
              });
              continue;
            }

            // Validate closing_serial is within pack range
            const closingSerial = packClosing.closingSerial;
            const serialStart = pack.serial_start;
            const serialEnd = pack.serial_end;

            const isWithinRange =
              compareSerials(closingSerial, serialStart) >= 0 &&
              compareSerials(closingSerial, serialEnd) <= 0;

            if (!isWithinRange) {
              errors.push({
                index: i,
                packId: packClosing.packId,
                message: `Closing serial '${closingSerial}' must be within pack range: ${serialStart} to ${serialEnd}`,
              });
              continue;
            }

            // Validate closing_serial >= opening_serial
            if (compareSerials(closingSerial, opening.opening_serial) < 0) {
              errors.push({
                index: i,
                packId: packClosing.packId,
                message: `Closing serial '${closingSerial}' must be greater than or equal to opening serial '${opening.opening_serial}'`,
              });
              continue;
            }

            // Check for existing LotteryShiftClosing record (duplicate prevention)
            const existingClosing = await prisma.lotteryShiftClosing.findUnique(
              {
                where: {
                  shift_id_pack_id: {
                    shift_id: validatedShiftId,
                    pack_id: packClosing.packId,
                  },
                },
              },
            );

            if (existingClosing) {
              errors.push({
                index: i,
                packId: packClosing.packId,
                message: "Pack closing already exists for this shift",
              });
              continue;
            }

            validatedPacks.push({
              pack,
              opening,
              closingSerial,
            });
          } catch (error) {
            errors.push({
              index: i,
              packId: packClosing.packId,
              message: `Validation error: ${error instanceof Error ? error.message : "Unknown error"}`,
            });
          }
        }

        // If any validation errors, return 400 with details
        if (errors.length > 0) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "One or more pack closings failed validation",
              details: { errors },
            },
          });
        }

        // Create LotteryShiftClosing records and perform reconciliation
        const createdClosings = [];
        const varianceRecords = [];

        for (const validatedPack of validatedPacks) {
          // Create LotteryShiftClosing record
          const closing = await prisma.lotteryShiftClosing.create({
            data: {
              shift_id: validatedShiftId,
              pack_id: validatedPack.pack.pack_id,
              closing_serial: validatedPack.closingSerial,
            },
            include: {
              pack: {
                include: {
                  game: {
                    select: {
                      game_id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          });

          // Use service method to detect variance and create LotteryVariance if needed
          const varianceResult = await detectVariance(
            validatedShiftId,
            validatedPack.pack.pack_id,
            validatedPack.opening.opening_serial,
            validatedPack.closingSerial,
            shift.opened_at,
          );

          const expectedCount = varianceResult
            ? varianceResult.expected
            : calculateExpectedCount(
                validatedPack.opening.opening_serial,
                validatedPack.closingSerial,
              );
          // TODO: Replace with actual ticket serial counting when LotteryTicketSerial model is implemented
          // For now, use expectedCount as placeholder (assumes no variance until ticket tracking exists)
          const actualCount = varianceResult
            ? varianceResult.actual
            : expectedCount;
          const difference = varianceResult
            ? varianceResult.difference
            : expectedCount - actualCount;

          // Store variance if created
          if (varianceResult && varianceResult.variance) {
            varianceRecords.push(varianceResult.variance);
          }

          createdClosings.push({
            closing,
            opening: validatedPack.opening,
            expectedCount,
            actualCount,
            difference,
            variance: varianceResult?.variance || null,
          });
        }

        // Create AuditLog entry for shift lottery closing
        await prisma.auditLog.create({
          data: {
            user_id: user.id,
            action: "SHIFT_LOTTERY_CLOSED",
            table_name: "shifts",
            record_id: validatedShiftId,
            new_values: {
              shift_id: validatedShiftId,
              store_id: shift.store_id,
              pack_closings: createdClosings.map((item) => ({
                pack_id: item.closing.pack_id,
                pack_number: item.closing.pack.pack_number,
                closing_serial: item.closing.closing_serial,
                opening_serial: item.opening.opening_serial,
                expected_count: item.expectedCount,
                actual_count: item.actualCount,
                difference: item.difference,
                game_id: item.closing.pack.game.game_id,
              })),
            },
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
          },
        });

        // Create AuditLog entries for variance detection (if any)
        for (const variance of varianceRecords) {
          await prisma.auditLog.create({
            data: {
              user_id: user.id,
              action: "LOTTERY_VARIANCE_DETECTED",
              table_name: "lottery_variances",
              record_id: variance.variance_id,
              new_values: {
                shift_id: validatedShiftId,
                store_id: shift.store_id,
                pack_id: variance.pack_id,
                expected_count: variance.expected,
                actual_count: variance.actual,
                difference: variance.difference,
              },
              ip_address: auditContext.ipAddress,
              user_agent: auditContext.userAgent,
            },
          });
        }

        // Return success response with reconciliation results
        return reply.code(201).send({
          success: true,
          data: {
            shift_id: validatedShiftId,
            closings: createdClosings.map((item) => ({
              closing_id: item.closing.closing_id,
              pack_id: item.closing.pack_id,
              closing_serial: item.closing.closing_serial,
              opening_serial: item.opening.opening_serial,
              expected_count: item.expectedCount,
              actual_count: item.actualCount,
              difference: item.difference,
              has_variance: item.variance !== null,
              variance_id: item.variance?.variance_id || null,
              pack: {
                pack_id: item.closing.pack.pack_id,
                pack_number: item.closing.pack.pack_number,
                serial_start: item.closing.pack.serial_start,
                serial_end: item.closing.pack.serial_end,
                game: {
                  game_id: item.closing.pack.game.game_id,
                  name: item.closing.pack.game.name,
                },
              },
            })),
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

        // Handle duplicate constraint violation (409)
        if (
          error instanceof Error &&
          error.message.includes("Unique constraint")
        ) {
          return reply.code(409).send({
            success: false,
            error: {
              code: "DUPLICATE_PACK_CLOSING",
              message: "A pack closing already exists for this shift and pack",
            },
          });
        }

        // Handle unexpected errors
        fastify.log.error(
          { error },
          "Unexpected error in shift lottery closing",
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
