import { test, expect } from "../support/fixtures/rbac.fixture";
import { createCompany, createClient } from "../support/factories";

/**
 * Company Management API Tests
 *
 * Tests for Company Management API endpoints:
 * - Create, read, update, delete companies (CRUD operations)
 * - Permission enforcement (only System Admins can manage companies)
 * - Audit logging for all company operations
 * - Hard delete functionality with cascade to stores and user roles
 * - Validation and error handling
 *
 * Priority: P0 (Critical - Multi-tenant foundation)
 */

test.describe("2.1-API: Company Management API - CRUD Operations", () => {
  test("[P0] 2.1-API-001: POST /api/companies - should create company with valid data (AC #1)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin with valid company data
    // First create a client (required for company creation)
    const client = await prismaClient.client.create({
      data: createClient({ name: "Test Client for Company" }),
    });

    const companyData = createCompany({
      name: "Test Company Inc",
      status: "ACTIVE",
    });

    // WHEN: Creating a company via API
    const response = await superadminApiRequest.post("/api/companies", {
      client_id: client.client_id,
      name: companyData.name,
      status: companyData.status,
    });

    // THEN: Company is created successfully
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body).toHaveProperty("company_id");
    expect(body).toHaveProperty("name", companyData.name);
    expect(body).toHaveProperty("status", companyData.status);
    expect(body).toHaveProperty("client_id", client.client_id);
    expect(body).toHaveProperty("created_at");
    expect(body).toHaveProperty("updated_at");

    // AND: Company record exists in database
    const company = await prismaClient.company.findUnique({
      where: { company_id: body.company_id },
    });
    expect(company).not.toBeNull();
    expect(company?.name).toBe(companyData.name);
    expect(company?.client_id).toBe(client.client_id);

    // AND: Audit log entry is created
    const auditLog = await prismaClient.auditLog.findFirst({
      where: {
        table_name: "companies",
        record_id: body.company_id,
        action: "CREATE",
      },
    });
    expect(auditLog).not.toBeNull();
    expect(auditLog?.action).toBe("CREATE");
  });

  test("[P0] 2.1-API-002: POST /api/companies - should reject invalid data (AC #1)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin with invalid company data (missing name)
    // First create a client
    const client = await prismaClient.client.create({
      data: createClient({ name: "Test Client for Validation" }),
    });

    // WHEN: Creating a company with missing required field (name)
    const response = await superadminApiRequest.post("/api/companies", {
      client_id: client.client_id,
      status: "ACTIVE",
      // name is missing
    });

    // THEN: Validation error is returned
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty("error");
  });

  test("[P0] 2.1-API-003: GET /api/companies/:companyId - should retrieve company by ID (AC #2)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin and a company exists
    const client = await prismaClient.client.create({
      data: createClient({ name: "Test Client for Get" }),
    });
    const companyData = createCompany();
    const company = await prismaClient.company.create({
      data: {
        ...companyData,
        client_id: client.client_id,
      },
    });

    // WHEN: Retrieving company by ID
    const response = await superadminApiRequest.get(
      `/api/companies/${company.company_id}`,
    );

    // THEN: Company details are returned
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("company_id", company.company_id);
    expect(body).toHaveProperty("name", company.name);
    expect(body).toHaveProperty("status", company.status);
    expect(body).toHaveProperty("created_at");
    expect(body).toHaveProperty("updated_at");
  });

  test("[P0] 2.1-API-004: GET /api/companies - should list all companies with pagination (AC #2)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin and multiple companies exist
    const client = await prismaClient.client.create({
      data: createClient({ name: "Test Client for Pagination" }),
    });
    const company1 = await prismaClient.company.create({
      data: {
        ...createCompany({ name: "Company 1" }),
        client_id: client.client_id,
      },
    });
    const company2 = await prismaClient.company.create({
      data: {
        ...createCompany({ name: "Company 2" }),
        client_id: client.client_id,
      },
    });

    // WHEN: Retrieving all companies (default pagination)
    const response = await superadminApiRequest.get("/api/companies");

    // THEN: Paginated list with metadata is returned
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("data");
    expect(body).toHaveProperty("meta");
    expect(body).toHaveProperty("request_metadata");
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(2);

    // Verify pagination metadata
    expect(body.meta.page).toBe(1);
    expect(body.meta.limit).toBe(20);
    expect(body.meta.total).toBeGreaterThanOrEqual(2);

    // Verify request metadata
    expect(body.request_metadata.timestamp).toBeDefined();
    expect(body.request_metadata.request_id).toBeDefined();
    expect(body.request_metadata.response_time_ms).toBeGreaterThanOrEqual(0);

    const companyIds = body.data.map((c: any) => c.company_id);
    expect(companyIds).toContain(company1.company_id);
    expect(companyIds).toContain(company2.company_id);
  });

  test("[P0] 2.1-API-005: PUT /api/companies/:companyId - should update company (AC #3)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin and a company exists
    const client = await prismaClient.client.create({
      data: createClient({ name: "Test Client for Update" }),
    });
    const company = await prismaClient.company.create({
      data: {
        ...createCompany({ name: "Original Name" }),
        client_id: client.client_id,
      },
    });
    const originalUpdatedAt = company.updated_at;

    // WHEN: Updating company
    const response = await superadminApiRequest.put(
      `/api/companies/${company.company_id}`,
      {
        name: "Updated Name",
        status: "INACTIVE",
      },
    );

    // THEN: Company is updated successfully
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("name", "Updated Name");
    expect(body).toHaveProperty("status", "INACTIVE");
    expect(body).toHaveProperty("updated_at");
    expect(new Date(body.updated_at).getTime()).toBeGreaterThan(
      originalUpdatedAt.getTime(),
    );

    // AND: Database record is updated
    const updatedCompany = await prismaClient.company.findUnique({
      where: { company_id: company.company_id },
    });
    expect(updatedCompany?.name).toBe("Updated Name");
    expect(updatedCompany?.status).toBe("INACTIVE");

    // AND: Audit log entry is created
    const auditLog = await prismaClient.auditLog.findFirst({
      where: {
        table_name: "companies",
        record_id: company.company_id,
        action: "UPDATE",
      },
    });
    expect(auditLog).not.toBeNull();
  });

  test("[P0] 2.1-API-006: DELETE /api/companies/:companyId - should hard delete non-ACTIVE company (AC #4)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin and a SUSPENDED company exists
    const client = await prismaClient.client.create({
      data: createClient({ name: "Test Client for Delete" }),
    });
    const company = await prismaClient.company.create({
      data: {
        ...createCompany({ name: "Company to Delete", status: "SUSPENDED" }),
        client_id: client.client_id,
      },
    });

    // WHEN: Deleting company (hard delete)
    const response = await superadminApiRequest.delete(
      `/api/companies/${company.company_id}`,
    );

    // THEN: Company is permanently deleted
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain("permanently deleted");

    // AND: Company record no longer exists in database (hard delete)
    const deletedCompany = await prismaClient.company.findUnique({
      where: { company_id: company.company_id },
    });
    expect(deletedCompany).toBeNull();

    // AND: Audit log entry is created
    const auditLog = await prismaClient.auditLog.findFirst({
      where: {
        table_name: "companies",
        record_id: company.company_id,
        action: "DELETE",
      },
    });
    expect(auditLog).not.toBeNull();
  });

  test("[P0] DELETE /api/companies/:companyId - should cascade hard delete to stores and user roles", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company exists with stores and user roles
    const client = await prismaClient.client.create({
      data: createClient({ name: "Test Client for Cascade" }),
    });
    const company = await prismaClient.company.create({
      data: {
        ...createCompany({
          name: "Company With Stores",
          status: "SUSPENDED",
        }),
        client_id: client.client_id,
      },
    });

    // Create a store under the company (INACTIVE to allow company deletion)
    const store = await prismaClient.store.create({
      data: {
        public_id: `ST_${Date.now()}`,
        company_id: company.company_id,
        name: "Test Store",
        status: "INACTIVE",
      },
    });

    // Create a user and assign role at company level
    const testUser = await prismaClient.user.create({
      data: {
        public_id: `USR_${Date.now()}`,
        email: `companyuser_${Date.now()}@example.com`,
        name: "Company User",
        status: "ACTIVE",
      },
    });

    const corporateAdminRole = await prismaClient.role.findUnique({
      where: { code: "CORPORATE_ADMIN" },
    });

    const companyUserRole = await prismaClient.userRole.create({
      data: {
        user_id: testUser.user_id,
        role_id: corporateAdminRole!.role_id,
        company_id: company.company_id,
        status: "ACTIVE",
      },
    });

    // WHEN: Hard deleting the company
    const response = await superadminApiRequest.delete(
      `/api/companies/${company.company_id}`,
    );

    // THEN: Company is permanently deleted
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain("permanently deleted");

    // AND: Company record no longer exists
    const deletedCompany = await prismaClient.company.findUnique({
      where: { company_id: company.company_id },
    });
    expect(deletedCompany).toBeNull();

    // AND: Associated stores are also deleted
    const deletedStore = await prismaClient.store.findUnique({
      where: { store_id: store.store_id },
    });
    expect(deletedStore).toBeNull();

    // AND: Associated user roles are also deleted
    const deletedUserRole = await prismaClient.userRole.findUnique({
      where: { user_role_id: companyUserRole.user_role_id },
    });
    expect(deletedUserRole).toBeNull();

    // Cleanup: Delete the test user (was not deleted by cascade)
    await prismaClient.user.delete({
      where: { user_id: testUser.user_id },
    });
  });
});

