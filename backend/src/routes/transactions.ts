/**
 * Transaction Routes
 *
 * API endpoints for transaction import, processing, and query.
 * Story 3.2: Transaction Import API
 * Story 3.4: Transaction Query API
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import {
  permissionMiddleware,
  requireAnyPermission,
} from "../middleware/permission.middleware";
import { PERMISSIONS } from "../constants/permissions";
import { transactionService } from "../services/transaction.service";
import { rbacService } from "../services/rbac.service";
import { ZodError } from "zod";
import { validateTransactionQuery } from "../schemas/transaction.schema";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../utils/db";

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
            cashier_id: {
              type: "string",
              format: "uuid",
              description: "Filter by cashier UUID",
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
        fastify.log.debug(
          { query: request.query },
          "Validating transaction query parameters",
        );
        const queryParams = validateTransactionQuery(request.query);

        // Build filters
        const filters = {
          store_id: queryParams.store_id,
          shift_id: queryParams.shift_id,
          cashier_id: queryParams.cashier_id,
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
            shift_id: {
              type: "string",
              format: "uuid",
              description: "Filter by shift UUID",
            },
            cashier_id: {
              type: "string",
              format: "uuid",
              description: "Filter by cashier UUID",
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
          shift_id: queryParams.shift_id,
          cashier_id: queryParams.cashier_id,
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

  /**
   * POST /api/transactions/bulk-import
   * Upload CSV or JSON file for bulk transaction import
   * Protected route - requires ADMIN_SYSTEM_CONFIG permission
   * Story 3.6: Bulk Transaction Import
   */
  fastify.post(
    "/api/transactions/bulk-import",
    {
      preHandler: [
        authMiddleware,
        requireAnyPermission([
          PERMISSIONS.ADMIN_SYSTEM_CONFIG,
          PERMISSIONS.TRANSACTION_IMPORT,
        ]),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as UserIdentity;
      const errorContext = {
        userId: user.userId,
        endpoint: "/api/transactions/bulk-import",
      };

      try {
        // Get uploaded file from multipart form data
        const data = await request.file();
        if (!data) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "No file uploaded",
            },
          };
        }

        // Validate file type
        const fileName = data.filename || "unknown";
        const fileExtension = fileName.split(".").pop()?.toUpperCase();
        if (fileExtension !== "CSV" && fileExtension !== "JSON") {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "File must be CSV or JSON format",
            },
          };
        }

        // Validate file size (50MB max)
        const maxFileSize = 50 * 1024 * 1024; // 50MB
        const fileBuffer = await data.toBuffer();
        if (fileBuffer.length > maxFileSize) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: `File size exceeds maximum of ${maxFileSize / 1024 / 1024}MB`,
            },
          };
        }

        // Create bulk import job
        const job = await transactionService.createBulkImportJob(
          user.userId,
          fileName,
          fileExtension as "CSV" | "JSON",
        );

        // Log bulk import job creation to AuditLog
        const ipAddress =
          (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
          request.ip ||
          request.socket.remoteAddress ||
          null;
        const userAgent = request.headers["user-agent"] || null;

        await prisma.auditLog.create({
          data: {
            user_id: user.userId,
            action: "CREATE",
            table_name: "bulk_import_jobs",
            record_id: job.job_id,
            new_values: {
              job_id: job.job_id,
              file_name: fileName,
              file_type: fileExtension,
              status: "PENDING",
            } as any,
            reason: `Bulk import job created by ${user.email || user.userId}`,
            ip_address: ipAddress,
            user_agent: userAgent,
          },
        });

        // Process file asynchronously (don't await - return job_id immediately)
        const fileContent = fileBuffer.toString("utf-8");
        processBulkImport(
          job.job_id,
          fileContent,
          fileExtension as "CSV" | "JSON",
          user.userId,
          user.email || user.userId,
          ipAddress,
          userAgent,
        ).catch((error) => {
          fastify.log.error(
            { error, jobId: job.job_id },
            "Bulk import processing failed",
          );
        });

        reply.code(202);
        return {
          success: true,
          data: {
            job_id: job.job_id,
            status: "PENDING",
            message: "File uploaded successfully. Processing in background.",
          },
        };
      } catch (error: any) {
        fastify.log.error(
          { ...errorContext, error },
          "Bulk import upload error",
        );
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to process bulk import upload",
          },
        };
      }
    },
  );

  /**
   * GET /api/transactions/bulk-import/:jobId
   * Get bulk import job status and progress
   * Protected route - users can only view their own jobs, admins can view all
   * Story 3.6: Bulk Transaction Import
   */
  fastify.get(
    "/api/transactions/bulk-import/:jobId",
    {
      preHandler: [authMiddleware],
    },
    async (
      request: FastifyRequest<{ Params: { jobId: string } }>,
      reply: FastifyReply,
    ) => {
      const user = request.user as UserIdentity;
      const { jobId } = request.params;

      try {
        // Check if user is admin (has ADMIN_SYSTEM_CONFIG permission)
        const userRoles = await rbacService.getUserRoles(user.userId);
        const isAdmin = userRoles.some((role) =>
          role.permissions?.includes(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
        );

        const job = await transactionService.getBulkImportJob(
          jobId,
          user.userId,
          isAdmin,
        );

        if (!job) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Bulk import job not found",
            },
          };
        }

        reply.code(200);
        return {
          success: true,
          data: {
            job: {
              job_id: job.job_id,
              file_name: job.file_name,
              file_type: job.file_type,
              status: job.status,
              total_rows: job.total_rows,
              processed_rows: job.processed_rows,
              error_rows: job.error_rows,
              started_at: job.started_at,
              completed_at: job.completed_at,
            },
            errors: (job.error_summary as any) || [],
          },
        };
      } catch (error: any) {
        fastify.log.error({ error, jobId }, "Get bulk import status error");
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to get bulk import status",
          },
        };
      }
    },
  );

  /**
   * GET /api/transactions/bulk-import/:jobId/errors
   * Get detailed error report for bulk import job
   * Protected route - users can only view their own jobs, admins can view all
   * Story 3.6: Bulk Transaction Import
   */
  fastify.get(
    "/api/transactions/bulk-import/:jobId/errors",
    {
      preHandler: [authMiddleware],
    },
    async (
      request: FastifyRequest<{
        Params: { jobId: string };
        Querystring: { format?: "csv" | "json" };
      }>,
      reply: FastifyReply,
    ) => {
      const user = request.user as UserIdentity;
      const { jobId } = request.params;
      const format = request.query.format || "json";

      try {
        // Check if user is admin
        const userRoles = await rbacService.getUserRoles(user.userId);
        const isAdmin = userRoles.some((role) =>
          role.permissions?.includes(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
        );

        const job = await transactionService.getBulkImportJob(
          jobId,
          user.userId,
          isAdmin,
        );

        if (!job) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Bulk import job not found",
            },
          };
        }

        const errors = (job.error_summary as any) || [];

        if (format === "csv") {
          // Return CSV format
          const csvHeader = "Row Number,Field,Error\n";
          const csvRows = errors
            .map(
              (err: any) =>
                `${err.row_number || ""},${err.field || ""},"${(err.error || "").replace(/"/g, '""')}"`,
            )
            .join("\n");
          const csv = csvHeader + csvRows;

          reply.header("Content-Type", "text/csv");
          reply.header(
            "Content-Disposition",
            `attachment; filename="bulk-import-errors-${jobId}.csv"`,
          );
          reply.code(200);
          return csv;
        } else {
          // Return JSON format
          reply.code(200);
          return {
            success: true,
            data: {
              job_id: job.job_id,
              file_name: job.file_name,
              errors,
            },
          };
        }
      } catch (error: any) {
        fastify.log.error({ error, jobId }, "Get bulk import errors error");
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to get bulk import errors",
          },
        };
      }
    },
  );
}

