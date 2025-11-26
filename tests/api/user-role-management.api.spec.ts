import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createAdminUser,
  createUserRequest,
  createSystemScopeAssignment,
  createCompanyScopeAssignment,
  createStoreScopeAssignment,
  createInvalidScopeAssignment,
} from "../support/factories/user-admin.factory";
import { createCompany, createStore, createUser } from "../support/factories";

/**
 * User and Role Management API Tests
 *
 * Tests for User Admin Management API endpoints:
 * - Create, list, get users (CRUD operations)
 * - Role assignment with scope validation (SYSTEM, COMPANY, STORE)
 * - User activation/deactivation
 * - Permission enforcement (only System Admins with ADMIN_SYSTEM_CONFIG)
 * - Audit logging for all user and role operations
 *
 * Note: Client concept has been removed. Companies are now owned directly by users
 * via owner_user_id. Companies are created through the user creation flow when
 * assigning CLIENT_OWNER role.
 *
 * Priority: P0 (Critical - User access control foundation)
 *
 * Story: 2.8 - User and Role Management Dashboard
 */

test.describe("2.8-API: User Management API - User CRUD Operations", () => {
  test("2.8-API-001: [P0] POST /api/admin/users - should create user with valid data (AC #2)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin with valid user data
    const userData = createUserRequest();

    // Get a SYSTEM scope role for initial assignment (required field)
    const role = await prismaClient.role.findFirst({
      where: { scope: "SYSTEM" },
    });
    if (!role) {
      throw new Error("No SYSTEM scope role found in database");
    }

    // WHEN: Creating a user via API
    const response = await superadminApiRequest.post("/api/admin/users", {
      email: userData.email,
      name: userData.name,
      roles: [createSystemScopeAssignment(role.role_id)],
    });

    // THEN: User is created successfully
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("user_id");
    expect(body.data).toHaveProperty("email", userData.email);
    expect(body.data).toHaveProperty("name", userData.name);
    expect(body.data).toHaveProperty("status", "ACTIVE");
    expect(body.data).toHaveProperty("created_at");

    // AND: User record exists in database
    const user = await prismaClient.user.findUnique({
      where: { user_id: body.data.user_id },
    });
    expect(user).not.toBeNull();
    expect(user?.email).toBe(userData.email);

    // AND: Audit log entry is created
    const auditLog = await prismaClient.auditLog.findFirst({
      where: {
        table_name: "users",
        record_id: body.data.user_id,
        action: "CREATE",
      },
    });
    expect(auditLog).not.toBeNull();
    expect(auditLog?.action).toBe("CREATE");
  });

  test("2.8-API-002: [P0] POST /api/admin/users - should reject invalid email format (AC #2)", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: I am authenticated as a System Admin with invalid email
    // WHEN: Creating a user with invalid email format
    const response = await superadminApiRequest.post("/api/admin/users", {
      email: "not-an-email",
      name: "Test User",
    });

    // THEN: Validation error is returned
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("error");
  });

  test("2.8-API-003: [P1] POST /api/admin/users - should reject duplicate email (AC #2)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A user with a specific email already exists
    const existingUser = createAdminUser();
    await prismaClient.user.create({ data: existingUser });

    // WHEN: Creating another user with the same email
    const response = await superadminApiRequest.post("/api/admin/users", {
      email: existingUser.email,
      name: "New User",
    });

    // THEN: Duplicate email error is returned
    expect(response.status()).toBe(409);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("error");
  });

  test("2.8-API-004: [P0] POST /api/admin/users - should reject missing name (AC #2)", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: I am authenticated as a System Admin with missing name
    // WHEN: Creating a user without name
    const response = await superadminApiRequest.post("/api/admin/users", {
      email: "test@example.com",
      // name is missing
    });

    // THEN: Validation error is returned
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("error");
  });

  test("2.8-API-005: [P0] POST /api/admin/users - should create user with initial roles (AC #2)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Valid user data with initial role assignment
    const userData = createUserRequest();

    // Get a SYSTEM scope role for initial assignment
    const role = await prismaClient.role.findFirst({
      where: { scope: "SYSTEM" },
    });
    if (!role) {
      throw new Error("No SYSTEM scope role found in database");
    }

    // WHEN: Creating user with initial role
    const response = await superadminApiRequest.post("/api/admin/users", {
      email: userData.email,
      name: userData.name,
      roles: [createSystemScopeAssignment(role.role_id)],
    });

    // THEN: User is created with role assigned
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("user_id");

    // AND: Role is assigned to user
    const userRole = await prismaClient.userRole.findFirst({
      where: {
        user_id: body.data.user_id,
        role_id: role.role_id,
      },
    });
    expect(userRole).not.toBeNull();
  });

  test("2.8-API-006: [P0] GET /api/admin/users - should list all users with pagination (AC #1)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin and multiple users exist
    const user1 = await prismaClient.user.create({
      data: createAdminUser({ name: "User One" }),
    });
    const user2 = await prismaClient.user.create({
      data: createAdminUser({ name: "User Two" }),
    });

    // WHEN: Retrieving all users (default pagination)
    const response = await superadminApiRequest.get("/api/admin/users");

    // THEN: Paginated list with metadata is returned
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body).toHaveProperty("data");
    expect(body).toHaveProperty("meta");
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(2);

    // AND: Pagination metadata exists
    expect(body.meta.page).toBe(1);
    expect(body.meta.limit).toBeDefined();
    expect(body.meta.total).toBeGreaterThanOrEqual(2);

    // AND: User data includes roles as badges
    const userIds = body.data.map((u: any) => u.user_id);
    expect(userIds).toContain(user1.user_id);
    expect(userIds).toContain(user2.user_id);
  });

  test("2.8-API-007: [P1] GET /api/admin/users - should display name, email, roles (badges), and status (AC #1)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A user exists with assigned roles
    const user = await prismaClient.user.create({
      data: createAdminUser(),
    });

    // Assign a role to the user
    const role = await prismaClient.role.findFirst({
      where: { scope: "SYSTEM" },
    });
    if (role) {
      await prismaClient.userRole.create({
        data: {
          user_id: user.user_id,
          role_id: role.role_id,
        },
      });
    }

    // WHEN: Retrieving user list
    const response = await superadminApiRequest.get("/api/admin/users");

    // THEN: User data includes required columns
    expect(response.status()).toBe(200);
    const body = await response.json();
    const foundUser = body.data.find((u: any) => u.user_id === user.user_id);
    expect(foundUser).toBeDefined();
    expect(foundUser).toHaveProperty("name");
    expect(foundUser).toHaveProperty("email");
    expect(foundUser).toHaveProperty("roles");
    expect(foundUser).toHaveProperty("status");
    expect(Array.isArray(foundUser.roles)).toBe(true);
  });

  test("2.8-API-008: [P2] GET /api/admin/users - should support pagination with page and limit (AC #1)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Multiple users exist
    for (let i = 0; i < 5; i++) {
      await prismaClient.user.create({
        data: createAdminUser(),
      });
    }

    // WHEN: Requesting with specific page and limit
    const response = await superadminApiRequest.get(
      "/api/admin/users?page=1&limit=2",
    );

    // THEN: Correct number of results returned
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBeLessThanOrEqual(2);
    expect(body.meta.page).toBe(1);
    expect(body.meta.limit).toBe(2);
  });

  test("2.8-API-009: [P0] GET /api/admin/users/:userId - should get user details with roles (AC #1)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A user exists with roles assigned
    const user = await prismaClient.user.create({
      data: createAdminUser(),
    });

    // WHEN: Retrieving user by ID
    const response = await superadminApiRequest.get(
      `/api/admin/users/${user.user_id}`,
    );

    // THEN: User details are returned with roles
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("user_id", user.user_id);
    expect(body.data).toHaveProperty("name", user.name);
    expect(body.data).toHaveProperty("email", user.email);
    expect(body.data).toHaveProperty("status");
    expect(body.data).toHaveProperty("roles");
  });

  test("2.8-API-010: [P1] GET /api/admin/users/:userId - should return 404 for non-existent user", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: I am authenticated as a System Admin
    const nonExistentId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Retrieving non-existent user
    const response = await superadminApiRequest.get(
      `/api/admin/users/${nonExistentId}`,
    );

    // THEN: 404 Not Found is returned
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("error");
  });
});

