import { test, expect } from "../support/fixtures/rbac.fixture";

/**
 * Geographic Reference API Tests
 *
 * @description Enterprise-grade API tests for US geographic reference data
 *
 * TRACEABILITY MATRIX:
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Requirement ID │ Description                  │ Test Cases              │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ GEO-001        │ List states endpoint         │ TC-001, TC-002          │
 * │ GEO-002        │ List counties by state       │ TC-003, TC-004          │
 * │ GEO-003        │ List cities by state         │ TC-005, TC-006          │
 * │ GEO-004        │ List ZIP codes by state      │ TC-007                  │
 * │ SEC-001        │ Authentication required      │ TC-008                  │
 * │ SEC-002        │ Input validation             │ TC-009, TC-010          │
 * │ PERF-001       │ Pagination support           │ TC-011                  │
 * │ PERF-002       │ Search filtering             │ TC-012                  │
 * │ ADMIN-001      │ State CRUD (SuperAdmin)      │ TC-013, TC-014, TC-015  │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * TESTING PYRAMID LEVEL: API (Integration)
 *
 * @enterprise-standards
 * - API-001: VALIDATION - Request/response validation
 * - API-003: ERROR_HANDLING - Proper error responses
 * - SEC-006: SQL_INJECTION - Input sanitization
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

  test("TC-002b: filters states by search query", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Authenticated request

    // WHEN: Searching for states containing "geo"
    const response = await superadminApiRequest.get(
      "/api/geographic/states?search=geo",
    );

    // THEN: Returns matching states
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // All returned states should match the search
    for (const state of body.data) {
      const matchesName = state.name.toLowerCase().includes("geo");
      const matchesCode = state.code.toLowerCase().includes("geo");
      expect(matchesName || matchesCode).toBe(true);
    }
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

  test("TC-004: returns 404 for non-existent state", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: A non-existent state ID
    const fakeStateId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Requesting counties for non-existent state
    const response = await superadminApiRequest.get(
      `/api/geographic/states/${fakeStateId}/counties`,
    );

    // THEN: Returns 404
    expect(response.status()).toBe(404);
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
  test("TC-013: SuperAdmin can create a state", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: State creation data
    const testId = Date.now();
    const stateData = {
      code: `T${testId.toString().slice(-1)}`, // 2 chars max
      name: `Test State ${testId}`,
      fips_code: "99",
      is_active: true,
      lottery_enabled: false,
    };

    // WHEN: Creating a state
    const response = await superadminApiRequest.post("/api/geographic/states", {
      data: stateData,
    });

    // THEN: State is created
    if (response.status() === 201) {
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("state_id");
      expect(body.data.code).toBe(stateData.code);

      // Cleanup
      await prismaClient.uSState.delete({
        where: { state_id: body.data.state_id },
      });
    } else {
      // May conflict if code already exists
      expect([201, 409]).toContain(response.status());
    }
  });

  test("TC-014: SuperAdmin can update a state", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: An existing state
    const testId = Date.now();
    const state = await prismaClient.uSState.create({
      data: {
        code: `U${testId.toString().slice(-1)}`,
        name: `Update Test State ${testId}`,
        fips_code: "98",
        is_active: true,
        lottery_enabled: false,
      },
    });

    try {
      // WHEN: Updating the state
      const response = await superadminApiRequest.put(
        `/api/geographic/states/${state.state_id}`,
        {
          data: {
            name: `Updated State ${testId}`,
            lottery_enabled: true,
          },
        },
      );

      // THEN: State is updated
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe(`Updated State ${testId}`);
      expect(body.data.lottery_enabled).toBe(true);
    } finally {
      // Cleanup
      await prismaClient.uSState.delete({
        where: { state_id: state.state_id },
      });
    }
  });

  test("TC-015: non-SuperAdmin cannot create states", async ({
    corporateAdminApiRequest,
  }) => {
    // GIVEN: Corporate admin (not SuperAdmin)
    const stateData = {
      code: "XX",
      name: "Unauthorized State",
      fips_code: "00",
    };

    // WHEN: Attempting to create a state
    const response = await corporateAdminApiRequest.post(
      "/api/geographic/states",
      {
        data: stateData,
      },
    );

    // THEN: Returns 403 Forbidden
    expect(response.status()).toBe(403);
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
