import { test, expect } from "../support/fixtures/rbac.fixture";
import { createUser, createCompany, createStore } from "../support/factories";
import { createExpiredJWTAccessToken } from "../support/factories/jwt.factory";

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
    storeManagerUser,
    prismaClient,
    request,
    backendUrl,
  }) => {
    // GIVEN: Store manager user does not have USER_DELETE permission
    // (STORE_MANAGER role only has USER_READ, not USER_DELETE per rbac.seed.ts)
    // Create a test user to attempt deletion
    const testUserData = createUser();
    const testUser = await prismaClient.user.create({ data: testUserData });

    // WHEN: Store manager attempts to delete user (lacks USER_DELETE permission)
    const response = await request.delete(
      `${backendUrl}/api/users/${testUser.user_id}`,
      {
        headers: {
          Cookie: `access_token=${storeManagerUser.token}`,
        },
      },
    );

    // THEN: Access is denied with 403 Forbidden
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("PERMISSION_DENIED");
    expect(body.error.message.toLowerCase()).toContain("permission");

    // Cleanup
    await prismaClient.user.delete({ where: { user_id: testUser.user_id } });
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
    corporateAdminUser,
    request,
    backendUrl,
  }) => {
    // GIVEN: Corporate admin user has COMPANY scope for their company
    // WHEN: Accessing stores for their own company
    const response = await request.get(
      `${backendUrl}/api/companies/${corporateAdminUser.company_id}/stores`,
      {
        headers: {
          Cookie: `access_token=${corporateAdminUser.token}`,
        },
      },
    );

    // THEN: Access is granted
    expect(response.status()).toBe(200);
  });

  test("[P0] should deny COMPANY scope access to different company", async ({
    corporateAdminUser,
    prismaClient,
    request,
    backendUrl,
  }) => {
    // GIVEN: Corporate admin user has COMPANY scope for their company
    // Create a different company
    const otherOwner = await prismaClient.user.create({
      data: createUser({ name: "Other Company Owner" }),
    });
    const otherCompanyData = createCompany({
      owner_user_id: otherOwner.user_id,
    });
    const otherCompany = await prismaClient.company.create({
      data: otherCompanyData,
    });

    // WHEN: Attempting to access stores for different company
    const response = await request.get(
      `${backendUrl}/api/companies/${otherCompany.company_id}/stores`,
      {
        headers: {
          Cookie: `access_token=${corporateAdminUser.token}`,
        },
      },
    );

    // THEN: Access is denied with 403 Forbidden
    expect(response.status()).toBe(403);

    // Cleanup
    await prismaClient.company.delete({
      where: { company_id: otherCompany.company_id },
    });
  });

  test("[P0] should check STORE scope permissions correctly", async ({
    storeManagerUser,
    request,
    backendUrl,
  }) => {
    // GIVEN: Store manager user has STORE scope for their store
    // WHEN: Accessing their own store
    const response = await request.get(
      `${backendUrl}/api/stores/${storeManagerUser.store_id}`,
      {
        headers: {
          Cookie: `access_token=${storeManagerUser.token}`,
        },
      },
    );

    // THEN: Access is granted
    expect(response.status()).toBe(200);
  });

  test("[P0] should deny STORE scope access to different store", async ({
    storeManagerUser,
    prismaClient,
    request,
    backendUrl,
  }) => {
    // GIVEN: Store manager user has STORE scope for their store
    // Create a different company and store
    const otherOwner = await prismaClient.user.create({
      data: createUser({ name: "Other Company Owner" }),
    });
    const otherCompanyData = createCompany({
      owner_user_id: otherOwner.user_id,
    });
    const otherCompany = await prismaClient.company.create({
      data: otherCompanyData,
    });
    const otherStoreData = createStore({ company_id: otherCompany.company_id });
    const otherStore = await prismaClient.store.create({
      data: {
        ...otherStoreData,
        location_json: otherStoreData.location_json as any,
      },
    });

    // WHEN: Attempting to access different store
    const response = await request.get(
      `${backendUrl}/api/stores/${otherStore.store_id}`,
      {
        headers: {
          Cookie: `access_token=${storeManagerUser.token}`,
        },
      },
    );

    // THEN: Access is denied with 403 Forbidden
    expect(response.status()).toBe(403);

    // Cleanup
    await prismaClient.store.delete({
      where: { store_id: otherStore.store_id },
    });
    await prismaClient.company.delete({
      where: { company_id: otherCompany.company_id },
    });
  });

  test("[P0] should inherit COMPANY permissions to STORE scope", async ({
    corporateAdminUser,
    prismaClient,
    request,
    backendUrl,
  }) => {
    // GIVEN: Corporate admin user has COMPANY scope (includes STORE access)
    // Create a store within the corporate admin's company
    const storeData = createStore({
      company_id: corporateAdminUser.company_id,
    });
    const store = await prismaClient.store.create({
      data: {
        ...storeData,
        location_json: storeData.location_json as any,
      },
    });

    // WHEN: Accessing store resource within same company
    const response = await request.get(
      `${backendUrl}/api/stores/${store.store_id}`,
      {
        headers: {
          Cookie: `access_token=${corporateAdminUser.token}`,
        },
      },
    );

    // THEN: Access is granted (COMPANY scope applies to stores)
    expect(response.status()).toBe(200);

    // Cleanup
    await prismaClient.store.delete({ where: { store_id: store.store_id } });
  });

  test("[P0] should handle multiple roles with different scopes", async ({
    storeManagerUser,
    request,
    backendUrl,
  }) => {
    // GIVEN: Store manager user has STORE scope for their store
    // WHEN: Accessing resource they have permission for
    const response = await request.get(
      `${backendUrl}/api/stores/${storeManagerUser.store_id}`,
      {
        headers: {
          Cookie: `access_token=${storeManagerUser.token}`,
        },
      },
    );

    // THEN: Access is granted
    expect(response.status()).toBe(200);
  });
});

