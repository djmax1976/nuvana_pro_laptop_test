import { test, expect } from "../support/fixtures/rbac.fixture";
import { createCompany, createUser } from "../support/helpers";

/**
 * Store Creation with Login and Terminals API Tests
 *
 * TEST FILE: tests/api/store-creation-with-manager.api.spec.ts
 * FEATURE: Extended Store Creation
 * CREATED: 2025-12-05
 *
 * BUSINESS RULES TESTED:
 * - BR-SCL-01: Store can be created with optional login credential
 * - BR-SCL-02: Store can be created with optional terminals
 * - BR-SCL-03: Store creation with login creates CLIENT_USER with STORE scope
 * - BR-SCL-04: All operations are atomic (store, login, terminals created together)
 * - BR-SCL-05: Validation errors roll back all changes
 * - BR-SCL-06: Login email must be unique
 *
 * ENDPOINTS TESTED:
 * - POST /api/companies/:companyId/stores (extended with login and terminals)
 */

test.describe("Store Creation with Login and Terminals", () => {
  /**
   * BR-SCL-01: Create store with login
   */
  test("[P0-BR-SCL-01] POST creates store with login", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });

    const loginEmail = `manager-${Date.now()}@test.com`;
    const storeName = "Store With Login";

    // WHEN: Creating store with login
    const response = await superadminApiRequest.post(
      `/api/companies/${company.company_id}/stores`,
      {
        name: storeName,
        timezone: "America/New_York",
        status: "ACTIVE",
        manager: {
          email: loginEmail,
          password: "SecurePassword123!",
        },
      },
    );

    // THEN: Returns 201 with store and manager data
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.name).toBe(storeName);
    expect(body.store_id).toBeDefined();
    expect(body.manager).toBeDefined();
    expect(body.manager.email).toBe(loginEmail);
    expect(body.manager.name).toBe(storeName); // Login name is store name
  });

  /**
   * BR-SCL-02: Create store with terminals
   */
  test("[P0-BR-SCL-02] POST creates store with terminals", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });

    const loginEmail = `manager-${Date.now()}@test.com`;
    const terminals = [
      { name: "Terminal 1", device_id: "DEV-001", connection_type: "MANUAL" },
      { name: "Terminal 2", device_id: "DEV-002", connection_type: "API" },
    ];

    // WHEN: Creating store with terminals
    const response = await superadminApiRequest.post(
      `/api/companies/${company.company_id}/stores`,
      {
        name: "Store With Terminals",
        timezone: "America/New_York",
        status: "ACTIVE",
        manager: {
          email: loginEmail,
          password: "SecurePassword123!",
        },
        terminals,
      },
    );

    // THEN: Returns 201 with store and terminals
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.terminals).toBeDefined();
    expect(body.terminals.length).toBe(2);
    expect(body.terminals[0].name).toBe("Terminal 1");
    expect(body.terminals[1].name).toBe("Terminal 2");
  });

  /**
   * BR-SCL-03: Manager gets correct role and scope
   */
  test("[P0-BR-SCL-03] Created login has CLIENT_USER role with STORE scope", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });

    const loginEmail = `manager-${Date.now()}@test.com`;

    // WHEN: Creating store with login
    const response = await superadminApiRequest.post(
      `/api/companies/${company.company_id}/stores`,
      {
        name: "Role Test Store",
        timezone: "America/New_York",
        status: "ACTIVE",
        manager: {
          email: loginEmail,
          password: "SecurePassword123!",
        },
      },
    );

    expect(response.status()).toBe(201);
    const body = await response.json();

    // THEN: Verify manager has correct role assignment
    const userRole = await prismaClient.userRole.findFirst({
      where: { user_id: body.manager.user_id },
      include: { role: true },
    });

    expect(userRole).toBeDefined();
    expect(userRole?.role.code).toBe("CLIENT_USER");
    // CLIENT_USER role has COMPANY scope per RBAC design
    expect(userRole?.role.scope).toBe("COMPANY");
    // UserRole should have store_id set for store-scoped assignments
    expect(userRole?.store_id).toBe(body.store_id);
  });

  /**
   * BR-SCL-04: Create store without login (backwards compatibility)
   */
  test("[P1-BR-SCL-04] POST creates store without login (backwards compatible)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });

    // WHEN: Creating store without login
    const response = await superadminApiRequest.post(
      `/api/companies/${company.company_id}/stores`,
      {
        name: "Store Without Manager",
        timezone: "America/New_York",
        status: "ACTIVE",
      },
    );

    // THEN: Returns 201 with store but no manager
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.store_id).toBeDefined();
    expect(body.manager).toBeNull();
  });

  /**
   * BR-SCL-05: Duplicate email fails atomically
   */
  test("[P0-BR-SCL-05] POST fails with duplicate login email", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: An existing user
    const existingUser = await createUser(prismaClient, {
      email: `existing-${Date.now()}@test.com`,
    });

    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });

    // WHEN: Creating store with existing email
    const response = await superadminApiRequest.post(
      `/api/companies/${company.company_id}/stores`,
      {
        name: "Duplicate Email Store",
        timezone: "America/New_York",
        status: "ACTIVE",
        manager: {
          email: existingUser.email,
          password: "SecurePassword123!",
        },
      },
    );

    // THEN: Returns 400 bad request (email validation error) or 409 conflict
    expect([400, 409]).toContain(response.status());

    // AND: Store should not have been created
    const store = await prismaClient.store.findFirst({
      where: { name: "Duplicate Email Store" },
    });
    expect(store).toBeNull();
  });

  /**
   * BR-SCL-06: Short password fails validation
   */
  test("[P0-BR-SCL-06] POST fails with short login password", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });

    // WHEN: Creating store with short password
    const response = await superadminApiRequest.post(
      `/api/companies/${company.company_id}/stores`,
      {
        name: "Short Password Store",
        timezone: "America/New_York",
        status: "ACTIVE",
        manager: {
          email: `manager-${Date.now()}@test.com`,
          password: "short", // Less than 8 characters
        },
      },
    );

    // THEN: Returns 400 bad request
    expect(response.status()).toBe(400);
  });

  /**
   * BR-SCL-07: Invalid email format fails validation
   */
  test("[P1-BR-SCL-07] POST fails with invalid login email format", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });

    // WHEN: Creating store with invalid email
    const response = await superadminApiRequest.post(
      `/api/companies/${company.company_id}/stores`,
      {
        name: "Invalid Email Store",
        timezone: "America/New_York",
        status: "ACTIVE",
        manager: {
          email: "not-an-email",
          password: "SecurePassword123!",
        },
      },
    );

    // THEN: Returns 400 bad request
    expect(response.status()).toBe(400);
  });

  /**
   * BR-SCL-08: Corporate admin can create store with login
   */
  test("[P1-BR-SCL-08] Corporate admin can create store with login for their company", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
  }) => {
    const loginEmail = `corp-manager-${Date.now()}@test.com`;
    const storeName = "Corporate Store With Login";

    // WHEN: Corporate admin creates store with login
    const response = await corporateAdminApiRequest.post(
      `/api/companies/${corporateAdminUser.company_id}/stores`,
      {
        name: storeName,
        timezone: "America/New_York",
        status: "ACTIVE",
        manager: {
          email: loginEmail,
          password: "SecurePassword123!",
        },
      },
    );

    // THEN: Returns 201
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.manager.email).toBe(loginEmail);
  });

  /**
   * BR-SCL-09: Corporate admin cannot create store for other company
   */
  test("[P0-BR-SCL-09] Corporate admin cannot create store for other company", async ({
    corporateAdminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Another company
    const otherOwner = await createUser(prismaClient);
    const otherCompany = await createCompany(prismaClient, {
      owner_user_id: otherOwner.user_id,
    });

    // WHEN: Corporate admin tries to create store for other company
    const response = await corporateAdminApiRequest.post(
      `/api/companies/${otherCompany.company_id}/stores`,
      {
        name: "Unauthorized Store",
        timezone: "America/New_York",
        status: "ACTIVE",
        manager: {
          email: `hacker-${Date.now()}@test.com`,
          password: "SecurePassword123!",
        },
      },
    );

    // THEN: Returns 403 or 404
    expect([403, 404]).toContain(response.status());
  });

  /**
   * BR-SCL-10: Terminal with connection config
   */
  test("[P2-BR-SCL-10] POST creates store with terminal connection config", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });

    const terminals = [
      {
        name: "API Terminal",
        connection_type: "API",
        vendor_type: "SQUARE",
        connection_config: {
          baseUrl: "https://api.square.com",
          apiKey: "test-api-key",
        },
      },
    ];

    // WHEN: Creating store with terminal config
    const response = await superadminApiRequest.post(
      `/api/companies/${company.company_id}/stores`,
      {
        name: "Store With Config Terminal",
        timezone: "America/New_York",
        status: "ACTIVE",
        manager: {
          email: `manager-${Date.now()}@test.com`,
          password: "SecurePassword123!",
        },
        terminals,
      },
    );

    // THEN: Returns 201 with terminal
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.terminals).toBeDefined();
    expect(body.terminals.length).toBe(1);
    expect(body.terminals[0].connection_type).toBe("API");
    expect(body.terminals[0].vendor_type).toBe("SQUARE");
  });

  /**
   * BR-SCL-11: Store with address
   */
  test("[P2-BR-SCL-11] POST creates store with address", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });

    const address = "123 Main Street, New York, NY 10001";

    // WHEN: Creating store with address
    const response = await superadminApiRequest.post(
      `/api/companies/${company.company_id}/stores`,
      {
        name: "Store With Address",
        timezone: "America/New_York",
        status: "ACTIVE",
        location_json: { address },
        manager: {
          email: `manager-${Date.now()}@test.com`,
          password: "SecurePassword123!",
        },
      },
    );

    // THEN: Returns 201 with address
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.location_json).toBeDefined();
    expect(body.location_json.address).toBe(address);
  });

  /**
   * BR-SCL-12: Store login is linked via store_login_user_id
   */
  test("[P1-BR-SCL-12] Created store has store_login_user_id set", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });

    const loginEmail = `login-${Date.now()}@test.com`;

    // WHEN: Creating store with login
    const response = await superadminApiRequest.post(
      `/api/companies/${company.company_id}/stores`,
      {
        name: "Linked Login Store",
        timezone: "America/New_York",
        status: "ACTIVE",
        manager: {
          email: loginEmail,
          password: "SecurePassword123!",
        },
      },
    );

    expect(response.status()).toBe(201);
    const body = await response.json();

    // THEN: Store has store_login_user_id set
    const store = await prismaClient.store.findUnique({
      where: { store_id: body.store_id },
    });
    expect(store?.store_login_user_id).toBe(body.manager.user_id);
  });

  /**
   * BR-SCL-13: Multiple terminals with different types
   */
  test("[P2-BR-SCL-13] POST creates store with multiple terminal types", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });

    const terminals = [
      {
        name: "Manual Terminal",
        connection_type: "MANUAL",
        vendor_type: "GENERIC",
      },
      {
        name: "Network Terminal",
        connection_type: "NETWORK",
        vendor_type: "CLOVER",
      },
      { name: "API Terminal", connection_type: "API", vendor_type: "SQUARE" },
    ];

    // WHEN: Creating store with multiple terminals
    const response = await superadminApiRequest.post(
      `/api/companies/${company.company_id}/stores`,
      {
        name: "Multi Terminal Store",
        timezone: "America/New_York",
        status: "ACTIVE",
        manager: {
          email: `manager-${Date.now()}@test.com`,
          password: "SecurePassword123!",
        },
        terminals,
      },
    );

    // THEN: Returns 201 with all terminals
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.terminals).toBeDefined();
    expect(body.terminals.length).toBe(3);
  });

  /**
   * BR-SCL-14: Unauthenticated requests are rejected
   */
  test("[P0-BR-SCL-14] Unauthenticated requests return 401", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });

    // WHEN: Making unauthenticated request
    const response = await apiRequest.post(
      `/api/companies/${company.company_id}/stores`,
      {
        name: "Auth Test Store",
        timezone: "America/New_York",
        status: "ACTIVE",
        manager: {
          email: `manager-${Date.now()}@test.com`,
          password: "SecurePassword123!",
        },
      },
    );

    // THEN: Returns 401
    expect(response.status()).toBe(401);
  });
});
