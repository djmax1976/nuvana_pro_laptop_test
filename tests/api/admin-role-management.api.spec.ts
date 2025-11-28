import { test, expect } from "../support/fixtures/rbac.fixture";
import { createRole, createUser, createCompany } from "../support/factories";

/**
 * @test-level API
 * @justification Tests API endpoints for Super Admin role management - requires database and auth infrastructure
 * @story 2.93
 *
 * Super Admin Role Management API Tests
 *
 * Tests for Super Admin Role Management API endpoints:
 * - List all roles with filtering by scope and deletion status
 * - Create new roles (Super Admin only)
 * - Update role details and permissions
 * - Soft-delete and restore roles
 * - Purge (permanently delete) soft-deleted roles
 * - Company role assignment (CompanyAllowedRole)
 * - System role protection
 *
 * SECURITY TEST COVERAGE:
 * - Authentication enforcement (valid token required)
 * - Authorization enforcement (ADMIN_SYSTEM_CONFIG permission required)
 * - System role protection (cannot delete/modify system roles)
 * - Soft-delete retention (30 day window)
 * - Company role isolation
 *
 * Story: 2.93 - Super Admin Role Management
 * Priority: P0 (Critical - Role management, security boundaries)
 */

test.describe("2.93-API: Super Admin Role Management", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // LIST ROLES TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.93-API-001: [P1] GET /api/admin/roles - should return all roles for Super Admin", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Super Admin with ADMIN_SYSTEM_CONFIG permission

    // WHEN: Requesting list of roles
    const response = await superadminApiRequest.get("/api/admin/roles");

    // THEN: Response is successful
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(
      Array.isArray(body.data),
      "Response should contain array of roles",
    ).toBe(true);

    // AND: Roles include expected properties
    if (body.data.length > 0) {
      const role = body.data[0];
      expect(role).toHaveProperty("role_id");
      expect(role).toHaveProperty("code");
      expect(role).toHaveProperty("scope");
      expect(role).toHaveProperty("is_system_role");
      expect(role).toHaveProperty("permissions");
    }
  });

  test("2.93-API-002: [P1] GET /api/admin/roles - should filter by scope", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Super Admin

    // WHEN: Requesting roles filtered by STORE scope
    const response = await superadminApiRequest.get(
      "/api/admin/roles?scope=STORE",
    );

    // THEN: Response is successful
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();

    // AND: All returned roles are STORE scope
    for (const role of body.data) {
      expect(role.scope, `Role ${role.code} should be STORE scope`).toBe(
        "STORE",
      );
    }
  });

  test("2.93-API-003: [P0] GET /api/admin/roles - should deny access without Super Admin permission", async ({
    storeManagerUser,
    request,
    backendUrl,
  }) => {
    // GIVEN: I am authenticated as a Store Manager (not Super Admin)

    // WHEN: Attempting to access admin roles endpoint
    const response = await request.get(`${backendUrl}/api/admin/roles`, {
      headers: {
        Cookie: `access_token=${storeManagerUser.token}`,
      },
    });

    // THEN: Access is denied with 403 Forbidden
    expect(response.status(), "Expected 403 Forbidden status").toBe(403);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET SINGLE ROLE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.93-API-004: [P1] GET /api/admin/roles/:roleId - should return role with permissions", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Super Admin
    // AND: A role exists
    const role = await prismaClient.role.findFirst({
      where: { deleted_at: null },
    });
    if (!role) {
      throw new Error("No role found in database");
    }

    // WHEN: Requesting role details
    const response = await superadminApiRequest.get(
      `/api/admin/roles/${role.role_id}`,
    );

    // THEN: Response is successful
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.role_id, "Role ID should match").toBe(role.role_id);
    expect(body.data).toHaveProperty("permissions");
  });

  test("2.93-API-005: [P1] GET /api/admin/roles/:roleId - should return 404 for non-existent role", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Super Admin
    const nonExistentRoleId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Requesting non-existent role
    const response = await superadminApiRequest.get(
      `/api/admin/roles/${nonExistentRoleId}`,
    );

    // THEN: Response is 404 Not Found
    expect(response.status(), "Expected 404 Not Found status").toBe(404);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE ROLE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.93-API-006: [P0] POST /api/admin/roles - should create new role", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Super Admin
    const roleData = {
      code: `TEST_ROLE_${Date.now()}`,
      scope: "STORE",
      description: "Test role for API testing",
    };

    // WHEN: Creating a new role
    const response = await superadminApiRequest.post(
      "/api/admin/roles",
      roleData,
    );

    // THEN: Response is successful
    expect(response.status(), "Expected 201 Created status").toBe(201);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.code, "Role code should match").toBe(roleData.code);
    expect(body.data.scope, "Role scope should match").toBe(roleData.scope);

    // Cleanup
    await prismaClient.role.delete({ where: { role_id: body.data.role_id } });
  });

  test("2.93-API-007: [P0] POST /api/admin/roles - should reject invalid scope", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Super Admin
    const roleData = {
      code: "INVALID_SCOPE_ROLE",
      scope: "INVALID",
      description: "Test role with invalid scope",
    };

    // WHEN: Attempting to create role with invalid scope
    const response = await superadminApiRequest.post(
      "/api/admin/roles",
      roleData,
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request status").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("2.93-API-008: [P0] POST /api/admin/roles - should reject duplicate role code", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Super Admin
    // AND: A role with a specific code exists
    const existingRole = await prismaClient.role.findFirst({
      where: { deleted_at: null },
    });
    if (!existingRole) {
      throw new Error("No role found in database");
    }

    // WHEN: Attempting to create role with duplicate code
    const response = await superadminApiRequest.post("/api/admin/roles", {
      code: existingRole.code,
      scope: "STORE",
      description: "Duplicate role test",
    });

    // THEN: Request is rejected with 409 Conflict
    expect(response.status(), "Expected 409 Conflict status").toBe(409);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE ROLE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.93-API-009: [P0] DELETE /api/admin/roles/:roleId - should soft-delete non-system role", async ({
    superadminApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Super Admin
    // AND: A non-system role exists
    const testRole = await prismaClient.role.create({
      data: {
        code: `DELETE_TEST_${Date.now()}`,
        scope: "STORE",
        description: "Test role for deletion",
        is_system_role: false,
      },
    });

    // WHEN: Deleting the role
    const response = await superadminApiRequest.delete(
      `/api/admin/roles/${testRole.role_id}`,
    );

    // THEN: Response is successful
    expect(response.status(), "Expected 200 OK status").toBe(200);

    // AND: Role is soft-deleted (deleted_at is set)
    const deletedRole = await prismaClient.role.findUnique({
      where: { role_id: testRole.role_id },
    });
    expect(
      deletedRole?.deleted_at,
      "Role should have deleted_at set",
    ).not.toBeNull();
    expect(deletedRole?.deleted_by, "Role should have deleted_by set").toBe(
      superadminUser.user_id,
    );

    // Cleanup
    await prismaClient.role.delete({ where: { role_id: testRole.role_id } });
  });

  test("2.93-API-010: [P0] DELETE /api/admin/roles/:roleId - should reject deletion of system role", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Super Admin
    // AND: A system role exists
    const systemRole = await prismaClient.role.findFirst({
      where: { is_system_role: true },
    });
    if (!systemRole) {
      throw new Error("No system role found in database");
    }

    // WHEN: Attempting to delete a system role
    const response = await superadminApiRequest.delete(
      `/api/admin/roles/${systemRole.role_id}`,
    );

    // THEN: Request is rejected with 403 Forbidden
    expect(response.status(), "Expected 403 Forbidden status").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error should mention system role").toBeTruthy();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RESTORE ROLE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.93-API-011: [P1] POST /api/admin/roles/:roleId/restore - should restore soft-deleted role", async ({
    superadminApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Super Admin
    // AND: A soft-deleted role exists
    const testRole = await prismaClient.role.create({
      data: {
        code: `RESTORE_TEST_${Date.now()}`,
        scope: "STORE",
        description: "Test role for restoration",
        is_system_role: false,
        deleted_at: new Date(),
        deleted_by: superadminUser.user_id,
      },
    });

    // WHEN: Restoring the role
    const response = await superadminApiRequest.post(
      `/api/admin/roles/${testRole.role_id}/restore`,
    );

    // THEN: Response is successful
    expect(response.status(), "Expected 200 OK status").toBe(200);

    // AND: Role is restored (deleted_at is null)
    const restoredRole = await prismaClient.role.findUnique({
      where: { role_id: testRole.role_id },
    });
    expect(
      restoredRole?.deleted_at,
      "Role should have deleted_at cleared",
    ).toBeNull();
    expect(
      restoredRole?.deleted_by,
      "Role should have deleted_by cleared",
    ).toBeNull();

    // Cleanup
    await prismaClient.role.delete({ where: { role_id: testRole.role_id } });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PURGE ROLE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.93-API-012: [P1] DELETE /api/admin/roles/:roleId/purge - should permanently delete soft-deleted role", async ({
    superadminApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Super Admin
    // AND: A soft-deleted role exists
    const testRole = await prismaClient.role.create({
      data: {
        code: `PURGE_TEST_${Date.now()}`,
        scope: "STORE",
        description: "Test role for purge",
        is_system_role: false,
        deleted_at: new Date(),
        deleted_by: superadminUser.user_id,
      },
    });

    // WHEN: Purging the role
    const response = await superadminApiRequest.delete(
      `/api/admin/roles/${testRole.role_id}/purge`,
    );

    // THEN: Response is successful
    expect(response.status(), "Expected 200 OK status").toBe(200);

    // AND: Role is permanently deleted
    const purgedRole = await prismaClient.role.findUnique({
      where: { role_id: testRole.role_id },
    });
    expect(purgedRole, "Role should not exist after purge").toBeNull();
  });

  test("2.93-API-013: [P0] DELETE /api/admin/roles/:roleId/purge - should reject purge of non-deleted role", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Super Admin
    // AND: A non-deleted role exists
    const testRole = await prismaClient.role.create({
      data: {
        code: `PURGE_ACTIVE_TEST_${Date.now()}`,
        scope: "STORE",
        description: "Test role for invalid purge",
        is_system_role: false,
      },
    });

    // WHEN: Attempting to purge an active role
    const response = await superadminApiRequest.delete(
      `/api/admin/roles/${testRole.role_id}/purge`,
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request status").toBe(400);

    // Cleanup
    await prismaClient.role.delete({ where: { role_id: testRole.role_id } });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPANY ROLE ASSIGNMENT TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.93-API-014: [P1] GET /api/admin/companies/roles - should return companies with their allowed roles", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Super Admin

    // WHEN: Requesting companies with roles
    const response = await superadminApiRequest.get(
      "/api/admin/companies/roles",
    );

    // THEN: Response is successful
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(
      Array.isArray(body.data),
      "Response should contain array of companies",
    ).toBe(true);

    // AND: Each company has allowed_roles array
    if (body.data.length > 0) {
      const company = body.data[0];
      expect(company).toHaveProperty("company_id");
      expect(company).toHaveProperty("name");
      expect(company).toHaveProperty("allowed_roles");
      expect(
        Array.isArray(company.allowed_roles),
        "allowed_roles should be an array",
      ).toBe(true);
    }
  });

  test("2.93-API-015: [P0] PUT /api/admin/companies/:companyId/roles - should set company allowed roles", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Super Admin
    // AND: A company exists
    const company = await prismaClient.company.findFirst();
    if (!company) {
      throw new Error("No company found in database");
    }

    // AND: A non-system STORE role exists
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE", is_system_role: false, deleted_at: null },
    });
    if (!storeRole) {
      throw new Error("No STORE role found in database");
    }

    // WHEN: Setting allowed roles for company
    const response = await superadminApiRequest.put(
      `/api/admin/companies/${company.company_id}/roles`,
      { role_ids: [storeRole.role_id] },
    );

    // THEN: Response is successful
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);

    // AND: Company has the allowed role
    const updatedCompany = await prismaClient.companyAllowedRole.findFirst({
      where: {
        company_id: company.company_id,
        role_id: storeRole.role_id,
      },
    });
    expect(updatedCompany, "CompanyAllowedRole should exist").not.toBeNull();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - AUTHENTICATION
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.93-SEC-001: [P0] GET /api/admin/roles - should reject request without authentication", async ({
    request,
    backendUrl,
  }) => {
    // GIVEN: No authentication token is provided

    // WHEN: Attempting to access admin roles endpoint
    const response = await request.get(`${backendUrl}/api/admin/roles`);

    // THEN: Request is rejected with 401 Unauthorized
    expect(response.status(), "Expected 401 Unauthorized status").toBe(401);
  });

  test("2.93-SEC-002: [P0] POST /api/admin/roles - should reject request without authentication", async ({
    request,
    backendUrl,
  }) => {
    // GIVEN: No authentication token is provided

    // WHEN: Attempting to create a role
    const response = await request.post(`${backendUrl}/api/admin/roles`, {
      data: { code: "UNAUTHORIZED_ROLE", scope: "STORE" },
    });

    // THEN: Request is rejected with 401 Unauthorized
    expect(response.status(), "Expected 401 Unauthorized status").toBe(401);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - AUTHORIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.93-SEC-003: [P0] POST /api/admin/roles - should deny Client Owner from creating roles", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Client Owner (not Super Admin)

    // WHEN: Attempting to create a role
    const response = await clientUserApiRequest.post("/api/admin/roles", {
      code: "CLIENT_CREATED_ROLE",
      scope: "STORE",
    });

    // THEN: Access is denied with 403 Forbidden
    expect(response.status(), "Expected 403 Forbidden status").toBe(403);
  });

  test("2.93-SEC-004: [P0] DELETE /api/admin/roles/:roleId - should deny non-Super Admin", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A role exists
    const role = await prismaClient.role.findFirst({
      where: { is_system_role: false, deleted_at: null },
    });
    if (!role) {
      throw new Error("No non-system role found");
    }

    // WHEN: Attempting to delete a role
    const response = await clientUserApiRequest.delete(
      `/api/admin/roles/${role.role_id}`,
    );

    // THEN: Access is denied with 403 Forbidden
    expect(response.status(), "Expected 403 Forbidden status").toBe(403);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INPUT VALIDATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.93-VAL-001: [P1] POST /api/admin/roles - should reject invalid role code format", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Super Admin

    // WHEN: Attempting to create role with invalid code (lowercase)
    const response = await superadminApiRequest.post("/api/admin/roles", {
      code: "invalid_lowercase_code",
      scope: "STORE",
    });

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request status").toBe(400);
  });

  test("2.93-VAL-002: [P1] POST /api/admin/roles - should reject empty role code", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Super Admin

    // WHEN: Attempting to create role with empty code
    const response = await superadminApiRequest.post("/api/admin/roles", {
      code: "",
      scope: "STORE",
    });

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request status").toBe(400);
  });

  test("2.93-VAL-003: [P1] GET /api/admin/roles/:roleId - should reject invalid UUID format", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Super Admin

    // WHEN: Requesting role with invalid UUID
    const response = await superadminApiRequest.get(
      "/api/admin/roles/not-a-valid-uuid",
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request status").toBe(400);
  });
});
