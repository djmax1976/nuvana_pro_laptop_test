/**
 * Company Deletion Cascade Tests
 *
 * @test-level API
 * @justification Tests cascade deletion flow for companies - requires database, auth, and RBAC infrastructure
 * @story SOFT-DELETE-002
 *
 * CRITICAL TESTS: Verify that deleting a company properly cascades to delete
 * all associated stores and API keys. This addresses the same root cause as
 * BUG-001 but for company-level deletions.
 *
 * Test Scenarios:
 * 1. Delete company cascade to stores and API keys
 * 2. No orphaned records after company deletion
 * 3. Multiple stores cascade correctly
 *
 * BUSINESS RISK: HIGH
 * - Company deletion must properly clean up all child records
 * - Orphaned API keys cause 500 errors in production
 *
 * Priority: P0 (Critical - Data Integrity)
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import { createUser, createCompany, createStore } from "../support/factories";
import { withBypassClient } from "../support/prisma-bypass";
import bcrypt from "bcrypt";
import { randomUUID } from "crypto";

/**
 * Creates a company with stores and API keys for testing.
 * Unlike user tests, this creates a SUPERADMIN owner to avoid complications.
 */
async function createTestCompanyHierarchy(
  prismaClient: any,
  superadminUserId: string,
  options: {
    storeCount?: number;
    apiKeysPerStore?: number;
    createAuditEvents?: boolean;
  } = {}
) {
  const { storeCount = 1, apiKeysPerStore = 1, createAuditEvents = true } = options;

  // Create company owned by the superadmin
  const companyData = createCompany({ owner_user_id: superadminUserId });
  const company = await prismaClient.company.create({ data: companyData });

  // Create stores
  const stores: any[] = [];
  for (let i = 0; i < storeCount; i++) {
    const storeData = createStore({ company_id: company.company_id });
    const store = await prismaClient.store.create({ data: storeData });
    stores.push(store);
  }

  // Create API keys for each store
  const apiKeys: any[] = [];
  for (const store of stores) {
    for (let i = 0; i < apiKeysPerStore; i++) {
      const apiKey = await withBypassClient(async (bypassClient) => {
        return bypassClient.apiKey.create({
          data: {
            store_id: store.store_id,
            company_id: company.company_id,
            label: `Test API Key ${Date.now()}-${randomUUID().slice(0, 8)}`,
            key_prefix: "nvn_test",
            key_suffix: randomUUID().slice(0, 8),
            hashed_key: `hashed_${randomUUID()}`,
            status: "ACTIVE",
            created_by: superadminUserId,
          },
        });
      });
      apiKeys.push(apiKey);

      // Create audit events
      if (createAuditEvents) {
        await withBypassClient(async (bypassClient) => {
          await bypassClient.apiKeyAuditEvent.createMany({
            data: [
              {
                api_key_id: apiKey.api_key_id,
                event_type: "KEY_CREATED",
                actor_user_id: superadminUserId,
                ip_address: "127.0.0.1",
              },
            ],
          });
        });
      }
    }
  }

  return { company, stores, apiKeys };
}

/**
 * Cleans up test company hierarchy.
 */
async function cleanupTestCompanyHierarchy(
  companyId: string,
  storeIds: string[]
) {
  await withBypassClient(async (bypassClient) => {
    // Delete API key audit events
    for (const storeId of storeIds) {
      try {
        await bypassClient.apiKeyAuditEvent.deleteMany({
          where: { api_key: { store_id: storeId } },
        });
      } catch {
        // Ignore
      }
    }

    // Delete API keys
    for (const storeId of storeIds) {
      try {
        await bypassClient.apiKey.deleteMany({
          where: { store_id: storeId },
        });
      } catch {
        // Ignore
      }
    }

    // Delete stores
    for (const storeId of storeIds) {
      try {
        await bypassClient.store.delete({
          where: { store_id: storeId },
        });
      } catch {
        // Ignore
      }
    }

    // Delete company
    try {
      await bypassClient.company.delete({
        where: { company_id: companyId },
      });
    } catch {
      // Ignore
    }
  });
}

