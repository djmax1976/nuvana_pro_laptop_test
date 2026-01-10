/**
 * POS Integration UI API Tests
 *
 * Integration tests for the frontend API hooks used by POS integration UI.
 * Tests React Query hooks for API calls, error handling, and cache invalidation.
 *
 * Enterprise coding standards applied:
 * - SEC-014: INPUT_VALIDATION - UUID validation on client side
 * - API-003: ERROR_HANDLING - Graceful error handling
 * - DB-006: TENANT_ISOLATION - Store-level data isolation
 *
 * @module tests/api/pos-integration-ui.api.spec
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import type { POSSystemType } from "../../src/types/pos-integration";

test.describe("Phase5-API: POS Integration UI API Hooks", () => {
  // ===========================================================================
  // GET POS INTEGRATION - UI HOOK BEHAVIOR
  // ===========================================================================
  test.describe("usePOSIntegration Hook API Behavior", () => {
    test("5.1-API-001: [P0] Should return null for store without integration", async ({
      clientUserApiRequest,
      clientUser,
    }) => {
      // GIVEN: Store has no POS integration configured
      // WHEN: Fetching POS integration via the endpoint the hook uses
      const response = await clientUserApiRequest.get(
        `/api/stores/${clientUser.store_id}/pos-integration`,
      );

      // THEN: Should return 404 (hook converts to null)
      expect(response.status()).toBe(404);
    });

    test("5.1-API-002: [P0] Should return integration data when configured", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: Store has POS integration configured
      const integrationData = {
        pos_type: "GILBARCO_PASSPORT" as POSSystemType,
        connection_name: "Test Integration",
        host: "192.168.1.100",
        port: 8080,
        use_ssl: true,
        auth_type: "API_KEY",
        credentials: {
          type: "API_KEY",
          api_key: "test-key-123",
        },
        sync_enabled: true,
        sync_interval_minutes: 60,
        sync_departments: true,
        sync_tender_types: true,
        sync_tax_rates: true,
      };

      const createResponse = await clientUserApiRequest.post(
        `/api/stores/${clientUser.store_id}/pos-integration`,
        integrationData,
      );
      expect(createResponse.status()).toBe(201);
      const created = await createResponse.json();

      // WHEN: Fetching POS integration
      const response = await clientUserApiRequest.get(
        `/api/stores/${clientUser.store_id}/pos-integration`,
      );

      // THEN: Should return integration data
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.pos_type).toBe("GILBARCO_PASSPORT");
      expect(body.data.host).toBe("192.168.1.100");
      expect(body.data.sync_enabled).toBe(true);
      // Credentials should not be returned
      expect(body.data.auth_credentials).toBeUndefined();
      expect(body.data.has_credentials).toBe(true);

      // Cleanup
      await prismaClient.pOSIntegration.delete({
        where: { pos_integration_id: created.data.pos_integration_id },
      });
    });

    test("5.1-API-003: [P1] Should reject invalid UUID format (SEC-014)", async ({
      clientUserApiRequest,
    }) => {
      // GIVEN: Invalid store ID format
      // WHEN: Fetching with invalid UUID
      const response = await clientUserApiRequest.get(
        "/api/stores/invalid-uuid/pos-integration",
      );

      // THEN: Should return 400 validation error
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  // ===========================================================================
  // CREATE POS INTEGRATION - UI HOOK BEHAVIOR
  // ===========================================================================
  test.describe("useCreatePOSIntegration Hook API Behavior", () => {
    test("5.1-API-010: [P0] Should create file-based integration", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: Valid file-based integration data
      // SEC-014: All required schema fields must be provided
      const integrationData = {
        pos_type: "VERIFONE_COMMANDER",
        connection_name: "File-based Test",
        host: "localhost",
        port: 8080, // Required by schema
        auth_type: "NONE",
        credentials: { type: "NONE" as const }, // Required - credentials must match auth_type
        sync_enabled: true,
        sync_interval_minutes: 60,
        sync_departments: true,
        sync_tender_types: true,
        sync_tax_rates: true,
      };

      // WHEN: Creating integration
      const response = await clientUserApiRequest.post(
        `/api/stores/${clientUser.store_id}/pos-integration`,
        integrationData,
      );

      // THEN: Should create successfully
      expect(response.status()).toBe(201);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.pos_type).toBe("VERIFONE_COMMANDER");
      // Note: connection_mode is determined by the POS type, not a separate field in the response

      // Cleanup
      await prismaClient.pOSIntegration.delete({
        where: { pos_integration_id: body.data.pos_integration_id },
      });
    });

    test("5.1-API-011: [P0] Should create network-based integration", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: Valid network-based integration data
      const integrationData = {
        pos_type: "GILBARCO_PASSPORT",
        connection_name: "Network Test",
        host: "192.168.1.100",
        port: 5015,
        use_ssl: true,
        auth_type: "BASIC_AUTH",
        credentials: {
          type: "BASIC_AUTH",
          username: "admin",
          password: "password123",
        },
        sync_enabled: true,
        sync_interval_minutes: 30,
        sync_departments: true,
        sync_tender_types: true,
        sync_tax_rates: false,
      };

      // WHEN: Creating integration
      const response = await clientUserApiRequest.post(
        `/api/stores/${clientUser.store_id}/pos-integration`,
        integrationData,
      );

      // THEN: Should create successfully
      expect(response.status()).toBe(201);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.pos_type).toBe("GILBARCO_PASSPORT");
      expect(body.data.host).toBe("192.168.1.100");
      expect(body.data.port).toBe(5015);
      expect(body.data.use_ssl).toBe(true);

      // Cleanup
      await prismaClient.pOSIntegration.delete({
        where: { pos_integration_id: body.data.pos_integration_id },
      });
    });

    test("5.1-API-012: [P0] Should create cloud-based integration", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: Valid cloud-based integration data
      // SEC-014: All required schema fields must be provided
      const integrationData = {
        pos_type: "SQUARE_REST",
        connection_name: "Square Cloud",
        host: "api.square.com",
        port: 443, // Required by schema - HTTPS default
        auth_type: "API_KEY",
        credentials: {
          type: "API_KEY" as const,
          api_key: "sq0atp-xxxxxxxxxxxxxxx",
        },
        sync_enabled: true,
        sync_interval_minutes: 60,
        sync_departments: true,
        sync_tender_types: true,
        sync_tax_rates: true,
      };

      // WHEN: Creating integration
      const response = await clientUserApiRequest.post(
        `/api/stores/${clientUser.store_id}/pos-integration`,
        integrationData,
      );

      // THEN: Should create successfully
      expect(response.status()).toBe(201);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.pos_type).toBe("SQUARE_REST");
      expect(body.data.auth_type).toBe("API_KEY");
      expect(body.data.has_credentials).toBe(true);

      // Cleanup
      await prismaClient.pOSIntegration.delete({
        where: { pos_integration_id: body.data.pos_integration_id },
      });
    });

    test("5.1-API-013: [P0] Should create manual entry integration", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: Valid manual entry integration data
      // SEC-014: All required schema fields must be provided
      const integrationData = {
        pos_type: "MANUAL_ENTRY",
        connection_name: "Manual Entry Mode",
        host: "localhost",
        port: 8080, // Required by schema
        auth_type: "NONE",
        credentials: { type: "NONE" as const }, // Required - credentials must match auth_type
        sync_enabled: false,
        sync_departments: false,
        sync_tender_types: false,
        sync_tax_rates: false,
      };

      // WHEN: Creating integration
      const response = await clientUserApiRequest.post(
        `/api/stores/${clientUser.store_id}/pos-integration`,
        integrationData,
      );

      // THEN: Should create successfully
      expect(response.status()).toBe(201);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.pos_type).toBe("MANUAL_ENTRY");
      expect(body.data.sync_enabled).toBe(false);

      // Cleanup
      await prismaClient.pOSIntegration.delete({
        where: { pos_integration_id: body.data.pos_integration_id },
      });
    });

    test("5.1-API-014: [P1] Should reject duplicate integration", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: Integration already exists
      // SEC-014: All required schema fields must be provided
      const integrationData = {
        pos_type: "GILBARCO_PASSPORT",
        connection_name: "Test Integration",
        host: "192.168.1.100",
        port: 5015, // Required by schema
        auth_type: "NONE",
        credentials: { type: "NONE" as const }, // Required - credentials must match auth_type
      };

      const createResponse = await clientUserApiRequest.post(
        `/api/stores/${clientUser.store_id}/pos-integration`,
        integrationData,
      );
      expect(createResponse.status()).toBe(201);
      const created = await createResponse.json();

      // WHEN: Trying to create another
      const response = await clientUserApiRequest.post(
        `/api/stores/${clientUser.store_id}/pos-integration`,
        integrationData,
      );

      // THEN: Should fail with conflict
      expect(response.status()).toBe(409);
      const body = await response.json();
      expect(body.success).toBe(false);

      // Cleanup
      await prismaClient.pOSIntegration.delete({
        where: { pos_integration_id: created.data.pos_integration_id },
      });
    });
  });

  // ===========================================================================
  // TEST CONNECTION - UI HOOK BEHAVIOR
  // ===========================================================================
  test.describe("useTestPOSConnection Hook API Behavior", () => {
    // Increase timeout for connection tests since they may wait for network timeout
    test.setTimeout(60000);

    test("5.1-API-020: [P0] Should test connection with new config", async ({
      clientUserApiRequest,
      clientUser,
    }) => {
      // GIVEN: Connection config to test
      // Use localhost which will fail fast with "connection refused" rather than timeout
      const testConfig = {
        pos_type: "GILBARCO_PASSPORT",
        host: "localhost",
        port: 59999, // Unlikely to be in use, will fail fast
        use_ssl: false,
        auth_type: "NONE",
      };

      // WHEN: Testing connection
      const response = await clientUserApiRequest.post(
        `/api/stores/${clientUser.store_id}/pos-integration/test`,
        testConfig,
      );

      // THEN: Should return test result structure (connection will fail but API should respond)
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBeDefined();
      expect(body.data).toBeDefined();
      expect(body.data.connected).toBeDefined();
      expect(body.data.message).toBeDefined();
      // Connection will fail but that's expected - we're testing API behavior, not actual POS
      expect(body.data.connected).toBe(false);
    });

    test("5.1-API-021: [P1] Should test existing integration connection", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: Integration exists with localhost config for fast failure
      // SEC-014: All required schema fields must be provided
      const integrationData = {
        pos_type: "GILBARCO_PASSPORT",
        connection_name: "Test Integration",
        host: "localhost",
        port: 59998, // Unlikely to be in use, will fail fast
        auth_type: "NONE",
        credentials: { type: "NONE" as const }, // Required - credentials must match auth_type
      };

      const createResponse = await clientUserApiRequest.post(
        `/api/stores/${clientUser.store_id}/pos-integration`,
        integrationData,
      );
      expect(createResponse.status()).toBe(201);
      const created = await createResponse.json();

      // WHEN: Testing existing connection (no config in body)
      const response = await clientUserApiRequest.post(
        `/api/stores/${clientUser.store_id}/pos-integration/test`,
        {},
      );

      // THEN: Should test the existing configuration and return result structure
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.data.connected).toBeDefined();
      // Connection will fail but that's expected - we're testing API behavior
      expect(body.data.connected).toBe(false);

      // Cleanup
      await prismaClient.pOSIntegration.delete({
        where: { pos_integration_id: created.data.pos_integration_id },
      });
    });
  });

  // ===========================================================================
  // TRIGGER SYNC - UI HOOK BEHAVIOR
  // ===========================================================================
  test.describe("useTriggerPOSSync Hook API Behavior", () => {
    test("5.1-API-030: [P0] Should trigger manual sync", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: Integration exists
      // SEC-014: All required schema fields must be provided
      const integrationData = {
        pos_type: "VERIFONE_COMMANDER",
        connection_name: "Commander Test",
        host: "localhost",
        port: 8080, // Required by schema
        auth_type: "NONE",
        credentials: { type: "NONE" as const }, // Required - credentials must match auth_type
        sync_departments: true,
        sync_tender_types: true,
      };

      const createResponse = await clientUserApiRequest.post(
        `/api/stores/${clientUser.store_id}/pos-integration`,
        integrationData,
      );
      expect(createResponse.status()).toBe(201);
      const created = await createResponse.json();

      // WHEN: Triggering sync
      const response = await clientUserApiRequest.post(
        `/api/stores/${clientUser.store_id}/pos-integration/sync`,
        {
          sync_departments: true,
          sync_tender_types: true,
          sync_tax_rates: false,
        },
      );

      // THEN: Should return sync result
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.data).toBeDefined();
      expect(body.data.status).toBeDefined();
      expect(body.data.durationMs).toBeDefined();

      // Cleanup
      await prismaClient.pOSIntegration.delete({
        where: { pos_integration_id: created.data.pos_integration_id },
      });
    });

    test("5.1-API-031: [P1] Should fail sync when no integration exists", async ({
      clientUserApiRequest,
      clientUser,
    }) => {
      // GIVEN: No integration exists
      // WHEN: Trying to sync
      const response = await clientUserApiRequest.post(
        `/api/stores/${clientUser.store_id}/pos-integration/sync`,
        {},
      );

      // THEN: Should fail
      expect(response.status()).toBe(404);
    });
  });

  // ===========================================================================
  // SYNC LOGS - UI HOOK BEHAVIOR
  // ===========================================================================
  test.describe("usePOSSyncLogs Hook API Behavior", () => {
    test("5.1-API-040: [P0] Should return empty logs for new integration", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: Integration exists but no syncs yet
      // SEC-014: All required schema fields must be provided
      const integrationData = {
        pos_type: "GILBARCO_PASSPORT",
        connection_name: "Test Integration",
        host: "192.168.1.100",
        port: 5015, // Required by schema
        auth_type: "NONE",
        credentials: { type: "NONE" as const }, // Required - credentials must match auth_type
      };

      const createResponse = await clientUserApiRequest.post(
        `/api/stores/${clientUser.store_id}/pos-integration`,
        integrationData,
      );
      expect(createResponse.status()).toBe(201);
      const created = await createResponse.json();

      // WHEN: Fetching sync logs
      const response = await clientUserApiRequest.get(
        `/api/stores/${clientUser.store_id}/pos-integration/logs`,
      );

      // THEN: Should return empty array
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
      // API returns 'pagination' field, not 'meta'
      expect(body.pagination.total).toBe(0);

      // Cleanup
      await prismaClient.pOSIntegration.delete({
        where: { pos_integration_id: created.data.pos_integration_id },
      });
    });

    test("5.1-API-041: [P1] Should support pagination", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: Integration exists
      // SEC-014: All required schema fields must be provided
      const integrationData = {
        pos_type: "GILBARCO_PASSPORT",
        connection_name: "Test Integration",
        host: "192.168.1.100",
        port: 5015, // Required by schema
        auth_type: "NONE",
        credentials: { type: "NONE" as const }, // Required - credentials must match auth_type
      };

      const createResponse = await clientUserApiRequest.post(
        `/api/stores/${clientUser.store_id}/pos-integration`,
        integrationData,
      );
      expect(createResponse.status()).toBe(201);
      const created = await createResponse.json();

      // WHEN: Fetching with pagination params
      const response = await clientUserApiRequest.get(
        `/api/stores/${clientUser.store_id}/pos-integration/logs?limit=5&offset=0`,
      );

      // THEN: Should return paginated result
      expect(response.status()).toBe(200);
      const body = await response.json();
      // API returns 'pagination' field, not 'meta'
      expect(body.pagination.limit).toBe(5);
      expect(body.pagination.offset).toBe(0);
      expect(body.pagination.hasMore).toBeDefined();

      // Cleanup
      await prismaClient.pOSIntegration.delete({
        where: { pos_integration_id: created.data.pos_integration_id },
      });
    });
  });

  // ===========================================================================
  // UPDATE INTEGRATION - UI HOOK BEHAVIOR
  // ===========================================================================
  test.describe("useUpdatePOSIntegration Hook API Behavior", () => {
    test("5.1-API-050: [P0] Should update sync settings", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: Integration exists
      // SEC-014: All required schema fields must be provided
      const integrationData = {
        pos_type: "GILBARCO_PASSPORT",
        connection_name: "Test Integration",
        host: "192.168.1.100",
        port: 5015, // Required by schema
        auth_type: "NONE",
        credentials: { type: "NONE" as const }, // Required - credentials must match auth_type
        sync_enabled: true,
        sync_interval_minutes: 60,
      };

      const createResponse = await clientUserApiRequest.post(
        `/api/stores/${clientUser.store_id}/pos-integration`,
        integrationData,
      );
      expect(createResponse.status()).toBe(201);
      const created = await createResponse.json();

      // WHEN: Updating sync settings
      const response = await clientUserApiRequest.patch(
        `/api/stores/${clientUser.store_id}/pos-integration`,
        {
          sync_enabled: false,
          sync_interval_minutes: 30,
        },
      );

      // THEN: Should update successfully
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.sync_enabled).toBe(false);
      // Database field is sync_interval_mins (matches Prisma schema)
      expect(body.data.sync_interval_mins).toBe(30);

      // Cleanup
      await prismaClient.pOSIntegration.delete({
        where: { pos_integration_id: created.data.pos_integration_id },
      });
    });

    test("5.1-API-051: [P0] Should update connection config", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: Integration exists
      // SEC-014: All required schema fields must be provided
      const integrationData = {
        pos_type: "GILBARCO_PASSPORT",
        connection_name: "Test Integration",
        host: "192.168.1.100",
        port: 5015,
        auth_type: "NONE",
        credentials: { type: "NONE" as const }, // Required - credentials must match auth_type
      };

      const createResponse = await clientUserApiRequest.post(
        `/api/stores/${clientUser.store_id}/pos-integration`,
        integrationData,
      );
      expect(createResponse.status()).toBe(201);
      const created = await createResponse.json();

      // WHEN: Updating connection config
      const response = await clientUserApiRequest.patch(
        `/api/stores/${clientUser.store_id}/pos-integration`,
        {
          host: "192.168.1.200",
          port: 9000,
          use_ssl: true,
        },
      );

      // THEN: Should update successfully
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.data.host).toBe("192.168.1.200");
      expect(body.data.port).toBe(9000);
      expect(body.data.use_ssl).toBe(true);

      // Cleanup
      await prismaClient.pOSIntegration.delete({
        where: { pos_integration_id: created.data.pos_integration_id },
      });
    });
  });

  // ===========================================================================
  // DELETE INTEGRATION - UI HOOK BEHAVIOR
  // ===========================================================================
  test.describe("useDeletePOSIntegration Hook API Behavior", () => {
    test("5.1-API-060: [P0] Should deactivate integration", async ({
      clientUserApiRequest,
      clientUser,
      prismaClient,
    }) => {
      // GIVEN: Integration exists
      // SEC-014: All required schema fields must be provided
      const integrationData = {
        pos_type: "GILBARCO_PASSPORT",
        connection_name: "Test Integration",
        host: "192.168.1.100",
        port: 5015, // Required by schema
        auth_type: "NONE",
        credentials: { type: "NONE" as const }, // Required - credentials must match auth_type
      };

      const createResponse = await clientUserApiRequest.post(
        `/api/stores/${clientUser.store_id}/pos-integration`,
        integrationData,
      );
      expect(createResponse.status()).toBe(201);
      const created = await createResponse.json();

      // WHEN: Deleting integration
      const response = await clientUserApiRequest.delete(
        `/api/stores/${clientUser.store_id}/pos-integration`,
      );

      // THEN: Should delete/deactivate successfully
      expect(response.status()).toBe(200);

      // Verify it's deactivated (API returns 404 for inactive integrations)
      const getResponse = await clientUserApiRequest.get(
        `/api/stores/${clientUser.store_id}/pos-integration`,
      );
      expect(getResponse.status()).toBe(404);

      // Cleanup (soft-deleted, need to hard delete)
      try {
        await prismaClient.pOSIntegration.delete({
          where: { pos_integration_id: created.data.pos_integration_id },
        });
      } catch {
        // May already be deleted
      }
    });

    test("5.1-API-061: [P1] Should return 404 when deleting non-existent", async ({
      clientUserApiRequest,
      clientUser,
    }) => {
      // GIVEN: No integration exists
      // WHEN: Trying to delete
      const response = await clientUserApiRequest.delete(
        `/api/stores/${clientUser.store_id}/pos-integration`,
      );

      // THEN: Should return 404
      expect(response.status()).toBe(404);
    });
  });

  // ===========================================================================
  // AUTHORIZATION TESTS (DB-006: TENANT_ISOLATION)
  // ===========================================================================
  test.describe("Authorization & Tenant Isolation", () => {
    test("5.1-API-070: [P0] Should reject access to other store's integration", async ({
      clientUserApiRequest,
    }) => {
      // GIVEN: A different store ID that user doesn't have access to
      // DB-006: TENANT_ISOLATION - Users cannot access other store's data
      // Use a v4-formatted UUID that definitely doesn't exist in the database
      // Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx where y is 8, 9, a, or b
      const otherStoreId = "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d";

      // WHEN: Trying to access
      const response = await clientUserApiRequest.get(
        `/api/stores/${otherStoreId}/pos-integration`,
      );

      // THEN: Should be forbidden (403) or not found (404 if store doesn't exist)
      // API returns 403 if store exists but user lacks access, 404 if store doesn't exist
      expect([403, 404]).toContain(response.status());
    });

    test("5.1-API-071: [P0] Should reject unauthenticated requests", async ({
      apiRequest,
      clientUser,
    }) => {
      // GIVEN: No authentication
      // WHEN: Trying to access
      const response = await apiRequest.get(
        `/api/stores/${clientUser.store_id}/pos-integration`,
      );

      // THEN: Should be unauthorized
      expect(response.status()).toBe(401);
    });
  });
});
