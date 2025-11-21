import { test, expect } from "../support/fixtures/rbac.fixture";
import { createClient } from "../support/factories";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../backend/src/utils/public-id";

/**
 * Generate a unique email for testing
 */
function uniqueEmail(prefix: string = "client"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
}

/**
 * Client Unified Authentication Tests
 *
 * Tests for unified User + Client authentication system:
 * - Client creation creates both User (auth) and Client (business) records
 * - User and Client are linked via UserRole with CLIENT_OWNER role
 * - Password is stored in User table (NOT Client table)
 * - Client can login using User credentials
 * - Email validation and password hashing
 *
 * Priority: P0 (Critical - Authentication foundation)
 *
 * Related Story: Unified Client Authentication Architecture
 */

test.describe("Client Unified Authentication - Create Operations", () => {
  test("[P0] POST /api/clients - should create User + Client + UserRole link with CLIENT_OWNER role", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin with valid client data
    const clientData = {
      name: "Test Client with Auth",
      email: uniqueEmail(),
      password: "securePassword123",
      status: "ACTIVE",
    };

    // WHEN: Creating a client via API
    const response = await superadminApiRequest.post(
      "/api/clients",
      clientData,
    );

    // THEN: Client is created successfully
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("client_id");
    expect(body.data).toHaveProperty("email", clientData.email.toLowerCase());

    // AND: Password should NOT be returned in response
    expect(body.data).not.toHaveProperty("password");
    expect(body.data).not.toHaveProperty("password_hash");

    // AND: Client record exists in database WITHOUT password_hash
    const client = await prismaClient.client.findUnique({
      where: { client_id: body.data.client_id },
    });
    expect(client).not.toBeNull();
    expect(client?.email).toBe(clientData.email.toLowerCase());
    expect(client).not.toHaveProperty("password_hash"); // Password NOT in Client table

    // AND: User record was created for authentication
    const user = await prismaClient.user.findUnique({
      where: { email: clientData.email.toLowerCase() },
    });
    expect(user).not.toBeNull();
    expect(user?.name).toBe(clientData.name);
    expect(user?.password_hash).not.toBeNull();
    expect(user?.password_hash).not.toBe(clientData.password); // Password should be hashed
    expect(user?.status).toBe("ACTIVE");

    // AND: UserRole links User to Client with CLIENT_OWNER role
    const userRole = await prismaClient.userRole.findFirst({
      where: {
        user_id: user?.user_id,
        client_id: client?.client_id,
      },
      include: {
        role: true,
      },
    });
    expect(userRole).not.toBeNull();
    expect(userRole?.role.code).toBe("CLIENT_OWNER");
    expect(userRole?.role.scope).toBe("CLIENT");
    expect(userRole?.client_id).toBe(client?.client_id);
  });

  test("[P0] POST /api/clients - should require password for client creation", async ({
    superadminApiRequest,
  }) => {
    const email = uniqueEmail("nopassword");

    // GIVEN: Client data without password
    const clientData = {
      name: "Test Client No Password",
      email: email,
      status: "ACTIVE",
    };

    // WHEN: Creating a client without password
    const response = await superadminApiRequest.post(
      "/api/clients",
      clientData,
    );

    // THEN: Validation error is returned (password is required)
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain("Password is required");
  });

  test("[P0] POST /api/clients - should reject missing email", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Client data without email
    const clientData = {
      name: "Test Client Missing Email",
      password: "password123",
      status: "ACTIVE",
    };

    // WHEN: Creating a client without email
    const response = await superadminApiRequest.post(
      "/api/clients",
      clientData,
    );

    // THEN: Validation error is returned
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Validation error");
  });

  test("[P0] POST /api/clients - should reject invalid email format", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Client data with invalid email format
    const clientData = {
      name: "Test Client Invalid Email",
      email: "not-an-email",
      password: "password123",
      status: "ACTIVE",
    };

    // WHEN: Creating a client with invalid email
    const response = await superadminApiRequest.post(
      "/api/clients",
      clientData,
    );

    // THEN: Validation error is returned
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain("email");
  });

  test("[P0] POST /api/clients - should reject password shorter than 8 characters", async ({
    superadminApiRequest,
  }) => {
    const email = uniqueEmail("weakpass");

    // GIVEN: Client data with weak password
    const clientData = {
      name: "Test Client Weak Password",
      email: email,
      password: "short",
      status: "ACTIVE",
    };

    // WHEN: Creating a client with short password
    const response = await superadminApiRequest.post(
      "/api/clients",
      clientData,
    );

    // THEN: Validation error is returned
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain("8 characters");
  });

  test("[P0] POST /api/clients - should reject duplicate email (User table uniqueness)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const email = uniqueEmail("duplicate");

    // GIVEN: An existing client with email
    await superadminApiRequest.post("/api/clients", {
      name: "First Client",
      email: email,
      password: "password123",
      status: "ACTIVE",
    });

    // WHEN: Creating another client with same email
    const response = await superadminApiRequest.post("/api/clients", {
      name: "Second Client",
      email: email,
      password: "password456",
      status: "ACTIVE",
    });

    // THEN: Error is returned (email must be unique in User table)
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain("email");
  });
});