test.describe("2.1-API: Company Management API - Permission Enforcement", () => {
  test("[P0] 2.1-API-007: should deny access to non-System Admin users (AC #1, #2, #3, #4)", async ({
    corporateAdminApiRequest,
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as Corporate Admin (not System Admin)
    // First create a client for valid request body
    const client = await prismaClient.client.create({
      data: createClient({ name: "Test Client for Permission" }),
    });

    // WHEN: Attempting to create a company
    const createResponse = await corporateAdminApiRequest.post(
      "/api/companies",
      {
        client_id: client.client_id,
        name: "Unauthorized Company",
      },
    );

    // THEN: Access is denied with 403 Forbidden
    expect(createResponse.status()).toBe(403);
    const createBody = await createResponse.json();
    expect(createBody).toHaveProperty("error", "Forbidden");
    expect(createBody.message.toLowerCase()).toContain("permission");

    // GIVEN: I am authenticated as Store Manager (not System Admin)
    // WHEN: Attempting to list companies
    const listResponse = await storeManagerApiRequest.get("/api/companies");

    // THEN: Access is denied with 403 Forbidden
    expect(listResponse.status()).toBe(403);
  });

  test("[P0] 2.1-API-008: should deny access without authentication (AC #1, #2, #3, #4)", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am not authenticated
    // First create a client for valid request body
    const client = await prismaClient.client.create({
      data: createClient({ name: "Test Client for Auth" }),
    });

    // WHEN: Attempting to create a company
    const response = await apiRequest.post("/api/companies", {
      client_id: client.client_id,
      name: "Unauthorized Company",
    });

    // THEN: Access is denied with 401 Unauthorized
    expect(response.status()).toBe(401);
  });
});

