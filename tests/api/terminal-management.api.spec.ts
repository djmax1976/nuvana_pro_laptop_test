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
 * - BR-TERM-016: Device ID must be unique per store
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
      device_id: "DEV-001",
    };

    const response = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      terminalData,
    );

    // THEN: Terminal is created successfully
    expect(response.status()).toBe(201);

    const createdTerminal = await response.json();
    expect(createdTerminal.name).toBe("Terminal 1");
    expect(createdTerminal.device_id).toBe("DEV-001");
    expect(createdTerminal.deleted_at).toBeNull();
    expect(createdTerminal.store_id).toBe(store.store_id);
    expect(createdTerminal.pos_terminal_id).toBeDefined();

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
      status: "ACTIVE",
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
    expect(body.error.message).toContain("Forbidden");
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

    // THEN: Request fails with 404
    expect(response.status()).toBe(404);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toContain("not found");
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
   * BR-TERM-016: Device ID must be unique per store
   *
   * WHY: Device ID uniqueness requirement per store
   * RISK: Duplicate device IDs within same store
   * VALIDATES: Per-store uniqueness constraint
   */
  test("[P0-BR-TERM-016] Device ID must be unique per store", async ({
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
      device_id: "DEV-STORE-001",
    });
    const existingTerminal = await prismaClient.pOSTerminal.create({
      data: {
        ...existingTerminalData,
        device_id: existingTerminalData.device_id || null,
      },
    });

    // WHEN: Attempting to create another terminal in the same store with the same device_id
    const terminalData = {
      name: "Duplicate Device Terminal",
      device_id: "DEV-STORE-001",
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
   * BR-TERM-013: Invalid store ID returns 404
   *
   * WHY: Clear error messaging
   * RISK: Confusing error messages
   * VALIDATES: Error handling
   */
  test("[P1-BR-TERM-013] Invalid store ID returns 404", async ({
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

    // THEN: Request fails with 404
    expect(response.status()).toBe(404);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
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
});
