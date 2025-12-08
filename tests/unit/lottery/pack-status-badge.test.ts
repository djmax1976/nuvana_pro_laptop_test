/**
 * Unit Tests: Pack Status Badge Color Logic
 *
 * Tests pure function for determining status badge colors:
 * - RECEIVED: Blue/Gray
 * - ACTIVE: Green
 * - DEPLETED: Red/Orange
 * - RETURNED: Yellow/Amber
 *
 * @test-level UNIT
 * @justification Tests pure logic without UI rendering - fast, isolated, deterministic
 * @story 6-10 - Lottery Management UI
 * @priority P1 (High - Status Display)
 *
 * RED PHASE: These tests define expected behavior before implementation.
 * Tests will fail until status badge logic is implemented.
 */

import { describe, it, expect } from "vitest";
import {
  getPackStatusBadgeVariant,
  type PackStatus,
  type BadgeVariant,
} from "@/components/lottery/pack-status-badge";

/**
 * Map badge variant to color for testing
 * This is a helper to verify the correct variant is returned
 */
function variantToColor(variant: BadgeVariant): string {
  const colorMap: Record<BadgeVariant, string> = {
    secondary: "gray", // Blue/Gray for RECEIVED
    success: "green", // Green for ACTIVE
    destructive: "red", // Red/Orange for DEPLETED
    warning: "yellow", // Yellow/Amber for RETURNED
    outline: "gray",
  };
  // eslint-disable-next-line security/detect-object-injection -- Safe: variant is typed enum
  return colorMap[variant];
}

// ═══════════════════════════════════════════════════════════════════════════
// STATUS BADGE COLOR TESTS (P1)
// ═══════════════════════════════════════════════════════════════════════════

describe("6.10-UNIT: Pack Status Badge Color", () => {
  describe("getPackStatusBadgeVariant", () => {
    it("6.10-UNIT-008: [P1] should return secondary (blue/gray) for RECEIVED status (AC #1)", () => {
      // GIVEN: Pack with RECEIVED status
      const status: PackStatus = "RECEIVED";

      // WHEN: Getting badge variant
      const variant = getPackStatusBadgeVariant(status);

      // THEN: Variant is secondary (which maps to blue/gray)
      expect(variant).toBe("secondary");
      const color = variantToColor(variant);
      expect(["blue", "gray"]).toContain(color);
    });

    it("6.10-UNIT-009: [P1] should return success (green) for ACTIVE status (AC #1)", () => {
      // GIVEN: Pack with ACTIVE status
      const status: PackStatus = "ACTIVE";

      // WHEN: Getting badge variant
      const variant = getPackStatusBadgeVariant(status);

      // THEN: Variant is success (which maps to green)
      expect(variant).toBe("success");
      const color = variantToColor(variant);
      expect(color).toBe("green");
    });

    it("6.10-UNIT-010: [P1] should return destructive (red/orange) for DEPLETED status (AC #1)", () => {
      // GIVEN: Pack with DEPLETED status
      const status: PackStatus = "DEPLETED";

      // WHEN: Getting badge variant
      const variant = getPackStatusBadgeVariant(status);

      // THEN: Variant is destructive (which maps to red/orange)
      expect(variant).toBe("destructive");
      const color = variantToColor(variant);
      expect(["red", "orange"]).toContain(color);
    });

    it("6.10-UNIT-011: [P1] should return warning (yellow/amber) for RETURNED status (AC #1)", () => {
      // GIVEN: Pack with RETURNED status
      const status: PackStatus = "RETURNED";

      // WHEN: Getting badge variant
      const variant = getPackStatusBadgeVariant(status);

      // THEN: Variant is warning (which maps to yellow/amber)
      expect(variant).toBe("warning");
      const color = variantToColor(variant);
      expect(["yellow", "amber"]).toContain(color);
    });
  });
});
