import { test, expect } from "../support/fixtures/rbac.fixture";

/**
 * NAXML File Management API Tests
 *
 * Tests for NAXML file processing and file watcher API endpoints:
 * - List NAXML file logs with filtering and pagination
 * - Get specific file log details
 * - Manual file import
 * - Export departments/tender-types/tax-rates to NAXML format
 * - File watcher configuration CRUD
 * - File watcher start/stop control
 * - RLS enforcement for store/company isolation
 * - Permission enforcement (NAXML_FILE_READ, NAXML_FILE_IMPORT, NAXML_FILE_EXPORT, NAXML_WATCHER_READ, NAXML_WATCHER_MANAGE)
 * - Security: Authentication, Authorization, Input Validation
 *
 * Phase 1: NAXML Core Infrastructure
 */

test.describe("Phase1-API: NAXML File Logs - List and Query", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // GET NAXML FILE LOGS TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1-NAXML-API-001: [P0] GET /api/stores/:storeId/naxml/files - should return empty array when no file logs exist", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: I am authenticated as a Client User with NAXML_FILE_READ permission
    // AND: The store has no NAXML file logs

    // WHEN: Fetching NAXML file logs via API
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/naxml/files`,
    );

    // THEN: Request succeeds with empty array
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(Array.isArray(body.data), "Data should be an array").toBe(true);
    expect(body.pagination, "Should include pagination").toBeDefined();
    expect(body.pagination.total).toBe(0);
  });

  test("1-NAXML-API-002: [P0] GET /api/stores/:storeId/naxml/files - should reject unauthenticated request", async ({
    apiRequest,
    clientUser,
  }) => {
    // GIVEN: No authentication token

    // WHEN: Fetching NAXML file logs without auth
    const response = await apiRequest.get(
      `/api/stores/${clientUser.store_id}/naxml/files`,
    );

    // THEN: Request is rejected with 401
    expect(response.status(), "Should return 401 Unauthorized").toBe(401);
  });

  test("1-NAXML-API-003: [P1] GET /api/stores/:storeId/naxml/files - should return 400 for invalid store ID", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: An invalid UUID format for store ID

    // WHEN: Fetching with invalid store ID
    const response = await clientUserApiRequest.get(
      "/api/stores/not-a-uuid/naxml/files",
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("1-NAXML-API-004: [P1] GET /api/stores/:storeId/naxml/files - should return 404 for non-existent store", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: A valid UUID that doesn't exist
    const fakeStoreId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Fetching NAXML file logs for non-existent store
    const response = await clientUserApiRequest.get(
      `/api/stores/${fakeStoreId}/naxml/files`,
    );

    // THEN: Returns 404
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  test("1-NAXML-API-005: [P1] GET /api/stores/:storeId/naxml/files - should support filtering by status", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Query filter for status

    // WHEN: Fetching NAXML file logs with status filter
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/naxml/files?status=SUCCESS`,
    );

    // THEN: Request succeeds
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test("1-NAXML-API-006: [P1] GET /api/stores/:storeId/naxml/files - should support filtering by file_type", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Query filter for file type

    // WHEN: Fetching NAXML file logs with file type filter
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/naxml/files?file_type=TransactionDocument`,
    );

    // THEN: Request succeeds
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test("1-NAXML-API-007: [P1] GET /api/stores/:storeId/naxml/files - should support filtering by direction", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Query filter for direction

    // WHEN: Fetching NAXML file logs with direction filter
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/naxml/files?direction=IMPORT`,
    );

    // THEN: Request succeeds
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test("1-NAXML-API-008: [P1] GET /api/stores/:storeId/naxml/files - should support pagination parameters", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Pagination parameters

    // WHEN: Fetching NAXML file logs with pagination
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/naxml/files?limit=10&offset=0`,
    );

    // THEN: Request succeeds with pagination info
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.pagination.limit).toBe(10);
    expect(body.pagination.offset).toBe(0);
  });

  test("1-NAXML-API-009: [P1] GET /api/stores/:storeId/naxml/files - should support date range filtering", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Date range parameters
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 7);
    const toDate = new Date();

    // WHEN: Fetching NAXML file logs with date filters
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/naxml/files?from_date=${fromDate.toISOString()}&to_date=${toDate.toISOString()}`,
    );

    // THEN: Request succeeds
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET SPECIFIC FILE LOG TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1-NAXML-API-010: [P1] GET /api/stores/:storeId/naxml/files/:fileLogId - should return 404 for non-existent file log", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A valid UUID that doesn't exist as a file log ID
    const fakeFileLogId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Fetching non-existent file log
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/naxml/files/${fakeFileLogId}`,
    );

    // THEN: Returns 404
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  test("1-NAXML-API-011: [P1] GET /api/stores/:storeId/naxml/files/:fileLogId - should return 400 for invalid file log ID", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: An invalid UUID format for file log ID

    // WHEN: Fetching with invalid file log ID
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/naxml/files/not-a-uuid`,
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});

