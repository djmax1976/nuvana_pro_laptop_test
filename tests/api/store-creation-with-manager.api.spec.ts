import { test, expect } from "../support/fixtures/rbac.fixture";
import { createCompany, createUser } from "../support/helpers";

/**
 * Store Creation with Login and Terminals API Tests
 *
 * TEST FILE: tests/api/store-creation-with-manager.api.spec.ts
 * FEATURE: Extended Store Creation
 * CREATED: 2025-12-05
 * UPDATED: 2025-12-16
 *
 * BUSINESS RULES TESTED:
 * - BR-SCL-01: Store can be created with optional login credential
 * - BR-SCL-02: Store can be created with optional terminals
 * - BR-SCL-03: Store creation with login creates CLIENT_USER with STORE scope
 * - BR-SCL-04: All operations are atomic (store, login, terminals created together)
 * - BR-SCL-05: Validation errors roll back all changes
 * - BR-SCL-06: Login email must be unique
 * - BR-SCL-07: Invalid email format validation
 * - BR-SCL-08: Corporate admin can create stores for their company
 * - BR-SCL-09: Corporate admin cannot access other companies
 * - BR-SCL-10: Terminal connection config support
 * - BR-SCL-11: Store with address/location
 * - BR-SCL-12: Store login linked via store_login_user_id
 * - BR-SCL-13: Multiple terminals with different types
 * - BR-SCL-14: Authentication required
 * - BR-SCL-15: Password complexity validation
 * - BR-SCL-16: Manager user_id returned in response
 * - BR-SCL-17: Terminals array is empty when not provided
 * - BR-SCL-18: Duplicate device_id validation
 *
 * PASSWORD REQUIREMENTS (per backend implementation):
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character (@$!%*?&)
 *
 * ENDPOINTS TESTED:
 * - POST /api/companies/:companyId/stores (extended with login and terminals)
 */

