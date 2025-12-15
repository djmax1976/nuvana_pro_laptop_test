/**
 * @test-level UNIT
 * @justification Tests Store model configuration JSON field handling
 * @story 6-14-store-settings-page
 */
// tests/unit/store-configuration-field.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * Store Configuration Field Unit Tests
 *
 * Tests the Store.configuration JSON field handling to ensure:
 * - Configuration can be stored and retrieved correctly
 * - JSON structure validation
 * - Field can handle all required configuration properties
 *
 * Unit tests are FIRST in pyramid order (60-70% of tests)
 */

describe("Store Configuration Field Handling", () => {
  let prisma: PrismaClient;
  let testCompanyId: string;
  let testStoreId: string;

  beforeEach(async () => {
    prisma = new PrismaClient();

    // Create test company
    const company = await prisma.company.create({
      data: {
        name: `Test Company ${Date.now()}`,
        public_id: `COM${Date.now()}`,
      },
    });
    testCompanyId = company.company_id;
  });

  afterEach(async () => {
    // Cleanup test data
    if (testStoreId) {
      await prisma.store
        .delete({ where: { store_id: testStoreId } })
        .catch(() => {});
    }
    if (testCompanyId) {
      await prisma.company
        .delete({ where: { company_id: testCompanyId } })
        .catch(() => {});
    }
    await prisma.$disconnect();
  });

  describe("Configuration Field Storage", () => {
    it("should store complete configuration JSON structure", async () => {
      // GIVEN: A store with complete configuration
      const configuration = {
        contact_email: "store@test.nuvana.local",
        timezone: "America/New_York",
        operating_hours: {
          monday: { open: "09:00", close: "17:00" },
          tuesday: { open: "09:00", close: "17:00" },
          wednesday: { open: "09:00", close: "17:00" },
          thursday: { open: "09:00", close: "17:00" },
          friday: { open: "09:00", close: "17:00" },
          saturday: { open: "10:00", close: "16:00" },
          sunday: { open: null, close: null },
        },
        address: {
          street: "123 Main St",
          city: "New York",
          state: "NY",
          zip: "10001",
        },
      };

      // WHEN: Store is created with configuration
      const store = await prisma.store.create({
        data: {
          company_id: testCompanyId,
          name: "Test Store",
          public_id: `STR${Date.now()}`,
          configuration: configuration as any,
        },
      });
      testStoreId = store.store_id;

      // THEN: Configuration is stored correctly
      expect(store.configuration).toBeDefined();
      expect(store.configuration).toMatchObject(configuration);
    });

    it("should retrieve configuration JSON correctly", async () => {
      // GIVEN: A store with configuration exists
      const configuration = {
        contact_email: "store@test.nuvana.local",
        timezone: "America/New_York",
      };

      const store = await prisma.store.create({
        data: {
          company_id: testCompanyId,
          name: "Test Store",
          public_id: `STR${Date.now()}`,
          configuration: configuration as any,
        },
      });
      testStoreId = store.store_id;

      // WHEN: Store is retrieved
      const retrieved = await prisma.store.findUnique({
        where: { store_id: store.store_id },
      });

      // THEN: Configuration is retrieved correctly
      expect(retrieved?.configuration).toBeDefined();
      expect(retrieved?.configuration).toMatchObject(configuration);
    });

    it("should update configuration field", async () => {
      // GIVEN: A store with initial configuration
      const initialConfig = {
        contact_email: "old@test.nuvana.local",
        timezone: "America/New_York",
      };

      const store = await prisma.store.create({
        data: {
          company_id: testCompanyId,
          name: "Test Store",
          public_id: `STR${Date.now()}`,
          configuration: initialConfig as any,
        },
      });
      testStoreId = store.store_id;

      // WHEN: Configuration is updated
      const updatedConfig = {
        contact_email: "new@test.nuvana.local",
        timezone: "America/Los_Angeles",
        address: {
          street: "456 Oak Ave",
          city: "Los Angeles",
          state: "CA",
          zip: "90001",
        },
      };

      const updated = await prisma.store.update({
        where: { store_id: store.store_id },
        data: { configuration: updatedConfig as any },
      });

      // THEN: Configuration is updated correctly
      expect(updated.configuration).toMatchObject(updatedConfig);
      expect(updated.configuration).not.toMatchObject(initialConfig);
    });

    it("should handle null configuration field", async () => {
      // GIVEN: A store without configuration
      // WHEN: Store is created with null configuration
      const store = await prisma.store.create({
        data: {
          company_id: testCompanyId,
          name: "Test Store",
          public_id: `STR${Date.now()}`,
          configuration: null,
        },
      });
      testStoreId = store.store_id;

      // THEN: Configuration field is null
      expect(store.configuration).toBeNull();
    });

    it("should handle partial configuration (only some fields)", async () => {
      // GIVEN: A store with partial configuration
      const partialConfig = {
        timezone: "America/New_York",
        // contact_email and other fields omitted
      };

      // WHEN: Store is created with partial configuration
      const store = await prisma.store.create({
        data: {
          company_id: testCompanyId,
          name: "Test Store",
          public_id: `STR${Date.now()}`,
          configuration: partialConfig as any,
        },
      });
      testStoreId = store.store_id;

      // THEN: Partial configuration is stored correctly
      expect(store.configuration).toBeDefined();
      expect(store.configuration).toMatchObject(partialConfig);
      expect((store.configuration as any)?.contact_email).toBeUndefined();
    });
  });

  describe("Configuration Field Structure", () => {
    it("should handle operating hours structure correctly", async () => {
      // GIVEN: Configuration with operating hours
      const configuration = {
        operating_hours: {
          monday: { open: "09:00", close: "17:00" },
          tuesday: { open: "09:00", close: "17:00" },
          wednesday: { open: null, close: null },
        },
      };

      // WHEN: Store is created with operating hours
      const store = await prisma.store.create({
        data: {
          company_id: testCompanyId,
          name: "Test Store",
          public_id: `STR${Date.now()}`,
          configuration: configuration as any,
        },
      });
      testStoreId = store.store_id;

      // THEN: Operating hours are stored correctly
      const retrieved = await prisma.store.findUnique({
        where: { store_id: store.store_id },
      });
      expect((retrieved?.configuration as any)?.operating_hours).toMatchObject(
        configuration.operating_hours,
      );
    });

    it("should handle address structure correctly", async () => {
      // GIVEN: Configuration with address
      const configuration = {
        address: {
          street: "123 Main St",
          city: "New York",
          state: "NY",
          zip: "10001",
        },
      };

      // WHEN: Store is created with address
      const store = await prisma.store.create({
        data: {
          company_id: testCompanyId,
          name: "Test Store",
          public_id: `STR${Date.now()}`,
          configuration: configuration as any,
        },
      });
      testStoreId = store.store_id;

      // THEN: Address is stored correctly
      const retrieved = await prisma.store.findUnique({
        where: { store_id: store.store_id },
      });
      expect((retrieved?.configuration as any)?.address).toMatchObject(
        configuration.address,
      );
    });
  });
});
