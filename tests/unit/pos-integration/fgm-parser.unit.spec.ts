/**
 * NAXML FGM (Fuel Grade Movement) Parser Unit Tests
 *
 * Enterprise-grade test suite for the FGM parser implementation.
 * Tests validate parsing of FGM XML documents including:
 * - "By Position" variant (Period 98) - sales grouped by pump/dispenser
 * - "By Tender" variant (Period 2) - sales grouped by payment method
 *
 * Test Coverage Matrix (34 tests):
 * - FGM-PARSE-001 through 010: Document Type Detection Tests
 * - FGM-HEADER-001 through 006: Movement Header Parsing Tests
 * - FGM-DETAIL-001 through 008: FGMDetail Parsing Tests
 * - FGM-POS-001 through 005: Position Summary Tests
 * - FGM-TENDER-001 through 005: Tender Summary Tests
 * - FGM-SALES-001 through 005: Sales Totals Tests
 * - FGM-SEC-001 through 005: Security & Validation Tests
 *
 * Traceability:
 * - XML.md Phase 2 Requirements
 * - NAXML 3.4 Specification
 * - Gilbarco Passport FGM File Format
 *
 * @module tests/unit/pos-integration/fgm-parser.unit.spec
 * @security SEC-014 Input validation, allowlist enforcement
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

import {
  NAXMLParser,
  createNAXMLParser,
  parseFuelGradeMovement,
  NAXMLParserError,
  NAXML_PARSER_ERROR_CODES,
} from "../../../backend/src/services/naxml/naxml.parser";

import type {
  NAXMLFuelGradeMovementData,
  NAXMLDocument,
} from "../../../backend/src/types/naxml.types";

// ============================================================================
// Test Fixtures - Real Production XML Structures
// ============================================================================

/**
 * FGM "By Position" variant XML (Period 98 - Shift Close)
 * Based on real Gilbarco Passport FGM file structure
 */
const FGM_BY_POSITION_XML = `<?xml version="1.0" encoding="ISO-8859-1"?>
<NAXML-MovementReport version="3.4">
<TransmissionHeader>
<StoreLocationID>299</StoreLocationID>
<VendorName>Gilbarco-VeederRoot</VendorName>
<VendorModelVersion>22.01.26.01</VendorModelVersion>
</TransmissionHeader>
<FuelGradeMovement>
<MovementHeader>
<ReportSequenceNumber>1</ReportSequenceNumber>
<PrimaryReportPeriod>98</PrimaryReportPeriod>
<SecondaryReportPeriod>0</SecondaryReportPeriod>
<BusinessDate>2025-12-31</BusinessDate>
<BeginDate>2025-12-31</BeginDate>
<BeginTime>23:59:30</BeginTime>
<EndDate>2026-01-01</EndDate>
<EndTime>23:59:36</EndTime>
</MovementHeader>
<SalesMovementHeader>
<RegisterID>1</RegisterID>
<CashierID>1</CashierID>
<TillID>4131</TillID>
</SalesMovementHeader>
<FGMDetail>
<FuelGradeID>001</FuelGradeID>
<FGMPositionSummary>
<FuelPositionID>1</FuelPositionID>
<FGMPriceTierSummary>
<PriceTierCode>0001</PriceTierCode>
<FGMSalesTotals>
<FuelGradeSalesVolume>86.838</FuelGradeSalesVolume>
<FuelGradeSalesAmount>218.74</FuelGradeSalesAmount>
<PumpTestTotals>
<PumpTestAmount>0</PumpTestAmount>
<PumpTestVolume>0</PumpTestVolume>
<ReturnTankID/>
</PumpTestTotals>
<TaxExemptSalesVolume>0</TaxExemptSalesVolume>
<DiscountAmount>0</DiscountAmount>
<DiscountCount>0</DiscountCount>
<DispenserDiscountAmount>0</DispenserDiscountAmount>
<DispenserDiscountCount>0</DispenserDiscountCount>
</FGMSalesTotals>
</FGMPriceTierSummary>
<FGMPriceTierSummary>
<PriceTierCode>0002</PriceTierCode>
<FGMSalesTotals>
<FuelGradeSalesVolume>12.5</FuelGradeSalesVolume>
<FuelGradeSalesAmount>35.00</FuelGradeSalesAmount>
<PumpTestTotals>
<PumpTestAmount>0</PumpTestAmount>
<PumpTestVolume>0</PumpTestVolume>
<ReturnTankID/>
</PumpTestTotals>
<TaxExemptSalesVolume>0</TaxExemptSalesVolume>
<DiscountAmount>2.50</DiscountAmount>
<DiscountCount>1</DiscountCount>
<DispenserDiscountAmount>0</DispenserDiscountAmount>
<DispenserDiscountCount>0</DispenserDiscountCount>
</FGMSalesTotals>
</FGMPriceTierSummary>
</FGMPositionSummary>
</FGMDetail>
<FGMDetail>
<FuelGradeID>002</FuelGradeID>
<FGMPositionSummary>
<FuelPositionID>2</FuelPositionID>
<FGMPriceTierSummary>
<PriceTierCode>0001</PriceTierCode>
<FGMSalesTotals>
<FuelGradeSalesVolume>45.123</FuelGradeSalesVolume>
<FuelGradeSalesAmount>150.00</FuelGradeSalesAmount>
<PumpTestTotals>
<PumpTestAmount>0</PumpTestAmount>
<PumpTestVolume>0</PumpTestVolume>
</PumpTestTotals>
<TaxExemptSalesVolume>5.5</TaxExemptSalesVolume>
<DiscountAmount>0</DiscountAmount>
<DiscountCount>0</DiscountCount>
</FGMSalesTotals>
</FGMPriceTierSummary>
</FGMPositionSummary>
</FGMDetail>
</FuelGradeMovement>
</NAXML-MovementReport>`;

