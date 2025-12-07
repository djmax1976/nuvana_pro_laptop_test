/**
 * Lottery Test Data Factory
 *
 * Generates realistic test data for Lottery entities using faker.
 * Follows factory pattern with override support for specific scenarios.
 *
 * Story: 6.1 - Lottery Game and Pack Data Models
 */

import { faker } from "@faker-js/faker";
import {
  PrismaClient,
  LotteryGameStatus,
  LotteryPackStatus,
} from "@prisma/client";

/**
 * Create a single LotteryGame with optional overrides
 *
 * @param prisma - PrismaClient instance to use for database operations
 * @param overrides - Optional fields to override default values
 * @returns LotteryGame object for test use
 */
export const createLotteryGame = async (
  prisma: PrismaClient,
  overrides: Partial<{
    name: string;
    description: string;
    price: number;
    status: LotteryGameStatus;
  }> = {},
) => {
  return await prisma.lotteryGame.create({
    data: {
      name: overrides.name || `Game ${faker.string.alphanumeric(6)}`,
      description: overrides.description || faker.lorem.sentence(),
      price:
        overrides.price !== undefined
          ? overrides.price
          : parseFloat(faker.commerce.price({ min: 1, max: 50 })),
      status: overrides.status || LotteryGameStatus.ACTIVE,
    },
  });
};

/**
 * Create multiple LotteryGames
 *
 * @param prisma - PrismaClient instance to use for database operations
 * @param count - Number of games to create
 * @returns Array of LotteryGame objects
 */
export const createLotteryGames = async (
  prisma: PrismaClient,
  count: number,
) => {
  const games = [];
  for (let i = 0; i < count; i++) {
    games.push(await createLotteryGame(prisma));
  }
  return games;
};

/**
 * Create a single LotteryPack with required game_id and store_id
 *
 * @param prisma - PrismaClient instance to use for database operations
 * @param overrides - Required game_id and store_id, plus optional fields
 * @returns LotteryPack object for test use
 */
export const createLotteryPack = async (
  prisma: PrismaClient,
  overrides: {
    game_id: string;
    store_id: string;
    pack_number?: string;
    serial_start?: string;
    serial_end?: string;
    status?: LotteryPackStatus;
    current_bin_id?: string;
    received_at?: Date;
    activated_at?: Date;
    depleted_at?: Date;
    returned_at?: Date;
  },
) => {
  const packNumber = overrides.pack_number || faker.string.numeric(6);
  const serialStart = overrides.serial_start || faker.string.numeric(6);
  const serialEnd =
    overrides.serial_end ||
    String((parseInt(serialStart) + 99) % 1000000).padStart(6, "0");

  const status = overrides.status || LotteryPackStatus.RECEIVED;

  // Database constraints require specific timestamps based on status
  // Chronological order: received_at <= activated_at <= depleted_at <= returned_at
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 3600000);
  const twoHoursAgo = new Date(now.getTime() - 7200000);
  const threeHoursAgo = new Date(now.getTime() - 10800000);

  // received_at is required for all statuses
  const received_at =
    overrides.received_at !== undefined ? overrides.received_at : threeHoursAgo;

  // activated_at is required for ACTIVE, DEPLETED, or RETURNED
  const activated_at =
    overrides.activated_at !== undefined
      ? overrides.activated_at
      : status === LotteryPackStatus.ACTIVE ||
          status === LotteryPackStatus.DEPLETED ||
          status === LotteryPackStatus.RETURNED
        ? twoHoursAgo
        : null;

  // depleted_at is required for DEPLETED or RETURNED
  const depleted_at =
    overrides.depleted_at !== undefined
      ? overrides.depleted_at
      : status === LotteryPackStatus.DEPLETED ||
          status === LotteryPackStatus.RETURNED
        ? oneHourAgo
        : null;

  // returned_at is required for RETURNED
  const returned_at =
    overrides.returned_at !== undefined
      ? overrides.returned_at
      : status === LotteryPackStatus.RETURNED
        ? now
        : null;

  return await prisma.lotteryPack.create({
    data: {
      game_id: overrides.game_id,
      store_id: overrides.store_id,
      pack_number: packNumber,
      serial_start: serialStart,
      serial_end: serialEnd,
      status,
      current_bin_id: overrides.current_bin_id || null,
      received_at,
      activated_at,
      depleted_at,
      returned_at,
    },
  });
};

/**
 * Create multiple LotteryPacks
 *
 * @param prisma - PrismaClient instance to use for database operations
 * @param count - Number of packs to create
 * @param overrides - Required game_id and store_id, plus optional fields
 * @returns Array of LotteryPack objects
 */
export const createLotteryPacks = async (
  prisma: PrismaClient,
  count: number,
  overrides: {
    game_id: string;
    store_id: string;
    pack_number?: string;
    serial_start?: string;
    serial_end?: string;
    status?: LotteryPackStatus;
  },
) => {
  const packs = [];
  for (let i = 0; i < count; i++) {
    packs.push(await createLotteryPack(prisma, overrides));
  }
  return packs;
};

/**
 * Create a single LotteryBin with required store_id
 *
 * @param prisma - PrismaClient instance to use for database operations
 * @param overrides - Required store_id, plus optional fields
 * @returns LotteryBin object for test use
 */
export const createLotteryBin = async (
  prisma: PrismaClient,
  overrides: {
    store_id: string;
    name?: string;
    location?: string;
  },
) => {
  return await prisma.lotteryBin.create({
    data: {
      store_id: overrides.store_id,
      name: overrides.name || `Bin ${faker.string.alphanumeric(4)}`,
      location: overrides.location || faker.location.streetAddress(),
    },
  });
};

/**
 * Create multiple LotteryBins
 *
 * @param prisma - PrismaClient instance to use for database operations
 * @param count - Number of bins to create
 * @param overrides - Required store_id, plus optional fields
 * @returns Array of LotteryBin objects
 */
export const createLotteryBins = async (
  prisma: PrismaClient,
  count: number,
  overrides: {
    store_id: string;
    name?: string;
    location?: string;
  },
) => {
  const overridePromises = Array.from({ length: count }, (_, i) => {
    const binOverrides = {
      ...overrides,
      name: overrides.name ? `${overrides.name}-${i}` : undefined,
    };
    return createLotteryBin(prisma, binOverrides);
  });
  return await Promise.all(overridePromises);
};
