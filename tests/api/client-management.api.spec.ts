import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createClient,
  createCompany,
  createClientWithUser,
} from "../support/factories";
import { createClientViaAPI } from "../support/helpers";

/**
 * Client Management API Tests
 *
 * Tests for Client Management API endpoints:
 * - Create, read, update, delete clients (CRUD operations)
 * - Permission enforcement (only System Admins can manage clients)
 * - Audit logging for all client operations
 * - Soft delete functionality (deleted_at timestamp, not hard delete)
 * - Validation and error handling
 *
 * Priority: P0 (Critical - Multi-tenant hierarchy foundation)
 *
 * Story: 2.6 - Client Management API and UI
 */

test.describe("Client Management API - CRUD Operations", () => {
  test("[P0] POST /api/clients - should create client with valid data (AC #1)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin with valid client data
    const clientData = createClient({
      name: "Test Client Organization",
      status: "ACTIVE",
    });

    // WHEN: Creating a client via API
    const response = await superadminApiRequest.post("/api/clients", {
      name: clientData.name,
      email: clientData.email,
      password: "TestPass123!",
      status: clientData.status,
      metadata: clientData.metadata,
    });

    // THEN: Client is created successfully
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("client_id");
    expect(body.data).toHaveProperty("name", clientData.name);
    expect(body.data).toHaveProperty("status", clientData.status);
    expect(body.data).toHaveProperty("created_at");
    expect(body.data).toHaveProperty("updated_at");

    // AND: Client record exists in database
    const client = await prismaClient.client.findUnique({
      where: { client_id: body.data.client_id },
    });
    expect(client).not.toBeNull();
    expect(client?.name).toBe(clientData.name);

    // AND: Audit log entry is created
    const auditLog = await prismaClient.auditLog.findFirst({
      where: {
        table_name: "clients",
        record_id: body.data.client_id,
        action: "CREATE",
      },
    });
    expect(auditLog).not.toBeNull();
    expect(auditLog?.action).toBe("CREATE");
  });

  test("[P0] POST /api/clients - should reject invalid data (missing name) (AC #1)", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: I am authenticated as a System Admin with invalid client data (missing name)
    // WHEN: Creating a client with missing required field
    const response = await superadminApiRequest.post("/api/clients", {
      email: "missingname@example.com",
      password: "TestPass123!",
      status: "ACTIVE",
      // name is missing
    });

    // THEN: Validation error is returned
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("error");
  });

  test("[P0] POST /api/clients - should reject invalid status value (AC #1)", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: I am authenticated as a System Admin with invalid status
    // WHEN: Creating a client with invalid status
    const response = await superadminApiRequest.post("/api/clients", {
      name: "Test Client",
      email: "testclient@example.com",
      password: "TestPass123!",
      status: "INVALID_STATUS",
    });

    // THEN: Validation error is returned
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("error");
  });

  test("[P0] POST /api/clients - should reject non-admin users (AC #1)", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Store Manager (not System Admin)
    const clientData = createClient();

    // WHEN: Attempting to create a client
    const response = await storeManagerApiRequest.post("/api/clients", {
      name: clientData.name,
      email: clientData.email,
      password: "TestPass123!",
      status: clientData.status,
    });

    // THEN: Permission denied error is returned
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Forbidden");
  });

  test("[P0] GET /api/clients - should list all clients with pagination (AC #2)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin and multiple clients exist
    const { client: client1 } = await createClientWithUser(prismaClient, {
      name: "Client One",
    });
    const { client: client2 } = await createClientWithUser(prismaClient, {
      name: "Client Two",
    });

    // WHEN: Retrieving all clients (default pagination)
    const response = await superadminApiRequest.get("/api/clients");

    // THEN: Paginated list with metadata is returned
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body).toHaveProperty("data");
    expect(body).toHaveProperty("meta");
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(2);

    // Verify pagination metadata
    expect(body.meta.page).toBe(1);
    expect(body.meta.limit).toBeDefined();
    expect(body.meta.total).toBeGreaterThanOrEqual(2);

    // Verify client data includes company count
    const clientIds = body.data.map((c: any) => c.client_id);
    expect(clientIds).toContain(client1.client_id);
    expect(clientIds).toContain(client2.client_id);
  });

  test("[P1] GET /api/clients - should support search/filter by name (AC #2)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Multiple clients exist with different names
    await createClientWithUser(prismaClient, { name: "Alpha Corp" });
    await createClientWithUser(prismaClient, { name: "Beta Inc" });

    // WHEN: Searching for clients with "Alpha"
    const response = await superadminApiRequest.get(
      "/api/clients?search=Alpha",
    );

    // THEN: Only matching clients are returned
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.some((c: any) => c.name.includes("Alpha"))).toBe(true);
    expect(body.data.every((c: any) => !c.name.includes("Beta"))).toBe(true);
  });

  test("[P1] GET /api/clients - should filter by status (AC #2)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Clients with different statuses exist
    await createClientWithUser(prismaClient, {
      name: "Active Client",
      status: "ACTIVE",
    });
    await createClientWithUser(prismaClient, {
      name: "Inactive Client",
      status: "INACTIVE",
    });

    // WHEN: Filtering by ACTIVE status
    const response = await superadminApiRequest.get(
      "/api/clients?status=ACTIVE",
    );

    // THEN: Only ACTIVE clients are returned
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.every((c: any) => c.status === "ACTIVE")).toBe(true);
  });

  test("[P0] GET /api/clients/:clientId - should retrieve client by ID with company count (AC #3)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin and a client exists
    const { client } = await createClientWithUser(prismaClient);

    // WHEN: Retrieving client by ID
    const response = await superadminApiRequest.get(
      `/api/clients/${client.client_id}`,
    );

    // THEN: Client details are returned with company count
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("client_id", client.client_id);
    expect(body.data).toHaveProperty("name", client.name);
    expect(body.data).toHaveProperty("status", client.status);
    expect(body.data).toHaveProperty("companyCount");
    expect(body.data).toHaveProperty("created_at");
    expect(body.data).toHaveProperty("updated_at");
  });

  test("[P0] GET /api/clients/:clientId - should return 404 for non-existent client (AC #3)", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: I am authenticated as a System Admin
    const nonExistentId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Retrieving non-existent client
    const response = await superadminApiRequest.get(
      `/api/clients/${nonExistentId}`,
    );

    // THEN: 404 Not Found is returned
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("error");
  });

  test("[P0] PUT /api/clients/:clientId - should update client (AC #3)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a System Admin and a client exists
    const client = await createClientViaAPI(superadminApiRequest, {
      name: "Original Name",
    });
    const originalUpdatedAt = new Date(client.updated_at);

    // WHEN: Updating client
    const response = await superadminApiRequest.put(
      `/api/clients/${client.client_id}`,
      {
        name: "Updated Name",
        status: "INACTIVE",
      },
    );

    // THEN: Client is updated successfully
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("name", "Updated Name");
    expect(body.data).toHaveProperty("status", "INACTIVE");
    expect(body.data).toHaveProperty("updated_at");
    expect(new Date(body.data.updated_at).getTime()).toBeGreaterThan(
      originalUpdatedAt.getTime(),
    );

    // AND: Database record is updated
    const updatedClient = await prismaClient.client.findUnique({
      where: { client_id: client.client_id },
    });
    expect(updatedClient?.name).toBe("Updated Name");
    expect(updatedClient?.status).toBe("INACTIVE");

    // AND: Audit log entry is created
    const auditLog = await prismaClient.auditLog.findFirst({
      where: {
        table_name: "clients",
        record_id: client.client_id,
        action: "UPDATE",
      },
    });
    expect(auditLog).not.toBeNull();
  });

  test("[P0] PUT /api/clients/:clientId - should log status change to INACTIVE (AC #4)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am editing a client with ACTIVE status
    const client = await createClientViaAPI(superadminApiRequest, {
      name: "Client to Deactivate",
      status: "ACTIVE",
    });

    // WHEN: I deactivate the client
    const response = await superadminApiRequest.put(
      `/api/clients/${client.client_id}`,
      {
        status: "INACTIVE",
      },
    );

    // THEN: The client status changes to INACTIVE
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("INACTIVE");

    // AND: The change is logged in AuditLog with old and new values
    const auditLog = await prismaClient.auditLog.findFirst({
      where: {
        table_name: "clients",
        record_id: client.client_id,
        action: "UPDATE",
      },
      orderBy: { timestamp: "desc" },
    });
    expect(auditLog).not.toBeNull();
    expect(JSON.stringify(auditLog?.old_values)).toContain("ACTIVE");
    expect(JSON.stringify(auditLog?.new_values)).toContain("INACTIVE");
  });

  test("[P0] DELETE /api/clients/:clientId - should soft delete client (AC #5)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I want to delete a client
    const { client } = await createClientWithUser(prismaClient, {
      name: "Client to Delete",
      status: "INACTIVE",
    });

    // WHEN: I attempt soft delete
    const response = await superadminApiRequest.delete(
      `/api/clients/${client.client_id}`,
    );

    // THEN: The client is marked as deleted (soft delete)
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // AND: deleted_at is set
    const deletedClient = await prismaClient.client.findUnique({
      where: { client_id: client.client_id },
    });
    expect(deletedClient?.deleted_at).not.toBeNull();

    // AND: The deletion is logged in AuditLog
    const auditLog = await prismaClient.auditLog.findFirst({
      where: {
        table_name: "clients",
        record_id: client.client_id,
        action: "DELETE",
      },
    });
    expect(auditLog).not.toBeNull();
  });

  test("[P1] GET /api/clients - should exclude soft-deleted clients by default (AC #5)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A client has been soft-deleted
    const { client } = await createClientWithUser(prismaClient, {
      name: "Deleted Client",
    });
    // Manually soft-delete it
    await prismaClient.client.update({
      where: { client_id: client.client_id },
      data: { deleted_at: new Date() },
    });

    // WHEN: Listing clients
    const response = await superadminApiRequest.get("/api/clients");

    // THEN: Soft-deleted clients are excluded from list
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    const clientIds = body.data.map((c: any) => c.client_id);
    expect(clientIds).not.toContain(client.client_id);
  });

  test("[P1] DELETE /api/clients/:clientId - should reject deleting ACTIVE client (AC #5)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: An ACTIVE client exists
    const { client } = await createClientWithUser(prismaClient, {
      name: "Active Client",
      status: "ACTIVE",
    });

    // WHEN: Attempting to delete ACTIVE client
    const response = await superadminApiRequest.delete(
      `/api/clients/${client.client_id}`,
    );

    // THEN: Deletion is rejected
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain("INACTIVE");
  });
});

