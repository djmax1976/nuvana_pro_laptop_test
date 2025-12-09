/**
 * Unit Tests: Lottery Pack Movement Service
 *
 * Tests for movePackBetweenBins service method:
 * - Pack movement between bins
 * - LotteryPackBinHistory record creation
 * - Pack current_bin_id update
 * - Validation (pack exists, bin exists, same store, bin active)
 * - Transaction atomicity
 * - Audit logging
 *
 * @test-level Unit
 * @justification Tests service logic with mocked database - fast, isolated
 * @story 6-13 - Lottery Database Enhancements & Bin Management
 * @priority P1 (High - Business Logic, Audit Trail)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { movePackBetweenBins } from "../../../backend/src/services/lottery.service";
import { prisma } from "../../../backend/src/utils/db";

// Mock Prisma
vi.mock("../../../backend/src/utils/db", () => ({
  prisma: {
    lotteryPack: {
      findUnique: vi.fn(),
    },
    lotteryBin: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
    auditLog: {
      create: vi.fn(),
    },
  },
}));

describe("6.13-UNIT: movePackBetweenBins Service", () => {
  const mockPackId = "123e4567-e89b-12d3-a456-426614174000";
  const mockBinId = "223e4567-e89b-12d3-a456-426614174000";
  const mockUserId = "323e4567-e89b-12d3-a456-426614174000";
  const mockStoreId = "423e4567-e89b-12d3-a456-426614174000";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("6.13-UNIT-054: should move pack from one bin to another successfully", async () => {
    // GIVEN: Pack exists in bin1, moving to bin2
    const mockPack = {
      pack_id: mockPackId,
      current_bin_id: "old-bin-id",
      store_id: mockStoreId,
      pack_number: "PACK001",
    };
    const mockBin = {
      bin_id: mockBinId,
      store_id: mockStoreId,
      is_active: true,
    };
    const mockTransactionResult = {
      pack_id: mockPackId,
      current_bin_id: mockBinId,
      history_id: "history-id",
    };

    vi.mocked(prisma.lotteryPack.findUnique).mockResolvedValue(mockPack as any);
    vi.mocked(prisma.lotteryBin.findUnique).mockResolvedValue(mockBin as any);
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      return await callback({
        lotteryPack: {
          update: vi.fn().mockResolvedValue({
            pack_id: mockPackId,
            current_bin_id: mockBinId,
          }),
        },
        lotteryPackBinHistory: {
          create: vi.fn().mockResolvedValue({
            history_id: "history-id",
          }),
        },
      });
    });
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

    // WHEN: Moving pack to new bin
    const result = await movePackBetweenBins(
      mockPackId,
      mockBinId,
      mockUserId,
      "Moving to front display",
    );

    // THEN: Pack is moved successfully
    expect(result.pack_id).toBe(mockPackId);
    expect(result.current_bin_id).toBe(mockBinId);
    expect(result.history_id).toBe("history-id");
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("6.13-UNIT-055: should unassign pack from bin (set bin_id to null)", async () => {
    // GIVEN: Pack exists in a bin, unassigning from bin
    const mockPack = {
      pack_id: mockPackId,
      current_bin_id: "old-bin-id",
      store_id: mockStoreId,
      pack_number: "PACK001",
    };

    vi.mocked(prisma.lotteryPack.findUnique).mockResolvedValue(mockPack as any);
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      return await callback({
        lotteryPack: {
          update: vi.fn().mockResolvedValue({
            pack_id: mockPackId,
            current_bin_id: null,
          }),
        },
        lotteryPackBinHistory: {
          create: vi.fn().mockResolvedValue({
            history_id: "history-id",
          }),
        },
      });
    });
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

    // WHEN: Unassigning pack from bin (null bin_id)
    const result = await movePackBetweenBins(
      mockPackId,
      null,
      mockUserId,
      "Removing from bin",
    );

    // THEN: Pack is unassigned successfully
    expect(result.pack_id).toBe(mockPackId);
    expect(result.current_bin_id).toBeNull();
    expect(result.history_id).toBe("history-id");
    // Bin validation should not be called when bin_id is null
    expect(prisma.lotteryBin.findUnique).not.toHaveBeenCalled();
  });

  it("6.13-UNIT-056: should reject movement if pack not found", async () => {
    // GIVEN: Pack does not exist
    vi.mocked(prisma.lotteryPack.findUnique).mockResolvedValue(null);

    // WHEN: Attempting to move pack
    // THEN: Error is thrown
    await expect(
      movePackBetweenBins(mockPackId, mockBinId, mockUserId),
    ).rejects.toThrow("Pack");
    await expect(
      movePackBetweenBins(mockPackId, mockBinId, mockUserId),
    ).rejects.toThrow("not found");
  });

  it("6.13-UNIT-057: should reject movement if bin not found", async () => {
    // GIVEN: Pack exists but bin does not
    const mockPack = {
      pack_id: mockPackId,
      current_bin_id: "old-bin-id",
      store_id: mockStoreId,
      pack_number: "PACK001",
    };

    vi.mocked(prisma.lotteryPack.findUnique).mockResolvedValue(mockPack as any);
    vi.mocked(prisma.lotteryBin.findUnique).mockResolvedValue(null);

    // WHEN: Attempting to move pack to non-existent bin
    // THEN: Error is thrown
    await expect(
      movePackBetweenBins(mockPackId, mockBinId, mockUserId),
    ).rejects.toThrow("Bin");
    await expect(
      movePackBetweenBins(mockPackId, mockBinId, mockUserId),
    ).rejects.toThrow("not found");
  });

  it("6.13-UNIT-058: should reject movement if bin is not active", async () => {
    // GIVEN: Pack exists, bin exists but is inactive
    const mockPack = {
      pack_id: mockPackId,
      current_bin_id: "old-bin-id",
      store_id: mockStoreId,
      pack_number: "PACK001",
    };
    const mockBin = {
      bin_id: mockBinId,
      store_id: mockStoreId,
      is_active: false,
    };

    vi.mocked(prisma.lotteryPack.findUnique).mockResolvedValue(mockPack as any);
    vi.mocked(prisma.lotteryBin.findUnique).mockResolvedValue(mockBin as any);

    // WHEN: Attempting to move pack to inactive bin
    // THEN: Error is thrown
    await expect(
      movePackBetweenBins(mockPackId, mockBinId, mockUserId),
    ).rejects.toThrow("not active");
  });

  it("6.13-UNIT-059: should reject movement if pack and bin belong to different stores", async () => {
    // GIVEN: Pack and bin belong to different stores
    const mockPack = {
      pack_id: mockPackId,
      current_bin_id: "old-bin-id",
      store_id: "store-1",
      pack_number: "PACK001",
    };
    const mockBin = {
      bin_id: mockBinId,
      store_id: "store-2", // Different store
      is_active: true,
    };

    vi.mocked(prisma.lotteryPack.findUnique).mockResolvedValue(mockPack as any);
    vi.mocked(prisma.lotteryBin.findUnique).mockResolvedValue(mockBin as any);

    // WHEN: Attempting to move pack to bin in different store
    // THEN: Error is thrown
    await expect(
      movePackBetweenBins(mockPackId, mockBinId, mockUserId),
    ).rejects.toThrow("same store");
  });

  it("6.13-UNIT-060: should reject reason exceeding 500 characters", async () => {
    // GIVEN: Pack and bin exist, but reason is too long
    const mockPack = {
      pack_id: mockPackId,
      current_bin_id: "old-bin-id",
      store_id: mockStoreId,
      pack_number: "PACK001",
    };
    const mockBin = {
      bin_id: mockBinId,
      store_id: mockStoreId,
      is_active: true,
    };
    const longReason = "a".repeat(501);

    vi.mocked(prisma.lotteryPack.findUnique).mockResolvedValue(mockPack as any);
    vi.mocked(prisma.lotteryBin.findUnique).mockResolvedValue(mockBin as any);

    // WHEN: Attempting to move pack with reason exceeding 500 chars
    // THEN: Error is thrown
    await expect(
      movePackBetweenBins(mockPackId, mockBinId, mockUserId, longReason),
    ).rejects.toThrow("500 characters");
  });

  it("6.13-UNIT-061: should accept reason with exactly 500 characters", async () => {
    // GIVEN: Pack and bin exist, reason is exactly 500 chars
    const mockPack = {
      pack_id: mockPackId,
      current_bin_id: "old-bin-id",
      store_id: mockStoreId,
      pack_number: "PACK001",
    };
    const mockBin = {
      bin_id: mockBinId,
      store_id: mockStoreId,
      is_active: true,
    };
    const reason = "a".repeat(500);

    vi.mocked(prisma.lotteryPack.findUnique).mockResolvedValue(mockPack as any);
    vi.mocked(prisma.lotteryBin.findUnique).mockResolvedValue(mockBin as any);
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      return await callback({
        lotteryPack: {
          update: vi.fn().mockResolvedValue({
            pack_id: mockPackId,
            current_bin_id: mockBinId,
          }),
        },
        lotteryPackBinHistory: {
          create: vi.fn().mockResolvedValue({
            history_id: "history-id",
          }),
        },
      });
    });
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

    // WHEN: Moving pack with 500-char reason
    const result = await movePackBetweenBins(
      mockPackId,
      mockBinId,
      mockUserId,
      reason,
    );

    // THEN: Movement succeeds
    expect(result.pack_id).toBe(mockPackId);
  });

  it("6.13-UNIT-062: should create audit log entry on successful movement", async () => {
    // GIVEN: Pack and bin exist
    const mockPack = {
      pack_id: mockPackId,
      current_bin_id: "old-bin-id",
      store_id: mockStoreId,
      pack_number: "PACK001",
    };
    const mockBin = {
      bin_id: mockBinId,
      store_id: mockStoreId,
      is_active: true,
    };

    vi.mocked(prisma.lotteryPack.findUnique).mockResolvedValue(mockPack as any);
    vi.mocked(prisma.lotteryBin.findUnique).mockResolvedValue(mockBin as any);
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      return await callback({
        lotteryPack: {
          update: vi.fn().mockResolvedValue({
            pack_id: mockPackId,
            current_bin_id: mockBinId,
          }),
        },
        lotteryPackBinHistory: {
          create: vi.fn().mockResolvedValue({
            history_id: "history-id",
          }),
        },
      });
    });
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

    // WHEN: Moving pack
    await movePackBetweenBins(mockPackId, mockBinId, mockUserId, "Test reason");

    // THEN: Audit log entry is created
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: mockUserId,
        action: "LOTTERY_PACK_MOVED",
        table_name: "lottery_packs",
        record_id: mockPackId,
        old_values: expect.objectContaining({
          current_bin_id: "old-bin-id",
        }),
        new_values: expect.objectContaining({
          current_bin_id: mockBinId,
        }),
      }),
    });
  });
});
