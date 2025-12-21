/**
 * POS File Watcher Service
 *
 * Monitors BOOutbox directories for new NAXML files and processes them
 * automatically. Supports multiple stores with independent watchers.
 *
 * @module services/pos/file-watcher.service
 * @security File paths are validated to prevent path traversal attacks
 */

import { EventEmitter } from "events";
import { promises as fs } from "fs";
import * as path from "path";
import { createHash } from "crypto";
import type {
  NAXMLFileWatcherConfig,
  NAXMLFileStatus,
  NAXMLDocumentType,
} from "../../types/naxml.types";
import { createNAXMLService, NAXMLService } from "../naxml/naxml.service";
import * as auditService from "./audit.service";
import * as fileLogService from "./file-processing-status.service";

// ============================================================================
// Error Codes
// ============================================================================

export const FILE_WATCHER_ERROR_CODES = {
  INVALID_PATH: "FILE_WATCHER_INVALID_PATH",
  PATH_TRAVERSAL: "FILE_WATCHER_PATH_TRAVERSAL",
  FILE_NOT_FOUND: "FILE_WATCHER_FILE_NOT_FOUND",
  PERMISSION_DENIED: "FILE_WATCHER_PERMISSION_DENIED",
  PROCESSING_ERROR: "FILE_WATCHER_PROCESSING_ERROR",
  DUPLICATE_FILE: "FILE_WATCHER_DUPLICATE_FILE",
  WATCHER_ALREADY_RUNNING: "FILE_WATCHER_ALREADY_RUNNING",
  WATCHER_NOT_FOUND: "FILE_WATCHER_NOT_FOUND",
} as const;

export type FileWatcherErrorCode =
  (typeof FILE_WATCHER_ERROR_CODES)[keyof typeof FILE_WATCHER_ERROR_CODES];

/**
 * Custom error class for file watcher errors
 */
export class FileWatcherError extends Error {
  readonly code: FileWatcherErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: FileWatcherErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "FileWatcherError";
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, FileWatcherError.prototype);
  }
}

// ============================================================================
// Types
// ============================================================================

/**
 * Store context for file processing
 */
export interface StoreContext {
  storeId: string;
  posIntegrationId: string;
  companyId: string;
  userId?: string;
}

/**
 * File processing result
 */
export interface FileProcessingResult {
  success: boolean;
  fileName: string;
  filePath: string;
  fileHash: string;
  fileSize: number;
  documentType?: NAXMLDocumentType;
  recordCount?: number;
  status: NAXMLFileStatus;
  errorMessage?: string;
  processingTimeMs: number;
  movedTo?: string;
}

/**
 * Watcher status
 */
export interface WatcherStatus {
  storeId: string;
  isRunning: boolean;
  watchPath: string;
  processedPath?: string;
  errorPath?: string;
  lastPollAt?: Date;
  filesProcessed: number;
  filesErrored: number;
  startedAt?: Date;
}

/**
 * File watcher events
 */
export interface FileWatcherEvents {
  fileDetected: (filePath: string, storeId: string) => void;
  fileProcessed: (result: FileProcessingResult, storeId: string) => void;
  fileError: (error: Error, filePath: string, storeId: string) => void;
  watcherStarted: (storeId: string) => void;
  watcherStopped: (storeId: string) => void;
  pollCompleted: (storeId: string, filesFound: number) => void;
}

// ============================================================================
// File Watcher Class
// ============================================================================

/**
 * POS File Watcher Service
 *
 * Monitors directories for new NAXML files and processes them.
 * Uses polling instead of filesystem events for cross-platform compatibility
 * and to work with network shares.
 */
export class POSFileWatcherService extends EventEmitter {
  private readonly watchers: Map<string, NodeJS.Timeout> = new Map();
  private readonly watcherConfigs: Map<string, NAXMLFileWatcherConfig> =
    new Map();
  private readonly watcherStatus: Map<string, WatcherStatus> = new Map();
  private readonly processedHashes: Map<string, Set<string>> = new Map();
  private readonly naxmlService: NAXMLService;
  private readonly storeContexts: Map<string, StoreContext> = new Map();

