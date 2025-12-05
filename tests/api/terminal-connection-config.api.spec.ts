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
    // Zod validation errors include details array, service-level errors have message
    expect(body.error.details || body.error.message).toBeDefined();
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
    // Zod validation errors include details array
    expect(body.error.details || body.error.message).toBeDefined();
    // Zod validation errors include details array, service-level errors have message
    expect(body.error.details || body.error.message).toBeDefined();
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
   *
   * WHY: Verify that malicious input cannot corrupt the database
   * SECURITY: Prisma uses parameterized queries which prevent SQL injection
   * VALIDATES: Input is safely stored (not executed as SQL)
   */
  test("[P0] should safely handle SQL injection attempt in terminal name", async ({
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

    const maliciousName = "'; DROP TABLE terminals; --";

    // WHEN: Creating terminal with SQL injection attempt in name
    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      {
        name: maliciousName,
        connection_type: "MANUAL",
      },
    );

    // THEN: Terminal is created with the literal string (Prisma parameterized queries)
    // The malicious string is stored as data, not executed as SQL
    expect(response.status()).toBe(201);
    const terminal = await response.json();
    expect(terminal.name).toBe(maliciousName);

    // Verify the terminals table still exists by querying it
    const terminalsExist = await prismaClient.pOSTerminal.findMany({
      where: { store_id: store.store_id },
    });
    expect(terminalsExist.length).toBeGreaterThan(0);
  });

  test("[P0] should safely handle SQL injection attempt in connection config", async ({
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

    const maliciousApiKey = "'; DROP TABLE terminals; --";

    // WHEN: Creating terminal with SQL injection in connection config
    // Note: baseUrl validation will reject invalid URLs, so we use a valid URL
    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      {
        name: "Test Terminal",
        connection_type: "API",
        connection_config: {
          baseUrl: "https://api.example.com/test",
          apiKey: maliciousApiKey,
        },
      },
    );

    // THEN: Terminal is created with malicious string stored safely as JSON
    expect(response.status()).toBe(201);
    const terminal = await response.json();
    expect(terminal.connection_config.apiKey).toBe(maliciousApiKey);

    // Verify database integrity - terminals table still exists
    const count = await prismaClient.pOSTerminal.count();
    expect(count).toBeGreaterThan(0);
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
    expect(errorBody.success).toBe(false);
    expect(errorBody.error).toHaveProperty("code", "UNAUTHORIZED");
    expect(errorBody.error).toHaveProperty("message");
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
    expect(errorBody.success).toBe(false);
    expect(errorBody.error).toHaveProperty("code", "PERMISSION_DENIED");
    expect(errorBody.error).toHaveProperty("message");
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
    expect(body.success).toBe(false);
    expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
    expect(body.error.details || body.error.message).toBeDefined();
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
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
    expect(body.error.details || body.error.message).toBeDefined();
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
    expect(body.success).toBe(false);
    expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
    expect(body.error.details || body.error.message).toBeDefined();
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
    expect(body.success).toBe(false);
    expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
    expect(body.error.details || body.error.message).toBeDefined();
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
    expect(body.success).toBe(false);
    expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
    expect(body.error.details || body.error.message).toBeDefined();
  });

  /**
   * Additional Coverage: Port boundary validation
   *
   * NOTE: The schema validates port as a positive integer but doesn't enforce
   * the TCP/IP port range (1-65535). Ports above 65535 will pass schema validation
   * but may be rejected by business logic or network layer. This test documents
   * the current behavior - schema accepts any positive integer.
   */
  test("[P2] should accept NETWORK connection with port above 65535 (schema allows)", async ({
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

    // WHEN: Creating terminal with port above TCP/IP valid range
    // The schema only validates positive integer, not port range
    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      {
        name: "Test Terminal",
        connection_type: "NETWORK",
        connection_config: {
          host: "192.168.1.1",
          port: 65536,
          protocol: "TCP",
        },
      },
    );

    // THEN: Request is accepted (schema validation passes)
    // Business logic may reject this later, but schema allows it
    expect(response.status()).toBe(201);
    const terminal = await response.json();
    expect(terminal.connection_config.port).toBe(65536);
  });

  /**
   * Additional Coverage: Missing required fields in connection config
   */
  test("[P1] should reject NETWORK connection missing host", async ({
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

    // WHEN: Creating terminal with NETWORK type but missing host
    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      {
        name: "Test Terminal",
        connection_type: "NETWORK",
        connection_config: {
          port: 8080,
          protocol: "TCP",
        },
      },
    );

    // THEN: Request is rejected with validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
    // Zod validation errors include details array
    expect(body.error.details || body.error.message).toBeDefined();
  });

  /**
   * Additional Coverage: Missing required fields in connection config
   */
  test("[P1] should reject NETWORK connection missing port", async ({
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

    // WHEN: Creating terminal with NETWORK type but missing port
    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      {
        name: "Test Terminal",
        connection_type: "NETWORK",
        connection_config: {
          host: "192.168.1.1",
          protocol: "TCP",
        },
      },
    );

    // THEN: Request is rejected with validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
    expect(body.error.details || body.error.message).toBeDefined();
  });

  test("[P1] should reject NETWORK connection missing protocol", async ({
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

    // WHEN: Creating terminal with NETWORK type but missing protocol
    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      {
        name: "Test Terminal",
        connection_type: "NETWORK",
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
    expect(body.error.details || body.error.message).toBeDefined();
  });

  test("[P1] should reject API connection missing baseUrl", async ({
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

    // WHEN: Creating terminal with API type but missing baseUrl
    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      {
        name: "Test Terminal",
        connection_type: "API",
        connection_config: {
          apiKey: "test-key",
        },
      },
    );

    // THEN: Request is rejected with validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
    expect(body.error.details || body.error.message).toBeDefined();
  });

  test("[P1] should reject API connection missing apiKey", async ({
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

    // WHEN: Creating terminal with API type but missing apiKey
    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      {
        name: "Test Terminal",
        connection_type: "API",
        connection_config: {
          baseUrl: "https://api.example.com",
        },
      },
    );

    // THEN: Request is rejected with validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
    expect(body.error.details || body.error.message).toBeDefined();
  });

  test("[P1] should reject WEBHOOK connection missing secret", async ({
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

    // WHEN: Creating terminal with WEBHOOK type but missing secret
    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      {
        name: "Test Terminal",
        connection_type: "WEBHOOK",
        connection_config: {
          webhookUrl: "https://webhook.example.com",
        },
      },
    );

    // THEN: Request is rejected with validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
    expect(body.error.details || body.error.message).toBeDefined();
  });

  test("[P1] should reject FILE connection missing importPath", async ({
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

    // WHEN: Creating terminal with FILE type but missing importPath
    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      {
        name: "Test Terminal",
        connection_type: "FILE",
        connection_config: {},
      },
    );

    // THEN: Request is rejected with validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
    expect(body.error.details || body.error.message).toBeDefined();
  });

  /**
   * Additional Coverage: Invalid protocol for NETWORK
   */
  test("[P2] should reject NETWORK connection with invalid protocol", async ({
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

    // WHEN: Creating terminal with invalid protocol
    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      {
        name: "Test Terminal",
        connection_type: "NETWORK",
        connection_config: {
          host: "192.168.1.1",
          port: 8080,
          protocol: "FTP", // Invalid - only TCP and HTTP allowed
        },
      },
    );

    // THEN: Request is rejected with validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toHaveProperty("code", "VALIDATION_ERROR");
    // Zod validation errors include details array
    expect(body.error.details || body.error.message).toBeDefined();
  });

  /**
   * Additional Coverage: GET endpoint authentication
   */
  test("[P0] should reject unauthenticated GET request for terminals", async ({
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

    // WHEN: Fetching terminals without authentication
    const response = await apiRequest.get(
      `/api/stores/${store.store_id}/terminals`,
    );

    // THEN: Request is rejected with 401
    expect(response.status()).toBe(401);
    const errorBody = await response.json();
    expect(errorBody.success).toBe(false);
    expect(errorBody.error).toHaveProperty("code", "UNAUTHORIZED");
  });

  /**
   * Additional Coverage: Non-existent store
   *
   * NOTE: For non-existent stores, checkUserStoreAccess returns false even for
   * superadmins (because the store doesn't exist), which triggers a 403
   * PERMISSION_DENIED error rather than 404 NOT_FOUND. This is the current
   * implementation behavior - authorization check happens before store existence
   * verification.
   */
  test("[P1] should return 403 when creating terminal for non-existent store", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: A non-existent store ID
    const nonExistentStoreId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Creating terminal for non-existent store
    const response = await superadminApiRequest.post(
      `/api/stores/${nonExistentStoreId}/terminals`,
      {
        name: "Test Terminal",
        connection_type: "MANUAL",
      },
    );

    // THEN: Request is rejected with 403 (authorization check fails for non-existent store)
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toHaveProperty("code", "PERMISSION_DENIED");
  });

  /**
   * Additional Coverage: Update non-existent terminal
   */
  test("[P1] should return 404 when updating non-existent terminal", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store exists but the terminal does not
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });
    const nonExistentTerminalId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Updating non-existent terminal
    const response = await superadminApiRequest.put(
      `/api/stores/${store.store_id}/terminals/${nonExistentTerminalId}`,
      {
        name: "Updated Name",
      },
    );

    // THEN: Request is rejected with 404
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toHaveProperty("code", "NOT_FOUND");
  });

  /**
   * Additional Coverage: Valid WEBHOOK without webhookUrl (auto-generated)
   */
  test("[P1] should accept WEBHOOK connection without webhookUrl (will be generated)", async ({
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

    // WHEN: Creating terminal with WEBHOOK type but no webhookUrl
    // (webhookUrl is optional per schema, will be auto-generated)
    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      {
        name: "Webhook Terminal",
        connection_type: "WEBHOOK",
        connection_config: {
          secret: "my-webhook-secret",
        },
      },
    );

    // THEN: Terminal is created successfully
    expect(response.status()).toBe(201);
    const terminal = await response.json();
    expect(terminal.connection_type).toBe("WEBHOOK");
    expect(terminal.connection_config).toHaveProperty(
      "secret",
      "my-webhook-secret",
    );
  });
});