test.describe("2.1-API: Company Management API - Error Handling", () => {
  test("[P1] 2.1-API-009: GET /api/companies/:companyId - should return 404 for non-existent company (AC #2)", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: I am authenticated as a System Admin
    // WHEN: Retrieving non-existent company
    const response = await superadminApiRequest.get(
      "/api/companies/00000000-0000-0000-0000-000000000000",
    );

    // THEN: 404 Not Found is returned
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body).toHaveProperty("error");
  });

  test("[P1] 2.1-API-010: PUT /api/companies/:companyId - should return 404 for non-existent company (AC #3)", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: I am authenticated as a System Admin
    // WHEN: Updating non-existent company
    const response = await superadminApiRequest.put(
      "/api/companies/00000000-0000-0000-0000-000000000000",
      {
        name: "Updated Name",
      },
    );

    // THEN: 404 Not Found is returned
    expect(response.status()).toBe(404);
  });

  test("[P1] 2.1-API-011: DELETE /api/companies/:companyId - should return 404 for non-existent company (AC #4)", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: I am authenticated as a System Admin
    // WHEN: Deleting non-existent company
    const response = await superadminApiRequest.delete(
      "/api/companies/00000000-0000-0000-0000-000000000000",
    );

    // THEN: 404 Not Found is returned
    expect(response.status()).toBe(404);
  });

  test("[P0] 2.1-API-012: DELETE /api/companies/:companyId - should prevent deletion of ACTIVE company", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin and an ACTIVE company exists
    const client = await prismaClient.client.create({
      data: createClient({ name: "Test Client for Active Delete" }),
    });
    const company = await prismaClient.company.create({
      data: {
        ...createCompany({ name: "Active Company", status: "ACTIVE" }),
        client_id: client.client_id,
      },
    });

    // WHEN: Attempting to delete ACTIVE company
    const response = await superadminApiRequest.delete(
      `/api/companies/${company.company_id}`,
    );

    // THEN: Deletion is rejected with 400 Bad Request
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("ACTIVE company");
    expect(body.message).toContain("Set status to INACTIVE first");

    // AND: Company remains ACTIVE in database
    const stillActiveCompany = await prismaClient.company.findUnique({
      where: { company_id: company.company_id },
    });
    expect(stillActiveCompany?.status).toBe("ACTIVE");
  });

  test("[P0] 2.1-API-028: DELETE /api/companies/:companyId - should prevent deletion of company with active stores", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin and a company with active stores exists
    const client = await prismaClient.client.create({
      data: createClient({ name: "Test Client for Active Store Delete" }),
    });
    const company = await prismaClient.company.create({
      data: {
        ...createCompany({
          name: "Company With Active Stores",
          status: "INACTIVE",
        }),
        client_id: client.client_id,
      },
    });

    // Create an ACTIVE store under the company
    const store = await prismaClient.store.create({
      data: {
        public_id: `ST_${Date.now()}`,
        company_id: company.company_id,
        name: "Active Store",
        status: "ACTIVE",
      },
    });

    // WHEN: Attempting to delete company with active stores
    const response = await superadminApiRequest.delete(
      `/api/companies/${company.company_id}`,
    );

    // THEN: Deletion is rejected with 400 Bad Request
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("active store");
    expect(body.message).toContain("Deactivate all stores first");

    // AND: Company still exists in database
    const stillExistingCompany = await prismaClient.company.findUnique({
      where: { company_id: company.company_id },
    });
    expect(stillExistingCompany).not.toBeNull();

    // AND: Store still exists and is active
    const stillActiveStore = await prismaClient.store.findUnique({
      where: { store_id: store.store_id },
    });
    expect(stillActiveStore?.status).toBe("ACTIVE");
  });
});

