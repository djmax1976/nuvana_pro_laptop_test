/**
 * Cashier Sync Service Unit Tests
 *
 * Unit tests for cashier data synchronization service following enterprise
 * POS patterns (NCR Aloha, Microsoft Dynamics 365, Oracle MICROS).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * TRACEABILITY MATRIX
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * | Test ID           | Requirement                              | Category      | Priority |
 * |-------------------|------------------------------------------|---------------|----------|
 * | CSYNC-U-001       | Session validation - valid session       | Validation    | P0       |
 * | CSYNC-U-002       | Session validation - not found           | Validation    | P0       |
 * | CSYNC-U-003       | Session validation - wrong owner         | Security      | P0       |
 * | CSYNC-U-004       | Session validation - inactive session    | Validation    | P0       |
 * | CSYNC-U-005       | Session validation - expired session     | Validation    | P0       |
 * | CSYNC-U-006       | Get cashiers - store isolation           | Security      | P0       |
 * | CSYNC-U-007       | Get cashiers - delta sync timestamp      | Business      | P1       |
 * | CSYNC-U-008       | Get cashiers - delta sync sequence       | Business      | P1       |
 * | CSYNC-U-009       | Get cashiers - include inactive          | Business      | P1       |
 * | CSYNC-U-010       | Get cashiers - exclude inactive default  | Business      | P1       |
 * | CSYNC-U-011       | Get cashiers - pagination limit          | Business      | P1       |
 * | CSYNC-U-012       | Get cashiers - max limit enforcement     | Validation    | P1       |
 * | CSYNC-U-013       | Get cashiers - hasMore flag true         | Business      | P2       |
 * | CSYNC-U-014       | Get cashiers - hasMore flag false        | Business      | P2       |
 * | CSYNC-U-015       | Get cashiers - sync sequence generation  | Business      | P1       |
 * | CSYNC-U-016       | Get cashiers - next cursor calculation   | Business      | P2       |
 * | CSYNC-U-017       | Get cashiers - PIN hash included         | Security      | P0       |
 * | CSYNC-U-018       | Get cashiers - empty store               | Edge Case     | P2       |
 * | CSYNC-U-019       | Store mismatch detection                 | Security      | P0       |
 * | CSYNC-U-020       | Sync stats calculation                   | Business      | P2       |
 * | CSYNC-U-021       | Get by employee ID - found               | Business      | P1       |
 * | CSYNC-U-022       | Get by employee ID - not found           | Business      | P1       |
 * | CSYNC-U-023       | Sync response structure                  | Contract      | P0       |
 * | CSYNC-U-024       | Cashier record structure                 | Contract      | P0       |
 * | CSYNC-U-025       | Server time in response                  | Contract      | P1       |
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * @test-level Unit
 * @justification Unit tests for cashier sync service logic with mocked dependencies
 * @story CASHIER-SYNC-OFFLINE-AUTH
 * @priority P0 (Critical - Offline authentication enablement)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type {
  CashierSyncRecord,
  CashierSyncResponse,
} from "../../backend/src/types/api-key.types";

// ============================================================================
// Mock Setup
// ============================================================================

// Mock Prisma client
const mockPrismaClient = {
  apiKeySyncSession: {
    findUnique: vi.fn(),
  },
  cashier: {
    count: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  apiKeyAuditEvent: {
    create: vi.fn(),
  },
};

// Mock the db module
vi.mock("../../backend/src/utils/db", () => ({
  prisma: mockPrismaClient,
}));

// Mock audit service
vi.mock("../../backend/src/services/api-key/api-key-audit.service", () => ({
  apiKeyAuditService: {
    logCustomEvent: vi.fn().mockResolvedValue(undefined),
  },
}));

// ============================================================================
// Test Data Factories
// ============================================================================

const createMockApiKeyIdentity = (overrides = {}) => ({
  apiKeyId: "test-api-key-id-123",
  storeId: "test-store-id-456",
  storeName: "Test Store",
  storePublicId: "str_teststore123",
  companyId: "test-company-id-789",
  companyName: "Test Company",
  timezone: "America/New_York",
  offlinePermissions: ["SHIFT_OPEN", "TRANSACTION_CREATE"],
  metadata: {},
  isElevated: false as const,
  ...overrides,
});

const createMockSyncSession = (overrides = {}) => ({
  sync_session_id: "test-session-id-abc",
  api_key_id: "test-api-key-id-123",
  session_started_at: new Date(Date.now() - 60000), // 1 minute ago
  sync_status: "ACTIVE",
  api_key: {
    store_id: "test-store-id-456",
  },
  ...overrides,
});

const createMockCashier = (overrides = {}) => ({
  cashier_id: `cashier-${Math.random().toString(36).substr(2, 9)}`,
  employee_id: "0001",
  name: "John Doe",
  pin_hash: "$2a$10$testHashValue12345678901234567890",
  is_active: true,
  disabled_at: null,
  updated_at: new Date(),
  created_at: new Date(),
  ...overrides,
});

// ============================================================================
// Helper: Transform cashier to expected sync record format
// ============================================================================

const transformToSyncRecord = (
  cashier: ReturnType<typeof createMockCashier>,
  sequence: number,
): CashierSyncRecord => ({
  cashierId: cashier.cashier_id,
  employeeId: cashier.employee_id,
  name: cashier.name,
  pinHash: cashier.pin_hash,
  isActive: cashier.is_active,
  disabledAt: cashier.disabled_at?.toISOString() || null,
  updatedAt: cashier.updated_at.toISOString(),
  syncSequence: sequence,
});

// ============================================================================
// Tests
// ============================================================================

describe("Cashier Sync Service Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ==========================================================================
  // SESSION VALIDATION TESTS
  // ==========================================================================

  describe("Session Validation", () => {
    it("CSYNC-U-001: [P0] should validate active session successfully", async () => {
      // GIVEN: A valid active sync session exists
      const mockSession = createMockSyncSession();
      mockPrismaClient.apiKeySyncSession.findUnique.mockResolvedValue(
        mockSession,
      );

      // Import service after mocks are set up
      const { cashierSyncService } =
        await import("../../backend/src/services/api-key/cashier-sync.service");

      // WHEN: Validating the session
      const result = await cashierSyncService.validateSyncSession(
        mockSession.sync_session_id,
        mockSession.api_key_id,
      );

      // THEN: Session is validated successfully
      expect(result.syncSessionId).toBe(mockSession.sync_session_id);
      expect(result.storeId).toBe(mockSession.api_key.store_id);
    });

    it("CSYNC-U-002: [P0] should reject non-existent session", async () => {
      // GIVEN: Session does not exist
      mockPrismaClient.apiKeySyncSession.findUnique.mockResolvedValue(null);

      const { cashierSyncService } =
        await import("../../backend/src/services/api-key/cashier-sync.service");

      // WHEN: Validating non-existent session
      // THEN: Error is thrown
      await expect(
        cashierSyncService.validateSyncSession(
          "non-existent-session",
          "any-key",
        ),
      ).rejects.toThrow("INVALID_SESSION: Sync session not found");
    });

    it("CSYNC-U-003: [P0] should reject session owned by different API key", async () => {
      // GIVEN: Session exists but belongs to different API key
      const mockSession = createMockSyncSession({
        api_key_id: "different-api-key-id",
      });
      mockPrismaClient.apiKeySyncSession.findUnique.mockResolvedValue(
        mockSession,
      );

      const { cashierSyncService } =
        await import("../../backend/src/services/api-key/cashier-sync.service");

      // WHEN: Validating with wrong API key
      // THEN: Error is thrown
      await expect(
        cashierSyncService.validateSyncSession(
          mockSession.sync_session_id,
          "requesting-api-key",
        ),
      ).rejects.toThrow(
        "INVALID_SESSION: Session does not belong to this API key",
      );
    });

    it("CSYNC-U-004: [P0] should reject inactive session", async () => {
      // GIVEN: Session exists but is not active
      const mockSession = createMockSyncSession({
        sync_status: "COMPLETED",
      });
      mockPrismaClient.apiKeySyncSession.findUnique.mockResolvedValue(
        mockSession,
      );

      const { cashierSyncService } =
        await import("../../backend/src/services/api-key/cashier-sync.service");

      // WHEN: Validating inactive session
      // THEN: Error is thrown
      await expect(
        cashierSyncService.validateSyncSession(
          mockSession.sync_session_id,
          mockSession.api_key_id,
        ),
      ).rejects.toThrow("INVALID_SESSION: Sync session is not active");
    });

    it("CSYNC-U-005: [P0] should reject expired session (older than 1 hour)", async () => {
      // GIVEN: Session is older than 1 hour
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const mockSession = createMockSyncSession({
        session_started_at: twoHoursAgo,
      });
      mockPrismaClient.apiKeySyncSession.findUnique.mockResolvedValue(
        mockSession,
      );

      const { cashierSyncService } =
        await import("../../backend/src/services/api-key/cashier-sync.service");

      // WHEN: Validating expired session
      // THEN: Error is thrown
      await expect(
        cashierSyncService.validateSyncSession(
          mockSession.sync_session_id,
          mockSession.api_key_id,
        ),
      ).rejects.toThrow("INVALID_SESSION: Sync session has expired");
    });
  });

  // ==========================================================================
  // CASHIER RETRIEVAL TESTS
  // ==========================================================================

  describe("Get Cashiers for Sync", () => {
    it("CSYNC-U-006: [P0] should only return cashiers for the specified store", async () => {
      // GIVEN: Multiple stores with cashiers exist
      const storeId = "target-store-id";
      const storeCashiers = [
        createMockCashier({ employee_id: "0001" }),
        createMockCashier({ employee_id: "0002" }),
      ];

      mockPrismaClient.cashier.count.mockResolvedValue(2);
      mockPrismaClient.cashier.findMany.mockResolvedValue(storeCashiers);

      const { cashierSyncService } =
        await import("../../backend/src/services/api-key/cashier-sync.service");

      // WHEN: Getting cashiers for sync
      const result = await cashierSyncService.getCashiersForSync(storeId);

      // THEN: Query is filtered by store_id
      expect(mockPrismaClient.cashier.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            store_id: storeId,
          }),
        }),
      );

      // AND: Correct number of cashiers returned
      expect(result.cashiers).toHaveLength(2);
    });

    it("CSYNC-U-007: [P1] should support delta sync by timestamp", async () => {
      // GIVEN: Since timestamp is provided
      const sinceTimestamp = new Date("2024-01-01T00:00:00Z");
      const storeId = "test-store";

      mockPrismaClient.cashier.count.mockResolvedValue(1);
      mockPrismaClient.cashier.findMany.mockResolvedValue([
        createMockCashier(),
      ]);

      const { cashierSyncService } =
        await import("../../backend/src/services/api-key/cashier-sync.service");

      // WHEN: Getting cashiers with since timestamp
      await cashierSyncService.getCashiersForSync(storeId, { sinceTimestamp });

      // THEN: Query filters by updated_at > sinceTimestamp
      expect(mockPrismaClient.cashier.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            updated_at: { gt: sinceTimestamp },
          }),
        }),
      );
    });

    it("CSYNC-U-009: [P1] should include inactive cashiers when requested", async () => {
      // GIVEN: Include inactive flag is true
      const storeId = "test-store";
      const inactiveCashier = createMockCashier({
        is_active: false,
        disabled_at: new Date(),
      });

      mockPrismaClient.cashier.count.mockResolvedValue(1);
      mockPrismaClient.cashier.findMany.mockResolvedValue([inactiveCashier]);

      const { cashierSyncService } =
        await import("../../backend/src/services/api-key/cashier-sync.service");

      // WHEN: Getting cashiers including inactive
      const result = await cashierSyncService.getCashiersForSync(storeId, {
        includeInactive: true,
      });

      // THEN: Query does NOT filter by disabled_at
      expect(mockPrismaClient.cashier.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            disabled_at: null,
          }),
        }),
      );

      // AND: Inactive cashier is included
      expect(result.cashiers[0].isActive).toBe(false);
      expect(result.cashiers[0].disabledAt).not.toBeNull();
    });

    it("CSYNC-U-010: [P1] should exclude inactive cashiers by default", async () => {
      // GIVEN: Include inactive flag is not specified
      const storeId = "test-store";

      mockPrismaClient.cashier.count.mockResolvedValue(1);
      mockPrismaClient.cashier.findMany.mockResolvedValue([
        createMockCashier(),
      ]);

      const { cashierSyncService } =
        await import("../../backend/src/services/api-key/cashier-sync.service");

      // WHEN: Getting cashiers without specifying includeInactive
      await cashierSyncService.getCashiersForSync(storeId);

      // THEN: Query filters by disabled_at IS NULL
      expect(mockPrismaClient.cashier.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            disabled_at: null,
          }),
        }),
      );
    });

    it("CSYNC-U-011: [P1] should respect pagination limit", async () => {
      // GIVEN: Limit is specified
      const storeId = "test-store";
      const limit = 50;

      mockPrismaClient.cashier.count.mockResolvedValue(100);
      mockPrismaClient.cashier.findMany.mockResolvedValue(
        Array(51)
          .fill(null)
          .map((_, i) =>
            createMockCashier({ employee_id: String(i).padStart(4, "0") }),
          ),
      );

      const { cashierSyncService } =
        await import("../../backend/src/services/api-key/cashier-sync.service");

      // WHEN: Getting cashiers with limit
      const result = await cashierSyncService.getCashiersForSync(storeId, {
        limit,
      });

      // THEN: Query uses limit + 1 (to check for hasMore)
      expect(mockPrismaClient.cashier.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: limit + 1,
        }),
      );

      // AND: Response respects the limit
      expect(result.cashiers.length).toBeLessThanOrEqual(limit);
    });

    it("CSYNC-U-012: [P1] should enforce max limit of 500", async () => {
      // GIVEN: Limit exceeds maximum
      const storeId = "test-store";
      const requestedLimit = 1000;

      mockPrismaClient.cashier.count.mockResolvedValue(1);
      mockPrismaClient.cashier.findMany.mockResolvedValue([
        createMockCashier(),
      ]);

      const { cashierSyncService } =
        await import("../../backend/src/services/api-key/cashier-sync.service");

      // WHEN: Getting cashiers with excessive limit
      await cashierSyncService.getCashiersForSync(storeId, {
        limit: requestedLimit,
      });

      // THEN: Query uses max limit (500 + 1)
      expect(mockPrismaClient.cashier.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 501, // MAX_LIMIT (500) + 1
        }),
      );
    });

    it("CSYNC-U-013: [P2] should set hasMore true when more records exist", async () => {
      // GIVEN: More records exist than limit
      const storeId = "test-store";
      const limit = 2;
      const cashiers = [
        createMockCashier({ employee_id: "0001" }),
        createMockCashier({ employee_id: "0002" }),
        createMockCashier({ employee_id: "0003" }), // Extra record indicates more exist
      ];

      mockPrismaClient.cashier.count.mockResolvedValue(10);
      mockPrismaClient.cashier.findMany.mockResolvedValue(cashiers);

      const { cashierSyncService } =
        await import("../../backend/src/services/api-key/cashier-sync.service");

      // WHEN: Getting cashiers with limit
      const result = await cashierSyncService.getCashiersForSync(storeId, {
        limit,
      });

      // THEN: hasMore is true
      expect(result.hasMore).toBe(true);
      // AND: Only limit records are returned
      expect(result.cashiers).toHaveLength(limit);
    });

    it("CSYNC-U-014: [P2] should set hasMore false when no more records exist", async () => {
      // GIVEN: Fewer records than limit
      const storeId = "test-store";
      const limit = 100;
      const cashiers = [createMockCashier()];

      mockPrismaClient.cashier.count.mockResolvedValue(1);
      mockPrismaClient.cashier.findMany.mockResolvedValue(cashiers);

      const { cashierSyncService } =
        await import("../../backend/src/services/api-key/cashier-sync.service");

      // WHEN: Getting cashiers
      const result = await cashierSyncService.getCashiersForSync(storeId, {
        limit,
      });

      // THEN: hasMore is false
      expect(result.hasMore).toBe(false);
    });

    it("CSYNC-U-015: [P1] should generate sequential sync sequence numbers", async () => {
      // GIVEN: Multiple cashiers to sync
      const storeId = "test-store";
      const startSequence = 5;
      const cashiers = [
        createMockCashier({ employee_id: "0001" }),
        createMockCashier({ employee_id: "0002" }),
        createMockCashier({ employee_id: "0003" }),
      ];

      mockPrismaClient.cashier.count.mockResolvedValue(3);
      mockPrismaClient.cashier.findMany.mockResolvedValue(cashiers);

      const { cashierSyncService } =
        await import("../../backend/src/services/api-key/cashier-sync.service");

      // WHEN: Getting cashiers with starting sequence
      const result = await cashierSyncService.getCashiersForSync(storeId, {
        sinceSequence: startSequence,
      });

      // THEN: Sequence numbers are sequential from startSequence + 1
      expect(result.cashiers[0].syncSequence).toBe(6);
      expect(result.cashiers[1].syncSequence).toBe(7);
      expect(result.cashiers[2].syncSequence).toBe(8);
    });

    it("CSYNC-U-016: [P2] should calculate next cursor when hasMore is true", async () => {
      // GIVEN: More records exist
      const storeId = "test-store";
      const limit = 2;
      const cashiers = [
        createMockCashier({ employee_id: "0001" }),
        createMockCashier({ employee_id: "0002" }),
        createMockCashier({ employee_id: "0003" }), // Extra indicates more
      ];

      mockPrismaClient.cashier.count.mockResolvedValue(10);
      mockPrismaClient.cashier.findMany.mockResolvedValue(cashiers);

      const { cashierSyncService } =
        await import("../../backend/src/services/api-key/cashier-sync.service");

      // WHEN: Getting cashiers
      const result = await cashierSyncService.getCashiersForSync(storeId, {
        limit,
      });

      // THEN: nextCursor equals last returned sequence
      expect(result.nextCursor).toBe(result.currentSequence);
    });

    it("CSYNC-U-017: [P0] should include bcrypt PIN hash in response", async () => {
      // GIVEN: Cashier with PIN hash
      const pinHash = "$2a$10$abcdef1234567890abcdef1234567890";
      const cashier = createMockCashier({ pin_hash: pinHash });

      mockPrismaClient.cashier.count.mockResolvedValue(1);
      mockPrismaClient.cashier.findMany.mockResolvedValue([cashier]);

      const { cashierSyncService } =
        await import("../../backend/src/services/api-key/cashier-sync.service");

      // WHEN: Getting cashiers for sync
      const result = await cashierSyncService.getCashiersForSync("test-store");

      // THEN: PIN hash is included in response
      expect(result.cashiers[0].pinHash).toBe(pinHash);
      // AND: It's a bcrypt hash (starts with $2)
      expect(result.cashiers[0].pinHash).toMatch(/^\$2[aby]?\$/);
    });

    it("CSYNC-U-018: [P2] should handle store with no cashiers", async () => {
      // GIVEN: Store has no cashiers
      mockPrismaClient.cashier.count.mockResolvedValue(0);
      mockPrismaClient.cashier.findMany.mockResolvedValue([]);

      const { cashierSyncService } =
        await import("../../backend/src/services/api-key/cashier-sync.service");

      // WHEN: Getting cashiers
      const result = await cashierSyncService.getCashiersForSync("empty-store");

      // THEN: Empty response with appropriate metadata
      expect(result.cashiers).toHaveLength(0);
      expect(result.totalCount).toBe(0);
      expect(result.hasMore).toBe(false);
      expect(result.currentSequence).toBe(0);
    });
  });

  // ==========================================================================
  // SECURITY TESTS
  // ==========================================================================

  describe("Security Controls", () => {
    it("CSYNC-U-019: [P0] should detect store mismatch between session and identity", async () => {
      // GIVEN: Session store doesn't match identity store
      const mockSession = createMockSyncSession({
        api_key: { store_id: "different-store-id" },
      });
      mockPrismaClient.apiKeySyncSession.findUnique.mockResolvedValue(
        mockSession,
      );

      const identity = createMockApiKeyIdentity({
        storeId: "identity-store-id",
      });

      const { cashierSyncService } =
        await import("../../backend/src/services/api-key/cashier-sync.service");

      // WHEN: Syncing cashiers
      // THEN: Store mismatch error is thrown
      await expect(
        cashierSyncService.syncCashiers(
          identity,
          mockSession.sync_session_id,
          {},
          {
            apiKeyId: identity.apiKeyId,
            sessionId: mockSession.sync_session_id,
            ipAddress: "127.0.0.1",
          },
        ),
      ).rejects.toThrow("STORE_MISMATCH");
    });
  });

  // ==========================================================================
  // HELPER FUNCTION TESTS
  // ==========================================================================

  describe("Get Cashier by Employee ID", () => {
    it("CSYNC-U-021: [P1] should return cashier when found", async () => {
      // GIVEN: Cashier exists with given employee ID
      const cashier = createMockCashier({ employee_id: "1234" });
      mockPrismaClient.cashier.findFirst.mockResolvedValue(cashier);

      const { cashierSyncService } =
        await import("../../backend/src/services/api-key/cashier-sync.service");

      // WHEN: Getting cashier by employee ID
      const result = await cashierSyncService.getCashierByEmployeeId(
        "test-store",
        "1234",
      );

      // THEN: Cashier record is returned
      expect(result).not.toBeNull();
      expect(result?.employeeId).toBe("1234");
    });

    it("CSYNC-U-022: [P1] should return null when cashier not found", async () => {
      // GIVEN: No cashier with given employee ID
      mockPrismaClient.cashier.findFirst.mockResolvedValue(null);

      const { cashierSyncService } =
        await import("../../backend/src/services/api-key/cashier-sync.service");

      // WHEN: Getting non-existent cashier
      const result = await cashierSyncService.getCashierByEmployeeId(
        "test-store",
        "9999",
      );

      // THEN: Null is returned
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // RESPONSE STRUCTURE TESTS
  // ==========================================================================

  describe("Response Structure", () => {
    it("CSYNC-U-023: [P0] should return complete sync response structure", async () => {
      // GIVEN: Cashiers exist
      mockPrismaClient.cashier.count.mockResolvedValue(1);
      mockPrismaClient.cashier.findMany.mockResolvedValue([
        createMockCashier(),
      ]);

      const { cashierSyncService } =
        await import("../../backend/src/services/api-key/cashier-sync.service");

      // WHEN: Getting cashiers
      const result = await cashierSyncService.getCashiersForSync("test-store");

      // THEN: Response has all required fields
      expect(result).toHaveProperty("cashiers");
      expect(result).toHaveProperty("totalCount");
      expect(result).toHaveProperty("currentSequence");
      expect(result).toHaveProperty("hasMore");
      expect(result).toHaveProperty("serverTime");
      expect(Array.isArray(result.cashiers)).toBe(true);
      expect(typeof result.totalCount).toBe("number");
      expect(typeof result.currentSequence).toBe("number");
      expect(typeof result.hasMore).toBe("boolean");
      expect(typeof result.serverTime).toBe("string");
    });

    it("CSYNC-U-024: [P0] should return complete cashier record structure", async () => {
      // GIVEN: Cashier exists
      const cashier = createMockCashier();
      mockPrismaClient.cashier.count.mockResolvedValue(1);
      mockPrismaClient.cashier.findMany.mockResolvedValue([cashier]);

      const { cashierSyncService } =
        await import("../../backend/src/services/api-key/cashier-sync.service");

      // WHEN: Getting cashiers
      const result = await cashierSyncService.getCashiersForSync("test-store");
      const record = result.cashiers[0];

      // THEN: Record has all required fields
      expect(record).toHaveProperty("cashierId");
      expect(record).toHaveProperty("employeeId");
      expect(record).toHaveProperty("name");
      expect(record).toHaveProperty("pinHash");
      expect(record).toHaveProperty("isActive");
      expect(record).toHaveProperty("disabledAt");
      expect(record).toHaveProperty("updatedAt");
      expect(record).toHaveProperty("syncSequence");

      // Type validations
      expect(typeof record.cashierId).toBe("string");
      expect(typeof record.employeeId).toBe("string");
      expect(typeof record.name).toBe("string");
      expect(typeof record.pinHash).toBe("string");
      expect(typeof record.isActive).toBe("boolean");
      expect(typeof record.syncSequence).toBe("number");
    });

    it("CSYNC-U-025: [P1] should include valid ISO 8601 server time", async () => {
      // GIVEN: Empty store
      mockPrismaClient.cashier.count.mockResolvedValue(0);
      mockPrismaClient.cashier.findMany.mockResolvedValue([]);

      const { cashierSyncService } =
        await import("../../backend/src/services/api-key/cashier-sync.service");

      // WHEN: Getting cashiers
      const result = await cashierSyncService.getCashiersForSync("test-store");

      // THEN: Server time is valid ISO 8601
      expect(result.serverTime).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
      // AND: It's a recent timestamp
      const serverDate = new Date(result.serverTime);
      const now = new Date();
      expect(serverDate.getTime()).toBeLessThanOrEqual(now.getTime());
      expect(serverDate.getTime()).toBeGreaterThan(now.getTime() - 5000); // Within 5 seconds
    });
  });

  // ==========================================================================
  // SYNC STATS TESTS
  // ==========================================================================

  describe("Sync Statistics", () => {
    it("CSYNC-U-020: [P2] should calculate correct sync stats", async () => {
      // GIVEN: Store with mixed active/inactive cashiers
      const storeId = "test-store";
      const lastUpdated = new Date("2024-01-15T12:00:00Z");

      mockPrismaClient.cashier.count
        .mockResolvedValueOnce(10) // Total
        .mockResolvedValueOnce(8); // Active
      mockPrismaClient.cashier.findFirst.mockResolvedValue({
        updated_at: lastUpdated,
      });

      const { cashierSyncService } =
        await import("../../backend/src/services/api-key/cashier-sync.service");

      // WHEN: Getting sync stats
      const stats = await cashierSyncService.getSyncStats(storeId);

      // THEN: Stats are calculated correctly
      expect(stats.totalCashiers).toBe(10);
      expect(stats.activeCashiers).toBe(8);
      expect(stats.inactiveCashiers).toBe(2);
      expect(stats.lastUpdated).toEqual(lastUpdated);
    });
  });
});
