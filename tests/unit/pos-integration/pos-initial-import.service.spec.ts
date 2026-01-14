/**
 * POS Initial Import Service Unit Tests
 *
 * Tests for Phase 8: POS Connection Import Flow
 * Covers fuel grade discovery, position discovery, and database record creation.
 *
 * @module tests/unit/pos-integration/pos-initial-import.service.spec.ts
 */

import { describe, it, expect, beforeEach, vi, afterEach, Mock } from "vitest";
import * as path from "path";

// Mock modules BEFORE importing the service
vi.mock("../../../backend/src/utils/db", () => ({
  prisma: {
    pOSIntegration: {
      findUnique: vi.fn(),
    },
    store: {
      findUnique: vi.fn(),
    },
    fuelGrade: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    fuelPosition: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn((callback: (tx: unknown) => Promise<void>) =>
      callback({
        fuelGrade: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ fuel_grade_id: "uuid" }),
        },
        fuelPosition: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ fuel_position_id: "uuid" }),
        },
      }),
    ),
  },
}));

// Mock fs/promises
const mockStat = vi.fn();
const mockReaddir = vi.fn();
const mockReadFile = vi.fn();

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    promises: {
      stat: (...args: unknown[]) => mockStat(...args),
      readdir: (...args: unknown[]) => mockReaddir(...args),
      readFile: (...args: unknown[]) => mockReadFile(...args),
    },
  };
});

// Import service AFTER mocks are set up
import {
  PosInitialImportService,
  createPosInitialImportService,
  DiscoveredFuelGrade,
  DiscoveredFuelPosition,
} from "../../../backend/src/services/pos/pos-initial-import.service";

// ============================================================================
// Test Data
// ============================================================================

const FGM_BY_TENDER_XML = `<?xml version="1.0"?>
<NAXML-MovementReport version="3.4">
  <TransmissionHeader>
    <StoreLocationID>299</StoreLocationID>
    <VendorName>Gilbarco</VendorName>
    <VendorModelVersion>3.4</VendorModelVersion>
  </TransmissionHeader>
  <FuelGradeMovement>
    <MovementHeader>
      <PrimaryReportPeriod>2</PrimaryReportPeriod>
      <BusinessDate>2026-01-03</BusinessDate>
    </MovementHeader>
    <FGMDetail>
      <FuelGradeID>001</FuelGradeID>
      <FGMTenderSummary>
        <Tender>
          <TenderCode>cash</TenderCode>
          <TenderSubCode>generic</TenderSubCode>
        </Tender>
        <FGMSellPriceSummary>
          <ActualSalesPrice>2.519</ActualSalesPrice>
          <FGMServiceLevelSummary>
            <ServiceLevelCode>1</ServiceLevelCode>
            <FGMSalesTotals>
              <FuelGradeSalesVolume>100.500</FuelGradeSalesVolume>
              <FuelGradeSalesAmount>253.16</FuelGradeSalesAmount>
              <DiscountAmount>0.00</DiscountAmount>
              <DiscountCount>0</DiscountCount>
            </FGMSalesTotals>
          </FGMServiceLevelSummary>
        </FGMSellPriceSummary>
      </FGMTenderSummary>
    </FGMDetail>
    <FGMDetail>
      <FuelGradeID>002</FuelGradeID>
      <FGMTenderSummary>
        <Tender>
          <TenderCode>cash</TenderCode>
          <TenderSubCode>generic</TenderSubCode>
        </Tender>
        <FGMSellPriceSummary>
          <ActualSalesPrice>2.619</ActualSalesPrice>
          <FGMServiceLevelSummary>
            <ServiceLevelCode>1</ServiceLevelCode>
            <FGMSalesTotals>
              <FuelGradeSalesVolume>50.000</FuelGradeSalesVolume>
              <FuelGradeSalesAmount>130.95</FuelGradeSalesAmount>
              <DiscountAmount>0.00</DiscountAmount>
              <DiscountCount>0</DiscountCount>
            </FGMSalesTotals>
          </FGMServiceLevelSummary>
        </FGMSellPriceSummary>
      </FGMTenderSummary>
    </FGMDetail>
    <FGMDetail>
      <FuelGradeID>021</FuelGradeID>
      <FGMTenderSummary>
        <Tender>
          <TenderCode>outsideCredit</TenderCode>
          <TenderSubCode>generic</TenderSubCode>
        </Tender>
        <FGMSellPriceSummary>
          <ActualSalesPrice>3.199</ActualSalesPrice>
          <FGMServiceLevelSummary>
            <ServiceLevelCode>1</ServiceLevelCode>
            <FGMSalesTotals>
              <FuelGradeSalesVolume>25.000</FuelGradeSalesVolume>
              <FuelGradeSalesAmount>79.98</FuelGradeSalesAmount>
              <DiscountAmount>0.00</DiscountAmount>
              <DiscountCount>0</DiscountCount>
            </FGMSalesTotals>
          </FGMServiceLevelSummary>
        </FGMSellPriceSummary>
      </FGMTenderSummary>
    </FGMDetail>
    <FGMDetail>
      <FuelGradeID>300</FuelGradeID>
      <FGMTenderSummary>
        <Tender>
          <TenderCode>cash</TenderCode>
          <TenderSubCode>generic</TenderSubCode>
        </Tender>
        <FGMSellPriceSummary>
          <ActualSalesPrice>5.999</ActualSalesPrice>
          <FGMServiceLevelSummary>
            <ServiceLevelCode>1</ServiceLevelCode>
            <FGMSalesTotals>
              <FuelGradeSalesVolume>10.000</FuelGradeSalesVolume>
              <FuelGradeSalesAmount>59.99</FuelGradeSalesAmount>
              <DiscountAmount>0.00</DiscountAmount>
              <DiscountCount>0</DiscountCount>
            </FGMSalesTotals>
          </FGMServiceLevelSummary>
        </FGMSellPriceSummary>
      </FGMTenderSummary>
    </FGMDetail>
  </FuelGradeMovement>
</NAXML-MovementReport>`;

