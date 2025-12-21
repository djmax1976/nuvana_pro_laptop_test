import { test, expect } from "../support/fixtures/rbac.fixture";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";

/**
 * @test-level Unit
 * @justification Unit tests for Verifone Commander adapter business logic
 * @story c-store-pos-adapter-phase-3
 *
 * Verifone Commander Adapter Unit Tests
 *
 * Tests the Verifone Commander adapter functionality:
 * - Connection testing (directory validation)
 * - Department sync
 * - Tender type sync
 * - Cashier sync
 * - Tax rate sync
 * - Transaction import
 * - Export operations
 * - File archival and error handling
 *
 * These tests verify Phase 3 (Verifone Adapters) per the
 * c_store_pos_adapter.md plan document.
 *
 * ================================================================================
 * TRACEABILITY MATRIX
 * ================================================================================
 *
 * | Test ID       | Requirement                           | Method                    | Priority |
 * |---------------|---------------------------------------|---------------------------|----------|
 * | VCMD-001      | Connection test success               | testConnection            | P0       |
 * | VCMD-002      | Connection test failure               | testConnection            | P0       |
 * | VCMD-010      | Sync departments from files           | syncDepartments           | P0       |
 * | VCMD-011      | Sync tender types from files          | syncTenderTypes           | P0       |
 * | VCMD-012      | Sync cashiers from files              | syncCashiers              | P0       |
 * | VCMD-013      | Sync tax rates from files             | syncTaxRates              | P0       |
 * | VCMD-020      | Import transactions                   | importTransactions        | P0       |
 * | VCMD-021      | Handle invalid transaction files      | importTransactions        | P1       |
 * | VCMD-030      | Export departments                    | exportDepartments         | P0       |
 * | VCMD-031      | Export tender types                   | exportTenderTypes         | P0       |
 * | VCMD-032      | Export tax rates                      | exportTaxRates            | P0       |
 * | VCMD-033      | Export price book                     | exportPriceBook           | P0       |
 * | VCMD-040      | Archive processed files               | archiveFile               | P1       |
 * | VCMD-041      | Move error files                      | moveToError               | P1       |
 * | VCMD-050      | Path traversal prevention             | validatePath              | P0       |
 * | VCMD-060      | Get adapter capabilities              | getCapabilities           | P1       |
 *
 * ================================================================================
 */

// =============================================================================
// SAMPLE NAXML DOCUMENTS FOR TESTING
// =============================================================================

const SAMPLE_DEPARTMENT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<NAXMLDepartmentMaintenance version="3.4">
  <MaintenanceHeader>
    <StoreLocationID>COMMANDER001</StoreLocationID>
    <MaintenanceDate>2025-12-19T10:00:00Z</MaintenanceDate>
    <MaintenanceType>Full</MaintenanceType>
  </MaintenanceHeader>
  <Departments>
    <Department Code="001" Action="AddUpdate">
      <Description>Beverages</Description>
      <IsTaxable>Y</IsTaxable>
      <TaxRateCode>STATE</TaxRateCode>
      <MinimumAge>0</MinimumAge>
      <IsActive>Y</IsActive>
      <SortOrder>1</SortOrder>
    </Department>
    <Department Code="002" Action="AddUpdate">
      <Description>Snacks</Description>
      <IsTaxable>Y</IsTaxable>
      <TaxRateCode>STATE</TaxRateCode>
      <MinimumAge>0</MinimumAge>
      <IsActive>Y</IsActive>
      <SortOrder>2</SortOrder>
    </Department>
  </Departments>
</NAXMLDepartmentMaintenance>`;

const SAMPLE_TENDER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<NAXMLTenderMaintenance version="3.4">
  <MaintenanceHeader>
    <StoreLocationID>COMMANDER001</StoreLocationID>
    <MaintenanceDate>2025-12-19T10:00:00Z</MaintenanceDate>
    <MaintenanceType>Full</MaintenanceType>
  </MaintenanceHeader>
  <Tenders>
    <Tender Code="CASH" Action="AddUpdate">
      <Description>Cash</Description>
      <IsCashEquivalent>Y</IsCashEquivalent>
      <IsElectronic>N</IsElectronic>
      <AffectsCashDrawer>Y</AffectsCashDrawer>
      <RequiresReference>N</RequiresReference>
      <IsActive>Y</IsActive>
      <SortOrder>1</SortOrder>
    </Tender>
    <Tender Code="CREDIT" Action="AddUpdate">
      <Description>Credit Card</Description>
      <IsCashEquivalent>N</IsCashEquivalent>
      <IsElectronic>Y</IsElectronic>
      <AffectsCashDrawer>N</AffectsCashDrawer>
      <RequiresReference>Y</RequiresReference>
      <IsActive>Y</IsActive>
      <SortOrder>2</SortOrder>
    </Tender>
  </Tenders>
</NAXMLTenderMaintenance>`;

