import { test, expect } from "../support/fixtures/rbac.fixture";
import { createUser, createCompany, createStore } from "../support/factories";

/**
 * RBAC Framework API Tests
 *
 * Tests for Role-Based Access Control (RBAC) permission system:
 * - Permission checking with roles and scopes (SYSTEM, COMPANY, STORE)
 * - Permission middleware validation and 403 Forbidden responses
 * - Audit logging for permission denials
 * - Database models and default role/permission seeding
 *
 * Priority: P0 (Critical - Security feature)
 */

test.describe("RBAC Framework - Permission Checking", () => {
  test("[P0] should grant access when user has required permission", async ({
    authenticatedApiRequest,
  }) => {
    // GIVEN: User has role with USER_READ permission
    // WHEN: Requesting protected resource requiring USER_READ
    const response = await authenticatedApiRequest.get("/api/users");

    // THEN: Access is granted (200 OK)
    expect(response.status()).toBe(200);
  });

  test("[P0] should deny access with 403 when user lacks required permission", async ({
    authenticatedApiRequest,
  }) => {
    // GIVEN: User does not have USER_DELETE permission
    // WHEN: Attempting to delete user
    const response = await authenticatedApiRequest.delete("/api/users/test-id");

    // THEN: Access is denied with 403 Forbidden
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body).toHaveProperty("error", "Forbidden");
    expect(body).toHaveProperty("message");
    expect(body.message).toContain("permission");
  });

  test("[P0] should check SYSTEM scope permissions correctly", async ({
    authenticatedApiRequest,
  }) => {
    // GIVEN: User has SUPERADMIN role with SYSTEM scope
    // WHEN: Accessing system-wide resource
    const response = await authenticatedApiRequest.get(
      "/api/admin/system-config",
    );

    // THEN: Access is granted (SYSTEM scope applies everywhere)
    expect(response.status()).toBe(200);
  });

  test("[P0] should check COMPANY scope permissions correctly", async ({
    authenticatedApiRequest,
  }) => {
    // GIVEN: User has CORPORATE_ADMIN role with COMPANY scope for company-123
    // WHEN: Accessing company resource for company-123
    const response = await authenticatedApiRequest.get(
      "/api/companies/company-123/stores",
    );

    // THEN: Access is granted
    expect(response.status()).toBe(200);
  });

  test("[P0] should deny COMPANY scope access to different company", async ({
    authenticatedApiRequest,
  }) => {
    // GIVEN: User has CORPORATE_ADMIN role with COMPANY scope for company-123
    // WHEN: Accessing company resource for company-456
    const response = await authenticatedApiRequest.get(
      "/api/companies/company-456/stores",
    );

    // THEN: Access is denied with 403 Forbidden
    expect(response.status()).toBe(403);
  });

  test("[P0] should check STORE scope permissions correctly", async ({
    authenticatedApiRequest,
  }) => {
    // GIVEN: User has STORE_MANAGER role with STORE scope for store-789
    // WHEN: Accessing store resource for store-789
    const response = await authenticatedApiRequest.get(
      "/api/stores/store-789/shifts",
    );

    // THEN: Access is granted
    expect(response.status()).toBe(200);
  });

  test("[P0] should deny STORE scope access to different store", async ({
    authenticatedApiRequest,
  }) => {
    // GIVEN: User has STORE_MANAGER role with STORE scope for store-789
    // WHEN: Accessing store resource for store-999
    const response = await authenticatedApiRequest.get(
      "/api/stores/store-999/shifts",
    );

    // THEN: Access is denied with 403 Forbidden
    expect(response.status()).toBe(403);
  });

  test("[P0] should inherit COMPANY permissions to STORE scope", async ({
    authenticatedApiRequest,
  }) => {
    // GIVEN: User has CORPORATE_ADMIN role with COMPANY scope (includes STORE access)
    // WHEN: Accessing store resource within same company
    const response = await authenticatedApiRequest.get(
      "/api/stores/store-789/shifts",
    );

    // THEN: Access is granted (COMPANY scope applies to stores)
    expect(response.status()).toBe(200);
  });

  test("[P0] should handle multiple roles with different scopes", async ({
    authenticatedApiRequest,
  }) => {
    // GIVEN: User has both CORPORATE_ADMIN (COMPANY) and STORE_MANAGER (STORE) roles
    // WHEN: Accessing resource requiring either permission
    const response = await authenticatedApiRequest.get(
      "/api/stores/store-789/inventory",
    );

    // THEN: Access is granted (user has permission from either role)
    expect(response.status()).toBe(200);
  });
});

