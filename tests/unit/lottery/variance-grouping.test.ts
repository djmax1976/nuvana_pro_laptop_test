/**
 * Unit Tests: Variance Grouping Logic
 *
 * Tests pure function for grouping variances by shift or pack:
 * - Group by shift_id
 * - Group by pack_id
 * - Handle empty arrays
 * - Handle single variance
 *
 * @test-level UNIT
 * @justification Tests pure grouping logic without UI rendering - fast, isolated, deterministic
 * @story 6-10 - Lottery Management UI
 * @priority P1 (High - Variance Display)
 *
 * RED PHASE: These tests define expected behavior before implementation.
 * Tests will fail until grouping logic is implemented.
 */

import { describe, it, expect } from "vitest";

interface LotteryVariance {
  variance_id: string;
  shift_id: string;
  pack_id: string;
  expected_count: number;
  actual_count: number;
  difference: number;
  approved_at: string | null;
}

interface GroupedVariances {
  byShift: Record<string, LotteryVariance[]>;
  byPack: Record<string, LotteryVariance[]>;
}

/**
 * Group variances by shift and pack
 * @param variances - Array of variances
 * @returns Grouped variances by shift and pack
 */
function groupVariances(variances: LotteryVariance[]): GroupedVariances {
  const byShift: Record<string, LotteryVariance[]> = {};
  const byPack: Record<string, LotteryVariance[]> = {};

  for (const variance of variances) {
    // Group by shift_id
    if (!byShift[variance.shift_id]) {
      byShift[variance.shift_id] = [];
    }
    byShift[variance.shift_id].push(variance);

    // Group by pack_id
    if (!byPack[variance.pack_id]) {
      byPack[variance.pack_id] = [];
    }
    byPack[variance.pack_id].push(variance);
  }

  return { byShift, byPack };
}

// ═══════════════════════════════════════════════════════════════════════════
// VARIANCE GROUPING TESTS (P1)
// ═══════════════════════════════════════════════════════════════════════════

describe("6.10-UNIT: Variance Grouping", () => {
  describe("groupVariances", () => {
    it("6.10-UNIT-021: [P1] should group variances by shift_id (AC #5)", () => {
      // GIVEN: Variances from multiple shifts
      const variances: LotteryVariance[] = [
        {
          variance_id: "v1",
          shift_id: "shift1",
          pack_id: "pack1",
          expected_count: 100,
          actual_count: 95,
          difference: -5,
          approved_at: null,
        },
        {
          variance_id: "v2",
          shift_id: "shift1",
          pack_id: "pack2",
          expected_count: 50,
          actual_count: 52,
          difference: 2,
          approved_at: null,
        },
        {
          variance_id: "v3",
          shift_id: "shift2",
          pack_id: "pack1",
          expected_count: 100,
          actual_count: 98,
          difference: -2,
          approved_at: null,
        },
      ];

      // WHEN: Grouping variances
      const grouped = groupVariances(variances);

      // THEN: Variances are grouped by shift_id
      expect(grouped.byShift["shift1"]).toHaveLength(2);
      expect(grouped.byShift["shift2"]).toHaveLength(1);
    });

    it("6.10-UNIT-022: [P1] should group variances by pack_id (AC #5)", () => {
      // GIVEN: Variances from multiple packs
      const variances: LotteryVariance[] = [
        {
          variance_id: "v1",
          shift_id: "shift1",
          pack_id: "pack1",
          expected_count: 100,
          actual_count: 95,
          difference: -5,
          approved_at: null,
        },
        {
          variance_id: "v2",
          shift_id: "shift2",
          pack_id: "pack1",
          expected_count: 100,
          actual_count: 98,
          difference: -2,
          approved_at: null,
        },
        {
          variance_id: "v3",
          shift_id: "shift1",
          pack_id: "pack2",
          expected_count: 50,
          actual_count: 52,
          difference: 2,
          approved_at: null,
        },
      ];

      // WHEN: Grouping variances
      const grouped = groupVariances(variances);

      // THEN: Variances are grouped by pack_id
      expect(grouped.byPack["pack1"]).toHaveLength(2);
      expect(grouped.byPack["pack2"]).toHaveLength(1);
    });

    it("6.10-UNIT-023: [P1] should handle empty variance array (AC #5)", () => {
      // GIVEN: Empty variance array
      const variances: LotteryVariance[] = [];

      // WHEN: Grouping variances
      const grouped = groupVariances(variances);

      // THEN: Both groups are empty
      expect(Object.keys(grouped.byShift)).toHaveLength(0);
      expect(Object.keys(grouped.byPack)).toHaveLength(0);
    });

    it("6.10-UNIT-024: [P1] should handle single variance (AC #5)", () => {
      // GIVEN: Single variance
      const variances: LotteryVariance[] = [
        {
          variance_id: "v1",
          shift_id: "shift1",
          pack_id: "pack1",
          expected_count: 100,
          actual_count: 95,
          difference: -5,
          approved_at: null,
        },
      ];

      // WHEN: Grouping variances
      const grouped = groupVariances(variances);

      // THEN: Variance appears in both groups
      expect(grouped.byShift["shift1"]).toHaveLength(1);
      expect(grouped.byPack["pack1"]).toHaveLength(1);
    });
  });
});
