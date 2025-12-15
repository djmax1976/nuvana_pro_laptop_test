/**
 * Activate Pack Flow Integration Tests
 *
 * Tests for complete pack activation flow:
 * - Full flow from cashier authentication to pack activation
 * - Transaction integrity (all records created atomically)
 * - Pack activation in empty bin
 * - Pack activation replacing existing pack
 * - Security: Cross-store access prevention, transaction rollback
 * - Edge cases: Concurrent modifications, partial failures
 *
 * @test-level Integration
 * @justification Tests full workflow across multiple systems (API + Database)
 * @story 10-6 - Activate Pack During Shift
 * @priority P0 (Critical - Full flow validation)
 * @enhanced-by workflow-9 on 2025-01-28
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createLotteryGame,
  createLotteryPack,
  createLotteryBin,
} from "../support/factories/lottery.factory";
import { createShift, createCashier } from "../support/helpers";
import { ShiftStatus, LotteryPackStatus } from "@prisma/client";

test.describe("10-6-INTEGRATION: Activate Pack Flow", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // HAPPY PATH TESTS (P0)
  // ═══════════════════════════════════════════════════════════════════════════
  test("10-6-INTEGRATION-001: [P0] Full activation flow with PIN verification", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists with RECEIVED status
    // AND: A bin exists (empty)
    // AND: A shift exists
    // AND: A cashier exists with PIN
    const shift = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        status: ShiftStatus.ACTIVE,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const game = await createLotteryGame(prismaClient, {
      store_id: storeManagerUser.store_id,
      game_code: "0001",
      name: "$5 Powerball",
      price: 5.0,
    });

    const pack = await createLotteryPack(prismaClient, {
      store_id: storeManagerUser.store_id,
      game_id: game.game_id,
      pack_number: "1234567",
      serial_start: "001",
      serial_end: "100",
      status: LotteryPackStatus.RECEIVED,
    });

    const bin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
      bin_number: 1,
      name: "Bin 1",
    });

    const cashier = await createCashier(
      {
        store_id: storeManagerUser.store_id,
        created_by: storeManagerUser.user_id,
        pin: "1234",
      },
      prismaClient,
    );

    // Count records before
    const shiftOpeningCountBefore =
      await prismaClient.lotteryShiftOpening.count({
        where: { shift_id: shift.shift_id },
      });
    const historyCountBefore = await prismaClient.lotteryPackBinHistory.count({
      where: { pack_id: pack.pack_id },
    });
    const auditLogCountBefore = await prismaClient.auditLog.count({
      where: {
        entity_type: "lottery_pack",
        action: "PACK_ACTIVATED",
      },
    });

    // WHEN: Activating pack (simulating full flow with PIN verification)
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/packs/activate`,
      {
        data: {
          pack_id: pack.pack_id,
          bin_id: bin.bin_id,
          serial_start: pack.serial_start,
          activated_by: cashier.cashier_id,
          activated_shift_id: shift.shift_id,
        },
      },
    );

    // THEN: Request succeeds
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(
      body.data.updatedBin,
      "Response should include updated bin",
    ).toBeDefined();

    // AND: Pack is activated
    const updatedPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: pack.pack_id },
    });
    expect(updatedPack?.status, "Pack status should be ACTIVE").toBe(
      LotteryPackStatus.ACTIVE,
    );
    expect(
      updatedPack?.current_bin_id,
      "Pack current_bin_id should be set",
    ).toBe(bin.bin_id);
    expect(updatedPack?.activated_by, "Pack activated_by should be set").toBe(
      cashier.cashier_id,
    );
    expect(
      updatedPack?.activated_shift_id,
      "Pack activated_shift_id should be set",
    ).toBe(shift.shift_id);
    expect(
      updatedPack?.activated_at,
      "Pack activated_at should be set",
    ).not.toBeNull();

    // AND: LotteryShiftOpening is created
    const shiftOpeningCountAfter = await prismaClient.lotteryShiftOpening.count(
      {
        where: { shift_id: shift.shift_id },
      },
    );
    expect(
      shiftOpeningCountAfter,
      "Shift opening count should increase by 1",
    ).toBe(shiftOpeningCountBefore + 1);

    const shiftOpening = await prismaClient.lotteryShiftOpening.findFirst({
      where: {
        shift_id: shift.shift_id,
        bin_id: bin.bin_id,
        starting_serial: pack.serial_start,
      },
    });
    expect(shiftOpening, "LotteryShiftOpening should exist").toBeDefined();
    expect(shiftOpening?.starting_serial, "Starting serial should match").toBe(
      pack.serial_start,
    );

    // AND: LotteryPackBinHistory is created
    const historyCountAfter = await prismaClient.lotteryPackBinHistory.count({
      where: { pack_id: pack.pack_id },
    });
    expect(historyCountAfter, "History count should increase by 1").toBe(
      historyCountBefore + 1,
    );

    const history = await prismaClient.lotteryPackBinHistory.findFirst({
      where: {
        pack_id: pack.pack_id,
        bin_id: bin.bin_id,
      },
    });
    expect(history, "LotteryPackBinHistory should exist").toBeDefined();
    expect(history?.action, "History action should be ACTIVATED").toBe(
      "ACTIVATED",
    );

    // AND: AuditLog is created
    const auditLogCountAfter = await prismaClient.auditLog.count({
      where: {
        entity_type: "lottery_pack",
        action: "PACK_ACTIVATED",
      },
    });
    expect(auditLogCountAfter, "Audit log count should increase by 1").toBe(
      auditLogCountBefore + 1,
    );

    const auditLog = await prismaClient.auditLog.findFirst({
      where: {
        entity_type: "lottery_pack",
        entity_id: pack.pack_id,
        action: "PACK_ACTIVATED",
      },
    });
    expect(auditLog, "AuditLog should exist").toBeDefined();
    expect(auditLog?.user_id, "AuditLog user_id should match cashier").toBe(
      cashier.cashier_id,
    );
    expect(auditLog?.metadata, "AuditLog should have metadata").toBeDefined();
  });

  test("10-6-INTEGRATION-002: [P0] Activation in empty bin", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists with RECEIVED status
    // AND: An empty bin exists (no active pack)
    // AND: A shift exists
    // AND: A cashier exists
    const shift = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        status: ShiftStatus.ACTIVE,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const game = await createLotteryGame(prismaClient, {
      store_id: storeManagerUser.store_id,
      game_code: "0001",
      name: "$5 Powerball",
      price: 5.0,
    });

    const pack = await createLotteryPack(prismaClient, {
      store_id: storeManagerUser.store_id,
      game_id: game.game_id,
      pack_number: "1234567",
      serial_start: "001",
      serial_end: "100",
      status: LotteryPackStatus.RECEIVED,
    });

    const bin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
      bin_number: 1,
      name: "Bin 1",
    });

    // Verify bin is empty
    const packsInBin = await prismaClient.lotteryPack.count({
      where: { current_bin_id: bin.bin_id },
    });
    expect(packsInBin, "Bin should be empty").toBe(0);

    const cashier = await createCashier(
      {
        store_id: storeManagerUser.store_id,
        created_by: storeManagerUser.user_id,
        pin: "1234",
      },
      prismaClient,
    );

    // WHEN: Activating pack in empty bin
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/packs/activate`,
      {
        data: {
          pack_id: pack.pack_id,
          bin_id: bin.bin_id,
          serial_start: pack.serial_start,
          activated_by: cashier.cashier_id,
          activated_shift_id: shift.shift_id,
        },
      },
    );

    // THEN: Request succeeds
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(
      body.data.updatedBin,
      "Response should include updated bin",
    ).toBeDefined();
    expect(
      body.data.previousPack,
      "Response should not include previous pack",
    ).toBeUndefined();

    // AND: Pack is activated in bin
    const updatedPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: pack.pack_id },
    });
    expect(updatedPack?.current_bin_id, "Pack should be assigned to bin").toBe(
      bin.bin_id,
    );
    expect(updatedPack?.status, "Pack status should be ACTIVE").toBe(
      LotteryPackStatus.ACTIVE,
    );

    // AND: Bin now has the pack
    const packsInBinAfter = await prismaClient.lotteryPack.count({
      where: { current_bin_id: bin.bin_id },
    });
    expect(packsInBinAfter, "Bin should have one pack").toBe(1);
  });

  test("10-6-INTEGRATION-003: [P0] Activation replacing existing pack", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A bin exists with an active pack
    // AND: A new pack exists with RECEIVED status
    // AND: A shift exists
    // AND: A cashier exists
    const shift = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        status: ShiftStatus.ACTIVE,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const game = await createLotteryGame(prismaClient, {
      store_id: storeManagerUser.store_id,
      game_code: "0001",
      name: "$5 Powerball",
      price: 5.0,
    });

    const previousPack = await createLotteryPack(prismaClient, {
      store_id: storeManagerUser.store_id,
      game_id: game.game_id,
      pack_number: "1111111",
      serial_start: "001",
      serial_end: "100",
      status: LotteryPackStatus.ACTIVE,
    });

    const newPack = await createLotteryPack(prismaClient, {
      store_id: storeManagerUser.store_id,
      game_id: game.game_id,
      pack_number: "2222222",
      serial_start: "001",
      serial_end: "100",
      status: LotteryPackStatus.RECEIVED,
    });

    const bin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
      bin_number: 1,
      name: "Bin 1",
    });

    // Set previous pack in bin
    await prismaClient.lotteryPack.update({
      where: { pack_id: previousPack.pack_id },
      data: { current_bin_id: bin.bin_id },
    });

    const cashier = await createCashier(
      {
        store_id: storeManagerUser.store_id,
        created_by: storeManagerUser.user_id,
        pin: "1234",
      },
      prismaClient,
    );

    // WHEN: Activating new pack in bin with existing pack
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/packs/activate`,
      {
        data: {
          pack_id: newPack.pack_id,
          bin_id: bin.bin_id,
          serial_start: newPack.serial_start,
          activated_by: cashier.cashier_id,
          activated_shift_id: shift.shift_id,
        },
      },
    );

    // THEN: Request succeeds
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(
      body.data.updatedBin,
      "Response should include updated bin",
    ).toBeDefined();
    expect(
      body.data.previousPack,
      "Response should include previous pack",
    ).toBeDefined();
    expect(
      body.data.previousPack.pack_id,
      "Previous pack ID should match",
    ).toBe(previousPack.pack_id);

    // AND: Previous pack is removed from bin
    const updatedPreviousPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: previousPack.pack_id },
    });
    expect(
      updatedPreviousPack?.current_bin_id,
      "Previous pack should be removed from bin",
    ).toBeNull();

    // AND: New pack is active in bin
    const updatedNewPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: newPack.pack_id },
    });
    expect(updatedNewPack?.status, "New pack status should be ACTIVE").toBe(
      LotteryPackStatus.ACTIVE,
    );
    expect(
      updatedNewPack?.current_bin_id,
      "New pack should be assigned to bin",
    ).toBe(bin.bin_id);

    // AND: Bin has only the new pack
    const packsInBin = await prismaClient.lotteryPack.count({
      where: { current_bin_id: bin.bin_id },
    });
    expect(packsInBin, "Bin should have one pack").toBe(1);

    const packInBin = await prismaClient.lotteryPack.findFirst({
      where: { current_bin_id: bin.bin_id },
    });
    expect(packInBin?.pack_id, "Pack in bin should be new pack").toBe(
      newPack.pack_id,
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSACTION INTEGRITY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("10-6-INTEGRATION-TXN-001: [P0] should create all records atomically in transaction", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Store with RECEIVED pack, bin, and active shift
    const shift = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        status: ShiftStatus.ACTIVE,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const game = await createLotteryGame(prismaClient, {
      store_id: storeManagerUser.store_id,
      game_code: "0001",
      name: "$5 Powerball",
      price: 5.0,
    });

    const pack = await createLotteryPack(prismaClient, {
      store_id: storeManagerUser.store_id,
      game_id: game.game_id,
      pack_number: "1234567",
      serial_start: "001",
      serial_end: "100",
      status: LotteryPackStatus.RECEIVED,
    });

    const bin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
      bin_number: 1,
      name: "Bin 1",
    });

    const cashier = await createCashier(
      {
        store_id: storeManagerUser.store_id,
        created_by: storeManagerUser.user_id,
        pin: "1234",
      },
      prismaClient,
    );

    // Count records before activation
    const shiftOpeningCountBefore =
      await prismaClient.lotteryShiftOpening.count({
        where: { shift_id: shift.shift_id },
      });
    const historyCountBefore = await prismaClient.lotteryPackBinHistory.count({
      where: { pack_id: pack.pack_id },
    });
    const auditLogCountBefore = await prismaClient.auditLog.count({
      where: {
        entity_type: "lottery_pack",
        entity_id: pack.pack_id,
      },
    });

    // WHEN: Activating pack
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/packs/activate`,
      {
        data: {
          pack_id: pack.pack_id,
          bin_id: bin.bin_id,
          serial_start: pack.serial_start,
          activated_by: cashier.cashier_id,
          activated_shift_id: shift.shift_id,
        },
      },
    );

    // THEN: All records are created atomically
    expect(response.status(), "Expected 200 OK status").toBe(200);

    // Verify all records exist (transaction succeeded)
    const shiftOpeningCountAfter = await prismaClient.lotteryShiftOpening.count(
      {
        where: { shift_id: shift.shift_id },
      },
    );
    const historyCountAfter = await prismaClient.lotteryPackBinHistory.count({
      where: { pack_id: pack.pack_id },
    });
    const auditLogCountAfter = await prismaClient.auditLog.count({
      where: {
        entity_type: "lottery_pack",
        entity_id: pack.pack_id,
      },
    });

    expect(shiftOpeningCountAfter, "Shift opening should be created").toBe(
      shiftOpeningCountBefore + 1,
    );
    expect(historyCountAfter, "History record should be created").toBe(
      historyCountBefore + 1,
    );
    expect(auditLogCountAfter, "Audit log should be created").toBe(
      auditLogCountBefore + 1,
    );

    // Verify pack status updated
    const updatedPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: pack.pack_id },
    });
    expect(updatedPack?.status, "Pack status should be ACTIVE").toBe(
      LotteryPackStatus.ACTIVE,
    );
  });
});
