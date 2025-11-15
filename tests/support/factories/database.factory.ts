/**
 * Database Test Data Factories
 *
 * Pure functions for generating test data related to database models:
 * - User, Company, Store entities
 * Uses faker for dynamic values to prevent collisions in parallel tests.
 */

import { faker } from "@faker-js/faker";

export type UserData = {
  id?: string;
  email: string;
  name: string;
  auth_provider_id?: string | null;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
};

export type CompanyData = {
  name: string;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING";
};

export type StoreData = {
  company_id: string;
  name: string;
  location_json?: {
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    latitude?: number;
    longitude?: number;
  } | null;
  timezone: string;
  status: "ACTIVE" | "INACTIVE" | "CLOSED";
};

/**
 * Creates a User test data object
 */
export const createUser = (overrides: Partial<UserData> = {}): UserData => ({
  email: faker.internet.email(),
  name: faker.person.fullName(),
  auth_provider_id: faker.string.uuid(),
  status: "ACTIVE",
  ...overrides,
});

/**
 * Creates a Company test data object
 */
export const createCompany = (
  overrides: Partial<CompanyData> = {},
): CompanyData => ({
  name: faker.company.name(),
  status: "ACTIVE",
  ...overrides,
});

/**
 * Creates a Store test data object
 */
export const createStore = (overrides: Partial<StoreData> = {}): StoreData => ({
  company_id: overrides.company_id || faker.string.uuid(),
  name: `${faker.company.name()} Store`,
  location_json: {
    address: faker.location.streetAddress(),
    city: faker.location.city(),
    state: faker.location.state({ abbreviated: true }),
    zip: faker.location.zipCode(),
    latitude: Number(faker.location.latitude()),
    longitude: Number(faker.location.longitude()),
  },
  timezone: "America/New_York",
  status: "ACTIVE",
  ...overrides,
});

/**
 * Creates multiple User test data objects
 */
export const createUsers = (
  count: number,
  overrides: Partial<UserData> = {},
): UserData[] => Array.from({ length: count }, () => createUser(overrides));

/**
 * Creates multiple Company test data objects
 */
export const createCompanies = (
  count: number,
  overrides: Partial<CompanyData> = {},
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
