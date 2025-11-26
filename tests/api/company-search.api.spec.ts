import { test, expect } from "../support/fixtures/rbac.fixture";
import { createCompany, createUser } from "../support/helpers";

/**
 * Company Search API Tests
 *
 * PURPOSE: Test the company search functionality via GET /api/companies?search=...
 *
 * SCOPE:
 * - Search by company name (case-insensitive partial match)
 * - Search by owner name (case-insensitive partial match)
 * - Search by owner email (case-insensitive partial match)
 * - Minimum 2 character search requirement
 * - ACTIVE status filtering when used in store creation context
 *
 * TEST PHILOSOPHY:
 * - Tests represent ground truth - code must conform to tests
 * - Focus on critical search scenarios
 * - Verify security (SQL injection, XSS)
 * - Validate business rules (min length, ACTIVE filter)
 */

// =============================================================================
// SECTION 1: SEARCH BY COMPANY NAME
// =============================================================================

test.describe("Company Search API - Search by Company Name", () => {
  test("should find companies by partial company name match (case-insensitive)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Multiple companies with similar names
    const owner1 = await createUser(prismaClient, {
      email: "owner1@test.com",
      name: "Owner One",
    });
    const owner2 = await createUser(prismaClient, {
      email: "owner2@test.com",
      name: "Owner Two",
    });
    const owner3 = await createUser(prismaClient, {
      email: "owner3@test.com",
      name: "Owner Three",
    });

    await createCompany(prismaClient, {
      name: "Acme Corporation",
      owner_user_id: owner1.user_id,
      status: "ACTIVE",
    });
    await createCompany(prismaClient, {
      name: "ACME Industries",
      owner_user_id: owner2.user_id,
      status: "ACTIVE",
    });
    await createCompany(prismaClient, {
      name: "Beta Corp",
      owner_user_id: owner3.user_id,
      status: "ACTIVE",
    });

    // WHEN: Searching for "acme" (lowercase)
    const response = await superadminApiRequest.get(
      "/api/companies?search=acme",
    );

    // THEN: Both ACME companies are returned
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(2);
    expect(body.data.map((c: any) => c.name)).toEqual(
      expect.arrayContaining(["Acme Corporation", "ACME Industries"]),
    );
    expect(body.data.map((c: any) => c.name)).not.toContain("Beta Corp");
  });

  test("should return empty array when no companies match search", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company that won't match the search
    const owner = await createUser(prismaClient, {
      email: "owner@test.com",
      name: "Owner",
    });
    await createCompany(prismaClient, {
      name: "Acme Corporation",
      owner_user_id: owner.user_id,
      status: "ACTIVE",
    });

    // WHEN: Searching for non-existent company
    const response = await superadminApiRequest.get(
      "/api/companies?search=NonExistent",
    );

    // THEN: Empty array is returned
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(0);
    expect(body.meta.total).toBe(0);
  });
});

// =============================================================================
// SECTION 2: SEARCH BY OWNER NAME AND EMAIL
// =============================================================================

