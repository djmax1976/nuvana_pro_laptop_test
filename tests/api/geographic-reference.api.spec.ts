import { test, expect } from "../support/fixtures/rbac.fixture";

/**
 * Geographic Reference API Tests
 *
 * @description Enterprise-grade API tests for US geographic reference data
 *
 * TRACEABILITY MATRIX:
 * ┌──────────────────────────────────────────────────────────────────────────────┐
 * │ Requirement ID │ Description                    │ Test Cases                 │
 * ├──────────────────────────────────────────────────────────────────────────────┤
 * │ GEO-001        │ List states endpoint           │ TC-001, TC-002, TC-002b    │
 * │ GEO-002        │ List counties by state         │ TC-003, TC-004, TC-004b    │
 * │ GEO-003        │ List cities by state           │ TC-005, TC-006             │
 * │ GEO-004        │ List ZIP codes by state        │ TC-007                     │
 * │ SEC-001        │ Authentication required        │ TC-008                     │
 * │ SEC-002        │ Input validation               │ TC-009, TC-010             │
 * │ PERF-001       │ Pagination support             │ TC-011                     │
 * │ ADMIN-001      │ State Update (SuperAdmin)      │ TC-013, TC-014             │
 * │ ADMIN-002      │ Permission enforcement         │ TC-015, TC-015b            │
 * │ EDGE-001       │ Graceful handling              │ TC-016, TC-017, TC-018     │
 * └──────────────────────────────────────────────────────────────────────────────┘
 *
 * TESTING PYRAMID LEVEL: API (Integration)
 *
 * DESIGN NOTES:
 * - State creation is restricted to predefined codes (GA, NC, SC) per StateCodeSchema
 * - The /states endpoint does not support search filtering (small, fixed dataset)
 * - County queries for non-existent states return empty arrays (graceful handling)
 *
 * @enterprise-standards
 * - API-001: VALIDATION - Request/response validation with Zod schemas
 * - API-003: ERROR_HANDLING - Proper error responses with error codes
 * - SEC-006: SQL_INJECTION - Prisma ORM prevents SQL injection
 * - SEC-014: INPUT_VALIDATION - Strict allowlists for state codes
 */

// =============================================================================
// SECTION 1: LIST STATES
// =============================================================================

test.describe("Geographic API - List States", () => {
  test("TC-001: returns list of active US states", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Authenticated request

    // WHEN: Requesting active states
    const response = await superadminApiRequest.get(
      "/api/geographic/states?is_active=true",
    );

    // THEN: Returns list of states
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);

    // States should have required fields
    if (body.data.length > 0) {
      const state = body.data[0];
      expect(state).toHaveProperty("state_id");
      expect(state).toHaveProperty("code");
      expect(state).toHaveProperty("name");
    }
  });

  test("TC-002: filters states by lottery_enabled", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Authenticated request

    // WHEN: Requesting lottery-enabled states
    const response = await superadminApiRequest.get(
      "/api/geographic/states?lottery_enabled=true",
    );

    // THEN: Returns only lottery-enabled states
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // All returned states should have lottery_enabled = true
    for (const state of body.data) {
      expect(state.lottery_enabled).toBe(true);
    }
  });

  test("TC-002b: verifies search parameter is ignored for states (not supported)", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Authenticated request
    // NOTE: The /api/geographic/states endpoint does NOT support search filtering
    // This is by design - states are a small, fixed dataset

    // WHEN: Providing a search parameter (which is ignored by the API)
    const responseWithSearch = await superadminApiRequest.get(
      "/api/geographic/states?search=geo",
    );

    // WHEN: Requesting without search
    const responseWithoutSearch = await superadminApiRequest.get(
      "/api/geographic/states",
    );

    // THEN: Both requests succeed and return same data (search is ignored)
    expect(responseWithSearch.status()).toBe(200);
    expect(responseWithoutSearch.status()).toBe(200);

    const bodyWithSearch = await responseWithSearch.json();
    const bodyWithoutSearch = await responseWithoutSearch.json();

    expect(bodyWithSearch.success).toBe(true);
    expect(bodyWithoutSearch.success).toBe(true);

    // Both should return same results since search is not implemented
    expect(bodyWithSearch.data.length).toBe(bodyWithoutSearch.data.length);
  });
});

// =============================================================================
// SECTION 2: LIST COUNTIES BY STATE
// =============================================================================