test.describe("Store Creation with Login and Terminals", () => {
  /**
   * BR-SCL-01: Create store with login
   * Verifies that a store can be created with a manager/login credential
   * and the response includes the expected manager fields.
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
    const storeName = "Test Store With Login";

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

    // Verify store fields
    expect(body.store_id).toBeDefined();
    expect(body.name).toBe(storeName);
    expect(body.company_id).toBe(company.company_id);
    expect(body.timezone).toBe("America/New_York");
    expect(body.status).toBe("ACTIVE");

    // Verify manager fields (per backend implementation)
    expect(body.manager).toBeDefined();
    expect(body.manager.user_id).toBeDefined();
    expect(body.manager.email).toBe(loginEmail.toLowerCase()); // Email is lowercased
    expect(body.manager.name).toBe(storeName); // Manager name is store name

    // Verify terminals array exists (empty when not provided)
    expect(body.terminals).toBeDefined();
    expect(Array.isArray(body.terminals)).toBe(true);
  });

  /**
   * BR-SCL-02: Create store with terminals
   * Verifies that a store can be created with multiple terminals
   * and the terminal response includes all expected fields.
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

    const uniqueId = Date.now();
    const loginEmail = `manager-${uniqueId}@test.com`;
    const terminals = [
      {
        name: "Terminal 1",
        device_id: `DEV-${uniqueId}-001`,
        connection_type: "MANUAL",
      },
      {
        name: "Terminal 2",
        device_id: `DEV-${uniqueId}-002`,
        connection_type: "API",
      },
    ];

    // WHEN: Creating store with terminals
    const response = await superadminApiRequest.post(
      `/api/companies/${company.company_id}/stores`,
      {
        name: "Test Store With Terminals",
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

    // Verify terminals array
    expect(body.terminals).toBeDefined();
    expect(Array.isArray(body.terminals)).toBe(true);
    expect(body.terminals.length).toBe(2);

    // Verify terminal response fields (per backend implementation)
    expect(body.terminals[0].pos_terminal_id).toBeDefined();
    expect(body.terminals[0].name).toBe("Terminal 1");
    expect(body.terminals[0].device_id).toBe(`DEV-${uniqueId}-001`);
    expect(body.terminals[0].connection_type).toBe("MANUAL");
    expect(body.terminals[0].pos_type).toBe("MANUAL_ENTRY"); // Default value

    expect(body.terminals[1].pos_terminal_id).toBeDefined();
    expect(body.terminals[1].name).toBe("Terminal 2");
    expect(body.terminals[1].device_id).toBe(`DEV-${uniqueId}-002`);
    expect(body.terminals[1].connection_type).toBe("API");
  });

  /**
   * BR-SCL-03: Manager gets correct role and scope
   * Verifies that the created manager user is assigned the CLIENT_USER role
   * with STORE scope and the correct store_id in the user_role record.
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
        name: "Test Role Store",
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
    // CLIENT_USER role has STORE scope per RBAC design (store login credential)
    expect(userRole?.role.scope).toBe("STORE");
    // UserRole should have store_id set for store-scoped assignments
    expect(userRole?.store_id).toBe(body.store_id);
    // UserRole should have company_id set
    expect(userRole?.company_id).toBe(company.company_id);

    // Verify user record has is_client_user flag set
    const user = await prismaClient.user.findUnique({
      where: { user_id: body.manager.user_id },
    });
    expect(user?.is_client_user).toBe(true);
    expect(user?.status).toBe("ACTIVE");
  });

  /**
   * BR-SCL-04: Create store without login (backwards compatibility)
   * Verifies that stores can still be created without manager credentials,
   * maintaining backwards compatibility with the original API behavior.
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
        name: "Test Store Without Manager",
        timezone: "America/New_York",
        status: "ACTIVE",
      },
    );

    // THEN: Returns 201 with store but no manager
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.store_id).toBeDefined();
    expect(body.manager).toBeNull();
    // Terminals should be an empty array when not provided
    expect(body.terminals).toEqual([]);

    // Verify store_login_user_id is null in database
    const store = await prismaClient.store.findUnique({
      where: { store_id: body.store_id },
    });
    expect(store?.store_login_user_id).toBeNull();
  });

  /**
   * BR-SCL-05: Duplicate email fails atomically
   * Verifies that attempting to create a store with an email that already exists
   * fails validation and rolls back all changes (no store created).
   */
  test("[P0-BR-SCL-05] POST fails with duplicate login email", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: An existing user with known email
    const existingUser = await createUser(prismaClient, {
      email: `existing-${Date.now()}@test.com`,
    });

    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });

    const storeName = `Test Duplicate Email Store ${Date.now()}`;

    // WHEN: Creating store with existing email
    const response = await superadminApiRequest.post(
      `/api/companies/${company.company_id}/stores`,
      {
        name: storeName,
        timezone: "America/New_York",
        status: "ACTIVE",
        manager: {
          email: existingUser.email,
          password: "SecurePassword123!",
        },
      },
    );

    // THEN: Returns 400 bad request (email validation error)
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("email");

    // AND: Store should not have been created (atomic rollback)
    const store = await prismaClient.store.findFirst({
      where: { name: storeName },
    });
    expect(store).toBeNull();
  });

  /**
   * BR-SCL-06: Short password fails validation
   * Verifies that passwords less than 8 characters are rejected.
   * Note: The API validates both length AND complexity requirements.
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

    // WHEN: Creating store with short password (less than 8 characters)
    const response = await superadminApiRequest.post(
      `/api/companies/${company.company_id}/stores`,
      {
        name: "Test Short Password Store",
        timezone: "America/New_York",
        status: "ACTIVE",
        manager: {
          email: `manager-${Date.now()}@test.com`,
          password: "short", // Less than 8 characters
        },
      },
    );

    // THEN: Returns 400 bad request with validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
  });

  /**
   * BR-SCL-15: Password complexity validation
   * Verifies that passwords meeting length but not complexity requirements are rejected.
   * Password must have: uppercase, lowercase, number, and special character (@$!%*?&).
   */
  test("[P0-BR-SCL-15] POST fails with password missing complexity requirements", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });

    // WHEN: Creating store with password that meets length but not complexity
    const response = await superadminApiRequest.post(
      `/api/companies/${company.company_id}/stores`,
      {
        name: "Test Weak Password Store",
        timezone: "America/New_York",
        status: "ACTIVE",
        manager: {
          email: `manager-${Date.now()}@test.com`,
          password: "onlylowercase", // 13 chars but no uppercase, number, or special char
        },
      },
    );

    // THEN: Returns 400 bad request with specific password complexity error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    // Verify the error message mentions password requirements
    expect(body.error.message).toContain("password");
    expect(body.error.message).toContain("uppercase");
  });

  /**
   * BR-SCL-07: Invalid email format fails validation
   * Verifies that email addresses not matching the expected format are rejected.
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

    // WHEN: Creating store with invalid email format
    const response = await superadminApiRequest.post(
      `/api/companies/${company.company_id}/stores`,
      {
        name: "Test Invalid Email Store",
        timezone: "America/New_York",
        status: "ACTIVE",
        manager: {
          email: "not-an-email",
          password: "SecurePassword123!",
        },
      },
    );

    // THEN: Returns 400 bad request with validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("email");
  });

  /**
   * BR-SCL-08: Corporate admin can create store with login
   * Verifies that corporate admins can create stores for their own company.
   */
  test("[P1-BR-SCL-08] Corporate admin can create store with login for their company", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
  }) => {
    const loginEmail = `corp-manager-${Date.now()}@test.com`;
    const storeName = "Test Corporate Store With Login";

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

    // THEN: Returns 201 with store and manager
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.store_id).toBeDefined();
    expect(body.manager).toBeDefined();
    expect(body.manager.email).toBe(loginEmail.toLowerCase());
    expect(body.company_id).toBe(corporateAdminUser.company_id);
  });

  /**
   * BR-SCL-09: Corporate admin cannot create store for other company
   * Verifies that company isolation is enforced - corporate admins cannot
   * create stores for companies they don't belong to.
   */
  test("[P0-BR-SCL-09] Corporate admin cannot create store for other company", async ({
    corporateAdminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Another company that the corporate admin doesn't belong to
    const otherOwner = await createUser(prismaClient);
    const otherCompany = await createCompany(prismaClient, {
      owner_user_id: otherOwner.user_id,
    });

    // WHEN: Corporate admin tries to create store for other company
    const response = await corporateAdminApiRequest.post(
      `/api/companies/${otherCompany.company_id}/stores`,
      {
        name: "Test Unauthorized Store",
        timezone: "America/New_York",
        status: "ACTIVE",
        manager: {
          email: `hacker-${Date.now()}@test.com`,
          password: "SecurePassword123!",
        },
      },
    );

    // THEN: Returns 403 Forbidden (company isolation enforced)
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
  });

  /**
   * BR-SCL-10: Terminal with connection config
   * Verifies that terminals can be created with vendor-specific connection configurations.
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
        pos_type: "SQUARE_REST",
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
        name: "Test Store With Config Terminal",
        timezone: "America/New_York",
        status: "ACTIVE",
        manager: {
          email: `manager-${Date.now()}@test.com`,
          password: "SecurePassword123!",
        },
        terminals,
      },
    );

    // THEN: Returns 201 with terminal including correct config
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.terminals).toBeDefined();
    expect(body.terminals.length).toBe(1);
    expect(body.terminals[0].pos_terminal_id).toBeDefined();
    expect(body.terminals[0].connection_type).toBe("API");
    expect(body.terminals[0].pos_type).toBe("SQUARE_REST");

    // Verify terminal was persisted in database with config
    const terminal = await prismaClient.pOSTerminal.findUnique({
      where: { pos_terminal_id: body.terminals[0].pos_terminal_id },
    });
    expect(terminal).toBeDefined();
    expect(terminal?.connection_type).toBe("API");
    expect(terminal?.pos_type).toBe("SQUARE_REST");
    expect(terminal?.connection_config).toMatchObject({
      baseUrl: "https://api.square.com",
      apiKey: "test-api-key",
    });
  });

  /**
   * BR-SCL-11: Store with address
   * Verifies that stores can be created with location_json containing address data.
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
        name: "Test Store With Address",
        timezone: "America/New_York",
        status: "ACTIVE",
        location_json: { address },
        manager: {
          email: `manager-${Date.now()}@test.com`,
          password: "SecurePassword123!",
        },
      },
    );

    // THEN: Returns 201 with address in location_json
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.location_json).toBeDefined();
    expect(body.location_json.address).toBe(address);

    // Verify address was persisted in database
    const store = await prismaClient.store.findUnique({
      where: { store_id: body.store_id },
    });
    expect(store?.location_json).toBeDefined();
    expect((store?.location_json as any)?.address).toBe(address);
  });

  /**
   * BR-SCL-12: Store login is linked via store_login_user_id
   * Verifies that the created manager user is properly linked to the store
   * via the store_login_user_id foreign key.
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
        name: "Test Linked Login Store",
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

    // THEN: Store has store_login_user_id set correctly
    const store = await prismaClient.store.findUnique({
      where: { store_id: body.store_id },
    });
    expect(store?.store_login_user_id).toBe(body.manager.user_id);

    // Verify the linked user exists and matches response
    const linkedUser = await prismaClient.user.findUnique({
      where: { user_id: store?.store_login_user_id ?? "" },
    });
    expect(linkedUser).toBeDefined();
    expect(linkedUser?.email).toBe(loginEmail.toLowerCase());
  });

  /**
   * BR-SCL-13: Multiple terminals with different types
   * Verifies that stores can be created with multiple terminals
   * using different connection types and vendor types.
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
        pos_type: "MANUAL_ENTRY",
      },
      {
        name: "Network Terminal",
        connection_type: "NETWORK",
        pos_type: "CLOVER_REST",
      },
      { name: "API Terminal", connection_type: "API", pos_type: "SQUARE_REST" },
    ];

    // WHEN: Creating store with multiple terminals
    const response = await superadminApiRequest.post(
      `/api/companies/${company.company_id}/stores`,
      {
        name: "Test Multi Terminal Store",
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

    // Verify each terminal type was created correctly
    const terminalTypes = body.terminals.map(
      (t: { connection_type: string }) => t.connection_type,
    );
    expect(terminalTypes).toContain("MANUAL");
    expect(terminalTypes).toContain("NETWORK");
    expect(terminalTypes).toContain("API");

    // Verify terminals were persisted in database
    const dbTerminals = await prismaClient.pOSTerminal.findMany({
      where: { store_id: body.store_id },
    });
    expect(dbTerminals.length).toBe(3);
  });

  /**
   * BR-SCL-14: Unauthenticated requests are rejected
   * Verifies that the endpoint requires authentication.
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

    // WHEN: Making unauthenticated request (no auth cookie)
    const response = await apiRequest.post(
      `/api/companies/${company.company_id}/stores`,
      {
        name: "Test Auth Test Store",
        timezone: "America/New_York",
        status: "ACTIVE",
        manager: {
          email: `manager-${Date.now()}@test.com`,
          password: "SecurePassword123!",
        },
      },
    );

    // THEN: Returns 401 Unauthorized
    expect(response.status()).toBe(401);
  });

  /**
   * BR-SCL-16: Verify manager user_id is returned in response
   * Verifies that the API response includes the manager's user_id for client reference.
   */
  test("[P1-BR-SCL-16] POST response includes manager user_id", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });

    const loginEmail = `userid-test-${Date.now()}@test.com`;

    // WHEN: Creating store with login
    const response = await superadminApiRequest.post(
      `/api/companies/${company.company_id}/stores`,
      {
        name: "Test User ID Response Store",
        timezone: "America/New_York",
        status: "ACTIVE",
        manager: {
          email: loginEmail,
          password: "SecurePassword123!",
        },
      },
    );

    // THEN: Response includes manager with user_id
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.manager).toBeDefined();
    expect(body.manager.user_id).toBeDefined();
    expect(typeof body.manager.user_id).toBe("string");
    expect(body.manager.user_id.length).toBeGreaterThan(0);

    // Verify user_id is a valid UUID that exists in database
    const user = await prismaClient.user.findUnique({
      where: { user_id: body.manager.user_id },
    });
    expect(user).toBeDefined();
  });

  /**
   * BR-SCL-17: Terminals array is empty when not provided
   * Verifies that when no terminals are provided, the response includes an empty array.
   */
  test("[P2-BR-SCL-17] POST without terminals returns empty terminals array", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });

    // WHEN: Creating store without terminals
    const response = await superadminApiRequest.post(
      `/api/companies/${company.company_id}/stores`,
      {
        name: "Test No Terminals Store",
        timezone: "America/New_York",
        status: "ACTIVE",
        manager: {
          email: `manager-${Date.now()}@test.com`,
          password: "SecurePassword123!",
        },
      },
    );

    // THEN: Returns 201 with empty terminals array
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.terminals).toBeDefined();
    expect(Array.isArray(body.terminals)).toBe(true);
    expect(body.terminals.length).toBe(0);
  });

  /**
   * BR-SCL-18: Duplicate device_id within same request fails validation
   * Verifies that submitting duplicate device_ids in the same request is rejected.
   */
  test("[P1-BR-SCL-18] POST fails with duplicate device_id in same request", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });

    const duplicateDeviceId = `DUP-${Date.now()}`;
    const terminals = [
      {
        name: "Terminal 1",
        device_id: duplicateDeviceId,
        connection_type: "MANUAL",
      },
      {
        name: "Terminal 2",
        device_id: duplicateDeviceId,
        connection_type: "MANUAL",
      }, // Duplicate!
    ];

    // WHEN: Creating store with duplicate device_ids
    const response = await superadminApiRequest.post(
      `/api/companies/${company.company_id}/stores`,
      {
        name: "Test Duplicate Device Store",
        timezone: "America/New_York",
        status: "ACTIVE",
        manager: {
          email: `manager-${Date.now()}@test.com`,
          password: "SecurePassword123!",
        },
        terminals,
      },
    );

    // THEN: Returns 400 bad request
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.error.message).toContain("device_id");

    // AND: Store should not have been created (atomic rollback)
    const store = await prismaClient.store.findFirst({
      where: { name: "Test Duplicate Device Store" },
    });
    expect(store).toBeNull();
  });

  /**
   * BR-SCL-19: Email is normalized to lowercase
   * Verifies that manager email is lowercased and trimmed before storage.
   */
  test("[P2-BR-SCL-19] POST normalizes manager email to lowercase", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });

    const mixedCaseEmail = `Manager-${Date.now()}@Test.COM`;

    // WHEN: Creating store with mixed case email
    const response = await superadminApiRequest.post(
      `/api/companies/${company.company_id}/stores`,
      {
        name: "Test Email Normalization Store",
        timezone: "America/New_York",
        status: "ACTIVE",
        manager: {
          email: mixedCaseEmail,
          password: "SecurePassword123!",
        },
      },
    );

    // THEN: Returns 201 with lowercased email
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.manager.email).toBe(mixedCaseEmail.toLowerCase());

    // Verify in database
    const user = await prismaClient.user.findUnique({
      where: { user_id: body.manager.user_id },
    });
    expect(user?.email).toBe(mixedCaseEmail.toLowerCase());
  });

  /**
   * BR-SCL-20: Default timezone is America/New_York
   * Verifies that timezone defaults to America/New_York when not provided.
   */
  test("[P2-BR-SCL-20] POST uses default timezone when not provided", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });

    // WHEN: Creating store without timezone
    const response = await superadminApiRequest.post(
      `/api/companies/${company.company_id}/stores`,
      {
        name: "Test Default Timezone Store",
        status: "ACTIVE",
        manager: {
          email: `manager-${Date.now()}@test.com`,
          password: "SecurePassword123!",
        },
      },
    );

    // THEN: Returns 201 with default timezone
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.timezone).toBe("America/New_York");
  });
});
