import { test, expect } from "../support/fixtures/rbac.fixture";
import { createClient } from "../support/factories";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../backend/src/utils/public-id";

/**
 * Client Email and Password Management API Tests
 *
 * Tests for new email and password fields added to Client Management:
 * - Email validation (required, format, uniqueness)
 * - Password hashing and security
 * - Password updates (optional on update)
 * - Validation and error handling
 *
 * Priority: P0 (Critical - Authentication foundation)
 *
 * Related Story: Client Management Enhancement - Email & Password Fields
 */

test.describe("Client Email and Password Management - Create Operations", () => {
  test("[P0] POST /api/clients - should create client with email and password", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin with valid client data including email and password
    const clientData = {
      name: "Test Client with Auth",
      email: "client@example.com",
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
    expect(body.data).toHaveProperty("email", clientData.email);

    // AND: Password should NOT be returned in response
    expect(body.data).not.toHaveProperty("password");
    expect(body.data).not.toHaveProperty("password_hash");

    // AND: Client record exists in database with hashed password
    const client = await prismaClient.client.findUnique({
      where: { client_id: body.data.client_id },
    });
    expect(client).not.toBeNull();
    expect(client?.email).toBe(clientData.email);
    expect(client?.password_hash).not.toBeNull();
    expect(client?.password_hash).not.toBe(clientData.password); // Password should be hashed
  });

  test("[P0] POST /api/clients - should create client with email but no password (optional)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Client data with email but no password
    const clientData = {
      name: "Test Client No Password",
      email: "nopassword@example.com",
      status: "ACTIVE",
    };

    // WHEN: Creating a client without password
    const response = await superadminApiRequest.post(
      "/api/clients",
      clientData,
    );

    // THEN: Client is created successfully
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);

    // AND: Password hash is null in database
    const client = await prismaClient.client.findUnique({
      where: { client_id: body.data.client_id },
    });
    expect(client?.password_hash).toBeNull();
  });

  test("[P0] POST /api/clients - should reject missing email", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Client data without email
    const clientData = {
      name: "Test Client Missing Email",
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
    // GIVEN: Client data with weak password
    const clientData = {
      name: "Test Client Weak Password",
      email: "weakpass@example.com",
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
});

test.describe("Client Email and Password Management - Update Operations", () => {
  test("[P0] PUT /api/clients/:id - should update client email", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: An existing client
    const client = await prismaClient.client.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.CLIENT),
        name: "Test Client",
        email: "old@example.com",
        status: "ACTIVE",
      },
    });

    // WHEN: Updating client email
    const newEmail = "newemail@example.com";
    const response = await superadminApiRequest.put(
      `/api/clients/${client.public_id}`,
      {
        email: newEmail,
      },
    );

    // THEN: Email is updated successfully
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.email).toBe(newEmail);

    // AND: Database is updated
    const updatedClient = await prismaClient.client.findUnique({
      where: { client_id: client.client_id },
    });
    expect(updatedClient?.email).toBe(newEmail);
  });

  test("[P0] PUT /api/clients/:id - should update client password (hashed)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: An existing client with a password
    const bcrypt = require("bcrypt");
    const oldPasswordHash = await bcrypt.hash("oldPassword123", 10);

    const client = await prismaClient.client.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.CLIENT),
        name: "Test Client",
        email: "test@example.com",
        password_hash: oldPasswordHash,
        status: "ACTIVE",
      },
    });

    // WHEN: Updating client password
    const newPassword = "newPassword456";
    const response = await superadminApiRequest.put(
      `/api/clients/${client.public_id}`,
      {
        password: newPassword,
      },
    );

    // THEN: Password is updated successfully
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // AND: Password hash is different from old hash
    const updatedClient = await prismaClient.client.findUnique({
      where: { client_id: client.client_id },
    });
    expect(updatedClient?.password_hash).not.toBe(oldPasswordHash);
    expect(updatedClient?.password_hash).not.toBe(newPassword); // Should be hashed

    // AND: New password can be verified
    const isValid = await bcrypt.compare(
      newPassword,
      updatedClient?.password_hash,
    );
    expect(isValid).toBe(true);
  });

  test("[P0] PUT /api/clients/:id - should not update password when not provided", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: An existing client with a password
    const bcrypt = require("bcrypt");
    const originalPasswordHash = await bcrypt.hash("password123", 10);

    const client = await prismaClient.client.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.CLIENT),
        name: "Test Client",
        email: "test@example.com",
        password_hash: originalPasswordHash,
        status: "ACTIVE",
      },
    });

    // WHEN: Updating client without password field
    const response = await superadminApiRequest.put(
      `/api/clients/${client.public_id}`,
      {
        name: "Updated Client Name",
      },
    );

    // THEN: Update succeeds
    expect(response.status()).toBe(200);

    // AND: Password hash remains unchanged
    const updatedClient = await prismaClient.client.findUnique({
      where: { client_id: client.client_id },
    });
    expect(updatedClient?.password_hash).toBe(originalPasswordHash);
  });

  test("[P0] PUT /api/clients/:id - should reject invalid email format on update", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: An existing client
    const client = await prismaClient.client.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.CLIENT),
        name: "Test Client",
        email: "valid@example.com",
        status: "ACTIVE",
      },
    });

    // WHEN: Updating with invalid email
    const response = await superadminApiRequest.put(
      `/api/clients/${client.public_id}`,
      {
        email: "invalid-email-format",
      },
    );

    // THEN: Validation error is returned
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test("[P0] PUT /api/clients/:id - should reject short password on update", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: An existing client
    const client = await prismaClient.client.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.CLIENT),
        name: "Test Client",
        email: "test@example.com",
        status: "ACTIVE",
      },
    });

    // WHEN: Updating with short password
    const response = await superadminApiRequest.put(
      `/api/clients/${client.public_id}`,
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

test.describe("Client Email and Password Management - Security", () => {
  test("[P0] POST /api/clients - password should be hashed using bcrypt", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Client data with password
    const clientData = {
      name: "Security Test Client",
      email: "security@example.com",
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

    // THEN: Password is hashed in database
    const client = await prismaClient.client.findUnique({
      where: { client_id: body.data.client_id },
    });

    // AND: Hash starts with bcrypt identifier ($2b$ or $2a$)
    expect(client?.password_hash).toMatch(/^\$2[ab]\$/);

    // AND: Password can be verified with bcrypt
    const bcrypt = require("bcrypt");
    const isValid = await bcrypt.compare(
      clientData.password,
      client?.password_hash,
    );
    expect(isValid).toBe(true);
  });

  test("[P0] GET /api/clients - password hash should not be returned in API response", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A client with password
    const bcrypt = require("bcrypt");
    const client = await prismaClient.client.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.CLIENT),
        name: "Test Client",
        email: "test@example.com",
        password_hash: await bcrypt.hash("password123", 10),
        status: "ACTIVE",
      },
    });

    // WHEN: Fetching client via API
    const response = await superadminApiRequest.get(
      `/api/clients/${client.public_id}`,
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
    // GIVEN: Clients with passwords
    const bcrypt = require("bcrypt");
    await prismaClient.client.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.CLIENT),
        name: "Test Client 1",
        email: "test1@example.com",
        password_hash: await bcrypt.hash("password123", 10),
        status: "ACTIVE",
      },
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
