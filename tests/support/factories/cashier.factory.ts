/**
 * Cashier Test Data Factory
 *
 * Generates realistic test data for Cashier entities using faker.
 * Follows factory pattern with override support for specific scenarios.
 *
 * Story: 4.91 - Cashier Management Backend
 */

import { faker } from "@faker-js/faker";

/**
 * Cashier creation request structure
 */
export interface CreateCashierRequest {
  name: string;
  pin: string; // 4-digit numeric PIN
  hired_on: string; // ISO date string
  store_id: string;
}

/**
 * Create a cashier creation request with optional overrides
 *
 * @param overrides - Optional fields to override default values
 * @returns CreateCashierRequest object for API testing
 *
 * @example
 * const request = createCashierRequest({ store_id: 'store-uuid', pin: '1234' });
 */
export const createCashierRequest = (
  overrides: Partial<CreateCashierRequest> = {},
): CreateCashierRequest => ({
  name: `Cashier ${faker.person.fullName()}`,
  pin: faker.string.numeric(4), // Generate random 4-digit PIN
  hired_on: faker.date.past({ years: 1 }).toISOString().split("T")[0], // Date only (YYYY-MM-DD)
  store_id: "", // Must be provided
  ...overrides,
});

/**
 * Create multiple cashier requests
 *
 * @param count - Number of requests to create
 * @param store_id - Store ID to use for all requests
 * @returns Array of CreateCashierRequest objects
 *
 * @example
 * const requests = createCashierRequests(5, 'store-uuid');
 */
export const createCashierRequests = (
  count: number,
  store_id: string,
): CreateCashierRequest[] =>
  Array.from({ length: count }, () => createCashierRequest({ store_id }));
