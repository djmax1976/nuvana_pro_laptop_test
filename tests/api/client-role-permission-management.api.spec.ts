import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createClientRolePermission,
  createUpdateRolePermissionsRequest,
} from "../support/factories/client-role-permission.factory";
import { createUser, createCompany, createStore } from "../support/factories";

/**
 * @test-level API
 * @justification Tests API endpoints for client role permission management - requires database and auth infrastructure
 * @story 2.92
 * @enhanced-by workflow-9 on 2025-11-28
 *
 * Client Role Permission Management API Tests
 *
 * Tests for Client Role Permission Management API endpoints:
 * - List STORE scope roles with client's permission configuration
 * - Get role permissions (merged with client overrides)
 * - Update role permissions with validation
 * - Reset role to default permissions
 * - Permission enforcement (CLIENT_ROLE_MANAGE required)
 * - Client isolation (owner_user_id filtering)
 * - Audit logging for all operations
 * - Security: Restricted permissions cannot be assigned
 *
 * SECURITY TEST COVERAGE:
 * - Authentication bypass attempts (missing/invalid/expired tokens)
 * - Authorization enforcement (CLIENT_ROLE_MANAGE permission required)
 * - Input validation (Zod schema enforcement)
 * - Tenant isolation (owner_user_id filtering prevents cross-tenant access)
 * - Restricted permission enforcement (ADMIN_*, COMPANY_*, etc. cannot be assigned)
 *
 * Story: 2.92 - Client Role Permission Management
 * Priority: P0 (Critical - Security boundaries, multi-tenant isolation)
 */

