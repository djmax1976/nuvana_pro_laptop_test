/**
 * NAXML MSM (Miscellaneous Summary Movement) Parser Unit Tests
 *
 * Enterprise-grade test suite for the MSM parser implementation.
 * Tests validate parsing of MSM XML documents including:
 * - Shift-level reports (Period 98) with SalesMovementHeader
 * - Day-level reports (Period 2) without SalesMovementHeader
 * - Various summary code types (drawer ops, statistics, totals, fuel sales)
 * - Outside terminal summaries at root level
 *
 * Test Coverage Matrix (20 tests per Phase 3 requirements):
 * - 3.T1 through 3.T4: Document Type Detection Tests
 * - 3.T5 through 3.T8: Movement Header Parsing Tests
 * - 3.T9 through 3.T12: MSMDetail Parsing Tests
 * - 3.T13 through 3.T16: Summary Codes Parsing Tests
 * - 3.T17 through 3.T20: Security & Validation Tests
 *
 * Traceability:
 * - XML.md Phase 3 Requirements
 * - NAXML 3.4 Specification
 * - Gilbarco Passport MSM File Format
 *
 * @module tests/unit/pos-integration/msm-parser.unit.spec
 * @security SEC-014 Input validation, allowlist enforcement
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

import {
  NAXMLParser,
  createNAXMLParser,
  parseMiscellaneousSummaryMovement,
  NAXMLParserError,
  NAXML_PARSER_ERROR_CODES,
} from "../../../backend/src/services/naxml/naxml.parser";

import type {
  NAXMLMiscellaneousSummaryMovementData,
  NAXMLDocument,
} from "../../../backend/src/types/naxml.types";

// ============================================================================
// Test Fixtures - Real Production XML Structures
// ============================================================================

/**
 * MSM Shift Report variant XML (Period 98)
 * Based on real Gilbarco Passport MSM file structure
 */
