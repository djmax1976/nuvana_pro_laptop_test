/**
 * Lottery Denormalized Ticket Count Maintenance Unit Tests
 *
 * Tests for denormalized tickets_sold_count maintenance logic:
 * - Count increment on ticket sale
 * - Count accuracy validation
 * - Cache invalidation using last_sold_at
 *
 * @test-level Unit
 * @justification Tests pure business logic for count maintenance without external dependencies
 * @story 6-13 - Lottery Database Enhancements & Bin Management
 * @priority P0 (Critical - Data Integrity)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  incrementTicketCount,
  validateCountAccuracy,
  shouldInvalidateCache,
  updateTicketCountOnSale,
  reconcilePackTicketCount,
} from "../../../backend/src/services/lottery-count.service";
import { prisma } from "../../../backend/src/utils/db";

// Mock Prisma for database-dependent tests
vi.mock("../../../backend/src/utils/db", () => ({
  prisma: {
    lotteryPack: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    lotteryTicketSerial: {
      count: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

describe("6.13-UNIT: Lottery Denormalized Count Maintenance", () => {
  describe("incrementTicketCount", () => {
    it("6.13-UNIT-017: should increment count from zero", () => {
      // GIVEN: Initial count of 0 and null timestamp
      const currentCount = 0;
      const lastSoldAt = null;

      // WHEN: Incrementing count
      const result = incrementTicketCount(currentCount, lastSoldAt);

      // THEN: Count is 1 and timestamp is set
      expect(result.count).toBe(1);
      expect(result.lastSoldAt).toBeInstanceOf(Date);
    });

    it("6.13-UNIT-018: should increment count from existing value", () => {
      // GIVEN: Existing count of 50 and timestamp
      const currentCount = 50;
      const lastSoldAt = new Date("2025-01-28T10:00:00Z");

      // WHEN: Incrementing count
      const result = incrementTicketCount(currentCount, lastSoldAt);

      // THEN: Count is 51 and timestamp is updated
      expect(result.count).toBe(51);
      expect(result.lastSoldAt.getTime()).toBeGreaterThan(lastSoldAt.getTime());
    });
  });

  describe("validateCountAccuracy", () => {
    it("6.13-UNIT-019: should return accurate when counts match", () => {
      // GIVEN: Matching counts
      const denormalizedCount = 100;
      const actualSoldCount = 100;

      // WHEN: Validating accuracy
      const result = validateCountAccuracy(denormalizedCount, actualSoldCount);

      // THEN: Counts are accurate
      expect(result.accurate).toBe(true);
      expect(result.difference).toBeUndefined();
    });

    it("6.13-UNIT-020: should detect when denormalized count is lower", () => {
      // GIVEN: Denormalized count is lower than actual
      const denormalizedCount = 95;
      const actualSoldCount = 100;

      // WHEN: Validating accuracy
      const result = validateCountAccuracy(denormalizedCount, actualSoldCount);

      // THEN: Counts are inaccurate with positive difference
      expect(result.accurate).toBe(false);
      expect(result.difference).toBe(5);
    });

    it("6.13-UNIT-021: should detect when denormalized count is higher", () => {
      // GIVEN: Denormalized count is higher than actual
      const denormalizedCount = 105;
      const actualSoldCount = 100;

      // WHEN: Validating accuracy
      const result = validateCountAccuracy(denormalizedCount, actualSoldCount);

      // THEN: Counts are inaccurate with negative difference
      expect(result.accurate).toBe(false);
      expect(result.difference).toBe(-5);
    });
  });

  describe("shouldInvalidateCache", () => {
    it("6.13-UNIT-022: should not invalidate cache when lastSoldAt is null", () => {
      // GIVEN: Null timestamp and threshold
      const lastSoldAt = null;
      const cacheAgeThreshold = 60000; // 1 minute

      // WHEN: Checking cache invalidation
      const result = shouldInvalidateCache(lastSoldAt, cacheAgeThreshold);

      // THEN: Cache does not need invalidation
      expect(result).toBe(false);
    });

    it("6.13-UNIT-023: should invalidate cache when age exceeds threshold", () => {
      // GIVEN: Old timestamp and threshold
      const lastSoldAt = new Date(Date.now() - 120000); // 2 minutes ago
      const cacheAgeThreshold = 60000; // 1 minute

      // WHEN: Checking cache invalidation
      const result = shouldInvalidateCache(lastSoldAt, cacheAgeThreshold);

      // THEN: Cache needs invalidation
      expect(result).toBe(true);
    });

    it("6.13-UNIT-024: should not invalidate cache when age is below threshold", () => {
      // GIVEN: Recent timestamp and threshold
      const lastSoldAt = new Date(Date.now() - 30000); // 30 seconds ago
      const cacheAgeThreshold = 60000; // 1 minute

      // WHEN: Checking cache invalidation
      const result = shouldInvalidateCache(lastSoldAt, cacheAgeThreshold);

      // THEN: Cache does not need invalidation
      expect(result).toBe(false);
    });
  });

  describe("updateTicketCountOnSale", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("6.13-UNIT-025: should update pack count when ticket is sold", async () => {
      // GIVEN: Pack with initial count
      const packId = "test-pack-id";
      const mockPack = {
        pack_id: packId,
        tickets_sold_count: 10,
        last_sold_at: new Date("2025-01-28T10:00:00Z"),
      };

      vi.mocked(prisma.lotteryPack.findUnique).mockResolvedValue(
        mockPack as any,
      );
      vi.mocked(prisma.lotteryPack.update).mockResolvedValue({
        ...mockPack,
        tickets_sold_count: 11,
        last_sold_at: new Date("2025-01-28T10:01:00Z"),
      } as any);

      // WHEN: Updating count on sale
      const result = await updateTicketCountOnSale(packId);

      // THEN: Count is incremented and timestamp updated
      expect(result.tickets_sold_count).toBe(11);
      expect(result.last_sold_at).not.toBeNull();
      expect(prisma.lotteryPack.update).toHaveBeenCalledWith({
        where: { pack_id: packId },
        data: {
          tickets_sold_count: 11,
          last_sold_at: expect.any(Date),
        },
        select: {
          pack_id: true,
          tickets_sold_count: true,
          last_sold_at: true,
        },
      });
    });

    it("6.13-UNIT-026: should throw error if pack not found", async () => {
      // GIVEN: Pack does not exist
      const packId = "non-existent-pack-id";
      vi.mocked(prisma.lotteryPack.findUnique).mockResolvedValue(null);

      // WHEN: Updating count on sale
      // THEN: Error is thrown
      await expect(updateTicketCountOnSale(packId)).rejects.toThrow(
        `Pack ${packId} not found`,
      );
    });
  });

  describe("reconcilePackTicketCount", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("6.13-UNIT-027: should return accurate when counts match", async () => {
      // GIVEN: Pack with matching counts
      const packId = "test-pack-id";
      const mockPack = {
        pack_id: packId,
        tickets_sold_count: 50,
      };

      vi.mocked(prisma.lotteryPack.findUnique).mockResolvedValue(
        mockPack as any,
      );
      vi.mocked(prisma.lotteryTicketSerial.count).mockResolvedValue(50);

      // WHEN: Reconciling count
      const result = await reconcilePackTicketCount(packId);

      // THEN: Counts are accurate, no correction needed
      expect(result.accurate).toBe(true);
      expect(result.corrected).toBe(false);
      expect(result.denormalized_count).toBe(50);
      expect(result.actual_count).toBe(50);
      expect(prisma.lotteryPack.update).not.toHaveBeenCalled();
    });

    it("6.13-UNIT-028: should correct count when discrepancy found", async () => {
      // GIVEN: Pack with mismatched counts
      const packId = "test-pack-id";
      const mockPack = {
        pack_id: packId,
        tickets_sold_count: 45, // Denormalized count
      };
      const actualCount = 50; // Actual count from database

      vi.mocked(prisma.lotteryPack.findUnique).mockResolvedValue(
        mockPack as any,
      );
      vi.mocked(prisma.lotteryTicketSerial.count).mockResolvedValue(
        actualCount,
      );
      vi.mocked(prisma.lotteryTicketSerial.findFirst).mockResolvedValue({
        sold_at: new Date("2025-01-28T10:00:00Z"),
      } as any);
      vi.mocked(prisma.lotteryPack.update).mockResolvedValue({
        ...mockPack,
        tickets_sold_count: actualCount,
        last_sold_at: new Date("2025-01-28T10:00:00Z"),
      } as any);

      // WHEN: Reconciling count
      const result = await reconcilePackTicketCount(packId);

      // THEN: Count is corrected
      expect(result.accurate).toBe(false);
      expect(result.corrected).toBe(true);
      expect(result.difference).toBe(5);
      expect(prisma.lotteryPack.update).toHaveBeenCalledWith({
        where: { pack_id: packId },
        data: {
          tickets_sold_count: actualCount,
          last_sold_at: expect.any(Date),
        },
      });
    });

    it("6.13-UNIT-029: should throw error if pack not found", async () => {
      // GIVEN: Pack does not exist
      const packId = "non-existent-pack-id";
      vi.mocked(prisma.lotteryPack.findUnique).mockResolvedValue(null);

      // WHEN: Reconciling count
      // THEN: Error is thrown
      await expect(reconcilePackTicketCount(packId)).rejects.toThrow(
        `Pack ${packId} not found`,
      );
    });
  });
});
