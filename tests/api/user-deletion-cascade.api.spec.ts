/**
 * User Deletion Cascade Tests
 *
 * @test-level API
 * @justification Tests cascade deletion flow for users - requires database, auth, and RBAC infrastructure
 * @story SOFT-DELETE-001
 *
 * CRITICAL TESTS: Verify that deleting a CLIENT_OWNER user properly cascades
 * to delete all associated API keys and related records. This directly addresses
 * the production bug (BUG-001) where orphaned API keys caused 500 errors.
 *
 * Test Scenarios:
 * 1. Delete user cascade to API keys
 * 2. No orphaned records after deletion
 * 3. Data integrity verification
 * 4. Edge cases (multiple stores, concurrent operations)
 *
 * BUSINESS RISK: CRITICAL
 * - Orphaned API keys cause 500 errors in production
 * - Data integrity violations break Super Admin dashboard
 * - This test suite prevents regression of BUG-001
 *
 * Priority: P0 (Critical - Data Integrity, System Stability)
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createUser,
  createCompany,
  createStore,
  createClientUser,
} from "../support/factories";
import { withBypassClient } from "../support/prisma-bypass";
import bcrypt from "bcrypt";
import { randomUUID } from "crypto";

/**
 * Creates a complete test hierarchy: User -> Company -> Store -> API Key
 * This mirrors the production data structure that caused BUG-001.
 */
async function createTestHierarchy(
  prismaClient: any,
  options: {
    createApiKey?: boolean;
    createAuditEvents?: boolean;
    createSyncSessions?: boolean;
    storeCount?: number;
  } = {},
) {
  const {
    createApiKey = true,
    createAuditEvents = true,
    createSyncSessions = false,
    storeCount = 1,
  } = options;

  // Create CLIENT_OWNER user with password
  const password = "TestPassword123!";
  const passwordHash = await bcrypt.hash(password, 10);
  const userData = createUser({
    password_hash: passwordHash,
    status: "ACTIVE",
  });
  const user = await prismaClient.user.create({ data: userData });

  // Assign CLIENT_OWNER role
  const clientOwnerRole = await prismaClient.role.findUnique({
    where: { code: "CLIENT_OWNER" },
  });

  if (!clientOwnerRole) {
    throw new Error("CLIENT_OWNER role not found - check seed data");
  }

  await withBypassClient(async (bypassClient) => {
    await bypassClient.userRole.create({
      data: {
        user_id: user.user_id,
        role_id: clientOwnerRole.role_id,
      },
    });
  });

  // Create company owned by the user
  const companyData = createCompany({ owner_user_id: user.user_id });
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
  if (createApiKey) {
    for (const store of stores) {
      const apiKey = await withBypassClient(async (bypassClient) => {
        return bypassClient.apiKey.create({
          data: {
            store_id: store.store_id,
            company_id: company.company_id,
            label: `Test API Key ${Date.now()}-${randomUUID().slice(0, 4)}`,
            key_prefix: "nvn_test",
            key_suffix: randomUUID().slice(0, 4),
            key_hash: `hashed_${randomUUID()}`,
            identity_payload: JSON.stringify({
              v: 1,
              store_id: store.store_id,
            }),
            payload_version: 1,
            status: "ACTIVE",
            created_by: user.user_id,
          },
        });
      });
      apiKeys.push(apiKey);

      // Create audit events for the API key
      if (createAuditEvents) {
        await withBypassClient(async (bypassClient) => {
          await bypassClient.apiKeyAuditEvent.createMany({
            data: [
              {
                api_key_id: apiKey.api_key_id,
                event_type: "CREATED",
                actor_user_id: user.user_id,
                actor_type: "ADMIN",
                ip_address: "127.0.0.1",
              },
            ],
          });
        });
      }

      // Create sync sessions for the API key
      if (createSyncSessions) {
        await withBypassClient(async (bypassClient) => {
          await bypassClient.apiKeySyncSession.create({
            data: {
              api_key_id: apiKey.api_key_id,
              device_fingerprint: `device_${randomUUID().slice(0, 32)}`,
              app_version: "1.0.0",
              server_time_at_start: new Date(),
              sync_status: "COMPLETED",
              session_started_at: new Date(),
              session_ended_at: new Date(),
            },
          });
        });
      }
    }
  }

  return {
    user,
    company,
    stores,
    apiKeys,
    password,
    clientOwnerRole,
  };
}

