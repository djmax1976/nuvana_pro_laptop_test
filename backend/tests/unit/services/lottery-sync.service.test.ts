/**
 * Lottery Sync Service Unit Tests
 *
 * Enterprise-grade test suite for lottery sync service business logic.
 * Tests all service methods for:
 * - Correct behavior with valid inputs
 * - Proper error handling
 * - Tenant isolation (DB-006)
 * - Session validation
 * - State transitions and invariants
 *
 * @module tests/unit/services/lottery-sync.service.test
 */

import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  createMockPrismaClient,
  createTestUuid,
  createTestLotteryGame,
  createTestLotteryBin,
  createTestLotteryPack,
  createTestSyncSession,
  createTestLotteryBusinessDay,
  createTestShift,
  createTestLotteryVariance,
  createTestApiKeyIdentity,
  createTestAuditContext,
  assertTenantIsolation,
  type MockPrismaClient,
} from "../../utils/prisma-mock";

// =============================================================================
// Mock Setup
// =============================================================================

// Mock the prisma client
vi.mock("../../../src/utils/db", () => ({
  prisma: createMockPrismaClient(),
}));

// Mock the audit service
vi.mock("../../../src/services/api-key/api-key-audit.service", () => ({
  apiKeyAuditService: {
    logOperation: vi.fn().mockResolvedValue(undefined),
    logCustomEvent: vi.fn().mockResolvedValue(undefined),
  },
}));

// Import after mocking
import { lotterySyncService } from "../../../src/services/api-key/lottery-sync.service";
import { prisma } from "../../../src/utils/db";

// =============================================================================
// Test Constants
// =============================================================================

const TEST_STORE_ID = createTestUuid("store", 1);
const TEST_API_KEY_ID = createTestUuid("apikey", 1);
const TEST_SESSION_ID = createTestUuid("session", 1);
const TEST_GAME_ID = createTestUuid("game", 1);
const TEST_BIN_ID = createTestUuid("bin", 1);
const TEST_PACK_ID = createTestUuid("pack", 1);
const TEST_SHIFT_ID = createTestUuid("shift", 1);
const TEST_DAY_ID = createTestUuid("day", 1);
const TEST_EMPLOYEE_ID = createTestUuid("employee", 1);

// =============================================================================
// Helper Functions
// =============================================================================

function getMockPrisma(): MockPrismaClient {
  return prisma as unknown as MockPrismaClient;
}

function createValidIdentity() {
  return createTestApiKeyIdentity({
    apiKeyId: TEST_API_KEY_ID,
    storeId: TEST_STORE_ID,
  });
}

function createValidAuditContext() {
  return createTestAuditContext({
    apiKeyId: TEST_API_KEY_ID,
    sessionId: TEST_SESSION_ID,
  });
}

// =============================================================================
// Session Validation Tests
// =============================================================================

describe("LotterySyncService - Session Validation", () => {
  let mockPrisma: MockPrismaClient;

  beforeEach(() => {
    mockPrisma = getMockPrisma();
    vi.clearAllMocks();
  });

  describe("validateSyncSession", () => {
    it("should return session data for valid active session", async () => {
      const validSession = createTestSyncSession({
        sync_session_id: TEST_SESSION_ID,
        api_key_id: TEST_API_KEY_ID,
      });

      mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(validSession);

      const result = await lotterySyncService.validateSyncSession(
        TEST_SESSION_ID,
        TEST_API_KEY_ID,
      );

      expect(result.syncSessionId).toBe(TEST_SESSION_ID);
      expect(result.storeId).toBe(validSession.api_key.store_id);
    });

    it("should throw INVALID_SESSION for non-existent session", async () => {
      mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(null);

      await expect(
        lotterySyncService.validateSyncSession(
          TEST_SESSION_ID,
          TEST_API_KEY_ID,
        ),
      ).rejects.toThrow("INVALID_SESSION: Sync session not found");
    });

    it("should throw INVALID_SESSION for session belonging to different API key", async () => {
      const sessionWithDifferentKey = createTestSyncSession({
        sync_session_id: TEST_SESSION_ID,
        api_key_id: createTestUuid("apikey", 999), // Different API key
      });

      mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(
        sessionWithDifferentKey,
      );

      await expect(
        lotterySyncService.validateSyncSession(
          TEST_SESSION_ID,
          TEST_API_KEY_ID,
        ),
      ).rejects.toThrow(
        "INVALID_SESSION: Session does not belong to this API key",
      );
    });

    it("should throw INVALID_SESSION for expired session", async () => {
      const expiredSession = createTestSyncSession({
        sync_session_id: TEST_SESSION_ID,
        api_key_id: TEST_API_KEY_ID,
        // Set session_started_at to 25 hours ago to exceed MAX_SESSION_AGE_MS (24 hours)
        session_started_at: new Date(Date.now() - 25 * 60 * 60 * 1000),
      });

      mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(expiredSession);

      await expect(
        lotterySyncService.validateSyncSession(
          TEST_SESSION_ID,
          TEST_API_KEY_ID,
        ),
      ).rejects.toThrow("INVALID_SESSION: Sync session has expired");
    });

    it("should throw INVALID_SESSION for inactive session status", async () => {
      const inactiveSession = createTestSyncSession({
        sync_session_id: TEST_SESSION_ID,
        api_key_id: TEST_API_KEY_ID,
        sync_status: "COMPLETED", // Not ACTIVE
      });

      mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(
        inactiveSession,
      );

      await expect(
        lotterySyncService.validateSyncSession(
          TEST_SESSION_ID,
          TEST_API_KEY_ID,
        ),
      ).rejects.toThrow("INVALID_SESSION: Sync session is not active");
    });
  });
});

// =============================================================================
// PULL Endpoints - Games Tests
// =============================================================================

const TEST_STATE_ID = createTestUuid("state", 1);

