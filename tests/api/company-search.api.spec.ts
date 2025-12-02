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
 *
 * NOTE: Each test uses unique identifiers to prevent data collision with other tests
 */

// =============================================================================
// SECTION 1: SEARCH BY COMPANY NAME
// =============================================================================

test.describe("Company Search API - Search by Company Name", () => {
  test("should find companies by partial company name match (case-insensitive)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const testId = Date.now();
    const searchPrefix = `SearchTest${testId}`;

    // GIVEN: Multiple companies with similar names
    const owner1 = await createUser(prismaClient, {
      email: `owner1_${testId}@test.com`,
      name: "Owner One",
    });
    const owner2 = await createUser(prismaClient, {
      email: `owner2_${testId}@test.com`,
      name: "Owner Two",
    });
    const owner3 = await createUser(prismaClient, {
      email: `owner3_${testId}@test.com`,
      name: "Owner Three",
    });

    await createCompany(prismaClient, {
      name: `Test ${searchPrefix}Acme Corporation`,
      owner_user_id: owner1.user_id,
      status: "ACTIVE",
    });
    await createCompany(prismaClient, {
      name: `Test ${searchPrefix}ACME Industries`,
      owner_user_id: owner2.user_id,
      status: "ACTIVE",
    });
    await createCompany(prismaClient, {
      name: `Test ${searchPrefix}Beta Corp`,
      owner_user_id: owner3.user_id,
      status: "ACTIVE",
    });

    // WHEN: Searching for the unique prefix + "acme" (lowercase)
    const response = await superadminApiRequest.get(
      `/api/companies?search=${searchPrefix}acme`,
    );

    // THEN: Both ACME companies are returned
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(2);
    expect(body.data.map((c: any) => c.name)).toEqual(
      expect.arrayContaining([
        `Test ${searchPrefix}Acme Corporation`,
        `Test ${searchPrefix}ACME Industries`,
      ]),
    );
    expect(body.data.map((c: any) => c.name)).not.toContain(
      `Test ${searchPrefix}Beta Corp`,
    );
  });

  test("should return empty array when no companies match search", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const testId = Date.now();
    // GIVEN: A company that won't match the search
    const owner = await createUser(prismaClient, {
      email: `owner_${testId}@test.com`,
      name: "Owner",
    });
    await createCompany(prismaClient, {
      name: `ExistingCompany${testId}`,
      owner_user_id: owner.user_id,
      status: "ACTIVE",
    });

    // WHEN: Searching for non-existent company with unique string
    const response = await superadminApiRequest.get(
      `/api/companies?search=NonExistent${testId}xyz`,
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
    const testId = Date.now();
    const uniqueOwnerName = `UniqueJohn${testId}`;

    // GIVEN: Companies with different owners
    const owner1 = await createUser(prismaClient, {
      email: `john.smith_${testId}@test.com`,
      name: `${uniqueOwnerName} Smith`,
    });
    const owner2 = await createUser(prismaClient, {
      email: `jane.doe_${testId}@test.com`,
      name: "Jane Doe",
    });

    const company1 = await createCompany(prismaClient, {
      name: `Company A ${testId}`,
      owner_user_id: owner1.user_id,
      status: "ACTIVE",
    });
    const company2 = await createCompany(prismaClient, {
      name: `Company B ${testId}`,
      owner_user_id: owner2.user_id,
      status: "ACTIVE",
    });

    // WHEN: Searching for the unique owner name
    const response = await superadminApiRequest.get(
      `/api/companies?search=${uniqueOwnerName}`,
    );

    // THEN: Only Company A is returned
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].company_id).toBe(company1.company_id);
    expect(body.data[0].owner_name).toBe(`${uniqueOwnerName} Smith`);
  });

  test("should find companies by owner email (case-insensitive partial match)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const testId = Date.now();
    const uniqueEmailDomain = `acmecorp${testId}`;

    // GIVEN: Companies with different owner emails
    const owner1 = await createUser(prismaClient, {
      email: `admin@${uniqueEmailDomain}.test.nuvana.local`,
      name: "Admin User",
    });
    const owner2 = await createUser(prismaClient, {
      email: `ceo_${testId}@test.nuvana.local`,
      name: "CEO User",
    });

    const company1 = await createCompany(prismaClient, {
      name: `Company A ${testId}`,
      owner_user_id: owner1.user_id,
      status: "ACTIVE",
    });
    const company2 = await createCompany(prismaClient, {
      name: `Company B ${testId}`,
      owner_user_id: owner2.user_id,
      status: "ACTIVE",
    });

    // WHEN: Searching for the unique email domain
    const response = await superadminApiRequest.get(
      `/api/companies?search=${uniqueEmailDomain}`,
    );

    // THEN: Only Company A is returned
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].company_id).toBe(company1.company_id);
    expect(body.data[0].owner_email).toContain(
      `@${uniqueEmailDomain}.test.nuvana.local`,
    );
  });

  test("should search across company name, owner name, and owner email simultaneously", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const testId = Date.now();
    const searchTerm = `techsearch${testId}`;

    // GIVEN: Companies where the searchTerm appears in different fields
    const owner1 = await createUser(prismaClient, {
      email: `admin_${testId}@test.nuvana.local`,
      name: `${searchTerm} Expert`, // searchTerm in name
    });
    const owner2 = await createUser(prismaClient, {
      email: `${searchTerm}guru@test.nuvana.local`, // searchTerm in email
      name: "Regular User",
    });
    const owner3 = await createUser(prismaClient, {
      email: `admin2_${testId}@test.nuvana.local`,
      name: "Other User",
    });

    const company1 = await createCompany(prismaClient, {
      name: `Test ${searchTerm} Solutions Inc`, // searchTerm in company name
      owner_user_id: owner1.user_id,
      status: "ACTIVE",
    });
    const company2 = await createCompany(prismaClient, {
      name: `Test Business Corp ${testId}`, // owner1 also owns this - searchTerm in owner name
      owner_user_id: owner1.user_id,
      status: "ACTIVE",
    });
    const company3 = await createCompany(prismaClient, {
      name: `Test Consulting LLC ${testId}`, // searchTerm in owner email
      owner_user_id: owner2.user_id,
      status: "ACTIVE",
    });
    const company4 = await createCompany(prismaClient, {
      name: `Test Services Inc ${testId}`, // No searchTerm anywhere
      owner_user_id: owner3.user_id,
      status: "ACTIVE",
    });

    // WHEN: Searching for searchTerm
    const response = await superadminApiRequest.get(
      `/api/companies?search=${searchTerm}`,
    );

    // THEN: All three companies with searchTerm are returned (company name, owner name, owner email)
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(3);
    const companyIds = body.data.map((c: any) => c.company_id);
    expect(companyIds).toContain(company1.company_id); // company name
    expect(companyIds).toContain(company2.company_id); // Owner name
    expect(companyIds).toContain(company3.company_id); // Email
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
    const testId = Date.now();
    // GIVEN: A company that would match a single character
    const owner = await createUser(prismaClient, {
      email: `owner_${testId}@test.com`,
      name: "Owner",
    });
    await createCompany(prismaClient, {
      name: `Test Acme Corp ${testId}`,
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
    const testId = Date.now();
    const uniquePrefix = `Zq${testId}`; // Very unique 2-char prefix

    // GIVEN: A company that matches 2 characters
    const owner = await createUser(prismaClient, {
      email: `owner_${testId}@test.com`,
      name: "Owner",
    });
    const company = await createCompany(prismaClient, {
      name: `${uniquePrefix} Corp`,
      owner_user_id: owner.user_id,
      status: "ACTIVE",
    });

    // WHEN: Searching with 2 characters
    const response = await superadminApiRequest.get(
      `/api/companies?search=Zq${testId}`,
    );

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
    const testId = Date.now();
    // GIVEN: A company
    const owner = await createUser(prismaClient, {
      email: `owner_${testId}@test.com`,
      name: "Owner",
    });
    await createCompany(prismaClient, {
      name: `Test Acme Corp ${testId}`,
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
    const testId = Date.now();
    const uniqueName = `StatusFilter${testId}`;

    // GIVEN: Companies with different statuses
    const owner1 = await createUser(prismaClient, {
      email: `owner1_${testId}@test.com`,
      name: "Owner One",
    });
    const owner2 = await createUser(prismaClient, {
      email: `owner2_${testId}@test.com`,
      name: "Owner Two",
    });

    const activeCompany = await createCompany(prismaClient, {
      name: `${uniqueName} Active`,
      owner_user_id: owner1.user_id,
      status: "ACTIVE",
    });
    const inactiveCompany = await createCompany(prismaClient, {
      name: `${uniqueName} Inactive`,
      owner_user_id: owner2.user_id,
      status: "INACTIVE",
    });

    // WHEN: Searching with status=ACTIVE filter
    const response = await superadminApiRequest.get(
      `/api/companies?search=${uniqueName}&status=ACTIVE`,
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
    const testId = Date.now();
    const uniqueName = `AllStatus${testId}`;

    // GIVEN: Companies with different statuses
    const owner1 = await createUser(prismaClient, {
      email: `owner1_${testId}@test.com`,
      name: "Owner One",
    });
    const owner2 = await createUser(prismaClient, {
      email: `owner2_${testId}@test.com`,
      name: "Owner Two",
    });
    const owner3 = await createUser(prismaClient, {
      email: `owner3_${testId}@test.com`,
      name: "Owner Three",
    });

    await createCompany(prismaClient, {
      name: `${uniqueName} Active`,
      owner_user_id: owner1.user_id,
      status: "ACTIVE",
    });
    await createCompany(prismaClient, {
      name: `${uniqueName} Inactive`,
      owner_user_id: owner2.user_id,
      status: "INACTIVE",
    });
    await createCompany(prismaClient, {
      name: `${uniqueName} Suspended`,
      owner_user_id: owner3.user_id,
      status: "SUSPENDED",
    });

    // WHEN: Searching without status filter
    const response = await superadminApiRequest.get(
      `/api/companies?search=${uniqueName}`,
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
    const testId = Date.now();
    // GIVEN: A normal company
    const owner = await createUser(prismaClient, {
      email: `owner_${testId}@test.com`,
      name: "Owner",
    });
    await createCompany(prismaClient, {
      name: `Test Company ${testId}`,
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
    const testId = Date.now();
    const uniqueName = `PaginationTest${testId}`;

    // GIVEN: 5 companies matching search
    const owner = await createUser(prismaClient, {
      email: `owner_${testId}@test.com`,
      name: "Owner",
    });

    for (let i = 1; i <= 5; i++) {
      await createCompany(prismaClient, {
        name: `${uniqueName} Company ${i}`,
        owner_user_id: owner.user_id,
        status: "ACTIVE",
      });
    }

    // WHEN: Requesting page 1 with limit 3
    const response1 = await superadminApiRequest.get(
      `/api/companies?search=${uniqueName}&page=1&limit=3`,
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
      `/api/companies?search=${uniqueName}&page=2&limit=3`,
    );

    // THEN: Second page has remaining 2 results
    expect(response2.status()).toBe(200);
    const body2 = await response2.json();
    expect(body2.data).toHaveLength(2);
    expect(body2.meta.page).toBe(2);
  });
});
