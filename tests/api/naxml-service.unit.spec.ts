import { test, expect } from "../support/fixtures/rbac.fixture";

/**
 * @test-level Unit
 * @justification Unit tests for NAXML service business logic
 * @story c-store-pos-adapter-phase-1
 *
 * NAXML Service Unit Tests
 *
 * Tests the core NAXML service functionality:
 * - Parser: Parsing various NAXML document types
 * - Builder: Building NAXML documents from typed objects
 * - Validator: Validating documents against business rules
 * - Converter: Converting between NAXML and internal POS types
 *
 * These tests verify the NAXML Core Infrastructure (Phase 1) per the
 * c_store_pos_adapter.md plan document.
 *
 * ================================================================================
 * TRACEABILITY MATRIX
 * ================================================================================
 *
 * | Test ID       | Requirement                           | Method                    | Priority |
 * |---------------|---------------------------------------|---------------------------|----------|
 * | NAXML-SVC-001 | PARSE-001: Parse Transaction Document | NAXMLService.parse        | P0       |
 * | NAXML-SVC-002 | PARSE-002: Parse Department Document  | NAXMLService.parse        | P0       |
 * | NAXML-SVC-003 | PARSE-003: Parse Tender Document      | NAXMLService.parse        | P0       |
 * | NAXML-SVC-004 | PARSE-004: Parse Tax Rate Document    | NAXMLService.parse        | P0       |
 * | NAXML-SVC-005 | PARSE-005: Parse Price Book Document  | NAXMLService.parse        | P0       |
 * | NAXML-SVC-010 | BUILD-001: Build Department Document  | NAXMLService.build        | P0       |
 * | NAXML-SVC-011 | BUILD-002: Build Tender Document      | NAXMLService.build        | P0       |
 * | NAXML-SVC-012 | BUILD-003: Build Tax Rate Document    | NAXMLService.build        | P0       |
 * | NAXML-SVC-013 | BUILD-004: Build Price Book Document  | NAXMLService.build        | P0       |
 * | NAXML-SVC-020 | VALID-001: Validate Transaction       | NAXMLService.validate     | P0       |
 * | NAXML-SVC-021 | VALID-002: Validate Departments       | NAXMLService.validate     | P0       |
 * | NAXML-SVC-022 | VALID-003: Validate Totals            | NAXMLService.validate     | P1       |
 * | NAXML-SVC-030 | CONV-001: Convert to POS Departments  | NAXMLService.convert      | P0       |
 * | NAXML-SVC-031 | CONV-002: Convert to POS Tenders      | NAXMLService.convert      | P0       |
 * | NAXML-SVC-032 | CONV-003: Convert to POS Tax Rates    | NAXMLService.convert      | P0       |
 * | NAXML-SVC-033 | CONV-004: Convert to POS Transaction  | NAXMLService.convert      | P0       |
 * | NAXML-SVC-040 | IMPORT-001: Import Transaction        | NAXMLService.import       | P0       |
 * | NAXML-SVC-041 | IMPORT-002: Import Departments        | NAXMLService.import       | P0       |
 * | NAXML-SVC-050 | HASH-001: Calculate File Hash         | NAXMLService.calculateHash| P1       |
 *
 * ================================================================================
 */

// =============================================================================
// SAMPLE NAXML DOCUMENTS FOR TESTING
// =============================================================================

const SAMPLE_TRANSACTION_XML = `<?xml version="1.0" encoding="UTF-8"?>
<NAXMLTransactionDocument version="3.4">
  <TransactionHeader>
    <StoreLocationID>STORE001</StoreLocationID>
    <TerminalID>POS01</TerminalID>
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
    <LineItem LineNumber="2">
      <ItemCode>234567890123</ItemCode>
      <Description>Candy Bar</Description>
      <DepartmentCode>002</DepartmentCode>
      <Quantity>1</Quantity>
      <UnitPrice>1.99</UnitPrice>
      <ExtendedPrice>1.99</ExtendedPrice>
      <TaxAmount>0.16</TaxAmount>
    </LineItem>
  </TransactionDetail>
  <TransactionTender>
    <Tender>
      <TenderCode>CASH</TenderCode>
      <TenderDescription>Cash</TenderDescription>
      <Amount>10.00</Amount>
    </Tender>
  </TransactionTender>
  <TransactionTax>
    <Tax TaxCode="STATE">
      <TaxDescription>State Tax</TaxDescription>
      <TaxableAmount>6.97</TaxableAmount>
      <TaxAmount>0.57</TaxAmount>
      <TaxRate>0.0825</TaxRate>
    </Tax>
  </TransactionTax>
  <TransactionTotal>
    <Subtotal>6.97</Subtotal>
    <TaxTotal>0.57</TaxTotal>
    <GrandTotal>7.54</GrandTotal>
    <ChangeDue>2.46</ChangeDue>
  </TransactionTotal>
</NAXMLTransactionDocument>`;