describe("LotterySyncService - Get Games", () => {
  let mockPrisma: MockPrismaClient;

  beforeEach(() => {
    mockPrisma = getMockPrisma();
    vi.clearAllMocks();
  });

  describe("getGamesForSync", () => {
    it("should return games for the store with proper tenant isolation", async () => {
      const games = [
        createTestLotteryGame({
          game_id: createTestUuid("game", 1),
          store_id: TEST_STORE_ID,
        }),
        createTestLotteryGame({
          game_id: createTestUuid("game", 2),
          store_id: TEST_STORE_ID,
        }),
      ];

      mockPrisma.lotteryGame.count.mockResolvedValue(2);
      mockPrisma.lotteryGame.findMany.mockResolvedValue(games);

      const result = await lotterySyncService.getGamesForSync(
        TEST_STORE_ID,
        TEST_STATE_ID,
      );

      expect(result.records).toHaveLength(2);
      expect(result.total_count).toBe(2);
      expect(result.has_more).toBe(false);
      expect(result.server_time).toBeDefined();

      // Verify tenant isolation via OR clause (state-scoped or store-scoped)
      const findManyCall = mockPrisma.lotteryGame.findMany.mock.calls[0][0];
      expect(findManyCall.where.OR).toBeDefined();
    });

    it("should apply sinceTimestamp filter correctly for delta sync", async () => {
      const timestamp = new Date("2024-01-15T00:00:00Z");
      mockPrisma.lotteryGame.count.mockResolvedValue(0);
      mockPrisma.lotteryGame.findMany.mockResolvedValue([]);

      await lotterySyncService.getGamesForSync(TEST_STORE_ID, TEST_STATE_ID, {
        sinceTimestamp: timestamp,
      });

      const findManyCall = mockPrisma.lotteryGame.findMany.mock.calls[0][0];
      expect(findManyCall.where.updated_at).toEqual({ gt: timestamp });
      // Delta sync should NOT filter by status - returns all changed games
      expect(findManyCall.where.status).toBeUndefined();
    });

    /**
     * CRITICAL TEST: Full sync returns ALL games including inactive
     *
     * Business Requirement: Local desktop apps need complete game catalog
     * including inactive games so they can update their local database
     * when games are deactivated in the cloud.
     *
     * Change Date: 2025-01-XX
     * Reason: Local app was not receiving inactive game status updates
     */
    it("should return ALL games including inactive on full sync (no sinceTimestamp)", async () => {
      // GIVEN: Games with different statuses
      const activeGame = createTestLotteryGame({
        game_id: createTestUuid("game", 1),
        store_id: TEST_STORE_ID,
        status: "ACTIVE",
      });
      const inactiveGame = createTestLotteryGame({
        game_id: createTestUuid("game", 2),
        store_id: TEST_STORE_ID,
        status: "INACTIVE",
      });
      const discontinuedGame = createTestLotteryGame({
        game_id: createTestUuid("game", 3),
        store_id: TEST_STORE_ID,
        status: "DISCONTINUED",
      });

      mockPrisma.lotteryGame.count.mockResolvedValue(3);
      mockPrisma.lotteryGame.findMany.mockResolvedValue([
        activeGame,
        inactiveGame,
        discontinuedGame,
      ]);

      // WHEN: Full sync (no sinceTimestamp)
      const result = await lotterySyncService.getGamesForSync(
        TEST_STORE_ID,
        TEST_STATE_ID,
      );

      // THEN: No status filter is applied - all games returned
      const findManyCall = mockPrisma.lotteryGame.findMany.mock.calls[0][0];
      expect(findManyCall.where.status).toBeUndefined();
      expect(result.records).toHaveLength(3);
    });

    /**
     * Test: Inactive games include status field in sync response
     *
     * Enterprise Requirement: Local apps need the status field to know
     * which games are inactive and update their local database accordingly.
     */
    it("should include game status in sync response for all games", async () => {
      const inactiveGame = createTestLotteryGame({
        game_id: TEST_GAME_ID,
        store_id: TEST_STORE_ID,
        game_code: "0001",
        name: "Inactive Game",
        status: "INACTIVE",
      });

      mockPrisma.lotteryGame.count.mockResolvedValue(1);
      mockPrisma.lotteryGame.findMany.mockResolvedValue([inactiveGame]);

      const result = await lotterySyncService.getGamesForSync(
        TEST_STORE_ID,
        TEST_STATE_ID,
      );

      // THEN: Response includes status field
      expect(result.records[0].status).toBe("INACTIVE");
    });

    /**
     * Test: Delta sync returns inactive games that were recently changed
     *
     * Business Rule: When a game is marked inactive, the local app needs
     * to receive this update during delta sync.
     */
    it("should return inactive games in delta sync when updated after timestamp", async () => {
      const timestamp = new Date("2024-01-15T00:00:00Z");
      const recentlyInactivatedGame = createTestLotteryGame({
        game_id: TEST_GAME_ID,
        store_id: TEST_STORE_ID,
        status: "INACTIVE",
        updated_at: new Date("2024-01-16T00:00:00Z"), // After timestamp
      });

      mockPrisma.lotteryGame.count.mockResolvedValue(1);
      mockPrisma.lotteryGame.findMany.mockResolvedValue([
        recentlyInactivatedGame,
      ]);

      const result = await lotterySyncService.getGamesForSync(
        TEST_STORE_ID,
        TEST_STATE_ID,
        { sinceTimestamp: timestamp },
      );

      // THEN: Inactive game is returned in delta sync
      expect(result.records).toHaveLength(1);
      expect(result.records[0].status).toBe("INACTIVE");
    });

    /**
     * BACKWARD COMPATIBILITY: includeInactive parameter is now ignored
     *
     * Note: The includeInactive parameter is kept for API compatibility
     * but no longer affects behavior - all games are always returned.
     */
    it("should ignore includeInactive parameter (always returns all games)", async () => {
      mockPrisma.lotteryGame.count.mockResolvedValue(0);
      mockPrisma.lotteryGame.findMany.mockResolvedValue([]);

      // WHEN: Called with includeInactive=false (would have filtered before)
      await lotterySyncService.getGamesForSync(TEST_STORE_ID, TEST_STATE_ID, {
        includeInactive: false,
      });

      // THEN: No status filter is applied (parameter is ignored)
      const findManyCall = mockPrisma.lotteryGame.findMany.mock.calls[0][0];
      expect(findManyCall.where.status).toBeUndefined();
    });

    it("should handle pagination with has_more flag", async () => {
      const games = Array.from({ length: 101 }, (_, i) =>
        createTestLotteryGame({
          game_id: createTestUuid("game", i + 1),
          store_id: TEST_STORE_ID,
        }),
      );

      mockPrisma.lotteryGame.count.mockResolvedValue(101);
      mockPrisma.lotteryGame.findMany.mockResolvedValue(games);

      const result = await lotterySyncService.getGamesForSync(
        TEST_STORE_ID,
        TEST_STATE_ID,
        {
          limit: 100,
        },
      );

      expect(result.has_more).toBe(true);
      expect(result.records).toHaveLength(100);
      expect(result.next_cursor).toBeDefined();
    });

    it("should respect maximum limit of 500", async () => {
      mockPrisma.lotteryGame.count.mockResolvedValue(0);
      mockPrisma.lotteryGame.findMany.mockResolvedValue([]);

      await lotterySyncService.getGamesForSync(TEST_STORE_ID, TEST_STATE_ID, {
        limit: 1000, // Exceeds max
      });

      const findManyCall = mockPrisma.lotteryGame.findMany.mock.calls[0][0];
      expect(findManyCall.take).toBe(501); // 500 + 1 for has_more check
    });

    it("should map game data correctly to sync record format", async () => {
      const game = createTestLotteryGame({
        game_id: TEST_GAME_ID,
        store_id: TEST_STORE_ID,
        game_code: "0001",
        name: "Test Game",
        price: "5.00",
        pack_value: "300.00",
        tickets_per_pack: 60,
      });

      mockPrisma.lotteryGame.count.mockResolvedValue(1);
      mockPrisma.lotteryGame.findMany.mockResolvedValue([game]);

      const result = await lotterySyncService.getGamesForSync(
        TEST_STORE_ID,
        TEST_STATE_ID,
      );

      expect(result.records[0]).toMatchObject({
        game_id: TEST_GAME_ID,
        game_code: "0001",
        name: "Test Game",
        // Decimal values are converted to strings without trailing zeros
        price: expect.stringMatching(/^5(\.00)?$/),
        pack_value: expect.stringMatching(/^300(\.00)?$/),
        tickets_per_pack: 60,
      });
    });
  });
});

// =============================================================================
// PULL Endpoints - Bins Tests
// =============================================================================

describe("LotterySyncService - Get Bins", () => {
  let mockPrisma: MockPrismaClient;

  beforeEach(() => {
    mockPrisma = getMockPrisma();
    vi.clearAllMocks();
  });

  describe("getBinsForSync", () => {
    it("should return bins for the store with proper tenant isolation", async () => {
      const bins = [
        createTestLotteryBin({
          bin_id: createTestUuid("bin", 1),
          store_id: TEST_STORE_ID,
        }),
        createTestLotteryBin({
          bin_id: createTestUuid("bin", 2),
          store_id: TEST_STORE_ID,
        }),
      ];

      mockPrisma.lotteryBin.count.mockResolvedValue(2);
      mockPrisma.lotteryBin.findMany.mockResolvedValue(bins);

      const result = await lotterySyncService.getBinsForSync(TEST_STORE_ID);

      expect(result.records).toHaveLength(2);
      assertTenantIsolation(mockPrisma.lotteryBin.findMany, TEST_STORE_ID);
    });

    it("should order bins by display_order", async () => {
      mockPrisma.lotteryBin.count.mockResolvedValue(0);
      mockPrisma.lotteryBin.findMany.mockResolvedValue([]);

      await lotterySyncService.getBinsForSync(TEST_STORE_ID);

      const findManyCall = mockPrisma.lotteryBin.findMany.mock.calls[0][0];
      expect(findManyCall.orderBy).toContainEqual({ display_order: "asc" });
    });
  });
});

// =============================================================================
// PULL Endpoints - Packs Tests
// =============================================================================

describe("LotterySyncService - Get Packs", () => {
  let mockPrisma: MockPrismaClient;

  beforeEach(() => {
    mockPrisma = getMockPrisma();
    vi.clearAllMocks();
  });

  describe("getPacksForSync", () => {
    it("should return packs filtered by status", async () => {
      const receivedPacks = [
        createTestLotteryPack({
          pack_id: createTestUuid("pack", 1),
          status: "RECEIVED",
        }),
      ];

      mockPrisma.lotteryPack.count.mockResolvedValue(1);
      mockPrisma.lotteryPack.findMany.mockResolvedValue(receivedPacks);

      const result = await lotterySyncService.getPacksForSync(
        TEST_STORE_ID,
        "RECEIVED",
      );

      const findManyCall = mockPrisma.lotteryPack.findMany.mock.calls[0][0];
      expect(findManyCall.where.status).toBe("RECEIVED");
      expect(result.records).toHaveLength(1);
    });

    it("should filter by bin_id when provided", async () => {
      mockPrisma.lotteryPack.count.mockResolvedValue(0);
      mockPrisma.lotteryPack.findMany.mockResolvedValue([]);

      await lotterySyncService.getPacksForSync(TEST_STORE_ID, "ACTIVE", {
        binId: TEST_BIN_ID,
      });

      const findManyCall = mockPrisma.lotteryPack.findMany.mock.calls[0][0];
      expect(findManyCall.where.current_bin_id).toBe(TEST_BIN_ID);
    });

    it("should filter by game_id when provided", async () => {
      mockPrisma.lotteryPack.count.mockResolvedValue(0);
      mockPrisma.lotteryPack.findMany.mockResolvedValue([]);

      await lotterySyncService.getPacksForSync(TEST_STORE_ID, "ACTIVE", {
        gameId: TEST_GAME_ID,
      });

      const findManyCall = mockPrisma.lotteryPack.findMany.mock.calls[0][0];
      expect(findManyCall.where.game_id).toBe(TEST_GAME_ID);
    });

    it("should include game and bin relations", async () => {
      mockPrisma.lotteryPack.count.mockResolvedValue(0);
      mockPrisma.lotteryPack.findMany.mockResolvedValue([]);

      await lotterySyncService.getPacksForSync(TEST_STORE_ID, "ACTIVE");

      const findManyCall = mockPrisma.lotteryPack.findMany.mock.calls[0][0];
      expect(findManyCall.include.game).toBeDefined();
      expect(findManyCall.include.bin).toBeDefined();
    });
  });
});

// =============================================================================
// PUSH Endpoints - Pack Receive Tests
// =============================================================================