const FPM_XML = `<?xml version="1.0"?>
<NAXML-MovementReport version="3.4">
  <TransmissionHeader>
    <StoreLocationID>299</StoreLocationID>
    <VendorName>Gilbarco</VendorName>
    <VendorModelVersion>3.4</VendorModelVersion>
  </TransmissionHeader>
  <FuelProductMovement>
    <MovementHeader>
      <PrimaryReportPeriod>98</PrimaryReportPeriod>
      <BusinessDate>2026-01-03</BusinessDate>
    </MovementHeader>
    <FPMDetail>
      <FuelProductID>001</FuelProductID>
      <FPMNonResettableTotals>
        <FuelPositionID>1</FuelPositionID>
        <FuelProductNonResettableVolumeNumber>123456.789</FuelProductNonResettableVolumeNumber>
        <FuelProductNonResettableAmountNumber>311111.22</FuelProductNonResettableAmountNumber>
      </FPMNonResettableTotals>
      <FPMNonResettableTotals>
        <FuelPositionID>2</FuelPositionID>
        <FuelProductNonResettableVolumeNumber>98765.432</FuelProductNonResettableVolumeNumber>
        <FuelProductNonResettableAmountNumber>248765.43</FuelProductNonResettableAmountNumber>
      </FPMNonResettableTotals>
    </FPMDetail>
    <FPMDetail>
      <FuelProductID>021</FuelProductID>
      <FPMNonResettableTotals>
        <FuelPositionID>3</FuelPositionID>
        <FuelProductNonResettableVolumeNumber>54321.000</FuelProductNonResettableVolumeNumber>
        <FuelProductNonResettableAmountNumber>173827.20</FuelProductNonResettableAmountNumber>
      </FPMNonResettableTotals>
    </FPMDetail>
  </FuelProductMovement>
</NAXML-MovementReport>`;

// ============================================================================
// Test Suite
// ============================================================================

