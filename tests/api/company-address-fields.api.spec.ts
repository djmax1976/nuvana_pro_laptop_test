import { test, expect } from "../support/fixtures/rbac.fixture";
import { createUser, createCompany } from "../support/helpers";

/**
 * Company Address Fields API Tests
 *
 * @description Tests for structured address fields in company CRUD operations
 *
 * TRACEABILITY MATRIX:
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Requirement ID │ Description                  │ Test Cases              │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ ADDR-001       │ Update company with address  │ TC-001, TC-002          │
 * │ ADDR-002       │ Read company returns address │ TC-003, TC-004          │
 * │ ADDR-003       │ List companies has addresses │ TC-005                  │
 * │ VAL-001        │ Address field validation     │ TC-006, TC-007          │
 * │ VAL-002        │ UUID validation for FK       │ TC-008                  │
 * │ SEC-001        │ XSS prevention in address    │ TC-009                  │
 * │ REL-001        │ State/county relations       │ TC-010                  │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * TESTING PYRAMID LEVEL: API (Integration)
 *
 * @enterprise-standards
 * - API-001: VALIDATION - Zod schema validation
 * - SEC-014: INPUT_VALIDATION - XSS and injection prevention
 * - DB-006: TENANT_ISOLATION - Company data isolation
 */

// =============================================================================
// SECTION 1: UPDATE COMPANY WITH ADDRESS
// =============================================================================

test.describe("Company Address API - Update with Address Fields", () => {
  test("TC-001: can update company with all address fields", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: An existing company and valid state/county
    const testId = Date.now();
    const company = await createCompany(prismaClient, {
      name: `Test Address Company ${testId}`,
    });

    // Get a real state and county for the test
    const state = await prismaClient.uSState.findFirst({
      where: { is_active: true },
    });

    const county = state
      ? await prismaClient.uSCounty.findFirst({
          where: { state_id: state.state_id, is_active: true },
        })
      : null;

    try {
      // WHEN: Updating company with address fields
      const updateData: Record<string, unknown> = {
        address_line1: "123 Main Street",
        address_line2: "Suite 100",
        city: "Atlanta",
        zip_code: "30301",
      };

      if (state) updateData.state_id = state.state_id;
      if (county) updateData.county_id = county.county_id;

      const response = await superadminApiRequest.put(
        `/api/companies/${company.company_id}`,
        { data: updateData },
      );

      // THEN: Company is updated with address fields
      expect(response.status()).toBe(200);
      const body = await response.json();

      expect(body.address_line1).toBe("123 Main Street");
      expect(body.address_line2).toBe("Suite 100");
      expect(body.city).toBe("Atlanta");
      expect(body.zip_code).toBe("30301");

      if (state) expect(body.state_id).toBe(state.state_id);
      if (county) expect(body.county_id).toBe(county.county_id);
    } finally {
      // Cleanup
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({
        where: { user_id: company.owner_user_id },
      });
    }
  });

  test("TC-002: can clear address fields with null", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company with address data
    const testId = Date.now();
    const company = await createCompany(prismaClient, {
      name: `Test Clear Address ${testId}`,
    });

    // Add some address data first
    await prismaClient.company.update({
      where: { company_id: company.company_id },
      data: {
        address_line1: "123 Main Street",
        city: "Atlanta",
        zip_code: "30301",
      },
    });

    try {
      // WHEN: Updating with null values
      const response = await superadminApiRequest.put(
        `/api/companies/${company.company_id}`,
        {
          data: {
            address_line2: null,
          },
        },
      );

      // THEN: Address field is cleared
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.address_line2).toBeNull();

      // Other fields remain unchanged
      expect(body.address_line1).toBe("123 Main Street");
    } finally {
      // Cleanup
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({
        where: { user_id: company.owner_user_id },
      });
    }
  });
});

// =============================================================================
// SECTION 2: READ COMPANY RETURNS ADDRESS
// =============================================================================

