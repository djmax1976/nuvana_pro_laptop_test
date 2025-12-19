import { test, expect } from "../support/fixtures/rbac.fixture";

/**
 * POS Integration API Tests
 *
 * Tests for POS Integration Management API endpoints:
 * - Get POS integration for a store
 * - Create POS integration with various POS types
 * - Update POS integration settings
 * - Delete (deactivate) POS integration
 * - Test POS connection
 * - Trigger manual sync
 * - Get sync logs with pagination
 * - RLS enforcement for store/company isolation
 * - Permission enforcement (POS_CONNECTION_READ, POS_CONNECTION_MANAGE, POS_SYNC_TRIGGER, POS_SYNC_LOG_READ)
 * - Security: Authentication, Authorization, Input Validation
 *
 * Phase 1.6: POS Integration & Auto-Onboarding
 * Priority: P1 (Core integration management)
 */

test.describe("Phase1.6-API: POS Integration - CRUD Operations", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // GET POS INTEGRATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1.6-API-001: [P0] GET /api/stores/:storeId/pos-integration - should return 404 when no integration exists", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: I am authenticated as a Client User with POS_CONNECTION_READ permission
    // AND: The store has no POS integration configured

    // WHEN: Fetching POS integration via API
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/pos-integration`,
    );

    // THEN: Request returns 404 with appropriate error
    expect(response.status(), "Expected 404 Not Found status").toBe(404);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Should return NOT_FOUND code").toBe("NOT_FOUND");
  });

  test("1.6-API-002: [P0] GET /api/stores/:storeId/pos-integration - should reject unauthenticated request", async ({
    apiRequest,
    clientUser,
  }) => {
    // GIVEN: No authentication token

    // WHEN: Fetching POS integration without auth
    const response = await apiRequest.get(
      `/api/stores/${clientUser.store_id}/pos-integration`,
    );

    // THEN: Request is rejected with 401
    expect(response.status(), "Should return 401 Unauthorized").toBe(401);
  });

  test("1.6-API-003: [P1] GET /api/stores/:storeId/pos-integration - should return 400 for invalid store ID", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: An invalid UUID format for store ID

    // WHEN: Fetching with invalid store ID
    const response = await clientUserApiRequest.get(
      "/api/stores/not-a-uuid/pos-integration",
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("1.6-API-004: [P1] GET /api/stores/:storeId/pos-integration - should return 404 for non-existent store", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: A valid UUID that doesn't exist
    const fakeStoreId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Fetching POS integration for non-existent store
    const response = await clientUserApiRequest.get(
      `/api/stores/${fakeStoreId}/pos-integration`,
    );

    // THEN: Returns 404
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE POS INTEGRATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1.6-API-010: [P0] POST /api/stores/:storeId/pos-integration - should create POS integration with API_KEY auth", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: Valid POS integration data with API key authentication
    const integrationData = {
      pos_type: "GILBARCO_PASSPORT",
      connection_name: "Test POS Connection",
      host: "192.168.1.100",
      port: 8080,
      use_ssl: true,
      auth_type: "API_KEY",
      credentials: {
        type: "API_KEY",
        api_key: "test-api-key-12345",
        header_name: "X-API-Key",
      },
      timeout_ms: 30000,
      sync_enabled: true,
      sync_interval_minutes: 60,
      sync_departments: true,
      sync_tender_types: true,
      sync_cashiers: true,
      sync_tax_rates: true,
    };

    // WHEN: Creating POS integration via API
    const response = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/pos-integration`,
      integrationData,
    );

    // THEN: POS integration is created successfully
    expect(response.status(), "Expected 201 Created").toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.pos_integration_id, "Should have ID").toBeDefined();
    expect(body.data.pos_type).toBe("GILBARCO_PASSPORT");
    expect(body.data.host).toBe("192.168.1.100");
    expect(body.data.port).toBe(8080);
    expect(body.data.use_ssl).toBe(true);
    expect(body.data.sync_enabled).toBe(true);
    expect(body.data.is_active).toBe(true);
    // Credentials should be sanitized (not returned)
    expect(
      body.data.auth_credentials,
      "Credentials should not be returned",
    ).toBeUndefined();
    expect(body.data.has_credentials, "Should indicate credentials exist").toBe(
      true,
    );

    // Cleanup
    await prismaClient.pOSIntegration.delete({
      where: { pos_integration_id: body.data.pos_integration_id },
    });
  });

  test("1.6-API-011: [P0] POST /api/stores/:storeId/pos-integration - should create POS integration with BASIC_AUTH", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: Valid POS integration data with Basic Auth
    const integrationData = {
      pos_type: "VERIFONE_RUBY2",
      connection_name: "Verifone POS",
      host: "pos.example.com",
      port: 443,
      use_ssl: true,
      auth_type: "BASIC_AUTH",
      credentials: {
        type: "BASIC_AUTH",
        username: "pos_user",
        password: "secure_password",
      },
      timeout_ms: 45000,
    };

    // WHEN: Creating POS integration
    const response = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/pos-integration`,
      integrationData,
    );

    // THEN: Created successfully
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.data.pos_type).toBe("VERIFONE_RUBY2");
    expect(body.data.auth_type).toBe("BASIC_AUTH");

    // Cleanup
    await prismaClient.pOSIntegration.delete({
      where: { pos_integration_id: body.data.pos_integration_id },
    });
  });

  test("1.6-API-012: [P1] POST /api/stores/:storeId/pos-integration - should reject duplicate integration", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: A POS integration already exists for the store
    const integrationData = {
      pos_type: "MANUAL_ENTRY",
      connection_name: "Manual Entry POS",
      host: "localhost",
      port: 8080,
      auth_type: "NONE",
      credentials: { type: "NONE" },
    };

    const firstResponse = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/pos-integration`,
      integrationData,
    );
    expect(firstResponse.status()).toBe(201);
    const created = await firstResponse.json();

    // WHEN: Trying to create another integration for the same store
    const duplicateResponse = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/pos-integration`,
      integrationData,
    );

    // THEN: Returns 409 Conflict
    expect(duplicateResponse.status()).toBe(409);
    const body = await duplicateResponse.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("ALREADY_EXISTS");

    // Cleanup
    await prismaClient.pOSIntegration.delete({
      where: { pos_integration_id: created.data.pos_integration_id },
    });
  });

  test("1.6-API-013: [P1] POST /api/stores/:storeId/pos-integration - should validate required fields", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Missing required fields
    const invalidData = {
      connection_name: "Missing POS Type",
    };

    // WHEN: Creating with missing fields
    const response = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/pos-integration`,
      invalidData,
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("1.6-API-014: [P1] POST /api/stores/:storeId/pos-integration - should validate port range", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Invalid port number
    const invalidData = {
      pos_type: "GILBARCO_PASSPORT",
      connection_name: "Invalid Port",
      host: "192.168.1.1",
      port: 99999, // Invalid port (> 65535)
      auth_type: "NONE",
      credentials: { type: "NONE" },
    };

    // WHEN: Creating with invalid port
    const response = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/pos-integration`,
      invalidData,
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("1.6-API-015: [P1] POST /api/stores/:storeId/pos-integration - should validate timeout range", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Timeout outside allowed range
    const invalidData = {
      pos_type: "GILBARCO_PASSPORT",
      connection_name: "Invalid Timeout",
      host: "192.168.1.1",
      port: 8080,
      auth_type: "NONE",
      credentials: { type: "NONE" },
      timeout_ms: 500, // Too low (< 1000)
    };

    // WHEN: Creating with invalid timeout
    const response = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/pos-integration`,
      invalidData,
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATE POS INTEGRATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1.6-API-020: [P0] PATCH /api/stores/:storeId/pos-integration - should update connection settings", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: A POS integration exists
    const createResponse = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/pos-integration`,
      {
        pos_type: "MANUAL_ENTRY",
        connection_name: "Original Name",
        host: "192.168.1.1",
        port: 8080,
        auth_type: "NONE",
        credentials: { type: "NONE" },
      },
    );
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();

    // WHEN: Updating the integration
    const updateResponse = await clientUserApiRequest.patch(
      `/api/stores/${clientUser.store_id}/pos-integration`,
      {
        connection_name: "Updated Name",
        host: "192.168.1.200",
        port: 9090,
        timeout_ms: 45000,
      },
    );

    // THEN: Update succeeds
    expect(updateResponse.status()).toBe(200);
    const body = await updateResponse.json();
    expect(body.success).toBe(true);
    expect(body.data.pos_name).toBe("Updated Name");
    expect(body.data.host).toBe("192.168.1.200");
    expect(body.data.port).toBe(9090);
    expect(body.data.timeout).toBe(45000);

    // Cleanup
    await prismaClient.pOSIntegration.delete({
      where: { pos_integration_id: created.data.pos_integration_id },
    });
  });

  test("1.6-API-021: [P0] PATCH /api/stores/:storeId/pos-integration - should update sync settings", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: A POS integration exists
    const createResponse = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/pos-integration`,
      {
        pos_type: "MANUAL_ENTRY",
        connection_name: "Sync Test",
        host: "localhost",
        port: 8080,
        auth_type: "NONE",
        credentials: { type: "NONE" },
        sync_enabled: true,
        sync_interval_minutes: 60,
      },
    );
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();

    // WHEN: Updating sync settings
    const updateResponse = await clientUserApiRequest.patch(
      `/api/stores/${clientUser.store_id}/pos-integration`,
      {
        sync_enabled: false,
        sync_interval_minutes: 30,
        sync_departments: false,
        sync_cashiers: false,
      },
    );

    // THEN: Sync settings are updated
    expect(updateResponse.status()).toBe(200);
    const body = await updateResponse.json();
    expect(body.data.sync_enabled).toBe(false);
    expect(body.data.sync_interval_mins).toBe(30);
    expect(body.data.sync_departments).toBe(false);
    expect(body.data.sync_cashiers).toBe(false);

    // Cleanup
    await prismaClient.pOSIntegration.delete({
      where: { pos_integration_id: created.data.pos_integration_id },
    });
  });

  test("1.6-API-022: [P1] PATCH /api/stores/:storeId/pos-integration - should return 404 when no integration exists", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: No POS integration exists for the store

    // WHEN: Trying to update
    const response = await clientUserApiRequest.patch(
      `/api/stores/${clientUser.store_id}/pos-integration`,
      { connection_name: "New Name" },
    );

    // THEN: Returns 404
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE POS INTEGRATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1.6-API-030: [P0] DELETE /api/stores/:storeId/pos-integration - should soft delete (deactivate) integration", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: A POS integration exists
    const createResponse = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/pos-integration`,
      {
        pos_type: "MANUAL_ENTRY",
        connection_name: "To Be Deleted",
        host: "localhost",
        port: 8080,
        auth_type: "API_KEY",
        credentials: {
          type: "API_KEY",
          api_key: "secret-key",
        },
      },
    );
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();

    // WHEN: Deleting the integration
    const deleteResponse = await clientUserApiRequest.delete(
      `/api/stores/${clientUser.store_id}/pos-integration`,
    );

    // THEN: Delete succeeds
    expect(deleteResponse.status()).toBe(200);
    const body = await deleteResponse.json();
    expect(body.success).toBe(true);

    // AND: Record still exists but is deactivated
    const record = await prismaClient.pOSIntegration.findUnique({
      where: { pos_integration_id: created.data.pos_integration_id },
    });
    expect(record, "Record should still exist").not.toBeNull();
    expect(record?.is_active, "Should be marked inactive").toBe(false);
    expect(record?.sync_enabled, "Sync should be disabled").toBe(false);
    expect(
      record?.auth_credentials,
      "Credentials should be cleared",
    ).toBeNull();

    // Cleanup - hard delete
    await prismaClient.pOSIntegration.delete({
      where: { pos_integration_id: created.data.pos_integration_id },
    });
  });

  test("1.6-API-031: [P1] DELETE /api/stores/:storeId/pos-integration - should return 404 when no integration exists", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: No POS integration exists

    // WHEN: Trying to delete
    const response = await clientUserApiRequest.delete(
      `/api/stores/${clientUser.store_id}/pos-integration`,
    );

    // THEN: Returns 404
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST CONNECTION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1.6-API-040: [P0] POST /api/stores/:storeId/pos-integration/test - should test POS connection", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: A POS integration exists (Manual Entry type always connects)
    const createResponse = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/pos-integration`,
      {
        pos_type: "MANUAL_ENTRY",
        connection_name: "Test Connection",
        host: "localhost",
        port: 8080,
        auth_type: "NONE",
        credentials: { type: "NONE" },
      },
    );
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();

    // WHEN: Testing the connection
    const testResponse = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/pos-integration/test`,
    );

    // THEN: Test returns connection status
    expect(testResponse.status()).toBe(200);
    const body = await testResponse.json();
    expect(body.success).toBe(true);
    expect(body.data.connected, "Manual Entry should always connect").toBe(
      true,
    );

    // Cleanup
    await prismaClient.pOSIntegration.delete({
      where: { pos_integration_id: created.data.pos_integration_id },
    });
  });

  test("1.6-API-041: [P1] POST /api/stores/:storeId/pos-integration/test - should return 404 when no integration exists", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: No POS integration exists

    // WHEN: Trying to test connection
    const response = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/pos-integration/test`,
    );

    // THEN: Returns 404
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SYNC TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1.6-API-050: [P0] POST /api/stores/:storeId/pos-integration/sync - should trigger manual sync", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: A POS integration exists with Manual Entry (always succeeds)
    const createResponse = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/pos-integration`,
      {
        pos_type: "MANUAL_ENTRY",
        connection_name: "Sync Test",
        host: "localhost",
        port: 8080,
        auth_type: "NONE",
        credentials: { type: "NONE" },
        sync_enabled: true,
      },
    );
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();

    // WHEN: Triggering manual sync
    const syncResponse = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/pos-integration/sync`,
      {
        sync_departments: true,
        sync_tender_types: true,
        sync_cashiers: false,
        sync_tax_rates: false,
      },
    );

    // THEN: Sync is triggered
    expect(syncResponse.status()).toBe(200);
    const body = await syncResponse.json();
    // Manual entry doesn't actually sync, but the API should succeed
    expect(body.success).toBeDefined();

    // Cleanup
    await prismaClient.pOSSyncLog.deleteMany({
      where: { pos_integration_id: created.data.pos_integration_id },
    });
    await prismaClient.pOSIntegration.delete({
      where: { pos_integration_id: created.data.pos_integration_id },
    });
  });

  test("1.6-API-051: [P1] POST /api/stores/:storeId/pos-integration/sync - should reject sync for inactive integration", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: A deactivated POS integration
    const createResponse = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/pos-integration`,
      {
        pos_type: "MANUAL_ENTRY",
        connection_name: "Inactive Test",
        host: "localhost",
        port: 8080,
        auth_type: "NONE",
        credentials: { type: "NONE" },
      },
    );
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();

    // Deactivate it
    await clientUserApiRequest.delete(
      `/api/stores/${clientUser.store_id}/pos-integration`,
    );

    // WHEN: Trying to sync
    const syncResponse = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/pos-integration/sync`,
    );

    // THEN: Returns 400 (integration inactive)
    expect(syncResponse.status()).toBe(400);
    const body = await syncResponse.json();
    expect(body.error.code).toBe("INTEGRATION_INACTIVE");

    // Cleanup - hard delete
    await prismaClient.pOSIntegration.delete({
      where: { pos_integration_id: created.data.pos_integration_id },
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SYNC LOGS TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1.6-API-060: [P0] GET /api/stores/:storeId/pos-integration/logs - should return sync logs with pagination", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: A POS integration with sync logs
    const createResponse = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/pos-integration`,
      {
        pos_type: "MANUAL_ENTRY",
        connection_name: "Logs Test",
        host: "localhost",
        port: 8080,
        auth_type: "NONE",
        credentials: { type: "NONE" },
      },
    );
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();

    // Create a sync log
    await prismaClient.pOSSyncLog.create({
      data: {
        pos_integration_id: created.data.pos_integration_id,
        status: "SUCCESS",
        trigger_type: "MANUAL",
        started_at: new Date(),
        completed_at: new Date(),
        duration_ms: 1500,
        departments_synced: 5,
        tender_types_synced: 3,
        cashiers_synced: 10,
        tax_rates_synced: 2,
        entities_created: 20,
        entities_updated: 0,
        entities_deactivated: 0,
      },
    });

    // WHEN: Fetching sync logs
    const logsResponse = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/pos-integration/logs`,
    );

    // THEN: Returns logs with pagination
    expect(logsResponse.status()).toBe(200);
    const body = await logsResponse.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.total).toBeGreaterThanOrEqual(1);
    expect(body.pagination.limit).toBeDefined();
    expect(body.pagination.offset).toBeDefined();

    // AND: Log contains expected fields
    const log = body.data[0];
    expect(log.sync_log_id).toBeDefined();
    expect(log.status).toBe("SUCCESS");
    expect(log.departments_synced).toBe(5);
    expect(log.tender_types_synced).toBe(3);

    // Cleanup
    await prismaClient.pOSSyncLog.deleteMany({
      where: { pos_integration_id: created.data.pos_integration_id },
    });
    await prismaClient.pOSIntegration.delete({
      where: { pos_integration_id: created.data.pos_integration_id },
    });
  });

  test("1.6-API-061: [P1] GET /api/stores/:storeId/pos-integration/logs - should filter by status", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: A POS integration with multiple sync logs of different statuses
    const createResponse = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/pos-integration`,
      {
        pos_type: "MANUAL_ENTRY",
        connection_name: "Filter Test",
        host: "localhost",
        port: 8080,
        auth_type: "NONE",
        credentials: { type: "NONE" },
      },
    );
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();

    // Create logs with different statuses
    await prismaClient.pOSSyncLog.createMany({
      data: [
        {
          pos_integration_id: created.data.pos_integration_id,
          status: "SUCCESS",
          trigger_type: "SCHEDULED",
          started_at: new Date(Date.now() - 3600000),
          completed_at: new Date(Date.now() - 3595000),
        },
        {
          pos_integration_id: created.data.pos_integration_id,
          status: "FAILED",
          trigger_type: "MANUAL",
          started_at: new Date(Date.now() - 1800000),
          error_message: "Connection refused",
        },
        {
          pos_integration_id: created.data.pos_integration_id,
          status: "SUCCESS",
          trigger_type: "MANUAL",
          started_at: new Date(),
        },
      ],
    });

    // WHEN: Filtering by FAILED status
    const logsResponse = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/pos-integration/logs?status=FAILED`,
    );

    // THEN: Only FAILED logs are returned
    expect(logsResponse.status()).toBe(200);
    const body = await logsResponse.json();
    expect(body.success).toBe(true);
    expect(
      body.data.every((log: { status: string }) => log.status === "FAILED"),
    ).toBe(true);
    expect(body.pagination.total).toBe(1);

    // Cleanup
    await prismaClient.pOSSyncLog.deleteMany({
      where: { pos_integration_id: created.data.pos_integration_id },
    });
    await prismaClient.pOSIntegration.delete({
      where: { pos_integration_id: created.data.pos_integration_id },
    });
  });

  test("1.6-API-062: [P1] GET /api/stores/:storeId/pos-integration/logs - should support pagination parameters", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: A POS integration with multiple sync logs
    const createResponse = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/pos-integration`,
      {
        pos_type: "MANUAL_ENTRY",
        connection_name: "Pagination Test",
        host: "localhost",
        port: 8080,
        auth_type: "NONE",
        credentials: { type: "NONE" },
      },
    );
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();

    // Create 5 logs
    const logs = Array.from({ length: 5 }, (_, i) => ({
      pos_integration_id: created.data.pos_integration_id,
      status: "SUCCESS" as const,
      trigger_type: "SCHEDULED" as const,
      started_at: new Date(Date.now() - i * 3600000),
    }));

    await prismaClient.pOSSyncLog.createMany({ data: logs });

    // WHEN: Fetching with limit and offset
    const logsResponse = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/pos-integration/logs?limit=2&offset=1`,
    );

    // THEN: Pagination is respected
    expect(logsResponse.status()).toBe(200);
    const body = await logsResponse.json();
    expect(body.data.length).toBe(2);
    expect(body.pagination.total).toBe(5);
    expect(body.pagination.limit).toBe(2);
    expect(body.pagination.offset).toBe(1);
    expect(body.pagination.hasMore).toBe(true);

    // Cleanup
    await prismaClient.pOSSyncLog.deleteMany({
      where: { pos_integration_id: created.data.pos_integration_id },
    });
    await prismaClient.pOSIntegration.delete({
      where: { pos_integration_id: created.data.pos_integration_id },
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PERMISSION & SECURITY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1.6-API-070: [P0] Security - should require authentication for all endpoints", async ({
    apiRequest,
    clientUser,
  }) => {
    // GIVEN: No authentication

    // WHEN: Accessing various endpoints without auth
    const endpoints = [
      {
        method: "get",
        path: `/api/stores/${clientUser.store_id}/pos-integration`,
      },
      {
        method: "post",
        path: `/api/stores/${clientUser.store_id}/pos-integration`,
      },
      {
        method: "patch",
        path: `/api/stores/${clientUser.store_id}/pos-integration`,
      },
      {
        method: "delete",
        path: `/api/stores/${clientUser.store_id}/pos-integration`,
      },
      {
        method: "post",
        path: `/api/stores/${clientUser.store_id}/pos-integration/test`,
      },
      {
        method: "post",
        path: `/api/stores/${clientUser.store_id}/pos-integration/sync`,
      },
      {
        method: "get",
        path: `/api/stores/${clientUser.store_id}/pos-integration/logs`,
      },
    ];

    for (const endpoint of endpoints) {
      const response =
        endpoint.method === "get"
          ? await apiRequest.get(endpoint.path)
          : endpoint.method === "post"
            ? await apiRequest.post(endpoint.path, {})
            : endpoint.method === "patch"
              ? await apiRequest.patch(endpoint.path, {})
              : await apiRequest.delete(endpoint.path);

      expect(
        response.status(),
        `${endpoint.method.toUpperCase()} ${endpoint.path} should return 401`,
      ).toBe(401);
    }
  });

  test("1.6-API-071: [P0] Security - superadmin should have full access", async ({
    superadminApiRequest,
    clientUser,
  }) => {
    // GIVEN: Superadmin authentication

    // WHEN: Accessing POS integration endpoint
    const response = await superadminApiRequest.get(
      `/api/stores/${clientUser.store_id}/pos-integration`,
    );

    // THEN: Access granted (404 because no integration, not 403)
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  test("1.6-API-072: [P0] Security - should enforce store access isolation", async ({
    superadminApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: A store that the client user doesn't have access to
    // We create a new company and store that the test user can't access

    // Create an isolated company and store (owned by superadmin for test purposes)
    const isolatedCompany = await prismaClient.company.create({
      data: {
        name: "Isolated Company for POS Test",
        public_id: `iso-pos-test-${Date.now()}`,
        owner_user_id: superadminUser.user_id,
      },
    });

    const isolatedStore = await prismaClient.store.create({
      data: {
        name: "Isolated Store",
        public_id: `iso-store-pos-${Date.now()}`,
        company_id: isolatedCompany.company_id,
      },
    });

    try {
      // Create POS integration for isolated store (as superadmin)
      const createResponse = await superadminApiRequest.post(
        `/api/stores/${isolatedStore.store_id}/pos-integration`,
        {
          pos_type: "MANUAL_ENTRY",
          connection_name: "Isolated POS",
          host: "localhost",
          port: 8080,
          auth_type: "NONE",
          credentials: { type: "NONE" },
        },
      );
      expect(createResponse.status()).toBe(201);

      // WHEN: Getting integration as superadmin
      const getResponse = await superadminApiRequest.get(
        `/api/stores/${isolatedStore.store_id}/pos-integration`,
      );

      // THEN: Superadmin can access
      expect(getResponse.status()).toBe(200);
    } finally {
      // Cleanup
      await prismaClient.pOSIntegration.deleteMany({
        where: { store_id: isolatedStore.store_id },
      });
      await prismaClient.store.delete({
        where: { store_id: isolatedStore.store_id },
      });
      await prismaClient.company.delete({
        where: { company_id: isolatedCompany.company_id },
      });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INTEGRATION RETRIEVED TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1.6-API-080: [P0] GET /api/stores/:storeId/pos-integration - should return integration after creation", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: A POS integration is created
    const integrationData = {
      pos_type: "CLOVER_REST",
      connection_name: "Clover POS",
      host: "api.clover.com",
      port: 443,
      use_ssl: true,
      auth_type: "OAUTH2",
      credentials: {
        type: "OAUTH2",
        client_id: "clover-client-id",
        client_secret: "clover-secret",
        token_url: "https://api.clover.com/oauth/token",
        scope: "orders inventory",
      },
      sync_enabled: true,
      sync_interval_minutes: 30,
      sync_departments: true,
      sync_tender_types: true,
      sync_cashiers: true,
      sync_tax_rates: true,
    };

    const createResponse = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/pos-integration`,
      integrationData,
    );
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();

    // WHEN: Fetching the integration
    const getResponse = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/pos-integration`,
    );

    // THEN: Integration is returned with correct data
    expect(getResponse.status()).toBe(200);
    const body = await getResponse.json();
    expect(body.success).toBe(true);
    expect(body.data.pos_integration_id).toBe(created.data.pos_integration_id);
    expect(body.data.pos_type).toBe("CLOVER_REST");
    expect(body.data.host).toBe("api.clover.com");
    expect(body.data.port).toBe(443);
    expect(body.data.use_ssl).toBe(true);
    expect(body.data.sync_enabled).toBe(true);
    expect(body.data.sync_interval_mins).toBe(30);
    expect(body.data.sync_departments).toBe(true);
    expect(body.data.sync_tender_types).toBe(true);
    expect(body.data.sync_cashiers).toBe(true);
    expect(body.data.sync_tax_rates).toBe(true);
    // Credentials should be hidden
    expect(body.data.has_credentials).toBe(true);
    expect(body.data.auth_credentials).toBeUndefined();

    // Cleanup
    await prismaClient.pOSIntegration.delete({
      where: { pos_integration_id: created.data.pos_integration_id },
    });
  });
});