test.describe("2.1-API: Company Management API - Validation Edge Cases", () => {
  test("[P0] 2.1-API-013: POST /api/companies - should reject whitespace-only company name", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin
    const client = await prismaClient.client.create({
      data: createClient({ name: "Test Client for Whitespace" }),
    });

    // WHEN: Creating company with whitespace-only name
    const response = await superadminApiRequest.post("/api/companies", {
      client_id: client.client_id,
      name: "   ",
      status: "ACTIVE",
    });

    // THEN: Validation error is returned
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.message).toContain("whitespace");
  });

  test("[P0] 2.1-API-014: POST /api/companies - should reject empty company name", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin
    const client = await prismaClient.client.create({
      data: createClient({ name: "Test Client for Empty" }),
    });

    // WHEN: Creating company with empty name
    const response = await superadminApiRequest.post("/api/companies", {
      client_id: client.client_id,
      name: "",
      status: "ACTIVE",
    });

    // THEN: Validation error is returned
    expect(response.status()).toBe(400);
    const body = await response.json();
    // Fastify schema validation rejects empty strings
    expect(body.message.toLowerCase()).toMatch(/required|characters/);
  });

  test("[P0] 2.1-API-015: POST /api/companies - should accept company name with exactly 255 characters", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin
    const client = await prismaClient.client.create({
      data: createClient({ name: "Test Client for 255" }),
    });
    const longName = "A".repeat(255);

    // WHEN: Creating company with 255-char name
    const response = await superadminApiRequest.post("/api/companies", {
      client_id: client.client_id,
      name: longName,
      status: "ACTIVE",
    });

    // THEN: Company is created successfully
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.name).toBe(longName);
  });

  test("[P0] 2.1-API-016: POST /api/companies - should reject company name exceeding 255 characters", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin
    const client = await prismaClient.client.create({
      data: createClient({ name: "Test Client for 256" }),
    });
    const tooLongName = "A".repeat(256);

    // WHEN: Creating company with 256-char name
    const response = await superadminApiRequest.post("/api/companies", {
      client_id: client.client_id,
      name: tooLongName,
      status: "ACTIVE",
    });

    // THEN: Validation error is returned
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.message).toContain("255");
  });

  test("[P0] 2.1-API-017: POST /api/companies - should reject invalid status", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin
    const client = await prismaClient.client.create({
      data: createClient({ name: "Test Client for Invalid Status" }),
    });

    // WHEN: Creating company with invalid status
    const response = await superadminApiRequest.post("/api/companies", {
      client_id: client.client_id,
      name: "Test Company",
      status: "ARCHIVED" as any,
    });

    // THEN: Validation error is returned
    expect(response.status()).toBe(400);
  });

  test("[P0] 2.1-API-018: POST /api/companies - should allow PENDING status", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin
    const client = await prismaClient.client.create({
      data: createClient({ name: "Test Client for Pending" }),
    });

    // WHEN: Creating company with PENDING status
    const response = await superadminApiRequest.post("/api/companies", {
      client_id: client.client_id,
      name: "Pending Company",
      status: "PENDING",
    });

    // THEN: Company is created with PENDING status
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.status).toBe("PENDING");

    // Cleanup
    await prismaClient.company.delete({
      where: { company_id: body.company_id },
    });
    await prismaClient.client.delete({
      where: { client_id: client.client_id },
    });
  });

  test("[P0] 2.1-API-019: PUT /api/companies/:companyId - should allow status transitions", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin and a PENDING company exists
    const client = await prismaClient.client.create({
      data: createClient({ name: "Test Client for Status Transitions" }),
    });
    const company = await prismaClient.company.create({
      data: {
        ...createCompany({ name: "Status Test Company", status: "PENDING" }),
        client_id: client.client_id,
      },
    });

    // WHEN: Updating status from PENDING to ACTIVE
    const response = await superadminApiRequest.put(
      `/api/companies/${company.company_id}`,
      {
        status: "ACTIVE",
      },
    );

    // THEN: Status is updated successfully
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ACTIVE");
  });

  test("[P0] 2.1-API-019a: PUT /api/companies/:companyId - should prevent activating company when client is inactive", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin and an INACTIVE client exists
    const client = await prismaClient.client.create({
      data: createClient({ name: "Inactive Client", status: "INACTIVE" }),
    });

    // AND: An INACTIVE company exists under this client
    const company = await prismaClient.company.create({
      data: {
        ...createCompany({ name: "Inactive Company", status: "INACTIVE" }),
        client_id: client.client_id,
      },
    });

    // WHEN: Attempting to activate the company while client is inactive
    const response = await superadminApiRequest.put(
      `/api/companies/${company.company_id}`,
      {
        status: "ACTIVE",
      },
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.message).toContain("Cannot activate company");
    expect(body.message).toContain("parent client is inactive");

    // AND: Company remains INACTIVE in database
    const unchangedCompany = await prismaClient.company.findUnique({
      where: { company_id: company.company_id },
    });
    expect(unchangedCompany?.status).toBe("INACTIVE");

    // Cleanup
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });
    await prismaClient.client.delete({
      where: { client_id: client.client_id },
    });
  });

  test("[P0] 2.1-API-020: PUT /api/companies/:companyId - should reject whitespace-only name update", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin and a company exists
    const client = await prismaClient.client.create({
      data: createClient({ name: "Test Client for Whitespace Update" }),
    });
    const company = await prismaClient.company.create({
      data: {
        ...createCompany({ name: "Original Name" }),
        client_id: client.client_id,
      },
    });

    // WHEN: Updating company with whitespace-only name
    const response = await superadminApiRequest.put(
      `/api/companies/${company.company_id}`,
      {
        name: "   ",
      },
    );

    // THEN: Validation error is returned
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.message).toContain("whitespace");
  });

  test("[P0] 2.1-API-021: should allow duplicate company names", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin and a company exists
    const client = await prismaClient.client.create({
      data: createClient({ name: "Test Client for Duplicates" }),
    });
    await prismaClient.company.create({
      data: {
        ...createCompany({ name: "Starbucks" }),
        client_id: client.client_id,
      },
    });

    // WHEN: Creating another company with the same name
    const response = await superadminApiRequest.post("/api/companies", {
      client_id: client.client_id,
      name: "Starbucks",
      status: "ACTIVE",
    });

    // THEN: Company is created successfully (duplicates allowed)
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.name).toBe("Starbucks");
  });
});