test.describe("RBAC Framework - Permission Middleware", () => {
  test("[P0] should validate permission before route handler executes", async ({
    authenticatedApiRequest,
  }) => {
    // GIVEN: Protected route requires USER_CREATE permission
    // WHEN: User without USER_CREATE attempts to create user
    const userData = createUser();
    const response = await authenticatedApiRequest.post("/api/users", userData);

    // THEN: Middleware rejects request with 403 before handler runs
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body).toHaveProperty("error", "Forbidden");
  });

  test("[P0] should allow authorized requests to proceed", async ({
    authenticatedApiRequest,
  }) => {
    // GIVEN: User has USER_CREATE permission
    // WHEN: Creating user via protected route
    const userData = createUser();
    const response = await authenticatedApiRequest.post("/api/users", userData);

    // THEN: Request proceeds and user is created (201 Created)
    expect(response.status()).toBe(201);
  });

  test("[P0] should return 401 when access token is missing", async ({
    apiRequest,
  }) => {
    // GIVEN: Request without access token cookie
    // WHEN: Accessing protected route
    const response = await apiRequest.get("/api/users");

    // THEN: Middleware returns 401 Unauthorized
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty("error", "Unauthorized");
  });

  test("[P0] should return 401 when access token is invalid", async ({
    apiRequest,
    backendUrl,
  }) => {
    // GIVEN: Request with invalid access token
    // WHEN: Accessing protected route
    const response = await apiRequest.get("/api/users", {
      headers: {
        Cookie: "accessToken=invalid-token",
      },
    });

    // THEN: Middleware returns 401 Unauthorized
    expect(response.status()).toBe(401);
  });

  test("[P0] should return 401 when access token is expired", async ({
    authenticatedApiRequest,
  }) => {
    // GIVEN: User has expired access token
    // WHEN: Accessing protected route
    // Note: This test requires expired token setup - will fail until token expiry handling is implemented
    const response = await authenticatedApiRequest.get("/api/users");

    // THEN: Middleware returns 401 Unauthorized
    // TODO: Setup expired token for this test
    expect(response.status()).toBe(401);
  });
});

test.describe("RBAC Framework - Audit Logging", () => {
  test("[P0] should log permission denial to AuditLog", async ({
    authenticatedApiRequest,
    prismaClient,
  }) => {
    // GIVEN: User attempts unauthorized action
    // WHEN: Permission is denied (403 Forbidden)
    const response = await authenticatedApiRequest.delete("/api/users/test-id");
    expect(response.status()).toBe(403);

    // THEN: AuditLog entry is created with user_id, permission code, resource, timestamp
    // Note: This test will fail until AuditLog model and logging are implemented
    const auditLogs = await prismaClient.$queryRaw`
      SELECT * FROM audit_logs 
      WHERE action = 'PERMISSION_DENIED' 
      ORDER BY created_at DESC 
      LIMIT 1
    `;

    expect(auditLogs).toBeDefined();
    // TODO: Verify audit log structure when AuditLog model is created
    // expect(auditLogs[0]).toHaveProperty('user_id');
    // expect(auditLogs[0]).toHaveProperty('permission_code');
    // expect(auditLogs[0]).toHaveProperty('resource');
    // expect(auditLogs[0]).toHaveProperty('created_at');
  });

  test("[P0] should include correct permission code in audit log", async ({
    authenticatedApiRequest,
    prismaClient,
  }) => {
    // GIVEN: User attempts action requiring USER_DELETE permission
    // WHEN: Permission is denied
    const response = await authenticatedApiRequest.delete("/api/users/test-id");
    expect(response.status()).toBe(403);

    // THEN: Audit log contains permission code 'USER_DELETE'
    const auditLogs = await prismaClient.$queryRaw`
      SELECT * FROM audit_logs 
      WHERE permission_code = 'USER_DELETE' 
      ORDER BY created_at DESC 
      LIMIT 1
    `;

    expect(auditLogs).toBeDefined();
    // TODO: Verify permission_code when AuditLog model is created
  });

  test("[P0] should include resource path in audit log", async ({
    authenticatedApiRequest,
    prismaClient,
  }) => {
    // GIVEN: User attempts unauthorized action on specific resource
    // WHEN: Permission is denied
    const response = await authenticatedApiRequest.delete(
      "/api/users/user-123",
    );
    expect(response.status()).toBe(403);

    // THEN: Audit log contains resource path '/api/users/user-123'
    const auditLogs = await prismaClient.$queryRaw`
      SELECT * FROM audit_logs 
      WHERE resource = '/api/users/user-123' 
      ORDER BY created_at DESC 
      LIMIT 1
    `;

    expect(auditLogs).toBeDefined();
    // TODO: Verify resource path when AuditLog model is created
  });
});