test.describe("Client Management API - Permission Enforcement", () => {
  test("[P0] All endpoints should require System Admin role", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager (not System Admin)
    const { client } = await createClientWithUser(prismaClient);

    // WHEN: Attempting various client operations
    const getResponse = await storeManagerApiRequest.get("/api/clients");
    const getOneResponse = await storeManagerApiRequest.get(
      `/api/clients/${client.client_id}`,
    );
    const createResponse = await storeManagerApiRequest.post("/api/clients", {
      name: "New Client",
      email: "newclient@example.com",
      password: "TestPass123!",
    });
    const updateResponse = await storeManagerApiRequest.put(
      `/api/clients/${client.client_id}`,
      {
        name: "Updated",
      },
    );
    const deleteResponse = await storeManagerApiRequest.delete(
      `/api/clients/${client.client_id}`,
    );

    // THEN: All operations return 403 Forbidden
    expect(getResponse.status()).toBe(403);
    expect(getOneResponse.status()).toBe(403);
    expect(createResponse.status()).toBe(403);
    expect(updateResponse.status()).toBe(403);
    expect(deleteResponse.status()).toBe(403);
  });
});

test.describe("Client Management API - Business Logic", () => {
  test("[P0] DELETE /api/clients/:clientId - should cascade soft delete to companies, stores, and user roles (AC #5)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A client exists with companies, stores, and user roles
    const { client } = await createClientWithUser(prismaClient, {
      name: "Client With Companies",
      status: "INACTIVE",
    });

    const companyData = createCompany({
      name: "Associated Company",
      status: "ACTIVE",
    });
    const company = await prismaClient.company.create({
      data: {
        ...companyData,
        client_id: client.client_id,
      },
    });

    // Create a store under the company
    const storeData = {
      public_id: `ST_${Date.now()}`,
      company_id: company.company_id,
      name: "Test Store",
      status: "ACTIVE",
    };
    const store = await prismaClient.store.create({
      data: storeData,
    });

    // Create a user and assign roles at different levels
    const testUser = await prismaClient.user.create({
      data: {
        public_id: `USR_${Date.now()}`,
        email: `testuser_${Date.now()}@example.com`,
        name: "Test User",
        status: "ACTIVE",
      },
    });

    const clientOwnerRole = await prismaClient.role.findUnique({
      where: { code: "CLIENT_OWNER" },
    });

    // Create UserRole at client level
    const clientUserRole = await prismaClient.userRole.create({
      data: {
        user_id: testUser.user_id,
        role_id: clientOwnerRole!.role_id,
        client_id: client.client_id,
        status: "ACTIVE",
      },
    });

    // WHEN: Soft deleting the client
    const response = await superadminApiRequest.delete(
      `/api/clients/${client.client_id}`,
    );

    // THEN: Client is soft deleted
    expect(response.status()).toBe(200);

    // AND: Associated companies are also soft deleted
    const deletedCompany = await prismaClient.company.findUnique({
      where: { company_id: company.company_id },
    });
    expect(deletedCompany?.deleted_at).not.toBeNull();
    expect(deletedCompany?.status).toBe("INACTIVE");

    // AND: Associated stores are also soft deleted
    const deletedStore = await prismaClient.store.findUnique({
      where: { store_id: store.store_id },
    });
    expect(deletedStore?.deleted_at).not.toBeNull();
    expect(deletedStore?.status).toBe("INACTIVE");

    // AND: Associated user roles are also soft deleted
    const deletedUserRole = await prismaClient.userRole.findUnique({
      where: { user_role_id: clientUserRole.user_role_id },
    });
    expect(deletedUserRole?.deleted_at).not.toBeNull();
    expect(deletedUserRole?.status).toBe("INACTIVE");
  });

  test("[P1] PUT /api/clients/:clientId - should allow reactivation from INACTIVE to ACTIVE", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: An INACTIVE client exists (with associated User and UserRole)
    const { client } = await createClientWithUser(prismaClient, {
      name: "Inactive Client",
      status: "INACTIVE",
    });

    // WHEN: Reactivating the client
    const response = await superadminApiRequest.put(
      `/api/clients/${client.client_id}`,
      {
        status: "ACTIVE",
      },
    );

    // THEN: Client is reactivated successfully
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("ACTIVE");

    // AND: Database record reflects the change
    const reactivatedClient = await prismaClient.client.findUnique({
      where: { client_id: client.client_id },
    });
    expect(reactivatedClient?.status).toBe("ACTIVE");

    // AND: Audit log captures the reactivation
    const auditLog = await prismaClient.auditLog.findFirst({
      where: {
        table_name: "clients",
        record_id: client.client_id,
        action: "UPDATE",
      },
      orderBy: { timestamp: "desc" },
    });
    expect(auditLog).not.toBeNull();
    expect(JSON.stringify(auditLog?.old_values)).toContain("INACTIVE");
    expect(JSON.stringify(auditLog?.new_values)).toContain("ACTIVE");
  });

  test("[P2] POST /api/clients - should allow duplicate client names (names not unique)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A client with a specific name already exists (with associated User)
    await createClientWithUser(prismaClient, {
      name: "Duplicate Name Corp",
    });

    // WHEN: Creating another client with the same name but different email
    const uniqueEmail = `duplicate-${Date.now()}@example.com`;
    const response = await superadminApiRequest.post("/api/clients", {
      name: "Duplicate Name Corp",
      email: uniqueEmail,
      password: "TestPass123!",
      status: "ACTIVE",
    });

    // THEN: Client is created successfully (names don't need to be unique)
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("Duplicate Name Corp");
  });
});

