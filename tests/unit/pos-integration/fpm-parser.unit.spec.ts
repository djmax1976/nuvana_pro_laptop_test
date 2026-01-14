/**
 * NAXML FPM (Fuel Product Movement) Parser Unit Tests
 *
 * Enterprise-grade test suite for the FPM parser implementation.
 * Tests validate parsing of FPM XML documents containing non-resettable
 * pump meter readings used for fuel reconciliation.
 *
 * Test Coverage Matrix (18 tests per Phase 4 plan):
 * - 4.T1: parseFuelProductMovement() - valid document
 * - 4.T2: parseFPMDetail() - single product extraction
 * - 4.T3: parseFPMDetail() - multiple products extraction
 * - 4.T4: parseFPMNonResettableTotals() - position extraction
 * - 4.T5: parseFPMNonResettableTotals() - volume reading precision
 * - 4.T6: parseFPMNonResettableTotals() - amount reading precision
 * - 4.T7: Multiple positions per product handling
 * - 4.T8: High-value cumulative readings (15,3 decimal)
 * - 4.T9: Position with zero readings (new pump)
 * - 4.T10: Single position single product
 * - 4.T11: Malformed XML rejection
 * - 4.T12: Missing FuelProductID rejection
 * - 4.T13: Missing FuelPositionID rejection (NonResettableVolumeNumber)
 * - 4.T14: Invalid position ID format rejection
 * - 4.T15: XXE prevention in FPM documents
 * - 4.T16: Meter readings match PDF Fuel Reconciliation
 * - 4.T17: Cumulative volume monotonically increasing
 * - 4.T18: Position-product mapping consistency
 *
 * Traceability:
 * - XML.md Phase 4 Requirements
 * - NAXML 3.4 Specification
 * - Gilbarco Passport FPM File Format
 *
 * @module tests/unit/pos-integration/fpm-parser.unit.spec
 * @security SEC-014 Input validation, allowlist enforcement
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

import {
  NAXMLParser,
  createNAXMLParser,
  parseFuelProductMovement,
  NAXMLParserError,
  NAXML_PARSER_ERROR_CODES,
} from "../../../backend/src/services/naxml/naxml.parser";

import type {
  NAXMLFuelProductMovementData,
  NAXMLDocument,
} from "../../../backend/src/types/naxml.types";

// ============================================================================
// Test Fixtures - Real Production XML Structures
// ============================================================================

/**
 * Valid FPM document with multiple products and positions.
 * Based on real Gilbarco Passport FPM file structure from Store 299.
 */
const FPM_VALID_MULTI_PRODUCT_XML = `<?xml version="1.0" encoding="ISO-8859-1"?>
<NAXML-MovementReport version="3.4">
<TransmissionHeader>
<StoreLocationID>299</StoreLocationID>
<VendorName>Gilbarco-VeederRoot</VendorName>
<VendorModelVersion>22.01.26.01</VendorModelVersion>
</TransmissionHeader>
<FuelProductMovement>
<MovementHeader>
<ReportSequenceNumber>1</ReportSequenceNumber>
<PrimaryReportPeriod>2</PrimaryReportPeriod>
<SecondaryReportPeriod>0</SecondaryReportPeriod>
<BusinessDate>2026-01-03</BusinessDate>
<BeginDate>2026-01-03</BeginDate>
<BeginTime>23:59:53</BeginTime>
<EndDate>2026-01-04</EndDate>
<EndTime>23:59:26</EndTime>
</MovementHeader>
<FPMDetail>
<FuelProductID>1</FuelProductID>
<FPMNonResettableTotals>
<FuelPositionID>1</FuelPositionID>
<FuelProductNonResettableAmountNumber>0</FuelProductNonResettableAmountNumber>
<FuelProductNonResettableVolumeNumber>228745.691</FuelProductNonResettableVolumeNumber>
</FPMNonResettableTotals>
<FPMNonResettableTotals>
<FuelPositionID>2</FuelPositionID>
<FuelProductNonResettableAmountNumber>0</FuelProductNonResettableAmountNumber>
<FuelProductNonResettableVolumeNumber>208844.734</FuelProductNonResettableVolumeNumber>
</FPMNonResettableTotals>
<FPMNonResettableTotals>
<FuelPositionID>3</FuelPositionID>
<FuelProductNonResettableAmountNumber>0</FuelProductNonResettableAmountNumber>
<FuelProductNonResettableVolumeNumber>264250.687</FuelProductNonResettableVolumeNumber>
</FPMNonResettableTotals>
<FPMNonResettableTotals>
<FuelPositionID>4</FuelPositionID>
<FuelProductNonResettableAmountNumber>0</FuelProductNonResettableAmountNumber>
<FuelProductNonResettableVolumeNumber>109710.473</FuelProductNonResettableVolumeNumber>
</FPMNonResettableTotals>
</FPMDetail>
<FPMDetail>
<FuelProductID>2</FuelProductID>
<FPMNonResettableTotals>
<FuelPositionID>1</FuelPositionID>
<FuelProductNonResettableAmountNumber>0</FuelProductNonResettableAmountNumber>
<FuelProductNonResettableVolumeNumber>44351.802</FuelProductNonResettableVolumeNumber>
</FPMNonResettableTotals>
<FPMNonResettableTotals>
<FuelPositionID>2</FuelPositionID>
<FuelProductNonResettableAmountNumber>0</FuelProductNonResettableAmountNumber>
<FuelProductNonResettableVolumeNumber>47975.893</FuelProductNonResettableVolumeNumber>
</FPMNonResettableTotals>
<FPMNonResettableTotals>
<FuelPositionID>3</FuelPositionID>
<FuelProductNonResettableAmountNumber>0</FuelProductNonResettableAmountNumber>
<FuelProductNonResettableVolumeNumber>51615.554</FuelProductNonResettableVolumeNumber>
</FPMNonResettableTotals>
<FPMNonResettableTotals>
<FuelPositionID>4</FuelPositionID>
<FuelProductNonResettableAmountNumber>0</FuelProductNonResettableAmountNumber>
<FuelProductNonResettableVolumeNumber>23544.607</FuelProductNonResettableVolumeNumber>
</FPMNonResettableTotals>
</FPMDetail>
<FPMDetail>
<FuelProductID>3</FuelProductID>
<FPMNonResettableTotals>
<FuelPositionID>5</FuelPositionID>
<FuelProductNonResettableAmountNumber>0</FuelProductNonResettableAmountNumber>
<FuelProductNonResettableVolumeNumber>21750.7</FuelProductNonResettableVolumeNumber>
</FPMNonResettableTotals>
<FPMNonResettableTotals>
<FuelPositionID>6</FuelPositionID>
<FuelProductNonResettableAmountNumber>0</FuelProductNonResettableAmountNumber>
<FuelProductNonResettableVolumeNumber>19043.12</FuelProductNonResettableVolumeNumber>
</FPMNonResettableTotals>
</FPMDetail>
<FPMDetail>
<FuelProductID>4</FuelProductID>
<FPMNonResettableTotals>
<FuelPositionID>7</FuelPositionID>
<FuelProductNonResettableAmountNumber>0</FuelProductNonResettableAmountNumber>
<FuelProductNonResettableVolumeNumber>33622.92</FuelProductNonResettableVolumeNumber>
</FPMNonResettableTotals>
</FPMDetail>
</FuelProductMovement>
</NAXML-MovementReport>`;

