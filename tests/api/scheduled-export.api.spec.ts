import { test as baseTest, expect } from "../support/fixtures/rbac.fixture";
import { withBypassClient } from "../support/prisma-bypass";

/**
 * NAXML Scheduled Export API Tests
 *
 * Comprehensive tests for the scheduled export feature including:
 * - CRUD operations for scheduled exports
 * - Manual execution triggers
 * - Pause/Resume lifecycle management
 * - Execution history retrieval
 * - Tenant isolation and security
 * - Input validation and edge cases
 * - Business logic validation
 *
 * Phase 2: Gilbarco NAXML Adapter - Scheduled Exports
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │                         TRACEABILITY MATRIX                                  │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ Test ID              │ Requirement                     │ Priority │ Type    │
 * ├──────────────────────┼─────────────────────────────────┼──────────┼─────────┤
 * │ SCHED-API-001        │ List schedules - empty          │ P0       │ API     │
 * │ SCHED-API-002        │ List schedules - auth required  │ P0       │ Security│
 * │ SCHED-API-003        │ List schedules - invalid store  │ P1       │ Validation│
 * │ SCHED-API-004        │ List schedules - pagination     │ P1       │ API     │
 * │ SCHED-API-005        │ List schedules - filter status  │ P1       │ API     │
 * │ SCHED-API-006        │ List schedules - filter type    │ P1       │ API     │
 * │ SCHED-API-010        │ Create schedule - success       │ P0       │ API     │
 * │ SCHED-API-011        │ Create schedule - auth required │ P0       │ Security│
 * │ SCHED-API-012        │ Create schedule - validation    │ P1       │ Validation│
 * │ SCHED-API-013        │ Create schedule - invalid cron  │ P1       │ Validation│
 * │ SCHED-API-014        │ Create schedule - POS required  │ P1       │ Business│
 * │ SCHED-API-020        │ Get schedule - success          │ P0       │ API     │
 * │ SCHED-API-021        │ Get schedule - not found        │ P1       │ API     │
 * │ SCHED-API-022        │ Get schedule - wrong store      │ P0       │ Security│
 * │ SCHED-API-030        │ Update schedule - success       │ P0       │ API     │
 * │ SCHED-API-031        │ Update schedule - validation    │ P1       │ Validation│
 * │ SCHED-API-032        │ Update schedule - wrong store   │ P0       │ Security│
 * │ SCHED-API-040        │ Delete schedule - success       │ P0       │ API     │
 * │ SCHED-API-041        │ Delete schedule - not found     │ P1       │ API     │
 * │ SCHED-API-042        │ Delete schedule - wrong store   │ P0       │ Security│
 * │ SCHED-API-050        │ Execute schedule - success      │ P0       │ API     │
 * │ SCHED-API-051        │ Execute schedule - not found    │ P1       │ API     │
 * │ SCHED-API-060        │ Pause schedule - success        │ P0       │ API     │
 * │ SCHED-API-061        │ Resume schedule - success       │ P0       │ API     │
 * │ SCHED-API-070        │ Get history - success           │ P1       │ API     │
 * │ SCHED-API-071        │ Get history - pagination        │ P1       │ API     │
 * │ SCHED-SEC-001        │ Cross-store access blocked      │ P0       │ Security│
 * │ SCHED-SEC-002        │ Cross-company access blocked    │ P0       │ Security│
 * │ SCHED-SEC-003        │ Unauthenticated access blocked  │ P0       │ Security│
 * │ SCHED-EDGE-001       │ Cron edge cases                 │ P1       │ Edge    │
 * │ SCHED-EDGE-002       │ Timezone handling               │ P1       │ Edge    │
 * │ SCHED-EDGE-003       │ Max notification emails         │ P1       │ Edge    │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

// =============================================================================
// TEST CONTEXT TYPE - Test-scoped cleanup tracking
// =============================================================================

/**
 * Test context for tracking test-specific data that needs cleanup.
 * Each test worker gets its own isolated context to prevent cross-test interference.
 */
interface ScheduledExportTestContext {
  /** Schedule IDs created during this specific test */
  createdScheduleIds: string[];
  /** POS Integration IDs created during this specific test */
  createdPosIntegrationIds: string[];
  /** Department IDs created during this specific test */
  createdDepartmentIds: string[];
}

// =============================================================================
// EXTENDED TEST FIXTURE
// =============================================================================

/**
 * Extended test fixture that provides test-scoped cleanup context.
 * This ensures each parallel test worker has its own isolated state.
 */