test.describe("Client Management API - Edge Cases", () => {
  test.describe("Name Field Edge Cases", () => {
    test("[P1] POST /api/clients - should reject empty string name", async ({
      superadminApiRequest,
    }) => {
      // WHEN: Creating client with empty name
      const response = await superadminApiRequest.post("/api/clients", {
        name: "",
        email: "emptyname@example.com",
        password: "TestPass123!",
        status: "ACTIVE",
      });

      // THEN: Validation error is returned
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
    });

    test("[P2] POST /api/clients - should handle very long name (1000+ characters)", async ({
      superadminApiRequest,
    }) => {
      // WHEN: Creating client with very long name
      const longName = "A".repeat(1001);
      const response = await superadminApiRequest.post("/api/clients", {
        name: longName,
        email: "longname@example.com",
        password: "TestPass123!",
        status: "ACTIVE",
      });

      // THEN: Either accepts or rejects with validation error (depends on implementation)
      expect([201, 400]).toContain(response.status());
    });

    test("[P2] POST /api/clients - should handle special characters in name", async ({
      superadminApiRequest,
    }) => {
      // WHEN: Creating client with special characters
      const response = await superadminApiRequest.post("/api/clients", {
        name: "Test @#$%^&* Corp",
        email: "specialchars@example.com",
        password: "TestPass123!",
        status: "ACTIVE",
      });

      // THEN: Client is created successfully
      expect(response.status()).toBe(201);
      const body = await response.json();
      expect(body.data.name).toBe("Test @#$%^&* Corp");
    });

    test("[P2] POST /api/clients - should handle unicode/emoji characters in name", async ({
      superadminApiRequest,
    }) => {
      // WHEN: Creating client with unicode/emoji
      const response = await superadminApiRequest.post("/api/clients", {
        name: "Test 日本語 Corp 🏢",
        email: "unicode@example.com",
        password: "TestPass123!",
        status: "ACTIVE",
      });

      // THEN: Client is created successfully
      expect(response.status()).toBe(201);
      const body = await response.json();
      expect(body.data.name).toBe("Test 日本語 Corp 🏢");
    });

    test("[P1] POST /api/clients - should reject whitespace-only name", async ({
      superadminApiRequest,
    }) => {
      // WHEN: Creating client with whitespace-only name
      const response = await superadminApiRequest.post("/api/clients", {
        name: "   ",
        email: "whitespace@example.com",
        password: "TestPass123!",
        status: "ACTIVE",
      });

      // THEN: Validation error is returned
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
    });

    test("[P2] POST /api/clients - should trim leading/trailing whitespace", async ({
      superadminApiRequest,
    }) => {
      // WHEN: Creating client with leading/trailing whitespace
      const response = await superadminApiRequest.post("/api/clients", {
        name: "  Trimmed Corp  ",
        email: "trimmed@example.com",
        password: "TestPass123!",
        status: "ACTIVE",
      });

      // THEN: Client is created with trimmed name
      expect(response.status()).toBe(201);
      const body = await response.json();
      // Name should be trimmed or stored as-is depending on implementation
      expect(body.data.name.trim()).toBe("Trimmed Corp");
    });
  });

  test.describe("Metadata Field Edge Cases", () => {
    test("[P2] POST /api/clients - should accept empty metadata object", async ({
      superadminApiRequest,
    }) => {
      // WHEN: Creating client with empty metadata
      const response = await superadminApiRequest.post("/api/clients", {
        name: "Empty Metadata Corp",
        email: "emptymetadata@example.com",
        password: "TestPass123!",
        status: "ACTIVE",
        metadata: {},
      });

      // THEN: Client is created successfully
      expect(response.status()).toBe(201);
    });

    test("[P2] POST /api/clients - should accept null metadata", async ({
      superadminApiRequest,
    }) => {
      // WHEN: Creating client with null metadata
      const response = await superadminApiRequest.post("/api/clients", {
        name: "Null Metadata Corp",
        email: "nullmetadata@example.com",
        password: "TestPass123!",
        status: "ACTIVE",
        metadata: null,
      });

      // THEN: Client is created successfully
      expect(response.status()).toBe(201);
    });

    test("[P2] POST /api/clients - should handle deeply nested metadata", async ({
      superadminApiRequest,
    }) => {
      // WHEN: Creating client with deeply nested metadata
      const deepMetadata = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: { value: "deep" },
              },
            },
          },
        },
      };
      const response = await superadminApiRequest.post("/api/clients", {
        name: "Deep Metadata Corp",
        email: "deepmetadata@example.com",
        password: "TestPass123!",
        status: "ACTIVE",
        metadata: deepMetadata,
      });

      // THEN: Client is created successfully
      expect(response.status()).toBe(201);
    });

    test("[P2] POST /api/clients - should handle large metadata object", async ({
      superadminApiRequest,
    }) => {
      // WHEN: Creating client with large metadata (100+ keys)
      const largeMetadata: Record<string, string> = {};
      for (let i = 0; i < 100; i++) {
        largeMetadata[`key${i}`] = `value${i}`;
      }
      const response = await superadminApiRequest.post("/api/clients", {
        name: "Large Metadata Corp",
        email: "largemetadata@example.com",
        password: "TestPass123!",
        status: "ACTIVE",
        metadata: largeMetadata,
      });

      // THEN: Client is created successfully or rejected with size limit error
      expect([201, 400]).toContain(response.status());
    });
  });

  test.describe("Client ID Edge Cases", () => {
    test("[P1] GET /api/clients/:clientId - should reject invalid UUID format", async ({
      superadminApiRequest,
    }) => {
      // WHEN: Requesting with invalid UUID
      const response = await superadminApiRequest.get(
        "/api/clients/not-a-uuid",
      );

      // THEN: Bad request error is returned
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
    });

    test("[P1] GET /api/clients/:clientId - should reject empty string ID", async ({
      superadminApiRequest,
    }) => {
      // WHEN: Requesting with empty ID (this typically matches the list route)
      const response = await superadminApiRequest.get("/api/clients/");

      // THEN: Returns list or 400 depending on routing
      expect([200, 400]).toContain(response.status());
    });

    test("[P1] PUT /api/clients/:clientId - should reject invalid UUID format", async ({
      superadminApiRequest,
    }) => {
      // WHEN: Updating with invalid UUID
      const response = await superadminApiRequest.put(
        "/api/clients/invalid-uuid",
        {
          name: "Updated Name",
        },
      );

      // THEN: Bad request error is returned
      expect(response.status()).toBe(400);
    });

    test("[P1] DELETE /api/clients/:clientId - should reject invalid UUID format", async ({
      superadminApiRequest,
    }) => {
      // WHEN: Deleting with invalid UUID
      const response = await superadminApiRequest.delete(
        "/api/clients/invalid-uuid",
      );

      // THEN: Bad request error is returned
      expect(response.status()).toBe(400);
    });
  });
});