test.describe("2.8-API: User Management API - User Activation/Deactivation", () => {
  test("2.8-API-011: [P1] PATCH /api/admin/users/:userId/status - should deactivate user (AC #7)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: An ACTIVE user exists
    const user = await prismaClient.user.create({
      data: createAdminUser({ status: "ACTIVE" }),
    });

    // WHEN: Deactivating the user
    const response = await superadminApiRequest.patch(
      `/api/admin/users/${user.user_id}/status`,
      {
        status: "INACTIVE",
      },
    );

    // THEN: User status changes to INACTIVE
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("INACTIVE");

    // AND: Database record reflects the change
    const updatedUser = await prismaClient.user.findUnique({
      where: { user_id: user.user_id },
    });
    expect(updatedUser?.status).toBe("INACTIVE");

    // AND: Deactivation is logged in AuditLog
    const auditLog = await prismaClient.auditLog.findFirst({
      where: {
        table_name: "users",
        record_id: user.user_id,
        action: "UPDATE",
      },
      orderBy: { timestamp: "desc" },
    });
    expect(auditLog).not.toBeNull();
  });

  test("2.8-API-012: [P1] PATCH /api/admin/users/:userId/status - should activate inactive user (AC #7)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: An INACTIVE user exists
    const user = await prismaClient.user.create({
      data: createAdminUser({ status: "INACTIVE" }),
    });

    // WHEN: Activating the user
    const response = await superadminApiRequest.patch(
      `/api/admin/users/${user.user_id}/status`,
      {
        status: "ACTIVE",
      },
    );

    // THEN: User status changes to ACTIVE
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("ACTIVE");
  });

  test("2.8-API-013: [P2] PATCH /api/admin/users/:userId/status - should reject invalid status value", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A user exists
    const user = await prismaClient.user.create({
      data: createAdminUser(),
    });

    // WHEN: Setting invalid status
    const response = await superadminApiRequest.patch(
      `/api/admin/users/${user.user_id}/status`,
      {
        status: "INVALID_STATUS",
      },
    );

    // THEN: Validation error is returned
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });
});