  constructor() {
    super();
    this.naxmlService = createNAXMLService();
  }

  // ============================================================================
  // Public Methods
  // ============================================================================

  /**
   * Start watching a directory for new files
   *
   * @param config - Watcher configuration
   * @param context - Store context for audit tracking
   * @throws FileWatcherError if watcher already running or path invalid
   */
  async startWatching(
    config: NAXMLFileWatcherConfig,
    context: StoreContext,
  ): Promise<void> {
    const storeId = config.storeId;

    // Check if already watching
    if (this.watchers.has(storeId)) {
      throw new FileWatcherError(
        FILE_WATCHER_ERROR_CODES.WATCHER_ALREADY_RUNNING,
        `Watcher already running for store ${storeId}`,
      );
    }

    // Validate paths
    await this.validatePath(config.watchPath);

    if (config.processedPath) {
      await this.ensureDirectoryExists(config.processedPath);
    }

    if (config.errorPath) {
      await this.ensureDirectoryExists(config.errorPath);
    }

    // Store configuration and context
    this.watcherConfigs.set(storeId, config);
    this.storeContexts.set(storeId, context);
    this.processedHashes.set(storeId, new Set());

    // Initialize status
    this.watcherStatus.set(storeId, {
      storeId,
      isRunning: true,
      watchPath: config.watchPath,
      processedPath: config.processedPath,
      errorPath: config.errorPath,
      filesProcessed: 0,
      filesErrored: 0,
      startedAt: new Date(),
    });

    // Start polling
    const intervalMs = config.pollIntervalSeconds * 1000;
    const interval = setInterval(() => {
      this.pollDirectory(storeId).catch((error) => {
        this.log("error", `Poll error for store ${storeId}`, {
          error: error.message,
        });
      });
    }, intervalMs);

    this.watchers.set(storeId, interval);

    // Emit started event
    this.emit("watcherStarted", storeId);

    // Do an immediate poll
    await this.pollDirectory(storeId);

    this.log("info", `Started watching for store ${storeId}`, {
      watchPath: config.watchPath,
      pollInterval: config.pollIntervalSeconds,
    });
  }

  /**
   * Stop watching for a specific store
   */
  async stopWatching(storeId: string): Promise<void> {
    const interval = this.watchers.get(storeId);

    if (!interval) {
      throw new FileWatcherError(
        FILE_WATCHER_ERROR_CODES.WATCHER_NOT_FOUND,
        `No watcher found for store ${storeId}`,
      );
    }

    clearInterval(interval);
    this.watchers.delete(storeId);
    this.watcherConfigs.delete(storeId);
    this.storeContexts.delete(storeId);
    this.processedHashes.delete(storeId);

    const status = this.watcherStatus.get(storeId);
    if (status) {
      status.isRunning = false;
    }

    this.emit("watcherStopped", storeId);

    this.log("info", `Stopped watching for store ${storeId}`);
  }

  /**
   * Stop all watchers
   */
  async stopAll(): Promise<void> {
    const storeIds = Array.from(this.watchers.keys());

    for (const storeId of storeIds) {
      await this.stopWatching(storeId);
    }

    this.log("info", `Stopped all watchers (${storeIds.length} total)`);
  }

  /**
   * Get watcher status for a store
   */
  getStatus(storeId: string): WatcherStatus | undefined {
    return this.watcherStatus.get(storeId);
  }

  /**
   * Get all watcher statuses
   */
  getAllStatuses(): WatcherStatus[] {
    return Array.from(this.watcherStatus.values());
  }

  /**
   * Check if a store is being watched
   */
  isWatching(storeId: string): boolean {
    return this.watchers.has(storeId);
  }

  /**
   * Alias for isWatching (used by routes)
   */
  isWatchingStore(storeId: string): boolean {
    return this.isWatching(storeId);
  }

  /**
   * Manually process a single file
   */
  async processFile(
    filePath: string,
    context: StoreContext,
  ): Promise<FileProcessingResult> {
    return this.processFileInternal(filePath, context);
  }

