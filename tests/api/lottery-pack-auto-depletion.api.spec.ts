/**
 * Lottery Pack Auto-Depletion API Tests
 *
 * Tests for auto-depletion when activating a new pack in an occupied bin:
 * - POST /api/stores/:storeId/lottery/bins/create-with-pack (with deplete_previous flag)
 *
 * =============================================================================
 * TRACEABILITY MATRIX
 * =============================================================================
 *
 * | Test ID | Requirement | Type | Priority | Coverage |
 * |---------|-------------|------|----------|----------|
 * | ADP-001 | Auto-deplete previous pack when deplete_previous=true | Business Logic | P0 | Happy Path |
 * | ADP-002 | Sets depletion_reason to AUTO_REPLACED | Business Logic | P0 | Happy Path |
 * | ADP-003 | Returns depleted_pack info in response | Business Logic | P0 | Happy Path |
 * | ADP-004 | Creates new bin with new pack successfully | Business Logic | P0 | Happy Path |
 * | ADP-005 | Reject occupied bin without deplete_previous flag | Business Logic | P0 | Edge Case |
 * | ADP-006 | Works normally for empty bin (no auto-deplete) | Business Logic | P0 | Edge Case |
 * | ADP-007 | Creates shift closing record for depleted pack | Integration | P1 | Integration |
 * | ADP-008 | Creates audit log for auto-depletion | Integration | P1 | Integration |
 * | ADP-009 | Previous pack removed from bin after depletion | Business Logic | P1 | Integration |
 * | ADP-010 | 401 for unauthenticated request | Security | P0 | Security |
 * | ADP-011 | RLS prevents cross-store access | Security | P0 | Security |
 * | ADP-012 | Atomic transaction - all or nothing | Business Logic | P1 | Integration |
 * | ADP-013 | Validates pack can be activated | Business Logic | P1 | Validation |
 *
 * =============================================================================
 *
 * @test-level API
 * @justification Tests API endpoint with auto-depletion business logic, transactions, and RLS
 * @story Lottery Pack Auto-Depletion Feature
 * @priority P0 (Critical - Business Logic, Data Integrity)
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

test.describe("Lottery Pack Auto-Depletion on Activation", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // HAPPY PATH TESTS (P0)
  // ═══════════════════════════════════════════════════════════════════════════

  test("ADP-001: [P0] Auto-depletes previous pack when deplete_previous=true", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An existing bin with an ACTIVE pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game ADP-001",
      price: 5.0,
    });

    const existingBin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
      name: "Bin 1",
      display_order: 0,
    });

    const previousPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PREV001",
      serial_start: "001",
      serial_end: "050",
      status: "ACTIVE",
      activated_at: new Date(),
      current_bin_id: existingBin.bin_id,
    });

    // Create a new pack to activate
    const newPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "NEW001",
      serial_start: "001",
      serial_end: "050",
      status: "RECEIVED",
    });

    // WHEN: Creating bin with deplete_previous=true
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        data: {
          bin_name: "Bin 1",
          display_order: 0,
          pack_number: newPack.pack_number,
          serial_start: "001",
          activated_by: storeManagerUser.user_id,
          deplete_previous: true,
        },
      },
    );

    // THEN: Request succeeds
    expect(response.status()).toBe(200);

    // Verify previous pack is now DEPLETED
    const updatedPreviousPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: previousPack.pack_id },
    });

    expect(updatedPreviousPack?.status).toBe("DEPLETED");
    expect(updatedPreviousPack?.depleted_at).not.toBeNull();
  });

  test("ADP-002: [P0] Sets depletion_reason to AUTO_REPLACED", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An existing bin with an ACTIVE pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game ADP-002",
      price: 10.0,
    });

    const existingBin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
      name: "Bin 2",
      display_order: 1,
    });

    const previousPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PREV002",
      serial_start: "001",
      serial_end: "100",
      status: "ACTIVE",
      activated_at: new Date(),
      current_bin_id: existingBin.bin_id,
    });

    const newPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "NEW002",
      serial_start: "001",
      serial_end: "100",
      status: "RECEIVED",
    });

    // WHEN: Creating bin with deplete_previous=true
    await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        data: {
          bin_name: "Bin 2",
          display_order: 1,
          pack_number: newPack.pack_number,
          serial_start: "001",
          activated_by: storeManagerUser.user_id,
          deplete_previous: true,
        },
      },
    );

    // THEN: Previous pack has depletion_reason = AUTO_REPLACED
    const updatedPreviousPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: previousPack.pack_id },
    });

    expect(updatedPreviousPack?.depletion_reason).toBe("AUTO_REPLACED");
  });

  test("ADP-003: [P0] Returns depleted_pack info in response", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An existing bin with an ACTIVE pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game ADP-003",
      price: 5.0,
    });

    const existingBin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
      name: "Bin 3",
      display_order: 2,
    });

    const previousPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PREV003",
      serial_start: "001",
      serial_end: "050",
      status: "ACTIVE",
      activated_at: new Date(),
      current_bin_id: existingBin.bin_id,
    });

    const newPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "NEW003",
      serial_start: "001",
      serial_end: "050",
      status: "RECEIVED",
    });

    // WHEN: Creating bin with deplete_previous=true
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        data: {
          bin_name: "Bin 3",
          display_order: 2,
          pack_number: newPack.pack_number,
          serial_start: "001",
          activated_by: storeManagerUser.user_id,
          deplete_previous: true,
        },
      },
    );

    // THEN: Response includes depleted_pack info
    const body = await response.json();

    expect(body.data).toHaveProperty("depleted_pack");
    expect(body.data.depleted_pack).toHaveProperty("pack_id");
    expect(body.data.depleted_pack).toHaveProperty("pack_number");
    expect(body.data.depleted_pack.pack_id).toBe(previousPack.pack_id);
    expect(body.data.depleted_pack.pack_number).toBe("PREV003");
  });

  test("ADP-004: [P0] Creates new bin with new pack successfully", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An existing bin with an ACTIVE pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game ADP-004",
      price: 5.0,
    });

    const existingBin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
      name: "Bin 4",
      display_order: 3,
    });

    await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PREV004",
      serial_start: "001",
      serial_end: "050",
      status: "ACTIVE",
      activated_at: new Date(),
      current_bin_id: existingBin.bin_id,
    });

    const newPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "NEW004",
      serial_start: "001",
      serial_end: "050",
      status: "RECEIVED",
    });

    // WHEN: Creating bin with deplete_previous=true
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        data: {
          bin_name: "Bin 4",
          display_order: 3,
          pack_number: newPack.pack_number,
          serial_start: "001",
          activated_by: storeManagerUser.user_id,
          deplete_previous: true,
        },
      },
    );

    // THEN: New pack is ACTIVE and in the bin
    expect(response.status()).toBe(200);

    const updatedNewPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: newPack.pack_id },
    });

    expect(updatedNewPack?.status).toBe("ACTIVE");
    expect(updatedNewPack?.current_bin_id).not.toBeNull();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("ADP-005: [P0] Rejects occupied bin without deplete_previous flag", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An existing bin with an ACTIVE pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game ADP-005",
      price: 5.0,
    });

    const existingBin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
      name: "Bin 5",
      display_order: 4,
    });

    await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PREV005",
      serial_start: "001",
      serial_end: "050",
      status: "ACTIVE",
      activated_at: new Date(),
      current_bin_id: existingBin.bin_id,
    });

    const newPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "NEW005",
      serial_start: "001",
      serial_end: "050",
      status: "RECEIVED",
    });

    // WHEN: Creating bin WITHOUT deplete_previous flag
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        data: {
          bin_name: "Bin 5",
          display_order: 4,
          pack_number: newPack.pack_number,
          serial_start: "001",
          activated_by: storeManagerUser.user_id,
          // No deplete_previous flag
        },
      },
    );

    // THEN: Request is rejected with 409 Conflict
    expect(response.status()).toBe(409);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe("BIN_OCCUPIED");
  });

  test("ADP-006: [P0] Works normally for empty bin (no auto-deplete needed)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A pack to activate (no existing bin with pack)
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game ADP-006",
      price: 5.0,
    });

    const newPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "NEW006",
      serial_start: "001",
      serial_end: "050",
      status: "RECEIVED",
    });

    // WHEN: Creating new bin (not occupied)
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        data: {
          bin_name: "New Bin 6",
          display_order: 5,
          pack_number: newPack.pack_number,
          serial_start: "001",
          activated_by: storeManagerUser.user_id,
        },
      },
    );

    // THEN: Request succeeds
    expect(response.status()).toBe(200);
    const body = await response.json();

    // depleted_pack should not be present (no auto-deplete)
    expect(body.data.depleted_pack).toBeUndefined();

    // New pack is ACTIVE
    const updatedPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: newPack.pack_id },
    });
    expect(updatedPack?.status).toBe("ACTIVE");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INTEGRATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("ADP-007: [P1] Creates shift closing record for depleted pack", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An existing bin with an ACTIVE pack and an open shift
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game ADP-007",
      price: 5.0,
    });

    const existingBin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
      name: "Bin 7",
      display_order: 6,
    });

    // Create terminal for shift
    const terminal = await prismaClient.pOSTerminal.create({
      data: {
        store_id: storeManagerUser.store_id,
        name: "Terminal ADP007",
        terminal_status: "ACTIVE",
      },
    });

    // Create cashier for shift (required field)
    const cashierData = await createCashier({
      store_id: storeManagerUser.store_id,
      created_by: storeManagerUser.user_id,
    });
    const cashier = await prismaClient.cashier.create({ data: cashierData });

    // Create open shift
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

    const previousPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PREV007",
      serial_start: "001",
      serial_end: "050",
      status: "ACTIVE",
      activated_at: new Date(),
      current_bin_id: existingBin.bin_id,
      activated_shift_id: shift.shift_id,
    });

    const newPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "NEW007",
      serial_start: "001",
      serial_end: "050",
      status: "RECEIVED",
    });

    // WHEN: Creating bin with deplete_previous=true
    await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        data: {
          bin_name: "Bin 7",
          display_order: 6,
          pack_number: newPack.pack_number,
          serial_start: "001",
          activated_by: storeManagerUser.user_id,
          activated_shift_id: shift.shift_id,
          deplete_previous: true,
        },
      },
    );

    // THEN: Shift closing record is created for depleted pack
    const closingRecord = await prismaClient.lotteryShiftClosing.findFirst({
      where: {
        pack_id: previousPack.pack_id,
      },
    });

    expect(closingRecord).not.toBeNull();
    expect(closingRecord?.closing_serial).toBe(previousPack.serial_end);
  });

  test("ADP-008: [P1] Creates audit log for auto-depletion", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An existing bin with an ACTIVE pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game ADP-008",
      price: 5.0,
    });

    const existingBin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
      name: "Bin 8",
      display_order: 7,
    });

    const previousPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PREV008",
      serial_start: "001",
      serial_end: "050",
      status: "ACTIVE",
      activated_at: new Date(),
      current_bin_id: existingBin.bin_id,
    });

    const newPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "NEW008",
      serial_start: "001",
      serial_end: "050",
      status: "RECEIVED",
    });

    // WHEN: Creating bin with deplete_previous=true
    await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        data: {
          bin_name: "Bin 8",
          display_order: 7,
          pack_number: newPack.pack_number,
          serial_start: "001",
          activated_by: storeManagerUser.user_id,
          deplete_previous: true,
        },
      },
    );

    // THEN: Audit log entry is created
    const auditLog = await prismaClient.auditLog.findFirst({
      where: {
        record_id: previousPack.pack_id,
        action: "PACK_AUTO_DEPLETED",
      },
      orderBy: { timestamp: "desc" },
    });

    expect(auditLog).not.toBeNull();
    expect(auditLog?.table_name).toBe("lottery_packs");
  });

  test("ADP-009: [P1] Previous pack removed from bin after depletion", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An existing bin with an ACTIVE pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game ADP-009",
      price: 5.0,
    });

    const existingBin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
      name: "Bin 9",
      display_order: 8,
    });

    const previousPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PREV009",
      serial_start: "001",
      serial_end: "050",
      status: "ACTIVE",
      activated_at: new Date(),
      current_bin_id: existingBin.bin_id,
    });

    const newPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "NEW009",
      serial_start: "001",
      serial_end: "050",
      status: "RECEIVED",
    });

    // WHEN: Creating bin with deplete_previous=true
    await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        data: {
          bin_name: "Bin 9",
          display_order: 8,
          pack_number: newPack.pack_number,
          serial_start: "001",
          activated_by: storeManagerUser.user_id,
          deplete_previous: true,
        },
      },
    );

    // THEN: Previous pack is no longer in the bin
    const updatedPreviousPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: previousPack.pack_id },
    });

    expect(updatedPreviousPack?.current_bin_id).toBeNull();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("ADP-010: [P0] [SECURITY] Returns 401 for unauthenticated request", async ({
    request,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A pack to activate (but no auth)
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game ADP-010",
      price: 5.0,
    });

    const newPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "NEW010",
      serial_start: "001",
      serial_end: "050",
      status: "RECEIVED",
    });

    // WHEN: Making request without authentication
    const response = await request.post(
      `http://localhost:3001/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        data: {
          bin_name: "Bin 10",
          display_order: 0,
          pack_number: newPack.pack_number,
          serial_start: "001",
          activated_by: storeManagerUser.user_id,
        },
      },
    );

    // THEN: Returns 401
    expect(response.status()).toBe(401);
  });

  test("ADP-011: [P0] [SECURITY] RLS prevents cross-store access", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Create a separate company/store using factory functions
    const otherCompanyData = createCompany({
      name: "Test Other Company ADP-011",
      owner_user_id: storeManagerUser.user_id,
    });
    const otherCompany = await prismaClient.company.create({
      data: otherCompanyData,
    });

    const otherStoreData = createStore({
      company_id: otherCompany.company_id,
      name: "Test Other Store ADP-011",
    });
    const otherStore = await prismaClient.store.create({
      data: {
        ...otherStoreData,
        location_json: otherStoreData.location_json as any,
      },
    });

    const game = await createLotteryGame(prismaClient, {
      name: "Test Game ADP-011",
      price: 5.0,
    });

    const otherPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: otherStore.store_id,
      pack_number: "OTHER011",
      serial_start: "001",
      serial_end: "050",
      status: "RECEIVED",
    });

    // WHEN: Attempting to access other store's endpoint
    const response = await storeManagerApiRequest.post(
      `/api/stores/${otherStore.store_id}/lottery/bins/create-with-pack`,
      {
        data: {
          bin_name: "Bin Other",
          display_order: 0,
          pack_number: otherPack.pack_number,
          serial_start: "001",
          activated_by: "some-user-id",
        },
      },
    );

    // THEN: Returns 403 (access denied to other store)
    expect(response.status()).toBe(403);
  });

  test("ADP-012: [P1] Atomic transaction - failure rolls back all changes", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An existing bin with an ACTIVE pack, but new pack is invalid
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game ADP-012",
      price: 5.0,
    });

    const existingBin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
      name: "Bin 12",
      display_order: 11,
    });

    const previousPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PREV012",
      serial_start: "001",
      serial_end: "050",
      status: "ACTIVE",
      activated_at: new Date(),
      current_bin_id: existingBin.bin_id,
    });

    // WHEN: Attempting to activate non-existent pack
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        data: {
          bin_name: "Bin 12",
          display_order: 11,
          pack_number: "NONEXISTENT", // Pack doesn't exist
          serial_start: "001",
          activated_by: storeManagerUser.user_id,
          deplete_previous: true,
        },
      },
    );

    // THEN: Request fails
    expect(response.status()).not.toBe(200);

    // AND: Previous pack is still ACTIVE (not depleted due to rollback)
    const unchangedPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: previousPack.pack_id },
    });

    expect(unchangedPack?.status).toBe("ACTIVE");
    expect(unchangedPack?.current_bin_id).toBe(existingBin.bin_id);
  });

  test("ADP-013: [P1] Validates pack can be activated (rejects already ACTIVE pack)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A pack that's already ACTIVE
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game ADP-013",
      price: 5.0,
    });

    const alreadyActivePack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "ALREADY013",
      serial_start: "001",
      serial_end: "050",
      status: "ACTIVE", // Already active
      activated_at: new Date(),
    });

    // WHEN: Attempting to activate an already active pack
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        data: {
          bin_name: "Bin 13",
          display_order: 12,
          pack_number: alreadyActivePack.pack_number,
          serial_start: "001",
          activated_by: storeManagerUser.user_id,
        },
      },
    );

    // THEN: Request fails
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });
});