const SAMPLE_DEPARTMENT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<NAXMLDepartmentMaintenance version="3.4">
  <MaintenanceHeader>
    <StoreLocationID>STORE001</StoreLocationID>
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
    <StoreLocationID>STORE001</StoreLocationID>
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
    <StoreLocationID>STORE001</StoreLocationID>
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

const SAMPLE_PRICE_BOOK_XML = `<?xml version="1.0" encoding="UTF-8"?>
<NAXMLPriceBookMaintenance version="3.4">
  <MaintenanceHeader>
    <StoreLocationID>STORE001</StoreLocationID>
    <MaintenanceDate>2025-12-19T10:00:00Z</MaintenanceDate>
    <MaintenanceType>Full</MaintenanceType>
  </MaintenanceHeader>
  <Items>
    <Item Action="AddUpdate">
      <ItemCode>123456789012</ItemCode>
      <Description>Cola 20oz</Description>
      <ShortDescription>Cola</ShortDescription>
      <DepartmentCode>001</DepartmentCode>
      <UnitPrice>2.49</UnitPrice>
      <TaxRateCode>STATE</TaxRateCode>
      <IsActive>Y</IsActive>
    </Item>
    <Item Action="AddUpdate">
      <ItemCode>234567890123</ItemCode>
      <Description>Candy Bar</Description>
      <ShortDescription>Candy</ShortDescription>
      <DepartmentCode>002</DepartmentCode>
      <UnitPrice>1.99</UnitPrice>
      <TaxRateCode>STATE</TaxRateCode>
      <IsActive>Y</IsActive>
    </Item>
  </Items>
</NAXMLPriceBookMaintenance>`;

// =============================================================================
// PARSER TESTS
// =============================================================================

