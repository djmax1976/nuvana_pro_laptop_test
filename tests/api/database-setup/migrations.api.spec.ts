import { test, expect } from "../../support/fixtures";

/**
 * Database Setup - Migrations API Tests
 *
 * These tests verify the database migration setup:
 * - Migrations directory structure
 * - Initial migration execution
 * - Table creation
 *
 * Story: 1-3-database-setup-with-prisma
 * Status: ready-for-dev
 */

test.describe("1.3-API-003: Database Setup - Migrations", () => {
  test("[P0] 1.3-API-003-001: Migrations directory should exist", async () => {
    // GIVEN: Prisma is initialized
    // WHEN: Checking for migrations directory
    // THEN: prisma/migrations/ directory should exist
    // NOTE: This test verifies migration structure
    const fs = await import("fs");
    const path = await import("path");
    const migrationsPath = path.join(
      process.cwd(),
      "backend",
      "prisma",
      "migrations",
    );
    expect(fs.existsSync(migrationsPath)).toBe(true);
  });

  test("[P1] 1.3-API-003-002: Initial migration should create User, Company, Store tables", async ({
    prismaClient,
  }) => {
    // GIVEN: Initial migration has been run
    // WHEN: Querying database schema
    // THEN: Tables should exist and be queryable
    await expect(prismaClient.user.findMany()).resolves.not.toThrow();
    await expect(prismaClient.company.findMany()).resolves.not.toThrow();
    await expect(prismaClient.store.findMany()).resolves.not.toThrow();
  });
});