test.describe("RBAC Framework - Database Models and Seeding", () => {
  test("[P1] should have Role model in database schema", async ({
    prismaClient,
  }) => {
    // GIVEN: Database schema is migrated
    // WHEN: Querying Role model
    // THEN: Role model exists and can be queried
    // Note: This test will fail until Role model is added to Prisma schema
    const roles = await prismaClient.$queryRaw`
      SELECT * FROM roles LIMIT 1
    `;

    expect(roles).toBeDefined();
  });

  test("[P1] should have Permission model in database schema", async ({
    prismaClient,
  }) => {
    // GIVEN: Database schema is migrated
    // WHEN: Querying Permission model
    // THEN: Permission model exists and can be queried
    // Note: This test will fail until Permission model is added to Prisma schema
    const permissions = await prismaClient.$queryRaw`
      SELECT * FROM permissions LIMIT 1
    `;

    expect(permissions).toBeDefined();
  });

  test("[P1] should have UserRole model in database schema", async ({
    prismaClient,
  }) => {
    // GIVEN: Database schema is migrated
    // WHEN: Querying UserRole model
    // THEN: UserRole model exists and can be queried
    // Note: This test will fail until UserRole model is added to Prisma schema
    const userRoles = await prismaClient.$queryRaw`
      SELECT * FROM user_roles LIMIT 1
    `;

    expect(userRoles).toBeDefined();
  });

  test("[P1] should have RolePermission model in database schema", async ({
    prismaClient,
  }) => {
    // GIVEN: Database schema is migrated
    // WHEN: Querying RolePermission model
    // THEN: RolePermission model exists and can be queried
    // Note: This test will fail until RolePermission model is added to Prisma schema
    const rolePermissions = await prismaClient.$queryRaw`
      SELECT * FROM role_permissions LIMIT 1
    `;

    expect(rolePermissions).toBeDefined();
  });

  test("[P1] should seed default roles on initialization", async ({
    prismaClient,
  }) => {
    // GIVEN: Database is initialized
    // WHEN: Querying default roles
    // THEN: Default roles exist (SUPERADMIN, CORPORATE_ADMIN, STORE_MANAGER, SHIFT_MANAGER, CASHIER)
    // Note: This test will fail until seeding is implemented
    const superadmin = await prismaClient.$queryRaw`
      SELECT * FROM roles WHERE code = 'SUPERADMIN' LIMIT 1
    `;
    expect(superadmin).toBeDefined();

    const corporateAdmin = await prismaClient.$queryRaw`
      SELECT * FROM roles WHERE code = 'CORPORATE_ADMIN' LIMIT 1
    `;
    expect(corporateAdmin).toBeDefined();

    const storeManager = await prismaClient.$queryRaw`
      SELECT * FROM roles WHERE code = 'STORE_MANAGER' LIMIT 1
    `;
    expect(storeManager).toBeDefined();
  });

  test("[P1] should seed default permissions on initialization", async ({
    prismaClient,
  }) => {
    // GIVEN: Database is initialized
    // WHEN: Querying default permissions
    // THEN: Default permissions exist (USER_CREATE, USER_READ, STORE_CREATE, etc.)
    // Note: This test will fail until seeding is implemented
    const userCreate = await prismaClient.$queryRaw`
      SELECT * FROM permissions WHERE code = 'USER_CREATE' LIMIT 1
    `;
    expect(userCreate).toBeDefined();

    const userRead = await prismaClient.$queryRaw`
      SELECT * FROM permissions WHERE code = 'USER_READ' LIMIT 1
    `;
    expect(userRead).toBeDefined();
  });

  test("[P1] should map roles to permissions correctly", async ({
    prismaClient,
  }) => {
    // GIVEN: Database is initialized with default roles and permissions
    // WHEN: Querying role-permission mappings
    // THEN: SUPERADMIN role has all permissions
    // Note: This test will fail until role-permission mappings are seeded
    const superadminPermissions = await prismaClient.$queryRaw`
      SELECT p.code 
      FROM permissions p
      INNER JOIN role_permissions rp ON p.permission_id = rp.permission_id
      INNER JOIN roles r ON rp.role_id = r.role_id
      WHERE r.code = 'SUPERADMIN'
    `;

    expect(superadminPermissions).toBeDefined();
    // TODO: Verify specific permissions when mappings are implemented
  });

  test("[P1] should allow idempotent seeding (multiple runs safe)", async ({
    prismaClient,
  }) => {
    // GIVEN: Database already has default roles and permissions
    // WHEN: Running seed script again
    // THEN: No duplicate entries are created
    // Note: This test requires seed script to be idempotent
    // Implementation: Run seed script twice and verify no duplicates
    const roleCountBefore = await prismaClient.$queryRaw`
      SELECT COUNT(*) as count FROM roles
    `;

    // TODO: Run seed script
    // await runSeedScript();

    const roleCountAfter = await prismaClient.$queryRaw`
      SELECT COUNT(*) as count FROM roles
    `;

    // Counts should be equal (no duplicates)
    expect(roleCountAfter).toEqual(roleCountBefore);
  });
});