describe("LotterySyncService - Pack Receive", () => {
  let mockPrisma: MockPrismaClient;

  beforeEach(() => {
    mockPrisma = getMockPrisma();
    vi.clearAllMocks();
  });

  describe("receivePack", () => {
    const validInput = {
      game_code: "0001",
      pack_number: "PKG001",
      serial_start: "000000001",
      serial_end: "000000060",
    };

    it("should create a new pack with RECEIVED status", async () => {
      const game = createTestLotteryGame({
        game_id: TEST_GAME_ID,
        store_id: TEST_STORE_ID,
        game_code: "0001",
      });

      const createdPack = createTestLotteryPack({
        pack_id: TEST_PACK_ID,
        store_id: TEST_STORE_ID,
        game_id: TEST_GAME_ID,
        status: "RECEIVED",
      });

      mockPrisma.lotteryGame.findFirst.mockResolvedValue(game);
      mockPrisma.lotteryPack.findUnique.mockResolvedValue(null); // No duplicate
      mockPrisma.lotteryPack.create.mockResolvedValue(createdPack);

      const result = await lotterySyncService.receivePack(
        TEST_STORE_ID,
        TEST_STATE_ID,
        validInput,
        createValidAuditContext(),
      );

      expect(result.success).toBe(true);
      expect(result.pack).toBeDefined();
      expect(mockPrisma.lotteryPack.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            store_id: TEST_STORE_ID,
            game_id: TEST_GAME_ID,
            status: "RECEIVED",
          }),
        }),
      );
    });

    it("should throw GAME_NOT_FOUND for invalid game code", async () => {
      mockPrisma.lotteryGame.findFirst.mockResolvedValue(null);

      await expect(
        lotterySyncService.receivePack(
          TEST_STORE_ID,
          TEST_STATE_ID,
          validInput,
          createValidAuditContext(),
        ),
      ).rejects.toThrow("GAME_NOT_FOUND");
    });

    it("should throw DUPLICATE_PACK for existing pack number", async () => {
      const game = createTestLotteryGame({ store_id: TEST_STORE_ID });
      const existingPack = createTestLotteryPack({ pack_number: "PKG001" });

      mockPrisma.lotteryGame.findFirst.mockResolvedValue(game);
      mockPrisma.lotteryPack.findUnique.mockResolvedValue(existingPack);

      await expect(
        lotterySyncService.receivePack(
          TEST_STORE_ID,
          TEST_STATE_ID,
          validInput,
          createValidAuditContext(),
        ),
      ).rejects.toThrow("DUPLICATE_PACK");
    });

    it("should enforce tenant isolation when looking up games", async () => {
      const game = createTestLotteryGame({
        store_id: TEST_STORE_ID,
        game_id: TEST_GAME_ID,
      });

      mockPrisma.lotteryGame.findFirst.mockResolvedValue(game);
      mockPrisma.lotteryPack.findUnique.mockResolvedValue(null);
      mockPrisma.lotteryPack.create.mockResolvedValue(
        createTestLotteryPack({ store_id: TEST_STORE_ID }),
      );

      await lotterySyncService.receivePack(
        TEST_STORE_ID,
        TEST_STATE_ID,
        validInput,
        createValidAuditContext(),
      );

      // Game lookup first tries state_id, then store_id
      // First call should check state_id
      const gameCheckCall = mockPrisma.lotteryGame.findFirst.mock.calls[0][0];
      expect(gameCheckCall.where.state_id).toBe(TEST_STATE_ID);
    });
  });

  describe("receivePacksBatch", () => {
    it("should process multiple packs and return results", async () => {
      const game = createTestLotteryGame({
        store_id: TEST_STORE_ID,
        game_code: "0001",
      });
      const packs = [
        {
          game_code: "0001",
          pack_number: "PKG001",
          serial_start: "000000001",
          serial_end: "000000060",
          local_id: "local1",
        },
        {
          game_code: "0001",
          pack_number: "PKG002",
          serial_start: "000000061",
          serial_end: "000000120",
          local_id: "local2",
        },
      ];

      mockPrisma.lotteryGame.findFirst.mockResolvedValue(game);
      mockPrisma.lotteryPack.findUnique.mockResolvedValue(null);
      mockPrisma.lotteryPack.create.mockImplementation(({ data }) =>
        Promise.resolve(
          createTestLotteryPack({ pack_number: data.pack_number }),
        ),
      );

      const result = await lotterySyncService.receivePacksBatch(
        TEST_STORE_ID,
        TEST_STATE_ID,
        { packs },
        createValidAuditContext(),
      );

      expect(result.total_processed).toBe(2);
      expect(result.success_count).toBe(2);
      expect(result.failure_count).toBe(0);
    });

    it("should handle partial failures gracefully", async () => {
      const game = createTestLotteryGame({
        store_id: TEST_STORE_ID,
        game_code: "0001",
      });
      const existingPack = createTestLotteryPack({ pack_number: "PKG001" });
      const packs = [
        {
          game_code: "0001",
          pack_number: "PKG001",
          serial_start: "000000001",
          serial_end: "000000060",
          local_id: "local1",
        },
        {
          game_code: "0001",
          pack_number: "PKG002",
          serial_start: "000000061",
          serial_end: "000000120",
          local_id: "local2",
        },
      ];

      mockPrisma.lotteryGame.findFirst.mockResolvedValue(game);
      mockPrisma.lotteryPack.findUnique
        .mockResolvedValueOnce(existingPack) // First pack exists (duplicate)
        .mockResolvedValueOnce(null); // Second pack doesn't exist
      mockPrisma.lotteryPack.create.mockResolvedValue(
        createTestLotteryPack({ pack_number: "PKG002" }),
      );

      const result = await lotterySyncService.receivePacksBatch(
        TEST_STORE_ID,
        TEST_STATE_ID,
        { packs },
        createValidAuditContext(),
      );

      expect(result.success_count).toBe(1);
      expect(result.failure_count).toBe(1);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error_code).toContain("DUPLICATE_PACK");
      expect(result.results[1].success).toBe(true);
    });
  });
});

// =============================================================================
// PUSH Endpoints - Pack Activate Tests
// =============================================================================

describe("LotterySyncService - Pack Activate", () => {
  let mockPrisma: MockPrismaClient;

  beforeEach(() => {
    mockPrisma = getMockPrisma();
    vi.clearAllMocks();
  });

  describe("activatePack", () => {
    const validInput = {
      pack_id: TEST_PACK_ID,
      bin_id: TEST_BIN_ID,
      pack_number: "PKG001",
      game_code: "0001",
      serial_start: "000000001",
      serial_end: "000000060",
    };

    it("should activate a RECEIVED pack", async () => {
      const receivedPack = createTestLotteryPack({
        pack_id: TEST_PACK_ID,
        store_id: TEST_STORE_ID,
        status: "RECEIVED",
      });
      const bin = createTestLotteryBin({
        bin_id: TEST_BIN_ID,
        store_id: TEST_STORE_ID,
      });
      const activatedPack = createTestLotteryPack({
        ...receivedPack,
        status: "ACTIVE",
        current_bin_id: TEST_BIN_ID,
        bin: { name: bin.name },
      });

      // Service checks bin FIRST, then pack
      mockPrisma.lotteryBin.findFirst.mockResolvedValue(bin);
      mockPrisma.lotteryPack.findFirst.mockResolvedValue(receivedPack);
      mockPrisma.lotteryPack.update.mockResolvedValue(activatedPack);
      mockPrisma.lotteryPackBinHistory.create.mockResolvedValue({});

      const result = await lotterySyncService.activatePack(
        TEST_STORE_ID,
        TEST_STATE_ID,
        validInput,
        createValidAuditContext(),
      );

      expect(result.success).toBe(true);
      expect(mockPrisma.lotteryPack.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "ACTIVE",
            current_bin_id: TEST_BIN_ID,
          }),
        }),
      );
    });

    it("should create pack when it does not exist (activate via create)", async () => {
      // When pack doesn't exist, service creates it then activates
      const bin = createTestLotteryBin({
        bin_id: TEST_BIN_ID,
        store_id: TEST_STORE_ID,
      });
      const game = createTestLotteryGame({
        game_id: TEST_GAME_ID,
        store_id: TEST_STORE_ID,
        game_code: "0001",
        status: "ACTIVE",
      });
      const createdPack = createTestLotteryPack({
        pack_id: TEST_PACK_ID,
        store_id: TEST_STORE_ID,
        status: "RECEIVED",
      });
      const activatedPack = createTestLotteryPack({
        ...createdPack,
        status: "ACTIVE",
        current_bin_id: TEST_BIN_ID,
        bin: { name: bin.name },
      });

      mockPrisma.lotteryBin.findFirst.mockResolvedValue(bin);
      mockPrisma.lotteryPack.findFirst.mockResolvedValue(null);
      mockPrisma.lotteryPack.findUnique.mockResolvedValue(null);
      mockPrisma.lotteryGame.findFirst.mockResolvedValue(game);
      mockPrisma.lotteryPack.create.mockResolvedValue(createdPack);
      mockPrisma.lotteryPack.update.mockResolvedValue(activatedPack);
      mockPrisma.lotteryPackBinHistory.create.mockResolvedValue({});

      const result = await lotterySyncService.activatePack(
        TEST_STORE_ID,
        TEST_STATE_ID,
        validInput,
        createValidAuditContext(),
      );

      expect(result.success).toBe(true);
      expect(mockPrisma.lotteryPack.create).toHaveBeenCalled();
    });

    it("should throw ALREADY_ACTIVE for pack active in different bin", async () => {
      const bin = createTestLotteryBin({
        bin_id: TEST_BIN_ID,
        store_id: TEST_STORE_ID,
      });
      const activePack = createTestLotteryPack({
        pack_id: TEST_PACK_ID,
        store_id: TEST_STORE_ID,
        status: "ACTIVE",
        current_bin_id: createTestUuid("bin", 999), // Different bin
      });

      mockPrisma.lotteryBin.findFirst.mockResolvedValue(bin);
      mockPrisma.lotteryPack.findFirst.mockResolvedValue(activePack);

      await expect(
        lotterySyncService.activatePack(
          TEST_STORE_ID,
          TEST_STATE_ID,
          validInput,
          createValidAuditContext(),
        ),
      ).rejects.toThrow("ALREADY_ACTIVE");
    });

    it("should throw BIN_NOT_FOUND for invalid bin", async () => {
      // Service checks bin FIRST - this test verifies that behavior
      mockPrisma.lotteryBin.findFirst.mockResolvedValue(null);

      await expect(
        lotterySyncService.activatePack(
          TEST_STORE_ID,
          TEST_STATE_ID,
          validInput,
          createValidAuditContext(),
        ),
      ).rejects.toThrow("BIN_NOT_FOUND");
    });

    it("should create bin history entry on activation", async () => {
      const receivedPack = createTestLotteryPack({
        pack_id: TEST_PACK_ID,
        store_id: TEST_STORE_ID,
        status: "RECEIVED",
      });
      const bin = createTestLotteryBin({
        bin_id: TEST_BIN_ID,
        store_id: TEST_STORE_ID,
      });
      const activatedPack = createTestLotteryPack({
        pack_id: TEST_PACK_ID,
        status: "ACTIVE",
        current_bin_id: TEST_BIN_ID,
        bin: { name: bin.name },
      });

      mockPrisma.lotteryBin.findFirst.mockResolvedValue(bin);
      mockPrisma.lotteryPack.findFirst.mockResolvedValue(receivedPack);
      mockPrisma.lotteryPack.update.mockResolvedValue(activatedPack);
      mockPrisma.lotteryPackBinHistory.create.mockResolvedValue({});

      await lotterySyncService.activatePack(
        TEST_STORE_ID,
        TEST_STATE_ID,
        validInput,
        createValidAuditContext(),
      );

      expect(mockPrisma.lotteryPackBinHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pack_id: TEST_PACK_ID,
            bin_id: TEST_BIN_ID,
            reason: "ACTIVATION",
          }),
        }),
      );
    });
  });
});

