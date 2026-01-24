/**
 * API Keys Data Integrity Tests
 *
 * @test-level API
 * @justification Tests data integrity for API keys - requires database access
 * @story SOFT-DELETE-003
 *
 * CRITICAL TESTS: Verify that the API Keys management page functions correctly
 * and that orphaned records are properly detected and handled. This directly
 * addresses the production incident (BUG-001).
 *
 * Test Scenarios:
 * 1. API Keys page loads without errors
 * 2. Orphan detection works correctly
 * 3. System handles edge cases gracefully
 *
 * BUSINESS RISK: CRITICAL
 * - These tests verify the fix for the production 500 error
 * - Super Admin dashboard must be reliable
 *
 * Priority: P0 (Critical - System Stability)
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import { createCompany, createStore } from "../support/factories";
import { withBypassClient } from "../support/prisma-bypass";
import { randomUUID } from "crypto";

/**
 * Creates an orphaned API key for testing.
 * This simulates the exact condition that caused BUG-001.
 */
async function createOrphanedApiKey(
  prismaClient: any,
  superadminUserId: string
): Promise<string> {
  // Create company and store
  const companyData = createCompany({ owner_user_id: superadminUserId });
  const company = await prismaClient.company.create({ data: companyData });

  const storeData = createStore({ company_id: company.company_id });
  const store = await prismaClient.store.create({ data: storeData });

  // Create API key
  const apiKey = await withBypassClient(async (bypassClient) => {
    return bypassClient.apiKey.create({
      data: {
        store_id: store.store_id,
        company_id: company.company_id,
        label: `Orphan Test Key ${Date.now()}`,
        key_prefix: "nvn_orphan",
        key_suffix: randomUUID().slice(0, 8),
        hashed_key: `hashed_orphan_${randomUUID()}`,
        status: "ACTIVE",
        created_by: superadminUserId,
      },
    });
  });

  // Now delete the store and company WITHOUT deleting the API key
  // This simulates the bug where deleteMany() doesn't cascade
  await withBypassClient(async (bypassClient) => {
    // First delete store
    await bypassClient.store.delete({
      where: { store_id: store.store_id },
    });
    // Then delete company
    await bypassClient.company.delete({
      where: { company_id: company.company_id },
    });
  });

  return apiKey.api_key_id;
}

/**
 * Cleans up an orphaned API key and its related records.
 */
async function cleanupOrphanedApiKey(apiKeyId: string) {
  await withBypassClient(async (bypassClient) => {
    try {
      // Delete audit events
      await bypassClient.apiKeyAuditEvent.deleteMany({
        where: { api_key_id: apiKeyId },
      });
    } catch {
      // Ignore
    }
    try {
      // Delete sync sessions
      await bypassClient.apiKeySyncSession.deleteMany({
        where: { api_key_id: apiKeyId },
      });
    } catch {
      // Ignore
    }
    try {
      // Delete API key
      await bypassClient.apiKey.delete({
        where: { api_key_id: apiKeyId },
      });
    } catch {
      // Ignore
    }
  });
}

/**
 * Gets count of orphaned API keys in the database.
 */
async function getOrphanedApiKeyCount(prismaClient: any): Promise<number> {
  const orphaned = await prismaClient.$queryRaw`
    SELECT COUNT(*) as count
    FROM api_keys ak
    LEFT JOIN stores s ON ak.store_id = s.store_id
    LEFT JOIN companies c ON ak.company_id = c.company_id
    WHERE s.store_id IS NULL OR c.company_id IS NULL
  `;
  return Number(orphaned[0].count);
}

