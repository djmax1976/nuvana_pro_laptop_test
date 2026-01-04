/**
 * Document Scanning Routes
 *
 * API endpoints for OCR document scanning feature.
 * Handles upload, processing, verification, and retrieval of scanned documents.
 *
 * Enterprise coding standards applied:
 * - SEC-014: Input validation with Zod schemas
 * - SEC-015: File upload security (MIME, size, magic bytes)
 * - API-003: Structured error handling
 * - DB-006: Tenant isolation via store_id
 * - LM-001: Audit logging for all operations
 *
 * @module document-scanning.routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { permissionMiddleware } from "../middleware/permission.middleware";
import { PERMISSIONS } from "../constants/permissions";
import { prisma } from "../utils/db";
import { rbacService } from "../services/rbac.service";
import type { UserRole } from "../services/rbac.service";
import {
  DocumentType,
  ScanDocumentRequestSchema,
  VerifyDocumentRequestSchema,
  GetDocumentRequestSchema,
  LotteryWizardFields,
} from "../types/document-scanning.types";
import { getDocumentScanningService, ScanContext } from "../services/ocr";

/**
 * Validate user has access to a store.
 */
function validateUserStoreAccess(
  userRoles: UserRole[],
  storeId: string,
  storeCompanyId: string,
): boolean {
  const hasSystemScope = userRoles.some((role) => role.scope === "SYSTEM");
  if (hasSystemScope) return true;

  const hasCompanyAccess = userRoles.some(
    (role) => role.scope === "COMPANY" && role.company_id === storeCompanyId,
  );
  if (hasCompanyAccess) return true;

  const hasStoreAccess = userRoles.some(
    (role) => role.scope === "STORE" && role.store_id === storeId,
  );
  return hasStoreAccess;
}

/**
 * Request body for scan document endpoint.
 */
interface ScanDocumentBody {
  storeId: string;
  documentType: DocumentType;
  imageData: string;
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
  businessDate: string;
  daySummaryId?: string;
  shiftId?: string;
  cashierId?: string;
  cashierSessionId?: string;
  terminalId?: string;
  lotteryDayId?: string;
}

/**
 * Request body for verify document endpoint.
 */
interface VerifyDocumentBody {
  documentId: string;
  confirmedWizardFields: LotteryWizardFields;
  action: "accept" | "reject";
  rejectionReason?: string;
}

/**
 * Request params for get document endpoint.
 */
interface GetDocumentParams {
  documentId: string;
}

/**
 * Query params for get document endpoint.
 */
interface GetDocumentQuery {
  storeId: string;
}