test.describe("2.8-API: User Management API - Role Assignment Operations", () => {
  test("2.8-API-014: [P0] POST /api/admin/users/:userId/roles - should assign SYSTEM scope role (AC #5)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A user exists and a SYSTEM scope role is available
    const user = await prismaClient.user.create({
      data: createAdminUser(),
    });

    const role = await prismaClient.role.findFirst({
      where: { scope: "SYSTEM" },
    });
    if (!role) {
      throw new Error("No SYSTEM scope role found in database");
    }

    // WHEN: Assigning SYSTEM scope role (no additional IDs required)
    const response = await superadminApiRequest.post(
      `/api/admin/users/${user.user_id}/roles`,
      createSystemScopeAssignment(role.role_id),
    );

    // THEN: Role is assigned successfully
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("user_role_id");

    // AND: Role assignment exists in database
    const userRole = await prismaClient.userRole.findFirst({
      where: {
        user_id: user.user_id,
        role_id: role.role_id,
      },
    });
    expect(userRole).not.toBeNull();

    // AND: Role assignment is logged in AuditLog
    const auditLog = await prismaClient.auditLog.findFirst({
      where: {
        table_name: "user_roles",
        action: "CREATE",
      },
      orderBy: { timestamp: "desc" },
    });
    expect(auditLog).not.toBeNull();
  });

  test("2.8-API-015: [P1] POST /api/admin/users/:userId/roles - should assign COMPANY scope role with company_id (AC #3)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A user and a company exist (company owned by another user)
    const user = await prismaClient.user.create({
      data: createAdminUser(),
    });

    // Create an owner user for the company
    const ownerUser = await prismaClient.user.create({
      data: createUser({ name: "Company Owner" }),
    });

    // Create company with owner
    const companyData = createCompany({
      name: "Test Company",
      status: "ACTIVE",
      owner_user_id: ownerUser.user_id,
    });
    const company = await prismaClient.company.create({
      data: companyData,
    });

    const role = await prismaClient.role.findFirst({
      where: { scope: "COMPANY" },
    });
    if (!role) {
      throw new Error("No COMPANY scope role found in database");
    }

    // WHEN: Assigning COMPANY scope role with required company_id
    const response = await superadminApiRequest.post(
      `/api/admin/users/${user.user_id}/roles`,
      createCompanyScopeAssignment(role.role_id, company.company_id),
    );

    // THEN: Role is assigned successfully with scope identifiers
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("user_role_id");

    // AND: Role assignment includes scope identifiers
    const userRole = await prismaClient.userRole.findFirst({
      where: {
        user_id: user.user_id,
        role_id: role.role_id,
      },
    });
    expect(userRole).not.toBeNull();
    expect(userRole?.company_id).toBe(company.company_id);
  });

  test("2.8-API-016: [P1] POST /api/admin/users/:userId/roles - should fail COMPANY scope without required IDs (AC #3)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A user and COMPANY scope role exist
    const user = await prismaClient.user.create({
      data: createAdminUser(),
    });

    const role = await prismaClient.role.findFirst({
      where: { scope: "COMPANY" },
    });
    if (!role) {
      throw new Error("No COMPANY scope role found in database");
    }

    // WHEN: Assigning COMPANY scope role without required IDs
    const response = await superadminApiRequest.post(
      `/api/admin/users/${user.user_id}/roles`,
      createInvalidScopeAssignment(role.role_id, "COMPANY"),
    );

    // THEN: Validation error is returned
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("error");
  });

  test("2.8-API-017: [P1] POST /api/admin/users/:userId/roles - should assign STORE scope role with all required IDs (AC #4)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A user, company, store, and STORE scope role exist
    const user = await prismaClient.user.create({
      data: createAdminUser(),
    });

    // Create an owner user for the company
    const ownerUser = await prismaClient.user.create({
      data: createUser({ name: "Company Owner for Store" }),
    });

    // Create company with owner
    const companyData = createCompany({
      name: "Test Company for Store",
      status: "ACTIVE",
      owner_user_id: ownerUser.user_id,
    });
    const company = await prismaClient.company.create({
      data: companyData,
    });

    const storeData = createStore({
      name: "Test Store",
      status: "ACTIVE",
      timezone: "America/New_York",
    });
    const store = await prismaClient.store.create({
      data: {
        ...storeData,
        company_id: company.company_id,
      },
    });

    const role = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!role) {
      throw new Error("No STORE scope role found in database");
    }

    // WHEN: Assigning STORE scope role with all required IDs
    const response = await superadminApiRequest.post(
      `/api/admin/users/${user.user_id}/roles`,
      createStoreScopeAssignment(
        role.role_id,
        company.company_id,
        store.store_id,
      ),
    );

    // THEN: Role is assigned successfully
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);

    // AND: Role assignment includes all scope identifiers
    const userRole = await prismaClient.userRole.findFirst({
      where: {
        user_id: user.user_id,
        role_id: role.role_id,
      },
    });
    expect(userRole).not.toBeNull();
    expect(userRole?.company_id).toBe(company.company_id);
    expect(userRole?.store_id).toBe(store.store_id);
  });

  test("2.8-API-018: [P1] POST /api/admin/users/:userId/roles - should fail STORE scope without store_id (AC #4)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A user and STORE scope role exist
    const user = await prismaClient.user.create({
      data: createAdminUser(),
    });

    // Create an owner user for the company
    const ownerUser = await prismaClient.user.create({
      data: createUser({ name: "Company Owner" }),
    });

    // Create company with owner
    const companyData = createCompany({
      name: "Test Company",
      status: "ACTIVE",
      owner_user_id: ownerUser.user_id,
    });
    const company = await prismaClient.company.create({
      data: companyData,
    });

    const role = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!role) {
      throw new Error("No STORE scope role found in database");
    }

    // WHEN: Assigning STORE scope role without store_id
    const response = await superadminApiRequest.post(
      `/api/admin/users/${user.user_id}/roles`,
      {
        role_id: role.role_id,
        scope_type: "STORE",
        company_id: company.company_id,
        // store_id is missing
      },
    );

    // THEN: Validation error is returned
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("error");
  });

  test("2.8-API-019: [P1] POST /api/admin/users/:userId/roles - should validate store belongs to company (AC #4)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: User, two companies, and a store belonging to one company
    const user = await prismaClient.user.create({
      data: createAdminUser(),
    });

    // Create owner users
    const ownerUser1 = await prismaClient.user.create({
      data: createUser({ name: "Owner One" }),
    });
    const ownerUser2 = await prismaClient.user.create({
      data: createUser({ name: "Owner Two" }),
    });

    const companyData1 = createCompany({
      name: "Company One",
      status: "ACTIVE",
      owner_user_id: ownerUser1.user_id,
    });
    const company1 = await prismaClient.company.create({
      data: companyData1,
    });

    const companyData2 = createCompany({
      name: "Company Two",
      status: "ACTIVE",
      owner_user_id: ownerUser2.user_id,
    });
    const company2 = await prismaClient.company.create({
      data: companyData2,
    });

    const storeData = createStore({
      name: "Store for Company One",
      status: "ACTIVE",
      timezone: "America/New_York",
    });
    const store = await prismaClient.store.create({
      data: {
        ...storeData,
        company_id: company1.company_id,
      },
    });

    const role = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!role) {
      throw new Error("No STORE scope role found in database");
    }

    // WHEN: Assigning with wrong company_id (store doesn't belong to company2)
    const response = await superadminApiRequest.post(
      `/api/admin/users/${user.user_id}/roles`,
      createStoreScopeAssignment(
        role.role_id,
        company2.company_id, // Wrong company
        store.store_id,
      ),
    );

    // THEN: Validation error is returned
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test("2.8-API-020: [P1] DELETE /api/admin/users/:userId/roles/:userRoleId - should revoke role (AC #6)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A user with an assigned role
    const user = await prismaClient.user.create({
      data: createAdminUser(),
    });

    const role = await prismaClient.role.findFirst({
      where: { scope: "SYSTEM" },
    });
    if (!role) {
      throw new Error("No SYSTEM scope role found in database");
    }

    const userRole = await prismaClient.userRole.create({
      data: {
        user_id: user.user_id,
        role_id: role.role_id,
      },
    });

    // WHEN: Revoking the role
    const response = await superadminApiRequest.delete(
      `/api/admin/users/${user.user_id}/roles/${userRole.user_role_id}`,
    );

    // THEN: Role is revoked successfully
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // AND: Role assignment no longer exists
    const deletedUserRole = await prismaClient.userRole.findUnique({
      where: { user_role_id: userRole.user_role_id },
    });
    expect(deletedUserRole).toBeNull();

    // AND: Role revocation is logged in AuditLog
    const auditLog = await prismaClient.auditLog.findFirst({
      where: {
        table_name: "user_roles",
        action: "DELETE",
      },
      orderBy: { timestamp: "desc" },
    });
    expect(auditLog).not.toBeNull();
  });

  test("2.8-API-021: [P1] POST/DELETE role operations - should log admin who performed them (AC #6)", async ({
    superadminApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: A user and a role
    const user = await prismaClient.user.create({
      data: createAdminUser(),
    });

    const role = await prismaClient.role.findFirst({
      where: { scope: "SYSTEM" },
    });
    if (!role) {
      throw new Error("No SYSTEM scope role found in database");
    }

    // WHEN: Assigning a role
    const response = await superadminApiRequest.post(
      `/api/admin/users/${user.user_id}/roles`,
      createSystemScopeAssignment(role.role_id),
    );

    // THEN: Audit log includes admin who performed the action
    expect(response.status()).toBe(201);

    const auditLog = await prismaClient.auditLog.findFirst({
      where: {
        table_name: "user_roles",
        action: "CREATE",
      },
      orderBy: { timestamp: "desc" },
    });
    expect(auditLog).not.toBeNull();
    expect(auditLog?.user_id).toBe(superadminUser.user_id);
  });
});