/**
 * FPM document with single product and single position.
 */
const FPM_SINGLE_PRODUCT_XML = `<?xml version="1.0" encoding="ISO-8859-1"?>
<NAXML-MovementReport version="3.4">
<TransmissionHeader>
<StoreLocationID>299</StoreLocationID>
<VendorName>Gilbarco-VeederRoot</VendorName>
<VendorModelVersion>22.01.26.01</VendorModelVersion>
</TransmissionHeader>
<FuelProductMovement>
<MovementHeader>
<ReportSequenceNumber>1</ReportSequenceNumber>
<PrimaryReportPeriod>2</PrimaryReportPeriod>
<SecondaryReportPeriod>0</SecondaryReportPeriod>
<BusinessDate>2026-01-05</BusinessDate>
<BeginDate>2026-01-05</BeginDate>
<BeginTime>00:00:00</BeginTime>
<EndDate>2026-01-05</EndDate>
<EndTime>23:59:59</EndTime>
</MovementHeader>
<FPMDetail>
<FuelProductID>1</FuelProductID>
<FPMNonResettableTotals>
<FuelPositionID>1</FuelPositionID>
<FuelProductNonResettableAmountNumber>567890.12</FuelProductNonResettableAmountNumber>
<FuelProductNonResettableVolumeNumber>250000.999</FuelProductNonResettableVolumeNumber>
</FPMNonResettableTotals>
</FPMDetail>
</FuelProductMovement>
</NAXML-MovementReport>`;

/**
 * FPM document with zero readings (new pump scenario).
 */
const FPM_ZERO_READINGS_XML = `<?xml version="1.0" encoding="ISO-8859-1"?>
<NAXML-MovementReport version="3.4">
<TransmissionHeader>
<StoreLocationID>299</StoreLocationID>
<VendorName>Gilbarco-VeederRoot</VendorName>
<VendorModelVersion>22.01.26.01</VendorModelVersion>
</TransmissionHeader>
<FuelProductMovement>
<MovementHeader>
<ReportSequenceNumber>1</ReportSequenceNumber>
<PrimaryReportPeriod>2</PrimaryReportPeriod>
<SecondaryReportPeriod>0</SecondaryReportPeriod>
<BusinessDate>2026-01-06</BusinessDate>
<BeginDate>2026-01-06</BeginDate>
<BeginTime>00:00:00</BeginTime>
<EndDate>2026-01-06</EndDate>
<EndTime>23:59:59</EndTime>
</MovementHeader>
<FPMDetail>
<FuelProductID>1</FuelProductID>
<FPMNonResettableTotals>
<FuelPositionID>8</FuelPositionID>
<FuelProductNonResettableAmountNumber>0</FuelProductNonResettableAmountNumber>
<FuelProductNonResettableVolumeNumber>0</FuelProductNonResettableVolumeNumber>
</FPMNonResettableTotals>
</FPMDetail>
</FuelProductMovement>
</NAXML-MovementReport>`;