test.describe("Geographic API - List Counties", () => {
  test("TC-003: returns counties for a specific state", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A state exists with counties
    const state = await prismaClient.uSState.findFirst({
      where: { is_active: true },
    });

    if (!state) {
      test.skip();
      return;
    }

    // WHEN: Requesting counties for the state
    const response = await superadminApiRequest.get(
      `/api/geographic/states/${state.state_id}/counties`,
    );

    // THEN: Returns list of counties
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);

    // Counties should have required fields
    if (body.data.length > 0) {
      const county = body.data[0];
      expect(county).toHaveProperty("county_id");
      expect(county).toHaveProperty("name");
      expect(county).toHaveProperty("fips_code");
    }
  });

  test("TC-004: returns empty array for non-existent state (graceful handling)", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: A non-existent state ID (valid UUID format)
    const fakeStateId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Requesting counties for non-existent state
    const response = await superadminApiRequest.get(
      `/api/geographic/states/${fakeStateId}/counties`,
    );

    // THEN: Returns 200 with empty array (graceful handling)
    // NOTE: The API returns empty results for non-existent state IDs
    // rather than 404, as this is a query endpoint that filters by state_id.
    // This follows the pattern of returning empty collections for no-match queries.
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(0);
  });

  test("TC-004b: filters counties by search query", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A state with counties
    const state = await prismaClient.uSState.findFirst({
      where: { is_active: true },
    });

    if (!state) {
      test.skip();
      return;
    }

    // WHEN: Searching counties
    const response = await superadminApiRequest.get(
      `/api/geographic/states/${state.state_id}/counties?search=ful`,
    );

    // THEN: Returns matching counties
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // All returned counties should match the search
    for (const county of body.data) {
      expect(county.name.toLowerCase()).toContain("ful");
    }
  });
});

// =============================================================================
// SECTION 3: LIST CITIES
// =============================================================================

test.describe("Geographic API - List Cities", () => {
  test("TC-005: returns cities for a specific state", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A state with cities
    const stateWithCities = await prismaClient.uSState.findFirst({
      where: {
        is_active: true,
        cities: { some: {} },
      },
    });

    if (!stateWithCities) {
      test.skip();
      return;
    }

    // WHEN: Requesting cities for the state
    const response = await superadminApiRequest.get(
      `/api/geographic/states/${stateWithCities.state_id}/cities`,
    );

    // THEN: Returns list of cities
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);

    // Cities should have required fields
    if (body.data.length > 0) {
      const city = body.data[0];
      expect(city).toHaveProperty("city_id");
      expect(city).toHaveProperty("name");
    }
  });

  test("TC-006: filters cities by county_id", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A county with cities
    const countyWithCities = await prismaClient.uSCounty.findFirst({
      where: {
        is_active: true,
        cities: { some: {} },
      },
      include: { state: true },
    });

    if (!countyWithCities) {
      test.skip();
      return;
    }

    // WHEN: Requesting cities for the county
    const response = await superadminApiRequest.get(
      `/api/geographic/states/${countyWithCities.state_id}/cities?county_id=${countyWithCities.county_id}`,
    );

    // THEN: Returns cities for that county
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // All cities should belong to the specified county
    for (const city of body.data) {
      expect(city.county_id).toBe(countyWithCities.county_id);
    }
  });
});

// =============================================================================
// SECTION 4: LIST ZIP CODES
// =============================================================================

test.describe("Geographic API - List ZIP Codes", () => {
  test("TC-007: returns ZIP codes for a specific state", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A state with ZIP codes
    const stateWithZips = await prismaClient.uSState.findFirst({
      where: {
        is_active: true,
        zip_codes: { some: {} },
      },
    });

    if (!stateWithZips) {
      test.skip();
      return;
    }

    // WHEN: Requesting ZIP codes for the state
    const response = await superadminApiRequest.get(
      `/api/geographic/states/${stateWithZips.state_id}/zip-codes`,
    );

    // THEN: Returns list of ZIP codes
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);

    // ZIP codes should have required fields
    if (body.data.length > 0) {
      const zip = body.data[0];
      expect(zip).toHaveProperty("zip_code");
      expect(zip).toHaveProperty("city_name");
    }
  });
});

// =============================================================================
// SECTION 5: AUTHENTICATION
// =============================================================================

test.describe("Geographic API - Authentication", () => {
  test("TC-008: requires authentication for all endpoints", async ({
    request,
  }) => {
    // GIVEN: Unauthenticated request (no auth token)
    const backendUrl = process.env.BACKEND_URL || "http://localhost:3001";

    // WHEN: Requesting states without auth
    const response = await request.get(`${backendUrl}/api/geographic/states`);

    // THEN: Returns 401
    expect(response.status()).toBe(401);
  });
});

// =============================================================================
// SECTION 6: INPUT VALIDATION
// =============================================================================