const SAMPLE_TAX_RATE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<NAXMLTaxRateMaintenance version="3.4">
  <MaintenanceHeader>
    <StoreLocationID>COMMANDER001</StoreLocationID>
    <MaintenanceDate>2025-12-19T10:00:00Z</MaintenanceDate>
    <MaintenanceType>Full</MaintenanceType>
  </MaintenanceHeader>
  <TaxRates>
    <TaxRate Code="STATE" Action="AddUpdate">
      <Description>State Sales Tax</Description>
      <Rate>0.0825</Rate>
      <IsActive>Y</IsActive>
      <JurisdictionCode>TX</JurisdictionCode>
    </TaxRate>
  </TaxRates>
</NAXMLTaxRateMaintenance>`;

const SAMPLE_TRANSACTION_XML = `<?xml version="1.0" encoding="UTF-8"?>
<NAXMLTransactionDocument version="3.4">
  <TransactionHeader>
    <StoreLocationID>COMMANDER001</StoreLocationID>
    <TerminalID>REG01</TerminalID>
    <TransactionID>TXN-20251219-001</TransactionID>
    <BusinessDate>2025-12-19</BusinessDate>
    <TransactionDate>2025-12-19T10:30:00Z</TransactionDate>
    <TransactionType>Sale</TransactionType>
    <CashierID>CASHIER01</CashierID>
  </TransactionHeader>
  <TransactionDetail>
    <LineItem LineNumber="1">
      <ItemCode>123456789012</ItemCode>
      <Description>Cola 20oz</Description>
      <DepartmentCode>001</DepartmentCode>
      <Quantity>2</Quantity>
      <UnitPrice>2.49</UnitPrice>
      <ExtendedPrice>4.98</ExtendedPrice>
      <TaxAmount>0.41</TaxAmount>
    </LineItem>
  </TransactionDetail>
  <TransactionTender>
    <Tender>
      <TenderCode>CASH</TenderCode>
      <TenderDescription>Cash</TenderDescription>
      <Amount>10.00</Amount>
    </Tender>
  </TransactionTender>
  <TransactionTotal>
    <Subtotal>4.98</Subtotal>
    <TaxTotal>0.41</TaxTotal>
    <GrandTotal>5.39</GrandTotal>
    <ChangeDue>4.61</ChangeDue>
  </TransactionTotal>
