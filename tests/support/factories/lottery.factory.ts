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
  LotteryPackReturnReason,
} from "@prisma/client";

/**
 * Create a single LotteryGame with optional overrides
 *
 * @param prisma - PrismaClient instance to use for database operations
 * @param overrides - Optional fields to override default values
 *   Note: store_id is optional - games can be global or store-scoped
 * @returns LotteryGame object for test use
 */
export const createLotteryGame = async (
  prisma: PrismaClient,
  overrides: Partial<{
    game_code: string;
    name: string;
    description: string;
    price: number;
    pack_value: number;
    tickets_per_pack: number;
    status: LotteryGameStatus;
    store_id: string; // Optional - if provided, game is scoped to store
  }> = {},
) => {
  // Generate unique game_code using random 4-digit number to avoid collisions
  // Retry on unique constraint violations
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    try {
      const uniqueCode =
        overrides.game_code ||
        faker.string.numeric({ length: 4, exclude: ["0000"] });

      const price =
        overrides.price !== undefined
          ? overrides.price
          : parseFloat(faker.commerce.price({ min: 1, max: 50 }));

      // Calculate pack_value based on price if not provided (typically price * 30 for standard packs)
      const pack_value =
        overrides.pack_value !== undefined
          ? overrides.pack_value
          : Math.round(price * 30);

      // Calculate tickets_per_pack: pack_value / price (required for serial_end calculation)
      const tickets_per_pack =
        overrides.tickets_per_pack !== undefined
          ? overrides.tickets_per_pack
          : Math.floor(pack_value / price);

      return await prisma.lotteryGame.create({
        data: {
          game_code: uniqueCode,
          name: overrides.name || `Game ${faker.string.alphanumeric(6)}`,
          description: overrides.description || faker.lorem.sentence(),
          price,
          pack_value,
          tickets_per_pack,
          status: overrides.status || LotteryGameStatus.ACTIVE,
          ...(overrides.store_id && { store_id: overrides.store_id }),
        },
      });
    } catch (error: any) {
      // If unique constraint violation and no explicit game_code override, retry
      if (
        error.code === "P2002" &&
        !overrides.game_code &&
        attempts < maxAttempts - 1
      ) {
        attempts++;
        continue;
      }
      // Otherwise, rethrow the error
      throw error;
    }
  }
  throw new Error(
    `Failed to create lottery game after ${maxAttempts} attempts due to game_code collisions`,
  );
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
    activated_by?: string;
    activated_shift_id?: string;
    depleted_at?: Date;
    depleted_by?: string;
    depleted_shift_id?: string;
    returned_at?: Date;
    // Returned pack tracking fields
    last_sold_serial?: string;
    tickets_sold_on_return?: number;
    return_sales_amount?: import("@prisma/client/runtime/library").Decimal;
    return_reason?: LotteryPackReturnReason;
    return_notes?: string;
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

  // When activated_at is explicitly provided, use it as the reference point
  // Otherwise use current time as reference
  const referenceTime = overrides.activated_at
    ? new Date(overrides.activated_at).getTime()
    : now.getTime();

  const oneHourBefore = new Date(referenceTime - 3600000);
  const oneHourAfter = new Date(referenceTime + 3600000);

  // activated_at is required for ACTIVE, DEPLETED, or RETURNED
  const activated_at =
    overrides.activated_at !== undefined
      ? overrides.activated_at
      : status === LotteryPackStatus.ACTIVE ||
          status === LotteryPackStatus.DEPLETED ||
          status === LotteryPackStatus.RETURNED
        ? new Date(now.getTime() - 7200000) // 2 hours ago
        : null;

  // received_at must be <= activated_at (use 1 hour before activated_at if not provided)
  const received_at =
    overrides.received_at !== undefined
      ? overrides.received_at
      : activated_at
        ? new Date(new Date(activated_at).getTime() - 3600000)
        : oneHourBefore;

  // depleted_at is required for DEPLETED or RETURNED (must be >= activated_at)
  const depleted_at =
    overrides.depleted_at !== undefined
      ? overrides.depleted_at
      : status === LotteryPackStatus.DEPLETED ||
          status === LotteryPackStatus.RETURNED
        ? activated_at
          ? new Date(new Date(activated_at).getTime() + 3600000)
          : oneHourAfter
        : null;

  // returned_at is required for RETURNED (must be >= depleted_at)
  const returned_at =
    overrides.returned_at !== undefined
      ? overrides.returned_at
      : status === LotteryPackStatus.RETURNED
        ? depleted_at
          ? new Date(new Date(depleted_at).getTime() + 3600000)
          : now
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
      activated_by: overrides.activated_by || null,
      activated_shift_id: overrides.activated_shift_id || null,
      depleted_at,
      depleted_by: overrides.depleted_by || null,
      depleted_shift_id: overrides.depleted_shift_id || null,
      returned_at,
      // Returned pack tracking fields
      last_sold_serial: overrides.last_sold_serial || null,
      tickets_sold_on_return: overrides.tickets_sold_on_return ?? null,
      return_sales_amount: overrides.return_sales_amount || null,
      return_reason: overrides.return_reason || null,
      return_notes: overrides.return_notes || null,
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
 *   - bin_number: Convenience field to auto-generate name as "Bin {bin_number}"
 *     and set display_order to bin_number
 * @returns LotteryBin object for test use
 */