// =============================================================================
// PUSH Endpoints - Pack Deplete Tests
// =============================================================================

describe("LotterySyncService - Pack Deplete", () => {
  let mockPrisma: MockPrismaClient;

  beforeEach(() => {
    mockPrisma = getMockPrisma();
    vi.clearAllMocks();
  });

  describe("depletePack", () => {
    const validInput = {
      pack_id: TEST_PACK_ID,
      final_serial: "000000060",
      depletion_reason: "SHIFT_CLOSE" as const,
    };

    it("should deplete an ACTIVE pack", async () => {
      const activePack = createTestLotteryPack({
        pack_id: TEST_PACK_ID,
        store_id: TEST_STORE_ID,
        status: "ACTIVE",
      });
      const depletedPack = createTestLotteryPack({
        ...activePack,
        status: "DEPLETED",
      });

      mockPrisma.lotteryPack.findFirst.mockResolvedValue(activePack);
      mockPrisma.lotteryPack.update.mockResolvedValue(depletedPack);

      const result = await lotterySyncService.depletePack(
        TEST_STORE_ID,
        validInput,
        createValidAuditContext(),
      );

      expect(result.success).toBe(true);
      expect(mockPrisma.lotteryPack.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "DEPLETED",
            depletion_reason: "SHIFT_CLOSE",
          }),
        }),
      );
    });

    it("should throw INVALID_STATUS for non-ACTIVE pack", async () => {
      const receivedPack = createTestLotteryPack({
        pack_id: TEST_PACK_ID,
        store_id: TEST_STORE_ID,
        status: "RECEIVED",
      });

      mockPrisma.lotteryPack.findFirst.mockResolvedValue(receivedPack);

      await expect(
        lotterySyncService.depletePack(
          TEST_STORE_ID,
          validInput,
          createValidAuditContext(),
        ),
      ).rejects.toThrow("INVALID_STATUS");
    });
  });
});

// =============================================================================
// PUSH Endpoints - Pack Return Tests
// =============================================================================

describe("LotterySyncService - Pack Return", () => {
  let mockPrisma: MockPrismaClient;

  beforeEach(() => {
    mockPrisma = getMockPrisma();
    vi.clearAllMocks();
  });

  describe("returnPack", () => {
    const validInput = {
      pack_id: TEST_PACK_ID,
      return_reason: "DAMAGED" as const,
    };

    it("should return a pack with any non-RETURNED status", async () => {
      const activePack = createTestLotteryPack({
        pack_id: TEST_PACK_ID,
        store_id: TEST_STORE_ID,
        status: "ACTIVE",
      });
      const returnedPack = createTestLotteryPack({
        ...activePack,
        status: "RETURNED",
      });

      mockPrisma.lotteryPack.findFirst.mockResolvedValue(activePack);
      mockPrisma.lotteryPack.update.mockResolvedValue(returnedPack);

      const result = await lotterySyncService.returnPack(
        TEST_STORE_ID,
        validInput,
        createValidAuditContext(),
      );

      expect(result.success).toBe(true);
    });

    it("should throw ALREADY_RETURNED for pack already returned", async () => {
      const returnedPack = createTestLotteryPack({
        pack_id: TEST_PACK_ID,
        store_id: TEST_STORE_ID,
        status: "RETURNED",
      });

      mockPrisma.lotteryPack.findFirst.mockResolvedValue(returnedPack);

      await expect(
        lotterySyncService.returnPack(
          TEST_STORE_ID,
          validInput,
          createValidAuditContext(),
        ),
      ).rejects.toThrow("ALREADY_RETURNED");
    });

    it("should calculate return sales amount when tickets sold provided", async () => {
      const activePack = createTestLotteryPack({
        pack_id: TEST_PACK_ID,
        store_id: TEST_STORE_ID,
        status: "ACTIVE",
      });
      const packWithGame = {
        ...activePack,
        game: { price: new Decimal("5.00") },
      };

      mockPrisma.lotteryPack.findFirst.mockResolvedValue(activePack);
      mockPrisma.lotteryPack.findUnique.mockResolvedValue(packWithGame);
      mockPrisma.lotteryPack.update.mockResolvedValue(
        createTestLotteryPack({ status: "RETURNED" }),
      );

      await lotterySyncService.returnPack(
        TEST_STORE_ID,
        { ...validInput, tickets_sold_on_return: 30 },
        createValidAuditContext(),
      );

      const updateCall = mockPrisma.lotteryPack.update.mock.calls[0][0];
      expect(updateCall.data.return_sales_amount).toBeDefined();
    });
  });
});

// =============================================================================
// Day Close Workflow Tests
// =============================================================================