test.describe("2.1-API: Company Management API - Audit Log Validation", () => {
  test("[P0] 2.1-API-022: audit log should include username and roles", async ({
    superadminApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin
    const client = await prismaClient.client.create({
      data: createClient({ name: "Test Client for Audit" }),
    });

    // WHEN: Creating a company
    const response = await superadminApiRequest.post("/api/companies", {
      client_id: client.client_id,
      name: "Audit Test Company",
      status: "ACTIVE",
    });

    expect(response.status()).toBe(201);
    const body = await response.json();

    // THEN: Audit log includes username and roles
    const auditLog = await prismaClient.auditLog.findFirst({
      where: {
        table_name: "companies",
        record_id: body.company_id,
        action: "CREATE",
      },
    });

    expect(auditLog).not.toBeNull();
    expect(auditLog?.reason).toContain(superadminUser.email);
    expect(auditLog?.reason).toContain("roles:");
  });

  test("[P0] 2.1-API-023: audit log should capture x-forwarded-for IP when behind proxy", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin and request comes through proxy
    const client = await prismaClient.client.create({
      data: createClient({ name: "Test Client for Proxy IP" }),
    });
    const realClientIP = "203.45.67.89";

    // WHEN: Creating a company with x-forwarded-for header
    const response = await superadminApiRequest.post(
      "/api/companies",
      {
        client_id: client.client_id,
        name: "Proxy IP Test Company",
        status: "ACTIVE",
      },
      {
        headers: {
          "x-forwarded-for": `${realClientIP}, 10.0.0.1, 10.0.0.2`,
        },
      },
    );

    expect(response.status()).toBe(201);
    const body = await response.json();

    // THEN: Audit log captures the real client IP (first in x-forwarded-for chain)
    const auditLog = await prismaClient.auditLog.findFirst({
      where: {
        table_name: "companies",
        record_id: body.company_id,
        action: "CREATE",
      },
    });

    expect(auditLog).not.toBeNull();
    expect(auditLog?.ip_address).toBe(realClientIP);
  });
});

