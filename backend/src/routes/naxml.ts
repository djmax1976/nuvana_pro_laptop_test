/**
 * NAXML File Management Routes
 *
 * API endpoints for managing NAXML file processing, file watcher service,
 * and scheduled exports.
 * Phase 1: NAXML Core Infrastructure
 * Phase 2: Gilbarco NAXML Adapter - File Watcher API & Scheduled Exports
 *
 * Routes:
 *
 * File Management:
 * - GET    /api/stores/:storeId/naxml/files                    - List NAXML file logs with filtering
 * - GET    /api/stores/:storeId/naxml/files/stats              - Get file processing statistics
 * - GET    /api/stores/:storeId/naxml/files/recent             - Get recent file activity
 * - GET    /api/stores/:storeId/naxml/files/failed             - Get failed file processing entries
 * - GET    /api/stores/:storeId/naxml/files/:fileLogId         - Get file log details
 * - POST   /api/stores/:storeId/naxml/files/import             - Manual file import
 *
 * One-Time Exports:
 * - POST   /api/stores/:storeId/naxml/export/departments       - Export departments to NAXML
 * - POST   /api/stores/:storeId/naxml/export/tender-types      - Export tender types to NAXML
 * - POST   /api/stores/:storeId/naxml/export/tax-rates         - Export tax rates to NAXML
 * - POST   /api/stores/:storeId/naxml/export/price-book        - Export price book to NAXML
 *
 * File Watcher:
 * - GET    /api/stores/:storeId/naxml/watcher                  - Get watcher config/status
 * - POST   /api/stores/:storeId/naxml/watcher                  - Create watcher config
 * - PATCH  /api/stores/:storeId/naxml/watcher                  - Update watcher config
 * - POST   /api/stores/:storeId/naxml/watcher/start            - Start file watcher
 * - POST   /api/stores/:storeId/naxml/watcher/stop             - Stop file watcher
 * - GET    /api/stores/:storeId/naxml/watcher/status           - Get real-time watcher status
 *
 * Scheduled Exports:
 * - GET    /api/stores/:storeId/naxml/schedules                - List scheduled exports
 * - POST   /api/stores/:storeId/naxml/schedules                - Create scheduled export
 * - GET    /api/stores/:storeId/naxml/schedules/:scheduleId    - Get scheduled export details
 * - PATCH  /api/stores/:storeId/naxml/schedules/:scheduleId    - Update scheduled export
 * - DELETE /api/stores/:storeId/naxml/schedules/:scheduleId    - Delete scheduled export
 * - POST   /api/stores/:storeId/naxml/schedules/:scheduleId/execute - Manual trigger export
 * - POST   /api/stores/:storeId/naxml/schedules/:scheduleId/pause   - Pause scheduled export
 * - POST   /api/stores/:storeId/naxml/schedules/:scheduleId/resume  - Resume scheduled export
 * - GET    /api/stores/:storeId/naxml/schedules/:scheduleId/history - Get export execution history
 *
 * @module routes/naxml
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { permissionMiddleware } from "../middleware/permission.middleware";
import {
  NAXML_FILE_READ,
  NAXML_FILE_IMPORT,
  NAXML_FILE_EXPORT,
  NAXML_WATCHER_READ,
  NAXML_WATCHER_MANAGE,
} from "../constants/permissions";
import { prisma } from "../utils/db";
import {
  StoreIdParamSchema,
  FileLogIdParamSchema,
  NAXMLFileLogQuerySchema,
  FileWatcherConfigCreateSchema,
  FileWatcherConfigUpdateSchema,
  ManualFileImportSchema,
  ExportDepartmentsSchema,
  ExportTenderTypesSchema,
  ExportTaxRatesSchema,
  ExportPriceBookSchema,
  ScheduledExportQuerySchema,
  CreateScheduledExportSchema,
  UpdateScheduledExportSchema,
  ScheduleIdParamSchema,
  ExecuteExportSchema,
} from "../schemas/naxml.schema";
import { getFileWatcherService } from "../services/pos/file-watcher.service";
import { NAXMLService } from "../services/naxml/naxml.service";
import * as fileLogService from "../services/pos/file-processing-status.service";
import * as scheduledExportService from "../services/naxml/scheduled-export.service";

/**
 * Verify user has access to the store
 * Returns the store if access is granted, throws otherwise
 */
async function verifyStoreAccess(
  storeId: string,
  user: UserIdentity,
): Promise<{ store_id: string; company_id: string }> {
  const store = await prisma.store.findUnique({
    where: { store_id: storeId },
    select: { store_id: true, company_id: true },
  });

  if (!store) {
    throw { statusCode: 404, message: "Store not found" };
  }

  // System admin has access to all stores
  if (user.is_system_admin) {
    return store;
  }

  // Check if user has access to this store
  const hasAccess =
    user.store_ids?.includes(storeId) ||
    user.company_ids?.includes(store.company_id) ||
    user.client_id === store.company_id;

  if (!hasAccess) {
    throw { statusCode: 403, message: "Access denied to this store" };
  }

  return store;
}

/**
 * Get POS integration for store (required for NAXML operations)
 */
async function getStoreIntegration(storeId: string) {
  const integration = await prisma.pOSIntegration.findUnique({
    where: { store_id: storeId },
  });

  if (!integration) {
    throw {
      statusCode: 404,
      message:
        "No POS integration found for this store. Please configure POS integration first.",
    };
  }

  return integration;
}

/**
 * Register NAXML file management routes
 */
