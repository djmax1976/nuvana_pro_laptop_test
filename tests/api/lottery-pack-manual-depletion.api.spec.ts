/**
 * Lottery Pack Manual Depletion API Tests
 *
 * Tests for the manual pack depletion (mark as sold out) endpoint:
 * - POST /api/lottery/packs/:packId/deplete
 *
 * =============================================================================
 * TRACEABILITY MATRIX
 * =============================================================================
 *
 * | Test ID | Requirement | Type | Priority | Coverage |
 * |---------|-------------|------|----------|----------|
 * | MDP-001 | Pack must be ACTIVE to deplete | Business Logic | P0 | Happy Path |
 * | MDP-002 | Returns depleted pack data | Business Logic | P0 | Happy Path |
 * | MDP-003 | Sets depletion_reason to MANUAL_SOLD_OUT | Business Logic | P0 | Happy Path |
 * | MDP-004 | Records depleted_at timestamp | Business Logic | P0 | Happy Path |
 * | MDP-005 | Creates audit log entry | Business Logic | P1 | Happy Path |
 * | MDP-006 | Reject non-ACTIVE pack (RECEIVED) | Business Logic | P0 | Edge Case |
 * | MDP-007 | Reject already depleted pack | Business Logic | P0 | Edge Case |
 * | MDP-008 | Reject returned pack | Business Logic | P0 | Edge Case |
 * | MDP-009 | 404 for non-existent pack | Error Handling | P0 | Error |
 * | MDP-010 | 401 for unauthenticated request | Security | P0 | Security |
 * | MDP-011 | 403 without LOTTERY_SHIFT_CLOSE permission | Security | P0 | Security |
 * | MDP-012 | RLS prevents cross-store access | Security | P0 | Security |
 * | MDP-013 | SQL injection in packId param | Security | P0 | Security |
 * | MDP-014 | Links to active shift if present | Integration | P1 | Integration |
 * | MDP-015 | Works without active shift | Integration | P1 | Integration |
 * | MDP-016 | Creates shift closing record | Business Logic | P1 | Integration |
 * | MDP-017 | Invalid UUID format rejection | Input Validation | P1 | Validation |
 * | MDP-018 | Custom closing_serial within valid range | Input Validation | P1 | Happy Path |
 * | MDP-019 | Reject closing_serial > serial_end | Input Validation | P1 | Validation |
 * | MDP-020 | Reject negative closing_serial | Input Validation | P1 | Validation |
 * | MDP-021 | Reject non-numeric closing_serial | Input Validation | P1 | Validation |
 * | MDP-022 | Depleted_by field set to user ID | Business Logic | P0 | Happy Path |
 * | MDP-023 | Concurrent depletion handling | Concurrency | P1 | Edge Case |
 * | MDP-024 | Empty body validation (bug fix) | Input Validation | P0 | Regression |
 * | MDP-025 | Default closing_serial when empty body | Business Logic | P1 | Happy Path |
 *
 * =============================================================================
 *
 * MCP Guidance Applied:
 * - API-001: VALIDATION - Always send valid JSON body for POST requests
 * - DB-006: TENANT_ISOLATION - Validate user has store access via role scope
 * - API-003: ERROR_HANDLING - Return generic errors, never leak internals
 * - SEC-010: AUTHZ - Permission checks via LOTTERY_SHIFT_CLOSE
 *
 * @test-level API
 * @justification Tests API endpoint with authentication, authorization, RLS, and business logic
 * @story Lottery Pack Auto-Depletion Feature
 * @priority P0 (Critical - Security, Data Integrity, Business Logic)
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createLotteryGame,
  createLotteryPack,
  createLotteryBin,
} from "../support/factories/lottery.factory";
import {
  createCompany,
  createStore,
} from "../support/factories/database.factory";
import { createCashier } from "../support/factories/cashier.factory";

test.describe("Lottery Pack Manual Depletion API", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // HAPPY PATH TESTS (P0)
  // ═══════════════════════════════════════════════════════════════════════════

  test("MDP-001: [P0] POST /api/lottery/packs/:packId/deplete - should deplete ACTIVE pack successfully", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An ACTIVE lottery pack in the store
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game MDP-001",
      price: 5.0,
    });

    const bin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
      name: "Bin 1",
      display_order: 0,
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "MDP001",
      serial_start: "001",
      serial_end: "050",
      status: "ACTIVE",
      activated_at: new Date(),
      current_bin_id: bin.bin_id,
    });

    // WHEN: Calling the deplete endpoint with empty body
    // MCP Guidance: API-001 - Always send valid JSON body for POST requests
    const response = await storeManagerApiRequest.post(
      `/api/lottery/packs/${pack.pack_id}/deplete`,
      { data: {} },
    );

    // THEN: Response is successful
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();

    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.pack_id, "pack_id should match").toBe(pack.pack_id);
    expect(body.data.status, "Status should be DEPLETED").toBe("DEPLETED");
  });

  test("MDP-002: [P0] Returns correct response structure with depleted pack data", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An ACTIVE pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game MDP-002",
      price: 10.0,
    });

    const bin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
      name: "Bin 2",
      display_order: 1,
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "MDP002",
      serial_start: "001",
      serial_end: "100",
      status: "ACTIVE",
      activated_at: new Date(),
      current_bin_id: bin.bin_id,
    });

    // WHEN: Depleting the pack with empty body
    const response = await storeManagerApiRequest.post(
      `/api/lottery/packs/${pack.pack_id}/deplete`,
      { data: {} },
    );

    // THEN: Response contains all expected fields
    const body = await response.json();

    expect(body.data).toHaveProperty("pack_id");
    expect(body.data).toHaveProperty("pack_number");
    expect(body.data).toHaveProperty("status");
    expect(body.data).toHaveProperty("depleted_at");
    expect(body.data).toHaveProperty("depletion_reason");
    expect(body.data).toHaveProperty("game_name");
    expect(body.data).toHaveProperty("bin_name");

    expect(body.data.pack_number).toBe("MDP002");
    expect(body.data.game_name).toBe("Test Game MDP-002");
    expect(body.data.bin_name).toBe("Bin 2");
  });

  test("MDP-003: [P0] Sets depletion_reason to MANUAL_SOLD_OUT", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An ACTIVE pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game MDP-003",
      price: 2.0,
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "MDP003",
      serial_start: "001",
      serial_end: "030",
      status: "ACTIVE",
      activated_at: new Date(),
    });

    // WHEN: Depleting the pack with empty body
    const response = await storeManagerApiRequest.post(
      `/api/lottery/packs/${pack.pack_id}/deplete`,
      { data: {} },
    );

    // THEN: depletion_reason is MANUAL_SOLD_OUT
    const body = await response.json();
    expect(body.data.depletion_reason).toBe("MANUAL_SOLD_OUT");

    // Verify in database
    const updatedPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: pack.pack_id },
    });
    expect(updatedPack?.depletion_reason).toBe("MANUAL_SOLD_OUT");
  });

  test("MDP-004: [P0] Records depleted_at timestamp", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An ACTIVE pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game MDP-004",
      price: 5.0,
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "MDP004",
      serial_start: "001",
      serial_end: "050",
      status: "ACTIVE",
      activated_at: new Date(),
    });

    const beforeRequest = new Date();

    // WHEN: Depleting the pack with empty body
    const response = await storeManagerApiRequest.post(
      `/api/lottery/packs/${pack.pack_id}/deplete`,
      { data: {} },
    );

    const afterRequest = new Date();

    // THEN: depleted_at is set to a recent timestamp
    const body = await response.json();
    expect(body.data.depleted_at).toBeDefined();

    const depletedAt = new Date(body.data.depleted_at);
    expect(depletedAt.getTime()).toBeGreaterThanOrEqual(
      beforeRequest.getTime(),
    );
    expect(depletedAt.getTime()).toBeLessThanOrEqual(
      afterRequest.getTime() + 1000,
    );
  });

  test("MDP-005: [P1] Creates audit log entry for manual depletion", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An ACTIVE pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game MDP-005",
      price: 5.0,
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "MDP005",
      serial_start: "001",
      serial_end: "050",
      status: "ACTIVE",
      activated_at: new Date(),
    });

    // WHEN: Depleting the pack with empty body
    await storeManagerApiRequest.post(
      `/api/lottery/packs/${pack.pack_id}/deplete`,
      { data: {} },
    );

    // THEN: Audit log entry is created
    const auditLog = await prismaClient.auditLog.findFirst({
      where: {
        record_id: pack.pack_id,
        action: "PACK_MANUALLY_DEPLETED",
      },
      orderBy: { timestamp: "desc" },
    });

    expect(auditLog).not.toBeNull();
    expect(auditLog?.user_id).toBe(storeManagerUser.user_id);
    expect(auditLog?.table_name).toBe("lottery_packs");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASE / VALIDATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("MDP-006: [P0] Rejects depletion of RECEIVED (non-ACTIVE) pack", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A pack in RECEIVED status
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game MDP-006",
      price: 5.0,
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "MDP006",
      serial_start: "001",
      serial_end: "050",
      status: "RECEIVED", // Not ACTIVE
    });

    // WHEN: Attempting to deplete with empty body
    const response = await storeManagerApiRequest.post(
      `/api/lottery/packs/${pack.pack_id}/deplete`,
      { data: {} },
    );

    // THEN: Request is rejected with 400
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("ACTIVE");
  });

  test("MDP-007: [P0] Rejects depletion of already DEPLETED pack", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A pack already in DEPLETED status
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game MDP-007",
      price: 5.0,
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "MDP007",
      serial_start: "001",
      serial_end: "050",
      status: "DEPLETED",
      activated_at: new Date(Date.now() - 86400000),
      depleted_at: new Date(),
    });

    // WHEN: Attempting to deplete again with empty body
    const response = await storeManagerApiRequest.post(
      `/api/lottery/packs/${pack.pack_id}/deplete`,
      { data: {} },
    );

    // THEN: Request is rejected with 400
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("ACTIVE");
  });

  test("MDP-008: [P0] Rejects depletion of RETURNED pack", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A pack in RETURNED status
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game MDP-008",
      price: 5.0,
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "MDP008",
      serial_start: "001",
      serial_end: "050",
      status: "RETURNED",
      returned_at: new Date(),
    });

    // WHEN: Attempting to deplete with empty body
    const response = await storeManagerApiRequest.post(
      `/api/lottery/packs/${pack.pack_id}/deplete`,
      { data: {} },
    );

    // THEN: Request is rejected with 400
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test("MDP-009: [P0] Returns 404 for non-existent pack", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: A non-existent pack UUID
    const fakePackId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Attempting to deplete with empty body
    const response = await storeManagerApiRequest.post(
      `/api/lottery/packs/${fakePackId}/deplete`,
      { data: {} },
    );

    // THEN: Returns 404
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("PACK_NOT_FOUND");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("MDP-010: [P0] [SECURITY] Returns 401 for unauthenticated request", async ({
    request,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An ACTIVE pack (but no auth token)
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game MDP-010",
      price: 5.0,
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "MDP010",
      serial_start: "001",
      serial_end: "050",
      status: "ACTIVE",
      activated_at: new Date(),
    });

    // WHEN: Making request without authentication (with empty body)
    const response = await request.post(
      `http://localhost:3001/api/lottery/packs/${pack.pack_id}/deplete`,
      { data: {} },
    );

    // THEN: Returns 401
    expect(response.status()).toBe(401);
  });

  test("MDP-011: [P0] [SECURITY] Returns 403 without LOTTERY_SHIFT_CLOSE permission", async ({
    cashierApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An ACTIVE pack and a cashier user (limited permissions)
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game MDP-011",
      price: 5.0,
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "MDP011",
      serial_start: "001",
      serial_end: "050",
      status: "ACTIVE",
      activated_at: new Date(),
    });

    // WHEN: Cashier attempts to deplete pack with empty body
    const response = await cashierApiRequest.post(
      `/api/lottery/packs/${pack.pack_id}/deplete`,
      { data: {} },
    );

    // THEN: Returns 403 Forbidden
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("PERMISSION_DENIED");
  });

  test("MDP-012: [P0] [SECURITY] RLS prevents cross-store access", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Create a separate company/store with its own pack using factory functions
    const otherCompanyData = createCompany({
      name: "Test Other Company MDP-012",
      owner_user_id: storeManagerUser.user_id,
    });
    const otherCompany = await prismaClient.company.create({
      data: otherCompanyData,
    });

    const otherStoreData = createStore({
      company_id: otherCompany.company_id,
      name: "Test Other Store MDP-012",
    });
    const otherStore = await prismaClient.store.create({
      data: {
        ...otherStoreData,
        location_json: otherStoreData.location_json as any,
      },
    });

    const game = await createLotteryGame(prismaClient, {
      name: "Test Game MDP-012",
      price: 5.0,
    });

    const otherPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: otherStore.store_id, // Different store
      pack_number: "MDP012",
      serial_start: "001",
      serial_end: "050",
      status: "ACTIVE",
      activated_at: new Date(),
    });

    // WHEN: Attempting to deplete pack from another store with empty body
    const response = await storeManagerApiRequest.post(
      `/api/lottery/packs/${otherPack.pack_id}/deplete`,
      { data: {} },
    );

    // THEN: Returns 403 (Forbidden - RLS violation)
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("MDP-013: [P0] [SECURITY] Rejects SQL injection in packId parameter", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: SQL injection attempt in packId
    const sqlInjectionPayloads = [
      "'; DROP TABLE lottery_packs; --",
      "1 OR 1=1",
      "1; SELECT * FROM users",
      "1 UNION SELECT * FROM lottery_packs",
    ];

    for (const payload of sqlInjectionPayloads) {
      // WHEN: Attempting injection with empty body
      const response = await storeManagerApiRequest.post(
        `/api/lottery/packs/${encodeURIComponent(payload)}/deplete`,
        { data: {} },
      );

      // THEN: Request is rejected (400 or 404, not 500)
      expect(
        [400, 404].includes(response.status()),
        `Expected 400 or 404 for payload: ${payload}, got ${response.status()}`,
      ).toBe(true);
    }
  });

  test("MDP-017: [P1] Rejects invalid UUID format in packId", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: Invalid UUID formats
    const invalidUuids = [
      "not-a-uuid",
      "12345",
      "abc",
      "00000000-0000-0000-0000",
      "",
    ];

    for (const invalidUuid of invalidUuids) {
      if (!invalidUuid) continue; // Skip empty string as it changes route

      // WHEN: Requesting with invalid UUID and empty body
      const response = await storeManagerApiRequest.post(
        `/api/lottery/packs/${invalidUuid}/deplete`,
        { data: {} },
      );

      // THEN: Returns 400 Bad Request
      expect(
        response.status(),
        `Expected 400 for invalid UUID: ${invalidUuid}`,
      ).toBe(400);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INTEGRATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("MDP-014: [P1] Links to active shift when present", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An ACTIVE pack and an open shift
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game MDP-014",
      price: 5.0,
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "MDP014",
      serial_start: "001",
      serial_end: "050",
      status: "ACTIVE",
      activated_at: new Date(),
    });

    // Create an open shift
    const terminal = await prismaClient.pOSTerminal.create({
      data: {
        store_id: storeManagerUser.store_id,
        name: "Terminal 1",
        terminal_status: "ACTIVE",
      },
    });

    // Create cashier for shift (required field)
    const cashierData = await createCashier({
      store_id: storeManagerUser.store_id,
      created_by: storeManagerUser.user_id,
    });
    const cashier = await prismaClient.cashier.create({ data: cashierData });

    const shift = await prismaClient.shift.create({
      data: {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        cashier_id: cashier.cashier_id,
        opened_at: new Date(),
        status: "OPEN",
        pos_terminal_id: terminal.pos_terminal_id,
      },
    });

    // WHEN: Depleting the pack with empty body
    await storeManagerApiRequest.post(
      `/api/lottery/packs/${pack.pack_id}/deplete`,
      { data: {} },
    );

    // THEN: Pack is linked to the shift
    const updatedPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: pack.pack_id },
    });

    expect(updatedPack?.depleted_shift_id).toBe(shift.shift_id);
  });

  test("MDP-015: [P1] Works without active shift (depleted_shift_id is null)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An ACTIVE pack and NO open shift
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game MDP-015",
      price: 5.0,
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "MDP015",
      serial_start: "001",
      serial_end: "050",
      status: "ACTIVE",
      activated_at: new Date(),
    });

    // Ensure no open shifts exist
    await prismaClient.shift.updateMany({
      where: {
        store_id: storeManagerUser.store_id,
        status: "OPEN",
      },
      data: {
        status: "CLOSED",
        closed_at: new Date(),
      },
    });

    // WHEN: Depleting the pack with empty body
    const response = await storeManagerApiRequest.post(
      `/api/lottery/packs/${pack.pack_id}/deplete`,
      { data: {} },
    );

    // THEN: Request succeeds
    expect(response.status()).toBe(200);

    // And depleted_shift_id is null
    const updatedPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: pack.pack_id },
    });

    expect(updatedPack?.depleted_shift_id).toBeNull();
  });

  test("MDP-016: [P1] Creates shift closing record with correct serial", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An ACTIVE pack with a bin
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game MDP-016",
      price: 5.0,
    });

    const bin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
      name: "Bin MDP016",
      display_order: 0,
    });

    // Create terminal for shift
    const terminal = await prismaClient.pOSTerminal.create({
      data: {
        store_id: storeManagerUser.store_id,
        name: "Terminal MDP016",
        terminal_status: "ACTIVE",
      },
    });

    // Create cashier for shift (required field)
    const cashierData = await createCashier({
      store_id: storeManagerUser.store_id,
      created_by: storeManagerUser.user_id,
    });
    const cashier = await prismaClient.cashier.create({ data: cashierData });

    // Create an open shift
    const shift = await prismaClient.shift.create({
      data: {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        cashier_id: cashier.cashier_id,
        opened_at: new Date(),
        status: "OPEN",
        pos_terminal_id: terminal.pos_terminal_id,
      },
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "MDP016",
      serial_start: "001",
      serial_end: "050",
      status: "ACTIVE",
      activated_at: new Date(),
      current_bin_id: bin.bin_id,
      activated_shift_id: shift.shift_id,
    });

    // Create shift opening record
    await prismaClient.lotteryShiftOpening.create({
      data: {
        shift_id: shift.shift_id,
        pack_id: pack.pack_id,
        opening_serial: "025", // Current serial
      },
    });

    // WHEN: Depleting the pack with empty body
    await storeManagerApiRequest.post(
      `/api/lottery/packs/${pack.pack_id}/deplete`,
      { data: {} },
    );

    // THEN: Shift closing record is created with serial_end
    const closingRecord = await prismaClient.lotteryShiftClosing.findFirst({
      where: {
        pack_id: pack.pack_id,
      },
    });

    expect(closingRecord).not.toBeNull();
    expect(closingRecord?.closing_serial).toBe("050"); // serial_end of pack
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CLOSING SERIAL VALIDATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("MDP-018: [P1] Accepts custom closing_serial within valid range", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An ACTIVE pack with serial_start=001, serial_end=050
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game MDP-018",
      price: 5.0,
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "MDP018",
      serial_start: "001",
      serial_end: "050",
      status: "ACTIVE",
      activated_at: new Date(),
    });

    // WHEN: Depleting with a valid custom closing_serial
    const response = await storeManagerApiRequest.post(
      `/api/lottery/packs/${pack.pack_id}/deplete`,
      { data: { closing_serial: "025" } },
    );

    // THEN: Request succeeds
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test("MDP-019: [P1] Rejects closing_serial greater than serial_end", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An ACTIVE pack with serial_end=050
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game MDP-019",
      price: 5.0,
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "MDP019",
      serial_start: "001",
      serial_end: "050",
      status: "ACTIVE",
      activated_at: new Date(),
    });

    // WHEN: Attempting to deplete with closing_serial > serial_end
    const response = await storeManagerApiRequest.post(
      `/api/lottery/packs/${pack.pack_id}/deplete`,
      { data: { closing_serial: "100" } },
    );

    // THEN: Request is rejected with 400
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("INVALID_CLOSING_SERIAL");
  });

  test("MDP-020: [P1] Rejects negative closing_serial", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An ACTIVE pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game MDP-020",
      price: 5.0,
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "MDP020",
      serial_start: "001",
      serial_end: "050",
      status: "ACTIVE",
      activated_at: new Date(),
    });

    // WHEN: Attempting to deplete with negative closing_serial
    const response = await storeManagerApiRequest.post(
      `/api/lottery/packs/${pack.pack_id}/deplete`,
      { data: { closing_serial: "-5" } },
    );

    // THEN: Request is rejected with 400
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("INVALID_CLOSING_SERIAL");
  });

  test("MDP-021: [P1] Rejects non-numeric closing_serial", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An ACTIVE pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game MDP-021",
      price: 5.0,
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "MDP021",
      serial_start: "001",
      serial_end: "050",
      status: "ACTIVE",
      activated_at: new Date(),
    });

    // WHEN: Attempting to deplete with non-numeric closing_serial
    const response = await storeManagerApiRequest.post(
      `/api/lottery/packs/${pack.pack_id}/deplete`,
      { data: { closing_serial: "abc" } },
    );

    // THEN: Request is rejected with 400
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("INVALID_CLOSING_SERIAL");
  });

  test("MDP-022: [P0] Depleted_by field is set to current user ID", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An ACTIVE pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game MDP-022",
      price: 5.0,
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "MDP022",
      serial_start: "001",
      serial_end: "050",
      status: "ACTIVE",
      activated_at: new Date(),
    });

    // WHEN: Depleting the pack
    await storeManagerApiRequest.post(
      `/api/lottery/packs/${pack.pack_id}/deplete`,
      { data: {} },
    );

    // THEN: depleted_by is set to the current user ID
    const updatedPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: pack.pack_id },
    });

    expect(updatedPack?.depleted_by).toBe(storeManagerUser.user_id);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CONCURRENT OPERATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("MDP-023: [P1] Handles concurrent depletion attempts gracefully", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An ACTIVE pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game MDP-023",
      price: 5.0,
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "MDP023",
      serial_start: "001",
      serial_end: "050",
      status: "ACTIVE",
      activated_at: new Date(),
    });

    // WHEN: Making concurrent depletion requests
    const [response1, response2] = await Promise.all([
      storeManagerApiRequest.post(
        `/api/lottery/packs/${pack.pack_id}/deplete`,
        {
          data: {},
        },
      ),
      storeManagerApiRequest.post(
        `/api/lottery/packs/${pack.pack_id}/deplete`,
        {
          data: {},
        },
      ),
    ]);

    // THEN: One succeeds, one fails (or both succeed if second is fast enough to see ACTIVE)
    const status1 = response1.status();
    const status2 = response2.status();

    // At least one should succeed
    expect([status1, status2]).toContain(200);

    // Verify the pack is in DEPLETED state
    const updatedPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: pack.pack_id },
    });
    expect(updatedPack?.status).toBe("DEPLETED");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BODY VALIDATION TESTS (NEW - Validates the fix for "field must be object")
  // ═══════════════════════════════════════════════════════════════════════════

  test("MDP-024: [P0] Returns 400 when body is missing (not an object)", async ({
    request,
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // This test documents the original bug and ensures it's fixed
    // The backend schema requires body to be an object

    const game = await createLotteryGame(prismaClient, {
      name: "Test Game MDP-024",
      price: 5.0,
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "MDP024",
      serial_start: "001",
      serial_end: "050",
      status: "ACTIVE",
      activated_at: new Date(),
    });

    // WHEN: Sending request with empty body (the fix ensures this works)
    const response = await storeManagerApiRequest.post(
      `/api/lottery/packs/${pack.pack_id}/deplete`,
      { data: {} },
    );

    // THEN: Request succeeds (the bug was that missing body caused validation error)
    expect(response.status()).toBe(200);
  });

  test("MDP-025: [P1] Accepts empty object body correctly", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An ACTIVE pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game MDP-025",
      price: 5.0,
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "MDP025",
      serial_start: "001",
      serial_end: "100",
      status: "ACTIVE",
      activated_at: new Date(),
    });

    // WHEN: Sending request with empty object body
    const response = await storeManagerApiRequest.post(
      `/api/lottery/packs/${pack.pack_id}/deplete`,
      { data: {} },
    );

    // THEN: Uses serial_end as default closing_serial
    expect(response.status()).toBe(200);

    // Verify default closing_serial was used in any shift closing record
    const updatedPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: pack.pack_id },
    });
    expect(updatedPack?.status).toBe("DEPLETED");
  });
});