/**
 * Process bulk import file asynchronously
 * Parses file, validates transactions, and enqueues valid ones to RabbitMQ
 */
async function processBulkImport(
  jobId: string,
  fileContent: string,
  fileType: "CSV" | "JSON",
  userId: string,
  userEmail: string,
  ipAddress: string | null,
  userAgent: string | null,
): Promise<void> {
  const { parseCsvFile, parseJsonFile } = await import("../utils/file-parser");
  const { publishToTransactionsQueue } = await import("../utils/rabbitmq");
  const { transactionService } =
    await import("../services/transaction.service");
  const { prisma } = await import("../utils/db");

  try {
    // Update job status to PROCESSING
    await transactionService.updateBulkImportJob(jobId, {
      status: "PROCESSING",
    });

    // Parse file
    const parseResult =
      fileType === "CSV"
        ? parseCsvFile(fileContent)
        : parseJsonFile(fileContent);

    // Update total rows
    await transactionService.updateBulkImportJob(jobId, {
      total_rows: parseResult.transactions.length + parseResult.errors.length,
    });

    // Validate each transaction and collect errors
    const validationErrors: Array<{
      row_number: number;
      field: string;
      error: string;
    }> = [...parseResult.errors];

    const validTransactions: any[] = [];

    for (const [index, transaction] of parseResult.transactions.entries()) {
      const rowNumber = index + 1;

      try {
        // Validate transaction payload
        const validated =
          transactionService.validateTransactionPayload(transaction);

        // Check store access
        const hasAccess = await transactionService.checkStoreAccess(
          userId,
          validated.store_id,
        );
        if (!hasAccess) {
          validationErrors.push({
            row_number: rowNumber,
            field: "store_id",
            error: "User does not have access to this store",
          });
          continue;
        }

        // Validate shift
        const shiftValidation = await transactionService.validateShift(
          validated.shift_id,
          validated.store_id,
        );
        if (!shiftValidation.valid) {
          validationErrors.push({
            row_number: rowNumber,
            field: "shift_id",
            error: shiftValidation.error?.message || "Invalid shift",
          });
          continue;
        }

        // Validate product_ids exist in product catalog (if provided)
        // Note: Product model not yet available (Epic 5), so we validate UUID format only
        // Product existence validation will be added when Product model is available
        for (const lineItem of validated.line_items) {
          if (lineItem.product_id) {
            // UUID format is already validated by schema, but we can add additional checks here
            // when Product model becomes available, we'll check: await prisma.product.findUnique({ where: { product_id: lineItem.product_id } })
            // For now, product_id format validation is sufficient (handled by schema)
          }
        }

        // Validate payment methods are valid
        // Payment methods are already validated by schema (PaymentMethodEnum), but we explicitly check here
        const validPaymentMethods = [
          "CASH",
          "CREDIT",
          "DEBIT",
          "EBT",
          "OTHER",
        ] as const;
        let hasInvalidPayment = false;
        for (const payment of validated.payments) {
          if (!validPaymentMethods.includes(payment.method as any)) {
            validationErrors.push({
              row_number: rowNumber,
              field: `payments[${validated.payments.indexOf(payment)}].method`,
              error: `Invalid payment method: ${payment.method}. Must be one of: ${validPaymentMethods.join(", ")}`,
            });
            hasInvalidPayment = true;
            break;
          }
        }
        if (hasInvalidPayment) {
          continue;
        }

        validTransactions.push(validated);
      } catch (error: any) {
        validationErrors.push({
          row_number: rowNumber,
          field: "transaction",
          error: error.message || "Validation failed",
        });
      }
    }

    // Update error summary
    await transactionService.updateBulkImportJob(jobId, {
      error_rows: validationErrors.length,
      error_summary: validationErrors,
    });

    // Enqueue valid transactions in batches of 100
    const batchSize = 100;
    let processedCount = 0;

    for (let i = 0; i < validTransactions.length; i += batchSize) {
      const batch = validTransactions.slice(i, i + batchSize);

      const enqueuePromises = batch.map((tx) => {
        const correlationId = uuidv4();
        const message = {
          correlation_id: correlationId,
          timestamp: new Date().toISOString(),
          source: "BULK_IMPORT" as const,
          user_id: userId,
          payload: tx,
        };

        return publishToTransactionsQueue(message, correlationId);
      });

      await Promise.all(enqueuePromises);
      processedCount += batch.length;

      // Update progress
      await transactionService.updateBulkImportJob(jobId, {
        processed_rows: processedCount,
      });
    }

    // Get final job state
    const finalJob = await transactionService.getBulkImportJob(
      jobId,
      userId,
      true,
    );

    // Mark job as completed
    await transactionService.updateBulkImportJob(jobId, {
      status: "COMPLETED",
      completed_at: new Date(),
    });

    // Log import completion to AuditLog
    await prisma.auditLog.create({
      data: {
        user_id: userId,
        action: "UPDATE",
        table_name: "bulk_import_jobs",
        record_id: jobId,
        old_values: { status: "PROCESSING" } as any,
        new_values: {
          status: "COMPLETED",
          total_rows: finalJob?.total_rows || 0,
          processed_rows: finalJob?.processed_rows || 0,
          error_rows: finalJob?.error_rows || 0,
        } as any,
        reason: `Bulk import completed by ${userEmail} - ${finalJob?.processed_rows || 0} processed, ${finalJob?.error_rows || 0} errors`,
        ip_address: ipAddress,
        user_agent: userAgent,
      },
    });
  } catch (error: any) {
    // Mark job as failed
    await transactionService.updateBulkImportJob(jobId, {
      status: "FAILED",
      completed_at: new Date(),
    });

    // Log import failure to AuditLog
    const { prisma: prismaClient } = await import("../utils/db");
    await prismaClient.auditLog.create({
      data: {
        user_id: userId,
        action: "UPDATE",
        table_name: "bulk_import_jobs",
        record_id: jobId,
        old_values: { status: "PROCESSING" } as any,
        new_values: { status: "FAILED" } as any,
        reason: `Bulk import failed by ${userEmail}: ${error.message || "Unknown error"}`,
        ip_address: ipAddress,
        user_agent: userAgent,
      },
    });

    throw error;
  }
}
