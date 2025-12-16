/**
 * @test-level UNIT
 * @justification Tests pure business logic functions - no dependencies, fast execution
 * @story Lottery Day Closing Feature
 * @priority P0 (Critical - Business Logic)
 *
 * Lottery Day Close Unit Tests
 *
 * Tests pure business logic for day closing:
 * - Bin matching algorithm
 * - Closing serial validation
 * - Completion check logic
 * - Data transformation
 *
 * These functions can be extracted to a utility module and used in components.
 */

import { describe, it, expect } from "vitest";
import type { DayBin, DayBinPack } from "@/lib/api/lottery";
import {
  matchSerialToBin,
  validateClosingSerial,
  checkAllBinsScanned,
  transformToApiPayload,
  type ScannedBin,
} from "@/lib/utils/lottery/day-close-helpers";

// ═══════════════════════════════════════════════════════════════════════════
// TEST DATA FACTORIES
// ═══════════════════════════════════════════════════════════════════════════

function createMockBin(overrides: Partial<DayBin> = {}): DayBin {
  const binId =
    overrides.bin_id || `bin-${Math.random().toString(36).substring(7)}`;
  const packId = `pack-${Math.random().toString(36).substring(7)}`;

  return {
    bin_id: binId,
    bin_number: 1,
    name: "Test Bin",
    is_active: true,
    pack: {
      pack_id: packId,
      pack_number: "1234567",
      game_name: "Test Game",
      game_price: 5.0,
      starting_serial: "001",
      ending_serial: null,
      serial_end: "050",
    },
    ...overrides,
  };
}

