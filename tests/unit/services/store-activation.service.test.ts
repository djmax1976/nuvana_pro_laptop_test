import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { StoreService } from "../../../backend/src/services/store.service";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../../backend/src/utils/public-id";
import bcrypt from "bcrypt";

/**
 * Unit Tests: Store Activation Validation
 *
 * CRITICAL TEST COVERAGE:
 * - Cannot activate INACTIVE store if company is INACTIVE
 * - CAN activate store if company is ACTIVE
 * - CAN deactivate store regardless of company status
 * - Business rule enforcement: stores cannot be active under inactive companies
 *
 * These tests ensure we don't accidentally create orphaned active stores
 * under deactivated companies.
 *
 * NOTE: These tests require DATABASE_URL to be set. They will be skipped in CI
 * unit test jobs where no database is available.
 */

// Check if database is available before initializing Prisma
const hasDatabaseUrl = !!process.env.DATABASE_URL;
const prisma = hasDatabaseUrl
  ? new PrismaClient()
  : (null as unknown as PrismaClient);
const storeService = new StoreService();

// Shared test data
let testOwnerUser: any;
let testCompany: any;
let testStore: any;

const createdUserIds: string[] = [];
const createdCompanyIds: string[] = [];
const createdStoreIds: string[] = [];

// Global setup - only run if database is available
beforeAll(async () => {
  if (!hasDatabaseUrl) return;
  // Create a test owner user
  const hashedPassword = await bcrypt.hash("TestPassword123!", 10);
  testOwnerUser = await prisma.user.create({
    data: {
      public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
      email: `store-activation-test-owner-${Date.now()}@test.com`,
      name: "Store Activation Test Owner",
      password_hash: hashedPassword,
      status: "ACTIVE",
    },
  });
  createdUserIds.push(testOwnerUser.user_id);

  // Create a test company (ACTIVE by default)
  testCompany = await prisma.company.create({
    data: {
      public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
      name: `Store Activation Test Company ${Date.now()}`,
      address: "123 Test Street",
      status: "ACTIVE",
      owner_user_id: testOwnerUser.user_id,
    },
  });
  createdCompanyIds.push(testCompany.company_id);

  // Create a test store (ACTIVE by default)
  testStore = await prisma.store.create({
    data: {
      public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
      name: `Test Store ${Date.now()}`,
      company_id: testCompany.company_id,
      status: "ACTIVE",
    },
  });
  createdStoreIds.push(testStore.store_id);
});

// Global cleanup - only run if database is available
afterAll(async () => {
  if (!hasDatabaseUrl) return;
  // Cleanup stores
  for (const storeId of createdStoreIds) {
    try {
      await prisma.store.delete({ where: { store_id: storeId } });
    } catch (e) {
      // Ignore
    }
  }

  // Cleanup companies
  for (const companyId of createdCompanyIds) {
    try {
      await prisma.store.deleteMany({ where: { company_id: companyId } });
      await prisma.company.delete({ where: { company_id: companyId } });
    } catch (e) {
      // Ignore
    }
  }

  // Cleanup users
  for (const userId of createdUserIds) {
    try {
      await prisma.userRole.deleteMany({ where: { user_id: userId } });
      await prisma.user.delete({ where: { user_id: userId } });
    } catch (e) {
      // Ignore cleanup errors
    }
  }

  await prisma.$disconnect();
});

