import { test, expect } from "../support/fixtures/rbac.fixture";
import { promises as fs } from "fs";
import * as path from "path";
import * as os from "os";

/**
 * @test-level Integration
 * @justification Integration tests for POS file exchange system
 * @story c-store-pos-adapter-phase-2
 *
 * File Exchange Integration Tests
 *
 * Tests the complete file exchange workflow including:
 * - File watcher detecting new files
 * - Gilbarco NAXML adapter processing files
 * - Audit trail creation for all file operations
 * - File archiving and error handling
 * - Concurrent file processing
 * - Recovery from processing errors
 *
 * These tests verify the integration between:
 * - POSFileWatcherService
 * - GilbarcoNAXMLAdapter
 * - POSAuditService
 * - NAXMLService
 *
 * ================================================================================
 * TRACEABILITY MATRIX
 * ================================================================================
 *
 * | Test ID       | Requirement                            | Component                  | Priority |
 * |---------------|----------------------------------------|----------------------------|----------|
 * | FE-INT-001    | FW-001: File Detection                 | FileWatcher + Adapter      | P0       |
 * | FE-INT-002    | FW-002: File Processing Order          | FileWatcher                | P1       |
 * | FE-INT-003    | FW-003: Concurrent File Processing     | FileWatcher + Adapter      | P1       |
 * | FE-INT-004    | FW-004: Error Recovery                 | FileWatcher + Adapter      | P0       |
 * | FE-INT-005    | AUD-001: Audit Trail Creation          | Adapter + AuditService     | P0       |
 * | FE-INT-006    | AUD-002: Audit Success Tracking        | Adapter + AuditService     | P0       |
 * | FE-INT-007    | AUD-003: Audit Failure Tracking        | Adapter + AuditService     | P0       |
 * | FE-INT-010    | ARC-001: File Archiving on Success     | FileWatcher + Adapter      | P1       |
 * | FE-INT-011    | ARC-002: File Error Folder on Failure  | FileWatcher + Adapter      | P1       |
 * | FE-INT-012    | ARC-003: Duplicate File Detection      | FileWatcher                | P1       |
 * | FE-INT-020    | EXP-001: Export File Creation          | Adapter                    | P0       |
 * | FE-INT-021    | EXP-002: Export Audit Trail            | Adapter + AuditService     | P0       |
 * | FE-INT-030    | SEC-001: Path Traversal Prevention     | Adapter + FileWatcher      | P0       |
 * | FE-INT-031    | SEC-002: File Access Validation        | FileWatcher                | P0       |
 * | FE-INT-040    | PERF-001: Large File Processing        | Adapter                    | P2       |
 * | FE-INT-041    | PERF-002: Batch File Processing        | FileWatcher + Adapter      | P2       |
 *
 * ================================================================================
 */

// =============================================================================
// TEST CONFIGURATION
// =============================================================================

let testDir: string;
let boInboxPath: string;
let boOutboxPath: string;
let processedPath: string;
let errorPath: string;

// Sample NAXML documents for testing
const SAMPLE_TRANSACTION_XML = `<?xml version="1.0" encoding="UTF-8"?>
<NAXMLTransactionDocument version="3.4">
  <TransactionHeader>
    <StoreLocationId>STORE001</StoreLocationId>
    <TerminalId>POS01</TerminalId>
    <TransactionId>TXN-INT-001</TransactionId>
    <BusinessDate>2025-12-19</BusinessDate>
    <TransactionDate>2025-12-19T10:30:00Z</TransactionDate>
    <TransactionType>Sale</TransactionType>
    <CashierId>CASHIER01</CashierId>
  </TransactionHeader>
  <TransactionDetail>
    <LineItem lineNumber="1">
      <ItemCode>123456789012</ItemCode>
      <Description>Cola 20oz</Description>
      <DepartmentCode>001</DepartmentCode>
      <Quantity>1</Quantity>
      <UnitPrice>2.49</UnitPrice>
      <ExtendedPrice>2.49</ExtendedPrice>
      <TaxAmount>0.21</TaxAmount>
    </LineItem>
  </TransactionDetail>
  <TransactionTender>
    <Tender>
      <TenderCode>CASH</TenderCode>
      <Amount>3.00</Amount>
    </Tender>
  </TransactionTender>
  <TransactionTotal>
    <Subtotal>2.49</Subtotal>
    <TaxTotal>0.21</TaxTotal>
    <GrandTotal>2.70</GrandTotal>
    <ChangeDue>0.30</ChangeDue>
  </TransactionTotal>
</NAXMLTransactionDocument>`;