describe("LotterySyncService - Day Close Workflow", () => {
  let mockPrisma: MockPrismaClient;

  beforeEach(() => {
    mockPrisma = getMockPrisma();
    vi.clearAllMocks();
  });

  describe("prepareDayClose", () => {
    const validInput = {
      day_id: TEST_DAY_ID,
      closings: [{ pack_id: TEST_PACK_ID, ending_serial: "000000045" }],
      initiated_by: TEST_EMPLOYEE_ID,
    };

    it("should transition day from OPEN to PENDING_CLOSE", async () => {
      const openDay = createTestLotteryBusinessDay({
        day_id: TEST_DAY_ID,
        store_id: TEST_STORE_ID,
        status: "OPEN",
      });

      mockPrisma.lotteryBusinessDay.findFirst.mockResolvedValue(openDay);
      mockPrisma.lotteryPack.findFirst.mockResolvedValue(
        createTestLotteryPack({ status: "ACTIVE", store_id: TEST_STORE_ID }),
      );
      mockPrisma.lotteryBusinessDay.update.mockResolvedValue({
        ...openDay,
        status: "PENDING_CLOSE",
      });

      const result = await lotterySyncService.prepareDayClose(
        TEST_STORE_ID,
        validInput,
        createValidAuditContext(),
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe("PENDING_CLOSE");
      expect(mockPrisma.lotteryBusinessDay.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "PENDING_CLOSE",
          }),
        }),
      );
    });

    it("should throw DAY_NOT_FOUND for non-existent day", async () => {
      mockPrisma.lotteryBusinessDay.findFirst.mockResolvedValue(null);

      await expect(
        lotterySyncService.prepareDayClose(
          TEST_STORE_ID,
          validInput,
          createValidAuditContext(),
        ),
      ).rejects.toThrow("DAY_NOT_FOUND");
    });

    it("should throw INVALID_STATUS for non-OPEN day", async () => {
      const closedDay = createTestLotteryBusinessDay({
        day_id: TEST_DAY_ID,
        store_id: TEST_STORE_ID,
        status: "CLOSED",
      });

      mockPrisma.lotteryBusinessDay.findFirst.mockResolvedValue(closedDay);

      await expect(
        lotterySyncService.prepareDayClose(
          TEST_STORE_ID,
          validInput,
          createValidAuditContext(),
        ),
      ).rejects.toThrow("INVALID_STATUS");
    });
  });

  describe("commitDayClose", () => {
    const validInput = {
      day_id: TEST_DAY_ID,
      closed_by: TEST_EMPLOYEE_ID,
    };

    it("should transition day from PENDING_CLOSE to CLOSED", async () => {
      const pendingDay = createTestLotteryBusinessDay({
        day_id: TEST_DAY_ID,
        store_id: TEST_STORE_ID,
        status: "PENDING_CLOSE",
      });
      pendingDay.pending_close_data = { closings: [] };
      pendingDay.pending_close_expires_at = new Date(Date.now() + 3600000);

      mockPrisma.lotteryBusinessDay.findFirst.mockResolvedValue(pendingDay);
      mockPrisma.lotteryDayPack.createMany.mockResolvedValue({ count: 0 });
      mockPrisma.lotteryBusinessDay.update.mockResolvedValue({
        ...pendingDay,
        status: "CLOSED",
      });

      const result = await lotterySyncService.commitDayClose(
        TEST_STORE_ID,
        validInput,
        createValidAuditContext(),
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe("CLOSED");
    });

    it("should throw INVALID_STATUS for non-PENDING_CLOSE day", async () => {
      const openDay = createTestLotteryBusinessDay({
        day_id: TEST_DAY_ID,
        store_id: TEST_STORE_ID,
        status: "OPEN",
      });

      mockPrisma.lotteryBusinessDay.findFirst.mockResolvedValue(openDay);

      await expect(
        lotterySyncService.commitDayClose(
          TEST_STORE_ID,
          validInput,
          createValidAuditContext(),
        ),
      ).rejects.toThrow("INVALID_STATUS");
    });

    it("should throw EXPIRED for expired pending close", async () => {
      const expiredPendingDay = createTestLotteryBusinessDay({
        day_id: TEST_DAY_ID,
        store_id: TEST_STORE_ID,
        status: "PENDING_CLOSE",
      });
      expiredPendingDay.pending_close_expires_at = new Date(
        Date.now() - 3600000,
      );

      mockPrisma.lotteryBusinessDay.findFirst.mockResolvedValue(
        expiredPendingDay,
      );

      await expect(
        lotterySyncService.commitDayClose(
          TEST_STORE_ID,
          validInput,
          createValidAuditContext(),
        ),
      ).rejects.toThrow("EXPIRED: Pending close has expired");
    });
  });

  describe("cancelDayClose", () => {
    const validInput = {
      day_id: TEST_DAY_ID,
      cancelled_by: TEST_EMPLOYEE_ID,
    };

    it("should transition day from PENDING_CLOSE back to OPEN", async () => {
      const pendingDay = createTestLotteryBusinessDay({
        day_id: TEST_DAY_ID,
        store_id: TEST_STORE_ID,
        status: "PENDING_CLOSE",
      });

      mockPrisma.lotteryBusinessDay.findFirst.mockResolvedValue(pendingDay);
      mockPrisma.lotteryBusinessDay.update.mockResolvedValue({
        ...pendingDay,
        status: "OPEN",
      });

      const result = await lotterySyncService.cancelDayClose(
        TEST_STORE_ID,
        validInput,
        createValidAuditContext(),
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe("OPEN");
    });

    it("should throw INVALID_STATUS for non-PENDING_CLOSE day", async () => {
      const openDay = createTestLotteryBusinessDay({
        day_id: TEST_DAY_ID,
        store_id: TEST_STORE_ID,
        status: "OPEN",
      });

      mockPrisma.lotteryBusinessDay.findFirst.mockResolvedValue(openDay);

      await expect(
        lotterySyncService.cancelDayClose(
          TEST_STORE_ID,
          validInput,
          createValidAuditContext(),
        ),
      ).rejects.toThrow("INVALID_STATUS");
    });
  });
});

// =============================================================================
// Variance Approval Tests
// =============================================================================

describe("LotterySyncService - Variance Approval", () => {
  let mockPrisma: MockPrismaClient;

  beforeEach(() => {
    mockPrisma = getMockPrisma();
    vi.clearAllMocks();
  });

  describe("approveVariance", () => {
    const validInput = {
      variance_id: createTestUuid("variance", 1),
      approved_by: TEST_EMPLOYEE_ID,
    };

    it("should approve unapproved variance", async () => {
      const unapprovedVariance = createTestLotteryVariance({
        variance_id: validInput.variance_id,
        approved_by: null,
      });
      // Include pack relation for mapping
      unapprovedVariance.pack = {
        pack_number: "PKG001",
        game: { game_code: "0001" },
      };

      const approvedVariance = {
        ...unapprovedVariance,
        approved_by: TEST_EMPLOYEE_ID,
        approved_at: new Date(),
      };

      mockPrisma.lotteryVariance.findFirst.mockResolvedValue(
        unapprovedVariance,
      );
      mockPrisma.lotteryVariance.update.mockResolvedValue(approvedVariance);

      const result = await lotterySyncService.approveVariance(
        TEST_STORE_ID,
        validInput,
        createValidAuditContext(),
      );

      expect(result.success).toBe(true);
      expect(mockPrisma.lotteryVariance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            approved_by: TEST_EMPLOYEE_ID,
          }),
        }),
      );
    });

    it("should throw VARIANCE_NOT_FOUND for non-existent variance", async () => {
      mockPrisma.lotteryVariance.findFirst.mockResolvedValue(null);

      await expect(
        lotterySyncService.approveVariance(
          TEST_STORE_ID,
          validInput,
          createValidAuditContext(),
        ),
      ).rejects.toThrow("VARIANCE_NOT_FOUND");
    });

    it("should throw ALREADY_APPROVED for already approved variance", async () => {
      const approvedVariance = createTestLotteryVariance({
        variance_id: validInput.variance_id,
        approved_by: createTestUuid("employee", 2), // Already approved by someone
      });
      approvedVariance.pack = {
        pack_number: "PKG001",
        game: { game_code: "0001" },
      };

      mockPrisma.lotteryVariance.findFirst.mockResolvedValue(approvedVariance);

      await expect(
        lotterySyncService.approveVariance(
          TEST_STORE_ID,
          validInput,
          createValidAuditContext(),
        ),
      ).rejects.toThrow("ALREADY_APPROVED");
    });

    it("should enforce tenant isolation for variance approval via shift relation", async () => {
      // Variance lookup uses findFirst with where clause checking shift.store_id
      // When store doesn't match, findFirst returns null
      mockPrisma.lotteryVariance.findFirst.mockResolvedValue(null);

      await expect(
        lotterySyncService.approveVariance(
          TEST_STORE_ID,
          validInput,
          createValidAuditContext(),
        ),
      ).rejects.toThrow("VARIANCE_NOT_FOUND");
    });
  });
});

// =============================================================================
// Sync Wrapper Tests
// =============================================================================

describe("LotterySyncService - Sync Wrappers", () => {
  let mockPrisma: MockPrismaClient;

  beforeEach(() => {
    mockPrisma = getMockPrisma();
    vi.clearAllMocks();
  });

  describe("syncGames", () => {
    it("should validate session and return games", async () => {
      const validSession = createTestSyncSession({
        sync_session_id: TEST_SESSION_ID,
        api_key_id: TEST_API_KEY_ID,
      });
      validSession.api_key.store_id = TEST_STORE_ID;

      mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(validSession);
      mockPrisma.lotteryGame.count.mockResolvedValue(1);
      mockPrisma.lotteryGame.findMany.mockResolvedValue([
        createTestLotteryGame({ store_id: TEST_STORE_ID }),
      ]);

      const result = await lotterySyncService.syncGames(
        createValidIdentity(),
        TEST_SESSION_ID,
        {},
        createValidAuditContext(),
      );

      expect(result.records).toHaveLength(1);
      expect(mockPrisma.apiKeySyncSession.findUnique).toHaveBeenCalled();
    });

    it("should throw for invalid session", async () => {
      mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(null);

      await expect(
        lotterySyncService.syncGames(
          createValidIdentity(),
          TEST_SESSION_ID,
          {},
          createValidAuditContext(),
        ),
      ).rejects.toThrow("INVALID_SESSION");
    });
  });

  describe("syncPacks", () => {
    it("should validate session and return packs by status", async () => {
      const validSession = createTestSyncSession({
        sync_session_id: TEST_SESSION_ID,
        api_key_id: TEST_API_KEY_ID,
      });
      validSession.api_key.store_id = TEST_STORE_ID;

      mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(validSession);
      mockPrisma.lotteryPack.count.mockResolvedValue(1);
      mockPrisma.lotteryPack.findMany.mockResolvedValue([
        createTestLotteryPack({ store_id: TEST_STORE_ID, status: "ACTIVE" }),
      ]);

      const result = await lotterySyncService.syncPacks(
        createValidIdentity(),
        TEST_SESSION_ID,
        "ACTIVE",
        {},
        createValidAuditContext(),
      );

      expect(result.records).toHaveLength(1);
    });
  });
});

// =============================================================================
// Edge Cases and Error Handling Tests
// =============================================================================

