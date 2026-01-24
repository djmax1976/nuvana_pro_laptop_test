import { test, expect } from "../support/fixtures/rbac.fixture";
import { createStore, createCompany } from "../support/factories";
import { withBypassClient } from "../support/prisma-bypass";

/**
 * Creates a test store with company for API key testing.
 * Each test that creates API keys should use this to avoid conflicts
 * since a store can only have one active API key.
 *
 * API key creation requires stores to have:
 * - name, public_id, company, timezone (handled by factory)
 * - state_id with valid state relation (required for identity payload)
 */
async function createTestStoreWithCompany(
  prismaClient: any,
  ownerUserId: string,
) {
  // Get a valid state from the seeded data (Georgia is always available)
  const state = await prismaClient.uSState.findFirst({
    where: { code: "GA", is_active: true },
  });
  if (!state) {
    throw new Error(
      "Georgia state not found in database. Run geographic data seed first.",
    );
  }

  const companyData = createCompany({ owner_user_id: ownerUserId });
  const company = await prismaClient.company.create({ data: companyData });

  const storeData = createStore({ company_id: company.company_id });
  const store = await prismaClient.store.create({
    data: {
      ...storeData,
      state_id: state.state_id, // Required for API key creation
    },
  });

  return { company, store };
}

/**
 * Cleans up test store and associated data with robust error handling.
 * This ensures cleanup doesn't fail even if some records are missing.
 */
async function cleanupTestStore(storeId: string, companyId: string) {
  await withBypassClient(async (bypassClient) => {
    // Step 1: Delete audit events first (FK constraint)
    try {
      await bypassClient.apiKeyAuditEvent.deleteMany({
        where: { api_key: { store_id: storeId } },
      });
    } catch {
      // Ignore errors - records may not exist
    }

    // Step 2: Delete API keys
    try {
      await bypassClient.apiKey.deleteMany({
        where: { store_id: storeId },
      });
    } catch {
      // Ignore errors - records may not exist
    }

    // Step 3: Delete store
    try {
      await bypassClient.store.delete({
        where: { store_id: storeId },
      });
    } catch {
      // Ignore errors - record may not exist
    }

    // Step 4: Delete company
    try {
      await bypassClient.company.delete({
        where: { company_id: companyId },
      });
    } catch {
      // Ignore errors - record may not exist
    }
  });
}

/**
 * @test-level API
 * @justification Tests API endpoints for API Key Management - requires database, auth, and RBAC infrastructure
 * @story API-KEY-MANAGEMENT
 *
 * API Key Management API Tests
 *
 * Tests for Super Admin API Key Management endpoints:
 * - POST   /api/v1/admin/api-keys              - Create new API key
 * - GET    /api/v1/admin/api-keys              - List all API keys
 * - GET    /api/v1/admin/api-keys/:keyId       - Get API key details
 * - PATCH  /api/v1/admin/api-keys/:keyId       - Update API key settings
 * - POST   /api/v1/admin/api-keys/:keyId/rotate    - Rotate API key
 * - POST   /api/v1/admin/api-keys/:keyId/revoke    - Revoke API key
 * - POST   /api/v1/admin/api-keys/:keyId/suspend   - Suspend API key
 * - POST   /api/v1/admin/api-keys/:keyId/reactivate - Reactivate suspended key
 * - GET    /api/v1/admin/api-keys/:keyId/audit     - Get audit trail
 *
 * SECURITY TEST COVERAGE:
 * - Authentication enforcement (valid token required)
 * - Authorization enforcement (SUPERADMIN role required)
 * - Non-superadmin access denial (Store Manager, Corporate Admin, Client)
 * - Input validation (UUID format, required fields, enum values)
 * - Raw key security (only shown once on creation/rotation)
 *
 * Priority: P0 (Critical - API Key management, security boundaries)
 */

