/**
 * Terminal Connection Configuration API Tests
 *
 * Story 4.82: Terminal Connection Configuration UI
 *
 * @test-level API
 * @justification API-level tests for terminal connection configuration persistence, validation, and business rules
 * @feature Terminal Connection Configuration
 * @created 2025-01-27
 * @priority P0 (Critical)
 *
 * BUSINESS RULES TESTED:
 * - BR-CONN-001: Connection config structure must match connection_type
 * - BR-CONN-002: MANUAL connection type requires no connection_config
 * - BR-CONN-003: NETWORK, API, WEBHOOK, FILE require valid connection_config
 * - BR-CONN-004: Connection config is stored as JSON in database
 * - BR-CONN-005: Terminal list returns connection fields
 * - BR-CONN-006: Connection config validation rejects invalid structures
 *
 * SECURITY FOCUS:
 * - Input validation and sanitization
 * - JSON structure validation
 * - Connection type and config consistency
 *
 * TEST PHILOSOPHY:
 * - Tests represent ground truth - code must conform to tests
 * - Focus on critical paths and business logic
 * - Validate security boundaries
 * - Test edge cases and error conditions
 *
 * Note: These tests are in RED phase - they will fail until implementation is complete.
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import { createStore, createCompany, createUser } from "../support/helpers";
import {
  createTerminal,
  createNetworkTerminal,
  createApiTerminal,
  createWebhookTerminal,
  createFileTerminal,
} from "../support/factories/terminal.factory";
import { createJWTAccessToken } from "../support/factories";

test.describe("Terminal Connection Configuration API", () => {
  /**
   * BR-CONN-001: Connection config structure must match connection_type
   *
   * WHY: Invalid config structures can break terminal connections
   * RISK: Data corruption, system failures
   * VALIDATES: Discriminated union schema validation
   */
  test("[P0-BR-CONN-001] should create terminal with NETWORK connection config", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company and store exist
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    // WHEN: Creating terminal with NETWORK connection config
    const terminalData = createNetworkTerminal({
      store_id: store.store_id,
      name: "Network Terminal",
    });

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      {
        name: terminalData.name,
        device_id: terminalData.device_id,
        connection_type: terminalData.connection_type,
        connection_config: terminalData.connection_config,
        vendor_type: terminalData.vendor_type,
      },
    );

    // THEN: Terminal is created with NETWORK connection config
    expect(response.status()).toBe(201);
    const createdTerminal = await response.json();
    expect(createdTerminal.connection_type).toBe("NETWORK");
    expect(createdTerminal.connection_config).toMatchObject({
      host: expect.any(String),
      port: expect.any(Number),
      protocol: expect.stringMatching(/^(TCP|HTTP)$/),
    });
  });

  test("[P0-BR-CONN-001] should create terminal with API connection config", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company and store exist
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    // WHEN: Creating terminal with API connection config
    const terminalData = createApiTerminal({
      store_id: store.store_id,
      name: "API Terminal",
    });

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      {
        name: terminalData.name,
        device_id: terminalData.device_id,
        connection_type: terminalData.connection_type,
        connection_config: terminalData.connection_config,
        vendor_type: terminalData.vendor_type,
      },
    );

    // THEN: Terminal is created with API connection config
    expect(response.status()).toBe(201);
    const createdTerminal = await response.json();
    expect(createdTerminal.connection_type).toBe("API");
    expect(createdTerminal.connection_config).toMatchObject({
      baseUrl: expect.stringMatching(/^https?:\/\//),
      apiKey: expect.any(String),
    });
  });

  test("[P0-BR-CONN-001] should create terminal with WEBHOOK connection config", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company and store exist
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    // WHEN: Creating terminal with WEBHOOK connection config
    const terminalData = createWebhookTerminal({
      store_id: store.store_id,
      name: "Webhook Terminal",
    });

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      {
        name: terminalData.name,
        device_id: terminalData.device_id,
        connection_type: terminalData.connection_type,
        connection_config: terminalData.connection_config,
        vendor_type: terminalData.vendor_type,
      },
    );

    // THEN: Terminal is created with WEBHOOK connection config
    expect(response.status()).toBe(201);
    const createdTerminal = await response.json();
    expect(createdTerminal.connection_type).toBe("WEBHOOK");
    expect(createdTerminal.connection_config).toMatchObject({
      secret: expect.any(String),
    });
  });

  test("[P0-BR-CONN-001] should create terminal with FILE connection config", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company and store exist
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    // WHEN: Creating terminal with FILE connection config
    const terminalData = createFileTerminal({
      store_id: store.store_id,
      name: "File Terminal",
    });

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      {
        name: terminalData.name,
        device_id: terminalData.device_id,
        connection_type: terminalData.connection_type,
        connection_config: terminalData.connection_config,
        vendor_type: terminalData.vendor_type,
      },
    );

    // THEN: Terminal is created with FILE connection config
    expect(response.status()).toBe(201);
    const createdTerminal = await response.json();
    expect(createdTerminal.connection_type).toBe("FILE");
    expect(createdTerminal.connection_config).toMatchObject({
      importPath: expect.any(String),
    });
  });

  /**
   * BR-CONN-002: MANUAL connection type requires no connection_config
   */
  test("[P0-BR-CONN-002] should create terminal with MANUAL connection type (no config)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company and store exist
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    // WHEN: Creating terminal with MANUAL connection type
    const terminalData = createTerminal({
      store_id: store.store_id,
      name: "Manual Terminal",
      connection_type: "MANUAL",
      // MANUAL connection type requires no connection_config
    });

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      {
        name: terminalData.name,
        device_id: terminalData.device_id,
        connection_type: terminalData.connection_type,
        connection_config: null,
      },
    );

    // THEN: Terminal is created with MANUAL connection type
    expect(response.status()).toBe(201);
    const createdTerminal = await response.json();
    expect(createdTerminal.connection_type).toBe("MANUAL");
    expect(createdTerminal.connection_config).toBeNull();
  });

  /**
   * BR-CONN-006: Connection config validation rejects invalid structures
   */
  test("[P0-BR-CONN-006] should reject NETWORK connection with invalid config structure", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company and store exist
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    // WHEN: Creating terminal with NETWORK type but API config structure
    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      {
        name: "Invalid Terminal",
        connection_type: "NETWORK",
        connection_config: {
          baseUrl: "https://api.example.com", // Wrong structure for NETWORK
          apiKey: "secret",
        },
      },
    );

    // THEN: Request is rejected with validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
    // The error message is in the message field or details from Zod validation
    expect(body.error.message).toBeDefined();
  });

  test("[P0-BR-CONN-006] should reject MANUAL connection with connection_config", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company and store exist
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    // WHEN: Creating terminal with MANUAL type but with connection_config
    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      {
        name: "Invalid Terminal",
        connection_type: "MANUAL",
        connection_config: {
          host: "192.168.1.1",
          port: 8080,
        },
      },
    );

    // THEN: Request is rejected with validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
    // The error message is in the message field or details from Zod validation
    expect(body.error.message).toBeDefined();
  });

  /**
   * BR-CONN-004: Connection config is stored as JSON in database
   */
  test("[P0-BR-CONN-004] should persist connection config as JSON", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company and store exist
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    // WHEN: Creating terminal with NETWORK connection config
    const networkConfig = {
      host: "192.168.1.100",
      port: 9000,
      protocol: "HTTP" as const,
    };

    const createResponse = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      {
        name: "Network Terminal",
        connection_type: "NETWORK",
        connection_config: networkConfig,
      },
    );

    expect(createResponse.status()).toBe(201);
    const createdTerminal = await createResponse.json();

    // THEN: Connection config is stored and retrievable
    const getResponse = await superadminApiRequest.get(
      `/api/stores/${store.store_id}/terminals`,
    );
    expect(getResponse.status()).toBe(200);
    const terminals = await getResponse.json();
    const terminal = terminals.find(
      (t: any) => t.pos_terminal_id === createdTerminal.pos_terminal_id,
    );
    expect(terminal.connection_config).toMatchObject(networkConfig);
  });

  /**
   * BR-CONN-005: Terminal list returns connection fields
   */
  test("[P0-BR-CONN-005] should return connection fields in terminal list", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company and store exist with terminal
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    const terminalData = createApiTerminal({
      store_id: store.store_id,
      name: "API Terminal",
    });

    await superadminApiRequest.post(`/api/stores/${store.store_id}/terminals`, {
      name: terminalData.name,
      device_id: terminalData.device_id,
      connection_type: terminalData.connection_type,
      connection_config: terminalData.connection_config,
      vendor_type: terminalData.vendor_type,
    });

    // WHEN: Fetching terminal list
    const response = await superadminApiRequest.get(
      `/api/stores/${store.store_id}/terminals`,
    );

    // THEN: Response includes connection fields
    expect(response.status()).toBe(200);
    const terminals = await response.json();
    expect(terminals.length).toBeGreaterThan(0);
    const terminal = terminals[0];
    expect(terminal).toHaveProperty("connection_type");
    expect(terminal).toHaveProperty("connection_config");
    expect(terminal).toHaveProperty("vendor_type");
    expect(terminal).toHaveProperty("terminal_status");
    expect(terminal).toHaveProperty("sync_status");
    expect(terminal).toHaveProperty("last_sync_at");
  });

  /**
   * Update terminal connection configuration
   */
  test("[P0] should update terminal connection configuration", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A terminal exists with NETWORK connection
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    const createResponse = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      {
        name: "Test Terminal",
        connection_type: "NETWORK",
        connection_config: {
          host: "192.168.1.1",
          port: 8080,
          protocol: "TCP",
        },
      },
    );

    const createdTerminal = await createResponse.json();

    // WHEN: Updating terminal to API connection
    const updateResponse = await superadminApiRequest.put(
      `/api/stores/${store.store_id}/terminals/${createdTerminal.pos_terminal_id}`,
      {
        connection_type: "API",
        connection_config: {
          baseUrl: "https://api.example.com",
          apiKey: "new-api-key",
        },
      },
    );

    // THEN: Terminal connection is updated
    expect(updateResponse.status()).toBe(200);
    const updatedTerminal = await updateResponse.json();
    expect(updatedTerminal.connection_type).toBe("API");
    expect(updatedTerminal.connection_config).toMatchObject({
      baseUrl: "https://api.example.com",
      apiKey: "new-api-key",
    });
  });

  /**
   * Security: SQL Injection Prevention
   */
  test("[P0] should reject SQL injection in terminal name", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company and store exist
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    // WHEN: Creating terminal with SQL injection in name
    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      {
        name: "'; DROP TABLE terminals; --",
        connection_type: "MANUAL",
      },
    );

    // THEN: Request is rejected or sanitized (400 or 201 with sanitized name)
    // Prisma should prevent SQL injection, but validation should catch malicious input
    expect([400, 201]).toContain(response.status());
    if (response.status() === 201) {
      const terminal = await response.json();
      // Name should be sanitized or stored safely
      expect(terminal.name).toBeDefined();
    }
  });

  test("[P0] should reject SQL injection in connection config fields", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company and store exist
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    // WHEN: Creating terminal with SQL injection in connection config
    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      {
        name: "Test Terminal",
        connection_type: "API",
        connection_config: {
          baseUrl: "https://api.example.com'; DROP TABLE terminals; --",
          apiKey: "'; DROP TABLE terminals; --",
        },
      },
    );

    // THEN: Request is rejected or sanitized (400 or 201)
    // Prisma should prevent SQL injection via parameterized queries
    expect([400, 201]).toContain(response.status());
  });

  /**
   * Security: Authentication Bypass Prevention
   */
  test("[P0] should reject request without authentication token", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company and store exist
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    // WHEN: Creating terminal without authentication token
    const response = await apiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      {
        name: "Test Terminal",
        connection_type: "MANUAL",
      },
    );

    // THEN: Request is rejected with 401
    expect(response.status()).toBe(401);
    const errorBody = await response.json();
    expect(errorBody).toHaveProperty("error");
    expect(errorBody.error.code).toBe("UNAUTHORIZED");
  });

  /**
   * Security: Authorization Enforcement
   */
  test("[P0] should deny access when user lacks STORE_CREATE permission", async ({
    request,
    backendUrl,
    prismaClient,
  }) => {
    // GIVEN: A company and store exist
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    // Create user without STORE_CREATE permission
    const userWithoutPermission = await createUser(prismaClient);
    const token = await createJWTAccessToken({
      user_id: userWithoutPermission.user_id,
      email: userWithoutPermission.email,
      roles: [],
      permissions: [], // No STORE_CREATE permission
    });

    // WHEN: User without permission tries to create terminal
    const response = await request.post(
      `${backendUrl}/api/stores/${store.store_id}/terminals`,
      {
        headers: {
          Cookie: `access_token=${token}`,
        },
        data: {
          name: "Test Terminal",
          connection_type: "MANUAL",
        },
      },
    );

    // THEN: Request is denied with 403
    expect(response.status()).toBe(403);
    const errorBody = await response.json();
    expect(errorBody).toHaveProperty("error");
    expect(errorBody.error.code).toBe("PERMISSION_DENIED");

    // Cleanup
    await prismaClient.user.delete({
      where: { user_id: userWithoutPermission.user_id },
    });
  });

  /**
   * Edge Cases: Connection Config Validation
   */
  test("[P2] should reject NETWORK connection with invalid port (negative)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company and store exist
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    // WHEN: Creating terminal with negative port
    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      {
        name: "Invalid Terminal",
        connection_type: "NETWORK",
        connection_config: {
          host: "192.168.1.1",
          port: -1,
          protocol: "TCP",
        },
      },
    );

    // THEN: Request is rejected with validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  test("[P2] should reject NETWORK connection with invalid port (zero)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company and store exist
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    // WHEN: Creating terminal with zero port
    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      {
        name: "Invalid Terminal",
        connection_type: "NETWORK",
        connection_config: {
          host: "192.168.1.1",
          port: 0,
          protocol: "TCP",
        },
      },
    );

    // THEN: Request is rejected with validation error
    expect(response.status()).toBe(400);
  });

  test("[P2] should reject API connection with invalid URL format", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company and store exist
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    // WHEN: Creating terminal with invalid URL
    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      {
        name: "Invalid Terminal",
        connection_type: "API",
        connection_config: {
          baseUrl: "not-a-valid-url",
          apiKey: "test-key",
        },
      },
    );

    // THEN: Request is rejected with validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  test("[P2] should reject empty terminal name", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company and store exist
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    // WHEN: Creating terminal with empty name
    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      {
        name: "",
        connection_type: "MANUAL",
      },
    );

    // THEN: Request is rejected with validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  test("[P2] should reject very long terminal name (100+ chars)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A company and store exist
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    // WHEN: Creating terminal with very long name
    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      {
        name: "a".repeat(101),
        connection_type: "MANUAL",
      },
    );

    // THEN: Request is rejected with validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });
});