/**
 * FGM "By Tender" variant XML (Period 2 - Day Close)
 * Sales grouped by payment method (cash, credit, debit)
 */
const FGM_BY_TENDER_XML = `<?xml version="1.0" encoding="ISO-8859-1"?>
<NAXML-MovementReport version="3.4">
<TransmissionHeader>
<StoreLocationID>299</StoreLocationID>
<VendorName>Gilbarco-VeederRoot</VendorName>
<VendorModelVersion>22.01.26.01</VendorModelVersion>
</TransmissionHeader>
<FuelGradeMovement>
<MovementHeader>
<ReportSequenceNumber>1</ReportSequenceNumber>
<PrimaryReportPeriod>2</PrimaryReportPeriod>
<SecondaryReportPeriod>0</SecondaryReportPeriod>
<BusinessDate>2026-01-02</BusinessDate>
<BeginDate>2026-01-02</BeginDate>
<BeginTime>06:00:00</BeginTime>
<EndDate>2026-01-03</EndDate>
<EndTime>05:59:59</EndTime>
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
<FuelGradeSalesVolume>201.676</FuelGradeSalesVolume>
<FuelGradeSalesAmount>508.00</FuelGradeSalesAmount>
<DiscountAmount>7.43</DiscountAmount>
<DiscountCount>3</DiscountCount>
</FGMSalesTotals>
</FGMServiceLevelSummary>
</FGMSellPriceSummary>
</FGMTenderSummary>
</FGMDetail>
<FGMDetail>
<FuelGradeID>001</FuelGradeID>
<FGMTenderSummary>
<Tender>
<TenderCode>outsideCredit</TenderCode>
<TenderSubCode>generic</TenderSubCode>
</Tender>
<FGMSellPriceSummary>
<ActualSalesPrice>2.619</ActualSalesPrice>
<FGMServiceLevelSummary>
<ServiceLevelCode>1</ServiceLevelCode>
<FGMSalesTotals>
<FuelGradeSalesVolume>350.25</FuelGradeSalesVolume>
<FuelGradeSalesAmount>917.50</FuelGradeSalesAmount>
<DiscountAmount>0</DiscountAmount>
<DiscountCount>0</DiscountCount>
</FGMSalesTotals>
</FGMServiceLevelSummary>
</FGMSellPriceSummary>
</FGMTenderSummary>
</FGMDetail>
</FuelGradeMovement>
</NAXML-MovementReport>`;

/**
 * FGM with Non-Resettable Totals (meter readings)
 */
const FGM_WITH_NRT_XML = `<?xml version="1.0" encoding="ISO-8859-1"?>
<NAXML-MovementReport version="3.4">
<TransmissionHeader>
<StoreLocationID>299</StoreLocationID>
<VendorName>Gilbarco-VeederRoot</VendorName>
<VendorModelVersion>22.01.26.01</VendorModelVersion>
</TransmissionHeader>
<FuelGradeMovement>
<MovementHeader>
<ReportSequenceNumber>1</ReportSequenceNumber>
<PrimaryReportPeriod>2</PrimaryReportPeriod>
<SecondaryReportPeriod>0</SecondaryReportPeriod>
<BusinessDate>2026-01-02</BusinessDate>
<BeginDate>2026-01-02</BeginDate>
<BeginTime>06:00:00</BeginTime>
<EndDate>2026-01-03</EndDate>
<EndTime>05:59:59</EndTime>
</MovementHeader>
<FGMDetail>
<FuelGradeID>001</FuelGradeID>
<FGMPositionSummary>
<FuelPositionID>1</FuelPositionID>
<FGMNonResettableTotal>
<FuelGradeNonResettableTotalVolume>228745.691</FuelGradeNonResettableTotalVolume>
<FuelGradeNonResettableTotalAmount>514890.25</FuelGradeNonResettableTotalAmount>
</FGMNonResettableTotal>
<FGMPriceTierSummary>
<PriceTierCode>0001</PriceTierCode>
<FGMSalesTotals>
<FuelGradeSalesVolume>100.00</FuelGradeSalesVolume>
<FuelGradeSalesAmount>250.00</FuelGradeSalesAmount>
<DiscountAmount>0</DiscountAmount>
<DiscountCount>0</DiscountCount>
</FGMSalesTotals>
</FGMPriceTierSummary>
</FGMPositionSummary>
</FGMDetail>
</FuelGradeMovement>
</NAXML-MovementReport>`;

/**
 * Minimal valid FGM XML
 */