/**
 * Cleans up test hierarchy completely using bypass client.
 * This ensures proper cleanup order to avoid FK constraint errors.
 */
async function cleanupTestHierarchy(
  userId: string,
  companyId: string,
  storeIds: string[],
) {
  await withBypassClient(async (bypassClient) => {
    // 1. Delete API key sync sessions
    for (const storeId of storeIds) {
      try {
        const apiKeys = await bypassClient.apiKey.findMany({
          where: { store_id: storeId },
          select: { api_key_id: true },
        });
        const apiKeyIds = apiKeys.map((k: any) => k.api_key_id);

        if (apiKeyIds.length > 0) {
          await bypassClient.apiKeySyncSession.deleteMany({
            where: { api_key_id: { in: apiKeyIds } },
          });
        }
      } catch {
        // Ignore errors
      }
    }

    // 2. Delete API key audit events
    for (const storeId of storeIds) {
      try {
        await bypassClient.apiKeyAuditEvent.deleteMany({
          where: { api_key: { store_id: storeId } },
        });
      } catch {
        // Ignore errors
      }
    }

    // 3. Delete API keys
    for (const storeId of storeIds) {
      try {
        await bypassClient.apiKey.deleteMany({
          where: { store_id: storeId },
        });
      } catch {
        // Ignore errors
      }
    }

    // 4. Delete user roles
    try {
      await bypassClient.userRole.deleteMany({
        where: { user_id: userId },
      });
    } catch {
      // Ignore errors
    }

    // 5. Delete stores
    for (const storeId of storeIds) {
      try {
        await bypassClient.store.delete({
          where: { store_id: storeId },
        });
      } catch {
        // Ignore errors
      }
    }

    // 6. Delete company
    try {
      await bypassClient.company.delete({
        where: { company_id: companyId },
      });
    } catch {
      // Ignore errors
    }

    // 7. Delete user
    try {
      await bypassClient.user.delete({
        where: { user_id: userId },
      });
    } catch {
      // Ignore errors
    }
  });
}

