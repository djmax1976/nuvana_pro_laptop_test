/**
 * Test Fixtures Index
 *
 * Central export point for all test fixtures.
 * Provides a clean entry point for importing fixtures in tests.
 */

export { test, expect } from "./backend.fixture";
export {
  test as databaseTest,
  expect as databaseExpect,
} from "./database.fixture";