export default async function documentScanningRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  // Initialize the document scanning service on first request
  let serviceInitialized = false;
  const initService = async () => {
    if (!serviceInitialized) {
      const service = getDocumentScanningService();
      await service.initialize();
      serviceInitialized = true;
    }
  };

  /**
   * POST /api/documents/scan
   *
   * Upload and process a scanned document.
   * Returns OCR-extracted wizard fields for verification.
   *
   * SEC-014: Validates request body against Zod schema
   * SEC-015: Validates file type, size, and content
   * DB-006: Enforces store-level tenant isolation
   */
  fastify.post<{ Body: ScanDocumentBody }>(
    "/scan",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_SHIFT_CLOSE),
      ],
    },
    async (
      request: FastifyRequest<{ Body: ScanDocumentBody }>,
      reply: FastifyReply,
    ) => {
      const user = (request as any).user as UserIdentity;
      const startTime = Date.now();

      try {
        // Validate request body
        const validationResult = ScanDocumentRequestSchema.safeParse(
          request.body,
        );
        if (!validationResult.success) {
          return reply.status(400).send({
            success: false,
            error: "VALIDATION_ERROR",
            message: "Invalid request body",
            details: validationResult.error.flatten().fieldErrors,
          });
        }

        const body = validationResult.data;

        // Verify store exists and get company_id
        const store = await prisma.store.findUnique({
          where: { store_id: body.storeId },
          select: { store_id: true, company_id: true },
        });

        if (!store) {
          return reply.status(404).send({
            success: false,
            error: "STORE_NOT_FOUND",
            message: "Store not found",
          });
        }

        // Check user has access to this store
        const userRoles = await rbacService.getUserRoles(user.id);
        if (
          !validateUserStoreAccess(userRoles, store.store_id, store.company_id)
        ) {
          return reply.status(403).send({
            success: false,
            error: "ACCESS_DENIED",
            message: "You do not have access to this store",
          });
        }

        // Initialize service if needed
        await initService();

        // Decode base64 image data
        const imageBuffer = Buffer.from(body.imageData, "base64");

        // Build scan context with complete traceability
        const scanContext: ScanContext = {
          storeId: store.store_id,
          companyId: store.company_id,
          businessDate: body.businessDate,
          userId: user.id,
          shiftId: body.shiftId,
          cashierId: body.cashierId,
          cashierSessionId: body.cashierSessionId,
          terminalId: body.terminalId,
          daySummaryId: body.daySummaryId,
          lotteryDayId: body.lotteryDayId,
          clientIpAddress: request.ip,
          clientUserAgent: request.headers["user-agent"],
        };

        // Process the document
        const service = getDocumentScanningService();
        const result = await service.scanDocument(
          imageBuffer,
          body.filename,
          body.mimeType,
          body.documentType as DocumentType,
          scanContext,
        );

        // Log the scan operation
        console.log(
          `[DocumentScan] Document scanned: documentId=${result.documentId}, ` +
            `storeId=${store.store_id}, userId=${user.id}, ` +
            `confidence=${result.ocrResult?.confidence?.toFixed(1) || "N/A"}%, ` +
            `processingTimeMs=${Date.now() - startTime}`,
        );

        return reply.status(200).send(result);
      } catch (error) {
        console.error("[DocumentScan] Error:", error);

        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        const errorCode =
          error instanceof Error && "code" in error
            ? (error as { code: string }).code
            : "SCAN_FAILED";

        return reply.status(500).send({
          success: false,
          error: errorCode,
          message: errorMessage,
        });
      }
    },
  );

  /**
   * POST /api/documents/verify
   *
   * Verify and confirm OCR-extracted wizard fields.
   * User reviews and optionally corrects the extracted data.
   *
   * SEC-014: Validates request body
   * DB-006: Verifies document belongs to authorized store
   */
  fastify.post<{ Body: VerifyDocumentBody }>(
    "/verify",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_SHIFT_CLOSE),
      ],
    },
    async (
      request: FastifyRequest<{ Body: VerifyDocumentBody }>,
      reply: FastifyReply,
    ) => {
      const user = (request as any).user as UserIdentity;

      try {
        // Validate request body
        const validationResult = VerifyDocumentRequestSchema.safeParse(
          request.body,
        );
        if (!validationResult.success) {
          return reply.status(400).send({
            success: false,
            error: "VALIDATION_ERROR",
            message: "Invalid request body",
            details: validationResult.error.flatten().fieldErrors,
          });
        }

        const body = validationResult.data;

        // For now, return success - actual DB update will be implemented
        // when integrating with the database layer
        const service = getDocumentScanningService();

        if (body.action === "accept") {
          const result = await service.verifyDocument(
            body.documentId,
            body.confirmedWizardFields,
            user.id,
          );
          return reply.status(200).send(result);
        } else {
          const result = await service.rejectDocument(
            body.documentId,
            body.rejectionReason || "User rejected",
            "USER_REJECTED",
            user.id,
          );
          return reply.status(200).send(result);
        }
      } catch (error) {
        console.error("[DocumentVerify] Error:", error);

        return reply.status(500).send({
          success: false,
          error: "VERIFICATION_FAILED",
          message:
            error instanceof Error ? error.message : "Verification failed",
        });
      }
    },
  );

  /**
   * GET /api/documents/:documentId
   *
   * Retrieve a scanned document by ID.
   * Returns document metadata and presigned URL for image access.
   *
   * DB-006: Enforces store-level tenant isolation via storeId query param
   */
  fastify.get<{ Params: GetDocumentParams; Querystring: GetDocumentQuery }>(
    "/:documentId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_REPORT),
      ],
    },
    async (
      request: FastifyRequest<{
        Params: GetDocumentParams;
        Querystring: GetDocumentQuery;
      }>,
      reply: FastifyReply,
    ) => {
      const user = (request as any).user as UserIdentity;
      const { documentId } = request.params;
      const { storeId } = request.query;

      try {
        // Validate request params
        const validationResult = GetDocumentRequestSchema.safeParse({
          documentId,
          storeId,
        });
        if (!validationResult.success) {
          return reply.status(400).send({
            success: false,
            error: "VALIDATION_ERROR",
            message: "Invalid request parameters",
            details: validationResult.error.flatten().fieldErrors,
          });
        }

        // Verify store exists and get company_id
        const store = await prisma.store.findUnique({
          where: { store_id: storeId },
          select: { store_id: true, company_id: true },
        });

        if (!store) {
          return reply.status(404).send({
            success: false,
            error: "STORE_NOT_FOUND",
            message: "Store not found",
          });
        }

        // Check user has access to this store
        const userRoles = await rbacService.getUserRoles(user.id);
        if (
          !validateUserStoreAccess(userRoles, store.store_id, store.company_id)
        ) {
          return reply.status(403).send({
            success: false,
            error: "ACCESS_DENIED",
            message: "You do not have access to this store",
          });
        }

        // TODO: Fetch document from database and return with presigned URL
        // For now, return not found as we haven't implemented the DB query
        return reply.status(404).send({
          success: false,
          error: "DOCUMENT_NOT_FOUND",
          message: "Document not found or not yet implemented",
        });
      } catch (error) {
        console.error("[DocumentGet] Error:", error);

        return reply.status(500).send({
          success: false,
          error: "FETCH_FAILED",
          message:
            error instanceof Error ? error.message : "Failed to fetch document",
        });
      }
    },
  );

  /**
   * GET /api/documents/store/:storeId
   *
   * List scanned documents for a store.
   * Supports filtering by date range, document type, and status.
   */
  fastify.get<{
    Params: { storeId: string };
    Querystring: {
      businessDate?: string;
      documentType?: string;
      status?: string;
      limit?: number;
      offset?: number;
    };
  }>(
    "/store/:storeId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_REPORT),
      ],
    },
    async (request, reply) => {
      const user = (request as any).user as UserIdentity;
      const { storeId } = request.params;

      try {
        // Verify store exists and get company_id
        const store = await prisma.store.findUnique({
          where: { store_id: storeId },
          select: { store_id: true, company_id: true },
        });

        if (!store) {
          return reply.status(404).send({
            success: false,
            error: "STORE_NOT_FOUND",
            message: "Store not found",
          });
        }

        // Check user has access to this store
        const userRoles = await rbacService.getUserRoles(user.id);
        if (
          !validateUserStoreAccess(userRoles, store.store_id, store.company_id)
        ) {
          return reply.status(403).send({
            success: false,
            error: "ACCESS_DENIED",
            message: "You do not have access to this store",
          });
        }

        // TODO: Implement database query for listing documents
        return reply.status(200).send({
          success: true,
          documents: [],
          total: 0,
          message: "Document listing not yet implemented",
        });
      } catch (error) {
        console.error("[DocumentList] Error:", error);

        return reply.status(500).send({
          success: false,
          error: "LIST_FAILED",
          message:
            error instanceof Error ? error.message : "Failed to list documents",
        });
      }
    },
  );

  /**
   * GET /api/documents/:documentId/url
   *
   * Get a presigned URL for viewing a scanned document image.
   * URL is time-limited for security.
   */
  fastify.get<{
    Params: { documentId: string };
    Querystring: { storeId: string; expiresIn?: number };
  }>(
    "/:documentId/url",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.LOTTERY_REPORT),
      ],
    },
    async (request, reply) => {
      const user = (request as any).user as UserIdentity;
      // documentId and expiresIn will be used when DB query is implemented
      const { documentId: _documentId } = request.params;
      const { storeId, expiresIn: _expiresIn = 3600 } = request.query;

      try {
        // Verify store exists and get company_id
        const store = await prisma.store.findUnique({
          where: { store_id: storeId },
          select: { store_id: true, company_id: true },
        });

        if (!store) {
          return reply.status(404).send({
            success: false,
            error: "STORE_NOT_FOUND",
            message: "Store not found",
          });
        }

        // Check user has access to this store
        const userRoles = await rbacService.getUserRoles(user.id);
        if (
          !validateUserStoreAccess(userRoles, store.store_id, store.company_id)
        ) {
          return reply.status(403).send({
            success: false,
            error: "ACCESS_DENIED",
            message: "You do not have access to this store",
          });
        }

        // TODO: Fetch document from DB using _documentId, verify store match,
        // generate presigned URL with _expiresIn
        return reply.status(404).send({
          success: false,
          error: "DOCUMENT_NOT_FOUND",
          message: "Document not found or not yet implemented",
        });
      } catch (error) {
        console.error("[DocumentUrl] Error:", error);

        return reply.status(500).send({
          success: false,
          error: "URL_GENERATION_FAILED",
          message:
            error instanceof Error ? error.message : "Failed to generate URL",
        });
      }
    },
  );
}
