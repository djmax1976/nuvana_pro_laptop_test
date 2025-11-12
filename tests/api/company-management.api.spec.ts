import { test, expect } from "../support/fixtures/rbac.fixture";
import { createCompany } from "../support/factories";

/**
 * Company Management API Tests
 *
 * Tests for Company Management API endpoints:
 * - Create, read, update, delete companies (CRUD operations)
 * - Permission enforcement (only System Admins can manage companies)
 * - Audit logging for all company operations
 * - Soft delete functionality (status update, not hard delete)
 * - Validation and error handling
 *
 * Priority: P0 (Critical - Multi-tenant foundation)
 */

test.describe("Company Management API - CRUD Operations", () => {
  test("[P0] POST /api/companies - should create company with valid data (AC #1)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin with valid company data
    const companyData = createCompany({
      name: "Test Company Inc",
      status: "ACTIVE",
    });

    // WHEN: Creating a company via API
    const response = await superadminApiRequest.post("/api/companies", {
      name: companyData.name,
      status: companyData.status,
    });

    // THEN: Company is created successfully
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body).toHaveProperty("company_id");
    expect(body).toHaveProperty("name", companyData.name);
    expect(body).toHaveProperty("status", companyData.status);
    expect(body).toHaveProperty("created_at");
    expect(body).toHaveProperty("updated_at");

    // AND: Company record exists in database
    const company = await prismaClient.company.findUnique({
      where: { company_id: body.company_id },
    });
    expect(company).not.toBeNull();
    expect(company?.name).toBe(companyData.name);

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

  test("[P0] POST /api/companies - should reject invalid data (AC #1)", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: I am authenticated as a System Admin with invalid company data (missing name)
    // WHEN: Creating a company with missing required field
    const response = await superadminApiRequest.post("/api/companies", {
      status: "ACTIVE",
      // name is missing
    });

    // THEN: Validation error is returned
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("validation");
  });

  test("[P0] GET /api/companies/:companyId - should retrieve company by ID (AC #2)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin and a company exists
    const companyData = createCompany();
    const company = await prismaClient.company.create({
      data: {
        name: companyData.name,
        status: companyData.status,
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

  test("[P0] GET /api/companies - should list all companies (AC #2)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin and multiple companies exist
    const company1 = await prismaClient.company.create({
      data: createCompany({ name: "Company 1" }),
    });
    const company2 = await prismaClient.company.create({
      data: createCompany({ name: "Company 2" }),
    });

    // WHEN: Retrieving all companies
    const response = await superadminApiRequest.get("/api/companies");

    // THEN: List of companies is returned
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(2);
    const companyIds = body.map((c: any) => c.company_id);
    expect(companyIds).toContain(company1.company_id);
    expect(companyIds).toContain(company2.company_id);
  });

  test("[P0] PUT /api/companies/:companyId - should update company (AC #3)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin and a company exists
    const company = await prismaClient.company.create({
      data: createCompany({ name: "Original Name" }),
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

  test("[P0] DELETE /api/companies/:companyId - should soft delete company (AC #4)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin and a company exists
    const company = await prismaClient.company.create({
      data: createCompany({ name: "Company to Delete" }),
    });

    // WHEN: Deleting company (soft delete)
    const response = await superadminApiRequest.delete(
      `/api/companies/${company.company_id}`,
    );

    // THEN: Company is soft-deleted (status updated)
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("status");
    expect(["INACTIVE", "DELETED"]).toContain(body.status);

    // AND: Company record still exists in database (soft delete)
    const deletedCompany = await prismaClient.company.findUnique({
      where: { company_id: company.company_id },
    });
    expect(deletedCompany).not.toBeNull();
    expect(["INACTIVE", "DELETED"]).toContain(deletedCompany?.status);

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
});

test.describe("Company Management API - Permission Enforcement", () => {
  test("[P0] should deny access to non-System Admin users (AC #1, #2, #3, #4)", async ({
    corporateAdminApiRequest,
    storeManagerApiRequest,
  }) => {
    // GIVEN: I am authenticated as Corporate Admin (not System Admin)
    // WHEN: Attempting to create a company
    const createResponse = await corporateAdminApiRequest.post(
      "/api/companies",
      {
        name: "Unauthorized Company",
      },
    );

    // THEN: Access is denied with 403 Forbidden
    expect(createResponse.status()).toBe(403);
    const createBody = await createResponse.json();
    expect(createBody).toHaveProperty("error", "Forbidden");
    expect(createBody.message).toContain("permission");

    // GIVEN: I am authenticated as Store Manager (not System Admin)
    // WHEN: Attempting to list companies
    const listResponse = await storeManagerApiRequest.get("/api/companies");

    // THEN: Access is denied with 403 Forbidden
    expect(listResponse.status()).toBe(403);
  });

  test("[P0] should deny access without authentication (AC #1, #2, #3, #4)", async ({
    apiRequest,
  }) => {
    // GIVEN: I am not authenticated
    // WHEN: Attempting to create a company
    const response = await apiRequest.post("/api/companies", {
      name: "Unauthorized Company",
    });

    // THEN: Access is denied with 401 Unauthorized
    expect(response.status()).toBe(401);
  });
});

test.describe("Company Management API - Error Handling", () => {
  test("[P1] GET /api/companies/:companyId - should return 404 for non-existent company (AC #2)", async ({
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

  test("[P1] PUT /api/companies/:companyId - should return 404 for non-existent company (AC #3)", async ({
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

  test("[P1] DELETE /api/companies/:companyId - should return 404 for non-existent company (AC #4)", async ({
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
});
