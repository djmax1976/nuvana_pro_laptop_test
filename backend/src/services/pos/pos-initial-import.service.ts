/**
 * POS Initial Import Service
 *
 * Handles the initial data import flow when a new POS connection is established.
 * Discovers fuel grades and positions from historical FGM/FPM files and creates
 * the corresponding database records.
 *
 * @module services/pos/pos-initial-import.service
 * @security SEC-006 Parameterized queries, DB-006 Tenant isolation
 */

import * as path from "path";
import { promises as fs } from "fs";
import { prisma } from "../../utils/db";
import { createNAXMLParser, NAXMLParser } from "../naxml/naxml.parser";
import type {
  NAXMLFuelGradeMovementData,
  NAXMLFuelProductMovementData,
} from "../../types/naxml.types";
import type { FuelProductType, POSIntegration } from "@prisma/client";

// ============================================================================
// Constants
// ============================================================================

/**
 * Standard fuel grade name mappings (Gilbarco)
 * Based on common industry conventions
 */
const FUEL_GRADE_NAME_MAP: Record<
  string,
  { name: string; productType: FuelProductType }
> = {
  "001": { name: "UNLEAD REG", productType: "GASOLINE" },
  "002": { name: "UNLEAD PLUS", productType: "GASOLINE" },
  "003": { name: "UNLEAD PREM", productType: "GASOLINE" },
  "004": { name: "UNLEAD SUPER", productType: "GASOLINE" },
  "005": { name: "E85", productType: "GASOLINE" },
  "021": { name: "DIESEL #1", productType: "DIESEL" },
  "022": { name: "DIESEL #2", productType: "DIESEL" },
  "023": { name: "DEF", productType: "DEF" },
  "300": { name: "KEROSENE", productType: "KEROSENE" },
};

/**
 * Import status states
 */
export type ImportStatus =
  | "PENDING"
  | "SCANNING"
  | "DISCOVERING"
  | "IMPORTING"
  | "COMPLETED"
  | "FAILED";

// ============================================================================
// Types
// ============================================================================

/**
 * Discovery result for fuel grades
 */
export interface DiscoveredFuelGrade {
  gradeId: string;
  suggestedName: string;
  productType: FuelProductType;
  discoveredFrom: string[];
}

/**
 * Discovery result for fuel positions
 */
export interface DiscoveredFuelPosition {
  positionId: string;
  suggestedName: string;
  gradeIds: string[];
  discoveredFrom: string[];
}

/**
 * Import progress tracking
 */
export interface ImportProgress {
  status: ImportStatus;
  filesScanned: number;
  totalFiles: number;
  fuelGradesDiscovered: number;
  fuelPositionsDiscovered: number;
  recordsCreated: number;
  errors: string[];
  startedAt: Date;
  completedAt?: Date;
}

/**
 * Import options
 */
export interface ImportOptions {
  /** Directory to scan for files */
  sourceDirectory: string;
  /** File patterns to include */
  filePatterns?: string[];
  /** Maximum files to process (for large backlogs) */
  maxFiles?: number;
  /** Skip files already processed */
  skipProcessed?: boolean;
  /** Correlation ID for tracing */
  correlationId?: string;
}

/**
 * Import result
 */
export interface ImportResult {
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  fuelGrades: DiscoveredFuelGrade[];
  fuelPositions: DiscoveredFuelPosition[];
  recordsCreated: {
    fuelGrades: number;
    fuelPositions: number;
    shiftFuelSummaries: number;
    meterReadings: number;
  };
  errors: string[];
  durationMs: number;
}

// ============================================================================
// Service Class
// ============================================================================

/**
 * POS Initial Import Service
 *
 * Handles the complete import flow for new POS connections:
 * 1. Scan directory for FGM/FPM files
 * 2. Discover unique fuel grades and positions
 * 3. Create FuelGrade and FuelPosition records
 * 4. Import historical data
 */
export class PosInitialImportService {
  private readonly parser: NAXMLParser;
  private progress: Map<string, ImportProgress> = new Map();