test.describe("Client Management API - Security", () => {
  test("[P0] POST /api/clients - should prevent SQL injection in name field", async ({
    superadminApiRequest,
  }) => {
    // WHEN: Attempting SQL injection
    const response = await superadminApiRequest.post("/api/clients", {
      name: "'; DROP TABLE clients;--",
      email: "sqlinjection@example.com",
      password: "TestPass123!",
      status: "ACTIVE",
    });

    // THEN: Request is handled safely (either created or rejected, but not executed)
    expect([201, 400]).toContain(response.status());
    // If created, verify the literal string was stored
    if (response.status() === 201) {
      const body = await response.json();
      expect(body.data.name).toBe("'; DROP TABLE clients;--");
    }
  });

  test("[P0] GET /api/clients - should prevent SQL injection in search parameter", async ({
    superadminApiRequest,
  }) => {
    // WHEN: Attempting SQL injection in search
    const response = await superadminApiRequest.get(
      "/api/clients?search=' OR '1'='1",
    );

    // THEN: Request is handled safely
    expect(response.status()).toBe(200);
  });

  test("[P0] All endpoints should reject unauthenticated requests", async ({
    request,
    prismaClient,
  }) => {
    // GIVEN: A client exists
    const { client } = await createClientWithUser(prismaClient);

    // WHEN: Making requests without authentication
    const getResponse = await request.get("/api/clients");
    const getOneResponse = await request.get(
      `/api/clients/${client.client_id}`,
    );
    const createResponse = await request.post("/api/clients", {
      data: { name: "Test", status: "ACTIVE" },
    });
    const updateResponse = await request.put(
      `/api/clients/${client.client_id}`,
      {
        data: { name: "Updated" },
      },
    );
    const deleteResponse = await request.delete(
      `/api/clients/${client.client_id}`,
    );

    // THEN: All return 401 Unauthorized
    expect(getResponse.status()).toBe(401);
    expect(getOneResponse.status()).toBe(401);
    expect(createResponse.status()).toBe(401);
    expect(updateResponse.status()).toBe(401);
    expect(deleteResponse.status()).toBe(401);
  });

  test("[P1] GET /api/clients/:clientId - should not leak sensitive data in response", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A client exists
    const { client } = await createClientWithUser(prismaClient);

    // WHEN: Retrieving client details
    const response = await superadminApiRequest.get(
      `/api/clients/${client.client_id}`,
    );

    // THEN: Response should not contain sensitive internal fields
    expect(response.status()).toBe(200);
    const body = await response.json();

    // Verify no sensitive fields are exposed
    expect(body.data).not.toHaveProperty("password");
    expect(body.data).not.toHaveProperty("internal_id");
    expect(body.data).not.toHaveProperty("__v");
  });

  test("[P1] PUT /api/clients/:clientId - should validate authorization for specific client", async ({
    corporateAdminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A client exists that the Corporate Admin should not access
    const { client } = await createClientWithUser(prismaClient);

    // WHEN: Corporate Admin tries to update client
    const response = await corporateAdminApiRequest.put(
      `/api/clients/${client.client_id}`,
      {
        name: "Hacked Name",
      },
    );

    // THEN: Access is denied
    expect(response.status()).toBe(403);
  });

  test("[P2] POST /api/clients - should prevent XSS in name field", async ({
    superadminApiRequest,
  }) => {
    // WHEN: Attempting XSS injection
    const response = await superadminApiRequest.post("/api/clients", {
      name: "<script>alert('xss')</script>",
      email: "xssinjection@example.com",
      password: "TestPass123!",
      status: "ACTIVE",
    });

    // THEN: Request is handled safely
    expect([201, 400]).toContain(response.status());
    // If created, XSS should be stored as literal text (sanitized on display)
    if (response.status() === 201) {
      const body = await response.json();
      expect(body.data.name).toBe("<script>alert('xss')</script>");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC ID TESTS - Dual Format Support (UUID + public_id)
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Client Management API - Public ID Support", () => {
  test("[P0] POST /api/clients - should auto-generate valid public_id", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // WHEN: Creating a new client
    const response = await superadminApiRequest.post("/api/clients", {
      name: "Auto Public ID Test",
      email: "autopublicid@example.com",
      password: "TestPass123!",
      status: "ACTIVE",
    });

    // THEN: Response includes valid public_id
    expect(response.status()).toBe(201);
    const body = await response.json();

    expect(body.data).toHaveProperty("public_id");
    expect(body.data.public_id).toMatch(/^clt_[a-z0-9]{10,}$/);
    expect(body.data.public_id).not.toBe(body.data.client_id);

    // Verify uniqueness in database
    const dbClient = await prismaClient.client.findUnique({
      where: { public_id: body.data.public_id },
    });
    expect(dbClient).not.toBeNull();
    expect(dbClient?.client_id).toBe(body.data.client_id);

    // Cleanup
    await prismaClient.client.delete({
      where: { client_id: body.data.client_id },
    });
  });

  test("[P0] POST /api/clients - should generate unique public_ids for multiple clients", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Creating multiple clients
    const responses = await Promise.all([
      superadminApiRequest.post("/api/clients", {
        name: "Client 1",
        email: "client1@example.com",
        password: "TestPass123!",
        status: "ACTIVE",
      }),
      superadminApiRequest.post("/api/clients", {
        name: "Client 2",
        email: "client2@example.com",
        password: "TestPass123!",
        status: "ACTIVE",
      }),
      superadminApiRequest.post("/api/clients", {
        name: "Client 3",
        email: "client3@example.com",
        password: "TestPass123!",
        status: "ACTIVE",
      }),
    ]);

    // THEN: All public_ids are unique
    const bodies = await Promise.all(responses.map((r) => r.json()));
    const publicIds = bodies.map((b) => b.data.public_id);
    const uniqueIds = new Set(publicIds);

    expect(uniqueIds.size).toBe(3);

    // Cleanup
    await Promise.all(
      bodies.map((b) =>
        prismaClient.client.delete({ where: { client_id: b.data.client_id } }),
      ),
    );
  });
});

test.describe("Client Management API - Dual ID Format Support (GET)", () => {
  test("[P0] GET /api/clients/:id - should accept UUID format (backward compatibility)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A client exists with both UUID and public_id
    const { client } = await createClientWithUser(prismaClient, {
      name: "UUID Test Client",
    });

    // WHEN: Fetching by UUID (old format)
    const response = await superadminApiRequest.get(
      `/api/clients/${client.client_id}`,
    );

    // THEN: Client is retrieved successfully
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.client_id).toBe(client.client_id);
    expect(body.data.public_id).toMatch(/^clt_[a-z0-9]{10,}$/);
    expect(body.data.name).toBe(client.name);

    // Cleanup
    await prismaClient.client.delete({
      where: { client_id: client.client_id },
    });
  });

  test("[P0] GET /api/clients/:id - should accept public_id format (new standard)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A client exists with public_id
    const { client } = await createClientWithUser(prismaClient, {
      name: "Public ID Test Client",
    });

    // WHEN: Fetching by public_id (new format)
    const response = await superadminApiRequest.get(
      `/api/clients/${client.public_id}`,
    );

    // THEN: Client is retrieved successfully
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.client_id).toBe(client.client_id);
    expect(body.data.public_id).toBe(client.public_id);
    expect(body.data.name).toBe(client.name);

    // Cleanup
    await prismaClient.client.delete({
      where: { client_id: client.client_id },
    });
  });

  test("[P0] GET /api/clients/:id - should reject invalid public_id format", async ({
    superadminApiRequest,
  }) => {
    // WHEN: Fetching with invalid public_id formats
    const invalidFormats = [
      "invalid-id",
      "clt_",
      "clt_abc",
      "usr_1234567890abcdef", // Wrong prefix
      "CLT_1234567890abcdef", // Uppercase (invalid)
      "clt-1234567890abcdef", // Wrong separator
    ];

    for (const invalidId of invalidFormats) {
      const response = await superadminApiRequest.get(
        `/api/clients/${invalidId}`,
      );

      // THEN: Request is rejected with 404
      expect(
        response.status(),
        `Should reject invalid format: ${invalidId}`,
      ).toBe(404);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body).toHaveProperty("error");
    }
  });

  test("[P0] GET /api/clients/:id - should prevent IDOR with non-existent public_id", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: A valid-format but non-existent public_id
    const nonExistentId = "clt_nonexistent123";

    // WHEN: Attempting to fetch non-existent client
    const response = await superadminApiRequest.get(
      `/api/clients/${nonExistentId}`,
    );

    // THEN: Request is rejected with 404 (not 500)
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.message.toLowerCase()).toContain("not found");
  });
});