test.describe("Company Search API - Search by Owner", () => {
  test("should find companies by owner name (case-insensitive partial match)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Companies with different owners
    const owner1 = await createUser(prismaClient, {
      email: "john.smith@test.com",
      name: "John Smith",
    });
    const owner2 = await createUser(prismaClient, {
      email: "jane.doe@test.com",
      name: "Jane Doe",
    });

    const company1 = await createCompany(prismaClient, {
      name: "Company A",
      owner_user_id: owner1.user_id,
      status: "ACTIVE",
    });
    const company2 = await createCompany(prismaClient, {
      name: "Company B",
      owner_user_id: owner2.user_id,
      status: "ACTIVE",
    });

    // WHEN: Searching for "john" (owner name)
    const response = await superadminApiRequest.get(
      "/api/companies?search=john",
    );

    // THEN: Only Company A is returned
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].company_id).toBe(company1.company_id);
    expect(body.data[0].owner_name).toBe("John Smith");
  });

  test("should find companies by owner email (case-insensitive partial match)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Companies with different owner emails
    const owner1 = await createUser(prismaClient, {
      email: "admin@acmecorp.com",
      name: "Admin User",
    });
    const owner2 = await createUser(prismaClient, {
      email: "ceo@betacorp.com",
      name: "CEO User",
    });

    const company1 = await createCompany(prismaClient, {
      name: "Company A",
      owner_user_id: owner1.user_id,
      status: "ACTIVE",
    });
    const company2 = await createCompany(prismaClient, {
      name: "Company B",
      owner_user_id: owner2.user_id,
      status: "ACTIVE",
    });

    // WHEN: Searching for "acmecorp" (part of email)
    const response = await superadminApiRequest.get(
      "/api/companies?search=acmecorp",
    );

    // THEN: Only Company A is returned
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].company_id).toBe(company1.company_id);
    expect(body.data[0].owner_email).toBe("admin@acmecorp.com");
  });

  test("should search across company name, owner name, and owner email simultaneously", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Companies where "tech" appears in different fields
    const owner1 = await createUser(prismaClient, {
      email: "admin@company.com",
      name: "Tech Expert",
    });
    const owner2 = await createUser(prismaClient, {
      email: "techguru@company.com",
      name: "Regular User",
    });
    const owner3 = await createUser(prismaClient, {
      email: "admin@other.com",
      name: "Other User",
    });

    const company1 = await createCompany(prismaClient, {
      name: "Tech Solutions Inc",
      owner_user_id: owner1.user_id,
      status: "ACTIVE",
    });
    const company2 = await createCompany(prismaClient, {
      name: "Business Corp",
      owner_user_id: owner1.user_id,
      status: "ACTIVE",
    });
    const company3 = await createCompany(prismaClient, {
      name: "Consulting LLC",
      owner_user_id: owner2.user_id,
      status: "ACTIVE",
    });
    const company4 = await createCompany(prismaClient, {
      name: "Services Inc",
      owner_user_id: owner3.user_id,
      status: "ACTIVE",
    });

    // WHEN: Searching for "tech"
    const response = await superadminApiRequest.get(
      "/api/companies?search=tech",
    );

    // THEN: All three companies with "tech" are returned (company name, owner name, owner email)
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(3);
    const companyIds = body.data.map((c: any) => c.company_id);
    expect(companyIds).toContain(company1.company_id); // "Tech Solutions Inc"
    expect(companyIds).toContain(company2.company_id); // Owner "Tech Expert"
    expect(companyIds).toContain(company3.company_id); // Email "techguru@..."
    expect(companyIds).not.toContain(company4.company_id);
  });
});

// =============================================================================
// SECTION 3: MINIMUM SEARCH LENGTH VALIDATION
// =============================================================================

test.describe("Company Search API - Minimum Length", () => {
  test("should return empty results for single character search", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company that would match a single character
    const owner = await createUser(prismaClient, {
      email: "owner@test.com",
      name: "Owner",
    });
    await createCompany(prismaClient, {
      name: "Acme Corp",
      owner_user_id: owner.user_id,
      status: "ACTIVE",
    });

    // WHEN: Searching with 1 character
    const response = await superadminApiRequest.get("/api/companies?search=A");

    // THEN: No results returned (minimum 2 chars required)
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(0);
  });

  test("should return results for 2 character search", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company that matches 2 characters
    const owner = await createUser(prismaClient, {
      email: "owner@test.com",
      name: "Owner",
    });
    const company = await createCompany(prismaClient, {
      name: "Acme Corp",
      owner_user_id: owner.user_id,
      status: "ACTIVE",
    });

    // WHEN: Searching with 2 characters
    const response = await superadminApiRequest.get("/api/companies?search=Ac");

    // THEN: Results are returned
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].company_id).toBe(company.company_id);
  });

  test("should ignore leading/trailing whitespace when checking minimum length", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company
    const owner = await createUser(prismaClient, {
      email: "owner@test.com",
      name: "Owner",
    });
    await createCompany(prismaClient, {
      name: "Acme Corp",
      owner_user_id: owner.user_id,
      status: "ACTIVE",
    });

    // WHEN: Searching with whitespace padding (trimmed to 1 char)
    const response = await superadminApiRequest.get(
      "/api/companies?search=%20A%20",
    );

    // THEN: No results (after trim, only 1 char)
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(0);
  });
});

// =============================================================================
// SECTION 4: STATUS FILTERING
// =============================================================================