test.describe("2.8-API: User Management API - Permission Enforcement", () => {
  test("2.8-API-022: [P0] All endpoints should require ADMIN_SYSTEM_CONFIG permission (AC #8)", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager (not System Admin)
    const user = await prismaClient.user.create({
      data: createAdminUser(),
    });

    // WHEN: Attempting various user admin operations
    const listResponse = await storeManagerApiRequest.get("/api/admin/users");
    const getResponse = await storeManagerApiRequest.get(
      `/api/admin/users/${user.user_id}`,
    );
    const createResponse = await storeManagerApiRequest.post(
      "/api/admin/users",
      {
        email: "test@example.com",
        name: "Test User",
      },
    );

    // THEN: All operations return 403 Forbidden
    expect(listResponse.status()).toBe(403);
    expect(getResponse.status()).toBe(403);
    expect(createResponse.status()).toBe(403);
  });

  test("2.8-API-023: [P0] POST /api/admin/users/:userId/roles - should reject non-admin users (AC #8)", async ({
    corporateAdminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Corporate Admin (not System Admin)
    const user = await prismaClient.user.create({
      data: createAdminUser(),
    });

    const role = await prismaClient.role.findFirst({
      where: { scope: "SYSTEM" },
    });
    if (!role) {
      throw new Error("No SYSTEM scope role found in database");
    }

    // WHEN: Attempting to assign a role
    const response = await corporateAdminApiRequest.post(
      `/api/admin/users/${user.user_id}/roles`,
      createSystemScopeAssignment(role.role_id),
    );

    // THEN: Permission denied error is returned
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Forbidden");
  });

  test("2.8-API-024: [P0] All endpoints should reject unauthenticated requests (AC #8)", async ({
    request,
    prismaClient,
  }) => {
    // GIVEN: A user exists
    const user = await prismaClient.user.create({
      data: createAdminUser(),
    });

    const backendUrl = process.env.BACKEND_URL || "http://localhost:3001";

    // WHEN: Making requests without authentication
    const listResponse = await request.get(`${backendUrl}/api/admin/users`);
    const getResponse = await request.get(
      `${backendUrl}/api/admin/users/${user.user_id}`,
    );
    const createResponse = await request.post(`${backendUrl}/api/admin/users`, {
      data: { email: "test@example.com", name: "Test" },
    });

    // THEN: All return 401 Unauthorized
    expect(listResponse.status()).toBe(401);
    expect(getResponse.status()).toBe(401);
    expect(createResponse.status()).toBe(401);
  });
});