test.describe("Phase1-API: NAXML File Import", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // MANUAL FILE IMPORT TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1-NAXML-API-020: [P1] POST /api/stores/:storeId/naxml/files/import - should require POS integration", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: I am authenticated as a Client User with NAXML_FILE_IMPORT permission
    // AND: The store does not have POS integration configured

    // WHEN: Attempting to import a file
    const response = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/files/import`,
      { file_path: "/path/to/file.xml" },
    );

    // THEN: Returns 404 (no POS integration)
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("POS integration");
  });

  test("1-NAXML-API-021: [P0] POST /api/stores/:storeId/naxml/files/import - should reject unauthenticated request", async ({
    apiRequest,
    clientUser,
  }) => {
    // GIVEN: No authentication token

    // WHEN: Attempting to import without auth
    const response = await apiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/files/import`,
      { file_path: "/path/to/file.xml" },
    );

    // THEN: Request is rejected with 401
    expect(response.status(), "Should return 401 Unauthorized").toBe(401);
  });

  test("1-NAXML-API-022: [P1] POST /api/stores/:storeId/naxml/files/import - should reject path traversal attempts", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A file path with path traversal characters

    // WHEN: Attempting to import with path traversal
    const response = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/files/import`,
      { file_path: "../../../etc/passwd" },
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("1-NAXML-API-023: [P1] POST /api/stores/:storeId/naxml/files/import - should reject home directory references", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A file path with home directory reference

    // WHEN: Attempting to import with home directory reference
    const response = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/files/import`,
      { file_path: "~/secret/file.xml" },
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("1-NAXML-API-024: [P1] POST /api/stores/:storeId/naxml/files/import - should validate required fields", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Empty request body

    // WHEN: Attempting to import without file_path
    const response = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/files/import`,
      {},
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});

test.describe("Phase1-API: NAXML Export", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // DEPARTMENT EXPORT TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1-NAXML-API-030: [P1] POST /api/stores/:storeId/naxml/export/departments - should require POS integration", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: I am authenticated as a Client User with NAXML_FILE_EXPORT permission
    // AND: The store does not have POS integration configured

    // WHEN: Attempting to export departments
    const response = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/export/departments`,
      { maintenance_type: "Full" },
    );

    // THEN: Returns 404 (no POS integration)
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("POS integration");
  });

  test("1-NAXML-API-031: [P0] POST /api/stores/:storeId/naxml/export/departments - should reject unauthenticated request", async ({
    apiRequest,
    clientUser,
  }) => {
    // GIVEN: No authentication token

    // WHEN: Attempting to export without auth
    const response = await apiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/export/departments`,
      { maintenance_type: "Full" },
    );

    // THEN: Request is rejected with 401
    expect(response.status(), "Should return 401 Unauthorized").toBe(401);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TENDER TYPE EXPORT TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1-NAXML-API-040: [P1] POST /api/stores/:storeId/naxml/export/tender-types - should require POS integration", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: I am authenticated as a Client User with NAXML_FILE_EXPORT permission
    // AND: The store does not have POS integration configured

    // WHEN: Attempting to export tender types
    const response = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/export/tender-types`,
      { maintenance_type: "Full" },
    );

    // THEN: Returns 404 (no POS integration)
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("POS integration");
  });

  test("1-NAXML-API-041: [P0] POST /api/stores/:storeId/naxml/export/tender-types - should reject unauthenticated request", async ({
    apiRequest,
    clientUser,
  }) => {
    // GIVEN: No authentication token

    // WHEN: Attempting to export without auth
    const response = await apiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/export/tender-types`,
      { maintenance_type: "Full" },
    );

    // THEN: Request is rejected with 401
    expect(response.status(), "Should return 401 Unauthorized").toBe(401);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TAX RATE EXPORT TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1-NAXML-API-050: [P1] POST /api/stores/:storeId/naxml/export/tax-rates - should require POS integration", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: I am authenticated as a Client User with NAXML_FILE_EXPORT permission
    // AND: The store does not have POS integration configured

    // WHEN: Attempting to export tax rates
    const response = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/export/tax-rates`,
      { maintenance_type: "Full" },
    );

    // THEN: Returns 404 (no POS integration)
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("POS integration");
  });

  test("1-NAXML-API-051: [P0] POST /api/stores/:storeId/naxml/export/tax-rates - should reject unauthenticated request", async ({
    apiRequest,
    clientUser,
  }) => {
    // GIVEN: No authentication token

    // WHEN: Attempting to export without auth
    const response = await apiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/export/tax-rates`,
      { maintenance_type: "Full" },
    );

    // THEN: Request is rejected with 401
    expect(response.status(), "Should return 401 Unauthorized").toBe(401);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PRICE BOOK EXPORT TESTS (NOT IMPLEMENTED)
  // ═══════════════════════════════════════════════════════════════════════════

  test("1-NAXML-API-060: [P2] POST /api/stores/:storeId/naxml/export/price-book - should return 501 Not Implemented", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: I am authenticated as a Client User with NAXML_FILE_EXPORT permission
    // Note: Price book export is not yet implemented (requires item master from Phase 2)

    // WHEN: Attempting to export price book
    const response = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/export/price-book`,
      { maintenance_type: "Full" },
    );

    // THEN: Returns 404 (no POS integration) or 501 (not implemented)
    // The first check to fail will be POS integration
    expect([404, 501]).toContain(response.status());
    const body = await response.json();
    expect(body.success).toBe(false);
  });
});

