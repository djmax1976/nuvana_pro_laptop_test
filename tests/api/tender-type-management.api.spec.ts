import { test, expect } from "../support/fixtures/rbac.fixture";

/**
 * TenderType Management API Tests
 *
 * Tests for TenderType (Payment Method) Management API endpoints:
 * - List tender types (system + client-specific)
 * - Get tender type by ID
 * - Create client-specific tender types
 * - Update tender type information
 * - Soft delete (deactivate) tender types
 * - RLS enforcement for client isolation
 * - Permission enforcement (TENDER_TYPE_READ, TENDER_TYPE_MANAGE)
 * - Security: Authentication, Authorization, Input Validation
 *
 * Phase 1.1: Shift & Day Summary Implementation Plan
 * Priority: P1 (Core configuration management)
 */

test.describe("Phase1.1-API: TenderType Management - CRUD Operations", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // LIST TENDER TYPES TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1.1-API-001: [P0] GET /api/config/tender-types - should list system tender types for authenticated user", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Client User with TENDER_TYPE_READ permission

    // WHEN: Fetching tender types via API
    const response = await clientUserApiRequest.get("/api/config/tender-types");

    // THEN: Request succeeds with system tender types
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(Array.isArray(body.data), "Response data should be an array").toBe(
      true,
    );

    // AND: System tender types are present (seeded data)
    const codes = body.data.map((t: { code: string }) => t.code);
    expect(codes, "Should include CASH tender type").toContain("CASH");
    expect(codes, "Should include CREDIT tender type").toContain("CREDIT");
    expect(codes, "Should include DEBIT tender type").toContain("DEBIT");

    // AND: Each tender type has required fields
    const cashTender = body.data.find(
      (t: { code: string }) => t.code === "CASH",
    );
    expect(cashTender, "CASH tender should exist").toBeDefined();
    expect(cashTender.tender_type_id, "Should have ID").toBeDefined();
    expect(cashTender.display_name, "Should have display name").toBe("Cash");
    expect(
      cashTender.is_cash_equivalent,
      "Cash should be cash equivalent",
    ).toBe(true);
    expect(
      cashTender.is_system,
      "System types should be marked as system",
    ).toBe(true);
  });

  test("1.1-API-002: [P0] GET /api/config/tender-types - should return sorted by sort_order", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Client User

    // WHEN: Fetching tender types
    const response = await clientUserApiRequest.get("/api/config/tender-types");

    // THEN: Results are sorted by sort_order
    expect(response.status()).toBe(200);
    const body = await response.json();

    const sortOrders = body.data.map(
      (t: { sort_order: number }) => t.sort_order,
    );
    const sortedOrders = [...sortOrders].sort((a, b) => a - b);
    expect(sortOrders, "Should be sorted by sort_order").toEqual(sortedOrders);
  });

  test("1.1-API-003: [P1] GET /api/config/tender-types - should filter inactive when include_inactive=false", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I create a client-specific tender type and deactivate it
    const createResponse = await clientUserApiRequest.post(
      "/api/config/tender-types",
      {
        code: "TEST_INACTIVE",
        display_name: "Test Inactive Tender",
      },
    );
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();
    const tenderId = created.data.tender_type_id;

    // Deactivate it
    await clientUserApiRequest.delete(`/api/config/tender-types/${tenderId}`);

    // WHEN: Fetching without include_inactive
    const response = await clientUserApiRequest.get("/api/config/tender-types");

    // THEN: Deactivated tender type is not included
    const body = await response.json();
    const found = body.data.find(
      (t: { tender_type_id: string }) => t.tender_type_id === tenderId,
    );
    expect(
      found,
      "Inactive tender should not be in default list",
    ).toBeUndefined();

    // WHEN: Fetching with include_inactive=true
    const responseWithInactive = await clientUserApiRequest.get(
      "/api/config/tender-types?include_inactive=true",
    );

    // THEN: Deactivated tender type IS included
    const bodyWithInactive = await responseWithInactive.json();
    const foundInactive = bodyWithInactive.data.find(
      (t: { tender_type_id: string }) => t.tender_type_id === tenderId,
    );
    expect(
      foundInactive,
      "Inactive tender should be in list when requested",
    ).toBeDefined();
    expect(foundInactive.is_active, "Should be marked inactive").toBe(false);
  });

  test("1.1-API-004: [P0] GET /api/config/tender-types - should reject unauthenticated request", async ({
    apiRequest,
  }) => {
    // GIVEN: No authentication token

    // WHEN: Fetching tender types without auth
    const response = await apiRequest.get("/api/config/tender-types");

    // THEN: Request is rejected with 401
    expect(response.status(), "Should return 401 Unauthorized").toBe(401);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET SINGLE TENDER TYPE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1.1-API-010: [P0] GET /api/config/tender-types/:id - should get tender type by ID", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I get the list to find a valid ID
    const listResponse = await clientUserApiRequest.get(
      "/api/config/tender-types",
    );
    const list = await listResponse.json();
    const cashTender = list.data.find(
      (t: { code: string }) => t.code === "CASH",
    );
    expect(cashTender, "Should have CASH tender to test with").toBeDefined();

    // WHEN: Fetching by ID
    const response = await clientUserApiRequest.get(
      `/api/config/tender-types/${cashTender.tender_type_id}`,
    );

    // THEN: Returns the tender type
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.code).toBe("CASH");
    expect(body.data.tender_type_id).toBe(cashTender.tender_type_id);
  });

  test("1.1-API-011: [P1] GET /api/config/tender-types/:id - should return 404 for non-existent ID", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: A non-existent UUID
    const fakeId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Fetching by non-existent ID
    const response = await clientUserApiRequest.get(
      `/api/config/tender-types/${fakeId}`,
    );

    // THEN: Returns 404
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  test("1.1-API-012: [P1] GET /api/config/tender-types/:id - should return 400 for invalid UUID", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: An invalid UUID format
    const invalidId = "not-a-uuid";

    // WHEN: Fetching with invalid ID
    const response = await clientUserApiRequest.get(
      `/api/config/tender-types/${invalidId}`,
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE TENDER TYPE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1.1-API-020: [P0] POST /api/config/tender-types - should create client-specific tender type", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Valid tender type data
    const tenderData = {
      code: "CUSTOM_PAY",
      display_name: "Custom Payment Method",
      description: "A custom payment method for testing",
      is_cash_equivalent: false,
      is_electronic: true,
      affects_cash_drawer: false,
      sort_order: 100,
    };

    // WHEN: Creating tender type via API
    const response = await clientUserApiRequest.post(
      "/api/config/tender-types",
      tenderData,
    );

    // THEN: Tender type is created successfully
    expect(response.status(), "Expected 201 Created").toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.tender_type_id, "Should have ID").toBeDefined();
    expect(body.data.code).toBe("CUSTOM_PAY");
    expect(body.data.display_name).toBe("Custom Payment Method");
    expect(body.data.is_electronic).toBe(true);
    expect(body.data.is_system, "Client types should not be system").toBe(
      false,
    );
    expect(body.data.is_active, "New types should be active").toBe(true);
  });

  test("1.1-API-021: [P0] POST /api/config/tender-types - should enforce unique code per client", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I create a tender type
    const tenderData = {
      code: "UNIQUE_TEST",
      display_name: "Unique Test Type",
    };

    const firstResponse = await clientUserApiRequest.post(
      "/api/config/tender-types",
      tenderData,
    );
    expect(firstResponse.status()).toBe(201);

    // WHEN: Creating another with the same code
    const duplicateResponse = await clientUserApiRequest.post(
      "/api/config/tender-types",
      tenderData,
    );

    // THEN: Returns 409 Conflict
    expect(duplicateResponse.status()).toBe(409);
    const body = await duplicateResponse.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("DUPLICATE_CODE");
  });

  test("1.1-API-022: [P1] POST /api/config/tender-types - should validate code format", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: Invalid code format (lowercase, special chars)
    const invalidData = {
      code: "invalid-code!",
      display_name: "Invalid Code Format",
    };

    // WHEN: Creating with invalid code
    const response = await clientUserApiRequest.post(
      "/api/config/tender-types",
      invalidData,
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("1.1-API-023: [P1] POST /api/config/tender-types - should validate required fields", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: Missing required fields
    const invalidData = {
      description: "Missing code and display_name",
    };

    // WHEN: Creating with missing fields
    const response = await clientUserApiRequest.post(
      "/api/config/tender-types",
      invalidData,
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("1.1-API-024: [P1] POST /api/config/tender-types - should validate color_code format", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: Invalid color code format
    const invalidData = {
      code: "COLOR_TEST",
      display_name: "Color Test",
      color_code: "not-a-color",
    };

    // WHEN: Creating with invalid color
    const response = await clientUserApiRequest.post(
      "/api/config/tender-types",
      invalidData,
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("1.1-API-025: [P0] POST /api/config/tender-types - should accept valid hex color", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: Valid color code format
    const validData = {
      code: "COLORED_TYPE",
      display_name: "Colored Type",
      color_code: "#FF5733",
    };

    // WHEN: Creating with valid color
    const response = await clientUserApiRequest.post(
      "/api/config/tender-types",
      validData,
    );

    // THEN: Created successfully
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.data.color_code).toBe("#FF5733");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATE TENDER TYPE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1.1-API-030: [P0] PATCH /api/config/tender-types/:id - should update client tender type", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I create a tender type first
    const createResponse = await clientUserApiRequest.post(
      "/api/config/tender-types",
      {
        code: "UPDATE_TEST",
        display_name: "Original Name",
        sort_order: 50,
      },
    );
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();
    const tenderId = created.data.tender_type_id;

    // WHEN: Updating the tender type
    const updateResponse = await clientUserApiRequest.patch(
      `/api/config/tender-types/${tenderId}`,
      {
        display_name: "Updated Name",
        description: "Added description",
        sort_order: 75,
      },
    );

    // THEN: Update succeeds
    expect(updateResponse.status()).toBe(200);
    const body = await updateResponse.json();
    expect(body.success).toBe(true);
    expect(body.data.display_name).toBe("Updated Name");
    expect(body.data.description).toBe("Added description");
    expect(body.data.sort_order).toBe(75);
    expect(body.data.code, "Code should not change").toBe("UPDATE_TEST");
  });

  test("1.1-API-031: [P1] PATCH /api/config/tender-types/:id - should return 404 for non-existent ID", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: A non-existent UUID
    const fakeId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Updating non-existent tender type
    const response = await clientUserApiRequest.patch(
      `/api/config/tender-types/${fakeId}`,
      {
        display_name: "New Name",
      },
    );

    // THEN: Returns 404
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  test("1.1-API-032: [P0] PATCH /api/config/tender-types/:id - should not allow modifying system tender type behavior flags", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: Get a system tender type (CASH)
    const listResponse = await clientUserApiRequest.get(
      "/api/config/tender-types",
    );
    const list = await listResponse.json();
    const cashTender = list.data.find(
      (t: { code: string; is_system: boolean }) =>
        t.code === "CASH" && t.is_system,
    );
    expect(cashTender, "Should have system CASH tender").toBeDefined();

    // WHEN: Attempting to modify behavior flags of system tender type
    // Note: Display fields (display_name, description, sort_order, icon_name, color_code)
    // ARE allowed on system types. Behavior flags are NOT allowed.
    const response = await clientUserApiRequest.patch(
      `/api/config/tender-types/${cashTender.tender_type_id}`,
      {
        is_cash_equivalent: false, // This is a behavior flag, not allowed on system types
      },
    );

    // THEN: Returns 403 Forbidden
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("1.1-API-033: [P1] PATCH /api/config/tender-types/:id - should allow updating display fields on system tender types", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: Get a system tender type (CASH)
    const listResponse = await clientUserApiRequest.get(
      "/api/config/tender-types",
    );
    const list = await listResponse.json();
    const cashTender = list.data.find(
      (t: { code: string; is_system: boolean }) =>
        t.code === "CASH" && t.is_system,
    );
    expect(cashTender, "Should have system CASH tender").toBeDefined();

    // WHEN: Updating only display fields (allowed on system types)
    const response = await clientUserApiRequest.patch(
      `/api/config/tender-types/${cashTender.tender_type_id}`,
      {
        description: "Updated system cash description",
        sort_order: 99,
      },
    );

    // THEN: Returns 200 OK (display fields are allowed)
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.description).toBe("Updated system cash description");
    expect(body.data.sort_order).toBe(99);

    // Cleanup: Restore original values
    await clientUserApiRequest.patch(
      `/api/config/tender-types/${cashTender.tender_type_id}`,
      {
        description: cashTender.description,
        sort_order: cashTender.sort_order,
      },
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE (DEACTIVATE) TENDER TYPE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1.1-API-040: [P0] DELETE /api/config/tender-types/:id - should soft delete (deactivate) tender type", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I create a tender type first
    const createResponse = await clientUserApiRequest.post(
      "/api/config/tender-types",
      {
        code: "DELETE_TEST",
        display_name: "To Be Deleted",
      },
    );
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();
    const tenderId = created.data.tender_type_id;

    // WHEN: Deleting the tender type
    const deleteResponse = await clientUserApiRequest.delete(
      `/api/config/tender-types/${tenderId}`,
    );

    // THEN: Delete succeeds
    expect(deleteResponse.status()).toBe(200);
    const body = await deleteResponse.json();
    expect(body.success).toBe(true);
    expect(body.data.is_active, "Should be deactivated").toBe(false);

    // AND: Record still exists in database (soft delete)
    const record = await prismaClient.tenderType.findUnique({
      where: { tender_type_id: tenderId },
    });
    expect(record, "Record should still exist").not.toBeNull();
    expect(record?.is_active, "Should be marked inactive").toBe(false);
  });

  test("1.1-API-041: [P0] DELETE /api/config/tender-types/:id - should not allow deleting system tender types", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: Get a system tender type (CREDIT)
    const listResponse = await clientUserApiRequest.get(
      "/api/config/tender-types",
    );
    const list = await listResponse.json();
    const creditTender = list.data.find(
      (t: { code: string; is_system: boolean }) =>
        t.code === "CREDIT" && t.is_system,
    );
    expect(creditTender, "Should have system CREDIT tender").toBeDefined();

    // WHEN: Attempting to delete system tender type
    const response = await clientUserApiRequest.delete(
      `/api/config/tender-types/${creditTender.tender_type_id}`,
    );

    // THEN: Returns 403 Forbidden
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("1.1-API-042: [P1] DELETE /api/config/tender-types/:id - should return 404 for non-existent ID", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: A non-existent UUID
    const fakeId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Deleting non-existent tender type
    const response = await clientUserApiRequest.delete(
      `/api/config/tender-types/${fakeId}`,
    );

    // THEN: Returns 404
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PERMISSION & SECURITY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1.1-API-050: [P0] Security - should require authentication for all endpoints", async ({
    apiRequest,
  }) => {
    // GIVEN: No authentication

    // WHEN: Accessing various endpoints without auth
    const endpoints = [
      { method: "get", path: "/api/config/tender-types" },
      {
        method: "get",
        path: "/api/config/tender-types/00000000-0000-0000-0000-000000000000",
      },
      { method: "post", path: "/api/config/tender-types" },
      {
        method: "patch",
        path: "/api/config/tender-types/00000000-0000-0000-0000-000000000000",
      },
      {
        method: "delete",
        path: "/api/config/tender-types/00000000-0000-0000-0000-000000000000",
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

  test("1.1-API-051: [P0] Security - superadmin should have full access", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Superadmin authentication

    // WHEN: Listing tender types
    const response = await superadminApiRequest.get("/api/config/tender-types");

    // THEN: Access granted
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });
});