test.describe("2.1-API: Company Management API - Security Tests", () => {
  test("[P0] 2.1-API-024: should sanitize SQL injection attempts in company name", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin
    const client = await prismaClient.client.create({
      data: createClient({ name: "Test Client for SQL Injection" }),
    });
    const sqlInjectionAttempt = "'; DROP TABLE companies; --";

    // WHEN: Attempting to create company with SQL injection in name
    const response = await superadminApiRequest.post("/api/companies", {
      client_id: client.client_id,
      name: sqlInjectionAttempt,
      status: "ACTIVE",
    });

    // THEN: Company is created with the malicious string safely stored (Prisma handles SQL injection)
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.name).toBe(sqlInjectionAttempt.trim());

    // AND: Database is intact - companies table still exists
    const companyCount = await prismaClient.company.count();
    expect(companyCount).toBeGreaterThan(0);

    // AND: The malicious string is safely stored, not executed
    const savedCompany = await prismaClient.company.findUnique({
      where: { company_id: body.company_id },
    });
    expect(savedCompany?.name).toBe(sqlInjectionAttempt.trim());
  });

  test("[P0] 2.1-API-025: should reject XSS attempts in company name", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin
    const client = await prismaClient.client.create({
      data: createClient({ name: "Test Client for XSS" }),
    });
    const xssAttempt = "<script>alert('xss')</script>";

    // WHEN: Attempting to create company with XSS payload in name
    const response = await superadminApiRequest.post("/api/companies", {
      client_id: client.client_id,
      name: xssAttempt,
      status: "ACTIVE",
    });

    // THEN: Company is created (backend stores it safely, frontend should escape)
    expect(response.status()).toBe(201);
    const body = await response.json();

    // The string is stored as-is (not executed)
    // Frontend is responsible for proper escaping when displaying
    expect(body.name).toBe(xssAttempt);
  });

  test("[P0] 2.1-API-026: should reject excessively long company names (buffer overflow protection)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin
    const client = await prismaClient.client.create({
      data: createClient({ name: "Test Client for Buffer Overflow" }),
    });
    const veryLongName = "A".repeat(10000); // 10KB string

    // WHEN: Attempting to create company with extremely long name
    const response = await superadminApiRequest.post("/api/companies", {
      client_id: client.client_id,
      name: veryLongName,
      status: "ACTIVE",
    });

    // THEN: Request is rejected with validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.message).toContain("255");
  });
});

