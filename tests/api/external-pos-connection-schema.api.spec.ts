import { test, expect } from "../support/fixtures/rbac.fixture";
import { createStore, createCompany, createUser } from "../support/helpers";
import { createTerminal } from "../support/factories/terminal.factory";

/**
 * External POS Connection Schema API Tests
 *
 * @test-level API
 * @justification API-level tests for external POS connection fields validation, CRUD operations, and Zod schema validation
 * @story 4-81-external-pos-connection-schema
 * @created 2025-01-27
 * @enhanced-by workflow-9 on 2025-12-01
 *
 * STORY: As a developer, I want to extend the POSTerminal model with connection and sync tracking fields,
 * so that the system can store configuration for connecting to 3rd party POS systems.
 *
 * ACCEPTANCE CRITERIA TESTED:
 * - AC #1: POSTerminal connection fields (connection_type, connection_config, vendor_type, terminal_status, last_sync_at, sync_status)
 * - AC #2: Shift external reference fields (external_shift_id, external_data, synced_at)
 * - AC #3: Service and API layer updates (createTerminal, updateTerminal, getStoreTerminals with new fields)
 *
 * BUSINESS RULES TESTED:
 * - BR-CONN-001: connection_type enum values (NETWORK, API, WEBHOOK, FILE, MANUAL)
 * - BR-CONN-002: connection_config structure must match connection_type (discriminated union validation)
 * - BR-CONN-003: MANUAL connection type requires no config
 * - BR-CONN-004: vendor_type enum values (GENERIC, SQUARE, CLOVER, TOAST, LIGHTSPEED, CUSTOM)
 * - BR-CONN-005: terminal_status enum values (ACTIVE, INACTIVE, PENDING, ERROR)
 * - BR-CONN-006: sync_status enum values (NEVER, SUCCESS, FAILED, IN_PROGRESS)
 * - BR-CONN-007: All new fields are optional for backward compatibility
 * - BR-CONN-008: Zod validation rejects invalid connection_config structures
 *
 * SECURITY FOCUS:
 * - Input validation and sanitization
 * - JSON injection prevention in connection_config
 * - Enum value validation
 * - Type safety enforcement
 * - SQL injection prevention
 * - XSS prevention
 * - Authentication bypass prevention
 * - Authorization enforcement
 * - Data leakage prevention
 *
 * TEST PHILOSOPHY:
 * - Tests represent ground truth - code must conform to tests
 * - Focus on validation logic and type safety
 * - Test all connection types and their config structures
 * - Validate backward compatibility
 */