  /**
   * Start watcher for a store using stored configuration
   * This is called by the API route after configuration is loaded from DB
   *
   * @param storeId - Store identifier
   * @param config - Optional config override, otherwise uses stored config
   * @throws FileWatcherError if watcher already running or no config found
   */
  async startWatcher(
    storeId: string,
    config?: NAXMLFileWatcherConfig,
  ): Promise<void> {
    const watcherConfig = config || this.watcherConfigs.get(storeId);
    const context = this.storeContexts.get(storeId);

    if (!watcherConfig) {
      throw new FileWatcherError(
        FILE_WATCHER_ERROR_CODES.WATCHER_NOT_FOUND,
        `No configuration found for store ${storeId}. Please provide configuration.`,
      );
    }

    if (!context) {
      throw new FileWatcherError(
        FILE_WATCHER_ERROR_CODES.WATCHER_NOT_FOUND,
        `No context found for store ${storeId}. Please call startWatching with full config and context.`,
      );
    }

    await this.startWatching(watcherConfig, context);
  }

  /**
   * Stop watcher for a store (alias for stopWatching)
   * This is called by the API route
   *
   * @param storeId - Store identifier
   */
  async stopWatcher(storeId: string): Promise<void> {
    await this.stopWatching(storeId);
  }

  /**
   * Restart watcher for a store with updated configuration
   * Stops the current watcher and starts it again with the stored config
   *
   * @param storeId - Store identifier
   */
  async restartWatcher(storeId: string): Promise<void> {
    const config = this.watcherConfigs.get(storeId);
    const context = this.storeContexts.get(storeId);

    if (!config || !context) {
      throw new FileWatcherError(
        FILE_WATCHER_ERROR_CODES.WATCHER_NOT_FOUND,
        `Cannot restart watcher for store ${storeId}. Configuration or context not found.`,
      );
    }

    // Stop current watcher
    if (this.watchers.has(storeId)) {
      await this.stopWatching(storeId);
    }

    // Start with existing config and context
    await this.startWatching(config, context);

    this.log("info", `Restarted watcher for store ${storeId}`);
  }

  /**
   * Queue a manual file import for processing
   * Used for manually triggered imports via API
   *
   * @param storeId - Store identifier
   * @param filePath - Path to the file to import
   * @param fileType - Optional document type hint
   * @param providedContext - Optional context override (for API calls with full context)
   * @returns Promise resolving to processing result
   */
  async queueManualImport(
    storeId: string,
    filePath: string,
    fileType?: string,
    providedContext?: StoreContext,
  ): Promise<FileProcessingResult> {
    const context = providedContext || this.storeContexts.get(storeId);

    if (!context) {
      // Create a minimal context for manual import
      const minimalContext: StoreContext = {
        storeId,
        posIntegrationId: "manual-import",
        companyId: "manual-import",
      };

      this.log("info", `Manual import queued for store ${storeId}`, {
        filePath,
        fileType,
      });

      return this.processFileInternal(filePath, minimalContext);
    }

    this.log("info", `Manual import queued for store ${storeId}`, {
      filePath,
      fileType,
    });

    return this.processFileInternal(filePath, context);
  }