export async function naxmlRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/stores/:storeId/naxml/files
   * List NAXML file processing logs with filtering and pagination
   *
   * Uses the file-processing-status service for querying file logs.
   *
   * Requires: NAXML_FILE_READ permission
   */
  fastify.get(
    "/files",
    {
      preHandler: [authMiddleware, permissionMiddleware(NAXML_FILE_READ)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = StoreIdParamSchema.safeParse(request.params);
        const queryResult = NAXMLFileLogQuerySchema.safeParse(request.query);

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        if (!queryResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: queryResult.error.issues[0].message,
            },
          });
        }

        const { storeId } = paramsResult.data;
        await verifyStoreAccess(storeId, user);

        const {
          limit,
          offset,
          status,
          file_type,
          direction,
          from_date,
          to_date,
        } = queryResult.data;

        // Use file log service for querying
        const result = await fileLogService.queryFileLogs({
          storeId,
          status: status as any,
          fileType: file_type as any,
          direction: direction as any,
          fromDate: from_date ? new Date(from_date) : undefined,
          toDate: to_date ? new Date(to_date) : undefined,
          limit,
          offset,
        });

        // Convert BigInt to string for JSON serialization
        const serializedLogs = result.logs.map((log) => ({
          ...log,
          fileSizeBytes: log.fileSizeBytes.toString(),
        }));

        return reply.send({
          success: true,
          data: serializedLogs,
          pagination: {
            total: result.total,
            limit,
            offset,
            hasMore: offset + result.logs.length < result.total,
          },
        });
      } catch (error: any) {
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to list NAXML file logs");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to list NAXML file logs",
          },
        });
      }
    },
  );

  /**
   * GET /api/stores/:storeId/naxml/files/stats
   * Get file processing statistics for the store
   *
   * Returns aggregated statistics including success/failure counts,
   * average processing times, and breakdowns by file type and direction.
   *
   * Requires: NAXML_FILE_READ permission
   */
  fastify.get(
    "/files/stats",
    {
      preHandler: [authMiddleware, permissionMiddleware(NAXML_FILE_READ)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = StoreIdParamSchema.safeParse(request.params);

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        const { storeId } = paramsResult.data;
        await verifyStoreAccess(storeId, user);

        // Parse optional date range from query
        const query = request.query as { from_date?: string; to_date?: string };
        const fromDate = query.from_date
          ? new Date(query.from_date)
          : undefined;
        const toDate = query.to_date ? new Date(query.to_date) : undefined;

        // Get stats from service
        const stats = await fileLogService.getFileProcessingStats(
          storeId,
          fromDate,
          toDate,
        );

        return reply.send({
          success: true,
          data: stats,
        });
      } catch (error: any) {
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to get file processing stats");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to get file processing statistics",
          },
        });
      }
    },
  );

  /**
   * GET /api/stores/:storeId/naxml/files/recent
   * Get recent file processing activity for the store
   *
   * Returns the most recently processed files, useful for dashboards
   * and monitoring interfaces.
   *
   * Requires: NAXML_FILE_READ permission
   */
  fastify.get(
    "/files/recent",
    {
      preHandler: [authMiddleware, permissionMiddleware(NAXML_FILE_READ)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = StoreIdParamSchema.safeParse(request.params);

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        const { storeId } = paramsResult.data;
        await verifyStoreAccess(storeId, user);

        // Parse optional limit from query (default 10)
        const query = request.query as { limit?: string };
        const limit = query.limit ? parseInt(query.limit, 10) : 10;

        // Get recent activity from service
        const logs = await fileLogService.getRecentActivity(storeId, limit);

        // Convert BigInt to string for JSON serialization
        const serializedLogs = logs.map((log) => ({
          ...log,
          fileSizeBytes: log.fileSizeBytes.toString(),
        }));

        return reply.send({
          success: true,
          data: serializedLogs,
        });
      } catch (error: any) {
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to get recent file activity");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to get recent file activity",
          },
        });
      }
    },
  );

  /**
   * GET /api/stores/:storeId/naxml/files/failed
   * Get failed file processing entries for retry/debugging
   *
   * Returns files that failed to process, useful for identifying
   * and resolving processing issues.
   *
   * Requires: NAXML_FILE_READ permission
   */
  fastify.get(
    "/files/failed",
    {
      preHandler: [authMiddleware, permissionMiddleware(NAXML_FILE_READ)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = StoreIdParamSchema.safeParse(request.params);

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        const { storeId } = paramsResult.data;
        await verifyStoreAccess(storeId, user);

        // Parse optional limit from query (default 100)
        const query = request.query as { limit?: string };
        const limit = query.limit ? parseInt(query.limit, 10) : 100;

        // Get failed files from service
        const logs = await fileLogService.getFailedFiles(storeId, limit);

        // Convert BigInt to string for JSON serialization
        const serializedLogs = logs.map((log) => ({
          ...log,
          fileSizeBytes: log.fileSizeBytes.toString(),
        }));

        return reply.send({
          success: true,
          data: serializedLogs,
        });
      } catch (error: any) {
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to get failed file logs");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to get failed file logs",
          },
        });
      }
    },
  );

  /**
   * GET /api/stores/:storeId/naxml/files/:fileLogId
   * Get details of a specific file log entry
   *
   * Uses the file-processing-status service for retrieving file log details.
   *
   * Requires: NAXML_FILE_READ permission
   */
  fastify.get(
    "/files/:fileLogId",
    {
      preHandler: [authMiddleware, permissionMiddleware(NAXML_FILE_READ)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = FileLogIdParamSchema.safeParse(request.params);

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        const { storeId, fileLogId } = paramsResult.data;
        await verifyStoreAccess(storeId, user);

        // Use service to get file log
        const fileLog = await fileLogService.getFileLog(fileLogId);

        if (!fileLog || fileLog.storeId !== storeId) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "File log not found",
            },
          });
        }

        // Convert BigInt to string for JSON serialization
        const serializedLog = {
          ...fileLog,
          fileSizeBytes: fileLog.fileSizeBytes.toString(),
        };

        return reply.send({
          success: true,
          data: serializedLog,
        });
      } catch (error: any) {
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to get NAXML file log");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to get NAXML file log",
          },
        });
      }
    },
  );

  /**
   * POST /api/stores/:storeId/naxml/files/import
   * Manual NAXML file import
   *
   * Supports two import modes:
   * 1. File Path Mode: Import from a server-side file path
   *    - file_path: Path to file on server filesystem
   *
   * 2. Content Mode: Import from provided XML content
   *    - content: Raw XML or base64-encoded XML content
   *    - file_name: Original file name for logging
   *    - is_base64: Whether content is base64 encoded (default: false)
   *
   * Common options:
   * - file_type: Optional document type hint
   * - process_sync: Process synchronously and return result (default: true)
   *
   * Requires: NAXML_FILE_IMPORT permission
   *
   * @returns 200 - Import processed successfully (sync mode)
   * @returns 400 - Validation error
   * @returns 404 - Store or integration not found
   * @returns 422 - File validation/processing failed
   * @returns 500 - Internal server error
   */
  fastify.post(
    "/files/import",
    {
      preHandler: [authMiddleware, permissionMiddleware(NAXML_FILE_IMPORT)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = StoreIdParamSchema.safeParse(request.params);
        const bodyResult = ManualFileImportSchema.safeParse(request.body);

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        if (!bodyResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: bodyResult.error.issues[0].message,
              details: bodyResult.error.issues,
            },
          });
        }

        const { storeId } = paramsResult.data;
        const store = await verifyStoreAccess(storeId, user);
        const integration = await getStoreIntegration(storeId);

        const {
          file_path,
          content,
          file_name,
          is_base64,
          file_type,
          process_sync: _process_sync,
        } = bodyResult.data;

        // Build context for processing
        const storeContext = {
          storeId,
          posIntegrationId: integration.pos_integration_id,
          companyId: store.company_id,
          userId: user.id,
        };

        const watcherService = getFileWatcherService();
        let result;

        // Determine import mode: file path or content
        if (file_path) {
          // File Path Mode: Import from server filesystem
          request.log.info(
            {
              storeId,
              filePath: file_path,
              fileType: file_type,
              userId: user.id,
            },
            "Processing manual NAXML file import",
          );

          result = await watcherService.queueManualImport(
            storeId,
            file_path,
            file_type,
            storeContext,
          );
        } else if (content && file_name) {
          // Content Mode: Import from provided content
          let xmlContent = content;

          // Decode base64 if specified
          if (is_base64) {
            try {
              xmlContent = Buffer.from(content, "base64").toString("utf-8");
            } catch (decodeError) {
              return reply.code(400).send({
                success: false,
                error: {
                  code: "INVALID_BASE64",
                  message: "Failed to decode base64 content",
                },
              });
            }
          }

          request.log.info(
            {
              storeId,
              fileName: file_name,
              fileType: file_type,
              contentSize: xmlContent.length,
              userId: user.id,
            },
            "Processing manual NAXML content import",
          );

          result = await watcherService.processContent(
            storeId,
            xmlContent,
            file_name,
            storeContext,
          );
        } else {
          // This should never happen due to schema validation
          return reply.code(400).send({
            success: false,
            error: {
              code: "INVALID_REQUEST",
              message:
                "Either file_path or (content and file_name) must be provided",
            },
          });
        }

        // Return appropriate response based on result
        if (result.success) {
          request.log.info(
            {
              storeId,
              fileName: result.fileName,
              recordCount: result.recordCount,
              processingTimeMs: result.processingTimeMs,
            },
            "Manual NAXML import completed successfully",
          );

          return reply.code(200).send({
            success: true,
            message: "File imported successfully",
            data: {
              store_id: storeId,
              pos_integration_id: integration.pos_integration_id,
              file_name: result.fileName,
              file_hash: result.fileHash,
              file_size: result.fileSize,
              document_type: result.documentType,
              record_count: result.recordCount,
              status: result.status,
              processing_time_ms: result.processingTimeMs,
              moved_to: result.movedTo,
            },
          });
        } else {
          // Import failed or was skipped
          request.log.warn(
            {
              storeId,
              fileName: result.fileName,
              status: result.status,
              errorMessage: result.errorMessage,
            },
            "Manual NAXML import failed or skipped",
          );

          // Use 422 for validation/processing failures, 409 for duplicates
          const statusCode = result.status === "SKIPPED" ? 409 : 422;

          return reply.code(statusCode).send({
            success: false,
            error: {
              code:
                result.status === "SKIPPED"
                  ? "DUPLICATE_FILE"
                  : "PROCESSING_FAILED",
              message: result.errorMessage || "File processing failed",
            },
            data: {
              store_id: storeId,
              file_name: result.fileName,
              file_hash: result.fileHash,
              file_size: result.fileSize,
              status: result.status,
              processing_time_ms: result.processingTimeMs,
            },
          });
        }
      } catch (error: any) {
        // Handle file watcher errors
        if (error.code && error.code.startsWith("FILE_WATCHER_")) {
          const statusCode =
            error.code === "FILE_WATCHER_FILE_NOT_FOUND"
              ? 404
              : error.code === "FILE_WATCHER_PATH_TRAVERSAL"
                ? 400
                : error.code === "FILE_WATCHER_PERMISSION_DENIED"
                  ? 403
                  : 422;

          return reply.code(statusCode).send({
            success: false,
            error: {
              code: error.code,
              message: error.message,
            },
          });
        }

        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to process manual import");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to process manual import",
          },
        });
      }
    },
  );

  /**
   * POST /api/stores/:storeId/naxml/export/departments
   * Export departments to NAXML format
   *
   * Requires: NAXML_FILE_EXPORT permission
   */
  fastify.post(
    "/export/departments",
    {
      preHandler: [authMiddleware, permissionMiddleware(NAXML_FILE_EXPORT)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = StoreIdParamSchema.safeParse(request.params);
        const bodyResult = ExportDepartmentsSchema.safeParse(
          request.body || {},
        );

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        if (!bodyResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: bodyResult.error.issues[0].message,
            },
          });
        }

        const { storeId } = paramsResult.data;
        const store = await verifyStoreAccess(storeId, user);
        const integration = await getStoreIntegration(storeId);

        const { maintenance_type, department_ids } = bodyResult.data;

        // Build department filter
        const departmentWhere: any = {
          company_id: store.company_id,
          is_active: true,
        };

        if (department_ids && department_ids.length > 0) {
          departmentWhere.department_id = { in: department_ids };
        }

        // Fetch departments
        const departments = await prisma.department.findMany({
          where: departmentWhere,
          orderBy: { code: "asc" },
        });

        if (departments.length === 0) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NO_DATA",
              message: "No departments found to export",
            },
          });
        }

        // Create NAXML service and build export
        const naxmlService = new NAXMLService({
          version: (integration.naxml_version as any) || "3.4",
        });

        const naxmlDepartments = departments.map((dept) => ({
          departmentCode: dept.code,
          description: dept.display_name,
          isTaxable: dept.is_taxable,
          taxRateCode: dept.default_tax_rate_id ?? undefined,
          minimumAge: dept.minimum_age ?? undefined,
          isActive: dept.is_active,
          sortOrder: dept.sort_order,
        }));

        const xml = naxmlService.buildDepartmentDocument(
          storeId,
          naxmlDepartments,
          maintenance_type,
        );

        // Log the export
        await prisma.nAXMLFileLog.create({
          data: {
            store_id: storeId,
            pos_integration_id: integration.pos_integration_id,
            file_name: `DeptMaint_${storeId}_${Date.now()}.xml`,
            file_type: "DepartmentMaintenance",
            direction: "EXPORT",
            status: "SUCCESS",
            record_count: departments.length,
            file_size_bytes: Buffer.byteLength(xml, "utf-8"),
            file_hash: require("crypto")
              .createHash("sha256")
              .update(xml)
              .digest("hex"),
            processed_at: new Date(),
          },
        });

        request.log.info(
          { storeId, departmentCount: departments.length, userId: user.id },
          "Departments exported to NAXML",
        );

        // Return XML with appropriate content type
        reply.header("Content-Type", "application/xml");
        reply.header(
          "Content-Disposition",
          `attachment; filename="DeptMaint_${storeId}_${Date.now()}.xml"`,
        );
        return reply.send(xml);
      } catch (error: any) {
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to export departments");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to export departments",
          },
        });
      }
    },
  );

  /**
   * POST /api/stores/:storeId/naxml/export/tender-types
   * Export tender types to NAXML format
   *
   * Requires: NAXML_FILE_EXPORT permission
   */
  fastify.post(
    "/export/tender-types",
    {
      preHandler: [authMiddleware, permissionMiddleware(NAXML_FILE_EXPORT)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = StoreIdParamSchema.safeParse(request.params);
        const bodyResult = ExportTenderTypesSchema.safeParse(
          request.body || {},
        );

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        if (!bodyResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: bodyResult.error.issues[0].message,
            },
          });
        }

        const { storeId } = paramsResult.data;
        const store = await verifyStoreAccess(storeId, user);
        const integration = await getStoreIntegration(storeId);

        const { maintenance_type, tender_type_ids } = bodyResult.data;

        // Build tender type filter
        const tenderWhere: any = {
          client_id: store.company_id,
          is_active: true,
        };

        if (tender_type_ids && tender_type_ids.length > 0) {
          tenderWhere.tender_type_id = { in: tender_type_ids };
        }

        // Fetch tender types
        const tenderTypes = await prisma.tenderType.findMany({
          where: tenderWhere,
          orderBy: { code: "asc" },
        });

        if (tenderTypes.length === 0) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NO_DATA",
              message: "No tender types found to export",
            },
          });
        }

        // Create NAXML service and build export
        const naxmlService = new NAXMLService({
          version: (integration.naxml_version as any) || "3.4",
        });

        const naxmlTenders = tenderTypes.map((tender) => ({
          tenderCode: tender.code,
          description: tender.display_name,
          isCashEquivalent: tender.is_cash_equivalent,
          isElectronic: tender.is_electronic,
          affectsCashDrawer: tender.affects_cash_drawer,
          requiresReference: tender.requires_reference,
          isActive: tender.is_active,
          sortOrder: tender.sort_order,
        }));

        const xml = naxmlService.buildTenderDocument(
          storeId,
          naxmlTenders,
          maintenance_type,
        );

        // Log the export
        await prisma.nAXMLFileLog.create({
          data: {
            store_id: storeId,
            pos_integration_id: integration.pos_integration_id,
            file_name: `TenderMaint_${storeId}_${Date.now()}.xml`,
            file_type: "TenderMaintenance",
            direction: "EXPORT",
            status: "SUCCESS",
            record_count: tenderTypes.length,
            file_size_bytes: Buffer.byteLength(xml, "utf-8"),
            file_hash: require("crypto")
              .createHash("sha256")
              .update(xml)
              .digest("hex"),
            processed_at: new Date(),
          },
        });

        request.log.info(
          { storeId, tenderCount: tenderTypes.length, userId: user.id },
          "Tender types exported to NAXML",
        );

        reply.header("Content-Type", "application/xml");
        reply.header(
          "Content-Disposition",
          `attachment; filename="TenderMaint_${storeId}_${Date.now()}.xml"`,
        );
        return reply.send(xml);
      } catch (error: any) {
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to export tender types");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to export tender types",
          },
        });
      }
    },
  );

  /**
   * POST /api/stores/:storeId/naxml/export/tax-rates
   * Export tax rates to NAXML format
   *
   * Requires: NAXML_FILE_EXPORT permission
   */
  fastify.post(
    "/export/tax-rates",
    {
      preHandler: [authMiddleware, permissionMiddleware(NAXML_FILE_EXPORT)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = StoreIdParamSchema.safeParse(request.params);
        const bodyResult = ExportTaxRatesSchema.safeParse(request.body || {});

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        if (!bodyResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: bodyResult.error.issues[0].message,
            },
          });
        }

        const { storeId } = paramsResult.data;
        const store = await verifyStoreAccess(storeId, user);
        const integration = await getStoreIntegration(storeId);

        const { maintenance_type, tax_rate_ids } = bodyResult.data;

        // Build tax rate filter
        const taxWhere: any = {
          client_id: store.company_id,
          is_active: true,
        };

        if (tax_rate_ids && tax_rate_ids.length > 0) {
          taxWhere.tax_rate_id = { in: tax_rate_ids };
        }

        // Fetch tax rates
        const taxRates = await prisma.taxRate.findMany({
          where: taxWhere,
          orderBy: { code: "asc" },
        });

        if (taxRates.length === 0) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NO_DATA",
              message: "No tax rates found to export",
            },
          });
        }

        // Create NAXML service and build export
        const naxmlService = new NAXMLService({
          version: (integration.naxml_version as any) || "3.4",
        });

        const naxmlTaxRates = taxRates.map((tax) => ({
          taxRateCode: tax.code,
          description: tax.display_name,
          rate: tax.rate.toNumber(),
          isActive: tax.is_active,
          jurisdictionCode: tax.jurisdiction_code ?? undefined,
          taxType: tax.rate_type,
          effectiveDate: tax.effective_from?.toISOString(),
          expirationDate: tax.effective_to?.toISOString(),
        }));

        const xml = naxmlService.buildTaxRateDocument(
          storeId,
          naxmlTaxRates,
          maintenance_type,
        );

        // Log the export
        await prisma.nAXMLFileLog.create({
          data: {
            store_id: storeId,
            pos_integration_id: integration.pos_integration_id,
            file_name: `TaxMaint_${storeId}_${Date.now()}.xml`,
            file_type: "TaxRateMaintenance",
            direction: "EXPORT",
            status: "SUCCESS",
            record_count: taxRates.length,
            file_size_bytes: Buffer.byteLength(xml, "utf-8"),
            file_hash: require("crypto")
              .createHash("sha256")
              .update(xml)
              .digest("hex"),
            processed_at: new Date(),
          },
        });

        request.log.info(
          { storeId, taxRateCount: taxRates.length, userId: user.id },
          "Tax rates exported to NAXML",
        );

        reply.header("Content-Type", "application/xml");
        reply.header(
          "Content-Disposition",
          `attachment; filename="TaxMaint_${storeId}_${Date.now()}.xml"`,
        );
        return reply.send(xml);
      } catch (error: any) {
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to export tax rates");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to export tax rates",
          },
        });
      }
    },
  );

  /**
   * POST /api/stores/:storeId/naxml/export/price-book
   * Export price book to NAXML format (placeholder - requires item master)
   *
   * Requires: NAXML_FILE_EXPORT permission
   */
  fastify.post(
    "/export/price-book",
    {
      preHandler: [authMiddleware, permissionMiddleware(NAXML_FILE_EXPORT)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = StoreIdParamSchema.safeParse(request.params);
        const bodyResult = ExportPriceBookSchema.safeParse(request.body || {});

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        if (!bodyResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: bodyResult.error.issues[0].message,
            },
          });
        }

        const { storeId } = paramsResult.data;
        await verifyStoreAccess(storeId, user);
        await getStoreIntegration(storeId);

        // Price book export requires item master which is not yet implemented
        return reply.code(501).send({
          success: false,
          error: {
            code: "NOT_IMPLEMENTED",
            message:
              "Price book export requires item master functionality. This will be available in Phase 2.",
          },
        });
      } catch (error: any) {
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to export price book");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to export price book",
          },
        });
      }
    },
  );

  /**
   * GET /api/stores/:storeId/naxml/watcher
   * Get file watcher configuration and status
   *
   * Requires: NAXML_WATCHER_READ permission
   */
  fastify.get(
    "/watcher",
    {
      preHandler: [authMiddleware, permissionMiddleware(NAXML_WATCHER_READ)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = StoreIdParamSchema.safeParse(request.params);

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        const { storeId } = paramsResult.data;
        await verifyStoreAccess(storeId, user);

        // Get watcher config
        const config = await prisma.pOSFileWatcherConfig.findUnique({
          where: { store_id: storeId },
        });

        // Get watcher service status
        const watcherService = getFileWatcherService();
        const isRunning = watcherService.isWatchingStore(storeId);

        if (!config) {
          return reply.send({
            success: true,
            data: {
              configured: false,
              is_running: false,
              message: "File watcher not configured for this store",
            },
          });
        }

        return reply.send({
          success: true,
          data: {
            configured: true,
            is_running: isRunning,
            config: {
              config_id: config.config_id,
              store_id: config.store_id,
              watch_path: config.watch_path,
              processed_path: config.processed_path,
              error_path: config.error_path,
              file_patterns: config.file_patterns,
              poll_interval_seconds: config.poll_interval_seconds,
              is_active: config.is_active,
              last_poll_at: config.last_poll_at,
              last_file_processed_at: config.last_file_processed_at,
              files_processed: config.files_processed,
              files_errored: config.files_errored,
              created_at: config.created_at,
              updated_at: config.updated_at,
            },
          },
        });
      } catch (error: any) {
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to get watcher config");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to get watcher configuration",
          },
        });
      }
    },
  );

  /**
   * POST /api/stores/:storeId/naxml/watcher
   * Create file watcher configuration
   *
   * Requires: NAXML_WATCHER_MANAGE permission
   */
  fastify.post(
    "/watcher",
    {
      preHandler: [authMiddleware, permissionMiddleware(NAXML_WATCHER_MANAGE)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = StoreIdParamSchema.safeParse(request.params);
        const bodyResult = FileWatcherConfigCreateSchema.safeParse(
          request.body,
        );

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        if (!bodyResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: bodyResult.error.issues[0].message,
              details: bodyResult.error.issues,
            },
          });
        }

        const { storeId } = paramsResult.data;
        await verifyStoreAccess(storeId, user);

        // Check if config already exists
        const existing = await prisma.pOSFileWatcherConfig.findUnique({
          where: { store_id: storeId },
        });

        if (existing) {
          return reply.code(409).send({
            success: false,
            error: {
              code: "ALREADY_EXISTS",
              message:
                "File watcher configuration already exists for this store. Use PATCH to update.",
            },
          });
        }

        const {
          watch_path,
          processed_path,
          error_path,
          file_patterns,
          poll_interval_seconds,
          is_active,
        } = bodyResult.data;

        // Get POS integration for this store (required for watcher)
        const integration = await getStoreIntegration(storeId);

        // Create config
        const config = await prisma.pOSFileWatcherConfig.create({
          data: {
            store_id: storeId,
            pos_integration_id: integration.pos_integration_id,
            watch_path,
            processed_path,
            error_path,
            file_patterns: file_patterns || ["*.xml", "TLog*.xml", "Dept*.xml"],
            poll_interval_seconds: poll_interval_seconds || 60,
            is_active: is_active ?? true,
          },
        });

        request.log.info(
          { storeId, configId: config.config_id, userId: user.id },
          "File watcher configuration created",
        );

        return reply.code(201).send({
          success: true,
          data: config,
          message: "File watcher configuration created successfully",
        });
      } catch (error: any) {
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to create watcher config");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to create watcher configuration",
          },
        });
      }
    },
  );

  /**
   * PATCH /api/stores/:storeId/naxml/watcher
   * Update file watcher configuration
   *
   * Requires: NAXML_WATCHER_MANAGE permission
   */
  fastify.patch(
    "/watcher",
    {
      preHandler: [authMiddleware, permissionMiddleware(NAXML_WATCHER_MANAGE)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = StoreIdParamSchema.safeParse(request.params);
        const bodyResult = FileWatcherConfigUpdateSchema.safeParse(
          request.body,
        );

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        if (!bodyResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: bodyResult.error.issues[0].message,
            },
          });
        }

        const { storeId } = paramsResult.data;
        await verifyStoreAccess(storeId, user);

        // Get existing config
        const existing = await prisma.pOSFileWatcherConfig.findUnique({
          where: { store_id: storeId },
        });

        if (!existing) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "File watcher configuration not found for this store",
            },
          });
        }

        const updateData: any = {};
        const body = bodyResult.data;

        if (body.watch_path !== undefined)
          updateData.watch_path = body.watch_path;
        if (body.processed_path !== undefined)
          updateData.processed_path = body.processed_path;
        if (body.error_path !== undefined)
          updateData.error_path = body.error_path;
        if (body.file_patterns !== undefined)
          updateData.file_patterns = body.file_patterns;
        if (body.poll_interval_seconds !== undefined)
          updateData.poll_interval_seconds = body.poll_interval_seconds;
        if (body.is_active !== undefined) updateData.is_active = body.is_active;

        // Update config
        const config = await prisma.pOSFileWatcherConfig.update({
          where: { store_id: storeId },
          data: updateData,
        });

        // If watcher is running and config changed, restart it
        const watcherService = getFileWatcherService();
        if (watcherService.isWatchingStore(storeId)) {
          await watcherService.restartWatcher(storeId);
        }

        request.log.info(
          { storeId, configId: config.config_id, userId: user.id },
          "File watcher configuration updated",
        );

        return reply.send({
          success: true,
          data: config,
          message: "File watcher configuration updated successfully",
        });
      } catch (error: any) {
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to update watcher config");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to update watcher configuration",
          },
        });
      }
    },
  );

  /**
   * POST /api/stores/:storeId/naxml/watcher/start
   * Start file watcher for store
   *
   * Starts the file watcher service for the specified store using the
   * stored configuration. The watcher will poll the configured directory
   * for new NAXML files and process them automatically.
   *
   * Requires: NAXML_WATCHER_MANAGE permission
   *
   * @returns 200 - Watcher started successfully
   * @returns 400 - Validation error
   * @returns 404 - Store not found or watcher not configured
   * @returns 409 - Watcher already running
   * @returns 500 - Internal server error
   */
  fastify.post(
    "/watcher/start",
    {
      preHandler: [authMiddleware, permissionMiddleware(NAXML_WATCHER_MANAGE)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = StoreIdParamSchema.safeParse(request.params);

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        const { storeId } = paramsResult.data;
        const store = await verifyStoreAccess(storeId, user);

        // Get watcher configuration from database
        const dbConfig = await prisma.pOSFileWatcherConfig.findUnique({
          where: { store_id: storeId },
        });

        if (!dbConfig) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_CONFIGURED",
              message:
                "File watcher not configured for this store. Create configuration first using POST /naxml/watcher.",
            },
          });
        }

        // Get POS integration for context
        const integration = await getStoreIntegration(storeId);

        // Get watcher service instance
        const watcherService = getFileWatcherService();

        // Check if already running
        if (watcherService.isWatching(storeId)) {
          return reply.code(409).send({
            success: false,
            error: {
              code: "ALREADY_RUNNING",
              message: "File watcher is already running for this store",
            },
          });
        }

        // Build watcher config from database record
        const watcherConfig = {
          configId: dbConfig.config_id,
          storeId: dbConfig.store_id,
          posIntegrationId: integration.pos_integration_id,
          watchPath: dbConfig.watch_path,
          processedPath: dbConfig.processed_path || undefined,
          errorPath: dbConfig.error_path || undefined,
          pollIntervalSeconds: dbConfig.poll_interval_seconds,
          isActive: true,
          filePatterns: dbConfig.file_patterns as string[],
          createdAt: dbConfig.created_at,
          updatedAt: dbConfig.updated_at,
        };

        // Build store context for audit tracking
        const storeContext = {
          storeId,
          posIntegrationId: integration.pos_integration_id,
          companyId: store.company_id,
          userId: user.id,
        };

        // Start the watcher with config and context
        await watcherService.startWatching(watcherConfig, storeContext);

        // Update config to mark as active
        await prisma.pOSFileWatcherConfig.update({
          where: { store_id: storeId },
          data: {
            is_active: true,
            last_poll_at: new Date(),
          },
        });

        request.log.info(
          {
            storeId,
            userId: user.id,
            watchPath: dbConfig.watch_path,
            pollInterval: dbConfig.poll_interval_seconds,
          },
          "File watcher started successfully",
        );

        return reply.send({
          success: true,
          message: "File watcher started successfully",
          data: {
            store_id: storeId,
            is_running: true,
            watch_path: dbConfig.watch_path,
            poll_interval_seconds: dbConfig.poll_interval_seconds,
            file_patterns: dbConfig.file_patterns,
          },
        });
      } catch (error: any) {
        // Handle known error types
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        // Handle file watcher specific errors
        if (error.code && error.code.startsWith("FILE_WATCHER_")) {
          return reply.code(400).send({
            success: false,
            error: {
              code: error.code,
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to start file watcher");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to start file watcher",
          },
        });
      }
    },
  );

  /**
   * POST /api/stores/:storeId/naxml/watcher/stop
   * Stop file watcher for store
   *
   * Gracefully stops the file watcher service for the specified store.
   * Any files currently being processed will complete before the watcher stops.
   *
   * Requires: NAXML_WATCHER_MANAGE permission
   *
   * @returns 200 - Watcher stopped successfully
   * @returns 400 - Validation error or watcher not running
   * @returns 404 - Store not found
   * @returns 500 - Internal server error
   */
  fastify.post(
    "/watcher/stop",
    {
      preHandler: [authMiddleware, permissionMiddleware(NAXML_WATCHER_MANAGE)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = StoreIdParamSchema.safeParse(request.params);

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        const { storeId } = paramsResult.data;
        await verifyStoreAccess(storeId, user);

        // Get watcher service instance
        const watcherService = getFileWatcherService();

        // Check if watcher is running
        if (!watcherService.isWatching(storeId)) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "NOT_RUNNING",
              message: "File watcher is not running for this store",
            },
          });
        }

        // Get current status before stopping (for response)
        const status = watcherService.getStatus(storeId);
        const filesProcessed = status?.filesProcessed || 0;
        const filesErrored = status?.filesErrored || 0;

        // Stop the watcher
        await watcherService.stopWatching(storeId);

        // Update config to mark as inactive
        await prisma.pOSFileWatcherConfig.update({
          where: { store_id: storeId },
          data: { is_active: false },
        });

        request.log.info(
          {
            storeId,
            userId: user.id,
            filesProcessed,
            filesErrored,
          },
          "File watcher stopped successfully",
        );

        return reply.send({
          success: true,
          message: "File watcher stopped successfully",
          data: {
            store_id: storeId,
            is_running: false,
            files_processed: filesProcessed,
            files_errored: filesErrored,
          },
        });
      } catch (error: any) {
        // Handle known error types
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        // Handle file watcher specific errors
        if (error.code && error.code.startsWith("FILE_WATCHER_")) {
          return reply.code(400).send({
            success: false,
            error: {
              code: error.code,
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to stop file watcher");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to stop file watcher",
          },
        });
      }
    },
  );

  /**
   * GET /api/stores/:storeId/naxml/watcher/status
   * Get detailed file watcher status for store
   *
   * Returns real-time status information including files processed,
   * errors encountered, and current operational state.
   *
   * Requires: NAXML_WATCHER_READ permission
   *
   * @returns 200 - Status information
   * @returns 400 - Validation error
   * @returns 404 - Store not found
   * @returns 500 - Internal server error
   */
  fastify.get(
    "/watcher/status",
    {
      preHandler: [authMiddleware, permissionMiddleware(NAXML_WATCHER_READ)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = StoreIdParamSchema.safeParse(request.params);

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        const { storeId } = paramsResult.data;
        await verifyStoreAccess(storeId, user);

        // Get watcher service instance
        const watcherService = getFileWatcherService();

        // Get current status
        const status = watcherService.getStatus(storeId);
        const isRunning = watcherService.isWatching(storeId);

        // Get config from database for additional info
        const dbConfig = await prisma.pOSFileWatcherConfig.findUnique({
          where: { store_id: storeId },
        });

        if (!status && !dbConfig) {
          return reply.send({
            success: true,
            data: {
              store_id: storeId,
              configured: false,
              is_running: false,
              message: "File watcher not configured for this store",
            },
          });
        }

        return reply.send({
          success: true,
          data: {
            store_id: storeId,
            configured: !!dbConfig,
            is_running: isRunning,
            // Runtime status (only available when running)
            runtime_status: status
              ? {
                  files_processed: status.filesProcessed,
                  files_errored: status.filesErrored,
                  started_at: status.startedAt,
                  last_poll_at: status.lastPollAt,
                  watch_path: status.watchPath,
                }
              : null,
            // Configuration (from database)
            configuration: dbConfig
              ? {
                  watch_path: dbConfig.watch_path,
                  processed_path: dbConfig.processed_path,
                  error_path: dbConfig.error_path,
                  file_patterns: dbConfig.file_patterns,
                  poll_interval_seconds: dbConfig.poll_interval_seconds,
                  is_active: dbConfig.is_active,
                  last_poll_at: dbConfig.last_poll_at,
                  last_file_processed_at: dbConfig.last_file_processed_at,
                  files_processed: dbConfig.files_processed,
                  files_errored: dbConfig.files_errored,
                }
              : null,
          },
        });
      } catch (error: any) {
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to get watcher status");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to get watcher status",
          },
        });
      }
    },
  );

  // ============================================================================
  // SCHEDULED EXPORT ROUTES (Phase 2)
  // ============================================================================

  /**
   * GET /api/stores/:storeId/naxml/schedules
   * List scheduled exports for the store
   *
   * Requires: NAXML_FILE_EXPORT permission
   */
  fastify.get(
    "/schedules",
    {
      preHandler: [authMiddleware, permissionMiddleware(NAXML_FILE_EXPORT)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = StoreIdParamSchema.safeParse(request.params);
        const queryResult = ScheduledExportQuerySchema.safeParse(request.query);

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        if (!queryResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: queryResult.error.issues[0].message,
            },
          });
        }

        const { storeId } = paramsResult.data;
        await verifyStoreAccess(storeId, user);

        const { limit, offset, status, export_type } = queryResult.data;

        const result = await scheduledExportService.listScheduledExports(
          storeId,
          {
            status: status as any,
            exportType: export_type as any,
            limit,
            offset,
          },
        );

        return reply.send({
          success: true,
          data: result.schedules,
          pagination: {
            total: result.total,
            limit,
            offset,
            hasMore: offset + result.schedules.length < result.total,
          },
        });
      } catch (error: any) {
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to list scheduled exports");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to list scheduled exports",
          },
        });
      }
    },
  );

  /**
   * POST /api/stores/:storeId/naxml/schedules
   * Create a new scheduled export
   *
   * Requires: NAXML_FILE_EXPORT permission
   */
  fastify.post(
    "/schedules",
    {
      preHandler: [authMiddleware, permissionMiddleware(NAXML_FILE_EXPORT)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = StoreIdParamSchema.safeParse(request.params);
        const bodyResult = CreateScheduledExportSchema.safeParse(request.body);

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        if (!bodyResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: bodyResult.error.issues[0].message,
              details: bodyResult.error.issues,
            },
          });
        }

        const { storeId } = paramsResult.data;
        await verifyStoreAccess(storeId, user);
        const integration = await getStoreIntegration(storeId);

        const scheduleId = await scheduledExportService.createScheduledExport({
          storeId,
          posIntegrationId: integration.pos_integration_id,
          exportType: bodyResult.data.export_type as any,
          exportName: bodyResult.data.export_name,
          cronExpression: bodyResult.data.cron_expression,
          timezone: bodyResult.data.timezone,
          maintenanceType: bodyResult.data.maintenance_type as any,
          outputPath: bodyResult.data.output_path,
          fileNamePattern: bodyResult.data.file_name_pattern,
          notifyOnFailure: bodyResult.data.notify_on_failure,
          notifyOnSuccess: bodyResult.data.notify_on_success,
          notifyEmails: bodyResult.data.notify_emails,
          createdBy: user.id,
          metadata: bodyResult.data.metadata,
        });

        const schedule =
          await scheduledExportService.getScheduledExport(scheduleId);

        request.log.info(
          { storeId, scheduleId, exportType: bodyResult.data.export_type },
          "Created scheduled export",
        );

        return reply.code(201).send({
          success: true,
          message: "Scheduled export created successfully",
          data: schedule,
        });
      } catch (error: any) {
        if (error.code && error.code.startsWith("SCHEDULED_EXPORT_")) {
          return reply.code(400).send({
            success: false,
            error: {
              code: error.code,
              message: error.message,
            },
          });
        }

        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to create scheduled export");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to create scheduled export",
          },
        });
      }
    },
  );

  /**
   * GET /api/stores/:storeId/naxml/schedules/:scheduleId
   * Get a specific scheduled export
   *
   * Requires: NAXML_FILE_EXPORT permission
   */
  fastify.get(
    "/schedules/:scheduleId",
    {
      preHandler: [authMiddleware, permissionMiddleware(NAXML_FILE_EXPORT)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = ScheduleIdParamSchema.safeParse(request.params);

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        const { storeId, scheduleId } = paramsResult.data;
        await verifyStoreAccess(storeId, user);

        const schedule =
          await scheduledExportService.getScheduledExport(scheduleId);

        if (!schedule || schedule.storeId !== storeId) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Scheduled export not found",
            },
          });
        }

        return reply.send({
          success: true,
          data: schedule,
        });
      } catch (error: any) {
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to get scheduled export");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to get scheduled export",
          },
        });
      }
    },
  );

  /**
   * PATCH /api/stores/:storeId/naxml/schedules/:scheduleId
   * Update a scheduled export
   *
   * Requires: NAXML_FILE_EXPORT permission
   */
  fastify.patch(
    "/schedules/:scheduleId",
    {
      preHandler: [authMiddleware, permissionMiddleware(NAXML_FILE_EXPORT)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = ScheduleIdParamSchema.safeParse(request.params);
        const bodyResult = UpdateScheduledExportSchema.safeParse(request.body);

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        if (!bodyResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: bodyResult.error.issues[0].message,
              details: bodyResult.error.issues,
            },
          });
        }

        const { storeId, scheduleId } = paramsResult.data;
        await verifyStoreAccess(storeId, user);

        // Verify schedule belongs to store
        const existing =
          await scheduledExportService.getScheduledExport(scheduleId);
        if (!existing || existing.storeId !== storeId) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Scheduled export not found",
            },
          });
        }

        await scheduledExportService.updateScheduledExport(scheduleId, {
          exportName: bodyResult.data.export_name,
          cronExpression: bodyResult.data.cron_expression,
          timezone: bodyResult.data.timezone,
          maintenanceType: bodyResult.data.maintenance_type as any,
          outputPath: bodyResult.data.output_path ?? undefined,
          fileNamePattern: bodyResult.data.file_name_pattern,
          status: bodyResult.data.status as any,
          notifyOnFailure: bodyResult.data.notify_on_failure,
          notifyOnSuccess: bodyResult.data.notify_on_success,
          notifyEmails: bodyResult.data.notify_emails,
          metadata: bodyResult.data.metadata,
        });

        const schedule =
          await scheduledExportService.getScheduledExport(scheduleId);

        request.log.info({ storeId, scheduleId }, "Updated scheduled export");

        return reply.send({
          success: true,
          message: "Scheduled export updated successfully",
          data: schedule,
        });
      } catch (error: any) {
        if (error.code && error.code.startsWith("SCHEDULED_EXPORT_")) {
          const statusCode =
            error.code === "SCHEDULED_EXPORT_NOT_FOUND" ? 404 : 400;
          return reply.code(statusCode).send({
            success: false,
            error: {
              code: error.code,
              message: error.message,
            },
          });
        }

        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to update scheduled export");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to update scheduled export",
          },
        });
      }
    },
  );

  /**
   * DELETE /api/stores/:storeId/naxml/schedules/:scheduleId
   * Delete a scheduled export
   *
   * Requires: NAXML_FILE_EXPORT permission
   */
  fastify.delete(
    "/schedules/:scheduleId",
    {
      preHandler: [authMiddleware, permissionMiddleware(NAXML_FILE_EXPORT)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = ScheduleIdParamSchema.safeParse(request.params);

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        const { storeId, scheduleId } = paramsResult.data;
        await verifyStoreAccess(storeId, user);

        // Verify schedule belongs to store
        const existing =
          await scheduledExportService.getScheduledExport(scheduleId);
        if (!existing || existing.storeId !== storeId) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Scheduled export not found",
            },
          });
        }

        await scheduledExportService.deleteScheduledExport(scheduleId);

        request.log.info({ storeId, scheduleId }, "Deleted scheduled export");

        return reply.code(204).send();
      } catch (error: any) {
        if (error.code === "SCHEDULED_EXPORT_NOT_FOUND") {
          return reply.code(404).send({
            success: false,
            error: {
              code: error.code,
              message: error.message,
            },
          });
        }

        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to delete scheduled export");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to delete scheduled export",
          },
        });
      }
    },
  );

  /**
   * POST /api/stores/:storeId/naxml/schedules/:scheduleId/execute
   * Manually execute a scheduled export
   *
   * Requires: NAXML_FILE_EXPORT permission
   */
  fastify.post(
    "/schedules/:scheduleId/execute",
    {
      preHandler: [authMiddleware, permissionMiddleware(NAXML_FILE_EXPORT)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = ScheduleIdParamSchema.safeParse(request.params);
        const bodyResult = ExecuteExportSchema.safeParse(request.body || {});

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        if (!bodyResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: bodyResult.error.issues[0].message,
            },
          });
        }

        const { storeId, scheduleId } = paramsResult.data;
        await verifyStoreAccess(storeId, user);

        // Verify schedule belongs to store
        const existing =
          await scheduledExportService.getScheduledExport(scheduleId);
        if (!existing || existing.storeId !== storeId) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Scheduled export not found",
            },
          });
        }

        const triggerType = bodyResult.data.trigger_type || "MANUAL";
        const result = await scheduledExportService.executeScheduledExport(
          scheduleId,
          triggerType as any,
        );

        request.log.info(
          {
            storeId,
            scheduleId,
            success: result.success,
            recordCount: result.recordCount,
          },
          "Executed scheduled export manually",
        );

        if (result.success) {
          return reply.send({
            success: true,
            message: "Export executed successfully",
            data: {
              schedule_id: result.scheduleId,
              export_type: result.exportType,
              record_count: result.recordCount,
              file_size_bytes: result.fileSizeBytes,
              file_hash: result.fileHash,
              output_path: result.outputPath,
              processing_time_ms: result.processingTimeMs,
            },
          });
        } else {
          return reply.code(422).send({
            success: false,
            error: {
              code: result.errorCode || "EXPORT_FAILED",
              message: result.errorMessage || "Export failed",
            },
            data: {
              schedule_id: result.scheduleId,
              processing_time_ms: result.processingTimeMs,
            },
          });
        }
      } catch (error: any) {
        if (error.code && error.code.startsWith("SCHEDULED_EXPORT_")) {
          const statusCode =
            error.code === "SCHEDULED_EXPORT_NOT_FOUND" ? 404 : 422;
          return reply.code(statusCode).send({
            success: false,
            error: {
              code: error.code,
              message: error.message,
            },
          });
        }

        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to execute scheduled export");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to execute scheduled export",
          },
        });
      }
    },
  );

  /**
   * POST /api/stores/:storeId/naxml/schedules/:scheduleId/pause
   * Pause a scheduled export
   *
   * Requires: NAXML_FILE_EXPORT permission
   */
  fastify.post(
    "/schedules/:scheduleId/pause",
    {
      preHandler: [authMiddleware, permissionMiddleware(NAXML_FILE_EXPORT)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = ScheduleIdParamSchema.safeParse(request.params);

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        const { storeId, scheduleId } = paramsResult.data;
        await verifyStoreAccess(storeId, user);

        // Verify schedule belongs to store
        const existing =
          await scheduledExportService.getScheduledExport(scheduleId);
        if (!existing || existing.storeId !== storeId) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Scheduled export not found",
            },
          });
        }

        await scheduledExportService.pauseScheduledExport(scheduleId);

        const schedule =
          await scheduledExportService.getScheduledExport(scheduleId);

        request.log.info({ storeId, scheduleId }, "Paused scheduled export");

        return reply.send({
          success: true,
          message: "Scheduled export paused",
          data: schedule,
        });
      } catch (error: any) {
        if (error.code === "SCHEDULED_EXPORT_NOT_FOUND") {
          return reply.code(404).send({
            success: false,
            error: {
              code: error.code,
              message: error.message,
            },
          });
        }

        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to pause scheduled export");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to pause scheduled export",
          },
        });
      }
    },
  );

  /**
   * POST /api/stores/:storeId/naxml/schedules/:scheduleId/resume
   * Resume a paused scheduled export
   *
   * Requires: NAXML_FILE_EXPORT permission
   */
  fastify.post(
    "/schedules/:scheduleId/resume",
    {
      preHandler: [authMiddleware, permissionMiddleware(NAXML_FILE_EXPORT)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = ScheduleIdParamSchema.safeParse(request.params);

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        const { storeId, scheduleId } = paramsResult.data;
        await verifyStoreAccess(storeId, user);

        // Verify schedule belongs to store
        const existing =
          await scheduledExportService.getScheduledExport(scheduleId);
        if (!existing || existing.storeId !== storeId) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Scheduled export not found",
            },
          });
        }

        await scheduledExportService.resumeScheduledExport(scheduleId);

        const schedule =
          await scheduledExportService.getScheduledExport(scheduleId);

        request.log.info({ storeId, scheduleId }, "Resumed scheduled export");

        return reply.send({
          success: true,
          message: "Scheduled export resumed",
          data: schedule,
        });
      } catch (error: any) {
        if (error.code === "SCHEDULED_EXPORT_NOT_FOUND") {
          return reply.code(404).send({
            success: false,
            error: {
              code: error.code,
              message: error.message,
            },
          });
        }

        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to resume scheduled export");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to resume scheduled export",
          },
        });
      }
    },
  );

  /**
   * GET /api/stores/:storeId/naxml/schedules/:scheduleId/history
   * Get execution history for a scheduled export
   *
   * Requires: NAXML_FILE_EXPORT permission
   */
  fastify.get(
    "/schedules/:scheduleId/history",
    {
      preHandler: [authMiddleware, permissionMiddleware(NAXML_FILE_EXPORT)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const paramsResult = ScheduleIdParamSchema.safeParse(request.params);

        if (!paramsResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: paramsResult.error.issues[0].message,
            },
          });
        }

        const { storeId, scheduleId } = paramsResult.data;
        await verifyStoreAccess(storeId, user);

        // Verify schedule belongs to store
        const existing =
          await scheduledExportService.getScheduledExport(scheduleId);
        if (!existing || existing.storeId !== storeId) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Scheduled export not found",
            },
          });
        }

        // Parse pagination from query
        const query = request.query as { limit?: string; offset?: string };
        const limit = query.limit ? parseInt(query.limit, 10) : 50;
        const offset = query.offset ? parseInt(query.offset, 10) : 0;

        const result = await scheduledExportService.getExportHistory(
          scheduleId,
          {
            limit,
            offset,
          },
        );

        return reply.send({
          success: true,
          data: result.logs,
          pagination: {
            total: result.total,
            limit,
            offset,
            hasMore: offset + result.logs.length < result.total,
          },
        });
      } catch (error: any) {
        if (error.statusCode) {
          return reply.code(error.statusCode).send({
            success: false,
            error: {
              code: error.statusCode === 404 ? "NOT_FOUND" : "FORBIDDEN",
              message: error.message,
            },
          });
        }

        request.log.error(error, "Failed to get export history");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to get export history",
          },
        });
      }
    },
  );
}
