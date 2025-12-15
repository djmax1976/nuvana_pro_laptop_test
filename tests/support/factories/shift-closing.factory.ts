/**
 * Shift Closing Test Data Factory
 *
 * Generates realistic test data for shift closing entities using faker.
 * Follows factory pattern with override support for specific scenarios.
 *
 * Story: 10-1 - Lottery Shift Closing Page UI
 */

import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";

/**
 * Create BinWithPack test data structure
 *
 * @param overrides - Optional fields to override default values
 * @returns BinWithPack object for test use
 */
export const createBinWithPack = (
  overrides: Partial<{
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
  }> = {},
) => ({
  bin_id: overrides.bin_id || faker.string.uuid(),
  bin_number: overrides.bin_number ?? faker.number.int({ min: 1, max: 20 }),
  name:
    overrides.name ||
    `Bin ${overrides.bin_number || faker.number.int({ min: 1, max: 20 })}`,
  is_active: overrides.is_active ?? true,
  pack:
    overrides.pack !== undefined
      ? overrides.pack
      : {
          pack_id: faker.string.uuid(),
          game_name: `$${faker.number.int({ min: 1, max: 50 })} ${faker.helpers.arrayElement(["Powerball", "Mega Millions", "Scratch"])}`,
          game_price: faker.number.int({ min: 1, max: 50 }),
          starting_serial: faker.string.numeric(3),
          serial_end: faker.string.numeric(3),
          pack_number: faker.string.numeric(6),
        },
});

/**
 * Create multiple BinWithPack objects
 *
 * @param count - Number of bins to create
 * @param overrides - Optional fields to override default values
 * @returns Array of BinWithPack objects
 */
export const createBinsWithPacks = (
  count: number,
  overrides: Partial<{
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
  }> = {},
) => {
  return Array.from({ length: count }, (_, i) =>
    createBinWithPack({
      ...overrides,
      bin_number: overrides.bin_number ?? i + 1,
      name: overrides.name ? `${overrides.name}-${i + 1}` : undefined,
    }),
  );
};

/**
 * Create DepletedPack test data structure
 *
 * @param overrides - Optional fields to override default values
 * @returns DepletedPack object for test use
 */
export const createDepletedPack = (
  overrides: Partial<{
    bin_id: string;
    bin_number: number;
    pack_id: string;
    game_name: string;
    game_price: number;
    starting_serial: string;
    ending_serial: string;
  }> = {},
) => ({
  bin_id: overrides.bin_id || faker.string.uuid(),
  bin_number: overrides.bin_number ?? faker.number.int({ min: 1, max: 20 }),
  pack_id: overrides.pack_id || faker.string.uuid(),
  game_name:
    overrides.game_name ||
    `$${faker.number.int({ min: 1, max: 50 })} ${faker.helpers.arrayElement(["Powerball", "Mega Millions", "Scratch"])}`,
  game_price: overrides.game_price ?? faker.number.int({ min: 1, max: 50 }),
  starting_serial: overrides.starting_serial || faker.string.numeric(3),
  ending_serial: overrides.ending_serial || faker.string.numeric(3),
});

/**
 * Create multiple DepletedPack objects
 *
 * @param count - Number of depleted packs to create
 * @param overrides - Optional fields to override default values
 * @returns Array of DepletedPack objects
 */
export const createDepletedPacks = (
  count: number,
  overrides: Partial<{
    bin_id: string;
    bin_number: number;
    pack_id: string;
    game_name: string;
    game_price: number;
    starting_serial: string;
    ending_serial: string;
  }> = {},
) => {
  return Array.from({ length: count }, (_, i) =>
    createDepletedPack({
      ...overrides,
      bin_number: overrides.bin_number ?? i + 1,
    }),
  );
};

/**
 * Create LotteryClosingData response structure
 *
 * @param overrides - Optional fields to override default values
 * @returns LotteryClosingData response object
 */
export const createLotteryClosingData = (
  overrides: Partial<{
    bins: ReturnType<typeof createBinWithPack>[];
    soldPacks: ReturnType<typeof createDepletedPack>[];
  }> = {},
) => ({
  bins: overrides.bins || createBinsWithPacks(3),
  soldPacks: overrides.soldPacks || [],
});