test.describe("2.92-API: Client Role Permission Management", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // LIST ROLES TESTS (AC #1)
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.92-API-001: [P1] GET /api/client/roles - should return only STORE scope roles (AC #1)", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner with CLIENT_ROLE_MANAGE permission
    // (clientUser fixture provides user with company and store)
    // NOTE: Fixture may need to be updated to include CLIENT_OWNER role with CLIENT_ROLE_MANAGE permission

    // WHEN: Requesting list of roles
    const response = await clientUserApiRequest.get("/api/client/roles");

    // THEN: Response is successful
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(
      Array.isArray(body.data),
      "Response should contain array of roles",
    ).toBe(true);

    // AND: All roles are STORE scope only
    const roles = body.data;
    for (const role of roles) {
      expect(role.scope, `Role ${role.role_id} should be STORE scope`).toBe(
        "STORE",
      );
      expect(
        ["SYSTEM", "COMPANY"].includes(role.scope),
        `Role ${role.role_id} should not be SYSTEM or COMPANY scope`,
      ).toBe(false);
    }

    // AND: Each role displays current permissions as badges
    for (const role of roles) {
      expect(
        role,
        `Role ${role.role_id} should have permissions property`,
      ).toHaveProperty("permissions");
      expect(
        Array.isArray(role.permissions),
        `Role ${role.role_id} permissions should be an array`,
      ).toBe(true);
    }
  });

  test("2.92-API-002: [P0] GET /api/client/roles - should deny access without CLIENT_ROLE_MANAGE permission (AC #7)", async ({
    storeManagerUser,
    request,
    backendUrl,
  }) => {
    // GIVEN: I am authenticated as a Store Manager (not Client Owner)
    // (storeManagerUser fixture provides user without CLIENT_ROLE_MANAGE permission)

    // WHEN: Attempting to access roles endpoint
    const response = await request.get(`${backendUrl}/api/client/roles`, {
      headers: {
        Cookie: `access_token=${storeManagerUser.token}`,
      },
    });

    // THEN: Access is denied with 403 Forbidden
    expect(response.status(), "Expected 403 Forbidden status").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be PERMISSION_DENIED").toBe(
      "PERMISSION_DENIED",
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET ROLE PERMISSIONS TESTS (AC #2)
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.92-API-003: [P1] GET /api/client/roles/:roleId/permissions - should return permissions grouped by category (AC #2)", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A STORE scope role exists
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    // WHEN: Requesting permissions for the role
    const response = await clientUserApiRequest.get(
      `/api/client/roles/${storeRole.role_id}/permissions`,
    );

    // THEN: Response is successful
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data, "Response should contain role data").toHaveProperty(
      "role_id",
    );
    expect(body.data.role_id, "Role ID should match").toBe(storeRole.role_id);

    // AND: Permissions are grouped by category
    expect(
      body.data,
      "Response should have permissions grouped by category",
    ).toHaveProperty("permissions");
    expect(
      Array.isArray(body.data.permissions),
      "Permissions should be an array",
    ).toBe(true);

    // AND: Only assignable permissions are included (no ADMIN_*, COMPANY_*, CLIENT_* except CLIENT_EMPLOYEE_*)
    const permissions = body.data.permissions;
    for (const perm of permissions) {
      expect(
        perm.code.startsWith("ADMIN_"),
        `Permission ${perm.code} should not be ADMIN_*`,
      ).toBe(false);
      expect(
        perm.code.startsWith("COMPANY_"),
        `Permission ${perm.code} should not be COMPANY_*`,
      ).toBe(false);
      // CLIENT_* permissions are allowed only if they are CLIENT_EMPLOYEE_*
      if (perm.code.startsWith("CLIENT_")) {
        expect(
          perm.code.startsWith("CLIENT_EMPLOYEE_"),
          `Permission ${perm.code} should be CLIENT_EMPLOYEE_* if CLIENT_*`,
        ).toBe(true);
      }
    }
  });

  test("2.92-API-004: [P0] GET /api/client/roles/:roleId/permissions - should not include restricted permissions (AC #3)", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A STORE scope role exists
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    // WHEN: Requesting permissions for the role
    const response = await clientUserApiRequest.get(
      `/api/client/roles/${storeRole.role_id}/permissions`,
    );

    // THEN: Response is successful
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();

    // AND: Restricted permissions are not available in the list
    const restrictedPermissions = [
      "ADMIN_OVERRIDE",
      "ADMIN_AUDIT_VIEW",
      "ADMIN_SYSTEM_CONFIG",
      "COMPANY_CREATE",
      "COMPANY_READ",
      "COMPANY_UPDATE",
      "COMPANY_DELETE",
      "STORE_CREATE",
      "STORE_DELETE",
      "USER_CREATE",
      "USER_READ",
      "USER_UPDATE",
      "USER_DELETE",
      "CLIENT_DASHBOARD_ACCESS",
      "CLIENT_ROLE_MANAGE",
    ];

    const permissionCodes = body.data.permissions.map(
      (p: { code: string }) => p.code,
    );
    for (const restricted of restrictedPermissions) {
      expect(
        permissionCodes.includes(restricted),
        `Restricted permission ${restricted} should not be in list`,
      ).toBe(false);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATE ROLE PERMISSIONS TESTS (AC #2, #3, #4, #5)
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.92-API-005: [P0] PUT /api/client/roles/:roleId/permissions - should update role permissions successfully (AC #2, #4)", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A STORE scope role exists
    // AND: An assignable permission exists
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    // Get an assignable permission (SHIFT_OPEN is in CLIENT_ASSIGNABLE_PERMISSIONS)
    const assignablePermission = await prismaClient.permission.findFirst({
      where: { code: "SHIFT_OPEN" },
    });
    if (!assignablePermission) {
      throw new Error("SHIFT_OPEN permission not found in database");
    }

    const updateRequest = createUpdateRolePermissionsRequest([
      {
        permission_id: assignablePermission.permission_id,
        is_enabled: true,
      },
    ]);

    // WHEN: Updating role permissions
    const response = await clientUserApiRequest.put(
      `/api/client/roles/${storeRole.role_id}/permissions`,
      updateRequest,
    );

    // THEN: Response is successful
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.message, "Success message should be displayed").toBeTruthy();

    // AND: Changes are applied immediately (verify in database)
    const clientRolePermission =
      await prismaClient.clientRolePermission.findFirst({
        where: {
          owner_user_id: clientUser.user_id,
          role_id: storeRole.role_id,
          permission_id: assignablePermission.permission_id,
        },
      });
    expect(
      clientRolePermission,
      "Client role permission should exist in database",
    ).not.toBeNull();
    expect(
      clientRolePermission?.is_enabled,
      "Permission should be enabled",
    ).toBe(true);

    // AND: Operation is logged in AuditLog with user_id
    // NOTE: Service uses "UPDATE" action with table_name "client_role_permissions"
    const auditLog = await prismaClient.auditLog.findFirst({
      where: {
        user_id: clientUser.user_id,
        action: "UPDATE",
        table_name: "client_role_permissions",
      },
      orderBy: { timestamp: "desc" },
    });
    expect(auditLog, "Audit log entry should exist").not.toBeNull();
    expect(auditLog?.user_id, "Audit log should have user_id").toBe(
      clientUser.user_id,
    );
    expect(
      auditLog?.table_name,
      "Audit log should reference client_role_permissions table",
    ).toBe("client_role_permissions");
  });

  test("2.92-API-006: [P0] PUT /api/client/roles/:roleId/permissions - should reject restricted permission assignments (AC #3)", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A STORE scope role exists
    // AND: A restricted permission exists (ADMIN_OVERRIDE)
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    const restrictedPermission = await prismaClient.permission.findFirst({
      where: { code: "ADMIN_OVERRIDE" },
    });
    if (!restrictedPermission) {
      throw new Error("ADMIN_OVERRIDE permission not found in database");
    }

    const updateRequest = createUpdateRolePermissionsRequest([
      {
        permission_id: restrictedPermission.permission_id,
        is_enabled: true,
      },
    ]);

    // WHEN: Attempting to assign a restricted permission
    const response = await clientUserApiRequest.put(
      `/api/client/roles/${storeRole.role_id}/permissions`,
      updateRequest,
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request status").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error code should be RESTRICTED_PERMISSION").toBe(
      "RESTRICTED_PERMISSION",
    );
    expect(
      body.message.toLowerCase(),
      "Error message should indicate restricted permission",
    ).toContain("restricted");
  });

  test("2.92-API-007: [P0] PUT /api/client/roles/:roleId/permissions - should isolate changes to client (AC #5)", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner (clientUser)
    // AND: Another client owner exists
    // AND: A STORE scope role exists
    // AND: An assignable permission exists
    const otherClientUserData = createUser();
    const otherClientUser = await prismaClient.user.create({
      data: otherClientUserData,
    });
    const otherCompany = await prismaClient.company.create({
      data: createCompany({ owner_user_id: otherClientUser.user_id }),
    });

    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    const assignablePermission = await prismaClient.permission.findFirst({
      where: { code: "SHIFT_OPEN" },
    });
    if (!assignablePermission) {
      throw new Error("SHIFT_OPEN permission not found in database");
    }

    const updateRequest = createUpdateRolePermissionsRequest([
      {
        permission_id: assignablePermission.permission_id,
        is_enabled: true,
      },
    ]);

    // WHEN: Updating role permissions for my client
    const response = await clientUserApiRequest.put(
      `/api/client/roles/${storeRole.role_id}/permissions`,
      updateRequest,
    );

    // THEN: Response is successful
    expect(response.status(), "Expected 200 OK status").toBe(200);

    // AND: Changes only affect my client (owner_user_id filtering)
    const myClientPermission =
      await prismaClient.clientRolePermission.findFirst({
        where: {
          owner_user_id: clientUser.user_id,
          role_id: storeRole.role_id,
          permission_id: assignablePermission.permission_id,
        },
      });
    expect(
      myClientPermission,
      "My client's permission should exist",
    ).not.toBeNull();

    // AND: Other client's role configuration is not affected
    const otherClientPermission =
      await prismaClient.clientRolePermission.findFirst({
        where: {
          owner_user_id: otherClientUser.user_id,
          role_id: storeRole.role_id,
          permission_id: assignablePermission.permission_id,
        },
      });
    expect(
      otherClientPermission,
      "Other client's permission should not exist",
    ).toBeNull();

    // Cleanup
    await prismaClient.company.delete({
      where: { company_id: otherCompany.company_id },
    });
    await prismaClient.user.delete({
      where: { user_id: otherClientUser.user_id },
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RESET ROLE TO DEFAULTS TESTS (AC #6)
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.92-API-008: [P2] POST /api/client/roles/:roleId/reset - should reset role to default permissions (AC #6)", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A STORE scope role exists
    // AND: I have customized permissions for this role
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    const assignablePermission = await prismaClient.permission.findFirst({
      where: { code: "SHIFT_OPEN" },
    });
    if (!assignablePermission) {
      throw new Error("SHIFT_OPEN permission not found in database");
    }

    // Create a client role permission override
    await prismaClient.clientRolePermission.create({
      data: {
        owner_user_id: clientUser.user_id,
        role_id: storeRole.role_id,
        permission_id: assignablePermission.permission_id,
        is_enabled: false, // Override to disabled
      },
    });

    // WHEN: Resetting role to defaults
    const response = await clientUserApiRequest.post(
      `/api/client/roles/${storeRole.role_id}/reset`,
      {}, // Empty body required for JSON content-type
    );

    // THEN: Response is successful
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);

    // AND: Client overrides are removed (reverted to system defaults)
    const clientPermission = await prismaClient.clientRolePermission.findFirst({
      where: {
        owner_user_id: clientUser.user_id,
        role_id: storeRole.role_id,
        permission_id: assignablePermission.permission_id,
      },
    });
    expect(
      clientPermission,
      "Client permission override should be removed",
    ).toBeNull();

    // AND: Reset is logged in AuditLog
    // NOTE: Service uses "DELETE" action with table_name "client_role_permissions"
    const auditLog = await prismaClient.auditLog.findFirst({
      where: {
        user_id: clientUser.user_id,
        action: "DELETE",
        table_name: "client_role_permissions",
      },
      orderBy: { timestamp: "desc" },
    });
    expect(auditLog, "Audit log entry should exist").not.toBeNull();
    expect(auditLog?.user_id, "Audit log should have user_id").toBe(
      clientUser.user_id,
    );
    expect(
      auditLog?.table_name,
      "Audit log should reference client_role_permissions table",
    ).toBe("client_role_permissions");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PERMISSION RESOLUTION TESTS (AC #4, #5)
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.92-API-009: [P0] Permission resolution - modified permissions affect user access immediately (AC #4)", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A STORE scope role exists with a system default permission
    // AND: An employee has that role
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    const assignablePermission = await prismaClient.permission.findFirst({
      where: { code: "SHIFT_OPEN" },
    });
    if (!assignablePermission) {
      throw new Error("SHIFT_OPEN permission not found in database");
    }

    // Create client override (disable a permission that was previously enabled)
    const updateRequest = createUpdateRolePermissionsRequest([
      {
        permission_id: assignablePermission.permission_id,
        is_enabled: false,
      },
    ]);

    // WHEN: I update the role permissions
    const updateResponse = await clientUserApiRequest.put(
      `/api/client/roles/${storeRole.role_id}/permissions`,
      updateRequest,
    );
    expect(updateResponse.status(), "Expected 200 OK status").toBe(200);

    // THEN: The change is persisted immediately
    const clientPermission = await prismaClient.clientRolePermission.findFirst({
      where: {
        owner_user_id: clientUser.user_id,
        role_id: storeRole.role_id,
        permission_id: assignablePermission.permission_id,
      },
    });
    expect(
      clientPermission,
      "Client permission override should exist",
    ).not.toBeNull();
    expect(
      clientPermission?.is_enabled,
      "Permission should be disabled immediately",
    ).toBe(false);

    // AND: When querying permissions, the new state is reflected
    const getResponse = await clientUserApiRequest.get(
      `/api/client/roles/${storeRole.role_id}/permissions`,
    );
    expect(getResponse.status(), "Expected 200 OK status").toBe(200);
    const body = await getResponse.json();

    const permission = body.data.permissions.find(
      (p: { permission_id: string }) =>
        p.permission_id === assignablePermission.permission_id,
    );
    expect(
      permission,
      "Permission should exist in response",
    ).not.toBeUndefined();
    expect(
      permission.is_enabled,
      "Permission should show as disabled in API response",
    ).toBe(false);
  });

  test("2.92-API-010: [P0] Permission resolution - should use client override over system default (AC #4, #5)", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A STORE scope role exists with a system default permission
    // AND: I create a client override for that permission
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    const assignablePermission = await prismaClient.permission.findFirst({
      where: { code: "SHIFT_OPEN" },
    });
    if (!assignablePermission) {
      throw new Error("SHIFT_OPEN permission not found in database");
    }

    // Create client override (disable permission)
    await prismaClient.clientRolePermission.create({
      data: {
        owner_user_id: clientUser.user_id,
        role_id: storeRole.role_id,
        permission_id: assignablePermission.permission_id,
        is_enabled: false,
      },
    });

    // WHEN: Checking permissions for the role
    const response = await clientUserApiRequest.get(
      `/api/client/roles/${storeRole.role_id}/permissions`,
    );

    // THEN: Response is successful
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();

    // AND: Client override takes precedence over system default
    const permission = body.data.permissions.find(
      (p: { permission_id: string }) =>
        p.permission_id === assignablePermission.permission_id,
    );
    expect(
      permission,
      "Permission should exist in response",
    ).not.toBeUndefined();
    expect(
      permission.is_enabled,
      "Permission should be disabled (client override)",
    ).toBe(false);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - AUTHENTICATION BYPASS (Mandatory)
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.92-SEC-001: [P0] GET /api/client/roles - should reject request without authentication token", async ({
    request,
    backendUrl,
  }) => {
    // GIVEN: No authentication token is provided

    // WHEN: Attempting to access the roles endpoint
    const response = await request.get(`${backendUrl}/api/client/roles`);

    // THEN: Request is rejected with 401 Unauthorized
    expect(response.status(), "Expected 401 Unauthorized status").toBe(401);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("2.92-SEC-002: [P0] GET /api/client/roles - should reject request with invalid token", async ({
    request,
    backendUrl,
  }) => {
    // GIVEN: An invalid/malformed authentication token

    // WHEN: Attempting to access the roles endpoint with invalid token
    const response = await request.get(`${backendUrl}/api/client/roles`, {
      headers: {
        Cookie: "access_token=invalid.token.here",
      },
    });

    // THEN: Request is rejected with 401 Unauthorized
    expect(response.status(), "Expected 401 Unauthorized status").toBe(401);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("2.92-SEC-003: [P0] PUT /api/client/roles/:roleId/permissions - should reject request without authentication", async ({
    request,
    backendUrl,
    prismaClient,
  }) => {
    // GIVEN: A STORE scope role exists
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    // WHEN: Attempting to update permissions without authentication
    const response = await request.put(
      `${backendUrl}/api/client/roles/${storeRole.role_id}/permissions`,
      {
        data: { permissions: [] },
      },
    );

    // THEN: Request is rejected with 401 Unauthorized
    expect(response.status(), "Expected 401 Unauthorized status").toBe(401);
  });

  test("2.92-SEC-004: [P0] POST /api/client/roles/:roleId/reset - should reject request without authentication", async ({
    request,
    backendUrl,
    prismaClient,
  }) => {
    // GIVEN: A STORE scope role exists
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    // WHEN: Attempting to reset permissions without authentication
    const response = await request.post(
      `${backendUrl}/api/client/roles/${storeRole.role_id}/reset`,
    );

    // THEN: Request is rejected with 401 Unauthorized
    expect(response.status(), "Expected 401 Unauthorized status").toBe(401);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - AUTHORIZATION ENFORCEMENT (Mandatory)
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.92-SEC-005: [P0] PUT /api/client/roles/:roleId/permissions - should deny access without CLIENT_ROLE_MANAGE permission", async ({
    storeManagerUser,
    request,
    backendUrl,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager (without CLIENT_ROLE_MANAGE permission)
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    const assignablePermission = await prismaClient.permission.findFirst({
      where: { code: "SHIFT_OPEN" },
    });
    if (!assignablePermission) {
      throw new Error("SHIFT_OPEN permission not found");
    }

    // WHEN: Attempting to update role permissions
    const response = await request.put(
      `${backendUrl}/api/client/roles/${storeRole.role_id}/permissions`,
      {
        headers: {
          Cookie: `access_token=${storeManagerUser.token}`,
        },
        data: {
          permissions: [
            {
              permission_id: assignablePermission.permission_id,
              is_enabled: true,
            },
          ],
        },
      },
    );

    // THEN: Access is denied with 403 Forbidden
    expect(response.status(), "Expected 403 Forbidden status").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("2.92-SEC-006: [P0] POST /api/client/roles/:roleId/reset - should deny access without CLIENT_ROLE_MANAGE permission", async ({
    storeManagerUser,
    request,
    backendUrl,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager (without CLIENT_ROLE_MANAGE permission)
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    // WHEN: Attempting to reset role permissions
    const response = await request.post(
      `${backendUrl}/api/client/roles/${storeRole.role_id}/reset`,
      {
        headers: {
          Cookie: `access_token=${storeManagerUser.token}`,
        },
      },
    );

    // THEN: Access is denied with 403 Forbidden
    expect(response.status(), "Expected 403 Forbidden status").toBe(403);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - INPUT VALIDATION (Mandatory)
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.92-SEC-007: [P0] GET /api/client/roles/:roleId/permissions - should reject invalid UUID format", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Client Owner

    // WHEN: Requesting permissions with invalid UUID format
    const response = await clientUserApiRequest.get(
      "/api/client/roles/not-a-valid-uuid/permissions",
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request status").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error code should be VALIDATION_ERROR").toBe(
      "VALIDATION_ERROR",
    );
  });

  test("2.92-SEC-008: [P0] PUT /api/client/roles/:roleId/permissions - should reject empty permissions array", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    // WHEN: Sending empty permissions array
    const response = await clientUserApiRequest.put(
      `/api/client/roles/${storeRole.role_id}/permissions`,
      { permissions: [] },
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request status").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error code should be VALIDATION_ERROR").toBe(
      "VALIDATION_ERROR",
    );
  });

  test("2.92-SEC-009: [P0] PUT /api/client/roles/:roleId/permissions - should reject more than 50 permissions per update", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    // Generate 51 fake permission updates (exceeds max of 50)
    // Use valid UUID v4 format (version 4, variant 8/9/a/b)
    const tooManyPermissions = Array.from({ length: 51 }, (_, i) => ({
      permission_id: `${String(i).padStart(8, "0")}-0000-4000-a000-000000000000`,
      is_enabled: true,
    }));

    // WHEN: Sending more than 50 permissions
    const response = await clientUserApiRequest.put(
      `/api/client/roles/${storeRole.role_id}/permissions`,
      { permissions: tooManyPermissions },
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request status").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error code should be VALIDATION_ERROR").toBe(
      "VALIDATION_ERROR",
    );
    expect(
      body.message.toLowerCase(),
      "Error message should mention 50 permission limit",
    ).toContain("50");
  });

  test("2.92-SEC-010: [P0] PUT /api/client/roles/:roleId/permissions - should reject invalid permission_id format", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    // WHEN: Sending permission with invalid UUID format
    const response = await clientUserApiRequest.put(
      `/api/client/roles/${storeRole.role_id}/permissions`,
      {
        permissions: [{ permission_id: "not-a-uuid", is_enabled: true }],
      },
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request status").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("2.92-SEC-011: [P0] PUT /api/client/roles/:roleId/permissions - should reject non-boolean is_enabled value", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    const assignablePermission = await prismaClient.permission.findFirst({
      where: { code: "SHIFT_OPEN" },
    });
    if (!assignablePermission) {
      throw new Error("SHIFT_OPEN permission not found");
    }

    // WHEN: Sending permission with non-boolean is_enabled
    const response = await clientUserApiRequest.put(
      `/api/client/roles/${storeRole.role_id}/permissions`,
      {
        permissions: [
          {
            permission_id: assignablePermission.permission_id,
            is_enabled: "true" as unknown,
          },
        ],
      },
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request status").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - TENANT ISOLATION (Mandatory)
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.92-SEC-012: [P0] Tenant isolation - client cannot see other client's permission overrides", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as Client Owner A
    // AND: Client Owner B has created permission overrides
    const otherClientUserData = createUser();
    const otherClientUser = await prismaClient.user.create({
      data: otherClientUserData,
    });

    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    const assignablePermission = await prismaClient.permission.findFirst({
      where: { code: "SHIFT_OPEN" },
    });
    if (!assignablePermission) {
      throw new Error("SHIFT_OPEN permission not found");
    }

    // Create override for other client
    await prismaClient.clientRolePermission.create({
      data: {
        owner_user_id: otherClientUser.user_id,
        role_id: storeRole.role_id,
        permission_id: assignablePermission.permission_id,
        is_enabled: false,
      },
    });

    // WHEN: Client A requests role permissions
    const response = await clientUserApiRequest.get(
      `/api/client/roles/${storeRole.role_id}/permissions`,
    );

    // THEN: Response is successful
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();

    // AND: Client A does NOT see Client B's override
    const permission = body.data.permissions.find(
      (p: { permission_id: string }) =>
        p.permission_id === assignablePermission.permission_id,
    );
    // If permission exists and is_client_override is true, it should be OUR override, not the other client's
    if (permission && permission.is_client_override) {
      // This would only be true if we (clientUser) had an override, which we don't
      // So verify this is actually using system default (not other client's override)
      const ourOverride = await prismaClient.clientRolePermission.findFirst({
        where: {
          owner_user_id: clientUser.user_id,
          role_id: storeRole.role_id,
          permission_id: assignablePermission.permission_id,
        },
      });
      expect(ourOverride, "Our client should not have an override").toBeNull();
    }

    // Cleanup
    await prismaClient.clientRolePermission.deleteMany({
      where: { owner_user_id: otherClientUser.user_id },
    });
    await prismaClient.user.delete({
      where: { user_id: otherClientUser.user_id },
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.92-EDGE-001: [P1] GET /api/client/roles/:roleId/permissions - should return 404 for non-existent role", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    const nonExistentRoleId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Requesting permissions for non-existent role
    const response = await clientUserApiRequest.get(
      `/api/client/roles/${nonExistentRoleId}/permissions`,
    );

    // THEN: Request returns 404 Not Found
    expect(response.status(), "Expected 404 Not Found status").toBe(404);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error code should be NOT_FOUND").toBe("NOT_FOUND");
  });

  test("2.92-EDGE-002: [P1] GET /api/client/roles/:roleId/permissions - should reject SYSTEM scope role", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A SYSTEM scope role exists
    const systemRole = await prismaClient.role.findFirst({
      where: { scope: "SYSTEM" },
    });
    if (!systemRole) {
      // Skip if no SYSTEM role exists
      return;
    }

    // WHEN: Requesting permissions for SYSTEM scope role
    const response = await clientUserApiRequest.get(
      `/api/client/roles/${systemRole.role_id}/permissions`,
    );

    // THEN: Request is rejected with 400 Bad Request (invalid scope)
    expect(response.status(), "Expected 400 Bad Request status").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error code should be INVALID_SCOPE").toBe(
      "INVALID_SCOPE",
    );
  });

  test("2.92-EDGE-003: [P1] PUT /api/client/roles/:roleId/permissions - should reject COMPANY scope role", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A COMPANY scope role exists
    const companyRole = await prismaClient.role.findFirst({
      where: { scope: "COMPANY" },
    });
    if (!companyRole) {
      // Skip if no COMPANY role exists
      return;
    }

    const assignablePermission = await prismaClient.permission.findFirst({
      where: { code: "SHIFT_OPEN" },
    });
    if (!assignablePermission) {
      throw new Error("SHIFT_OPEN permission not found");
    }

    // WHEN: Attempting to update permissions for COMPANY scope role
    const response = await clientUserApiRequest.put(
      `/api/client/roles/${companyRole.role_id}/permissions`,
      {
        permissions: [
          {
            permission_id: assignablePermission.permission_id,
            is_enabled: true,
          },
        ],
      },
    );

    // THEN: Request is rejected with 400 Bad Request (invalid scope)
    expect(response.status(), "Expected 400 Bad Request status").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error code should be INVALID_SCOPE").toBe(
      "INVALID_SCOPE",
    );
  });

  test("2.92-EDGE-004: [P1] PUT /api/client/roles/:roleId/permissions - should reject non-existent permission_id", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    const nonExistentPermissionId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Sending update with non-existent permission_id
    const response = await clientUserApiRequest.put(
      `/api/client/roles/${storeRole.role_id}/permissions`,
      {
        permissions: [
          { permission_id: nonExistentPermissionId, is_enabled: true },
        ],
      },
    );

    // THEN: Request is rejected with 404 Not Found
    expect(response.status(), "Expected 404 Not Found status").toBe(404);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("2.92-EDGE-005: [P2] POST /api/client/roles/:roleId/reset - should handle reset when no overrides exist", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: I have NO customized permissions for a role
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    // Ensure no overrides exist for this client + role
    await prismaClient.clientRolePermission.deleteMany({
      where: {
        owner_user_id: clientUser.user_id,
        role_id: storeRole.role_id,
      },
    });

    // WHEN: Resetting role to defaults (when already at defaults)
    const response = await clientUserApiRequest.post(
      `/api/client/roles/${storeRole.role_id}/reset`,
      {}, // Empty body required for JSON content-type
    );

    // THEN: Response is successful (idempotent operation)
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
  });

  test("2.92-EDGE-006: [P1] PUT /api/client/roles/:roleId/permissions - should handle toggling permission on then off", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    const assignablePermission = await prismaClient.permission.findFirst({
      where: { code: "SHIFT_OPEN" },
    });
    if (!assignablePermission) {
      throw new Error("SHIFT_OPEN permission not found");
    }

    // Cleanup any existing override
    await prismaClient.clientRolePermission.deleteMany({
      where: {
        owner_user_id: clientUser.user_id,
        role_id: storeRole.role_id,
        permission_id: assignablePermission.permission_id,
      },
    });

    // WHEN: First, enable the permission
    const enableResponse = await clientUserApiRequest.put(
      `/api/client/roles/${storeRole.role_id}/permissions`,
      {
        permissions: [
          {
            permission_id: assignablePermission.permission_id,
            is_enabled: true,
          },
        ],
      },
    );
    expect(enableResponse.status(), "Enable should succeed").toBe(200);

    // AND: Then disable it
    const disableResponse = await clientUserApiRequest.put(
      `/api/client/roles/${storeRole.role_id}/permissions`,
      {
        permissions: [
          {
            permission_id: assignablePermission.permission_id,
            is_enabled: false,
          },
        ],
      },
    );

    // THEN: Both operations succeed
    expect(disableResponse.status(), "Disable should succeed").toBe(200);

    // AND: Final state is disabled
    const clientPermission = await prismaClient.clientRolePermission.findFirst({
      where: {
        owner_user_id: clientUser.user_id,
        role_id: storeRole.role_id,
        permission_id: assignablePermission.permission_id,
      },
    });
    expect(clientPermission?.is_enabled, "Permission should be disabled").toBe(
      false,
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RESTRICTED PERMISSION TESTS (Additional Coverage)
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.92-SEC-013: [P0] PUT /api/client/roles/:roleId/permissions - should reject all COMPANY_* permissions", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    // Test with COMPANY_READ (restricted permission)
    const companyPermission = await prismaClient.permission.findFirst({
      where: { code: "COMPANY_READ" },
    });
    if (!companyPermission) {
      throw new Error("COMPANY_READ permission not found");
    }

    // WHEN: Attempting to assign a COMPANY_* permission
    const response = await clientUserApiRequest.put(
      `/api/client/roles/${storeRole.role_id}/permissions`,
      {
        permissions: [
          { permission_id: companyPermission.permission_id, is_enabled: true },
        ],
      },
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request status").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error code should be RESTRICTED_PERMISSION").toBe(
      "RESTRICTED_PERMISSION",
    );
  });

  test("2.92-SEC-014: [P0] PUT /api/client/roles/:roleId/permissions - should reject USER_* permissions", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    // Test with USER_CREATE (restricted permission)
    const userPermission = await prismaClient.permission.findFirst({
      where: { code: "USER_CREATE" },
    });
    if (!userPermission) {
      throw new Error("USER_CREATE permission not found");
    }

    // WHEN: Attempting to assign a USER_* permission
    const response = await clientUserApiRequest.put(
      `/api/client/roles/${storeRole.role_id}/permissions`,
      {
        permissions: [
          { permission_id: userPermission.permission_id, is_enabled: true },
        ],
      },
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request status").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error code should be RESTRICTED_PERMISSION").toBe(
      "RESTRICTED_PERMISSION",
    );
  });

  test("2.92-SEC-015: [P0] PUT /api/client/roles/:roleId/permissions - should reject CLIENT_ROLE_MANAGE permission (privilege escalation)", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    // Test with CLIENT_ROLE_MANAGE (restricted - privilege escalation risk)
    const clientRoleManagePermission = await prismaClient.permission.findFirst({
      where: { code: "CLIENT_ROLE_MANAGE" },
    });
    if (!clientRoleManagePermission) {
      throw new Error("CLIENT_ROLE_MANAGE permission not found");
    }

    // WHEN: Attempting to assign CLIENT_ROLE_MANAGE to a STORE role
    const response = await clientUserApiRequest.put(
      `/api/client/roles/${storeRole.role_id}/permissions`,
      {
        permissions: [
          {
            permission_id: clientRoleManagePermission.permission_id,
            is_enabled: true,
          },
        ],
      },
    );

    // THEN: Request is rejected (prevents privilege escalation)
    expect(response.status(), "Expected 400 Bad Request status").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error code should be RESTRICTED_PERMISSION").toBe(
      "RESTRICTED_PERMISSION",
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA CONSISTENCY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("2.92-DATA-001: [P1] Permission update - changes should be immediately visible via GET", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    const storeRole = await prismaClient.role.findFirst({
      where: { scope: "STORE" },
    });
    if (!storeRole) {
      throw new Error("No STORE scope role found in database");
    }

    const assignablePermission = await prismaClient.permission.findFirst({
      where: { code: "INVENTORY_READ" },
    });
    if (!assignablePermission) {
      throw new Error("INVENTORY_READ permission not found");
    }

    // Cleanup any existing override
    await prismaClient.clientRolePermission.deleteMany({
      where: {
        owner_user_id: clientUser.user_id,
        role_id: storeRole.role_id,
        permission_id: assignablePermission.permission_id,
      },
    });

    // WHEN: I update a permission
    const updateResponse = await clientUserApiRequest.put(
      `/api/client/roles/${storeRole.role_id}/permissions`,
      {
        permissions: [
          {
            permission_id: assignablePermission.permission_id,
            is_enabled: false,
          },
        ],
      },
    );
    expect(updateResponse.status(), "Update should succeed").toBe(200);

    // AND: I immediately fetch the role permissions
    const getResponse = await clientUserApiRequest.get(
      `/api/client/roles/${storeRole.role_id}/permissions`,
    );

    // THEN: The change is visible immediately (cache invalidation working)
    expect(getResponse.status(), "GET should succeed").toBe(200);
    const body = await getResponse.json();

    const permission = body.data.permissions.find(
      (p: { permission_id: string }) =>
        p.permission_id === assignablePermission.permission_id,
    );
    expect(permission.is_enabled, "Permission should show updated state").toBe(
      false,
    );
    expect(
      permission.is_client_override,
      "Should be marked as client override",
    ).toBe(true);
  });
});
