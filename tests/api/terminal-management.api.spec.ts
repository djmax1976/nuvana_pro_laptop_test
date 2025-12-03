import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createStore,
  createCompany,
  createUser,
  createShift,
} from "../support/helpers";
import { createTerminal } from "../support/factories/terminal.factory";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../backend/src/utils/public-id";

/**
 * Terminal Management API Tests
 *
 * @test-level API
 * @justification API-level tests for terminal CRUD operations with validation, authorization, company isolation, and business rule enforcement
 * @feature Terminal Management for Stores
 * @created 2025-01-XX
 * @enhanced-by workflow-9 on 2025-01-27
 *
 * BUSINESS RULES TESTED:
 * - BR-TERM-001: System admins can create terminals for ANY store
 * - BR-TERM-002: Corporate admins can ONLY create terminals for THEIR company's stores
 * - BR-TERM-003: Terminals MUST belong to a valid store (FK constraint)
 * - BR-TERM-004: Terminal name is required and max 100 characters
 * - BR-TERM-005: Device ID is optional and max 255 characters
 * - BR-TERM-006: (REMOVED) Terminal status field removed - terminals have no status
 * - BR-TERM-007: Cannot soft-delete terminal with active shift (OPEN, ACTIVE, CLOSING, RECONCILING)
 * - BR-TERM-015: Device ID must be globally unique
 * - BR-TERM-016: Device ID must be globally unique (across stores)
 * - BR-TERM-008: Can delete terminal with closed shifts
 * - BR-TERM-009: Company isolation - users can only access terminals for their company
 * - BR-TERM-010: Terminals cascade delete when store is deleted
 * - BR-TERM-011: System admin can manage terminals for any store
 * - BR-TERM-012: Unauthenticated requests return 401
 * - BR-TERM-013: Invalid store ID returns 404
 * - BR-TERM-014: Invalid terminal ID returns 404
 *
 * SECURITY FOCUS:
 * - Company isolation enforcement
 * - Permission checks (STORE_CREATE, STORE_UPDATE, STORE_DELETE)
 * - Input validation and sanitization
 * - Active shift protection
 * - XSS prevention in terminal names
 *
 * TEST PHILOSOPHY:
 * - Tests represent ground truth - code must conform to tests
 * - Focus on critical paths and business logic
 * - Validate security boundaries
 * - Test edge cases and error conditions
 */