const FGM_MINIMAL_XML = `<?xml version="1.0" encoding="ISO-8859-1"?>
<NAXML-MovementReport version="3.4">
<TransmissionHeader>
<StoreLocationID>001</StoreLocationID>
</TransmissionHeader>
<FuelGradeMovement>
<MovementHeader>
<ReportSequenceNumber>1</ReportSequenceNumber>
<PrimaryReportPeriod>2</PrimaryReportPeriod>
<SecondaryReportPeriod>0</SecondaryReportPeriod>
<BusinessDate>2026-01-01</BusinessDate>
<BeginDate>2026-01-01</BeginDate>
<BeginTime>00:00:00</BeginTime>
<EndDate>2026-01-01</EndDate>
<EndTime>23:59:59</EndTime>
</MovementHeader>
<FGMDetail>
<FuelGradeID>001</FuelGradeID>
<FGMPositionSummary>
<FuelPositionID>1</FuelPositionID>
<FGMPriceTierSummary>
<PriceTierCode>0001</PriceTierCode>
<FGMSalesTotals>
<FuelGradeSalesVolume>0</FuelGradeSalesVolume>
<FuelGradeSalesAmount>0</FuelGradeSalesAmount>
<DiscountAmount>0</DiscountAmount>
<DiscountCount>0</DiscountCount>
</FGMSalesTotals>
</FGMPriceTierSummary>
</FGMPositionSummary>
</FGMDetail>
</FuelGradeMovement>
</NAXML-MovementReport>`;

/**
 * FGM with all fuel grades (001-Regular, 002-Plus, 003-Premium, 021-Diesel, 300-Kerosene)
 */
const FGM_MULTI_GRADE_XML = `<?xml version="1.0" encoding="ISO-8859-1"?>
<NAXML-MovementReport version="3.4">
<TransmissionHeader>
<StoreLocationID>299</StoreLocationID>
</TransmissionHeader>
<FuelGradeMovement>
<MovementHeader>
<ReportSequenceNumber>1</ReportSequenceNumber>
<PrimaryReportPeriod>2</PrimaryReportPeriod>
<SecondaryReportPeriod>0</SecondaryReportPeriod>
<BusinessDate>2026-01-02</BusinessDate>
<BeginDate>2026-01-02</BeginDate>
<BeginTime>00:00:00</BeginTime>
<EndDate>2026-01-02</EndDate>
<EndTime>23:59:59</EndTime>
</MovementHeader>
<FGMDetail>
<FuelGradeID>001</FuelGradeID>
<FGMPositionSummary>
<FuelPositionID>1</FuelPositionID>
<FGMPriceTierSummary>
<PriceTierCode>0001</PriceTierCode>
<FGMSalesTotals>
<FuelGradeSalesVolume>100</FuelGradeSalesVolume>
<FuelGradeSalesAmount>252</FuelGradeSalesAmount>
<DiscountAmount>0</DiscountAmount>
<DiscountCount>0</DiscountCount>
</FGMSalesTotals>
</FGMPriceTierSummary>
</FGMPositionSummary>
</FGMDetail>
<FGMDetail>
<FuelGradeID>002</FuelGradeID>
<FGMPositionSummary>
<FuelPositionID>1</FuelPositionID>
<FGMPriceTierSummary>
<PriceTierCode>0001</PriceTierCode>
<FGMSalesTotals>
<FuelGradeSalesVolume>50</FuelGradeSalesVolume>
<FuelGradeSalesAmount>135</FuelGradeSalesAmount>
<DiscountAmount>0</DiscountAmount>
<DiscountCount>0</DiscountCount>
</FGMSalesTotals>
</FGMPriceTierSummary>
</FGMPositionSummary>
</FGMDetail>
<FGMDetail>
<FuelGradeID>003</FuelGradeID>
<FGMPositionSummary>
<FuelPositionID>1</FuelPositionID>
<FGMPriceTierSummary>
<PriceTierCode>0001</PriceTierCode>
<FGMSalesTotals>
<FuelGradeSalesVolume>25</FuelGradeSalesVolume>
<FuelGradeSalesAmount>75</FuelGradeSalesAmount>
<DiscountAmount>0</DiscountAmount>
<DiscountCount>0</DiscountCount>
</FGMSalesTotals>
</FGMPriceTierSummary>
</FGMPositionSummary>
</FGMDetail>
<FGMDetail>
<FuelGradeID>021</FuelGradeID>
<FGMPositionSummary>
<FuelPositionID>5</FuelPositionID>
<FGMPriceTierSummary>
<PriceTierCode>0001</PriceTierCode>
<FGMSalesTotals>
<FuelGradeSalesVolume>200</FuelGradeSalesVolume>
<FuelGradeSalesAmount>600</FuelGradeSalesAmount>
<DiscountAmount>0</DiscountAmount>
<DiscountCount>0</DiscountCount>
</FGMSalesTotals>
</FGMPriceTierSummary>
</FGMPositionSummary>
</FGMDetail>
<FGMDetail>
<FuelGradeID>300</FuelGradeID>
<FGMPositionSummary>
<FuelPositionID>7</FuelPositionID>
<FGMPriceTierSummary>
<PriceTierCode>0001</PriceTierCode>
<FGMSalesTotals>
<FuelGradeSalesVolume>12.5</FuelGradeSalesVolume>
<FuelGradeSalesAmount>75</FuelGradeSalesAmount>
<DiscountAmount>0</DiscountAmount>
<DiscountCount>0</DiscountCount>
</FGMSalesTotals>
</FGMPriceTierSummary>
</FGMPositionSummary>
</FGMDetail>
</FuelGradeMovement>
</NAXML-MovementReport>`;

