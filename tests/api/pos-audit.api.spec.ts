import { test, expect } from "../support/fixtures/rbac.fixture";

/**
 * POS Audit API Tests
 *
 * Tests for POS Data Exchange Audit API endpoints:
 * - Get audit records for a store
 * - Get audit summary for a store
 * - Get specific audit record
 * - Admin endpoints for system-wide queries
 * - PII access report generation
 * - Retention cleanup operations
 * - RLS enforcement for store/company isolation
 * - Permission enforcement (POS_AUDIT_READ, ADMIN_AUDIT_VIEW)
 * - Security: Authentication, Authorization, Input Validation
 *
 * Phase 0: Data Exchange Audit Infrastructure
 * Priority: P0 (Critical for regulatory compliance)
 */

test.describe("Phase0-API: POS Audit - Store Level Endpoints", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // GET POS AUDIT RECORDS TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("0-AUDIT-API-001: [P0] GET /api/stores/:storeId/pos-audit - should return empty array when no audit records exist", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: I am authenticated as a Client User with POS_AUDIT_READ permission
    // AND: The store has no audit records

    // WHEN: Fetching POS audit records via API
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/pos-audit`,
    );

    // THEN: Request succeeds with empty array
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(Array.isArray(body.data), "Data should be an array").toBe(true);
    expect(body.pagination, "Should include pagination").toBeDefined();
  });

  test("0-AUDIT-API-002: [P0] GET /api/stores/:storeId/pos-audit - should reject unauthenticated request", async ({
    apiRequest,
    clientUser,
  }) => {
    // GIVEN: No authentication token

    // WHEN: Fetching POS audit records without auth
    const response = await apiRequest.get(
      `/api/stores/${clientUser.store_id}/pos-audit`,
    );

    // THEN: Request is rejected with 401
    expect(response.status(), "Should return 401 Unauthorized").toBe(401);
  });

  test("0-AUDIT-API-003: [P1] GET /api/stores/:storeId/pos-audit - should return 400 for invalid store ID", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: An invalid UUID format for store ID

    // WHEN: Fetching with invalid store ID
    const response = await clientUserApiRequest.get(
      "/api/stores/not-a-uuid/pos-audit",
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("0-AUDIT-API-004: [P1] GET /api/stores/:storeId/pos-audit - should return 404 for non-existent store", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: A valid UUID that doesn't exist
    const fakeStoreId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Fetching POS audit records for non-existent store
    const response = await clientUserApiRequest.get(
      `/api/stores/${fakeStoreId}/pos-audit`,
    );

    // THEN: Returns 404
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  test("0-AUDIT-API-005: [P1] GET /api/stores/:storeId/pos-audit - should support query filtering by dataCategory", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Query filter for data category

    // WHEN: Fetching POS audit records with filter
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/pos-audit?dataCategory=TRANSACTION`,
    );

    // THEN: Request succeeds
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test("0-AUDIT-API-006: [P1] GET /api/stores/:storeId/pos-audit - should support pagination parameters", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Pagination parameters

    // WHEN: Fetching POS audit records with pagination
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/pos-audit?limit=10&offset=0`,
    );

    // THEN: Request succeeds with pagination info
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.pagination.limit).toBe(10);
    expect(body.pagination.offset).toBe(0);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET POS AUDIT SUMMARY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("0-AUDIT-API-010: [P0] GET /api/stores/:storeId/pos-audit/summary - should return audit summary", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: I am authenticated as a Client User with POS_AUDIT_READ permission

    // WHEN: Fetching POS audit summary via API
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/pos-audit/summary`,
    );

    // THEN: Request succeeds with summary data
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.totalRecords, "Should have totalRecords").toBeDefined();
    expect(body.data.successCount, "Should have successCount").toBeDefined();
    expect(body.data.failedCount, "Should have failedCount").toBeDefined();
    expect(body.data.piiCount, "Should have piiCount").toBeDefined();
    expect(
      body.data.financialCount,
      "Should have financialCount",
    ).toBeDefined();
  });

  test("0-AUDIT-API-011: [P1] GET /api/stores/:storeId/pos-audit/summary - should reject unauthenticated request", async ({
    apiRequest,
    clientUser,
  }) => {
    // GIVEN: No authentication token

    // WHEN: Fetching POS audit summary without auth
    const response = await apiRequest.get(
      `/api/stores/${clientUser.store_id}/pos-audit/summary`,
    );

    // THEN: Request is rejected with 401
    expect(response.status(), "Should return 401 Unauthorized").toBe(401);
  });

  test("0-AUDIT-API-012: [P1] GET /api/stores/:storeId/pos-audit/summary - should support date range filtering", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Date range parameters
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 7);
    const toDate = new Date();

    // WHEN: Fetching POS audit summary with date filters
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/pos-audit/summary?fromDate=${fromDate.toISOString()}&toDate=${toDate.toISOString()}`,
    );

    // THEN: Request succeeds
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET SPECIFIC AUDIT RECORD TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("0-AUDIT-API-020: [P1] GET /api/stores/:storeId/pos-audit/:auditId - should return 404 for non-existent audit record", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A valid UUID that doesn't exist as an audit ID
    const fakeAuditId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Fetching non-existent audit record
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/pos-audit/${fakeAuditId}`,
    );

    // THEN: Returns 404
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  test("0-AUDIT-API-021: [P1] GET /api/stores/:storeId/pos-audit/:auditId - should return 400 for invalid audit ID", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: An invalid UUID format for audit ID

    // WHEN: Fetching with invalid audit ID
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/pos-audit/not-a-uuid`,
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});

test.describe("Phase0-API: POS Audit - Admin Level Endpoints", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN GET ALL AUDIT RECORDS TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("0-AUDIT-API-030: [P0] GET /api/admin/pos-audit - should allow system admin to query all audit records", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: I am authenticated as a System Admin with ADMIN_AUDIT_VIEW permission

    // WHEN: Fetching all POS audit records via admin API
    const response = await superadminApiRequest.get("/api/admin/pos-audit");

    // THEN: Request succeeds
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(Array.isArray(body.data), "Data should be an array").toBe(true);
    expect(body.pagination, "Should include pagination").toBeDefined();
  });

  test("0-AUDIT-API-031: [P0] GET /api/admin/pos-audit - should reject non-admin users", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Client User (not system admin)

    // WHEN: Attempting to access admin endpoint
    const response = await clientUserApiRequest.get("/api/admin/pos-audit");

    // THEN: Request is rejected with 403
    expect(response.status(), "Should return 403 Forbidden").toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test("0-AUDIT-API-032: [P0] GET /api/admin/pos-audit - should reject unauthenticated request", async ({
    apiRequest,
  }) => {
    // GIVEN: No authentication token

    // WHEN: Fetching admin audit records without auth
    const response = await apiRequest.get("/api/admin/pos-audit");

    // THEN: Request is rejected with 401
    expect(response.status(), "Should return 401 Unauthorized").toBe(401);
  });

  test("0-AUDIT-API-033: [P1] GET /api/admin/pos-audit - should support filtering by company", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Query filter for company ID
    const fakeCompanyId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Fetching with company filter
    const response = await superadminApiRequest.get(
      `/api/admin/pos-audit?companyId=${fakeCompanyId}`,
    );

    // THEN: Request succeeds
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN SUMMARY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("0-AUDIT-API-040: [P0] GET /api/admin/pos-audit/summary - should allow system admin to get system-wide summary", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: I am authenticated as a System Admin with ADMIN_AUDIT_VIEW permission

    // WHEN: Fetching system-wide audit summary via admin API
    const response = await superadminApiRequest.get(
      "/api/admin/pos-audit/summary",
    );

    // THEN: Request succeeds with summary data
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.totalRecords, "Should have totalRecords").toBeDefined();
  });

  test("0-AUDIT-API-041: [P0] GET /api/admin/pos-audit/summary - should reject non-admin users", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Client User (not system admin)

    // WHEN: Attempting to access admin endpoint
    const response = await clientUserApiRequest.get(
      "/api/admin/pos-audit/summary",
    );

    // THEN: Request is rejected with 403
    expect(response.status(), "Should return 403 Forbidden").toBe(403);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PII REPORT TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("0-AUDIT-API-050: [P0] GET /api/admin/pos-audit/pii-report - should allow system admin to generate PII report", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: I am authenticated as a System Admin with ADMIN_AUDIT_VIEW permission

    // WHEN: Generating PII access report via admin API
    const response = await superadminApiRequest.get(
      "/api/admin/pos-audit/pii-report",
    );

    // THEN: Request succeeds with compliance info
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(Array.isArray(body.data), "Data should be an array").toBe(true);
    expect(body.compliance, "Should include compliance metadata").toBeDefined();
    expect(body.compliance.report_type).toBe("PII_ACCESS_REPORT");
    expect(
      body.compliance.generated_at,
      "Should have generation timestamp",
    ).toBeDefined();
  });

  test("0-AUDIT-API-051: [P0] GET /api/admin/pos-audit/pii-report - should reject non-admin users", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Client User (not system admin)

    // WHEN: Attempting to access PII report endpoint
    const response = await clientUserApiRequest.get(
      "/api/admin/pos-audit/pii-report",
    );

    // THEN: Request is rejected with 403
    expect(response.status(), "Should return 403 Forbidden").toBe(403);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RETENTION CLEANUP TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("0-AUDIT-API-060: [P0] POST /api/admin/pos-audit/retention-cleanup - should support dry run mode", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: I am authenticated as a System Admin with ADMIN_AUDIT_VIEW permission
    // AND: Dry run mode is enabled

    // WHEN: Triggering retention cleanup in dry run mode
    const response = await superadminApiRequest.post(
      "/api/admin/pos-audit/retention-cleanup",
      { dryRun: true },
    );

    // THEN: Request succeeds with dry run results
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.dry_run, "Should indicate dry run mode").toBe(true);
    expect(
      body.data.would_delete,
      "Should report count that would be deleted",
    ).toBeDefined();
  });

  test("0-AUDIT-API-061: [P0] POST /api/admin/pos-audit/retention-cleanup - should reject non-admin users", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Client User (not system admin)

    // WHEN: Attempting to trigger retention cleanup
    const response = await clientUserApiRequest.post(
      "/api/admin/pos-audit/retention-cleanup",
      { dryRun: true },
    );

    // THEN: Request is rejected with 403
    expect(response.status(), "Should return 403 Forbidden").toBe(403);
  });

  test("0-AUDIT-API-062: [P0] POST /api/admin/pos-audit/retention-cleanup - should reject unauthenticated request", async ({
    apiRequest,
  }) => {
    // GIVEN: No authentication token

    // WHEN: Triggering retention cleanup without auth
    const response = await apiRequest.post(
      "/api/admin/pos-audit/retention-cleanup",
      { dryRun: true },
    );

    // THEN: Request is rejected with 401
    expect(response.status(), "Should return 401 Unauthorized").toBe(401);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN GET SPECIFIC AUDIT RECORD TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("0-AUDIT-API-070: [P1] GET /api/admin/pos-audit/:auditId - should return 404 for non-existent audit record", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: A valid UUID that doesn't exist as an audit ID
    const fakeAuditId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Fetching non-existent audit record
    const response = await superadminApiRequest.get(
      `/api/admin/pos-audit/${fakeAuditId}`,
    );

    // THEN: Returns 404
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  test("0-AUDIT-API-071: [P1] GET /api/admin/pos-audit/:auditId - should return 400 for invalid audit ID", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: An invalid UUID format for audit ID

    // WHEN: Fetching with invalid audit ID
    const response = await superadminApiRequest.get(
      "/api/admin/pos-audit/not-a-uuid",
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});

test.describe("Phase0-API: POS Audit - Security & Isolation", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // RLS / TENANT ISOLATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("0-AUDIT-API-080: [P0] RLS - Client User should only access their own store's audit records", async ({
    clientUserApiRequest,
    anotherStoreManagerUser,
  }) => {
    // GIVEN: I am authenticated as a Client User for Store A
    // AND: There is a separate Store B (from anotherStoreManagerUser) that I don't have access to

    // WHEN: Attempting to access Store B's audit records
    const otherStoreId = anotherStoreManagerUser.store_id;
    const response = await clientUserApiRequest.get(
      `/api/stores/${otherStoreId}/pos-audit`,
    );

    // THEN: Request is rejected with 403 Forbidden (store exists but user has no access)
    expect(
      response.status(),
      "Should return 403 Forbidden for cross-tenant access",
    ).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    // Error code may be FORBIDDEN or PERMISSION_DENIED depending on which middleware catches it first
    expect(["FORBIDDEN", "PERMISSION_DENIED"]).toContain(body.error.code);
  });

  test("0-AUDIT-API-081: [P0] RLS - System Admin should access any store's audit records", async ({
    superadminApiRequest,
    clientUser,
  }) => {
    // GIVEN: I am authenticated as a System Admin

    // WHEN: Accessing any store's audit records
    const response = await superadminApiRequest.get(
      `/api/stores/${clientUser.store_id}/pos-audit`,
    );

    // THEN: Request succeeds
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INPUT VALIDATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("0-AUDIT-API-090: [P1] Validation - should reject invalid date format in fromDate", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Invalid date format

    // WHEN: Fetching with invalid date
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/pos-audit?fromDate=not-a-date`,
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("0-AUDIT-API-091: [P1] Validation - should reject invalid limit value", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Invalid limit value (too large)

    // WHEN: Fetching with invalid limit
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/pos-audit?limit=999`,
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("0-AUDIT-API-092: [P1] Validation - should reject negative offset value", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Negative offset value

    // WHEN: Fetching with negative offset
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/pos-audit?offset=-1`,
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});
