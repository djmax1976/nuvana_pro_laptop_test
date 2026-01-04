/**
 * Lottery Game Import Routes
 *
 * API endpoints for bulk importing lottery games via CSV.
 * Implements two-phase commit pattern for safe bulk operations.
 *
 * Endpoints:
 * - POST /api/lottery/games/import/validate - Validate CSV and get preview
 * - POST /api/lottery/games/import/commit - Commit validated import
 * - GET /api/lottery/games/import/template - Download CSV template
 * - GET /api/lottery/games/import/status/:token - Check import status
 *
 * @module routes/lottery-import
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { permissionMiddleware } from "../middleware/permission.middleware";
import { PERMISSIONS } from "../constants/permissions";
import { uploadBodyLimitBytes } from "../app";
import {
  validateImport,
  commitImport,
  getImportStatus,
  generateImportTemplate,
} from "../services/lottery-import.service";
import {
  ValidateImportRequestSchema,
  CommitImportRequestSchema,
} from "../schemas/lottery-import.schema";

// ============================================================================
// Route Definitions
// ============================================================================

export async function lotteryImportRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/lottery/games/import/validate
   *
   * Validate a CSV file and return preview with validation results.
   * This is phase 1 of the two-phase commit pattern.
   *
   * Request: multipart/form-data
   * - file: CSV file (max 5MB)
   * - state_id: UUID of target state
   * - options: JSON string with import options (optional)
   *
   * Response:
   * - valid: boolean
   * - preview: summary statistics
   * - validation_token: UUID for commit (if valid)
   * - expires_at: token expiry time
   * - rows: array of validated rows with status
   */
  fastify.post(
    "/api/lottery/games/import/validate",
    {
      bodyLimit: uploadBodyLimitBytes,
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_GAME_CREATE),
      ],
      schema: {
        description:
          "Validate a CSV file for lottery game import and return preview",
        tags: ["lottery", "import"],
        consumes: ["multipart/form-data"],
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  valid: { type: "boolean" },
                  preview: {
                    type: "object",
                    properties: {
                      total_rows: { type: "integer" },
                      valid_rows: { type: "integer" },
                      error_rows: { type: "integer" },
                      duplicate_rows: { type: "integer" },
                      games_to_create: { type: "integer" },
                      games_to_update: { type: "integer" },
                    },
                  },
                  validation_token: { type: "string", format: "uuid" },
                  expires_at: { type: "string", format: "date-time" },
                  rows: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        row_number: { type: "integer" },
                        status: {
                          type: "string",
                          enum: ["valid", "error", "duplicate"],
                        },
                        action: {
                          type: "string",
                          enum: ["create", "update", "skip"],
                          nullable: true,
                        },
                        data: {
                          type: "object",
                          additionalProperties: true,
                          properties: {
                            game_code: { type: "string" },
                            name: { type: "string" },
                            price: { type: "number" },
                            description: { type: "string", nullable: true },
                            pack_value: { type: "number" },
                            tickets_per_pack: {
                              type: "integer",
                              nullable: true,
                            },
                            status: { type: "string" },
                          },
                        },
                        errors: {
                          type: "array",
                          items: { type: "string" },
                        },
                        existing_game: {
                          type: "object",
                          properties: {
                            game_id: { type: "string", format: "uuid" },
                            name: { type: "string" },
                            price: { type: "number" },
                            status: { type: "string" },
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
                  details: { type: "array", items: { type: "string" } },
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
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as UserIdentity;

      try {
        // Parse multipart form data
        const data = await request.file();

        if (!data) {
          return reply.status(400).send({
            success: false,
            error: {
              code: "FILE_REQUIRED",
              message: "CSV file is required",
            },
          });
        }

        // Validate MIME type
        const allowedMimeTypes = [
          "text/csv",
          "application/csv",
          "text/plain",
          "application/vnd.ms-excel",
        ];
        if (
          data.mimetype &&
          !allowedMimeTypes.includes(data.mimetype.toLowerCase())
        ) {
          return reply.status(400).send({
            success: false,
            error: {
              code: "INVALID_FILE_TYPE",
              message: `Invalid file type: ${data.mimetype}. Expected CSV file.`,
            },
          });
        }

        // Read file buffer
        const fileBuffer = await data.toBuffer();

        // Note: @fastify/multipart doesn't provide fields when using request.file()
        // We need to use request.parts() for mixed file and fields
        // For simplicity, we'll require state_id as query parameter
        const query = request.query as { state_id?: string; options?: string };

        // Validate request parameters
        const parseResult = ValidateImportRequestSchema.safeParse({
          state_id: query.state_id,
          options: query.options,
        });

        if (!parseResult.success) {
          return reply.status(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid request parameters",
              details: parseResult.error.issues.map((i) => i.message),
            },
          });
        }

        const { state_id, options } = parseResult.data;

        // Perform validation
        const result = await validateImport({
          fileBuffer,
          stateId: state_id,
          userId: user.id,
          options,
        });

        if (!result.success) {
          return reply.status(400).send({
            success: false,
            error: {
              code: "VALIDATION_FAILED",
              message: "File validation failed",
              details: result.errors,
            },
            data: {
              valid: false,
              preview: result.preview,
              rows: result.rows,
            },
          });
        }

        return reply.send({
          success: true,
          data: {
            valid: true,
            preview: result.preview,
            validation_token: result.validationToken,
            expires_at: result.expiresAt?.toISOString(),
            rows: result.rows,
          },
        });
      } catch (error: any) {
        request.log.error({ error }, "Failed to validate import");
        return reply.status(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to process import file",
          },
        });
      }
    },
  );

  /**
   * POST /api/lottery/games/import/commit
   *
   * Commit a validated import using the validation token.
   * This is phase 2 of the two-phase commit pattern.
   *
   * Request body:
   * - validation_token: UUID from validate response
   * - options: commit options (skip_errors, update_duplicates)
   *
   * Response:
   * - success: boolean
   * - summary: counts of created/updated/skipped/failed
   * - created_games: array of created game references
   * - errors: array of row-level errors
   */
  fastify.post(
    "/api/lottery/games/import/commit",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_GAME_CREATE),
      ],
      schema: {
        description: "Commit a validated lottery game import",
        tags: ["lottery", "import"],
        body: {
          type: "object",
          required: ["validation_token"],
          properties: {
            validation_token: { type: "string", format: "uuid" },
            options: {
              type: "object",
              properties: {
                skip_errors: { type: "boolean", default: true },
                update_duplicates: { type: "boolean", default: false },
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
                  summary: {
                    type: "object",
                    properties: {
                      created: { type: "integer" },
                      updated: { type: "integer" },
                      skipped: { type: "integer" },
                      failed: { type: "integer" },
                    },
                  },
                  created_games: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        game_id: { type: "string", format: "uuid" },
                        game_code: { type: "string" },
                        name: { type: "string" },
                        price: { type: "number" },
                        row_number: { type: "integer" },
                      },
                    },
                  },
                  errors: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        row_number: { type: "integer" },
                        error: { type: "string" },
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
      const body = request.body as any;

      // Validate request body
      const parseResult = CommitImportRequestSchema.safeParse(body);

      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: parseResult.error.issues[0]?.message || "Invalid request",
          },
        });
      }

      const { validation_token, options } = parseResult.data;

      try {
        const result = await commitImport({
          validationToken: validation_token,
          userId: user.id,
          options,
        });

        if (
          !result.success &&
          result.errors.length > 0 &&
          result.errors[0].row_number === 0
        ) {
          // System-level error (token not found, expired, etc.)
          const errorMessage = result.errors[0].error;

          if (errorMessage.includes("Invalid validation token")) {
            return reply.status(404).send({
              success: false,
              error: {
                code: "TOKEN_NOT_FOUND",
                message: errorMessage,
              },
            });
          }

          if (errorMessage.includes("expired")) {
            return reply.status(400).send({
              success: false,
              error: {
                code: "TOKEN_EXPIRED",
                message: errorMessage,
              },
            });
          }

          if (errorMessage.includes("already been committed")) {
            return reply.status(400).send({
              success: false,
              error: {
                code: "ALREADY_COMMITTED",
                message: errorMessage,
              },
            });
          }

          return reply.status(400).send({
            success: false,
            error: {
              code: "COMMIT_FAILED",
              message: errorMessage,
            },
          });
        }

        return reply.send({
          success: true,
          data: {
            summary: result.summary,
            created_games: result.createdGames,
            errors: result.errors,
          },
        });
      } catch (error: any) {
        request.log.error({ error }, "Failed to commit import");
        return reply.status(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to commit import",
          },
        });
      }
    },
  );

  /**
   * GET /api/lottery/games/import/template
   *
   * Download a sample CSV template for lottery game import.
   * Returns a CSV file with headers and sample data.
   */
  fastify.get(
    "/api/lottery/games/import/template",
    {
      preHandler: [authMiddleware],
      schema: {
        description: "Download CSV template for lottery game import",
        tags: ["lottery", "import"],
        response: {
          200: {
            type: "string",
            description: "CSV file content",
          },
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const template = generateImportTemplate();

      reply.header("Content-Type", "text/csv");
      reply.header(
        "Content-Disposition",
        'attachment; filename="lottery_games_import_template.csv"',
      );

      return reply.send(template);
    },
  );

  /**
   * GET /api/lottery/games/import/status/:token
   *
   * Check the status of a validation token.
   * Returns whether token is valid, expired, or already committed.
   */
  fastify.get(
    "/api/lottery/games/import/status/:token",
    {
      preHandler: [authMiddleware],
      schema: {
        description: "Check status of a validation token",
        tags: ["lottery", "import"],
        params: {
          type: "object",
          required: ["token"],
          properties: {
            token: { type: "string", format: "uuid" },
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
                  import_id: { type: "string", format: "uuid" },
                  validation_token: { type: "string", format: "uuid" },
                  state: {
                    type: "object",
                    properties: {
                      code: { type: "string" },
                      name: { type: "string" },
                    },
                  },
                  total_rows: { type: "integer" },
                  valid_rows: { type: "integer" },
                  error_rows: { type: "integer" },
                  duplicate_rows: { type: "integer" },
                  expires_at: { type: "string", format: "date-time" },
                  is_expired: { type: "boolean" },
                  is_committed: { type: "boolean" },
                  committed_at: {
                    type: "string",
                    format: "date-time",
                    nullable: true,
                  },
                  commit_result: { type: "object", nullable: true },
                  created_at: { type: "string", format: "date-time" },
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
      const { token } = request.params as { token: string };

      const status = await getImportStatus(token);

      if (!status) {
        return reply.status(404).send({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Validation token not found",
          },
        });
      }

      return reply.send({
        success: true,
        data: {
          ...status,
          expires_at: status.expires_at.toISOString(),
          committed_at: status.committed_at?.toISOString() || null,
          created_at: status.created_at.toISOString(),
        },
      });
    },
  );
}
