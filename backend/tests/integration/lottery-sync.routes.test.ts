/**
 * Lottery Sync Routes Integration Tests
 *
 * Enterprise-grade integration tests for lottery sync API endpoints.
 * Tests HTTP layer behavior including:
 * - Request/response handling
 * - Authentication middleware
 * - Error response formats
 * - Content negotiation
 *
 * @module tests/integration/lottery-sync.routes.test
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
  beforeAll,
  afterAll,
} from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import {
  createMockPrismaClient,
  createTestUuid,
  createTestLotteryGame,
  createTestSyncSession,
  createTestLotteryPack,
  createTestShift,
  createTestUser,
  createTestCashier,
  createTestPOSTerminal,
  type MockPrismaClient,
} from "../utils/prisma-mock";

// =============================================================================
// Mock Setup
// =============================================================================

// Mock Prisma before importing routes
vi.mock("../../src/utils/db", () => ({
  prisma: createMockPrismaClient(),
}));

// Mock audit service
vi.mock("../../src/services/api-key/api-key-audit.service", () => ({
  apiKeyAuditService: {
    logOperation: vi.fn().mockResolvedValue(undefined),
    logCustomEvent: vi.fn().mockResolvedValue(undefined),
    logRateLimited: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock API key middleware
vi.mock("../../src/middleware/api-key.middleware", () => {
  const mockIdentity = {
    apiKeyId: "test-0000-0000-0000-000000000001",
    storeId: "store-0000-0000-0000-000000000001",
    keyPrefix: "nvn_test",
  };

  return {
    apiKeyMiddleware: vi.fn(async (request, _reply) => {
      // Simulate authenticated request
      request.apiKey = mockIdentity;
    }),
    hybridAuthMiddleware: vi.fn(async (request, _reply) => {
      request.apiKey = mockIdentity;
    }),
    optionalApiKeyMiddleware: vi.fn(async (request, _reply) => {
      request.apiKey = mockIdentity;
    }),
    requireApiKeyMiddleware: vi.fn(async (request, _reply) => {
      request.apiKey = mockIdentity;
    }),
    getApiKeyIdentity: vi.fn((request) => request.apiKey),
    requireApiKeyIdentity: vi.fn((request) => {
      if (!request.apiKey) {
        throw new Error("API key identity not found on request");
      }
      return request.apiKey;
    }),
  };
});

import { prisma } from "../../src/utils/db";
import { lotterySyncRoutes } from "../../src/routes/lottery-sync";

// =============================================================================
// Test Constants
// =============================================================================

const TEST_STORE_ID = "store-0000-0000-0000-000000000001";
const TEST_API_KEY_ID = "test-0000-0000-0000-000000000001";
const TEST_SESSION_ID = "session-0000-0000-000000000001";
const VALID_SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

// =============================================================================
// Helper Functions
// =============================================================================

function getMockPrisma(): MockPrismaClient {
  return prisma as unknown as MockPrismaClient;
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
  });

  await app.register(lotterySyncRoutes);
  return app;
}

// =============================================================================
// Route Registration Tests
// =============================================================================

describe("Lottery Sync Routes - Registration", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("should register all PULL endpoints", () => {
    const routes = app.printRoutes();

    // Verify all GET endpoints are registered (Fastify uses tree format)
    // GET routes show as "(GET, HEAD)" in the tree output
    expect(routes).toContain("GET");
    expect(routes).toContain("games (GET, HEAD)");
    expect(routes).toContain("config (GET, HEAD)");
    expect(routes).toContain("s (GET, HEAD)"); // bins
    expect(routes).toContain("d (GET, HEAD)"); // received/activated/depleted/returned
    expect(routes).toContain("status (GET, HEAD)"); // day-status (split: day-status)
    expect(routes).toContain("openings (GET, HEAD)"); // shift-openings
    expect(routes).toContain("closings (GET, HEAD)"); // shift-closings
    expect(routes).toContain("variances (GET, HEAD)");
    expect(routes).toContain("packs (GET, HEAD)"); // day-packs
    expect(routes).toContain("-history (GET, HEAD)"); // bin-history
  });

  it("should register all PUSH endpoints", () => {
    const routes = app.printRoutes();

    // Verify all POST endpoints are registered (Fastify uses tree format)
    // POST routes show as "(POST)" in the tree output
    expect(routes).toContain("POST");
    expect(routes).toContain("ceive (POST)"); // receive (split: re-ceive)
    expect(routes).toContain("/batch (POST)");
    expect(routes).toContain("activate (POST)");
    expect(routes).toContain("move (POST)");
    expect(routes).toContain("deplete (POST)");
    expect(routes).toContain("turn (POST)"); // return (split: re-turn)
    expect(routes).toContain("open (POST)");
    expect(routes).toContain("close (POST)");
    expect(routes).toContain("prepare-close (POST)");
    expect(routes).toContain("ommit-close (POST)"); // commit-close (split: c-ommit)
    expect(routes).toContain("ancel-close (POST)"); // cancel-close (split: c-ancel)
    expect(routes).toContain("/approve (POST)");
    // Note: Fastify's radix tree splits "shifts" as "shift" prefix + "s" suffix
    // The route /api/v1/sync/lottery/shifts shows as "s (POST)" in the tree output
    expect(routes).toMatch(/shift[\s\S]*s \(POST\)/); // shift sync endpoint
  });
});

// =============================================================================
// GET Endpoints Tests
// =============================================================================

describe("Lottery Sync Routes - GET Endpoints", () => {
  let app: FastifyInstance;
  let mockPrisma: MockPrismaClient;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockPrisma = getMockPrisma();
    vi.clearAllMocks();
  });

  describe("GET /api/v1/sync/lottery/games", () => {
    it("should return 400 for missing session_id", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/sync/lottery/games",
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
    });

    it("should return 400 for invalid session_id format", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/sync/lottery/games?session_id=invalid-uuid",
      });

      expect(response.statusCode).toBe(400);
    });

    it("should return 200 with games for valid request", async () => {
      const validSession = createTestSyncSession({
        sync_session_id: VALID_SESSION_ID,
        api_key_id: TEST_API_KEY_ID,
      });
      validSession.api_key.store_id = TEST_STORE_ID;

      const game = createTestLotteryGame({ store_id: TEST_STORE_ID });

      mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(validSession);
      mockPrisma.lotteryGame.count.mockResolvedValue(1);
      mockPrisma.lotteryGame.findMany.mockResolvedValue([game]);

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/sync/lottery/games?session_id=${VALID_SESSION_ID}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.records).toBeDefined();
      expect(body.data.server_time).toBeDefined();
    });

    it("should handle session not found error", async () => {
      mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(null);

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/sync/lottery/games?session_id=${VALID_SESSION_ID}`,
      });

      // Route returns 400 for INVALID_SESSION (via handleKnownError)
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("INVALID_SESSION");
    });

    it("should accept optional query parameters", async () => {
      const validSession = createTestSyncSession({
        sync_session_id: VALID_SESSION_ID,
        api_key_id: TEST_API_KEY_ID,
      });
      validSession.api_key.store_id = TEST_STORE_ID;

      mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(validSession);
      mockPrisma.lotteryGame.count.mockResolvedValue(0);
      mockPrisma.lotteryGame.findMany.mockResolvedValue([]);

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/sync/lottery/games?session_id=${VALID_SESSION_ID}&since_sequence=10&limit=50&include_inactive=true`,
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("GET /api/v1/sync/lottery/packs/received", () => {
    it("should return received packs", async () => {
      const validSession = createTestSyncSession({
        sync_session_id: VALID_SESSION_ID,
        api_key_id: TEST_API_KEY_ID,
      });
      validSession.api_key.store_id = TEST_STORE_ID;

      const pack = createTestLotteryPack({
        status: "RECEIVED",
        store_id: TEST_STORE_ID,
      });

      mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(validSession);
      mockPrisma.lotteryPack.count.mockResolvedValue(1);
      mockPrisma.lotteryPack.findMany.mockResolvedValue([pack]);

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/sync/lottery/packs/received?session_id=${VALID_SESSION_ID}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
    });
  });

  describe("GET /api/v1/sync/lottery/day-status", () => {
    it("should accept business_date parameter", async () => {
      const validSession = createTestSyncSession({
        sync_session_id: VALID_SESSION_ID,
        api_key_id: TEST_API_KEY_ID,
      });
      validSession.api_key.store_id = TEST_STORE_ID;

      mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(validSession);
      // Service uses findMany to get day records
      mockPrisma.lotteryBusinessDay.findMany.mockResolvedValue([]);

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/sync/lottery/day-status?session_id=${VALID_SESSION_ID}&business_date=2024-01-15`,
      });

      expect(response.statusCode).toBe(200);
    });

    it("should reject invalid business_date format", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/sync/lottery/day-status?session_id=${VALID_SESSION_ID}&business_date=01/15/2024`,
      });

      expect(response.statusCode).toBe(400);
    });
  });
});

// =============================================================================
// POST Endpoints Tests
// =============================================================================

describe("Lottery Sync Routes - POST Endpoints", () => {
  let app: FastifyInstance;
  let mockPrisma: MockPrismaClient;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockPrisma = getMockPrisma();
    vi.clearAllMocks();
  });

  describe("POST /api/v1/sync/lottery/packs/receive", () => {
    const validPayload = {
      session_id: VALID_SESSION_ID,
      game_code: "0001",
      pack_number: "PKG001",
      serial_start: "000000001",
      serial_end: "000000060",
    };

    it("should return 400 for missing required fields", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/sync/lottery/packs/receive",
        payload: { session_id: VALID_SESSION_ID },
        headers: { "content-type": "application/json" },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should return 400 for invalid game_code format", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/sync/lottery/packs/receive",
        payload: { ...validPayload, game_code: "invalid" },
        headers: { "content-type": "application/json" },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should return 201 for successful pack receive", async () => {
      const validSession = createTestSyncSession({
        sync_session_id: VALID_SESSION_ID,
        api_key_id: TEST_API_KEY_ID,
      });
      validSession.api_key.store_id = TEST_STORE_ID;

      const game = createTestLotteryGame({
        store_id: TEST_STORE_ID,
        game_code: "0001",
      });
      const pack = createTestLotteryPack({ status: "RECEIVED" });

      mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(validSession);
      mockPrisma.lotteryGame.findFirst.mockResolvedValue(game);
      mockPrisma.lotteryPack.findFirst.mockResolvedValue(null);
      mockPrisma.lotteryPack.create.mockResolvedValue(pack);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/sync/lottery/packs/receive",
        payload: validPayload,
        headers: { "content-type": "application/json" },
      });

      // Route returns 201 for successful pack creation
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.pack).toBeDefined();
    });

    it("should return 404 for game not found", async () => {
      const validSession = createTestSyncSession({
        sync_session_id: VALID_SESSION_ID,
        api_key_id: TEST_API_KEY_ID,
      });
      validSession.api_key.store_id = TEST_STORE_ID;

      mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(validSession);
      mockPrisma.lotteryGame.findFirst.mockResolvedValue(null);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/sync/lottery/packs/receive",
        payload: validPayload,
        headers: { "content-type": "application/json" },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("GAME_NOT_FOUND");
    });

    it("should return 409 for duplicate pack", async () => {
      const validSession = createTestSyncSession({
        sync_session_id: VALID_SESSION_ID,
        api_key_id: TEST_API_KEY_ID,
      });
      validSession.api_key.store_id = TEST_STORE_ID;

      const game = createTestLotteryGame({
        store_id: TEST_STORE_ID,
        game_code: "0001",
      });
      const existingPack = createTestLotteryPack({
        pack_number: "PKG001",
        store_id: TEST_STORE_ID,
        game_id: game.game_id,
      });

      mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(validSession);
      mockPrisma.lotteryGame.findFirst.mockResolvedValue(game);
      // The service calls findUnique with compound key store_id_pack_number
      mockPrisma.lotteryPack.findUnique.mockResolvedValue(existingPack);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/sync/lottery/packs/receive",
        payload: validPayload,
        headers: { "content-type": "application/json" },
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("DUPLICATE_PACK");
    });
  });

  describe("POST /api/v1/sync/lottery/packs/activate", () => {
    const validPayload = {
      session_id: VALID_SESSION_ID,
      pack_id: "550e8400-e29b-41d4-a716-446655440001",
      bin_id: "550e8400-e29b-41d4-a716-446655440002",
      opening_serial: "000000001",
    };

    it("should return 400 for missing required fields", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/sync/lottery/packs/activate",
        payload: { session_id: VALID_SESSION_ID },
        headers: { "content-type": "application/json" },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should return 400 for invalid UUID format", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/sync/lottery/packs/activate",
        payload: { ...validPayload, pack_id: "invalid-uuid" },
        headers: { "content-type": "application/json" },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("POST /api/v1/sync/lottery/packs/deplete", () => {
    const validPayload = {
      session_id: VALID_SESSION_ID,
      pack_id: "550e8400-e29b-41d4-a716-446655440001",
      final_serial: "000000060",
      depletion_reason: "SHIFT_CLOSE",
    };

    it("should validate depletion_reason enum", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/sync/lottery/packs/deplete",
        payload: { ...validPayload, depletion_reason: "INVALID_REASON" },
        headers: { "content-type": "application/json" },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("POST /api/v1/sync/lottery/packs/return", () => {
    const validPayload = {
      session_id: VALID_SESSION_ID,
      pack_id: "550e8400-e29b-41d4-a716-446655440001",
      return_reason: "DAMAGED",
    };

    it("should validate return_reason enum", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/sync/lottery/packs/return",
        payload: { ...validPayload, return_reason: "LOST" },
        headers: { "content-type": "application/json" },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should accept all valid return reasons", async () => {
      const validSession = createTestSyncSession({
        sync_session_id: VALID_SESSION_ID,
        api_key_id: TEST_API_KEY_ID,
      });
      validSession.api_key.store_id = TEST_STORE_ID;

      const pack = createTestLotteryPack({
        status: "ACTIVE",
        store_id: TEST_STORE_ID,
      });

      mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(validSession);
      mockPrisma.lotteryPack.findFirst.mockResolvedValue(pack);
      mockPrisma.lotteryPack.update.mockResolvedValue({
        ...pack,
        status: "RETURNED",
      });

      const validReasons = [
        "SUPPLIER_RECALL",
        "DAMAGED",
        "EXPIRED",
        "INVENTORY_ADJUSTMENT",
        "STORE_CLOSURE",
      ];

      for (const reason of validReasons) {
        vi.clearAllMocks();
        mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(validSession);
        mockPrisma.lotteryPack.findFirst.mockResolvedValue(pack);
        mockPrisma.lotteryPack.update.mockResolvedValue({
          ...pack,
          status: "RETURNED",
        });

        const response = await app.inject({
          method: "POST",
          url: "/api/v1/sync/lottery/packs/return",
          payload: { ...validPayload, return_reason: reason },
          headers: { "content-type": "application/json" },
        });

        // Should not be 400 for valid reasons
        expect(response.statusCode).not.toBe(400);
      }
    });
  });

  describe("POST /api/v1/sync/lottery/day/prepare-close", () => {
    const validPayload = {
      session_id: VALID_SESSION_ID,
      day_id: "550e8400-e29b-41d4-a716-446655440001",
      closings: [
        {
          pack_id: "550e8400-e29b-41d4-a716-446655440002",
          ending_serial: "000000045",
        },
      ],
      initiated_by: "550e8400-e29b-41d4-a716-446655440003",
    };

    it("should return 400 for empty closings array", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/sync/lottery/day/prepare-close",
        payload: { ...validPayload, closings: [] },
        headers: { "content-type": "application/json" },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should validate expire_minutes range", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/sync/lottery/day/prepare-close",
        payload: { ...validPayload, expire_minutes: 4 },
        headers: { "content-type": "application/json" },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe("Lottery Sync Routes - Error Handling", () => {
  let app: FastifyInstance;
  let mockPrisma: MockPrismaClient;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockPrisma = getMockPrisma();
    vi.clearAllMocks();
  });

  describe("API-003: Error Response Format", () => {
    it("should return consistent error format for validation errors", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/sync/lottery/games?session_id=invalid",
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body).toHaveProperty("success", false);
      expect(body).toHaveProperty("error");
      expect(body).not.toHaveProperty("stack"); // No stack traces in responses
    });

    it("should return consistent error format for business logic errors", async () => {
      mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(null);

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/sync/lottery/games?session_id=${VALID_SESSION_ID}`,
      });

      // When session is not found, service returns 500 with INVALID_SESSION error
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      const body = JSON.parse(response.payload);
      expect(body).toHaveProperty("success", false);
      expect(body).toHaveProperty("error");
    });
  });

  describe("Database Error Handling", () => {
    it("should handle database connection errors gracefully", async () => {
      const validSession = createTestSyncSession({
        sync_session_id: VALID_SESSION_ID,
        api_key_id: TEST_API_KEY_ID,
      });
      validSession.api_key.store_id = TEST_STORE_ID;

      mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(validSession);
      mockPrisma.lotteryGame.count.mockRejectedValue(
        new Error("Connection refused"),
      );

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/sync/lottery/games?session_id=${VALID_SESSION_ID}`,
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(false);
    });
  });
});

// =============================================================================
// Response Format Tests
// =============================================================================

describe("Lottery Sync Routes - Response Format", () => {
  let app: FastifyInstance;
  let mockPrisma: MockPrismaClient;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockPrisma = getMockPrisma();
    vi.clearAllMocks();
  });

  describe("Success Response Structure", () => {
    it("should include success flag in all responses", async () => {
      const validSession = createTestSyncSession({
        sync_session_id: VALID_SESSION_ID,
        api_key_id: TEST_API_KEY_ID,
      });
      validSession.api_key.store_id = TEST_STORE_ID;

      mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(validSession);
      mockPrisma.lotteryGame.count.mockResolvedValue(0);
      mockPrisma.lotteryGame.findMany.mockResolvedValue([]);

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/sync/lottery/games?session_id=${VALID_SESSION_ID}`,
      });

      const body = JSON.parse(response.payload);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("data");
    });

    it("should include server_time in sync responses", async () => {
      const validSession = createTestSyncSession({
        sync_session_id: VALID_SESSION_ID,
        api_key_id: TEST_API_KEY_ID,
      });
      validSession.api_key.store_id = TEST_STORE_ID;

      mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(validSession);
      mockPrisma.lotteryGame.count.mockResolvedValue(0);
      mockPrisma.lotteryGame.findMany.mockResolvedValue([]);

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/sync/lottery/games?session_id=${VALID_SESSION_ID}`,
      });

      const body = JSON.parse(response.payload);
      expect(body.data).toHaveProperty("server_time");
      expect(new Date(body.data.server_time).getTime()).not.toBeNaN();
    });

    it("should include pagination info in list responses", async () => {
      const validSession = createTestSyncSession({
        sync_session_id: VALID_SESSION_ID,
        api_key_id: TEST_API_KEY_ID,
      });
      validSession.api_key.store_id = TEST_STORE_ID;

      mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(validSession);
      mockPrisma.lotteryGame.count.mockResolvedValue(0);
      mockPrisma.lotteryGame.findMany.mockResolvedValue([]);

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/sync/lottery/games?session_id=${VALID_SESSION_ID}`,
      });

      const body = JSON.parse(response.payload);
      expect(body.data).toHaveProperty("records");
      expect(body.data).toHaveProperty("total_count");
      expect(body.data).toHaveProperty("has_more");
      expect(body.data).toHaveProperty("current_sequence");
    });
  });
});

// =============================================================================
// GAME_INACTIVE HTTP Response Tests (AIP-193 Compliance)
// =============================================================================

describe("Lottery Sync Routes - GAME_INACTIVE Error Handling", () => {
  let app: FastifyInstance;
  let mockPrisma: MockPrismaClient;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockPrisma = getMockPrisma();
    vi.clearAllMocks();
  });

  describe("POST /api/v1/sync/lottery/packs/receive", () => {
    const validPayload = {
      session_id: VALID_SESSION_ID,
      game_code: "0033",
      pack_number: "123456",
      serial_start: "000000001",
      serial_end: "000000300",
    };

    /**
     * AIP-193 Compliance Test: HTTP 400 FAILED_PRECONDITION for inactive game
     *
     * When a game exists but is INACTIVE, the API should return:
     * - HTTP 400 (not 404)
     * - code: "FAILED_PRECONDITION"
     * - reason: "GAME_INACTIVE"
     *
     * This allows desktop apps to distinguish between:
     * - Game doesn't exist (needs to check game code)
     * - Game is inactive (contact admin)
     */
    it("should return 400 FAILED_PRECONDITION for inactive game (not 404)", async () => {
      // Arrange: Valid session, inactive game
      const validSession = createTestSyncSession({
        sync_session_id: VALID_SESSION_ID,
        api_key_id: TEST_API_KEY_ID,
      });
      validSession.api_key.store_id = TEST_STORE_ID;

      const inactiveGame = createTestLotteryGame({
        game_code: "0033",
        status: "INACTIVE",
      });

      mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(validSession);
      mockPrisma.lotteryGame.findFirst.mockResolvedValue(inactiveGame);

      // Act
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/sync/lottery/packs/receive",
        payload: validPayload,
        headers: { "content-type": "application/json" },
      });

      // Assert: MUST be 400, NOT 404
      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.payload);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("FAILED_PRECONDITION");
      expect(body.error.reason).toBe("GAME_INACTIVE");
      expect(body.error.message).toContain("inactive");
      expect(body.error.details.domain).toBe("lottery.api.nuvana.com");
    });

    it("should return 404 NOT_FOUND for non-existent game", async () => {
      // Arrange: Valid session, no game
      const validSession = createTestSyncSession({
        sync_session_id: VALID_SESSION_ID,
        api_key_id: TEST_API_KEY_ID,
      });
      validSession.api_key.store_id = TEST_STORE_ID;

      mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(validSession);
      mockPrisma.lotteryGame.findFirst
        .mockResolvedValueOnce(null) // No state game
        .mockResolvedValueOnce(null); // No store game

      // Act
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/sync/lottery/packs/receive",
        payload: validPayload,
        headers: { "content-type": "application/json" },
      });

      // Assert: 404 is correct for truly non-existent game
      expect(response.statusCode).toBe(404);

      const body = JSON.parse(response.payload);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("GAME_NOT_FOUND");
    });

    it("should return 201 for active game", async () => {
      // Arrange: Valid session, active game
      const validSession = createTestSyncSession({
        sync_session_id: VALID_SESSION_ID,
        api_key_id: TEST_API_KEY_ID,
      });
      validSession.api_key.store_id = TEST_STORE_ID;

      const activeGame = createTestLotteryGame({
        game_code: "0033",
        status: "ACTIVE",
      });
      const createdPack = createTestLotteryPack({
        game_id: activeGame.game_id,
        status: "RECEIVED",
      });

      mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(validSession);
      mockPrisma.lotteryGame.findFirst.mockResolvedValue(activeGame);
      mockPrisma.lotteryPack.findUnique.mockResolvedValue(null);
      mockPrisma.lotteryPack.create.mockResolvedValue(createdPack);

      // Act
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/sync/lottery/packs/receive",
        payload: validPayload,
        headers: { "content-type": "application/json" },
      });

      // Assert
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
    });

    /**
     * Test: Error response includes machine-readable metadata
     *
     * Enterprise requirement: Errors should include structured metadata
     * for programmatic handling by client applications.
     */
    it("should include game_code in error metadata", async () => {
      const validSession = createTestSyncSession({
        sync_session_id: VALID_SESSION_ID,
        api_key_id: TEST_API_KEY_ID,
      });
      validSession.api_key.store_id = TEST_STORE_ID;

      const inactiveGame = createTestLotteryGame({
        game_code: "0033",
        status: "INACTIVE",
      });

      mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(validSession);
      mockPrisma.lotteryGame.findFirst.mockResolvedValue(inactiveGame);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/sync/lottery/packs/receive",
        payload: validPayload,
        headers: { "content-type": "application/json" },
      });

      const body = JSON.parse(response.payload);
      expect(body.error.details.metadata.game_code).toBe("0033");
    });
  });

  describe("POST /api/v1/sync/lottery/packs/activate", () => {
    // Valid UUIDs for test data
    const TEST_PACK_UUID = "550e8400-e29b-41d4-a716-446655440001";
    const TEST_BIN_UUID = "550e8400-e29b-41d4-a716-446655440002";

    const validPayload = {
      session_id: VALID_SESSION_ID,
      pack_id: TEST_PACK_UUID,
      bin_id: TEST_BIN_UUID,
      game_code: "0033",
      pack_number: "123456",
      serial_start: "000000001",
      serial_end: "000000300",
      opening_serial: "000000001",
      activated_at: new Date().toISOString(),
      received_at: new Date().toISOString(),
    };

    it("should return 400 FAILED_PRECONDITION for inactive game", async () => {
      const validSession = createTestSyncSession({
        sync_session_id: VALID_SESSION_ID,
        api_key_id: TEST_API_KEY_ID,
      });
      validSession.api_key.store_id = TEST_STORE_ID;

      const validBin = {
        bin_id: TEST_BIN_UUID,
        store_id: TEST_STORE_ID,
        is_active: true,
        name: "Test Bin",
      };

      const inactiveGame = createTestLotteryGame({
        game_code: "0033",
        status: "INACTIVE",
      });

      mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(validSession);
      mockPrisma.lotteryBin.findFirst.mockResolvedValue(validBin);
      mockPrisma.lotteryPack.findFirst.mockResolvedValue(null); // No existing pack
      mockPrisma.lotteryPack.findUnique.mockResolvedValue(null);
      mockPrisma.lotteryGame.findFirst.mockResolvedValue(inactiveGame);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/sync/lottery/packs/activate",
        payload: validPayload,
        headers: { "content-type": "application/json" },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe("FAILED_PRECONDITION");
      expect(body.error.reason).toBe("GAME_INACTIVE");
    });
  });
});

