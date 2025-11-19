/**
 * Client Test Data Factory
 *
 * Generates realistic test data for Client entities using faker.
 * Follows factory pattern with override support for specific scenarios.
 *
 * Story: 2.6 - Client Management API and UI
 */

import { faker } from "@faker-js/faker";

/**
 * Client status enum values
 */
export type ClientStatus = "ACTIVE" | "INACTIVE";

/**
 * Client data structure for test creation
 */
export interface ClientData {
  name: string;
  status: ClientStatus;
  metadata?: Record<string, any>;
}

/**
 * Create a single client with optional overrides
 *
 * @param overrides - Optional fields to override default values
 * @returns ClientData object for test use
 *
 * @example
 * // Create with defaults
 * const client = createClient();
 *
 * // Create with specific name
 * const namedClient = createClient({ name: 'My Client' });
 *
 * // Create inactive client
 * const inactiveClient = createClient({ status: 'INACTIVE' });
 */
export const createClient = (
  overrides: Partial<ClientData> = {},
): ClientData => ({
  name: faker.company.name(),
  status: "ACTIVE",
  metadata: {
    industry: faker.company.buzzNoun(),
    region: faker.location.state(),
    tier: faker.helpers.arrayElement(["enterprise", "standard", "starter"]),
  },
  ...overrides,
});

/**
 * Create multiple clients
 *
 * @param count - Number of clients to create
 * @returns Array of ClientData objects
 *
 * @example
 * const clients = createClients(5);
 */
export const createClients = (count: number): ClientData[] =>
  Array.from({ length: count }, () => createClient());

/**
 * Create a client with specific status
 *
 * @param status - Client status (ACTIVE or INACTIVE)
 * @returns ClientData object with specified status
 */
export const createClientWithStatus = (status: ClientStatus): ClientData =>
  createClient({ status });

/**
 * Create a client with no metadata
 *
 * @returns ClientData object without metadata
 */
export const createClientNoMetadata = (): ClientData => ({
  name: faker.company.name(),
  status: "ACTIVE",
});