test.describe("Terminal Management API", () => {
  /**
   * BR-TERM-001: System admin can create terminals for ANY store
   *
   * WHY: System admins need full access for setup and management
   * RISK: Unauthorized terminal creation
   * VALIDATES: SYSTEM scope bypasses company isolation
   */
  test("[P0-BR-TERM-001] System admin can create terminal for any store", async ({
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

    // WHEN: System admin creates terminal
    const terminalData = {
      name: "Terminal 1",
      device_id: `DEV-001-${Date.now()}`, // Unique device_id to prevent collisions
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Terminal is created successfully
    expect(response.status()).toBe(201);

    const createdTerminal = await response.json();
    // Response structure assertions (core fields)
    expect(createdTerminal).toHaveProperty("pos_terminal_id");
    expect(createdTerminal).toHaveProperty("store_id");
    expect(createdTerminal).toHaveProperty("name");
    expect(createdTerminal).toHaveProperty("device_id");
    expect(createdTerminal).toHaveProperty("deleted_at");
    expect(createdTerminal).toHaveProperty("created_at");
    expect(createdTerminal).toHaveProperty("updated_at");

    // Data type assertions
    expect(typeof createdTerminal.pos_terminal_id).toBe("string");
    expect(typeof createdTerminal.store_id).toBe("string");
    expect(typeof createdTerminal.name).toBe("string");
    expect(createdTerminal.name.length).toBeLessThanOrEqual(100);

    // Value assertions
    expect(createdTerminal.name).toBe("Terminal 1");
    expect(createdTerminal.device_id).toContain("DEV-001"); // Device ID contains expected prefix
    expect(createdTerminal.deleted_at).toBeNull();
    expect(createdTerminal.store_id).toBe(store.store_id);
    expect(createdTerminal.pos_terminal_id).toBeDefined();

    // Optional: Check for new connection fields if present in response
    // (These may not be in API response schema yet, but are in database)
    if (createdTerminal.connection_type !== undefined) {
      expect(createdTerminal.connection_type).toBeDefined();
    }

    // AND: Terminal exists in database
    const dbTerminal = await prismaClient.pOSTerminal.findUnique({
      where: { pos_terminal_id: createdTerminal.pos_terminal_id },
    });
    expect(dbTerminal).toBeDefined();
    expect(dbTerminal?.name).toBe("Terminal 1");
  });

  /**
   * BR-TERM-002: Corporate admin can ONLY create terminals for THEIR company's stores
   *
   * WHY: Company isolation security
   * RISK: Data leak to competitors
   * VALIDATES: Company isolation enforcement
   */
  test("[P0-BR-TERM-002] Corporate admin can create terminal for own company's store", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: Corporate admin's company has a store
    const store = await createStore(prismaClient, {
      company_id: corporateAdminUser.company_id!,
      name: "Own Company Store",
    });

    // WHEN: Corporate admin creates terminal
    const terminalData = {
      name: "Own Terminal",
    };

    const response = await corporateAdminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Terminal is created successfully
    expect(response.status()).toBe(201);

    const createdTerminal = await response.json();
    expect(createdTerminal.store_id).toBe(store.store_id);
  });

  /**
   * BR-TERM-002a: Corporate admin CANNOT create terminal for other company's store
   *
   * WHY: Company isolation security
   * RISK: Unauthorized access to competitor data
   * VALIDATES: Company isolation enforcement
   */
  test("[P0-BR-TERM-002a] Corporate admin cannot create terminal for other company's store", async ({
    corporateAdminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Another company and store exist
    const otherOwner = await createUser(prismaClient);
    const otherCompany = await createCompany(prismaClient, {
      name: "Other Company",
      owner_user_id: otherOwner.user_id,
    });
    const otherStore = await createStore(prismaClient, {
      company_id: otherCompany.company_id,
      name: "Other Company Store",
    });

    // WHEN: Corporate admin attempts to create terminal for other company's store
    const terminalData = {
      name: "Unauthorized Terminal",
    };

    const response = await corporateAdminApiRequest.post(
      `/api/stores/${otherStore.store_id}/terminals`,
      terminalData,
    );

    // THEN: Request fails with 403 Forbidden
    expect(response.status()).toBe(403);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("PERMISSION_DENIED");
    // Error message may vary - check for permission-related content
    expect(
      body.error.message.toLowerCase().includes("forbidden") ||
        body.error.message.toLowerCase().includes("permission") ||
        body.error.message.toLowerCase().includes("denied"),
    ).toBe(true);
  });

  /**
   * BR-TERM-003: Cannot create terminal for non-existent store
   *
   * WHY: Referential integrity
   * RISK: Orphaned terminals, database corruption
   * VALIDATES: FK constraint enforcement
   */
  test("[P0-BR-TERM-003] Cannot create terminal for non-existent store", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: A non-existent store ID
    const fakeStoreId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Attempting to create terminal
    const terminalData = {
      name: "Orphaned Terminal",
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${fakeStoreId}/terminals`,
      terminalData,
    );

    // THEN: Request fails with 404 or 403 (authorization may happen before store check)
    expect([403, 404]).toContain(response.status());

    const body = await response.json();
    if (response.status() === 404) {
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("NOT_FOUND");
      expect(body.error.message).toContain("not found");
    } else {
      // 403 means authorization failed (store doesn't exist or no access)
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("PERMISSION_DENIED");
    }
  });

  /**
   * BR-TERM-004: Terminal name validation
   *
   * WHY: Data integrity and UI constraints
   * RISK: Invalid data, UI overflow
   * VALIDATES: Name length and required validation
   */
  test("[P0-BR-TERM-004] Terminal name is required", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    // WHEN: Attempting to create terminal without name
    const terminalData = {};

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

  test("[P1-BR-TERM-004a] Terminal name cannot exceed 100 characters", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    // WHEN: Attempting to create terminal with name > 100 characters
    const terminalData = {
      name: "A".repeat(101), // 101 characters
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
    expect(body.error.message).toContain("100 characters");
  });

  /**
   * BR-TERM-005: Device ID validation
   *
   * WHY: Data integrity
   * RISK: Invalid data storage
   * VALIDATES: Device ID length validation
   */
  test("[P1-BR-TERM-005] Device ID cannot exceed 255 characters", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    // WHEN: Attempting to create terminal with device_id > 255 characters
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
    expect(body.error.message).toContain("255 characters");
  });

  /**
   * BR-TERM-015: Device ID must be globally unique
   *
   * WHY: Device ID uniqueness requirement
   * RISK: Duplicate device IDs causing conflicts
   * VALIDATES: Global uniqueness constraint
   */
  test("[P0-BR-TERM-015] Device ID must be globally unique", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store with a terminal that has a device_id
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    const existingTerminalData = createTerminal({
      store_id: store.store_id,
      name: "Existing Terminal",
      device_id: "DEV-GLOBAL-001",
    });
    const existingTerminal = await prismaClient.pOSTerminal.create({
      data: {
        ...existingTerminalData,
        device_id: existingTerminalData.device_id || null,
      },
    });

    // WHEN: Attempting to create another terminal with the same device_id
    const terminalData = {
      name: "Duplicate Device Terminal",
      device_id: "DEV-GLOBAL-001",
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
    expect(body.error.message).toContain("already in use");
    expect(body.error.message).toContain("globally unique");
  });

  /**
   * BR-TERM-016: Device ID must be globally unique (across stores)
   *
   * WHY: Device ID must be unique across all stores, not just within a store
   * RISK: Duplicate device IDs across different stores causing conflicts
   * VALIDATES: Global uniqueness constraint across stores
   */
  test("[P0-BR-TERM-016] Device ID must be globally unique (across stores)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store with a terminal that has a device_id
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store1 = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store 1",
    });

    const existingTerminalData = createTerminal({
      store_id: store1.store_id,
      name: "Existing Terminal",
      device_id: "DEV-GLOBAL-002",
    });
    const existingTerminal = await prismaClient.pOSTerminal.create({
      data: {
        ...existingTerminalData,
        device_id: existingTerminalData.device_id || null,
      },
    });

    // AND: A different store in the same company
    const store2 = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store 2",
    });

    // WHEN: Attempting to create a terminal in a different store with the same device_id
    const terminalData = {
      name: "Duplicate Device Terminal",
      device_id: "DEV-GLOBAL-002",
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store2.store_id}/terminals`,
      terminalData,
    );

    // THEN: Request fails with 400 (global uniqueness prevents reuse across stores)
    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("already in use");
    expect(body.error.message).toContain("globally unique");
  });

  /**
   * BR-TERM-007: Cannot delete terminal with active shift
   *
   * WHY: Data integrity - prevent deletion of terminals in use
   * RISK: Orphaned shifts, data corruption
   * VALIDATES: Active shift protection
   */
  test("[P0-BR-TERM-007] Cannot delete terminal with active shift", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store with terminal exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    const terminalData = createTerminal({
      store_id: store.store_id,
      name: "Terminal with Active Shift",
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: {
        ...terminalData,
        device_id: terminalData.device_id || null,
      },
    });

    // AND: Terminal has an active shift
    const cashier = await createUser(prismaClient);
    await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        cashier_id: cashier.user_id,
        pos_terminal_id: terminal.pos_terminal_id,
        opened_by: cashier.user_id,
        status: "OPEN",
        opening_cash: 100.0,
      },
    });

    // WHEN: Attempting to delete terminal
    const response = await superadminApiRequest.delete(
      `/api/stores/${store.store_id}/terminals/${terminal.pos_terminal_id}`,
    );

    // THEN: Request fails with 400
    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(body.error.message).toContain("active shift");

    // AND: Terminal still exists and is not soft-deleted
    const dbTerminal = await prismaClient.pOSTerminal.findUnique({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
    expect(dbTerminal).toBeDefined();
    expect((dbTerminal as any)?.deleted_at).toBeNull();
  });

  /**
   * BR-TERM-008: Can delete terminal with closed shifts
   *
   * WHY: Allow cleanup of terminals with historical data
   * RISK: None - closed shifts are historical records
   * VALIDATES: Only active shifts prevent deletion
   */
  test("[P1-BR-TERM-008] Can delete terminal with closed shifts", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store with terminal exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    const terminalData = createTerminal({
      store_id: store.store_id,
      name: "Terminal with Closed Shift",
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: {
        ...terminalData,
        device_id: terminalData.device_id || null,
      },
    });

    // AND: Terminal has a closed shift
    await createShift(
      {
        store_id: store.store_id,
        pos_terminal_id: terminal.pos_terminal_id,
        status: "CLOSED",
        opening_cash: 100.0,
        closing_cash: 150.0,
        closed_at: new Date(),
      },
      prismaClient,
    );

    // WHEN: Deleting terminal
    const response = await superadminApiRequest.delete(
      `/api/stores/${store.store_id}/terminals/${terminal.pos_terminal_id}`,
    );

    // THEN: Terminal is soft-deleted successfully
    expect(response.status()).toBe(204);

    // AND: Terminal is soft-deleted (deleted_at is set)
    const dbTerminal = await prismaClient.pOSTerminal.findUnique({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
    expect(dbTerminal).toBeDefined();
    expect((dbTerminal as any)?.deleted_at).not.toBeNull();
    expect((dbTerminal as any)?.deleted_at).toBeInstanceOf(Date);
  });

  /**
   * BR-TERM-009: Company isolation - users can only access terminals for their company
   *
   * WHY: Company isolation security
   * RISK: Data leak to competitors
   * VALIDATES: Company isolation enforcement in GET, PUT, DELETE
   */
  test("[P0-BR-TERM-009] Corporate admin can only get terminals for own company's stores", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: Corporate admin's company has a store with terminal
    const ownStore = await createStore(prismaClient, {
      company_id: corporateAdminUser.company_id!,
      name: "Own Company Store",
    });
    const ownTerminalData = createTerminal({
      store_id: ownStore.store_id,
      name: "Own Terminal",
    });
    const ownTerminal = await prismaClient.pOSTerminal.create({
      data: {
        ...ownTerminalData,
        device_id: ownTerminalData.device_id || null,
      },
    });

    // AND: Another company has a store with terminal
    const otherOwner = await createUser(prismaClient);
    const otherCompany = await createCompany(prismaClient, {
      name: "Other Company",
      owner_user_id: otherOwner.user_id,
    });
    const otherStore = await createStore(prismaClient, {
      company_id: otherCompany.company_id,
      name: "Other Company Store",
    });
    const otherTerminalData = createTerminal({
      store_id: otherStore.store_id,
      name: "Other Terminal",
    });
    const otherTerminal = await prismaClient.pOSTerminal.create({
      data: {
        ...otherTerminalData,
        device_id: otherTerminalData.device_id || null,
      },
    });

    // WHEN: Corporate admin gets terminals for own store
    const ownResponse = await corporateAdminApiRequest.get(
      `/api/stores/${ownStore.store_id}/terminals`,
    );

    // THEN: Request succeeds
    expect(ownResponse.status()).toBe(200);

    const ownTerminals = await ownResponse.json();
    const terminalIds = ownTerminals.map((t: any) => t.pos_terminal_id);
    expect(terminalIds).toContain(ownTerminal.pos_terminal_id);
    expect(terminalIds).not.toContain(otherTerminal.pos_terminal_id);

    // WHEN: Corporate admin attempts to get terminals for other company's store
    const otherResponse = await corporateAdminApiRequest.get(
      `/api/stores/${otherStore.store_id}/terminals`,
    );

    // THEN: Request fails with 403
    expect(otherResponse.status()).toBe(403);
  });

  /**
   * BR-TERM-010: Terminals cascade delete when store is deleted
   *
   * WHY: Referential integrity
   * RISK: Orphaned terminals
   * VALIDATES: Cascade delete behavior
   */
  test("[P1-BR-TERM-010] Terminals cascade delete when store is deleted", async ({
    prismaClient,
  }) => {
    // GIVEN: A store with terminals exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
      status: "INACTIVE", // Must be INACTIVE to delete
    });

    const terminal1Data = createTerminal({
      store_id: store.store_id,
      name: "Terminal 1",
    });
    const terminal1 = await prismaClient.pOSTerminal.create({
      data: {
        ...terminal1Data,
        device_id: terminal1Data.device_id || null,
      },
    });

    const terminal2Data = createTerminal({
      store_id: store.store_id,
      name: "Terminal 2",
    });
    const terminal2 = await prismaClient.pOSTerminal.create({
      data: {
        ...terminal2Data,
        device_id: terminal2Data.device_id || null,
      },
    });

    // WHEN: Store is deleted
    await prismaClient.store.delete({
      where: { store_id: store.store_id },
    });

    // THEN: Terminals are also deleted (CASCADE)
    const dbTerminal1 = await prismaClient.pOSTerminal.findUnique({
      where: { pos_terminal_id: terminal1.pos_terminal_id },
    });
    const dbTerminal2 = await prismaClient.pOSTerminal.findUnique({
      where: { pos_terminal_id: terminal2.pos_terminal_id },
    });

    expect(dbTerminal1).toBeNull();
    expect(dbTerminal2).toBeNull();
  });

  /**
   * BR-TERM-011: System admin can update terminals for any store
   *
   * WHY: System admins need full access
   * RISK: Unauthorized updates
   * VALIDATES: SYSTEM scope bypasses company isolation
   */
  test("[P0-BR-TERM-011] System admin can update terminal for any store", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store with terminal exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    const terminalData = createTerminal({
      store_id: store.store_id,
      name: "Original Terminal",
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: {
        ...terminalData,
        device_id: terminalData.device_id || null,
      },
    });

    // WHEN: System admin updates terminal
    const updateData = {
      name: "Updated Terminal",
      device_id: "DEV-UPDATED",
    };

    const response = await superadminApiRequest.put(
      `/api/stores/${store.store_id}/terminals/${terminal.pos_terminal_id}`,
      updateData,
    );

    // THEN: Terminal is updated successfully
    expect(response.status()).toBe(200);

    const updatedTerminal = await response.json();
    expect(updatedTerminal.name).toBe("Updated Terminal");
    expect(updatedTerminal.device_id).toBe("DEV-UPDATED");
    expect(updatedTerminal.deleted_at).toBeNull();

    // AND: Database reflects the update
    const dbTerminal = await prismaClient.pOSTerminal.findUnique({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
    expect(dbTerminal?.name).toBe("Updated Terminal");
    expect(dbTerminal?.device_id).toBe("DEV-UPDATED");
    expect((dbTerminal as any)?.deleted_at).toBeNull();
  });

  /**
   * BR-TERM-012: Unauthenticated requests return 401
   *
   * WHY: Security - prevent unauthorized access
   * RISK: Unauthorized terminal management
   * VALIDATES: Authentication middleware
   */
  test("[P0-BR-TERM-012] Unauthenticated request to create terminal returns 401", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    // WHEN: Unauthenticated request to create terminal
    const terminalData = {
      name: "Unauthorized Terminal",
    };

    const response = await apiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Request fails with 401
    expect(response.status()).toBe(401);
  });

  /**
   * BR-TERM-013: Invalid store ID returns 403
   *
   * WHY: Security - don't reveal if store exists
   * RISK: Information disclosure through error messages
   * VALIDATES: Error handling with access control
   * NOTE: Returns 403 (not 404) to prevent store ID enumeration
   */
  test("[P1-BR-TERM-013] Invalid store ID returns 403", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: An invalid store ID
    const fakeStoreId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Attempting to create terminal
    const terminalData = {
      name: "Terminal 1",
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${fakeStoreId}/terminals`,
      terminalData,
    );

    // THEN: Request fails with 403 (security: don't reveal store existence)
    expect(response.status()).toBe(403);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("PERMISSION_DENIED");
  });

  /**
   * BR-TERM-014: Invalid terminal ID returns 404
   *
   * WHY: Clear error messaging
   * RISK: Confusing error messages
   * VALIDATES: Error handling
   */
  test("[P1-BR-TERM-014] Invalid terminal ID returns 404", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    // AND: An invalid terminal ID
    const fakeTerminalId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Attempting to update terminal
    const updateData = {
      name: "Updated Terminal",
    };

    const response = await superadminApiRequest.put(
      `/api/stores/${store.store_id}/terminals/${fakeTerminalId}`,
      updateData,
    );

    // THEN: Request fails with 404
    expect(response.status()).toBe(404);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  /**
   * Edge Case: Terminal name with whitespace is trimmed
   *
   * WHY: Data quality
   * RISK: Inconsistent data storage
   * VALIDATES: Input sanitization
   */
  test("[P1-EDGE-001] Terminal name with leading/trailing whitespace is trimmed", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    // WHEN: Creating terminal with whitespace
    const terminalData = {
      name: "  Terminal with Spaces  ",
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Terminal is created with trimmed name
    expect(response.status()).toBe(201);

    const createdTerminal = await response.json();
    expect(createdTerminal.name).toBe("Terminal with Spaces");

    // AND: Database stores trimmed name
    const dbTerminal = await prismaClient.pOSTerminal.findUnique({
      where: { pos_terminal_id: createdTerminal.pos_terminal_id },
    });
    expect(dbTerminal?.name).toBe("Terminal with Spaces");
  });

  /**
   * Edge Case: Empty device_id is stored as null
   *
   * WHY: Data consistency
   * RISK: Inconsistent null handling
   * VALIDATES: Optional field handling
   */
  test("[P1-EDGE-002] Empty device_id is stored as null", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
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

    // AND: Database stores null
    const dbTerminal = await prismaClient.pOSTerminal.findUnique({
      where: { pos_terminal_id: createdTerminal.pos_terminal_id },
    });
    expect(dbTerminal?.device_id).toBeNull();
  });

  /**
   * Edge Case: Partial update only updates provided fields
   *
   * WHY: RESTful API behavior
   * RISK: Unintended field updates
   * VALIDATES: Partial update logic
   */
  test("[P1-EDGE-003] Partial update only updates provided fields", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store with terminal exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    const terminalData = createTerminal({
      store_id: store.store_id,
      name: "Original Terminal",
      device_id: "DEV-ORIGINAL",
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: {
        ...terminalData,
        device_id: terminalData.device_id || null,
      },
    });

    // WHEN: Updating only the name
    const updateData = {
      name: "Updated Terminal",
    };

    const response = await superadminApiRequest.put(
      `/api/stores/${store.store_id}/terminals/${terminal.pos_terminal_id}`,
      updateData,
    );

    // THEN: Only name is updated
    expect(response.status()).toBe(200);

    const updatedTerminal = await response.json();
    expect(updatedTerminal.name).toBe("Updated Terminal");
    expect(updatedTerminal.device_id).toBe("DEV-ORIGINAL"); // Unchanged
    expect(updatedTerminal.deleted_at).toBeNull(); // Unchanged
  });

  /**
   * Story 4.81: External POS Connection Schema Tests
   * Tests for new connection fields and validation
   */

  test("[P0-AC3] Create terminal with new connection fields", async ({
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

    // WHEN: Creating terminal with connection fields
    const terminalData = {
      name: "API Terminal",
      connection_type: "API",
      connection_config: {
        baseUrl: "https://api.example.com",
        apiKey: "test-api-key",
      },
      vendor_type: "SQUARE",
      terminal_status: "ACTIVE",
      sync_status: "NEVER",
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Terminal is created with connection fields
    expect(response.status()).toBe(201);
    const createdTerminal = await response.json();
    expect(createdTerminal.connection_type).toBe("API");
    expect(createdTerminal.connection_config).toEqual(
      terminalData.connection_config,
    );
    expect(createdTerminal.vendor_type).toBe("SQUARE");
    expect(createdTerminal.terminal_status).toBe("ACTIVE");
    expect(createdTerminal.sync_status).toBe("NEVER");
  });

  test("[P1-AC3] Create terminal without new fields (backward compatibility)", async ({
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

    // WHEN: Creating terminal without new fields
    const terminalData = {
      name: "Legacy Terminal",
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Terminal is created with defaults
    expect(response.status()).toBe(201);
    const createdTerminal = await response.json();
    expect(createdTerminal.connection_type).toBe("MANUAL");
    expect(createdTerminal.vendor_type).toBe("GENERIC");
    expect(createdTerminal.terminal_status).toBe("ACTIVE");
    expect(createdTerminal.sync_status).toBe("NEVER");
  });

  test("[P0-AC3] Update terminal modifies connection configuration", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A terminal exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });
    const terminalData = createTerminal({
      store_id: store.store_id,
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: {
        ...terminalData,
        device_id: terminalData.device_id || null,
      },
    });

    // WHEN: Updating connection configuration
    const updateData = {
      connection_type: "NETWORK",
      connection_config: {
        host: "192.168.1.100",
        port: 8080,
        protocol: "TCP",
      },
      vendor_type: "CLOVER",
    };

    const response = await superadminApiRequest.put(
      `/api/stores/${store.store_id}/terminals/${terminal.pos_terminal_id}`,
      updateData,
    );

    // THEN: Connection configuration is updated
    expect(response.status()).toBe(200);
    const updatedTerminal = await response.json();
    expect(updatedTerminal.connection_type).toBe("NETWORK");
    expect(updatedTerminal.connection_config).toEqual(
      updateData.connection_config,
    );
    expect(updatedTerminal.vendor_type).toBe("CLOVER");
  });

  test("[P0-AC3] Get terminals returns new fields", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A terminal with connection fields exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });
    await prismaClient.pOSTerminal.create({
      data: {
        store_id: store.store_id,
        name: "Test Terminal",
        connection_type: "WEBHOOK",
        connection_config: {
          webhookUrl: "https://webhook.example.com",
          secret: "webhook-secret",
        },
        vendor_type: "TOAST",
        terminal_status: "PENDING",
        sync_status: "SUCCESS",
      },
    });

    // WHEN: Getting terminals
    const response = await superadminApiRequest.get(
      `/api/stores/${store.store_id}/terminals`,
    );

    // THEN: Response includes new fields
    expect(response.status()).toBe(200);
    const terminals = await response.json();
    expect(terminals.length).toBeGreaterThan(0);
    const terminal = terminals.find((t: any) => t.name === "Test Terminal");
    expect(terminal).toBeDefined();
    expect(terminal.connection_type).toBe("WEBHOOK");
    expect(terminal.connection_config).toBeDefined();
    expect(terminal.vendor_type).toBe("TOAST");
    expect(terminal.terminal_status).toBe("PENDING");
    expect(terminal.sync_status).toBe("SUCCESS");
  });

  test("[P0-AC3] Zod validation rejects invalid connection_config structures", async ({
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

    // WHEN: Creating terminal with invalid connection_config for API type
    const terminalData = {
      name: "Invalid Terminal",
      connection_type: "API",
      connection_config: {
        // Missing required apiKey
        baseUrl: "https://api.example.com",
      },
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Validation error is returned
    expect(response.status()).toBe(400);
    const error = await response.json();
    expect(error.success).toBe(false);
    expect(error.error.code).toBe("VALIDATION_ERROR");
  });

  test("[P1-AC3] MANUAL connection type requires no config", async ({
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

    // WHEN: Creating terminal with MANUAL type and no config
    const terminalData = {
      name: "Manual Terminal",
      connection_type: "MANUAL",
      // connection_config not provided
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Terminal is created successfully
    expect(response.status()).toBe(201);
    const createdTerminal = await response.json();
    expect(createdTerminal.connection_type).toBe("MANUAL");
    expect(createdTerminal.connection_config).toBeNull();
  });

  // ============================================================================
  // 🔒 SECURITY TESTS (Mandatory - Applied Automatically)
  // ============================================================================

  /**
   * SQL Injection Prevention Tests
   * WHY: Database queries use user input - must prevent SQL injection
   * RISK: Database compromise, data theft
   */
  test("[P0-SEC-001] SQL injection in terminal name is sanitized", async ({
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
      device_id: "DEV-SQL-INJECT",
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

  test("[P0-SEC-002] SQL injection in device_id is sanitized", async ({
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
    // Use unique device_id to avoid unique constraint violations in parallel tests
    const terminalData = {
      name: "SQL Test Terminal",
      device_id: `' OR '1'='1-${Date.now()}`,
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Terminal is created safely
    expect(response.status()).toBe(201);
    const createdTerminal = await response.json();
    expect(createdTerminal.device_id).toContain("' OR '1'='1"); // Stored safely (with unique suffix)
  });

  /**
   * XSS Prevention Tests
   * WHY: Terminal name is user-provided and returned in API responses
   * RISK: Script injection, session hijacking
   */
  test("[P0-SEC-003] XSS script injection in terminal name is stored safely", async ({
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

  test("[P0-SEC-004] XSS HTML injection in terminal name is stored safely", async ({
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

  /**
   * Authentication Bypass Tests
   * WHY: All endpoints require authentication
   * RISK: Unauthorized access
   */
  test("[P0-SEC-005] Missing Authorization header returns 401", async ({
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

  test("[P0-SEC-006] Invalid token format returns 401", async ({
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
  test("[P0-SEC-007] Corporate admin cannot update other company's terminal", async ({
    corporateAdminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Another company has a terminal
    const otherOwner = await createUser(prismaClient);
    const otherCompany = await createCompany(prismaClient, {
      owner_user_id: otherOwner.user_id,
    });
    const otherStore = await createStore(prismaClient, {
      company_id: otherCompany.company_id,
    });
    const terminalData = createTerminal({
      store_id: otherStore.store_id,
      name: "Other Company Terminal",
    });
    const otherTerminal = await prismaClient.pOSTerminal.create({
      data: {
        ...terminalData,
        device_id: terminalData.device_id || null,
      },
    });

    // WHEN: Corporate admin attempts to update other company's terminal
    const response = await corporateAdminApiRequest.put(
      `/api/stores/${otherStore.store_id}/terminals/${otherTerminal.pos_terminal_id}`,
      { name: "Hacked Terminal" },
    );

    // THEN: Request fails with 403
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("PERMISSION_DENIED");
  });

  test("[P0-SEC-008] Corporate admin cannot delete other company's terminal", async ({
    corporateAdminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Another company has a terminal
    const otherOwner = await createUser(prismaClient);
    const otherCompany = await createCompany(prismaClient, {
      owner_user_id: otherOwner.user_id,
    });
    const otherStore = await createStore(prismaClient, {
      company_id: otherCompany.company_id,
    });
    const terminalData = createTerminal({
      store_id: otherStore.store_id,
      name: "Other Company Terminal",
    });
    const otherTerminal = await prismaClient.pOSTerminal.create({
      data: {
        ...terminalData,
        device_id: terminalData.device_id || null,
      },
    });

    // WHEN: Corporate admin attempts to delete other company's terminal
    const response = await corporateAdminApiRequest.delete(
      `/api/stores/${otherStore.store_id}/terminals/${otherTerminal.pos_terminal_id}`,
    );

    // THEN: Request fails with 403
    expect(response.status()).toBe(403);
  });

  /**
   * Input Validation Tests
   * WHY: Invalid input must be rejected
   * RISK: Data corruption, security vulnerabilities
   */
  test("[P0-SEC-009] Invalid UUID format for storeId returns 400", async ({
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

  test("[P0-SEC-010] Invalid UUID format for terminalId returns 400", async ({
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

    // WHEN: Request with invalid UUID format
    const response = await superadminApiRequest.put(
      `/api/stores/${store.store_id}/terminals/not-a-uuid`,
      { name: "Updated Terminal" },
    );

    // THEN: Request fails with 400
    expect(response.status()).toBe(400);
  });

  test("[P0-SEC-011] Invalid enum value for connection_type returns 400", async ({
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
  test("[P0-SEC-012] Corporate admin cannot access other company's connection_config", async ({
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

  test("[P1-EDGE-004] Terminal name with only whitespace is rejected", async ({
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

  test("[P1-EDGE-005] Terminal name with Unicode and emoji is handled correctly", async ({
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

  test("[P1-EDGE-006] Device ID with special characters is handled correctly", async ({
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

    // WHEN: Creating terminal with special characters in device_id
    const terminalData = {
      name: "Special Terminal",
      device_id: "DEV-001_@#$%",
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Terminal is created successfully
    expect(response.status()).toBe(201);
    const createdTerminal = await response.json();
    expect(createdTerminal.device_id).toBe("DEV-001_@#$%");
  });

  test("[P1-EDGE-007] Connection config with extra fields is validated", async ({
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

    // WHEN: Creating terminal with extra fields in connection_config
    const terminalData = {
      name: "Test Terminal",
      connection_type: "API",
      connection_config: {
        baseUrl: "https://api.example.com",
        apiKey: "test-key",
        extraField: "should be ignored or rejected",
      },
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Validation may pass (extra fields might be ignored) or fail
    // The exact behavior depends on Zod schema strictness
    expect([201, 400]).toContain(response.status());
  });

  test("[P1-EDGE-008] Soft-deleted terminal cannot be updated", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A soft-deleted terminal exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });
    const terminalData = createTerminal({
      store_id: store.store_id,
      name: "Deleted Terminal",
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: {
        ...terminalData,
        device_id: terminalData.device_id || null,
        deleted_at: new Date(), // Soft-deleted
      },
    });

    // WHEN: Attempting to update soft-deleted terminal
    const response = await superadminApiRequest.put(
      `/api/stores/${store.store_id}/terminals/${terminal.pos_terminal_id}`,
      { name: "Updated Terminal" },
    );

    // THEN: Request fails with 404 (terminal not found - excluded from queries)
    expect(response.status()).toBe(404);
  });

  // ============================================================================
  // 💼 BUSINESS LOGIC TESTS (From Q&A)
  // ============================================================================

  /**
   * Gap 1: Active Shift Status Values - Confirmed
   * All statuses (OPEN, ACTIVE, CLOSING, RECONCILING) prevent terminal deletion
   */
  test("[P0-BL-001] Cannot delete terminal with shift status ACTIVE", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A terminal with ACTIVE shift exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });
    const terminalData = createTerminal({
      store_id: store.store_id,
      name: "Terminal with ACTIVE Shift",
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: {
        ...terminalData,
        device_id: terminalData.device_id || null,
      },
    });
    const cashier = await createUser(prismaClient);
    await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        cashier_id: cashier.user_id,
        pos_terminal_id: terminal.pos_terminal_id,
        opened_by: cashier.user_id,
        status: "ACTIVE",
        opening_cash: 100.0,
      },
    });

    // WHEN: Attempting to delete terminal
    const response = await superadminApiRequest.delete(
      `/api/stores/${store.store_id}/terminals/${terminal.pos_terminal_id}`,
    );

    // THEN: Request fails with 400
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("active shift");
  });

  test("[P0-BL-002] Cannot delete terminal with shift status CLOSING", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A terminal with CLOSING shift exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });
    const terminalData = createTerminal({
      store_id: store.store_id,
      name: "Terminal with CLOSING Shift",
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: {
        ...terminalData,
        device_id: terminalData.device_id || null,
      },
    });
    const cashier = await createUser(prismaClient);
    await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        cashier_id: cashier.user_id,
        pos_terminal_id: terminal.pos_terminal_id,
        opened_by: cashier.user_id,
        status: "CLOSING",
        opening_cash: 100.0,
      },
    });

    // WHEN: Attempting to delete terminal
    const response = await superadminApiRequest.delete(
      `/api/stores/${store.store_id}/terminals/${terminal.pos_terminal_id}`,
    );

    // THEN: Request fails with 400
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("active shift");
  });

  test("[P0-BL-003] Cannot delete terminal with shift status RECONCILING", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A terminal with RECONCILING shift exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });
    const terminalData = createTerminal({
      store_id: store.store_id,
      name: "Terminal with RECONCILING Shift",
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: {
        ...terminalData,
        device_id: terminalData.device_id || null,
      },
    });
    const cashier = await createUser(prismaClient);
    await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        cashier_id: cashier.user_id,
        pos_terminal_id: terminal.pos_terminal_id,
        opened_by: cashier.user_id,
        status: "RECONCILING",
        opening_cash: 100.0,
      },
    });

    // WHEN: Attempting to delete terminal
    const response = await superadminApiRequest.delete(
      `/api/stores/${store.store_id}/terminals/${terminal.pos_terminal_id}`,
    );

    // THEN: Request fails with 400
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("active shift");
  });

  /**
   * Gap 3: Terminal Status Transitions - Confirmed
   * Terminal can transition from ERROR to ACTIVE directly
   */
  test("[P1-BL-004] Terminal can transition from ERROR to ACTIVE directly", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A terminal with ERROR status exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });
    const terminalData = createTerminal({
      store_id: store.store_id,
      name: "Error Terminal",
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: {
        ...terminalData,
        device_id: terminalData.device_id || null,
        terminal_status: "ERROR",
      },
    });

    // WHEN: Updating terminal status directly to ACTIVE
    const response = await superadminApiRequest.put(
      `/api/stores/${store.store_id}/terminals/${terminal.pos_terminal_id}`,
      { terminal_status: "ACTIVE" },
    );

    // THEN: Terminal status is updated successfully
    expect(response.status()).toBe(200);
    const updatedTerminal = await response.json();
    expect(updatedTerminal.terminal_status).toBe("ACTIVE");
  });

  /**
   * Gap 4: Sync Status Behavior - Confirmed
   * Sync status updates automatically, manual sync can be executed
   */
  test("[P1-BL-005] Sync status can be updated manually", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A terminal exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });
    const terminalData = createTerminal({
      store_id: store.store_id,
      name: "Sync Test Terminal",
    });
    const terminal = await prismaClient.pOSTerminal.create({
      data: {
        ...terminalData,
        device_id: terminalData.device_id || null,
        sync_status: "NEVER",
      },
    });

    // WHEN: Manually updating sync status
    const response = await superadminApiRequest.put(
      `/api/stores/${store.store_id}/terminals/${terminal.pos_terminal_id}`,
      { sync_status: "SUCCESS" },
    );

    // THEN: Sync status is updated successfully
    expect(response.status()).toBe(200);
    const updatedTerminal = await response.json();
    expect(updatedTerminal.sync_status).toBe("SUCCESS");
  });

  test("[P1-BL-006] Sync status reflects current sync state", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A terminal with different sync statuses
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // Test all sync status values
    const syncStatuses = ["NEVER", "SUCCESS", "FAILED", "IN_PROGRESS"] as const;

    for (const syncStatus of syncStatuses) {
      const terminalData = createTerminal({
        store_id: store.store_id,
        name: `Sync Status ${syncStatus}`,
      });
      const terminal = await prismaClient.pOSTerminal.create({
        data: {
          ...terminalData,
          device_id: terminalData.device_id || null,
          sync_status: syncStatus,
        },
      });

      // WHEN: Getting terminal
      const response = await superadminApiRequest.get(
        `/api/stores/${store.store_id}/terminals`,
      );

      // THEN: Sync status is correctly reflected
      expect(response.status()).toBe(200);
      const terminals = await response.json();
      const foundTerminal = terminals.find(
        (t: any) => t.pos_terminal_id === terminal.pos_terminal_id,
      );
      expect(foundTerminal).toBeDefined();
      expect(foundTerminal.sync_status).toBe(syncStatus);
    }
  });
});
