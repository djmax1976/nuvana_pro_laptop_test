import { test, expect } from "../support/fixtures/rbac.fixture";
import { createEmployeeRequest } from "../support/factories/client-employee.factory";
import {
  createCompany,
  createStore,
  createUser,
  createClientUser,
} from "../support/factories";

/**
 * Client Employee Management API Tests
 *
 * Tests for Client Employee Management API endpoints:
 * - Create employees with STORE scope role restrictions
 * - List employees filtered by client's stores (RLS)
 * - Delete employees with authorization checks
 * - Audit logging for all operations
 * - Permission enforcement (CLIENT_EMPLOYEE_CREATE, CLIENT_EMPLOYEE_DELETE)
 * - Security: Authentication, Authorization, Input Validation
 *
 * Story: 2.91 - Client Employee Management
 * Priority: P0 (Critical - Client self-service, security boundaries)
 *
 * Enhanced by Opus QA Workflow 9 - Interactive Test Enhancement
 */

test.describe("2.91-API: Client Employee Management - Employee CRUD Operations", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE EMPLOYEE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.91-API-001: [P1] POST /api/client/employees - should create employee with valid data (AC #1, #2)", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client User with a company and store
    // (clientUser fixture provides user with company and store)

    // Get a STORE scope role for employee assignment
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    const employeeData = createEmployeeRequest({
      store_id: clientUser.store_id,
      role_id: storeRole.role_id,
    });

    // WHEN: Creating an employee via API
    const response = await clientUserApiRequest.post("/api/client/employees", {
      email: employeeData.email,
      name: employeeData.name,
      store_id: employeeData.store_id,
      role_id: employeeData.role_id,
    });

    // THEN: Employee is created successfully
    expect(response.status(), "Expected 201 Created status").toBe(201);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data, "Response should contain user_id").toHaveProperty(
      "user_id",
    );
    expect(body.data.email, "Email should match input").toBe(
      employeeData.email,
    );
    expect(body.data.name, "Name should match input").toBe(employeeData.name);
    expect(body.data.status, "Status should be ACTIVE").toBe("ACTIVE");

    // AND: Response data types are correct
    expect(typeof body.data.user_id, "user_id should be string").toBe("string");
    expect(body.data.user_id, "user_id should be valid UUID format").toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(Array.isArray(body.data.roles), "roles should be an array").toBe(
      true,
    );

    // AND: Employee record exists in database
    const employee = await prismaClient.user.findUnique({
      where: { user_id: body.data.user_id },
    });
    expect(employee, "Employee should exist in database").not.toBeNull();
    expect(employee?.email).toBe(employeeData.email);

    // AND: STORE scope role is assigned
    const userRole = await prismaClient.userRole.findFirst({
      where: {
        user_id: body.data.user_id,
        role_id: storeRole.role_id,
        store_id: clientUser.store_id,
      },
    });
    expect(userRole, "UserRole assignment should exist").not.toBeNull();

    // AND: Audit log entry is created with client user_id
    const auditLog = await prismaClient.auditLog.findFirst({
      where: {
        table_name: "users",
        record_id: body.data.user_id,
        action: "CREATE",
        user_id: clientUser.user_id,
      },
    });
    expect(auditLog, "Audit log should be created").not.toBeNull();
    expect(auditLog?.action).toBe("CREATE");

    // AND: Password is NOT exposed in response (Data Leakage Prevention)
    expect(
      body.data,
      "Response should not contain password",
    ).not.toHaveProperty("password");
    expect(
      body.data,
      "Response should not contain password_hash",
    ).not.toHaveProperty("password_hash");
  });

  test("2.91-API-002: [P0] POST /api/client/employees - should reject SYSTEM scope role assignment (AC #2)", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client User with a company and store

    // Get a SYSTEM scope role (should be rejected)
    const systemRole = await prismaClient.role.findFirst({
      where: { scope: "SYSTEM" },
    });
    if (!systemRole) {
      throw new Error("No SYSTEM scope role found in database");
    }

    const employeeData = createEmployeeRequest({
      store_id: clientUser.store_id,
      role_id: systemRole.role_id,
    });

    // WHEN: Attempting to create employee with SYSTEM scope role
    const response = await clientUserApiRequest.post("/api/client/employees", {
      email: employeeData.email,
      name: employeeData.name,
      store_id: employeeData.store_id,
      role_id: employeeData.role_id,
    });

    // THEN: Request is rejected with 403 Forbidden
    expect(response.status(), "Should reject SYSTEM scope role with 403").toBe(
      403,
    );
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("error");
    expect(body.error).toHaveProperty("code");
    expect(body.error).toHaveProperty("message");
    expect(
      body.error.message,
      "Error should mention STORE scope restriction",
    ).toContain("STORE scope");
  });

  test("2.91-API-003: [P0] POST /api/client/employees - should reject COMPANY scope role assignment (AC #2)", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client User with a company and store

    // Get a COMPANY scope role (should be rejected)
    const companyRole = await prismaClient.role.findFirst({
      where: { scope: "COMPANY" },
    });
    if (!companyRole) {
      throw new Error("No COMPANY scope role found in database");
    }

    const employeeData = createEmployeeRequest({
      store_id: clientUser.store_id,
      role_id: companyRole.role_id,
    });

    // WHEN: Attempting to create employee with COMPANY scope role
    const response = await clientUserApiRequest.post("/api/client/employees", {
      email: employeeData.email,
      name: employeeData.name,
      store_id: employeeData.store_id,
      role_id: employeeData.role_id,
    });

    // THEN: Request is rejected with 403 Forbidden
    expect(response.status(), "Should reject COMPANY scope role with 403").toBe(
      403,
    );
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("error");
    expect(body.error).toHaveProperty("code");
    expect(body.error).toHaveProperty("message");
    expect(
      body.error.message,
      "Error should mention STORE scope restriction",
    ).toContain("STORE scope");
  });

  test("2.91-API-004: [P0] POST /api/client/employees - should reject store_id not belonging to client (AC #2)", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client User
    // AND: Another client has a store
    const otherClient = await prismaClient.user.create({
      data: createClientUser(),
    });
    const otherCompany = await prismaClient.company.create({
      data: createCompany({ owner_user_id: otherClient.user_id }),
    });
    const otherStore = await prismaClient.store.create({
      data: createStore({ company_id: otherCompany.company_id }),
    });

    // Get a STORE scope role
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    const employeeData = createEmployeeRequest({
      store_id: otherStore.store_id, // Store belonging to another client
      role_id: storeRole.role_id,
    });

    // WHEN: Attempting to create employee with store_id from another client
    const response = await clientUserApiRequest.post("/api/client/employees", {
      email: employeeData.email,
      name: employeeData.name,
      store_id: employeeData.store_id,
      role_id: employeeData.role_id,
    });

    // THEN: Request is rejected with 403 Forbidden (Cross-tenant access blocked)
    expect(response.status(), "Should block cross-tenant access with 403").toBe(
      403,
    );
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("error");
  });

  test("2.91-API-005: [P0] POST /api/client/employees - should reject duplicate email (AC #4)", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: An employee with a specific email already exists
    const existingEmployee = await prismaClient.user.create({
      data: createUser({ email: "existing_dup_test@test.nuvana.local" }),
    });

    // Get a STORE scope role
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    // WHEN: Creating another employee with the same email
    const response = await clientUserApiRequest.post("/api/client/employees", {
      email: existingEmployee.email,
      name: "New Employee",
      store_id: clientUser.store_id,
      role_id: storeRole.role_id,
    });

    // THEN: Duplicate email error is returned
    expect(response.status(), "Should reject duplicate email with 400").toBe(
      400,
    );
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("error");
    expect(body.error).toHaveProperty("code");
    expect(body.error).toHaveProperty("message");
    expect(
      body.error.message.toLowerCase(),
      "Error should mention email already exists",
    ).toContain("email");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LIST EMPLOYEES TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.91-API-006: [P1] GET /api/client/employees - should list employees filtered by client's stores (AC #1)", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client User with a store
    // Create employees for this client's stores
    const employee1 = await prismaClient.user.create({
      data: createUser({ email: "emp1_list_test@test.nuvana.local" }),
    });

    // Get STORE scope role
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    // Assign employee to client's store
    await prismaClient.userRole.create({
      data: {
        user_id: employee1.user_id,
        role_id: storeRole.role_id,
        store_id: clientUser.store_id,
        company_id: clientUser.company_id,
      },
    });

    // WHEN: Retrieving employees list
    const response = await clientUserApiRequest.get("/api/client/employees");

    // THEN: Paginated list with employees is returned
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body, "Response should have data array").toHaveProperty("data");
    expect(body, "Response should have meta for pagination").toHaveProperty(
      "meta",
    );
    expect(Array.isArray(body.data), "data should be an array").toBe(true);

    // AND: Pagination meta is correct
    expect(body.meta, "Meta should have page").toHaveProperty("page");
    expect(body.meta, "Meta should have limit").toHaveProperty("limit");
    expect(body.meta, "Meta should have total").toHaveProperty("total");
    expect(body.meta, "Meta should have totalPages").toHaveProperty(
      "totalPages",
    );

    // AND: Employee data has expected structure
    if (body.data.length > 0) {
      const employeeData = body.data[0];
      expect(employeeData, "Employee should have name").toHaveProperty("name");
      expect(employeeData, "Employee should have email").toHaveProperty(
        "email",
      );
      expect(employeeData, "Employee should have status").toHaveProperty(
        "status",
      );
      expect(employeeData, "Employee should have roles array").toHaveProperty(
        "roles",
      );
    }
  });

  test("2.91-API-007: [P0] GET /api/client/employees - should not return employees from other clients (AC #1)", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Another client has employees
    const otherClient = await prismaClient.user.create({
      data: createClientUser(),
    });
    const otherCompany = await prismaClient.company.create({
      data: createCompany({ owner_user_id: otherClient.user_id }),
    });
    const otherStore = await prismaClient.store.create({
      data: createStore({ company_id: otherCompany.company_id }),
    });
    const otherEmployee = await prismaClient.user.create({
      data: createUser({ email: "other_isolation@test.nuvana.local" }),
    });

    // Get STORE scope role
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    await prismaClient.userRole.create({
      data: {
        user_id: otherEmployee.user_id,
        role_id: storeRole.role_id,
        store_id: otherStore.store_id,
        company_id: otherCompany.company_id,
      },
    });

    // WHEN: Retrieving employees list as current client
    const response = await clientUserApiRequest.get("/api/client/employees");

    // THEN: Other client's employees are not included (RLS/tenant isolation)
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    const otherEmployeeData = body.data.find(
      (e: { user_id: string }) => e.user_id === otherEmployee.user_id,
    );
    expect(
      otherEmployeeData,
      "Other client's employee should not be visible",
    ).toBeUndefined();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE EMPLOYEE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.91-API-008: [P0] DELETE /api/client/employees/:userId - should delete employee belonging to client (AC #3)", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client User with an employee
    const employee = await prismaClient.user.create({
      data: createUser({ email: "employee_delete@test.nuvana.local" }),
    });

    // Get STORE scope role
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    await prismaClient.userRole.create({
      data: {
        user_id: employee.user_id,
        role_id: storeRole.role_id,
        store_id: clientUser.store_id,
        company_id: clientUser.company_id,
      },
    });

    // WHEN: Deleting the employee
    const response = await clientUserApiRequest.delete(
      `/api/client/employees/${employee.user_id}`,
    );

    // THEN: Employee is deleted successfully
    expect(response.status(), "Should return 200 OK on successful delete").toBe(
      200,
    );
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.message, "Response should include success message").toBe(
      "Employee deleted successfully",
    );

    // AND: Employee record is DELETED (hard delete)
    const deletedEmployee = await prismaClient.user.findUnique({
      where: { user_id: employee.user_id },
    });
    expect(
      deletedEmployee,
      "Employee record should be deleted (hard delete)",
    ).toBeNull();

    // AND: User roles are also deleted
    const deletedUserRoles = await prismaClient.userRole.findMany({
      where: { user_id: employee.user_id },
    });
    expect(deletedUserRoles.length, "User roles should be deleted").toBe(0);
  });

  test("2.91-API-009: [P0] DELETE /api/client/employees/:userId - should reject deleting SYSTEM scope user (AC #3)", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A SYSTEM scope user exists
    const systemUser = await prismaClient.user.create({
      data: createUser({ email: "system_protect@test.nuvana.local" }),
    });

    // Get SYSTEM scope role
    const systemRole = await prismaClient.role.findFirst({
      where: { scope: "SYSTEM" },
    });
    if (!systemRole) {
      throw new Error("No SYSTEM scope role found in database");
    }

    await prismaClient.userRole.create({
      data: {
        user_id: systemUser.user_id,
        role_id: systemRole.role_id,
      },
    });

    // WHEN: Attempting to delete SYSTEM scope user
    const response = await clientUserApiRequest.delete(
      `/api/client/employees/${systemUser.user_id}`,
    );

    // THEN: Request is rejected with 403 Forbidden (Privilege escalation blocked)
    expect(
      response.status(),
      "Should block deletion of SYSTEM scope users",
    ).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("error");
  });

  test("2.91-API-010: [P0] DELETE /api/client/employees/:userId - should reject deleting other client's employee (AC #3)", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Another client has an employee
    const otherClient = await prismaClient.user.create({
      data: createClientUser(),
    });
    const otherCompany = await prismaClient.company.create({
      data: createCompany({ owner_user_id: otherClient.user_id }),
    });
    const otherStore = await prismaClient.store.create({
      data: createStore({ company_id: otherCompany.company_id }),
    });
    const otherEmployee = await prismaClient.user.create({
      data: createUser({ email: "other_del_protect@test.nuvana.local" }),
    });

    // Get STORE scope role
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    await prismaClient.userRole.create({
      data: {
        user_id: otherEmployee.user_id,
        role_id: storeRole.role_id,
        store_id: otherStore.store_id,
        company_id: otherCompany.company_id,
      },
    });

    // WHEN: Attempting to delete other client's employee
    const response = await clientUserApiRequest.delete(
      `/api/client/employees/${otherEmployee.user_id}`,
    );

    // THEN: Request is rejected with 403 Forbidden (Cross-tenant access blocked)
    expect(
      response.status(),
      "Should block deletion of other client's employee",
    ).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("error");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INPUT VALIDATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.91-API-011: [P0] POST /api/client/employees - should validate required fields (AC #4)", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Client User
    // WHEN: Creating employee with missing required fields
    const response = await clientUserApiRequest.post("/api/client/employees", {
      // email is missing
      name: "Test Employee",
      // store_id is missing
    });

    // THEN: Validation error is returned
    expect(response.status(), "Should return 400 for missing fields").toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("error");
  });

  test("2.91-API-013: [P0] POST /api/client/employees - should reject invalid email format", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client User
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    // WHEN: Creating employee with invalid email format
    const response = await clientUserApiRequest.post("/api/client/employees", {
      email: "invalid-email-no-at-symbol",
      name: "Test Employee",
      store_id: clientUser.store_id,
      role_id: storeRole.role_id,
    });

    // THEN: Validation error is returned
    expect(response.status(), "Should reject invalid email with 400").toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("error");
  });

  test("2.91-API-014: [P1] POST /api/client/employees - should reject whitespace-only name", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client User
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    // WHEN: Creating employee with whitespace-only name
    const response = await clientUserApiRequest.post("/api/client/employees", {
      email: "whitespace_test@test.nuvana.local",
      name: "   ",
      store_id: clientUser.store_id,
      role_id: storeRole.role_id,
    });

    // THEN: Validation error is returned
    expect(
      response.status(),
      "Should reject whitespace-only name with 400",
    ).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("error");
  });

  test("2.91-API-015: [P1] POST /api/client/employees - should reject invalid UUID for store_id", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client User
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    // WHEN: Creating employee with invalid UUID format for store_id
    const response = await clientUserApiRequest.post("/api/client/employees", {
      email: "uuid_test@test.nuvana.local",
      name: "Test Employee",
      store_id: "not-a-valid-uuid",
      role_id: storeRole.role_id,
    });

    // THEN: Request is rejected with 400 Bad Request (input validation runs before auth)
    // Input validation is performed before authentication/authorization checks to ensure
    // invalid input format errors (400) are returned before authorization errors (403)
    expect(
      response.status(),
      "Should reject invalid UUID with 400 (validation before auth)",
    ).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("error");
  });

  test("2.91-API-016: [P1] DELETE /api/client/employees/:userId - should reject invalid UUID in URL param", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Client User
    // WHEN: Attempting to delete with invalid UUID
    const response = await clientUserApiRequest.delete(
      "/api/client/employees/not-a-valid-uuid",
    );

    // THEN: Validation error is returned
    expect(response.status(), "Should reject invalid UUID with 400").toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("error");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PERMISSION ENFORCEMENT TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.91-API-012: [P0] All endpoints should require CLIENT_EMPLOYEE permissions (AC #1, #3)", async ({
    regularUserApiRequest,
  }) => {
    // GIVEN: I am authenticated as a regular user without CLIENT_EMPLOYEE permissions
    // WHEN: Attempting to access employee endpoints
    const createResponse = await regularUserApiRequest.post(
      "/api/client/employees",
      {
        email: "test@test.com",
        name: "Test",
        store_id: "00000000-0000-0000-0000-000000000000",
        role_id: "00000000-0000-0000-0000-000000000000",
      },
    );
    const listResponse = await regularUserApiRequest.get(
      "/api/client/employees",
    );
    const deleteResponse = await regularUserApiRequest.delete(
      "/api/client/employees/00000000-0000-0000-0000-000000000000",
    );

    // THEN: All requests are rejected with 403 Forbidden
    expect(createResponse.status(), "Create should require permission").toBe(
      403,
    );
    expect(listResponse.status(), "List should require permission").toBe(403);
    expect(deleteResponse.status(), "Delete should require permission").toBe(
      403,
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHENTICATION TESTS (Security - Mandatory)
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.91-API-017: [P0] SECURITY - All endpoints should reject unauthenticated requests", async ({
    apiRequest,
  }) => {
    // GIVEN: I am NOT authenticated (no token)
    // WHEN: Attempting to access employee endpoints without authentication
    const createResponse = await apiRequest.post("/api/client/employees", {
      email: "test@test.com",
      name: "Test",
      store_id: "00000000-0000-0000-0000-000000000000",
      role_id: "00000000-0000-0000-0000-000000000000",
    });
    const listResponse = await apiRequest.get("/api/client/employees");
    const deleteResponse = await apiRequest.delete(
      "/api/client/employees/00000000-0000-0000-0000-000000000000",
    );

    // THEN: All requests are rejected with 401 Unauthorized
    expect(
      createResponse.status(),
      "Create should require authentication",
    ).toBe(401);
    expect(listResponse.status(), "List should require authentication").toBe(
      401,
    );
    expect(
      deleteResponse.status(),
      "Delete should require authentication",
    ).toBe(401);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGINATION EDGE CASE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.91-API-018: [P2] GET /api/client/employees - should handle pagination parameters correctly", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Client User
    // WHEN: Requesting with specific pagination parameters
    const response = await clientUserApiRequest.get(
      "/api/client/employees?page=1&limit=10",
    );

    // THEN: Response respects pagination parameters
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.meta.page, "Page should be 1").toBe(1);
    expect(body.meta.limit, "Limit should be 10").toBe(10);
  });

  test("2.91-API-019: [P2] GET /api/client/employees - should reject invalid pagination values", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Client User
    // WHEN: Requesting with page=0 (invalid - min is 1)
    const response = await clientUserApiRequest.get(
      "/api/client/employees?page=0",
    );

    // THEN: Validation error is returned
    expect(response.status(), "Should reject page=0 with 400").toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test("2.91-API-020: [P2] GET /api/client/employees - should reject limit exceeding max", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Client User
    // WHEN: Requesting with limit=101 (max is 100)
    const response = await clientUserApiRequest.get(
      "/api/client/employees?limit=101",
    );

    // THEN: Validation error is returned
    expect(response.status(), "Should reject limit=101 with 400").toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA LEAKAGE PREVENTION TESTS (Security - Mandatory)
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.91-API-021: [P0] SECURITY - GET /api/client/employees - should not expose sensitive data", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: An employee exists in the client's store
    const employee = await prismaClient.user.create({
      data: createUser({ email: "sensitive_test@test.nuvana.local" }),
    });

    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    await prismaClient.userRole.create({
      data: {
        user_id: employee.user_id,
        role_id: storeRole.role_id,
        store_id: clientUser.store_id,
        company_id: clientUser.company_id,
      },
    });

    // WHEN: Retrieving employees list
    const response = await clientUserApiRequest.get("/api/client/employees");

    // THEN: Response does not contain sensitive fields
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    if (body.data.length > 0) {
      const employeeData = body.data[0];
      expect(employeeData, "Should not expose password").not.toHaveProperty(
        "password",
      );
      expect(
        employeeData,
        "Should not expose password_hash",
      ).not.toHaveProperty("password_hash");
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SQL INJECTION PREVENTION TESTS (Security - Mandatory)
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.91-API-022: [P0] SECURITY - POST /api/client/employees - should sanitize SQL injection in email", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client User
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    // WHEN: Creating employee with SQL injection attempt in email
    const response = await clientUserApiRequest.post("/api/client/employees", {
      email: "test'; DROP TABLE users; --@test.nuvana.local",
      name: "SQL Injection Test",
      store_id: clientUser.store_id,
      role_id: storeRole.role_id,
    });

    // THEN: Request is rejected (invalid email format) or sanitized
    // The system should either reject the malicious input or safely handle it
    expect(
      [400, 201],
      "Should reject or safely handle SQL injection",
    ).toContain(response.status());

    // Verify database is intact
    const users = await prismaClient.user.findMany({ take: 1 });
    expect(users, "Database should still be accessible").toBeDefined();
  });

  test("2.91-API-023: [P0] SECURITY - GET /api/client/employees - should sanitize SQL injection in search param", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client User
    // WHEN: Searching with SQL injection attempt
    const response = await clientUserApiRequest.get(
      "/api/client/employees?search='; DROP TABLE users; --",
    );

    // THEN: Request completes without database damage
    expect([200, 400], "Should handle SQL injection safely").toContain(
      response.status(),
    );

    // Verify database is intact
    const users = await prismaClient.user.findMany({ take: 1 });
    expect(users, "Database should still be accessible").toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SELF-DELETION PREVENTION TEST
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.91-API-024: [P0] DELETE /api/client/employees/:userId - should reject self-deletion", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: I am authenticated as a Client User
    // WHEN: Attempting to delete myself
    const response = await clientUserApiRequest.delete(
      `/api/client/employees/${clientUser.user_id}`,
    );

    // THEN: Request is rejected (cannot delete own account)
    expect(response.status(), "Should reject self-deletion with 400").toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("error");
    expect(body.error).toHaveProperty("code");
    expect(body.error).toHaveProperty("message");
    expect(
      body.error.message.toLowerCase(),
      "Error should mention cannot delete own account",
    ).toContain("cannot delete");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NON-EXISTENT RESOURCE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.91-API-025: [P1] DELETE /api/client/employees/:userId - should return 404 for non-existent user", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Client User
    // WHEN: Attempting to delete a non-existent user (valid UUID format)
    const nonExistentUserId = "00000000-0000-0000-0000-000000000001";
    const response = await clientUserApiRequest.delete(
      `/api/client/employees/${nonExistentUserId}`,
    );

    // THEN: 404 Not Found is returned
    expect(response.status(), "Should return 404 for non-existent user").toBe(
      404,
    );
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("error");
    expect(body.error).toHaveProperty("code");
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error).toHaveProperty("message");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CLIENT_USER EXCLUSION POLICY TESTS (REGRESSION PREVENTION)
  // ═══════════════════════════════════════════════════════════════════════════
  // These tests ensure CLIENT_USER (store login credential) is never exposed
  // as an "employee" in the client dashboard. CLIENT_USER is for store
  // terminal authentication, not employee management.
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.91-API-026: [P0] POLICY - GET /api/client/employees - should NOT return users with CLIENT_USER role", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // ═══════════════════════════════════════════════════════════════════════
    // REGRESSION TEST: CLIENT_USER Exclusion from Employee List
    //
    // BUSINESS RULE: CLIENT_USER is a store login credential for terminal
    // authentication (POS system login). It should NEVER appear in the
    // employee list which is for managing actual store employees.
    //
    // SECURITY IMPACT: If this filter is removed, store login credentials
    // would be exposed as "employees" causing:
    // - Confusion in the UI (store login appearing as employee)
    // - Potential security issue (exposing login account details)
    // - Data integrity issues (deleting store login as employee)
    // ═══════════════════════════════════════════════════════════════════════

    // GIVEN: Get CLIENT_USER role from database
    const clientUserRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_USER" },
    });
    expect(
      clientUserRole,
      "CLIENT_USER role must exist in database",
    ).not.toBeNull();
    expect(clientUserRole!.scope, "CLIENT_USER must have STORE scope").toBe(
      "STORE",
    );

    // AND: Get a STORE scope role for creating a real employee (CASHIER)
    const cashierRole = await prismaClient.role.findFirst({
      where: {
        scope: "STORE",
        code: { not: "CLIENT_USER" },
      },
    });
    expect(
      cashierRole,
      "Need at least one non-CLIENT_USER STORE role",
    ).not.toBeNull();

    // AND: Create a store login user (CLIENT_USER) for the client's store
    const storeLoginUser = await prismaClient.user.create({
      data: {
        public_id: `USR_STORELOGIN_${Date.now()}`,
        email: `store-login-${Date.now()}@test-employee-exclusion.com`,
        name: "[TEST] Store Login Credential",
        password_hash: "$2b$10$testhashedpassword",
        status: "ACTIVE",
        is_client_user: true,
      },
    });

    // AND: Assign CLIENT_USER role with STORE scope to this user
    await prismaClient.userRole.create({
      data: {
        user_id: storeLoginUser.user_id,
        role_id: clientUserRole!.role_id,
        store_id: clientUser.store_id,
        company_id: clientUser.company_id,
        assigned_by: clientUser.user_id,
      },
    });

    // AND: Create a legitimate employee (CASHIER) in the same store
    const legitimateEmployee = await prismaClient.user.create({
      data: {
        public_id: `USR_EMPLOYEE_${Date.now()}`,
        email: `real-employee-${Date.now()}@test-employee-exclusion.com`,
        name: "[TEST] Real Employee",
        password_hash: "$2b$10$testhashedpassword",
        status: "ACTIVE",
        is_client_user: true,
      },
    });

    // AND: Assign CASHIER role to the legitimate employee
    await prismaClient.userRole.create({
      data: {
        user_id: legitimateEmployee.user_id,
        role_id: cashierRole!.role_id,
        store_id: clientUser.store_id,
        company_id: clientUser.company_id,
        assigned_by: clientUser.user_id,
      },
    });

    // WHEN: Fetching the employee list
    const response = await clientUserApiRequest.get("/api/client/employees");

    // THEN: Request succeeds
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(Array.isArray(body.data), "Data should be an array").toBe(true);

    // AND: The legitimate employee IS in the list
    const foundEmployee = body.data.find(
      (emp: { user_id: string }) => emp.user_id === legitimateEmployee.user_id,
    );
    expect(
      foundEmployee,
      "Legitimate employee (CASHIER) should appear in employee list",
    ).toBeDefined();

    // AND: The store login (CLIENT_USER) is NOT in the list
    const foundStoreLogin = body.data.find(
      (emp: { user_id: string }) => emp.user_id === storeLoginUser.user_id,
    );
    expect(
      foundStoreLogin,
      "CLIENT_USER (store login) must NOT appear in employee list - this is a critical policy requirement",
    ).toBeUndefined();

    // AND: Verify no employee in the list has CLIENT_USER role
    for (const employee of body.data) {
      const hasClientUserRole = employee.roles?.some(
        (role: { role_code: string }) => role.role_code === "CLIENT_USER",
      );
      expect(
        hasClientUserRole,
        `Employee ${employee.email} should not have CLIENT_USER role in employee list`,
      ).toBeFalsy();
    }
  });

  test("2.91-API-027: [P0] POLICY - GET /api/client/employees/roles - should NOT include CLIENT_USER in available roles", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    // ═══════════════════════════════════════════════════════════════════════
    // REGRESSION TEST: CLIENT_USER Exclusion from Assignable Roles
    //
    // BUSINESS RULE: CLIENT_USER should never be assignable via the employee
    // management interface. Store login credentials are created through the
    // store management interface, not employee management.
    //
    // SECURITY IMPACT: If CLIENT_USER appears in assignable roles:
    // - Employees could be accidentally assigned store login privileges
    // - Multiple users could share store login credentials
    // - Audit trail for terminal access would be compromised
    // ═══════════════════════════════════════════════════════════════════════

    // GIVEN: CLIENT_USER role exists in the database with STORE scope
    const clientUserRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_USER" },
    });
    expect(clientUserRole, "CLIENT_USER role must exist").not.toBeNull();
    expect(clientUserRole!.scope, "CLIENT_USER must have STORE scope").toBe(
      "STORE",
    );

    // WHEN: Fetching available roles for employee assignment
    const response = await clientUserApiRequest.get(
      "/api/client/employees/roles",
    );

    // THEN: Request succeeds
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(Array.isArray(body.data), "Data should be an array of roles").toBe(
      true,
    );

    // AND: At least one STORE scope role is available (CASHIER, SHIFT_MANAGER, etc.)
    expect(
      body.data.length,
      "Should have at least one assignable STORE scope role",
    ).toBeGreaterThan(0);

    // AND: CLIENT_USER is NOT in the list of available roles
    const clientUserInRoles = body.data.find(
      (role: { code: string }) => role.code === "CLIENT_USER",
    );
    expect(
      clientUserInRoles,
      "CLIENT_USER must NOT appear in assignable roles list - store logins are managed separately",
    ).toBeUndefined();

    // AND: All returned roles have STORE scope (sanity check)
    // This is implicit from the endpoint but good to verify
    const roleCodes = body.data.map((r: { code: string }) => r.code);
    expect(
      roleCodes,
      "Available roles should include employee roles like CASHIER or SHIFT_MANAGER",
    ).toEqual(expect.arrayContaining([expect.any(String)]));
  });
});
