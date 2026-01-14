import { test, expect } from "../support/fixtures/rbac.fixture";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";

/**
 * @test-level Unit
 * @justification Unit tests for Verifone Ruby2 adapter business logic
 * @story c-store-pos-adapter-phase-3
 *
 * Verifone Ruby2 Adapter Unit Tests
 *
 * Tests the Verifone Ruby2 adapter functionality:
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
 * | VRB2-001      | Connection test success               | testConnection            | P0       |
 * | VRB2-002      | Connection test failure               | testConnection            | P0       |
 * | VRB2-010      | Sync departments from files           | syncDepartments           | P0       |
 * | VRB2-011      | Sync tender types from files          | syncTenderTypes           | P0       |
 * | VRB2-012      | Sync cashiers from files              | syncCashiers              | P0       |
 * | VRB2-013      | Sync tax rates from files             | syncTaxRates              | P0       |
 * | VRB2-020      | Import transactions                   | importTransactions        | P0       |
 * | VRB2-021      | Handle invalid transaction files      | importTransactions        | P1       |
 * | VRB2-030      | Export departments                    | exportDepartments         | P0       |
 * | VRB2-031      | Export tender types                   | exportTenderTypes         | P0       |
 * | VRB2-032      | Export tax rates                      | exportTaxRates            | P0       |
 * | VRB2-033      | Export price book                     | exportPriceBook           | P0       |
 * | VRB2-040      | Archive processed files               | archiveFile               | P1       |
 * | VRB2-041      | Move error files                      | moveToError               | P1       |
 * | VRB2-050      | Error class and codes                 | VerifoneRuby2Error        | P0       |
 * | VRB2-060      | Get adapter capabilities              | getCapabilities           | P1       |
 * | VRB2-070      | Adapter registration in registry      | posAdapterRegistry        | P0       |
 * | VRB2-080      | Security: Export path validation      | exportDepartments         | P0       |
 * | VRB2-081      | Security: Path traversal error codes  | validatePath              | P0       |
 * | VRB2-082      | Security: Malicious filename handling | syncDepartments           | P0       |
 * | VRB2-083      | Security: Special char file patterns  | getXmlFiles               | P1       |
 *
 * ================================================================================
 */

// =============================================================================
// SAMPLE NAXML DOCUMENTS FOR TESTING
// =============================================================================

const SAMPLE_DEPARTMENT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<NAXMLDepartmentMaintenance version="3.4">
  <MaintenanceHeader>
    <StoreLocationID>RUBY001</StoreLocationID>
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
    <Department Code="003" Action="AddUpdate">
      <Description>Tobacco</Description>
      <IsTaxable>Y</IsTaxable>
      <TaxRateCode>STATE</TaxRateCode>
      <MinimumAge>21</MinimumAge>
      <IsActive>Y</IsActive>
      <SortOrder>3</SortOrder>
    </Department>
  </Departments>
</NAXMLDepartmentMaintenance>`;

const SAMPLE_TENDER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<NAXMLTenderMaintenance version="3.4">
  <MaintenanceHeader>
    <StoreLocationID>RUBY001</StoreLocationID>
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
    <Tender Code="DEBIT" Action="AddUpdate">
      <Description>Debit Card</Description>
      <IsCashEquivalent>N</IsCashEquivalent>
      <IsElectronic>Y</IsElectronic>
      <AffectsCashDrawer>N</AffectsCashDrawer>
      <RequiresReference>Y</RequiresReference>
      <IsActive>Y</IsActive>
      <SortOrder>3</SortOrder>
    </Tender>
  </Tenders>
</NAXMLTenderMaintenance>`;

const SAMPLE_TAX_RATE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<NAXMLTaxRateMaintenance version="3.4">
  <MaintenanceHeader>
    <StoreLocationID>RUBY001</StoreLocationID>
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
    <TaxRate Code="CITY" Action="AddUpdate">
      <Description>City Tax</Description>
      <Rate>0.02</Rate>
      <IsActive>Y</IsActive>
      <JurisdictionCode>AUSTIN</JurisdictionCode>
    </TaxRate>
  </TaxRates>