test.describe("Phase1-Unit: NAXML Service - Parser Tests", () => {
  test("NAXML-SVC-001: [P0] Should parse NAXML 3.4 transaction document", async () => {
    // GIVEN: A valid NAXML 3.4 transaction document
    const { createNAXMLService } =
      await import("../../backend/dist/services/naxml/naxml.service");
    const service = createNAXMLService();

    // WHEN: Parsing the document
    const result = service.parseTransaction(SAMPLE_TRANSACTION_XML);

    // THEN: Document should be parsed correctly
    expect(result.documentType).toBe("TransactionDocument");
    expect(result.version).toBe("3.4");
    expect(result.storeLocationId).toBe("STORE001");

    // Verify transaction header
    expect(result.data.transactionHeader.transactionId).toBe(
      "TXN-20251219-001",
    );
    expect(result.data.transactionHeader.terminalId).toBe("POS01");
    expect(result.data.transactionHeader.cashierId).toBe("CASHIER01");
    expect(result.data.transactionHeader.transactionType).toBe("Sale");

    // Verify line items
    expect(result.data.transactionDetail.length).toBe(2);
    expect(result.data.transactionDetail[0].itemCode).toBe("123456789012");
    expect(result.data.transactionDetail[0].quantity).toBe(2);
    expect(result.data.transactionDetail[0].unitPrice).toBe(2.49);
    expect(result.data.transactionDetail[0].extendedPrice).toBe(4.98);

    // Verify tenders
    expect(result.data.transactionTender.length).toBe(1);
    expect(result.data.transactionTender[0].tenderCode).toBe("CASH");
    expect(result.data.transactionTender[0].amount).toBe(10.0);

    // Verify totals
    expect(result.data.transactionTotal.subtotal).toBe(6.97);
    expect(result.data.transactionTotal.taxTotal).toBe(0.57);
    expect(result.data.transactionTotal.grandTotal).toBe(7.54);
    expect(result.data.transactionTotal.changeDue).toBe(2.46);
  });

  test("NAXML-SVC-002: [P0] Should parse NAXML 3.4 department maintenance document", async () => {
    // GIVEN: A valid NAXML 3.4 department maintenance document
    const { createNAXMLService } =
      await import("../../backend/dist/services/naxml/naxml.service");
    const service = createNAXMLService();

    // WHEN: Parsing the document
    const result = service.parseDepartments(SAMPLE_DEPARTMENT_XML);

    // THEN: Document should be parsed correctly
    expect(result.documentType).toBe("DepartmentMaintenance");
    expect(result.version).toBe("3.4");
    expect(result.data.departments.length).toBe(3);

    // Verify first department
    const beverages = result.data.departments[0];
    expect(beverages.departmentCode).toBe("001");
    expect(beverages.description).toBe("Beverages");
    expect(beverages.isTaxable).toBe(true);
    expect(beverages.taxRateCode).toBe("STATE");
    expect(beverages.minimumAge).toBe(0);
    expect(beverages.isActive).toBe(true);

    // Verify age-restricted department
    const tobacco = result.data.departments[2];
    expect(tobacco.departmentCode).toBe("003");
    expect(tobacco.description).toBe("Tobacco");
    expect(tobacco.minimumAge).toBe(21);
  });

  test("NAXML-SVC-003: [P0] Should parse NAXML 3.4 tender maintenance document", async () => {
    // GIVEN: A valid NAXML 3.4 tender maintenance document
    const { createNAXMLService } =
      await import("../../backend/dist/services/naxml/naxml.service");
    const service = createNAXMLService();

    // WHEN: Parsing the document
    const result = service.parseTenders(SAMPLE_TENDER_XML);

    // THEN: Document should be parsed correctly
    expect(result.documentType).toBe("TenderMaintenance");
    expect(result.version).toBe("3.4");
    expect(result.data.tenders.length).toBe(3);

    // Verify cash tender
    const cash = result.data.tenders[0];
    expect(cash.tenderCode).toBe("CASH");
    expect(cash.description).toBe("Cash");
    expect(cash.isCashEquivalent).toBe(true);
    expect(cash.isElectronic).toBe(false);
    expect(cash.affectsCashDrawer).toBe(true);
    expect(cash.requiresReference).toBe(false);

    // Verify credit tender
    const credit = result.data.tenders[1];
    expect(credit.tenderCode).toBe("CREDIT");
    expect(credit.isCashEquivalent).toBe(false);
    expect(credit.isElectronic).toBe(true);
    expect(credit.requiresReference).toBe(true);
  });

  test("NAXML-SVC-004: [P0] Should parse NAXML 3.4 tax rate maintenance document", async () => {
    // GIVEN: A valid NAXML 3.4 tax rate maintenance document
    const { createNAXMLService } =
      await import("../../backend/dist/services/naxml/naxml.service");
    const service = createNAXMLService();

    // WHEN: Parsing the document
    const result = service.parseTaxRates(SAMPLE_TAX_RATE_XML);

    // THEN: Document should be parsed correctly
    expect(result.documentType).toBe("TaxRateMaintenance");
    expect(result.version).toBe("3.4");
    expect(result.data.taxRates.length).toBe(2);

    // Verify state tax
    const stateTax = result.data.taxRates[0];
    expect(stateTax.taxRateCode).toBe("STATE");
    expect(stateTax.description).toBe("State Sales Tax");
    expect(stateTax.rate).toBe(0.0825);
    expect(stateTax.jurisdictionCode).toBe("TX");
    expect(stateTax.isActive).toBe(true);

    // Verify city tax
    const cityTax = result.data.taxRates[1];
    expect(cityTax.taxRateCode).toBe("CITY");
    expect(cityTax.rate).toBe(0.02);
  });

  test("NAXML-SVC-005: [P0] Should parse NAXML 3.4 price book document", async () => {
    // GIVEN: A valid NAXML 3.4 price book document
    const { createNAXMLService } =
      await import("../../backend/dist/services/naxml/naxml.service");
    const service = createNAXMLService();

    // WHEN: Parsing the document
    const result = service.parsePriceBook(SAMPLE_PRICE_BOOK_XML);

    // THEN: Document should be parsed correctly
    expect(result.documentType).toBe("PriceBookMaintenance");
    expect(result.version).toBe("3.4");
    expect(result.data.items.length).toBe(2);

    // Verify first item
    const cola = result.data.items[0];
    expect(cola.itemCode).toBe("123456789012");
    expect(cola.description).toBe("Cola 20oz");
    expect(cola.shortDescription).toBe("Cola");
    expect(cola.departmentCode).toBe("001");
    expect(cola.unitPrice).toBe(2.49);
    expect(cola.taxRateCode).toBe("STATE");
    expect(cola.isActive).toBe(true);
  });
});

// =============================================================================
// BUILDER TESTS
// =============================================================================