test.describe("External POS Connection Schema API", () => {
  /**
   * AC #1: POSTerminal Connection Fields
   * AC #3: Service and API Layer Updates
   *
   * Test: Create terminal with NETWORK connection type
   */
  test("4.81-API-001: POST /api/stores/:storeId/terminals - Create terminal with NETWORK connection type", async ({
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

    // WHEN: Creating terminal with NETWORK connection type
    const terminalData = {
      name: "Network Terminal",
      device_id: `DEV-NET-${Date.now()}`,
      connection_type: "NETWORK",
      connection_config: {
        host: "192.168.1.100",
        port: 8080,
        protocol: "TCP",
      },
      vendor_type: "GENERIC",
      terminal_status: "ACTIVE",
      sync_status: "NEVER",
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Terminal is created successfully with connection fields
    expect(response.status()).toBe(201);
    const createdTerminal = await response.json();

    // Verify core fields with data type assertions
    expect(createdTerminal).toHaveProperty("pos_terminal_id");
    expect(typeof createdTerminal.pos_terminal_id).toBe("string");
    expect(createdTerminal.pos_terminal_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    expect(createdTerminal).toHaveProperty("store_id", store.store_id);
    expect(typeof createdTerminal.store_id).toBe("string");

    expect(createdTerminal).toHaveProperty("name", "Network Terminal");
    expect(typeof createdTerminal.name).toBe("string");
    expect(createdTerminal.name.length).toBeLessThanOrEqual(100);

    // Verify connection fields
    expect(createdTerminal).toHaveProperty("connection_type", "NETWORK");
    expect(typeof createdTerminal.connection_type).toBe("string");

    expect(createdTerminal).toHaveProperty("connection_config");
    expect(createdTerminal.connection_config).toBeInstanceOf(Object);
    expect(createdTerminal.connection_config).toMatchObject({
      host: "192.168.1.100",
      port: 8080,
      protocol: "TCP",
    });
    expect(typeof createdTerminal.connection_config.host).toBe("string");
    expect(typeof createdTerminal.connection_config.port).toBe("number");
    expect(typeof createdTerminal.connection_config.protocol).toBe("string");

    expect(createdTerminal).toHaveProperty("vendor_type", "GENERIC");
    expect(typeof createdTerminal.vendor_type).toBe("string");

    expect(createdTerminal).toHaveProperty("terminal_status", "ACTIVE");
    expect(typeof createdTerminal.terminal_status).toBe("string");

    expect(createdTerminal).toHaveProperty("sync_status", "NEVER");
    expect(typeof createdTerminal.sync_status).toBe("string");

    expect(createdTerminal).toHaveProperty("last_sync_at");
    expect(createdTerminal.last_sync_at).toBeNull();

    // Verify timestamp fields
    expect(createdTerminal).toHaveProperty("created_at");
    expect(createdTerminal.created_at).toBeDefined();
    expect(new Date(createdTerminal.created_at)).toBeInstanceOf(Date);

    expect(createdTerminal).toHaveProperty("updated_at");
    expect(createdTerminal.updated_at).toBeDefined();
    expect(new Date(createdTerminal.updated_at)).toBeInstanceOf(Date);
  });

  /**
   * AC #1: POSTerminal Connection Fields
   * AC #3: Service and API Layer Updates
   *
   * Test: Create terminal with API connection type
   */
  test("4.81-API-002: POST /api/stores/:storeId/terminals - Create terminal with API connection type", async ({
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

    // WHEN: Creating terminal with API connection type
    const terminalData = {
      name: "API Terminal",
      device_id: `DEV-API-${Date.now()}`,
      connection_type: "API",
      connection_config: {
        baseUrl: "https://api.example.com",
        apiKey: "secret-api-key-123",
      },
      vendor_type: "SQUARE",
      terminal_status: "PENDING",
      sync_status: "IN_PROGRESS",
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Terminal is created successfully
    expect(response.status()).toBe(201);
    const createdTerminal = await response.json();

    expect(createdTerminal).toHaveProperty("connection_type", "API");
    expect(typeof createdTerminal.connection_type).toBe("string");

    expect(createdTerminal.connection_config).toMatchObject({
      baseUrl: "https://api.example.com",
      apiKey: "secret-api-key-123",
    });
    expect(typeof createdTerminal.connection_config.baseUrl).toBe("string");
    expect(typeof createdTerminal.connection_config.apiKey).toBe("string");

    expect(createdTerminal).toHaveProperty("vendor_type", "SQUARE");
    expect(typeof createdTerminal.vendor_type).toBe("string");

    expect(createdTerminal).toHaveProperty("terminal_status", "PENDING");
    expect(typeof createdTerminal.terminal_status).toBe("string");

    expect(createdTerminal).toHaveProperty("sync_status", "IN_PROGRESS");
    expect(typeof createdTerminal.sync_status).toBe("string");
  });

  /**
   * AC #1: POSTerminal Connection Fields
   * AC #3: Service and API Layer Updates
   *
   * Test: Create terminal with WEBHOOK connection type
   */
  test("4.81-API-003: POST /api/stores/:storeId/terminals - Create terminal with WEBHOOK connection type", async ({
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

    // WHEN: Creating terminal with WEBHOOK connection type
    const terminalData = {
      name: "Webhook Terminal",
      device_id: `DEV-WEB-${Date.now()}`,
      connection_type: "WEBHOOK",
      connection_config: {
        webhookUrl: "https://webhook.example.com/callback",
        secret: "webhook-secret-key",
      },
      vendor_type: "CLOVER",
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Terminal is created successfully
    expect(response.status()).toBe(201);
    const createdTerminal = await response.json();

    expect(createdTerminal).toHaveProperty("connection_type", "WEBHOOK");
    expect(typeof createdTerminal.connection_type).toBe("string");

    expect(createdTerminal.connection_config).toMatchObject({
      webhookUrl: "https://webhook.example.com/callback",
      secret: "webhook-secret-key",
    });
    expect(typeof createdTerminal.connection_config.webhookUrl).toBe("string");
    expect(typeof createdTerminal.connection_config.secret).toBe("string");

    expect(createdTerminal).toHaveProperty("vendor_type", "CLOVER");
    expect(typeof createdTerminal.vendor_type).toBe("string");
  });

  /**
   * AC #1: POSTerminal Connection Fields
   * AC #3: Service and API Layer Updates
   *
   * Test: Create terminal with FILE connection type
   */
  test("4.81-API-004: POST /api/stores/:storeId/terminals - Create terminal with FILE connection type", async ({
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

    // WHEN: Creating terminal with FILE connection type
    const terminalData = {
      name: "File Terminal",
      device_id: `DEV-FILE-${Date.now()}`,
      connection_type: "FILE",
      connection_config: {
        importPath: "/path/to/import/files",
      },
      vendor_type: "TOAST",
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Terminal is created successfully
    expect(response.status()).toBe(201);
    const createdTerminal = await response.json();

    expect(createdTerminal).toHaveProperty("connection_type", "FILE");
    expect(typeof createdTerminal.connection_type).toBe("string");

    expect(createdTerminal.connection_config).toMatchObject({
      importPath: "/path/to/import/files",
    });
    expect(typeof createdTerminal.connection_config.importPath).toBe("string");

    expect(createdTerminal).toHaveProperty("vendor_type", "TOAST");
    expect(typeof createdTerminal.vendor_type).toBe("string");
  });

  /**
   * AC #1: POSTerminal Connection Fields
   * AC #3: Service and API Layer Updates
   *
   * Test: Create terminal with MANUAL connection type (no config required)
   */
  test("4.81-API-005: POST /api/stores/:storeId/terminals - Create terminal with MANUAL connection type", async ({
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

    // WHEN: Creating terminal with MANUAL connection type (no config)
    const terminalData = {
      name: "Manual Terminal",
      device_id: `DEV-MANUAL-${Date.now()}`,
      connection_type: "MANUAL",
      vendor_type: "LIGHTSPEED",
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Terminal is created successfully
    expect(response.status()).toBe(201);
    const createdTerminal = await response.json();

    expect(createdTerminal).toHaveProperty("connection_type", "MANUAL");
    expect(typeof createdTerminal.connection_type).toBe("string");

    expect(createdTerminal.connection_config).toBeNull();

    expect(createdTerminal).toHaveProperty("vendor_type", "LIGHTSPEED");
    expect(typeof createdTerminal.vendor_type).toBe("string");
  });

  /**
   * AC #3: Service and API Layer Updates
   *
   * Test: Create terminal without new connection fields (backward compatibility)
   */
  test("4.81-API-006: POST /api/stores/:storeId/terminals - Create terminal without connection fields (backward compatibility)", async ({
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

    // WHEN: Creating terminal without new connection fields
    const terminalData = {
      name: "Legacy Terminal",
      device_id: `DEV-LEGACY-${Date.now()}`,
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Terminal is created successfully with default values
    expect(response.status()).toBe(201);
    const createdTerminal = await response.json();

    // Verify defaults are applied (from migration)
    expect(createdTerminal).toHaveProperty("connection_type", "MANUAL");
    expect(typeof createdTerminal.connection_type).toBe("string");

    expect(createdTerminal).toHaveProperty("vendor_type", "GENERIC");
    expect(typeof createdTerminal.vendor_type).toBe("string");

    expect(createdTerminal).toHaveProperty("terminal_status", "ACTIVE");
    expect(typeof createdTerminal.terminal_status).toBe("string");

    expect(createdTerminal).toHaveProperty("sync_status", "NEVER");
    expect(typeof createdTerminal.sync_status).toBe("string");
  });

  /**
   * AC #3: Service and API Layer Updates
   *
   * Test: Update terminal connection configuration
   */
  test("4.81-API-007: PUT /api/stores/:storeId/terminals/:terminalId - Update terminal connection configuration", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A terminal exists with MANUAL connection type
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
        name: "Terminal to Update",
        device_id: `DEV-UPDATE-${Date.now()}`,
        connection_type: "MANUAL",
      },
    );
    expect(createResponse.status()).toBe(201);
    const terminal = await createResponse.json();

    // WHEN: Updating terminal with API connection type
    const updateData = {
      connection_type: "API",
      connection_config: {
        baseUrl: "https://updated-api.example.com",
        apiKey: "new-api-key-456",
      },
      vendor_type: "SQUARE",
      terminal_status: "ACTIVE",
      sync_status: "SUCCESS",
    };

    const updateResponse = await superadminApiRequest.put(
      `/api/stores/${store.store_id}/terminals/${terminal.pos_terminal_id}`,
      updateData,
    );

    // THEN: Terminal is updated successfully
    expect(updateResponse.status()).toBe(200);
    const updatedTerminal = await updateResponse.json();

    expect(updatedTerminal).toHaveProperty("connection_type", "API");
    expect(typeof updatedTerminal.connection_type).toBe("string");

    expect(updatedTerminal.connection_config).toMatchObject({
      baseUrl: "https://updated-api.example.com",
      apiKey: "new-api-key-456",
    });
    expect(typeof updatedTerminal.connection_config.baseUrl).toBe("string");
    expect(typeof updatedTerminal.connection_config.apiKey).toBe("string");

    expect(updatedTerminal).toHaveProperty("vendor_type", "SQUARE");
    expect(typeof updatedTerminal.vendor_type).toBe("string");

    expect(updatedTerminal).toHaveProperty("terminal_status", "ACTIVE");
    expect(typeof updatedTerminal.terminal_status).toBe("string");

    expect(updatedTerminal).toHaveProperty("sync_status", "SUCCESS");
    expect(typeof updatedTerminal.sync_status).toBe("string");
  });

  /**
   * AC #3: Service and API Layer Updates
   *
   * Test: GET /api/stores/:storeId/terminals returns new connection fields
   */
  test("4.81-API-008: GET /api/stores/:storeId/terminals - Returns new connection fields", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A terminal exists with connection fields
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    await superadminApiRequest.post(`/api/stores/${store.store_id}/terminals`, {
      name: "Terminal with Connection",
      device_id: `DEV-GET-${Date.now()}`,
      connection_type: "NETWORK",
      connection_config: {
        host: "192.168.1.200",
        port: 9090,
        protocol: "HTTP",
      },
      vendor_type: "CUSTOM",
      terminal_status: "ACTIVE",
      sync_status: "SUCCESS",
    });

    // WHEN: Getting store terminals
    const response = await superadminApiRequest.get(
      `/api/stores/${store.store_id}/terminals`,
    );

    // THEN: Response includes new connection fields
    expect(response.status()).toBe(200);
    const terminals = await response.json();

    expect(Array.isArray(terminals)).toBe(true);
    expect(terminals.length).toBeGreaterThan(0);

    const terminal = terminals.find(
      (t: any) => t.name === "Terminal with Connection",
    );
    expect(terminal).toBeDefined();
    expect(terminal).toHaveProperty("connection_type", "NETWORK");
    expect(typeof terminal.connection_type).toBe("string");

    expect(terminal).toHaveProperty("connection_config");
    expect(terminal.connection_config).toBeInstanceOf(Object);
    expect(terminal.connection_config).toMatchObject({
      host: "192.168.1.200",
      port: 9090,
      protocol: "HTTP",
    });
    expect(typeof terminal.connection_config.host).toBe("string");
    expect(typeof terminal.connection_config.port).toBe("number");
    expect(typeof terminal.connection_config.protocol).toBe("string");

    expect(terminal).toHaveProperty("vendor_type", "CUSTOM");
    expect(typeof terminal.vendor_type).toBe("string");

    expect(terminal).toHaveProperty("terminal_status", "ACTIVE");
    expect(typeof terminal.terminal_status).toBe("string");

    expect(terminal).toHaveProperty("sync_status", "SUCCESS");
    expect(typeof terminal.sync_status).toBe("string");

    expect(terminal).toHaveProperty("last_sync_at");
  });

  /**
   * AC #3: Service and API Layer Updates
   *
   * Test: Zod validation rejects invalid connection_config structure for NETWORK type
   */
  test("4.81-API-009: POST /api/stores/:storeId/terminals - Rejects invalid NETWORK connection_config", async ({
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

    // WHEN: Creating terminal with invalid NETWORK connection_config (missing required fields)
    const terminalData = {
      name: "Invalid Network Terminal",
      device_id: `DEV-INVALID-${Date.now()}`,
      connection_type: "NETWORK",
      connection_config: {
        // Missing required 'host' and 'port' fields
        protocol: "TCP",
      },
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Validation error is returned
    expect(response.status()).toBe(400);
    const error = await response.json();
    expect(error).toHaveProperty("success", false);
    expect(error).toHaveProperty("error");
    expect(error.error).toHaveProperty("code", "VALIDATION_ERROR");
    expect(typeof error.error.message).toBe("string");
  });

  /**
   * AC #3: Service and API Layer Updates
   *
   * Test: Zod validation rejects invalid connection_config structure for API type
   */
  test("4.81-API-010: POST /api/stores/:storeId/terminals - Rejects invalid API connection_config", async ({
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

    // WHEN: Creating terminal with invalid API connection_config (invalid URL)
    const terminalData = {
      name: "Invalid API Terminal",
      device_id: `DEV-INVALID-API-${Date.now()}`,
      connection_type: "API",
      connection_config: {
        baseUrl: "not-a-valid-url",
        apiKey: "key",
      },
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Validation error is returned
    expect(response.status()).toBe(400);
    const error = await response.json();
    expect(error).toHaveProperty("success", false);
    expect(error).toHaveProperty("error");
    expect(error.error).toHaveProperty("code", "VALIDATION_ERROR");
    expect(typeof error.error.message).toBe("string");
  });

  /**
   * AC #3: Service and API Layer Updates
   *
   * Test: Zod validation rejects connection_config when connection_type is MANUAL
   */
  test("4.81-API-011: POST /api/stores/:storeId/terminals - Rejects connection_config for MANUAL type", async ({
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

    // WHEN: Creating terminal with MANUAL connection_type but providing connection_config
    const terminalData = {
      name: "Invalid Manual Terminal",
      device_id: `DEV-INVALID-MANUAL-${Date.now()}`,
      connection_type: "MANUAL",
      connection_config: {
        // MANUAL type should not have config
        someField: "value",
      },
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Validation error is returned
    expect(response.status()).toBe(400);
    const error = await response.json();
    expect(error).toHaveProperty("success", false);
    expect(error).toHaveProperty("error");
    expect(error.error).toHaveProperty("code", "VALIDATION_ERROR");
    expect(typeof error.error.message).toBe("string");
  });

  /**
   * AC #3: Service and API Layer Updates
   *
   * Test: Zod validation rejects mismatched connection_config structure (API config for NETWORK type)
   */
  test("4.81-API-012: POST /api/stores/:storeId/terminals - Rejects mismatched connection_config structure", async ({
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

    // WHEN: Creating terminal with NETWORK type but API connection_config structure
    const terminalData = {
      name: "Mismatched Config Terminal",
      device_id: `DEV-MISMATCH-${Date.now()}`,
      connection_type: "NETWORK",
      connection_config: {
        // This is API config structure, not NETWORK
        baseUrl: "https://api.example.com",
        apiKey: "key",
      },
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Validation error is returned
    expect(response.status()).toBe(400);
    const error = await response.json();
    expect(error).toHaveProperty("success", false);
    expect(error).toHaveProperty("error");
    expect(error.error).toHaveProperty("code", "VALIDATION_ERROR");
    expect(typeof error.error.message).toBe("string");
  });

  /**
   * AC #1: POSTerminal Connection Fields
   *
   * Test: Verify all enum values are accepted
   */
  test("4.81-API-013: POST /api/stores/:storeId/terminals - Accepts all valid enum values", async ({
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

    // WHEN: Creating terminals with all enum values
    const enumTests = [
      {
        connection_type: "NETWORK",
        vendor_type: "GENERIC",
        terminal_status: "ACTIVE",
        sync_status: "NEVER",
      },
      {
        connection_type: "API",
        vendor_type: "SQUARE",
        terminal_status: "INACTIVE",
        sync_status: "SUCCESS",
      },
      {
        connection_type: "WEBHOOK",
        vendor_type: "CLOVER",
        terminal_status: "PENDING",
        sync_status: "FAILED",
      },
      {
        connection_type: "FILE",
        vendor_type: "TOAST",
        terminal_status: "ERROR",
        sync_status: "IN_PROGRESS",
      },
      {
        connection_type: "MANUAL",
        vendor_type: "LIGHTSPEED",
        terminal_status: "ACTIVE",
        sync_status: "NEVER",
      },
      {
        connection_type: "MANUAL",
        vendor_type: "CUSTOM",
        terminal_status: "ACTIVE",
        sync_status: "SUCCESS",
      },
    ];

    for (const enumTest of enumTests) {
      const terminalData = {
        name: `Terminal ${enumTest.connection_type}-${enumTest.vendor_type}`,
        device_id: `DEV-${enumTest.connection_type}-${enumTest.vendor_type}-${Date.now()}`,
        ...enumTest,
        ...(enumTest.connection_type !== "MANUAL" && {
          connection_config:
            enumTest.connection_type === "NETWORK"
              ? { host: "192.168.1.1", port: 8080, protocol: "TCP" }
              : enumTest.connection_type === "API"
                ? { baseUrl: "https://api.example.com", apiKey: "key" }
                : enumTest.connection_type === "WEBHOOK"
                  ? {
                      webhookUrl: "https://webhook.example.com",
                      secret: "secret",
                    }
                  : { importPath: "/path/to/file" },
        }),
      };

      const response = await superadminApiRequest.post(
        `/api/stores/${store.store_id}/terminals`,
        terminalData,
      );

      // THEN: All enum values are accepted
      expect(response.status()).toBe(201);
      const terminal = await response.json();
      expect(terminal).toHaveProperty(
        "connection_type",
        enumTest.connection_type,
      );
      expect(typeof terminal.connection_type).toBe("string");
      expect(terminal).toHaveProperty("vendor_type", enumTest.vendor_type);
      expect(typeof terminal.vendor_type).toBe("string");
      expect(terminal).toHaveProperty(
        "terminal_status",
        enumTest.terminal_status,
      );
      expect(typeof terminal.terminal_status).toBe("string");
      expect(terminal).toHaveProperty("sync_status", enumTest.sync_status);
      expect(typeof terminal.sync_status).toBe("string");
    }
  });

  // ============================================================================
  // 🔒 SECURITY TESTS (Mandatory - Applied Automatically)
  // ============================================================================

  /**
   * SQL Injection Prevention Tests
   * WHY: Database queries use user input - must prevent SQL injection
   * RISK: Database compromise, data theft
   */
  test("4.81-API-014: SQL injection in terminal name is sanitized", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // WHEN: Attempting SQL injection in name field
    const terminalData = {
      name: "'; DROP TABLE terminals; --",
      device_id: `DEV-SQL-INJECT-${Date.now()}`,
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Terminal is created (Prisma sanitizes input) but name is stored safely
    expect(response.status()).toBe(201);
    const createdTerminal = await response.json();
    expect(createdTerminal.name).toBe("'; DROP TABLE terminals; --"); // Stored as-is (Prisma handles safety)

    // AND: Database still intact (no table dropped)
    const terminals = await prismaClient.pOSTerminal.findMany({
      where: { store_id: store.store_id },
    });
    expect(terminals.length).toBeGreaterThan(0);
  });

  test("4.81-API-015: SQL injection in device_id is sanitized", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // WHEN: Attempting SQL injection in device_id
    const terminalData = {
      name: "SQL Test Terminal",
      device_id: "' OR '1'='1",
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Terminal is created safely
    expect(response.status()).toBe(201);
    const createdTerminal = await response.json();
    expect(createdTerminal.device_id).toBe("' OR '1'='1"); // Stored safely
  });

  test("4.81-API-016: SQL injection in connection_config JSON is sanitized", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // WHEN: Attempting SQL injection in connection_config
    const terminalData = {
      name: "SQL Config Terminal",
      device_id: `DEV-SQL-CONFIG-${Date.now()}`,
      connection_type: "API",
      connection_config: {
        baseUrl: "https://api.example.com",
        apiKey: "'; DROP TABLE terminals; --",
      },
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Terminal is created safely
    expect(response.status()).toBe(201);
    const createdTerminal = await response.json();
    expect(createdTerminal.connection_config.apiKey).toBe(
      "'; DROP TABLE terminals; --",
    );

    // AND: Database still intact
    const terminals = await prismaClient.pOSTerminal.findMany({
      where: { store_id: store.store_id },
    });
    expect(terminals.length).toBeGreaterThan(0);
  });

  /**
   * XSS Prevention Tests
   * WHY: Terminal name and connection_config are returned in API responses
   * RISK: Script injection, session hijacking
   */
  test("4.81-API-017: XSS script injection in terminal name is stored safely", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // WHEN: Creating terminal with XSS payload in name
    const terminalData = {
      name: "<script>alert('XSS')</script>",
      device_id: `DEV-XSS-${Date.now()}`,
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Terminal is created (backend stores as-is, frontend should sanitize)
    expect(response.status()).toBe(201);
    const createdTerminal = await response.json();
    expect(createdTerminal.name).toBe("<script>alert('XSS')</script>");
    // NOTE: Frontend should sanitize this before rendering
  });

  test("4.81-API-018: XSS HTML injection in terminal name is stored safely", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // WHEN: Creating terminal with HTML injection
    const terminalData = {
      name: "<img src=x onerror=alert('XSS')>",
      device_id: `DEV-XSS-HTML-${Date.now()}`,
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Terminal is created
    expect(response.status()).toBe(201);
    const createdTerminal = await response.json();
    expect(createdTerminal.name).toBe("<img src=x onerror=alert('XSS')>");
  });

  test("4.81-API-019: XSS in connection_config JSON is stored safely", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // WHEN: Creating terminal with XSS in connection_config
    const terminalData = {
      name: "XSS Config Terminal",
      device_id: `DEV-XSS-CONFIG-${Date.now()}`,
      connection_type: "API",
      connection_config: {
        baseUrl: "https://api.example.com",
        apiKey: "<script>alert('XSS')</script>",
      },
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Terminal is created
    expect(response.status()).toBe(201);
    const createdTerminal = await response.json();
    expect(createdTerminal.connection_config.apiKey).toBe(
      "<script>alert('XSS')</script>",
    );
    // NOTE: Frontend should sanitize when rendering
  });

  /**
   * Authentication Bypass Tests
   * WHY: All endpoints require authentication
   * RISK: Unauthorized access
   */
  test("4.81-API-020: Missing Authorization header returns 401", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // WHEN: Request without Authorization header
    const response = await apiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      { name: "Test Terminal" },
    );

    // THEN: Request fails with 401
    expect(response.status()).toBe(401);
  });

  test("4.81-API-021: Invalid token format returns 401", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // WHEN: Request with invalid token format
    const response = await apiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      { name: "Test Terminal" },
      {
        headers: {
          Authorization: "Bearer invalid-token-format",
        },
      },
    );

    // THEN: Request fails with 401
    expect(response.status()).toBe(401);
  });

  /**
   * Authorization Tests - Company Isolation
   * WHY: Users must only access terminals for their company
   * RISK: Data leak to competitors
   */
  test("4.81-API-022: Corporate admin cannot create terminal for other company's store", async ({
    corporateAdminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Another company has a store
    const otherOwner = await createUser(prismaClient);
    const otherCompany = await createCompany(prismaClient, {
      owner_user_id: otherOwner.user_id,
    });
    const otherStore = await createStore(prismaClient, {
      company_id: otherCompany.company_id,
    });

    // WHEN: Corporate admin attempts to create terminal for other company's store
    const terminalData = {
      name: "Unauthorized Terminal",
      device_id: `DEV-UNAUTH-${Date.now()}`,
    };

    const response = await corporateAdminApiRequest.post(
      `/api/stores/${otherStore.store_id}/terminals`,
      terminalData,
    );

    // THEN: Request fails with 403
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("PERMISSION_DENIED");
  });

  /**
   * Input Validation Tests
   * WHY: Invalid input must be rejected
   * RISK: Data corruption, security vulnerabilities
   */
  test("4.81-API-023: Invalid UUID format for storeId returns 400", async ({
    superadminApiRequest,
  }) => {
    // WHEN: Request with invalid UUID format
    const response = await superadminApiRequest.post(
      `/api/stores/not-a-uuid/terminals`,
      { name: "Test Terminal" },
    );

    // THEN: Request fails with 400
    expect(response.status()).toBe(400);
  });

  test("4.81-API-024: Invalid enum value for connection_type returns 400", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // WHEN: Creating terminal with invalid enum value
    const terminalData = {
      name: "Test Terminal",
      device_id: `DEV-INVALID-ENUM-${Date.now()}`,
      connection_type: "INVALID_TYPE",
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Request fails with 400
    expect(response.status()).toBe(400);
    const error = await response.json();
    expect(error.success).toBe(false);
    expect(error.error.code).toBe("VALIDATION_ERROR");
  });

  /**
   * Data Leakage Prevention Tests
   * WHY: Connection config may contain sensitive data
   * RISK: Sensitive information exposure
   */
  test("4.81-API-025: Corporate admin cannot access other company's connection_config", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: Another company has a terminal with connection config
    const otherOwner = await createUser(prismaClient);
    const otherCompany = await createCompany(prismaClient, {
      owner_user_id: otherOwner.user_id,
    });
    const otherStore = await createStore(prismaClient, {
      company_id: otherCompany.company_id,
    });
    await prismaClient.pOSTerminal.create({
      data: {
        store_id: otherStore.store_id,
        name: "Other Terminal",
        connection_type: "API",
        connection_config: {
          baseUrl: "https://secret-api.example.com",
          apiKey: "secret-key-12345",
        },
      },
    });

    // WHEN: Corporate admin attempts to list other company's terminals
    const response = await corporateAdminApiRequest.get(
      `/api/stores/${otherStore.store_id}/terminals`,
    );

    // THEN: Request fails with 403 (company isolation prevents access)
    expect(response.status()).toBe(403);
  });

  // ============================================================================
  // 🔄 ADDITIONAL EDGE CASES (Standard Boundaries)
  // ============================================================================

  test("4.81-API-026: Terminal name with only whitespace is rejected", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // WHEN: Creating terminal with only whitespace
    const terminalData = {
      name: "   ",
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Request fails with 400
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("4.81-API-027: Terminal name with Unicode and emoji is handled correctly", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // WHEN: Creating terminal with Unicode and emoji
    const terminalData = {
      name: "Terminal 🎉 Café 中文",
      device_id: `DEV-UNICODE-${Date.now()}`,
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Terminal is created successfully
    expect(response.status()).toBe(201);
    const createdTerminal = await response.json();
    expect(createdTerminal.name).toBe("Terminal 🎉 Café 中文");
  });

  test("4.81-API-028: Terminal name at max length (100 chars) is accepted", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // WHEN: Creating terminal with name at max length
    const terminalData = {
      name: "A".repeat(100), // Exactly 100 characters
      device_id: `DEV-MAX-LEN-${Date.now()}`,
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Terminal is created successfully
    expect(response.status()).toBe(201);
    const createdTerminal = await response.json();
    expect(createdTerminal.name.length).toBe(100);
  });

  test("4.81-API-029: Terminal name exceeding max length (101 chars) is rejected", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // WHEN: Creating terminal with name exceeding max length
    const terminalData = {
      name: "A".repeat(101), // 101 characters
      device_id: `DEV-TOO-LONG-${Date.now()}`,
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Request fails with 400
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("4.81-API-030: Empty device_id is stored as null", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // WHEN: Creating terminal with empty device_id
    const terminalData = {
      name: "Terminal 1",
      device_id: "",
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Terminal is created with null device_id
    expect(response.status()).toBe(201);
    const createdTerminal = await response.json();
    expect(createdTerminal.device_id).toBeNull();
  });

  test("4.81-API-031: Device ID at max length (255 chars) is accepted", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // WHEN: Creating terminal with device_id at max length
    const terminalData = {
      name: "Terminal 1",
      device_id: "A".repeat(255), // Exactly 255 characters
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Terminal is created successfully
    expect(response.status()).toBe(201);
    const createdTerminal = await response.json();
    expect(createdTerminal.device_id.length).toBe(255);
  });

  test("4.81-API-032: Device ID exceeding max length (256 chars) is rejected", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // WHEN: Creating terminal with device_id exceeding max length
    const terminalData = {
      name: "Terminal 1",
      device_id: "A".repeat(256), // 256 characters
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Request fails with 400
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("4.81-API-033: Connection config with large JSON object is handled", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // WHEN: Creating terminal with large connection_config
    const largeConfig = {
      baseUrl: "https://api.example.com",
      apiKey: "test-key",
      metadata: Array.from({ length: 100 }, (_, i) => ({
        key: `key-${i}`,
        value: `value-${i}`.repeat(10),
      })),
    };

    const terminalData = {
      name: "Large Config Terminal",
      device_id: `DEV-LARGE-CONFIG-${Date.now()}`,
      connection_type: "API",
      connection_config: largeConfig,
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Terminal is created with large config
    expect(response.status()).toBe(201);
    const createdTerminal = await response.json();
    expect(createdTerminal.connection_config).toBeDefined();
    expect(createdTerminal.connection_config.metadata.length).toBe(100);
  });

  test("4.81-API-034: Connection config with nested JSON is handled", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // WHEN: Creating terminal with deeply nested connection_config
    const nestedConfig = {
      baseUrl: "https://api.example.com",
      apiKey: "test-key",
      nested: {
        deeply: {
          nested: {
            value: "test",
            array: [1, 2, 3],
            object: {
              key: "value",
            },
          },
        },
      },
    };

    const terminalData = {
      name: "Nested Config Terminal",
      device_id: `DEV-NESTED-${Date.now()}`,
      connection_type: "API",
      connection_config: nestedConfig,
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Terminal is created with nested config
    expect(response.status()).toBe(201);
    const createdTerminal = await response.json();
    expect(createdTerminal.connection_config.nested.deeply.nested.value).toBe(
      "test",
    );
    expect(
      createdTerminal.connection_config.nested.deeply.nested.array,
    ).toEqual([1, 2, 3]);
    expect(
      createdTerminal.connection_config.nested.deeply.nested.object.key,
    ).toBe("value");
  });
});