test.describe("Client Unified Authentication - Update Operations", () => {
  test("[P0] PUT /api/clients/:id - should update both User and Client email", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const oldEmail = uniqueEmail("old");
    const newEmail = uniqueEmail("newemail");

    // GIVEN: An existing client (with associated User)
    const createResponse = await superadminApiRequest.post("/api/clients", {
      name: "Test Client",
      email: oldEmail,
      password: "password123",
      status: "ACTIVE",
    });
    const createBody = await createResponse.json();
    const clientId = createBody.data.client_id;
    const clientPublicId = createBody.data.public_id;

    // WHEN: Updating client email
    const response = await superadminApiRequest.put(
      `/api/clients/${clientPublicId}`,
      {
        email: newEmail,
      },
    );

    // THEN: Email is updated successfully
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.email).toBe(newEmail.toLowerCase());

    // AND: Client email is updated
    const updatedClient = await prismaClient.client.findUnique({
      where: { client_id: clientId },
    });
    expect(updatedClient?.email).toBe(newEmail.toLowerCase());

    // AND: User email is also updated
    const updatedUser = await prismaClient.user.findUnique({
      where: { email: newEmail.toLowerCase() },
    });
    expect(updatedUser).not.toBeNull();
    expect(updatedUser?.email).toBe(newEmail.toLowerCase());
  });

  test("[P0] PUT /api/clients/:id - should update User password (hashed)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const email = uniqueEmail("test");

    // GIVEN: An existing client with password
    const createResponse = await superadminApiRequest.post("/api/clients", {
      name: "Test Client",
      email: email,
      password: "oldPassword123",
      status: "ACTIVE",
    });
    const createBody = await createResponse.json();
    const clientPublicId = createBody.data.public_id;

    // Get the original user password hash
    const originalUser = await prismaClient.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    const originalPasswordHash = originalUser?.password_hash;

    // WHEN: Updating client password
    const newPassword = "newPassword456";
    const response = await superadminApiRequest.put(
      `/api/clients/${clientPublicId}`,
      {
        password: newPassword,
      },
    );

    // THEN: Password is updated successfully
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // AND: User password hash is different from old hash
    const updatedUser = await prismaClient.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    expect(updatedUser?.password_hash).not.toBe(originalPasswordHash);
    expect(updatedUser?.password_hash).not.toBe(newPassword); // Should be hashed

    // AND: New password can be verified
    const bcrypt = require("bcrypt");
    const isValid = await bcrypt.compare(
      newPassword,
      updatedUser?.password_hash,
    );
    expect(isValid).toBe(true);
  });

  test("[P0] PUT /api/clients/:id - should not update password when not provided", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const email = uniqueEmail("test");

    // GIVEN: An existing client with password
    const createResponse = await superadminApiRequest.post("/api/clients", {
      name: "Test Client",
      email: email,
      password: "password123",
      status: "ACTIVE",
    });
    const createBody = await createResponse.json();
    const clientPublicId = createBody.data.public_id;

    const originalUser = await prismaClient.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    const originalPasswordHash = originalUser?.password_hash;

    // WHEN: Updating client without password field
    const response = await superadminApiRequest.put(
      `/api/clients/${clientPublicId}`,
      {
        name: "Updated Client Name",
      },
    );

    // THEN: Update succeeds
    expect(response.status()).toBe(200);

    // AND: User password hash remains unchanged
    const updatedUser = await prismaClient.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    expect(updatedUser?.password_hash).toBe(originalPasswordHash);
  });

  test("[P0] PUT /api/clients/:id - should reject short password on update", async ({
    superadminApiRequest,
  }) => {
    const email = uniqueEmail("test");

    // GIVEN: An existing client
    const createResponse = await superadminApiRequest.post("/api/clients", {
      name: "Test Client",
      email: email,
      password: "password123",
      status: "ACTIVE",
    });
    const createBody = await createResponse.json();
    const clientPublicId = createBody.data.public_id;

    // WHEN: Updating with short password
    const response = await superadminApiRequest.put(
      `/api/clients/${clientPublicId}`,
      {
        password: "short",
      },
    );

    // THEN: Validation error is returned
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain("8 characters");
  });
});

