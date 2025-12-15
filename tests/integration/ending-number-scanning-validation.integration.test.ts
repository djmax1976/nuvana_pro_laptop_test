/**
 * Integration Tests: Ending Number Scanning & Validation
 *
 * Tests full scan flow with database validation:
 * - Full scan flow validates against database pack data
 * - Rapid sequential scans process correctly
 *
 * @test-level INTEGRATION
 * @justification Tests validation service with real database data and full scan flow
 * @story 10-3 - Ending Number Scanning & Validation
 * @priority P0 (Critical - Core Feature)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  validateEndingSerial,
  BinValidationData,
} from "@/lib/services/lottery-closing-validation";
import {
  createLotteryGame,
  createLotteryPack,
  createLotteryBin,
} from "../support/factories/lottery.factory";
import { createCompany, createStore, createUser } from "../support/helpers";
import { ShiftStatus } from "@prisma/client";

const prisma = new PrismaClient();

// Test data - isolated per test suite
let testUser: any;
let testCashier: any;
let testCompany: any;
let testStore: any;
let testGame: any;
let testPack: any;
let testBin: any;
let testShift: any;
let testShiftOpening: any;

// ═══════════════════════════════════════════════════════════════════════════
// TEST SETUP & TEARDOWN
// ═══════════════════════════════════════════════════════════════════════════

beforeAll(async () => {
  // GIVEN: Test infrastructure exists (company, store, game, pack, bin, cashier, shift)
  testUser = await createUser(prisma, {
    email: `test-scanning-${Date.now()}@test.com`,
    name: "Test User",
  });

  testCompany = await createCompany(prisma, {
    name: "Test Scanning Company",
    owner_user_id: testUser.user_id,
  });

  testStore = await createStore(prisma, {
    company_id: testCompany.company_id,
    name: "Test Scanning Store",
  });

  testCashier = await createUser(prisma, {
    email: `test-cashier-scanning-${Date.now()}@test.com`,
    name: "Test Cashier",
  });

  testGame = await createLotteryGame(prisma, {
    name: "Test Game",
    price: 5.0,
    game_code: "0001",
  });

  testBin = await createLotteryBin(prisma, {
    store_id: testStore.store_id,
    name: "Bin 1",
    display_order: 1,
  });

  // Create active shift for cashier
  testShift = await prisma.shift.create({
    data: {
      store_id: testStore.store_id,
      opened_by: testCashier.user_id,
      opened_at: new Date(),
      status: ShiftStatus.OPEN,
      opening_cash: 100.0,
    },
  });
});

afterAll(async () => {
  // Cleanup test data
  if (testShiftOpening) {
    await prisma.lotteryShiftOpening.deleteMany({
      where: { shift_id: testShift.shift_id },
    });
  }
  if (testPack) {
    await prisma.lotteryPack.deleteMany({
      where: { pack_id: testPack.pack_id },
    });
  }
  if (testShift) {
    await prisma.shift.deleteMany({
      where: { shift_id: testShift.shift_id },
    });
  }
  if (testBin) {
    await prisma.lotteryBin.deleteMany({
      where: { bin_id: testBin.bin_id },
    });
  }
  if (testGame) {
    await prisma.lotteryGame.deleteMany({
      where: { game_id: testGame.game_id },
    });
  }
  if (testStore) {
    await prisma.store.deleteMany({
      where: { store_id: testStore.store_id },
    });
  }
  if (testCompany) {
    await prisma.company.deleteMany({
      where: { company_id: testCompany.company_id },
    });
  }
  if (testCashier) {
    await prisma.user.deleteMany({
      where: { user_id: testCashier.user_id },
    });
  }
  if (testUser) {
    await prisma.user.deleteMany({
      where: { user_id: testUser.user_id },
    });
  }
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Clean up pack and shift opening before each test
  if (testShiftOpening) {
    await prisma.lotteryShiftOpening.deleteMany({
      where: { shift_id: testShift.shift_id },
    });
    testShiftOpening = null;
  }
  if (testPack) {
    await prisma.lotteryPack.deleteMany({
      where: { pack_id: testPack.pack_id },
    });
    testPack = null;
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("10-3-INTEGRATION: Ending Number Scanning & Validation", () => {
  it("TEST-10.3-I1: Full scan flow validates against database pack data", async () => {
    // GIVEN: Pack exists in database with known pack_number, serial_start, serial_end
    testPack = await createLotteryPack(prisma, {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
      current_bin_id: testBin.bin_id,
      status: "ACTIVE",
      pack_number: "1234567",
      serial_start: "001",
      serial_end: "150",
    });

    // AND: Shift opening exists with starting_serial
    testShiftOpening = await prisma.lotteryShiftOpening.create({
      data: {
        shift_id: testShift.shift_id,
        pack_id: testPack.pack_id,
        opening_serial: "045",
      },
    });

    // AND: Bin validation data from database
    const binData: BinValidationData = {
      pack_number: testPack.pack_number,
      starting_serial: testShiftOpening.opening_serial,
      serial_end: testPack.serial_end,
    };

    // WHEN: Scanning a valid 24-digit barcode that matches pack data
    // Serial format: game_code (4) + pack_number (7) + ticket_number (3) + identifier (10)
    // Example: "000112345670673456789012" = game: 0001, pack: 1234567, ticket: 067
    const validScan = "000112345670673456789012"; // Ticket 067, within range [045, 150]

    const result = await validateEndingSerial(validScan, binData);

    // THEN: Validation passes
    expect(result.valid).toBe(true);
    expect(result.endingNumber).toBe("067");
    expect(result.error).toBeUndefined();

    // AND: Ending number is within valid range (starting_serial <= ending <= serial_end)
    const endingNum = parseInt(result.endingNumber!, 10);
    const startingNum = parseInt(binData.starting_serial, 10);
    const maxNum = parseInt(binData.serial_end, 10);
    expect(endingNum).toBeGreaterThanOrEqual(startingNum);
    expect(endingNum).toBeLessThanOrEqual(maxNum);
  });

  it("TEST-10.3-I2: Rapid sequential scans process correctly", async () => {
    // GIVEN: Pack exists in database
    testPack = await createLotteryPack(prisma, {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
      current_bin_id: testBin.bin_id,
      status: "ACTIVE",
      pack_number: "1234567",
      serial_start: "001",
      serial_end: "150",
    });

    // AND: Shift opening exists
    testShiftOpening = await prisma.lotteryShiftOpening.create({
      data: {
        shift_id: testShift.shift_id,
        pack_id: testPack.pack_id,
        opening_serial: "045",
      },
    });

    // AND: Bin validation data from database
    const binData: BinValidationData = {
      pack_number: testPack.pack_number,
      starting_serial: testShiftOpening.opening_serial,
      serial_end: testPack.serial_end,
    };

    // WHEN: Performing rapid sequential scans (< 100ms between scans)
    const scans = [
      "000112345670673456789012", // Ticket 067
      "000112345670683456789013", // Ticket 068
      "000112345670693456789014", // Ticket 069
    ];

    const results = await Promise.all(
      scans.map((scan) => validateEndingSerial(scan, binData)),
    );

    // THEN: All scans are processed correctly
    expect(results.length).toBe(3);

    // AND: All validations pass
    results.forEach((result, index) => {
      expect(result.valid).toBe(true);
      expect(result.endingNumber).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    // AND: Ending numbers are sequential (067, 068, 069)
    expect(results[0].endingNumber).toBe("067");
    expect(results[1].endingNumber).toBe("068");
    expect(results[2].endingNumber).toBe("069");

    // AND: All ending numbers are within valid range
    results.forEach((result) => {
      const endingNum = parseInt(result.endingNumber!, 10);
      const startingNum = parseInt(binData.starting_serial, 10);
      const maxNum = parseInt(binData.serial_end, 10);
      expect(endingNum).toBeGreaterThanOrEqual(startingNum);
      expect(endingNum).toBeLessThanOrEqual(maxNum);
    });

    // AND: Processing completes without errors (rapid scanning requirement)
    // Promise.all ensures all validations complete successfully
    expect(results.every((r) => r.valid)).toBe(true);
  });

  it("TEST-10.3-I3: Validation fails when pack number doesn't match database", async () => {
    // GIVEN: Pack exists in database with pack_number "1234567"
    testPack = await createLotteryPack(prisma, {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
      current_bin_id: testBin.bin_id,
      status: "ACTIVE",
      pack_number: "1234567",
      serial_start: "001",
      serial_end: "150",
    });

    // AND: Shift opening exists
    testShiftOpening = await prisma.lotteryShiftOpening.create({
      data: {
        shift_id: testShift.shift_id,
        pack_id: testPack.pack_id,
        opening_serial: "045",
      },
    });

    // AND: Bin validation data from database
    const binData: BinValidationData = {
      pack_number: testPack.pack_number, // "1234567"
      starting_serial: testShiftOpening.opening_serial,
      serial_end: testPack.serial_end,
    };

    // WHEN: Scanning barcode from different pack (pack_number "9999999")
    const wrongPackScan = "000199999990673456789012"; // Different pack number

    const result = await validateEndingSerial(wrongPackScan, binData);

    // THEN: Validation fails with pack mismatch error
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Wrong pack");
    expect(result.endingNumber).toBeUndefined();
  });

  it("TEST-10.3-I4: Validation fails when ending < starting from database", async () => {
    // GIVEN: Pack exists in database
    testPack = await createLotteryPack(prisma, {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
      current_bin_id: testBin.bin_id,
      status: "ACTIVE",
      pack_number: "1234567",
      serial_start: "001",
      serial_end: "150",
    });

    // AND: Shift opening with starting_serial "045"
    testShiftOpening = await prisma.lotteryShiftOpening.create({
      data: {
        shift_id: testShift.shift_id,
        pack_id: testPack.pack_id,
        opening_serial: "045",
      },
    });

    // AND: Bin validation data from database
    const binData: BinValidationData = {
      pack_number: testPack.pack_number,
      starting_serial: testShiftOpening.opening_serial, // "045"
      serial_end: testPack.serial_end,
    };

    // WHEN: Scanning barcode with ending "030" (less than starting "045")
    const belowStartingScan = "000112345670303456789012"; // Ticket 030 < 045

    const result = await validateEndingSerial(belowStartingScan, binData);

    // THEN: Validation fails with minimum check error
    expect(result.valid).toBe(false);
    expect(result.error).toContain("cannot be less than starting");
    expect(result.endingNumber).toBeUndefined();
  });

  it("TEST-10.3-I5: Validation fails when ending > serial_end from database", async () => {
    // GIVEN: Pack exists in database with serial_end "150"
    testPack = await createLotteryPack(prisma, {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
      current_bin_id: testBin.bin_id,
      status: "ACTIVE",
      pack_number: "1234567",
      serial_start: "001",
      serial_end: "150",
    });

    // AND: Shift opening exists
    testShiftOpening = await prisma.lotteryShiftOpening.create({
      data: {
        shift_id: testShift.shift_id,
        pack_id: testPack.pack_id,
        opening_serial: "045",
      },
    });

    // AND: Bin validation data from database
    const binData: BinValidationData = {
      pack_number: testPack.pack_number,
      starting_serial: testShiftOpening.opening_serial,
      serial_end: testPack.serial_end, // "150"
    };

    // WHEN: Scanning barcode with ending "151" (greater than serial_end "150")
    const aboveMaxScan = "000112345671513456789012"; // Ticket 151 > 150

    const result = await validateEndingSerial(aboveMaxScan, binData);

    // THEN: Validation fails with maximum check error
    expect(result.valid).toBe(false);
    expect(result.error).toContain("exceeds pack maximum");
    expect(result.endingNumber).toBeUndefined();
  });

  it("TEST-10.3-I6: [P0] Business logic - Closing serial greater than serial_end is an error", async () => {
    // GIVEN: Pack exists in database with serial_end "150"
    testPack = await createLotteryPack(prisma, {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
      current_bin_id: testBin.bin_id,
      status: "ACTIVE",
      pack_number: "1234567",
      serial_start: "001",
      serial_end: "150", // Pack maximum
    });

    // AND: Shift opening exists
    testShiftOpening = await prisma.lotteryShiftOpening.create({
      data: {
        shift_id: testShift.shift_id,
        pack_id: testPack.pack_id,
        opening_serial: "045",
      },
    });

    // AND: Bin validation data from database
    const binData: BinValidationData = {
      pack_number: testPack.pack_number,
      starting_serial: testShiftOpening.opening_serial,
      serial_end: testPack.serial_end, // "150"
    };

    // WHEN: Scanning barcode with ending "151" (greater than serial_end "150")
    // Business rule: closing_serial > serial_end is an error
    const aboveMaxScan = "000112345671513456789012"; // Ticket 151 > 150 (ERROR)

    const result = await validateEndingSerial(aboveMaxScan, binData);

    // THEN: Validation fails (business rule violation)
    expect(result.valid).toBe(false);
    expect(result.error).toContain("exceeds pack maximum");
    expect(result.error).toContain("150"); // serial_end value in error message
    expect(result.endingNumber).toBeUndefined();

    // AND: Verify business rule: ending > serial_end is error condition
    const endingNum = parseInt("151", 10);
    const maxNum = parseInt(binData.serial_end, 10);
    expect(
      endingNum > maxNum,
      "ending > serial_end should be true (error condition)",
    ).toBe(true);
  });

  it("TEST-10.3-I7: [P1] Enhanced assertions - Ending number format validation (3 digits)", async () => {
    // GIVEN: Pack exists in database
    testPack = await createLotteryPack(prisma, {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
      current_bin_id: testBin.bin_id,
      status: "ACTIVE",
      pack_number: "1234567",
      serial_start: "001",
      serial_end: "150",
    });

    testShiftOpening = await prisma.lotteryShiftOpening.create({
      data: {
        shift_id: testShift.shift_id,
        pack_id: testPack.pack_id,
        opening_serial: "045",
      },
    });

    const binData: BinValidationData = {
      pack_number: testPack.pack_number,
      starting_serial: testShiftOpening.opening_serial,
      serial_end: testPack.serial_end,
    };

    // WHEN: Scanning valid barcode
    const validScan = "000112345670673456789012"; // Ticket 067
    const result = await validateEndingSerial(validScan, binData);

    // THEN: Ending number should be exactly 3 digits
    expect(result.valid).toBe(true);
    expect(result.endingNumber, "endingNumber should be defined").toBeDefined();
    expect(typeof result.endingNumber, "endingNumber should be a string").toBe(
      "string",
    );
    expect(
      result.endingNumber?.length,
      "endingNumber should be exactly 3 digits",
    ).toBe(3);
    expect(
      /^\d{3}$/.test(result.endingNumber!),
      "endingNumber should match 3-digit pattern",
    ).toBe(true);
  });

  it("TEST-10.3-I8: [P1] Enhanced assertions - Validation result structure", async () => {
    // GIVEN: Pack exists in database
    testPack = await createLotteryPack(prisma, {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
      current_bin_id: testBin.bin_id,
      status: "ACTIVE",
      pack_number: "1234567",
      serial_start: "001",
      serial_end: "150",
    });

    testShiftOpening = await prisma.lotteryShiftOpening.create({
      data: {
        shift_id: testShift.shift_id,
        pack_id: testPack.pack_id,
        opening_serial: "045",
      },
    });

    const binData: BinValidationData = {
      pack_number: testPack.pack_number,
      starting_serial: testShiftOpening.opening_serial,
      serial_end: testPack.serial_end,
    };

    // WHEN: Validating scan
    const validScan = "000112345670673456789012";
    const result = await validateEndingSerial(validScan, binData);

    // THEN: Result has correct structure
    expect(result, "Result should be an object").toBeInstanceOf(Object);
    expect(typeof result.valid, "valid should be a boolean").toBe("boolean");
    expect(result.valid, "valid should be true for valid scan").toBe(true);
    expect(
      result.error,
      "error should be undefined when valid",
    ).toBeUndefined();
    expect(
      result.endingNumber,
      "endingNumber should be defined when valid",
    ).toBeDefined();
  });

  it("TEST-10.3-I9: [P1] Enhanced assertions - Error result structure", async () => {
    // GIVEN: Pack exists in database
    testPack = await createLotteryPack(prisma, {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
      current_bin_id: testBin.bin_id,
      status: "ACTIVE",
      pack_number: "1234567",
      serial_start: "001",
      serial_end: "150",
    });

    testShiftOpening = await prisma.lotteryShiftOpening.create({
      data: {
        shift_id: testShift.shift_id,
        pack_id: testPack.pack_id,
        opening_serial: "045",
      },
    });

    const binData: BinValidationData = {
      pack_number: testPack.pack_number,
      starting_serial: testShiftOpening.opening_serial,
      serial_end: testPack.serial_end,
    };

    // WHEN: Validating invalid scan (wrong pack)
    const invalidScan = "000199999990673456789012"; // Wrong pack
    const result = await validateEndingSerial(invalidScan, binData);

    // THEN: Error result has correct structure
    expect(result, "Result should be an object").toBeInstanceOf(Object);
    expect(typeof result.valid, "valid should be a boolean").toBe("boolean");
    expect(result.valid, "valid should be false for invalid scan").toBe(false);
    expect(result.error, "error should be defined when invalid").toBeDefined();
    expect(typeof result.error, "error should be a string").toBe("string");
    expect(
      result.error?.length,
      "error message should not be empty",
    ).toBeGreaterThan(0);
    expect(
      result.endingNumber,
      "endingNumber should be undefined when invalid",
    ).toBeUndefined();
  });

  it("TEST-10.3-I10: [P1] Edge case - Ending equals starting serial (boundary case)", async () => {
    // GIVEN: Pack exists with starting_serial "045"
    testPack = await createLotteryPack(prisma, {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
      current_bin_id: testBin.bin_id,
      status: "ACTIVE",
      pack_number: "1234567",
      serial_start: "001",
      serial_end: "150",
    });

    testShiftOpening = await prisma.lotteryShiftOpening.create({
      data: {
        shift_id: testShift.shift_id,
        pack_id: testPack.pack_id,
        opening_serial: "045", // Starting serial
      },
    });

    const binData: BinValidationData = {
      pack_number: testPack.pack_number,
      starting_serial: testShiftOpening.opening_serial, // "045"
      serial_end: testPack.serial_end,
    };

    // WHEN: Scanning barcode with ending "045" (equals starting)
    const boundaryScan = "000112345670453456789012"; // Ticket 045 == starting

    const result = await validateEndingSerial(boundaryScan, binData);

    // THEN: Validation passes (ending == starting is valid)
    expect(result.valid).toBe(true);
    expect(result.endingNumber).toBe("045");
    expect(result.error).toBeUndefined();
  });

  it("TEST-10.3-I11: [P1] Edge case - Ending equals serial_end (boundary case)", async () => {
    // GIVEN: Pack exists with serial_end "150"
    testPack = await createLotteryPack(prisma, {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
      current_bin_id: testBin.bin_id,
      status: "ACTIVE",
      pack_number: "1234567",
      serial_start: "001",
      serial_end: "150", // Pack maximum
    });

    testShiftOpening = await prisma.lotteryShiftOpening.create({
      data: {
        shift_id: testShift.shift_id,
        pack_id: testPack.pack_id,
        opening_serial: "045",
      },
    });

    const binData: BinValidationData = {
      pack_number: testPack.pack_number,
      starting_serial: testShiftOpening.opening_serial,
      serial_end: testPack.serial_end, // "150"
    };

    // WHEN: Scanning barcode with ending "150" (equals serial_end)
    const boundaryScan = "000112345671503456789012"; // Ticket 150 == serial_end

    const result = await validateEndingSerial(boundaryScan, binData);

    // THEN: Validation passes (ending == serial_end is valid, only > is error)
    expect(result.valid).toBe(true);
    expect(result.endingNumber).toBe("150");
    expect(result.error).toBeUndefined();
  });
});