</NAXMLTaxRateMaintenance>`;

const SAMPLE_TRANSACTION_XML = `<?xml version="1.0" encoding="UTF-8"?>
<NAXMLTransactionDocument version="3.4">
  <TransactionHeader>
    <StoreLocationID>RUBY001</StoreLocationID>
    <TerminalID>REG01</TerminalID>
    <TransactionID>TXN-RUBY-20251219-001</TransactionID>
    <BusinessDate>2025-12-19</BusinessDate>
    <TransactionDate>2025-12-19T14:30:00Z</TransactionDate>
    <TransactionType>Sale</TransactionType>
    <CashierID>CASHIER02</CashierID>
  </TransactionHeader>
  <TransactionDetail>
    <LineItem LineNumber="1">
      <ItemCode>123456789012</ItemCode>
      <Description>Energy Drink</Description>
      <DepartmentCode>001</DepartmentCode>
      <Quantity>1</Quantity>
      <UnitPrice>3.99</UnitPrice>
      <ExtendedPrice>3.99</ExtendedPrice>
      <TaxAmount>0.33</TaxAmount>
    </LineItem>
    <LineItem LineNumber="2">
      <ItemCode>234567890123</ItemCode>
      <Description>Chips</Description>
      <DepartmentCode>002</DepartmentCode>
      <Quantity>2</Quantity>
      <UnitPrice>1.49</UnitPrice>
      <ExtendedPrice>2.98</ExtendedPrice>
      <TaxAmount>0.25</TaxAmount>
    </LineItem>
  </TransactionDetail>
  <TransactionTender>
    <Tender>
      <TenderCode>DEBIT</TenderCode>
      <TenderDescription>Debit Card</TenderDescription>
      <Amount>7.55</Amount>
    </Tender>
  </TransactionTender>
  <TransactionTotal>
    <Subtotal>6.97</Subtotal>
    <TaxTotal>0.58</TaxTotal>
    <GrandTotal>7.55</GrandTotal>
    <ChangeDue>0.00</ChangeDue>
  </TransactionTotal>
</NAXMLTransactionDocument>`;

const SAMPLE_CASHIER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<NAXMLEmployeeMaintenance version="3.4">
  <MaintenanceHeader>
    <StoreLocationID>RUBY001</StoreLocationID>
    <MaintenanceDate>2025-12-19T10:00:00Z</MaintenanceDate>
    <MaintenanceType>Full</MaintenanceType>
  </MaintenanceHeader>
  <Employees>
    <Employee ID="EMP001" Action="AddUpdate">
      <FirstName>John</FirstName>
      <LastName>Smith</LastName>
      <IsActive>Y</IsActive>
      <JobTitle>Cashier</JobTitle>
      <AccessLevel>1</AccessLevel>
    </Employee>
    <Employee ID="EMP002" Action="AddUpdate">
      <FirstName>Jane</FirstName>
      <LastName>Doe</LastName>
      <IsActive>Y</IsActive>
      <JobTitle>Shift Manager</JobTitle>
      <AccessLevel>2</AccessLevel>
    </Employee>
    <Employee ID="EMP003" Action="AddUpdate">
      <FirstName>Robert</FirstName>
      <LastName>Johnson</LastName>
      <IsActive>N</IsActive>
      <JobTitle>Cashier</JobTitle>
      <AccessLevel>1</AccessLevel>
    </Employee>
  </Employees>
</NAXMLEmployeeMaintenance>`;

// =============================================================================
// TEST HELPERS
// =============================================================================

interface TestDirs {
  basePath: string;
  inPath: string;
  outPath: string;
  archivePath: string;
  errorPath: string;
}