test.describe("Phase1-API: NAXML File Watcher Configuration", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // GET WATCHER CONFIG TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1-NAXML-API-070: [P0] GET /api/stores/:storeId/naxml/watcher - should return not configured for new store", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: I am authenticated as a Client User with NAXML_WATCHER_READ permission
    // AND: The store has no file watcher configured

    // WHEN: Fetching watcher configuration
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/naxml/watcher`,
    );

    // THEN: Request succeeds with not configured status
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.configured, "Should indicate not configured").toBe(false);
    expect(body.data.is_running, "Should indicate not running").toBe(false);
  });

  test("1-NAXML-API-071: [P0] GET /api/stores/:storeId/naxml/watcher - should reject unauthenticated request", async ({
    apiRequest,
    clientUser,
  }) => {
    // GIVEN: No authentication token

    // WHEN: Fetching watcher config without auth
    const response = await apiRequest.get(
      `/api/stores/${clientUser.store_id}/naxml/watcher`,
    );

    // THEN: Request is rejected with 401
    expect(response.status(), "Should return 401 Unauthorized").toBe(401);
  });

  test("1-NAXML-API-072: [P1] GET /api/stores/:storeId/naxml/watcher - should return 404 for non-existent store", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: A valid UUID that doesn't exist
    const fakeStoreId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Fetching watcher config for non-existent store
    const response = await clientUserApiRequest.get(
      `/api/stores/${fakeStoreId}/naxml/watcher`,
    );

    // THEN: Returns 404
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE WATCHER CONFIG TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1-NAXML-API-080: [P0] POST /api/stores/:storeId/naxml/watcher - should reject unauthenticated request", async ({
    apiRequest,
    clientUser,
  }) => {
    // GIVEN: No authentication token

    // WHEN: Creating watcher config without auth
    const response = await apiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/watcher`,
      { watch_path: "/data/inbox" },
    );

    // THEN: Request is rejected with 401
    expect(response.status(), "Should return 401 Unauthorized").toBe(401);
  });

  test("1-NAXML-API-081: [P1] POST /api/stores/:storeId/naxml/watcher - should validate watch_path is required", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Empty request body

    // WHEN: Creating watcher config without watch_path
    const response = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/watcher`,
      {},
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("1-NAXML-API-082: [P1] POST /api/stores/:storeId/naxml/watcher - should reject path traversal in watch_path", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A watch_path with path traversal characters

    // WHEN: Creating watcher config with path traversal
    const response = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/watcher`,
      { watch_path: "../../../etc" },
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("1-NAXML-API-083: [P1] POST /api/stores/:storeId/naxml/watcher - should reject home directory reference", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A watch_path with home directory reference

    // WHEN: Creating watcher config with home directory reference
    const response = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/watcher`,
      { watch_path: "~/data" },
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("1-NAXML-API-084: [P1] POST /api/stores/:storeId/naxml/watcher - should validate poll_interval_seconds range", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A poll_interval_seconds that is too small

    // WHEN: Creating watcher config with invalid poll interval
    const response = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/watcher`,
      { watch_path: "/data/inbox", poll_interval_seconds: 5 },
    );

    // THEN: Returns 400 validation error (minimum is 10 seconds)
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("1-NAXML-API-085: [P1] POST /api/stores/:storeId/naxml/watcher - should validate file_patterns", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Invalid file patterns with special characters

    // WHEN: Creating watcher config with invalid patterns
    const response = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/watcher`,
      { watch_path: "/data/inbox", file_patterns: ["<script>"] },
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATE WATCHER CONFIG TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1-NAXML-API-090: [P1] PATCH /api/stores/:storeId/naxml/watcher - should return 404 when config does not exist", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: I am authenticated as a Client User with NAXML_WATCHER_MANAGE permission
    // AND: The store has no file watcher configured

    // WHEN: Attempting to update non-existent config
    const response = await clientUserApiRequest.patch(
      `/api/stores/${clientUser.store_id}/naxml/watcher`,
      { is_active: false },
    );

    // THEN: Returns 404
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  test("1-NAXML-API-091: [P0] PATCH /api/stores/:storeId/naxml/watcher - should reject unauthenticated request", async ({
    apiRequest,
    clientUser,
  }) => {
    // GIVEN: No authentication token

    // WHEN: Updating watcher config without auth
    const response = await apiRequest.patch(
      `/api/stores/${clientUser.store_id}/naxml/watcher`,
      { is_active: false },
    );

    // THEN: Request is rejected with 401
    expect(response.status(), "Should return 401 Unauthorized").toBe(401);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // WATCHER START/STOP TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1-NAXML-API-100: [P1] POST /api/stores/:storeId/naxml/watcher/start - should return 404 when not configured", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: I am authenticated as a Client User with NAXML_WATCHER_MANAGE permission
    // AND: The store has no file watcher configured

    // WHEN: Attempting to start watcher
    const response = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/watcher/start`,
      {},
    );

    // THEN: Returns 404 (not configured)
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_CONFIGURED");
  });

  test("1-NAXML-API-101: [P0] POST /api/stores/:storeId/naxml/watcher/start - should reject unauthenticated request", async ({
    apiRequest,
    clientUser,
  }) => {
    // GIVEN: No authentication token

    // WHEN: Starting watcher without auth
    const response = await apiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/watcher/start`,
      {},
    );

    // THEN: Request is rejected with 401
    expect(response.status(), "Should return 401 Unauthorized").toBe(401);
  });

  test("1-NAXML-API-110: [P1] POST /api/stores/:storeId/naxml/watcher/stop - should return 400 when not running", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: I am authenticated as a Client User with NAXML_WATCHER_MANAGE permission
    // AND: The store has no file watcher running

    // WHEN: Attempting to stop watcher
    const response = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/watcher/stop`,
      {},
    );

    // THEN: Returns 400 (not running)
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_RUNNING");
  });

  test("1-NAXML-API-111: [P0] POST /api/stores/:storeId/naxml/watcher/stop - should reject unauthenticated request", async ({
    apiRequest,
    clientUser,
  }) => {
    // GIVEN: No authentication token

    // WHEN: Stopping watcher without auth
    const response = await apiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/watcher/stop`,
      {},
    );

    // THEN: Request is rejected with 401
    expect(response.status(), "Should return 401 Unauthorized").toBe(401);
  });
});

test.describe("Phase1-API: NAXML Security & Isolation", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // RLS / TENANT ISOLATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1-NAXML-API-120: [P0] RLS - Client User should only access their own store's NAXML data", async ({
    clientUserApiRequest,
    anotherStoreManagerUser,
  }) => {
    // GIVEN: I am authenticated as a Client User for Store A
    // AND: There is a separate Store B that I don't have access to

    // WHEN: Attempting to access Store B's NAXML files
    const otherStoreId = anotherStoreManagerUser.store_id;
    const response = await clientUserApiRequest.get(
      `/api/stores/${otherStoreId}/naxml/files`,
    );

    // THEN: Request is rejected with 403 Forbidden
    expect(
      response.status(),
      "Should return 403 Forbidden for cross-tenant access",
    ).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(["FORBIDDEN", "PERMISSION_DENIED"]).toContain(body.error.code);
  });

  test("1-NAXML-API-121: [P0] RLS - System Admin should access any store's NAXML data", async ({
    superadminApiRequest,
    clientUser,
  }) => {
    // GIVEN: I am authenticated as a System Admin

    // WHEN: Accessing any store's NAXML files
    const response = await superadminApiRequest.get(
      `/api/stores/${clientUser.store_id}/naxml/files`,
    );

    // THEN: Request succeeds
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test("1-NAXML-API-122: [P0] RLS - Client User should not access watcher config of another store", async ({
    clientUserApiRequest,
    anotherStoreManagerUser,
  }) => {
    // GIVEN: I am authenticated as a Client User for Store A
    // AND: There is a separate Store B that I don't have access to

    // WHEN: Attempting to access Store B's watcher config
    const otherStoreId = anotherStoreManagerUser.store_id;
    const response = await clientUserApiRequest.get(
      `/api/stores/${otherStoreId}/naxml/watcher`,
    );

    // THEN: Request is rejected with 403 Forbidden
    expect(
      response.status(),
      "Should return 403 Forbidden for cross-tenant access",
    ).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INPUT VALIDATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1-NAXML-API-130: [P1] Validation - should reject invalid date format in from_date", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Invalid date format

    // WHEN: Fetching with invalid date
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/naxml/files?from_date=not-a-date`,
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("1-NAXML-API-131: [P1] Validation - should reject invalid limit value", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Invalid limit value (too large)

    // WHEN: Fetching with invalid limit
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/naxml/files?limit=999`,
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("1-NAXML-API-132: [P1] Validation - should reject negative offset value", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Negative offset value

    // WHEN: Fetching with negative offset
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/naxml/files?offset=-1`,
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("1-NAXML-API-133: [P1] Validation - should reject invalid status enum value", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Invalid status enum value

    // WHEN: Fetching with invalid status
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/naxml/files?status=INVALID_STATUS`,
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("1-NAXML-API-134: [P1] Validation - should reject invalid file_type enum value", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Invalid file_type enum value

    // WHEN: Fetching with invalid file_type
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/naxml/files?file_type=InvalidType`,
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("1-NAXML-API-135: [P1] Validation - should reject invalid direction enum value", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Invalid direction enum value

    // WHEN: Fetching with invalid direction
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/naxml/files?direction=INVALID`,
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});