export const createLotteryBin = async (
  prisma: PrismaClient,
  overrides: {
    store_id: string;
    name?: string;
    location?: string;
    display_order?: number;
    is_active?: boolean;
    bin_number?: number; // Convenience field: auto-generates name and display_order
  },
) => {
  // If bin_number is provided, use it for name and display_order (unless explicitly overridden)
  const binNumber = overrides.bin_number;
  const name =
    overrides.name ||
    (binNumber !== undefined
      ? `Bin ${binNumber}`
      : `Bin ${faker.string.alphanumeric(4)}`);
  const displayOrder = overrides.display_order ?? binNumber ?? 0;

  return await prisma.lotteryBin.create({
    data: {
      store_id: overrides.store_id,
      name,
      location: overrides.location || faker.location.streetAddress(),
      display_order: displayOrder,
      is_active: overrides.is_active ?? true,
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

/**
 * Create a single LotteryVariance with required shift_id and pack_id
 *
 * @param prisma - PrismaClient instance to use for database operations
 * @param overrides - Required shift_id and pack_id, plus optional fields
 * @returns LotteryVariance object for test use
 */
/**
 * Create a single LotteryVariance with required shift_id and pack_id
 * Note: Status is determined by approved_by/approved_at (null = unresolved, set = resolved)
 *
 * @param prisma - PrismaClient instance to use for database operations
 * @param overrides - Required shift_id and pack_id, plus optional fields
 * @returns LotteryVariance object for test use
 */
export const createLotteryVariance = async (
  prisma: PrismaClient,
  overrides: {
    shift_id: string;
    pack_id: string;
    expected: number;
    actual: number;
    difference?: number;
    reason?: string;
    approved_by?: string | null;
    approved_at?: Date | null;
  },
) => {
  // Note: difference = actual - expected (per database constraint lottery_variances_difference_check)
  // Positive difference means over (actual > expected), negative means under (actual < expected)
  const difference =
    overrides.difference !== undefined
      ? overrides.difference
      : overrides.actual - overrides.expected;

  return await prisma.lotteryVariance.create({
    data: {
      shift_id: overrides.shift_id,
      pack_id: overrides.pack_id,
      expected: overrides.expected,
      actual: overrides.actual,
      difference,
      reason: overrides.reason || null,
      approved_by:
        overrides.approved_by !== undefined ? overrides.approved_by : null,
      approved_at:
        overrides.approved_at !== undefined ? overrides.approved_at : null,
    },
  });
};

/**
 * Create multiple LotteryVariances
 *
 * @param prisma - PrismaClient instance to use for database operations
 * @param count - Number of variances to create
 * @param overrides - Required shift_id and pack_id, plus optional fields
 * @returns Array of LotteryVariance objects
 */
export const createLotteryVariances = async (
  prisma: PrismaClient,
  count: number,
  overrides: {
    shift_id: string;
    pack_id: string;
    expected: number;
    actual: number;
  },
) => {
  const variancePromises = Array.from({ length: count }, () =>
    createLotteryVariance(prisma, overrides),
  );
  return await Promise.all(variancePromises);
};

/**
 * Create a single LotteryShiftOpening with required shift_id, pack_id, and opening_serial
 *
 * @param prisma - PrismaClient instance to use for database operations
 * @param overrides - Required shift_id, pack_id, and opening_serial
 * @returns LotteryShiftOpening object for test use
 */
export const createLotteryShiftOpening = async (
  prisma: PrismaClient,
  overrides: {
    shift_id: string;
    pack_id: string;
    opening_serial: string;
  },
) => {
  return await prisma.lotteryShiftOpening.create({
    data: {
      shift_id: overrides.shift_id,
      pack_id: overrides.pack_id,
      opening_serial: overrides.opening_serial,
    },
  });
};

/**
 * Create a single LotteryShiftClosing with required shift_id, pack_id, and closing_serial
 *
 * @param prisma - PrismaClient instance to use for database operations
 * @param overrides - Required shift_id, pack_id, and closing_serial, plus optional entry_method tracking
 * @returns LotteryShiftClosing object for test use
 */
export const createLotteryShiftClosing = async (
  prisma: PrismaClient,
  overrides: {
    shift_id: string;
    pack_id: string;
    closing_serial: string;
    entry_method?: "SCAN" | "MANUAL";
    manual_entry_authorized_by?: string;
    manual_entry_authorized_at?: Date;
  },
) => {
  return await prisma.lotteryShiftClosing.create({
    data: {
      shift_id: overrides.shift_id,
      pack_id: overrides.pack_id,
      closing_serial: overrides.closing_serial,
      entry_method: overrides.entry_method || null,
      manual_entry_authorized_by: overrides.manual_entry_authorized_by || null,
      manual_entry_authorized_at: overrides.manual_entry_authorized_at || null,
    },
  });
};

/**
 * Create a single LotteryBusinessDay with required store_id and business_date
 *
 * @param prisma - PrismaClient instance to use for database operations
 * @param overrides - Required store_id and business_date, plus optional fields
 * @returns LotteryBusinessDay object for test use
 */
export const createLotteryBusinessDay = async (
  prisma: PrismaClient,
  overrides: {
    store_id: string;
    business_date: Date;
    status?: "OPEN" | "PENDING" | "CLOSED";
    opened_at?: Date;
    closed_at?: Date;
    pending_close_at?: Date;
    pending_close_by?: string;
  },
) => {
  return await prisma.lotteryBusinessDay.create({
    data: {
      store_id: overrides.store_id,
      business_date: overrides.business_date,
      status: overrides.status || "OPEN",
      opened_at: overrides.opened_at,
      closed_at: overrides.closed_at,
      pending_close_at: overrides.pending_close_at,
      pending_close_by: overrides.pending_close_by,
    },
  });
};

/**
 * Create a single LotteryDayPack with required day_id and pack_id
 *
 * @param prisma - PrismaClient instance to use for database operations
 * @param overrides - Required day_id and pack_id, plus optional serial and sales data
 * @returns LotteryDayPack object for test use
 */
export const createLotteryDayPack = async (
  prisma: PrismaClient,
  overrides: {
    day_id: string;
    pack_id: string;
    starting_serial?: string;
    ending_serial?: string;
    tickets_sold?: number;
    sales_amount?: import("@prisma/client/runtime/library").Decimal;
  },
) => {
  return await prisma.lotteryDayPack.create({
    data: {
      day_id: overrides.day_id,
      pack_id: overrides.pack_id,
      starting_serial: overrides.starting_serial || "000", // Default to "000" for new packs
      ending_serial: overrides.ending_serial,
      tickets_sold: overrides.tickets_sold,
      sales_amount: overrides.sales_amount,
    },
  });
};