test.describe("Company Address API - Read Returns Address", () => {
  test("TC-003: GET /api/companies/:id returns address fields", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company with address data
    const testId = Date.now();
    const company = await createCompany(prismaClient, {
      name: `Test Read Address ${testId}`,
    });

    // Add address data
    await prismaClient.company.update({
      where: { company_id: company.company_id },
      data: {
        address_line1: "456 Oak Avenue",
        address_line2: "Building B",
        city: "Savannah",
        zip_code: "31401",
      },
    });

    try {
      // WHEN: Getting the company
      const response = await superadminApiRequest.get(
        `/api/companies/${company.company_id}`,
      );

      // THEN: Response includes address fields
      expect(response.status()).toBe(200);
      const body = await response.json();

      expect(body.address_line1).toBe("456 Oak Avenue");
      expect(body.address_line2).toBe("Building B");
      expect(body.city).toBe("Savannah");
      expect(body.zip_code).toBe("31401");
    } finally {
      // Cleanup
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({
        where: { user_id: company.owner_user_id },
      });
    }
  });

  test("TC-004: GET /api/companies/:id returns null for empty address fields", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company without address data
    const testId = Date.now();
    const company = await createCompany(prismaClient, {
      name: `Test Empty Address ${testId}`,
    });

    try {
      // WHEN: Getting the company
      const response = await superadminApiRequest.get(
        `/api/companies/${company.company_id}`,
      );

      // THEN: Address fields are null (not undefined or missing)
      expect(response.status()).toBe(200);
      const body = await response.json();

      expect(body).toHaveProperty("address_line1");
      expect(body).toHaveProperty("address_line2");
      expect(body).toHaveProperty("city");
      expect(body).toHaveProperty("state_id");
      expect(body).toHaveProperty("county_id");
      expect(body).toHaveProperty("zip_code");

      expect(body.address_line1).toBeNull();
      expect(body.city).toBeNull();
    } finally {
      // Cleanup
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({
        where: { user_id: company.owner_user_id },
      });
    }
  });
});

// =============================================================================
// SECTION 3: LIST COMPANIES INCLUDES ADDRESS
// =============================================================================

test.describe("Company Address API - List Includes Address", () => {
  test("TC-005: GET /api/companies returns address fields in list", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company with address data
    const testId = Date.now();
    const company = await createCompany(prismaClient, {
      name: `Test List Address ${testId}`,
    });

    // Add address data
    await prismaClient.company.update({
      where: { company_id: company.company_id },
      data: {
        address_line1: "789 Pine Street",
        city: "Macon",
        zip_code: "31201",
      },
    });

    try {
      // WHEN: Listing companies with search
      const response = await superadminApiRequest.get(
        `/api/companies?search=${testId}`,
      );

      // THEN: Response includes address fields
      expect(response.status()).toBe(200);
      const body = await response.json();

      const found = body.data.find(
        (c: Record<string, unknown>) => c.company_id === company.company_id,
      );
      expect(found).toBeDefined();
      expect(found.address_line1).toBe("789 Pine Street");
      expect(found.city).toBe("Macon");
      expect(found.zip_code).toBe("31201");
    } finally {
      // Cleanup
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({
        where: { user_id: company.owner_user_id },
      });
    }
  });
});

// =============================================================================
// SECTION 4: ADDRESS FIELD VALIDATION
// =============================================================================

test.describe("Company Address API - Validation", () => {
  test("TC-006: validates address_line1 max length", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company
    const testId = Date.now();
    const company = await createCompany(prismaClient, {
      name: `Test Validation 1 ${testId}`,
    });

    try {
      // WHEN: Updating with too-long address_line1
      const response = await superadminApiRequest.put(
        `/api/companies/${company.company_id}`,
        {
          data: {
            address_line1: "A".repeat(300), // Exceeds 255 char limit
          },
        },
      );

      // THEN: Returns validation error
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error || body.message).toBeDefined();
    } finally {
      // Cleanup
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({
        where: { user_id: company.owner_user_id },
      });
    }
  });

  test("TC-007: trims whitespace from address fields", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company
    const testId = Date.now();
    const company = await createCompany(prismaClient, {
      name: `Test Trim ${testId}`,
    });

    try {
      // WHEN: Updating with whitespace-padded address
      const response = await superadminApiRequest.put(
        `/api/companies/${company.company_id}`,
        {
          data: {
            address_line1: "  123 Main Street  ",
            city: "  Atlanta  ",
          },
        },
      );

      // THEN: Whitespace is trimmed
      expect(response.status()).toBe(200);
      const body = await response.json();

      expect(body.address_line1).toBe("123 Main Street");
      expect(body.city).toBe("Atlanta");
    } finally {
      // Cleanup
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({
        where: { user_id: company.owner_user_id },
      });
    }
  });

  test("TC-008: validates state_id is valid UUID", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company
    const testId = Date.now();
    const company = await createCompany(prismaClient, {
      name: `Test UUID ${testId}`,
    });

    try {
      // WHEN: Updating with invalid UUID
      const response = await superadminApiRequest.put(
        `/api/companies/${company.company_id}`,
        {
          data: {
            state_id: "not-a-valid-uuid",
          },
        },
      );

      // THEN: Returns validation error
      expect(response.status()).toBe(400);
    } finally {
      // Cleanup
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({
        where: { user_id: company.owner_user_id },
      });
    }
  });
});

// =============================================================================
// SECTION 5: SECURITY
// =============================================================================

test.describe("Company Address API - Security", () => {
  test("TC-009: prevents XSS in address fields", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company
    const testId = Date.now();
    const company = await createCompany(prismaClient, {
      name: `Test XSS ${testId}`,
    });

    try {
      // WHEN: Updating with XSS attempt in address
      const response = await superadminApiRequest.put(
        `/api/companies/${company.company_id}`,
        {
          data: {
            address_line1: "<script>alert('xss')</script>",
          },
        },
      );

      // THEN: XSS is rejected or sanitized
      // The backend should reject HTML tags with validation error
      expect(response.status()).toBe(400);
    } finally {
      // Cleanup
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({
        where: { user_id: company.owner_user_id },
      });
    }
  });
});

