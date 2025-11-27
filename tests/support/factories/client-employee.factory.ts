/**
 * Client Employee Test Data Factory
 *
 * Generates realistic test data for Client Employee entities using faker.
 * Follows factory pattern with override support for specific scenarios.
 *
 * Story: 2.91 - Client Employee Management
 */

import { faker } from "@faker-js/faker";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../../backend/src/utils/public-id";

/**
 * Employee creation request structure
 */
export interface CreateEmployeeRequest {
  email: string;
  name: string;
  store_id: string;
  role_id?: string;
}

/**
 * Create an employee creation request with optional overrides
 *
 * @param overrides - Optional fields to override default values
 * @returns CreateEmployeeRequest object for API testing
 *
 * @example
 * const request = createEmployeeRequest({ store_id: 'store-uuid' });
 */
export const createEmployeeRequest = (
  overrides: Partial<CreateEmployeeRequest> = {},
): CreateEmployeeRequest => ({
  email: `employee_${faker.string.alphanumeric(8).toLowerCase()}@test.nuvana.local`,
  name: `Employee ${faker.person.fullName()}`,
  store_id: "", // Must be provided
  ...overrides,
});

/**
 * Create multiple employee requests
 *
 * @param count - Number of requests to create
 * @param store_id - Store ID to use for all requests
 * @returns Array of CreateEmployeeRequest objects
 *
 * @example
 * const requests = createEmployeeRequests(5, 'store-uuid');
 */
export const createEmployeeRequests = (
  count: number,
  store_id: string,
): CreateEmployeeRequest[] =>
  Array.from({ length: count }, () => createEmployeeRequest({ store_id }));