// ============================================================================
// Invalid/Malformed XML Fixtures for Error Testing
// ============================================================================

const FGM_MISSING_MOVEMENT_HEADER = `<?xml version="1.0" encoding="ISO-8859-1"?>
<NAXML-MovementReport version="3.4">
<TransmissionHeader>
<StoreLocationID>299</StoreLocationID>
</TransmissionHeader>
<FuelGradeMovement>
<FGMDetail>
<FuelGradeID>001</FuelGradeID>
</FGMDetail>
</FuelGradeMovement>
</NAXML-MovementReport>`;

const FGM_MISSING_FUEL_GRADE_ID = `<?xml version="1.0" encoding="ISO-8859-1"?>
<NAXML-MovementReport version="3.4">
<TransmissionHeader>
<StoreLocationID>299</StoreLocationID>
</TransmissionHeader>
<FuelGradeMovement>
<MovementHeader>
<ReportSequenceNumber>1</ReportSequenceNumber>
<PrimaryReportPeriod>2</PrimaryReportPeriod>
<SecondaryReportPeriod>0</SecondaryReportPeriod>
<BusinessDate>2026-01-01</BusinessDate>
<BeginDate>2026-01-01</BeginDate>
<BeginTime>00:00:00</BeginTime>
<EndDate>2026-01-01</EndDate>
<EndTime>23:59:59</EndTime>
</MovementHeader>
<FGMDetail>
<FGMPositionSummary>
<FuelPositionID>1</FuelPositionID>
</FGMPositionSummary>
</FGMDetail>
</FuelGradeMovement>
</NAXML-MovementReport>`;

const FGM_INVALID_REPORT_PERIOD = `<?xml version="1.0" encoding="ISO-8859-1"?>
<NAXML-MovementReport version="3.4">
<TransmissionHeader>
<StoreLocationID>299</StoreLocationID>
</TransmissionHeader>
<FuelGradeMovement>
<MovementHeader>
<ReportSequenceNumber>1</ReportSequenceNumber>
<PrimaryReportPeriod>99</PrimaryReportPeriod>
<SecondaryReportPeriod>0</SecondaryReportPeriod>
<BusinessDate>2026-01-01</BusinessDate>
<BeginDate>2026-01-01</BeginDate>
<BeginTime>00:00:00</BeginTime>
<EndDate>2026-01-01</EndDate>
<EndTime>23:59:59</EndTime>
</MovementHeader>
<FGMDetail>
<FuelGradeID>001</FuelGradeID>
</FGMDetail>
</FuelGradeMovement>
</NAXML-MovementReport>`;

const FGM_INVALID_TENDER_CODE = `<?xml version="1.0" encoding="ISO-8859-1"?>
<NAXML-MovementReport version="3.4">
<TransmissionHeader>
<StoreLocationID>299</StoreLocationID>
</TransmissionHeader>
<FuelGradeMovement>
<MovementHeader>
<ReportSequenceNumber>1</ReportSequenceNumber>
<PrimaryReportPeriod>2</PrimaryReportPeriod>
<SecondaryReportPeriod>0</SecondaryReportPeriod>
<BusinessDate>2026-01-01</BusinessDate>
<BeginDate>2026-01-01</BeginDate>
<BeginTime>00:00:00</BeginTime>
<EndDate>2026-01-01</EndDate>
<EndTime>23:59:59</EndTime>
</MovementHeader>
<FGMDetail>
<FuelGradeID>001</FuelGradeID>
<FGMTenderSummary>
<Tender>
<TenderCode>invalidTenderType</TenderCode>
<TenderSubCode>generic</TenderSubCode>
</Tender>
<FGMSellPriceSummary>
<ActualSalesPrice>2.519</ActualSalesPrice>
<FGMServiceLevelSummary>
<ServiceLevelCode>1</ServiceLevelCode>
<FGMSalesTotals>
<FuelGradeSalesVolume>100</FuelGradeSalesVolume>
<FuelGradeSalesAmount>252</FuelGradeSalesAmount>
<DiscountAmount>0</DiscountAmount>
<DiscountCount>0</DiscountCount>
</FGMSalesTotals>
</FGMServiceLevelSummary>
</FGMSellPriceSummary>
</FGMTenderSummary>
</FGMDetail>
</FuelGradeMovement>
</NAXML-MovementReport>`;

