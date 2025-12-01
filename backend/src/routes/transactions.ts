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
import { promises as fs } from "fs";
import { join } from "path";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";
import { tmpdir } from "os";
import {
  validateFileType,
  validateFileSize,
  getFileExtension,
} from "../utils/upload-validation";
import {
  checkUploadQuota,
  recordUpload,
} from "../services/upload-quota.service";

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

        if (statusCode === 400) {
          fastify.log.warn(
            { ...errorContext, type: "validation" },
            "Validation error",
          );
          reply.code(400);
          return {
            success: false,
            error: {
              code: errorCode,
              message: error.message,
            },
          };
        }

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
   *
   * SECURITY: Stricter rate limiting for upload endpoints
   * - Limits concurrent uploads per user
   * - Reduces requests per minute for large file uploads
   * - Prevents abuse of upload bandwidth
   */
  fastify.post(
    "/api/transactions/bulk-import",
    {
      // Upload-specific rate limiting: stricter than global limits
      // Configurable via env: UPLOAD_RATE_LIMIT_MAX (default: 5) and UPLOAD_RATE_LIMIT_WINDOW (default: "1 minute")
      // CI/Test: Higher limit (100) to prevent false test failures from rate limiting
      config: {
        rateLimit: {
          max: parseInt(
            process.env.UPLOAD_RATE_LIMIT_MAX ||
              (process.env.CI === "true" ? "100" : "5"),
            10,
          ), // 5 uploads per window (100 in CI)
          timeWindow: process.env.UPLOAD_RATE_LIMIT_WINDOW || "1 minute",
          // Use user ID for rate limiting key (more accurate than IP)
          keyGenerator: (request: FastifyRequest) => {
            const user = (request as any).user as UserIdentity | undefined;
            return user?.id || request.ip || "anonymous";
          },
        },
      },
      preHandler: [
        authMiddleware,
        requireAnyPermission([
          PERMISSIONS.ADMIN_SYSTEM_CONFIG,
          PERMISSIONS.TRANSACTION_IMPORT,
        ]),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;
      const errorContext = {
        user_id: user.id,
        endpoint: "/api/transactions/bulk-import",
      };

      // SECURITY: Use streaming for file uploads - NEVER use toBuffer() for large files
      // Stream files directly to disk/temp location to avoid memory exhaustion
      let tempFilePath: string | null = null;

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

        // Sanitize filename: remove path traversal and null bytes
        let fileName = data.filename || "unknown";
        // Remove path traversal sequences
        fileName = fileName.replace(/\.\./g, "").replace(/[\/\\]/g, "_");
        // Remove null bytes
        fileName = fileName.replace(/\0/g, "");

        // Get MIME type from request
        const mimeType = data.mimetype || data.type || undefined;

        // Get file extension
        const fileExtension = getFileExtension(fileName);
        if (!fileExtension) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "File must have a valid extension",
            },
          };
        }

        // SECURITY: Validate file type using both MIME type and file signature
        // Stream file to temp location for validation and processing
        const tempDir = process.env.TEMP_DIR || tmpdir();
        tempFilePath = join(tempDir, `bulk-import-${uuidv4()}-${fileName}`);
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- Safe: path is constructed from controlled tempDir and UUID
        const writeStream = createWriteStream(tempFilePath);

        // Stream file to disk (prevents memory exhaustion for large files)
        // SECURITY: Use streaming - NEVER use toBuffer() for large files
        const fileStream = data.file; // Fastify multipart file stream

        // Pipe file stream to disk
        await pipeline(fileStream, writeStream);

        // Get file size from filesystem after streaming completes
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- Safe: tempFilePath is constructed from controlled tempDir and UUID
        const fileStats = await fs.stat(tempFilePath);
        const fileSizeBytes = fileStats.size;

        // Get max file size from env (default: 10MB)
        const maxFileSizeMB = parseInt(
          process.env.MAX_UPLOAD_FILE_SIZE_MB || "10",
          10,
        );
        const maxFileSizeBytes = maxFileSizeMB * 1024 * 1024;

        // Validate file size
        const sizeValidation = validateFileSize(
          fileSizeBytes,
          maxFileSizeBytes,
        );
        if (!sizeValidation.valid) {
          // eslint-disable-next-line security/detect-non-literal-fs-filename -- Safe: tempFilePath is controlled
          await fs.unlink(tempFilePath).catch(() => {});
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: sizeValidation.error || "File size validation failed",
            },
          };
        }

        // Check for empty file
        if (fileSizeBytes === 0) {
          // eslint-disable-next-line security/detect-non-literal-fs-filename -- Safe: tempFilePath is controlled
          await fs.unlink(tempFilePath).catch(() => {});
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "File cannot be empty",
            },
          };
        }

        // SECURITY: Check upload quota before accepting file
        const quotaCheck = await checkUploadQuota(user.id, fileSizeBytes);
        if (!quotaCheck.allowed) {
          // eslint-disable-next-line security/detect-non-literal-fs-filename -- Safe: tempFilePath is controlled
          await fs.unlink(tempFilePath).catch(() => {});
          reply.code(403);
          return {
            success: false,
            error: {
              code: "QUOTA_EXCEEDED",
              message: quotaCheck.error || "Upload quota exceeded",
              quota: {
                remaining_bytes: quotaCheck.quota.remainingBytes,
                remaining_uploads: quotaCheck.quota.remainingUploads,
                reset_at: quotaCheck.quota.resetAt,
              },
            },
          };
        }

        // SECURITY: Validate file type using MIME type and magic bytes
        // Read first bytes for magic byte validation
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- Safe: tempFilePath is controlled
        const fileHandle = await fs.open(tempFilePath, "r");
        const magicBytesBuffer = Buffer.alloc(1024); // Read first 1KB for validation
        await fileHandle.read(magicBytesBuffer, 0, 1024, 0);
        await fileHandle.close();

        const typeValidation = await validateFileType(
          fileName,
          mimeType,
          magicBytesBuffer,
          ["csv", "json"],
        );

        if (!typeValidation.valid) {
          // eslint-disable-next-line security/detect-non-literal-fs-filename -- Safe: tempFilePath is controlled
          await fs.unlink(tempFilePath).catch(() => {});
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: typeValidation.error || "File type validation failed",
            },
          };
        }

        // Determine file type from validation result
        const detectedType =
          typeValidation.detectedType?.toUpperCase() ||
          fileExtension.toUpperCase();
        if (detectedType !== "CSV" && detectedType !== "JSON") {
          // eslint-disable-next-line security/detect-non-literal-fs-filename -- Safe: tempFilePath is controlled
          await fs.unlink(tempFilePath).catch(() => {});
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "File must be CSV or JSON format",
            },
          };
        }

        // Create bulk import job
        const job = await transactionService.createBulkImportJob(
          user.id,
          fileName,
          detectedType as "CSV" | "JSON",
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
            user_id: user.id,
            action: "CREATE",
            table_name: "bulk_import_jobs",
            record_id: job.job_id,
            new_values: {
              job_id: job.job_id,
              file_name: fileName,
              file_type: detectedType,
              status: "PENDING",
              file_size: fileSizeBytes,
            } as any,
            reason: `Bulk import job created by ${user.email || user.id}`,
            ip_address: ipAddress,
            user_agent: userAgent,
          },
        });

        // Record upload to quota system only after all synchronous operations succeed
        // This prevents quota exhaustion from failed uploads (e.g., audit log failures)
        await recordUpload(user.id, fileSizeBytes);

        // Process file asynchronously (don't await - return job_id immediately)
        // File will be read from disk inside processBulkImport to avoid keeping content in memory
        // during the upload response. This reduces memory pressure for large files.
        processBulkImport(
          job.job_id,
          tempFilePath,
          detectedType as "CSV" | "JSON",
          user.id,
          user.email || user.id,
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
        // Clean up temp file on error
        if (tempFilePath) {
          // eslint-disable-next-line security/detect-non-literal-fs-filename -- Safe: tempFilePath is constructed from controlled tempDir and UUID
          await fs.unlink(tempFilePath).catch(() => {});
        }

        fastify.log.error(
          {
            ...errorContext,
            error: error.message || error,
            stack: error.stack,
            code: error.code,
            name: error.name,
          },
          "Bulk import upload error",
        );
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to process bulk import upload",
            details:
              process.env.NODE_ENV === "test" ? error.message : undefined,
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
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;
      const { jobId } = request.params as { jobId: string };

      // Validate job_id format (must be valid UUID format: 8-4-4-4-12 hex chars)
      // Using permissive regex that accepts any valid UUID format including nil UUID
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(jobId)) {
        reply.code(400);
        return {
          success: false,
          error: {
            code: "INVALID_JOB_ID",
            message: "Invalid job_id format - must be a valid UUID",
          },
        };
      }

      try {
        // Check if user is admin (has ADMIN_SYSTEM_CONFIG permission)
        const userRoles = await rbacService.getUserRoles(user.id);
        const isAdmin = userRoles.some((role) =>
          role.permissions?.includes(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
        );

        const job = await transactionService.getBulkImportJob(
          jobId,
          user.id,
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
   * Escapes a CSV field value to prevent CSV injection and malformed CSV output.
   * Handles:
   * - Double quotes (escaped by doubling per RFC 4180)
   * - Newlines and carriage returns (properly contained within quoted fields)
   * - CSV injection characters (leading =, +, -, @, \t, \r are escaped with tab prefix)
   * - All fields are consistently wrapped in double quotes
   *
   * @param value - The field value to escape
   * @returns Properly escaped CSV field value (always wrapped in double quotes)
   */
  function escapeCsvField(value: string | number | null | undefined): string {
    if (value === null || value === undefined) {
      return '""';
    }

    const str = String(value);

    // Check for CSV injection risk on original string (before any modifications)
    // Excel/Google Sheets interpret =, +, -, @, \t, \r at the start as formulas
    // This check must happen before quote escaping to catch all injection vectors
    const csvInjectionPattern = /^([=+\-@\t\r])/;
    const hasInjectionRisk = csvInjectionPattern.test(str);

    // Escape double quotes by doubling them (RFC 4180 standard)
    // This must be done to prevent breaking out of quoted field
    let escaped = str.replace(/"/g, '""');

    // Prevent CSV injection by prefixing dangerous leading characters with a tab
    // Tab prefix is invisible to users but prevents formula execution across CSV parsers
    // This is more reliable than single quote prefix and works with all major spreadsheet apps
    if (hasInjectionRisk) {
      escaped = "\t" + escaped;
    }

    // Newlines (\n) and carriage returns (\r) are preserved inside quoted fields per RFC 4180
    // The wrapping in double quotes below ensures they are properly contained
    // No additional escaping needed as long as the field is properly quoted

    // Always wrap field in double quotes to preserve commas, newlines, and other special characters
    // This ensures proper CSV structure and prevents injection/malformation
    return `"${escaped}"`;
  }

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
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;
      const { jobId } = request.params as { jobId: string };
      const format =
        (request.query as { format?: "csv" | "json" }).format || "json";

      // Validate job_id format (must be valid UUID format: 8-4-4-4-12 hex chars)
      // Using permissive regex that accepts any valid UUID format including nil UUID
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(jobId)) {
        reply.code(400);
        return {
          success: false,
          error: {
            code: "INVALID_JOB_ID",
            message: "Invalid job_id format - must be a valid UUID",
          },
        };
      }

      try {
        // Check if user is admin
        const userRoles = await rbacService.getUserRoles(user.id);
        const isAdmin = userRoles.some((role) =>
          role.permissions?.includes(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
        );

        const job = await transactionService.getBulkImportJob(
          jobId,
          user.id,
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
                `${escapeCsvField(err.row_number)},${escapeCsvField(err.field)},${escapeCsvField(err.error)}`,
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
 * @param tempFilePath - Path to temp file containing the uploaded file content
 */
async function processBulkImport(
  jobId: string,
  tempFilePath: string,
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

    // Read file content from disk only when processing starts
    // This avoids keeping file content in memory during the upload response
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Safe: tempFilePath is constructed from controlled tempDir and UUID
    const fileContent = await fs.readFile(tempFilePath, "utf-8");

    // Parse file
    const parseResult =
      fileType === "CSV"
        ? parseCsvFile(fileContent)
        : parseJsonFile(fileContent);

    // If file parsing resulted in errors and no transactions, mark as failed
    // All rows failed to parse, so there are no valid transactions to process
    if (
      parseResult.errors.length > 0 &&
      parseResult.transactions.length === 0
    ) {
      await transactionService.updateBulkImportJob(jobId, {
        status: "FAILED",
        total_rows: parseResult.errors.length,
        error_rows: parseResult.errors.length,
        error_summary: parseResult.errors,
        completed_at: new Date(),
      });

      // Log parsing failure to AuditLog for compliance and debugging
      // This ensures all job status transitions to FAILED are audited
      await prisma.auditLog.create({
        data: {
          user_id: userId,
          action: "UPDATE",
          table_name: "bulk_import_jobs",
          record_id: jobId,
          old_values: { status: "PROCESSING" } as any,
          new_values: {
            status: "FAILED",
            total_rows: parseResult.errors.length,
            error_rows: parseResult.errors.length,
          } as any,
          reason: `Bulk import failed by ${userEmail}: All rows failed to parse. ${parseResult.errors.length} parsing error(s)`,
          ip_address: ipAddress,
          user_agent: userAgent,
        },
      });

      return;
    }

    // Update total rows
    await transactionService.updateBulkImportJob(jobId, {
      total_rows: parseResult.transactions.length + parseResult.errors.length,
    });

    // Validate each transaction and collect errors
    const validationErrors: Array<{
      row_number: number;
      field?: string;
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
        // XSS protection: Validate line item names for dangerous HTML/script content
        const xssPattern = /<script|<iframe|javascript:|onerror=|onload=/i;
        let hasXssInLineItems = false;
        for (const lineItem of validated.line_items) {
          if (lineItem.product_id) {
            // UUID format is already validated by schema, but we can add additional checks here
            // when Product model becomes available, we'll check: await prisma.product.findUnique({ where: { product_id: lineItem.product_id } })
            // For now, product_id format validation is sufficient (handled by schema)
          }
          // Check for XSS in line item name
          if (lineItem.name && xssPattern.test(lineItem.name)) {
            validationErrors.push({
              row_number: rowNumber,
              field: `line_items[${validated.line_items.indexOf(lineItem)}].name`,
              error: "Invalid name: HTML tags and scripts are not allowed",
            });
            hasXssInLineItems = true;
            break;
          }
        }
        if (hasXssInLineItems) {
          continue;
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
  } finally {
    // Clean up temp file after processing
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Safe: tempFilePath is constructed from controlled tempDir and UUID
      await fs.unlink(tempFilePath);
    } catch (cleanupError) {
      // Log but don't throw - cleanup errors shouldn't fail the job
      console.warn(
        `Failed to cleanup temp file ${tempFilePath}:`,
        cleanupError,
      );
    }
  }
}
