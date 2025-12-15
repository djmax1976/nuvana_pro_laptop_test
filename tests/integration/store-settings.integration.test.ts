/**
 * @test-level INTEGRATION
 * @justification Tests database-level RLS enforcement that requires database connection
 * @story 6-14-store-settings-page
 * @enhanced-by workflow-9 on 2025-01-28
 */
/**
 * Integration Tests: Store Settings RLS Enforcement
 *
 * Tests Row-Level Security (RLS) enforcement at the service layer:
 * - Users can only access settings for stores they own
 * - Users cannot access settings for stores owned by other users
 * - RLS is enforced at the database query level, not just in middleware
 *
 * @test-level INTEGRATION
 * @justification Tests database-level RLS enforcement that requires database connection
 * @story 6-14-store-settings-page
 * @priority P1 (High - Security)
 *
 * These tests validate that RLS policies are enforced even when service methods
 * are called directly (bypassing API middleware).
 *
 * ENHANCEMENTS APPLIED (Workflow 9):
 * - Additional RLS enforcement tests
 * - Comprehensive error message assertions
 * - Test isolation improvements
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { StoreService } from "../../backend/src/services/store.service";

const prisma = new PrismaClient();
const storeService = new StoreService();

// Test data - isolated per test suite
let owner1: any;
let owner2: any;
let company1: any;
let company2: any;
let store1: any;
let store2: any;

// ═══════════════════════════════════════════════════════════════════════════
// TEST SETUP & TEARDOWN
// ═══════════════════════════════════════════════════════════════════════════

beforeAll(async () => {
  // GIVEN: Two different client owners with their own companies and stores
  owner1 = await prisma.user.create({
    data: {
      email: `owner1-${Date.now()}@test.com`,
      name: "Owner 1",
      public_id: `USR${Date.now()}`,
    },
  });

  owner2 = await prisma.user.create({
    data: {
      email: `owner2-${Date.now()}@test.com`,
      name: "Owner 2",
      public_id: `USR${Date.now() + 1}`,
    },
  });

  company1 = await prisma.company.create({
    data: {
      name: "Company 1",
      owner_user_id: owner1.user_id,
      public_id: `COM${Date.now()}`,
    },
  });

  company2 = await prisma.company.create({
    data: {
      name: "Company 2",
      owner_user_id: owner2.user_id,
      public_id: `COM${Date.now() + 1}`,
    },
  });

  store1 = await prisma.store.create({
    data: {
      company_id: company1.company_id,
      name: "Store 1",
      public_id: `STR${Date.now()}`,
      configuration: {
        contact_email: "store1@test.nuvana.local",
        timezone: "America/New_York",
      },
    },
  });

  store2 = await prisma.store.create({
    data: {
      company_id: company2.company_id,
      name: "Store 2",
      public_id: `STR${Date.now() + 1}`,
      configuration: {
        contact_email: "store2@test.nuvana.local",
        timezone: "America/Los_Angeles",
      },
    },
  });
});

afterAll(async () => {
  // Cleanup all test data
  if (store1)
    await prisma.store.delete({ where: { store_id: store1.store_id } });
  if (store2)
    await prisma.store.delete({ where: { store_id: store2.store_id } });
  if (company1)
    await prisma.company.delete({
      where: { company_id: company1.company_id },
    });
  if (company2)
    await prisma.company.delete({
      where: { company_id: company2.company_id },
    });
  if (owner1) await prisma.user.delete({ where: { user_id: owner1.user_id } });
  if (owner2) await prisma.user.delete({ where: { user_id: owner2.user_id } });
  await prisma.$disconnect();
});

// ═══════════════════════════════════════════════════════════════════════════
// RLS ENFORCEMENT TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("Store Settings RLS Enforcement", () => {
  describe("getStoreSettings - RLS Enforcement", () => {
    it("6.14-INTEGRATION-001: should allow owner to access their own store settings", async () => {
      // WHEN: Owner1 tries to get settings for their own store
      const settings = await storeService.getStoreSettings(
        store1.store_id,
        owner1.user_id,
      );

      // THEN: Returns store settings
      expect(settings).toBeDefined();
      expect(settings.name).toBe("Store 1");
      expect(settings.contact_email).toBe("store1@test.nuvana.local");
      expect(settings.timezone).toBe("America/New_York");
    });

    it("6.14-INTEGRATION-002: should prevent owner from accessing other owner's store settings", async () => {
      // WHEN: Owner1 tries to get settings for Owner2's store
      // THEN: Throws Forbidden error
      await expect(
        storeService.getStoreSettings(store2.store_id, owner1.user_id),
      ).rejects.toThrow(
        "Forbidden: You can only access settings for stores you own",
      );
    });

    it("6.14-INTEGRATION-003: should prevent owner2 from accessing owner1's store settings", async () => {
      // WHEN: Owner2 tries to get settings for Owner1's store
      // THEN: Throws Forbidden error
      await expect(
        storeService.getStoreSettings(store1.store_id, owner2.user_id),
      ).rejects.toThrow(
        "Forbidden: You can only access settings for stores you own",
      );
    });
  });

  describe("updateStoreSettings - RLS Enforcement", () => {
    it("6.14-INTEGRATION-004: should allow owner to update their own store settings", async () => {
      // WHEN: Owner1 updates their own store settings
      const updatedStore = await storeService.updateStoreSettings(
        store1.store_id,
        owner1.user_id,
        {
          contact_email: "updated@test.nuvana.local",
          timezone: "America/Chicago",
        },
      );

      // THEN: Store is updated successfully
      expect(updatedStore).toBeDefined();
      const config = updatedStore.configuration as any;
      expect(config.contact_email).toBe("updated@test.nuvana.local");
      expect(config.timezone).toBe("America/Chicago");

      // Restore original settings for other tests
      await storeService.updateStoreSettings(store1.store_id, owner1.user_id, {
        contact_email: "store1@test.nuvana.local",
        timezone: "America/New_York",
      });
    });

    it("6.14-INTEGRATION-005: should prevent owner from updating other owner's store settings", async () => {
      // WHEN: Owner1 tries to update Owner2's store settings
      // THEN: Throws Forbidden error
      await expect(
        storeService.updateStoreSettings(store2.store_id, owner1.user_id, {
          contact_email: "hacked@test.nuvana.local",
        }),
      ).rejects.toThrow(
        "Forbidden: You can only update settings for stores you own",
      );
    });

    it("6.14-INTEGRATION-006: should prevent owner2 from updating owner1's store settings", async () => {
      // WHEN: Owner2 tries to update Owner1's store settings
      // THEN: Throws Forbidden error
      await expect(
        storeService.updateStoreSettings(store1.store_id, owner2.user_id, {
          contact_email: "hacked@test.nuvana.local",
        }),
      ).rejects.toThrow(
        "Forbidden: You can only update settings for stores you own",
      );
    });

    it("6.14-INTEGRATION-007: should verify store2 settings were not modified by unauthorized access attempt", async () => {
      // GIVEN: Owner1 attempted to update store2 (which should have failed)
      // WHEN: Owner2 retrieves their store settings
      const settings = await storeService.getStoreSettings(
        store2.store_id,
        owner2.user_id,
      );

      // THEN: Store2 settings remain unchanged
      expect(settings.contact_email).toBe("store2@test.nuvana.local");
      expect(settings.timezone).toBe("America/Los_Angeles");
    });

    it("6.14-INTEGRATION-008: should throw Forbidden error with specific message for unauthorized GET", async () => {
      // WHEN: Owner1 tries to get settings for Owner2's store
      // THEN: Throws Forbidden error with specific message
      await expect(
        storeService.getStoreSettings(store2.store_id, owner1.user_id),
      ).rejects.toThrow(
        "Forbidden: You can only access settings for stores you own",
      );

      // Verify error message is specific and helpful
      try {
        await storeService.getStoreSettings(store2.store_id, owner1.user_id);
      } catch (error: any) {
        expect(error.message).toContain("Forbidden");
        expect(error.message).toContain("can only access");
      }
    });

    it("6.14-INTEGRATION-009: should throw Forbidden error with specific message for unauthorized PUT", async () => {
      // WHEN: Owner1 tries to update Owner2's store settings
      // THEN: Throws Forbidden error with specific message
      await expect(
        storeService.updateStoreSettings(store2.store_id, owner1.user_id, {
          contact_email: "hacked@test.nuvana.local",
        }),
      ).rejects.toThrow(
        "Forbidden: You can only update settings for stores you own",
      );

      // Verify error message is specific and helpful
      try {
        await storeService.updateStoreSettings(
          store2.store_id,
          owner1.user_id,
          {
            contact_email: "hacked@test.nuvana.local",
          },
        );
      } catch (error: any) {
        expect(error.message).toContain("Forbidden");
        expect(error.message).toContain("can only update");
      }
    });
  });

  describe("Additional Security: Service Layer Authorization", () => {
    it("6.14-INTEGRATION-010: should prevent access to non-existent stores", async () => {
      // GIVEN: Non-existent store ID
      const fakeStoreId = "00000000-0000-0000-0000-000000000000";

      // WHEN: Attempting to get settings for non-existent store
      // THEN: Throws Forbidden error (RLS check happens before existence check)
      await expect(
        storeService.getStoreSettings(fakeStoreId, owner1.user_id),
      ).rejects.toThrow(/Forbidden|not found/i);
    });

    it("6.14-INTEGRATION-011: should maintain data integrity after failed update attempts", async () => {
      // GIVEN: Original store1 settings
      const originalSettings = await storeService.getStoreSettings(
        store1.store_id,
        owner1.user_id,
      );
      const originalEmail = originalSettings.contact_email;

      // WHEN: Owner2 attempts unauthorized update (should fail)
      try {
        await storeService.updateStoreSettings(
          store1.store_id,
          owner2.user_id,
          {
            contact_email: "hacked@test.nuvana.local",
          },
        );
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        // Expected to throw
        expect(error).toBeDefined();
      }

      // THEN: Store1 settings remain unchanged
      const unchangedSettings = await storeService.getStoreSettings(
        store1.store_id,
        owner1.user_id,
      );
      expect(unchangedSettings.contact_email).toBe(originalEmail);
    });
  });
});