/**
 * Checks for orphaned API keys that reference non-existent stores or companies.
 * This is the exact scenario that caused BUG-001.
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

test.describe("USER-DELETE-CASCADE: User Deletion Cascade to API Keys", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1: HARD DELETE CASCADE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Phase 1: Hard Delete with Cascade Fix", () => {
    test("UDC-001: [P0] Deleting CLIENT_OWNER should cascade to delete API keys", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A CLIENT_OWNER user with company, store, and API key
      const hierarchy = await createTestHierarchy(prismaClient, {
        createApiKey: true,
        createAuditEvents: true,
      });

      try {
        // Verify API key exists
        const apiKeyBefore = await prismaClient.apiKey.findUnique({
          where: { api_key_id: hierarchy.apiKeys[0].api_key_id },
        });
        expect(
          apiKeyBefore,
          "API key should exist before deletion",
        ).not.toBeNull();

        // Step 1: Deactivate the user (required before deletion)
        await prismaClient.user.update({
          where: { user_id: hierarchy.user.user_id },
          data: { status: "INACTIVE" },
        });

        // Step 2: Deactivate the company
        await prismaClient.company.update({
          where: { company_id: hierarchy.company.company_id },
          data: { status: "INACTIVE" },
        });

        // Step 3: Deactivate the store
        for (const store of hierarchy.stores) {
          await prismaClient.store.update({
            where: { store_id: store.store_id },
            data: { status: "INACTIVE" },
          });
        }

        // WHEN: Super Admin deletes the user via API
        const deleteResponse = await superadminApiRequest.delete(
          `/api/admin/users/${hierarchy.user.user_id}`,
        );

        // THEN: User is deleted successfully
        expect(deleteResponse.status()).toBe(200);

        // AND: API key should also be deleted (no orphans)
        const apiKeyAfter = await prismaClient.apiKey.findUnique({
          where: { api_key_id: hierarchy.apiKeys[0].api_key_id },
        });
        expect(
          apiKeyAfter,
          "API key should be deleted when user is deleted",
        ).toBeNull();

        // AND: No orphaned API keys exist
        const orphanCheck = await checkForOrphanedApiKeys(prismaClient);
        expect(
          orphanCheck.count,
          "No orphaned API keys should exist after user deletion",
        ).toBe(0);
      } catch (error) {
        // Cleanup on failure
        await cleanupTestHierarchy(
          hierarchy.user.user_id,
          hierarchy.company.company_id,
          hierarchy.stores.map((s: any) => s.store_id),
        );
        throw error;
      }
    });

    test("UDC-002: [P0] Deleting user with multiple stores should cascade to all API keys", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A CLIENT_OWNER user with company, 3 stores, each with an API key
      const hierarchy = await createTestHierarchy(prismaClient, {
        createApiKey: true,
        createAuditEvents: true,
        storeCount: 3,
      });

      try {
        // Verify all API keys exist
        for (const apiKey of hierarchy.apiKeys) {
          const keyBefore = await prismaClient.apiKey.findUnique({
            where: { api_key_id: apiKey.api_key_id },
          });
          expect(
            keyBefore,
            "API key should exist before deletion",
          ).not.toBeNull();
        }

        // Deactivate everything
        await prismaClient.user.update({
          where: { user_id: hierarchy.user.user_id },
          data: { status: "INACTIVE" },
        });
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

        // WHEN: Super Admin deletes the user
        const deleteResponse = await superadminApiRequest.delete(
          `/api/admin/users/${hierarchy.user.user_id}`,
        );

        // THEN: Deletion succeeds
        expect(deleteResponse.status()).toBe(200);

        // AND: ALL API keys should be deleted
        for (const apiKey of hierarchy.apiKeys) {
          const keyAfter = await prismaClient.apiKey.findUnique({
            where: { api_key_id: apiKey.api_key_id },
          });
          expect(
            keyAfter,
            `API key ${apiKey.api_key_id} should be deleted`,
          ).toBeNull();
        }

        // AND: No orphans
        const orphanCheck = await checkForOrphanedApiKeys(prismaClient);
        expect(orphanCheck.count).toBe(0);
      } catch (error) {
        await cleanupTestHierarchy(
          hierarchy.user.user_id,
          hierarchy.company.company_id,
          hierarchy.stores.map((s: any) => s.store_id),
        );
        throw error;
      }
    });

    test("UDC-003: [P0] Deleting user should also delete API key audit events", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user with API key that has audit events
      const hierarchy = await createTestHierarchy(prismaClient, {
        createApiKey: true,
        createAuditEvents: true,
      });

      try {
        // Verify audit events exist
        const auditEventsBefore = await prismaClient.apiKeyAuditEvent.count({
          where: { api_key_id: hierarchy.apiKeys[0].api_key_id },
        });
        expect(
          auditEventsBefore,
          "Audit events should exist before deletion",
        ).toBeGreaterThan(0);

        // Deactivate
        await prismaClient.user.update({
          where: { user_id: hierarchy.user.user_id },
          data: { status: "INACTIVE" },
        });
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

        // WHEN: Delete user
        const deleteResponse = await superadminApiRequest.delete(
          `/api/admin/users/${hierarchy.user.user_id}`,
        );
        expect(deleteResponse.status()).toBe(200);

        // THEN: Audit events should also be deleted
        const auditEventsAfter = await prismaClient.apiKeyAuditEvent.count({
          where: { api_key_id: hierarchy.apiKeys[0].api_key_id },
        });
        expect(
          auditEventsAfter,
          "Audit events should be deleted when user is deleted",
        ).toBe(0);
      } catch (error) {
        await cleanupTestHierarchy(
          hierarchy.user.user_id,
          hierarchy.company.company_id,
          hierarchy.stores.map((s: any) => s.store_id),
        );
        throw error;
      }
    });

    test("UDC-004: [P0] Deleting user should delete API key sync sessions", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user with API key that has sync sessions
      const hierarchy = await createTestHierarchy(prismaClient, {
        createApiKey: true,
        createAuditEvents: true,
        createSyncSessions: true,
      });

      try {
        // Verify sync sessions exist
        const syncSessionsBefore = await prismaClient.apiKeySyncSession.count({
          where: { api_key_id: hierarchy.apiKeys[0].api_key_id },
        });
        expect(
          syncSessionsBefore,
          "Sync sessions should exist before deletion",
        ).toBeGreaterThan(0);

        // Deactivate
        await prismaClient.user.update({
          where: { user_id: hierarchy.user.user_id },
          data: { status: "INACTIVE" },
        });
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

        // WHEN: Delete user
        const deleteResponse = await superadminApiRequest.delete(
          `/api/admin/users/${hierarchy.user.user_id}`,
        );
        expect(deleteResponse.status()).toBe(200);

        // THEN: Sync sessions should also be deleted
        const syncSessionsAfter = await prismaClient.apiKeySyncSession.count({
          where: { api_key_id: hierarchy.apiKeys[0].api_key_id },
        });
        expect(
          syncSessionsAfter,
          "Sync sessions should be deleted when user is deleted",
        ).toBe(0);
      } catch (error) {
        await cleanupTestHierarchy(
          hierarchy.user.user_id,
          hierarchy.company.company_id,
          hierarchy.stores.map((s: any) => s.store_id),
        );
        throw error;
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA INTEGRITY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Data Integrity Verification", () => {
    test("UDC-005: [P0] No orphaned API keys should exist after user deletion", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user hierarchy
      const hierarchy = await createTestHierarchy(prismaClient, {
        createApiKey: true,
        createAuditEvents: true,
      });

      try {
        // Verify no orphans before
        const orphansBefore = await checkForOrphanedApiKeys(prismaClient);
        const initialOrphanCount = orphansBefore.count;

        // Deactivate and delete
        await prismaClient.user.update({
          where: { user_id: hierarchy.user.user_id },
          data: { status: "INACTIVE" },
        });
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

        // WHEN: Delete user
        await superadminApiRequest.delete(
          `/api/admin/users/${hierarchy.user.user_id}`,
        );

        // THEN: No new orphans should exist
        const orphansAfter = await checkForOrphanedApiKeys(prismaClient);
        expect(
          orphansAfter.count,
          "No new orphaned API keys should be created by deletion",
        ).toBe(initialOrphanCount);
      } catch (error) {
        await cleanupTestHierarchy(
          hierarchy.user.user_id,
          hierarchy.company.company_id,
          hierarchy.stores.map((s: any) => s.store_id),
        );
        throw error;
      }
    });

    test("UDC-006: [P0] API Keys page should load after user deletion", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user with API keys is deleted
      const hierarchy = await createTestHierarchy(prismaClient, {
        createApiKey: true,
        createAuditEvents: true,
      });

      try {
        // Deactivate and delete
        await prismaClient.user.update({
          where: { user_id: hierarchy.user.user_id },
          data: { status: "INACTIVE" },
        });
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
          `/api/admin/users/${hierarchy.user.user_id}`,
        );

        // WHEN: Accessing the API Keys page
        const apiKeysResponse = await superadminApiRequest.get(
          "/api/v1/admin/api-keys",
        );

        // THEN: Page should load successfully (no 500 error from orphaned records)
        expect(
          apiKeysResponse.status(),
          "API Keys page should load successfully after user deletion",
        ).toBe(200);

        const body = await apiKeysResponse.json();
        expect(body.success).toBe(true);
      } catch (error) {
        await cleanupTestHierarchy(
          hierarchy.user.user_id,
          hierarchy.company.company_id,
          hierarchy.stores.map((s: any) => s.store_id),
        );
        throw error;
      }
    });

    test("UDC-007: [P1] Store deletion verification after company deletion", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user hierarchy
      const hierarchy = await createTestHierarchy(prismaClient, {
        createApiKey: true,
        createAuditEvents: true,
      });

      try {
        const storeId = hierarchy.stores[0].store_id;

        // Verify store exists
        const storeBefore = await prismaClient.store.findUnique({
          where: { store_id: storeId },
        });
        expect(storeBefore).not.toBeNull();

        // Deactivate and delete
        await prismaClient.user.update({
          where: { user_id: hierarchy.user.user_id },
          data: { status: "INACTIVE" },
        });
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

        // WHEN: Delete user
        await superadminApiRequest.delete(
          `/api/admin/users/${hierarchy.user.user_id}`,
        );

        // THEN: Store should also be deleted
        const storeAfter = await prismaClient.store.findUnique({
          where: { store_id: storeId },
        });
        expect(storeAfter, "Store should be deleted with user").toBeNull();
      } catch (error) {
        await cleanupTestHierarchy(
          hierarchy.user.user_id,
          hierarchy.company.company_id,
          hierarchy.stores.map((s: any) => s.store_id),
        );
        throw error;
      }
    });

    test("UDC-008: [P1] Company deletion verification after user deletion", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user hierarchy
      const hierarchy = await createTestHierarchy(prismaClient, {
        createApiKey: true,
        createAuditEvents: true,
      });

      try {
        const companyId = hierarchy.company.company_id;

        // Verify company exists
        const companyBefore = await prismaClient.company.findUnique({
          where: { company_id: companyId },
        });
        expect(companyBefore).not.toBeNull();

        // Deactivate and delete
        await prismaClient.user.update({
          where: { user_id: hierarchy.user.user_id },
          data: { status: "INACTIVE" },
        });
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

        // WHEN: Delete user
        await superadminApiRequest.delete(
          `/api/admin/users/${hierarchy.user.user_id}`,
        );

        // THEN: Company should also be deleted
        const companyAfter = await prismaClient.company.findUnique({
          where: { company_id: companyId },
        });
        expect(companyAfter, "Company should be deleted with user").toBeNull();
      } catch (error) {
        await cleanupTestHierarchy(
          hierarchy.user.user_id,
          hierarchy.company.company_id,
          hierarchy.stores.map((s: any) => s.store_id),
        );
        throw error;
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASES
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Edge Cases", () => {
    test("UDC-009: [P1] Delete user with no API keys should not fail", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user with company and store but NO API keys
      const hierarchy = await createTestHierarchy(prismaClient, {
        createApiKey: false,
        createAuditEvents: false,
      });

      try {
        // Verify no API keys exist
        const apiKeyCount = await prismaClient.apiKey.count({
          where: { store_id: hierarchy.stores[0].store_id },
        });
        expect(apiKeyCount).toBe(0);

        // Deactivate
        await prismaClient.user.update({
          where: { user_id: hierarchy.user.user_id },
          data: { status: "INACTIVE" },
        });
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

        // WHEN: Delete user
        const deleteResponse = await superadminApiRequest.delete(
          `/api/admin/users/${hierarchy.user.user_id}`,
        );

        // THEN: Deletion should succeed
        expect(deleteResponse.status()).toBe(200);

        // AND: User should be deleted
        const userAfter = await prismaClient.user.findUnique({
          where: { user_id: hierarchy.user.user_id },
        });
        expect(userAfter).toBeNull();
      } catch (error) {
        await cleanupTestHierarchy(
          hierarchy.user.user_id,
          hierarchy.company.company_id,
          hierarchy.stores.map((s: any) => s.store_id),
        );
        throw error;
      }
    });

    test("UDC-010: [P1] Delete user with revoked API keys should cascade correctly", async ({
      superadminApiRequest,
      prismaClient,
    }) => {
      // GIVEN: A user with a revoked API key
      const hierarchy = await createTestHierarchy(prismaClient, {
        createApiKey: true,
        createAuditEvents: true,
      });

      try {
        // Revoke the API key
        await withBypassClient(async (bypassClient) => {
          await bypassClient.apiKey.update({
            where: { api_key_id: hierarchy.apiKeys[0].api_key_id },
            data: {
              status: "REVOKED",
              revoked_at: new Date(),
              revocation_reason: "ADMIN_ACTION",
            },
          });
        });

        // Verify API key is revoked
        const apiKeyBefore = await prismaClient.apiKey.findUnique({
          where: { api_key_id: hierarchy.apiKeys[0].api_key_id },
        });
        expect(apiKeyBefore?.status).toBe("REVOKED");

        // Deactivate and delete
        await prismaClient.user.update({
          where: { user_id: hierarchy.user.user_id },
          data: { status: "INACTIVE" },
        });
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

        // WHEN: Delete user
        const deleteResponse = await superadminApiRequest.delete(
          `/api/admin/users/${hierarchy.user.user_id}`,
        );

        // THEN: Deletion should succeed
        expect(deleteResponse.status()).toBe(200);

        // AND: Revoked API key should also be deleted
        const apiKeyAfter = await prismaClient.apiKey.findUnique({
          where: { api_key_id: hierarchy.apiKeys[0].api_key_id },
        });
        expect(apiKeyAfter).toBeNull();
      } catch (error) {
        await cleanupTestHierarchy(
          hierarchy.user.user_id,
          hierarchy.company.company_id,
          hierarchy.stores.map((s: any) => s.store_id),
        );
        throw error;
      }
    });
  });
});