  /**
   * Process NAXML content directly (content-based import)
   * Used for API imports where content is provided directly rather than a file path
   *
   * @param storeId - Store identifier
   * @param content - XML content string
   * @param fileName - Original file name (for logging and type detection)
   * @param context - Store context for audit tracking
   * @returns Promise resolving to processing result
   */
  async processContent(
    _storeId: string,
    content: string,
    fileName: string,
    context: StoreContext,
  ): Promise<FileProcessingResult> {
    const startTime = Date.now();

    // Calculate hash from content
    const fileHash = this.naxmlService.calculateHash(content);
    const fileSize = Buffer.byteLength(content, "utf-8");

    // Check for duplicate file (already processed)
    const isDuplicate = await fileLogService.isFileAlreadyProcessed(
      context.storeId,
      fileHash,
    );

    if (isDuplicate) {
      this.log("info", `Skipping duplicate content: ${fileName}`, {
        fileHash,
        storeId: context.storeId,
      });

      return {
        success: false,
        fileName,
        filePath: "content-import",
        fileHash,
        fileSize,
        status: "SKIPPED",
        errorMessage: "File already processed (duplicate hash)",
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Detect document type early for file log
    const earlyValidation = this.naxmlService.validateXml(content);
    const detectedType = earlyValidation.documentType || "TransactionDocument";

    // Create file log entry BEFORE processing
    let fileLogId: string | undefined;

    try {
      fileLogId = await fileLogService.createFileLog({
        storeId: context.storeId,
        posIntegrationId: context.posIntegrationId,
        fileName,
        fileType: detectedType as any,
        direction: "IMPORT",
        fileSizeBytes: fileSize,
        fileHash,
        sourcePath: "content-import",
        metadata: {
          importMethod: "content",
          originalFileName: fileName,
        },
      });

      // Mark as processing started
      await fileLogService.markProcessingStarted(fileLogId);
    } catch (fileLogError) {
      // If it's a duplicate hash error, skip processing
      if (
        fileLogError instanceof fileLogService.FileLogError &&
        fileLogError.code === fileLogService.FILE_LOG_ERROR_CODES.DUPLICATE_HASH
      ) {
        this.log("info", `Skipping duplicate content: ${fileName}`, {
          fileHash,
          storeId: context.storeId,
        });

        return {
          success: false,
          fileName,
          filePath: "content-import",
          fileHash,
          fileSize,
          status: "SKIPPED",
          errorMessage: "File already processed (duplicate hash)",
          processingTimeMs: Date.now() - startTime,
        };
      }

      this.log("error", "Failed to create file log for content import", {
        error: (fileLogError as Error).message,
        fileName,
      });
      // Continue processing - file log failure should not block processing
    }

    // Create audit record BEFORE processing
    let auditId: string | undefined;

    try {
      auditId = await auditService.createAuditRecord({
        storeId: context.storeId,
        posIntegrationId: context.posIntegrationId,
        companyId: context.companyId,
        exchangeId: auditService.generateExchangeId("CONTENT"),
        exchangeType: "FILE_IMPORT",
        direction: "INBOUND",
        dataCategory: this.detectDataCategory(fileName),
        sourceSystem: "API_UPLOAD",
        sourceIdentifier: fileName,
        destinationSystem: "NUVANA",
        accessedByUserId: context.userId,
        accessReason: "Manual NAXML content import via API",
        metadata: {
          fileName,
          fileSize,
          fileHash,
          fileLogId,
          importMethod: "content",
        },
      });
    } catch (auditError) {
      this.log("error", "Failed to create audit record for content import", {
        error: (auditError as Error).message,
        fileName,
      });
      // Continue processing - audit failure should not block processing
    }

    try {
      // Parse and validate the content
      const validation = this.naxmlService.validateXml(content);

      if (!validation.isValid) {
        const errorMessage = validation.errors.map((e) => e.message).join("; ");

        // Update file log with failure
        if (fileLogId) {
          await fileLogService.markProcessingFailed(
            fileLogId,
            "VALIDATION_FAILED",
            errorMessage,
            Date.now() - startTime,
          );
        }

        // Update audit record
        if (auditId) {
          await auditService.failAuditRecord(
            auditId,
            "VALIDATION_FAILED",
            errorMessage,
          );
        }

        return {
          success: false,
          fileName,
          filePath: "content-import",
          fileHash,
          fileSize,
          status: "FAILED",
          errorMessage,
          processingTimeMs: Date.now() - startTime,
        };
      }

      // Detect document type and process
      const documentType = validation.documentType;
      let recordCount = 0;

      // Parse based on document type
      if (documentType === "TransactionDocument") {
        const result = this.naxmlService.importTransactions(content);
        recordCount = result.recordCount;
      } else if (documentType === "DepartmentMaintenance") {
        const result = this.naxmlService.importDepartments(content);
        recordCount = result.recordCount;
      } else if (documentType === "TenderMaintenance") {
        const result = this.naxmlService.importTenderTypes(content);
        recordCount = result.recordCount;
      } else if (documentType === "TaxRateMaintenance") {
        const result = this.naxmlService.importTaxRates(content);
        recordCount = result.recordCount;
      }

      const processingTimeMs = Date.now() - startTime;

      // Update file log with success
      if (fileLogId) {
        await fileLogService.markProcessingSuccess(
          fileLogId,
          recordCount,
          processingTimeMs,
        );
      }

      // Update audit record
      if (auditId) {
        await auditService.updateAuditRecord(auditId, {
          status: "SUCCESS",
          recordCount,
          dataSizeBytes: BigInt(fileSize),
          fileHash,
        });
      }

      return {
        success: true,
        fileName,
        filePath: "content-import",
        fileHash,
        fileSize,
        documentType,
        recordCount,
        status: "SUCCESS",
        processingTimeMs,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const processingTimeMs = Date.now() - startTime;

      // Update file log with failure
      if (fileLogId) {
        await fileLogService.markProcessingFailed(
          fileLogId,
          "PROCESSING_ERROR",
          errorMessage,
          processingTimeMs,
        );
      }

      // Update audit record
      if (auditId) {
        await auditService.failAuditRecord(
          auditId,
          "PROCESSING_ERROR",
          errorMessage,
        );
      }

      return {
        success: false,
        fileName,
        filePath: "content-import",
        fileHash,
        fileSize,
        status: "FAILED",
        errorMessage,
        processingTimeMs,
      };
    }
  }

  /**
   * Update stored configuration for a watcher
   * Used when configuration is updated via API
   *
   * @param storeId - Store identifier
   * @param config - New configuration
   */
  updateConfig(storeId: string, config: NAXMLFileWatcherConfig): void {
    this.watcherConfigs.set(storeId, config);
  }

  /**
   * Set store context for a watcher
   * Used to initialize context before starting
   *
   * @param storeId - Store identifier
   * @param context - Store context
   */
  setContext(storeId: string, context: StoreContext): void {
    this.storeContexts.set(storeId, context);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Poll a directory for new files
   */
  private async pollDirectory(storeId: string): Promise<void> {
    const config = this.watcherConfigs.get(storeId);
    const context = this.storeContexts.get(storeId);

    if (!config || !context) {
      return;
    }

    try {
      const files = await this.getMatchingFiles(
        config.watchPath,
        config.filePatterns,
      );

      // Update status
      const status = this.watcherStatus.get(storeId);
      if (status) {
        status.lastPollAt = new Date();
      }

      // Emit poll completed
      this.emit("pollCompleted", storeId, files.length);

      // Process each file
      for (const filePath of files) {
        // Check if already processed
        const processedSet = this.processedHashes.get(storeId);
        const fileHash = await this.calculateFileHash(filePath);

        if (processedSet?.has(fileHash)) {
          this.log("info", `Skipping already processed file: ${filePath}`);
          continue;
        }

        // Emit file detected
        this.emit("fileDetected", filePath, storeId);

        try {
          const result = await this.processFileInternal(
            filePath,
            context,
            config,
          );

          // Track processed hash
          processedSet?.add(result.fileHash);

          // Update status
          if (status) {
            if (result.success) {
              status.filesProcessed++;
            } else {
              status.filesErrored++;
            }
          }

          // Emit result
          this.emit("fileProcessed", result, storeId);
        } catch (error) {
          this.emit("fileError", error as Error, filePath, storeId);

          if (status) {
            status.filesErrored++;
          }
        }
      }
    } catch (error) {
      this.log("error", `Failed to poll directory for store ${storeId}`, {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Get files matching the configured patterns
   */
  private async getMatchingFiles(
    watchPath: string,
    patterns: string[],
  ): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.readdir(watchPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isFile()) continue;

        const fileName = entry.name.toLowerCase();

        // Check if file matches any pattern
        const matches = patterns.some((pattern) => {
          const regex = this.globToRegex(pattern);
          return regex.test(fileName);
        });

        if (matches) {
          files.push(path.join(watchPath, entry.name));
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new FileWatcherError(
          FILE_WATCHER_ERROR_CODES.FILE_NOT_FOUND,
          `Watch directory not found: ${watchPath}`,
        );
      }
      throw error;
    }

    return files;
  }

  /**
   * Process a single file
   */
  private async processFileInternal(
    filePath: string,
    context: StoreContext,
    config?: NAXMLFileWatcherConfig,
  ): Promise<FileProcessingResult> {
    const startTime = Date.now();
    const fileName = path.basename(filePath);

    let fileContent: string;
    let fileStats: { size: number };
    let fileHash: string;

    try {
      // Read file
      [fileContent, fileStats] = await Promise.all([
        fs.readFile(filePath, "utf-8"),
        fs.stat(filePath),
      ]);

      fileHash = this.naxmlService.calculateHash(fileContent);
    } catch (error) {
      return {
        success: false,
        fileName,
        filePath,
        fileHash: "",
        fileSize: 0,
        status: "FAILED",
        errorMessage: `Failed to read file: ${(error as Error).message}`,
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Check for duplicate file (already processed)
    const isDuplicate = await fileLogService.isFileAlreadyProcessed(
      context.storeId,
      fileHash,
    );

    if (isDuplicate) {
      this.log("info", `Skipping duplicate file: ${fileName}`, {
        fileHash,
        storeId: context.storeId,
      });

      return {
        success: false,
        fileName,
        filePath,
        fileHash,
        fileSize: fileStats.size,
        status: "SKIPPED",
        errorMessage: "File already processed (duplicate hash)",
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Detect document type early for file log
    const earlyValidation = this.naxmlService.validateXml(fileContent);
    const detectedType = earlyValidation.documentType || "TransactionDocument";

    // Create file log entry BEFORE processing
    let fileLogId: string | undefined;

    try {
      fileLogId = await fileLogService.createFileLog({
        storeId: context.storeId,
        posIntegrationId: context.posIntegrationId,
        fileName,
        fileType: detectedType as any,
        direction: "IMPORT",
        fileSizeBytes: fileStats.size,
        fileHash,
        sourcePath: filePath,
        metadata: {
          originalPath: filePath,
        },
      });

      // Mark as processing started
      await fileLogService.markProcessingStarted(fileLogId);
    } catch (fileLogError) {
      // If it's a duplicate hash error, skip processing
      if (
        fileLogError instanceof fileLogService.FileLogError &&
        fileLogError.code === fileLogService.FILE_LOG_ERROR_CODES.DUPLICATE_HASH
      ) {
        this.log("info", `Skipping duplicate file: ${fileName}`, {
          fileHash,
          storeId: context.storeId,
        });

        return {
          success: false,
          fileName,
          filePath,
          fileHash,
          fileSize: fileStats.size,
          status: "SKIPPED",
          errorMessage: "File already processed (duplicate hash)",
          processingTimeMs: Date.now() - startTime,
        };
      }

      this.log("error", "Failed to create file log", {
        error: (fileLogError as Error).message,
        filePath,
      });
      // Continue processing - file log failure should not block file processing
    }

    // Create audit record BEFORE processing
    let auditId: string | undefined;

    try {
      auditId = await auditService.createAuditRecord({
        storeId: context.storeId,
        posIntegrationId: context.posIntegrationId,
        companyId: context.companyId,
        exchangeId: auditService.generateExchangeId("FILE"),
        exchangeType: "FILE_IMPORT",
        direction: "INBOUND",
        dataCategory: this.detectDataCategory(fileName),
        sourceSystem: "NAXML_FILE",
        sourceIdentifier: filePath,
        destinationSystem: "NUVANA",
        accessedByUserId: context.userId,
        accessReason: "NAXML file import",
        metadata: {
          fileName,
          fileSize: fileStats.size,
          fileHash,
          fileLogId,
        },
      });
    } catch (auditError) {
      this.log("error", "Failed to create audit record", {
        error: (auditError as Error).message,
        filePath,
      });
      // Continue processing - audit failure should not block file processing
    }

    try {
      // Parse and validate the file
      const validation = this.naxmlService.validateXml(fileContent);

      if (!validation.isValid) {
        const errorMessage = validation.errors.map((e) => e.message).join("; ");

        // Update file log with failure
        if (fileLogId) {
          await fileLogService.markProcessingFailed(
            fileLogId,
            "VALIDATION_FAILED",
            errorMessage,
            Date.now() - startTime,
          );
        }

        // Update audit record
        if (auditId) {
          await auditService.failAuditRecord(
            auditId,
            "VALIDATION_FAILED",
            errorMessage,
          );
        }

        // Move to error folder if configured
        if (config?.errorPath) {
          await this.moveFile(filePath, config.errorPath, fileName);
        }

        return {
          success: false,
          fileName,
          filePath,
          fileHash,
          fileSize: fileStats.size,
          status: "FAILED",
          errorMessage,
          processingTimeMs: Date.now() - startTime,
          movedTo: config?.errorPath
            ? path.join(config.errorPath, fileName)
            : undefined,
        };
      }

      // Detect document type and process
      const documentType = validation.documentType;
      let recordCount = 0;

      // Parse based on document type
      if (documentType === "TransactionDocument") {
        const result = this.naxmlService.importTransactions(fileContent);
        recordCount = result.recordCount;
      } else if (documentType === "DepartmentMaintenance") {
        const result = this.naxmlService.importDepartments(fileContent);
        recordCount = result.recordCount;
      } else if (documentType === "TenderMaintenance") {
        const result = this.naxmlService.importTenderTypes(fileContent);
        recordCount = result.recordCount;
      } else if (documentType === "TaxRateMaintenance") {
        const result = this.naxmlService.importTaxRates(fileContent);
        recordCount = result.recordCount;
      }

      // Move to processed folder if configured
      let movedTo: string | undefined;
      if (config?.processedPath) {
        const timestampedName = this.addTimestampToFileName(fileName);
        await this.moveFile(filePath, config.processedPath, timestampedName);
        movedTo = path.join(config.processedPath, timestampedName);
      }

      const processingTimeMs = Date.now() - startTime;

      // Update file log with success
      if (fileLogId) {
        await fileLogService.markProcessingSuccess(
          fileLogId,
          recordCount,
          processingTimeMs,
          movedTo,
        );
      }

      // Update audit record
      if (auditId) {
        await auditService.updateAuditRecord(auditId, {
          status: "SUCCESS",
          recordCount,
          dataSizeBytes: BigInt(fileStats.size),
          fileHash,
        });
      }

      return {
        success: true,
        fileName,
        filePath,
        fileHash,
        fileSize: fileStats.size,
        documentType,
        recordCount,
        status: "SUCCESS",
        processingTimeMs,
        movedTo,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const processingTimeMs = Date.now() - startTime;

      // Update file log with failure
      if (fileLogId) {
        await fileLogService.markProcessingFailed(
          fileLogId,
          "PROCESSING_ERROR",
          errorMessage,
          processingTimeMs,
        );
      }

      // Update audit record
      if (auditId) {
        await auditService.failAuditRecord(
          auditId,
          "PROCESSING_ERROR",
          errorMessage,
        );
      }

      // Move to error folder if configured
      if (config?.errorPath) {
        await this.moveFile(filePath, config.errorPath, fileName);
      }

      return {
        success: false,
        fileName,
        filePath,
        fileHash,
        fileSize: fileStats.size,
        status: "FAILED",
        errorMessage,
        processingTimeMs,
        movedTo: config?.errorPath
          ? path.join(config.errorPath, fileName)
          : undefined,
      };
    }
  }

  /**
   * Move a file to a destination directory
   */
  private async moveFile(
    sourcePath: string,
    destDir: string,
    destFileName: string,
  ): Promise<void> {
    const destPath = path.join(destDir, destFileName);

    try {
      // Ensure destination directory exists
      await this.ensureDirectoryExists(destDir);

      // Move file
      await fs.rename(sourcePath, destPath);
    } catch (error) {
      // If rename fails (e.g., cross-device), try copy + delete
      if ((error as NodeJS.ErrnoException).code === "EXDEV") {
        await fs.copyFile(sourcePath, destPath);
        await fs.unlink(sourcePath);
      } else {
        throw error;
      }
    }
  }

  /**
   * Validate a path for security (prevent path traversal)
   */
  private async validatePath(filePath: string): Promise<void> {
    // Normalize the path
    const normalized = path.normalize(filePath);

    // Check for path traversal attempts
    if (normalized.includes("..")) {
      throw new FileWatcherError(
        FILE_WATCHER_ERROR_CODES.PATH_TRAVERSAL,
        "Path traversal detected in file path",
      );
    }

    // Check if path exists and is accessible
    try {
      await fs.access(filePath, fs.constants.R_OK);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new FileWatcherError(
          FILE_WATCHER_ERROR_CODES.FILE_NOT_FOUND,
          `Path not found: ${filePath}`,
        );
      }
      if ((error as NodeJS.ErrnoException).code === "EACCES") {
        throw new FileWatcherError(
          FILE_WATCHER_ERROR_CODES.PERMISSION_DENIED,
          `Permission denied: ${filePath}`,
        );
      }
      throw error;
    }
  }

  /**
   * Ensure a directory exists
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
  }

  /**
   * Calculate file hash
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath);
    return createHash("sha256").update(content).digest("hex");
  }

  /**
   * Convert a glob pattern to a regex
   * Pattern is sanitized by escaping all regex special characters except * and ?
   * which are converted to their regex equivalents (safe glob-to-regex conversion)
   */
  private globToRegex(pattern: string): RegExp {
    const escaped = pattern
      .toLowerCase()
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");
    // eslint-disable-next-line security/detect-non-literal-regexp -- Pattern is sanitized above
    return new RegExp(`^${escaped}$`, "i");
  }

  /**
   * Add timestamp to file name for archiving
   */
  private addTimestampToFileName(fileName: string): string {
    const ext = path.extname(fileName);
    const base = path.basename(fileName, ext);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `${base}_${timestamp}${ext}`;
  }

  /**
   * Detect data category from file name
   */
  private detectDataCategory(
    fileName: string,
  ):
    | "TRANSACTION"
    | "DEPARTMENT"
    | "TENDER_TYPE"
    | "TAX_RATE"
    | "PRICEBOOK"
    | "EMPLOYEE"
    | "SYSTEM_CONFIG" {
    const lowerName = fileName.toLowerCase();

    if (lowerName.includes("tlog") || lowerName.includes("trans")) {
      return "TRANSACTION";
    }
    if (lowerName.includes("dept")) {
      return "DEPARTMENT";
    }
    if (lowerName.includes("tender") || lowerName.includes("payment")) {
      return "TENDER_TYPE";
    }
    if (lowerName.includes("tax")) {
      return "TAX_RATE";
    }
    if (
      lowerName.includes("price") ||
      lowerName.includes("item") ||
      lowerName.includes("plu")
    ) {
      return "PRICEBOOK";
    }
    if (lowerName.includes("emp") || lowerName.includes("cashier")) {
      return "EMPLOYEE";
    }

    return "SYSTEM_CONFIG";
  }

  /**
   * Log a message
   */
  private log(
    level: "info" | "warn" | "error",
    message: string,
    data?: Record<string, unknown>,
  ): void {
    const prefix = "[FileWatcher]";
    const logData = data ? JSON.stringify(data) : "";

    switch (level) {
      case "info":
        console.log(`${prefix} ${message}`, logData);
        break;
      case "warn":
        console.warn(`${prefix} ${message}`, logData);
        break;
      case "error":
        console.error(`${prefix} ${message}`, logData);
        break;
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let fileWatcherInstance: POSFileWatcherService | null = null;

/**
 * Get the singleton file watcher instance
 */
export function getFileWatcherService(): POSFileWatcherService {
  if (!fileWatcherInstance) {
    fileWatcherInstance = new POSFileWatcherService();
  }
  return fileWatcherInstance;
}

/**
 * Create a new file watcher instance (for testing)
 */
export function createFileWatcherService(): POSFileWatcherService {
  return new POSFileWatcherService();
}