describe("LotterySyncService - Edge Cases", () => {
  let mockPrisma: MockPrismaClient;

  beforeEach(() => {
    mockPrisma = getMockPrisma();
    vi.clearAllMocks();
  });

  describe("Empty Results", () => {
    it("should handle empty games list gracefully", async () => {
      mockPrisma.lotteryGame.count.mockResolvedValue(0);
      mockPrisma.lotteryGame.findMany.mockResolvedValue([]);

      const result = await lotterySyncService.getGamesForSync(
        TEST_STORE_ID,
        TEST_STATE_ID,
      );

      expect(result.records).toHaveLength(0);
      expect(result.total_count).toBe(0);
      expect(result.has_more).toBe(false);
    });
  });

  describe("Concurrent Operations", () => {
    it("should handle concurrent pack receive attempts", async () => {
      const game = createTestLotteryGame({ store_id: TEST_STORE_ID });

      // Simulate race condition where duplicate check passes but create fails
      mockPrisma.lotteryGame.findFirst.mockResolvedValue(game);
      mockPrisma.lotteryPack.findUnique.mockResolvedValue(null);
      mockPrisma.lotteryPack.create.mockRejectedValue(
        new Error("Unique constraint violation"),
      );

      await expect(
        lotterySyncService.receivePack(
          TEST_STORE_ID,
          TEST_STATE_ID,
          {
            game_code: "0001",
            pack_number: "PKG001",
            serial_start: "000000001",
            serial_end: "000000060",
          },
          createValidAuditContext(),
        ),
      ).rejects.toThrow();
    });
  });

  describe("Database Errors", () => {
    it("should propagate database errors", async () => {
      mockPrisma.lotteryGame.count.mockRejectedValue(
        new Error("Database connection failed"),
      );

      await expect(
        lotterySyncService.getGamesForSync(TEST_STORE_ID, TEST_STATE_ID),
      ).rejects.toThrow("Database connection failed");
    });
  });
});

// =============================================================================
// GAME_INACTIVE Error Handling Tests (AIP-193 Compliance)
// =============================================================================

describe("LotterySyncService - Inactive Game Handling", () => {
  let mockPrisma: MockPrismaClient;

  beforeEach(() => {
    mockPrisma = getMockPrisma();
    vi.clearAllMocks();
  });

  describe("lookupGameByCode - GAME_INACTIVE scenarios", () => {
    /**
     * AIP-193 Compliance Test: FAILED_PRECONDITION for inactive games
     *
     * When a game exists but is INACTIVE, the service should throw
     * GAME_INACTIVE instead of returning null (which would cause GAME_NOT_FOUND).
     * This allows clients to distinguish between:
     * - Game doesn't exist (404 NOT_FOUND)
     * - Game exists but is inactive (400 FAILED_PRECONDITION)
     */
    it("should throw GAME_INACTIVE when state-scoped game is inactive", async () => {
      // Arrange: Game exists but is INACTIVE
      const inactiveGame = createTestLotteryGame({
        game_id: TEST_GAME_ID,
        game_code: "0033",
        status: "INACTIVE",
        state_id: TEST_STATE_ID,
      });

      mockPrisma.lotteryGame.findFirst.mockResolvedValue(inactiveGame);

      // Act & Assert
      await expect(
        lotterySyncService.receivePack(
          TEST_STORE_ID,
          TEST_STATE_ID,
          {
            game_code: "0033",
            pack_number: "123456",
            serial_start: "001",
            serial_end: "300",
          },
          createValidAuditContext(),
        ),
      ).rejects.toThrow(
        "GAME_INACTIVE: Game 0033 is inactive and cannot accept new packs",
      );
    });

    it("should throw GAME_INACTIVE when store-scoped game is inactive", async () => {
      // Arrange: State game not found, store game is inactive
      mockPrisma.lotteryGame.findFirst
        .mockResolvedValueOnce(null) // No state game
        .mockResolvedValueOnce(
          createTestLotteryGame({
            game_id: TEST_GAME_ID,
            game_code: "9999",
            status: "INACTIVE",
            store_id: TEST_STORE_ID,
          }),
        );

      // Act & Assert
      await expect(
        lotterySyncService.receivePack(
          TEST_STORE_ID,
          TEST_STATE_ID,
          {
            game_code: "9999",
            pack_number: "123456",
            serial_start: "001",
            serial_end: "300",
          },
          createValidAuditContext(),
        ),
      ).rejects.toThrow("GAME_INACTIVE:");
    });

    it("should succeed when game is ACTIVE", async () => {
      // Arrange
      const activeGame = createTestLotteryGame({
        game_id: TEST_GAME_ID,
        game_code: "0033",
        status: "ACTIVE",
        state_id: TEST_STATE_ID,
      });

      mockPrisma.lotteryGame.findFirst.mockResolvedValue(activeGame);
      mockPrisma.lotteryPack.findUnique.mockResolvedValue(null); // No duplicate
      mockPrisma.lotteryPack.create.mockResolvedValue(
        createTestLotteryPack({
          game_id: TEST_GAME_ID,
          store_id: TEST_STORE_ID,
        }),
      );

      // Act
      const result = await lotterySyncService.receivePack(
        TEST_STORE_ID,
        TEST_STATE_ID,
        {
          game_code: "0033",
          pack_number: "123456",
          serial_start: "001",
          serial_end: "300",
        },
        createValidAuditContext(),
      );

      // Assert
      expect(result.success).toBe(true);
    });

    it("should throw GAME_NOT_FOUND when game code doesn't exist anywhere", async () => {
      // Arrange: No game found in either state or store scope
      mockPrisma.lotteryGame.findFirst
        .mockResolvedValueOnce(null) // No state game
        .mockResolvedValueOnce(null); // No store game

      // Act & Assert
      await expect(
        lotterySyncService.receivePack(
          TEST_STORE_ID,
          TEST_STATE_ID,
          {
            game_code: "0000",
            pack_number: "123456",
            serial_start: "001",
            serial_end: "300",
          },
          createValidAuditContext(),
        ),
      ).rejects.toThrow("GAME_NOT_FOUND:");
    });

    /**
     * Semantic distinction test: GAME_NOT_FOUND vs GAME_INACTIVE
     *
     * These errors have different meanings and require different client actions:
     * - GAME_NOT_FOUND: Game code is invalid/typo, user should check game code
     * - GAME_INACTIVE: Game is correct but deactivated, contact admin to reactivate
     */
    it("should distinguish GAME_NOT_FOUND from GAME_INACTIVE", async () => {
      // Test 1: Game doesn't exist -> GAME_NOT_FOUND
      mockPrisma.lotteryGame.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      let error: Error | undefined;
      try {
        await lotterySyncService.receivePack(
          TEST_STORE_ID,
          TEST_STATE_ID,
          {
            game_code: "XXXX",
            pack_number: "123456",
            serial_start: "001",
            serial_end: "300",
          },
          createValidAuditContext(),
        );
      } catch (e) {
        error = e as Error;
      }
      expect(error?.message).toContain("GAME_NOT_FOUND");
      expect(error?.message).not.toContain("GAME_INACTIVE");

      vi.clearAllMocks();

      // Test 2: Game exists but inactive -> GAME_INACTIVE
      mockPrisma.lotteryGame.findFirst.mockResolvedValue(
        createTestLotteryGame({
          game_id: TEST_GAME_ID,
          game_code: "0033",
          status: "INACTIVE",
          state_id: TEST_STATE_ID,
        }),
      );

      try {
        await lotterySyncService.receivePack(
          TEST_STORE_ID,
          TEST_STATE_ID,
          {
            game_code: "0033",
            pack_number: "123456",
            serial_start: "001",
            serial_end: "300",
          },
          createValidAuditContext(),
        );
      } catch (e) {
        error = e as Error;
      }
      expect(error?.message).toContain("GAME_INACTIVE");
      expect(error?.message).not.toContain("GAME_NOT_FOUND");
    });
  });

  describe("activatePack - GAME_INACTIVE scenarios", () => {
    it("should throw GAME_INACTIVE when activating pack for inactive game", async () => {
      // Arrange
      const inactiveGame = createTestLotteryGame({
        game_id: TEST_GAME_ID,
        game_code: "0033",
        status: "INACTIVE",
        state_id: TEST_STATE_ID,
      });

      const validBin = createTestLotteryBin({
        bin_id: TEST_BIN_ID,
        store_id: TEST_STORE_ID,
        is_active: true,
      });

      mockPrisma.lotteryBin.findFirst.mockResolvedValue(validBin);
      mockPrisma.lotteryPack.findFirst.mockResolvedValue(null); // No existing pack
      mockPrisma.lotteryPack.findUnique.mockResolvedValue(null);
      mockPrisma.lotteryGame.findFirst.mockResolvedValue(inactiveGame);

      // Act & Assert
      await expect(
        lotterySyncService.activatePack(
          TEST_STORE_ID,
          TEST_STATE_ID,
          {
            pack_id: TEST_PACK_ID,
            bin_id: TEST_BIN_ID,
            game_code: "0033",
            pack_number: "123456",
            serial_start: "001",
            serial_end: "300",
          },
          createValidAuditContext(),
        ),
      ).rejects.toThrow("GAME_INACTIVE:");
    });

    it("should succeed activating pack for active game", async () => {
      // Arrange
      const activeGame = createTestLotteryGame({
        game_id: TEST_GAME_ID,
        game_code: "0033",
        status: "ACTIVE",
        state_id: TEST_STATE_ID,
      });

      const validBin = createTestLotteryBin({
        bin_id: TEST_BIN_ID,
        store_id: TEST_STORE_ID,
        is_active: true,
      });

      const createdPack = createTestLotteryPack({
        pack_id: TEST_PACK_ID,
        game_id: TEST_GAME_ID,
        store_id: TEST_STORE_ID,
        status: "RECEIVED",
      });

      const updatedPack = createTestLotteryPack({
        pack_id: TEST_PACK_ID,
        game_id: TEST_GAME_ID,
        store_id: TEST_STORE_ID,
        status: "ACTIVE",
        current_bin_id: TEST_BIN_ID,
      });

      mockPrisma.lotteryBin.findFirst.mockResolvedValue(validBin);
      mockPrisma.lotteryPack.findFirst.mockResolvedValue(null);
      mockPrisma.lotteryPack.findUnique.mockResolvedValue(null);
      mockPrisma.lotteryGame.findFirst.mockResolvedValue(activeGame);
      mockPrisma.lotteryPack.create.mockResolvedValue(createdPack);
      mockPrisma.lotteryPack.update.mockResolvedValue(updatedPack);

      // Act
      const result = await lotterySyncService.activatePack(
        TEST_STORE_ID,
        TEST_STATE_ID,
        {
          pack_id: TEST_PACK_ID,
          bin_id: TEST_BIN_ID,
          game_code: "0033",
          pack_number: "123456",
          serial_start: "001",
          serial_end: "300",
        },
        createValidAuditContext(),
      );

      // Assert
      expect(result.success).toBe(true);
    });
  });

  describe("Query efficiency validation", () => {
    /**
     * DB-006: TENANT_ISOLATION - Verify queries are properly scoped
     * SEC-006: SQL_INJECTION - Verify ORM usage (no raw SQL)
     */
    it("should query by game_code with tenant scope but without status filter", async () => {
      const activeGame = createTestLotteryGame({
        game_id: TEST_GAME_ID,
        game_code: "0033",
        status: "ACTIVE",
        state_id: TEST_STATE_ID,
      });

      mockPrisma.lotteryGame.findFirst.mockResolvedValue(activeGame);
      mockPrisma.lotteryPack.findUnique.mockResolvedValue(null);
      mockPrisma.lotteryPack.create.mockResolvedValue(
        createTestLotteryPack({ store_id: TEST_STORE_ID }),
      );

      await lotterySyncService.receivePack(
        TEST_STORE_ID,
        TEST_STATE_ID,
        {
          game_code: "0033",
          pack_number: "123456",
          serial_start: "001",
          serial_end: "300",
        },
        createValidAuditContext(),
      );

      // Verify query structure
      const findFirstCall = mockPrisma.lotteryGame.findFirst.mock.calls[0][0];

      // Should have game_code
      expect(findFirstCall.where.game_code).toBe("0033");

      // Should have tenant isolation (state_id)
      expect(findFirstCall.where.state_id).toBe(TEST_STATE_ID);

      // Should NOT have status filter (removed to detect inactive games)
      expect(findFirstCall.where.status).toBeUndefined();

      // Should select status for post-query validation
      expect(findFirstCall.select.status).toBe(true);
    });
  });
});

