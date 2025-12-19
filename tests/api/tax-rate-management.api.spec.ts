import { test, expect } from "../support/fixtures/rbac.fixture";

/**
 * TaxRate Management API Tests
 *
 * Tests for TaxRate Management API endpoints:
 * - List tax rates (system + client-specific)
 * - Get tax rate by ID
 * - Create client-specific tax rates
 * - Update tax rate information
 * - Soft delete (deactivate) tax rates
 * - Effective date range handling
 * - Jurisdiction level filtering
 * - RLS enforcement for client isolation
 * - Permission enforcement (TAX_RATE_READ, TAX_RATE_MANAGE)
 * - Security: Authentication, Authorization, Input Validation
 *
 * Phase 1.3: Shift & Day Summary Implementation Plan
 * Priority: P1 (Core configuration management)
 */

test.describe("Phase1.3-API: TaxRate Management - CRUD Operations", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // LIST TAX RATES TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1.3-API-001: [P0] GET /api/config/tax-rates - should list tax rates for authenticated user", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Client User with TAX_RATE_READ permission

    // WHEN: Fetching tax rates via API
    const response = await clientUserApiRequest.get("/api/config/tax-rates");

    // THEN: Request succeeds
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(Array.isArray(body.data), "Response data should be an array").toBe(
      true,
    );

    // AND: Each tax rate has required fields (if any exist)
    if (body.data.length > 0) {
      const firstRate = body.data[0];
      expect(firstRate.tax_rate_id, "Should have ID").toBeDefined();
      expect(firstRate.code, "Should have code").toBeDefined();
      expect(firstRate.display_name, "Should have display name").toBeDefined();
      expect(firstRate.rate, "Should have rate").toBeDefined();
    }
  });

  test("1.3-API-002: [P0] GET /api/config/tax-rates - should return sorted by sort_order", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I create some tax rates with different sort orders
    await clientUserApiRequest.post("/api/config/tax-rates", {
      code: "SORT_TEST_3",
      display_name: "Sort Test 3",
      rate: 0.05,
      jurisdiction_level: "STATE",
      effective_from: "2024-01-01",
      sort_order: 30,
    });
    await clientUserApiRequest.post("/api/config/tax-rates", {
      code: "SORT_TEST_1",
      display_name: "Sort Test 1",
      rate: 0.05,
      jurisdiction_level: "STATE",
      effective_from: "2024-01-01",
      sort_order: 10,
    });
    await clientUserApiRequest.post("/api/config/tax-rates", {
      code: "SORT_TEST_2",
      display_name: "Sort Test 2",
      rate: 0.05,
      jurisdiction_level: "STATE",
      effective_from: "2024-01-01",
      sort_order: 20,
    });

    // WHEN: Fetching tax rates
    const response = await clientUserApiRequest.get("/api/config/tax-rates");

    // THEN: Results are sorted by sort_order
    expect(response.status()).toBe(200);
    const body = await response.json();

    // Filter to just our test rates
    const sortTestRates = body.data.filter((r: { code: string }) =>
      r.code.startsWith("SORT_TEST_"),
    );
    const sortOrders = sortTestRates.map(
      (r: { sort_order: number }) => r.sort_order,
    );
    const sortedOrders = [...sortOrders].sort((a, b) => a - b);
    expect(sortOrders, "Should be sorted by sort_order").toEqual(sortedOrders);
  });

  test("1.3-API-003: [P1] GET /api/config/tax-rates - should filter inactive when include_inactive=false", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I create a tax rate and deactivate it
    const createResponse = await clientUserApiRequest.post(
      "/api/config/tax-rates",
      {
        code: "TAX_INACTIVE",
        display_name: "Inactive Tax Rate",
        rate: 0.08,
        jurisdiction_level: "STATE",
        effective_from: "2024-01-01",
      },
    );
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();
    const taxId = created.data.tax_rate_id;

    // Deactivate it
    await clientUserApiRequest.delete(`/api/config/tax-rates/${taxId}`);

    // WHEN: Fetching without include_inactive
    const response = await clientUserApiRequest.get("/api/config/tax-rates");

    // THEN: Deactivated tax rate is not included
    const body = await response.json();
    const found = body.data.find(
      (t: { tax_rate_id: string }) => t.tax_rate_id === taxId,
    );
    expect(
      found,
      "Inactive tax rate should not be in default list",
    ).toBeUndefined();

    // WHEN: Fetching with include_inactive=true
    const responseWithInactive = await clientUserApiRequest.get(
      "/api/config/tax-rates?include_inactive=true",
    );

    // THEN: Deactivated tax rate IS included
    const bodyWithInactive = await responseWithInactive.json();
    const foundInactive = bodyWithInactive.data.find(
      (t: { tax_rate_id: string }) => t.tax_rate_id === taxId,
    );
    expect(
      foundInactive,
      "Inactive tax rate should be in list when requested",
    ).toBeDefined();
    expect(foundInactive.is_active, "Should be marked inactive").toBe(false);
  });

  test("1.3-API-004: [P1] GET /api/config/tax-rates - should filter by jurisdiction_level", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I create tax rates with different jurisdiction levels
    await clientUserApiRequest.post("/api/config/tax-rates", {
      code: "STATE_TAX_FILTER",
      display_name: "State Tax Filter Test",
      rate: 0.0625,
      jurisdiction_level: "STATE",
      effective_from: "2024-01-01",
    });
    await clientUserApiRequest.post("/api/config/tax-rates", {
      code: "CITY_TAX_FILTER",
      display_name: "City Tax Filter Test",
      rate: 0.02,
      jurisdiction_level: "CITY",
      effective_from: "2024-01-01",
    });

    // WHEN: Filtering by STATE jurisdiction
    const response = await clientUserApiRequest.get(
      "/api/config/tax-rates?jurisdiction_level=STATE",
    );

    // THEN: Only STATE rates are returned
    expect(response.status()).toBe(200);
    const body = await response.json();

    // All returned rates should be STATE level
    for (const rate of body.data) {
      expect(rate.jurisdiction_level, `${rate.code} should be STATE`).toBe(
        "STATE",
      );
    }

    // City tax should not be present
    const cityTax = body.data.find(
      (r: { code: string }) => r.code === "CITY_TAX_FILTER",
    );
    expect(
      cityTax,
      "CITY tax should not be in STATE filter results",
    ).toBeUndefined();
  });

  test("1.3-API-005: [P0] GET /api/config/tax-rates - should reject unauthenticated request", async ({
    apiRequest,
  }) => {
    // GIVEN: No authentication token

    // WHEN: Fetching tax rates without auth
    const response = await apiRequest.get("/api/config/tax-rates");

    // THEN: Request is rejected with 401
    expect(response.status(), "Should return 401 Unauthorized").toBe(401);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET SINGLE TAX RATE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1.3-API-010: [P0] GET /api/config/tax-rates/:id - should get tax rate by ID", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I create a tax rate first
    const createResponse = await clientUserApiRequest.post(
      "/api/config/tax-rates",
      {
        code: "GET_BY_ID_TEST",
        display_name: "Get By ID Test",
        rate: 0.0725,
        jurisdiction_level: "STATE",
        effective_from: "2024-01-01",
      },
    );
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();
    const taxId = created.data.tax_rate_id;

    // WHEN: Fetching by ID
    const response = await clientUserApiRequest.get(
      `/api/config/tax-rates/${taxId}`,
    );

    // THEN: Returns the tax rate
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.code).toBe("GET_BY_ID_TEST");
    expect(body.data.tax_rate_id).toBe(taxId);
  });

  test("1.3-API-011: [P1] GET /api/config/tax-rates/:id - should return 404 for non-existent ID", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: A non-existent UUID
    const fakeId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Fetching by non-existent ID
    const response = await clientUserApiRequest.get(
      `/api/config/tax-rates/${fakeId}`,
    );

    // THEN: Returns 404
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  test("1.3-API-012: [P1] GET /api/config/tax-rates/:id - should return 400 for invalid UUID", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: An invalid UUID format
    const invalidId = "not-a-uuid";

    // WHEN: Fetching with invalid ID
    const response = await clientUserApiRequest.get(
      `/api/config/tax-rates/${invalidId}`,
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE TAX RATE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1.3-API-020: [P0] POST /api/config/tax-rates - should create client-specific tax rate", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: Valid tax rate data
    const taxData = {
      code: "CUSTOM_TAX",
      display_name: "Custom Tax Rate",
      description: "A custom tax rate for testing",
      rate: 0.0825,
      rate_type: "PERCENTAGE",
      jurisdiction_level: "STATE",
      jurisdiction_code: "TX",
      effective_from: "2024-01-01",
      sort_order: 100,
    };

    // WHEN: Creating tax rate via API
    const response = await clientUserApiRequest.post(
      "/api/config/tax-rates",
      taxData,
    );

    // THEN: Tax rate is created successfully
    expect(response.status(), "Expected 201 Created").toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.tax_rate_id, "Should have ID").toBeDefined();
    expect(body.data.code).toBe("CUSTOM_TAX");
    expect(body.data.display_name).toBe("Custom Tax Rate");
    expect(body.data.jurisdiction_level).toBe("STATE");
    expect(body.data.is_active, "New rates should be active").toBe(true);
  });

  test("1.3-API-021: [P0] POST /api/config/tax-rates - should enforce unique code per client and effective date", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I create a tax rate
    const taxData = {
      code: "UNIQUE_TAX_TEST",
      display_name: "Unique Tax Test",
      rate: 0.07,
      jurisdiction_level: "STATE",
      effective_from: "2024-01-01",
    };

    const firstResponse = await clientUserApiRequest.post(
      "/api/config/tax-rates",
      taxData,
    );
    expect(firstResponse.status()).toBe(201);

    // WHEN: Creating another with the same code and effective date
    const duplicateResponse = await clientUserApiRequest.post(
      "/api/config/tax-rates",
      taxData,
    );

    // THEN: Returns 409 Conflict
    expect(duplicateResponse.status()).toBe(409);
    const body = await duplicateResponse.json();
    expect(body.success).toBe(false);
    // Could be DUPLICATE_CODE or OVERLAPPING_DATES
    expect(["DUPLICATE_CODE", "OVERLAPPING_DATES"]).toContain(body.error.code);
  });

  test("1.3-API-022: [P1] POST /api/config/tax-rates - should validate code format", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: Invalid code format (lowercase, special chars)
    const invalidData = {
      code: "invalid-tax!",
      display_name: "Invalid Code Format",
      rate: 0.05,
      jurisdiction_level: "STATE",
      effective_from: "2024-01-01",
    };

    // WHEN: Creating with invalid code
    const response = await clientUserApiRequest.post(
      "/api/config/tax-rates",
      invalidData,
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("1.3-API-023: [P1] POST /api/config/tax-rates - should validate required fields", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: Missing required fields
    const invalidData = {
      description: "Missing code, rate, jurisdiction, effective_from",
    };

    // WHEN: Creating with missing fields
    const response = await clientUserApiRequest.post(
      "/api/config/tax-rates",
      invalidData,
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("1.3-API-024: [P1] POST /api/config/tax-rates - should validate rate is valid decimal", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: Invalid rate format
    const invalidData = {
      code: "RATE_TEST",
      display_name: "Rate Test",
      rate: "not-a-number",
      jurisdiction_level: "STATE",
      effective_from: "2024-01-01",
    };

    // WHEN: Creating with invalid rate
    const response = await clientUserApiRequest.post(
      "/api/config/tax-rates",
      invalidData,
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("1.3-API-025: [P1] POST /api/config/tax-rates - should validate jurisdiction_level enum", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: Invalid jurisdiction level
    const invalidData = {
      code: "JURISDICTION_TEST",
      display_name: "Jurisdiction Test",
      rate: 0.05,
      jurisdiction_level: "INVALID_LEVEL",
      effective_from: "2024-01-01",
    };

    // WHEN: Creating with invalid jurisdiction
    const response = await clientUserApiRequest.post(
      "/api/config/tax-rates",
      invalidData,
    );

    // THEN: Returns 400 validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("1.3-API-026: [P0] POST /api/config/tax-rates - should create with effective date range", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: Tax rate with effective date range
    const taxData = {
      code: "DATE_RANGE_TAX",
      display_name: "Date Range Tax",
      rate: 0.06,
      jurisdiction_level: "STATE",
      effective_from: "2024-01-01",
      effective_to: "2024-12-31",
    };

    // WHEN: Creating tax rate with date range
    const response = await clientUserApiRequest.post(
      "/api/config/tax-rates",
      taxData,
    );

    // THEN: Created successfully with date range
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.data.effective_from).toBeDefined();
    expect(body.data.effective_to).toBeDefined();
  });

  test("1.3-API-027: [P1] POST /api/config/tax-rates - should support different jurisdiction levels", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: Tax rates at different jurisdiction levels
    const jurisdictions = [
      "FEDERAL",
      "STATE",
      "COUNTY",
      "CITY",
      "DISTRICT",
      "COMBINED",
    ];

    for (const level of jurisdictions) {
      const taxData = {
        code: `${level}_LEVEL_TAX`,
        display_name: `${level} Level Tax`,
        rate: 0.05,
        jurisdiction_level: level,
        effective_from: "2024-01-01",
      };

      // WHEN: Creating tax rate at each level
      const response = await clientUserApiRequest.post(
        "/api/config/tax-rates",
        taxData,
      );

      // THEN: Created successfully
      expect(response.status(), `${level} jurisdiction should be valid`).toBe(
        201,
      );
      const body = await response.json();
      expect(body.data.jurisdiction_level).toBe(level);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATE TAX RATE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1.3-API-030: [P0] PATCH /api/config/tax-rates/:id - should update client tax rate", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I create a tax rate first
    const createResponse = await clientUserApiRequest.post(
      "/api/config/tax-rates",
      {
        code: "TAX_UPDATE_TEST",
        display_name: "Original Name",
        rate: 0.05,
        jurisdiction_level: "STATE",
        effective_from: "2024-01-01",
        sort_order: 50,
      },
    );
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();
    const taxId = created.data.tax_rate_id;

    // WHEN: Updating the tax rate
    const updateResponse = await clientUserApiRequest.patch(
      `/api/config/tax-rates/${taxId}`,
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
    expect(body.data.code, "Code should not change").toBe("TAX_UPDATE_TEST");
  });

  test("1.3-API-031: [P1] PATCH /api/config/tax-rates/:id - should return 404 for non-existent ID", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: A non-existent UUID
    const fakeId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Updating non-existent tax rate
    const response = await clientUserApiRequest.patch(
      `/api/config/tax-rates/${fakeId}`,
      {
        display_name: "New Name",
      },
    );

    // THEN: Returns 404
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE (DEACTIVATE) TAX RATE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1.3-API-040: [P0] DELETE /api/config/tax-rates/:id - should soft delete (deactivate) tax rate", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I create a tax rate first
    const createResponse = await clientUserApiRequest.post(
      "/api/config/tax-rates",
      {
        code: "TAX_DELETE_TEST",
        display_name: "To Be Deleted",
        rate: 0.08,
        jurisdiction_level: "STATE",
        effective_from: "2024-01-01",
      },
    );
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();
    const taxId = created.data.tax_rate_id;

    // WHEN: Deleting the tax rate
    const deleteResponse = await clientUserApiRequest.delete(
      `/api/config/tax-rates/${taxId}`,
    );

    // THEN: Delete succeeds
    expect(deleteResponse.status()).toBe(200);
    const body = await deleteResponse.json();
    expect(body.success).toBe(true);
    expect(body.data.is_active, "Should be deactivated").toBe(false);

    // AND: Record still exists in database (soft delete)
    const record = await prismaClient.taxRate.findUnique({
      where: { tax_rate_id: taxId },
    });
    expect(record, "Record should still exist").not.toBeNull();
    expect(record?.is_active, "Should be marked inactive").toBe(false);
  });

  test("1.3-API-041: [P1] DELETE /api/config/tax-rates/:id - should return 404 for non-existent ID", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: A non-existent UUID
    const fakeId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Deleting non-existent tax rate
    const response = await clientUserApiRequest.delete(
      `/api/config/tax-rates/${fakeId}`,
    );

    // THEN: Returns 404
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PERMISSION & SECURITY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("1.3-API-050: [P0] Security - should require authentication for all endpoints", async ({
    apiRequest,
  }) => {
    // GIVEN: No authentication

    // WHEN: Accessing various endpoints without auth
    const endpoints = [
      { method: "get", path: "/api/config/tax-rates" },
      {
        method: "get",
        path: "/api/config/tax-rates/00000000-0000-0000-0000-000000000000",
      },
      { method: "post", path: "/api/config/tax-rates" },
      {
        method: "patch",
        path: "/api/config/tax-rates/00000000-0000-0000-0000-000000000000",
      },
      {
        method: "delete",
        path: "/api/config/tax-rates/00000000-0000-0000-0000-000000000000",
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

  test("1.3-API-051: [P0] Security - superadmin should have full access", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Superadmin authentication

    // WHEN: Listing tax rates
    const response = await superadminApiRequest.get("/api/config/tax-rates");

    // THEN: Access granted
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });
});