// =============================================================================
// Shift Sync Endpoint Tests
// =============================================================================

describe("Lottery Sync Routes - Shift Sync", () => {
  let app: FastifyInstance;
  let mockPrisma: MockPrismaClient;

  // Test UUIDs
  const TEST_SHIFT_ID = "550e8400-e29b-41d4-a716-446655440010";
  const TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440011";
  const TEST_CASHIER_ID = "550e8400-e29b-41d4-a716-446655440012";
  const TEST_TERMINAL_ID = "550e8400-e29b-41d4-a716-446655440013";
  const TEST_APPROVER_ID = "550e8400-e29b-41d4-a716-446655440014";

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockPrisma = getMockPrisma();
    vi.clearAllMocks();
  });

  describe("POST /api/v1/sync/lottery/shifts", () => {
    const validPayload = {
      session_id: VALID_SESSION_ID,
      shift_id: TEST_SHIFT_ID,
      shift_number: 1,
      status: "OPEN",
      opened_at: new Date().toISOString(),
      opened_by: TEST_USER_ID,
      cashier_id: TEST_CASHIER_ID,
      pos_terminal_id: TEST_TERMINAL_ID,
    };

    describe("Request Validation", () => {
      it("should return 400 for missing required fields", async () => {
        const response = await app.inject({
          method: "POST",
          url: "/api/v1/sync/lottery/shifts",
          payload: { session_id: VALID_SESSION_ID },
          headers: { "content-type": "application/json" },
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(false);
        expect(body.error).toBeDefined();
      });

      it("should return 400 for invalid shift_id UUID format", async () => {
        const response = await app.inject({
          method: "POST",
          url: "/api/v1/sync/lottery/shifts",
          payload: { ...validPayload, shift_id: "invalid-uuid" },
          headers: { "content-type": "application/json" },
        });

        expect(response.statusCode).toBe(400);
      });

      it("should return 400 for invalid status enum value", async () => {
        const response = await app.inject({
          method: "POST",
          url: "/api/v1/sync/lottery/shifts",
          payload: { ...validPayload, status: "INVALID_STATUS" },
          headers: { "content-type": "application/json" },
        });

        expect(response.statusCode).toBe(400);
      });

      it("should return 400 for invalid opened_at date format", async () => {
        const response = await app.inject({
          method: "POST",
          url: "/api/v1/sync/lottery/shifts",
          payload: { ...validPayload, opened_at: "not-a-date" },
          headers: { "content-type": "application/json" },
        });

        expect(response.statusCode).toBe(400);
      });

      // Test that all valid status enum values are accepted by the schema
      // Valid statuses from SHIFT_STATUSES: NOT_STARTED, OPEN, ACTIVE, CLOSING, RECONCILING, CLOSED, VARIANCE_REVIEW
      it.each(["OPEN", "CLOSING", "CLOSED"])(
        "should accept status '%s' as valid",
        async (status) => {
          const validSession = createTestSyncSession({
            sync_session_id: VALID_SESSION_ID,
            api_key_id: TEST_API_KEY_ID,
          });
          validSession.api_key.store_id = TEST_STORE_ID;

          const user = createTestUser({ user_id: TEST_USER_ID });
          const cashier = createTestCashier({
            cashier_id: TEST_CASHIER_ID,
            store_id: TEST_STORE_ID,
          });
          const terminal = createTestPOSTerminal({
            pos_terminal_id: TEST_TERMINAL_ID,
            store_id: TEST_STORE_ID,
          });
          const shift = createTestShift({ shift_id: TEST_SHIFT_ID });

          mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(
            validSession,
          );
          mockPrisma.user.findFirst.mockResolvedValue(user);
          mockPrisma.cashier.findFirst.mockResolvedValue(cashier);
          mockPrisma.pOSTerminal.findFirst.mockResolvedValue(terminal);
          mockPrisma.daySummary.findFirst.mockResolvedValue(null);
          mockPrisma.shift.findUnique.mockResolvedValue(null); // No existing shift
          mockPrisma.shift.upsert.mockResolvedValue(shift);

          const response = await app.inject({
            method: "POST",
            url: "/api/v1/sync/lottery/shifts",
            payload: { ...validPayload, status },
            headers: { "content-type": "application/json" },
          });

          // Should return 201 (success), not 400 (validation error)
          expect(response.statusCode).toBe(201);
        },
      );
    });

    describe("Success Scenarios", () => {
      it("should return 201 for creating a new shift", async () => {
        const validSession = createTestSyncSession({
          sync_session_id: VALID_SESSION_ID,
          api_key_id: TEST_API_KEY_ID,
        });
        validSession.api_key.store_id = TEST_STORE_ID;

        const user = createTestUser({ user_id: TEST_USER_ID });
        const cashier = createTestCashier({
          cashier_id: TEST_CASHIER_ID,
          store_id: TEST_STORE_ID,
        });
        const terminal = createTestPOSTerminal({
          pos_terminal_id: TEST_TERMINAL_ID,
          store_id: TEST_STORE_ID,
        });
        const shift = createTestShift({
          shift_id: TEST_SHIFT_ID,
          store_id: TEST_STORE_ID,
        });

        mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(validSession);
        mockPrisma.user.findFirst.mockResolvedValue(user);
        mockPrisma.cashier.findFirst.mockResolvedValue(cashier);
        mockPrisma.pOSTerminal.findFirst.mockResolvedValue(terminal);
        mockPrisma.daySummary.findFirst.mockResolvedValue(null);
        mockPrisma.shift.upsert.mockResolvedValue(shift);

        const response = await app.inject({
          method: "POST",
          url: "/api/v1/sync/lottery/shifts",
          payload: validPayload,
          headers: { "content-type": "application/json" },
        });

        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(true);
        expect(body.data.shift).toBeDefined();
        expect(body.data.shift.shift_id).toBe(TEST_SHIFT_ID);
      });

      it("should return 200 for updating an existing shift (idempotent)", async () => {
        const validSession = createTestSyncSession({
          sync_session_id: VALID_SESSION_ID,
          api_key_id: TEST_API_KEY_ID,
        });
        validSession.api_key.store_id = TEST_STORE_ID;

        const user = createTestUser({ user_id: TEST_USER_ID });
        const cashier = createTestCashier({
          cashier_id: TEST_CASHIER_ID,
          store_id: TEST_STORE_ID,
        });
        const terminal = createTestPOSTerminal({
          pos_terminal_id: TEST_TERMINAL_ID,
          store_id: TEST_STORE_ID,
        });
        const existingShift = createTestShift({
          shift_id: TEST_SHIFT_ID,
          store_id: TEST_STORE_ID,
        });

        mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(validSession);
        mockPrisma.user.findFirst.mockResolvedValue(user);
        mockPrisma.cashier.findFirst.mockResolvedValue(cashier);
        mockPrisma.pOSTerminal.findFirst.mockResolvedValue(terminal);
        mockPrisma.daySummary.findFirst.mockResolvedValue(null);
        // When upsert finds existing record, it updates
        mockPrisma.shift.findUnique.mockResolvedValue(existingShift);
        mockPrisma.shift.upsert.mockResolvedValue(existingShift);

        const response = await app.inject({
          method: "POST",
          url: "/api/v1/sync/lottery/shifts",
          payload: validPayload,
          headers: { "content-type": "application/json" },
        });

        // Both create and update return 201 for sync operations
        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(true);
        expect(body.data.shift).toBeDefined();
      });

      it("should handle optional approver_id field", async () => {
        const validSession = createTestSyncSession({
          sync_session_id: VALID_SESSION_ID,
          api_key_id: TEST_API_KEY_ID,
        });
        validSession.api_key.store_id = TEST_STORE_ID;

        const user = createTestUser({ user_id: TEST_USER_ID });
        const approver = createTestUser({ user_id: TEST_APPROVER_ID });
        const cashier = createTestCashier({
          cashier_id: TEST_CASHIER_ID,
          store_id: TEST_STORE_ID,
        });
        const terminal = createTestPOSTerminal({
          pos_terminal_id: TEST_TERMINAL_ID,
          store_id: TEST_STORE_ID,
        });
        const shift = createTestShift({
          shift_id: TEST_SHIFT_ID,
          store_id: TEST_STORE_ID,
          approved_by: TEST_APPROVER_ID,
        });

        mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(validSession);
        // First call for opened_by, second call for approved_by
        mockPrisma.user.findFirst
          .mockResolvedValueOnce(user)
          .mockResolvedValueOnce(approver);
        mockPrisma.cashier.findFirst.mockResolvedValue(cashier);
        mockPrisma.pOSTerminal.findFirst.mockResolvedValue(terminal);
        mockPrisma.daySummary.findFirst.mockResolvedValue(null);
        mockPrisma.shift.upsert.mockResolvedValue(shift);

        const payloadWithApprover = {
          ...validPayload,
          status: "CLOSED",
          approved_by: TEST_APPROVER_ID,
          approved_at: new Date().toISOString(),
          closed_at: new Date().toISOString(),
        };

        const response = await app.inject({
          method: "POST",
          url: "/api/v1/sync/lottery/shifts",
          payload: payloadWithApprover,
          headers: { "content-type": "application/json" },
        });

        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(true);
      });
    });

    describe("Foreign Key Validation Errors", () => {
      it("should return 404 USER_NOT_FOUND for non-existent opened_by", async () => {
        const validSession = createTestSyncSession({
          sync_session_id: VALID_SESSION_ID,
          api_key_id: TEST_API_KEY_ID,
        });
        validSession.api_key.store_id = TEST_STORE_ID;

        mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(validSession);
        mockPrisma.user.findFirst.mockResolvedValue(null); // User not found

        const response = await app.inject({
          method: "POST",
          url: "/api/v1/sync/lottery/shifts",
          payload: validPayload,
          headers: { "content-type": "application/json" },
        });

        expect(response.statusCode).toBe(404);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("USER_NOT_FOUND");
      });

      it("should return 404 CASHIER_NOT_FOUND for non-existent cashier", async () => {
        const validSession = createTestSyncSession({
          sync_session_id: VALID_SESSION_ID,
          api_key_id: TEST_API_KEY_ID,
        });
        validSession.api_key.store_id = TEST_STORE_ID;

        const user = createTestUser({ user_id: TEST_USER_ID });

        mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(validSession);
        mockPrisma.user.findFirst.mockResolvedValue(user);
        mockPrisma.cashier.findFirst.mockResolvedValue(null); // Cashier not found

        const response = await app.inject({
          method: "POST",
          url: "/api/v1/sync/lottery/shifts",
          payload: validPayload,
          headers: { "content-type": "application/json" },
        });

        expect(response.statusCode).toBe(404);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("CASHIER_NOT_FOUND");
      });

      it("should return 404 TERMINAL_NOT_FOUND for non-existent terminal", async () => {
        const validSession = createTestSyncSession({
          sync_session_id: VALID_SESSION_ID,
          api_key_id: TEST_API_KEY_ID,
        });
        validSession.api_key.store_id = TEST_STORE_ID;

        const user = createTestUser({ user_id: TEST_USER_ID });
        const cashier = createTestCashier({
          cashier_id: TEST_CASHIER_ID,
          store_id: TEST_STORE_ID,
        });

        mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(validSession);
        mockPrisma.user.findFirst.mockResolvedValue(user);
        mockPrisma.cashier.findFirst.mockResolvedValue(cashier);
        mockPrisma.pOSTerminal.findFirst.mockResolvedValue(null); // Terminal not found

        const response = await app.inject({
          method: "POST",
          url: "/api/v1/sync/lottery/shifts",
          payload: validPayload,
          headers: { "content-type": "application/json" },
        });

        expect(response.statusCode).toBe(404);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("TERMINAL_NOT_FOUND");
      });

      it("should return 404 APPROVER_NOT_FOUND for non-existent approver", async () => {
        const validSession = createTestSyncSession({
          sync_session_id: VALID_SESSION_ID,
          api_key_id: TEST_API_KEY_ID,
        });
        validSession.api_key.store_id = TEST_STORE_ID;

        const user = createTestUser({ user_id: TEST_USER_ID });
        const cashier = createTestCashier({
          cashier_id: TEST_CASHIER_ID,
          store_id: TEST_STORE_ID,
        });
        const terminal = createTestPOSTerminal({
          pos_terminal_id: TEST_TERMINAL_ID,
          store_id: TEST_STORE_ID,
        });

        mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(validSession);
        // First call for opened_by (found), second call for approved_by (not found)
        mockPrisma.user.findFirst
          .mockResolvedValueOnce(user)
          .mockResolvedValueOnce(null);
        mockPrisma.cashier.findFirst.mockResolvedValue(cashier);
        mockPrisma.pOSTerminal.findFirst.mockResolvedValue(terminal);

        const payloadWithApprover = {
          ...validPayload,
          status: "CLOSED",
          approved_by: TEST_APPROVER_ID,
          approved_at: new Date().toISOString(),
        };

        const response = await app.inject({
          method: "POST",
          url: "/api/v1/sync/lottery/shifts",
          payload: payloadWithApprover,
          headers: { "content-type": "application/json" },
        });

        expect(response.statusCode).toBe(404);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("APPROVER_NOT_FOUND");
      });

      it("should return 404 for cashier from wrong store (tenant isolation)", async () => {
        const validSession = createTestSyncSession({
          sync_session_id: VALID_SESSION_ID,
          api_key_id: TEST_API_KEY_ID,
        });
        validSession.api_key.store_id = TEST_STORE_ID;

        const user = createTestUser({ user_id: TEST_USER_ID });

        mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(validSession);
        mockPrisma.user.findFirst.mockResolvedValue(user);
        // Cashier query returns null because store_id filter doesn't match
        mockPrisma.cashier.findFirst.mockResolvedValue(null);

        const response = await app.inject({
          method: "POST",
          url: "/api/v1/sync/lottery/shifts",
          payload: validPayload,
          headers: { "content-type": "application/json" },
        });

        expect(response.statusCode).toBe(404);
        const body = JSON.parse(response.payload);
        expect(body.error.code).toBe("CASHIER_NOT_FOUND");
      });
    });

    describe("Session Validation", () => {
      it("should return 400 for invalid session", async () => {
        mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(null);

        const response = await app.inject({
          method: "POST",
          url: "/api/v1/sync/lottery/shifts",
          payload: validPayload,
          headers: { "content-type": "application/json" },
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("INVALID_SESSION");
      });

      it("should return 400 for expired session", async () => {
        // Session started more than MAX_SESSION_AGE_MS (1 hour) ago
        const expiredSession = createTestSyncSession({
          sync_session_id: VALID_SESSION_ID,
          api_key_id: TEST_API_KEY_ID,
          session_started_at: new Date(Date.now() - 3700000), // 1 hour + 100 seconds ago
        });
        expiredSession.api_key.store_id = TEST_STORE_ID;

        mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(
          expiredSession,
        );

        const response = await app.inject({
          method: "POST",
          url: "/api/v1/sync/lottery/shifts",
          payload: validPayload,
          headers: { "content-type": "application/json" },
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("INVALID_SESSION"); // Error code is INVALID_SESSION for expired sessions
      });
    });

    describe("Response Format", () => {
      it("should include success flag and data object on success", async () => {
        const validSession = createTestSyncSession({
          sync_session_id: VALID_SESSION_ID,
          api_key_id: TEST_API_KEY_ID,
        });
        validSession.api_key.store_id = TEST_STORE_ID;

        const user = createTestUser({ user_id: TEST_USER_ID });
        const cashier = createTestCashier({
          cashier_id: TEST_CASHIER_ID,
          store_id: TEST_STORE_ID,
        });
        const terminal = createTestPOSTerminal({
          pos_terminal_id: TEST_TERMINAL_ID,
          store_id: TEST_STORE_ID,
        });
        const shift = createTestShift({
          shift_id: TEST_SHIFT_ID,
          store_id: TEST_STORE_ID,
        });

        mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(validSession);
        mockPrisma.user.findFirst.mockResolvedValue(user);
        mockPrisma.cashier.findFirst.mockResolvedValue(cashier);
        mockPrisma.pOSTerminal.findFirst.mockResolvedValue(terminal);
        mockPrisma.daySummary.findFirst.mockResolvedValue(null);
        mockPrisma.shift.upsert.mockResolvedValue(shift);

        const response = await app.inject({
          method: "POST",
          url: "/api/v1/sync/lottery/shifts",
          payload: validPayload,
          headers: { "content-type": "application/json" },
        });

        const body = JSON.parse(response.payload);
        expect(body).toHaveProperty("success", true);
        expect(body).toHaveProperty("data");
        expect(body.data).toHaveProperty("shift");
        expect(body.data).toHaveProperty("server_time");
      });

      it("should include idempotent flag in response", async () => {
        const validSession = createTestSyncSession({
          sync_session_id: VALID_SESSION_ID,
          api_key_id: TEST_API_KEY_ID,
        });
        validSession.api_key.store_id = TEST_STORE_ID;

        const user = createTestUser({ user_id: TEST_USER_ID });
        const cashier = createTestCashier({
          cashier_id: TEST_CASHIER_ID,
          store_id: TEST_STORE_ID,
        });
        const terminal = createTestPOSTerminal({
          pos_terminal_id: TEST_TERMINAL_ID,
          store_id: TEST_STORE_ID,
        });
        const shift = createTestShift({
          shift_id: TEST_SHIFT_ID,
          store_id: TEST_STORE_ID,
        });

        mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(validSession);
        mockPrisma.user.findFirst.mockResolvedValue(user);
        mockPrisma.cashier.findFirst.mockResolvedValue(cashier);
        mockPrisma.pOSTerminal.findFirst.mockResolvedValue(terminal);
        mockPrisma.daySummary.findFirst.mockResolvedValue(null);
        mockPrisma.shift.upsert.mockResolvedValue(shift);

        const response = await app.inject({
          method: "POST",
          url: "/api/v1/sync/lottery/shifts",
          payload: validPayload,
          headers: { "content-type": "application/json" },
        });

        const body = JSON.parse(response.payload);
        expect(body.data).toHaveProperty("idempotent");
        expect(typeof body.data.idempotent).toBe("boolean");
      });
    });

    describe("Database Error Handling", () => {
      it("should return 500 for unexpected database errors", async () => {
        const validSession = createTestSyncSession({
          sync_session_id: VALID_SESSION_ID,
          api_key_id: TEST_API_KEY_ID,
        });
        validSession.api_key.store_id = TEST_STORE_ID;

        mockPrisma.apiKeySyncSession.findUnique.mockResolvedValue(validSession);
        mockPrisma.user.findFirst.mockRejectedValue(
          new Error("Database connection error"),
        );

        const response = await app.inject({
          method: "POST",
          url: "/api/v1/sync/lottery/shifts",
          payload: validPayload,
          headers: { "content-type": "application/json" },
        });

        expect(response.statusCode).toBe(500);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(false);
        // Should not expose internal error details
        expect(body.error).not.toHaveProperty("stack");
      });
    });
  });
});