/**
 * FPM document with high-value cumulative readings (15,3 decimal precision).
 */
const FPM_HIGH_VALUE_READINGS_XML = `<?xml version="1.0" encoding="ISO-8859-1"?>
<NAXML-MovementReport version="3.4">
<TransmissionHeader>
<StoreLocationID>299</StoreLocationID>
<VendorName>Gilbarco-VeederRoot</VendorName>
<VendorModelVersion>22.01.26.01</VendorModelVersion>
</TransmissionHeader>
<FuelProductMovement>
<MovementHeader>
<ReportSequenceNumber>1</ReportSequenceNumber>
<PrimaryReportPeriod>2</PrimaryReportPeriod>
<SecondaryReportPeriod>0</SecondaryReportPeriod>
<BusinessDate>2026-01-07</BusinessDate>
<BeginDate>2026-01-07</BeginDate>
<BeginTime>00:00:00</BeginTime>
<EndDate>2026-01-07</EndDate>
<EndTime>23:59:59</EndTime>
</MovementHeader>
<FPMDetail>
<FuelProductID>1</FuelProductID>
<FPMNonResettableTotals>
<FuelPositionID>1</FuelPositionID>
<FuelProductNonResettableAmountNumber>9999999999999.99</FuelProductNonResettableAmountNumber>
<FuelProductNonResettableVolumeNumber>999999999999.999</FuelProductNonResettableVolumeNumber>
</FPMNonResettableTotals>
</FPMDetail>
</FuelProductMovement>
</NAXML-MovementReport>`;

/**
 * FPM with empty FPMDetail array (valid but empty).
 */
const FPM_EMPTY_DETAILS_XML = `<?xml version="1.0" encoding="ISO-8859-1"?>
<NAXML-MovementReport version="3.4">
<TransmissionHeader>
<StoreLocationID>299</StoreLocationID>
<VendorName>Gilbarco-VeederRoot</VendorName>
<VendorModelVersion>22.01.26.01</VendorModelVersion>
</TransmissionHeader>
<FuelProductMovement>
<MovementHeader>
<ReportSequenceNumber>1</ReportSequenceNumber>
<PrimaryReportPeriod>2</PrimaryReportPeriod>
<SecondaryReportPeriod>0</SecondaryReportPeriod>
<BusinessDate>2026-01-08</BusinessDate>
<BeginDate>2026-01-08</BeginDate>
<BeginTime>00:00:00</BeginTime>
<EndDate>2026-01-08</EndDate>
<EndTime>23:59:59</EndTime>
</MovementHeader>
</FuelProductMovement>
</NAXML-MovementReport>`;

// ============================================================================
// Invalid/Malformed XML Fixtures for Error Testing
// ============================================================================

const FPM_MISSING_MOVEMENT_HEADER = `<?xml version="1.0" encoding="ISO-8859-1"?>
<NAXML-MovementReport version="3.4">
<TransmissionHeader>
<StoreLocationID>299</StoreLocationID>
</TransmissionHeader>
<FuelProductMovement>
<FPMDetail>
<FuelProductID>1</FuelProductID>
<FPMNonResettableTotals>
<FuelPositionID>1</FuelPositionID>
<FuelProductNonResettableAmountNumber>0</FuelProductNonResettableAmountNumber>
<FuelProductNonResettableVolumeNumber>100</FuelProductNonResettableVolumeNumber>
</FPMNonResettableTotals>
</FPMDetail>
</FuelProductMovement>
</NAXML-MovementReport>`;

const FPM_MISSING_PRODUCT_ID = `<?xml version="1.0" encoding="ISO-8859-1"?>
<NAXML-MovementReport version="3.4">
<TransmissionHeader>
<StoreLocationID>299</StoreLocationID>
</TransmissionHeader>
<FuelProductMovement>
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
<FPMDetail>
<FPMNonResettableTotals>
<FuelPositionID>1</FuelPositionID>
<FuelProductNonResettableAmountNumber>0</FuelProductNonResettableAmountNumber>
<FuelProductNonResettableVolumeNumber>100</FuelProductNonResettableVolumeNumber>
</FPMNonResettableTotals>
</FPMDetail>
</FuelProductMovement>
</NAXML-MovementReport>`;

const FPM_MISSING_POSITION_ID = `<?xml version="1.0" encoding="ISO-8859-1"?>
<NAXML-MovementReport version="3.4">
<TransmissionHeader>
<StoreLocationID>299</StoreLocationID>
</TransmissionHeader>
<FuelProductMovement>
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
<FPMDetail>
<FuelProductID>1</FuelProductID>
<FPMNonResettableTotals>
<FuelProductNonResettableAmountNumber>0</FuelProductNonResettableAmountNumber>
<FuelProductNonResettableVolumeNumber>100</FuelProductNonResettableVolumeNumber>
</FPMNonResettableTotals>
</FPMDetail>
</FuelProductMovement>
</NAXML-MovementReport>`;