const MSM_SHIFT_REPORT_XML = `<?xml version="1.0" encoding="ISO-8859-1"?>
<NAXML-MovementReport version="3.4">
<TransmissionHeader>
<StoreLocationID>299</StoreLocationID>
<VendorName>Gilbarco-VeederRoot</VendorName>
<VendorModelVersion>22.01.26.01</VendorModelVersion>
</TransmissionHeader>
<MiscellaneousSummaryMovement>
<MovementHeader>
<ReportSequenceNumber>1</ReportSequenceNumber>
<PrimaryReportPeriod>98</PrimaryReportPeriod>
<SecondaryReportPeriod>0</SecondaryReportPeriod>
<BusinessDate>2026-01-03</BusinessDate>
<BeginDate>2026-01-03</BeginDate>
<BeginTime>23:59:53</BeginTime>
<EndDate>2026-01-04</EndDate>
<EndTime>23:59:26</EndTime>
</MovementHeader>
<SalesMovementHeader>
<RegisterID>1</RegisterID>
<CashierID>1</CashierID>
<TillID>4134</TillID>
</SalesMovementHeader>
<MSMDetail>
<MiscellaneousSummaryCodes>
<MiscellaneousSummaryCode>safeDrop</MiscellaneousSummaryCode>
<MiscellaneousSummarySubCode>total</MiscellaneousSummarySubCode>
</MiscellaneousSummaryCodes>
<MSMSalesTotals>
<Tender>
<TenderCode/>
<TenderSubCode/>
</Tender>
<MiscellaneousSummaryAmount>0</MiscellaneousSummaryAmount>
<MiscellaneousSummaryCount>0</MiscellaneousSummaryCount>
</MSMSalesTotals>
</MSMDetail>
<MSMDetail>
<MiscellaneousSummaryCodes>
<MiscellaneousSummaryCode>safeLoan</MiscellaneousSummaryCode>
<MiscellaneousSummarySubCode>loan</MiscellaneousSummarySubCode>
</MiscellaneousSummaryCodes>
<MSMSalesTotals>
<Tender>
<TenderCode>cash</TenderCode>
<TenderSubCode>generic</TenderSubCode>
</Tender>
<MiscellaneousSummaryAmount>200</MiscellaneousSummaryAmount>
<MiscellaneousSummaryCount>1</MiscellaneousSummaryCount>
</MSMSalesTotals>
</MSMDetail>
<MSMDetail>
<MiscellaneousSummaryCodes>
<MiscellaneousSummaryCode>statistics</MiscellaneousSummaryCode>
<MiscellaneousSummarySubCode>transactions</MiscellaneousSummarySubCode>
</MiscellaneousSummaryCodes>
<MSMSalesTotals>
<Tender>
<TenderCode/>
<TenderSubCode/>
</Tender>
<MiscellaneousSummaryAmount>0</MiscellaneousSummaryAmount>
<MiscellaneousSummaryCount>44</MiscellaneousSummaryCount>
</MSMSalesTotals>
</MSMDetail>
<MSMDetail>
<MiscellaneousSummaryCodes>
<MiscellaneousSummaryCode>statistics</MiscellaneousSummaryCode>
<MiscellaneousSummarySubCode>overShort</MiscellaneousSummarySubCode>
</MiscellaneousSummaryCodes>
<MSMSalesTotals>
<Tender>
<TenderCode/>
<TenderSubCode/>
</Tender>
<MiscellaneousSummaryAmount>957.14</MiscellaneousSummaryAmount>
<MiscellaneousSummaryCount>0</MiscellaneousSummaryCount>
</MSMSalesTotals>
</MSMDetail>
<MSMDetail>
<MiscellaneousSummaryCodes>
<MiscellaneousSummaryCode>totalizer</MiscellaneousSummaryCode>
<MiscellaneousSummarySubCode>sales</MiscellaneousSummarySubCode>
<MiscellaneousSummarySubCodeModifier>sales</MiscellaneousSummarySubCodeModifier>
</MiscellaneousSummaryCodes>
<MSMSalesTotals>
<Tender>
<TenderCode/>
<TenderSubCode/>
</Tender>
<MiscellaneousSummaryAmount>757.14</MiscellaneousSummaryAmount>
<MiscellaneousSummaryCount>44</MiscellaneousSummaryCount>
</MSMSalesTotals>
</MSMDetail>
<MSMDetail>
<MiscellaneousSummaryCodes>
<MiscellaneousSummaryCode>fuelSalesByGrade</MiscellaneousSummaryCode>
<MiscellaneousSummarySubCode>fuel</MiscellaneousSummarySubCode>
<MiscellaneousSummarySubCodeModifier>001</MiscellaneousSummarySubCodeModifier>
</MiscellaneousSummaryCodes>
<MSMSalesTotals>
<Tender>
<TenderCode/>
<TenderSubCode/>
</Tender>
<MiscellaneousSummaryAmount>383.08</MiscellaneousSummaryAmount>
<MiscellaneousSummaryCount>152.079</MiscellaneousSummaryCount>
</MSMSalesTotals>
</MSMDetail>
<MSMDetail>
<MiscellaneousSummaryCodes>
<MiscellaneousSummaryCode>fuelSalesByGrade</MiscellaneousSummaryCode>
<MiscellaneousSummarySubCode>fuel</MiscellaneousSummarySubCode>
<MiscellaneousSummarySubCodeModifier>002</MiscellaneousSummarySubCodeModifier>
</MiscellaneousSummaryCodes>
<MSMSalesTotals>
<Tender>
<TenderCode/>
<TenderSubCode/>
</Tender>
<MiscellaneousSummaryAmount>60</MiscellaneousSummaryAmount>
<MiscellaneousSummaryCount>19.236</MiscellaneousSummaryCount>
</MSMSalesTotals>
</MSMDetail>
<MSMDetail>
<MiscellaneousSummaryCodes>
<MiscellaneousSummaryCode>taxTotals</MiscellaneousSummaryCode>
<MiscellaneousSummarySubCode>taxableSalesByTaxCode</MiscellaneousSummarySubCode>
<MiscellaneousSummarySubCodeModifier>99</MiscellaneousSummarySubCodeModifier>
</MiscellaneousSummaryCodes>
<MSMSalesTotals>
<Tender>
<TenderCode/>
<TenderSubCode/>
</Tender>
<MiscellaneousSummaryAmount>757.14</MiscellaneousSummaryAmount>
<MiscellaneousSummaryCount>0</MiscellaneousSummaryCount>
</MSMSalesTotals>
</MSMDetail>
<MSMDetail>
<MiscellaneousSummaryCodes>
<MiscellaneousSummaryCode>openingBalance</MiscellaneousSummaryCode>
</MiscellaneousSummaryCodes>
<MSMSalesTotals>
<Tender>
<TenderCode/>
<TenderSubCode/>
</Tender>
<MiscellaneousSummaryAmount>200</MiscellaneousSummaryAmount>
<MiscellaneousSummaryCount>0</MiscellaneousSummaryCount>
</MSMSalesTotals>
</MSMDetail>
<MSMDetail>
<MiscellaneousSummaryCodes>
<MiscellaneousSummaryCode>closingBalance</MiscellaneousSummaryCode>
</MiscellaneousSummaryCodes>
<MSMSalesTotals>
<Tender>
<TenderCode/>
<TenderSubCode/>
</Tender>
<MiscellaneousSummaryAmount>957.14</MiscellaneousSummaryAmount>
<MiscellaneousSummaryCount>0</MiscellaneousSummaryCount>
</MSMSalesTotals>
</MSMDetail>
</MiscellaneousSummaryMovement>
<MSMDetail>
<MiscellaneousSummaryCodes>
<MiscellaneousSummaryCode/>
</MiscellaneousSummaryCodes>
<REGISTERID>10002</REGISTERID>
<CASHIERID>20000</CASHIERID>
<TILLID>10002</TILLID>
<MSMSalesTotals>
<Tender>
<TenderCode>outsideCredit</TenderCode>
<TenderSubCode>generic</TenderSubCode>
</Tender>
<MiscellaneousSummaryAmount>161.02</MiscellaneousSummaryAmount>
<MiscellaneousSummaryCount>5</MiscellaneousSummaryCount>
</MSMSalesTotals>
</MSMDetail>
<MSMDetail>
<MiscellaneousSummaryCodes>
<MiscellaneousSummaryCode/>
</MiscellaneousSummaryCodes>
<REGISTERID>10003</REGISTERID>
<CASHIERID>20000</CASHIERID>
<TILLID>10003</TILLID>
<MSMSalesTotals>
<Tender>
<TenderCode>outsideCredit</TenderCode>
<TenderSubCode>generic</TenderSubCode>
</Tender>
<MiscellaneousSummaryAmount>161.45</MiscellaneousSummaryAmount>
<MiscellaneousSummaryCount>6</MiscellaneousSummaryCount>
</MSMSalesTotals>
</MSMDetail>
</NAXML-MovementReport>`;