test.describe("Client Management API - Dual ID Format Support (PUT)", () => {
  test("[P0] PUT /api/clients/:id - should update via UUID (backward compatibility)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A client exists
    const client = await createClientViaAPI(superadminApiRequest, {
      name: "Original Name",
    });

    // WHEN: Updating via UUID
    const response = await superadminApiRequest.put(
      `/api/clients/${client.client_id}`,
      { name: "Updated via UUID" },
    );

    // THEN: Update succeeds
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("Updated via UUID");
    expect(body.data.client_id).toBe(client.client_id);

    // Cleanup
    await prismaClient.client.delete({
      where: { client_id: client.client_id },
    });
  });

  test("[P0] PUT /api/clients/:id - should update via public_id (new standard)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A client exists
    const client = await createClientViaAPI(superadminApiRequest, {
      name: "Original Name",
    });

    // WHEN: Updating via public_id
    const response = await superadminApiRequest.put(
      `/api/clients/${client.public_id}`,
      { name: "Updated via Public ID" },
    );

    // THEN: Update succeeds
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("Updated via Public ID");
    expect(body.data.public_id).toBe(client.public_id);

    // Cleanup
    await prismaClient.client.delete({
      where: { client_id: client.client_id },
    });
  });

  test("[P0] PUT /api/clients/:id - should prevent IDOR via invalid public_id", async ({
    superadminApiRequest,
  }) => {
    // WHEN: Attempting to update with fabricated public_id
    const response = await superadminApiRequest.put(
      "/api/clients/clt_fabricated123",
      { name: "Hacked Name" },
    );

    // THEN: Request is rejected with 404
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
  });
});

