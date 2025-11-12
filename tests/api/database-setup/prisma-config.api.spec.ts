import { test, expect } from "../../support/fixtures";

/**
 * Database Setup - Prisma Configuration API Tests
 *
 * These tests verify the Prisma installation and configuration:
 * - Prisma Client generation
 * - Database connection
 * - Schema model availability
 *
 * Story: 1-3-database-setup-with-prisma
 * Status: ready-for-dev
 */

test.describe("1.3-API-001: Database Setup - Prisma Configuration", () => {
  test("[P0] 1.3-API-001-001: Prisma Client should be generated and importable", async ({
    prismaClient,
  }) => {
    // GIVEN: Prisma is installed and configured
    // WHEN: Importing Prisma Client
    // THEN: Prisma Client should be available
    // NOTE: This test will fail until Prisma Client is generated
    expect(prismaClient).toBeDefined();
  });

  test("[P0] 1.3-API-001-002: Prisma Client should connect to database", async ({
    prismaClient,
  }) => {
    // GIVEN: Prisma Client is generated and DATABASE_URL is configured
    // WHEN: Using Prisma Client instance from fixture
    // THEN: Client should be connected (fixture handles connection)
    expect(prismaClient).toBeDefined();
    // Connection is verified by fixture setup
  });

  test("[P0] 1.3-API-001-003: Database schema should include User model", async ({
    prismaClient,
  }) => {
    // GIVEN: Prisma schema is defined with User model
    // WHEN: Querying User model
    // THEN: User model should be available
    expect(prismaClient.user).toBeDefined();
    expect(prismaClient.user.findMany).toBeDefined();
  });

  test("[P0] 1.3-API-001-004: Database schema should include Company model", async ({
    prismaClient,
  }) => {
    // GIVEN: Prisma schema is defined with Company model
    // WHEN: Querying Company model
    // THEN: Company model should be available
    expect(prismaClient.company).toBeDefined();
    expect(prismaClient.company.findMany).toBeDefined();
  });

  test("[P0] 1.3-API-001-005: Database schema should include Store model", async ({
    prismaClient,
  }) => {
    // GIVEN: Prisma schema is defined with Store model
    // WHEN: Querying Store model
    // THEN: Store model should be available
    expect(prismaClient.store).toBeDefined();
    expect(prismaClient.store.findMany).toBeDefined();
  });
});