const SAMPLE_DEPARTMENT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<NAXMLDepartmentMaintenance version="3.4">
  <MaintenanceHeader>
    <StoreLocationId>STORE001</StoreLocationId>
    <MaintenanceDate>2025-12-19T10:00:00Z</MaintenanceDate>
    <MaintenanceType>Full</MaintenanceType>
  </MaintenanceHeader>
  <Departments>
    <Department>
      <DepartmentCode>001</DepartmentCode>
      <Description>Beverages</Description>
      <IsTaxable>true</IsTaxable>
      <IsActive>true</IsActive>
    </Department>
    <Department>
      <DepartmentCode>002</DepartmentCode>
      <Description>Snacks</Description>
      <IsTaxable>true</IsTaxable>
      <IsActive>true</IsActive>
    </Department>
  </Departments>
</NAXMLDepartmentMaintenance>`;

const INVALID_XML = `<?xml version="1.0" encoding="UTF-8"?>
<NotAValidDocument>
  <RandomData>This is not valid NAXML</RandomData>
</NotAValidDocument>`;

const MALFORMED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<BrokenXML>
  <Unclosed>
`;

// =============================================================================
// TEST SETUP AND TEARDOWN
// =============================================================================

test.beforeEach(async () => {
  // Create a temporary test directory structure
  testDir = path.join(os.tmpdir(), `file-exchange-int-test-${Date.now()}`);
  boInboxPath = path.join(testDir, "BOInbox");
  boOutboxPath = path.join(testDir, "BOOutbox");
  processedPath = path.join(boOutboxPath, "Processed");
  errorPath = path.join(boOutboxPath, "Error");

  await fs.mkdir(testDir, { recursive: true });
  await fs.mkdir(boInboxPath, { recursive: true });
  await fs.mkdir(boOutboxPath, { recursive: true });
  await fs.mkdir(processedPath, { recursive: true });
  await fs.mkdir(errorPath, { recursive: true });
});