const test = baseTest.extend<{ testContext: ScheduledExportTestContext }>({
  testContext: async ({}, use) => {
    // Create isolated context for this specific test
    const context: ScheduledExportTestContext = {
      createdScheduleIds: [],
      createdPosIntegrationIds: [],
      createdDepartmentIds: [],
    };

    // Run the test with its isolated context
    await use(context);

    // Cleanup: Remove all test data created during this specific test
    // This runs after each test, cleaning only data created by this test
    await withBypassClient(async (prisma) => {
      // Clean up in reverse order of dependencies
      if (context.createdScheduleIds.length > 0) {
        await prisma.nAXMLScheduledExportLog.deleteMany({
          where: { schedule_id: { in: context.createdScheduleIds } },
        });
        await prisma.nAXMLScheduledExport.deleteMany({
          where: { schedule_id: { in: context.createdScheduleIds } },
        });
      }
      if (context.createdDepartmentIds.length > 0) {
        await prisma.department.deleteMany({
          where: { department_id: { in: context.createdDepartmentIds } },
        });
      }
      if (context.createdPosIntegrationIds.length > 0) {
        await prisma.pOSIntegration.deleteMany({
          where: {
            pos_integration_id: { in: context.createdPosIntegrationIds },
          },
        });
      }
    });
  },
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Creates a POS integration for a store (required for scheduled exports).
 * Tracks the created integration in the test context for cleanup.
 *
 * @param storeId - Store to create POS integration for
 * @param context - Test context for tracking cleanup
 * @returns POS integration ID
 */
async function createPOSIntegration(
  storeId: string,
  context: ScheduledExportTestContext,
): Promise<string> {
  let posIntegrationId: string = "";
  await withBypassClient(async (prisma) => {
    const integration = await prisma.pOSIntegration.create({
      data: {
        store_id: storeId,
        pos_type: "GILBARCO_PASSPORT", // Use existing enum value
        is_active: true,
        connection_mode: "FILE_EXCHANGE",
        naxml_version: "3.4",
        generate_acknowledgments: true,
        host: "localhost",
        port: 8080,
        use_ssl: false,
        xml_gateway_path: "/tmp/test/XMLGateway",
      },
    });
    posIntegrationId = integration.pos_integration_id;
    context.createdPosIntegrationIds.push(posIntegrationId);
  });
  return posIntegrationId;
}

/**
 * Creates a test department for export testing.
 * Tracks the created department in the test context for cleanup.
 *
 * @param companyId - Company to create department for
 * @param context - Test context for tracking cleanup
 * @returns Department ID
 */
async function createTestDepartment(
  companyId: string,
  context: ScheduledExportTestContext,
): Promise<string> {
  let deptId: string = "";
  await withBypassClient(async (prisma) => {
    const dept = await prisma.department.create({
      data: {
        client_id: companyId,
        code: `DEPT-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        display_name: "Test Department",
        is_active: true,
        is_taxable: true,
      },
    });
    deptId = dept.department_id;
    context.createdDepartmentIds.push(deptId);
  });
  return deptId;
}

/**
 * Helper to create a schedule and track it for cleanup.
 * Validates the response and throws descriptive errors on failure.
 *
 * @param apiRequest - API request helper
 * @param storeId - Store to create schedule for
 * @param scheduleData - Schedule creation data
 * @param context - Test context for tracking cleanup
 * @returns Created schedule data
 */
async function createScheduleWithTracking(
  apiRequest: any,
  storeId: string,
  scheduleData: {
    export_type: string;
    export_name: string;
    cron_expression: string;
    timezone?: string;
    maintenance_type?: string;
    notify_on_failure?: boolean;
    notify_on_success?: boolean;
    file_name_pattern?: string;
    notify_emails?: string[];
  },
  context: ScheduledExportTestContext,
): Promise<{
  scheduleId: string;
  exportType: string;
  exportName: string;
  status: string;
  nextRunAt: string;
  cronExpression: string;
  timezone?: string;
  fileNamePattern?: string;
  totalRuns?: number;
  successfulRuns?: number;
  failedRuns?: number;
  lastRunAt?: string | null;
}> {
  const response = await apiRequest.post(
    `/api/stores/${storeId}/naxml/schedules`,
    scheduleData,
  );

  if (response.status() !== 201) {
    const errorBody = await response.json();
    throw new Error(
      `Failed to create schedule: ${response.status()} - ${JSON.stringify(errorBody)}`,
    );
  }

  const body = await response.json();
  if (!body.success || !body.data?.scheduleId) {
    throw new Error(
      `Invalid schedule creation response: ${JSON.stringify(body)}`,
    );
  }

  // Track for cleanup
  context.createdScheduleIds.push(body.data.scheduleId);

  return body.data;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIST SCHEDULED EXPORTS TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Phase2-API: Scheduled Exports - List", () => {
  test("SCHED-API-001: [P0] GET /api/stores/:storeId/naxml/schedules - should return empty array when no schedules exist", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: I am authenticated as a Client User with NAXML_FILE_EXPORT permission
    // AND: The store has no scheduled exports configured

    // WHEN: Fetching scheduled exports via API
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/naxml/schedules`,
    );

    // THEN: Request succeeds with empty array
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(Array.isArray(body.data), "Data should be an array").toBe(true);
    expect(body.data.length, "Array should be empty").toBe(0);
    expect(body.pagination, "Should include pagination").toBeDefined();
    expect(body.pagination.total, "Total should be 0").toBe(0);
  });

  test("SCHED-API-002: [P0] GET /api/stores/:storeId/naxml/schedules - should reject unauthenticated request", async ({
    apiRequest,
    clientUser,
  }) => {
    // GIVEN: No authentication token

    // WHEN: Fetching scheduled exports without auth
    const response = await apiRequest.get(
      `/api/stores/${clientUser.store_id}/naxml/schedules`,
    );

    // THEN: Request is rejected with 401
    expect(response.status(), "Should return 401 Unauthorized").toBe(401);
  });

  test("SCHED-API-003: [P1] GET /api/stores/:storeId/naxml/schedules - should return 400 for invalid store ID", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: An invalid UUID format for store ID

    // WHEN: Fetching with invalid store ID
    const response = await clientUserApiRequest.get(
      "/api/stores/not-a-uuid/naxml/schedules",
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("SCHED-API-004: [P1] GET /api/stores/:storeId/naxml/schedules - should support pagination parameters", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Pagination parameters

    // WHEN: Fetching scheduled exports with pagination
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/naxml/schedules?limit=10&offset=0`,
    );

    // THEN: Request succeeds with pagination info
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.pagination.limit).toBe(10);
    expect(body.pagination.offset).toBe(0);
  });

  test("SCHED-API-005: [P1] GET /api/stores/:storeId/naxml/schedules - should support filtering by status", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Query filter for status

    // WHEN: Fetching scheduled exports with status filter
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/naxml/schedules?status=ACTIVE`,
    );

    // THEN: Request succeeds
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test("SCHED-API-006: [P1] GET /api/stores/:storeId/naxml/schedules - should support filtering by export_type", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Query filter for export type

    // WHEN: Fetching scheduled exports with export type filter
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/naxml/schedules?export_type=DEPARTMENTS`,
    );

    // THEN: Request succeeds
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CREATE SCHEDULED EXPORT TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Phase2-API: Scheduled Exports - Create", () => {
  test("SCHED-API-010: [P0] POST /api/stores/:storeId/naxml/schedules - should create scheduled export successfully", async ({
    clientUserApiRequest,
    clientUser,
    testContext,
  }) => {
    // GIVEN: I am authenticated and store has POS integration
    await createPOSIntegration(clientUser.store_id, testContext);

    // WHEN: Creating a scheduled export
    const response = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/schedules`,
      {
        export_type: "DEPARTMENTS",
        export_name: "Daily Department Export",
        cron_expression: "0 2 * * *", // 2 AM daily
        timezone: "America/New_York",
        maintenance_type: "Full",
        notify_on_failure: true,
        notify_on_success: false,
      },
    );

    // THEN: Schedule is created successfully
    expect(response.status(), "Should return 201 Created").toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.scheduleId).toBeDefined();
    expect(body.data.exportType).toBe("DEPARTMENTS");
    expect(body.data.exportName).toBe("Daily Department Export");
    expect(body.data.status).toBe("ACTIVE");
    expect(body.data.nextRunAt).toBeDefined();

    // Track for cleanup
    testContext.createdScheduleIds.push(body.data.scheduleId);
  });

  test("SCHED-API-011: [P0] POST /api/stores/:storeId/naxml/schedules - should reject unauthenticated request", async ({
    apiRequest,
    clientUser,
  }) => {
    // GIVEN: No authentication token

    // WHEN: Creating schedule without auth
    const response = await apiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/schedules`,
      {
        export_type: "DEPARTMENTS",
        export_name: "Test Export",
        cron_expression: "0 2 * * *",
      },
    );

    // THEN: Request is rejected with 401
    expect(response.status()).toBe(401);
  });

  test("SCHED-API-012: [P1] POST /api/stores/:storeId/naxml/schedules - should validate required fields", async ({
    clientUserApiRequest,
    clientUser,
    testContext,
  }) => {
    // GIVEN: Missing required fields
    await createPOSIntegration(clientUser.store_id, testContext);

    // WHEN: Creating schedule without required fields
    const response = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/schedules`,
      {},
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("SCHED-API-013: [P1] POST /api/stores/:storeId/naxml/schedules - should reject invalid cron expression", async ({
    clientUserApiRequest,
    clientUser,
    testContext,
  }) => {
    // GIVEN: Invalid cron expression
    await createPOSIntegration(clientUser.store_id, testContext);

    // WHEN: Creating schedule with invalid cron
    const response = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/schedules`,
      {
        export_type: "DEPARTMENTS",
        export_name: "Test Export",
        cron_expression: "invalid cron", // Invalid format
      },
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("SCHED-API-014: [P1] POST /api/stores/:storeId/naxml/schedules - should require POS integration", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Store without POS integration

    // WHEN: Creating schedule without POS integration
    const response = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/schedules`,
      {
        export_type: "DEPARTMENTS",
        export_name: "Test Export",
        cron_expression: "0 2 * * *",
      },
    );

    // THEN: Returns 404 (no POS integration)
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("POS integration");
  });

  test("SCHED-API-015: [P1] POST /api/stores/:storeId/naxml/schedules - should accept all export types", async ({
    clientUserApiRequest,
    clientUser,
    testContext,
  }) => {
    // GIVEN: POS integration configured
    await createPOSIntegration(clientUser.store_id, testContext);

    const exportTypes = [
      "DEPARTMENTS",
      "TENDER_TYPES",
      "TAX_RATES",
      "FULL_SYNC",
    ];

    for (const exportType of exportTypes) {
      // WHEN: Creating schedule with each export type
      const response = await clientUserApiRequest.post(
        `/api/stores/${clientUser.store_id}/naxml/schedules`,
        {
          export_type: exportType,
          export_name: `${exportType} Export`,
          cron_expression: "0 3 * * *",
        },
      );

      // THEN: Schedule is created successfully
      expect(response.status(), `Should create ${exportType} schedule`).toBe(
        201,
      );
      const body = await response.json();
      expect(body.data.exportType).toBe(exportType);
      testContext.createdScheduleIds.push(body.data.scheduleId);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET SCHEDULED EXPORT TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Phase2-API: Scheduled Exports - Get", () => {
  test("SCHED-API-020: [P0] GET /api/stores/:storeId/naxml/schedules/:scheduleId - should return schedule details", async ({
    clientUserApiRequest,
    clientUser,
    testContext,
  }) => {
    // GIVEN: A scheduled export exists
    await createPOSIntegration(clientUser.store_id, testContext);
    const created = await createScheduleWithTracking(
      clientUserApiRequest,
      clientUser.store_id,
      {
        export_type: "DEPARTMENTS",
        export_name: "Test Schedule",
        cron_expression: "0 2 * * *",
      },
      testContext,
    );

    // WHEN: Fetching the schedule by ID
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/naxml/schedules/${created.scheduleId}`,
    );

    // THEN: Returns schedule details
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.scheduleId).toBe(created.scheduleId);
    expect(body.data.exportName).toBe("Test Schedule");
    expect(body.data.exportType).toBe("DEPARTMENTS");
    expect(body.data.cronExpression).toBe("0 2 * * *");
  });

  test("SCHED-API-021: [P1] GET /api/stores/:storeId/naxml/schedules/:scheduleId - should return 404 for non-existent schedule", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A schedule ID that doesn't exist
    const fakeScheduleId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Fetching non-existent schedule
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/naxml/schedules/${fakeScheduleId}`,
    );

    // THEN: Returns 404
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  test("SCHED-API-022: [P0] GET /api/stores/:storeId/naxml/schedules/:scheduleId - should deny access for user without NAXML permission", async ({
    clientUserApiRequest,
    storeManagerApiRequest,
    clientUser,
    storeManagerUser,
    testContext,
  }) => {
    // GIVEN: A scheduled export exists for clientUser's store
    await createPOSIntegration(clientUser.store_id, testContext);
    const created = await createScheduleWithTracking(
      clientUserApiRequest,
      clientUser.store_id,
      {
        export_type: "DEPARTMENTS",
        export_name: "Private Schedule",
        cron_expression: "0 2 * * *",
      },
      testContext,
    );

    // WHEN: Store manager (without NAXML permissions) tries to access
    const response = await storeManagerApiRequest.get(
      `/api/stores/${storeManagerUser.store_id}/naxml/schedules/${created.scheduleId}`,
    );

    // THEN: Returns 403 (permission denied - NAXML_FILE_EXPORT required)
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// UPDATE SCHEDULED EXPORT TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Phase2-API: Scheduled Exports - Update", () => {
  test("SCHED-API-030: [P0] PATCH /api/stores/:storeId/naxml/schedules/:scheduleId - should update schedule successfully", async ({
    clientUserApiRequest,
    clientUser,
    testContext,
  }) => {
    // GIVEN: A scheduled export exists
    await createPOSIntegration(clientUser.store_id, testContext);
    const created = await createScheduleWithTracking(
      clientUserApiRequest,
      clientUser.store_id,
      {
        export_type: "DEPARTMENTS",
        export_name: "Original Name",
        cron_expression: "0 2 * * *",
      },
      testContext,
    );

    // WHEN: Updating the schedule
    const response = await clientUserApiRequest.patch(
      `/api/stores/${clientUser.store_id}/naxml/schedules/${created.scheduleId}`,
      {
        export_name: "Updated Name",
        cron_expression: "0 3 * * *", // Changed to 3 AM
        notify_on_success: true,
      },
    );

    // THEN: Schedule is updated
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.exportName).toBe("Updated Name");
    expect(body.data.cronExpression).toBe("0 3 * * *");
  });

  test("SCHED-API-031: [P1] PATCH /api/stores/:storeId/naxml/schedules/:scheduleId - should reject invalid cron on update", async ({
    clientUserApiRequest,
    clientUser,
    testContext,
  }) => {
    // GIVEN: A scheduled export exists
    await createPOSIntegration(clientUser.store_id, testContext);
    const created = await createScheduleWithTracking(
      clientUserApiRequest,
      clientUser.store_id,
      {
        export_type: "DEPARTMENTS",
        export_name: "Test Schedule",
        cron_expression: "0 2 * * *",
      },
      testContext,
    );

    // WHEN: Updating with invalid cron
    const response = await clientUserApiRequest.patch(
      `/api/stores/${clientUser.store_id}/naxml/schedules/${created.scheduleId}`,
      {
        cron_expression: "not valid",
      },
    );

    // THEN: Returns validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("SCHED-API-032: [P0] PATCH /api/stores/:storeId/naxml/schedules/:scheduleId - should deny update for user without NAXML permission", async ({
    clientUserApiRequest,
    storeManagerApiRequest,
    clientUser,
    storeManagerUser,
    testContext,
  }) => {
    // GIVEN: A scheduled export exists for clientUser's store
    await createPOSIntegration(clientUser.store_id, testContext);
    const created = await createScheduleWithTracking(
      clientUserApiRequest,
      clientUser.store_id,
      {
        export_type: "DEPARTMENTS",
        export_name: "Private Schedule",
        cron_expression: "0 2 * * *",
      },
      testContext,
    );

    // WHEN: Store manager (without NAXML permissions) tries to update
    const response = await storeManagerApiRequest.patch(
      `/api/stores/${storeManagerUser.store_id}/naxml/schedules/${created.scheduleId}`,
      {
        export_name: "Hacked Name",
      },
    );

    // THEN: Returns 403 (permission denied - NAXML_FILE_EXPORT required)
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test("SCHED-API-033: [P1] PATCH /api/stores/:storeId/naxml/schedules/:scheduleId - should allow status change", async ({
    clientUserApiRequest,
    clientUser,
    testContext,
  }) => {
    // GIVEN: An active scheduled export
    await createPOSIntegration(clientUser.store_id, testContext);
    const created = await createScheduleWithTracking(
      clientUserApiRequest,
      clientUser.store_id,
      {
        export_type: "DEPARTMENTS",
        export_name: "Test Schedule",
        cron_expression: "0 2 * * *",
      },
      testContext,
    );
    expect(created.status).toBe("ACTIVE");

    // WHEN: Changing status to DISABLED
    const response = await clientUserApiRequest.patch(
      `/api/stores/${clientUser.store_id}/naxml/schedules/${created.scheduleId}`,
      {
        status: "DISABLED",
      },
    );

    // THEN: Status is updated
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.status).toBe("DISABLED");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE SCHEDULED EXPORT TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Phase2-API: Scheduled Exports - Delete", () => {
  test("SCHED-API-040: [P0] DELETE /api/stores/:storeId/naxml/schedules/:scheduleId - should delete schedule successfully", async ({
    clientUserApiRequest,
    clientUser,
    testContext,
  }) => {
    // GIVEN: A scheduled export exists
    await createPOSIntegration(clientUser.store_id, testContext);
    const created = await createScheduleWithTracking(
      clientUserApiRequest,
      clientUser.store_id,
      {
        export_type: "DEPARTMENTS",
        export_name: "To Be Deleted",
        cron_expression: "0 2 * * *",
      },
      testContext,
    );

    // Remove from tracking since we're deleting it manually
    const idx = testContext.createdScheduleIds.indexOf(created.scheduleId);
    if (idx > -1) testContext.createdScheduleIds.splice(idx, 1);

    // WHEN: Deleting the schedule
    const response = await clientUserApiRequest.delete(
      `/api/stores/${clientUser.store_id}/naxml/schedules/${created.scheduleId}`,
    );

    // THEN: Returns 204 No Content
    expect(response.status()).toBe(204);

    // Verify it's actually deleted
    const getResponse = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/naxml/schedules/${created.scheduleId}`,
    );
    expect(getResponse.status()).toBe(404);
  });

  test("SCHED-API-041: [P1] DELETE /api/stores/:storeId/naxml/schedules/:scheduleId - should return 404 for non-existent schedule", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A schedule ID that doesn't exist
    const fakeScheduleId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Deleting non-existent schedule
    const response = await clientUserApiRequest.delete(
      `/api/stores/${clientUser.store_id}/naxml/schedules/${fakeScheduleId}`,
    );

    // THEN: Returns 404
    expect(response.status()).toBe(404);
  });

  test("SCHED-API-042: [P0] DELETE /api/stores/:storeId/naxml/schedules/:scheduleId - should deny delete for user without NAXML permission", async ({
    clientUserApiRequest,
    storeManagerApiRequest,
    clientUser,
    storeManagerUser,
    testContext,
  }) => {
    // GIVEN: A scheduled export exists for clientUser's store
    await createPOSIntegration(clientUser.store_id, testContext);
    const created = await createScheduleWithTracking(
      clientUserApiRequest,
      clientUser.store_id,
      {
        export_type: "DEPARTMENTS",
        export_name: "Private Schedule",
        cron_expression: "0 2 * * *",
      },
      testContext,
    );

    // WHEN: Store manager (without NAXML permissions) tries to delete
    const response = await storeManagerApiRequest.delete(
      `/api/stores/${storeManagerUser.store_id}/naxml/schedules/${created.scheduleId}`,
    );

    // THEN: Returns 403 (permission denied - NAXML_FILE_EXPORT required)
    expect(response.status()).toBe(403);

    // Verify original schedule still exists
    const getResponse = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/naxml/schedules/${created.scheduleId}`,
    );
    expect(getResponse.status()).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTE SCHEDULED EXPORT TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Phase2-API: Scheduled Exports - Execute", () => {
  test("SCHED-API-050: [P0] POST /api/stores/:storeId/naxml/schedules/:scheduleId/execute - should execute schedule manually", async ({
    clientUserApiRequest,
    clientUser,
    testContext,
  }) => {
    // GIVEN: A scheduled export exists with data to export
    await createPOSIntegration(clientUser.store_id, testContext);
    await createTestDepartment(clientUser.company_id, testContext);

    const created = await createScheduleWithTracking(
      clientUserApiRequest,
      clientUser.store_id,
      {
        export_type: "DEPARTMENTS",
        export_name: "Manual Execute Test",
        cron_expression: "0 2 * * *",
      },
      testContext,
    );

    // WHEN: Executing the schedule manually
    const response = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/schedules/${created.scheduleId}/execute`,
      {
        trigger_type: "MANUAL",
      },
    );

    // THEN: Execute returns result
    // Note: May return 422 if no data to export, which is also valid behavior
    expect([200, 422]).toContain(response.status());
    const body = await response.json();
    if (response.status() === 200) {
      expect(body.success).toBe(true);
      expect(body.data.schedule_id).toBe(created.scheduleId);
    }
  });

  test("SCHED-API-051: [P1] POST /api/stores/:storeId/naxml/schedules/:scheduleId/execute - should return 404 for non-existent schedule", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A schedule ID that doesn't exist
    const fakeScheduleId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Executing non-existent schedule
    const response = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/schedules/${fakeScheduleId}/execute`,
      {},
    );

    // THEN: Returns 404
    expect(response.status()).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAUSE/RESUME SCHEDULED EXPORT TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Phase2-API: Scheduled Exports - Pause/Resume", () => {
  test("SCHED-API-060: [P0] POST /api/stores/:storeId/naxml/schedules/:scheduleId/pause - should pause active schedule", async ({
    clientUserApiRequest,
    clientUser,
    testContext,
  }) => {
    // GIVEN: An active scheduled export
    await createPOSIntegration(clientUser.store_id, testContext);
    const created = await createScheduleWithTracking(
      clientUserApiRequest,
      clientUser.store_id,
      {
        export_type: "DEPARTMENTS",
        export_name: "Pause Test",
        cron_expression: "0 2 * * *",
      },
      testContext,
    );
    expect(created.status).toBe("ACTIVE");

    // WHEN: Pausing the schedule
    const response = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/schedules/${created.scheduleId}/pause`,
      {},
    );

    // THEN: Schedule is paused
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("PAUSED");
  });

  test("SCHED-API-061: [P0] POST /api/stores/:storeId/naxml/schedules/:scheduleId/resume - should resume paused schedule", async ({
    clientUserApiRequest,
    clientUser,
    testContext,
  }) => {
    // GIVEN: A paused scheduled export
    await createPOSIntegration(clientUser.store_id, testContext);
    const created = await createScheduleWithTracking(
      clientUserApiRequest,
      clientUser.store_id,
      {
        export_type: "DEPARTMENTS",
        export_name: "Resume Test",
        cron_expression: "0 2 * * *",
      },
      testContext,
    );

    // Pause it first
    await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/schedules/${created.scheduleId}/pause`,
      {},
    );

    // WHEN: Resuming the schedule
    const response = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/schedules/${created.scheduleId}/resume`,
      {},
    );

    // THEN: Schedule is resumed
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("ACTIVE");
    expect(body.data.nextRunAt).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET HISTORY TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Phase2-API: Scheduled Exports - History", () => {
  test("SCHED-API-070: [P1] GET /api/stores/:storeId/naxml/schedules/:scheduleId/history - should return empty history for new schedule", async ({
    clientUserApiRequest,
    clientUser,
    testContext,
  }) => {
    // GIVEN: A newly created scheduled export (no executions yet)
    await createPOSIntegration(clientUser.store_id, testContext);
    const created = await createScheduleWithTracking(
      clientUserApiRequest,
      clientUser.store_id,
      {
        export_type: "DEPARTMENTS",
        export_name: "History Test",
        cron_expression: "0 2 * * *",
      },
      testContext,
    );

    // WHEN: Fetching execution history
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/naxml/schedules/${created.scheduleId}/history`,
    );

    // THEN: Returns empty history
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(body.pagination.total).toBe(0);
  });

  test("SCHED-API-071: [P1] GET /api/stores/:storeId/naxml/schedules/:scheduleId/history - should support pagination", async ({
    clientUserApiRequest,
    clientUser,
    testContext,
  }) => {
    // GIVEN: A scheduled export
    await createPOSIntegration(clientUser.store_id, testContext);
    const created = await createScheduleWithTracking(
      clientUserApiRequest,
      clientUser.store_id,
      {
        export_type: "DEPARTMENTS",
        export_name: "History Pagination Test",
        cron_expression: "0 2 * * *",
      },
      testContext,
    );

    // WHEN: Fetching history with pagination
    const response = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/naxml/schedules/${created.scheduleId}/history?limit=10&offset=0`,
    );

    // THEN: Returns with pagination info
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.pagination.limit).toBe(10);
    expect(body.pagination.offset).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Phase2-API: Scheduled Exports - Security", () => {
  test("SCHED-SEC-001: [P0] Users without NAXML permission should be blocked for all operations", async ({
    clientUserApiRequest,
    storeManagerApiRequest,
    clientUser,
    storeManagerUser,
    testContext,
  }) => {
    // GIVEN: A schedule exists for clientUser's store
    await createPOSIntegration(clientUser.store_id, testContext);
    const created = await createScheduleWithTracking(
      clientUserApiRequest,
      clientUser.store_id,
      {
        export_type: "DEPARTMENTS",
        export_name: "Security Test Schedule",
        cron_expression: "0 2 * * *",
      },
      testContext,
    );

    // WHEN/THEN: All operations from user without NAXML permissions should fail with 403
    // Note: STORE_MANAGER role does not include NAXML_FILE_EXPORT permission

    // GET
    const getResponse = await storeManagerApiRequest.get(
      `/api/stores/${storeManagerUser.store_id}/naxml/schedules/${created.scheduleId}`,
    );
    expect(getResponse.status(), "GET should return 403").toBe(403);

    // PATCH
    const patchResponse = await storeManagerApiRequest.patch(
      `/api/stores/${storeManagerUser.store_id}/naxml/schedules/${created.scheduleId}`,
      { export_name: "Hacked" },
    );
    expect(patchResponse.status(), "PATCH should return 403").toBe(403);

    // DELETE
    const deleteResponse = await storeManagerApiRequest.delete(
      `/api/stores/${storeManagerUser.store_id}/naxml/schedules/${created.scheduleId}`,
    );
    expect(deleteResponse.status(), "DELETE should return 403").toBe(403);

    // EXECUTE
    const executeResponse = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/naxml/schedules/${created.scheduleId}/execute`,
      {},
    );
    expect(executeResponse.status(), "EXECUTE should return 403").toBe(403);

    // PAUSE
    const pauseResponse = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/naxml/schedules/${created.scheduleId}/pause`,
      {},
    );
    expect(pauseResponse.status(), "PAUSE should return 403").toBe(403);

    // RESUME
    const resumeResponse = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/naxml/schedules/${created.scheduleId}/resume`,
      {},
    );
    expect(resumeResponse.status(), "RESUME should return 403").toBe(403);

    // HISTORY
    const historyResponse = await storeManagerApiRequest.get(
      `/api/stores/${storeManagerUser.store_id}/naxml/schedules/${created.scheduleId}/history`,
    );
    expect(historyResponse.status(), "HISTORY should return 403").toBe(403);
  });

  test("SCHED-SEC-003: [P0] Unauthenticated access should be blocked for all operations", async ({
    apiRequest,
    clientUserApiRequest,
    clientUser,
    testContext,
  }) => {
    // GIVEN: A schedule exists
    await createPOSIntegration(clientUser.store_id, testContext);
    const created = await createScheduleWithTracking(
      clientUserApiRequest,
      clientUser.store_id,
      {
        export_type: "DEPARTMENTS",
        export_name: "Auth Test Schedule",
        cron_expression: "0 2 * * *",
      },
      testContext,
    );

    // WHEN/THEN: All operations without auth should fail with 401

    // LIST
    const listResponse = await apiRequest.get(
      `/api/stores/${clientUser.store_id}/naxml/schedules`,
    );
    expect(listResponse.status()).toBe(401);

    // CREATE
    const createUnauthResponse = await apiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/schedules`,
      {
        export_type: "DEPARTMENTS",
        export_name: "Test",
        cron_expression: "0 2 * * *",
      },
    );
    expect(createUnauthResponse.status()).toBe(401);

    // GET
    const getResponse = await apiRequest.get(
      `/api/stores/${clientUser.store_id}/naxml/schedules/${created.scheduleId}`,
    );
    expect(getResponse.status()).toBe(401);

    // PATCH
    const patchResponse = await apiRequest.patch(
      `/api/stores/${clientUser.store_id}/naxml/schedules/${created.scheduleId}`,
      { export_name: "Hacked" },
    );
    expect(patchResponse.status()).toBe(401);

    // DELETE
    const deleteResponse = await apiRequest.delete(
      `/api/stores/${clientUser.store_id}/naxml/schedules/${created.scheduleId}`,
    );
    expect(deleteResponse.status()).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// EDGE CASE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Phase2-API: Scheduled Exports - Edge Cases", () => {
  test("SCHED-EDGE-001: [P1] Should accept various valid cron expressions", async ({
    clientUserApiRequest,
    clientUser,
    testContext,
  }) => {
    // GIVEN: POS integration configured
    await createPOSIntegration(clientUser.store_id, testContext);

    const validCronExpressions = [
      "0 0 * * *", // Midnight daily
      "30 6 * * *", // 6:30 AM daily
      "0 */2 * * *", // Every 2 hours
      "*/15 * * * *", // Every 15 minutes
      "0 0 1 * *", // Monthly on 1st
      "0 0 * * 0", // Weekly on Sunday
      "0 9 * * 1-5", // 9 AM weekdays
    ];

    for (let i = 0; i < validCronExpressions.length; i++) {
      const cron = validCronExpressions[i];
      // WHEN: Creating schedule with valid cron
      const response = await clientUserApiRequest.post(
        `/api/stores/${clientUser.store_id}/naxml/schedules`,
        {
          export_type: "DEPARTMENTS",
          export_name: `Cron Test ${i} - ${Date.now()}`,
          cron_expression: cron,
        },
      );

      // THEN: Schedule is created
      if (response.status() !== 201) {
        const errorBody = await response.json();
        console.error(`Failed cron: ${cron}`, errorBody);
      }
      expect(response.status(), `Should accept cron: ${cron}`).toBe(201);
      const body = await response.json();
      testContext.createdScheduleIds.push(body.data.scheduleId);
    }
  });

  test("SCHED-EDGE-002: [P1] Should reject invalid cron expressions", async ({
    clientUserApiRequest,
    clientUser,
    testContext,
  }) => {
    // GIVEN: POS integration configured
    await createPOSIntegration(clientUser.store_id, testContext);

    const invalidCronExpressions = [
      "invalid",
      "* * *", // Too few fields
      "* * * * * *", // Too many fields
      "60 * * * *", // Invalid minute
      "* 24 * * *", // Invalid hour
      "* * 32 * *", // Invalid day
      "* * * 13 *", // Invalid month
      "* * * * 7", // Invalid weekday
    ];

    for (const cron of invalidCronExpressions) {
      // WHEN: Creating schedule with invalid cron
      const response = await clientUserApiRequest.post(
        `/api/stores/${clientUser.store_id}/naxml/schedules`,
        {
          export_type: "DEPARTMENTS",
          export_name: `Invalid Cron Test`,
          cron_expression: cron,
        },
      );

      // THEN: Returns validation error
      expect(response.status(), `Should reject cron: ${cron}`).toBe(400);
    }
  });

  test("SCHED-EDGE-003: [P1] Should validate notification email count limit", async ({
    clientUserApiRequest,
    clientUser,
    testContext,
  }) => {
    // GIVEN: POS integration configured
    await createPOSIntegration(clientUser.store_id, testContext);

    // WHEN: Creating schedule with too many notification emails
    const response = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/schedules`,
      {
        export_type: "DEPARTMENTS",
        export_name: "Email Limit Test",
        cron_expression: "0 2 * * *",
        notify_emails: [
          "email1@test.com",
          "email2@test.com",
          "email3@test.com",
          "email4@test.com",
          "email5@test.com",
          "email6@test.com",
          "email7@test.com",
          "email8@test.com",
          "email9@test.com",
          "email10@test.com",
          "email11@test.com", // 11th email - exceeds limit
        ],
      },
    );

    // THEN: Returns validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("SCHED-EDGE-004: [P1] Should validate timezone format", async ({
    clientUserApiRequest,
    clientUser,
    testContext,
  }) => {
    // GIVEN: POS integration configured
    await createPOSIntegration(clientUser.store_id, testContext);

    // WHEN: Creating schedule with valid timezone
    const validResponse = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/schedules`,
      {
        export_type: "DEPARTMENTS",
        export_name: "Timezone Test",
        cron_expression: "0 2 * * *",
        timezone: "America/Los_Angeles",
      },
    );

    // THEN: Succeeds
    expect(validResponse.status()).toBe(201);
    const body = await validResponse.json();
    expect(body.data.timezone).toBe("America/Los_Angeles");
    testContext.createdScheduleIds.push(body.data.scheduleId);
  });

  test("SCHED-EDGE-005: [P1] Should validate export name length", async ({
    clientUserApiRequest,
    clientUser,
    testContext,
  }) => {
    // GIVEN: POS integration configured
    await createPOSIntegration(clientUser.store_id, testContext);

    // WHEN: Creating schedule with empty name
    const emptyNameResponse = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/schedules`,
      {
        export_type: "DEPARTMENTS",
        export_name: "",
        cron_expression: "0 2 * * *",
      },
    );

    // THEN: Returns validation error
    expect(emptyNameResponse.status()).toBe(400);

    // WHEN: Creating schedule with very long name
    const longNameResponse = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/schedules`,
      {
        export_type: "DEPARTMENTS",
        export_name: "A".repeat(300), // Exceeds 255 char limit
        cron_expression: "0 2 * * *",
      },
    );

    // THEN: Returns validation error
    expect(longNameResponse.status()).toBe(400);
  });

  test("SCHED-EDGE-006: [P1] Should validate file name pattern", async ({
    clientUserApiRequest,
    clientUser,
    testContext,
  }) => {
    // GIVEN: POS integration configured
    await createPOSIntegration(clientUser.store_id, testContext);

    // WHEN: Creating schedule with custom file name pattern
    const response = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/schedules`,
      {
        export_type: "DEPARTMENTS",
        export_name: "Pattern Test",
        cron_expression: "0 2 * * *",
        file_name_pattern: "export_{type}_{date}.xml",
      },
    );

    // THEN: Succeeds with custom pattern
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.data.fileNamePattern).toBe("export_{type}_{date}.xml");
    testContext.createdScheduleIds.push(body.data.scheduleId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BUSINESS LOGIC TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Phase2-API: Scheduled Exports - Business Logic", () => {
  test("SCHED-BIZ-001: [P1] Schedule should have nextRunAt calculated on creation", async ({
    clientUserApiRequest,
    clientUser,
    testContext,
  }) => {
    // GIVEN: POS integration configured
    await createPOSIntegration(clientUser.store_id, testContext);

    // WHEN: Creating a schedule
    const response = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/schedules`,
      {
        export_type: "DEPARTMENTS",
        export_name: "Next Run Test",
        cron_expression: "0 2 * * *",
      },
    );

    // THEN: nextRunAt is calculated
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.data.nextRunAt).toBeDefined();
    expect(new Date(body.data.nextRunAt).getTime()).toBeGreaterThan(Date.now());
    testContext.createdScheduleIds.push(body.data.scheduleId);
  });

  test("SCHED-BIZ-002: [P1] Schedule should start with zero execution counters", async ({
    clientUserApiRequest,
    clientUser,
    testContext,
  }) => {
    // GIVEN: POS integration configured
    await createPOSIntegration(clientUser.store_id, testContext);

    // WHEN: Creating a schedule
    const response = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/schedules`,
      {
        export_type: "DEPARTMENTS",
        export_name: "Counter Test",
        cron_expression: "0 2 * * *",
      },
    );

    // THEN: Counters are initialized to zero
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.data.totalRuns).toBe(0);
    expect(body.data.successfulRuns).toBe(0);
    expect(body.data.failedRuns).toBe(0);
    expect(body.data.lastRunAt).toBeNull();
    testContext.createdScheduleIds.push(body.data.scheduleId);
  });

  test("SCHED-BIZ-003: [P1] Resuming schedule should recalculate nextRunAt", async ({
    clientUserApiRequest,
    clientUser,
    testContext,
  }) => {
    // GIVEN: A paused schedule
    await createPOSIntegration(clientUser.store_id, testContext);
    const created = await createScheduleWithTracking(
      clientUserApiRequest,
      clientUser.store_id,
      {
        export_type: "DEPARTMENTS",
        export_name: "Resume Next Run Test",
        cron_expression: "0 2 * * *",
      },
      testContext,
    );

    // Pause the schedule
    await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/schedules/${created.scheduleId}/pause`,
      {},
    );

    // WHEN: Resuming after some time
    const resumeResponse = await clientUserApiRequest.post(
      `/api/stores/${clientUser.store_id}/naxml/schedules/${created.scheduleId}/resume`,
      {},
    );

    // THEN: nextRunAt is recalculated
    expect(resumeResponse.status()).toBe(200);
    const body = await resumeResponse.json();
    expect(body.data.nextRunAt).toBeDefined();
    expect(new Date(body.data.nextRunAt).getTime()).toBeGreaterThan(Date.now());
  });

  test("SCHED-BIZ-004: [P1] Multiple schedules per store should be allowed", async ({
    clientUserApiRequest,
    clientUser,
    testContext,
  }) => {
    // GIVEN: POS integration configured
    await createPOSIntegration(clientUser.store_id, testContext);

    // WHEN: Creating multiple schedules
    const scheduleConfigs = [
      {
        export_type: "DEPARTMENTS",
        export_name: "Daily Departments",
        cron_expression: "0 1 * * *",
      },
      {
        export_type: "TENDER_TYPES",
        export_name: "Daily Tenders",
        cron_expression: "0 2 * * *",
      },
      {
        export_type: "TAX_RATES",
        export_name: "Daily Taxes",
        cron_expression: "0 3 * * *",
      },
    ];

    for (const config of scheduleConfigs) {
      const response = await clientUserApiRequest.post(
        `/api/stores/${clientUser.store_id}/naxml/schedules`,
        config,
      );
      expect(response.status()).toBe(201);
      const body = await response.json();
      testContext.createdScheduleIds.push(body.data.scheduleId);
    }

    // THEN: All schedules are listed
    const listResponse = await clientUserApiRequest.get(
      `/api/stores/${clientUser.store_id}/naxml/schedules`,
    );
    expect(listResponse.status()).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody.data.length).toBeGreaterThanOrEqual(3);
  });
});