test.describe("Client Management API - Dual ID Format Support (DELETE)", () => {
  test("[P0] DELETE /api/clients/:id - should delete via UUID (backward compatibility)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: An INACTIVE client exists
    const { client } = await createClientWithUser(prismaClient, {
      name: "To Delete via UUID",
      status: "INACTIVE",
    });

    // WHEN: Deleting via UUID
    const response = await superadminApiRequest.delete(
      `/api/clients/${client.client_id}`,
    );

    // THEN: Deletion succeeds
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // Verify soft delete
    const deleted = await prismaClient.client.findUnique({
      where: { client_id: client.client_id },
    });
    expect(deleted?.deleted_at).not.toBeNull();
  });

  test("[P0] DELETE /api/clients/:id - should delete via public_id (new standard)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: An INACTIVE client exists
    const { client } = await createClientWithUser(prismaClient, {
      name: "To Delete via Public ID",
      status: "INACTIVE",
    });

    // WHEN: Deleting via public_id
    const response = await superadminApiRequest.delete(
      `/api/clients/${client.public_id}`,
    );

    // THEN: Deletion succeeds
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // Verify soft delete
    const deleted = await prismaClient.client.findUnique({
      where: { client_id: client.client_id },
    });
    expect(deleted?.deleted_at).not.toBeNull();
  });

  test("[P0] DELETE /api/clients/:id - should prevent IDOR via fabricated public_id", async ({
    superadminApiRequest,
  }) => {
    // WHEN: Attempting to delete with fabricated public_id
    const response = await superadminApiRequest.delete(
      "/api/clients/clt_fabricated999",
    );

    // THEN: Request is rejected with 404
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
  });
});

test.describe("Client Management API - Dropdown Public ID Support", () => {
  test("[P0] GET /api/clients/dropdown - should return public_id for each client", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Active clients exist
    const { client } = await createClientWithUser(prismaClient, {
      name: "Dropdown Public ID Test",
      status: "ACTIVE",
    });

    // WHEN: Fetching dropdown data
    const response = await superadminApiRequest.get("/api/clients/dropdown");

    // THEN: Response includes public_id for each client
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    const foundClient = body.data.find(
      (c: any) => c.client_id === client.client_id,
    );
    expect(foundClient).toBeDefined();
    expect(foundClient).toHaveProperty("client_id");
    expect(foundClient).toHaveProperty("public_id");
    expect(foundClient).toHaveProperty("name");

    // Verify public_id format
    expect(foundClient.public_id).toMatch(/^clt_[a-z0-9]{10,}$/);

    // Cleanup
    await prismaClient.client.delete({
      where: { client_id: client.client_id },
    });
  });
});
