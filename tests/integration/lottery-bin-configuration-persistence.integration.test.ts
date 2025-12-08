/**
 * Integration Tests: Lottery Bin Configuration Persistence
 *
 * Tests database operations for LotteryBinConfiguration model:
 * - Table creation via migration
 * - Model creation with all required fields
 * - Foreign key constraints (store_id)
 * - Unique constraint on store_id (one configuration per store)
 * - JSON bin_template storage and retrieval
 * - Cascade delete behavior
 *
 * @test-level INTEGRATION
 * @justification Tests database operations, foreign key constraints, and Prisma Client queries that require database connection
 * @story 6-13 - Lottery Database Enhancements & Bin Management
 * @priority P1 (High - Database Constraints)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createLotteryGame } from "../support/factories/lottery.factory";

const prisma = new PrismaClient();

// Test data - isolated per test suite
let testUser: any;
let testCompany: any;
let testStore: any;
let testStore2: any;

// ═══════════════════════════════════════════════════════════════════════════
// TEST SETUP & TEARDOWN
// ═══════════════════════════════════════════════════════════════════════════

beforeAll(async () => {
  // GIVEN: Test infrastructure exists (company, stores)
  testUser = await prisma.user.create({
    data: {
      email: `test-config-${Date.now()}@test.com`,
      name: "Test User",
      public_id: `USR${Date.now()}`,
    },
  });

  testCompany = await prisma.company.create({
    data: {
      name: "Test Company",
      owner_user_id: testUser.user_id,
      public_id: `COM${Date.now()}`,
    },
  });

  testStore = await prisma.store.create({
    data: {
      company_id: testCompany.company_id,
      name: "Test Store",
      public_id: `STR${Date.now()}`,
    },
  });

  testStore2 = await prisma.store.create({
    data: {
      company_id: testCompany.company_id,
      name: "Test Store 2",
      public_id: `STR2${Date.now()}`,
    },
  });
});

beforeEach(async () => {
  // Ensure test isolation - clean up configuration data before each test
  await prisma.lotteryBinConfiguration.deleteMany({});
});

afterAll(async () => {
  // Cleanup all test data
  await prisma.lotteryBinConfiguration.deleteMany({});
  if (testStore2)
    await prisma.store.delete({ where: { store_id: testStore2.store_id } });
  if (testStore)
    await prisma.store.delete({ where: { store_id: testStore.store_id } });
  if (testCompany)
    await prisma.company.delete({
      where: { company_id: testCompany.company_id },
    });
  if (testUser)
    await prisma.user.delete({ where: { user_id: testUser.user_id } });
  await prisma.$disconnect();
});

// ═══════════════════════════════════════════════════════════════════════════
// LOTTERY BIN CONFIGURATION MODEL TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("6.13-INTEGRATION: Lottery Bin Configuration Persistence", () => {
  describe("Model Creation", () => {
    it("6.13-INTEGRATION-025: should create configuration with all required fields", async () => {
      // GIVEN: A store exists
      const binTemplate = [
        { name: "Bin 1", location: "Front", display_order: 0 },
        { name: "Bin 2", location: "Back", display_order: 1 },
      ];

      // WHEN: Creating a configuration with required fields
      const config = await prisma.lotteryBinConfiguration.create({
        data: {
          store_id: testStore.store_id,
          bin_template: binTemplate,
        },
      });

      // THEN: Configuration is created with all fields
      expect(config.config_id).toBeDefined();
      expect(config.store_id).toBe(testStore.store_id);
      expect(config.bin_template).toEqual(binTemplate);
      expect(config.created_at).toBeDefined();
      expect(config.updated_at).toBeDefined();
    });

    it("6.13-INTEGRATION-026: should store complex bin template JSON", async () => {
      // GIVEN: A complex bin template
      const binTemplate = [
        { name: "Front Display", location: "Aisle 1", display_order: 0 },
        { name: "Middle Display", location: "Aisle 2", display_order: 1 },
        { name: "Back Display", location: "Aisle 3", display_order: 2 },
        { name: "Counter Top", location: "Checkout", display_order: 3 },
      ];

      // WHEN: Creating a configuration
      const config = await prisma.lotteryBinConfiguration.create({
        data: {
          store_id: testStore.store_id,
          bin_template: binTemplate,
        },
      });

      // THEN: Complex template is stored and retrieved correctly
      expect(config.bin_template).toEqual(binTemplate);
      expect(Array.isArray(config.bin_template)).toBe(true);
      expect(config.bin_template.length).toBe(4);
    });

    it("6.13-INTEGRATION-027: should store bin template with optional location", async () => {
      // GIVEN: A bin template with some bins having location and some without
      const binTemplate = [
        { name: "Bin 1", location: "Front", display_order: 0 },
        { name: "Bin 2", display_order: 1 }, // location is optional
        { name: "Bin 3", location: "Back", display_order: 2 },
      ];

      // WHEN: Creating a configuration
      const config = await prisma.lotteryBinConfiguration.create({
        data: {
          store_id: testStore.store_id,
          bin_template: binTemplate,
        },
      });

      // THEN: Template is stored correctly with optional fields
      expect(config.bin_template).toEqual(binTemplate);
      expect(config.bin_template[1].location).toBeUndefined();
    });
  });

  describe("Unique Constraint", () => {
    it("6.13-INTEGRATION-028: should enforce unique constraint on store_id", async () => {
      // GIVEN: A configuration for testStore exists
      await prisma.lotteryBinConfiguration.create({
        data: {
          store_id: testStore.store_id,
          bin_template: [{ name: "Bin 1", display_order: 0 }],
        },
      });

      // WHEN: Creating another configuration for the same store
      // THEN: Unique constraint error is raised
      await expect(
        prisma.lotteryBinConfiguration.create({
          data: {
            store_id: testStore.store_id,
            bin_template: [{ name: "Bin 2", display_order: 1 }],
          },
        }),
      ).rejects.toThrow();
    });

    it("6.13-INTEGRATION-029: should allow configurations for different stores", async () => {
      // GIVEN: Two different stores exist
      // WHEN: Creating configurations for each store
      const config1 = await prisma.lotteryBinConfiguration.create({
        data: {
          store_id: testStore.store_id,
          bin_template: [{ name: "Store 1 Bin", display_order: 0 }],
        },
      });

      const config2 = await prisma.lotteryBinConfiguration.create({
        data: {
          store_id: testStore2.store_id,
          bin_template: [{ name: "Store 2 Bin", display_order: 0 }],
        },
      });

      // THEN: Both configurations are created successfully
      expect(config1.store_id).toBe(testStore.store_id);
      expect(config2.store_id).toBe(testStore2.store_id);
    });
  });

  describe("Foreign Key Constraints", () => {
    it("6.13-INTEGRATION-030: should enforce store_id foreign key constraint", async () => {
      // GIVEN: An invalid store_id
      // WHEN: Creating a configuration with non-existent store_id
      // THEN: Foreign key constraint error is raised
      await expect(
        prisma.lotteryBinConfiguration.create({
          data: {
            store_id: "00000000-0000-0000-0000-000000000000",
            bin_template: [{ name: "Bin 1", display_order: 0 }],
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe("Cascade Delete", () => {
    it("6.13-INTEGRATION-031: should cascade delete configuration when store is deleted", async () => {
      // GIVEN: A store with configuration exists
      const store = await prisma.store.create({
        data: {
          company_id: testCompany.company_id,
          name: "Cascade Store",
          public_id: `CSC${Date.now()}`,
        },
      });

      const config = await prisma.lotteryBinConfiguration.create({
        data: {
          store_id: store.store_id,
          bin_template: [{ name: "Bin 1", display_order: 0 }],
        },
      });

      // WHEN: Deleting the store
      await prisma.store.delete({
        where: { store_id: store.store_id },
      });

      // THEN: Configuration is also deleted (cascade)
      const deletedConfig = await prisma.lotteryBinConfiguration.findUnique({
        where: { config_id: config.config_id },
      });
      expect(deletedConfig).toBeNull();
    });
  });

  describe("Configuration Updates", () => {
    it("6.13-INTEGRATION-032: should update bin_template and updated_at timestamp", async () => {
      // GIVEN: A configuration exists
      const initialTemplate = [{ name: "Bin 1", display_order: 0 }];
      const config = await prisma.lotteryBinConfiguration.create({
        data: {
          store_id: testStore.store_id,
          bin_template: initialTemplate,
        },
      });

      const initialUpdatedAt = config.updated_at;

      // Wait a bit to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      // WHEN: Updating the bin_template
      const updatedTemplate = [
        { name: "Bin 1", display_order: 0 },
        { name: "Bin 2", display_order: 1 },
      ];

      const updatedConfig = await prisma.lotteryBinConfiguration.update({
        where: { config_id: config.config_id },
        data: { bin_template: updatedTemplate },
      });

      // THEN: Template is updated and updated_at timestamp is changed
      expect(updatedConfig.bin_template).toEqual(updatedTemplate);
      expect(updatedConfig.updated_at.getTime()).toBeGreaterThan(
        initialUpdatedAt.getTime(),
      );
    });
  });

  describe("JSON Query Operations", () => {
    it("6.13-INTEGRATION-033: should query configuration by store_id", async () => {
      // GIVEN: Configurations for multiple stores exist
      await prisma.lotteryBinConfiguration.create({
        data: {
          store_id: testStore.store_id,
          bin_template: [{ name: "Store 1 Bin", display_order: 0 }],
        },
      });

      await prisma.lotteryBinConfiguration.create({
        data: {
          store_id: testStore2.store_id,
          bin_template: [{ name: "Store 2 Bin", display_order: 0 }],
        },
      });

      // WHEN: Querying configuration by store_id
      const config = await prisma.lotteryBinConfiguration.findUnique({
        where: { store_id: testStore.store_id },
      });

      // THEN: Only configuration for the specified store is returned
      expect(config).toBeDefined();
      expect(config?.store_id).toBe(testStore.store_id);
      expect(config?.bin_template).toEqual([
        { name: "Store 1 Bin", display_order: 0 },
      ]);
    });

    it("6.13-INTEGRATION-034: should retrieve and parse JSON bin_template correctly", async () => {
      // GIVEN: A configuration with complex bin_template exists
      const binTemplate = [
        { name: "Front", location: "Aisle 1", display_order: 0 },
        { name: "Middle", location: "Aisle 2", display_order: 1 },
        { name: "Back", location: "Aisle 3", display_order: 2 },
      ];

      const config = await prisma.lotteryBinConfiguration.create({
        data: {
          store_id: testStore.store_id,
          bin_template: binTemplate,
        },
      });

      // WHEN: Retrieving the configuration
      const retrieved = await prisma.lotteryBinConfiguration.findUnique({
        where: { config_id: config.config_id },
      });

      // THEN: JSON is parsed correctly and accessible
      expect(retrieved).toBeDefined();
      expect(Array.isArray(retrieved?.bin_template)).toBe(true);
      expect(retrieved?.bin_template.length).toBe(3);
      expect(retrieved?.bin_template[0].name).toBe("Front");
      expect(retrieved?.bin_template[0].location).toBe("Aisle 1");
      expect(retrieved?.bin_template[0].display_order).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - Data Integrity
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Security & Edge Cases", () => {
    it("6.13-INTEGRATION-SEC-003: [P0] Should prevent SQL injection in bin_template JSON field", async () => {
      // GIVEN: A store exists
      // WHEN: Creating configuration with SQL injection attempts in bin names
      const sqlInjectionAttempts = [
        { name: "'; DROP TABLE lottery_bins; --", display_order: 0 },
        { name: "1' OR '1'='1", display_order: 0 },
        { name: "'; DELETE FROM lottery_bins WHERE '1'='1", display_order: 0 },
      ];

      for (const maliciousBin of sqlInjectionAttempts) {
        const config = await prisma.lotteryBinConfiguration.create({
          data: {
            store_id: testStore.store_id,
            bin_template: [maliciousBin],
          },
        });

        // THEN: Configuration is created (JSON field stores as-is, SQL injection prevented by Prisma)
        expect(config, "Configuration should be created").toBeDefined();
        expect(
          config.bin_template[0].name,
          "Malicious name should be stored as string",
        ).toBe(maliciousBin.name);

        // AND: No actual SQL injection occurs (verify table still exists)
        const configsCount = await prisma.lotteryBinConfiguration.count();
        expect(
          configsCount,
          "Configurations table should still exist",
        ).toBeGreaterThanOrEqual(1);

        // Cleanup
        await prisma.lotteryBinConfiguration.delete({
          where: { config_id: config.config_id },
        });
      }
    });

    it("6.13-INTEGRATION-SEC-004: [P0] Should validate foreign key constraint on store_id", async () => {
      // GIVEN: A non-existent store_id
      const fakeStoreId = "00000000-0000-0000-0000-000000000000";

      // WHEN: Trying to create configuration with invalid store_id
      // THEN: Foreign key constraint error is raised
      await expect(
        prisma.lotteryBinConfiguration.create({
          data: {
            store_id: fakeStoreId,
            bin_template: [{ name: "Test Bin", display_order: 0 }],
          },
        }),
      ).rejects.toThrow();
    });

    it("6.13-INTEGRATION-EDGE-003: [P1] Should handle very large bin_template arrays (up to 200 bins)", async () => {
      // GIVEN: A store exists
      // WHEN: Creating configuration with maximum allowed bins (200)
      const largeBinTemplate = Array.from({ length: 200 }, (_, i) => ({
        name: `Bin ${i + 1}`,
        location: `Location ${i + 1}`,
        display_order: i,
      }));

      const config = await prisma.lotteryBinConfiguration.create({
        data: {
          store_id: testStore.store_id,
          bin_template: largeBinTemplate,
        },
      });

      // THEN: Configuration is created successfully
      expect(config, "Configuration should be created").toBeDefined();
      expect(
        Array.isArray(config.bin_template),
        "Bin template should be an array",
      ).toBe(true);
      expect(config.bin_template.length, "Should have 200 bins").toBe(200);

      // AND: All bins are retrievable
      const retrieved = await prisma.lotteryBinConfiguration.findUnique({
        where: { config_id: config.config_id },
      });
      expect(
        retrieved?.bin_template.length,
        "Retrieved template should have 200 bins",
      ).toBe(200);
      expect(
        retrieved?.bin_template[0].name,
        "First bin name should match",
      ).toBe("Bin 1");
      expect(
        retrieved?.bin_template[199].name,
        "Last bin name should match",
      ).toBe("Bin 200");
    });

    it("6.13-INTEGRATION-EDGE-004: [P1] Should handle empty bin_template array", async () => {
      // GIVEN: A store exists
      // WHEN: Creating configuration with empty bin_template
      // Note: This might be rejected by application validation, but we test database level
      const config = await prisma.lotteryBinConfiguration.create({
        data: {
          store_id: testStore.store_id,
          bin_template: [],
        },
      });

      // THEN: Configuration is created (database allows empty array)
      expect(config, "Configuration should be created").toBeDefined();
      expect(
        Array.isArray(config.bin_template),
        "Bin template should be an array",
      ).toBe(true);
      expect(config.bin_template.length, "Bin template should be empty").toBe(
        0,
      );
    });

    it("6.13-INTEGRATION-EDGE-005: [P1] Should handle special characters and Unicode in bin names", async () => {
      // GIVEN: A store exists
      // WHEN: Creating configuration with special characters and Unicode
      const specialCharsTemplate = [
        { name: "Bin with émojis 🎰🎲", display_order: 0 },
        { name: "Bin with special chars !@#$%^&*()", display_order: 1 },
        { name: "Bin with unicode 中文 العربية", display_order: 2 },
      ];

      const config = await prisma.lotteryBinConfiguration.create({
        data: {
          store_id: testStore.store_id,
          bin_template: specialCharsTemplate,
        },
      });

      // THEN: Configuration is created and retrieved correctly
      expect(config, "Configuration should be created").toBeDefined();
      const retrieved = await prisma.lotteryBinConfiguration.findUnique({
        where: { config_id: config.config_id },
      });
      expect(
        retrieved?.bin_template[0].name,
        "Emoji bin name should be preserved",
      ).toBe("Bin with émojis 🎰🎲");
      expect(
        retrieved?.bin_template[1].name,
        "Special chars bin name should be preserved",
      ).toBe("Bin with special chars !@#$%^&*()");
      expect(
        retrieved?.bin_template[2].name,
        "Unicode bin name should be preserved",
      ).toBe("Bin with unicode 中文 العربية");
    });
  });
});