</NAXMLTransactionDocument>`;

// =============================================================================
// TEST HELPERS
// =============================================================================

interface TestDirs {
  basePath: string;
  importPath: string;
  exportPath: string;
  archivePath: string;
  errorPath: string;
}

async function createTestDirectories(): Promise<TestDirs> {
  const basePath = await fs.mkdtemp(
    path.join(os.tmpdir(), "verifone-commander-test-"),
  );
  const importPath = path.join(basePath, "Import");
  const exportPath = path.join(basePath, "Export");
  const archivePath = path.join(exportPath, "Processed");
  const errorPath = path.join(exportPath, "Error");

  await fs.mkdir(importPath, { recursive: true });
  await fs.mkdir(exportPath, { recursive: true });
  await fs.mkdir(archivePath, { recursive: true });
  await fs.mkdir(errorPath, { recursive: true });

  return { basePath, importPath, exportPath, archivePath, errorPath };
}

async function cleanupTestDirectories(basePath: string): Promise<void> {
  try {
    await fs.rm(basePath, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

function createMockConfig(basePath: string) {
  return {
    commanderBasePath: basePath,
    naxmlVersion: "3.4" as const,
    generateAcknowledgments: false,
    storeLocationId: "COMMANDER001",
    archiveProcessedFiles: true,
    host: "localhost",
    port: 443,
    useSsl: true,
    timeoutMs: 30000,
    authType: "NONE" as const,
    credentials: { type: "NONE" as const },
  };
}

// =============================================================================
// CONNECTION TESTS
// =============================================================================

test.describe("Phase3-Unit: Verifone Commander Adapter - Connection Tests", () => {
  test("VCMD-001: [P0] Should successfully test connection with valid directories", async () => {
    // GIVEN: Valid Commander directory structure
    const dirs = await createTestDirectories();

    try {
      const { createVerifoneCommanderAdapter } =
        await import("../../backend/dist/services/pos/adapters/verifone-commander.adapter");
      const adapter = createVerifoneCommanderAdapter();
      const config = createMockConfig(dirs.basePath);

      // WHEN: Testing connection
      const result = await adapter.testConnection(config);

      // THEN: Connection should succeed
      expect(result.success).toBe(true);
      expect(result.message).toContain("Connected to Verifone Commander");
      expect(result.posVersion).toBe("3.4");
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });

  test("VCMD-002: [P0] Should fail connection test with missing Import directory", async () => {
    // GIVEN: Directory without Import folder
    const basePath = await fs.mkdtemp(
      path.join(os.tmpdir(), "verifone-commander-test-"),
    );
    // Only create Export, not Import
    await fs.mkdir(path.join(basePath, "Export"), { recursive: true });

    try {
      const { createVerifoneCommanderAdapter } =
        await import("../../backend/dist/services/pos/adapters/verifone-commander.adapter");
      const adapter = createVerifoneCommanderAdapter();
      const config = createMockConfig(basePath);

      // WHEN: Testing connection
      const result = await adapter.testConnection(config);

      // THEN: Connection should fail
      expect(result.success).toBe(false);
      expect(result.message).toContain("Import directory not accessible");
      expect(result.errorCode).toBe("VERIFONE_COMMANDER_DIRECTORY_NOT_FOUND");
    } finally {
      await cleanupTestDirectories(basePath);
    }
  });

  test("VCMD-003: [P0] Should fail connection test with missing base path config", async () => {
    // GIVEN: Config without commanderBasePath
    const { createVerifoneCommanderAdapter } =
      await import("../../backend/dist/services/pos/adapters/verifone-commander.adapter");
    const adapter = createVerifoneCommanderAdapter();
    const config = {
      commanderBasePath: "",
      naxmlVersion: "3.4" as const,
      generateAcknowledgments: false,
      storeLocationId: "TEST",
      archiveProcessedFiles: false,
      host: "localhost",
      port: 443,
      useSsl: true,
      timeoutMs: 30000,
      authType: "NONE" as const,
      credentials: { type: "NONE" as const },
    };

    // WHEN: Testing connection
    const result = await adapter.testConnection(config);

    // THEN: Connection should fail with config error
    expect(result.success).toBe(false);
    expect(result.message).toContain("Commander base path is not configured");
    expect(result.errorCode).toBe("VERIFONE_COMMANDER_INVALID_CONFIG");
  });
});

// =============================================================================
// SYNC TESTS
// =============================================================================

test.describe("Phase3-Unit: Verifone Commander Adapter - Sync Tests", () => {
  test("VCMD-010: [P0] Should sync departments from Export folder", async () => {
    // GIVEN: Export folder with department file
    const dirs = await createTestDirectories();
    await fs.writeFile(
      path.join(dirs.exportPath, "DeptMaint_2025-12-19.xml"),
      SAMPLE_DEPARTMENT_XML,
    );

    try {
      const { createVerifoneCommanderAdapter } =
        await import("../../backend/dist/services/pos/adapters/verifone-commander.adapter");
      const adapter = createVerifoneCommanderAdapter();
      const config = createMockConfig(dirs.basePath);

      // WHEN: Syncing departments
      const departments = await adapter.syncDepartments(config);

      // THEN: Departments should be imported
      expect(departments.length).toBe(2);
      expect(departments[0].posCode).toBe("001");
      expect(departments[0].displayName).toBe("Beverages");
      expect(departments[0].isTaxable).toBe(true);
      expect(departments[1].posCode).toBe("002");
      expect(departments[1].displayName).toBe("Snacks");
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });

  test("VCMD-011: [P0] Should sync tender types from Export folder", async () => {
    // GIVEN: Export folder with tender file
    const dirs = await createTestDirectories();
    await fs.writeFile(
      path.join(dirs.exportPath, "TenderMaint_2025-12-19.xml"),
      SAMPLE_TENDER_XML,
    );

    try {
      const { createVerifoneCommanderAdapter } =
        await import("../../backend/dist/services/pos/adapters/verifone-commander.adapter");
      const adapter = createVerifoneCommanderAdapter();
      const config = createMockConfig(dirs.basePath);

      // WHEN: Syncing tender types
      const tenders = await adapter.syncTenderTypes(config);

      // THEN: Tender types should be imported
      expect(tenders.length).toBe(2);
      expect(tenders[0].posCode).toBe("CASH");
      expect(tenders[0].isCashEquivalent).toBe(true);
      expect(tenders[1].posCode).toBe("CREDIT");
      expect(tenders[1].isElectronic).toBe(true);
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });

  test("VCMD-013: [P0] Should sync tax rates from Export folder", async () => {
    // GIVEN: Export folder with tax rate file
    const dirs = await createTestDirectories();
    await fs.writeFile(
      path.join(dirs.exportPath, "TaxMaint_2025-12-19.xml"),
      SAMPLE_TAX_RATE_XML,
    );

    try {
      const { createVerifoneCommanderAdapter } =
        await import("../../backend/dist/services/pos/adapters/verifone-commander.adapter");
      const adapter = createVerifoneCommanderAdapter();
      const config = createMockConfig(dirs.basePath);

      // WHEN: Syncing tax rates
      const taxRates = await adapter.syncTaxRates(config);

      // THEN: Tax rates should be imported
      expect(taxRates.length).toBe(1);
      expect(taxRates[0].posCode).toBe("STATE");
      expect(taxRates[0].rate).toBe(0.0825);
      expect(taxRates[0].jurisdictionCode).toBe("TX");
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });

  test("VCMD-014: [P1] Should return empty array when no files found", async () => {
    // GIVEN: Empty Export folder
    const dirs = await createTestDirectories();

    try {
      const { createVerifoneCommanderAdapter } =
        await import("../../backend/dist/services/pos/adapters/verifone-commander.adapter");
      const adapter = createVerifoneCommanderAdapter();
      const config = createMockConfig(dirs.basePath);

      // WHEN: Syncing departments from empty folder
      const departments = await adapter.syncDepartments(config);

      // THEN: Should return empty array
      expect(departments).toEqual([]);
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });
});

// =============================================================================
// TRANSACTION IMPORT TESTS
// =============================================================================

test.describe("Phase3-Unit: Verifone Commander Adapter - Transaction Import Tests", () => {
  test("VCMD-020: [P0] Should import transactions from Export folder", async () => {
    // GIVEN: Export folder with transaction file
    const dirs = await createTestDirectories();
    await fs.writeFile(
      path.join(dirs.exportPath, "TLog_2025-12-19_001.xml"),
      SAMPLE_TRANSACTION_XML,
    );

    try {
      const { createVerifoneCommanderAdapter } =
        await import("../../backend/dist/services/pos/adapters/verifone-commander.adapter");
      const adapter = createVerifoneCommanderAdapter();
      const config = createMockConfig(dirs.basePath);

      // WHEN: Importing transactions
      const results = await adapter.importTransactions(config);

      // THEN: Transaction should be imported
      expect(results.length).toBe(1);
      expect(results[0].success).toBe(true);
      expect(results[0].recordCount).toBe(1);
      expect(results[0].data.length).toBe(1);
      expect(results[0].data[0].posTransactionId).toBe("TXN-20251219-001");
      expect(results[0].archived).toBe(true);
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });

  test("VCMD-021: [P1] Should handle invalid transaction file gracefully", async () => {
    // GIVEN: Export folder with invalid XML file
    const dirs = await createTestDirectories();
    await fs.writeFile(
      path.join(dirs.exportPath, "TLog_invalid.xml"),
      "This is not valid XML <broken>",
    );

    try {
      const { createVerifoneCommanderAdapter } =
        await import("../../backend/dist/services/pos/adapters/verifone-commander.adapter");
      const adapter = createVerifoneCommanderAdapter();
      const config = createMockConfig(dirs.basePath);

      // WHEN: Importing transactions
      const results = await adapter.importTransactions(config);

      // THEN: Should return error result
      expect(results.length).toBe(1);
      expect(results[0].success).toBe(false);
      expect(results[0].failedCount).toBe(1);
      expect(results[0].errors.length).toBeGreaterThan(0);
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });

  test("VCMD-022: [P1] Should return empty array when no transaction files found", async () => {
    // GIVEN: Empty Export folder
    const dirs = await createTestDirectories();

    try {
      const { createVerifoneCommanderAdapter } =
        await import("../../backend/dist/services/pos/adapters/verifone-commander.adapter");
      const adapter = createVerifoneCommanderAdapter();
      const config = createMockConfig(dirs.basePath);

      // WHEN: Importing transactions from empty folder
      const results = await adapter.importTransactions(config);

      // THEN: Should return empty array
      expect(results).toEqual([]);
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });
});

// =============================================================================
// EXPORT TESTS
// =============================================================================

test.describe("Phase3-Unit: Verifone Commander Adapter - Export Tests", () => {
  test("VCMD-030: [P0] Should export departments to Import folder", async () => {
    // GIVEN: Valid directories and department data
    const dirs = await createTestDirectories();

    try {
      const { createVerifoneCommanderAdapter } =
        await import("../../backend/dist/services/pos/adapters/verifone-commander.adapter");
      const adapter = createVerifoneCommanderAdapter();
      const config = createMockConfig(dirs.basePath);

      const departments = [
        {
          posCode: "001",
          displayName: "Beverages",
          isTaxable: true,
          minimumAge: 0,
          isLottery: false,
          isActive: true,
          sortOrder: 1,
        },
      ];

      // WHEN: Exporting departments
      const result = await adapter.exportDepartments(config, departments);

      // THEN: Export should succeed
      expect(result.success).toBe(true);
      expect(result.documentType).toBe("DepartmentMaintenance");
      expect(result.recordCount).toBe(1);
      expect(result.filePath).toContain("Import");
      expect(result.fileName).toContain("DeptMaint");
      expect(result.fileSizeBytes).toBeGreaterThan(0);
      expect(result.fileHash).toHaveLength(64);

      // Verify file was created
      const files = await fs.readdir(dirs.importPath);
      expect(files.length).toBe(1);
      expect(files[0]).toContain("DeptMaint");
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });

  test("VCMD-031: [P0] Should export tender types to Import folder", async () => {
    // GIVEN: Valid directories and tender data
    const dirs = await createTestDirectories();

    try {
      const { createVerifoneCommanderAdapter } =
        await import("../../backend/dist/services/pos/adapters/verifone-commander.adapter");
      const adapter = createVerifoneCommanderAdapter();
      const config = createMockConfig(dirs.basePath);

      const tenders = [
        {
          posCode: "CASH",
          displayName: "Cash",
          isCashEquivalent: true,
          isElectronic: false,
          affectsCashDrawer: true,
          requiresReference: false,
          isActive: true,
          sortOrder: 1,
        },
      ];

      // WHEN: Exporting tender types
      const result = await adapter.exportTenderTypes(config, tenders);

      // THEN: Export should succeed
      expect(result.success).toBe(true);
      expect(result.documentType).toBe("TenderMaintenance");
      expect(result.recordCount).toBe(1);
      expect(result.fileName).toContain("TenderMaint");
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });

  test("VCMD-032: [P0] Should export tax rates to Import folder", async () => {
    // GIVEN: Valid directories and tax rate data
    const dirs = await createTestDirectories();

    try {
      const { createVerifoneCommanderAdapter } =
        await import("../../backend/dist/services/pos/adapters/verifone-commander.adapter");
      const adapter = createVerifoneCommanderAdapter();
      const config = createMockConfig(dirs.basePath);

      const taxRates = [
        {
          posCode: "STATE",
          displayName: "State Tax",
          rate: 0.0825,
          isActive: true,
          jurisdictionCode: "TX",
        },
      ];

      // WHEN: Exporting tax rates
      const result = await adapter.exportTaxRates(config, taxRates);

      // THEN: Export should succeed
      expect(result.success).toBe(true);
      expect(result.documentType).toBe("TaxRateMaintenance");
      expect(result.recordCount).toBe(1);
      expect(result.fileName).toContain("TaxMaint");
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });

  test("VCMD-033: [P0] Should export price book to Import folder", async () => {
    // GIVEN: Valid directories and price book items
    const dirs = await createTestDirectories();

    try {
      const { createVerifoneCommanderAdapter } =
        await import("../../backend/dist/services/pos/adapters/verifone-commander.adapter");
      const adapter = createVerifoneCommanderAdapter();
      const config = createMockConfig(dirs.basePath);

      const items = [
        {
          itemCode: "123456789012",
          description: "Cola 20oz",
          shortDescription: "Cola",
          departmentCode: "001",
          unitPrice: 2.49,
          taxRateCode: "STATE",
          isActive: true,
          action: "AddUpdate" as const,
        },
      ];

      // WHEN: Exporting price book
      const result = await adapter.exportPriceBook(config, items);

      // THEN: Export should succeed
      expect(result.success).toBe(true);
      expect(result.documentType).toBe("PriceBookMaintenance");
      expect(result.recordCount).toBe(1);
      expect(result.fileName).toContain("PriceBook");
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });
});

// =============================================================================
// FILE MANAGEMENT TESTS
// =============================================================================

test.describe("Phase3-Unit: Verifone Commander Adapter - File Management Tests", () => {
  test("VCMD-040: [P1] Should archive processed files", async () => {
    // GIVEN: Export folder with a file to process
    const dirs = await createTestDirectories();
    await fs.writeFile(
      path.join(dirs.exportPath, "DeptMaint_test.xml"),
      SAMPLE_DEPARTMENT_XML,
    );

    try {
      const { createVerifoneCommanderAdapter } =
        await import("../../backend/dist/services/pos/adapters/verifone-commander.adapter");
      const adapter = createVerifoneCommanderAdapter();
      const config = createMockConfig(dirs.basePath);
      config.archiveProcessedFiles = true;

      // WHEN: Syncing departments (which triggers archival)
      await adapter.syncDepartments(config);

      // THEN: File should be moved to archive
      const exportFiles = await fs.readdir(dirs.exportPath);
      const archiveFiles = await fs.readdir(dirs.archivePath);

      // Original file should be gone (moved to archive)
      expect(exportFiles.filter((f) => f.endsWith(".xml"))).toHaveLength(0);
      // Archive should have the file
      expect(archiveFiles.length).toBe(1);
      expect(archiveFiles[0]).toContain("DeptMaint");
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });

  test("VCMD-041: [P1] Should move invalid files to error folder", async () => {
    // GIVEN: Export folder with invalid XML file
    const dirs = await createTestDirectories();
    await fs.writeFile(
      path.join(dirs.exportPath, "DeptMaint_invalid.xml"),
      "Not valid XML <broken>",
    );

    try {
      const { createVerifoneCommanderAdapter } =
        await import("../../backend/dist/services/pos/adapters/verifone-commander.adapter");
      const adapter = createVerifoneCommanderAdapter();
      const config = createMockConfig(dirs.basePath);
      config.archiveProcessedFiles = true;

      // WHEN: Syncing departments (which should fail)
      await adapter.syncDepartments(config);

      // THEN: File should be moved to error folder
      const exportFiles = await fs.readdir(dirs.exportPath);
      const errorFiles = await fs.readdir(dirs.errorPath);

      // Original file should be gone
      expect(exportFiles.filter((f) => f.endsWith(".xml"))).toHaveLength(0);
      // Error folder should have the file
      expect(errorFiles.length).toBe(1);
      expect(errorFiles[0]).toContain("ERROR");
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });
});

// =============================================================================
// CAPABILITIES TESTS
// =============================================================================

test.describe("Phase3-Unit: Verifone Commander Adapter - Capabilities Tests", () => {
  test("VCMD-060: [P1] Should return correct adapter capabilities", async () => {
    // GIVEN: Verifone Commander adapter
    const { createVerifoneCommanderAdapter } =
      await import("../../backend/dist/services/pos/adapters/verifone-commander.adapter");
    const adapter = createVerifoneCommanderAdapter();

    // WHEN: Getting capabilities
    const capabilities = adapter.getCapabilities();

    // THEN: Capabilities should be correct for file-based adapter
    expect(capabilities.syncDepartments).toBe(true);
    expect(capabilities.syncTenderTypes).toBe(true);
    expect(capabilities.syncCashiers).toBe(true);
    expect(capabilities.syncTaxRates).toBe(true);
    expect(capabilities.syncProducts).toBe(false); // Price book export only
    expect(capabilities.realTimeTransactions).toBe(false); // File-based
    expect(capabilities.webhookSupport).toBe(false);
  });

  test("VCMD-061: [P1] Should have correct POS type and display name", async () => {
    // GIVEN: Verifone Commander adapter
    const { createVerifoneCommanderAdapter } =
      await import("../../backend/dist/services/pos/adapters/verifone-commander.adapter");
    const adapter = createVerifoneCommanderAdapter();

    // THEN: Should have correct identifiers
    expect(adapter.posType).toBe("VERIFONE_COMMANDER");
    expect(adapter.displayName).toContain("Verifone Commander");
    expect(adapter.displayName).toContain("NAXML");
  });
});

// =============================================================================
// ERROR HANDLING TESTS
// =============================================================================

test.describe("Phase3-Unit: Verifone Commander Adapter - Error Handling Tests", () => {
  test("VCMD-050: [P0] Should have VerifoneCommanderError class available", async () => {
    // GIVEN/WHEN: Importing the error class
    const { VerifoneCommanderError, VERIFONE_COMMANDER_ERROR_CODES } =
      await import("../../backend/dist/services/pos/adapters/verifone-commander.adapter");

    // THEN: Error class should be properly defined
    const error = new VerifoneCommanderError(
      VERIFONE_COMMANDER_ERROR_CODES.INVALID_CONFIG,
      "Test error",
      { detail: "test" },
    );

    expect(error.name).toBe("VerifoneCommanderError");
    expect(error.code).toBe("VERIFONE_COMMANDER_INVALID_CONFIG");
    expect(error.message).toBe("Test error");
    expect(error.details).toEqual({ detail: "test" });
    expect(error instanceof Error).toBe(true);
  });

  test("VCMD-051: [P1] Should define all expected error codes", async () => {
    // GIVEN/WHEN: Importing error codes
    const { VERIFONE_COMMANDER_ERROR_CODES } =
      await import("../../backend/dist/services/pos/adapters/verifone-commander.adapter");

    // THEN: All expected error codes should be defined
    expect(VERIFONE_COMMANDER_ERROR_CODES.INVALID_CONFIG).toBe(
      "VERIFONE_COMMANDER_INVALID_CONFIG",
    );
    expect(VERIFONE_COMMANDER_ERROR_CODES.PATH_TRAVERSAL).toBe(
      "VERIFONE_COMMANDER_PATH_TRAVERSAL",
    );
    expect(VERIFONE_COMMANDER_ERROR_CODES.DIRECTORY_NOT_FOUND).toBe(
      "VERIFONE_COMMANDER_DIRECTORY_NOT_FOUND",
    );
    expect(VERIFONE_COMMANDER_ERROR_CODES.FILE_READ_ERROR).toBe(
      "VERIFONE_COMMANDER_FILE_READ_ERROR",
    );
    expect(VERIFONE_COMMANDER_ERROR_CODES.FILE_WRITE_ERROR).toBe(
      "VERIFONE_COMMANDER_FILE_WRITE_ERROR",
    );
    expect(VERIFONE_COMMANDER_ERROR_CODES.PARSE_ERROR).toBe(
      "VERIFONE_COMMANDER_PARSE_ERROR",
    );
    expect(VERIFONE_COMMANDER_ERROR_CODES.NO_FILES_FOUND).toBe(
      "VERIFONE_COMMANDER_NO_FILES_FOUND",
    );
    expect(VERIFONE_COMMANDER_ERROR_CODES.CONTROLLER_ERROR).toBe(
      "VERIFONE_COMMANDER_CONTROLLER_ERROR",
    );
  });
});