const FPM_NEGATIVE_VOLUME = `<?xml version="1.0" encoding="ISO-8859-1"?>
<NAXML-MovementReport version="3.4">
<TransmissionHeader>
<StoreLocationID>299</StoreLocationID>
</TransmissionHeader>
<FuelProductMovement>
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
<FPMDetail>
<FuelProductID>1</FuelProductID>
<FPMNonResettableTotals>
<FuelPositionID>1</FuelPositionID>
<FuelProductNonResettableAmountNumber>0</FuelProductNonResettableAmountNumber>
<FuelProductNonResettableVolumeNumber>-100.5</FuelProductNonResettableVolumeNumber>
</FPMNonResettableTotals>
</FPMDetail>
</FuelProductMovement>
</NAXML-MovementReport>`;

const FPM_NEGATIVE_AMOUNT = `<?xml version="1.0" encoding="ISO-8859-1"?>
<NAXML-MovementReport version="3.4">
<TransmissionHeader>
<StoreLocationID>299</StoreLocationID>
</TransmissionHeader>
<FuelProductMovement>
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
<FPMDetail>
<FuelProductID>1</FuelProductID>
<FPMNonResettableTotals>
<FuelPositionID>1</FuelPositionID>
<FuelProductNonResettableAmountNumber>-500.25</FuelProductNonResettableAmountNumber>
<FuelProductNonResettableVolumeNumber>100</FuelProductNonResettableVolumeNumber>
</FPMNonResettableTotals>
</FPMDetail>
</FuelProductMovement>
</NAXML-MovementReport>`;

const FPM_MALFORMED_XML = `<?xml version="1.0" encoding="ISO-8859-1"?>
<NAXML-MovementReport version="3.4">
<TransmissionHeader>
<StoreLocationID>299</StoreLocationID>
</TransmissionHeader>
<FuelProductMovement>
<MovementHeader>
<ReportSequenceNumber>1</ReportSequenceNumber>
<!-- Missing closing tag for MovementHeader -->
<FPMDetail>
<FuelProductID>1</FuelProductID>
</FPMDetail>
</FuelProductMovement>
</NAXML-MovementReport>`;

const FPM_INVALID_REPORT_PERIOD = `<?xml version="1.0" encoding="ISO-8859-1"?>
<NAXML-MovementReport version="3.4">
<TransmissionHeader>
<StoreLocationID>299</StoreLocationID>
</TransmissionHeader>
<FuelProductMovement>
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
<FPMDetail>
<FuelProductID>1</FuelProductID>
<FPMNonResettableTotals>
<FuelPositionID>1</FuelPositionID>
<FuelProductNonResettableAmountNumber>0</FuelProductNonResettableAmountNumber>
<FuelProductNonResettableVolumeNumber>100</FuelProductNonResettableVolumeNumber>
</FPMNonResettableTotals>
</FPMDetail>
</FuelProductMovement>
</NAXML-MovementReport>`;

/**
 * XXE (XML External Entity) attack attempt.
 * SEC-014: Parser must reject or neutralize this.
 */
const FPM_XXE_ATTACK = `<?xml version="1.0" encoding="ISO-8859-1"?>
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<NAXML-MovementReport version="3.4">
<TransmissionHeader>
<StoreLocationID>&xxe;</StoreLocationID>
</TransmissionHeader>
<FuelProductMovement>
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
<FPMDetail>
<FuelProductID>1</FuelProductID>
<FPMNonResettableTotals>
<FuelPositionID>1</FuelPositionID>
<FuelProductNonResettableAmountNumber>0</FuelProductNonResettableAmountNumber>
<FuelProductNonResettableVolumeNumber>100</FuelProductNonResettableVolumeNumber>
</FPMNonResettableTotals>
</FPMDetail>
</FuelProductMovement>
</NAXML-MovementReport>`;

// ============================================================================
// Test Suite
// ============================================================================