/**
 * MSM Day Report variant XML (Period 2) - No SalesMovementHeader
 */
const MSM_DAY_REPORT_XML = `<?xml version="1.0" encoding="ISO-8859-1"?>
<NAXML-MovementReport version="3.4">
<TransmissionHeader>
<StoreLocationID>299</StoreLocationID>
<VendorName>Gilbarco-VeederRoot</VendorName>
<VendorModelVersion>22.01.26.01</VendorModelVersion>
</TransmissionHeader>
<MiscellaneousSummaryMovement>
<MovementHeader>
<ReportSequenceNumber>1</ReportSequenceNumber>
<PrimaryReportPeriod>2</PrimaryReportPeriod>
<SecondaryReportPeriod>0</SecondaryReportPeriod>
<BusinessDate>2026-01-03</BusinessDate>
<BeginDate>2026-01-03</BeginDate>
<BeginTime>06:00:00</BeginTime>
<EndDate>2026-01-04</EndDate>
<EndTime>05:59:59</EndTime>
</MovementHeader>
<MSMDetail>
<MiscellaneousSummaryCodes>
<MiscellaneousSummaryCode>sales</MiscellaneousSummaryCode>
<MiscellaneousSummarySubCode>total</MiscellaneousSummarySubCode>
</MiscellaneousSummaryCodes>
<MSMSalesTotals>
<Tender>
<TenderCode/>
<TenderSubCode/>
</Tender>
<MiscellaneousSummaryAmount>2500.50</MiscellaneousSummaryAmount>
<MiscellaneousSummaryCount>120</MiscellaneousSummaryCount>
</MSMSalesTotals>
</MSMDetail>
</MiscellaneousSummaryMovement>
</NAXML-MovementReport>`;