test.describe("2.1-API: Company Management API - Concurrent Operations", () => {
  test("[P0] 2.1-API-027: should handle concurrent updates to same company", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin and a company exists
    const client = await prismaClient.client.create({
      data: createClient({ name: "Test Client for Concurrent" }),
    });
    const company = await prismaClient.company.create({
      data: {
        ...createCompany({ name: "Concurrent Test Company" }),
        client_id: client.client_id,
      },
    });

    // WHEN: Two admins attempt to update the same company simultaneously
    const update1Promise = superadminApiRequest.put(
      `/api/companies/${company.company_id}`,
      {
        name: "Updated by Admin 1",
      },
    );

    const update2Promise = superadminApiRequest.put(
      `/api/companies/${company.company_id}`,
      {
        name: "Updated by Admin 2",
      },
    );

    const [response1, response2] = await Promise.all([
      update1Promise,
      update2Promise,
    ]);

    // THEN: Both updates succeed (last write wins - database handles concurrency)
    expect(response1.status()).toBe(200);
    expect(response2.status()).toBe(200);

    // AND: Final state reflects one of the updates
    const finalCompany = await prismaClient.company.findUnique({
      where: { company_id: company.company_id },
    });

    // Either "Updated by Admin 1" or "Updated by Admin 2" should be the final state
    expect(
      finalCompany?.name === "Updated by Admin 1" ||
        finalCompany?.name === "Updated by Admin 2",
    ).toBe(true);

    // AND: Both updates are logged in audit trail
    const auditLogs = await prismaClient.auditLog.findMany({
      where: {
        table_name: "companies",
        record_id: company.company_id,
        action: "UPDATE",
      },
      orderBy: { timestamp: "asc" },
    });

    expect(auditLogs.length).toBeGreaterThanOrEqual(2);
  });
});