test.describe("2.8-API: User Management API - Security", () => {
  test("2.8-API-025: [P1] POST /api/admin/users - should prevent SQL injection in name field", async ({
    superadminApiRequest,
  }) => {
    // WHEN: Attempting SQL injection
    const response = await superadminApiRequest.post("/api/admin/users", {
      email: "test@example.com",
      name: "'; DROP TABLE users;--",
    });

    // THEN: Request is handled safely (either created or rejected, but not executed)
    expect([201, 400]).toContain(response.status());
    // If created, verify the literal string was stored
    if (response.status() === 201) {
      const body = await response.json();
      expect(body.data.name).toBe("'; DROP TABLE users;--");
    }
  });

  test("2.8-API-026: [P1] POST /api/admin/users - should prevent XSS in user name", async ({
    superadminApiRequest,
  }) => {
    // WHEN: Attempting XSS injection
    const response = await superadminApiRequest.post("/api/admin/users", {
      email: "test@example.com",
      name: "<script>alert('xss')</script>",
    });

    // THEN: Request is handled safely
    expect([201, 400]).toContain(response.status());
    if (response.status() === 201) {
      const body = await response.json();
      expect(body.data.name).toBe("<script>alert('xss')</script>");
    }
  });

  test("2.8-API-027: [P1] GET /api/admin/users/:userId - should not leak sensitive data", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A user exists
    const user = await prismaClient.user.create({
      data: createAdminUser(),
    });

    // WHEN: Retrieving user details
    const response = await superadminApiRequest.get(
      `/api/admin/users/${user.user_id}`,
    );

    // THEN: Response should not contain sensitive internal fields
    expect(response.status()).toBe(200);
    const body = await response.json();

    // Verify no sensitive fields are exposed
    expect(body.data).not.toHaveProperty("password");
    expect(body.data).not.toHaveProperty("password_hash");
    expect(body.data).not.toHaveProperty("__v");
  });
});