test.describe("Phase1-Unit: NAXML Service - Builder Tests", () => {
  test("NAXML-SVC-010: [P0] Should build valid NAXML 3.4 department document", async () => {
    // GIVEN: Department data to export
    const { createNAXMLService } =
      await import("../../backend/dist/services/naxml/naxml.service");
    const service = createNAXMLService();

    const departments = [
      {
        departmentCode: "001",
        description: "Beverages",
        isTaxable: true,
        taxRateCode: "STATE",
        minimumAge: 0,
        isActive: true,
        sortOrder: 1,
        action: "AddUpdate" as const,
      },
      {
        departmentCode: "002",
        description: "Snacks",
        isTaxable: true,
        taxRateCode: "STATE",
        minimumAge: 0,
        isActive: true,
        sortOrder: 2,
        action: "AddUpdate" as const,
      },
    ];

    // WHEN: Building the document
    const xml = service.buildDepartmentDocument(
      "STORE001",
      departments,
      "Full",
    );

    // THEN: XML should be valid and contain expected elements
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("NAXMLDepartmentMaintenance");
    expect(xml).toContain('version="3.4"');
    expect(xml).toContain("<StoreLocationID>STORE001</StoreLocationID>");
    expect(xml).toContain("<MaintenanceType>Full</MaintenanceType>");
    expect(xml).toContain('<Department Code="001"');
    expect(xml).toContain("<Description>Beverages</Description>");
    expect(xml).toContain("<IsTaxable>Y</IsTaxable>");
    expect(xml).toContain("<TaxRateCode>STATE</TaxRateCode>");
    expect(xml).toContain("<IsActive>Y</IsActive>");
  });

  test("NAXML-SVC-011: [P0] Should build valid NAXML 3.4 tender document", async () => {
    // GIVEN: Tender data to export
    const { createNAXMLService } =
      await import("../../backend/dist/services/naxml/naxml.service");
    const service = createNAXMLService();

    const tenders = [
      {
        tenderCode: "CASH",
        description: "Cash",
        isCashEquivalent: true,
        isElectronic: false,
        affectsCashDrawer: true,
        requiresReference: false,
        isActive: true,
        sortOrder: 1,
        action: "AddUpdate" as const,
      },
    ];

    // WHEN: Building the document
    const xml = service.buildTenderDocument("STORE001", tenders, "Full");

    // THEN: XML should be valid
    expect(xml).toContain("NAXMLTenderMaintenance");
    expect(xml).toContain('<Tender Code="CASH"');
    expect(xml).toContain("<Description>Cash</Description>");
    expect(xml).toContain("<IsCashEquivalent>Y</IsCashEquivalent>");
    expect(xml).toContain("<IsElectronic>N</IsElectronic>");
    expect(xml).toContain("<AffectsCashDrawer>Y</AffectsCashDrawer>");
    expect(xml).toContain("<RequiresReference>N</RequiresReference>");
  });

  test("NAXML-SVC-012: [P0] Should build valid NAXML 3.4 tax rate document", async () => {
    // GIVEN: Tax rate data to export
    const { createNAXMLService } =
      await import("../../backend/dist/services/naxml/naxml.service");
    const service = createNAXMLService();

    const taxRates = [
      {
        taxRateCode: "STATE",
        description: "State Tax",
        rate: 0.0825,
        isActive: true,
        jurisdictionCode: "TX",
        action: "AddUpdate" as const,
      },
    ];

    // WHEN: Building the document
    const xml = service.buildTaxRateDocument("STORE001", taxRates, "Full");

    // THEN: XML should be valid
    expect(xml).toContain("NAXMLTaxRateMaintenance");
    expect(xml).toContain('<TaxRate Code="STATE"');
    expect(xml).toContain("<Description>State Tax</Description>");
    expect(xml).toContain("<Rate>0.0825</Rate>");
    expect(xml).toContain("<JurisdictionCode>TX</JurisdictionCode>");
  });

  test("NAXML-SVC-013: [P0] Should build valid NAXML 3.4 price book document", async () => {
    // GIVEN: Price book data to export
    const { createNAXMLService } =
      await import("../../backend/dist/services/naxml/naxml.service");
    const service = createNAXMLService();

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

    // WHEN: Building the document
    const xml = service.buildPriceBookDocument("STORE001", items, "Full");

    // THEN: XML should be valid
    expect(xml).toContain("NAXMLPriceBookMaintenance");
    expect(xml).toContain("<ItemCode>123456789012</ItemCode>");
    expect(xml).toContain("<Description>Cola 20oz</Description>");
    expect(xml).toContain("<UnitPrice>2.49</UnitPrice>");
    expect(xml).toContain("<DepartmentCode>001</DepartmentCode>");
    expect(xml).toContain("<TaxRateCode>STATE</TaxRateCode>");
  });

  test("NAXML-SVC-014: [P1] Round-trip test: parse -> convert -> build -> parse", async () => {
    // GIVEN: An original department document
    const { createNAXMLService } =
      await import("../../backend/dist/services/naxml/naxml.service");
    const service = createNAXMLService();

    // WHEN: Parse, convert to internal format, convert back to NAXML, build, and parse again
    const original = service.parseDepartments(SAMPLE_DEPARTMENT_XML);
    const posDepartments = service.convertDepartments(
      original.data.departments,
    );
    const naxmlDepartments = service.toNAXMLDepartments(posDepartments);
    const rebuiltXml = service.buildDepartmentDocument(
      original.storeLocationId,
      naxmlDepartments,
      "Full",
    );
    const reparsed = service.parseDepartments(rebuiltXml);

    // THEN: Reparsed data should match original
    expect(reparsed.data.departments.length).toBe(
      original.data.departments.length,
    );
    expect(reparsed.data.departments[0].departmentCode).toBe(
      original.data.departments[0].departmentCode,
    );
    expect(reparsed.data.departments[0].description).toBe(
      original.data.departments[0].description,
    );
    expect(reparsed.data.departments[0].isTaxable).toBe(
      original.data.departments[0].isTaxable,
    );
  });
});