test.describe("API-KEY-API: Super Admin API Key Management", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE API KEY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("APIKEY-API-001: [P0] POST /api/v1/admin/api-keys - should create new API key for store", async ({
    superadminApiRequest,
    prismaClient,
    superadminUser,
  }) => {
    // GIVEN: I am authenticated as a Super Admin with API_KEY_CREATE permission
    // Create a fresh store to avoid conflicts
    const { company, store } = await createTestStoreWithCompany(
      prismaClient,
      superadminUser.user_id,
    );

    try {
      // WHEN: Creating a new API key for the store
      const response = await superadminApiRequest.post(
        "/api/v1/admin/api-keys",
        {
          store_id: store.store_id,
          label: `Test API Key ${Date.now()}`,
        },
      );

      // THEN: Response is successful with 201 Created
      expect(response.status(), "Expected 201 Created status").toBe(201);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);

      // AND: Response includes the raw key (shown ONCE only)
      expect(body.data.raw_key, "Raw key should be present").toBeTruthy();
      expect(
        body.data.raw_key.length,
        "Raw key should be proper length",
      ).toBeGreaterThan(20);

      // AND: Response includes key metadata
      expect(body.data.api_key_id, "API key ID should be present").toBeTruthy();
      expect(body.data.store_id, "Store ID should match").toBe(store.store_id);
      expect(body.data.key_prefix, "Key prefix should be present").toBeTruthy();
      expect(body.data.key_suffix, "Key suffix should be present").toBeTruthy();
      expect(body.data.status, "Status should be ACTIVE").toBe("ACTIVE");

      // Cleanup - revoke the key after test
      await superadminApiRequest.post(
        `/api/v1/admin/api-keys/${body.data.api_key_id}/revoke`,
        {
          reason: "ADMIN_ACTION",
          notes: "Test cleanup",
        },
      );
    } finally {
      await cleanupTestStore(store.store_id, company.company_id);
    }
  });

  test("APIKEY-API-002: [P0] POST /api/v1/admin/api-keys - should reject request without store_id", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Super Admin

    // WHEN: Creating API key without required store_id
    const response = await superadminApiRequest.post("/api/v1/admin/api-keys", {
      label: "Test Key",
    });

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request status").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("APIKEY-API-003: [P0] POST /api/v1/admin/api-keys - should reject invalid store_id", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Super Admin

    // WHEN: Creating API key with non-existent store_id
    const response = await superadminApiRequest.post("/api/v1/admin/api-keys", {
      store_id: "00000000-0000-0000-0000-000000000000",
      label: "Test Key",
    });

    // THEN: Request is rejected with 404 Not Found
    expect(response.status(), "Expected 404 Not Found status").toBe(404);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("APIKEY-API-004: [P1] POST /api/v1/admin/api-keys - should create key with advanced settings", async ({
    superadminApiRequest,
    prismaClient,
    superadminUser,
  }) => {
    // GIVEN: I am authenticated as a Super Admin
    // Create a fresh store to avoid conflicts
    const { company, store } = await createTestStoreWithCompany(
      prismaClient,
      superadminUser.user_id,
    );

    try {
      // WHEN: Creating API key with advanced configuration
      const response = await superadminApiRequest.post(
        "/api/v1/admin/api-keys",
        {
          store_id: store.store_id,
          label: `Advanced Test Key ${Date.now()}`,
          ip_allowlist: ["192.168.1.0/24", "10.0.0.1"],
          ip_enforcement_enabled: true,
          rate_limit_rpm: 200,
          daily_sync_quota: 500,
          monthly_data_quota_mb: 5000,
        },
      );

      // THEN: Response is successful
      expect(response.status(), "Expected 201 Created status").toBe(201);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(body.data.api_key_id, "API key ID should be present").toBeTruthy();

      // Cleanup - revoke the key
      await superadminApiRequest.post(
        `/api/v1/admin/api-keys/${body.data.api_key_id}/revoke`,
        {
          reason: "ADMIN_ACTION",
          notes: "Test cleanup",
        },
      );
    } finally {
      await cleanupTestStore(store.store_id, company.company_id);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LIST API KEYS TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("APIKEY-API-010: [P1] GET /api/v1/admin/api-keys - should return paginated list of API keys", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Super Admin

    // WHEN: Requesting list of API keys
    const response = await superadminApiRequest.get("/api/v1/admin/api-keys");

    // THEN: Response is successful
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data, "Response should have data object").toBeTruthy();
    expect(Array.isArray(body.data.items), "Items should be an array").toBe(
      true,
    );

    // AND: Pagination info is included
    expect(body.data.pagination, "Pagination should be present").toBeTruthy();
    expect(
      body.data.pagination.total,
      "Total count should be present",
    ).toBeDefined();
    expect(
      body.data.pagination.page,
      "Page number should be present",
    ).toBeDefined();
    expect(body.data.pagination.limit, "Limit should be present").toBeDefined();

    // AND: Each item has expected properties
    if (body.data.items.length > 0) {
      const item = body.data.items[0];
      expect(item).toHaveProperty("api_key_id");
      expect(item).toHaveProperty("store_id");
      expect(item).toHaveProperty("key_prefix");
      expect(item).toHaveProperty("key_suffix");
      expect(item).toHaveProperty("status");
      // Raw key should NEVER be in list response
      expect(item).not.toHaveProperty("raw_key");
      expect(item).not.toHaveProperty("key_hash");
    }
  });

  test("APIKEY-API-011: [P1] GET /api/v1/admin/api-keys - should filter by status", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Super Admin

    // WHEN: Requesting API keys filtered by ACTIVE status
    const response = await superadminApiRequest.get(
      "/api/v1/admin/api-keys?status=ACTIVE",
    );

    // THEN: Response is successful
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);

    // AND: All returned keys are ACTIVE status
    for (const item of body.data.items) {
      expect(item.status, `Key ${item.api_key_id} should be ACTIVE`).toBe(
        "ACTIVE",
      );
    }
  });

  test("APIKEY-API-012: [P1] GET /api/v1/admin/api-keys - should filter by store_id", async ({
    superadminApiRequest,
    prismaClient,
    superadminUser,
  }) => {
    // GIVEN: I am authenticated as a Super Admin
    // Create a fresh store to ensure test isolation
    const { company, store } = await createTestStoreWithCompany(
      prismaClient,
      superadminUser.user_id,
    );

    try {
      // Create an API key for this store so we have data to filter
      const createResponse = await superadminApiRequest.post(
        "/api/v1/admin/api-keys",
        {
          store_id: store.store_id,
          label: `Filter Test Key ${Date.now()}`,
        },
      );
      expect(createResponse.status()).toBe(201);
      const createdKey = (await createResponse.json()).data;

      // WHEN: Requesting API keys filtered by store_id
      const response = await superadminApiRequest.get(
        `/api/v1/admin/api-keys?store_id=${store.store_id}`,
      );

      // THEN: Response is successful
      expect(response.status(), "Expected 200 OK status").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);

      // AND: All returned keys belong to the specified store
      for (const item of body.data.items) {
        expect(
          item.store_id,
          `Key should belong to store ${store.store_id}`,
        ).toBe(store.store_id);
      }

      // Cleanup - revoke the key
      await superadminApiRequest.post(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}/revoke`,
        {
          reason: "ADMIN_ACTION",
          notes: "Test cleanup",
        },
      );
    } finally {
      await cleanupTestStore(store.store_id, company.company_id);
    }
  });

  test("APIKEY-API-013: [P2] GET /api/v1/admin/api-keys - should support pagination", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Super Admin

    // WHEN: Requesting first page with limit of 2
    const response = await superadminApiRequest.get(
      "/api/v1/admin/api-keys?page=1&limit=2",
    );

    // THEN: Response is successful
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);

    // AND: Limit is respected
    expect(
      body.data.items.length,
      "Should return at most 2 items",
    ).toBeLessThanOrEqual(2);
    expect(body.data.pagination.limit, "Limit should be 2").toBe(2);
    expect(body.data.pagination.page, "Page should be 1").toBe(1);
  });

  test("APIKEY-API-014: [P2] GET /api/v1/admin/api-keys - should support search", async ({
    superadminApiRequest,
    prismaClient,
    superadminUser,
  }) => {
    // GIVEN: I am authenticated as a Super Admin
    // Create a fresh store to avoid conflicts with existing API keys
    const { company, store } = await createTestStoreWithCompany(
      prismaClient,
      superadminUser.user_id,
    );

    try {
      const uniqueLabel = `SearchTest_${Date.now()}`;
      const createResponse = await superadminApiRequest.post(
        "/api/v1/admin/api-keys",
        {
          store_id: store.store_id,
          label: uniqueLabel,
        },
      );
      expect(createResponse.status()).toBe(201);
      const createdKey = (await createResponse.json()).data;

      // WHEN: Searching for the unique label
      const response = await superadminApiRequest.get(
        `/api/v1/admin/api-keys?search=${uniqueLabel}`,
      );

      // THEN: Response is successful and finds the key
      expect(response.status(), "Expected 200 OK status").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(
        body.data.items.length,
        "Should find at least one key",
      ).toBeGreaterThanOrEqual(1);

      // Cleanup - revoke the key
      await superadminApiRequest.post(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}/revoke`,
        {
          reason: "ADMIN_ACTION",
          notes: "Test cleanup",
        },
      );
    } finally {
      await cleanupTestStore(store.store_id, company.company_id);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET API KEY DETAILS TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("APIKEY-API-020: [P1] GET /api/v1/admin/api-keys/:keyId - should return key details", async ({
    superadminApiRequest,
    prismaClient,
    superadminUser,
  }) => {
    // GIVEN: I am authenticated as a Super Admin
    // Create a fresh store to avoid conflicts
    const { company, store } = await createTestStoreWithCompany(
      prismaClient,
      superadminUser.user_id,
    );

    try {
      // Create a key for testing
      const createResponse = await superadminApiRequest.post(
        "/api/v1/admin/api-keys",
        {
          store_id: store.store_id,
          label: `Details Test Key ${Date.now()}`,
        },
      );
      expect(createResponse.status()).toBe(201);
      const createdKey = (await createResponse.json()).data;

      // WHEN: Requesting key details
      const response = await superadminApiRequest.get(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}`,
      );

      // THEN: Response is successful
      expect(response.status(), "Expected 200 OK status").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);

      // AND: Details include expected properties
      expect(body.data.api_key_id, "API key ID should match").toBe(
        createdKey.api_key_id,
      );
      expect(body.data.store_id, "Store ID should be present").toBeTruthy();
      expect(body.data.store_name, "Store name should be present").toBeTruthy();
      expect(body.data.key_prefix, "Key prefix should be present").toBeTruthy();
      expect(body.data.key_suffix, "Key suffix should be present").toBeTruthy();
      expect(body.data.status, "Status should be present").toBeTruthy();
      expect(body.data.created_at, "Created at should be present").toBeTruthy();

      // AND: Raw key is NEVER returned in details
      expect(body.data).not.toHaveProperty("raw_key");
      expect(body.data).not.toHaveProperty("key_hash");

      // Cleanup - revoke the key
      await superadminApiRequest.post(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}/revoke`,
        {
          reason: "ADMIN_ACTION",
          notes: "Test cleanup",
        },
      );
    } finally {
      await cleanupTestStore(store.store_id, company.company_id);
    }
  });

  test("APIKEY-API-021: [P1] GET /api/v1/admin/api-keys/:keyId - should return 404 for non-existent key", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Super Admin
    const nonExistentKeyId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Requesting non-existent key
    const response = await superadminApiRequest.get(
      `/api/v1/admin/api-keys/${nonExistentKeyId}`,
    );

    // THEN: Response is 404 Not Found
    expect(response.status(), "Expected 404 Not Found status").toBe(404);
  });

  test("APIKEY-API-022: [P1] GET /api/v1/admin/api-keys/:keyId - should reject invalid UUID format", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Super Admin

    // WHEN: Requesting key with invalid UUID format
    const response = await superadminApiRequest.get(
      "/api/v1/admin/api-keys/not-a-valid-uuid",
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request status").toBe(400);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATE API KEY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("APIKEY-API-030: [P1] PATCH /api/v1/admin/api-keys/:keyId - should update key settings", async ({
    superadminApiRequest,
    prismaClient,
    superadminUser,
  }) => {
    // GIVEN: I am authenticated as a Super Admin
    // AND: An API key exists in a fresh store (to avoid conflicts with other tests)
    const { company, store } = await createTestStoreWithCompany(
      prismaClient,
      superadminUser.user_id,
    );

    try {
      const createResponse = await superadminApiRequest.post(
        "/api/v1/admin/api-keys",
        {
          store_id: store.store_id,
          label: `Update Test Key ${Date.now()}`,
        },
      );
      expect(createResponse.status()).toBe(201);
      const createdKey = (await createResponse.json()).data;

      // WHEN: Updating key settings
      const newLabel = `Updated Label ${Date.now()}`;
      const response = await superadminApiRequest.patch(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}`,
        {
          label: newLabel,
          rate_limit_rpm: 150,
        },
      );

      // THEN: Response is successful
      const body = await response.json();
      // Log error details for CI debugging if status is not 200
      if (response.status() !== 200) {
        console.error(
          `[APIKEY-API-030] Update failed with status ${response.status()}:`,
          JSON.stringify(body, null, 2),
        );
      }
      expect(
        response.status(),
        `Expected 200 OK status, got: ${JSON.stringify(body)}`,
      ).toBe(200);
      expect(body.success, "Response should indicate success").toBe(true);

      // AND: Verify the update by fetching details
      const detailsResponse = await superadminApiRequest.get(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}`,
      );
      const details = (await detailsResponse.json()).data;
      expect(details.label, "Label should be updated").toBe(newLabel);

      // Cleanup - revoke the key
      await superadminApiRequest.post(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}/revoke`,
        {
          reason: "ADMIN_ACTION",
          notes: "Test cleanup",
        },
      );
    } finally {
      // Cleanup test store
      await cleanupTestStore(store.store_id, company.company_id);
    }
  });

  test("APIKEY-API-031: [P1] PATCH /api/v1/admin/api-keys/:keyId - should reject invalid UUID format", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Super Admin

    // WHEN: Updating key with invalid UUID
    const response = await superadminApiRequest.patch(
      "/api/v1/admin/api-keys/not-a-valid-uuid",
      { label: "New Label" },
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request status").toBe(400);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ROTATE API KEY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("APIKEY-API-040: [P0] POST /api/v1/admin/api-keys/:keyId/rotate - should rotate key with grace period", async ({
    superadminApiRequest,
    prismaClient,
    superadminUser,
  }) => {
    // GIVEN: I am authenticated as a Super Admin
    // Create a fresh store to avoid conflicts
    const { company, store } = await createTestStoreWithCompany(
      prismaClient,
      superadminUser.user_id,
    );

    try {
      const createResponse = await superadminApiRequest.post(
        "/api/v1/admin/api-keys",
        {
          store_id: store.store_id,
          label: `Rotate Test Key ${Date.now()}`,
        },
      );
      expect(createResponse.status()).toBe(201);
      const createdKey = (await createResponse.json()).data;

      // WHEN: Rotating the key with 7-day grace period
      const response = await superadminApiRequest.post(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}/rotate`,
        {
          grace_period_days: 7,
          preserve_metadata: true,
          preserve_ip_allowlist: true,
        },
      );

      // THEN: Response is successful
      expect(response.status(), "Expected 200 OK status").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);

      // AND: New key is returned (shown ONCE only)
      expect(body.data.new_key, "New key should be present").toBeTruthy();
      expect(
        body.data.new_key.raw_key,
        "Raw key should be present",
      ).toBeTruthy();
      expect(
        body.data.new_key.api_key_id,
        "New key ID should be present",
      ).toBeTruthy();
      expect(body.data.new_key.api_key_id).not.toBe(createdKey.api_key_id);

      // AND: Old key info is returned with grace period
      expect(body.data.old_key, "Old key info should be present").toBeTruthy();
      expect(body.data.old_key.api_key_id, "Old key ID should be present").toBe(
        createdKey.api_key_id,
      );
      expect(
        body.data.old_key.grace_period_ends_at,
        "Grace period end should be present",
      ).toBeTruthy();

      // Cleanup both keys
      await superadminApiRequest.post(
        `/api/v1/admin/api-keys/${body.data.new_key.api_key_id}/revoke`,
        {
          reason: "ADMIN_ACTION",
          notes: "Test cleanup",
        },
      );
      await superadminApiRequest.post(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}/revoke`,
        {
          reason: "ADMIN_ACTION",
          notes: "Test cleanup",
        },
      );
    } finally {
      await cleanupTestStore(store.store_id, company.company_id);
    }
  });

  test("APIKEY-API-041: [P1] POST /api/v1/admin/api-keys/:keyId/rotate - should reject invalid UUID format", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Super Admin

    // WHEN: Rotating key with invalid UUID
    const response = await superadminApiRequest.post(
      "/api/v1/admin/api-keys/not-a-valid-uuid/rotate",
      { grace_period_days: 7 },
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request status").toBe(400);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // REVOKE API KEY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("APIKEY-API-050: [P0] POST /api/v1/admin/api-keys/:keyId/revoke - should revoke key immediately", async ({
    superadminApiRequest,
    prismaClient,
    superadminUser,
  }) => {
    // GIVEN: I am authenticated as a Super Admin
    // Create a fresh store to avoid conflicts
    const { company, store } = await createTestStoreWithCompany(
      prismaClient,
      superadminUser.user_id,
    );

    try {
      const createResponse = await superadminApiRequest.post(
        "/api/v1/admin/api-keys",
        {
          store_id: store.store_id,
          label: `Revoke Test Key ${Date.now()}`,
        },
      );
      expect(createResponse.status()).toBe(201);
      const createdKey = (await createResponse.json()).data;

      // WHEN: Revoking the key
      const response = await superadminApiRequest.post(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}/revoke`,
        {
          reason: "COMPROMISED",
          notes: "Security test - suspected compromise",
          notify_admins: false,
        },
      );

      // THEN: Response is successful
      expect(response.status(), "Expected 200 OK status").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);

      // AND: Key is now revoked (verify by fetching details)
      const detailsResponse = await superadminApiRequest.get(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}`,
      );
      const details = (await detailsResponse.json()).data;
      expect(details.status, "Status should be REVOKED").toBe("REVOKED");
      expect(details.revocation_reason, "Revocation reason should be set").toBe(
        "COMPROMISED",
      );
    } finally {
      await cleanupTestStore(store.store_id, company.company_id);
    }
  });

  test("APIKEY-API-051: [P0] POST /api/v1/admin/api-keys/:keyId/revoke - should reject missing reason", async ({
    superadminApiRequest,
    prismaClient,
    superadminUser,
  }) => {
    // GIVEN: I am authenticated as a Super Admin
    // Create a fresh store to avoid conflicts
    const { company, store } = await createTestStoreWithCompany(
      prismaClient,
      superadminUser.user_id,
    );

    try {
      const createResponse = await superadminApiRequest.post(
        "/api/v1/admin/api-keys",
        {
          store_id: store.store_id,
          label: `Revoke No Reason Test ${Date.now()}`,
        },
      );
      expect(createResponse.status()).toBe(201);
      const createdKey = (await createResponse.json()).data;

      // WHEN: Revoking without reason
      const response = await superadminApiRequest.post(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}/revoke`,
        {},
      );

      // THEN: Request is rejected with 400 Bad Request
      expect(response.status(), "Expected 400 Bad Request status").toBe(400);

      // Cleanup - revoke with valid reason
      await superadminApiRequest.post(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}/revoke`,
        {
          reason: "ADMIN_ACTION",
          notes: "Test cleanup",
        },
      );
    } finally {
      await cleanupTestStore(store.store_id, company.company_id);
    }
  });

  test("APIKEY-API-052: [P1] POST /api/v1/admin/api-keys/:keyId/revoke - should reject invalid reason", async ({
    superadminApiRequest,
    prismaClient,
    superadminUser,
  }) => {
    // GIVEN: I am authenticated as a Super Admin
    // Create a fresh store to avoid conflicts
    const { company, store } = await createTestStoreWithCompany(
      prismaClient,
      superadminUser.user_id,
    );

    try {
      const createResponse = await superadminApiRequest.post(
        "/api/v1/admin/api-keys",
        {
          store_id: store.store_id,
          label: `Revoke Invalid Reason Test ${Date.now()}`,
        },
      );
      expect(createResponse.status()).toBe(201);
      const createdKey = (await createResponse.json()).data;

      // WHEN: Revoking with invalid reason
      const response = await superadminApiRequest.post(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}/revoke`,
        { reason: "INVALID_REASON" },
      );

      // THEN: Request is rejected with 400 Bad Request
      expect(response.status(), "Expected 400 Bad Request status").toBe(400);

      // Cleanup - revoke with valid reason
      await superadminApiRequest.post(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}/revoke`,
        {
          reason: "ADMIN_ACTION",
          notes: "Test cleanup",
        },
      );
    } finally {
      await cleanupTestStore(store.store_id, company.company_id);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SUSPEND/REACTIVATE API KEY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("APIKEY-API-060: [P1] POST /api/v1/admin/api-keys/:keyId/suspend - should suspend key", async ({
    superadminApiRequest,
    prismaClient,
    superadminUser,
  }) => {
    // GIVEN: I am authenticated as a Super Admin
    // Create a fresh store to avoid conflicts
    const { company, store } = await createTestStoreWithCompany(
      prismaClient,
      superadminUser.user_id,
    );

    try {
      const createResponse = await superadminApiRequest.post(
        "/api/v1/admin/api-keys",
        {
          store_id: store.store_id,
          label: `Suspend Test Key ${Date.now()}`,
        },
      );
      expect(createResponse.status()).toBe(201);
      const createdKey = (await createResponse.json()).data;

      // WHEN: Suspending the key
      const response = await superadminApiRequest.post(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}/suspend`,
        { reason: "Temporary suspension for testing" },
      );

      // THEN: Response is successful
      expect(response.status(), "Expected 200 OK status").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);

      // AND: Key is now suspended
      const detailsResponse = await superadminApiRequest.get(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}`,
      );
      const details = (await detailsResponse.json()).data;
      expect(details.status, "Status should be SUSPENDED").toBe("SUSPENDED");

      // Cleanup - revoke the key
      await superadminApiRequest.post(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}/revoke`,
        {
          reason: "ADMIN_ACTION",
          notes: "Test cleanup",
        },
      );
    } finally {
      await cleanupTestStore(store.store_id, company.company_id);
    }
  });

  test("APIKEY-API-061: [P1] POST /api/v1/admin/api-keys/:keyId/reactivate - should reactivate suspended key", async ({
    superadminApiRequest,
    prismaClient,
    superadminUser,
  }) => {
    // GIVEN: I am authenticated as a Super Admin
    // Create a fresh store to avoid conflicts
    const { company, store } = await createTestStoreWithCompany(
      prismaClient,
      superadminUser.user_id,
    );

    try {
      const createResponse = await superadminApiRequest.post(
        "/api/v1/admin/api-keys",
        {
          store_id: store.store_id,
          label: `Reactivate Test Key ${Date.now()}`,
        },
      );
      expect(createResponse.status()).toBe(201);
      const createdKey = (await createResponse.json()).data;

      // Suspend first
      const suspendResponse = await superadminApiRequest.post(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}/suspend`,
        { reason: "Pre-reactivation suspension" },
      );
      // Log suspend response for debugging if it fails
      if (suspendResponse.status() !== 200) {
        const suspendBody = await suspendResponse.json();
        console.error(
          `[APIKEY-API-061] Suspend failed with status ${suspendResponse.status()}:`,
          JSON.stringify(suspendBody, null, 2),
        );
      }
      expect(suspendResponse.status(), "Suspend should succeed").toBe(200);

      // WHEN: Reactivating the key
      const response = await superadminApiRequest.post(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}/reactivate`,
        {},
      );

      // THEN: Response is successful
      const body = await response.json();
      // Log error details for CI debugging if status is not 200
      if (response.status() !== 200) {
        console.error(
          `[APIKEY-API-061] Reactivate failed with status ${response.status()}:`,
          JSON.stringify(body, null, 2),
        );
      }
      expect(
        response.status(),
        `Expected 200 OK status, got: ${JSON.stringify(body)}`,
      ).toBe(200);
      expect(body.success, "Response should indicate success").toBe(true);

      // AND: Key is now active again
      const detailsResponse = await superadminApiRequest.get(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}`,
      );
      const details = (await detailsResponse.json()).data;
      expect(details.status, "Status should be ACTIVE").toBe("ACTIVE");

      // Cleanup - revoke the key
      await superadminApiRequest.post(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}/revoke`,
        {
          reason: "ADMIN_ACTION",
          notes: "Test cleanup",
        },
      );
    } finally {
      await cleanupTestStore(store.store_id, company.company_id);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIT TRAIL TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("APIKEY-API-070: [P1] GET /api/v1/admin/api-keys/:keyId/audit - should return audit trail", async ({
    superadminApiRequest,
    prismaClient,
    superadminUser,
  }) => {
    // GIVEN: I am authenticated as a Super Admin
    // Create a fresh store to avoid conflicts
    const { company, store } = await createTestStoreWithCompany(
      prismaClient,
      superadminUser.user_id,
    );

    try {
      const createResponse = await superadminApiRequest.post(
        "/api/v1/admin/api-keys",
        {
          store_id: store.store_id,
          label: `Audit Test Key ${Date.now()}`,
        },
      );
      expect(createResponse.status()).toBe(201);
      const createdKey = (await createResponse.json()).data;

      // WHEN: Requesting audit trail
      const response = await superadminApiRequest.get(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}/audit`,
      );

      // THEN: Response is successful
      expect(response.status(), "Expected 200 OK status").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(body.data.items, "Items should be an array").toBeTruthy();
      expect(Array.isArray(body.data.items), "Items should be an array").toBe(
        true,
      );

      // AND: At least the creation event should be present
      if (body.data.items.length > 0) {
        const event = body.data.items[0];
        expect(event).toHaveProperty("audit_event_id");
        expect(event).toHaveProperty("event_type");
        expect(event).toHaveProperty("created_at");
      }

      // Cleanup - revoke the key
      await superadminApiRequest.post(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}/revoke`,
        {
          reason: "ADMIN_ACTION",
          notes: "Test cleanup",
        },
      );
    } finally {
      await cleanupTestStore(store.store_id, company.company_id);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - AUTHENTICATION
  // ═══════════════════════════════════════════════════════════════════════════

  test("APIKEY-SEC-001: [P0] GET /api/v1/admin/api-keys - should reject unauthenticated request", async ({
    request,
    backendUrl,
  }) => {
    // GIVEN: No authentication token is provided

    // WHEN: Attempting to access API keys endpoint
    const response = await request.get(`${backendUrl}/api/v1/admin/api-keys`);

    // THEN: Request is rejected with 401 Unauthorized
    expect(response.status(), "Expected 401 Unauthorized status").toBe(401);
  });

  test("APIKEY-SEC-002: [P0] POST /api/v1/admin/api-keys - should reject unauthenticated request", async ({
    request,
    backendUrl,
  }) => {
    // GIVEN: No authentication token is provided

    // WHEN: Attempting to create API key
    const response = await request.post(`${backendUrl}/api/v1/admin/api-keys`, {
      data: { store_id: "00000000-0000-0000-0000-000000000000" },
    });

    // THEN: Request is rejected with 401 Unauthorized
    expect(response.status(), "Expected 401 Unauthorized status").toBe(401);
  });

  test("APIKEY-SEC-003: [P0] POST /api/v1/admin/api-keys/:keyId/revoke - should reject unauthenticated request", async ({
    request,
    backendUrl,
  }) => {
    // GIVEN: No authentication token is provided

    // WHEN: Attempting to revoke API key
    const response = await request.post(
      `${backendUrl}/api/v1/admin/api-keys/00000000-0000-0000-0000-000000000000/revoke`,
      { data: { reason: "ADMIN_ACTION" } },
    );

    // THEN: Request is rejected with 401 Unauthorized
    expect(response.status(), "Expected 401 Unauthorized status").toBe(401);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - AUTHORIZATION (Non-Superadmin Access Denial)
  // ═══════════════════════════════════════════════════════════════════════════

  test("APIKEY-SEC-010: [P0] GET /api/v1/admin/api-keys - should deny Store Manager access", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Store Manager (not Super Admin)

    // WHEN: Attempting to access API keys endpoint
    const response = await storeManagerApiRequest.get("/api/v1/admin/api-keys");

    // THEN: Access is denied with 403 Forbidden
    expect(response.status(), "Expected 403 Forbidden status").toBe(403);
  });

  test("APIKEY-SEC-011: [P0] GET /api/v1/admin/api-keys - should deny Corporate Admin access", async ({
    corporateAdminApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Corporate Admin (not Super Admin)

    // WHEN: Attempting to access API keys endpoint
    const response = await corporateAdminApiRequest.get(
      "/api/v1/admin/api-keys",
    );

    // THEN: Access is denied with 403 Forbidden
    expect(response.status(), "Expected 403 Forbidden status").toBe(403);
  });

  test("APIKEY-SEC-012: [P0] GET /api/v1/admin/api-keys - should deny Client Owner access", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Client Owner (not Super Admin)

    // WHEN: Attempting to access API keys endpoint
    const response = await clientUserApiRequest.get("/api/v1/admin/api-keys");

    // THEN: Access is denied with 403 Forbidden
    expect(response.status(), "Expected 403 Forbidden status").toBe(403);
  });

  test("APIKEY-SEC-013: [P0] POST /api/v1/admin/api-keys - should deny Store Manager from creating keys", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: I am authenticated as a Store Manager

    // WHEN: Attempting to create API key
    const response = await storeManagerApiRequest.post(
      "/api/v1/admin/api-keys",
      {
        store_id: storeManagerUser.store_id,
        label: "Unauthorized Key",
      },
    );

    // THEN: Access is denied with 403 Forbidden
    expect(response.status(), "Expected 403 Forbidden status").toBe(403);
  });

  test("APIKEY-SEC-014: [P0] POST /api/v1/admin/api-keys - should deny Corporate Admin from creating keys", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
  }) => {
    // GIVEN: I am authenticated as a Corporate Admin

    // WHEN: Attempting to create API key
    const response = await corporateAdminApiRequest.post(
      "/api/v1/admin/api-keys",
      {
        store_id: corporateAdminUser.store_id,
        label: "Unauthorized Key",
      },
    );

    // THEN: Access is denied with 403 Forbidden
    expect(response.status(), "Expected 403 Forbidden status").toBe(403);
  });

  test("APIKEY-SEC-015: [P0] POST /api/v1/admin/api-keys/:keyId/revoke - should deny Store Manager from revoking keys", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Store Manager

    // WHEN: Attempting to revoke an API key
    const response = await storeManagerApiRequest.post(
      "/api/v1/admin/api-keys/00000000-0000-0000-0000-000000000000/revoke",
      { reason: "ADMIN_ACTION" },
    );

    // THEN: Access is denied with 403 Forbidden
    expect(response.status(), "Expected 403 Forbidden status").toBe(403);
  });

  test("APIKEY-SEC-016: [P0] POST /api/v1/admin/api-keys/:keyId/rotate - should deny Client Owner from rotating keys", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Client Owner

    // WHEN: Attempting to rotate an API key
    const response = await clientUserApiRequest.post(
      "/api/v1/admin/api-keys/00000000-0000-0000-0000-000000000000/rotate",
      { grace_period_days: 7 },
    );

    // THEN: Access is denied with 403 Forbidden
    expect(response.status(), "Expected 403 Forbidden status").toBe(403);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INPUT VALIDATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("APIKEY-VAL-001: [P1] POST /api/v1/admin/api-keys - should reject invalid UUID for store_id", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Super Admin

    // WHEN: Creating API key with invalid store_id format
    const response = await superadminApiRequest.post("/api/v1/admin/api-keys", {
      store_id: "not-a-uuid",
      label: "Test Key",
    });

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request status").toBe(400);
  });

  test("APIKEY-VAL-002: [P1] POST /api/v1/admin/api-keys - should reject label exceeding max length", async ({
    superadminApiRequest,
    prismaClient,
    superadminUser,
  }) => {
    // GIVEN: I am authenticated as a Super Admin
    // Create a fresh store to ensure test isolation
    const { company, store } = await createTestStoreWithCompany(
      prismaClient,
      superadminUser.user_id,
    );

    try {
      // WHEN: Creating API key with label exceeding 100 characters
      const longLabel = "A".repeat(101);
      const response = await superadminApiRequest.post(
        "/api/v1/admin/api-keys",
        {
          store_id: store.store_id,
          label: longLabel,
        },
      );

      // THEN: Request is rejected with 400 Bad Request
      expect(response.status(), "Expected 400 Bad Request status").toBe(400);
    } finally {
      await cleanupTestStore(store.store_id, company.company_id);
    }
  });

  test("APIKEY-VAL-003: [P1] POST /api/v1/admin/api-keys/:keyId/rotate - should reject invalid grace_period_days", async ({
    superadminApiRequest,
    prismaClient,
    superadminUser,
  }) => {
    // GIVEN: I am authenticated as a Super Admin
    // Create a fresh store to avoid conflicts
    const { company, store } = await createTestStoreWithCompany(
      prismaClient,
      superadminUser.user_id,
    );

    try {
      const createResponse = await superadminApiRequest.post(
        "/api/v1/admin/api-keys",
        {
          store_id: store.store_id,
          label: `Validation Test Key ${Date.now()}`,
        },
      );
      expect(createResponse.status()).toBe(201);
      const createdKey = (await createResponse.json()).data;

      // WHEN: Rotating with invalid grace_period_days (negative)
      const response = await superadminApiRequest.post(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}/rotate`,
        { grace_period_days: -5 },
      );

      // THEN: Request is rejected with 400 Bad Request
      expect(response.status(), "Expected 400 Bad Request status").toBe(400);

      // Cleanup - revoke the key
      await superadminApiRequest.post(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}/revoke`,
        {
          reason: "ADMIN_ACTION",
          notes: "Test cleanup",
        },
      );
    } finally {
      await cleanupTestStore(store.store_id, company.company_id);
    }
  });

  test("APIKEY-VAL-004: [P1] PATCH /api/v1/admin/api-keys/:keyId - should reject invalid rate_limit_rpm", async ({
    superadminApiRequest,
    prismaClient,
    superadminUser,
  }) => {
    // GIVEN: I am authenticated as a Super Admin
    // Create a fresh store to avoid conflicts
    const { company, store } = await createTestStoreWithCompany(
      prismaClient,
      superadminUser.user_id,
    );

    try {
      const createResponse = await superadminApiRequest.post(
        "/api/v1/admin/api-keys",
        {
          store_id: store.store_id,
          label: `Rate Limit Validation Test ${Date.now()}`,
        },
      );
      expect(createResponse.status()).toBe(201);
      const createdKey = (await createResponse.json()).data;

      // WHEN: Updating with invalid rate_limit_rpm (negative)
      const response = await superadminApiRequest.patch(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}`,
        { rate_limit_rpm: -100 },
      );

      // THEN: Request is rejected with 400 Bad Request
      expect(response.status(), "Expected 400 Bad Request status").toBe(400);

      // Cleanup - revoke the key
      await superadminApiRequest.post(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}/revoke`,
        {
          reason: "ADMIN_ACTION",
          notes: "Test cleanup",
        },
      );
    } finally {
      await cleanupTestStore(store.store_id, company.company_id);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("APIKEY-EDGE-001: [P1] POST /api/v1/admin/api-keys/:keyId/revoke - should reject double revocation", async ({
    superadminApiRequest,
    prismaClient,
    superadminUser,
  }) => {
    // GIVEN: I am authenticated as a Super Admin
    // Create a fresh store to avoid conflicts
    const { company, store } = await createTestStoreWithCompany(
      prismaClient,
      superadminUser.user_id,
    );

    try {
      const createResponse = await superadminApiRequest.post(
        "/api/v1/admin/api-keys",
        {
          store_id: store.store_id,
          label: `Double Revoke Test ${Date.now()}`,
        },
      );
      expect(createResponse.status()).toBe(201);
      const createdKey = (await createResponse.json()).data;

      // Revoke once
      await superadminApiRequest.post(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}/revoke`,
        { reason: "ADMIN_ACTION", notes: "First revocation" },
      );

      // WHEN: Attempting to revoke again
      const response = await superadminApiRequest.post(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}/revoke`,
        { reason: "ADMIN_ACTION", notes: "Second revocation" },
      );

      // THEN: Request is rejected with 400 Bad Request (already revoked)
      expect(response.status(), "Expected 400 Bad Request status").toBe(400);
      const body = await response.json();
      expect(body.success, "Response should indicate failure").toBe(false);
    } finally {
      await cleanupTestStore(store.store_id, company.company_id);
    }
  });

  test("APIKEY-EDGE-002: [P1] POST /api/v1/admin/api-keys/:keyId/reactivate - should reject reactivating revoked key", async ({
    superadminApiRequest,
    prismaClient,
    superadminUser,
  }) => {
    // GIVEN: I am authenticated as a Super Admin
    // Create a fresh store to avoid conflicts
    const { company, store } = await createTestStoreWithCompany(
      prismaClient,
      superadminUser.user_id,
    );

    try {
      const createResponse = await superadminApiRequest.post(
        "/api/v1/admin/api-keys",
        {
          store_id: store.store_id,
          label: `Reactivate Revoked Test ${Date.now()}`,
        },
      );
      expect(createResponse.status()).toBe(201);
      const createdKey = (await createResponse.json()).data;

      // Revoke the key
      await superadminApiRequest.post(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}/revoke`,
        { reason: "ADMIN_ACTION", notes: "Revoked for test" },
      );

      // WHEN: Attempting to reactivate a revoked key
      const response = await superadminApiRequest.post(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}/reactivate`,
        {},
      );

      // THEN: Request is rejected with 400 Bad Request (cannot reactivate revoked keys)
      expect(response.status(), "Expected 400 Bad Request status").toBe(400);
    } finally {
      await cleanupTestStore(store.store_id, company.company_id);
    }
  });

  test("APIKEY-EDGE-003: [P1] POST /api/v1/admin/api-keys/:keyId/rotate - should reject rotating revoked key", async ({
    superadminApiRequest,
    prismaClient,
    superadminUser,
  }) => {
    // GIVEN: I am authenticated as a Super Admin
    // Create a fresh store to avoid conflicts
    const { company, store } = await createTestStoreWithCompany(
      prismaClient,
      superadminUser.user_id,
    );

    try {
      const createResponse = await superadminApiRequest.post(
        "/api/v1/admin/api-keys",
        {
          store_id: store.store_id,
          label: `Rotate Revoked Test ${Date.now()}`,
        },
      );
      expect(createResponse.status()).toBe(201);
      const createdKey = (await createResponse.json()).data;

      // Revoke the key
      await superadminApiRequest.post(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}/revoke`,
        { reason: "ADMIN_ACTION", notes: "Revoked for test" },
      );

      // WHEN: Attempting to rotate a revoked key
      const response = await superadminApiRequest.post(
        `/api/v1/admin/api-keys/${createdKey.api_key_id}/rotate`,
        { grace_period_days: 7 },
      );

      // THEN: Request is rejected with 400 Bad Request (cannot rotate revoked keys)
      expect(response.status(), "Expected 400 Bad Request status").toBe(400);
    } finally {
      await cleanupTestStore(store.store_id, company.company_id);
    }
  });
});