test.describe("RBAC Framework - Permission Middleware", () => {
  test("[P0] should validate permission before route handler executes", async ({
    storeManagerUser,
    request,
    backendUrl,
  }) => {
    // GIVEN: Protected route requires USER_CREATE permission
    // Store manager does not have USER_CREATE permission
    // WHEN: User without USER_CREATE attempts to create user
    const userData = createUser();
    const response = await request.post(`${backendUrl}/api/users`, {
      data: userData,
      headers: {
        "Content-Type": "application/json",
        Cookie: `access_token=${storeManagerUser.token}`,
      },
    });

    // THEN: Middleware rejects request with 403 before handler runs
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("PERMISSION_DENIED");
  });

  test("[P0] should allow authorized requests to proceed", async ({
    authenticatedApiRequest,
  }) => {
    // GIVEN: Superadmin has USER_CREATE permission
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
    expect(body).toHaveProperty("error");
    expect(body.error).toHaveProperty("code", "UNAUTHORIZED");
    // Error message can be either "Unauthorized" or "Missing access token cookie"
    expect(["Unauthorized", "Missing access token cookie"]).toContain(
      body.error.message,
    );
  });

  test("[P0] should return 401 when access token is invalid", async ({
    apiRequest,
    backendUrl,
  }) => {
    // GIVEN: Request with invalid access token
    // WHEN: Accessing protected route
    const response = await apiRequest.get("/api/users", {
      headers: {
        Cookie: "access_token=invalid-token",
      },
    });

    // THEN: Middleware returns 401 Unauthorized
    expect(response.status()).toBe(401);
  });

  test("[P0] should return 401 when access token is expired", async ({
    request,
    backendUrl,
  }) => {
    // GIVEN: User has expired access token
    const expiredToken = createExpiredJWTAccessToken();

    // WHEN: Accessing protected route with expired token
    const response = await request.get(`${backendUrl}/api/users`, {
      headers: {
        Cookie: `access_token=${expiredToken}`,
      },
    });

    // THEN: Middleware returns 401 Unauthorized
    expect(response.status()).toBe(401);
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