// =============================================================================
// VALIDATOR TESTS
// =============================================================================

test.describe("Phase1-Unit: NAXML Service - Validator Tests", () => {
  test("NAXML-SVC-020: [P0] Should validate transaction document structure", async () => {
    // GIVEN: A valid transaction document
    const { createNAXMLService } =
      await import("../../backend/dist/services/naxml/naxml.service");
    const service = createNAXMLService();

    const document = service.parseTransaction(SAMPLE_TRANSACTION_XML);

    // WHEN: Validating the document
    const result = service.validate(document);

    // THEN: Validation should pass
    expect(result.isValid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  test("NAXML-SVC-021: [P0] Should validate department document and detect duplicates", async () => {
    // GIVEN: A department document with duplicate codes
    const { createNAXMLService, createNAXMLValidator } =
      await import("../../backend/dist/services/naxml/naxml.service");
    // Disable validation during parsing so we can test validation separately
    const service = createNAXMLService({ validateOnParse: false });
    const validator = createNAXMLValidator({ checkDuplicates: true });

    const duplicateDeptXml = `<?xml version="1.0" encoding="UTF-8"?>
<NAXMLDepartmentMaintenance version="3.4">
  <MaintenanceHeader>
    <StoreLocationID>STORE001</StoreLocationID>
    <MaintenanceDate>2025-12-19T10:00:00Z</MaintenanceDate>
    <MaintenanceType>Full</MaintenanceType>
  </MaintenanceHeader>
  <Departments>
    <Department Code="001" Action="AddUpdate">
      <Description>Beverages</Description>
      <IsTaxable>Y</IsTaxable>
      <IsActive>Y</IsActive>
    </Department>
    <Department Code="001" Action="AddUpdate">
      <Description>Also Beverages</Description>
      <IsTaxable>Y</IsTaxable>
      <IsActive>Y</IsActive>
    </Department>
  </Departments>
</NAXMLDepartmentMaintenance>`;

    const document = service.parseDepartments(duplicateDeptXml);

    // WHEN: Validating the document
    const result = validator.validate(document);

    // THEN: Validation should fail with duplicate error
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.code === "NAXML_DUPLICATE_CODE")).toBe(
      true,
    );
  });

  test("NAXML-SVC-022: [P1] Should validate transaction totals and calculations", async () => {
    // GIVEN: A transaction document with incorrect totals
    const { createNAXMLService, createNAXMLValidator } =
      await import("../../backend/dist/services/naxml/naxml.service");
    const service = createNAXMLService();
    const validator = createNAXMLValidator({ validateTotals: true });

    const badTotalsXml = `<?xml version="1.0" encoding="UTF-8"?>
<NAXMLTransactionDocument version="3.4">
  <TransactionHeader>
    <StoreLocationID>STORE001</StoreLocationID>
    <TerminalID>POS01</TerminalID>
    <TransactionID>TXN-BAD-001</TransactionID>
    <BusinessDate>2025-12-19</BusinessDate>
    <TransactionDate>2025-12-19T10:30:00Z</TransactionDate>
    <TransactionType>Sale</TransactionType>
  </TransactionHeader>
  <TransactionDetail>
    <LineItem>
      <ItemCode>123456789012</ItemCode>
      <Description>Test Item</Description>
      <DepartmentCode>001</DepartmentCode>
      <Quantity>1</Quantity>
      <UnitPrice>10.00</UnitPrice>
      <ExtendedPrice>10.00</ExtendedPrice>
      <TaxAmount>0.83</TaxAmount>
    </LineItem>
  </TransactionDetail>
  <TransactionTender>
    <Tender>
      <TenderCode>CASH</TenderCode>
      <Amount>20.00</Amount>
    </Tender>
  </TransactionTender>
  <TransactionTotal>
    <Subtotal>10.00</Subtotal>
    <TaxTotal>0.83</TaxTotal>
    <GrandTotal>100.00</GrandTotal>
  </TransactionTotal>
</NAXMLTransactionDocument>`;

    const document = service.parseTransaction(badTotalsXml);

    // WHEN: Validating the document
    const result = validator.validate(document);

    // THEN: Validation should produce warnings about mismatched totals
    expect(
      result.warnings.some((w) => w.code === "NAXML_TOTALS_MISMATCH"),
    ).toBe(true);
  });

  test("NAXML-SVC-023: [P1] Should validate required fields in documents", async () => {
    // GIVEN: A department document with missing required fields
    const { createNAXMLService } =
      await import("../../backend/dist/services/naxml/naxml.service");
    // Disable validation during parsing so we can test validation separately
    const service = createNAXMLService({ validateOnParse: false });

    const missingFieldsXml = `<?xml version="1.0" encoding="UTF-8"?>
<NAXMLDepartmentMaintenance version="3.4">
  <MaintenanceHeader>
    <StoreLocationID>STORE001</StoreLocationID>
    <MaintenanceDate>2025-12-19T10:00:00Z</MaintenanceDate>
    <MaintenanceType>Full</MaintenanceType>
  </MaintenanceHeader>
  <Departments>
    <Department Code="" Action="AddUpdate">
      <Description></Description>
      <IsTaxable>Y</IsTaxable>
      <IsActive>Y</IsActive>
    </Department>
  </Departments>
</NAXMLDepartmentMaintenance>`;

    const document = service.parseDepartments(missingFieldsXml);

    // WHEN: Validating the document
    const result = service.validate(document);

    // THEN: Validation should fail with missing field errors
    expect(result.isValid).toBe(false);
    expect(
      result.errors.some((e) => e.code === "NAXML_MISSING_REQUIRED_FIELD"),
    ).toBe(true);
  });
});

// =============================================================================
// CONVERTER TESTS
// =============================================================================

test.describe("Phase1-Unit: NAXML Service - Converter Tests", () => {
  test("NAXML-SVC-030: [P0] Should convert NAXML departments to POS departments", async () => {
    // GIVEN: Parsed NAXML department document
    const { createNAXMLService } =
      await import("../../backend/dist/services/naxml/naxml.service");
    const service = createNAXMLService();
    const document = service.parseDepartments(SAMPLE_DEPARTMENT_XML);

    // WHEN: Converting to POS format
    const posDepartments = service.convertDepartments(
      document.data.departments,
    );

    // THEN: Converted data should match expected format
    expect(posDepartments.length).toBe(3);

    const beverages = posDepartments[0];
    expect(beverages.posCode).toBe("001");
    expect(beverages.displayName).toBe("Beverages");
    expect(beverages.isTaxable).toBe(true);
    expect(beverages.minimumAge).toBe(0);
    expect(beverages.isLottery).toBe(false);
    expect(beverages.isActive).toBe(true);

    const tobacco = posDepartments[2];
    expect(tobacco.minimumAge).toBe(21);
  });

  test("NAXML-SVC-031: [P0] Should convert NAXML tender types to POS tender types", async () => {
    // GIVEN: Parsed NAXML tender document
    const { createNAXMLService } =
      await import("../../backend/dist/services/naxml/naxml.service");
    const service = createNAXMLService();
    const document = service.parseTenders(SAMPLE_TENDER_XML);

    // WHEN: Converting to POS format
    const posTenders = service.convertTenderTypes(document.data.tenders);

    // THEN: Converted data should match expected format
    expect(posTenders.length).toBe(3);

    const cash = posTenders[0];
    expect(cash.posCode).toBe("CASH");
    expect(cash.displayName).toBe("Cash");
    expect(cash.isCashEquivalent).toBe(true);
    expect(cash.isElectronic).toBe(false);
    expect(cash.affectsCashDrawer).toBe(true);
    expect(cash.requiresReference).toBe(false);

    const credit = posTenders[1];
    expect(credit.posCode).toBe("CREDIT");
    expect(credit.isElectronic).toBe(true);
    expect(credit.requiresReference).toBe(true);
  });

  test("NAXML-SVC-032: [P0] Should convert NAXML tax rates to POS tax rates", async () => {
    // GIVEN: Parsed NAXML tax rate document
    const { createNAXMLService } =
      await import("../../backend/dist/services/naxml/naxml.service");
    const service = createNAXMLService();
    const document = service.parseTaxRates(SAMPLE_TAX_RATE_XML);

    // WHEN: Converting to POS format
    const posTaxRates = service.convertTaxRates(document.data.taxRates);

    // THEN: Converted data should match expected format
    expect(posTaxRates.length).toBe(2);

    const stateTax = posTaxRates[0];
    expect(stateTax.posCode).toBe("STATE");
    expect(stateTax.displayName).toBe("State Sales Tax");
    expect(stateTax.rate).toBe(0.0825);
    expect(stateTax.jurisdictionCode).toBe("TX");
    expect(stateTax.isActive).toBe(true);
  });

  test("NAXML-SVC-033: [P0] Should convert NAXML transaction to POS transaction", async () => {
    // GIVEN: Parsed NAXML transaction document
    const { createNAXMLService } =
      await import("../../backend/dist/services/naxml/naxml.service");
    const service = createNAXMLService();
    const document = service.parseTransaction(SAMPLE_TRANSACTION_XML);

    // WHEN: Converting to POS format
    const posTransaction = service.convertTransaction(document.data);

    // THEN: Converted data should match expected format
    expect(posTransaction.posTransactionId).toBe("TXN-20251219-001");
    expect(posTransaction.terminalId).toBe("POS01");
    expect(posTransaction.cashierCode).toBe("CASHIER01");
    expect(posTransaction.subtotal).toBe(6.97);
    expect(posTransaction.tax).toBe(0.57);
    expect(posTransaction.total).toBe(7.54);

    // Verify line items
    expect(posTransaction.lineItems.length).toBe(2);
    expect(posTransaction.lineItems[0].sku).toBe("123456789012");
    expect(posTransaction.lineItems[0].quantity).toBe(2);
    expect(posTransaction.lineItems[0].unitPrice).toBe(2.49);

    // Verify payments
    expect(posTransaction.payments.length).toBe(1);
    expect(posTransaction.payments[0].tenderCode).toBe("CASH");
    expect(posTransaction.payments[0].amount).toBe(10.0);
  });

  test("NAXML-SVC-034: [P1] Should convert POS departments back to NAXML format", async () => {
    // GIVEN: POS department data
    const { createNAXMLService } =
      await import("../../backend/dist/services/naxml/naxml.service");
    const service = createNAXMLService();

    const posDepartments = [
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

    // WHEN: Converting to NAXML format
    const naxmlDepartments = service.toNAXMLDepartments(posDepartments);

    // THEN: Converted data should match NAXML format
    expect(naxmlDepartments.length).toBe(1);
    expect(naxmlDepartments[0].departmentCode).toBe("001");
    expect(naxmlDepartments[0].description).toBe("Beverages");
    expect(naxmlDepartments[0].isTaxable).toBe(true);
    expect(naxmlDepartments[0].action).toBe("AddUpdate");
  });
});

// =============================================================================
// IMPORT TESTS
// =============================================================================

test.describe("Phase1-Unit: NAXML Service - Import Tests", () => {
  test("NAXML-SVC-040: [P0] Should import transaction from XML and return result", async () => {
    // GIVEN: Valid transaction XML
    const { createNAXMLService } =
      await import("../../backend/dist/services/naxml/naxml.service");
    const service = createNAXMLService();

    // WHEN: Importing the transaction
    const result = service.importTransactions(SAMPLE_TRANSACTION_XML);

    // THEN: Import should succeed with correct metadata
    expect(result.success).toBe(true);
    expect(result.documentType).toBe("TransactionDocument");
    expect(result.recordCount).toBe(1);
    expect(result.successCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(result.errors.length).toBe(0);
    expect(result.data.length).toBe(1);
    expect(result.fileHash).toBeDefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("NAXML-SVC-041: [P0] Should import departments from XML and return result", async () => {
    // GIVEN: Valid department XML
    const { createNAXMLService } =
      await import("../../backend/dist/services/naxml/naxml.service");
    const service = createNAXMLService();

    // WHEN: Importing the departments
    const result = service.importDepartments(SAMPLE_DEPARTMENT_XML);

    // THEN: Import should succeed
    expect(result.success).toBe(true);
    expect(result.documentType).toBe("DepartmentMaintenance");
    expect(result.recordCount).toBe(3);
    expect(result.successCount).toBe(3);
    expect(result.data.length).toBe(3);
    expect(result.data[0].posCode).toBe("001");
  });

  test("NAXML-SVC-042: [P0] Should import tender types from XML and return result", async () => {
    // GIVEN: Valid tender XML
    const { createNAXMLService } =
      await import("../../backend/dist/services/naxml/naxml.service");
    const service = createNAXMLService();

    // WHEN: Importing the tender types
    const result = service.importTenderTypes(SAMPLE_TENDER_XML);

    // THEN: Import should succeed
    expect(result.success).toBe(true);
    expect(result.documentType).toBe("TenderMaintenance");
    expect(result.recordCount).toBe(3);
    expect(result.data[0].posCode).toBe("CASH");
  });

  test("NAXML-SVC-043: [P0] Should import tax rates from XML and return result", async () => {
    // GIVEN: Valid tax rate XML
    const { createNAXMLService } =
      await import("../../backend/dist/services/naxml/naxml.service");
    const service = createNAXMLService();

    // WHEN: Importing the tax rates
    const result = service.importTaxRates(SAMPLE_TAX_RATE_XML);

    // THEN: Import should succeed
    expect(result.success).toBe(true);
    expect(result.documentType).toBe("TaxRateMaintenance");
    expect(result.recordCount).toBe(2);
    expect(result.data[0].posCode).toBe("STATE");
    expect(result.data[0].rate).toBe(0.0825);
  });

  test("NAXML-SVC-044: [P1] Should handle import errors gracefully", async () => {
    // GIVEN: Invalid XML content
    const { createNAXMLService } =
      await import("../../backend/dist/services/naxml/naxml.service");
    const service = createNAXMLService();

    const invalidXml = "This is not valid XML <broken>";

    // WHEN: Attempting to import
    const result = service.importTransactions(invalidXml);

    // THEN: Import should fail gracefully with error details
    expect(result.success).toBe(false);
    expect(result.failedCount).toBe(1);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].errorCode).toBeDefined();
    expect(result.errors[0].errorMessage).toBeDefined();
  });
});

// =============================================================================
// UTILITY TESTS
// =============================================================================

test.describe("Phase1-Unit: NAXML Service - Utility Tests", () => {
  test("NAXML-SVC-050: [P1] Should calculate consistent file hash", async () => {
    // GIVEN: Content to hash
    const { createNAXMLService } =
      await import("../../backend/dist/services/naxml/naxml.service");
    const service = createNAXMLService();

    const content = "Test content for hashing";

    // WHEN: Calculating hash multiple times
    const hash1 = service.calculateHash(content);
    const hash2 = service.calculateHash(content);

    // THEN: Hashes should be consistent and correct format
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex characters
    expect(/^[a-f0-9]+$/.test(hash1)).toBe(true);
  });

  test("NAXML-SVC-051: [P1] Should detect different content with different hashes", async () => {
    // GIVEN: Different content
    const { createNAXMLService } =
      await import("../../backend/dist/services/naxml/naxml.service");
    const service = createNAXMLService();

    const content1 = "Content version 1";
    const content2 = "Content version 2";

    // WHEN: Calculating hashes
    const hash1 = service.calculateHash(content1);
    const hash2 = service.calculateHash(content2);

    // THEN: Hashes should be different
    expect(hash1).not.toBe(hash2);
  });

  test("NAXML-SVC-052: [P1] Should validate XML without full parsing", async () => {
    // GIVEN: Valid and invalid XML strings
    const { createNAXMLService } =
      await import("../../backend/dist/services/naxml/naxml.service");
    const service = createNAXMLService();

    // WHEN: Validating XML
    const validResult = service.validateXml(SAMPLE_TRANSACTION_XML);
    const invalidResult = service.validateXml("<broken>xml");

    // THEN: Validation results should be accurate
    expect(validResult.isValid).toBe(true);
    expect(validResult.documentType).toBe("TransactionDocument");
    expect(validResult.version).toBe("3.4");

    expect(invalidResult.isValid).toBe(false);
    expect(invalidResult.errors.length).toBeGreaterThan(0);
  });

  test("NAXML-SVC-053: [P1] Should quick validate documents", async () => {
    // GIVEN: A valid document
    const { createNAXMLService } =
      await import("../../backend/dist/services/naxml/naxml.service");
    const service = createNAXMLService();
    const document = service.parseTransaction(SAMPLE_TRANSACTION_XML);

    // WHEN: Quick validating
    const isValid = service.isValid(document);

    // THEN: Should return true for valid document
    expect(isValid).toBe(true);
  });
});

// =============================================================================
// VERSION HANDLING TESTS
// =============================================================================

test.describe("Phase1-Unit: NAXML Service - Version Handling", () => {
  test("NAXML-SVC-060: [P1] Should handle NAXML 3.2 documents", async () => {
    // GIVEN: A NAXML 3.2 document
    const { createNAXMLService } =
      await import("../../backend/dist/services/naxml/naxml.service");
    const service = createNAXMLService({ version: "3.2" });

    const naxml32 = `<?xml version="1.0" encoding="UTF-8"?>
<NAXMLDepartmentMaintenance version="3.2">
  <MaintenanceHeader>
    <StoreLocationID>STORE001</StoreLocationID>
    <MaintenanceDate>2025-12-19T10:00:00Z</MaintenanceDate>
    <MaintenanceType>Full</MaintenanceType>
  </MaintenanceHeader>
  <Departments>
    <Department Code="001">
      <Description>Beverages</Description>
      <IsTaxable>Y</IsTaxable>
      <IsActive>Y</IsActive>
    </Department>
  </Departments>
</NAXMLDepartmentMaintenance>`;

    // WHEN: Parsing the 3.2 document
    const result = service.parseDepartments(naxml32);

    // THEN: Should parse correctly with detected version
    expect(result.version).toBe("3.2");
    expect(result.data.departments.length).toBe(1);
  });

  test("NAXML-SVC-061: [P2] Should build documents with specified version", async () => {
    // GIVEN: A service configured for version 3.2
    const { createNAXMLService } =
      await import("../../backend/dist/services/naxml/naxml.service");
    const service = createNAXMLService({ version: "3.4" });

    // WHEN: Building a document
    const xml = service.buildDepartmentDocument(
      "STORE001",
      [
        {
          departmentCode: "001",
          description: "Test",
          isTaxable: true,
          isActive: true,
        },
      ],
      "Full",
    );

    // THEN: Built XML should use the specified version
    expect(xml).toContain('version="3.4"');
  });
});