/**
 * Minimal valid MSM XML for basic parsing tests
 */
const MSM_MINIMAL_XML = `<?xml version="1.0" encoding="ISO-8859-1"?>
<NAXML-MovementReport version="3.4">
<TransmissionHeader>
<StoreLocationID>100</StoreLocationID>
<VendorName>Test</VendorName>
<VendorModelVersion>1.0</VendorModelVersion>
</TransmissionHeader>
<MiscellaneousSummaryMovement>
<MovementHeader>
<ReportSequenceNumber>1</ReportSequenceNumber>
<PrimaryReportPeriod>98</PrimaryReportPeriod>
<SecondaryReportPeriod>0</SecondaryReportPeriod>
<BusinessDate>2026-01-01</BusinessDate>
<BeginDate>2026-01-01</BeginDate>
<BeginTime>00:00:00</BeginTime>
<EndDate>2026-01-01</EndDate>
<EndTime>23:59:59</EndTime>
</MovementHeader>
<MSMDetail>
<MiscellaneousSummaryCodes>
<MiscellaneousSummaryCode>test</MiscellaneousSummaryCode>
</MiscellaneousSummaryCodes>
<MSMSalesTotals>
<MiscellaneousSummaryAmount>100</MiscellaneousSummaryAmount>
<MiscellaneousSummaryCount>5</MiscellaneousSummaryCount>
</MSMSalesTotals>
</MSMDetail>
</MiscellaneousSummaryMovement>
</NAXML-MovementReport>`;

/**
 * Invalid MSM XML - Missing MovementHeader
 */
const MSM_MISSING_HEADER_XML = `<?xml version="1.0" encoding="ISO-8859-1"?>
<NAXML-MovementReport version="3.4">
<TransmissionHeader>
<StoreLocationID>100</StoreLocationID>
<VendorName>Test</VendorName>
<VendorModelVersion>1.0</VendorModelVersion>
</TransmissionHeader>
<MiscellaneousSummaryMovement>
<MSMDetail>
<MiscellaneousSummaryCodes>
<MiscellaneousSummaryCode>test</MiscellaneousSummaryCode>
</MiscellaneousSummaryCodes>
<MSMSalesTotals>
<MiscellaneousSummaryAmount>100</MiscellaneousSummaryAmount>
<MiscellaneousSummaryCount>5</MiscellaneousSummaryCount>
</MSMSalesTotals>
</MSMDetail>
</MiscellaneousSummaryMovement>
</NAXML-MovementReport>`;

/**
 * Invalid MSM XML - Invalid tender code
 */
const MSM_INVALID_TENDER_XML = `<?xml version="1.0" encoding="ISO-8859-1"?>
<NAXML-MovementReport version="3.4">
<TransmissionHeader>
<StoreLocationID>100</StoreLocationID>
<VendorName>Test</VendorName>
<VendorModelVersion>1.0</VendorModelVersion>
</TransmissionHeader>
<MiscellaneousSummaryMovement>
<MovementHeader>
<ReportSequenceNumber>1</ReportSequenceNumber>
<PrimaryReportPeriod>98</PrimaryReportPeriod>
<SecondaryReportPeriod>0</SecondaryReportPeriod>
<BusinessDate>2026-01-01</BusinessDate>
<BeginDate>2026-01-01</BeginDate>
<BeginTime>00:00:00</BeginTime>
<EndDate>2026-01-01</EndDate>
<EndTime>23:59:59</EndTime>
</MovementHeader>
<MSMDetail>
<MiscellaneousSummaryCodes>
<MiscellaneousSummaryCode>test</MiscellaneousSummaryCode>
</MiscellaneousSummaryCodes>
<MSMSalesTotals>
<Tender>
<TenderCode>invalidTenderCode</TenderCode>
<TenderSubCode>generic</TenderSubCode>
</Tender>
<MiscellaneousSummaryAmount>100</MiscellaneousSummaryAmount>
<MiscellaneousSummaryCount>5</MiscellaneousSummaryCount>
</MSMSalesTotals>
</MSMDetail>
</MiscellaneousSummaryMovement>
</NAXML-MovementReport>`;

/**
 * Invalid MSM XML - Invalid report period
 */
