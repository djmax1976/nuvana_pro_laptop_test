/**
 * Database Test Data Factories
 *
 * Pure functions for generating test data related to database models:
 * - User, Company, Store entities
 * Uses faker for dynamic values to prevent collisions in parallel tests.
 */

import { faker } from "@faker-js/faker";
import { Prisma } from "@prisma/client";
import type { POSSystemType, POSConnectionType } from "@prisma/client";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../../backend/src/utils/public-id";

export type UserData = {
  id?: string;
  user_id?: string;
  public_id: string;
  email: string;
  name: string;
  password_hash?: string | null;
  auth_provider_id?: string | null;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  is_client_user?: boolean;
};

export type CompanyData = {
  company_id?: string;
  public_id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING";
  owner_user_id: string;
};

export type StoreData = {
  store_id?: string;
  public_id: string;
  company_id: string;
  name: string;
  location_json?: Prisma.InputJsonValue;
  timezone: string;
  status: "ACTIVE" | "INACTIVE" | "CLOSED";
  pos_type?: POSSystemType;
  pos_connection_type?: POSConnectionType;
  pos_connection_config?: Prisma.InputJsonValue;
};

/**
 * Validates that email matches test markers for cleanup
 */
function validateTestEmail(email: string): void {
  const testMarkers = [
    "@test.nuvana.local",
    "@test.com",
    "test_",
    "e2e-",
    "e2e_",
  ];
  const hasMarker = testMarkers.some(
    (marker) => email.endsWith(marker) || email.startsWith(marker),
  );
  if (!hasMarker && process.env.NODE_ENV !== "production") {
    console.warn(
      `⚠️  WARNING: Email "${email}" does not match test markers and may not be cleaned up automatically. Use @test.nuvana.local, @test.com, or prefix with test_/e2e-`,
    );
  }
}

/**
 * Validates that name matches test markers for cleanup
 */
function validateTestName(name: string, entityType: "company" | "store"): void {
  const testPrefixes = ["Test ", "E2E ", "test_", "e2e_"];
  const hasPrefix = testPrefixes.some((prefix) => name.startsWith(prefix));
  if (!hasPrefix && process.env.NODE_ENV !== "production") {
    console.warn(
      `⚠️  WARNING: ${entityType} name "${name}" does not start with test marker (Test /E2E /test_/e2e_) and may not be cleaned up automatically.`,
    );
  }
}

/**
 * Creates a User test data object
 * Email format: test_<random>@test.nuvana.local (identifiable for cleanup)
 */
export const createUser = (overrides: Partial<UserData> = {}): UserData => {
  const email =
    overrides.email ||
    `test_${faker.string.alphanumeric(8).toLowerCase()}@test.nuvana.local`;
  if (overrides.email) {
    validateTestEmail(email);
  }
  return {
    public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
    email,
    name: `Test ${faker.person.fullName()}`,
    auth_provider_id: faker.string.uuid(),
    status: "ACTIVE",
    ...overrides,
  };
};

/**
 * Creates a Company test data object
 * Name format: Test <random> (identifiable for cleanup)
 * owner_user_id defaults to a random UUID for test scenarios
 */
export const createCompany = (
  overrides: Partial<CompanyData> & { owner_user_id?: string } = {},
): CompanyData => {
  const name = overrides.name || `Test ${faker.company.name()}`;
  if (overrides.name) {
    validateTestName(name, "company");
  }
  return {
    public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
    name,
    status: "ACTIVE",
    owner_user_id: overrides.owner_user_id || faker.string.uuid(),
    ...overrides,
  };
};

/**
 * Creates a Store test data object
 * Name format: Test <random> Store (identifiable for cleanup)
 */
export const createStore = (overrides: Partial<StoreData> = {}): StoreData => {
  const name = overrides.name || `Test ${faker.company.name()} Store`;
  if (overrides.name) {
    validateTestName(name, "store");
  }
  return {
    public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
    company_id: overrides.company_id || faker.string.uuid(),
    name,
    location_json: {
      address: faker.location.streetAddress(),
    },
    timezone: "America/New_York",
    status: "ACTIVE",
    ...overrides,
  };
};

/**
 * Creates multiple User test data objects
 */
export const createUsers = (
  count: number,
  overrides: Partial<UserData> = {},
): UserData[] => Array.from({ length: count }, () => createUser(overrides));

/**
 * Creates multiple Company test data objects
 * Requires owner_user_id to be provided
 */
export const createCompanies = (
  count: number,
  overrides: Partial<CompanyData> & { owner_user_id: string },
): CompanyData[] =>
  Array.from({ length: count }, () => createCompany(overrides));

/**
 * Creates multiple Store test data objects for a company
 */
export const createStores = (
  count: number,
  companyId: string,
  overrides: Partial<StoreData> = {},
): StoreData[] =>
  Array.from({ length: count }, () =>
    createStore({ company_id: companyId, ...overrides }),
  );