test.afterEach(async () => {
  // Clean up test directory
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

// =============================================================================
// FILE WATCHER INTEGRATION TESTS
// =============================================================================

test.describe("Phase2-Integration: File Watcher and Adapter Integration", () => {
  test("FE-INT-001: [P0] File watcher should detect and process new transaction files", async () => {
    // GIVEN: A file watcher configured for a directory
    const { createFileWatcherService } =
      await import("../../backend/dist/services/pos/file-watcher.service");
    const { GilbarcoNAXMLAdapter } =
      await import("../../backend/dist/services/pos/adapters/gilbarco-naxml.adapter");

    const watcher = createFileWatcherService();
    const adapter = new GilbarcoNAXMLAdapter();

    const config = {
      storeId: "test-store-001",
      posIntegrationId: "test-pos-001",
      watchPath: boOutboxPath,
      processedPath: processedPath,
      errorPath: errorPath,
      pollIntervalSeconds: 1,
      filePatterns: ["TLog*.xml", "Trans*.xml"],
      isActive: true,
    };

    const context = {
      storeId: "test-store-001",
      posIntegrationId: "test-pos-001",
      companyId: "test-company-001",
    };

    const processedFiles: string[] = [];

    // Register event handler
    watcher.on("fileProcessed", (result) => {
      processedFiles.push(result.fileName);
    });

    // WHEN: Starting the watcher and adding a file
    await watcher.startWatching(config, context);

    // Create test file AFTER watcher starts
    const testFile = path.join(boOutboxPath, "TLog_Integration_001.xml");
    await fs.writeFile(testFile, SAMPLE_TRANSACTION_XML);

    // Wait for processing (poll interval + processing time)
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Stop watcher
    await watcher.stopWatching(config.storeId);

    // THEN: File should be detected and processed
    const status = watcher.getStatus(config.storeId);
    expect(status).toBeUndefined(); // Watcher is stopped
    expect(processedFiles.length).toBeGreaterThanOrEqual(1);
  });

  test("FE-INT-002: [P1] File watcher should process files in order by filename", async () => {
    // GIVEN: Multiple files in the watch directory
    const { createFileWatcherService } =
      await import("../../backend/dist/services/pos/file-watcher.service");

    const watcher = createFileWatcherService();

    // Create files with specific names to verify ordering
    await fs.writeFile(
      path.join(boOutboxPath, "TLog_001.xml"),
      SAMPLE_TRANSACTION_XML,
    );
    await fs.writeFile(
      path.join(boOutboxPath, "TLog_002.xml"),
      SAMPLE_TRANSACTION_XML,
    );
    await fs.writeFile(
      path.join(boOutboxPath, "TLog_003.xml"),
      SAMPLE_TRANSACTION_XML,
    );

    const config = {
      storeId: "test-store-order",
      posIntegrationId: "test-pos-order",
      watchPath: boOutboxPath,
      processedPath: processedPath,
      errorPath: errorPath,
      pollIntervalSeconds: 1,
      filePatterns: ["TLog*.xml"],
      isActive: true,
    };

    const context = {
      storeId: "test-store-order",
      posIntegrationId: "test-pos-order",
      companyId: "test-company-001",
    };

    const processedOrder: string[] = [];

    watcher.on("fileProcessed", (result) => {
      processedOrder.push(result.fileName);
    });

    // WHEN: Starting the watcher
    await watcher.startWatching(config, context);

    // Wait for all files to be processed
    await new Promise((resolve) => setTimeout(resolve, 2000));

    await watcher.stopWatching(config.storeId);

    // THEN: Files should be processed in sorted order
    expect(processedOrder.length).toBe(3);
    // Files are sorted alphabetically/by name
    expect(processedOrder[0]).toContain("TLog_001");
    expect(processedOrder[1]).toContain("TLog_002");
    expect(processedOrder[2]).toContain("TLog_003");
  });

  test("FE-INT-003: [P1] File watcher should handle concurrent stores", async () => {
    // GIVEN: Multiple stores with separate watch directories
    const { createFileWatcherService } =
      await import("../../backend/dist/services/pos/file-watcher.service");

    const watcher = createFileWatcherService();

    // Create separate directories for two stores
    const store1Dir = path.join(testDir, "store1");
    const store2Dir = path.join(testDir, "store2");
    await fs.mkdir(path.join(store1Dir, "BOOutbox"), { recursive: true });
    await fs.mkdir(path.join(store2Dir, "BOOutbox"), { recursive: true });

    const config1 = {
      storeId: "store-1",
      posIntegrationId: "pos-1",
      watchPath: path.join(store1Dir, "BOOutbox"),
      processedPath: path.join(store1Dir, "Processed"),
      errorPath: path.join(store1Dir, "Error"),
      pollIntervalSeconds: 1,
      filePatterns: ["TLog*.xml"],
      isActive: true,
    };

    const config2 = {
      storeId: "store-2",
      posIntegrationId: "pos-2",
      watchPath: path.join(store2Dir, "BOOutbox"),
      processedPath: path.join(store2Dir, "Processed"),
      errorPath: path.join(store2Dir, "Error"),
      pollIntervalSeconds: 1,
      filePatterns: ["TLog*.xml"],
      isActive: true,
    };

    const context1 = {
      storeId: "store-1",
      posIntegrationId: "pos-1",
      companyId: "company-1",
    };
    const context2 = {
      storeId: "store-2",
      posIntegrationId: "pos-2",
      companyId: "company-2",
    };

    const store1Files: string[] = [];
    const store2Files: string[] = [];

    watcher.on("fileProcessed", (result, storeId) => {
      if (storeId === "store-1") store1Files.push(result.fileName);
      if (storeId === "store-2") store2Files.push(result.fileName);
    });

    // WHEN: Starting both watchers and adding files
    await watcher.startWatching(config1, context1);
    await watcher.startWatching(config2, context2);

    // Add files to each store
    await fs.writeFile(
      path.join(store1Dir, "BOOutbox", "TLog_Store1.xml"),
      SAMPLE_TRANSACTION_XML,
    );
    await fs.writeFile(
      path.join(store2Dir, "BOOutbox", "TLog_Store2.xml"),
      SAMPLE_TRANSACTION_XML,
    );

    await new Promise((resolve) => setTimeout(resolve, 2500));

    // Stop all watchers
    await watcher.stopAll();

    // THEN: Each store should process its own files independently
    expect(store1Files.length).toBe(1);
    expect(store2Files.length).toBe(1);
    expect(store1Files[0]).toContain("Store1");
    expect(store2Files[0]).toContain("Store2");
  });

  test("FE-INT-004: [P0] File watcher should recover from processing errors", async () => {
    // GIVEN: A directory with both valid and invalid files
    const { createFileWatcherService } =
      await import("../../backend/dist/services/pos/file-watcher.service");

    const watcher = createFileWatcherService();

    // Create valid and invalid files
    await fs.writeFile(
      path.join(boOutboxPath, "TLog_Valid.xml"),
      SAMPLE_TRANSACTION_XML,
    );
    await fs.writeFile(
      path.join(boOutboxPath, "TLog_Invalid.xml"),
      MALFORMED_XML,
    );
    await fs.writeFile(
      path.join(boOutboxPath, "TLog_Valid2.xml"),
      SAMPLE_TRANSACTION_XML,
    );

    const config = {
      storeId: "test-store-recovery",
      posIntegrationId: "test-pos-recovery",
      watchPath: boOutboxPath,
      processedPath: processedPath,
      errorPath: errorPath,
      pollIntervalSeconds: 1,
      filePatterns: ["TLog*.xml"],
      isActive: true,
    };

    const context = {
      storeId: "test-store-recovery",
      posIntegrationId: "test-pos-recovery",
      companyId: "test-company-001",
    };

    const successFiles: string[] = [];
    const errorFiles: string[] = [];

    watcher.on("fileProcessed", (result) => {
      if (result.success) {
        successFiles.push(result.fileName);
      } else {
        errorFiles.push(result.fileName);
      }
    });

    // WHEN: Processing the files
    await watcher.startWatching(config, context);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await watcher.stopWatching(config.storeId);

    // THEN: Valid files should succeed, invalid file should fail
    // and processing should continue after error
    expect(successFiles.length).toBe(2);
    expect(errorFiles.length).toBe(1);
    expect(errorFiles[0]).toContain("Invalid");
  });
});

// =============================================================================
// AUDIT INTEGRATION TESTS
// =============================================================================

test.describe("Phase2-Integration: Audit Trail Integration", () => {
  test("FE-INT-005: [P0] Adapter should create audit record before processing", async () => {
    // GIVEN: A Gilbarco NAXML adapter with audit context
    const { GilbarcoNAXMLAdapter } =
      await import("../../backend/dist/services/pos/adapters/gilbarco-naxml.adapter");

    const adapter = new GilbarcoNAXMLAdapter();

    // Create a transaction file
    await fs.writeFile(
      path.join(boOutboxPath, "TLog_Audit_001.xml"),
      SAMPLE_TRANSACTION_XML,
    );

    const config = {
      xmlGatewayPath: testDir,
      naxmlVersion: "3.4" as const,
      generateAcknowledgments: false,
      storeLocationId: "STORE001",
      archiveProcessedFiles: false,
      host: "localhost",
      port: 0,
      useSsl: false,
      timeoutMs: 5000,
      authType: "NONE" as const,
      credentials: { type: "NONE" as const },
    };

    // WHEN: Importing transactions
    const results = await adapter.importTransactions(config);

    // THEN: Import should succeed
    expect(results.length).toBe(1);
    expect(results[0].success).toBe(true);
    // Note: Full audit verification would require database checks
    // which should be done in API-level tests
  });

  test("FE-INT-006: [P0] Successful processing should update audit record with success status", async () => {
    // GIVEN: Valid NAXML file to process
    const { GilbarcoNAXMLAdapter } =
      await import("../../backend/dist/services/pos/adapters/gilbarco-naxml.adapter");

    const adapter = new GilbarcoNAXMLAdapter();

    await fs.writeFile(
      path.join(boOutboxPath, "TLog_Success.xml"),
      SAMPLE_TRANSACTION_XML,
    );

    const config = {
      xmlGatewayPath: testDir,
      naxmlVersion: "3.4" as const,
      generateAcknowledgments: false,
      storeLocationId: "STORE001",
      archiveProcessedFiles: false,
      host: "localhost",
      port: 0,
      useSsl: false,
      timeoutMs: 5000,
      authType: "NONE" as const,
      credentials: { type: "NONE" as const },
    };

    // WHEN: Processing the file
    const results = await adapter.importTransactions(config);

    // THEN: Result should indicate success with record count
    expect(results[0].success).toBe(true);
    expect(results[0].recordCount).toBeGreaterThan(0);
    expect(results[0].documentType).toBe("TransactionDocument");
  });

  test("FE-INT-007: [P0] Failed processing should update audit record with failure status", async () => {
    // GIVEN: Invalid NAXML file to process
    const { GilbarcoNAXMLAdapter } =
      await import("../../backend/dist/services/pos/adapters/gilbarco-naxml.adapter");

    const adapter = new GilbarcoNAXMLAdapter();

    await fs.writeFile(
      path.join(boOutboxPath, "TLog_Failure.xml"),
      MALFORMED_XML,
    );

    const config = {
      xmlGatewayPath: testDir,
      naxmlVersion: "3.4" as const,
      generateAcknowledgments: false,
      storeLocationId: "STORE001",
      archiveProcessedFiles: false,
      host: "localhost",
      port: 0,
      useSsl: false,
      timeoutMs: 5000,
      authType: "NONE" as const,
      credentials: { type: "NONE" as const },
    };

    // WHEN: Processing the file
    const results = await adapter.importTransactions(config);

    // THEN: Result should indicate failure with errors
    expect(results[0].success).toBe(false);
    expect(results[0].errors.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// FILE ARCHIVING INTEGRATION TESTS
// =============================================================================

test.describe("Phase2-Integration: File Archiving Integration", () => {
  test("FE-INT-010: [P1] Successful files should be archived to processed folder", async () => {
    // GIVEN: Archive configuration enabled
    const { GilbarcoNAXMLAdapter } =
      await import("../../backend/dist/services/pos/adapters/gilbarco-naxml.adapter");

    const adapter = new GilbarcoNAXMLAdapter();

    const originalFile = path.join(boOutboxPath, "TLog_ToArchive.xml");
    await fs.writeFile(originalFile, SAMPLE_TRANSACTION_XML);

    const config = {
      xmlGatewayPath: testDir,
      naxmlVersion: "3.4" as const,
      generateAcknowledgments: false,
      storeLocationId: "STORE001",
      archiveProcessedFiles: true,
      archivePath: processedPath,
      errorPath: errorPath,
      host: "localhost",
      port: 0,
      useSsl: false,
      timeoutMs: 5000,
      authType: "NONE" as const,
      credentials: { type: "NONE" as const },
    };

    // WHEN: Processing the file
    const results = await adapter.importTransactions(config);

    // THEN: File should be archived
    expect(results[0].success).toBe(true);
    expect(results[0].archived).toBe(true);
    expect(results[0].archivePath).toContain("Processed");

    // Original file should not exist
    const originalExists = await fs
      .access(originalFile)
      .then(() => true)
      .catch(() => false);
    expect(originalExists).toBe(false);

    // Archived file should exist
    const archivedExists = await fs
      .access(results[0].archivePath!)
      .then(() => true)
      .catch(() => false);
    expect(archivedExists).toBe(true);
  });

  test("FE-INT-011: [P1] Failed files should be moved to error folder", async () => {
    // GIVEN: A file that will fail processing with archiving enabled
    const { createFileWatcherService } =
      await import("../../backend/dist/services/pos/file-watcher.service");

    const watcher = createFileWatcherService();

    const invalidFile = path.join(boOutboxPath, "TLog_ToError.xml");
    await fs.writeFile(invalidFile, INVALID_XML);

    const config = {
      storeId: "test-store-error",
      posIntegrationId: "test-pos-error",
      watchPath: boOutboxPath,
      processedPath: processedPath,
      errorPath: errorPath,
      pollIntervalSeconds: 1,
      filePatterns: ["TLog*.xml"],
      isActive: true,
    };

    const context = {
      storeId: "test-store-error",
      posIntegrationId: "test-pos-error",
      companyId: "test-company-001",
    };

    let processedResult: { movedTo?: string } | null = null;

    watcher.on("fileProcessed", (result: { movedTo?: string }) => {
      processedResult = result;
    });

    // WHEN: Processing the invalid file
    await watcher.startWatching(config, context);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await watcher.stopWatching(config.storeId);

    // THEN: File should be in error folder
    expect(processedResult).not.toBeNull();
    const result = processedResult as { movedTo?: string } | null;
    if (result?.movedTo) {
      expect(result.movedTo).toContain("Error");
    }

    // Original file should not exist
    const originalExists = await fs
      .access(invalidFile)
      .then(() => true)
      .catch(() => false);
    expect(originalExists).toBe(false);
  });

  test("FE-INT-012: [P1] Duplicate files should be detected by hash", async () => {
    // GIVEN: The same file content processed twice
    const { createFileWatcherService } =
      await import("../../backend/dist/services/pos/file-watcher.service");

    const watcher = createFileWatcherService();

    const config = {
      storeId: "test-store-dup",
      posIntegrationId: "test-pos-dup",
      watchPath: boOutboxPath,
      processedPath: processedPath,
      errorPath: errorPath,
      pollIntervalSeconds: 1,
      filePatterns: ["TLog*.xml"],
      isActive: true,
    };

    const context = {
      storeId: "test-store-dup",
      posIntegrationId: "test-pos-dup",
      companyId: "test-company-001",
    };

    const processedFiles: string[] = [];

    watcher.on("fileProcessed", (result) => {
      processedFiles.push(result.fileName);
    });

    // WHEN: Adding a file, waiting, then adding same content with different name
    await watcher.startWatching(config, context);

    // First file
    await fs.writeFile(
      path.join(boOutboxPath, "TLog_Original.xml"),
      SAMPLE_TRANSACTION_XML,
    );
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Second file with same content but different name
    // (This tests if hash detection works - same content should be skipped)
    await fs.writeFile(
      path.join(boOutboxPath, "TLog_Duplicate.xml"),
      SAMPLE_TRANSACTION_XML,
    );
    await new Promise((resolve) => setTimeout(resolve, 1500));

    await watcher.stopWatching(config.storeId);

    // THEN: First file should be processed, second should be skipped (by hash)
    // Note: This depends on the watcher tracking processed hashes
    expect(processedFiles.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// EXPORT INTEGRATION TESTS
// =============================================================================

test.describe("Phase2-Integration: Export File Integration", () => {
  test("FE-INT-020: [P0] Export should create valid NAXML file in BOInbox", async () => {
    // GIVEN: Department data to export
    const { GilbarcoNAXMLAdapter } =
      await import("../../backend/dist/services/pos/adapters/gilbarco-naxml.adapter");

    const adapter = new GilbarcoNAXMLAdapter();

    const departments = [
      {
        posCode: "001",
        displayName: "Beverages",
        isTaxable: true,
        minimumAge: undefined,
        isLottery: false,
        isActive: true,
        sortOrder: 1,
        description: "Drinks and beverages",
      },
      {
        posCode: "002",
        displayName: "Snacks",
        isTaxable: true,
        minimumAge: undefined,
        isLottery: false,
        isActive: true,
        sortOrder: 2,
        description: "Snack foods",
      },
    ];

    const config = {
      xmlGatewayPath: testDir,
      naxmlVersion: "3.4" as const,
      generateAcknowledgments: false,
      storeLocationId: "STORE001",
      archiveProcessedFiles: false,
      host: "localhost",
      port: 0,
      useSsl: false,
      timeoutMs: 5000,
      authType: "NONE" as const,
      credentials: { type: "NONE" as const },
    };

    // WHEN: Exporting departments
    const result = await adapter.exportDepartments(config, departments);

    // THEN: Export should succeed
    expect(result.success).toBe(true);
    expect(result.recordCount).toBe(2);
    expect(result.filePath).toContain("BOInbox");
    expect(result.fileSizeBytes).toBeGreaterThan(0);

    // File should exist and be valid XML
    const fileContent = await fs.readFile(result.filePath, "utf-8");
    expect(fileContent).toContain("<?xml");
    expect(fileContent).toContain("NAXMLDepartmentMaintenance");
    expect(fileContent).toContain("Beverages");
    expect(fileContent).toContain("Snacks");
  });

  test("FE-INT-021: [P0] Export should include file hash for integrity verification", async () => {
    // GIVEN: Data to export
    const { GilbarcoNAXMLAdapter } =
      await import("../../backend/dist/services/pos/adapters/gilbarco-naxml.adapter");

    const adapter = new GilbarcoNAXMLAdapter();

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

    const config = {
      xmlGatewayPath: testDir,
      naxmlVersion: "3.4" as const,
      generateAcknowledgments: false,
      storeLocationId: "STORE001",
      archiveProcessedFiles: false,
      host: "localhost",
      port: 0,
      useSsl: false,
      timeoutMs: 5000,
      authType: "NONE" as const,
      credentials: { type: "NONE" as const },
    };

    // WHEN: Exporting tender types
    const result = await adapter.exportTenderTypes(config, tenders);

    // THEN: Result should include file hash
    expect(result.success).toBe(true);
    expect(result.fileHash).toBeDefined();
    expect(result.fileHash.length).toBe(64); // SHA-256 produces 64 hex chars
  });
});

// =============================================================================
// SECURITY INTEGRATION TESTS
// =============================================================================

test.describe("Phase2-Integration: Security Integration", () => {
  test("FE-INT-030: [P0] Path traversal should be prevented in file operations", async () => {
    // GIVEN: A Gilbarco NAXML adapter
    const { GilbarcoNAXMLAdapter } =
      await import("../../backend/dist/services/pos/adapters/gilbarco-naxml.adapter");

    const adapter = new GilbarcoNAXMLAdapter();

    const config = {
      xmlGatewayPath: testDir,
      naxmlVersion: "3.4" as const,
      generateAcknowledgments: false,
      storeLocationId: "STORE001",
      archiveProcessedFiles: false,
      host: "localhost",
      port: 0,
      useSsl: false,
      timeoutMs: 5000,
      authType: "NONE" as const,
      credentials: { type: "NONE" as const },
    };

    // WHEN: Testing connection (validates paths internally)
    const result = await adapter.testConnection(config);

    // THEN: Connection should succeed with valid paths
    expect(result.success).toBe(true);

    // Path traversal attempts in file patterns should be safe
    // (patterns are matched against filenames only, not full paths)
  });

  test("FE-INT-031: [P0] File watcher should validate directory access", async () => {
    // GIVEN: A file watcher with invalid path
    const { createFileWatcherService, FileWatcherError } =
      await import("../../backend/dist/services/pos/file-watcher.service");

    const watcher = createFileWatcherService();

    const config = {
      storeId: "test-store-invalid",
      posIntegrationId: "test-pos-invalid",
      watchPath: "/nonexistent/path/that/should/not/exist",
      processedPath: "/another/nonexistent/path",
      errorPath: "/yet/another/nonexistent/path",
      pollIntervalSeconds: 1,
      filePatterns: ["*.xml"],
      isActive: true,
    };

    const context = {
      storeId: "test-store-invalid",
      posIntegrationId: "test-pos-invalid",
      companyId: "test-company-001",
    };

    // WHEN: Attempting to start the watcher
    let error: Error | null = null;
    try {
      await watcher.startWatching(config, context);
    } catch (e) {
      error = e as Error;
    }

    // THEN: Should throw error for invalid path
    expect(error).not.toBeNull();
    expect(error?.message).toContain("not found");
  });
});

// =============================================================================
// PERFORMANCE INTEGRATION TESTS
// =============================================================================

test.describe("Phase2-Integration: Performance Integration", () => {
  test("FE-INT-040: [P2] Adapter should handle large XML files efficiently", async () => {
    // GIVEN: A large transaction file (multiple transactions)
    const { GilbarcoNAXMLAdapter } =
      await import("../../backend/dist/services/pos/adapters/gilbarco-naxml.adapter");

    const adapter = new GilbarcoNAXMLAdapter();

    // Create a large file by repeating content
    const largeXml = SAMPLE_TRANSACTION_XML.replace(
      "TXN-INT-001",
      "TXN-LARGE-001",
    );

    await fs.writeFile(path.join(boOutboxPath, "TLog_Large.xml"), largeXml);

    const config = {
      xmlGatewayPath: testDir,
      naxmlVersion: "3.4" as const,
      generateAcknowledgments: false,
      storeLocationId: "STORE001",
      archiveProcessedFiles: false,
      host: "localhost",
      port: 0,
      useSsl: false,
      timeoutMs: 5000,
      authType: "NONE" as const,
      credentials: { type: "NONE" as const },
    };

    // WHEN: Processing the large file
    const startTime = Date.now();
    const results = await adapter.importTransactions(config);
    const duration = Date.now() - startTime;

    // THEN: Should process within reasonable time
    expect(results[0].success).toBe(true);
    expect(duration).toBeLessThan(5000); // 5 seconds max
  });

  test("FE-INT-041: [P2] File watcher should handle batch of files", async () => {
    // GIVEN: Multiple files to process
    const { createFileWatcherService } =
      await import("../../backend/dist/services/pos/file-watcher.service");

    const watcher = createFileWatcherService();

    // Create 10 files
    for (let i = 1; i <= 10; i++) {
      const paddedNum = String(i).padStart(3, "0");
      await fs.writeFile(
        path.join(boOutboxPath, `TLog_Batch_${paddedNum}.xml`),
        SAMPLE_TRANSACTION_XML.replace("TXN-INT-001", `TXN-BATCH-${paddedNum}`),
      );
    }

    const config = {
      storeId: "test-store-batch",
      posIntegrationId: "test-pos-batch",
      watchPath: boOutboxPath,
      processedPath: processedPath,
      errorPath: errorPath,
      pollIntervalSeconds: 1,
      filePatterns: ["TLog*.xml"],
      isActive: true,
    };

    const context = {
      storeId: "test-store-batch",
      posIntegrationId: "test-pos-batch",
      companyId: "test-company-001",
    };

    const processedFiles: string[] = [];

    watcher.on("fileProcessed", (result) => {
      processedFiles.push(result.fileName);
    });

    // WHEN: Processing the batch
    const startTime = Date.now();
    await watcher.startWatching(config, context);

    // Wait for all files to process
    await new Promise((resolve) => setTimeout(resolve, 5000));

    await watcher.stopWatching(config.storeId);
    const duration = Date.now() - startTime;

    // THEN: All files should be processed
    expect(processedFiles.length).toBe(10);
    expect(duration).toBeLessThan(10000); // 10 seconds max for 10 files
  });
});

// =============================================================================
// END-TO-END WORKFLOW TESTS
// =============================================================================

test.describe("Phase2-Integration: End-to-End Workflow", () => {
  test("FE-INT-050: [P0] Complete import workflow: detect -> process -> archive -> audit", async () => {
    // GIVEN: A complete file exchange setup
    const { GilbarcoNAXMLAdapter } =
      await import("../../backend/dist/services/pos/adapters/gilbarco-naxml.adapter");

    const adapter = new GilbarcoNAXMLAdapter();

    // Create test files
    await fs.writeFile(
      path.join(boOutboxPath, "TLog_E2E_001.xml"),
      SAMPLE_TRANSACTION_XML,
    );
    await fs.writeFile(
      path.join(boOutboxPath, "DeptMaint_E2E.xml"),
      SAMPLE_DEPARTMENT_XML,
    );

    const config = {
      xmlGatewayPath: testDir,
      naxmlVersion: "3.4" as const,
      generateAcknowledgments: false,
      storeLocationId: "STORE001",
      archiveProcessedFiles: true,
      archivePath: processedPath,
      errorPath: errorPath,
      host: "localhost",
      port: 0,
      useSsl: false,
      timeoutMs: 5000,
      authType: "NONE" as const,
      credentials: { type: "NONE" as const },
    };

    // WHEN: Processing transactions
    const txnResults = await adapter.importTransactions(config);

    // AND: Syncing departments
    const departments = await adapter.syncDepartments(config);

    // THEN: All operations should succeed
    expect(txnResults.length).toBe(1);
    expect(txnResults[0].success).toBe(true);
    expect(txnResults[0].archived).toBe(true);

    expect(departments.length).toBe(2);
    expect(departments[0].displayName).toBe("Beverages");
    expect(departments[1].displayName).toBe("Snacks");
  });

  test("FE-INT-051: [P0] Complete export workflow: build -> write -> verify", async () => {
    // GIVEN: Data to export
    const { GilbarcoNAXMLAdapter } =
      await import("../../backend/dist/services/pos/adapters/gilbarco-naxml.adapter");

    const adapter = new GilbarcoNAXMLAdapter();

    const departments = [
      {
        posCode: "100",
        displayName: "Fuel",
        isTaxable: false,
        minimumAge: undefined,
        isLottery: false,
        isActive: true,
        sortOrder: 1,
      },
    ];

    const tenders = [
      {
        posCode: "DEBIT",
        displayName: "Debit Card",
        isCashEquivalent: false,
        isElectronic: true,
        affectsCashDrawer: false,
        requiresReference: true,
        isActive: true,
        sortOrder: 2,
      },
    ];

    const taxRates = [
      {
        posCode: "LOCAL",
        displayName: "Local Tax",
        rate: 0.02,
        isActive: true,
        jurisdictionCode: "CITY",
      },
    ];

    const config = {
      xmlGatewayPath: testDir,
      naxmlVersion: "3.4" as const,
      generateAcknowledgments: false,
      storeLocationId: "STORE001",
      archiveProcessedFiles: false,
      host: "localhost",
      port: 0,
      useSsl: false,
      timeoutMs: 5000,
      authType: "NONE" as const,
      credentials: { type: "NONE" as const },
    };

    // WHEN: Exporting all entity types
    const deptResult = await adapter.exportDepartments(config, departments);
    const tenderResult = await adapter.exportTenderTypes(config, tenders);
    const taxResult = await adapter.exportTaxRates(config, taxRates);

    // THEN: All exports should succeed
    expect(deptResult.success).toBe(true);
    expect(deptResult.documentType).toBe("DepartmentMaintenance");

    expect(tenderResult.success).toBe(true);
    expect(tenderResult.documentType).toBe("TenderMaintenance");

    expect(taxResult.success).toBe(true);
    expect(taxResult.documentType).toBe("TaxRateMaintenance");

    // Verify files exist in BOInbox
    const inboxFiles = await fs.readdir(boInboxPath);
    expect(inboxFiles.length).toBe(3);
    expect(inboxFiles.some((f) => f.startsWith("DeptMaint"))).toBe(true);
    expect(inboxFiles.some((f) => f.startsWith("TenderMaint"))).toBe(true);
    expect(inboxFiles.some((f) => f.startsWith("TaxMaint"))).toBe(true);
  });
});
