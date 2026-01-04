/**
 * Lottery Bin Count Service Unit Tests
 *
 * Unit tests for LotteryBinCountService business logic.
 * Tests focus on the service layer in isolation using mocked Prisma client.
 *
 * @test-level Unit
 * @justification Unit tests for service layer business logic without database
 * @story Lottery Bin Count Configuration
 * @priority P0 (Critical - Business Logic)
 *
 * Traceability Matrix:
 * | Test ID  | Requirement | Priority | Coverage |
 * |----------|-------------|----------|----------|
 * | LBCS-001 | getBinCount returns statistics | P0 | Core Functionality |
 * | LBCS-002 | getBinCount validates UUID | P0 | Input Validation |
 * | LBCS-003 | updateBinCount validates range | P0 | Input Validation |
 * | LBCS-004 | updateBinCount creates bins when increasing | P0 | Business Logic |
 * | LBCS-005 | updateBinCount reactivates before creating | P1 | Business Logic |
 * | LBCS-006 | updateBinCount soft-deletes when decreasing | P0 | Business Logic |
 * | LBCS-007 | updateBinCount prevents removal of bins with packs | P0 | Data Integrity |
 * | LBCS-008 | validateBinCountChange returns correct preview | P1 | Validation |
 * | LBCS-009 | validateBinCountChange blocks when packs blocking | P0 | Validation |
 *
 * Enterprise Standards:
 * - DB-001: ORM_USAGE - Verified through mocked Prisma
 * - SEC-014: INPUT_VALIDATION - Boundary testing for bin count range
 * - API-003: ERROR_HANDLING - Error message validation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the prisma import - factory function must return the mock
vi.mock("../../../backend/src/utils/db", () => ({
  prisma: {
    store: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    lotteryBin: {
      count: vi.fn(),
      findMany: vi.fn(),
      createMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Import after mock setup
import { LotteryBinCountService } from "../../../backend/src/services/lottery-bin-count.service";
import { prisma } from "../../../backend/src/utils/db";

// Get typed mocks
const mockPrisma = vi.mocked(prisma);

describe("LotteryBinCountService", () => {
  let service: LotteryBinCountService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new LotteryBinCountService();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getBinCount Tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe("getBinCount", () => {
    const validStoreId = "12345678-1234-1234-1234-123456789012";

    it("LBCS-001: [P0] should return bin count statistics", async () => {
      // GIVEN: A store exists with some bins
      mockPrisma.store.findUnique.mockResolvedValue({
        store_id: validStoreId,
        lottery_bin_count: 10,
      } as any);
      mockPrisma.lotteryBin.count
        .mockResolvedValueOnce(10) // active bins
        .mockResolvedValueOnce(3); // bins with packs

      // WHEN: getBinCount is called
      const result = await service.getBinCount(validStoreId);

      // THEN: It returns correct statistics
      expect(result).toEqual({
        store_id: validStoreId,
        bin_count: 10,
        active_bins: 10,
        bins_with_packs: 3,
        empty_bins: 7,
      });
    });

    it("LBCS-002: [P0] should throw error for invalid UUID format", async () => {
      // GIVEN: An invalid UUID
      const invalidStoreId = "not-a-valid-uuid";

      // WHEN/THEN: getBinCount throws
      await expect(service.getBinCount(invalidStoreId)).rejects.toThrow(
        "Invalid store ID format",
      );
    });

    it("LBCS-002b: [P0] should throw error when store not found", async () => {
      // GIVEN: Store doesn't exist
      mockPrisma.store.findUnique.mockResolvedValue(null);

      // WHEN/THEN: getBinCount throws
      await expect(service.getBinCount(validStoreId)).rejects.toThrow(
        `Store with ID ${validStoreId} not found`,
      );
    });

    it("LBCS-001b: [P1] should handle null lottery_bin_count", async () => {
      // GIVEN: Store has null bin_count
      mockPrisma.store.findUnique.mockResolvedValue({
        store_id: validStoreId,
        lottery_bin_count: null,
      } as any);
      mockPrisma.lotteryBin.count
        .mockResolvedValueOnce(5) // active bins
        .mockResolvedValueOnce(2); // bins with packs

      // WHEN: getBinCount is called
      const result = await service.getBinCount(validStoreId);

      // THEN: bin_count is null but active_bins reflects actual count
      expect(result.bin_count).toBe(null);
      expect(result.active_bins).toBe(5);
      expect(result.empty_bins).toBe(3);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // updateBinCount Tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe("updateBinCount", () => {
    const validStoreId = "12345678-1234-1234-1234-123456789012";
    const validUserId = "87654321-4321-4321-4321-210987654321";

    it("LBCS-003: [P0] should reject negative bin count", async () => {
      // WHEN/THEN: updateBinCount with negative value throws
      await expect(
        service.updateBinCount(validStoreId, -1, validUserId),
      ).rejects.toThrow("Bin count must be an integer between 0 and 200");
    });

    it("LBCS-003b: [P0] should reject bin count exceeding maximum (200)", async () => {
      // WHEN/THEN: updateBinCount with value > 200 throws
      await expect(
        service.updateBinCount(validStoreId, 201, validUserId),
      ).rejects.toThrow("Bin count must be an integer between 0 and 200");
    });

    it("LBCS-003c: [P0] should reject non-integer bin count", async () => {
      // WHEN/THEN: updateBinCount with non-integer throws
      await expect(
        service.updateBinCount(validStoreId, 5.5, validUserId),
      ).rejects.toThrow("Bin count must be an integer between 0 and 200");
    });

    it("LBCS-003d: [P0] should accept boundary value 0", async () => {
      // GIVEN: Transaction mock
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const mockTx = {
          store: {
            findUnique: vi.fn().mockResolvedValue({
              store_id: validStoreId,
              lottery_bin_count: 5,
            }),
            update: vi.fn(),
          },
          lotteryBin: {
            findMany: vi.fn().mockResolvedValue([
              { bin_id: "b1", display_order: 0, is_active: true, packs: [] },
              { bin_id: "b2", display_order: 1, is_active: true, packs: [] },
              { bin_id: "b3", display_order: 2, is_active: true, packs: [] },
              { bin_id: "b4", display_order: 3, is_active: true, packs: [] },
              { bin_id: "b5", display_order: 4, is_active: true, packs: [] },
            ]),
            update: vi.fn(),
          },
        };
        return fn(mockTx);
      });

      // WHEN: updateBinCount with 0
      const result = await service.updateBinCount(validStoreId, 0, validUserId);

      // THEN: All bins are deactivated
      expect(result.new_count).toBe(0);
      expect(result.bins_deactivated).toBe(5);
    });

    it("LBCS-003e: [P0] should accept boundary value 200", async () => {
      // GIVEN: Transaction mock
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const mockTx = {
          store: {
            findUnique: vi.fn().mockResolvedValue({
              store_id: validStoreId,
              lottery_bin_count: 0,
            }),
            update: vi.fn(),
          },
          lotteryBin: {
            findMany: vi.fn().mockResolvedValue([]),
            create: vi.fn(),
          },
        };
        return fn(mockTx);
      });

      // WHEN: updateBinCount with 200
      const result = await service.updateBinCount(
        validStoreId,
        200,
        validUserId,
      );

      // THEN: 200 bins are created
      expect(result.new_count).toBe(200);
      expect(result.bins_created).toBe(200);
    });

    it("LBCS-004: [P0] should create bins when increasing count", async () => {
      // GIVEN: Store has 3 bins, increasing to 5
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const mockTx = {
          store: {
            findUnique: vi.fn().mockResolvedValue({
              store_id: validStoreId,
              lottery_bin_count: 3,
            }),
            update: vi.fn(),
          },
          lotteryBin: {
            findMany: vi.fn().mockResolvedValue([
              { bin_id: "b1", display_order: 0, is_active: true, packs: [] },
              { bin_id: "b2", display_order: 1, is_active: true, packs: [] },
              { bin_id: "b3", display_order: 2, is_active: true, packs: [] },
            ]),
            create: vi.fn(),
          },
        };
        return fn(mockTx);
      });

      // WHEN: updateBinCount to 5
      const result = await service.updateBinCount(validStoreId, 5, validUserId);

      // THEN: 2 new bins created
      expect(result.new_count).toBe(5);
      expect(result.bins_created).toBe(2);
      expect(result.bins_reactivated).toBe(0);
    });

    it("LBCS-005: [P1] should reactivate inactive bins before creating new ones", async () => {
      // GIVEN: Store has 3 active and 2 inactive bins, increasing to 6
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const mockTx = {
          store: {
            findUnique: vi.fn().mockResolvedValue({
              store_id: validStoreId,
              lottery_bin_count: 3,
            }),
            update: vi.fn(),
          },
          lotteryBin: {
            findMany: vi.fn().mockResolvedValue([
              { bin_id: "b1", display_order: 0, is_active: true, packs: [] },
              { bin_id: "b2", display_order: 1, is_active: true, packs: [] },
              { bin_id: "b3", display_order: 2, is_active: true, packs: [] },
              { bin_id: "b4", display_order: 3, is_active: false, packs: [] },
              { bin_id: "b5", display_order: 4, is_active: false, packs: [] },
            ]),
            update: vi.fn(),
            create: vi.fn(),
          },
        };
        return fn(mockTx);
      });

      // WHEN: updateBinCount to 6
      const result = await service.updateBinCount(validStoreId, 6, validUserId);

      // THEN: 2 bins reactivated, 1 new bin created
      expect(result.new_count).toBe(6);
      expect(result.bins_reactivated).toBe(2);
      expect(result.bins_created).toBe(1);
    });

    it("LBCS-006: [P0] should soft-delete bins when decreasing count", async () => {
      // GIVEN: Store has 5 empty bins, decreasing to 3
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const mockTx = {
          store: {
            findUnique: vi.fn().mockResolvedValue({
              store_id: validStoreId,
              lottery_bin_count: 5,
            }),
            update: vi.fn(),
          },
          lotteryBin: {
            findMany: vi.fn().mockResolvedValue([
              { bin_id: "b1", display_order: 0, is_active: true, packs: [] },
              { bin_id: "b2", display_order: 1, is_active: true, packs: [] },
              { bin_id: "b3", display_order: 2, is_active: true, packs: [] },
              { bin_id: "b4", display_order: 3, is_active: true, packs: [] },
              { bin_id: "b5", display_order: 4, is_active: true, packs: [] },
            ]),
            update: vi.fn(),
          },
        };
        return fn(mockTx);
      });

      // WHEN: updateBinCount to 3
      const result = await service.updateBinCount(validStoreId, 3, validUserId);

      // THEN: 2 bins soft-deleted
      expect(result.new_count).toBe(3);
      expect(result.bins_deactivated).toBe(2);
    });

    it("LBCS-007: [P0] should prevent removal when only bin with pack is in removal range", async () => {
      // GIVEN: Store has 2 bins, top one has active pack - reducing to 1 requires removing b2
      // Service removes from highest display_order down, so b2 must be removed
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const mockTx = {
          store: {
            findUnique: vi.fn().mockResolvedValue({
              store_id: validStoreId,
              lottery_bin_count: 2,
            }),
            update: vi.fn(),
          },
          lotteryBin: {
            findMany: vi.fn().mockResolvedValue([
              { bin_id: "b1", display_order: 0, is_active: true, packs: [] },
              {
                bin_id: "b2",
                display_order: 1,
                is_active: true,
                packs: [{ pack_id: "p1" }],
              },
            ]),
            update: vi.fn(),
          },
        };
        return fn(mockTx);
      });

      // WHEN/THEN: updateBinCount to 1 throws (only b2 can be removed, but it has pack)
      await expect(
        service.updateBinCount(validStoreId, 1, validUserId),
      ).rejects.toThrow("Cannot reduce bin count");
    });

    it("LBCS-007b: [P0] should skip bins with packs and throw if cannot remove enough", async () => {
      // GIVEN: Store has 5 bins, top 3 have packs, trying to reduce to 1
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const mockTx = {
          store: {
            findUnique: vi.fn().mockResolvedValue({
              store_id: validStoreId,
              lottery_bin_count: 5,
            }),
            update: vi.fn(),
          },
          lotteryBin: {
            findMany: vi.fn().mockResolvedValue([
              { bin_id: "b1", display_order: 0, is_active: true, packs: [] },
              { bin_id: "b2", display_order: 1, is_active: true, packs: [] },
              {
                bin_id: "b3",
                display_order: 2,
                is_active: true,
                packs: [{ pack_id: "p1" }],
              },
              {
                bin_id: "b4",
                display_order: 3,
                is_active: true,
                packs: [{ pack_id: "p2" }],
              },
              {
                bin_id: "b5",
                display_order: 4,
                is_active: true,
                packs: [{ pack_id: "p3" }],
              },
            ]),
            update: vi.fn(),
          },
        };
        return fn(mockTx);
      });

      // WHEN/THEN: updateBinCount to 1 throws (can only remove 2 empty bins from bottom)
      await expect(
        service.updateBinCount(validStoreId, 1, validUserId),
      ).rejects.toThrow(/active packs/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // validateBinCountChange Tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe("validateBinCountChange", () => {
    const validStoreId = "12345678-1234-1234-1234-123456789012";

    it("LBCS-008: [P1] should return correct preview for adding bins", async () => {
      // GIVEN: Store has 5 active bins
      mockPrisma.lotteryBin.count.mockResolvedValue(5);
      mockPrisma.lotteryBin.findMany.mockResolvedValue([]);

      // WHEN: validateBinCountChange to 10
      const result = await service.validateBinCountChange(validStoreId, 10);

      // THEN: Shows 5 bins to add
      expect(result.allowed).toBe(true);
      expect(result.bins_to_add).toBe(5);
      expect(result.bins_to_remove).toBe(0);
      expect(result.message).toContain("add 5 new bin");
    });

    it("LBCS-008b: [P1] should return correct preview for removing empty bins", async () => {
      // GIVEN: Store has 10 active bins, none with packs
      mockPrisma.lotteryBin.count.mockResolvedValue(10);
      mockPrisma.lotteryBin.findMany.mockResolvedValue([]);

      // WHEN: validateBinCountChange to 5
      const result = await service.validateBinCountChange(validStoreId, 5);

      // THEN: Shows 5 bins to remove
      expect(result.allowed).toBe(true);
      expect(result.bins_to_add).toBe(0);
      expect(result.bins_to_remove).toBe(5);
      expect(result.message).toContain("remove 5 empty bin");
    });

    it("LBCS-008c: [P1] should return no changes message for same count", async () => {
      // GIVEN: Store has 5 active bins
      mockPrisma.lotteryBin.count.mockResolvedValue(5);
      mockPrisma.lotteryBin.findMany.mockResolvedValue([]);

      // WHEN: validateBinCountChange to 5
      const result = await service.validateBinCountChange(validStoreId, 5);

      // THEN: Shows no changes
      expect(result.allowed).toBe(true);
      expect(result.bins_to_add).toBe(0);
      expect(result.bins_to_remove).toBe(0);
      expect(result.message).toContain("No changes");
    });

    it("LBCS-009: [P0] should block when bins with packs would be removed", async () => {
      // GIVEN: Store has 10 bins, top 3 have packs (display_order 7,8,9)
      mockPrisma.lotteryBin.count.mockResolvedValue(10);
      mockPrisma.lotteryBin.findMany.mockResolvedValue([
        { display_order: 7 },
        { display_order: 8 },
        { display_order: 9 },
      ] as any);

      // WHEN: validateBinCountChange to 5 (would remove bins 5-9)
      const result = await service.validateBinCountChange(validStoreId, 5);

      // THEN: Blocked with message about packs
      expect(result.allowed).toBe(false);
      expect(result.bins_with_packs_blocking).toBe(3);
      expect(result.message).toContain("active packs");
    });

    it("LBCS-009b: [P1] should allow removal when packs are not in affected range", async () => {
      // GIVEN: Store has 10 bins, bottom 2 have packs (display_order 0,1)
      mockPrisma.lotteryBin.count.mockResolvedValue(10);
      mockPrisma.lotteryBin.findMany.mockResolvedValue([
        { display_order: 0 },
        { display_order: 1 },
      ] as any);

      // WHEN: validateBinCountChange to 5 (would remove bins 5-9, packs at 0,1 unaffected)
      const result = await service.validateBinCountChange(validStoreId, 5);

      // THEN: Allowed since packs are in kept bins
      expect(result.allowed).toBe(true);
      expect(result.bins_with_packs_blocking).toBe(0);
    });

    it("LBCS-008d: [P0] should throw for invalid UUID", async () => {
      // WHEN/THEN: validateBinCountChange with invalid UUID throws
      await expect(
        service.validateBinCountChange("invalid-uuid", 10),
      ).rejects.toThrow("Invalid store ID format");
    });
  });
});