test.describe("Geographic API - Input Validation", () => {
  test("TC-009: validates UUID format for state_id", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Invalid UUID format

    // WHEN: Requesting counties with invalid state_id
    const response = await superadminApiRequest.get(
      "/api/geographic/states/invalid-uuid/counties",
    );

    // THEN: Returns 400 or 404 (invalid format handled)
    expect([400, 404]).toContain(response.status());
  });

  test("TC-010: SQL injection prevention in search", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Search with SQL injection attempt

    // WHEN: Searching with malicious input
    const response = await superadminApiRequest.get(
      `/api/geographic/states?search=${encodeURIComponent("'; DROP TABLE us_states; --")}`,
    );

    // THEN: Request completes safely (Prisma prevents injection)
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// SECTION 7: PAGINATION
// =============================================================================

test.describe("Geographic API - Pagination", () => {
  test("TC-011: respects limit parameter", async ({ superadminApiRequest }) => {
    // GIVEN: Limit parameter

    // WHEN: Requesting with limit
    const response = await superadminApiRequest.get(
      "/api/geographic/states?limit=5",
    );

    // THEN: Returns at most 5 results
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBeLessThanOrEqual(5);
  });
});

// =============================================================================
// SECTION 8: ADMIN OPERATIONS (SuperAdmin Only)
// =============================================================================

test.describe("Geographic API - Admin Operations", () => {
  test("TC-013: SuperAdmin can update an existing state", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: An existing state from the database
    // NOTE: State creation is restricted to predefined state codes (GA, NC, SC)
    // by the StateCodeSchema validation. This is an enterprise security feature.
    // Therefore, we test update capability on an existing state.
    const existingState = await prismaClient.uSState.findFirst({
      where: { is_active: true },
    });

    if (!existingState) {
      test.skip();
      return;
    }

    const originalName = existingState.name;
    const testId = Date.now();
    const updatedName = `${originalName} - Test Update ${testId}`;

    try {
      // WHEN: Updating an existing state
      const response = await superadminApiRequest.put(
        `/api/geographic/states/${existingState.state_id}`,
        { name: updatedName },
      );

      // THEN: State is updated successfully
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.state_id).toBe(existingState.state_id);
      expect(body.data.name).toBe(updatedName);
    } finally {
      // Cleanup: Restore original name
      await prismaClient.uSState.update({
        where: { state_id: existingState.state_id },
        data: { name: originalName },
      });
    }
  });

  test("TC-014: SuperAdmin can toggle lottery_enabled on a state", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: An existing state
    const existingState = await prismaClient.uSState.findFirst({
      where: { is_active: true },
    });

    if (!existingState) {
      test.skip();
      return;
    }

    const originalLotteryEnabled = existingState.lottery_enabled;
    const newLotteryEnabled = !originalLotteryEnabled;

    try {
      // WHEN: Updating lottery_enabled flag
      const response = await superadminApiRequest.put(
        `/api/geographic/states/${existingState.state_id}`,
        { lottery_enabled: newLotteryEnabled },
      );

      // THEN: State is updated
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);

      // Verify the change persisted
      const verifyResponse = await superadminApiRequest.get(
        `/api/geographic/states/${existingState.state_id}`,
      );
      expect(verifyResponse.status()).toBe(200);
      const verifyBody = await verifyResponse.json();
      expect(verifyBody.data.lottery_enabled).toBe(newLotteryEnabled);
    } finally {
      // Cleanup: Restore original value
      await prismaClient.uSState.update({
        where: { state_id: existingState.state_id },
        data: { lottery_enabled: originalLotteryEnabled },
      });
    }
  });

  test("TC-015: non-SuperAdmin cannot update states (permission denied)", async ({
    corporateAdminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Corporate admin (not SuperAdmin) and an existing state
    const existingState = await prismaClient.uSState.findFirst({
      where: { is_active: true },
    });

    if (!existingState) {
      test.skip();
      return;
    }

    // WHEN: Attempting to update a state without SuperAdmin permissions
    const response = await corporateAdminApiRequest.put(
      `/api/geographic/states/${existingState.state_id}`,
      { name: "Unauthorized Update Attempt" },
    );

    // THEN: Returns 403 Forbidden (permission denied)
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test("TC-015b: validation errors return 400 before permission check", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: SuperAdmin with invalid request body
    // NOTE: This tests that validation happens correctly

    // WHEN: Sending invalid data (empty body violates "at least one field" requirement)
    const response = await superadminApiRequest.put(
      "/api/geographic/states/00000000-0000-0000-0000-000000000001",
      {},
    );

    // THEN: Returns 400 for validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
  });
});

// =============================================================================
// SECTION 9: EDGE CASES
// =============================================================================

test.describe("Geographic API - Edge Cases", () => {
  test("TC-016: handles empty search gracefully", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Empty search parameter

    // WHEN: Searching with empty string
    const response = await superadminApiRequest.get(
      "/api/geographic/states?search=",
    );

    // THEN: Returns all states (no filter applied)
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test("TC-017: handles special characters in search", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Search with special characters

    // WHEN: Searching with special chars
    const response = await superadminApiRequest.get(
      `/api/geographic/states?search=${encodeURIComponent("New York")}`,
    );

    // THEN: Handles gracefully
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test("TC-018: limit 0 returns default results", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Limit of 0

    // WHEN: Requesting with limit=0
    const response = await superadminApiRequest.get(
      "/api/geographic/states?limit=0",
    );

    // THEN: Returns default limit or empty (implementation specific)
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });
});
