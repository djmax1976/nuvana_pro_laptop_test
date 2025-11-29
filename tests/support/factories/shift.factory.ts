/**
 * Shift Test Data Factories
 *
 * Pure functions for generating test data for Shift model:
 * - Shift entities with all required fields
 * Uses faker for dynamic values to prevent collisions in parallel tests.
 *
 * Story: 4-1-shift-data-models
 */

import { faker } from "@faker-js/faker";
import { Prisma } from "@prisma/client";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../../backend/src/utils/public-id";

export type ShiftStatus =
  | "NOT_STARTED"
  | "OPEN"
  | "ACTIVE"
  | "CLOSING"
  | "RECONCILING"
  | "CLOSED"
  | "VARIANCE_REVIEW";

export type ShiftData = {
  shift_id?: string;
  store_id: string;
  opened_by: string; // User who opened the shift
  cashier_id: string;
  pos_terminal_id?: string | null;
  opened_at?: Date;
  closed_at?: Date | null;
  opening_cash?: Prisma.Decimal;
  expected_cash?: Prisma.Decimal | null;
  closing_cash?: Prisma.Decimal | null;
  variance?: Prisma.Decimal | null;
  variance_reason?: string | null;
  status?: ShiftStatus;
  approved_by?: string | null;
  approved_at?: Date | null;
  public_id?: string | null;
};

/**
 * Creates a Shift test data object
 * Requires store_id, opened_by, and cashier_id to be provided
 */
export const createShift = (
  overrides: Partial<ShiftData> & {
    store_id: string;
    opened_by: string;
    cashier_id: string;
  },
): ShiftData => ({
  pos_terminal_id: null,
  opened_at: faker.date.recent({ days: 1 }),
  closed_at: null,
  opening_cash: new Prisma.Decimal(faker.finance.amount({ min: 0, max: 1000 })),
  expected_cash: null,
  closing_cash: null,
  variance: null,
  variance_reason: null,
  status: "NOT_STARTED",
  approved_by: null,
  approved_at: null,
  public_id: generatePublicId(PUBLIC_ID_PREFIXES.SHIFT),
  ...overrides,
});

/**
 * Creates multiple Shift test data objects
 * Requires store_id, opened_by, and cashier_id to be provided
 */
export const createShifts = (
  count: number,
  overrides: Partial<ShiftData> & {
    store_id: string;
    opened_by: string;
    cashier_id: string;
  },
): ShiftData[] => Array.from({ length: count }, () => createShift(overrides));