test.describe("2.8-API: User Management API - Business Logic Rules", () => {
  test("2.8-API-028: [P0] POST /api/admin/users - should reject user creation without initial role", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Valid user data but no roles
    const userData = createUserRequest();

    // WHEN: Creating user without any roles
    const response = await superadminApiRequest.post("/api/admin/users", {
      email: userData.email,
      name: userData.name,
      // No roles provided
    });

    // THEN: Validation error is returned - user must have at least one role
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    // Zod returns generic error when required field is missing (undefined)
    expect(body.message || body.error).toMatch(/expected array|role|required/i);
  });

  test("2.8-API-029: [P0] POST /api/admin/users - should reject user creation with empty roles array", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Valid user data with empty roles array
    const userData = createUserRequest();

    // WHEN: Creating user with empty roles array
    const response = await superadminApiRequest.post("/api/admin/users", {
      email: userData.email,
      name: userData.name,
      roles: [],
    });

    // THEN: Validation error is returned - user must have at least one role
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test("2.8-API-030: [P0] DELETE /api/admin/users/:userId/roles/:userRoleId - should prevent revoking last role", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A user with exactly one role
    const user = await prismaClient.user.create({
      data: createAdminUser(),
    });

    const role = await prismaClient.role.findFirst({
      where: { scope: "SYSTEM" },
    });
    if (!role) {
      throw new Error("No SYSTEM scope role found in database");
    }

    const userRole = await prismaClient.userRole.create({
      data: {
        user_id: user.user_id,
        role_id: role.role_id,
      },
    });

    // WHEN: Attempting to revoke the only role
    const response = await superadminApiRequest.delete(
      `/api/admin/users/${user.user_id}/roles/${userRole.user_role_id}`,
    );

    // THEN: Operation is rejected - user must have at least one role
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.message || body.error).toMatch(/last|minimum|at least/i);

    // AND: Role still exists in database
    const stillExists = await prismaClient.userRole.findUnique({
      where: { user_role_id: userRole.user_role_id },
    });
    expect(stillExists).not.toBeNull();
  });

  test("2.8-API-031: [P0] PATCH /api/admin/users/:userId/status - should prevent self-deactivation", async ({
    superadminApiRequest,
    superadminUser,
  }) => {
    // GIVEN: I am authenticated as a System Admin
    // WHEN: Attempting to deactivate my own account
    const response = await superadminApiRequest.patch(
      `/api/admin/users/${superadminUser.user_id}/status`,
      {
        status: "INACTIVE",
      },
    );

    // THEN: Operation is rejected - cannot deactivate own account
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.message || body.error).toMatch(/own|self|yourself/i);
  });
});
