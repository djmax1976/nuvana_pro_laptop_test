/**
 * Shift Closing Test Fixtures
 *
 * Provides fixtures for shift closing tests including:
 * - Authenticated user with active shift
 * - Closing data setup/cleanup
 * - Test bins and packs
 *
 * Follows fixture architecture pattern: pure functions wrapped in fixtures with auto-cleanup
 */

import { test as base } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import {
  createLotteryBin,
  createLotteryPack,
  createLotteryShiftOpening,
} from "../factories/lottery.factory";

type ShiftClosingFixture = {
  prisma: PrismaClient;
  authenticatedUser: {
    userId: string;
    storeId: string;
    shiftId: string;
    authToken: string;
  };
  closingData: {
    bins: Array<{
      bin_id: string;
      bin_number: number;
      name: string;
      is_active: boolean;
      pack: {
        pack_id: string;
        game_name: string;
        game_price: number;
        starting_serial: string;
        serial_end: string;
        pack_number: string;
      } | null;
    }>;
    soldPacks: Array<{
      bin_id: string;
      bin_number: number;
      pack_id: string;
      game_name: string;
      game_price: number;
      starting_serial: string;
      ending_serial: string;
    }>;
  };
};

export const test = base.extend<ShiftClosingFixture>({
  prisma: async ({}, use) => {
    const prisma = new PrismaClient();
    await use(prisma);
    await prisma.$disconnect();
  },

  authenticatedUser: async ({ prisma }, use) => {
    // Setup: Create user, store, shift, and generate auth token
    // Note: This will fail until implementation exists (RED phase)
    const userId = "test-user-id";
    const storeId = "test-store-id";
    const shiftId = "test-shift-id";
    const authToken = "test-auth-token";

    // Provide to test
    await use({
      userId,
      storeId,
      shiftId,
      authToken,
    });

    // Cleanup: Delete test data
    // Note: Cleanup will be implemented based on actual data structure
  },

  closingData: async ({ authenticatedUser, prisma }, use) => {
    // Setup: Create bins, packs, and shift opening data
    const { storeId, shiftId } = authenticatedUser;

    // Create bins
    const bin1 = await createLotteryBin(prisma, {
      store_id: storeId,
      display_order: 1,
      name: "Bin 1",
    });

    const bin2 = await createLotteryBin(prisma, {
      store_id: storeId,
      display_order: 2,
      name: "Bin 2",
    });

    // Create game and pack for bin1
    // Note: This requires game creation - simplified for now
    const pack1 = await createLotteryPack(prisma, {
      game_id: "test-game-id",
      store_id: storeId,
      current_bin_id: bin1.bin_id,
      status: "ACTIVE",
    });

    // Create shift opening
    await createLotteryShiftOpening(prisma, {
      shift_id: shiftId,
      pack_id: pack1.pack_id,
      opening_serial: "045",
    });

    const closingData = {
      bins: [
        {
          bin_id: bin1.bin_id,
          bin_number: 1,
          name: "Bin 1",
          is_active: true,
          pack: {
            pack_id: pack1.pack_id,
            game_name: "$5 Powerball",
            game_price: 5,
            starting_serial: "045",
            serial_end: pack1.serial_end,
            pack_number: pack1.pack_number,
          },
        },
        {
          bin_id: bin2.bin_id,
          bin_number: 2,
          name: "Bin 2",
          is_active: true,
          pack: null,
        },
      ],
      soldPacks: [],
    };

    // Provide to test
    await use(closingData);

    // Cleanup: Delete test data
    await prisma.lotteryShiftOpening.deleteMany({
      where: { shift_id: shiftId },
    });
    await prisma.lotteryPack.delete({ where: { pack_id: pack1.pack_id } });
    await prisma.lotteryBin.delete({ where: { bin_id: bin1.bin_id } });
    await prisma.lotteryBin.delete({ where: { bin_id: bin2.bin_id } });
  },
});