describe.skipIf(!hasDatabaseUrl)(
  "Store Activation Validation - Company Status Dependency",
  () => {
    it("should NOT allow activating store when company is INACTIVE", async () => {
      // Create a company that is INACTIVE
      const inactiveCompany = await prisma.company.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
          name: `Inactive Company ${Date.now()}`,
          address: "456 Inactive St",
          status: "INACTIVE",
          owner_user_id: testOwnerUser.user_id,
        },
      });
      createdCompanyIds.push(inactiveCompany.company_id);

      // Create an INACTIVE store under the inactive company
      const inactiveStore = await prisma.store.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
          name: `Inactive Store ${Date.now()}`,
          company_id: inactiveCompany.company_id,
          status: "INACTIVE",
        },
      });
      createdStoreIds.push(inactiveStore.store_id);

      // Attempt to activate the store should fail
      // Note: userCompanyId must match store's company_id to pass isolation check
      // Method signature: updateStore(storeId, userCompanyId, data)
      await expect(
        storeService.updateStore(
          inactiveStore.store_id,
          inactiveCompany.company_id, // User's company matches store's company
          { status: "ACTIVE" },
        ),
      ).rejects.toThrow(/Cannot activate store.*company.*INACTIVE/i);

      // Verify store is still INACTIVE
      const storeStillInactive = await prisma.store.findUnique({
        where: { store_id: inactiveStore.store_id },
      });
      expect(storeStillInactive?.status).toBe("INACTIVE");
    });

    it("should include company name in error message when activation fails", async () => {
      // Create a company with a specific name that is INACTIVE
      const companyName = `Named Inactive Company ${Date.now()}`;
      const namedInactiveCompany = await prisma.company.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
          name: companyName,
          address: "789 Named St",
          status: "INACTIVE",
          owner_user_id: testOwnerUser.user_id,
        },
      });
      createdCompanyIds.push(namedInactiveCompany.company_id);

      // Create an INACTIVE store
      const store = await prisma.store.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
          name: `Store For Named Company ${Date.now()}`,
          company_id: namedInactiveCompany.company_id,
          status: "INACTIVE",
        },
      });
      createdStoreIds.push(store.store_id);

      // Error message should include the company name
      await expect(
        storeService.updateStore(
          store.store_id,
          namedInactiveCompany.company_id,
          { status: "ACTIVE" },
        ),
      ).rejects.toThrow(companyName);
    });

    it("should ALLOW activating store when company is ACTIVE", async () => {
      // Create an ACTIVE company
      const activeCompany = await prisma.company.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
          name: `Active Company ${Date.now()}`,
          address: "101 Active Ave",
          status: "ACTIVE",
          owner_user_id: testOwnerUser.user_id,
        },
      });
      createdCompanyIds.push(activeCompany.company_id);

      // Create an INACTIVE store under the active company
      const inactiveStore = await prisma.store.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
          name: `Store To Activate ${Date.now()}`,
          company_id: activeCompany.company_id,
          status: "INACTIVE",
        },
      });
      createdStoreIds.push(inactiveStore.store_id);

      // Activate the store should succeed
      const result = await storeService.updateStore(
        inactiveStore.store_id,
        activeCompany.company_id,
        { status: "ACTIVE" },
      );

      expect(result.status).toBe("ACTIVE");

      // Verify in database
      const storeNowActive = await prisma.store.findUnique({
        where: { store_id: inactiveStore.store_id },
      });
      expect(storeNowActive?.status).toBe("ACTIVE");
    });

    it("should ALLOW deactivating store regardless of company status", async () => {
      // Create an INACTIVE company
      const inactiveCompany = await prisma.company.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
          name: `Company For Deactivation Test ${Date.now()}`,
          address: "202 Deactivate Blvd",
          status: "INACTIVE",
          owner_user_id: testOwnerUser.user_id,
        },
      });
      createdCompanyIds.push(inactiveCompany.company_id);

      // Create an ACTIVE store (simulating pre-existing state)
      const activeStore = await prisma.store.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
          name: `Store To Deactivate ${Date.now()}`,
          company_id: inactiveCompany.company_id,
          status: "ACTIVE", // Simulating a store that was active before company deactivation
        },
      });
      createdStoreIds.push(activeStore.store_id);

      // Deactivating should always work (fixing orphaned state)
      const result = await storeService.updateStore(
        activeStore.store_id,
        inactiveCompany.company_id,
        { status: "INACTIVE" },
      );

      expect(result.status).toBe("INACTIVE");
    });

    it("should allow updating store properties without changing status", async () => {
      // Create INACTIVE company with INACTIVE store
      const company = await prisma.company.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
          name: `Property Update Test Company ${Date.now()}`,
          address: "303 Property St",
          status: "INACTIVE",
          owner_user_id: testOwnerUser.user_id,
        },
      });
      createdCompanyIds.push(company.company_id);

      const store = await prisma.store.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
          name: `Original Name ${Date.now()}`,
          company_id: company.company_id,
          status: "INACTIVE",
        },
      });
      createdStoreIds.push(store.store_id);

      // Updating name (not status) should work even with inactive company
      const newName = `Updated Name ${Date.now()}`;
      const result = await storeService.updateStore(
        store.store_id,
        company.company_id,
        { name: newName },
      );

      expect(result.name).toBe(newName);
      expect(result.status).toBe("INACTIVE"); // Status unchanged
    });
  },
);