test.describe("Client Unified Authentication - Security", () => {
  test("[P0] POST /api/clients - password should be hashed using bcrypt in User table", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const email = uniqueEmail("security");

    // GIVEN: Client data with password
    const clientData = {
      name: "Security Test Client",
      email: email,
      password: "testPassword123",
      status: "ACTIVE",
    };

    // WHEN: Creating a client
    const response = await superadminApiRequest.post(
      "/api/clients",
      clientData,
    );
    expect(response.status()).toBe(201);
    const body = await response.json();

    // THEN: Password is hashed in User table (NOT Client table)
    const user = await prismaClient.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // AND: Hash starts with bcrypt identifier ($2b$ or $2a$)
    expect(user?.password_hash).toMatch(/^\$2[ab]\$/);

    // AND: Password can be verified with bcrypt
    const bcrypt = require("bcrypt");
    const isValid = await bcrypt.compare(
      clientData.password,
      user?.password_hash,
    );
    expect(isValid).toBe(true);

    // AND: Client table does NOT have password_hash field
    const client = await prismaClient.client.findUnique({
      where: { client_id: body.data.client_id },
    });
    expect(client).not.toHaveProperty("password_hash");
  });

  test("[P0] GET /api/clients - password hash should not be returned in API response", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const email = uniqueEmail("test");

    // GIVEN: A client with password
    const createResponse = await superadminApiRequest.post("/api/clients", {
      name: "Test Client",
      email: email,
      password: "password123",
      status: "ACTIVE",
    });
    const createBody = await createResponse.json();
    const clientPublicId = createBody.data.public_id;

    // WHEN: Fetching client via API
    const response = await superadminApiRequest.get(
      `/api/clients/${clientPublicId}`,
    );

    // THEN: Response does not include password hash
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).not.toHaveProperty("password_hash");
    expect(body.data).not.toHaveProperty("password");
  });

  test("[P0] GET /api/clients (list) - password hash should not be returned in list", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    const email1 = uniqueEmail("test1");

    // GIVEN: Clients with passwords
    await superadminApiRequest.post("/api/clients", {
      name: "Test Client 1",
      email: email1,
      password: "password123",
      status: "ACTIVE",
    });

    // WHEN: Fetching client list
    const response = await superadminApiRequest.get("/api/clients");

    // THEN: Response does not include password hashes
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBeGreaterThan(0);

    body.data.forEach((client: any) => {
      expect(client).not.toHaveProperty("password_hash");
      expect(client).not.toHaveProperty("password");
    });
  });
});

test.describe("Client Unified Authentication - Login Flow", () => {
  test("[P0] POST /api/auth/login - client should be able to login with User credentials", async ({
    request,
    prismaClient,
  }) => {
    const clientEmail = uniqueEmail("client");
    const superadminEmail = uniqueEmail("superadmin");
    const clientPassword = "securePassword123";

    // GIVEN: A client with email and password
    // First, create a superadmin to create the client
    const bcrypt = require("bcrypt");
    const superadmin = await prismaClient.user.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        email: superadminEmail,
        name: "Super Admin",
        password_hash: await bcrypt.hash("adminpass", 10),
        status: "ACTIVE",
      },
    });

    const superadminRole = await prismaClient.role.findUnique({
      where: { code: "SUPERADMIN" },
    });

    await prismaClient.userRole.create({
      data: {
        user_id: superadmin.user_id,
        role_id: superadminRole!.role_id,
      },
    });

    // Login as superadmin to create client
    const loginResponse = await request.post(
      "http://localhost:3001/api/auth/login",
      {
        data: {
          email: superadminEmail,
          password: "adminpass",
        },
      },
    );

    const cookies = loginResponse.headers()["set-cookie"];
    const cookieArray = Array.isArray(cookies)
      ? cookies
      : cookies
        ? [cookies]
        : [];
    const accessTokenCookie = cookieArray.find((c: string) =>
      c.startsWith("access_token="),
    );

    // Extract just the cookie value (before semicolon and remove any newlines)
    const cookieValue = accessTokenCookie?.split(";")[0]?.trim() || "";

    // Create a client
    const createResponse = await request.post(
      "http://localhost:3001/api/clients",
      {
        data: {
          name: "Test Client",
          email: clientEmail,
          password: clientPassword,
          status: "ACTIVE",
        },
        headers: {
          Cookie: cookieValue,
        },
      },
    );

    expect(createResponse.status()).toBe(201);

    // WHEN: Client logs in with their credentials
    const clientLoginResponse = await request.post(
      "http://localhost:3001/api/auth/login",
      {
        data: {
          email: clientEmail,
          password: clientPassword,
        },
      },
    );

    // THEN: Login is successful
    expect(clientLoginResponse.status()).toBe(200);
    const loginBody = await clientLoginResponse.json();
    expect(loginBody.message).toBe("Login successful");
    expect(loginBody.user.email).toBe(clientEmail.toLowerCase());

    // AND: Access token cookie is set
    const clientCookies = clientLoginResponse.headers()["set-cookie"];
    expect(clientCookies).toBeDefined();
    const clientCookieArray = Array.isArray(clientCookies)
      ? clientCookies
      : clientCookies
        ? [clientCookies]
        : [];
    const clientAccessToken = clientCookieArray.find((c: string) =>
      c.startsWith("access_token="),
    );
    expect(clientAccessToken).toBeDefined();
  });
});
