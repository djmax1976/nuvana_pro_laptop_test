/**
 * Lottery UI Test Data Factory
 *
 * Generates mock test data for Lottery UI integration tests using faker.
 * Pure functions that return mock objects (no database operations).
 * Follows factory pattern with override support for specific scenarios.
 *
 * Story: 6.10 - Lottery Management UI
 */

import { faker } from "@faker-js/faker";

export type LotteryGameMock = {
  game_id: string;
  name: string;
};

export type LotteryPackMock = {
  pack_id: string;
  game_id: string;
  pack_number: string;
  serial_start: string;
  serial_end: string;
  status: "RECEIVED" | "ACTIVE" | "DEPLETED" | "RETURNED";
  store_id: string;
  current_bin_id: string | null;
  received_at: string;
  activated_at: string | null;
  game: LotteryGameMock;
  store: {
    store_id: string;
    name: string;
  };
  bin: {
    bin_id: string;
    name: string;
  } | null;
};

export type LotteryVarianceMock = {
  variance_id: string;
  shift_id: string;
  pack_id: string;
  expected_count: number;
  actual_count: number;
  difference: number;
  approved_at: string | null;
  pack: {
    pack_number: string;
    game: {
      name: string;
    };
  };
  shift: {
    shift_id: string;
    opened_at: string;
  };
};

export type LotteryShiftOpeningMock = {
  opening_id: string;
  shift_id: string;
  opening_serial: string;
  created_at: string;
  shift: {
    shift_id: string;
    shift_number: number;
    status: string;
  };
};

export type LotteryShiftClosingMock = {
  closing_id: string;
  shift_id: string;
  closing_serial: string;
  opening_serial: string;
  expected_count: number;
  actual_count: number;
  difference: number;
  has_variance: boolean;
  created_at: string;
  shift: {
    shift_id: string;
    shift_number: number;
    status: string;
  };
};

/**
 * Create a mock LotteryGame with optional overrides
 */
export const createMockGame = (
  overrides: Partial<LotteryGameMock> = {},
): LotteryGameMock => ({
  game_id: overrides.game_id || faker.string.uuid(),
  name: overrides.name || `${faker.company.name()} Game`,
});

/**
 * Create a mock LotteryPack with optional overrides
 */
export const createMockPack = (
  overrides: Partial<LotteryPackMock> = {},
): LotteryPackMock => {
  const game = overrides.game || createMockGame();
  const storeId = overrides.store_id || faker.string.uuid();
  const serialStart =
    overrides.serial_start ||
    faker.number.int({ min: 1000, max: 9999 }).toString();
  const serialEnd =
    overrides.serial_end ||
    faker.number.int({ min: parseInt(serialStart) + 1, max: 99999 }).toString();
  const status = overrides.status || "RECEIVED";
  const now = new Date().toISOString();
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();

  return {
    pack_id: overrides.pack_id || faker.string.uuid(),
    game_id: game.game_id,
    pack_number:
      overrides.pack_number ||
      `PACK-${faker.string.alphanumeric(6).toUpperCase()}`,
    serial_start: serialStart,
    serial_end: serialEnd,
    status,
    store_id: storeId,
    current_bin_id:
      overrides.current_bin_id !== undefined ? overrides.current_bin_id : null,
    received_at: overrides.received_at || oneHourAgo,
    activated_at:
      overrides.activated_at !== undefined
        ? overrides.activated_at
        : status === "ACTIVE" || status === "DEPLETED" || status === "RETURNED"
          ? now
          : null,
    game,
    store: overrides.store || {
      store_id: storeId,
      name: `${faker.company.name()} Store`,
    },
    bin: overrides.bin !== undefined ? overrides.bin : null,
  };
};

/**
 * Create a mock LotteryVariance with optional overrides
 */
export const createMockVariance = (
  overrides: Partial<LotteryVarianceMock> = {},
): LotteryVarianceMock => {
  const pack = overrides.pack || {
    pack_number: `PACK-${faker.string.alphanumeric(6).toUpperCase()}`,
    game: {
      name: `${faker.company.name()} Game`,
    },
  };
  const expectedCount =
    overrides.expected_count ?? faker.number.int({ min: 50, max: 500 });
  const actualCount =
    overrides.actual_count ?? faker.number.int({ min: 0, max: expectedCount });
  const difference =
    overrides.difference !== undefined
      ? overrides.difference
      : actualCount - expectedCount;

  return {
    variance_id: overrides.variance_id || faker.string.uuid(),
    shift_id: overrides.shift_id || faker.string.uuid(),
    pack_id: overrides.pack_id || faker.string.uuid(),
    expected_count: expectedCount,
    actual_count: actualCount,
    difference,
    approved_at:
      overrides.approved_at !== undefined ? overrides.approved_at : null,
    pack,
    shift: overrides.shift || {
      shift_id: faker.string.uuid(),
      opened_at: new Date().toISOString(),
    },
  };
};

/**
 * Create a mock LotteryShiftOpening with optional overrides
 */
export const createMockShiftOpening = (
  overrides: Partial<LotteryShiftOpeningMock> = {},
): LotteryShiftOpeningMock => ({
  opening_id: overrides.opening_id || faker.string.uuid(),
  shift_id: overrides.shift_id || faker.string.uuid(),
  opening_serial:
    overrides.opening_serial ||
    faker.number.int({ min: 1000, max: 9999 }).toString(),
  created_at: overrides.created_at || new Date().toISOString(),
  shift: overrides.shift || {
    shift_id: faker.string.uuid(),
    shift_number: faker.number.int({ min: 1, max: 100 }),
    status: "OPEN",
  },
});

/**
 * Create a mock LotteryShiftClosing with optional overrides
 */
export const createMockShiftClosing = (
  overrides: Partial<LotteryShiftClosingMock> = {},
): LotteryShiftClosingMock => {
  const openingSerial =
    overrides.opening_serial ||
    faker.number.int({ min: 1000, max: 9999 }).toString();
  const closingSerial =
    overrides.closing_serial ||
    faker.number
      .int({ min: parseInt(openingSerial) + 1, max: 99999 })
      .toString();
  const expectedCount =
    overrides.expected_count ?? faker.number.int({ min: 50, max: 500 });
  const actualCount =
    overrides.actual_count ?? faker.number.int({ min: 0, max: expectedCount });
  const difference =
    overrides.difference !== undefined
      ? overrides.difference
      : actualCount - expectedCount;

  return {
    closing_id: overrides.closing_id || faker.string.uuid(),
    shift_id: overrides.shift_id || faker.string.uuid(),
    closing_serial: closingSerial,
    opening_serial: openingSerial,
    expected_count: expectedCount,
    actual_count: actualCount,
    difference,
    has_variance:
      overrides.has_variance !== undefined
        ? overrides.has_variance
        : difference !== 0,
    created_at: overrides.created_at || new Date().toISOString(),
    shift: overrides.shift || {
      shift_id: faker.string.uuid(),
      shift_number: faker.number.int({ min: 1, max: 100 }),
      status: "CLOSING",
    },
  };
};
