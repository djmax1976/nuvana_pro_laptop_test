/**
 * Transaction Routes
 *
 * API endpoints for transaction import, processing, and query.
 * Story 3.2: Transaction Import API
 * Story 3.4: Transaction Query API
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { permissionMiddleware } from "../middleware/permission.middleware";
import { PERMISSIONS } from "../constants/permissions";
import { transactionService } from "../services/transaction.service";
import { ZodError } from "zod";
import { validateTransactionQuery } from "../schemas/transaction.schema";

/**
 * Transaction routes
 * Provides POST /api/transactions endpoint for async transaction import
 */
export async function transactionRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/transactions
   * Accept transaction for async processing
   * Protected route - requires TRANSACTION_CREATE permission
   */
  fastify.post(
    "/api/transactions",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.TRANSACTION_CREATE),
      ],
      schema: {
        description: "Accept transaction for async processing",
        tags: ["transactions"],
        body: {
          type: "object",
          required: [
            "store_id",
            "shift_id",
            "subtotal",
            "line_items",
            "payments",
          ],
          properties: {
            store_id: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
            shift_id: {
              type: "string",
              format: "uuid",
              description: "Shift UUID",
            },
            cashier_id: {
              type: "string",
              format: "uuid",
              description: "Cashier UUID (optional)",
            },
            pos_terminal_id: {
              type: "string",
              format: "uuid",
              description: "POS Terminal UUID (optional)",
            },
            timestamp: {
              type: "string",
              format: "date-time",
              description: "Transaction timestamp (ISO 8601)",
            },
            subtotal: {
              type: "number",
              minimum: 0,
              description: "Transaction subtotal",
            },
            tax: {
              type: "number",
              minimum: 0,
              default: 0,
              description: "Tax amount",
            },
            discount: {
              type: "number",
              minimum: 0,
              default: 0,
              description: "Discount amount",
            },
            line_items: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                required: ["sku", "name", "quantity", "unit_price"],
                properties: {
                  product_id: { type: "string", format: "uuid" },
                  sku: { type: "string", minLength: 1 },
                  name: { type: "string", minLength: 1 },
                  quantity: { type: "integer", minimum: 1 },
                  unit_price: { type: "number", minimum: 0 },
                  discount: { type: "number", minimum: 0, default: 0 },
                },
              },
              description: "Transaction line items",
            },
            payments: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                required: ["method", "amount"],
                properties: {
                  method: {
                    type: "string",
                    enum: ["CASH", "CREDIT", "DEBIT", "EBT", "OTHER"],
                  },
                  amount: { type: "number", minimum: 0 },
                  reference: { type: "string" },
                },
              },
              description: "Payment methods used",
            },
          },
        },
        response: {
          202: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  correlation_id: { type: "string", format: "uuid" },
                  status: { type: "string" },
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
                  details: { type: "array" },
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
          503: {
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
      let correlationId: string | undefined;

      try {
        const result = await transactionService.processTransactionImport(
          request.body,
          user.id,
        );

        correlationId = result.correlation_id;

        reply.code(202);
        return {
          success: true,
          data: {
            correlation_id: result.correlation_id,
            status: result.status,
            message: "Transaction accepted for processing",
          },
        };
      } catch (error: any) {
        // Log error with context
        const errorContext = {
          correlation_id: correlationId,
          user_id: user.id,
          store_id: (request.body as any)?.store_id,
          error: error.message,
        };

        // Handle Zod validation errors
        if (error instanceof ZodError) {
          fastify.log.warn(
            { ...errorContext, type: "validation" },
            "Validation error",
          );
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid transaction payload",
              details: error.issues.map((e: any) => ({
                field: e.path.join("."),
                message: e.message,
              })),
            },
          };
        }

        // Handle custom error codes
        const errorCode = error.code || "INTERNAL_ERROR";
        const statusCode = error.status || 500;

        if (statusCode === 403) {
          fastify.log.warn(
            { ...errorContext, type: "permission" },
            "Permission denied",
          );
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: error.message || "You do not have access to this store",
            },
          };
        }

        if (statusCode === 404) {
          fastify.log.warn(
            { ...errorContext, type: "not_found" },
            "Resource not found",
          );
          reply.code(404);
          return {
            success: false,
            error: {
              code: errorCode,
              message: error.message,
            },
          };
        }

        if (statusCode === 409) {
          fastify.log.warn(
            { ...errorContext, type: "conflict" },
            "Conflict error",
          );
          reply.code(409);
          return {
            success: false,
            error: {
              code: errorCode,
              message: error.message,
            },
          };
        }

        // Handle RabbitMQ connection errors
        if (
          error.message?.includes("RabbitMQ") ||
          error.message?.includes("connect")
        ) {
          fastify.log.error(
            { ...errorContext, type: "queue" },
            "Queue connection error",
          );
          reply.code(503);
          return {
            success: false,
            error: {
              code: "QUEUE_UNAVAILABLE",
              message:
                "Transaction processing service is temporarily unavailable",
            },
          };
        }

        // Generic server error
        fastify.log.error(
          { ...errorContext, type: "internal" },
          "Internal server error",
        );
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "An unexpected error occurred",
          },
        };
      }
    },
  );

  /**
   * GET /api/transactions
   * Query transactions with filters, pagination, and optional includes
   * Protected route - requires TRANSACTION_READ permission
   * Story 3.4: Transaction Query API
   */
  fastify.get(
    "/api/transactions",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.TRANSACTION_READ),
      ],
      schema: {
        description: "Query transactions with filters and pagination",
        tags: ["transactions"],
        querystring: {
          type: "object",
          properties: {
            store_id: {
              type: "string",
              format: "uuid",
              description: "Filter by store UUID",
            },
            shift_id: {
              type: "string",
              format: "uuid",
              description: "Filter by shift UUID",
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
            include_line_items: {
              type: "string",
              enum: ["true", "false"],
              default: "false",
              description: "Include TransactionLineItem records",
            },
            include_payments: {
              type: "string",
              enum: ["true", "false"],
              default: "false",
              description: "Include TransactionPayment records",
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
                  transactions: { type: "array" },
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
                  details: { type: "array" },
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
        // Validate query parameters using Zod schema
        const queryParams = validateTransactionQuery(request.query);

        // Build filters
        const filters = {
          store_id: queryParams.store_id,
          shift_id: queryParams.shift_id,
          from: queryParams.from ? new Date(queryParams.from) : undefined,
          to: queryParams.to ? new Date(queryParams.to) : undefined,
        };

        // Build pagination
        const pagination = {
          limit: queryParams.limit,
          offset: queryParams.offset,
        };

        // Build include options
        const include = {
          line_items: queryParams.include_line_items,
          payments: queryParams.include_payments,
        };

        // Query transactions via service
        const result = await transactionService.getTransactions(
          user.id,
          filters,
          pagination,
          include,
        );

        reply.code(200);
        return {
          success: true,
          data: result,
        };
      } catch (error: any) {
        const errorContext = {
          user_id: user.id,
          query: request.query,
          error: error.message,
        };

        // Handle Zod validation errors
        if (error instanceof ZodError) {
          fastify.log.warn(
            { ...errorContext, type: "validation" },
            "Query validation error",
          );
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid query parameters",
              details: error.issues.map((e: any) => ({
                field: e.path.join("."),
                message: e.message,
              })),
            },
          };
        }

        // Handle custom error codes
        const statusCode = error.status || 500;

        if (statusCode === 403) {
          fastify.log.warn(
            { ...errorContext, type: "permission" },
            "Permission denied",
          );
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message:
                error.message || "You do not have access to this resource",
            },
          };
        }

        // Generic server error
        fastify.log.error(
          { ...errorContext, type: "internal" },
          "Internal server error",
        );
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "An unexpected error occurred",
          },
        };
      }
    },
  );

  /**
   * GET /api/stores/:storeId/transactions
   * Query transactions for a specific store
   * Protected route - requires TRANSACTION_READ permission
   * Story 3.4: Transaction Query API
   */
  fastify.get(
    "/api/stores/:storeId/transactions",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.TRANSACTION_READ),
      ],
      schema: {
        description: "Query transactions for a specific store",
        tags: ["transactions", "stores"],
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
            include_line_items: {
              type: "string",
              enum: ["true", "false"],
              default: "false",
              description: "Include TransactionLineItem records",
            },
            include_payments: {
              type: "string",
              enum: ["true", "false"],
              default: "false",
              description: "Include TransactionPayment records",
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
                  transactions: { type: "array" },
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
                  details: { type: "array" },
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
      const { storeId } = request.params as { storeId: string };

      try {
        // Validate query parameters (without store_id since it comes from params)
        const queryParams = validateTransactionQuery({
          ...(request.query as Record<string, unknown>),
          store_id: storeId,
        });

        // Build filters (store_id from URL params)
        const filters = {
          store_id: storeId,
          from: queryParams.from ? new Date(queryParams.from) : undefined,
          to: queryParams.to ? new Date(queryParams.to) : undefined,
        };

        // Build pagination
        const pagination = {
          limit: queryParams.limit,
          offset: queryParams.offset,
        };

        // Build include options
        const include = {
          line_items: queryParams.include_line_items,
          payments: queryParams.include_payments,
        };

        // Query transactions via service
        const result = await transactionService.getTransactions(
          user.id,
          filters,
          pagination,
          include,
        );

        reply.code(200);
        return {
          success: true,
          data: result,
        };
      } catch (error: any) {
        const errorContext = {
          user_id: user.id,
          store_id: storeId,
          query: request.query,
          error: error.message,
        };

        // Handle Zod validation errors
        if (error instanceof ZodError) {
          fastify.log.warn(
            { ...errorContext, type: "validation" },
            "Query validation error",
          );
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid query parameters",
              details: error.issues.map((e: any) => ({
                field: e.path.join("."),
                message: e.message,
              })),
            },
          };
        }

        // Handle custom error codes
        const statusCode = error.status || 500;

        if (statusCode === 403) {
          fastify.log.warn(
            { ...errorContext, type: "permission" },
            "Permission denied",
          );
          reply.code(403);
          return {
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: error.message || "You do not have access to this store",
            },
          };
        }

        // Generic server error
        fastify.log.error(
          { ...errorContext, type: "internal" },
          "Internal server error",
        );
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "An unexpected error occurred",
          },
        };
      }
    },
  );
}
