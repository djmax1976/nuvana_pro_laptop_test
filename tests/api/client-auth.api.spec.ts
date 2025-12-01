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
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("PERMISSION_DENIED");
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

    // GIVEN: A company and store exist for the CLIENT_USER role assignment
    // Use factory functions directly to avoid helper function issues
    const companyOwnerData = createUserFactory();
    const companyOwner = await prismaClient.user.create({
      data: companyOwnerData,
    });

    const companyData = createCompanyFactory({
      owner_user_id: companyOwner.user_id,
    });
    const company = await prismaClient.company.create({
      data: companyData,
    });

    // CLIENT_USER role requires both company_id and store_id
    const storeData = createStoreFactory({ company_id: company.company_id });
    const store = await prismaClient.store.create({
      data: storeData,
    });

    const userData = {
      name: "New Client User",
      email: `newclientuser-${Date.now()}@test-api.example.com`,
      password: "SecurePassword123!",
      roles: [
        {
          role_id: clientUserRole.role_id,
          scope_type: "STORE",
          company_id: company.company_id,
          store_id: store.store_id,
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
      // Cleanup - delete in order: user_roles, user, store, company, owner
      await prismaClient.userRole.deleteMany({
        where: { user_id: body.data.user_id },
      });
      await prismaClient.user.delete({ where: { user_id: body.data.user_id } });
      await prismaClient.store.delete({
        where: { store_id: store.store_id },
      });
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

// ============================================================================
// SECURITY: Account Enumeration Prevention
// ============================================================================

test.describe("2.9-API: Security - Account Enumeration Prevention", () => {
  test("2.9-API-023: [P0] should return identical error for all auth failure scenarios", async ({
    apiRequest,
    prismaClient,
  }) => {
    // SECURITY: All authentication failures must return the same error message
    // to prevent attackers from enumerating valid accounts
    const expectedError = {
      error: "Unauthorized",
      message: "Invalid email or password",
    };

    // GIVEN: Test data for various failure scenarios
    const password = "ClientPassword123!";
    const passwordHash = await bcrypt.hash(password, 10);

    // Create a client user
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

    // Create a non-client user (admin)
    const adminUserData = createNonClientUser({ password_hash: passwordHash });
    const adminUser = await prismaClient.user.create({
      data: {
        user_id: adminUserData.user_id,
        email: adminUserData.email,
        name: adminUserData.name,
        status: adminUserData.status,
        password_hash: passwordHash,
        public_id: adminUserData.public_id,
        is_client_user: false,
      },
    });

    try {
      // Scenario 1: Non-existent email
      const response1 = await apiRequest.post("/api/auth/client-login", {
        email: "nonexistent-account@example.com",
        password: password,
      });
      expect(response1.status()).toBe(401);
      const body1 = await response1.json();
      expect(body1).toEqual(expectedError);

      // Scenario 2: Wrong password for valid client user
      const response2 = await apiRequest.post("/api/auth/client-login", {
        email: clientUser.email,
        password: "WrongPassword123!",
      });
      expect(response2.status()).toBe(401);
      const body2 = await response2.json();
      expect(body2).toEqual(expectedError);

      // Scenario 3: Valid credentials but non-client user
      const response3 = await apiRequest.post("/api/auth/client-login", {
        email: adminUser.email,
        password: password,
      });
      expect(response3.status()).toBe(401);
      const body3 = await response3.json();
      expect(body3).toEqual(expectedError);

      // THEN: All three scenarios return identical error responses
      // This prevents attackers from determining:
      // - Whether an email exists in the system
      // - Whether a user is a client or admin
    } finally {
      await prismaClient.user.delete({
        where: { user_id: clientUser.user_id },
      });
      await prismaClient.user.delete({ where: { user_id: adminUser.user_id } });
    }
  });
});

// ============================================================================
// SECURITY: Token Security - HttpOnly Cookies
// ============================================================================

test.describe("2.9-API: Security - Token Security", () => {
  test("2.9-API-024: [P0] should NOT include tokens in response body", async ({
    apiRequest,
    prismaClient,
  }) => {
    // SECURITY: Tokens must only be in httpOnly cookies, never in response body
    // This prevents XSS attacks from stealing tokens via JavaScript
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
      // WHEN: Client user logs in successfully
      const response = await apiRequest.post("/api/auth/client-login", {
        email: clientUser.email,
        password: password,
      });

      expect(response.status()).toBe(200);
      const body = await response.json();

      // THEN: Response body does NOT contain any tokens
      expect(body).not.toHaveProperty("accessToken");
      expect(body).not.toHaveProperty("access_token");
      expect(body).not.toHaveProperty("refreshToken");
      expect(body).not.toHaveProperty("refresh_token");
      expect(body).not.toHaveProperty("token");
      expect(body).not.toHaveProperty("jwt");

      // AND: Response body only contains user info
      expect(body).toHaveProperty("message", "Login successful");
      expect(body).toHaveProperty("user");
      expect(body.user).toHaveProperty("id");
      expect(body.user).toHaveProperty("email");
      expect(body.user).toHaveProperty("name");

      // AND: Tokens ARE set in cookies
      const cookies = response.headers()["set-cookie"];
      expect(cookies).toBeDefined();
      expect(cookies).toContain("access_token=");
      expect(cookies).toContain("refresh_token=");
    } finally {
      await prismaClient.auditLog.deleteMany({
        where: { user_id: clientUser.user_id },
      });
      await prismaClient.user.delete({
        where: { user_id: clientUser.user_id },
      });
    }
  });

  test("2.9-API-025: [P0] should set HttpOnly flag on auth cookies", async ({
    apiRequest,
    prismaClient,
  }) => {
    // SECURITY: HttpOnly flag prevents JavaScript from accessing cookies
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
      // WHEN: Client user logs in
      const response = await apiRequest.post("/api/auth/client-login", {
        email: clientUser.email,
        password: password,
      });

      expect(response.status()).toBe(200);

      // THEN: Cookies have HttpOnly flag set
      const cookies = response.headers()["set-cookie"];
      expect(cookies).toBeDefined();
      expect(cookies.toLowerCase()).toContain("httponly");
    } finally {
      await prismaClient.auditLog.deleteMany({
        where: { user_id: clientUser.user_id },
      });
      await prismaClient.user.delete({
        where: { user_id: clientUser.user_id },
      });
    }
  });

  test("2.9-API-026: [P1] should set SameSite flag on auth cookies", async ({
    apiRequest,
    prismaClient,
  }) => {
    // SECURITY: SameSite flag provides CSRF protection
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
      // WHEN: Client user logs in
      const response = await apiRequest.post("/api/auth/client-login", {
        email: clientUser.email,
        password: password,
      });

      expect(response.status()).toBe(200);

      // THEN: Cookies have SameSite flag set
      const cookies = response.headers()["set-cookie"];
      expect(cookies).toBeDefined();
      expect(cookies.toLowerCase()).toContain("samesite");
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

// ============================================================================
// SECURITY: Input Sanitization - Injection Prevention
// ============================================================================

test.describe("2.9-API: Security - Input Sanitization", () => {
  test("2.9-API-027: [P0] should safely handle SQL injection attempt in email", async ({
    apiRequest,
  }) => {
    // SECURITY: SQL injection attempts should not cause errors or data leakage
    // These payloads may fail at Zod validation (400) or authentication (401)
    // The key security assertion is: NO 500 errors and NO database errors
    const sqlInjectionPayloads = [
      "'; DROP TABLE users; --@test.com",
      "admin'--@test.com",
      "' OR '1'='1'@test.com",
      "'; SELECT * FROM users WHERE '1'='1@test.com",
    ];

    for (const payload of sqlInjectionPayloads) {
      // WHEN: Attacker sends SQL injection payload
      const response = await apiRequest.post("/api/auth/client-login", {
        email: payload,
        password: "password123",
      });

      // THEN: Returns 400 (invalid email format) or 401 (not found)
      // NOT 500 (database error) - this is the security-critical assertion
      expect([400, 401]).toContain(response.status());

      const body = await response.json();
      // Error should be clean validation or auth error, not database exception
      expect(["Bad Request", "Unauthorized"]).toContain(body.error);
    }
  });

  test("2.9-API-028: [P1] should safely handle XSS payload in email", async ({
    apiRequest,
  }) => {
    // SECURITY: XSS payloads should be treated as invalid input
    const xssPayloads = [
      "<script>alert('xss')</script>@test.com",
      "test@<script>alert(1)</script>.com",
      "javascript:alert(1)@test.com",
      "<img src=x onerror=alert(1)>@test.com",
    ];

    for (const payload of xssPayloads) {
      // WHEN: Attacker sends XSS payload
      const response = await apiRequest.post("/api/auth/client-login", {
        email: payload,
        password: "password123",
      });

      // THEN: Returns 400 (invalid email format) or 401 (not found)
      // Either is acceptable - key is no 500 error
      expect([400, 401]).toContain(response.status());
    }
  });

  test("2.9-API-029: [P2] should handle null byte injection in email", async ({
    apiRequest,
  }) => {
    // SECURITY: Null bytes can cause truncation issues
    const nullBytePayloads = [
      "admin@test.com\x00.evil.com",
      "admin\x00@test.com",
    ];

    for (const payload of nullBytePayloads) {
      // WHEN: Attacker sends null byte payload
      const response = await apiRequest.post("/api/auth/client-login", {
        email: payload,
        password: "password123",
      });

      // THEN: Returns clean error (not 500)
      expect([400, 401]).toContain(response.status());
    }
  });
});

// ============================================================================
// EDGE CASES: Email Input Validation
// ============================================================================

test.describe("2.9-API: Edge Cases - Email Input", () => {
  test("2.9-API-030: [P1] should reject email without @ symbol", async ({
    apiRequest,
  }) => {
    // GIVEN: Invalid email without @ symbol
    const response = await apiRequest.post("/api/auth/client-login", {
      email: "notanemail",
      password: "password123",
    });

    // THEN: Returns 400 Bad Request (Zod validation)
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Bad Request");
  });

  test("2.9-API-031: [P1] should reject email without domain", async ({
    apiRequest,
  }) => {
    // GIVEN: Invalid email without domain
    const response = await apiRequest.post("/api/auth/client-login", {
      email: "test@",
      password: "password123",
    });

    // THEN: Returns 400 Bad Request
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Bad Request");
  });

  test("2.9-API-032: [P2] should reject very long email (over 254 chars)", async ({
    apiRequest,
  }) => {
    // GIVEN: Email exceeding RFC 5321 limit of 254 characters
    const longLocalPart = "a".repeat(250);
    const longEmail = `${longLocalPart}@test.com`;

    const response = await apiRequest.post("/api/auth/client-login", {
      email: longEmail,
      password: "password123",
    });

    // THEN: Returns 400 or 401 (either validation or not found is acceptable)
    expect([400, 401]).toContain(response.status());
  });

  test("2.9-API-033: [P2] should reject email with leading/trailing whitespace", async ({
    apiRequest,
  }) => {
    // GIVEN: Email with leading/trailing whitespace
    // NOTE: Zod email validation rejects whitespace BEFORE the trim() in business logic
    // This is correct security behavior - strict input validation

    // WHEN: Login with whitespace around email
    const response = await apiRequest.post("/api/auth/client-login", {
      email: "  test@example.com  ",
      password: "password123",
    });

    // THEN: Returns 400 (Zod validation rejects emails with whitespace)
    // This is the expected behavior - strict email format validation
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Bad Request");
  });
});

// ============================================================================
// EDGE CASES: Password Input
// ============================================================================

test.describe("2.9-API: Edge Cases - Password Input", () => {
  test("2.9-API-034: [P1] should reject whitespace-only password", async ({
    apiRequest,
  }) => {
    // GIVEN: Password with only whitespace
    const response = await apiRequest.post("/api/auth/client-login", {
      email: "test@example.com",
      password: "   ",
    });

    // THEN: Returns 401 (password doesn't match after potential trim)
    expect(response.status()).toBe(401);
  });

  test("2.9-API-035: [P2] should handle unicode password", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: A client user with unicode password
    const unicodePassword = "Pässwörd123!日本語";
    const passwordHash = await bcrypt.hash(unicodePassword, 10);

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
      // WHEN: Login with unicode password
      const response = await apiRequest.post("/api/auth/client-login", {
        email: clientUser.email,
        password: unicodePassword,
      });

      // THEN: Login succeeds
      expect(response.status()).toBe(200);
    } finally {
      await prismaClient.auditLog.deleteMany({
        where: { user_id: clientUser.user_id },
      });
      await prismaClient.user.delete({
        where: { user_id: clientUser.user_id },
      });
    }
  });

  test("2.9-API-036: [P2] should handle special characters in password", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: A client user with special characters in password
    const specialPassword = "P@$$w0rd!#$%^&*()_+-=[]{}|;':\",./<>?";
    const passwordHash = await bcrypt.hash(specialPassword, 10);

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
      // WHEN: Login with special character password
      const response = await apiRequest.post("/api/auth/client-login", {
        email: clientUser.email,
        password: specialPassword,
      });

      // THEN: Login succeeds
      expect(response.status()).toBe(200);
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

// ============================================================================
// EDGE CASES: User Status Variations
// ============================================================================

test.describe("2.9-API: Edge Cases - User Status", () => {
  test("2.9-API-037: [P1] should reject user without password_hash set", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: A client user without password_hash (OAuth-only user)
    const clientUserData = createClientUser();
    const clientUser = await prismaClient.user.create({
      data: {
        user_id: clientUserData.user_id,
        email: clientUserData.email,
        name: clientUserData.name,
        status: clientUserData.status,
        password_hash: null, // No password set
        public_id: clientUserData.public_id,
        is_client_user: true,
      },
    });

    try {
      // WHEN: Attempting login with any password
      const response = await apiRequest.post("/api/auth/client-login", {
        email: clientUser.email,
        password: "AnyPassword123!",
      });

      // THEN: Returns 401 with generic error (no enumeration)
      expect(response.status()).toBe(401);
      const body = await response.json();
      expect(body.error).toBe("Unauthorized");
      expect(body.message).toBe("Invalid email or password");
    } finally {
      await prismaClient.user.delete({
        where: { user_id: clientUser.user_id },
      });
    }
  });

  test("2.9-API-038: [P1] should reject PENDING status user", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: A client user with PENDING status
    const password = "ClientPassword123!";
    const passwordHash = await bcrypt.hash(password, 10);

    const clientUserData = createClientUser({ password_hash: passwordHash });
    const clientUser = await prismaClient.user.create({
      data: {
        user_id: clientUserData.user_id,
        email: clientUserData.email,
        name: clientUserData.name,
        status: "PENDING",
        password_hash: passwordHash,
        public_id: clientUserData.public_id,
        is_client_user: true,
      },
    });

    try {
      // WHEN: PENDING user attempts login
      const response = await apiRequest.post("/api/auth/client-login", {
        email: clientUser.email,
        password: password,
      });

      // THEN: Returns 401 (account not active)
      expect(response.status()).toBe(401);
    } finally {
      await prismaClient.user.delete({
        where: { user_id: clientUser.user_id },
      });
    }
  });
});
