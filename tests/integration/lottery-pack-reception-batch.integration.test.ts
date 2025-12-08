/**
 * @test-level INTEGRATION
 * @justification Tests database transaction behavior and data consistency - requires database connection
 * @story 6.12
 * @enhanced-by workflow-9 on 2025-01-28
 *
 * Integration Tests: Lottery Pack Reception Batch
 *
 * Tests batch pack reception with database:
 * - Atomic transaction behavior (all-or-nothing for valid packs)
 * - Duplicate detection (within batch and database)
 * - Partial failure handling (some succeed, some fail)
 * - Database consistency after batch operations
 * - Transaction rollback on errors
 * - Database constraint enforcement
 *
 * Story: 6.12 - Serialized Pack Reception with Batch Processing
 * Priority: P0 (Critical - Database Operations, Transaction Integrity)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  createLotteryGame,
  createLotteryPack,
} from "../support/factories/lottery.factory";
import { createCompany, createStore, createUser } from "../support/helpers";

const prisma = new PrismaClient();

// Test data
let testUser: any;
let testCompany: any;
let testStore: any;
let testGame: any;

beforeAll(async () => {
  // Create test infrastructure
  testCompany = await createCompany(prisma);
  testUser = await createUser(prisma);
  testStore = await createStore(prisma, {
    company_id: testCompany.company_id,
  });
  testGame = await createLotteryGame(prisma, {
    name: "Test Game",
    price: 2.0,
    game_code: "0001",
  });
});

beforeEach(async () => {
  // Clean up packs before each test
  await prisma.lotteryPack.deleteMany({
    where: { store_id: testStore.store_id },
  });
});

afterAll(async () => {
  // Cleanup
  await prisma.lotteryPack.deleteMany({
    where: { store_id: testStore.store_id },
  });
  await prisma.lotteryGame.deleteMany({});
  if (testStore)
    await prisma.store.delete({ where: { store_id: testStore.store_id } });
  if (testCompany)
    await prisma.company.delete({
      where: { company_id: testCompany.company_id },
    });
  if (testUser)
    await prisma.user.delete({ where: { user_id: testUser.user_id } });
  await prisma.$disconnect();
});

describe("6.12-INTEGRATION: Batch Pack Reception - Atomic Transaction", () => {
  it("6.12-INTEGRATION-009: should create all valid packs atomically", async () => {
    // GIVEN: Batch of valid serialized numbers
    const serializedNumbers = [
      "000112345670123456789012",
      "000198765430456789012345",
      "000155555550789012345678",
    ];

    // WHEN: Processing batch (simulating API call logic)
    // Note: This test simulates the transaction logic, not the full API
    const result = await prisma.$transaction(async (tx) => {
      const created: any[] = [];
      const duplicates: string[] = [];
      const errors: Array<{ serial: string; error: string }> = [];

      for (const serial of serializedNumbers) {
        // Parse serial (simplified - actual implementation uses utility)
        const pack_number = serial.substring(4, 11); // positions 5-11
        const serial_start = serial.substring(11, 14); // positions 12-14

        // Check for duplicates
        const existing = await tx.lotteryPack.findUnique({
          where: {
            store_id_pack_number: {
              store_id: testStore.store_id,
              pack_number: pack_number,
            },
          },
        });

        if (existing) {
          duplicates.push(serial);
          continue;
        }

        // Create pack
        const newPack = await tx.lotteryPack.create({
          data: {
            game_id: testGame.game_id,
            store_id: testStore.store_id,
            pack_number: pack_number,
            serial_start: serial_start,
            serial_end: String(parseInt(serial_start) + 149),
            status: "RECEIVED",
            received_at: new Date(),
          },
        });

        created.push(newPack);
      }

      return { created, duplicates, errors };
    });

    // THEN: All packs are created
    expect(
      result.created.length,
      "All 3 packs should be created atomically",
    ).toBe(3);
    expect(result.duplicates.length, "No duplicates should be detected").toBe(
      0,
    );
    expect(result.errors.length, "No errors should occur").toBe(0);

    // AND: All packs exist in database
    const packs = await prisma.lotteryPack.findMany({
      where: { store_id: testStore.store_id },
    });
    expect(packs.length, "All created packs should exist in database").toBe(3);

    // AND: All packs have correct data
    packs.forEach((pack, index) => {
      expect(pack.game_id, `Pack ${index} should have game_id`).toBe(
        testGame.game_id,
      );
      expect(pack.store_id, `Pack ${index} should have correct store_id`).toBe(
        testStore.store_id,
      );
      expect(pack.status, `Pack ${index} should have RECEIVED status`).toBe(
        "RECEIVED",
      );
      expect(
        pack.received_at,
        `Pack ${index} should have received_at timestamp`,
      ).not.toBeNull();
    });
  });

  it("6.12-INTEGRATION-010: should rollback all packs if transaction fails", async () => {
    // GIVEN: Batch that will cause transaction failure
    // (This test verifies atomicity - if one fails, all should rollback)
    // Note: In actual implementation, partial failures are handled gracefully
    // This test verifies that database-level errors cause rollback

    const initialCount = await prisma.lotteryPack.count({
      where: { store_id: testStore.store_id },
    });

    // WHEN: Attempting transaction that will fail
    try {
      await prisma.$transaction(async (tx) => {
        // Create first pack
        await tx.lotteryPack.create({
          data: {
            game_id: testGame.game_id,
            store_id: testStore.store_id,
            pack_number: "1234567",
            serial_start: "000",
            serial_end: "149",
            status: "RECEIVED",
            received_at: new Date(),
          },
        });

        // Force error (invalid foreign key)
        await tx.lotteryPack.create({
          data: {
            game_id: "00000000-0000-0000-0000-000000000000", // Invalid UUID
            store_id: testStore.store_id,
            pack_number: "9876543",
            serial_start: "000",
            serial_end: "149",
            status: "RECEIVED",
            received_at: new Date(),
          },
        });
      });
    } catch (error) {
      // Expected to fail
    }

    // THEN: No packs were created (transaction rolled back)
    const finalCount = await prisma.lotteryPack.count({
      where: { store_id: testStore.store_id },
    });
    expect(
      finalCount,
      "Transaction should rollback - no packs should be created",
    ).toBe(initialCount);
  });

  it("6.12-INTEGRATION-010a: should maintain database consistency during large batch", async () => {
    // GIVEN: Large batch (50 packs)
    const serializedNumbers = Array.from(
      { length: 50 },
      (_, i) => `0001${String(i).padStart(7, "0")}0123456789012345`,
    );

    // WHEN: Processing large batch in transaction
    const result = await prisma.$transaction(async (tx) => {
      const created: any[] = [];
      const seenPackNumbers = new Set<string>();

      for (const serial of serializedNumbers) {
        const pack_number = serial.substring(4, 11);
        const packKey = `${testStore.store_id}:${pack_number}`;

        if (seenPackNumbers.has(packKey)) {
          continue;
        }
        seenPackNumbers.add(packKey);

        const existing = await tx.lotteryPack.findUnique({
          where: {
            store_id_pack_number: {
              store_id: testStore.store_id,
              pack_number: pack_number,
            },
          },
        });

        if (existing) {
          continue;
        }

        const newPack = await tx.lotteryPack.create({
          data: {
            game_id: testGame.game_id,
            store_id: testStore.store_id,
            pack_number: pack_number,
            serial_start: serial.substring(11, 14),
            serial_end: String(parseInt(serial.substring(11, 14)) + 149),
            status: "RECEIVED",
            received_at: new Date(),
          },
        });

        created.push(newPack);
      }

      return { created };
    });

    // THEN: All packs are created atomically
    expect(result.created.length, "All 50 packs should be created").toBe(50);

    // AND: Database count matches
    const dbCount = await prisma.lotteryPack.count({
      where: { store_id: testStore.store_id },
    });
    expect(dbCount, "Database count should match created count").toBe(
      result.created.length,
    );
  });
});

describe("6.12-INTEGRATION: Batch Pack Reception - Duplicate Detection", () => {
  it("6.12-INTEGRATION-011: should detect duplicates within batch", async () => {
    // GIVEN: Batch with duplicate pack numbers
    const serializedNumbers = [
      "000112345670123456789012", // pack: 1234567
      "000112345670456789012345", // pack: 1234567 (duplicate)
      "000198765430789012345678", // pack: 9876543
    ];

    // WHEN: Processing batch
    const seenPackNumbers = new Set<string>();
    const duplicates: string[] = [];
    const created: any[] = [];

    for (const serial of serializedNumbers) {
      const pack_number = serial.substring(4, 11);
      const packKey = `${testStore.store_id}:${pack_number}`;

      if (seenPackNumbers.has(packKey)) {
        duplicates.push(serial);
        continue;
      }
      seenPackNumbers.add(packKey);

      // Create pack
      const newPack = await prisma.lotteryPack.create({
        data: {
          game_id: testGame.game_id,
          store_id: testStore.store_id,
          pack_number: pack_number,
          serial_start: serial.substring(11, 14),
          serial_end: String(parseInt(serial.substring(11, 14)) + 149),
          status: "RECEIVED",
          received_at: new Date(),
        },
      });
      created.push(newPack);
    }

    // THEN: Duplicate is detected
    expect(
      duplicates.length,
      "One duplicate should be detected within batch",
    ).toBe(1);
    expect(created.length, "Only 2 unique packs should be created").toBe(2);
    expect(duplicates[0], "Duplicate serial should be recorded").toBe(
      "000112345670456789012345",
    );
  });

  it("6.12-INTEGRATION-012: should detect duplicates in database", async () => {
    // GIVEN: Pack already exists in database
    await createLotteryPack(prisma, {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
      pack_number: "1234567",
      serial_start: "000",
      serial_end: "149",
    });

    // AND: Batch contains serial for same pack number
    const serializedNumbers = [
      "000112345670123456789012", // pack: 1234567 (already exists)
    ];

    // WHEN: Processing batch
    const duplicates: string[] = [];
    const created: any[] = [];

    for (const serial of serializedNumbers) {
      const pack_number = serial.substring(4, 11);

      const existing = await prisma.lotteryPack.findUnique({
        where: {
          store_id_pack_number: {
            store_id: testStore.store_id,
            pack_number: pack_number,
          },
        },
      });

      if (existing) {
        duplicates.push(serial);
        continue;
      }

      // Would create pack if not duplicate
      created.push({ serial });
    }

    // THEN: Duplicate is detected
    expect(duplicates.length, "Duplicate in database should be detected").toBe(
      1,
    );
    expect(
      created.length,
      "No new packs should be created when duplicate exists",
    ).toBe(0);
    expect(duplicates[0], "Duplicate serial should be recorded").toBe(
      "000112345670123456789012",
    );
  });
});

describe("6.12-INTEGRATION: Batch Pack Reception - Partial Failure Handling", () => {
  it("6.12-INTEGRATION-013: should handle mix of valid and invalid serials", async () => {
    // GIVEN: Batch with mix of valid and invalid serials
    const serializedNumbers = [
      "000112345670123456789012", // Valid
      "123", // Invalid (too short)
      "000198765430456789012345", // Valid
      "abc123", // Invalid (non-numeric)
      "000155555550789012345678", // Valid
    ];

    // WHEN: Processing batch (simulating validation logic)
    const created: any[] = [];
    const errors: Array<{ serial: string; error: string }> = [];

    for (const serial of serializedNumbers) {
      // Validate format
      if (!/^\d{24}$/.test(serial)) {
        errors.push({
          serial,
          error: "Invalid serial number format",
        });
        continue;
      }

      const pack_number = serial.substring(4, 11);
      const serial_start = serial.substring(11, 14);

      // Check for duplicates
      const existing = await prisma.lotteryPack.findUnique({
        where: {
          store_id_pack_number: {
            store_id: testStore.store_id,
            pack_number: pack_number,
          },
        },
      });

      if (existing) {
        errors.push({
          serial,
          error: "Pack already exists",
        });
        continue;
      }

      // Create pack
      const newPack = await prisma.lotteryPack.create({
        data: {
          game_id: testGame.game_id,
          store_id: testStore.store_id,
          pack_number: pack_number,
          serial_start: serial_start,
          serial_end: String(parseInt(serial_start) + 149),
          status: "RECEIVED",
          received_at: new Date(),
        },
      });

      created.push(newPack);
    }

    // THEN: Valid packs are created, invalid ones have errors
    expect(created.length, "3 valid packs should be created").toBe(3);
    expect(errors.length, "2 invalid serials should have errors").toBe(2);

    // AND: Error messages are descriptive
    errors.forEach((error) => {
      expect(error.serial, "Error should include serial number").toBeDefined();
      expect(error.error, "Error should include error message").toBeDefined();
      expect(error.error, "Error message should mention format").toContain(
        "format",
      );
    });

    // AND: Created packs exist in database
    const packs = await prisma.lotteryPack.findMany({
      where: { store_id: testStore.store_id },
    });
    expect(packs.length, "All created packs should exist in database").toBe(3);
  });

  it("6.12-INTEGRATION-014: should handle game code lookup failures gracefully", async () => {
    // GIVEN: Batch with valid format but invalid game code
    const serializedNumbers = [
      "000112345670123456789012", // Valid game_code: 0001 (exists)
      "999912345670456789012345", // Invalid game_code: 9999 (doesn't exist)
    ];

    // WHEN: Processing batch
    const created: any[] = [];
    const errors: Array<{ serial: string; error: string }> = [];

    for (const serial of serializedNumbers) {
      const game_code = serial.substring(0, 4);

      // Lookup game
      const game = await prisma.lotteryGame.findUnique({
        where: { game_code: game_code },
      });

      if (!game) {
        errors.push({
          serial,
          error: `Game code ${game_code} not found`,
        });
        continue;
      }

      const pack_number = serial.substring(4, 11);
      const serial_start = serial.substring(11, 14);

      const newPack = await prisma.lotteryPack.create({
        data: {
          game_id: game.game_id,
          store_id: testStore.store_id,
          pack_number: pack_number,
          serial_start: serial_start,
          serial_end: String(parseInt(serial_start) + 149),
          status: "RECEIVED",
          received_at: new Date(),
        },
      });

      created.push(newPack);
    }

    // THEN: Valid pack is created, invalid game code has error
    expect(created.length, "One valid pack should be created").toBe(1);
    expect(
      errors.length,
      "One error should be reported for invalid game code",
    ).toBe(1);
    expect(
      errors[0].error,
      "Error should mention game code not found",
    ).toContain("Game code 9999 not found");
    expect(errors[0].serial, "Error should include the serial number").toBe(
      "999912345670456789012345",
    );
  });

  it("6.12-INTEGRATION-015: should enforce unique constraint on store_id + pack_number", async () => {
    // GIVEN: Pack already exists
    await createLotteryPack(prisma, {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
      pack_number: "1234567",
      serial_start: "000",
      serial_end: "149",
    });

    // WHEN: Attempting to create duplicate pack (same store_id + pack_number)
    await expect(
      prisma.lotteryPack.create({
        data: {
          game_id: testGame.game_id,
          store_id: testStore.store_id,
          pack_number: "1234567", // Duplicate
          serial_start: "150",
          serial_end: "299",
          status: "RECEIVED",
          received_at: new Date(),
        },
      }),
    ).rejects.toThrow(); // Should throw unique constraint violation

    // THEN: Only one pack exists
    const packs = await prisma.lotteryPack.findMany({
      where: {
        store_id: testStore.store_id,
        pack_number: "1234567",
      },
    });
    expect(
      packs.length,
      "Unique constraint should prevent duplicate pack_number per store",
    ).toBe(1);
  });

  it("6.12-INTEGRATION-016: should allow same pack_number in different stores", async () => {
    // GIVEN: Pack exists in one store
    const otherCompany = await createCompany(prisma);
    const otherStore = await createStore(prisma, {
      company_id: otherCompany.company_id,
    });

    await createLotteryPack(prisma, {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
      pack_number: "1234567",
      serial_start: "000",
      serial_end: "149",
    });

    // WHEN: Creating same pack_number in different store
    const newPack = await prisma.lotteryPack.create({
      data: {
        game_id: testGame.game_id,
        store_id: otherStore.store_id,
        pack_number: "1234567", // Same pack_number, different store
        serial_start: "000",
        serial_end: "149",
        status: "RECEIVED",
        received_at: new Date(),
      },
    });

    // THEN: Pack is created successfully (different store)
    expect(
      newPack.pack_id,
      "Pack should be created in different store",
    ).toBeDefined();
    expect(newPack.store_id, "Pack should belong to other store").toBe(
      otherStore.store_id,
    );

    // Cleanup
    await prisma.lotteryPack.delete({
      where: { pack_id: newPack.pack_id },
    });
    await prisma.store.delete({ where: { store_id: otherStore.store_id } });
    await prisma.company.delete({
      where: { company_id: otherCompany.company_id },
    });
  });
});