  constructor() {
    this.parser = createNAXMLParser({ trimWhitespace: true });
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Run the full import flow for a POS integration.
   *
   * @param integrationId - POS integration UUID
   * @param options - Import options
   * @returns Import result with discovered entities and created records
   */
  async runImport(
    integrationId: string,
    options: ImportOptions,
  ): Promise<ImportResult> {
    const startTime = Date.now();
    const correlationId = options.correlationId || this.generateCorrelationId();

    console.log(`[PosInitialImport] Starting import`, {
      correlationId,
      integrationId,
      sourceDirectory: options.sourceDirectory,
    });

    // Initialize progress tracking
    this.initializeProgress(integrationId);
    this.updateProgress(integrationId, { status: "SCANNING" });

    try {
      // 1. Get integration context
      const integration = await this.getIntegration(integrationId);
      const { storeId, companyId } = await this.getStoreContext(
        integration.store_id,
      );

      // 2. Scan directory for files
      const files = await this.scanDirectory(
        options.sourceDirectory,
        options.filePatterns || ["FGM*.xml", "FPM*.xml"],
        options.maxFiles,
      );

      this.updateProgress(integrationId, {
        totalFiles: files.length,
        status: "DISCOVERING",
      });

      if (files.length === 0) {
        console.log(`[PosInitialImport] No files found`, {
          correlationId,
          directory: options.sourceDirectory,
        });
        return this.completeImport(integrationId, startTime, {
          fuelGrades: [],
          fuelPositions: [],
          recordsCreated: {
            fuelGrades: 0,
            fuelPositions: 0,
            shiftFuelSummaries: 0,
            meterReadings: 0,
          },
        });
      }

      // 3. Discover fuel grades and positions
      const { grades, positions } = await this.discoverEntities(
        integrationId,
        files,
      );

      this.updateProgress(integrationId, {
        fuelGradesDiscovered: grades.length,
        fuelPositionsDiscovered: positions.length,
        status: "IMPORTING",
      });

      // 4. Create records in database
      const recordsCreated = await this.createRecords(
        companyId,
        storeId,
        integrationId,
        grades,
        positions,
      );

      return this.completeImport(integrationId, startTime, {
        fuelGrades: grades,
        fuelPositions: positions,
        recordsCreated,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.updateProgress(integrationId, {
        status: "FAILED",
        errors: [message],
      });

      console.error(`[PosInitialImport] Import failed`, {
        correlationId,
        error: message,
      });

      return {
        status: "FAILED",
        fuelGrades: [],
        fuelPositions: [],
        recordsCreated: {
          fuelGrades: 0,
          fuelPositions: 0,
          shiftFuelSummaries: 0,
          meterReadings: 0,
        },
        errors: [message],
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Discover fuel grades from FGM files without creating records.
   * Useful for preview/review before import.
   *
   * @param directory - Directory to scan
   * @param maxFiles - Maximum files to process
   * @returns Discovered fuel grades
   */
  async discoverFuelGrades(
    directory: string,
    maxFiles?: number,
  ): Promise<DiscoveredFuelGrade[]> {
    const files = await this.scanDirectory(directory, ["FGM*.xml"], maxFiles);
    const gradeMap = new Map<string, DiscoveredFuelGrade>();

    for (const file of files) {
      try {
        const xml = await fs.readFile(file, "utf-8");
        const document = this.parser.parse(xml);

        if (document.documentType !== "FuelGradeMovement") continue;

        const data = document.data as NAXMLFuelGradeMovementData;
        for (const detail of data.fgmDetails || []) {
          const existing = gradeMap.get(detail.fuelGradeId);
          if (existing) {
            if (!existing.discoveredFrom.includes(path.basename(file))) {
              existing.discoveredFrom.push(path.basename(file));
            }
          } else {
            gradeMap.set(detail.fuelGradeId, {
              gradeId: detail.fuelGradeId,
              ...this.mapGradeIdToNameAndType(detail.fuelGradeId),
              discoveredFrom: [path.basename(file)],
            });
          }
        }
      } catch {
        // Skip files that fail to parse
      }
    }

    return Array.from(gradeMap.values()).sort((a, b) =>
      a.gradeId.localeCompare(b.gradeId),
    );
  }

  /**
   * Discover fuel positions from FPM files without creating records.
   * Useful for preview/review before import.
   *
   * @param directory - Directory to scan
   * @param maxFiles - Maximum files to process
   * @returns Discovered fuel positions
   */
  async discoverFuelPositions(
    directory: string,
    maxFiles?: number,
  ): Promise<DiscoveredFuelPosition[]> {
    const files = await this.scanDirectory(directory, ["FPM*.xml"], maxFiles);
    const positionMap = new Map<string, DiscoveredFuelPosition>();

    for (const file of files) {
      try {
        const xml = await fs.readFile(file, "utf-8");
        const document = this.parser.parse(xml);

        if (document.documentType !== "FuelProductMovement") continue;

        const data = document.data as NAXMLFuelProductMovementData;
        for (const detail of data.fpmDetails || []) {
          for (const reading of detail.fpmNonResettableTotals || []) {
            const positionId = reading.fuelPositionId;
            const existing = positionMap.get(positionId);

            if (existing) {
              if (!existing.gradeIds.includes(detail.fuelProductId)) {
                existing.gradeIds.push(detail.fuelProductId);
              }
              if (!existing.discoveredFrom.includes(path.basename(file))) {
                existing.discoveredFrom.push(path.basename(file));
              }
            } else {
              positionMap.set(positionId, {
                positionId,
                suggestedName: `Pump ${positionId}`,
                gradeIds: [detail.fuelProductId],
                discoveredFrom: [path.basename(file)],
              });
            }
          }
        }
      } catch {
        // Skip files that fail to parse
      }
    }

    return Array.from(positionMap.values()).sort(
      (a, b) => parseInt(a.positionId, 10) - parseInt(b.positionId, 10),
    );
  }

  /**
   * Get current import progress for an integration.
   *
   * @param integrationId - POS integration UUID
   * @returns Current progress or undefined if not running
   */
  getProgress(integrationId: string): ImportProgress | undefined {
    return this.progress.get(integrationId);
  }

  // ============================================================================
  // Private Methods - Discovery
  // ============================================================================

  /**
   * Discover all fuel grades and positions from files.
   */
  private async discoverEntities(
    integrationId: string,
    files: string[],
  ): Promise<{
    grades: DiscoveredFuelGrade[];
    positions: DiscoveredFuelPosition[];
  }> {
    const gradeMap = new Map<string, DiscoveredFuelGrade>();
    const positionMap = new Map<string, DiscoveredFuelPosition>();

    for (const file of files) {
      try {
        const xml = await fs.readFile(file, "utf-8");
        const document = this.parser.parse(xml);
        const filename = path.basename(file);

        // Extract from FGM files
        if (document.documentType === "FuelGradeMovement") {
          this.extractGradesFromFGM(
            document.data as NAXMLFuelGradeMovementData,
            filename,
            gradeMap,
          );
          this.extractPositionsFromFGM(
            document.data as NAXMLFuelGradeMovementData,
            filename,
            positionMap,
          );
        }

        // Extract from FPM files
        if (document.documentType === "FuelProductMovement") {
          this.extractPositionsFromFPM(
            document.data as NAXMLFuelProductMovementData,
            filename,
            positionMap,
          );
        }

        // Update progress
        const progress = this.progress.get(integrationId);
        if (progress) {
          this.updateProgress(integrationId, {
            filesScanned: progress.filesScanned + 1,
          });
        }
      } catch {
        // Continue on parse errors
      }
    }

    return {
      grades: Array.from(gradeMap.values()),
      positions: Array.from(positionMap.values()),
    };
  }

  /**
   * Extract fuel grades from FGM data.
   */
  private extractGradesFromFGM(
    data: NAXMLFuelGradeMovementData,
    filename: string,
    gradeMap: Map<string, DiscoveredFuelGrade>,
  ): void {
    for (const detail of data.fgmDetails || []) {
      const existing = gradeMap.get(detail.fuelGradeId);
      if (existing) {
        if (!existing.discoveredFrom.includes(filename)) {
          existing.discoveredFrom.push(filename);
        }
      } else {
        gradeMap.set(detail.fuelGradeId, {
          gradeId: detail.fuelGradeId,
          ...this.mapGradeIdToNameAndType(detail.fuelGradeId),
          discoveredFrom: [filename],
        });
      }
    }
  }

  /**
   * Extract fuel positions from FGM position summaries.
   */
  private extractPositionsFromFGM(
    data: NAXMLFuelGradeMovementData,
    filename: string,
    positionMap: Map<string, DiscoveredFuelPosition>,
  ): void {
    for (const detail of data.fgmDetails || []) {
      if (detail.fgmPositionSummary) {
        const positionId = detail.fgmPositionSummary.fuelPositionId;
        const existing = positionMap.get(positionId);

        if (existing) {
          if (!existing.gradeIds.includes(detail.fuelGradeId)) {
            existing.gradeIds.push(detail.fuelGradeId);
          }
          if (!existing.discoveredFrom.includes(filename)) {
            existing.discoveredFrom.push(filename);
          }
        } else {
          positionMap.set(positionId, {
            positionId,
            suggestedName: `Pump ${positionId}`,
            gradeIds: [detail.fuelGradeId],
            discoveredFrom: [filename],
          });
        }
      }
    }
  }

  /**
   * Extract fuel positions from FPM data.
   */
  private extractPositionsFromFPM(
    data: NAXMLFuelProductMovementData,
    filename: string,
    positionMap: Map<string, DiscoveredFuelPosition>,
  ): void {
    for (const detail of data.fpmDetails || []) {
      for (const reading of detail.fpmNonResettableTotals || []) {
        const positionId = reading.fuelPositionId;
        const existing = positionMap.get(positionId);

        if (existing) {
          if (!existing.gradeIds.includes(detail.fuelProductId)) {
            existing.gradeIds.push(detail.fuelProductId);
          }
          if (!existing.discoveredFrom.includes(filename)) {
            existing.discoveredFrom.push(filename);
          }
        } else {
          positionMap.set(positionId, {
            positionId,
            suggestedName: `Pump ${positionId}`,
            gradeIds: [detail.fuelProductId],
            discoveredFrom: [filename],
          });
        }
      }
    }
  }

  // ============================================================================
  // Private Methods - Record Creation
  // ============================================================================

  /**
   * Create FuelGrade and FuelPosition records in the database.
   */
  private async createRecords(
    companyId: string,
    storeId: string,
    integrationId: string,
    grades: DiscoveredFuelGrade[],
    positions: DiscoveredFuelPosition[],
  ): Promise<{
    fuelGrades: number;
    fuelPositions: number;
    shiftFuelSummaries: number;
    meterReadings: number;
  }> {
    let fuelGradesCreated = 0;
    let fuelPositionsCreated = 0;

    await prisma.$transaction(async (tx) => {
      // Create fuel grades
      for (const grade of grades) {
        const existing = await tx.fuelGrade.findUnique({
          where: {
            company_id_grade_id: {
              company_id: companyId,
              grade_id: grade.gradeId,
            },
          },
        });

        if (!existing) {
          await tx.fuelGrade.create({
            data: {
              company_id: companyId,
              pos_integration_id: integrationId,
              grade_id: grade.gradeId,
              name: grade.suggestedName,
              product_type: grade.productType,
              is_active: true,
            },
          });
          fuelGradesCreated++;
        }
      }

      // Create fuel positions
      for (const position of positions) {
        const existing = await tx.fuelPosition.findUnique({
          where: {
            store_id_position_id: {
              store_id: storeId,
              position_id: position.positionId,
            },
          },
        });

        if (!existing) {
          await tx.fuelPosition.create({
            data: {
              company_id: companyId,
              store_id: storeId,
              pos_integration_id: integrationId,
              position_id: position.positionId,
              name: position.suggestedName,
              is_active: true,
            },
          });
          fuelPositionsCreated++;
        }
      }
    });

    return {
      fuelGrades: fuelGradesCreated,
      fuelPositions: fuelPositionsCreated,
      shiftFuelSummaries: 0, // Historical data import is separate
      meterReadings: 0, // Historical data import is separate
    };
  }

  // ============================================================================
  // Private Methods - File Operations
  // ============================================================================

  /**
   * Scan directory for matching files.
   */
  private async scanDirectory(
    directory: string,
    patterns: string[],
    maxFiles?: number,
  ): Promise<string[]> {
    // Validate directory exists
    try {
      const stat = await fs.stat(directory);
      if (!stat.isDirectory()) {
        throw new Error(`Not a directory: ${directory}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`Directory not found: ${directory}`);
      }
      throw error;
    }

    // Read directory contents
    const entries = await fs.readdir(directory, { withFileTypes: true });

    // Filter files by patterns
    const matchingFiles: string[] = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;

      const matches = patterns.some((pattern) => {
        // Convert glob pattern to regex - pattern is from controlled internal constants
        // eslint-disable-next-line security/detect-non-literal-regexp
        const regex = new RegExp(
          "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$",
          "i",
        );
        return regex.test(entry.name);
      });

      if (matches) {
        matchingFiles.push(path.join(directory, entry.name));
      }

      if (maxFiles && matchingFiles.length >= maxFiles) {
        break;
      }
    }

    // Sort by filename (typically includes date)
    return matchingFiles.sort();
  }

  // ============================================================================
  // Private Methods - Mapping
  // ============================================================================

  /**
   * Map grade ID to suggested name and product type.
   */
  private mapGradeIdToNameAndType(gradeId: string): {
    suggestedName: string;
    productType: FuelProductType;
  } {
    const mapping = FUEL_GRADE_NAME_MAP[gradeId];
    if (mapping) {
      return {
        suggestedName: mapping.name,
        productType: mapping.productType,
      };
    }

    // Generate generic name for unknown grades
    return {
      suggestedName: `GRADE ${gradeId}`,
      productType: "OTHER",
    };
  }

  // ============================================================================
  // Private Methods - Context
  // ============================================================================

  /**
   * Get POS integration from database.
   */
  private async getIntegration(integrationId: string): Promise<POSIntegration> {
    const integration = await prisma.pOSIntegration.findUnique({
      where: { pos_integration_id: integrationId },
    });

    if (!integration) {
      throw new Error(`POS integration not found: ${integrationId}`);
    }

    return integration;
  }

  /**
   * Get store context from database.
   */
  private async getStoreContext(
    storeId: string,
  ): Promise<{ storeId: string; companyId: string }> {
    const store = await prisma.store.findUnique({
      where: { store_id: storeId },
      select: { store_id: true, company_id: true },
    });

    if (!store) {
      throw new Error(`Store not found: ${storeId}`);
    }

    return {
      storeId: store.store_id,
      companyId: store.company_id,
    };
  }

  // ============================================================================
  // Private Methods - Progress Tracking
  // ============================================================================

  /**
   * Initialize progress tracking for an import.
   */
  private initializeProgress(integrationId: string): void {
    this.progress.set(integrationId, {
      status: "PENDING",
      filesScanned: 0,
      totalFiles: 0,
      fuelGradesDiscovered: 0,
      fuelPositionsDiscovered: 0,
      recordsCreated: 0,
      errors: [],
      startedAt: new Date(),
    });
  }

  /**
   * Update progress tracking.
   */
  private updateProgress(
    integrationId: string,
    updates: Partial<ImportProgress>,
  ): void {
    const current = this.progress.get(integrationId);
    if (current) {
      this.progress.set(integrationId, { ...current, ...updates });
    }
  }

  /**
   * Complete import and return result.
   */
  private completeImport(
    integrationId: string,
    startTime: number,
    data: Omit<ImportResult, "status" | "errors" | "durationMs">,
  ): ImportResult {
    const progress = this.progress.get(integrationId);
    const errors = progress?.errors || [];

    this.updateProgress(integrationId, {
      status: "COMPLETED",
      recordsCreated:
        data.recordsCreated.fuelGrades + data.recordsCreated.fuelPositions,
      completedAt: new Date(),
    });

    return {
      status: errors.length > 0 ? "PARTIAL" : "SUCCESS",
      fuelGrades: data.fuelGrades,
      fuelPositions: data.fuelPositions,
      recordsCreated: data.recordsCreated,
      errors,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Generate correlation ID for tracing.
   */
  private generateCorrelationId(): string {
    return `import-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

let instance: PosInitialImportService | null = null;

/**
 * Get or create the POS initial import service instance.
 */
export function getPosInitialImportService(): PosInitialImportService {
  if (!instance) {
    instance = new PosInitialImportService();
  }
  return instance;
}

/**
 * Create a new POS initial import service instance.
 * Use for testing or isolation.
 */
export function createPosInitialImportService(): PosInitialImportService {
  return new PosInitialImportService();
}