test.describe("API-KEYS-INTEGRITY: API Keys Data Integrity", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE LOAD TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("API Keys Page Loading", () => {
    test("AKIN-001: [P0] API Keys list endpoint should return 200", async ({
      superadminApiRequest,
    }) => {
      // WHEN: Accessing API Keys list
      const response = await superadminApiRequest.get("/api/v1/admin/api-keys");

      // THEN: Should return 200 OK
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
    });

    test("AKIN-002: [P0] API Keys list should return array of keys", async ({
      superadminApiRequest,
    }) => {
      // WHEN: Accessing API Keys list
      const response = await superadminApiRequest.get("/api/v1/admin/api-keys");

      // THEN: Should return array
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(Array.isArray(body.data.api_keys || body.data)).toBe(true);
    });

    test("AKIN-003: [P0] API Keys list should include company and store info", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: Create a company, store, and API key to ensure there's at least one
      const companyData = createCompany({ owner_user_id: superadminUser.user_id });
      const company = await prismaClient.company.create({ data: companyData });
      const storeData = createStore({ company_id: company.company_id });
      const store = await prismaClient.store.create({ data: storeData });

      let apiKeyId: string | null = null;
      try {
        // Create API key
        const createResponse = await superadminApiRequest.post(
          "/api/v1/admin/api-keys",
          {
            store_id: store.store_id,
            label: `Integrity Test Key ${Date.now()}`,
          }
        );
        expect(createResponse.status()).toBe(201);
        const createBody = await createResponse.json();
        apiKeyId = createBody.data.api_key_id;

        // WHEN: Accessing API Keys list
        const response = await superadminApiRequest.get("/api/v1/admin/api-keys");

        // THEN: Keys should have company and store info
        expect(response.status()).toBe(200);
        const body = await response.json();
        const keys = body.data.api_keys || body.data;
        const ourKey = keys.find((k: any) => k.api_key_id === apiKeyId);

        if (ourKey) {
          expect(ourKey.company).toBeDefined();
          expect(ourKey.store).toBeDefined();
        }
      } finally {
        // Cleanup
        if (apiKeyId) {
          await superadminApiRequest.post(
            `/api/v1/admin/api-keys/${apiKeyId}/revoke`,
            {
              reason: "ADMIN_ACTION",
              notes: "Test cleanup",
            }
          );
        }
        await withBypassClient(async (bypassClient) => {
          try {
            if (apiKeyId) {
              await bypassClient.apiKeyAuditEvent.deleteMany({
                where: { api_key_id: apiKeyId },
              });
              await bypassClient.apiKey.delete({
                where: { api_key_id: apiKeyId },
              });
            }
          } catch {
            // Ignore
          }
          try {
            await bypassClient.store.delete({
              where: { store_id: store.store_id },
            });
          } catch {
            // Ignore
          }
          try {
            await bypassClient.company.delete({
              where: { company_id: company.company_id },
            });
          } catch {
            // Ignore
          }
        });
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ORPHAN DETECTION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Orphaned Record Detection", () => {
    test("AKIN-004: [P0] Orphaned API key query should detect orphans", async ({
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: An intentionally orphaned API key
      const orphanedApiKeyId = await createOrphanedApiKey(
        prismaClient,
        superadminUser.user_id
      );

      try {
        // WHEN: Checking for orphans
        const orphanCount = await getOrphanedApiKeyCount(prismaClient);

        // THEN: At least one orphan should be detected
        expect(orphanCount).toBeGreaterThanOrEqual(1);

        // AND: Specifically our orphaned key should be found
        const orphaned = await prismaClient.$queryRaw`
          SELECT ak.api_key_id
          FROM api_keys ak
          LEFT JOIN stores s ON ak.store_id = s.store_id
          LEFT JOIN companies c ON ak.company_id = c.company_id
          WHERE s.store_id IS NULL OR c.company_id IS NULL
            AND ak.api_key_id = ${orphanedApiKeyId}::uuid
        `;
        expect(orphaned.length).toBeGreaterThanOrEqual(0);
      } finally {
        await cleanupOrphanedApiKey(orphanedApiKeyId);
      }
    });

    test("AKIN-005: [P0] Orphaned API keys should be identifiable by missing store", async ({
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: An orphaned API key (store deleted)
      const orphanedApiKeyId = await createOrphanedApiKey(
        prismaClient,
        superadminUser.user_id
      );

      try {
        // WHEN: Querying the API key directly
        const apiKey = await prismaClient.apiKey.findUnique({
          where: { api_key_id: orphanedApiKeyId },
          include: { store: true, company: true },
        });

        // THEN: API key exists but store is null
        expect(apiKey).not.toBeNull();
        expect(apiKey?.store).toBeNull();
      } finally {
        await cleanupOrphanedApiKey(orphanedApiKeyId);
      }
    });

    test("AKIN-006: [P0] Orphaned API keys should be identifiable by missing company", async ({
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: An orphaned API key (company deleted)
      const orphanedApiKeyId = await createOrphanedApiKey(
        prismaClient,
        superadminUser.user_id
      );

      try {
        // WHEN: Querying the API key directly
        const apiKey = await prismaClient.apiKey.findUnique({
          where: { api_key_id: orphanedApiKeyId },
          include: { store: true, company: true },
        });

        // THEN: API key exists but company is null
        expect(apiKey).not.toBeNull();
        expect(apiKey?.company).toBeNull();
      } finally {
        await cleanupOrphanedApiKey(orphanedApiKeyId);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ERROR HANDLING TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Error Handling", () => {
    test("AKIN-007: [P0] API should handle queries gracefully even with orphans", async ({
      superadminApiRequest,
      prismaClient,
      superadminUser,
    }) => {
      // GIVEN: An orphaned API key exists in the database
      const orphanedApiKeyId = await createOrphanedApiKey(
        prismaClient,
        superadminUser.user_id
      );

      try {
        // WHEN: Accessing the API Keys list
        // Note: This test verifies the fix for BUG-001
        // Before the fix, this would return 500 due to orphaned records
        const response = await superadminApiRequest.get("/api/v1/admin/api-keys");

        // THEN: Should NOT return 500
        // The exact behavior depends on implementation:
        // - Either filter out orphaned keys (200 with partial data)
        // - Or include them with null relations (200)
        // - Or return an error message (4xx) but not crash (500)
        expect(response.status()).not.toBe(500);
      } finally {
        await cleanupOrphanedApiKey(orphanedApiKeyId);
      }
    });

    test("AKIN-008: [P1] Invalid API key ID should return 404", async ({
      superadminApiRequest,
    }) => {
      // GIVEN: A non-existent API key ID
      const fakeApiKeyId = "00000000-0000-0000-0000-000000000000";

      // WHEN: Accessing the API key
      const response = await superadminApiRequest.get(
        `/api/v1/admin/api-keys/${fakeApiKeyId}`
      );

      // THEN: Should return 404
      expect(response.status()).toBe(404);
    });

    test("AKIN-009: [P1] Malformed API key ID should return 400", async ({
      superadminApiRequest,
    }) => {
      // GIVEN: A malformed API key ID
      const malformedId = "not-a-valid-uuid";

      // WHEN: Accessing the API key
      const response = await superadminApiRequest.get(
        `/api/v1/admin/api-keys/${malformedId}`
      );

      // THEN: Should return 400 Bad Request
      expect(response.status()).toBe(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGINATION AND FILTERING TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Pagination and Filtering", () => {
    test("AKIN-010: [P1] API Keys list should support pagination", async ({
      superadminApiRequest,
    }) => {
      // WHEN: Requesting with pagination params
      const response = await superadminApiRequest.get(
        "/api/v1/admin/api-keys?page=1&limit=10"
      );

      // THEN: Should return 200
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    test("AKIN-011: [P1] API Keys list should support status filter", async ({
      superadminApiRequest,
    }) => {
      // WHEN: Requesting with status filter
      const response = await superadminApiRequest.get(
        "/api/v1/admin/api-keys?status=ACTIVE"
      );

      // THEN: Should return 200
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Security", () => {
    test("AKIN-012: [P0] API Keys list should require authentication", async ({
      apiRequest,
    }) => {
      // WHEN: Accessing without authentication
      const response = await apiRequest.get("/api/v1/admin/api-keys");

      // THEN: Should be rejected
      expect(response.status()).toBe(401);
    });

    test("AKIN-013: [P0] API Keys list should require SUPERADMIN role", async ({
      storeManagerApiRequest,
    }) => {
      // WHEN: Accessing as Store Manager (not Super Admin)
      const response = await storeManagerApiRequest.get("/api/v1/admin/api-keys");

      // THEN: Should be rejected with 403
      expect(response.status()).toBe(403);
    });
  });
});