describe.skipIf(!hasDatabaseUrl)(
  "Store Activation Validation - Edge Cases",
  () => {
    it("should NOT allow activating store when company is SUSPENDED", async () => {
      // Create a SUSPENDED company
      const suspendedCompany = await prisma.company.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
          name: `Suspended Company ${Date.now()}`,
          address: "404 Suspended Lane",
          status: "SUSPENDED",
          owner_user_id: testOwnerUser.user_id,
        },
      });
      createdCompanyIds.push(suspendedCompany.company_id);

      // Create an INACTIVE store
      const store = await prisma.store.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
          name: `Store Under Suspended Company ${Date.now()}`,
          company_id: suspendedCompany.company_id,
          status: "INACTIVE",
        },
      });
      createdStoreIds.push(store.store_id);

      // Attempt to activate should fail
      await expect(
        storeService.updateStore(store.store_id, suspendedCompany.company_id, {
          status: "ACTIVE",
        }),
      ).rejects.toThrow(/Cannot activate store.*company.*SUSPENDED/i);
    });

    it("should allow re-activating already ACTIVE store under ACTIVE company (no-op)", async () => {
      // Create an ACTIVE company with ACTIVE store
      const company = await prisma.company.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
          name: `Already Active Company ${Date.now()}`,
          address: "505 Active Rd",
          status: "ACTIVE",
          owner_user_id: testOwnerUser.user_id,
        },
      });
      createdCompanyIds.push(company.company_id);

      const store = await prisma.store.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
          name: `Already Active Store ${Date.now()}`,
          company_id: company.company_id,
          status: "ACTIVE",
        },
      });
      createdStoreIds.push(store.store_id);

      // Setting status to ACTIVE when already ACTIVE should not error
      const result = await storeService.updateStore(
        store.store_id,
        company.company_id,
        { status: "ACTIVE" },
      );

      expect(result.status).toBe("ACTIVE");
    });

    it("should deny access when updating store from different company", async () => {
      // Create two companies
      const company1 = await prisma.company.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
          name: `Company 1 ${Date.now()}`,
          address: "606 Company 1 St",
          status: "ACTIVE",
          owner_user_id: testOwnerUser.user_id,
        },
      });
      createdCompanyIds.push(company1.company_id);

      const company2 = await prisma.company.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
          name: `Company 2 ${Date.now()}`,
          address: "707 Company 2 Ave",
          status: "ACTIVE",
          owner_user_id: testOwnerUser.user_id,
        },
      });
      createdCompanyIds.push(company2.company_id);

      // Create store under company1
      const store = await prisma.store.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
          name: `Store For Company 1 ${Date.now()}`,
          company_id: company1.company_id,
          status: "INACTIVE",
        },
      });
      createdStoreIds.push(store.store_id);

      // Attempt to update store using company2's ID should fail
      await expect(
        storeService.updateStore(
          store.store_id,
          company2.company_id, // Wrong company!
          { status: "ACTIVE" },
        ),
      ).rejects.toThrow(
        /Forbidden.*only update stores for your assigned company/i,
      );
    });
  },
);

describe.skipIf(!hasDatabaseUrl)(
  "Store Activation Validation - State Transition Matrix",
  () => {
    /**
     * This test documents all valid state transitions for stores
     * based on company status.
     *
     * Company ACTIVE:
     *   Store INACTIVE -> ACTIVE: ALLOWED
     *   Store ACTIVE -> INACTIVE: ALLOWED
     *   Store INACTIVE -> INACTIVE: ALLOWED (no-op)
     *   Store ACTIVE -> ACTIVE: ALLOWED (no-op)
     *
     * Company INACTIVE/SUSPENDED:
     *   Store INACTIVE -> ACTIVE: DENIED
     *   Store ACTIVE -> INACTIVE: ALLOWED (fixing orphan)
     *   Store INACTIVE -> INACTIVE: ALLOWED (no-op)
     *   Store ACTIVE -> ACTIVE: ALLOWED (no-op, already active)
     */
    it("should enforce correct state transitions for store activation", async () => {
      // Test matrix with ACTIVE company
      const activeCompany = await prisma.company.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
          name: `Matrix Test Active Company ${Date.now()}`,
          address: "808 Matrix St",
          status: "ACTIVE",
          owner_user_id: testOwnerUser.user_id,
        },
      });
      createdCompanyIds.push(activeCompany.company_id);

      // Create inactive store
      const storeForMatrix = await prisma.store.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
          name: `Matrix Test Store ${Date.now()}`,
          company_id: activeCompany.company_id,
          status: "INACTIVE",
        },
      });
      createdStoreIds.push(storeForMatrix.store_id);

      // INACTIVE -> ACTIVE (company ACTIVE): ALLOWED
      let result = await storeService.updateStore(
        storeForMatrix.store_id,
        activeCompany.company_id,
        { status: "ACTIVE" },
      );
      expect(result.status).toBe("ACTIVE");

      // ACTIVE -> INACTIVE (company ACTIVE): ALLOWED
      result = await storeService.updateStore(
        storeForMatrix.store_id,
        activeCompany.company_id,
        { status: "INACTIVE" },
      );
      expect(result.status).toBe("INACTIVE");

      // Now deactivate the company
      await prisma.company.update({
        where: { company_id: activeCompany.company_id },
        data: { status: "INACTIVE" },
      });

      // INACTIVE -> ACTIVE (company INACTIVE): DENIED
      await expect(
        storeService.updateStore(
          storeForMatrix.store_id,
          activeCompany.company_id,
          { status: "ACTIVE" },
        ),
      ).rejects.toThrow(/Cannot activate/);

      // Manually set store to ACTIVE for next test
      await prisma.store.update({
        where: { store_id: storeForMatrix.store_id },
        data: { status: "ACTIVE" },
      });

      // ACTIVE -> INACTIVE (company INACTIVE): ALLOWED (fix orphan)
      result = await storeService.updateStore(
        storeForMatrix.store_id,
        activeCompany.company_id,
        { status: "INACTIVE" },
      );
      expect(result.status).toBe("INACTIVE");
    });
  },
);