// =============================================================================
// PUSH Endpoints - Shift Sync Tests
// =============================================================================

describe("LotterySyncService - Shift Sync", () => {
  let mockPrisma: MockPrismaClient;

  beforeEach(() => {
    mockPrisma = getMockPrisma();
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Valid Input Structure
  // ---------------------------------------------------------------------------

  const TEST_OPENED_BY = createTestUuid("user", 1);
  const TEST_CASHIER_ID_SYNC = createTestUuid("cashier", 1);
  const TEST_TERMINAL_ID_SYNC = createTestUuid("terminal", 1);
  const TEST_DAY_SUMMARY_ID_SYNC = createTestUuid("daysummary", 1);

  const validShiftInput = {
    shift_id: TEST_SHIFT_ID,
    opened_by: TEST_OPENED_BY,
    cashier_id: TEST_CASHIER_ID_SYNC,
    opened_at: "2024-01-15T08:00:00Z",
    status: "OPEN" as const,
    opening_cash: "100.00",
  };

  // ---------------------------------------------------------------------------
  // Happy Path Tests
  // ---------------------------------------------------------------------------

  describe("syncShift - Create New Shift", () => {
    it("should create a new shift when it does not exist", async () => {
      // Arrange: User and cashier exist with store access
      mockPrisma.user.findFirst.mockResolvedValue({
        user_id: TEST_OPENED_BY,
      });
      mockPrisma.cashier.findFirst.mockResolvedValue({
        cashier_id: TEST_CASHIER_ID_SYNC,
      });
      mockPrisma.shift.findFirst.mockResolvedValue(null); // No existing shift
      mockPrisma.shift.upsert.mockResolvedValue(
        createTestShift({
          shift_id: TEST_SHIFT_ID,
          store_id: TEST_STORE_ID,
          opened_by: TEST_OPENED_BY,
          cashier_id: TEST_CASHIER_ID_SYNC,
          status: "OPEN",
        }),
      );

      // Act
      const result = await lotterySyncService.syncShift(
        TEST_STORE_ID,
        validShiftInput,
        createValidAuditContext(),
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.shift.shift_id).toBe(TEST_SHIFT_ID);
      expect(result.shift.status).toBe("OPEN");
      expect(result.idempotent).toBe(false);
      expect(mockPrisma.shift.upsert).toHaveBeenCalled();
    });

    it("should return idempotent=true for existing shift update", async () => {
      // Arrange: Shift already exists
      mockPrisma.user.findFirst.mockResolvedValue({
        user_id: TEST_OPENED_BY,
      });
      mockPrisma.cashier.findFirst.mockResolvedValue({
        cashier_id: TEST_CASHIER_ID_SYNC,
      });
      mockPrisma.shift.findFirst.mockResolvedValue(
        createTestShift({
          shift_id: TEST_SHIFT_ID,
          store_id: TEST_STORE_ID,
        }),
      );
      mockPrisma.shift.upsert.mockResolvedValue(
        createTestShift({
          shift_id: TEST_SHIFT_ID,
          store_id: TEST_STORE_ID,
          status: "CLOSING",
        }),
      );

      // Act
      const result = await lotterySyncService.syncShift(
        TEST_STORE_ID,
        { ...validShiftInput, status: "CLOSING" },
        createValidAuditContext(),
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.idempotent).toBe(true);
    });

    it("should handle shift with all optional fields", async () => {
      // Arrange
      const fullInput = {
        ...validShiftInput,
        pos_terminal_id: TEST_TERMINAL_ID_SYNC,
        closed_at: "2024-01-15T16:00:00Z",
        closing_cash: "150.00",
        expected_cash: "145.00",
        variance: "5.00",
        variance_reason: "Extra found in register",
        shift_number: 1,
        approved_by: TEST_OPENED_BY,
        approved_at: "2024-01-15T16:30:00Z",
        business_date: "2024-01-15",
        external_shift_id: "POS-SHIFT-001",
      };

      mockPrisma.user.findFirst.mockResolvedValue({ user_id: TEST_OPENED_BY });
      mockPrisma.cashier.findFirst.mockResolvedValue({
        cashier_id: TEST_CASHIER_ID_SYNC,
      });
      mockPrisma.pOSTerminal.findFirst.mockResolvedValue({
        pos_terminal_id: TEST_TERMINAL_ID_SYNC,
      });
      mockPrisma.daySummary.findFirst.mockResolvedValue({
        day_summary_id: TEST_DAY_SUMMARY_ID_SYNC,
      });
      mockPrisma.shift.findFirst.mockResolvedValue(null);
      mockPrisma.shift.upsert.mockResolvedValue(
        createTestShift({
          shift_id: TEST_SHIFT_ID,
          store_id: TEST_STORE_ID,
          pos_terminal_id: TEST_TERMINAL_ID_SYNC,
          status: "OPEN",
          day_summary_id: TEST_DAY_SUMMARY_ID_SYNC,
        }),
      );

      // Act
      const result = await lotterySyncService.syncShift(
        TEST_STORE_ID,
        fullInput,
        createValidAuditContext(),
      );

      // Assert
      expect(result.success).toBe(true);
      expect(mockPrisma.pOSTerminal.findFirst).toHaveBeenCalled();
      expect(mockPrisma.daySummary.findFirst).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Foreign Key Validation Tests (DB-006: TENANT_ISOLATION)
  // ---------------------------------------------------------------------------

  describe("syncShift - Foreign Key Validation", () => {
    it("should throw USER_NOT_FOUND for non-existent opened_by user", async () => {
      // Arrange: User does not exist
      mockPrisma.user.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        lotterySyncService.syncShift(
          TEST_STORE_ID,
          validShiftInput,
          createValidAuditContext(),
        ),
      ).rejects.toThrow("USER_NOT_FOUND:");
    });

    it("should throw USER_NOT_FOUND for user without store access", async () => {
      // Arrange: User exists but has no role for this store
      mockPrisma.user.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        lotterySyncService.syncShift(
          TEST_STORE_ID,
          validShiftInput,
          createValidAuditContext(),
        ),
      ).rejects.toThrow("USER_NOT_FOUND:");

      // Verify the query enforced tenant isolation via user_roles
      const userQuery = mockPrisma.user.findFirst.mock.calls[0][0];
      expect(userQuery.where.user_roles).toBeDefined();
      expect(userQuery.where.user_roles.some.store_id).toBe(TEST_STORE_ID);
    });

    it("should throw CASHIER_NOT_FOUND for non-existent cashier", async () => {
      // Arrange: User exists, cashier does not
      mockPrisma.user.findFirst.mockResolvedValue({ user_id: TEST_OPENED_BY });
      mockPrisma.cashier.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        lotterySyncService.syncShift(
          TEST_STORE_ID,
          validShiftInput,
          createValidAuditContext(),
        ),
      ).rejects.toThrow("CASHIER_NOT_FOUND:");
    });

    it("should throw CASHIER_NOT_FOUND for cashier from different store", async () => {
      // Arrange: Query includes store_id filter, so null returned
      mockPrisma.user.findFirst.mockResolvedValue({ user_id: TEST_OPENED_BY });
      mockPrisma.cashier.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        lotterySyncService.syncShift(
          TEST_STORE_ID,
          validShiftInput,
          createValidAuditContext(),
        ),
      ).rejects.toThrow("CASHIER_NOT_FOUND:");

      // Verify tenant isolation in cashier query
      const cashierQuery = mockPrisma.cashier.findFirst.mock.calls[0][0];
      expect(cashierQuery.where.store_id).toBe(TEST_STORE_ID);
    });

    it("should throw TERMINAL_NOT_FOUND for non-existent terminal", async () => {
      // Arrange
      mockPrisma.user.findFirst.mockResolvedValue({ user_id: TEST_OPENED_BY });
      mockPrisma.cashier.findFirst.mockResolvedValue({
        cashier_id: TEST_CASHIER_ID_SYNC,
      });
      mockPrisma.pOSTerminal.findFirst.mockResolvedValue(null);

      const inputWithTerminal = {
        ...validShiftInput,
        pos_terminal_id: TEST_TERMINAL_ID_SYNC,
      };

      // Act & Assert
      await expect(
        lotterySyncService.syncShift(
          TEST_STORE_ID,
          inputWithTerminal,
          createValidAuditContext(),
        ),
      ).rejects.toThrow("TERMINAL_NOT_FOUND:");
    });

    it("should throw TERMINAL_NOT_FOUND for soft-deleted terminal", async () => {
      // Arrange: Query includes deleted_at: null filter
      mockPrisma.user.findFirst.mockResolvedValue({ user_id: TEST_OPENED_BY });
      mockPrisma.cashier.findFirst.mockResolvedValue({
        cashier_id: TEST_CASHIER_ID_SYNC,
      });
      mockPrisma.pOSTerminal.findFirst.mockResolvedValue(null);

      const inputWithTerminal = {
        ...validShiftInput,
        pos_terminal_id: TEST_TERMINAL_ID_SYNC,
      };

      // Act & Assert
      await expect(
        lotterySyncService.syncShift(
          TEST_STORE_ID,
          inputWithTerminal,
          createValidAuditContext(),
        ),
      ).rejects.toThrow("TERMINAL_NOT_FOUND:");

      // Verify terminal query includes soft-delete check
      const terminalQuery = mockPrisma.pOSTerminal.findFirst.mock.calls[0][0];
      expect(terminalQuery.where.deleted_at).toBeNull();
    });

    it("should throw APPROVER_NOT_FOUND for non-existent approver", async () => {
      // Arrange
      mockPrisma.user.findFirst
        .mockResolvedValueOnce({ user_id: TEST_OPENED_BY }) // opened_by exists
        .mockResolvedValueOnce(null); // approved_by does not exist
      mockPrisma.cashier.findFirst.mockResolvedValue({
        cashier_id: TEST_CASHIER_ID_SYNC,
      });

      const inputWithApprover = {
        ...validShiftInput,
        approved_by: createTestUuid("user", 999),
      };

      // Act & Assert
      await expect(
        lotterySyncService.syncShift(
          TEST_STORE_ID,
          inputWithApprover,
          createValidAuditContext(),
        ),
      ).rejects.toThrow("APPROVER_NOT_FOUND:");
    });
  });

  // ---------------------------------------------------------------------------
  // Business Day Association Tests
  // ---------------------------------------------------------------------------

  describe("syncShift - Business Day Association", () => {
    it("should link shift to existing day_summary when business_date provided", async () => {
      // Arrange
      mockPrisma.user.findFirst.mockResolvedValue({ user_id: TEST_OPENED_BY });
      mockPrisma.cashier.findFirst.mockResolvedValue({
        cashier_id: TEST_CASHIER_ID_SYNC,
      });
      mockPrisma.daySummary.findFirst.mockResolvedValue({
        day_summary_id: TEST_DAY_SUMMARY_ID_SYNC,
      });
      mockPrisma.shift.findFirst.mockResolvedValue(null);
      mockPrisma.shift.upsert.mockResolvedValue(
        createTestShift({
          shift_id: TEST_SHIFT_ID,
          day_summary_id: TEST_DAY_SUMMARY_ID_SYNC,
        }),
      );

      const inputWithBusinessDate = {
        ...validShiftInput,
        business_date: "2024-01-15",
      };

      // Act
      const result = await lotterySyncService.syncShift(
        TEST_STORE_ID,
        inputWithBusinessDate,
        createValidAuditContext(),
      );

      // Assert
      expect(result.success).toBe(true);
      expect(mockPrisma.daySummary.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            store_id: TEST_STORE_ID,
          }),
        }),
      );
    });

    it("should handle missing day_summary gracefully (null)", async () => {
      // Arrange: No day summary exists for the business date
      mockPrisma.user.findFirst.mockResolvedValue({ user_id: TEST_OPENED_BY });
      mockPrisma.cashier.findFirst.mockResolvedValue({
        cashier_id: TEST_CASHIER_ID_SYNC,
      });
      mockPrisma.daySummary.findFirst.mockResolvedValue(null);
      mockPrisma.shift.findFirst.mockResolvedValue(null);
      mockPrisma.shift.upsert.mockResolvedValue(
        createTestShift({
          shift_id: TEST_SHIFT_ID,
          day_summary_id: null,
        }),
      );

      const inputWithBusinessDate = {
        ...validShiftInput,
        business_date: "2024-01-15",
      };

      // Act
      const result = await lotterySyncService.syncShift(
        TEST_STORE_ID,
        inputWithBusinessDate,
        createValidAuditContext(),
      );

      // Assert: Should succeed with null day_summary_id
      expect(result.success).toBe(true);
      expect(result.shift.day_summary_id).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Security Tests (SEC-006: SQL_INJECTION, DB-006: TENANT_ISOLATION)
  // ---------------------------------------------------------------------------

  describe("syncShift - Security Compliance", () => {
    it("should use parameterized queries via Prisma ORM (SEC-006)", async () => {
      // Arrange
      mockPrisma.user.findFirst.mockResolvedValue({ user_id: TEST_OPENED_BY });
      mockPrisma.cashier.findFirst.mockResolvedValue({
        cashier_id: TEST_CASHIER_ID_SYNC,
      });
      mockPrisma.shift.findFirst.mockResolvedValue(null);
      mockPrisma.shift.upsert.mockResolvedValue(
        createTestShift({ shift_id: TEST_SHIFT_ID }),
      );

      // Act
      await lotterySyncService.syncShift(
        TEST_STORE_ID,
        validShiftInput,
        createValidAuditContext(),
      );

      // Assert: No raw SQL was used
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    });

    it("should enforce tenant isolation in all queries (DB-006)", async () => {
      // Arrange
      mockPrisma.user.findFirst.mockResolvedValue({ user_id: TEST_OPENED_BY });
      mockPrisma.cashier.findFirst.mockResolvedValue({
        cashier_id: TEST_CASHIER_ID_SYNC,
      });
      mockPrisma.shift.findFirst.mockResolvedValue(null);
      mockPrisma.shift.upsert.mockResolvedValue(
        createTestShift({ shift_id: TEST_SHIFT_ID, store_id: TEST_STORE_ID }),
      );

      // Act
      await lotterySyncService.syncShift(
        TEST_STORE_ID,
        validShiftInput,
        createValidAuditContext(),
      );

      // Assert: Cashier query includes store_id
      const cashierQuery = mockPrisma.cashier.findFirst.mock.calls[0][0];
      expect(cashierQuery.where.store_id).toBe(TEST_STORE_ID);

      // Assert: Shift findFirst includes store_id
      const shiftQuery = mockPrisma.shift.findFirst.mock.calls[0][0];
      expect(shiftQuery.where.store_id).toBe(TEST_STORE_ID);

      // Assert: Shift upsert creates with correct store_id
      const upsertCall = mockPrisma.shift.upsert.mock.calls[0][0];
      expect(upsertCall.create.store_id).toBe(TEST_STORE_ID);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge Cases and Error Handling
  // ---------------------------------------------------------------------------

  describe("syncShift - Edge Cases", () => {
    it("should handle database errors gracefully", async () => {
      // Arrange: Database connection fails
      mockPrisma.user.findFirst.mockRejectedValue(
        new Error("Database connection failed"),
      );

      // Act & Assert
      await expect(
        lotterySyncService.syncShift(
          TEST_STORE_ID,
          validShiftInput,
          createValidAuditContext(),
        ),
      ).rejects.toThrow("Database connection failed");
    });

    it("should handle upsert constraint violations", async () => {
      // Arrange
      mockPrisma.user.findFirst.mockResolvedValue({ user_id: TEST_OPENED_BY });
      mockPrisma.cashier.findFirst.mockResolvedValue({
        cashier_id: TEST_CASHIER_ID_SYNC,
      });
      mockPrisma.shift.findFirst.mockResolvedValue(null);
      mockPrisma.shift.upsert.mockRejectedValue(
        new Error("Unique constraint violation"),
      );

      // Act & Assert
      await expect(
        lotterySyncService.syncShift(
          TEST_STORE_ID,
          validShiftInput,
          createValidAuditContext(),
        ),
      ).rejects.toThrow("Unique constraint violation");
    });
  });
});