const FGM_NEGATIVE_SALES_VOLUME = `<?xml version="1.0" encoding="ISO-8859-1"?>
<NAXML-MovementReport version="3.4">
<TransmissionHeader>
<StoreLocationID>299</StoreLocationID>
</TransmissionHeader>
<FuelGradeMovement>
<MovementHeader>
<ReportSequenceNumber>1</ReportSequenceNumber>
<PrimaryReportPeriod>2</PrimaryReportPeriod>
<SecondaryReportPeriod>0</SecondaryReportPeriod>
<BusinessDate>2026-01-01</BusinessDate>
<BeginDate>2026-01-01</BeginDate>
<BeginTime>00:00:00</BeginTime>
<EndDate>2026-01-01</EndDate>
<EndTime>23:59:59</EndTime>
</MovementHeader>
<FGMDetail>
<FuelGradeID>001</FuelGradeID>
<FGMPositionSummary>
<FuelPositionID>1</FuelPositionID>
<FGMPriceTierSummary>
<PriceTierCode>0001</PriceTierCode>
<FGMSalesTotals>
<FuelGradeSalesVolume>-100</FuelGradeSalesVolume>
<FuelGradeSalesAmount>252</FuelGradeSalesAmount>
<DiscountAmount>0</DiscountAmount>
<DiscountCount>0</DiscountCount>
</FGMSalesTotals>
</FGMPriceTierSummary>
</FGMPositionSummary>
</FGMDetail>
</FuelGradeMovement>
</NAXML-MovementReport>`;

const FGM_NEGATIVE_SALES_AMOUNT = `<?xml version="1.0" encoding="ISO-8859-1"?>
<NAXML-MovementReport version="3.4">
<TransmissionHeader>
<StoreLocationID>299</StoreLocationID>
</TransmissionHeader>
<FuelGradeMovement>
<MovementHeader>
<ReportSequenceNumber>1</ReportSequenceNumber>
<PrimaryReportPeriod>2</PrimaryReportPeriod>
<SecondaryReportPeriod>0</SecondaryReportPeriod>
<BusinessDate>2026-01-01</BusinessDate>
<BeginDate>2026-01-01</BeginDate>
<BeginTime>00:00:00</BeginTime>
<EndDate>2026-01-01</EndDate>
<EndTime>23:59:59</EndTime>
</MovementHeader>
<FGMDetail>
<FuelGradeID>001</FuelGradeID>
<FGMPositionSummary>
<FuelPositionID>1</FuelPositionID>
<FGMPriceTierSummary>
<PriceTierCode>0001</PriceTierCode>
<FGMSalesTotals>
<FuelGradeSalesVolume>100</FuelGradeSalesVolume>
<FuelGradeSalesAmount>-252</FuelGradeSalesAmount>
<DiscountAmount>0</DiscountAmount>
<DiscountCount>0</DiscountCount>
</FGMSalesTotals>
</FGMPriceTierSummary>
</FGMPositionSummary>
</FGMDetail>
</FuelGradeMovement>
</NAXML-MovementReport>`;

const FGM_MALFORMED_XML = `<?xml version="1.0" encoding="ISO-8859-1"?>
<NAXML-MovementReport version="3.4">
<TransmissionHeader>
<StoreLocationID>299</StoreLocationID>
<!-- Missing closing tag -->
<FuelGradeMovement>
</NAXML-MovementReport>`;

const NOT_FGM_DOCUMENT = `<?xml version="1.0" encoding="UTF-8"?>
<NAXML-DepartmentMaintenance version="3.4">
<MaintenanceHeader>
<StoreLocationID>001</StoreLocationID>
<MaintenanceDate>2026-01-01</MaintenanceDate>
<MaintenanceType>Full</MaintenanceType>
</MaintenanceHeader>
<Departments>
<Department>
<Code>001</Code>
<Description>Test Department</Description>
</Department>
</Departments>
</NAXML-DepartmentMaintenance>`;

// ============================================================================
// Test Suite
// ============================================================================