test.describe("Company Search API - Status Filtering", () => {
  test("should filter by ACTIVE status when specified", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Companies with different statuses
    const owner1 = await createUser(prismaClient, {
      email: "owner1@test.com",
      name: "Owner One",
    });
    const owner2 = await createUser(prismaClient, {
      email: "owner2@test.com",
      name: "Owner Two",
    });

    const activeCompany = await createCompany(prismaClient, {
      name: "Acme Active",
      owner_user_id: owner1.user_id,
      status: "ACTIVE",
    });
    const inactiveCompany = await createCompany(prismaClient, {
      name: "Acme Inactive",
      owner_user_id: owner2.user_id,
      status: "INACTIVE",
    });

    // WHEN: Searching with status=ACTIVE filter
    const response = await superadminApiRequest.get(
      "/api/companies?search=acme&status=ACTIVE",
    );

    // THEN: Only ACTIVE company is returned
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].company_id).toBe(activeCompany.company_id);
    expect(body.data[0].status).toBe("ACTIVE");
  });

  test("should return companies of all statuses when no status filter specified", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Companies with different statuses
    const owner1 = await createUser(prismaClient, {
      email: "owner1@test.com",
      name: "Owner One",
    });
    const owner2 = await createUser(prismaClient, {
      email: "owner2@test.com",
      name: "Owner Two",
    });
    const owner3 = await createUser(prismaClient, {
      email: "owner3@test.com",
      name: "Owner Three",
    });

    await createCompany(prismaClient, {
      name: "Beta Active",
      owner_user_id: owner1.user_id,
      status: "ACTIVE",
    });
    await createCompany(prismaClient, {
      name: "Beta Inactive",
      owner_user_id: owner2.user_id,
      status: "INACTIVE",
    });
    await createCompany(prismaClient, {
      name: "Beta Suspended",
      owner_user_id: owner3.user_id,
      status: "SUSPENDED",
    });

    // WHEN: Searching without status filter
    const response = await superadminApiRequest.get(
      "/api/companies?search=beta",
    );

    // THEN: All companies are returned
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(3);
    const statuses = body.data.map((c: any) => c.status);
    expect(statuses).toContain("ACTIVE");
    expect(statuses).toContain("INACTIVE");
    expect(statuses).toContain("SUSPENDED");
  });
});

// =============================================================================
// SECTION 5: SECURITY TESTS
// =============================================================================

test.describe("Company Search API - Security", () => {
  test("should prevent SQL injection via search parameter", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A normal company
    const owner = await createUser(prismaClient, {
      email: "owner@test.com",
      name: "Owner",
    });
    await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
      status: "ACTIVE",
    });

    // WHEN: Attempting SQL injection
    const maliciousQueries = [
      "'; DROP TABLE companies; --",
      "' OR '1'='1",
      "admin' --",
      "' UNION SELECT * FROM users --",
    ];

    for (const query of maliciousQueries) {
      const response = await superadminApiRequest.get(
        `/api/companies?search=${encodeURIComponent(query)}`,
      );

      // THEN: Query is safely handled (no SQL injection)
      expect(response.status()).toBe(200);
      const body = await response.json();
      // Should return empty or treat as literal string search
      expect(Array.isArray(body.data)).toBe(true);
    }
  });

  test("should require authentication for search endpoint", async ({
    apiRequest,
  }) => {
    // WHEN: Attempting to search without authentication
    const response = await apiRequest.get("/api/companies?search=test");

    // THEN: Request is rejected
    expect(response.status()).toBe(401);
  });

  test("should require ADMIN_SYSTEM_CONFIG permission for search", async ({
    storeManagerApiRequest,
  }) => {
    // WHEN: Store Manager (no ADMIN_SYSTEM_CONFIG) attempts search
    const response = await storeManagerApiRequest.get(
      "/api/companies?search=test",
    );

    // THEN: Request is forbidden
    expect(response.status()).toBe(403);
  });
});

// =============================================================================
// SECTION 6: PAGINATION WITH SEARCH
// =============================================================================

test.describe("Company Search API - Pagination", () => {
  test("should paginate search results correctly", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: 5 companies matching search
    const owner = await createUser(prismaClient, {
      email: "owner@test.com",
      name: "Owner",
    });

    for (let i = 1; i <= 5; i++) {
      await createCompany(prismaClient, {
        name: `Search Company ${i}`,
        owner_user_id: owner.user_id,
        status: "ACTIVE",
      });
    }

    // WHEN: Requesting page 1 with limit 3
    const response1 = await superadminApiRequest.get(
      "/api/companies?search=Search&page=1&limit=3",
    );

    // THEN: First page has 3 results
    expect(response1.status()).toBe(200);
    const body1 = await response1.json();
    expect(body1.data).toHaveLength(3);
    expect(body1.meta.page).toBe(1);
    expect(body1.meta.limit).toBe(3);
    expect(body1.meta.total).toBe(5);
    expect(body1.meta.totalPages).toBe(2);

    // WHEN: Requesting page 2
    const response2 = await superadminApiRequest.get(
      "/api/companies?search=Search&page=2&limit=3",
    );

    // THEN: Second page has remaining 2 results
    expect(response2.status()).toBe(200);
    const body2 = await response2.json();
    expect(body2.data).toHaveLength(2);
    expect(body2.meta.page).toBe(2);
  });
});