function createMockPack(overrides: Partial<DayBinPack> = {}): DayBinPack {
  return {
    pack_id: `pack-${Math.random().toString(36).substring(7)}`,
    pack_number: "1234567",
    game_name: "Test Game",
    game_price: 5.0,
    starting_serial: "001",
    ending_serial: null,
    serial_end: "050",
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: matchSerialToBin
// ═══════════════════════════════════════════════════════════════════════════

describe("UNIT: matchSerialToBin - Bin Matching Algorithm", () => {
  it("DAY-CLOSE-001: [P0] should match when game_code AND pack_number both match", () => {
    // GIVEN: A bin with pack and matching game code/pack number
    const bins: DayBin[] = [
      createMockBin({
        pack: createMockPack({ pack_id: "pack-1", pack_number: "1234567" }),
      }),
    ];
    const gamesMap = new Map([["pack-1", { game_code: "0001" }]]);
    const parsedSerial = {
      game_code: "0001",
      pack_number: "1234567",
      serial_start: "025",
    };

    // WHEN: Matching the serial
    const result = matchSerialToBin(parsedSerial, bins, gamesMap);

    // THEN: Match is successful
    expect(
      result.matched,
      "Should match when both game_code and pack_number match",
    ).toBe(true);
    expect(result.bin, "Should return the matched bin").toBeDefined();
    expect(result.bin?.pack?.pack_id, "Should match the correct bin").toBe(
      "pack-1",
    );
    expect(result.error, "Should not have an error").toBeUndefined();
  });

  it("DAY-CLOSE-002: [P0] should not match when only game_code matches", () => {
    // GIVEN: A bin with matching game code but different pack number
    const bins: DayBin[] = [
      createMockBin({
        pack: createMockPack({ pack_id: "pack-1", pack_number: "1234567" }),
      }),
    ];
    const gamesMap = new Map([["pack-1", { game_code: "0001" }]]);
    const parsedSerial = {
      game_code: "0001", // Matches
      pack_number: "9999999", // Does NOT match
      serial_start: "025",
    };

    // WHEN: Matching the serial
    const result = matchSerialToBin(parsedSerial, bins, gamesMap);

    // THEN: Match fails
    expect(result.matched, "Should not match when pack_number differs").toBe(
      false,
    );
    expect(result.bin, "Should not return a bin").toBeUndefined();
    expect(result.error, "Should return an error").toContain("No bin found");
  });

  it("DAY-CLOSE-003: [P0] should not match when only pack_number matches", () => {
    // GIVEN: A bin with matching pack number but different game code
    const bins: DayBin[] = [
      createMockBin({
        pack: createMockPack({ pack_id: "pack-1", pack_number: "1234567" }),
      }),
    ];
    const gamesMap = new Map([["pack-1", { game_code: "0001" }]]);
    const parsedSerial = {
      game_code: "0002", // Does NOT match
      pack_number: "1234567", // Matches
      serial_start: "025",
    };

    // WHEN: Matching the serial
    const result = matchSerialToBin(parsedSerial, bins, gamesMap);

    // THEN: Match fails
    expect(result.matched, "Should not match when game_code differs").toBe(
      false,
    );
    expect(result.bin, "Should not return a bin").toBeUndefined();
    expect(result.error, "Should return an error").toContain("No bin found");
  });

  it("DAY-CLOSE-004: [P0] should return error for no matching bin found", () => {
    // GIVEN: Bins with non-matching game code and pack number
    const bins: DayBin[] = [
      createMockBin({
        pack: createMockPack({ pack_id: "pack-1", pack_number: "1111111" }),
      }),
    ];
    const gamesMap = new Map([["pack-1", { game_code: "0001" }]]);
    const parsedSerial = {
      game_code: "0002",
      pack_number: "2222222",
      serial_start: "025",
    };

    // WHEN: Matching the serial
    const result = matchSerialToBin(parsedSerial, bins, gamesMap);

    // THEN: Returns meaningful error
    expect(result.matched, "Should not match").toBe(false);
    expect(result.error, "Should contain game code").toContain("0002");
    expect(result.error, "Should contain pack number").toContain("2222222");
  });

  it("DAY-CLOSE-005: [P0] should handle bins with null pack (empty bins)", () => {
    // GIVEN: Mix of bins with and without packs
    const bins: DayBin[] = [
      createMockBin({ pack: null }), // Empty bin
      createMockBin({
        pack: createMockPack({ pack_id: "pack-2", pack_number: "1234567" }),
      }),
    ];
    const gamesMap = new Map([["pack-2", { game_code: "0001" }]]);
    const parsedSerial = {
      game_code: "0001",
      pack_number: "1234567",
      serial_start: "025",
    };

    // WHEN: Matching the serial
    const result = matchSerialToBin(parsedSerial, bins, gamesMap);

    // THEN: Matches the non-null bin
    expect(result.matched, "Should match despite empty bins").toBe(true);
    expect(result.bin?.pack?.pack_id, "Should match pack-2").toBe("pack-2");
  });

  it("DAY-CLOSE-006: [P0] should be case-insensitive for game codes", () => {
    // GIVEN: Game code in different case
    const bins: DayBin[] = [
      createMockBin({
        pack: createMockPack({ pack_id: "pack-1", pack_number: "1234567" }),
      }),
    ];
    const gamesMap = new Map([["pack-1", { game_code: "ABC1" }]]);
    const parsedSerial = {
      game_code: "abc1", // Lowercase
      pack_number: "1234567",
      serial_start: "025",
    };

    // WHEN: Matching the serial
    const result = matchSerialToBin(parsedSerial, bins, gamesMap);

    // THEN: Matches case-insensitively
    expect(result.matched, "Should match game codes case-insensitively").toBe(
      true,
    );
    expect(result.bin?.pack?.pack_id, "Should match pack-1").toBe("pack-1");
  });

  it("DAY-CLOSE-007: [P1] should handle missing game code in gamesMap", () => {
    // GIVEN: Bin's pack_id not in gamesMap
    const bins: DayBin[] = [
      createMockBin({
        pack: createMockPack({ pack_id: "pack-1", pack_number: "1234567" }),
      }),
    ];
    const gamesMap = new Map(); // Empty map
    const parsedSerial = {
      game_code: "0001",
      pack_number: "1234567",
      serial_start: "025",
    };

    // WHEN: Matching the serial
    const result = matchSerialToBin(parsedSerial, bins, gamesMap);

    // THEN: Does not match (game code undefined)
    expect(
      result.matched,
      "Should not match when game code missing from map",
    ).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: validateClosingSerial
// ═══════════════════════════════════════════════════════════════════════════

describe("UNIT: validateClosingSerial - Serial Validation", () => {
  it("DAY-CLOSE-008: [P0] should pass for serial within valid range", () => {
    // GIVEN: Valid closing serial between start and end
    const closingSerial = "025";
    const startingSerial = "001";
    const serialEnd = "050";

    // WHEN: Validating the closing serial
    const result = validateClosingSerial(
      closingSerial,
      startingSerial,
      serialEnd,
    );

    // THEN: Validation passes
    expect(result.valid, "Should be valid when within range").toBe(true);
    expect(result.error, "Should not have an error").toBeUndefined();
  });

  it("DAY-CLOSE-009: [P0] should pass for serial equal to starting_serial", () => {
    // GIVEN: Closing serial equal to starting serial (no tickets sold)
    const closingSerial = "001";
    const startingSerial = "001";
    const serialEnd = "050";

    // WHEN: Validating the closing serial
    const result = validateClosingSerial(
      closingSerial,
      startingSerial,
      serialEnd,
    );

    // THEN: Validation passes
    expect(result.valid, "Should be valid when equal to starting_serial").toBe(
      true,
    );
  });

  it("DAY-CLOSE-010: [P0] should pass for serial equal to serial_end", () => {
    // GIVEN: Closing serial equal to pack maximum (all tickets sold)
    const closingSerial = "050";
    const startingSerial = "001";
    const serialEnd = "050";

    // WHEN: Validating the closing serial
    const result = validateClosingSerial(
      closingSerial,
      startingSerial,
      serialEnd,
    );

    // THEN: Validation passes
    expect(result.valid, "Should be valid when equal to serial_end").toBe(true);
  });

  it("DAY-CLOSE-011: [P0] should fail for serial below starting_serial", () => {
    // GIVEN: Closing serial before starting serial (impossible)
    const closingSerial = "005";
    const startingSerial = "010";
    const serialEnd = "050";

    // WHEN: Validating the closing serial
    const result = validateClosingSerial(
      closingSerial,
      startingSerial,
      serialEnd,
    );

    // THEN: Validation fails
    expect(result.valid, "Should be invalid when below starting_serial").toBe(
      false,
    );
    expect(result.error, "Should contain error message").toContain(
      "below starting serial",
    );
    expect(result.error, "Should mention closing serial").toContain("005");
    expect(result.error, "Should mention starting serial").toContain("010");
  });

  it("DAY-CLOSE-012: [P0] should fail for serial above serial_end", () => {
    // GIVEN: Closing serial beyond pack maximum (impossible)
    const closingSerial = "051";
    const startingSerial = "001";
    const serialEnd = "050";

    // WHEN: Validating the closing serial
    const result = validateClosingSerial(
      closingSerial,
      startingSerial,
      serialEnd,
    );

    // THEN: Validation fails
    expect(result.valid, "Should be invalid when above serial_end").toBe(false);
    expect(result.error, "Should contain error message").toContain(
      "exceeds pack maximum",
    );
    expect(result.error, "Should mention closing serial").toContain("051");
    expect(result.error, "Should mention serial_end").toContain("050");
  });

  it("DAY-CLOSE-013: [P0] should fail for non-3-digit serial", () => {
    // GIVEN: Serial numbers with wrong length
    const invalidSerials = ["1", "12", "1234", "12345"];
    const startingSerial = "001";
    const serialEnd = "050";

    // WHEN/THEN: Each should fail
    invalidSerials.forEach((serial) => {
      const result = validateClosingSerial(serial, startingSerial, serialEnd);
      expect(
        result.valid,
        `Serial "${serial}" should be invalid (wrong length)`,
      ).toBe(false);
      expect(
        result.error,
        `Serial "${serial}" should have error about 3 digits`,
      ).toContain("exactly 3 digits");
    });
  });

  it("DAY-CLOSE-014: [P0] should fail for non-numeric serial", () => {
    // GIVEN: Non-numeric serial values
    const invalidSerials = ["abc", "01a", "0!1", "---"];
    const startingSerial = "001";
    const serialEnd = "050";

    // WHEN/THEN: Each should fail
    invalidSerials.forEach((serial) => {
      const result = validateClosingSerial(serial, startingSerial, serialEnd);
      expect(
        result.valid,
        `Serial "${serial}" should be invalid (non-numeric)`,
      ).toBe(false);
      expect(
        result.error,
        `Serial "${serial}" should have numeric error`,
      ).toBeDefined();
    });
  });

  it("DAY-CLOSE-015: [P0] should handle leading zeros correctly (e.g., '001' vs '1')", () => {
    // GIVEN: Serials with leading zeros
    const closingSerial = "001";
    const startingSerial = "001";
    const serialEnd = "050";

    // WHEN: Validating with leading zeros
    const result = validateClosingSerial(
      closingSerial,
      startingSerial,
      serialEnd,
    );

    // THEN: Leading zeros are preserved, validation works
    expect(result.valid, "'001' should be valid").toBe(true);

    // ALSO TEST: "1" (without leading zeros) should fail format check
    const invalidResult = validateClosingSerial("1", startingSerial, serialEnd);
    expect(invalidResult.valid, "'1' should be invalid (not 3 digits)").toBe(
      false,
    );
  });

  it("DAY-CLOSE-016: [P0 - CRITICAL] should compare serials as strings (not numbers) - '009' < '010'", () => {
    // GIVEN: Serial numbers that would compare differently as numbers vs strings
    // String comparison: "009" < "010" (correct)
    // Number comparison: 9 < 10 (also correct, but loses leading zeros)
    const closingSerial = "009";
    const startingSerial = "008";
    const serialEnd = "010";

    // WHEN: Validating
    const result = validateClosingSerial(
      closingSerial,
      startingSerial,
      serialEnd,
    );

    // THEN: Should use string comparison
    expect(
      result.valid,
      "'009' should be between '008' and '010' (string comparison)",
    ).toBe(true);
  });

  it("DAY-CLOSE-017: [P0 - CRITICAL] should compare '050' > '049' correctly", () => {
    // GIVEN: Boundary case for string comparison
    const closingSerial = "050";
    const startingSerial = "049";
    const serialEnd = "050";

    // WHEN: Validating
    const result = validateClosingSerial(
      closingSerial,
      startingSerial,
      serialEnd,
    );

    // THEN: String comparison works correctly
    expect(result.valid, "'050' should be >= '049' (string comparison)").toBe(
      true,
    );
  });

  it("DAY-CLOSE-018: [P1] should handle edge case: all zeros", () => {
    // GIVEN: All zeros
    const closingSerial = "000";
    const startingSerial = "000";
    const serialEnd = "000";

    // WHEN: Validating
    const result = validateClosingSerial(
      closingSerial,
      startingSerial,
      serialEnd,
    );

    // THEN: Valid
    expect(
      result.valid,
      "'000' should be valid when all serials are '000'",
    ).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: checkAllBinsScanned
// ═══════════════════════════════════════════════════════════════════════════

describe("UNIT: checkAllBinsScanned - Completion Check", () => {
  it("DAY-CLOSE-019: [P0] should return complete=true when all active bins scanned", () => {
    // GIVEN: Bins with active packs, all scanned
    const bins: DayBin[] = [
      createMockBin({ pack: createMockPack({ pack_id: "pack-1" }) }),
      createMockBin({ pack: createMockPack({ pack_id: "pack-2" }) }),
    ];
    const scannedPackIds = new Set(["pack-1", "pack-2"]);

    // WHEN: Checking completion
    const result = checkAllBinsScanned(bins, scannedPackIds);

    // THEN: Complete
    expect(result.complete, "Should be complete when all packs scanned").toBe(
      true,
    );
    expect(result.pendingBins, "Should have no pending bins").toHaveLength(0);
  });

  it("DAY-CLOSE-020: [P0] should return complete=false with pending bins when not all scanned", () => {
    // GIVEN: 3 bins, only 2 scanned
    const bins: DayBin[] = [
      createMockBin({ pack: createMockPack({ pack_id: "pack-1" }) }),
      createMockBin({ pack: createMockPack({ pack_id: "pack-2" }) }),
      createMockBin({ pack: createMockPack({ pack_id: "pack-3" }) }),
    ];
    const scannedPackIds = new Set(["pack-1", "pack-2"]);

    // WHEN: Checking completion
    const result = checkAllBinsScanned(bins, scannedPackIds);

    // THEN: Not complete
    expect(
      result.complete,
      "Should not be complete when pack-3 not scanned",
    ).toBe(false);
    expect(result.pendingBins, "Should have 1 pending bin").toHaveLength(1);
    expect(
      result.pendingBins[0].pack?.pack_id,
      "Pending bin should be pack-3",
    ).toBe("pack-3");
  });

  it("DAY-CLOSE-021: [P0] should ignore empty bins (pack: null) in completion check", () => {
    // GIVEN: Mix of active and empty bins
    const bins: DayBin[] = [
      createMockBin({ pack: createMockPack({ pack_id: "pack-1" }) }),
      createMockBin({ pack: null }), // Empty bin - should be ignored
      createMockBin({ pack: createMockPack({ pack_id: "pack-2" }) }),
      createMockBin({ pack: null }), // Another empty bin
    ];
    const scannedPackIds = new Set(["pack-1", "pack-2"]);

    // WHEN: Checking completion
    const result = checkAllBinsScanned(bins, scannedPackIds);

    // THEN: Complete (empty bins ignored)
    expect(result.complete, "Should be complete (empty bins ignored)").toBe(
      true,
    );
    expect(result.pendingBins, "Should have no pending bins").toHaveLength(0);
  });

  it("DAY-CLOSE-022: [P0] should handle edge case of no active bins (all empty)", () => {
    // GIVEN: All bins are empty
    const bins: DayBin[] = [
      createMockBin({ pack: null }),
      createMockBin({ pack: null }),
      createMockBin({ pack: null }),
    ];
    const scannedPackIds = new Set<string>();

    // WHEN: Checking completion
    const result = checkAllBinsScanned(bins, scannedPackIds);

    // THEN: Complete (no active bins to scan)
    expect(result.complete, "Should be complete when all bins empty").toBe(
      true,
    );
    expect(result.pendingBins, "Should have no pending bins").toHaveLength(0);
  });

  it("DAY-CLOSE-023: [P0] should return correct pending bins list", () => {
    // GIVEN: 4 bins, 2 scanned, 2 pending
    const bins: DayBin[] = [
      createMockBin({
        bin_id: "bin-1",
        pack: createMockPack({ pack_id: "pack-1" }),
      }),
      createMockBin({
        bin_id: "bin-2",
        pack: createMockPack({ pack_id: "pack-2" }),
      }),
      createMockBin({
        bin_id: "bin-3",
        pack: createMockPack({ pack_id: "pack-3" }),
      }),
      createMockBin({
        bin_id: "bin-4",
        pack: createMockPack({ pack_id: "pack-4" }),
      }),
    ];
    const scannedPackIds = new Set(["pack-1", "pack-3"]);

    // WHEN: Checking completion
    const result = checkAllBinsScanned(bins, scannedPackIds);

    // THEN: Pending bins are pack-2 and pack-4
    expect(result.complete, "Should not be complete").toBe(false);
    expect(result.pendingBins, "Should have 2 pending bins").toHaveLength(2);

    const pendingPackIds = result.pendingBins.map((b) => b.pack?.pack_id);
    expect(pendingPackIds, "Should include pack-2").toContain("pack-2");
    expect(pendingPackIds, "Should include pack-4").toContain("pack-4");
  });

  it("DAY-CLOSE-024: [P1] should handle single bin store", () => {
    // GIVEN: Store with only 1 bin
    const bins: DayBin[] = [
      createMockBin({ pack: createMockPack({ pack_id: "pack-1" }) }),
    ];
    const scannedPackIds = new Set(["pack-1"]);

    // WHEN: Checking completion
    const result = checkAllBinsScanned(bins, scannedPackIds);

    // THEN: Complete
    expect(
      result.complete,
      "Single bin store should be complete when scanned",
    ).toBe(true);
  });

  it("DAY-CLOSE-025: [P1] should handle store with many bins (10+)", () => {
    // GIVEN: Store with 12 bins
    const bins: DayBin[] = Array.from({ length: 12 }, (_, i) =>
      createMockBin({
        bin_id: `bin-${i + 1}`,
        pack: createMockPack({ pack_id: `pack-${i + 1}` }),
      }),
    );
    const scannedPackIds = new Set(
      Array.from({ length: 12 }, (_, i) => `pack-${i + 1}`),
    );

    // WHEN: Checking completion
    const result = checkAllBinsScanned(bins, scannedPackIds);

    // THEN: Complete
    expect(
      result.complete,
      "12-bin store should be complete when all scanned",
    ).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: transformToApiPayload
// ═══════════════════════════════════════════════════════════════════════════

describe("UNIT: transformToApiPayload - Data Transformation", () => {
  it("DAY-CLOSE-026: [P1] should transform scanned bins to correct API format", () => {
    // GIVEN: Scanned bins with closing serials
    const scannedBins: ScannedBin[] = [
      {
        bin_id: "bin-1",
        pack_id: "pack-1",
        closing_serial: "025",
      },
      {
        bin_id: "bin-2",
        pack_id: "pack-2",
        closing_serial: "030",
      },
    ];

    // WHEN: Transforming to API payload
    const payload = transformToApiPayload(scannedBins);

    // THEN: Correct format
    expect(payload.closings, "Should have closings array").toHaveLength(2);
    expect(payload.closings[0], "Should have pack_id").toHaveProperty(
      "pack_id",
      "pack-1",
    );
    expect(payload.closings[0], "Should have closing_serial").toHaveProperty(
      "closing_serial",
      "025",
    );
    expect(payload.closings[1], "Should have pack_id").toHaveProperty(
      "pack_id",
      "pack-2",
    );
    expect(payload.closings[1], "Should have closing_serial").toHaveProperty(
      "closing_serial",
      "030",
    );
  });

  it("DAY-CLOSE-027: [P1] should preserve pack_id and closing_serial", () => {
    // GIVEN: Scanned bin with specific values
    const scannedBins: ScannedBin[] = [
      {
        bin_id: "bin-abc-123",
        pack_id: "pack-xyz-789",
        closing_serial: "042",
      },
    ];

    // WHEN: Transforming to API payload
    const payload = transformToApiPayload(scannedBins);

    // THEN: Values preserved exactly
    expect(payload.closings[0].pack_id, "pack_id should be preserved").toBe(
      "pack-xyz-789",
    );
    expect(
      payload.closings[0].closing_serial,
      "closing_serial should be preserved",
    ).toBe("042");
  });

  it("DAY-CLOSE-028: [P1] should set entry_method to 'SCAN' by default", () => {
    // GIVEN: Scanned bins (no entry method specified)
    const scannedBins: ScannedBin[] = [
      {
        bin_id: "bin-1",
        pack_id: "pack-1",
        closing_serial: "025",
      },
    ];

    // WHEN: Transforming to API payload
    const payload = transformToApiPayload(scannedBins);

    // THEN: entry_method defaults to 'SCAN'
    expect(payload.entry_method, "Should default to 'SCAN'").toBe("SCAN");
  });

  it("DAY-CLOSE-029: [P1] should support 'MANUAL' entry method", () => {
    // GIVEN: Manually entered bins
    const scannedBins: ScannedBin[] = [
      {
        bin_id: "bin-1",
        pack_id: "pack-1",
        closing_serial: "025",
      },
    ];

    // WHEN: Transforming with MANUAL entry method
    const payload = transformToApiPayload(scannedBins, "MANUAL");

    // THEN: entry_method is 'MANUAL'
    expect(payload.entry_method, "Should be 'MANUAL'").toBe("MANUAL");
  });

  it("DAY-CLOSE-030: [P1] should not include bin_id in API payload", () => {
    // GIVEN: Scanned bins with bin_id
    const scannedBins: ScannedBin[] = [
      {
        bin_id: "bin-1",
        pack_id: "pack-1",
        closing_serial: "025",
      },
    ];

    // WHEN: Transforming to API payload
    const payload = transformToApiPayload(scannedBins);

    // THEN: bin_id should not be in the closings array
    expect(
      payload.closings[0],
      "Should not have bin_id property",
    ).not.toHaveProperty("bin_id");
  });

  it("DAY-CLOSE-031: [P1] should handle empty scanned bins array", () => {
    // GIVEN: No scanned bins
    const scannedBins: ScannedBin[] = [];

    // WHEN: Transforming to API payload
    const payload = transformToApiPayload(scannedBins);

    // THEN: Empty closings array
    expect(payload.closings, "Should have empty closings array").toHaveLength(
      0,
    );
    expect(payload.entry_method, "Should still have entry_method").toBe("SCAN");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EDGE CASES & INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

describe("UNIT: Lottery Day Close - Edge Cases", () => {
  it("DAY-CLOSE-032: [P1] should handle pack numbers with leading zeros", () => {
    // GIVEN: Pack number with leading zeros
    const bins: DayBin[] = [
      createMockBin({
        pack: createMockPack({ pack_id: "pack-1", pack_number: "0000123" }),
      }),
    ];
    const gamesMap = new Map([["pack-1", { game_code: "0001" }]]);
    const parsedSerial = {
      game_code: "0001",
      pack_number: "0000123", // Leading zeros
      serial_start: "025",
    };

    // WHEN: Matching the serial
    const result = matchSerialToBin(parsedSerial, bins, gamesMap);

    // THEN: Matches correctly (leading zeros preserved)
    expect(
      result.matched,
      "Should match with leading zeros in pack_number",
    ).toBe(true);
  });

  it("DAY-CLOSE-033: [P1] should handle serials at boundaries ('001', '999')", () => {
    // GIVEN: Serial at minimum and maximum boundaries
    const testCases = [
      { serial: "001", start: "001", end: "999", shouldPass: true },
      { serial: "999", start: "001", end: "999", shouldPass: true },
      { serial: "000", start: "001", end: "999", shouldPass: false },
    ];

    testCases.forEach(({ serial, start, end, shouldPass }) => {
      // WHEN: Validating
      const result = validateClosingSerial(serial, start, end);

      // THEN: Validation matches expectation
      expect(
        result.valid,
        `Serial "${serial}" should ${shouldPass ? "pass" : "fail"}`,
      ).toBe(shouldPass);
    });
  });

  it("DAY-CLOSE-034: [P1] should handle multiple bins with same game but different packs", () => {
    // GIVEN: Multiple bins with same game code but different pack numbers
    const bins: DayBin[] = [
      createMockBin({
        pack: createMockPack({ pack_id: "pack-1", pack_number: "1111111" }),
      }),
      createMockBin({
        pack: createMockPack({ pack_id: "pack-2", pack_number: "2222222" }),
      }),
      createMockBin({
        pack: createMockPack({ pack_id: "pack-3", pack_number: "3333333" }),
      }),
    ];
    const gamesMap = new Map([
      ["pack-1", { game_code: "0001" }],
      ["pack-2", { game_code: "0001" }], // Same game
      ["pack-3", { game_code: "0001" }], // Same game
    ]);
    const parsedSerial = {
      game_code: "0001",
      pack_number: "2222222", // Match pack-2
      serial_start: "025",
    };

    // WHEN: Matching the serial
    const result = matchSerialToBin(parsedSerial, bins, gamesMap);

    // THEN: Matches the correct pack (pack-2)
    expect(
      result.matched,
      "Should match despite multiple bins with same game",
    ).toBe(true);
    expect(result.bin?.pack?.pack_id, "Should match pack-2 specifically").toBe(
      "pack-2",
    );
  });

  it("DAY-CLOSE-035: [P2] should handle realistic full day closing workflow", () => {
    // GIVEN: Realistic store with 5 bins
    const bins: DayBin[] = [
      createMockBin({
        bin_id: "bin-1",
        bin_number: 1,
        pack: createMockPack({
          pack_id: "pack-1",
          pack_number: "1234567",
          starting_serial: "001",
          serial_end: "050",
        }),
      }),
      createMockBin({
        bin_id: "bin-2",
        bin_number: 2,
        pack: createMockPack({
          pack_id: "pack-2",
          pack_number: "7654321",
          starting_serial: "010",
          serial_end: "100",
        }),
      }),
      createMockBin({
        bin_id: "bin-3",
        bin_number: 3,
        pack: null, // Empty bin
      }),
      createMockBin({
        bin_id: "bin-4",
        bin_number: 4,
        pack: createMockPack({
          pack_id: "pack-3",
          pack_number: "9999999",
          starting_serial: "001",
          serial_end: "200",
        }),
      }),
      createMockBin({
        bin_id: "bin-5",
        bin_number: 5,
        pack: null, // Empty bin
      }),
    ];

    const gamesMap = new Map([
      ["pack-1", { game_code: "0001" }],
      ["pack-2", { game_code: "0002" }],
      ["pack-3", { game_code: "0003" }],
    ]);

    // WHEN: Processing each bin
    const scannedBins: ScannedBin[] = [];

    // Scan bin 1
    const serial1 = {
      game_code: "0001",
      pack_number: "1234567",
      serial_start: "025",
    };
    const match1 = matchSerialToBin(serial1, bins, gamesMap);
    expect(match1.matched, "Bin 1 should match").toBe(true);

    const valid1 = validateClosingSerial("025", "001", "050");
    expect(valid1.valid, "Serial 025 should be valid").toBe(true);

    scannedBins.push({
      bin_id: match1.bin!.bin_id,
      pack_id: match1.bin!.pack!.pack_id,
      closing_serial: "025",
    });

    // Scan bin 2
    const serial2 = {
      game_code: "0002",
      pack_number: "7654321",
      serial_start: "050",
    };
    const match2 = matchSerialToBin(serial2, bins, gamesMap);
    expect(match2.matched, "Bin 2 should match").toBe(true);

    const valid2 = validateClosingSerial("050", "010", "100");
    expect(valid2.valid, "Serial 050 should be valid").toBe(true);

    scannedBins.push({
      bin_id: match2.bin!.bin_id,
      pack_id: match2.bin!.pack!.pack_id,
      closing_serial: "050",
    });

    // Check if all bins scanned (bin 3 is still pending)
    const scannedPackIds = new Set(scannedBins.map((b) => b.pack_id));
    const completionCheck1 = checkAllBinsScanned(bins, scannedPackIds);
    expect(
      completionCheck1.complete,
      "Should not be complete yet (pack-3 pending)",
    ).toBe(false);
    expect(
      completionCheck1.pendingBins,
      "Should have 1 pending bin",
    ).toHaveLength(1);

    // Scan bin 4
    const serial3 = {
      game_code: "0003",
      pack_number: "9999999",
      serial_start: "100",
    };
    const match3 = matchSerialToBin(serial3, bins, gamesMap);
    expect(match3.matched, "Bin 4 should match").toBe(true);

    const valid3 = validateClosingSerial("100", "001", "200");
    expect(valid3.valid, "Serial 100 should be valid").toBe(true);

    scannedBins.push({
      bin_id: match3.bin!.bin_id,
      pack_id: match3.bin!.pack!.pack_id,
      closing_serial: "100",
    });

    // Check completion again
    const scannedPackIds2 = new Set(scannedBins.map((b) => b.pack_id));
    const completionCheck2 = checkAllBinsScanned(bins, scannedPackIds2);
    expect(completionCheck2.complete, "Should be complete now").toBe(true);

    // Transform to API payload
    const payload = transformToApiPayload(scannedBins);

    // THEN: Valid payload
    expect(payload.closings, "Should have 3 closings").toHaveLength(3);
    expect(payload.entry_method, "Should be SCAN").toBe("SCAN");
    expect(payload.closings[0].pack_id, "Should include pack-1").toBe("pack-1");
    expect(payload.closings[1].pack_id, "Should include pack-2").toBe("pack-2");
    expect(payload.closings[2].pack_id, "Should include pack-3").toBe("pack-3");
  });
});
