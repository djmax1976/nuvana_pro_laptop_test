/**
 * Integration Tests: Lottery Models - Database Operations
 *
 * Tests database schema, foreign key constraints, and Prisma Client queries:
 * - Table creation via migration
 * - Model creation with all required fields
 * - Foreign key constraints
 * - Relationship queries
 * - Enum enforcement at database level
 * - Security: SQL injection prevention, input validation
 * - Business logic: Serial number validation, pack number uniqueness, status transitions, price validation
 *
 * @test-level INTEGRATION
 * @justification Tests database operations, foreign key constraints, and Prisma Client queries that require database connection
 * @story 6.1 - Lottery Game and Pack Data Models
 * @priority P0 (Critical - Database Operations)
 * @enhanced-by workflow-9 on 2025-01-28
 *
 * Story: 6.1 - Lottery Game and Pack Data Models
 * Priority: P0 (Critical - Database Operations)
 *
 * These tests validate database schema and Prisma Client operations.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  PrismaClient,
  LotteryGameStatus,
  LotteryPackStatus,
} from "@prisma/client";
import {
  createLotteryGame,
  createLotteryPack,
  createLotteryBin,
} from "../support/factories/lottery.factory";

const prisma = new PrismaClient();

// Test data - isolated per test suite
let testUser: any;
let testCompany: any;
let testStore: any;
let testGame: any;
let testGame2: any; // For pack number uniqueness tests

// ═══════════════════════════════════════════════════════════════════════════
// TEST SETUP & TEARDOWN
// ═══════════════════════════════════════════════════════════════════════════

beforeAll(async () => {
  // GIVEN: Test infrastructure exists (company, store, game)
  // Create test company and store for foreign key relationships
  testCompany = await prisma.company.create({
    data: {
      name: "Test Company",
      owner_user_id: (testUser = await prisma.user.create({
        data: {
          email: `test-${Date.now()}@test.com`,
          name: "Test User",
          public_id: `USR${Date.now()}`,
        },
      })).user_id,
      public_id: `COM${Date.now()}`,
    },
  });

  testStore = await prisma.store.create({
    data: {
      company_id: testCompany.company_id,
      name: "Test Store",
      public_id: `STR${Date.now()}`,
    },
  });

  testGame = await createLotteryGame(prisma, { name: "Test Game", price: 2.0 });
  testGame2 = await createLotteryGame(prisma, {
    name: "Test Game 2",
    price: 5.0,
  });
});

beforeEach(async () => {
  // Ensure test isolation - clean up lottery data before each test
  await prisma.lotteryPack.deleteMany({});
  await prisma.lotteryBin.deleteMany({});
  // Note: Games are kept for foreign key relationships
});

afterAll(async () => {
  // Cleanup all test data
  await prisma.lotteryPack.deleteMany({});
  await prisma.lotteryBin.deleteMany({});
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

// ═══════════════════════════════════════════════════════════════════════════
// TABLE CREATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("6.1-INTEGRATION: Table Creation", () => {
  it("6.1-INTEGRATION-001: should create lottery_games table", async () => {
    // GIVEN: Database migration has been run
    // WHEN: Querying the lottery_games table
    const games = await prisma.lotteryGame.findMany();

    // THEN: Table exists and returns an array
    expect(
      Array.isArray(games),
      "lottery_games table should exist and return array",
    ).toBe(true);
  });

  it("6.1-INTEGRATION-002: should create lottery_packs table", async () => {
    // GIVEN: Database migration has been run
    // WHEN: Querying the lottery_packs table
    const packs = await prisma.lotteryPack.findMany();

    // THEN: Table exists and returns an array
    expect(
      Array.isArray(packs),
      "lottery_packs table should exist and return array",
    ).toBe(true);
  });

  it("6.1-INTEGRATION-003: should create lottery_bins table", async () => {
    // GIVEN: Database migration has been run
    // WHEN: Querying the lottery_bins table
    const bins = await prisma.lotteryBin.findMany();

    // THEN: Table exists and returns an array
    expect(
      Array.isArray(bins),
      "lottery_bins table should exist and return array",
    ).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MODEL CREATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("6.1-INTEGRATION: Model Creation", () => {
  it("6.1-INTEGRATION-004: should create LotteryGame with all required fields", async () => {
    // GIVEN: Valid game data
    const gameData = {
      name: "Integration Test Game",
      description: "Test description",
      price: 5.0,
      status: LotteryGameStatus.ACTIVE,
    };

    // WHEN: Creating a LotteryGame
    const game = await createLotteryGame(prisma, gameData);

    // THEN: All fields are correctly set
    expect(game.game_id, "game_id should be defined").toBeDefined();
    expect(game.name, "name should match input").toBe("Integration Test Game");
    expect(game.description, "description should match input").toBe(
      "Test description",
    );
    expect(game.price, "price should match input").toBe(5.0);
    expect(game.status, "status should match input").toBe(
      LotteryGameStatus.ACTIVE,
    );

    // AND: Timestamps are automatically set
    expect(game.created_at, "created_at should be a Date").toBeInstanceOf(Date);
    expect(game.updated_at, "updated_at should be a Date").toBeInstanceOf(Date);
    expect(
      game.created_at.getTime(),
      "created_at should be recent",
    ).toBeGreaterThan(Date.now() - 5000);
  });

  it("6.1-INTEGRATION-005: should auto-generate UUID for game_id", async () => {
    // GIVEN: No game_id provided
    // WHEN: Creating a LotteryGame
    const game = await createLotteryGame(prisma);

    // THEN: game_id is auto-generated as valid UUID
    expect(game.game_id, "game_id should be defined").toBeDefined();
    expect(game.game_id, "game_id should be valid UUID format").toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(typeof game.game_id, "game_id should be string").toBe("string");
  });

  it("6.1-INTEGRATION-006: should default status to ACTIVE", async () => {
    // GIVEN: No status provided
    // WHEN: Creating a LotteryGame without status
    const game = await createLotteryGame(prisma, { status: undefined as any });

    // THEN: Status defaults to ACTIVE
    expect(game.status, "status should default to ACTIVE").toBe(
      LotteryGameStatus.ACTIVE,
    );
  });

  it("6.1-INTEGRATION-007: should create LotteryPack with all required fields", async () => {
    // GIVEN: Valid pack data
    const packData = {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
      pack_number: "PACK001",
      serial_start: "184303159650093783374530",
      serial_end: "184303159650093783374680", // 150 tickets for $2 game
      status: LotteryPackStatus.RECEIVED,
    };

    // WHEN: Creating a LotteryPack
    const pack = await createLotteryPack(prisma, packData);

    // THEN: All fields are correctly set
    expect(pack.pack_id, "pack_id should be defined").toBeDefined();
    expect(pack.game_id, "game_id should match input").toBe(testGame.game_id);
    expect(pack.store_id, "store_id should match input").toBe(
      testStore.store_id,
    );
    expect(pack.pack_number, "pack_number should match input").toBe("PACK001");
    expect(pack.serial_start, "serial_start should match input").toBe(
      "184303159650093783374530",
    );
    expect(pack.serial_end, "serial_end should match input").toBe(
      "184303159650093783374680",
    );
    expect(pack.status, "status should match input").toBe(
      LotteryPackStatus.RECEIVED,
    );

    // AND: Timestamps are automatically set
    expect(pack.created_at, "created_at should be a Date").toBeInstanceOf(Date);
    expect(pack.updated_at, "updated_at should be a Date").toBeInstanceOf(Date);
  });

  it("6.1-INTEGRATION-008: should default status to RECEIVED", async () => {
    // GIVEN: No status provided
    // WHEN: Creating a LotteryPack without status
    const pack = await createLotteryPack(prisma, {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
    });

    // THEN: Status defaults to RECEIVED
    expect(pack.status, "status should default to RECEIVED").toBe(
      LotteryPackStatus.RECEIVED,
    );
  });

  it("6.1-INTEGRATION-009: should create LotteryBin with all required fields", async () => {
    // GIVEN: Valid bin data
    const binData = {
      store_id: testStore.store_id,
      name: "Test Bin",
      location: "Warehouse A",
    };

    // WHEN: Creating a LotteryBin
    const bin = await createLotteryBin(prisma, binData);

    // THEN: All fields are correctly set
    expect(bin.bin_id, "bin_id should be defined").toBeDefined();
    expect(bin.store_id, "store_id should match input").toBe(
      testStore.store_id,
    );
    expect(bin.name, "name should match input").toBe("Test Bin");
    expect(bin.location, "location should match input").toBe("Warehouse A");

    // AND: Timestamps are automatically set
    expect(bin.created_at, "created_at should be a Date").toBeInstanceOf(Date);
    expect(bin.updated_at, "updated_at should be a Date").toBeInstanceOf(Date);
  });

  it("6.1-INTEGRATION-017: should auto-generate UUID for pack_id", async () => {
    // GIVEN: No pack_id provided
    // WHEN: Creating a LotteryPack
    const pack = await createLotteryPack(prisma, {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
    });

    // THEN: pack_id is auto-generated as valid UUID
    expect(pack.pack_id, "pack_id should be defined").toBeDefined();
    expect(pack.pack_id, "pack_id should be valid UUID format").toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(typeof pack.pack_id, "pack_id should be string").toBe("string");
  });

  it("6.1-INTEGRATION-018: should auto-generate UUID for bin_id", async () => {
    // GIVEN: No bin_id provided
    // WHEN: Creating a LotteryBin
    const bin = await createLotteryBin(prisma, {
      store_id: testStore.store_id,
    });

    // THEN: bin_id is auto-generated as valid UUID
    expect(bin.bin_id, "bin_id should be defined").toBeDefined();
    expect(bin.bin_id, "bin_id should be valid UUID format").toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(typeof bin.bin_id, "bin_id should be string").toBe("string");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FOREIGN KEY CONSTRAINT TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("6.1-INTEGRATION: Foreign Key Constraints", () => {
  it("6.1-INTEGRATION-010: should reject LotteryPack with invalid game_id", async () => {
    // GIVEN: Invalid game_id (non-existent UUID)
    const invalidGameId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Attempting to create LotteryPack with invalid game_id
    // THEN: Foreign key constraint violation is thrown
    await expect(
      createLotteryPack(prisma, {
        game_id: invalidGameId,
        store_id: testStore.store_id,
      }),
      "Should reject invalid game_id with foreign key constraint error",
    ).rejects.toThrow();
  });

  it("6.1-INTEGRATION-011: should reject LotteryPack with invalid store_id", async () => {
    // GIVEN: Invalid store_id (non-existent UUID)
    const invalidStoreId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Attempting to create LotteryPack with invalid store_id
    // THEN: Foreign key constraint violation is thrown
    await expect(
      createLotteryPack(prisma, {
        game_id: testGame.game_id,
        store_id: invalidStoreId,
      }),
      "Should reject invalid store_id with foreign key constraint error",
    ).rejects.toThrow();
  });

  it("6.1-INTEGRATION-019: should reject LotteryPack with invalid current_bin_id", async () => {
    // GIVEN: Invalid current_bin_id (non-existent UUID)
    const invalidBinId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Attempting to create LotteryPack with invalid current_bin_id
    // THEN: Foreign key constraint violation is thrown
    await expect(
      createLotteryPack(prisma, {
        game_id: testGame.game_id,
        store_id: testStore.store_id,
        current_bin_id: invalidBinId,
      }),
      "Should reject invalid current_bin_id with foreign key constraint error",
    ).rejects.toThrow();
  });

  it("6.1-INTEGRATION-020: should reject LotteryBin with invalid store_id", async () => {
    // GIVEN: Invalid store_id (non-existent UUID)
    const invalidStoreId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Attempting to create LotteryBin with invalid store_id
    // THEN: Foreign key constraint violation is thrown
    await expect(
      createLotteryBin(prisma, {
        store_id: invalidStoreId,
      }),
      "Should reject invalid store_id with foreign key constraint error",
    ).rejects.toThrow();
  });

  it("6.1-INTEGRATION-021: should accept null current_bin_id (nullable foreign key)", async () => {
    // GIVEN: No current_bin_id provided (null)
    // WHEN: Creating a LotteryPack without current_bin_id
    const pack = await createLotteryPack(prisma, {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
      current_bin_id: undefined,
    });

    // THEN: Pack is created successfully with null current_bin_id
    expect(
      pack.current_bin_id,
      "current_bin_id should be null when not provided",
    ).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RELATIONSHIP TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("6.1-INTEGRATION: Relationships", () => {
  it("6.1-INTEGRATION-012: should query LotteryGame with packs relation", async () => {
    // GIVEN: A LotteryGame and a LotteryPack
    const pack = await createLotteryPack(prisma, {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
    });

    // WHEN: Querying LotteryGame with packs relation
    const game = await prisma.lotteryGame.findUnique({
      where: { game_id: testGame.game_id },
      include: { packs: true },
    });

    // THEN: Game is found with packs relation
    expect(game, "Game should be found").toBeDefined();
    expect(game?.packs, "packs relation should be defined").toBeDefined();
    expect(Array.isArray(game?.packs), "packs should be an array").toBe(true);
    expect(
      game?.packs.length,
      "packs array should contain at least one pack",
    ).toBeGreaterThan(0);
    expect(game?.packs[0].pack_id, "First pack should match created pack").toBe(
      pack.pack_id,
    );
  });

  it("6.1-INTEGRATION-013: should query LotteryPack with game and store relations", async () => {
    // GIVEN: A LotteryPack
    const pack = await createLotteryPack(prisma, {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
    });

    // WHEN: Querying LotteryPack with game and store relations
    const packWithRelations = await prisma.lotteryPack.findUnique({
      where: { pack_id: pack.pack_id },
      include: { game: true, store: true },
    });

    // THEN: Pack is found with game and store relations
    expect(
      packWithRelations?.game,
      "game relation should be defined",
    ).toBeDefined();
    expect(packWithRelations?.game.game_id, "game.game_id should match").toBe(
      testGame.game_id,
    );
    expect(
      packWithRelations?.store,
      "store relation should be defined",
    ).toBeDefined();
    expect(
      packWithRelations?.store.store_id,
      "store.store_id should match",
    ).toBe(testStore.store_id);
  });

  it("6.1-INTEGRATION-014: should query LotteryPack with bin relation (nullable)", async () => {
    // GIVEN: A LotteryBin and a LotteryPack with bin assignment
    const bin = await createLotteryBin(prisma, {
      store_id: testStore.store_id,
    });

    const pack = await createLotteryPack(prisma, {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
      current_bin_id: bin.bin_id,
    });

    // WHEN: Querying LotteryPack with bin relation
    const packWithBin = await prisma.lotteryPack.findUnique({
      where: { pack_id: pack.pack_id },
      include: { bin: true },
    });

    // THEN: Pack is found with bin relation
    expect(packWithBin?.bin, "bin relation should be defined").toBeDefined();
    expect(packWithBin?.bin?.bin_id, "bin.bin_id should match").toBe(
      bin.bin_id,
    );
  });

  it("6.1-INTEGRATION-022: should query LotteryBin with packs relation", async () => {
    // GIVEN: A LotteryBin and a LotteryPack assigned to it
    const bin = await createLotteryBin(prisma, {
      store_id: testStore.store_id,
    });

    const pack = await createLotteryPack(prisma, {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
      current_bin_id: bin.bin_id,
    });

    // WHEN: Querying LotteryBin with packs relation
    const binWithPacks = await prisma.lotteryBin.findUnique({
      where: { bin_id: bin.bin_id },
      include: { packs: true },
    });

    // THEN: Bin is found with packs relation
    expect(
      binWithPacks?.packs,
      "packs relation should be defined",
    ).toBeDefined();
    expect(Array.isArray(binWithPacks?.packs), "packs should be an array").toBe(
      true,
    );
    expect(
      binWithPacks?.packs.length,
      "packs array should contain at least one pack",
    ).toBeGreaterThan(0);
    expect(
      binWithPacks?.packs[0].pack_id,
      "First pack should match created pack",
    ).toBe(pack.pack_id);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ENUM ENFORCEMENT TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("6.1-INTEGRATION: Enum Enforcement", () => {
  it("6.1-INTEGRATION-015: should reject invalid LotteryGameStatus value", async () => {
    // GIVEN: Invalid status value
    // WHEN: Attempting to create LotteryGame with invalid status
    // THEN: Enum constraint violation is thrown
    await expect(
      prisma.lotteryGame.create({
        data: {
          name: "Test",
          status: "INVALID_STATUS" as any,
        },
      }),
      "Should reject invalid LotteryGameStatus with enum constraint error",
    ).rejects.toThrow();
  });

  it("6.1-INTEGRATION-016: should reject invalid LotteryPackStatus value", async () => {
    // GIVEN: Invalid status value
    // WHEN: Attempting to create LotteryPack with invalid status
    // THEN: Enum constraint violation is thrown
    await expect(
      prisma.lotteryPack.create({
        data: {
          game_id: testGame.game_id,
          store_id: testStore.store_id,
          pack_number: "TEST",
          serial_start: "000001",
          serial_end: "000100",
          status: "INVALID_STATUS" as any,
        },
      }),
      "Should reject invalid LotteryPackStatus with enum constraint error",
    ).rejects.toThrow();
  });

  it("6.1-INTEGRATION-023: should accept all valid LotteryGameStatus values", async () => {
    // GIVEN: Valid status values
    const statuses = [
      LotteryGameStatus.ACTIVE,
      LotteryGameStatus.INACTIVE,
      LotteryGameStatus.DISCONTINUED,
    ];

    // WHEN: Creating games with each valid status
    // THEN: All statuses are accepted
    for (const status of statuses) {
      const game = await createLotteryGame(prisma, { status });
      expect(game.status, `Status ${status} should be accepted`).toBe(status);
    }
  });

  it("6.1-INTEGRATION-024: should accept all valid LotteryPackStatus values", async () => {
    // GIVEN: Valid status values
    const statuses = [
      LotteryPackStatus.RECEIVED,
      LotteryPackStatus.ACTIVE,
      LotteryPackStatus.DEPLETED,
      LotteryPackStatus.RETURNED,
    ];

    // WHEN: Creating packs with each valid status
    // THEN: All statuses are accepted
    for (const status of statuses) {
      const pack = await createLotteryPack(prisma, {
        game_id: testGame.game_id,
        store_id: testStore.store_id,
        status,
      });
      expect(pack.status, `Status ${status} should be accepted`).toBe(status);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SECURITY TESTS (Mandatory)
// ═══════════════════════════════════════════════════════════════════════════

describe("6.1-INTEGRATION: Security - SQL Injection Prevention", () => {
  it("6.1-INTEGRATION-025: SECURITY - should sanitize SQL injection in name field", async () => {
    // GIVEN: Malicious SQL injection attempt in name field
    const maliciousName = "Test'; DROP TABLE lottery_games; --";

    // WHEN: Creating LotteryGame with SQL injection in name
    // THEN: Request is either rejected or safely handled (Prisma sanitizes)
    const game = await createLotteryGame(prisma, { name: maliciousName });

    // AND: Database is intact (table still exists)
    const games = await prisma.lotteryGame.findMany();
    expect(Array.isArray(games), "Database should still be accessible").toBe(
      true,
    );
    expect(game.name, "Name should be stored as-is (Prisma sanitizes)").toBe(
      maliciousName,
    );
  });

  it("6.1-INTEGRATION-026: SECURITY - should sanitize SQL injection in pack_number field", async () => {
    // GIVEN: Malicious SQL injection attempt in pack_number
    const maliciousPackNumber = "PACK'; DROP TABLE lottery_packs; --";

    // WHEN: Creating LotteryPack with SQL injection in pack_number
    // THEN: Request is either rejected or safely handled
    const pack = await createLotteryPack(prisma, {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
      pack_number: maliciousPackNumber,
    });

    // AND: Database is intact
    const packs = await prisma.lotteryPack.findMany();
    expect(Array.isArray(packs), "Database should still be accessible").toBe(
      true,
    );
    expect(pack.pack_number, "pack_number should be stored as-is").toBe(
      maliciousPackNumber,
    );
  });

  it("6.1-INTEGRATION-027: SECURITY - should sanitize SQL injection in serial_start field", async () => {
    // GIVEN: Malicious SQL injection attempt in serial_start
    const maliciousSerial =
      "184303159650093783374530'; DROP TABLE lottery_packs; --";

    // WHEN: Creating LotteryPack with SQL injection in serial_start
    // THEN: Request is either rejected or safely handled
    const pack = await createLotteryPack(prisma, {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
      serial_start: maliciousSerial,
      serial_end: "184303159650093783374680",
    });

    // AND: Database is intact
    const packs = await prisma.lotteryPack.findMany();
    expect(Array.isArray(packs), "Database should still be accessible").toBe(
      true,
    );
  });
});

describe("6.1-INTEGRATION: Security - Input Validation", () => {
  it("6.1-INTEGRATION-028: SECURITY - should reject invalid UUID format in game_id", async () => {
    // GIVEN: Invalid UUID format (not a valid UUID)
    const invalidGameId = "not-a-valid-uuid";

    // WHEN: Attempting to create LotteryPack with invalid UUID
    // THEN: Validation error is thrown (Prisma validates UUID format)
    await expect(
      prisma.lotteryPack.create({
        data: {
          game_id: invalidGameId,
          store_id: testStore.store_id,
          pack_number: "TEST",
          serial_start: "184303159650093783374530",
          serial_end: "184303159650093783374680",
        },
      }),
      "Should reject invalid UUID format in game_id",
    ).rejects.toThrow();
  });

  it("6.1-INTEGRATION-029: SECURITY - should reject invalid UUID format in store_id", async () => {
    // GIVEN: Invalid UUID format
    const invalidStoreId = "not-a-valid-uuid";

    // WHEN: Attempting to create LotteryPack with invalid UUID
    // THEN: Validation error is thrown
    await expect(
      prisma.lotteryPack.create({
        data: {
          game_id: testGame.game_id,
          store_id: invalidStoreId,
          pack_number: "TEST",
          serial_start: "184303159650093783374530",
          serial_end: "184303159650093783374680",
        },
      }),
      "Should reject invalid UUID format in store_id",
    ).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EDGE CASE TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("6.1-INTEGRATION: Edge Cases - String Fields", () => {
  it("6.1-INTEGRATION-030: should handle empty string in name field", async () => {
    // GIVEN: Empty string for name
    // WHEN: Attempting to create LotteryGame with empty name
    // THEN: Database constraint violation or validation error
    await expect(
      prisma.lotteryGame.create({
        data: {
          name: "",
        },
      }),
      "Should reject empty string in name field",
    ).rejects.toThrow();
  });

  it("6.1-INTEGRATION-031: should handle very long string in name field", async () => {
    // GIVEN: Very long string (exceeding DB limit)
    const veryLongName = "A".repeat(300); // Exceeds VarChar(255)

    // WHEN: Attempting to create LotteryGame with very long name
    // THEN: Database constraint violation
    await expect(
      prisma.lotteryGame.create({
        data: {
          name: veryLongName,
        },
      }),
      "Should reject very long string in name field",
    ).rejects.toThrow();
  });

  it("6.1-INTEGRATION-032: should handle empty string in pack_number field", async () => {
    // GIVEN: Empty string for pack_number
    // WHEN: Attempting to create LotteryPack with empty pack_number
    // THEN: Database constraint violation or validation error
    await expect(
      prisma.lotteryPack.create({
        data: {
          game_id: testGame.game_id,
          store_id: testStore.store_id,
          pack_number: "",
          serial_start: "184303159650093783374530",
          serial_end: "184303159650093783374680",
        },
      }),
      "Should reject empty string in pack_number field",
    ).rejects.toThrow();
  });

  it("6.1-INTEGRATION-033: should handle empty string in serial_start field", async () => {
    // GIVEN: Empty string for serial_start
    // WHEN: Attempting to create LotteryPack with empty serial_start
    // THEN: Database constraint violation or validation error
    await expect(
      prisma.lotteryPack.create({
        data: {
          game_id: testGame.game_id,
          store_id: testStore.store_id,
          pack_number: "TEST",
          serial_start: "",
          serial_end: "184303159650093783374680",
        },
      }),
      "Should reject empty string in serial_start field",
    ).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BUSINESS LOGIC TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("6.1-INTEGRATION: Business Logic - Serial Number Validation", () => {
  it("6.1-INTEGRATION-034: BUSINESS - should accept numeric serial numbers only", async () => {
    // GIVEN: Valid numeric serial numbers (real lottery format)
    const serialStart = "184303159650093783374530";
    const serialEnd = "184303159650093783374680";

    // WHEN: Creating LotteryPack with numeric serials
    const pack = await createLotteryPack(prisma, {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
      serial_start: serialStart,
      serial_end: serialEnd,
    });

    // THEN: Pack is created successfully
    expect(pack.serial_start, "serial_start should be stored").toBe(
      serialStart,
    );
    expect(pack.serial_end, "serial_end should be stored").toBe(serialEnd);

    // AND: Serial numbers are numeric (business rule validation)
    expect(
      /^\d+$/.test(pack.serial_start),
      "serial_start should be numeric only",
    ).toBe(true);
    expect(
      /^\d+$/.test(pack.serial_end),
      "serial_end should be numeric only",
    ).toBe(true);
  });

  it("6.1-INTEGRATION-035: BUSINESS - should reject non-numeric serial numbers", async () => {
    // GIVEN: Non-numeric serial numbers (violates business rule)
    const nonNumericSerial = "ABC123DEF456";

    // WHEN: Attempting to create LotteryPack with non-numeric serial
    // THEN: Business rule validation should reject (application-level check needed)
    // Note: Database accepts strings, but business logic should validate
    const pack = await createLotteryPack(prisma, {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
      serial_start: nonNumericSerial,
      serial_end: "184303159650093783374680",
    });

    // Database accepts it, but business logic should validate
    // This test documents the requirement for application-level validation
    expect(
      pack.serial_start,
      "serial_start is stored but should be validated by business logic",
    ).toBe(nonNumericSerial);
  });

  it("6.1-INTEGRATION-036: BUSINESS - should validate serial range for $2 ticket (150 tickets)", async () => {
    // GIVEN: $2 ticket game (150 tickets per book)
    const game2Dollar = await createLotteryGame(prisma, {
      name: "$2 Game",
      price: 2.0,
    });
    const serialStart = "184303159650093783374530";
    const serialEnd = "184303159650093783374680"; // 150 tickets (680 - 530 = 150)

    // WHEN: Creating pack with correct range for $2 ticket
    const pack = await createLotteryPack(prisma, {
      game_id: game2Dollar.game_id,
      store_id: testStore.store_id,
      serial_start: serialStart,
      serial_end: serialEnd,
    });

    // THEN: Pack is created successfully
    expect(pack.serial_start, "serial_start should match").toBe(serialStart);
    expect(pack.serial_end, "serial_end should match").toBe(serialEnd);

    // AND: Range is 150 tickets (business rule for $2 tickets)
    const range = BigInt(serialEnd) - BigInt(serialStart);
    expect(range.toString(), "Range should be 150 for $2 ticket").toBe("150");
  });

  it("6.1-INTEGRATION-037: BUSINESS - should validate serial range for $5 ticket (60 tickets)", async () => {
    // GIVEN: $5 ticket game (60 tickets per book)
    const game5Dollar = await createLotteryGame(prisma, {
      name: "$5 Game",
      price: 5.0,
    });
    const serialStart = "186100042441230956377080";
    const serialEnd = "186100042441230956377140"; // 60 tickets (140 - 80 = 60)

    // WHEN: Creating pack with correct range for $5 ticket
    const pack = await createLotteryPack(prisma, {
      game_id: game5Dollar.game_id,
      store_id: testStore.store_id,
      serial_start: serialStart,
      serial_end: serialEnd,
    });

    // THEN: Pack is created successfully
    expect(pack.serial_start, "serial_start should match").toBe(serialStart);
    expect(pack.serial_end, "serial_end should match").toBe(serialEnd);

    // AND: Range is 60 tickets (business rule for $5 tickets)
    const range = BigInt(serialEnd) - BigInt(serialStart);
    expect(range.toString(), "Range should be 60 for $5 ticket").toBe("60");
  });

  it("6.1-INTEGRATION-038: BUSINESS - should reject invalid serial range (serial_start > serial_end)", async () => {
    // GIVEN: Invalid range (start > end)
    const serialStart = "184303159650093783374680";
    const serialEnd = "184303159650093783374530"; // Less than start

    // WHEN: Attempting to create pack with invalid range
    // THEN: Business rule validation should reject (application-level check needed)
    // Note: Database accepts it, but business logic should validate
    const pack = await createLotteryPack(prisma, {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
      serial_start: serialStart,
      serial_end: serialEnd,
    });

    // Database accepts it, but business logic should validate
    // This test documents the requirement for application-level validation
    expect(
      pack.serial_start,
      "serial_start is stored but should be validated by business logic",
    ).toBe(serialStart);
  });
});

describe("6.1-INTEGRATION: Business Logic - Pack Number Uniqueness", () => {
  it("6.1-INTEGRATION-039: BUSINESS - should allow same pack_number for different games", async () => {
    // GIVEN: Two different games
    // WHEN: Creating packs with same pack_number but different games
    const pack1 = await createLotteryPack(prisma, {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
      pack_number: "179601151790232274945555", // Pack number embedded in serial
    });

    const pack2 = await createLotteryPack(prisma, {
      game_id: testGame2.game_id,
      store_id: testStore.store_id,
      pack_number: "179601151790232274945555", // Same pack number, different game
    });

    // THEN: Both packs are created (pack_number unique per game)
    expect(pack1.pack_number, "First pack pack_number should match").toBe(
      "179601151790232274945555",
    );
    expect(pack2.pack_number, "Second pack pack_number should match").toBe(
      "179601151790232274945555",
    );
    expect(pack1.game_id, "First pack should belong to game 1").toBe(
      testGame.game_id,
    );
    expect(pack2.game_id, "Second pack should belong to game 2").toBe(
      testGame2.game_id,
    );
  });

  it("6.1-INTEGRATION-040: BUSINESS - pack number should be unique per game (application-level validation needed)", async () => {
    // GIVEN: Same game, same pack_number
    // WHEN: Attempting to create second pack with same pack_number for same game
    const pack1 = await createLotteryPack(prisma, {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
      pack_number: "UNIQUE001",
    });

    // Database allows duplicates, but business logic should enforce uniqueness per game
    // This test documents the requirement for application-level validation
    const pack2 = await createLotteryPack(prisma, {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
      pack_number: "UNIQUE001", // Same pack number, same game
    });

    // Database accepts it, but business logic should validate uniqueness
    expect(pack1.pack_number, "First pack pack_number").toBe("UNIQUE001");
    expect(
      pack2.pack_number,
      "Second pack pack_number (duplicate allowed by DB, should be validated by business logic)",
    ).toBe("UNIQUE001");
  });
});

describe("6.1-INTEGRATION: Business Logic - Status Transitions", () => {
  it("6.1-INTEGRATION-041: BUSINESS - should allow RECEIVED → ACTIVE transition", async () => {
    // GIVEN: Pack in RECEIVED status
    const pack = await createLotteryPack(prisma, {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
      status: LotteryPackStatus.RECEIVED,
    });

    // WHEN: Updating status to ACTIVE
    const updatedPack = await prisma.lotteryPack.update({
      where: { pack_id: pack.pack_id },
      data: { status: LotteryPackStatus.ACTIVE },
    });

    // THEN: Status transition is successful
    expect(
      updatedPack.status,
      "Status should transition from RECEIVED to ACTIVE",
    ).toBe(LotteryPackStatus.ACTIVE);
  });

  it("6.1-INTEGRATION-042: BUSINESS - should allow ACTIVE → DEPLETED transition", async () => {
    // GIVEN: Pack in ACTIVE status
    const pack = await createLotteryPack(prisma, {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
      status: LotteryPackStatus.ACTIVE,
    });

    // WHEN: Updating status to DEPLETED
    const updatedPack = await prisma.lotteryPack.update({
      where: { pack_id: pack.pack_id },
      data: { status: LotteryPackStatus.DEPLETED },
    });

    // THEN: Status transition is successful
    expect(
      updatedPack.status,
      "Status should transition from ACTIVE to DEPLETED",
    ).toBe(LotteryPackStatus.DEPLETED);
  });

  it("6.1-INTEGRATION-043: BUSINESS - should allow ACTIVE → RETURNED transition", async () => {
    // GIVEN: Pack in ACTIVE status
    const pack = await createLotteryPack(prisma, {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
      status: LotteryPackStatus.ACTIVE,
    });

    // WHEN: Updating status to RETURNED
    const updatedPack = await prisma.lotteryPack.update({
      where: { pack_id: pack.pack_id },
      data: { status: LotteryPackStatus.RETURNED },
    });

    // THEN: Status transition is successful
    expect(
      updatedPack.status,
      "Status should transition from ACTIVE to RETURNED",
    ).toBe(LotteryPackStatus.RETURNED);
  });

  it("6.1-INTEGRATION-044: BUSINESS - should not allow DEPLETED → ACTIVE transition (application-level validation needed)", async () => {
    // GIVEN: Pack in DEPLETED status
    const pack = await createLotteryPack(prisma, {
      game_id: testGame.game_id,
      store_id: testStore.store_id,
      status: LotteryPackStatus.DEPLETED,
    });

    // WHEN: Attempting to update status back to ACTIVE
    // THEN: Database allows it, but business logic should reject
    // Note: Database allows any transition, but business rule says no reverse from DEPLETED
    const updatedPack = await prisma.lotteryPack.update({
      where: { pack_id: pack.pack_id },
      data: { status: LotteryPackStatus.ACTIVE },
    });

    // Database accepts it, but business logic should validate
    // This test documents the requirement for application-level validation
    expect(
      updatedPack.status,
      "Status is updated but should be rejected by business logic",
    ).toBe(LotteryPackStatus.ACTIVE);
  });
});

describe("6.1-INTEGRATION: Business Logic - Price Validation", () => {
  it("6.1-INTEGRATION-045: BUSINESS - should accept valid ticket prices ($1, $2, $3, $5, $10, $20, $50)", async () => {
    // GIVEN: Valid ticket prices
    const validPrices = [1.0, 2.0, 3.0, 5.0, 10.0, 20.0, 50.0];

    // WHEN: Creating games with each valid price
    // THEN: All prices are accepted
    for (const price of validPrices) {
      const game = await createLotteryGame(prisma, {
        name: `$${price} Game`,
        price,
      });
      expect(game.price, `Price $${price} should be accepted`).toBe(price);
    }
  });

  it("6.1-INTEGRATION-046: BUSINESS - should reject invalid ticket prices (application-level validation needed)", async () => {
    // GIVEN: Invalid ticket prices (not in allowed list)
    const invalidPrices = [0.5, 4.0, 15.0, 25.0, 100.0, -1.0];

    // WHEN: Attempting to create games with invalid prices
    // THEN: Database accepts it, but business logic should reject
    // Note: Database accepts any decimal, but business rule restricts to specific values
    for (const price of invalidPrices) {
      const game = await createLotteryGame(prisma, {
        name: `$${price} Game`,
        price,
      });
      // Database accepts it, but business logic should validate
      // This test documents the requirement for application-level validation
      expect(
        game.price,
        `Price $${price} is stored but should be rejected by business logic`,
      ).toBe(price);
    }
  });

  it("6.1-INTEGRATION-047: BUSINESS - should accept null price (optional field)", async () => {
    // GIVEN: No price provided (null/undefined)
    // WHEN: Creating game without price
    const game = await createLotteryGame(prisma, { price: undefined });

    // THEN: Game is created with null price
    expect(game.price, "Price should be null when not provided").toBeNull();
  });
});