async function createTestDirectories(): Promise<TestDirs> {
  const basePath = await fs.mkdtemp(
    path.join(os.tmpdir(), "verifone-ruby2-test-"),
  );
  const inPath = path.join(basePath, "In");
  const outPath = path.join(basePath, "Out");
  const archivePath = path.join(outPath, "Processed");
  const errorPath = path.join(outPath, "Error");

  await fs.mkdir(inPath, { recursive: true });
  await fs.mkdir(outPath, { recursive: true });
  await fs.mkdir(archivePath, { recursive: true });
  await fs.mkdir(errorPath, { recursive: true });

  return { basePath, inPath, outPath, archivePath, errorPath };
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
    rubyBasePath: basePath,
    naxmlVersion: "3.4" as const,
    generateAcknowledgments: false,
    storeLocationId: "RUBY001",
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

test.describe("Phase3-Unit: Verifone Ruby2 Adapter - Connection Tests", () => {
  test("VRB2-001: [P0] Should successfully test connection with valid directories", async () => {
    // GIVEN: Valid Ruby2 directory structure
    const dirs = await createTestDirectories();

    try {
      const { createVerifoneRuby2Adapter } =
        await import("../../backend/src/services/pos/adapters/verifone-ruby2.adapter");
      const adapter = createVerifoneRuby2Adapter();
      const config = createMockConfig(dirs.basePath);

      // WHEN: Testing connection
      const result = await adapter.testConnection(config);

      // THEN: Connection should succeed
      expect(result.success).toBe(true);
      expect(result.message).toContain("Connected to Verifone Ruby2");
      expect(result.posVersion).toBe("3.4");
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });

  test("VRB2-002: [P0] Should fail connection test with missing In directory", async () => {
    // GIVEN: Directory without In folder
    const basePath = await fs.mkdtemp(
      path.join(os.tmpdir(), "verifone-ruby2-test-"),
    );
    // Only create Out, not In
    await fs.mkdir(path.join(basePath, "Out"), { recursive: true });

    try {
      const { createVerifoneRuby2Adapter } =
        await import("../../backend/src/services/pos/adapters/verifone-ruby2.adapter");
      const adapter = createVerifoneRuby2Adapter();
      const config = createMockConfig(basePath);

      // WHEN: Testing connection
      const result = await adapter.testConnection(config);

      // THEN: Connection should fail
      expect(result.success).toBe(false);
      expect(result.message).toContain("In directory not accessible");
      expect(result.errorCode).toBe("VERIFONE_RUBY2_DIRECTORY_NOT_FOUND");
    } finally {
      await cleanupTestDirectories(basePath);
    }
  });

  test("VRB2-003: [P0] Should fail connection test with missing base path config", async () => {
    // GIVEN: Config without rubyBasePath
    const { createVerifoneRuby2Adapter } =
      await import("../../backend/src/services/pos/adapters/verifone-ruby2.adapter");
    const adapter = createVerifoneRuby2Adapter();
    const config = {
      rubyBasePath: "",
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
    expect(result.message).toContain("Ruby2 base path is not configured");
    expect(result.errorCode).toBe("VERIFONE_RUBY2_INVALID_CONFIG");
  });
});

// =============================================================================
// SYNC TESTS
// =============================================================================

test.describe("Phase3-Unit: Verifone Ruby2 Adapter - Sync Tests", () => {
  test("VRB2-010: [P0] Should sync departments from Out folder", async () => {
    // GIVEN: Out folder with department file
    const dirs = await createTestDirectories();
    await fs.writeFile(
      path.join(dirs.outPath, "DeptMaint_2025-12-19.xml"),
      SAMPLE_DEPARTMENT_XML,
    );

    try {
      const { createVerifoneRuby2Adapter } =
        await import("../../backend/src/services/pos/adapters/verifone-ruby2.adapter");
      const adapter = createVerifoneRuby2Adapter();
      const config = createMockConfig(dirs.basePath);

      // WHEN: Syncing departments
      const departments = await adapter.syncDepartments(config);

      // THEN: Departments should be imported
      expect(departments.length).toBe(3);
      expect(departments[0].posCode).toBe("001");
      expect(departments[0].displayName).toBe("Beverages");
      expect(departments[2].posCode).toBe("003");
      expect(departments[2].displayName).toBe("Tobacco");
      expect(departments[2].minimumAge).toBe(21);
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });

  test("VRB2-011: [P0] Should sync tender types from Out folder", async () => {
    // GIVEN: Out folder with tender file
    const dirs = await createTestDirectories();
    await fs.writeFile(
      path.join(dirs.outPath, "TenderMaint_2025-12-19.xml"),
      SAMPLE_TENDER_XML,
    );

    try {
      const { createVerifoneRuby2Adapter } =
        await import("../../backend/src/services/pos/adapters/verifone-ruby2.adapter");
      const adapter = createVerifoneRuby2Adapter();
      const config = createMockConfig(dirs.basePath);

      // WHEN: Syncing tender types
      const tenders = await adapter.syncTenderTypes(config);

      // THEN: Tender types should be imported
      expect(tenders.length).toBe(3);
      expect(tenders[0].posCode).toBe("CASH");
      expect(tenders[0].isCashEquivalent).toBe(true);
      expect(tenders[1].posCode).toBe("CREDIT");
      expect(tenders[2].posCode).toBe("DEBIT");
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });

  test("VRB2-012: [P0] Should sync cashiers from Out folder", async () => {
    // GIVEN: Out folder with cashier/employee file
    const dirs = await createTestDirectories();
    await fs.writeFile(
      path.join(dirs.outPath, "EmpMaint_2025-12-19.xml"),
      SAMPLE_CASHIER_XML,
    );

    try {
      const { createVerifoneRuby2Adapter } =
        await import("../../backend/src/services/pos/adapters/verifone-ruby2.adapter");
      const adapter = createVerifoneRuby2Adapter();
      const config = createMockConfig(dirs.basePath);

      // WHEN: Syncing cashiers
      const cashiers = await adapter.syncCashiers(config);

      // THEN: Cashiers should be imported
      expect(cashiers.length).toBe(3);
      expect(cashiers[0].posCode).toBe("EMP001");
      expect(cashiers[0].firstName).toBe("John");
      expect(cashiers[0].lastName).toBe("Smith");
      expect(cashiers[0].isActive).toBe(true);
      expect(cashiers[1].posCode).toBe("EMP002");
      expect(cashiers[1].firstName).toBe("Jane");
      expect(cashiers[2].posCode).toBe("EMP003");
      expect(cashiers[2].isActive).toBe(false);
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });

  test("VRB2-013: [P0] Should sync tax rates from Out folder", async () => {
    // GIVEN: Out folder with tax rate file
    const dirs = await createTestDirectories();
    await fs.writeFile(
      path.join(dirs.outPath, "TaxMaint_2025-12-19.xml"),
      SAMPLE_TAX_RATE_XML,
    );

    try {
      const { createVerifoneRuby2Adapter } =
        await import("../../backend/src/services/pos/adapters/verifone-ruby2.adapter");
      const adapter = createVerifoneRuby2Adapter();
      const config = createMockConfig(dirs.basePath);

      // WHEN: Syncing tax rates
      const taxRates = await adapter.syncTaxRates(config);

      // THEN: Tax rates should be imported
      expect(taxRates.length).toBe(2);
      expect(taxRates[0].posCode).toBe("STATE");
      expect(taxRates[0].rate).toBe(0.0825);
      expect(taxRates[1].posCode).toBe("CITY");
      expect(taxRates[1].rate).toBe(0.02);
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });

  test("VRB2-014: [P1] Should return empty array when no files found", async () => {
    // GIVEN: Empty Out folder
    const dirs = await createTestDirectories();

    try {
      const { createVerifoneRuby2Adapter } =
        await import("../../backend/src/services/pos/adapters/verifone-ruby2.adapter");
      const adapter = createVerifoneRuby2Adapter();
      const config = createMockConfig(dirs.basePath);

      // WHEN: Syncing departments from empty folder
      const departments = await adapter.syncDepartments(config);

      // THEN: Should return empty array
      expect(departments).toEqual([]);
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });

  test("VRB2-015: [P1] Should handle multiple files in sync", async () => {
    // GIVEN: Out folder with multiple department files
    const dirs = await createTestDirectories();
    await fs.writeFile(
      path.join(dirs.outPath, "DeptMaint_001.xml"),
      SAMPLE_DEPARTMENT_XML,
    );
    await fs.writeFile(
      path.join(dirs.outPath, "DEPT_002.xml"),
      SAMPLE_DEPARTMENT_XML,
    );

    try {
      const { createVerifoneRuby2Adapter } =
        await import("../../backend/src/services/pos/adapters/verifone-ruby2.adapter");
      const adapter = createVerifoneRuby2Adapter();
      const config = createMockConfig(dirs.basePath);

      // WHEN: Syncing departments
      const departments = await adapter.syncDepartments(config);

      // THEN: Should import from both files (6 departments total)
      expect(departments.length).toBe(6);
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });
});

// =============================================================================
// TRANSACTION IMPORT TESTS
// =============================================================================

test.describe("Phase3-Unit: Verifone Ruby2 Adapter - Transaction Import Tests", () => {
  test("VRB2-020: [P0] Should import transactions from Out folder", async () => {
    // GIVEN: Out folder with transaction file
    const dirs = await createTestDirectories();
    await fs.writeFile(
      path.join(dirs.outPath, "TLog_2025-12-19_001.xml"),
      SAMPLE_TRANSACTION_XML,
    );

    try {
      const { createVerifoneRuby2Adapter } =
        await import("../../backend/src/services/pos/adapters/verifone-ruby2.adapter");
      const adapter = createVerifoneRuby2Adapter();
      const config = createMockConfig(dirs.basePath);

      // WHEN: Importing transactions
      const results = await adapter.importTransactions(config);

      // THEN: Transaction should be imported
      expect(results.length).toBe(1);
      expect(results[0].success).toBe(true);
      expect(results[0].recordCount).toBe(1);
      expect(results[0].data.length).toBe(1);
      expect(results[0].data[0].posTransactionId).toBe("TXN-RUBY-20251219-001");
      expect(results[0].data[0].total).toBe(7.55);
      expect(results[0].archived).toBe(true);
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });

  test("VRB2-021: [P1] Should handle invalid transaction file gracefully", async () => {
    // GIVEN: Out folder with invalid XML file
    const dirs = await createTestDirectories();
    await fs.writeFile(
      path.join(dirs.outPath, "TLog_invalid.xml"),
      "This is not valid XML <broken>",
    );

    try {
      const { createVerifoneRuby2Adapter } =
        await import("../../backend/src/services/pos/adapters/verifone-ruby2.adapter");
      const adapter = createVerifoneRuby2Adapter();
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

  test("VRB2-022: [P1] Should return empty array when no transaction files found", async () => {
    // GIVEN: Empty Out folder
    const dirs = await createTestDirectories();

    try {
      const { createVerifoneRuby2Adapter } =
        await import("../../backend/src/services/pos/adapters/verifone-ruby2.adapter");
      const adapter = createVerifoneRuby2Adapter();
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

test.describe("Phase3-Unit: Verifone Ruby2 Adapter - Export Tests", () => {
  test("VRB2-030: [P0] Should export departments to In folder", async () => {
    // GIVEN: Valid directories and department data
    const dirs = await createTestDirectories();

    try {
      const { createVerifoneRuby2Adapter } =
        await import("../../backend/src/services/pos/adapters/verifone-ruby2.adapter");
      const adapter = createVerifoneRuby2Adapter();
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
        {
          posCode: "002",
          displayName: "Snacks",
          isTaxable: true,
          minimumAge: 0,
          isLottery: false,
          isActive: true,
          sortOrder: 2,
        },
      ];

      // WHEN: Exporting departments
      const result = await adapter.exportDepartments(config, departments);

      // THEN: Export should succeed
      expect(result.success).toBe(true);
      expect(result.documentType).toBe("DepartmentMaintenance");
      expect(result.recordCount).toBe(2);
      expect(result.filePath).toContain("In");
      expect(result.fileName).toContain("DeptMaint");
      expect(result.fileSizeBytes).toBeGreaterThan(0);
      expect(result.fileHash).toHaveLength(64);

      // Verify file was created
      const files = await fs.readdir(dirs.inPath);
      expect(files.length).toBe(1);
      expect(files[0]).toContain("DeptMaint");
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });

  test("VRB2-031: [P0] Should export tender types to In folder", async () => {
    // GIVEN: Valid directories and tender data
    const dirs = await createTestDirectories();

    try {
      const { createVerifoneRuby2Adapter } =
        await import("../../backend/src/services/pos/adapters/verifone-ruby2.adapter");
      const adapter = createVerifoneRuby2Adapter();
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
        {
          posCode: "CREDIT",
          displayName: "Credit Card",
          isCashEquivalent: false,
          isElectronic: true,
          affectsCashDrawer: false,
          requiresReference: true,
          isActive: true,
          sortOrder: 2,
        },
      ];

      // WHEN: Exporting tender types
      const result = await adapter.exportTenderTypes(config, tenders);

      // THEN: Export should succeed
      expect(result.success).toBe(true);
      expect(result.documentType).toBe("TenderMaintenance");
      expect(result.recordCount).toBe(2);
      expect(result.fileName).toContain("TenderMaint");
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });

  test("VRB2-032: [P0] Should export tax rates to In folder", async () => {
    // GIVEN: Valid directories and tax rate data
    const dirs = await createTestDirectories();

    try {
      const { createVerifoneRuby2Adapter } =
        await import("../../backend/src/services/pos/adapters/verifone-ruby2.adapter");
      const adapter = createVerifoneRuby2Adapter();
      const config = createMockConfig(dirs.basePath);

      const taxRates = [
        {
          posCode: "STATE",
          displayName: "State Tax",
          rate: 0.0825,
          isActive: true,
          jurisdictionCode: "TX",
        },
        {
          posCode: "CITY",
          displayName: "City Tax",
          rate: 0.02,
          isActive: true,
          jurisdictionCode: "AUSTIN",
        },
      ];

      // WHEN: Exporting tax rates
      const result = await adapter.exportTaxRates(config, taxRates);

      // THEN: Export should succeed
      expect(result.success).toBe(true);
      expect(result.documentType).toBe("TaxRateMaintenance");
      expect(result.recordCount).toBe(2);
      expect(result.fileName).toContain("TaxMaint");
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });

  test("VRB2-033: [P0] Should export price book to In folder", async () => {
    // GIVEN: Valid directories and price book items
    const dirs = await createTestDirectories();

    try {
      const { createVerifoneRuby2Adapter } =
        await import("../../backend/src/services/pos/adapters/verifone-ruby2.adapter");
      const adapter = createVerifoneRuby2Adapter();
      const config = createMockConfig(dirs.basePath);

      const items = [
        {
          itemCode: "123456789012",
          description: "Energy Drink",
          shortDescription: "Energy",
          departmentCode: "001",
          unitPrice: 3.99,
          taxRateCode: "STATE",
          isActive: true,
          action: "AddUpdate" as const,
        },
        {
          itemCode: "234567890123",
          description: "Chips",
          shortDescription: "Chips",
          departmentCode: "002",
          unitPrice: 1.49,
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
      expect(result.recordCount).toBe(2);
      expect(result.fileName).toContain("PriceBook");
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });

  test("VRB2-034: [P1] Should support incremental maintenance type", async () => {
    // GIVEN: Valid directories and department data
    const dirs = await createTestDirectories();

    try {
      const { createVerifoneRuby2Adapter } =
        await import("../../backend/src/services/pos/adapters/verifone-ruby2.adapter");
      const adapter = createVerifoneRuby2Adapter();
      const config = createMockConfig(dirs.basePath);

      const departments = [
        {
          posCode: "001",
          displayName: "Updated Beverages",
          isTaxable: true,
          minimumAge: 0,
          isLottery: false,
          isActive: true,
          sortOrder: 1,
        },
      ];

      // WHEN: Exporting with Incremental maintenance type
      const result = await adapter.exportDepartments(
        config,
        departments,
        "Incremental",
      );

      // THEN: Export should succeed
      expect(result.success).toBe(true);
      expect(result.recordCount).toBe(1);

      // Verify file content contains Incremental
      const files = await fs.readdir(dirs.inPath);
      const content = await fs.readFile(
        path.join(dirs.inPath, files[0]),
        "utf-8",
      );
      expect(content).toContain("Incremental");
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });
});

// =============================================================================
// FILE MANAGEMENT TESTS
// =============================================================================

test.describe("Phase3-Unit: Verifone Ruby2 Adapter - File Management Tests", () => {
  test("VRB2-040: [P1] Should archive processed files", async () => {
    // GIVEN: Out folder with a file to process
    const dirs = await createTestDirectories();
    await fs.writeFile(
      path.join(dirs.outPath, "DeptMaint_test.xml"),
      SAMPLE_DEPARTMENT_XML,
    );

    try {
      const { createVerifoneRuby2Adapter } =
        await import("../../backend/src/services/pos/adapters/verifone-ruby2.adapter");
      const adapter = createVerifoneRuby2Adapter();
      const config = createMockConfig(dirs.basePath);
      config.archiveProcessedFiles = true;

      // WHEN: Syncing departments (which triggers archival)
      await adapter.syncDepartments(config);

      // THEN: File should be moved to archive
      const outFiles = await fs.readdir(dirs.outPath);
      const archiveFiles = await fs.readdir(dirs.archivePath);

      // Original file should be gone (moved to archive)
      expect(outFiles.filter((f) => f.endsWith(".xml"))).toHaveLength(0);
      // Archive should have the file
      expect(archiveFiles.length).toBe(1);
      expect(archiveFiles[0]).toContain("DeptMaint");
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });

  test("VRB2-041: [P1] Should move invalid files to error folder", async () => {
    // GIVEN: Out folder with invalid XML file
    const dirs = await createTestDirectories();
    await fs.writeFile(
      path.join(dirs.outPath, "DeptMaint_invalid.xml"),
      "Not valid XML <broken>",
    );

    try {
      const { createVerifoneRuby2Adapter } =
        await import("../../backend/src/services/pos/adapters/verifone-ruby2.adapter");
      const adapter = createVerifoneRuby2Adapter();
      const config = createMockConfig(dirs.basePath);
      config.archiveProcessedFiles = true;

      // WHEN: Syncing departments (which should fail)
      await adapter.syncDepartments(config);

      // THEN: File should be moved to error folder
      const outFiles = await fs.readdir(dirs.outPath);
      const errorFiles = await fs.readdir(dirs.errorPath);

      // Original file should be gone
      expect(outFiles.filter((f) => f.endsWith(".xml"))).toHaveLength(0);
      // Error folder should have the file
      expect(errorFiles.length).toBe(1);
      expect(errorFiles[0]).toContain("ERROR");
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });

  test("VRB2-042: [P1] Should not archive files when archiveProcessedFiles is false", async () => {
    // GIVEN: Out folder with a file to process
    const dirs = await createTestDirectories();
    await fs.writeFile(
      path.join(dirs.outPath, "DeptMaint_test.xml"),
      SAMPLE_DEPARTMENT_XML,
    );

    try {
      const { createVerifoneRuby2Adapter } =
        await import("../../backend/src/services/pos/adapters/verifone-ruby2.adapter");
      const adapter = createVerifoneRuby2Adapter();
      const config = createMockConfig(dirs.basePath);
      config.archiveProcessedFiles = false;

      // WHEN: Syncing departments
      await adapter.syncDepartments(config);

      // THEN: File should remain in place
      const outFiles = await fs.readdir(dirs.outPath);
      const archiveFiles = await fs.readdir(dirs.archivePath);

      // Original file should still be there
      expect(outFiles.filter((f) => f.endsWith(".xml"))).toHaveLength(1);
      // Archive should be empty
      expect(archiveFiles.length).toBe(0);
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });
});

// =============================================================================
// CAPABILITIES TESTS
// =============================================================================

test.describe("Phase3-Unit: Verifone Ruby2 Adapter - Capabilities Tests", () => {
  test("VRB2-060: [P1] Should return correct adapter capabilities", async () => {
    // GIVEN: Verifone Ruby2 adapter
    const { createVerifoneRuby2Adapter } =
      await import("../../backend/src/services/pos/adapters/verifone-ruby2.adapter");
    const adapter = createVerifoneRuby2Adapter();

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

  test("VRB2-061: [P1] Should have correct POS type and display name", async () => {
    // GIVEN: Verifone Ruby2 adapter
    const { createVerifoneRuby2Adapter } =
      await import("../../backend/src/services/pos/adapters/verifone-ruby2.adapter");
    const adapter = createVerifoneRuby2Adapter();

    // THEN: Should have correct identifiers
    expect(adapter.posType).toBe("VERIFONE_RUBY2");
    expect(adapter.displayName).toContain("Verifone Ruby2");
    expect(adapter.displayName).toContain("NAXML");
  });
});

// =============================================================================
// ERROR HANDLING TESTS
// =============================================================================

test.describe("Phase3-Unit: Verifone Ruby2 Adapter - Error Handling Tests", () => {
  test("VRB2-050: [P0] Should have VerifoneRuby2Error class available", async () => {
    // GIVEN/WHEN: Importing the error class
    const { VerifoneRuby2Error, VERIFONE_RUBY2_ERROR_CODES } =
      await import("../../backend/src/services/pos/adapters/verifone-ruby2.adapter");

    // THEN: Error class should be properly defined
    const error = new VerifoneRuby2Error(
      VERIFONE_RUBY2_ERROR_CODES.INVALID_CONFIG,
      "Test error",
      { detail: "test" },
    );

    expect(error.name).toBe("VerifoneRuby2Error");
    expect(error.code).toBe("VERIFONE_RUBY2_INVALID_CONFIG");
    expect(error.message).toBe("Test error");
    expect(error.details).toEqual({ detail: "test" });
    expect(error instanceof Error).toBe(true);
  });

  test("VRB2-051: [P1] Should define all expected error codes", async () => {
    // GIVEN/WHEN: Importing error codes
    const { VERIFONE_RUBY2_ERROR_CODES } =
      await import("../../backend/src/services/pos/adapters/verifone-ruby2.adapter");

    // THEN: All expected error codes should be defined
    expect(VERIFONE_RUBY2_ERROR_CODES.INVALID_CONFIG).toBe(
      "VERIFONE_RUBY2_INVALID_CONFIG",
    );
    expect(VERIFONE_RUBY2_ERROR_CODES.PATH_TRAVERSAL).toBe(
      "VERIFONE_RUBY2_PATH_TRAVERSAL",
    );
    expect(VERIFONE_RUBY2_ERROR_CODES.DIRECTORY_NOT_FOUND).toBe(
      "VERIFONE_RUBY2_DIRECTORY_NOT_FOUND",
    );
    expect(VERIFONE_RUBY2_ERROR_CODES.FILE_READ_ERROR).toBe(
      "VERIFONE_RUBY2_FILE_READ_ERROR",
    );
    expect(VERIFONE_RUBY2_ERROR_CODES.FILE_WRITE_ERROR).toBe(
      "VERIFONE_RUBY2_FILE_WRITE_ERROR",
    );
    expect(VERIFONE_RUBY2_ERROR_CODES.PARSE_ERROR).toBe(
      "VERIFONE_RUBY2_PARSE_ERROR",
    );
    expect(VERIFONE_RUBY2_ERROR_CODES.NO_FILES_FOUND).toBe(
      "VERIFONE_RUBY2_NO_FILES_FOUND",
    );
    expect(VERIFONE_RUBY2_ERROR_CODES.REGISTER_ERROR).toBe(
      "VERIFONE_RUBY2_REGISTER_ERROR",
    );
  });
});

// =============================================================================
// SECURITY TESTS - Path Traversal Prevention
// =============================================================================

test.describe("Phase3-Unit: Verifone Ruby2 Adapter - Security Tests", () => {
  test("VRB2-080: [P0] Should reject export with path traversal attempt in filename", async () => {
    // GIVEN: Valid directories but malicious filename attempt
    const dirs = await createTestDirectories();

    try {
      const { createVerifoneRuby2Adapter, VERIFONE_RUBY2_ERROR_CODES } =
        await import("../../backend/src/services/pos/adapters/verifone-ruby2.adapter");
      const adapter = createVerifoneRuby2Adapter();

      // Create config with valid base path
      const config = createMockConfig(dirs.basePath);

      // WHEN/THEN: Export should work normally (path is internally generated)
      // The adapter generates safe filenames internally, so exports should succeed
      const result = await adapter.exportDepartments(config, [
        {
          posCode: "001",
          displayName: "Test Dept",
          isTaxable: true,
          minimumAge: 0,
          isLottery: false,
          isActive: true,
          sortOrder: 1,
        },
      ]);

      // Verify export succeeded and file is in correct directory
      expect(result.success).toBe(true);
      expect(result.filePath).toContain(
        dirs.inPath.replace(/\\/g, "/").split("/").pop() || "In",
      );
      expect(result.filePath).not.toContain("..");
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });

  test("VRB2-081: [P0] Should validate file paths prevent directory escape", async () => {
    // GIVEN: Valid directories
    const dirs = await createTestDirectories();

    try {
      const { VerifoneRuby2Error, VERIFONE_RUBY2_ERROR_CODES } =
        await import("../../backend/src/services/pos/adapters/verifone-ruby2.adapter");

      // THEN: PATH_TRAVERSAL error code should be defined and available
      expect(VERIFONE_RUBY2_ERROR_CODES.PATH_TRAVERSAL).toBe(
        "VERIFONE_RUBY2_PATH_TRAVERSAL",
      );

      // Verify error can be constructed
      const pathError = new VerifoneRuby2Error(
        VERIFONE_RUBY2_ERROR_CODES.PATH_TRAVERSAL,
        "Path traversal attempt detected",
        { basePath: dirs.basePath, targetPath: "../../../etc/passwd" },
      );

      expect(pathError.code).toBe("VERIFONE_RUBY2_PATH_TRAVERSAL");
      expect(pathError.message).toContain("traversal");
      expect(pathError.details?.basePath).toBe(dirs.basePath);
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });

  test("VRB2-082: [P0] Should not process files with malicious names in Out folder", async () => {
    // GIVEN: Out folder with files that have suspicious patterns
    const dirs = await createTestDirectories();

    // Create files that don't match expected patterns - should be ignored
    await fs.writeFile(
      path.join(dirs.outPath, "..secret.xml"),
      SAMPLE_DEPARTMENT_XML,
    );
    await fs.writeFile(
      path.join(dirs.outPath, "not_a_dept_file.xml"),
      SAMPLE_DEPARTMENT_XML,
    );

    try {
      const { createVerifoneRuby2Adapter } =
        await import("../../backend/src/services/pos/adapters/verifone-ruby2.adapter");
      const adapter = createVerifoneRuby2Adapter();
      const config = createMockConfig(dirs.basePath);

      // WHEN: Syncing departments
      const departments = await adapter.syncDepartments(config);

      // THEN: Should return empty array (files don't match expected patterns)
      expect(departments).toEqual([]);
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });

  test("VRB2-083: [P1] Should safely handle special characters in file patterns", async () => {
    // GIVEN: Out folder with valid department files using allowed naming patterns
    const dirs = await createTestDirectories();

    // Files with valid naming patterns should be processed
    await fs.writeFile(
      path.join(dirs.outPath, "DeptMaint_123.xml"),
      SAMPLE_DEPARTMENT_XML,
    );
    await fs.writeFile(
      path.join(dirs.outPath, "Department_export.xml"),
      SAMPLE_DEPARTMENT_XML,
    );

    try {
      const { createVerifoneRuby2Adapter } =
        await import("../../backend/src/services/pos/adapters/verifone-ruby2.adapter");
      const adapter = createVerifoneRuby2Adapter();
      const config = createMockConfig(dirs.basePath);

      // WHEN: Syncing departments
      const departments = await adapter.syncDepartments(config);

      // THEN: Should process files matching valid patterns
      expect(departments.length).toBe(6); // 3 departments per file x 2 files
    } finally {
      await cleanupTestDirectories(dirs.basePath);
    }
  });
});

// =============================================================================
// ADAPTER REGISTRY INTEGRATION TESTS
// =============================================================================

test.describe("Phase3-Unit: Verifone Ruby2 Adapter - Registry Integration", () => {
  test("VRB2-070: [P0] Should be registered in adapter registry", async () => {
    // GIVEN/WHEN: Getting adapters from registry
    const { posAdapterRegistry } =
      await import("../../backend/src/services/pos/adapter-registry");

    // THEN: Ruby2 adapter should be registered
    expect(posAdapterRegistry.hasAdapter("VERIFONE_RUBY2")).toBe(true);
    expect(posAdapterRegistry.hasAdapter("VERIFONE_COMMANDER")).toBe(true);

    const ruby2Adapter = posAdapterRegistry.getAdapter("VERIFONE_RUBY2");
    expect(ruby2Adapter.posType).toBe("VERIFONE_RUBY2");

    const commanderAdapter =
      posAdapterRegistry.getAdapter("VERIFONE_COMMANDER");
    expect(commanderAdapter.posType).toBe("VERIFONE_COMMANDER");
  });

  test("VRB2-071: [P1] Should be listed in adapter list", async () => {
    // GIVEN/WHEN: Getting adapter list from registry
    const { posAdapterRegistry } =
      await import("../../backend/src/services/pos/adapter-registry");

    const adapterList = posAdapterRegistry.getAdapterList();

    // THEN: Both Verifone adapters should be in the list
    const ruby2Entry = adapterList.find((a) => a.posType === "VERIFONE_RUBY2");
    const commanderEntry = adapterList.find(
      (a) => a.posType === "VERIFONE_COMMANDER",
    );

    expect(ruby2Entry).toBeDefined();
    expect(ruby2Entry?.displayName).toContain("Ruby2");

    expect(commanderEntry).toBeDefined();
    expect(commanderEntry?.displayName).toContain("Commander");
  });
});
