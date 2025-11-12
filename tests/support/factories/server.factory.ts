/**
 * Server Test Data Factories
 *
 * Pure functions for generating test data related to server responses,
 * health checks, and API responses. Uses faker for dynamic values.
 */

import { faker } from "@faker-js/faker";

export type HealthCheckResponse = {
  status: string;
  timestamp: string;
  uptime?: number;
  version?: string;
};

export type ErrorResponse = {
  error: string;
  message: string;
  statusCode: number;
  timestamp?: string;
};

/**
 * Creates a health check response object
 */
export const createHealthCheckResponse = (
  overrides: Partial<HealthCheckResponse> = {},
): HealthCheckResponse => ({
  status: "ok",
  timestamp: new Date().toISOString(),
  uptime: faker.number.int({ min: 0, max: 86400 }), // 0-24 hours in seconds
  version: faker.system.semver(),
  ...overrides,
});

/**
 * Creates an error response object
 */
export const createErrorResponse = (
  overrides: Partial<ErrorResponse> = {},
): ErrorResponse => ({
  error: faker.lorem.word(),
  message: faker.lorem.sentence(),
  statusCode: faker.number.int({ min: 400, max: 599 }),
  timestamp: new Date().toISOString(),
  ...overrides,
});

/**
 * Creates multiple health check responses
 */
export const createHealthCheckResponses = (
  count: number,
): HealthCheckResponse[] =>
  Array.from({ length: count }, () => createHealthCheckResponse());