// =============================================================================
// SECTION 6: STATE/COUNTY RELATIONS
// =============================================================================

test.describe("Company Address API - Geographic Relations", () => {
  test("TC-010: returns expanded state and county on update", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company and valid state/county
    const testId = Date.now();
    const company = await createCompany(prismaClient, {
      name: `Test Relations ${testId}`,
    });

    // Get Georgia state and a county
    const georgia = await prismaClient.uSState.findFirst({
      where: { code: "GA", is_active: true },
    });

    const county = georgia
      ? await prismaClient.uSCounty.findFirst({
          where: { state_id: georgia.state_id, is_active: true },
        })
      : null;

    if (!georgia || !county) {
      // Skip if test data not available
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({
        where: { user_id: company.owner_user_id },
      });
      test.skip();
      return;
    }

    try {
      // WHEN: Updating with state and county IDs
      const response = await superadminApiRequest.put(
        `/api/companies/${company.company_id}`,
        {
          data: {
            state_id: georgia.state_id,
            county_id: county.county_id,
          },
        },
      );

      // THEN: Response includes expanded state and county objects
      expect(response.status()).toBe(200);
      const body = await response.json();

      // State is expanded
      expect(body.state).toBeDefined();
      expect(body.state.state_id).toBe(georgia.state_id);
      expect(body.state.code).toBe("GA");
      expect(body.state.name).toBe("Georgia");

      // County is expanded
      expect(body.county).toBeDefined();
      expect(body.county.county_id).toBe(county.county_id);
      expect(body.county.name).toBe(county.name);
    } finally {
      // Cleanup
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({
        where: { user_id: company.owner_user_id },
      });
    }
  });
});

// =============================================================================
// SECTION 7: EDIT MODAL DATA POPULATION
// =============================================================================

test.describe("Company Address API - Edit Modal Scenario", () => {
  test("TC-011: saved address data is returned when fetching company for edit", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company with complete address data
    const testId = Date.now();
    const company = await createCompany(prismaClient, {
      name: `Test Edit Modal ${testId}`,
    });

    // Get Georgia and a county for realistic data
    const georgia = await prismaClient.uSState.findFirst({
      where: { code: "GA", is_active: true },
    });

    const county = georgia
      ? await prismaClient.uSCounty.findFirst({
          where: { state_id: georgia.state_id, is_active: true },
        })
      : null;

    // Add address data
    await prismaClient.company.update({
      where: { company_id: company.company_id },
      data: {
        address_line1: "100 Peachtree Street",
        address_line2: "Floor 15",
        city: "Atlanta",
        state_id: georgia?.state_id,
        county_id: county?.county_id,
        zip_code: "30303",
      },
    });

    try {
      // WHEN: Fetching company for edit modal
      const response = await superadminApiRequest.get(
        `/api/companies/${company.company_id}`,
      );

      // THEN: All address fields are present and populated
      expect(response.status()).toBe(200);
      const body = await response.json();

      // Verify all address fields are in response (this was the bug!)
      expect(body.address_line1).toBe("100 Peachtree Street");
      expect(body.address_line2).toBe("Floor 15");
      expect(body.city).toBe("Atlanta");
      expect(body.zip_code).toBe("30303");

      if (georgia) {
        expect(body.state_id).toBe(georgia.state_id);
      }
      if (county) {
        expect(body.county_id).toBe(county.county_id);
      }
    } finally {
      // Cleanup
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({
        where: { user_id: company.owner_user_id },
      });
    }
  });

  test("TC-012: address persists after multiple updates", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company
    const testId = Date.now();
    const company = await createCompany(prismaClient, {
      name: `Test Persist ${testId}`,
    });

    try {
      // WHEN: First update - add address
      await superadminApiRequest.put(`/api/companies/${company.company_id}`, {
        data: {
          address_line1: "First Address",
          city: "First City",
        },
      });

      // Second update - change name only
      await superadminApiRequest.put(`/api/companies/${company.company_id}`, {
        data: {
          name: `Test Updated Persist ${testId}`,
        },
      });

      // THEN: Fetch and verify address persisted
      const response = await superadminApiRequest.get(
        `/api/companies/${company.company_id}`,
      );

      expect(response.status()).toBe(200);
      const body = await response.json();

      expect(body.name).toBe(`Test Updated Persist ${testId}`);
      expect(body.address_line1).toBe("First Address");
      expect(body.city).toBe("First City");
    } finally {
      // Cleanup
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({
        where: { user_id: company.owner_user_id },
      });
    }
  });
});
