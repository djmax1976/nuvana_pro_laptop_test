/**
 * Client Authentication and Dashboard API Tests
 *
 * Story 2.9: Client Dashboard Foundation and Authentication
 *
 * Tests for:
 * - POST /api/auth/client-login - Client email/password authentication
 * - GET /api/client/dashboard - Client dashboard data with RLS
 * - Route protection for client users
 * - Audit logging for client login
 *
 * Priority: P0 (Critical - Client access control)
 *
 * Note: These tests are in RED phase - they will fail until implementation is complete.
 * Tests verify acceptance criteria from Story 2.9.
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createClientUser,
  createClientUserWithPassword,
  createClientLoginRequest,
  createNonClientUser,
} from "../support/factories/client-auth.factory";
import {
  createUser as createUserFactory,
  createCompany as createCompanyFactory,
  createStore as createStoreFactory,
} from "../support/factories";
import {
  createUser,
  createCompany,
  createStore,
} from "../support/helpers/database-helpers";
import { createJWTAccessToken } from "../support/factories";
import bcrypt from "bcrypt";

test.describe("2.9-API: Client Authentication - POST /api/auth/client-login", () => {
  test("2.9-API-001: [P0] should authenticate client user with valid credentials (AC #1)", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: A client user exists with is_client_user = true and valid password
    const password = "ClientPassword123!";
    const passwordHash = await bcrypt.hash(password, 10);

    const clientUserData = createClientUser({
      password_hash: passwordHash,
      is_client_user: true,
    });

    // Create client user with is_client_user = true
    const user = await prismaClient.user.create({
      data: {
        user_id: clientUserData.user_id,
        email: clientUserData.email,
        name: clientUserData.name,
        status: clientUserData.status,
        password_hash: passwordHash,
        public_id: clientUserData.public_id,
        is_client_user: true,
      },
    });

    try {
      // WHEN: Client user logs in via /api/auth/client-login endpoint
      const response = await apiRequest.post("/api/auth/client-login", {
        email: user.email,
        password: password,
      });

      // THEN: Login is successful with 200 status
      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.message).toBe("Login successful");
      expect(body.user).toBeDefined();
      expect(body.user.id).toBe(user.user_id);
      expect(body.user.email).toBe(user.email);

      // AND: JWT token is set in httpOnly cookie
      const cookies = response.headers()["set-cookie"];
      expect(cookies).toBeDefined();
      expect(cookies).toContain("access_token=");
      expect(cookies).toContain("HttpOnly");
    } finally {
      // Cleanup
      await prismaClient.user.delete({ where: { user_id: user.user_id } });
    }
  });

  test("2.9-API-002: [P0] should return 401 for invalid password (AC #1)", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: A client user exists with valid password
    const password = "ClientPassword123!";
    const passwordHash = await bcrypt.hash(password, 10);

    const clientUserData = createClientUser({ password_hash: passwordHash });
    const user = await prismaClient.user.create({
      data: {
        user_id: clientUserData.user_id,
        email: clientUserData.email,
        name: clientUserData.name,
        status: clientUserData.status,
        password_hash: passwordHash,
        public_id: clientUserData.public_id,
        is_client_user: true,
      },
    });

    try {
      // WHEN: Client user attempts login with wrong password
      const response = await apiRequest.post("/api/auth/client-login", {
        email: user.email,
        password: "WrongPassword123!",
      });

      // THEN: 401 Unauthorized is returned
      expect(response.status()).toBe(401);

      const body = await response.json();
      expect(body.error).toBe("Unauthorized");
      expect(body.message).toBe("Invalid email or password");
    } finally {
      await prismaClient.user.delete({ where: { user_id: user.user_id } });
    }
  });

  test("2.9-API-003: [P0] should reject non-client user attempting client login (AC #1)", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: A regular admin user (is_client_user = false) with valid password
    const password = "AdminPassword123!";
    const passwordHash = await bcrypt.hash(password, 10);

    const adminUserData = createNonClientUser({ password_hash: passwordHash });
    const user = await prismaClient.user.create({
      data: {
        user_id: adminUserData.user_id,
        email: adminUserData.email,
        name: adminUserData.name,
        status: adminUserData.status,
        password_hash: passwordHash,
        public_id: adminUserData.public_id,
        is_client_user: false, // Explicitly non-client user
      },
    });

    try {
      // WHEN: Non-client user attempts to login via /api/auth/client-login
      const response = await apiRequest.post("/api/auth/client-login", {
        email: user.email,
        password: password,
      });

      // THEN: 401 Unauthorized is returned with generic message
      // Note: Returns generic "Invalid email or password" to prevent account enumeration attacks
      // (revealing whether a user exists but isn't a client user would be a security issue)
      expect(response.status()).toBe(401);

      const body = await response.json();
      expect(body.error).toBe("Unauthorized");
      expect(body.message).toBe("Invalid email or password");
    } finally {
      await prismaClient.user.delete({ where: { user_id: user.user_id } });
    }
  });

  test("2.9-API-004: [P0] should return 401 for non-existent email (AC #1)", async ({
    apiRequest,
  }) => {
    // GIVEN: No user exists with the email
    const loginRequest = createClientLoginRequest({
      email: "nonexistent@example.com",
    });

    // WHEN: Attempting login with non-existent email
    const response = await apiRequest.post(
      "/api/auth/client-login",
      loginRequest,
    );

    // THEN: 401 Unauthorized is returned (generic message for security)
    expect(response.status()).toBe(401);

    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
    expect(body.message).toBe("Invalid email or password");
  });

  test("2.9-API-005: [P1] should log client login to AuditLog (AC #7)", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: A client user with valid credentials
    const password = "ClientPassword123!";
    const passwordHash = await bcrypt.hash(password, 10);

    const clientUserData = createClientUser({ password_hash: passwordHash });
    const user = await prismaClient.user.create({
      data: {
        user_id: clientUserData.user_id,
        email: clientUserData.email,
        name: clientUserData.name,
        status: clientUserData.status,
        password_hash: passwordHash,
        public_id: clientUserData.public_id,
        is_client_user: true,
      },
    });

    try {
      // WHEN: Client user successfully logs in
      const response = await apiRequest.post("/api/auth/client-login", {
        email: user.email,
        password: password,
      });

      expect(response.status()).toBe(200);

      // THEN: An audit log entry is created for the login
      const auditLog = await prismaClient.auditLog.findFirst({
        where: {
          user_id: user.user_id,
          action: "CLIENT_LOGIN",
          table_name: "auth",
        },
        orderBy: { timestamp: "desc" },
      });

      expect(auditLog).not.toBeNull();
      expect(auditLog?.action).toBe("CLIENT_LOGIN");
    } finally {
      // Cleanup audit logs first (if any)
      await prismaClient.auditLog.deleteMany({
        where: { user_id: user.user_id },
      });
      await prismaClient.user.delete({ where: { user_id: user.user_id } });
    }
  });

  test("2.9-API-006: [P1] should return 400 for missing email or password (AC #1)", async ({
    apiRequest,
  }) => {
    // GIVEN: Login request without email
    const responseMissingEmail = await apiRequest.post(
      "/api/auth/client-login",
      {
        password: "SomePassword123!",
      },
    );

    // THEN: 400 Bad Request is returned
    expect(responseMissingEmail.status()).toBe(400);
    const bodyMissingEmail = await responseMissingEmail.json();
    expect(bodyMissingEmail.error).toBe("Bad Request");

    // GIVEN: Login request without password
    const responseMissingPassword = await apiRequest.post(
      "/api/auth/client-login",
      {
        email: "test@example.com",
      },
    );

    // THEN: 400 Bad Request is returned
    expect(responseMissingPassword.status()).toBe(400);
    const bodyMissingPassword = await responseMissingPassword.json();
    expect(bodyMissingPassword.error).toBe("Bad Request");
  });

  test("2.9-API-007: [P2] should normalize email to lowercase (AC #1)", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: A client user with lowercase email
    const password = "ClientPassword123!";
    const passwordHash = await bcrypt.hash(password, 10);

    const clientUserData = createClientUser({
      email: "clientuser@example.com",
      password_hash: passwordHash,
    });
    const user = await prismaClient.user.create({
      data: {
        user_id: clientUserData.user_id,
        email: clientUserData.email,
        name: clientUserData.name,
        status: clientUserData.status,
        password_hash: passwordHash,
        public_id: clientUserData.public_id,
        is_client_user: true,
      },
    });

    try {
      // WHEN: Login with uppercase email
      const response = await apiRequest.post("/api/auth/client-login", {
        email: "CLIENTUSER@EXAMPLE.COM",
        password: password,
      });

      // THEN: Login succeeds (email normalized)
      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.user.email).toBe("clientuser@example.com");
    } finally {
      await prismaClient.user.delete({ where: { user_id: user.user_id } });
    }
  });
});

test.describe("2.9-API: Client Dashboard - GET /api/client/dashboard", () => {
  test("2.9-API-008: [P0] should return client's companies and stores only (AC #4, #5)", async ({
    request,
    prismaClient,
    backendUrl,
  }) => {
    // GIVEN: A client user who owns a company with stores
    // User-Ownership model: User -> (owner_user_id) -> Company -> Store
    const password = "ClientPassword123!";
    const passwordHash = await bcrypt.hash(password, 10);

    // Create client user who will own the company
    const clientUserData = createClientUser({
      password_hash: passwordHash,
      is_client_user: true,
    });
    const clientUser = await prismaClient.user.create({
      data: {
        user_id: clientUserData.user_id,
        email: clientUserData.email,
        name: clientUserData.name,
        status: clientUserData.status,
        password_hash: passwordHash,
        public_id: clientUserData.public_id,
        is_client_user: true,
      },
    });

    // Create company owned by the client user
    const companyData = createCompanyFactory({
      owner_user_id: clientUser.user_id,
    });
    const company = await prismaClient.company.create({ data: companyData });

    // Create store under company
    const storeData = createStoreFactory({ company_id: company.company_id });
    const store = await prismaClient.store.create({
      data: {
        ...storeData,
        location_json: storeData.location_json as any,
      },
    });

    // Create token for client user
    const token = createJWTAccessToken({
      user_id: clientUser.user_id,
      email: clientUser.email,
      roles: ["CLIENT_USER"],
      permissions: ["CLIENT_DASHBOARD_ACCESS"],
    });

    try {
      // WHEN: Client user requests dashboard data
      const response = await request.get(`${backendUrl}/api/client/dashboard`, {
        headers: {
          Cookie: `access_token=${token}`,
        },
      });

      // THEN: Response is successful
      expect(response.status()).toBe(200);

      const body = await response.json();

      // AND: Dashboard data includes user info
      expect(body.user).toBeDefined();
      expect(body.user.id).toBe(clientUser.user_id);
      expect(body.user.email).toBe(clientUser.email);

      // AND: Companies list is returned
      expect(body.companies).toBeDefined();
      expect(Array.isArray(body.companies)).toBe(true);
      expect(body.companies.length).toBe(1);
      expect(body.companies[0].company_id).toBe(company.company_id);

      // AND: Stores list is returned
      expect(body.stores).toBeDefined();
      expect(Array.isArray(body.stores)).toBe(true);
      expect(body.stores.length).toBe(1);
      expect(body.stores[0].store_id).toBe(store.store_id);

      // AND: Quick stats are returned
      expect(body.stats).toBeDefined();
      expect(body.stats.active_stores).toBeDefined();
      expect(body.stats.total_employees).toBeDefined();
      expect(body.stats.total_companies).toBe(1);
      expect(body.stats.total_stores).toBe(1);
    } finally {
      // Cleanup in proper order
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({
        where: { user_id: clientUser.user_id },
      });
    }
  });

  test("2.9-API-009: [P0] should NOT return other clients' data via owner isolation (AC #4)", async ({
    request,
    prismaClient,
    backendUrl,
  }) => {
    // GIVEN: Two client users, each owning separate companies
    // User-Ownership model: Each user only sees companies where owner_user_id matches
    const password = "ClientPassword123!";
    const passwordHash = await bcrypt.hash(password, 10);

    // Create first client user who owns Company One
    const clientUser1Data = createClientUser({
      password_hash: passwordHash,
      email: "client1@example.com",
      is_client_user: true,
    });
    const clientUser1 = await prismaClient.user.create({
      data: {
        user_id: clientUser1Data.user_id,
        email: clientUser1Data.email,
        name: clientUser1Data.name,
        status: clientUser1Data.status,
        password_hash: passwordHash,
        public_id: clientUser1Data.public_id,
        is_client_user: true,
      },
    });
    const company1 = await prismaClient.company.create({
      data: createCompanyFactory({
        owner_user_id: clientUser1.user_id,
        name: "Company One",
      }),
    });

    // Create second client user who owns Company Two
    const clientUser2Data = createClientUser({
      password_hash: passwordHash,
      email: "client2@example.com",
      is_client_user: true,
    });
    const clientUser2 = await prismaClient.user.create({
      data: {
        user_id: clientUser2Data.user_id,
        email: clientUser2Data.email,
        name: clientUser2Data.name,
        status: clientUser2Data.status,
        password_hash: passwordHash,
        public_id: clientUser2Data.public_id,
        is_client_user: true,
      },
    });
    const company2 = await prismaClient.company.create({
      data: createCompanyFactory({
        owner_user_id: clientUser2.user_id,
        name: "Company Two",
      }),
    });

    // Create token for client user 1
    const token = createJWTAccessToken({
      user_id: clientUser1.user_id,
      email: clientUser1.email,
      roles: ["CLIENT_USER"],
      permissions: ["CLIENT_DASHBOARD_ACCESS"],
    });

    try {
      // WHEN: Client 1 user requests dashboard data
      const response = await request.get(`${backendUrl}/api/client/dashboard`, {
        headers: {
          Cookie: `access_token=${token}`,
        },
      });

      // THEN: Response is successful
      expect(response.status()).toBe(200);

      const body = await response.json();

      // AND: Only Client 1's company is returned
      expect(body.companies).toBeDefined();
      expect(body.companies.length).toBe(1);
      expect(body.companies[0].name).toBe("Company One");

      // AND: Client 2's company is NOT returned (owner isolation)
      const companyNames = body.companies.map((c: any) => c.name);
      expect(companyNames).not.toContain("Company Two");
    } finally {
      // Cleanup in proper order
      await prismaClient.company.delete({
        where: { company_id: company1.company_id },
      });
      await prismaClient.company.delete({
        where: { company_id: company2.company_id },
      });
      await prismaClient.user.delete({
        where: { user_id: clientUser1.user_id },
      });
      await prismaClient.user.delete({
        where: { user_id: clientUser2.user_id },
      });
    }
  });

  test("2.9-API-010: [P0] should return 401 for unauthenticated request (AC #4)", async ({
    apiRequest,
  }) => {
    // GIVEN: No authentication token

    // WHEN: Requesting client dashboard without token
    const response = await apiRequest.get("/api/client/dashboard");

    // THEN: 401 Unauthorized is returned
    expect(response.status()).toBe(401);
  });
});

test.describe("2.9-API: Route Protection - Client cannot access admin routes", () => {
  test("2.9-API-011: [P1] should return 403 when client user accesses /api/admin/users (AC #6)", async ({
    request,
    prismaClient,
    backendUrl,
  }) => {
    // GIVEN: A client user with CLIENT_USER role (no ADMIN_SYSTEM_CONFIG permission)
    const password = "ClientPassword123!";
    const passwordHash = await bcrypt.hash(password, 10);

    const clientUserData = createClientUser({
      password_hash: passwordHash,
      is_client_user: true,
    });
    const clientUser = await prismaClient.user.create({
      data: {
        user_id: clientUserData.user_id,
        email: clientUserData.email,
        name: clientUserData.name,
        status: clientUserData.status,
        password_hash: passwordHash,
        public_id: clientUserData.public_id,
        is_client_user: true,
      },
    });

    // Create token for client user (with client-level permissions only, no admin permissions)
    const token = createJWTAccessToken({
      user_id: clientUser.user_id,
      email: clientUser.email,
      roles: ["CLIENT_USER"],
      permissions: ["CLIENT_DASHBOARD_ACCESS"],
    });

    try {
      // WHEN: Client user attempts to access admin users endpoint
      const response = await request.get(`${backendUrl}/api/admin/users`, {
        headers: {
          Cookie: `access_token=${token}`,
        },
      });

      // THEN: 403 Forbidden is returned (missing ADMIN_SYSTEM_CONFIG permission)
      expect(response.status()).toBe(403);

      const body = await response.json();
      expect(body.error).toBe("Forbidden");
    } finally {
      await prismaClient.user.delete({
        where: { user_id: clientUser.user_id },
      });
    }
  });
});

test.describe("2.9-API: User Creation with CLIENT_OWNER Role - POST /api/admin/users", () => {
  test("2.9-API-012: [P0] should create user with CLIENT_OWNER role and set is_client_user flag (AC #8)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: System Admin creates a user with CLIENT_OWNER role and company info
    // First get the CLIENT_OWNER role ID
    const clientOwnerRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_OWNER" },
    });

    if (!clientOwnerRole) {
      console.log("CLIENT_OWNER role not seeded yet, skipping test");
      return;
    }

    const userData = {
      name: "New Client Owner",
      email: "newclientowner@example.com",
      password: "SecurePassword123!",
      roles: [
        {
          role_id: clientOwnerRole.role_id,
          scope_type: "SYSTEM",
        },
      ],
      companyName: "Test Company",
      companyAddress: "123 Test St",
    };

    // WHEN: Creating a user with CLIENT_OWNER role
    const response = await superadminApiRequest.post(
      "/api/admin/users",
      userData,
    );

    // THEN: User is created successfully
    expect(response.status()).toBe(201);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("user_id");

    try {
      // AND: User has is_client_user = true
      const createdUser = await prismaClient.user.findUnique({
        where: { user_id: body.data.user_id },
      });
      expect(createdUser).not.toBeNull();
      expect(createdUser?.is_client_user).toBe(true);
      expect(createdUser?.password_hash).not.toBeNull();

      // AND: A company is created with this user as owner
      const ownedCompany = await prismaClient.company.findFirst({
        where: { owner_user_id: body.data.user_id },
      });
      expect(ownedCompany).not.toBeNull();
      expect(ownedCompany?.name).toBe("Test Company");
    } finally {
      // Cleanup in proper order
      await prismaClient.company.deleteMany({
        where: { owner_user_id: body.data.user_id },
      });
      await prismaClient.userRole.deleteMany({
        where: { user_id: body.data.user_id },
      });
      await prismaClient.user.delete({ where: { user_id: body.data.user_id } });
    }
  });

  test("2.9-API-013: [P1] should create user with CLIENT_USER role and set is_client_user flag (AC #8)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: System Admin creates a user with CLIENT_USER role
    const clientUserRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_USER" },
    });

    if (!clientUserRole) {
      console.log("CLIENT_USER role not seeded yet, skipping test");
      return;
    }

    // GIVEN: A company exists for the CLIENT_USER role assignment
    const companyOwner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: companyOwner.user_id,
    });

    const userData = {
      name: "New Client User",
      email: "newclientuser@example.com",
      password: "SecurePassword123!",
      roles: [
        {
          role_id: clientUserRole.role_id,
          scope_type: "COMPANY",
          company_id: company.company_id,
        },
      ],
    };

    // WHEN: Creating a user with CLIENT_USER role
    const response = await superadminApiRequest.post(
      "/api/admin/users",
      userData,
    );

    // THEN: User is created successfully
    expect(response.status()).toBe(201);

    const body = await response.json();
    expect(body.success).toBe(true);

    try {
      // AND: User has is_client_user = true
      const createdUser = await prismaClient.user.findUnique({
        where: { user_id: body.data.user_id },
      });
      expect(createdUser).not.toBeNull();
      expect(createdUser?.is_client_user).toBe(true);
    } finally {
      // Cleanup
      await prismaClient.userRole.deleteMany({
        where: { user_id: body.data.user_id },
      });
      await prismaClient.user.delete({ where: { user_id: body.data.user_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({
        where: { user_id: companyOwner.user_id },
      });
    }
  });
});

// ============================================================================
// SECURITY EDGE CASES - Industry Best Practices
// ============================================================================

test.describe("2.9-API: Security Edge Cases", () => {
  test("2.9-API-014: [P0] should reject INACTIVE client user login", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: A client user with INACTIVE status
    const password = "ClientPassword123!";
    const passwordHash = await bcrypt.hash(password, 10);

    const clientUserData = createClientUser({
      password_hash: passwordHash,
      status: "INACTIVE",
    });
    const user = await prismaClient.user.create({
      data: {
        user_id: clientUserData.user_id,
        email: clientUserData.email,
        name: clientUserData.name,
        status: "INACTIVE",
        password_hash: passwordHash,
        public_id: clientUserData.public_id,
        is_client_user: true,
      },
    });

    try {
      // WHEN: INACTIVE client user attempts login
      const response = await apiRequest.post("/api/auth/client-login", {
        email: user.email,
        password: password,
      });

      // THEN: 401 Unauthorized is returned (account not active)
      expect(response.status()).toBe(401);

      const body = await response.json();
      expect(body.error).toBe("Unauthorized");
    } finally {
      await prismaClient.user.delete({ where: { user_id: user.user_id } });
    }
  });

  test("2.9-API-015: [P0] should reject expired/invalid JWT token for client dashboard", async ({
    request,
    prismaClient,
    backendUrl,
  }) => {
    // GIVEN: An invalid/tampered JWT token
    const invalidToken =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiZmFrZSIsImV4cCI6MH0.invalid";

    // WHEN: Requesting dashboard with invalid token
    const response = await request.get(`${backendUrl}/api/client/dashboard`, {
      headers: {
        Cookie: `access_token=${invalidToken}`,
      },
    });

    // THEN: 401 Unauthorized is returned
    expect(response.status()).toBe(401);
  });

  test("2.9-API-016: [P1] should reject SUSPENDED client user login", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: A client user with SUSPENDED status
    const password = "ClientPassword123!";
    const passwordHash = await bcrypt.hash(password, 10);

    const clientUserData = createClientUser({ password_hash: passwordHash });
    const user = await prismaClient.user.create({
      data: {
        user_id: clientUserData.user_id,
        email: clientUserData.email,
        name: clientUserData.name,
        status: "SUSPENDED",
        password_hash: passwordHash,
        public_id: clientUserData.public_id,
        is_client_user: true,
      },
    });

    try {
      // WHEN: SUSPENDED client user attempts login
      const response = await apiRequest.post("/api/auth/client-login", {
        email: user.email,
        password: password,
      });

      // THEN: 401 Unauthorized is returned
      expect(response.status()).toBe(401);
    } finally {
      await prismaClient.user.delete({ where: { user_id: user.user_id } });
    }
  });
});

// ============================================================================
// ROUTE PROTECTION - Admin Routes Blocked for Client Users
// ============================================================================

test.describe("2.9-API: Route Protection - Client Users Cannot Access Admin Routes", () => {
  test("2.9-API-017: [P1] should return 403 when client user accesses /api/admin/system-config", async ({
    request,
    prismaClient,
    backendUrl,
  }) => {
    // GIVEN: A client user with CLIENT_USER role
    const password = "ClientPassword123!";
    const passwordHash = await bcrypt.hash(password, 10);

    const clientUserData = createClientUser({ password_hash: passwordHash });
    const clientUser = await prismaClient.user.create({
      data: {
        user_id: clientUserData.user_id,
        email: clientUserData.email,
        name: clientUserData.name,
        status: clientUserData.status,
        password_hash: passwordHash,
        public_id: clientUserData.public_id,
        is_client_user: true,
      },
    });

    const token = createJWTAccessToken({
      user_id: clientUser.user_id,
      email: clientUser.email,
      roles: ["CLIENT_USER"],
      permissions: ["CLIENT_DASHBOARD_ACCESS"],
    });

    try {
      // WHEN: Client user attempts to access admin system-config endpoint
      const response = await request.get(
        `${backendUrl}/api/admin/system-config`,
        {
          headers: {
            Cookie: `access_token=${token}`,
          },
        },
      );

      // THEN: 403 Forbidden is returned
      expect(response.status()).toBe(403);
    } finally {
      await prismaClient.user.delete({
        where: { user_id: clientUser.user_id },
      });
    }
  });

  test("2.9-API-018: [P1] should return 403 when client user attempts to access audit logs", async ({
    request,
    prismaClient,
    backendUrl,
  }) => {
    // GIVEN: A client user
    const password = "ClientPassword123!";
    const passwordHash = await bcrypt.hash(password, 10);

    const clientUserData = createClientUser({ password_hash: passwordHash });
    const clientUser = await prismaClient.user.create({
      data: {
        user_id: clientUserData.user_id,
        email: clientUserData.email,
        name: clientUserData.name,
        status: clientUserData.status,
        password_hash: passwordHash,
        public_id: clientUserData.public_id,
        is_client_user: true,
      },
    });

    const token = createJWTAccessToken({
      user_id: clientUser.user_id,
      email: clientUser.email,
      roles: ["CLIENT_USER"],
      permissions: ["CLIENT_DASHBOARD_ACCESS"],
    });

    try {
      // WHEN: Client user attempts to access audit logs
      const response = await request.get(`${backendUrl}/api/admin/audit-logs`, {
        headers: {
          Cookie: `access_token=${token}`,
        },
      });

      // THEN: 403 Forbidden is returned
      expect(response.status()).toBe(403);
    } finally {
      await prismaClient.user.delete({
        where: { user_id: clientUser.user_id },
      });
    }
  });
});

// ============================================================================
// CLIENT READ-ONLY PERMISSIONS - MVP Restrictions
// ============================================================================

test.describe("2.9-API: Client Read-Only Permissions (MVP)", () => {
  test("2.9-API-019: [P0] client user cannot modify their owned company details", async ({
    request,
    prismaClient,
    backendUrl,
  }) => {
    // GIVEN: A client user who owns a company
    const password = "ClientPassword123!";
    const passwordHash = await bcrypt.hash(password, 10);

    const clientUserData = createClientUser({ password_hash: passwordHash });
    const clientUser = await prismaClient.user.create({
      data: {
        user_id: clientUserData.user_id,
        email: clientUserData.email,
        name: clientUserData.name,
        status: clientUserData.status,
        password_hash: passwordHash,
        public_id: clientUserData.public_id,
        is_client_user: true,
      },
    });

    const companyData = createCompanyFactory({
      owner_user_id: clientUser.user_id,
    });
    const company = await prismaClient.company.create({ data: companyData });

    const token = createJWTAccessToken({
      user_id: clientUser.user_id,
      email: clientUser.email,
      roles: ["CLIENT_OWNER"],
      permissions: ["CLIENT_DASHBOARD_ACCESS"],
    });

    try {
      // WHEN: Client user attempts to update their company name
      const response = await request.put(
        `${backendUrl}/api/companies/${company.company_id}`,
        {
          headers: {
            Cookie: `access_token=${token}`,
            "Content-Type": "application/json",
          },
          data: {
            name: "Updated Company Name",
          },
        },
      );

      // THEN: 403 Forbidden is returned (client cannot edit company in MVP)
      expect(response.status()).toBe(403);
    } finally {
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({
        where: { user_id: clientUser.user_id },
      });
    }
  });

  test("2.9-API-020: [P0] client user cannot modify store details in their company", async ({
    request,
    prismaClient,
    backendUrl,
  }) => {
    // GIVEN: A client user who owns a company with a store
    const password = "ClientPassword123!";
    const passwordHash = await bcrypt.hash(password, 10);

    const clientUserData = createClientUser({ password_hash: passwordHash });
    const clientUser = await prismaClient.user.create({
      data: {
        user_id: clientUserData.user_id,
        email: clientUserData.email,
        name: clientUserData.name,
        status: clientUserData.status,
        password_hash: passwordHash,
        public_id: clientUserData.public_id,
        is_client_user: true,
      },
    });

    const companyData = createCompanyFactory({
      owner_user_id: clientUser.user_id,
    });
    const company = await prismaClient.company.create({ data: companyData });

    const storeData = createStoreFactory({ company_id: company.company_id });
    const store = await prismaClient.store.create({
      data: {
        ...storeData,
        location_json: storeData.location_json as any,
      },
    });

    const token = createJWTAccessToken({
      user_id: clientUser.user_id,
      email: clientUser.email,
      roles: ["CLIENT_OWNER"],
      permissions: ["CLIENT_DASHBOARD_ACCESS"],
    });

    try {
      // WHEN: Client user attempts to update store name
      const response = await request.put(
        `${backendUrl}/api/stores/${store.store_id}`,
        {
          headers: {
            Cookie: `access_token=${token}`,
            "Content-Type": "application/json",
          },
          data: {
            name: "Updated Store Name",
          },
        },
      );

      // THEN: 403 Forbidden is returned (client cannot edit store in MVP)
      expect(response.status()).toBe(403);
    } finally {
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({
        where: { user_id: clientUser.user_id },
      });
    }
  });

  test("2.9-API-021: [P0] client user cannot delete stores in their company", async ({
    request,
    prismaClient,
    backendUrl,
  }) => {
    // GIVEN: A client user who owns a company with a store
    const password = "ClientPassword123!";
    const passwordHash = await bcrypt.hash(password, 10);

    const clientUserData = createClientUser({ password_hash: passwordHash });
    const clientUser = await prismaClient.user.create({
      data: {
        user_id: clientUserData.user_id,
        email: clientUserData.email,
        name: clientUserData.name,
        status: clientUserData.status,
        password_hash: passwordHash,
        public_id: clientUserData.public_id,
        is_client_user: true,
      },
    });

    const companyData = createCompanyFactory({
      owner_user_id: clientUser.user_id,
    });
    const company = await prismaClient.company.create({ data: companyData });

    const storeData = createStoreFactory({ company_id: company.company_id });
    const store = await prismaClient.store.create({
      data: {
        ...storeData,
        location_json: storeData.location_json as any,
      },
    });

    const token = createJWTAccessToken({
      user_id: clientUser.user_id,
      email: clientUser.email,
      roles: ["CLIENT_OWNER"],
      permissions: ["CLIENT_DASHBOARD_ACCESS"],
    });

    try {
      // WHEN: Client user attempts to delete store
      const response = await request.delete(
        `${backendUrl}/api/stores/${store.store_id}`,
        {
          headers: {
            Cookie: `access_token=${token}`,
          },
        },
      );

      // THEN: 403 Forbidden is returned
      expect(response.status()).toBe(403);
    } finally {
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({
        where: { user_id: clientUser.user_id },
      });
    }
  });
});

// ============================================================================
// SESSION MANAGEMENT - Token Refresh (Industry Best Practice)
// ============================================================================

test.describe("2.9-API: Session Management", () => {
  test("2.9-API-022: [P1] should refresh token for client user via /api/auth/refresh", async ({
    request,
    prismaClient,
    backendUrl,
  }) => {
    // GIVEN: A client user with a valid session
    const password = "ClientPassword123!";
    const passwordHash = await bcrypt.hash(password, 10);

    const clientUserData = createClientUser({ password_hash: passwordHash });
    const clientUser = await prismaClient.user.create({
      data: {
        user_id: clientUserData.user_id,
        email: clientUserData.email,
        name: clientUserData.name,
        status: clientUserData.status,
        password_hash: passwordHash,
        public_id: clientUserData.public_id,
        is_client_user: true,
      },
    });

    try {
      // Login first to get cookies
      const loginResponse = await request.post(
        `${backendUrl}/api/auth/client-login`,
        {
          data: {
            email: clientUser.email,
            password: password,
          },
        },
      );

      expect(loginResponse.status()).toBe(200);

      // Get cookies from login response
      // The response includes multiple set-cookie headers as a newline-separated string
      const setCookieHeader = loginResponse.headers()["set-cookie"];
      expect(setCookieHeader).toBeDefined();

      // Parse cookies - handle both array format and newline-separated string
      let cookieValues: string[] = [];
      if (Array.isArray(setCookieHeader)) {
        cookieValues = setCookieHeader.map((c) => c.split(";")[0]);
      } else {
        // Split by newline for multiple cookies, then extract just name=value
        cookieValues = setCookieHeader
          .split("\n")
          .map((c) => c.split(";")[0].trim());
      }

      // Join all cookies with semicolon
      const cookieString = cookieValues.filter((c) => c).join("; ");

      // Verify we have both access_token and refresh_token
      expect(cookieString).toContain("access_token=");
      expect(cookieString).toContain("refresh_token=");

      // WHEN: Client user requests token refresh
      const refreshResponse = await request.post(
        `${backendUrl}/api/auth/refresh`,
        {
          headers: {
            Cookie: cookieString,
          },
        },
      );

      // THEN: New token is issued
      expect(refreshResponse.status()).toBe(200);

      const refreshCookies = refreshResponse.headers()["set-cookie"];
      expect(refreshCookies).toBeDefined();
      expect(refreshCookies).toContain("access_token=");
    } finally {
      await prismaClient.auditLog.deleteMany({
        where: { user_id: clientUser.user_id },
      });
      await prismaClient.user.delete({
        where: { user_id: clientUser.user_id },
      });
    }
  });
});