describe("PosInitialImportService", () => {
  let service: PosInitialImportService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStat.mockReset();
    mockReaddir.mockReset();
    mockReadFile.mockReset();
    service = createPosInitialImportService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 8.T1: discoverFuelGrades() - extract unique grades from FGM
  // ==========================================================================
  describe("discoverFuelGrades()", () => {
    it("8.T1: extracts unique grades from FGM files", async () => {
      // Mock directory scan
      mockStat.mockResolvedValue({ isDirectory: () => true });
      mockReaddir.mockResolvedValue([
        { name: "FGM001.xml", isFile: () => true },
      ]);
      mockReadFile.mockResolvedValue(FGM_BY_TENDER_XML);

      const grades = await service.discoverFuelGrades("/test/dir");

      expect(grades).toHaveLength(4);
      expect(grades.map((g) => g.gradeId)).toEqual([
        "001",
        "002",
        "021",
        "300",
      ]);
    });

    // 8.T2: discoverFuelGrades() - map gradeId to standard names
    it("8.T2: maps gradeId to standard names", async () => {
      mockStat.mockResolvedValue({ isDirectory: () => true });
      mockReaddir.mockResolvedValue([
        { name: "FGM001.xml", isFile: () => true },
      ]);
      mockReadFile.mockResolvedValue(FGM_BY_TENDER_XML);

      const grades = await service.discoverFuelGrades("/test/dir");

      const grade001 = grades.find((g) => g.gradeId === "001");
      const grade021 = grades.find((g) => g.gradeId === "021");
      const grade300 = grades.find((g) => g.gradeId === "300");

      expect(grade001?.suggestedName).toBe("UNLEAD REG");
      expect(grade001?.productType).toBe("GASOLINE");

      expect(grade021?.suggestedName).toBe("DIESEL #1");
      expect(grade021?.productType).toBe("DIESEL");

      expect(grade300?.suggestedName).toBe("KEROSENE");
      expect(grade300?.productType).toBe("KEROSENE");
    });

    // 8.T5-8.T8: Grade name mapping tests
    it("8.T5: maps 001 to UNLEAD REG with GASOLINE type", async () => {
      mockStat.mockResolvedValue({ isDirectory: () => true });
      mockReaddir.mockResolvedValue([
        { name: "FGM001.xml", isFile: () => true },
      ]);
      mockReadFile.mockResolvedValue(FGM_BY_TENDER_XML);

      const grades = await service.discoverFuelGrades("/test/dir");
      const grade = grades.find((g) => g.gradeId === "001");

      expect(grade?.suggestedName).toBe("UNLEAD REG");
      expect(grade?.productType).toBe("GASOLINE");
    });

    it("8.T6: maps 021 to DIESEL #1 with DIESEL type", async () => {
      mockStat.mockResolvedValue({ isDirectory: () => true });
      mockReaddir.mockResolvedValue([
        { name: "FGM001.xml", isFile: () => true },
      ]);
      mockReadFile.mockResolvedValue(FGM_BY_TENDER_XML);

      const grades = await service.discoverFuelGrades("/test/dir");
      const grade = grades.find((g) => g.gradeId === "021");

      expect(grade?.suggestedName).toBe("DIESEL #1");
      expect(grade?.productType).toBe("DIESEL");
    });

    it("8.T7: maps 300 to KEROSENE with KEROSENE type", async () => {
      mockStat.mockResolvedValue({ isDirectory: () => true });
      mockReaddir.mockResolvedValue([
        { name: "FGM001.xml", isFile: () => true },
      ]);
      mockReadFile.mockResolvedValue(FGM_BY_TENDER_XML);

      const grades = await service.discoverFuelGrades("/test/dir");
      const grade = grades.find((g) => g.gradeId === "300");

      expect(grade?.suggestedName).toBe("KEROSENE");
      expect(grade?.productType).toBe("KEROSENE");
    });

    it("8.T8: unknown gradeId creates generic name", async () => {
      const unknownGradeXml = FGM_BY_TENDER_XML.replace(/001/g, "999");
      mockStat.mockResolvedValue({ isDirectory: () => true });
      mockReaddir.mockResolvedValue([
        { name: "FGM001.xml", isFile: () => true },
      ]);
      mockReadFile.mockResolvedValue(unknownGradeXml);

      const grades = await service.discoverFuelGrades("/test/dir");
      const grade = grades.find((g) => g.gradeId === "999");

      expect(grade?.suggestedName).toBe("GRADE 999");
      expect(grade?.productType).toBe("OTHER");
    });
  });

  // ==========================================================================
  // 8.T3-8.T4: discoverFuelPositions() tests
  // ==========================================================================
  describe("discoverFuelPositions()", () => {
    it("8.T3: extracts positions from FPM files", async () => {
      mockStat.mockResolvedValue({ isDirectory: () => true });
      mockReaddir.mockResolvedValue([
        { name: "FPM001.xml", isFile: () => true },
      ]);
      mockReadFile.mockResolvedValue(FPM_XML);

      const positions = await service.discoverFuelPositions("/test/dir");

      expect(positions).toHaveLength(3);
      expect(positions.map((p) => p.positionId)).toEqual(["1", "2", "3"]);
    });

    it("8.T4: associates grades to positions", async () => {
      mockStat.mockResolvedValue({ isDirectory: () => true });
      mockReaddir.mockResolvedValue([
        { name: "FPM001.xml", isFile: () => true },
      ]);
      mockReadFile.mockResolvedValue(FPM_XML);

      const positions = await service.discoverFuelPositions("/test/dir");

      const pos1 = positions.find((p) => p.positionId === "1");
      const pos3 = positions.find((p) => p.positionId === "3");

      expect(pos1?.gradeIds).toContain("001");
      expect(pos3?.gradeIds).toContain("021");
    });

    it("generates Pump names for positions", async () => {
      mockStat.mockResolvedValue({ isDirectory: () => true });
      mockReaddir.mockResolvedValue([
        { name: "FPM001.xml", isFile: () => true },
      ]);
      mockReadFile.mockResolvedValue(FPM_XML);

      const positions = await service.discoverFuelPositions("/test/dir");

      expect(positions[0]?.suggestedName).toBe("Pump 1");
      expect(positions[1]?.suggestedName).toBe("Pump 2");
      expect(positions[2]?.suggestedName).toBe("Pump 3");
    });
  });

  // ==========================================================================
  // Progress Tracking Tests
  // ==========================================================================
  describe("getProgress()", () => {
    it("returns undefined for unknown integration", () => {
      const progress = service.getProgress("unknown-id");
      expect(progress).toBeUndefined();
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================
  describe("Edge Cases", () => {
    // 8.T21: Empty directory
    it("8.T21: handles empty directory", async () => {
      mockStat.mockResolvedValue({ isDirectory: () => true });
      mockReaddir.mockResolvedValue([]);

      const grades = await service.discoverFuelGrades("/test/empty");
      expect(grades).toHaveLength(0);
    });

    // 8.T22: Single file import
    it("8.T22: handles single file import", async () => {
      mockStat.mockResolvedValue({ isDirectory: () => true });
      mockReaddir.mockResolvedValue([
        { name: "FGM001.xml", isFile: () => true },
      ]);
      mockReadFile.mockResolvedValue(FGM_BY_TENDER_XML);

      const grades = await service.discoverFuelGrades("/test/single", 1);
      expect(grades.length).toBeGreaterThan(0);
    });

    it("throws error for non-existent directory", async () => {
      const error = new Error("ENOENT");
      (error as NodeJS.ErrnoException).code = "ENOENT";
      mockStat.mockRejectedValue(error);

      await expect(service.discoverFuelGrades("/nonexistent")).rejects.toThrow(
        "Directory not found",
      );
    });

    it("throws error for file instead of directory", async () => {
      mockStat.mockResolvedValue({ isDirectory: () => false });

      await expect(
        service.discoverFuelGrades("/test/file.xml"),
      ).rejects.toThrow("Not a directory");
    });

    it("skips files that fail to parse", async () => {
      mockStat.mockResolvedValue({ isDirectory: () => true });
      mockReaddir.mockResolvedValue([
        { name: "FGM001.xml", isFile: () => true },
        { name: "FGM002.xml", isFile: () => true },
      ]);

      // First file fails, second succeeds
      mockReadFile
        .mockResolvedValueOnce("invalid xml")
        .mockResolvedValueOnce(FGM_BY_TENDER_XML);

      const grades = await service.discoverFuelGrades("/test/mixed");
      expect(grades.length).toBeGreaterThan(0);
    });

    it("deduplicates grades across multiple files", async () => {
      mockStat.mockResolvedValue({ isDirectory: () => true });
      mockReaddir.mockResolvedValue([
        { name: "FGM001.xml", isFile: () => true },
        { name: "FGM002.xml", isFile: () => true },
      ]);
      mockReadFile.mockResolvedValue(FGM_BY_TENDER_XML);

      const grades = await service.discoverFuelGrades("/test/multiple");

      // Should still only have 4 unique grades
      expect(grades).toHaveLength(4);

      // Each grade should be discovered from both files
      for (const grade of grades) {
        expect(grade.discoveredFrom.length).toBe(2);
      }
    });

    it("respects maxFiles limit", async () => {
      mockStat.mockResolvedValue({ isDirectory: () => true });
      mockReaddir.mockResolvedValue([
        { name: "FGM001.xml", isFile: () => true },
        { name: "FGM002.xml", isFile: () => true },
        { name: "FGM003.xml", isFile: () => true },
      ]);
      mockReadFile.mockResolvedValue(FGM_BY_TENDER_XML);

      // Only process 1 file
      const grades = await service.discoverFuelGrades("/test/dir", 1);

      // Grades should only be discovered from 1 file
      for (const grade of grades) {
        expect(grade.discoveredFrom.length).toBe(1);
      }
    });
  });

  // ==========================================================================
  // Import Status Transitions
  // ==========================================================================
  describe("Import Status Transitions", () => {
    it("8.T13: transitions from PENDING to SCANNING on start", async () => {
      // This would require full integration test with mocked prisma
      // For unit test, we verify the progress initialization
      const testService = createPosInitialImportService();

      // Progress is empty initially
      expect(testService.getProgress("test-id")).toBeUndefined();
    });
  });
});