/**
 * Checks for orphaned API keys.
 */
async function checkForOrphanedApiKeys(prismaClient: any): Promise<{
  count: number;
  orphanedIds: string[];
}> {
  const orphaned = await prismaClient.$queryRaw`
    SELECT ak.api_key_id
    FROM api_keys ak
    LEFT JOIN stores s ON ak.store_id = s.store_id
    LEFT JOIN companies c ON ak.company_id = c.company_id
    WHERE s.store_id IS NULL OR c.company_id IS NULL
  `;

  return {
    count: orphaned.length,
    orphanedIds: orphaned.map((o: any) => o.api_key_id),
  };
}

test.describe("COMPANY-DELETE-CASCADE: Company Deletion Cascade to API Keys", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // CORE CASCADE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Core Cascade Functionality", () => {
    test("CDC-001: [P0] Deleting company should cascade to delete all store API keys", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: A company with a store and API key
      const hierarchy = await createTestCompanyHierarchy(
        prismaClient,
        superadminUser.user_id,
        {
          storeCount: 1,
          apiKeysPerStore: 1,
          createAuditEvents: true,
        }
      );

      try {
        // Verify API key exists
        const apiKeyBefore = await prismaClient.apiKey.findUnique({
          where: { api_key_id: hierarchy.apiKeys[0].api_key_id },
        });
        expect(apiKeyBefore, "API key should exist before deletion").not.toBeNull();

        // Deactivate company and stores
        await prismaClient.company.update({
          where: { company_id: hierarchy.company.company_id },
          data: { status: "INACTIVE" },
        });
        for (const store of hierarchy.stores) {
          await prismaClient.store.update({
            where: { store_id: store.store_id },
            data: { status: "INACTIVE" },
          });
        }

        // WHEN: Delete the company
        const deleteResponse = await superadminApiRequest.delete(
          `/api/v1/admin/companies/${hierarchy.company.company_id}`
        );

        // THEN: Deletion should succeed
        expect(deleteResponse.status()).toBe(200);

        // AND: API key should be deleted
        const apiKeyAfter = await prismaClient.apiKey.findUnique({
          where: { api_key_id: hierarchy.apiKeys[0].api_key_id },
        });
        expect(
          apiKeyAfter,
          "API key should be deleted when company is deleted"
        ).toBeNull();

        // AND: No orphans
        const orphanCheck = await checkForOrphanedApiKeys(prismaClient);
        expect(orphanCheck.count).toBe(0);
      } catch (error) {
        await cleanupTestCompanyHierarchy(
          hierarchy.company.company_id,
          hierarchy.stores.map((s: any) => s.store_id)
        );
        throw error;
      }
    });

    test("CDC-002: [P0] Deleting company with multiple stores should cascade to all API keys", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: A company with 3 stores, each with an API key
      const hierarchy = await createTestCompanyHierarchy(
        prismaClient,
        superadminUser.user_id,
        {
          storeCount: 3,
          apiKeysPerStore: 1,
          createAuditEvents: true,
        }
      );

      try {
        // Verify all 3 API keys exist
        expect(hierarchy.apiKeys.length).toBe(3);
        for (const apiKey of hierarchy.apiKeys) {
          const keyBefore = await prismaClient.apiKey.findUnique({
            where: { api_key_id: apiKey.api_key_id },
          });
          expect(keyBefore).not.toBeNull();
        }

        // Deactivate
        await prismaClient.company.update({
          where: { company_id: hierarchy.company.company_id },
          data: { status: "INACTIVE" },
        });
        for (const store of hierarchy.stores) {
          await prismaClient.store.update({
            where: { store_id: store.store_id },
            data: { status: "INACTIVE" },
          });
        }

        // WHEN: Delete company
        const deleteResponse = await superadminApiRequest.delete(
          `/api/v1/admin/companies/${hierarchy.company.company_id}`
        );

        // THEN: Deletion succeeds
        expect(deleteResponse.status()).toBe(200);

        // AND: ALL API keys should be deleted
        for (const apiKey of hierarchy.apiKeys) {
          const keyAfter = await prismaClient.apiKey.findUnique({
            where: { api_key_id: apiKey.api_key_id },
          });
          expect(keyAfter).toBeNull();
        }
      } catch (error) {
        await cleanupTestCompanyHierarchy(
          hierarchy.company.company_id,
          hierarchy.stores.map((s: any) => s.store_id)
        );
        throw error;
      }
    });

    test("CDC-003: [P0] Deleting company should also delete all stores", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: A company with multiple stores
      const hierarchy = await createTestCompanyHierarchy(
        prismaClient,
        superadminUser.user_id,
        {
          storeCount: 2,
          apiKeysPerStore: 1,
        }
      );

      try {
        // Verify stores exist
        for (const store of hierarchy.stores) {
          const storeBefore = await prismaClient.store.findUnique({
            where: { store_id: store.store_id },
          });
          expect(storeBefore).not.toBeNull();
        }

        // Deactivate
        await prismaClient.company.update({
          where: { company_id: hierarchy.company.company_id },
          data: { status: "INACTIVE" },
        });
        for (const store of hierarchy.stores) {
          await prismaClient.store.update({
            where: { store_id: store.store_id },
            data: { status: "INACTIVE" },
          });
        }

        // WHEN: Delete company
        await superadminApiRequest.delete(
          `/api/v1/admin/companies/${hierarchy.company.company_id}`
        );

        // THEN: All stores should be deleted
        for (const store of hierarchy.stores) {
          const storeAfter = await prismaClient.store.findUnique({
            where: { store_id: store.store_id },
          });
          expect(storeAfter).toBeNull();
        }
      } catch (error) {
        await cleanupTestCompanyHierarchy(
          hierarchy.company.company_id,
          hierarchy.stores.map((s: any) => s.store_id)
        );
        throw error;
      }
    });

    test("CDC-004: [P1] Deleting company should delete API key audit events", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: A company with API keys that have audit events
      const hierarchy = await createTestCompanyHierarchy(
        prismaClient,
        superadminUser.user_id,
        {
          storeCount: 1,
          apiKeysPerStore: 1,
          createAuditEvents: true,
        }
      );

      try {
        // Verify audit events exist
        const auditEventsBefore = await prismaClient.apiKeyAuditEvent.count({
          where: { api_key_id: hierarchy.apiKeys[0].api_key_id },
        });
        expect(auditEventsBefore).toBeGreaterThan(0);

        // Deactivate
        await prismaClient.company.update({
          where: { company_id: hierarchy.company.company_id },
          data: { status: "INACTIVE" },
        });
        for (const store of hierarchy.stores) {
          await prismaClient.store.update({
            where: { store_id: store.store_id },
            data: { status: "INACTIVE" },
          });
        }

        // WHEN: Delete company
        await superadminApiRequest.delete(
          `/api/v1/admin/companies/${hierarchy.company.company_id}`
        );

        // THEN: Audit events should be deleted
        const auditEventsAfter = await prismaClient.apiKeyAuditEvent.count({
          where: { api_key_id: hierarchy.apiKeys[0].api_key_id },
        });
        expect(auditEventsAfter).toBe(0);
      } catch (error) {
        await cleanupTestCompanyHierarchy(
          hierarchy.company.company_id,
          hierarchy.stores.map((s: any) => s.store_id)
        );
        throw error;
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA INTEGRITY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Data Integrity After Company Deletion", () => {
    test("CDC-005: [P0] No orphaned API keys after company deletion", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: A company with API keys
      const hierarchy = await createTestCompanyHierarchy(
        prismaClient,
        superadminUser.user_id,
        {
          storeCount: 2,
          apiKeysPerStore: 1,
        }
      );

      try {
        // Check orphans before
        const orphansBefore = await checkForOrphanedApiKeys(prismaClient);
        const initialOrphanCount = orphansBefore.count;

        // Deactivate and delete
        await prismaClient.company.update({
          where: { company_id: hierarchy.company.company_id },
          data: { status: "INACTIVE" },
        });
        for (const store of hierarchy.stores) {
          await prismaClient.store.update({
            where: { store_id: store.store_id },
            data: { status: "INACTIVE" },
          });
        }

        await superadminApiRequest.delete(
          `/api/v1/admin/companies/${hierarchy.company.company_id}`
        );

        // THEN: No new orphans created
        const orphansAfter = await checkForOrphanedApiKeys(prismaClient);
        expect(orphansAfter.count).toBe(initialOrphanCount);
      } catch (error) {
        await cleanupTestCompanyHierarchy(
          hierarchy.company.company_id,
          hierarchy.stores.map((s: any) => s.store_id)
        );
        throw error;
      }
    });

    test("CDC-006: [P0] API Keys page loads after company deletion", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: A company with API keys is deleted
      const hierarchy = await createTestCompanyHierarchy(
        prismaClient,
        superadminUser.user_id,
        {
          storeCount: 1,
          apiKeysPerStore: 1,
        }
      );

      try {
        // Deactivate and delete
        await prismaClient.company.update({
          where: { company_id: hierarchy.company.company_id },
          data: { status: "INACTIVE" },
        });
        for (const store of hierarchy.stores) {
          await prismaClient.store.update({
            where: { store_id: store.store_id },
            data: { status: "INACTIVE" },
          });
        }

        await superadminApiRequest.delete(
          `/api/v1/admin/companies/${hierarchy.company.company_id}`
        );

        // WHEN: Accessing API Keys page
        const apiKeysResponse = await superadminApiRequest.get(
          "/api/v1/admin/api-keys"
        );

        // THEN: Page loads successfully (no 500 from orphaned records)
        expect(apiKeysResponse.status()).toBe(200);
        const body = await apiKeysResponse.json();
        expect(body.success).toBe(true);
      } catch (error) {
        await cleanupTestCompanyHierarchy(
          hierarchy.company.company_id,
          hierarchy.stores.map((s: any) => s.store_id)
        );
        throw error;
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASES
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Edge Cases", () => {
    test("CDC-007: [P1] Delete company with no stores should not fail", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: A company with no stores
      const companyData = createCompany({ owner_user_id: superadminUser.user_id });
      const company = await prismaClient.company.create({ data: companyData });

      try {
        // Deactivate
        await prismaClient.company.update({
          where: { company_id: company.company_id },
          data: { status: "INACTIVE" },
        });

        // WHEN: Delete company
        const deleteResponse = await superadminApiRequest.delete(
          `/api/v1/admin/companies/${company.company_id}`
        );

        // THEN: Deletion succeeds
        expect(deleteResponse.status()).toBe(200);

        // AND: Company is deleted
        const companyAfter = await prismaClient.company.findUnique({
          where: { company_id: company.company_id },
        });
        expect(companyAfter).toBeNull();
      } catch (error) {
        await withBypassClient(async (bypassClient) => {
          try {
            await bypassClient.company.delete({
              where: { company_id: company.company_id },
            });
          } catch {
            // Ignore
          }
        });
        throw error;
      }
    });

    test("CDC-008: [P1] Delete company with stores but no API keys should not fail", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: A company with stores but no API keys
      const companyData = createCompany({ owner_user_id: superadminUser.user_id });
      const company = await prismaClient.company.create({ data: companyData });
      const storeData = createStore({ company_id: company.company_id });
      const store = await prismaClient.store.create({ data: storeData });

      try {
        // Verify no API keys
        const apiKeyCount = await prismaClient.apiKey.count({
          where: { store_id: store.store_id },
        });
        expect(apiKeyCount).toBe(0);

        // Deactivate
        await prismaClient.company.update({
          where: { company_id: company.company_id },
          data: { status: "INACTIVE" },
        });
        await prismaClient.store.update({
          where: { store_id: store.store_id },
          data: { status: "INACTIVE" },
        });

        // WHEN: Delete company
        const deleteResponse = await superadminApiRequest.delete(
          `/api/v1/admin/companies/${company.company_id}`
        );

        // THEN: Deletion succeeds
        expect(deleteResponse.status()).toBe(200);
      } catch (error) {
        await cleanupTestCompanyHierarchy(company.company_id, [store.store_id]);
        throw error;
      }
    });
  });
});