describe("FGM Parser - Enterprise Grade Test Suite", () => {
  let parser: NAXMLParser;

  beforeEach(() => {
    parser = createNAXMLParser();
  });

  // ==========================================================================
  // FGM-PARSE-001 through 010: Document Type Detection Tests
  // ==========================================================================

  describe("Document Type Detection (FGM-PARSE-001 to FGM-PARSE-010)", () => {
    it("FGM-PARSE-001: Should detect FuelGradeMovement document type", () => {
      const result = parser.parseFuelGradeMovement(FGM_BY_POSITION_XML);
      expect(result.documentType).toBe("FuelGradeMovement");
    });

    it("FGM-PARSE-002: Should extract version 3.4 from FGM document", () => {
      const result = parser.parseFuelGradeMovement(FGM_BY_POSITION_XML);
      expect(result.version).toBe("3.4");
    });

    it("FGM-PARSE-003: Should extract store location ID from TransmissionHeader", () => {
      const result = parser.parseFuelGradeMovement(FGM_BY_POSITION_XML);
      expect(result.storeLocationId).toBe("299");
    });

    it("FGM-PARSE-004: Should extract timestamp from MovementHeader", () => {
      const result = parser.parseFuelGradeMovement(FGM_BY_POSITION_XML);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it("FGM-PARSE-005: Should throw error for malformed XML", () => {
      expect(() => parser.parseFuelGradeMovement(FGM_MALFORMED_XML)).toThrow(
        NAXMLParserError,
      );
    });

    it("FGM-PARSE-006: Should throw for non-FGM document type", () => {
      expect(() => parser.parseFuelGradeMovement(NOT_FGM_DOCUMENT)).toThrow();
    });

    it("FGM-PARSE-007: Should parse minimal valid FGM document", () => {
      const result = parser.parseFuelGradeMovement(FGM_MINIMAL_XML);
      expect(result.documentType).toBe("FuelGradeMovement");
      expect(result.data.fgmDetails).toHaveLength(1);
    });

    it("FGM-PARSE-008: Should use convenience function parseFuelGradeMovement", () => {
      const result = parseFuelGradeMovement(FGM_BY_POSITION_XML);
      expect(result.documentType).toBe("FuelGradeMovement");
    });

    it("FGM-PARSE-009: Should parse document with all fuel grades", () => {
      const result = parser.parseFuelGradeMovement(FGM_MULTI_GRADE_XML);
      expect(result.data.fgmDetails).toHaveLength(5);

      const gradeIds = result.data.fgmDetails.map((d) => d.fuelGradeId);
      expect(gradeIds).toContain("001"); // Regular
      expect(gradeIds).toContain("002"); // Plus
      expect(gradeIds).toContain("003"); // Premium
      expect(gradeIds).toContain("021"); // Diesel
      expect(gradeIds).toContain("300"); // Kerosene
    });

    it("FGM-PARSE-010: Should handle empty string inputs gracefully", () => {
      expect(() => parser.parseFuelGradeMovement("")).toThrow(NAXMLParserError);
    });
  });

  // ==========================================================================
  // FGM-HEADER-001 through 006: Movement Header Parsing Tests
  // ==========================================================================

  describe("Movement Header Parsing (FGM-HEADER-001 to FGM-HEADER-006)", () => {
    it("FGM-HEADER-001: Should parse MovementHeader with Period 98 (shift close)", () => {
      const result = parser.parseFuelGradeMovement(FGM_BY_POSITION_XML);
      expect(result.data.movementHeader.primaryReportPeriod).toBe(98);
    });

    it("FGM-HEADER-002: Should parse MovementHeader with Period 2 (day close)", () => {
      const result = parser.parseFuelGradeMovement(FGM_BY_TENDER_XML);
      expect(result.data.movementHeader.primaryReportPeriod).toBe(2);
    });

    it("FGM-HEADER-003: Should parse all MovementHeader fields correctly", () => {
      const result = parser.parseFuelGradeMovement(FGM_BY_POSITION_XML);
      const header = result.data.movementHeader;

      expect(header.reportSequenceNumber).toBe(1);
      expect(header.primaryReportPeriod).toBe(98);
      expect(header.secondaryReportPeriod).toBe(0);
      expect(header.businessDate).toBe("2025-12-31");
      expect(header.beginDate).toBe("2025-12-31");
      expect(header.beginTime).toBe("23:59:30");
      expect(header.endDate).toBe("2026-01-01");
      expect(header.endTime).toBe("23:59:36");
    });

    it("FGM-HEADER-004: Should parse SalesMovementHeader for shift reports", () => {
      const result = parser.parseFuelGradeMovement(FGM_BY_POSITION_XML);
      expect(result.data.salesMovementHeader).toBeDefined();
      expect(result.data.salesMovementHeader?.registerId).toBe("1");
      expect(result.data.salesMovementHeader?.cashierId).toBe("1");
      expect(result.data.salesMovementHeader?.tillId).toBe("4131");
    });

    it("FGM-HEADER-005: Should not have SalesMovementHeader for day close reports", () => {
      const result = parser.parseFuelGradeMovement(FGM_BY_TENDER_XML);
      expect(result.data.salesMovementHeader).toBeUndefined();
    });

    it("FGM-HEADER-006: Should throw error for missing MovementHeader", () => {
      expect(() =>
        parser.parseFuelGradeMovement(FGM_MISSING_MOVEMENT_HEADER),
      ).toThrow(NAXMLParserError);
    });
  });

  // ==========================================================================
  // FGM-DETAIL-001 through 008: FGMDetail Parsing Tests
  // ==========================================================================

  describe("FGMDetail Parsing (FGM-DETAIL-001 to FGM-DETAIL-008)", () => {
    it("FGM-DETAIL-001: Should parse FuelGradeID correctly", () => {
      const result = parser.parseFuelGradeMovement(FGM_BY_POSITION_XML);
      expect(result.data.fgmDetails[0].fuelGradeId).toBe("001");
    });

    it("FGM-DETAIL-002: Should parse multiple FGMDetail elements", () => {
      const result = parser.parseFuelGradeMovement(FGM_BY_POSITION_XML);
      expect(result.data.fgmDetails.length).toBeGreaterThan(1);
    });

    it("FGM-DETAIL-003: Should throw error for missing FuelGradeID", () => {
      expect(() =>
        parser.parseFuelGradeMovement(FGM_MISSING_FUEL_GRADE_ID),
      ).toThrow(NAXMLParserError);
    });

    it("FGM-DETAIL-004: Should parse FGMDetail with position summary variant", () => {
      const result = parser.parseFuelGradeMovement(FGM_BY_POSITION_XML);
      expect(result.data.fgmDetails[0].fgmPositionSummary).toBeDefined();
    });

    it("FGM-DETAIL-005: Should parse FGMDetail with tender summary variant", () => {
      const result = parser.parseFuelGradeMovement(FGM_BY_TENDER_XML);
      expect(result.data.fgmDetails[0].fgmTenderSummary).toBeDefined();
    });

    it("FGM-DETAIL-006: Should preserve fuel grade ID leading zeros", () => {
      const result = parser.parseFuelGradeMovement(FGM_BY_POSITION_XML);
      // FuelGradeID "001" should not become "1"
      expect(result.data.fgmDetails[0].fuelGradeId).toBe("001");
    });

    it("FGM-DETAIL-007: Should handle FGMDetail with empty arrays", () => {
      const result = parser.parseFuelGradeMovement(FGM_MINIMAL_XML);
      expect(result.data.fgmDetails).toBeDefined();
      expect(Array.isArray(result.data.fgmDetails)).toBe(true);
    });

    it("FGM-DETAIL-008: Should parse diesel grade (021)", () => {
      const result = parser.parseFuelGradeMovement(FGM_MULTI_GRADE_XML);
      const dieselDetail = result.data.fgmDetails.find(
        (d) => d.fuelGradeId === "021",
      );
      expect(dieselDetail).toBeDefined();
    });
  });

  // ==========================================================================
  // FGM-POS-001 through 005: Position Summary Tests
  // ==========================================================================

  describe("Position Summary Parsing (FGM-POS-001 to FGM-POS-005)", () => {
    it("FGM-POS-001: Should parse FuelPositionID", () => {
      const result = parser.parseFuelGradeMovement(FGM_BY_POSITION_XML);
      const posSummary = result.data.fgmDetails[0].fgmPositionSummary;
      expect(posSummary?.fuelPositionId).toBe("1");
    });

    it("FGM-POS-002: Should parse multiple price tier summaries", () => {
      const result = parser.parseFuelGradeMovement(FGM_BY_POSITION_XML);
      const posSummary = result.data.fgmDetails[0].fgmPositionSummary;
      expect(posSummary?.fgmPriceTierSummaries.length).toBeGreaterThanOrEqual(
        1,
      );
    });

    it("FGM-POS-003: Should parse price tier code correctly", () => {
      const result = parser.parseFuelGradeMovement(FGM_BY_POSITION_XML);
      const posSummary = result.data.fgmDetails[0].fgmPositionSummary;
      const tierCode = posSummary?.fgmPriceTierSummaries[0].priceTierCode;
      expect(["0001", "0002"]).toContain(tierCode);
    });

    it("FGM-POS-004: Should parse non-resettable totals when present", () => {
      const result = parser.parseFuelGradeMovement(FGM_WITH_NRT_XML);
      const posSummary = result.data.fgmDetails[0].fgmPositionSummary;
      expect(posSummary?.fgmNonResettableTotal).toBeDefined();
      expect(
        posSummary?.fgmNonResettableTotal?.fuelGradeNonResettableTotalVolume,
      ).toBe(228745.691);
    });

    it("FGM-POS-005: Should handle missing non-resettable totals", () => {
      const result = parser.parseFuelGradeMovement(FGM_BY_POSITION_XML);
      const posSummary = result.data.fgmDetails[0].fgmPositionSummary;
      // Non-resettable totals are optional
      expect(posSummary?.fgmNonResettableTotal).toBeUndefined();
    });
  });

  // ==========================================================================
  // FGM-TENDER-001 through 005: Tender Summary Tests
  // ==========================================================================

  describe("Tender Summary Parsing (FGM-TENDER-001 to FGM-TENDER-005)", () => {
    it("FGM-TENDER-001: Should parse cash tender code", () => {
      const result = parser.parseFuelGradeMovement(FGM_BY_TENDER_XML);
      const tenderSummary = result.data.fgmDetails[0].fgmTenderSummary;
      expect(tenderSummary?.tender.tenderCode).toBe("cash");
    });

    it("FGM-TENDER-002: Should parse outsideCredit tender code", () => {
      const result = parser.parseFuelGradeMovement(FGM_BY_TENDER_XML);
      const creditDetail = result.data.fgmDetails.find(
        (d) => d.fgmTenderSummary?.tender.tenderCode === "outsideCredit",
      );
      expect(creditDetail).toBeDefined();
    });

    it("FGM-TENDER-003: Should throw error for invalid tender code", () => {
      expect(() =>
        parser.parseFuelGradeMovement(FGM_INVALID_TENDER_CODE),
      ).toThrow(NAXMLParserError);
    });

    it("FGM-TENDER-004: Should parse actual sales price", () => {
      const result = parser.parseFuelGradeMovement(FGM_BY_TENDER_XML);
      const tenderSummary = result.data.fgmDetails[0].fgmTenderSummary;
      expect(
        tenderSummary?.fgmSellPriceSummary.actualSalesPrice,
      ).toBeGreaterThan(0);
    });

    it("FGM-TENDER-005: Should parse service level code", () => {
      const result = parser.parseFuelGradeMovement(FGM_BY_TENDER_XML);
      const tenderSummary = result.data.fgmDetails[0].fgmTenderSummary;
      expect(
        tenderSummary?.fgmSellPriceSummary.fgmServiceLevelSummary
          .serviceLevelCode,
      ).toBe("1");
    });
  });

  // ==========================================================================
  // FGM-SALES-001 through 005: Sales Totals Tests
  // ==========================================================================

  describe("Sales Totals Parsing (FGM-SALES-001 to FGM-SALES-005)", () => {
    it("FGM-SALES-001: Should parse fuel grade sales volume", () => {
      const result = parser.parseFuelGradeMovement(FGM_BY_POSITION_XML);
      const posSummary = result.data.fgmDetails[0].fgmPositionSummary;
      const salesTotals = posSummary?.fgmPriceTierSummaries[0].fgmSalesTotals;
      expect(salesTotals?.fuelGradeSalesVolume).toBe(86.838);
    });

    it("FGM-SALES-002: Should parse fuel grade sales amount", () => {
      const result = parser.parseFuelGradeMovement(FGM_BY_POSITION_XML);
      const posSummary = result.data.fgmDetails[0].fgmPositionSummary;
      const salesTotals = posSummary?.fgmPriceTierSummaries[0].fgmSalesTotals;
      expect(salesTotals?.fuelGradeSalesAmount).toBe(218.74);
    });

    it("FGM-SALES-003: Should parse discount information", () => {
      const result = parser.parseFuelGradeMovement(FGM_BY_POSITION_XML);
      const posSummary = result.data.fgmDetails[0].fgmPositionSummary;
      // Second price tier has discounts
      const salesTotals = posSummary?.fgmPriceTierSummaries[1]?.fgmSalesTotals;
      expect(salesTotals?.discountAmount).toBe(2.5);
      expect(salesTotals?.discountCount).toBe(1);
    });

    it("FGM-SALES-004: Should parse pump test totals", () => {
      const result = parser.parseFuelGradeMovement(FGM_BY_POSITION_XML);
      const posSummary = result.data.fgmDetails[0].fgmPositionSummary;
      const salesTotals = posSummary?.fgmPriceTierSummaries[0].fgmSalesTotals;
      expect(salesTotals?.pumpTestTotals).toBeDefined();
      expect(salesTotals?.pumpTestTotals?.pumpTestVolume).toBe(0);
    });

    it("FGM-SALES-005: Should parse tax exempt sales volume", () => {
      const result = parser.parseFuelGradeMovement(FGM_BY_POSITION_XML);
      // Find detail with tax exempt sales
      const detail = result.data.fgmDetails[1];
      const posSummary = detail?.fgmPositionSummary;
      const salesTotals = posSummary?.fgmPriceTierSummaries[0].fgmSalesTotals;
      expect(salesTotals?.taxExemptSalesVolume).toBe(5.5);
    });
  });

  // ==========================================================================
  // FGM-SEC-001 through 005: Security & Validation Tests
  // ==========================================================================

  describe("Security & Validation (FGM-SEC-001 to FGM-SEC-005)", () => {
    it("FGM-SEC-001: Should reject negative sales volume", () => {
      expect(() =>
        parser.parseFuelGradeMovement(FGM_NEGATIVE_SALES_VOLUME),
      ).toThrow(NAXMLParserError);
    });

    it("FGM-SEC-002: Should reject negative sales amount", () => {
      expect(() =>
        parser.parseFuelGradeMovement(FGM_NEGATIVE_SALES_AMOUNT),
      ).toThrow(NAXMLParserError);
    });

    it("FGM-SEC-003: Should reject invalid PrimaryReportPeriod", () => {
      expect(() =>
        parser.parseFuelGradeMovement(FGM_INVALID_REPORT_PERIOD),
      ).toThrow(NAXMLParserError);
    });

    it("FGM-SEC-004: Should validate error code for invalid tender", () => {
      try {
        parser.parseFuelGradeMovement(FGM_INVALID_TENDER_CODE);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(NAXMLParserError);
        expect((error as NAXMLParserError).code).toBe(
          NAXML_PARSER_ERROR_CODES.FGM_INVALID_TENDER_CODE,
        );
      }
    });

    it("FGM-SEC-005: Should include error details in NAXMLParserError", () => {
      try {
        parser.parseFuelGradeMovement(FGM_INVALID_TENDER_CODE);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(NAXMLParserError);
        expect((error as NAXMLParserError).details).toBeDefined();
      }
    });
  });

  // ==========================================================================
  // Production File Validation Tests
  // ==========================================================================

  describe("Production File Validation", () => {
    const PRODUCTION_FILE_PATH =
      "my-files/GILBARCO/BOOutBox/Error/FGM3402601020002001834996.xml";

    it("Should parse production FGM file if available", () => {
      const fullPath = path.resolve(process.cwd(), "..", PRODUCTION_FILE_PATH);

      // Skip if file doesn't exist (CI environment)
      if (!fs.existsSync(fullPath)) {
        console.log(`Skipping: Production file not found at ${fullPath}`);
        return;
      }

      const xml = fs.readFileSync(fullPath, "utf-8");
      const result = parser.parseFuelGradeMovement(xml);

      // Basic assertions
      expect(result.documentType).toBe("FuelGradeMovement");
      expect(result.data.movementHeader).toBeDefined();
      expect(result.data.fgmDetails.length).toBeGreaterThan(0);
    });
  });
});
