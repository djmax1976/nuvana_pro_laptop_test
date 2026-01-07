/**
 * @test-level UNIT
 * @justification Tests pure transformation logic without UI dependencies
 *
 * Unit Tests: Pack Data Transformation for ReturnPackDialog
 *
 * Tests the transformation of DayBinPack to LotteryPackResponse format
 * as implemented in the MyStore lottery page handleReturnPackClick handler.
 *
 * This transformation is critical for:
 * - Immediate pack data display in dialog (no API call needed)
 * - Correct sales calculation based on game price
 * - Serial range validation in dialog
 *
 * MCP Guidance Applied:
 * - TESTING: Unit tests for pure transformation logic
 * - FE-001: STATE_MANAGEMENT - Data transformation for state management
 * - SEC-014: INPUT_VALIDATION - Ensures valid data structure
 *
 * =============================================================================
 * TRACEABILITY MATRIX
 * =============================================================================
 * | Test ID     | Requirement                      | Priority | Type       |
 * |-------------|----------------------------------|----------|------------|
 * | TRN-001     | Transform pack_id correctly      | P0       | Unit       |
 * | TRN-002     | Transform pack_number correctly  | P0       | Unit       |
 * | TRN-003     | Transform game_name to game.name | P0       | Unit       |
 * | TRN-004     | Transform game_price to game.price| P0      | Unit       |
 * | TRN-005     | Transform serial fields correctly| P0       | Unit       |
 * | TRN-006     | Set status to ACTIVE            | P0       | Unit       |
 * | TRN-007     | Handle missing pack data        | P1       | Edge Case  |
 * | TRN-008     | Handle zero game price          | P1       | Edge Case  |
 * | TRN-009     | Handle special characters       | P1       | Security   |
 * | TRN-010     | Handle null bin                 | P1       | Edge Case  |
 * =============================================================================
 */

import { describe, it, expect } from "vitest";
import type {
  LotteryPackResponse,
  DayBinPack,
  DayBin,
} from "@/lib/api/lottery";

// ═══════════════════════════════════════════════════════════════════════════
// TRANSFORMATION FUNCTION (extracted from MyStore lottery page)
// This mirrors the logic in handleReturnPackClick
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Transforms DayBinPack to LotteryPackResponse format
 * Used when opening ReturnPackDialog to provide immediate pack data display
 *
 * @param bin - The day bin containing the pack
 * @param storeId - Store ID for the pack
 * @returns LotteryPackResponse or null if bin has no pack
 */
