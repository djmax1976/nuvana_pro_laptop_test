/**
 * POS Terminal Test Data Factories
 *
 * Pure functions for generating test data for POSTerminal model:
 * - Terminal entities with all required fields
 * Uses faker for dynamic values to prevent collisions in parallel tests.
 *
 * Story: 4-8-cashier-shift-start-flow
 */

import { faker } from "@faker-js/faker";

export type TerminalData = {
  pos_terminal_id?: string;
  store_id: string;
  name: string;
  device_id?: string | null;
  deleted_at?: Date | null;
};

/**
 * Creates a POSTerminal test data object
 * Requires store_id to be provided
 */
export const createTerminal = (
  overrides: Partial<TerminalData> & {
    store_id: string;
  },
): TerminalData => ({
  name: `Terminal ${faker.number.int({ min: 1, max: 999 })}`,
  device_id: `device-${faker.string.alphanumeric(8)}`,
  deleted_at: null,
  ...overrides,
});

/**
 * Creates multiple POSTerminal test data objects
 * Requires store_id to be provided
 */
export const createTerminals = (
  count: number,
  overrides: Partial<TerminalData> & {
    store_id: string;
  },
): TerminalData[] =>
  Array.from({ length: count }, () => createTerminal(overrides));