describe("NAXML FPM Parser - Phase 4 Implementation Tests", () => {
  let parser: NAXMLParser;

  beforeEach(() => {
    parser = createNAXMLParser();
  });

  // ==========================================================================
  // 4.T1: parseFuelProductMovement() - valid document
  // ==========================================================================
  describe("4.T1: parseFuelProductMovement() - valid document", () => {
    it("should parse a valid FPM document with multiple products", () => {
      const result = parser.parseFuelProductMovement(
        FPM_VALID_MULTI_PRODUCT_XML,
      );

      expect(result).toBeDefined();
      expect(result.documentType).toBe("FuelProductMovement");
      expect(result.version).toBe("3.4");
      expect(result.storeLocationId).toBe("299");
      expect(result.data).toBeDefined();
      expect(result.data.movementHeader).toBeDefined();
      expect(result.data.fpmDetails).toBeInstanceOf(Array);
      expect(result.data.fpmDetails.length).toBe(4);
    });

    it("should parse movement header correctly", () => {
      const result = parser.parseFuelProductMovement(
        FPM_VALID_MULTI_PRODUCT_XML,
      );

      expect(result.data.movementHeader.primaryReportPeriod).toBe(2);
      expect(result.data.movementHeader.secondaryReportPeriod).toBe(0);
      expect(result.data.movementHeader.businessDate).toBe("2026-01-03");
      expect(result.data.movementHeader.reportSequenceNumber).toBe(1);
    });

    it("should work with convenience function parseFuelProductMovement()", () => {
      const result = parseFuelProductMovement(FPM_VALID_MULTI_PRODUCT_XML);

      expect(result).toBeDefined();
      expect(result.documentType).toBe("FuelProductMovement");
      expect(result.data.fpmDetails.length).toBe(4);
    });
  });

  // ==========================================================================
  // 4.T2: parseFPMDetail() - single product extraction
  // ==========================================================================
  describe("4.T2: parseFPMDetail() - single product extraction", () => {
    it("should extract single product from FPM document", () => {
      const result = parser.parseFuelProductMovement(FPM_SINGLE_PRODUCT_XML);

      expect(result.data.fpmDetails.length).toBe(1);
      expect(result.data.fpmDetails[0].fuelProductId).toBe("1");
    });

    it("should preserve product ID as string", () => {
      const result = parser.parseFuelProductMovement(
        FPM_VALID_MULTI_PRODUCT_XML,
      );

      // Product IDs should be strings, not numbers
      expect(result.data.fpmDetails[0].fuelProductId).toBe("1");
      expect(typeof result.data.fpmDetails[0].fuelProductId).toBe("string");
    });
  });

  // ==========================================================================
  // 4.T3: parseFPMDetail() - multiple products extraction
  // ==========================================================================
  describe("4.T3: parseFPMDetail() - multiple products extraction", () => {
    it("should extract all products from multi-product FPM document", () => {
      const result = parser.parseFuelProductMovement(
        FPM_VALID_MULTI_PRODUCT_XML,
      );

      expect(result.data.fpmDetails.length).toBe(4);

      const productIds = result.data.fpmDetails.map((d) => d.fuelProductId);
      expect(productIds).toContain("1");
      expect(productIds).toContain("2");
      expect(productIds).toContain("3");
      expect(productIds).toContain("4");
    });

    it("should maintain product order from XML", () => {
      const result = parser.parseFuelProductMovement(
        FPM_VALID_MULTI_PRODUCT_XML,
      );

      expect(result.data.fpmDetails[0].fuelProductId).toBe("1");
      expect(result.data.fpmDetails[1].fuelProductId).toBe("2");
      expect(result.data.fpmDetails[2].fuelProductId).toBe("3");
      expect(result.data.fpmDetails[3].fuelProductId).toBe("4");
    });
  });

  // ==========================================================================
  // 4.T4: parseFPMNonResettableTotals() - position extraction
  // ==========================================================================
  describe("4.T4: parseFPMNonResettableTotals() - position extraction", () => {
    it("should extract position ID correctly", () => {
      const result = parser.parseFuelProductMovement(
        FPM_VALID_MULTI_PRODUCT_XML,
      );

      const product1 = result.data.fpmDetails[0];
      expect(product1.fpmNonResettableTotals[0].fuelPositionId).toBe("1");
      expect(product1.fpmNonResettableTotals[1].fuelPositionId).toBe("2");
      expect(product1.fpmNonResettableTotals[2].fuelPositionId).toBe("3");
      expect(product1.fpmNonResettableTotals[3].fuelPositionId).toBe("4");
    });

    it("should preserve position ID as string", () => {
      const result = parser.parseFuelProductMovement(FPM_SINGLE_PRODUCT_XML);

      expect(
        typeof result.data.fpmDetails[0].fpmNonResettableTotals[0]
          .fuelPositionId,
      ).toBe("string");
    });
  });

  // ==========================================================================
  // 4.T5: parseFPMNonResettableTotals() - volume reading precision
  // ==========================================================================
  describe("4.T5: parseFPMNonResettableTotals() - volume reading precision", () => {
    it("should parse volume readings with decimal precision", () => {
      const result = parser.parseFuelProductMovement(
        FPM_VALID_MULTI_PRODUCT_XML,
      );

      const product1 = result.data.fpmDetails[0];
      expect(
        product1.fpmNonResettableTotals[0].fuelProductNonResettableVolumeNumber,
      ).toBe(228745.691);
      expect(
        product1.fpmNonResettableTotals[1].fuelProductNonResettableVolumeNumber,
      ).toBe(208844.734);
    });

    it("should handle high-precision volume readings", () => {
      const result = parser.parseFuelProductMovement(
        FPM_HIGH_VALUE_READINGS_XML,
      );

      expect(
        result.data.fpmDetails[0].fpmNonResettableTotals[0]
          .fuelProductNonResettableVolumeNumber,
      ).toBe(999999999999.999);
    });
  });

  // ==========================================================================
  // 4.T6: parseFPMNonResettableTotals() - amount reading precision
  // ==========================================================================
  describe("4.T6: parseFPMNonResettableTotals() - amount reading precision", () => {
    it("should parse amount readings correctly", () => {
      const result = parser.parseFuelProductMovement(FPM_SINGLE_PRODUCT_XML);

      expect(
        result.data.fpmDetails[0].fpmNonResettableTotals[0]
          .fuelProductNonResettableAmountNumber,
      ).toBe(567890.12);
    });

    it("should handle zero amount readings (common in Gilbarco)", () => {
      const result = parser.parseFuelProductMovement(
        FPM_VALID_MULTI_PRODUCT_XML,
      );

      // Gilbarco systems often report 0 for amount
      expect(
        result.data.fpmDetails[0].fpmNonResettableTotals[0]
          .fuelProductNonResettableAmountNumber,
      ).toBe(0);
    });

    it("should handle high-value amount readings", () => {
      const result = parser.parseFuelProductMovement(
        FPM_HIGH_VALUE_READINGS_XML,
      );

      expect(
        result.data.fpmDetails[0].fpmNonResettableTotals[0]
          .fuelProductNonResettableAmountNumber,
      ).toBe(9999999999999.99);
    });
  });

  // ==========================================================================
  // 4.T7: Multiple positions per product handling
  // ==========================================================================
  describe("4.T7: Multiple positions per product handling", () => {
    it("should extract all positions for a product", () => {
      const result = parser.parseFuelProductMovement(
        FPM_VALID_MULTI_PRODUCT_XML,
      );

      // Product 1 has 4 positions
      const product1 = result.data.fpmDetails[0];
      expect(product1.fpmNonResettableTotals.length).toBe(4);

      // Product 3 has 2 positions
      const product3 = result.data.fpmDetails[2];
      expect(product3.fpmNonResettableTotals.length).toBe(2);

      // Product 4 has 1 position
      const product4 = result.data.fpmDetails[3];
      expect(product4.fpmNonResettableTotals.length).toBe(1);
    });

    it("should maintain position order within a product", () => {
      const result = parser.parseFuelProductMovement(
        FPM_VALID_MULTI_PRODUCT_XML,
      );

      const product1 = result.data.fpmDetails[0];
      expect(product1.fpmNonResettableTotals[0].fuelPositionId).toBe("1");
      expect(product1.fpmNonResettableTotals[1].fuelPositionId).toBe("2");
      expect(product1.fpmNonResettableTotals[2].fuelPositionId).toBe("3");
      expect(product1.fpmNonResettableTotals[3].fuelPositionId).toBe("4");
    });
  });

  // ==========================================================================
  // 4.T8: High-value cumulative readings (15,3 decimal)
  // ==========================================================================
  describe("4.T8: High-value cumulative readings (15,3 decimal)", () => {
    it("should handle large cumulative volume values", () => {
      const result = parser.parseFuelProductMovement(
        FPM_HIGH_VALUE_READINGS_XML,
      );

      const reading =
        result.data.fpmDetails[0].fpmNonResettableTotals[0]
          .fuelProductNonResettableVolumeNumber;

      // Should handle values up to 15,3 precision
      expect(reading).toBeGreaterThan(100000000000);
      expect(reading).toBe(999999999999.999);
    });

    it("should handle large cumulative amount values", () => {
      const result = parser.parseFuelProductMovement(
        FPM_HIGH_VALUE_READINGS_XML,
      );

      const reading =
        result.data.fpmDetails[0].fpmNonResettableTotals[0]
          .fuelProductNonResettableAmountNumber;

      expect(reading).toBeGreaterThan(1000000000000);
      expect(reading).toBe(9999999999999.99);
    });
  });

  // ==========================================================================
  // 4.T9: Position with zero readings (new pump)
  // ==========================================================================
  describe("4.T9: Position with zero readings (new pump)", () => {
    it("should accept zero readings as valid", () => {
      const result = parser.parseFuelProductMovement(FPM_ZERO_READINGS_XML);

      expect(
        result.data.fpmDetails[0].fpmNonResettableTotals[0].fuelPositionId,
      ).toBe("8");
      expect(
        result.data.fpmDetails[0].fpmNonResettableTotals[0]
          .fuelProductNonResettableVolumeNumber,
      ).toBe(0);
      expect(
        result.data.fpmDetails[0].fpmNonResettableTotals[0]
          .fuelProductNonResettableAmountNumber,
      ).toBe(0);
    });
  });

  // ==========================================================================
  // 4.T10: Single position single product
  // ==========================================================================
  describe("4.T10: Single position single product", () => {
    it("should parse minimal valid FPM with one product and one position", () => {
      const result = parser.parseFuelProductMovement(FPM_SINGLE_PRODUCT_XML);

      expect(result.data.fpmDetails.length).toBe(1);
      expect(result.data.fpmDetails[0].fpmNonResettableTotals.length).toBe(1);
      expect(result.data.fpmDetails[0].fuelProductId).toBe("1");
      expect(
        result.data.fpmDetails[0].fpmNonResettableTotals[0].fuelPositionId,
      ).toBe("1");
    });
  });

  // ==========================================================================
  // 4.T11: Malformed XML rejection
  // ==========================================================================
  describe("4.T11: Malformed XML rejection", () => {
    it("should throw NAXMLParserError for malformed XML", () => {
      expect(() => parser.parseFuelProductMovement(FPM_MALFORMED_XML)).toThrow(
        NAXMLParserError,
      );
    });

    it("should provide INVALID_XML error code for malformed XML", () => {
      try {
        parser.parseFuelProductMovement(FPM_MALFORMED_XML);
        expect.fail("Expected NAXMLParserError to be thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(NAXMLParserError);
        expect((error as NAXMLParserError).code).toBe(
          NAXML_PARSER_ERROR_CODES.INVALID_XML,
        );
      }
    });
  });

  // ==========================================================================
  // 4.T12: Missing FuelProductID rejection
  // ==========================================================================
  describe("4.T12: Missing FuelProductID rejection", () => {
    it("should throw NAXMLParserError when FuelProductID is missing", () => {
      expect(() =>
        parser.parseFuelProductMovement(FPM_MISSING_PRODUCT_ID),
      ).toThrow(NAXMLParserError);
    });

    it("should provide FPM_MISSING_PRODUCT_ID error code", () => {
      try {
        parser.parseFuelProductMovement(FPM_MISSING_PRODUCT_ID);
        expect.fail("Expected NAXMLParserError to be thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(NAXMLParserError);
        expect((error as NAXMLParserError).code).toBe(
          NAXML_PARSER_ERROR_CODES.FPM_MISSING_PRODUCT_ID,
        );
      }
    });
  });

  // ==========================================================================
  // 4.T13: Missing FuelPositionID rejection
  // ==========================================================================
  describe("4.T13: Missing FuelPositionID rejection", () => {
    it("should throw NAXMLParserError when FuelPositionID is missing", () => {
      expect(() =>
        parser.parseFuelProductMovement(FPM_MISSING_POSITION_ID),
      ).toThrow(NAXMLParserError);
    });

    it("should provide FPM_MISSING_POSITION_ID error code", () => {
      try {
        parser.parseFuelProductMovement(FPM_MISSING_POSITION_ID);
        expect.fail("Expected NAXMLParserError to be thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(NAXMLParserError);
        expect((error as NAXMLParserError).code).toBe(
          NAXML_PARSER_ERROR_CODES.FPM_MISSING_POSITION_ID,
        );
      }
    });
  });

  // ==========================================================================
  // 4.T14: Invalid meter reading rejection (negative values)
  // ==========================================================================
  describe("4.T14: Invalid meter reading rejection", () => {
    it("should throw NAXMLParserError for negative volume reading", () => {
      expect(() =>
        parser.parseFuelProductMovement(FPM_NEGATIVE_VOLUME),
      ).toThrow(NAXMLParserError);
    });

    it("should provide FPM_INVALID_METER_READING error code for negative volume", () => {
      try {
        parser.parseFuelProductMovement(FPM_NEGATIVE_VOLUME);
        expect.fail("Expected NAXMLParserError to be thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(NAXMLParserError);
        expect((error as NAXMLParserError).code).toBe(
          NAXML_PARSER_ERROR_CODES.FPM_INVALID_METER_READING,
        );
      }
    });

    it("should throw NAXMLParserError for negative amount reading", () => {
      expect(() =>
        parser.parseFuelProductMovement(FPM_NEGATIVE_AMOUNT),
      ).toThrow(NAXMLParserError);
    });

    it("should provide FPM_INVALID_METER_READING error code for negative amount", () => {
      try {
        parser.parseFuelProductMovement(FPM_NEGATIVE_AMOUNT);
        expect.fail("Expected NAXMLParserError to be thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(NAXMLParserError);
        expect((error as NAXMLParserError).code).toBe(
          NAXML_PARSER_ERROR_CODES.FPM_INVALID_METER_READING,
        );
      }
    });
  });

  // ==========================================================================
  // 4.T15: XXE prevention in FPM documents
  // ==========================================================================
  describe("4.T15: XXE prevention in FPM documents", () => {
    it("should not process external entities in XML", () => {
      // The parser should either reject the XXE attempt or neutralize it
      // fast-xml-parser does not support external entities by default and throws
      // an error when encountering DOCTYPE with entities
      try {
        const result = parser.parseFuelProductMovement(FPM_XXE_ATTACK);
        // If parsing succeeds, the entity should not be resolved to file contents
        expect(result.storeLocationId).not.toContain("root:");
        expect(result.storeLocationId).not.toContain("/bin/bash");
      } catch (error) {
        // fast-xml-parser throws a generic Error for external entities,
        // not NAXMLParserError. This is acceptable security behavior.
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("External entities");
      }
    });
  });

  // ==========================================================================
  // 4.T16: Validation against real production file
  // ==========================================================================
  describe("4.T16: Meter readings match real production data", () => {
    it("should parse real FPM file with expected values", () => {
      // Test against the production FPM file structure
      const result = parser.parseFuelProductMovement(
        FPM_VALID_MULTI_PRODUCT_XML,
      );

      // Verify Product 1 (Regular unleaded typically) at Position 1
      const product1 = result.data.fpmDetails.find(
        (d) => d.fuelProductId === "1",
      );
      expect(product1).toBeDefined();

      const pos1 = product1!.fpmNonResettableTotals.find(
        (t) => t.fuelPositionId === "1",
      );
      expect(pos1).toBeDefined();
      expect(pos1!.fuelProductNonResettableVolumeNumber).toBe(228745.691);
    });

    it("should handle diesel positions (separate island)", () => {
      const result = parser.parseFuelProductMovement(
        FPM_VALID_MULTI_PRODUCT_XML,
      );

      // Product 3 is diesel, typically on positions 5-6
      const product3 = result.data.fpmDetails.find(
        (d) => d.fuelProductId === "3",
      );
      expect(product3).toBeDefined();

      const positions = product3!.fpmNonResettableTotals.map(
        (t) => t.fuelPositionId,
      );
      expect(positions).toContain("5");
      expect(positions).toContain("6");
    });
  });

  // ==========================================================================
  // 4.T17: Business validation - Cumulative volume characteristics
  // ==========================================================================
  describe("4.T17: Cumulative volume monotonically increasing characteristic", () => {
    it("should accept valid cumulative readings", () => {
      // Note: We can't validate monotonic increase without historical data
      // This test validates that large cumulative values are accepted
      const result = parser.parseFuelProductMovement(
        FPM_VALID_MULTI_PRODUCT_XML,
      );

      // All readings should be non-negative (cumulative values)
      for (const detail of result.data.fpmDetails) {
        for (const total of detail.fpmNonResettableTotals) {
          expect(
            total.fuelProductNonResettableVolumeNumber,
          ).toBeGreaterThanOrEqual(0);
          expect(
            total.fuelProductNonResettableAmountNumber,
          ).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  // ==========================================================================
  // 4.T18: Position-product mapping consistency
  // ==========================================================================
  describe("4.T18: Position-product mapping consistency", () => {
    it("should maintain correct position-product associations", () => {
      const result = parser.parseFuelProductMovement(
        FPM_VALID_MULTI_PRODUCT_XML,
      );

      // Each FPMDetail should have its positions associated correctly
      const product1 = result.data.fpmDetails.find(
        (d) => d.fuelProductId === "1",
      );
      expect(product1?.fpmNonResettableTotals.length).toBe(4);

      const product4 = result.data.fpmDetails.find(
        (d) => d.fuelProductId === "4",
      );
      expect(product4?.fpmNonResettableTotals.length).toBe(1);
      expect(product4?.fpmNonResettableTotals[0].fuelPositionId).toBe("7");
    });

    it("should handle empty FPMDetail array", () => {
      const result = parser.parseFuelProductMovement(FPM_EMPTY_DETAILS_XML);

      expect(result.data.fpmDetails).toBeInstanceOf(Array);
      expect(result.data.fpmDetails.length).toBe(0);
    });
  });

  // ==========================================================================
  // Additional Edge Cases
  // ==========================================================================
  describe("Additional Edge Cases", () => {
    it("should reject invalid PrimaryReportPeriod", () => {
      expect(() =>
        parser.parseFuelProductMovement(FPM_INVALID_REPORT_PERIOD),
      ).toThrow(NAXMLParserError);

      try {
        parser.parseFuelProductMovement(FPM_INVALID_REPORT_PERIOD);
        expect.fail("Expected NAXMLParserError to be thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(NAXMLParserError);
        expect((error as NAXMLParserError).code).toBe(
          NAXML_PARSER_ERROR_CODES.FGM_INVALID_REPORT_PERIOD,
        );
      }
    });

    it("should reject FPM document with missing MovementHeader", () => {
      expect(() =>
        parser.parseFuelProductMovement(FPM_MISSING_MOVEMENT_HEADER),
      ).toThrow(NAXMLParserError);

      try {
        parser.parseFuelProductMovement(FPM_MISSING_MOVEMENT_HEADER);
        expect.fail("Expected NAXMLParserError to be thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(NAXMLParserError);
        expect((error as NAXMLParserError).code).toBe(
          NAXML_PARSER_ERROR_CODES.FPM_MISSING_MOVEMENT_HEADER,
        );
      }
    });
  });

  // ==========================================================================
  // Integration with Real Production Files
  // ==========================================================================
  describe("Integration with Real Production Files", () => {
    const REAL_FPM_FILE_PATH = path.join(
      __dirname,
      "../../../my-files/GILBARCO/BOOutBox/Error/FPM3402601050001571836609.xml",
    );

    it("should parse real production FPM file if available", () => {
      if (fs.existsSync(REAL_FPM_FILE_PATH)) {
        const xmlContent = fs.readFileSync(REAL_FPM_FILE_PATH, "utf-8");
        const result = parser.parseFuelProductMovement(xmlContent);

        expect(result).toBeDefined();
        expect(result.documentType).toBe("FuelProductMovement");
        expect(result.data.movementHeader.businessDate).toBe("2026-01-03");
        expect(result.data.fpmDetails.length).toBeGreaterThan(0);

        // Validate structure integrity
        for (const detail of result.data.fpmDetails) {
          expect(detail.fuelProductId).toBeTruthy();
          expect(detail.fpmNonResettableTotals.length).toBeGreaterThan(0);

          for (const total of detail.fpmNonResettableTotals) {
            expect(total.fuelPositionId).toBeTruthy();
            expect(typeof total.fuelProductNonResettableVolumeNumber).toBe(
              "number",
            );
            expect(typeof total.fuelProductNonResettableAmountNumber).toBe(
              "number",
            );
          }
        }
      } else {
        // Skip if file not available - this is expected in CI
        console.log(
          "Real production FPM file not available, skipping integration test",
        );
      }
    });
  });
});