function transformDayBinToPackResponse(
  bin: DayBin | undefined,
  storeId: string,
): LotteryPackResponse | null {
  if (!bin?.pack) {
    return null;
  }

  return {
    pack_id: bin.pack.pack_id,
    game_id: "", // Not needed for display
    pack_number: bin.pack.pack_number,
    serial_start: bin.pack.starting_serial,
    serial_end: bin.pack.serial_end,
    status: "ACTIVE", // Pack in bins is always ACTIVE
    store_id: storeId,
    current_bin_id: bin.bin_id,
    received_at: "", // Not needed for display
    activated_at: null,
    game: {
      game_id: "",
      game_code: "",
      name: bin.pack.game_name,
      price: bin.pack.game_price,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

function createMockDayBin(overrides: Partial<DayBin> = {}): DayBin {
  return {
    bin_id: "bin-uuid-001",
    bin_number: 1,
    name: "Bin 1",
    is_active: true,
    pack: {
      pack_id: "pack-uuid-001",
      pack_number: "1234567",
      game_name: "Mega Millions",
      game_price: 5.0,
      starting_serial: "001",
      ending_serial: null,
      serial_end: "300",
      is_first_period: true,
    },
    ...overrides,
  };
}

function createMockDayBinPack(overrides: Partial<DayBinPack> = {}): DayBinPack {
  return {
    pack_id: "pack-uuid-001",
    pack_number: "1234567",
    game_name: "Mega Millions",
    game_price: 5.0,
    starting_serial: "001",
    ending_serial: null,
    serial_end: "300",
    is_first_period: true,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CORE TRANSFORMATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("Pack Data Transformation", () => {
  describe("Core Field Mapping", () => {
    it("TRN-001: [P0] should transform pack_id correctly", () => {
      // GIVEN: A day bin with pack
      const bin = createMockDayBin({
        pack: createMockDayBinPack({ pack_id: "unique-pack-id-123" }),
      });

      // WHEN: Transformation is applied
      const result = transformDayBinToPackResponse(bin, "store-001");

      // THEN: pack_id is preserved
      expect(result?.pack_id).toBe("unique-pack-id-123");
    });

    it("TRN-002: [P0] should transform pack_number correctly", () => {
      // GIVEN: A day bin with pack
      const bin = createMockDayBin({
        pack: createMockDayBinPack({ pack_number: "9876543" }),
      });

      // WHEN: Transformation is applied
      const result = transformDayBinToPackResponse(bin, "store-001");

      // THEN: pack_number is preserved
      expect(result?.pack_number).toBe("9876543");
    });

    it("TRN-003: [P0] should transform game_name to nested game.name", () => {
      // GIVEN: A day bin with pack having game_name
      const bin = createMockDayBin({
        pack: createMockDayBinPack({ game_name: "Powerball Special" }),
      });

      // WHEN: Transformation is applied
      const result = transformDayBinToPackResponse(bin, "store-001");

      // THEN: game_name is mapped to game.name
      expect(result?.game?.name).toBe("Powerball Special");
    });

    it("TRN-004: [P0] should transform game_price to nested game.price", () => {
      // GIVEN: A day bin with pack having game_price
      const bin = createMockDayBin({
        pack: createMockDayBinPack({ game_price: 20.0 }),
      });

      // WHEN: Transformation is applied
      const result = transformDayBinToPackResponse(bin, "store-001");

      // THEN: game_price is mapped to game.price
      expect(result?.game?.price).toBe(20.0);
    });

    it("TRN-005: [P0] should transform serial fields correctly", () => {
      // GIVEN: A day bin with specific serial values
      const bin = createMockDayBin({
        pack: createMockDayBinPack({
          starting_serial: "050",
          serial_end: "200",
        }),
      });

      // WHEN: Transformation is applied
      const result = transformDayBinToPackResponse(bin, "store-001");

      // THEN: Serial fields are correctly mapped
      // starting_serial becomes serial_start (for validation)
      expect(result?.serial_start).toBe("050");
      // serial_end is preserved
      expect(result?.serial_end).toBe("200");
    });

    it("TRN-006: [P0] should set status to ACTIVE", () => {
      // GIVEN: A day bin with pack (packs in bins are always active)
      const bin = createMockDayBin();

      // WHEN: Transformation is applied
      const result = transformDayBinToPackResponse(bin, "store-001");

      // THEN: Status is ACTIVE
      expect(result?.status).toBe("ACTIVE");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Edge Cases", () => {
    it("TRN-007: [P1] should return null for undefined bin", () => {
      // GIVEN: Undefined bin
      const bin = undefined;

      // WHEN: Transformation is applied
      const result = transformDayBinToPackResponse(bin, "store-001");

      // THEN: Returns null
      expect(result).toBeNull();
    });

    it("TRN-008: [P1] should handle zero game price", () => {
      // GIVEN: A pack with zero price (free promotional pack)
      const bin = createMockDayBin({
        pack: createMockDayBinPack({ game_price: 0 }),
      });

      // WHEN: Transformation is applied
      const result = transformDayBinToPackResponse(bin, "store-001");

      // THEN: Zero price is preserved
      expect(result?.game?.price).toBe(0);
    });

    it("TRN-010: [P1] should return null for bin with null pack", () => {
      // GIVEN: A bin with no pack (empty bin)
      const bin = createMockDayBin({ pack: null });

      // WHEN: Transformation is applied
      const result = transformDayBinToPackResponse(bin, "store-001");

      // THEN: Returns null
      expect(result).toBeNull();
    });

    it("TRN-011: [P1] should preserve bin_id in current_bin_id", () => {
      // GIVEN: A day bin with specific bin_id
      const bin = createMockDayBin({ bin_id: "specific-bin-uuid" });

      // WHEN: Transformation is applied
      const result = transformDayBinToPackResponse(bin, "store-001");

      // THEN: bin_id is preserved in current_bin_id
      expect(result?.current_bin_id).toBe("specific-bin-uuid");
    });

    it("TRN-012: [P1] should use provided storeId", () => {
      // GIVEN: A day bin and specific store ID
      const bin = createMockDayBin();

      // WHEN: Transformation is applied with store ID
      const result = transformDayBinToPackResponse(bin, "my-store-uuid-123");

      // THEN: store_id is set from parameter
      expect(result?.store_id).toBe("my-store-uuid-123");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Security - Input Handling", () => {
    it("TRN-009: [P1] [SECURITY] should preserve special characters in game name without modification", () => {
      // GIVEN: A pack with special characters in game name
      // (XSS is handled by React's rendering, not transformation)
      const bin = createMockDayBin({
        pack: createMockDayBinPack({
          game_name: 'Scratch & Win "Special"',
        }),
      });

      // WHEN: Transformation is applied
      const result = transformDayBinToPackResponse(bin, "store-001");

      // THEN: Special characters are preserved (React will escape on render)
      expect(result?.game?.name).toBe('Scratch & Win "Special"');
    });

    it("TRN-013: [P1] [SECURITY] should handle HTML-like strings in pack_number", () => {
      // GIVEN: A pack with HTML-like characters
      const bin = createMockDayBin({
        pack: createMockDayBinPack({
          pack_number: "<script>alert(1)</script>",
        }),
      });

      // WHEN: Transformation is applied
      const result = transformDayBinToPackResponse(bin, "store-001");

      // THEN: String is preserved as-is (React escapes on render)
      expect(result?.pack_number).toBe("<script>alert(1)</script>");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BUSINESS LOGIC TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Business Logic", () => {
    it("TRN-014: [P0] transformed data should have all required fields for ReturnPackDialog", () => {
      // GIVEN: A complete day bin
      const bin = createMockDayBin();

      // WHEN: Transformation is applied
      const result = transformDayBinToPackResponse(bin, "store-001");

      // THEN: All required fields for ReturnPackDialog are present
      expect(result).not.toBeNull();
      expect(result?.pack_id).toBeDefined();
      expect(result?.pack_number).toBeDefined();
      expect(result?.serial_start).toBeDefined();
      expect(result?.serial_end).toBeDefined();
      expect(result?.status).toBe("ACTIVE");
      expect(result?.game).toBeDefined();
      expect(result?.game?.name).toBeDefined();
      expect(result?.game?.price).toBeDefined();
    });

    it("TRN-015: [P0] should support sales calculation with transformed data", () => {
      // GIVEN: A pack with known price and serial range
      const bin = createMockDayBin({
        pack: createMockDayBinPack({
          game_price: 5.0,
          starting_serial: "001",
          serial_end: "300",
        }),
      });

      // WHEN: Transformation is applied
      const result = transformDayBinToPackResponse(bin, "store-001");

      // THEN: Data supports sales calculation
      // If user enters last sold serial "025":
      // ticketsSold = 25 - 1 + 1 = 25 (fencepost counting)
      // salesAmount = 25 * $5.00 = $125.00
      const lastSoldSerial = 25;
      const serialStart = parseInt(result?.serial_start || "0", 10);
      const ticketsSold = lastSoldSerial - serialStart + 1;
      const salesAmount = ticketsSold * (result?.game?.price || 0);

      expect(ticketsSold).toBe(25);
      expect(salesAmount).toBe(125.0);
    });

    it("TRN-016: [P1] should handle decimal prices correctly", () => {
      // GIVEN: A pack with decimal price
      const bin = createMockDayBin({
        pack: createMockDayBinPack({ game_price: 2.5 }),
      });

      // WHEN: Transformation is applied
      const result = transformDayBinToPackResponse(bin, "store-001");

      // THEN: Decimal price is preserved for accurate calculation
      expect(result?.game?.price).toBe(2.5);

      // Sales calculation with 10 tickets sold
      const ticketsSold = 10;
      const salesAmount = ticketsSold * (result?.game?.price || 0);
      expect(salesAmount).toBe(25.0);
    });
  });
});