const MSM_INVALID_PERIOD_XML = `<?xml version="1.0" encoding="ISO-8859-1"?>
<NAXML-MovementReport version="3.4">
<TransmissionHeader>
<StoreLocationID>100</StoreLocationID>
<VendorName>Test</VendorName>
<VendorModelVersion>1.0</VendorModelVersion>
</TransmissionHeader>
<MiscellaneousSummaryMovement>
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
<MSMDetail>
<MiscellaneousSummaryCodes>
<MiscellaneousSummaryCode>test</MiscellaneousSummaryCode>
</MiscellaneousSummaryCodes>
<MSMSalesTotals>
<MiscellaneousSummaryAmount>100</MiscellaneousSummaryAmount>
<MiscellaneousSummaryCount>5</MiscellaneousSummaryCount>
</MSMSalesTotals>
</MSMDetail>
</MiscellaneousSummaryMovement>
</NAXML-MovementReport>`;

// ============================================================================
// Test Suite: MSM Parser
// ============================================================================

describe("MSM Parser - Phase 3 Implementation", () => {
  let parser: NAXMLParser;

  beforeEach(() => {
    parser = createNAXMLParser();
  });

  // ==========================================================================
  // 3.T1 - 3.T4: Document Type Detection Tests
  // ==========================================================================

  describe("Document Type Detection (3.T1-3.T4)", () => {
    it("3.T1: should detect MiscellaneousSummaryMovement document type", () => {
      const result = parser.parse(MSM_MINIMAL_XML);
      expect(result.documentType).toBe("MiscellaneousSummaryMovement");
    });

    it("3.T2: should extract version from MSM document", () => {
      const result = parser.parse(MSM_SHIFT_REPORT_XML);
      expect(result.version).toBe("3.4");
    });

    it("3.T3: should extract store location ID from TransmissionHeader", () => {
      const result = parser.parse(MSM_SHIFT_REPORT_XML);
      expect(result.storeLocationId).toBe("299");
    });

    it("3.T4: should validate MSM document with convenience function", () => {
      const result = parseMiscellaneousSummaryMovement(MSM_SHIFT_REPORT_XML);
      expect(result.documentType).toBe("MiscellaneousSummaryMovement");
      expect(result.data).toBeDefined();
      expect(result.data.movementHeader).toBeDefined();
    });
  });

  // ==========================================================================
  // 3.T5 - 3.T8: Movement Header Parsing Tests
  // ==========================================================================

  describe("Movement Header Parsing (3.T5-3.T8)", () => {
    it("3.T5: should parse MovementHeader for shift report (Period 98)", () => {
      const result = parseMiscellaneousSummaryMovement(MSM_SHIFT_REPORT_XML);
      const header = result.data.movementHeader;

      expect(header.reportSequenceNumber).toBe(1);
      expect(header.primaryReportPeriod).toBe(98);
      expect(header.secondaryReportPeriod).toBe(0);
      expect(header.businessDate).toBe("2026-01-03");
    });

    it("3.T6: should parse MovementHeader for day report (Period 2)", () => {
      const result = parseMiscellaneousSummaryMovement(MSM_DAY_REPORT_XML);
      const header = result.data.movementHeader;

      expect(header.primaryReportPeriod).toBe(2);
      expect(header.businessDate).toBe("2026-01-03");
      expect(header.beginTime).toBe("06:00:00");
      expect(header.endTime).toBe("05:59:59");
    });

    it("3.T7: should parse SalesMovementHeader when present", () => {
      const result = parseMiscellaneousSummaryMovement(MSM_SHIFT_REPORT_XML);
      const salesHeader = result.data.salesMovementHeader;

      expect(salesHeader).toBeDefined();
      expect(salesHeader!.registerId).toBe("1");
      expect(salesHeader!.cashierId).toBe("1");
      expect(salesHeader!.tillId).toBe("4134");
    });

    it("3.T8: should handle missing SalesMovementHeader in day reports", () => {
      const result = parseMiscellaneousSummaryMovement(MSM_DAY_REPORT_XML);
      expect(result.data.salesMovementHeader).toBeUndefined();
    });
  });

  // ==========================================================================
  // 3.T9 - 3.T12: MSMDetail Parsing Tests
  // ==========================================================================

  describe("MSMDetail Parsing (3.T9-3.T12)", () => {
    it("3.T9: should parse MSMDetail array inside container", () => {
      const result = parseMiscellaneousSummaryMovement(MSM_SHIFT_REPORT_XML);
      expect(result.data.msmDetails.length).toBeGreaterThan(0);

      // Find the safeLoan detail with cash tender
      const safeLoanDetail = result.data.msmDetails.find(
        (d) =>
          d.miscellaneousSummaryCodes.miscellaneousSummaryCode === "safeLoan" &&
          d.msmSalesTotals.tender?.tenderCode === "cash",
      );

      expect(safeLoanDetail).toBeDefined();
      expect(safeLoanDetail!.msmSalesTotals.miscellaneousSummaryAmount).toBe(
        200,
      );
      expect(safeLoanDetail!.msmSalesTotals.miscellaneousSummaryCount).toBe(1);
    });

    it("3.T10: should parse MSMDetail elements at root level (outside terminal summaries)", () => {
      const result = parseMiscellaneousSummaryMovement(MSM_SHIFT_REPORT_XML);

      // Find outside terminal summary with RegisterID 10002
      const outsideDetail = result.data.msmDetails.find(
        (d) => d.registerId === "10002",
      );

      expect(outsideDetail).toBeDefined();
      expect(outsideDetail!.tillId).toBe("10002");
      expect(outsideDetail!.cashierId).toBe("20000");
      expect(outsideDetail!.msmSalesTotals.tender?.tenderCode).toBe(
        "outsideCredit",
      );
      expect(outsideDetail!.msmSalesTotals.miscellaneousSummaryAmount).toBe(
        161.02,
      );
    });

    it("3.T11: should parse fuel sales by grade with volume in count field", () => {
      const result = parseMiscellaneousSummaryMovement(MSM_SHIFT_REPORT_XML);

      // Find fuel sales by grade for grade 001
      const fuelSales = result.data.msmDetails.find(
        (d) =>
          d.miscellaneousSummaryCodes.miscellaneousSummaryCode ===
            "fuelSalesByGrade" &&
          d.miscellaneousSummaryCodes.miscellaneousSummarySubCode === "fuel" &&
          d.miscellaneousSummaryCodes.miscellaneousSummarySubCodeModifier ===
            "001",
      );

      expect(fuelSales).toBeDefined();
      expect(fuelSales!.msmSalesTotals.miscellaneousSummaryAmount).toBe(383.08);
      // Count field contains volume in gallons for fuel sales
      expect(fuelSales!.msmSalesTotals.miscellaneousSummaryCount).toBe(152.079);
    });

    it("3.T12: should parse statistics details with transaction count", () => {
      const result = parseMiscellaneousSummaryMovement(MSM_SHIFT_REPORT_XML);

      // Find statistics/transactions detail
      const txnStats = result.data.msmDetails.find(
        (d) =>
          d.miscellaneousSummaryCodes.miscellaneousSummaryCode ===
            "statistics" &&
          d.miscellaneousSummaryCodes.miscellaneousSummarySubCode ===
            "transactions",
      );

      expect(txnStats).toBeDefined();
      expect(txnStats!.msmSalesTotals.miscellaneousSummaryCount).toBe(44);
    });
  });

  // ==========================================================================
  // 3.T13 - 3.T16: Summary Codes Parsing Tests
  // ==========================================================================

  describe("Summary Codes Parsing (3.T13-3.T16)", () => {
    it("3.T13: should parse summary codes with code and subCode", () => {
      const result = parseMiscellaneousSummaryMovement(MSM_SHIFT_REPORT_XML);

      const safeDropDetail = result.data.msmDetails.find(
        (d) =>
          d.miscellaneousSummaryCodes.miscellaneousSummaryCode === "safeDrop",
      );

      expect(safeDropDetail).toBeDefined();
      expect(
        safeDropDetail!.miscellaneousSummaryCodes.miscellaneousSummaryCode,
      ).toBe("safeDrop");
      expect(
        safeDropDetail!.miscellaneousSummaryCodes.miscellaneousSummarySubCode,
      ).toBe("total");
    });

    it("3.T14: should parse summary codes with modifier (fuel grade ID)", () => {
      const result = parseMiscellaneousSummaryMovement(MSM_SHIFT_REPORT_XML);

      const fuelSales002 = result.data.msmDetails.find(
        (d) =>
          d.miscellaneousSummaryCodes.miscellaneousSummaryCode ===
            "fuelSalesByGrade" &&
          d.miscellaneousSummaryCodes.miscellaneousSummarySubCodeModifier ===
            "002",
      );

      expect(fuelSales002).toBeDefined();
      expect(
        fuelSales002!.miscellaneousSummaryCodes
          .miscellaneousSummarySubCodeModifier,
      ).toBe("002");
      expect(fuelSales002!.msmSalesTotals.miscellaneousSummaryAmount).toBe(60);
    });

    it("3.T15: should parse tax totals with tax code modifier", () => {
      const result = parseMiscellaneousSummaryMovement(MSM_SHIFT_REPORT_XML);

      const taxTotals = result.data.msmDetails.find(
        (d) =>
          d.miscellaneousSummaryCodes.miscellaneousSummaryCode ===
            "taxTotals" &&
          d.miscellaneousSummaryCodes.miscellaneousSummarySubCode ===
            "taxableSalesByTaxCode",
      );

      expect(taxTotals).toBeDefined();
      expect(
        taxTotals!.miscellaneousSummaryCodes
          .miscellaneousSummarySubCodeModifier,
      ).toBe("99");
      expect(taxTotals!.msmSalesTotals.miscellaneousSummaryAmount).toBe(757.14);
    });

    it("3.T16: should parse totalizer codes with sales modifier", () => {
      const result = parseMiscellaneousSummaryMovement(MSM_SHIFT_REPORT_XML);

      const totalizer = result.data.msmDetails.find(
        (d) =>
          d.miscellaneousSummaryCodes.miscellaneousSummaryCode ===
            "totalizer" &&
          d.miscellaneousSummaryCodes.miscellaneousSummarySubCodeModifier ===
            "sales",
      );

      expect(totalizer).toBeDefined();
      expect(
        totalizer!.miscellaneousSummaryCodes.miscellaneousSummarySubCode,
      ).toBe("sales");
      expect(totalizer!.msmSalesTotals.miscellaneousSummaryAmount).toBe(757.14);
      expect(totalizer!.msmSalesTotals.miscellaneousSummaryCount).toBe(44);
    });
  });

  // ==========================================================================
  // 3.T17 - 3.T20: Security & Validation Tests
  // ==========================================================================

  describe("Security & Validation (3.T17-3.T20)", () => {
    it("3.T17: should throw error for missing MovementHeader", () => {
      expect(() => {
        parseMiscellaneousSummaryMovement(MSM_MISSING_HEADER_XML);
      }).toThrow(NAXMLParserError);

      try {
        parseMiscellaneousSummaryMovement(MSM_MISSING_HEADER_XML);
      } catch (error) {
        expect((error as NAXMLParserError).code).toBe(
          NAXML_PARSER_ERROR_CODES.MSM_MISSING_MOVEMENT_HEADER,
        );
      }
    });

    it("3.T18: should throw error for invalid tender code (SEC-014 allowlist)", () => {
      expect(() => {
        parseMiscellaneousSummaryMovement(MSM_INVALID_TENDER_XML);
      }).toThrow(NAXMLParserError);

      try {
        parseMiscellaneousSummaryMovement(MSM_INVALID_TENDER_XML);
      } catch (error) {
        expect((error as NAXMLParserError).code).toBe(
          NAXML_PARSER_ERROR_CODES.MSM_INVALID_TENDER_CODE,
        );
        expect((error as NAXMLParserError).details?.tenderCode).toBe(
          "invalidTenderCode",
        );
      }
    });

    it("3.T19: should throw error for invalid report period", () => {
      expect(() => {
        parseMiscellaneousSummaryMovement(MSM_INVALID_PERIOD_XML);
      }).toThrow(NAXMLParserError);

      try {
        parseMiscellaneousSummaryMovement(MSM_INVALID_PERIOD_XML);
      } catch (error) {
        expect((error as NAXMLParserError).code).toBe(
          NAXML_PARSER_ERROR_CODES.FGM_INVALID_REPORT_PERIOD,
        );
      }
    });

    it("3.T20: should handle empty tender code without throwing", () => {
      // MSM files often have empty tender codes which should not throw
      const result = parseMiscellaneousSummaryMovement(MSM_SHIFT_REPORT_XML);

      // Find a detail with empty tender
      const emptyTenderDetail = result.data.msmDetails.find(
        (d) =>
          d.miscellaneousSummaryCodes.miscellaneousSummaryCode === "safeDrop" &&
          d.msmSalesTotals.tender === undefined,
      );

      expect(emptyTenderDetail).toBeDefined();
      // Empty tender should result in undefined, not throw
      expect(emptyTenderDetail!.msmSalesTotals.tender).toBeUndefined();
    });
  });

  // ==========================================================================
  // Additional Edge Case Tests
  // ==========================================================================

  describe("Edge Cases", () => {
    it("should parse opening/closing balance without subCode", () => {
      const result = parseMiscellaneousSummaryMovement(MSM_SHIFT_REPORT_XML);

      const openingBalance = result.data.msmDetails.find(
        (d) =>
          d.miscellaneousSummaryCodes.miscellaneousSummaryCode ===
          "openingBalance",
      );

      expect(openingBalance).toBeDefined();
      expect(
        openingBalance!.miscellaneousSummaryCodes.miscellaneousSummarySubCode,
      ).toBeUndefined();
      expect(openingBalance!.msmSalesTotals.miscellaneousSummaryAmount).toBe(
        200,
      );
    });

    it("should handle decimal values in count field (volume)", () => {
      const result = parseMiscellaneousSummaryMovement(MSM_SHIFT_REPORT_XML);

      const fuelSales = result.data.msmDetails.find(
        (d) =>
          d.miscellaneousSummaryCodes.miscellaneousSummaryCode ===
            "fuelSalesByGrade" &&
          d.miscellaneousSummaryCodes.miscellaneousSummarySubCodeModifier ===
            "002",
      );

      expect(fuelSales).toBeDefined();
      // 19.236 gallons
      expect(fuelSales!.msmSalesTotals.miscellaneousSummaryCount).toBeCloseTo(
        19.236,
        3,
      );
    });

    it("should correctly count total MSMDetail records including outside summaries", () => {
      const result = parseMiscellaneousSummaryMovement(MSM_SHIFT_REPORT_XML);

      // Should include both inside container and root level MSMDetail elements
      // 10 inside + 2 outside = 12 total in the test fixture
      expect(result.data.msmDetails.length).toBe(12);
    });

    it("should validate Zod schema on parsed data", () => {
      // The convenience function already runs Zod validation
      const result = parseMiscellaneousSummaryMovement(MSM_MINIMAL_XML);

      expect(result.data.movementHeader).toBeDefined();
      expect(result.data.msmDetails).toBeInstanceOf(Array);
    });
  });

  // ==========================================================================
  // Real Production File Tests
  // ==========================================================================

  describe("Production File Parsing", () => {
    const msmFilePath = path.join(
      __dirname,
      "../../../my-files/GILBARCO/BOOutBox/Error/MSM3402601050002081836614.xml",
    );

    it("should parse real production MSM file if available", () => {
      // Skip if file doesn't exist
      if (!fs.existsSync(msmFilePath)) {
        console.log("Skipping production file test - file not found");
        return;
      }

      const xmlContent = fs.readFileSync(msmFilePath, "utf-8");
      const result = parseMiscellaneousSummaryMovement(xmlContent);

      expect(result.documentType).toBe("MiscellaneousSummaryMovement");
      expect(result.storeLocationId).toBe("299");
      expect(result.data.movementHeader.primaryReportPeriod).toBe(98);
      expect(result.data.msmDetails.length).toBeGreaterThan(0);

      // Verify specific known values from the production file
      const cashLoan = result.data.msmDetails.find(
        (d) =>
          d.miscellaneousSummaryCodes.miscellaneousSummaryCode === "safeLoan" &&
          d.msmSalesTotals.tender?.tenderCode === "cash",
      );
      expect(cashLoan?.msmSalesTotals.miscellaneousSummaryAmount).toBe(200);
    });
  });
});
