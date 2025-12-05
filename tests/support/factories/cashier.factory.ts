/**
 * Cashier Test Data Factory
 *
 * Generates realistic test data for Cashier entities using faker.
 * Follows factory pattern with override support for specific scenarios.
 *
 * Story: 4.91 - Cashier Management Backend
 */

import { faker } from "@faker-js/faker";
import bcrypt from "bcrypt";

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

/**
 * Cashier database entity structure (for Prisma direct insertion)
 */
export type CashierData = {
  cashier_id?: string;
  store_id: string;
  employee_id: string;
  name: string;
  pin_hash: string;
  sha256_pin_fingerprint?: string | null;
  is_active?: boolean;
  hired_on: Date;
  termination_date?: Date | null;
  disabled_at?: Date | null;
  created_by: string;
  updated_by?: string | null;
};

/**
 * Creates a Cashier test data object for Prisma database operations
 * Requires store_id and created_by to be provided
 *
 * @param overrides - Fields to override default values, including optional pin (defaults to "0000")
 * @returns Promise<CashierData> object for Prisma.cashier.create()
 *
 * @example
 * const cashier = await prisma.cashier.create({
 *   data: await createCashier({
 *     store_id: testStore.store_id,
 *     created_by: testUser.user_id,
 *     pin: "1234", // Optional: defaults to "0000"
 *   }),
 * });
 */
export const createCashier = async (
  overrides: Partial<CashierData> & {
    store_id: string;
    created_by: string;
    pin?: string;
  },
): Promise<CashierData> => {
  const pin = overrides.pin ?? "0000";
  const pinHash = await bcrypt.hash(pin, 10);

  // Extract required fields before spreading to avoid TS2783
  const { store_id, created_by, pin: _pin, ...rest } = overrides;

  return {
    store_id,
    employee_id: faker.string.numeric(4).padStart(4, "0"),
    name: `Test Cashier ${faker.person.fullName()}`,
    pin_hash: pinHash,
    sha256_pin_fingerprint: null,
    is_active: true,
    hired_on: faker.date.past({ years: 1 }),
    termination_date: null,
    disabled_at: null,
    created_by,
    updated_by: null,
    ...rest,
  };
};

/**
 * Creates multiple Cashier test data objects
 * Requires store_id and created_by to be provided
 *
 * @param count - Number of cashiers to create
 * @param overrides - Fields to override default values, including optional pin (defaults to "0000")
 * @returns Promise<CashierData[]> array of cashier data objects
 *
 * @example
 * const cashiers = await Promise.all(
 *   (await createCashiers(5, {
 *     store_id: testStore.store_id,
 *     created_by: testUser.user_id,
 *     pin: "1234", // Optional: defaults to "0000"
 *   })).map(data => prisma.cashier.create({ data }))
 * );
 */
export const createCashiers = async (
  count: number,
  overrides: Partial<CashierData> & {
    store_id: string;
    created_by: string;
    pin?: string;
  },
): Promise<CashierData[]> =>
  Promise.all(
    Array.from({ length: count }, (_, i) =>
      createCashier({
        ...overrides,
        employee_id: String(i + 1).padStart(4, "0"),
      }),
    ),
  );
