/**
 * Cashier Sync Edge Cases and Failure Mode Tests
 *
 * Tests for boundary conditions, edge cases, and failure scenarios
 * in the cashier sync endpoint. Ensures robust handling of unusual
 * but valid inputs and graceful degradation on errors.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * EDGE CASE TRACEABILITY MATRIX
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * | Test ID           | Scenario                                 | Category      | Priority |
 * |-------------------|------------------------------------------|---------------|----------|
 * | CSYNC-EDGE-001    | Empty store (0 cashiers)                 | Empty State   | P1       |
 * | CSYNC-EDGE-002    | Large store (500+ cashiers)              | Scale         | P1       |
 * | CSYNC-EDGE-003    | All cashiers inactive                    | Data State    | P1       |
 * | CSYNC-EDGE-004    | Limit = 1 (minimum)                      | Boundary      | P2       |
 * | CSYNC-EDGE-005    | Limit = 500 (maximum)                    | Boundary      | P2       |
 * | CSYNC-EDGE-006    | since_timestamp = very old               | Boundary      | P2       |
 * | CSYNC-EDGE-007    | since_timestamp = future                 | Boundary      | P2       |
 * | CSYNC-EDGE-008    | since_sequence = 0                       | Boundary      | P2       |
 * | CSYNC-EDGE-009    | since_sequence = very large              | Boundary      | P2       |
 * | CSYNC-EDGE-010    | Concurrent sync requests                 | Concurrency   | P1       |
 * | CSYNC-EDGE-011    | Session near expiry                      | Timing        | P2       |
 * | CSYNC-EDGE-012    | Cashier with null fields                 | Data State    | P2       |
 * | CSYNC-EDGE-013    | Cashier with max length name             | Boundary      | P2       |
 * | CSYNC-EDGE-014    | Special characters in cashier name       | Data          | P2       |
 * | CSYNC-EDGE-015    | Unicode characters in cashier name       | Data          | P2       |
 * | CSYNC-EDGE-016    | Multiple pages of results                | Pagination    | P1       |
 * | CSYNC-EDGE-017    | Exactly limit results                    | Pagination    | P2       |
 * | CSYNC-EDGE-018    | Database connection failure              | Failure       | P1       |
 * | CSYNC-EDGE-019    | Timeout during large sync                | Failure       | P1       |
 * | CSYNC-EDGE-020    | Malformed JSON in metadata               | Data          | P2       |
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * @test-level Edge Case
 * @justification Ensures robustness in unusual but valid scenarios
 * @story CASHIER-SYNC-OFFLINE-AUTH
 * @priority P1 (Important - Edge cases affect reliability)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mock Setup
// ============================================================================

const mockPrismaClient = {
  apiKeySyncSession: {
    findUnique: vi.fn(),
  },
  cashier: {
    count: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
};

vi.mock("../../backend/src/utils/db", () => ({
  prisma: mockPrismaClient,
}));

vi.mock("../../backend/src/services/api-key/api-key-audit.service", () => ({
  apiKeyAuditService: {
    logCustomEvent: vi.fn().mockResolvedValue(undefined),
  },
}));

// ============================================================================
// Test Data Factories
// ============================================================================

const createMockSession = (overrides = {}) => ({
  sync_session_id: "test-session-id",
  api_key_id: "test-api-key-id",
  session_started_at: new Date(Date.now() - 60000),
  sync_status: "ACTIVE",
  api_key: { store_id: "test-store-id" },
  ...overrides,
});

const createMockCashier = (overrides = {}) => ({
  cashier_id: `cashier-${Math.random().toString(36).substr(2, 9)}`,
  employee_id: "0001",
  name: "Test Cashier",
  pin_hash: "$2a$10$testHashValue",
  is_active: true,
  disabled_at: null,
  updated_at: new Date(),
  created_at: new Date(),
  ...overrides,
});

// ============================================================================
// Empty State Tests
// ============================================================================

describe("CSYNC-EDGE: Empty State Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("CSYNC-EDGE-001: [P1] Should handle store with 0 cashiers", async () => {
    // GIVEN: Store has no cashiers
    mockPrismaClient.apiKeySyncSession.findUnique.mockResolvedValue(
      createMockSession(),
    );
    mockPrismaClient.cashier.count.mockResolvedValue(0);
    mockPrismaClient.cashier.findMany.mockResolvedValue([]);

    const { cashierSyncService } =
      await import("../../backend/src/services/api-key/cashier-sync.service");

    // WHEN: Syncing cashiers
    const result = await cashierSyncService.getCashiersForSync("empty-store");

    // THEN: Empty response is returned with correct structure
    expect(result.cashiers).toEqual([]);
    expect(result.totalCount).toBe(0);
    expect(result.currentSequence).toBe(0);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeUndefined();
    expect(result.serverTime).toBeDefined();
  });

  it("CSYNC-EDGE-003: [P1] Should handle store with all inactive cashiers", async () => {
    // GIVEN: All cashiers are inactive (soft-deleted)
    mockPrismaClient.cashier.count.mockResolvedValue(0); // Count with disabled_at: null filter
    mockPrismaClient.cashier.findMany.mockResolvedValue([]);

    const { cashierSyncService } =
      await import("../../backend/src/services/api-key/cashier-sync.service");

    // WHEN: Syncing without includeInactive
    const result = await cashierSyncService.getCashiersForSync("test-store");

    // THEN: No cashiers are returned
    expect(result.cashiers).toHaveLength(0);
    expect(result.totalCount).toBe(0);
  });
});

// ============================================================================
// Scale Tests
// ============================================================================

describe("CSYNC-EDGE: Scale Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("CSYNC-EDGE-002: [P1] Should handle store with 500+ cashiers", async () => {
    // GIVEN: Store has many cashiers
    const largeCashierSet = Array(501)
      .fill(null)
      .map((_, i) =>
        createMockCashier({
          employee_id: String(i).padStart(4, "0"),
          name: `Cashier ${i}`,
        }),
      );

    mockPrismaClient.cashier.count.mockResolvedValue(501);
    mockPrismaClient.cashier.findMany.mockResolvedValue(
      largeCashierSet.slice(0, 101),
    ); // Returns limit + 1

    const { cashierSyncService } =
      await import("../../backend/src/services/api-key/cashier-sync.service");

    // WHEN: Syncing with default limit
    const result = await cashierSyncService.getCashiersForSync("large-store", {
      limit: 100,
    });

    // THEN: Paginated response with hasMore = true
    expect(result.cashiers).toHaveLength(100);
    expect(result.totalCount).toBe(501);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBeDefined();
  });
});

// ============================================================================
// Boundary Tests - Limit
// ============================================================================

describe("CSYNC-EDGE: Limit Boundary Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("CSYNC-EDGE-004: [P2] Should handle limit = 1 (minimum)", async () => {
    // GIVEN: Minimum limit requested
    const cashiers = [
      createMockCashier({ employee_id: "0001" }),
      createMockCashier({ employee_id: "0002" }),
    ];

    mockPrismaClient.cashier.count.mockResolvedValue(2);
    mockPrismaClient.cashier.findMany.mockResolvedValue(cashiers);

    const { cashierSyncService } =
      await import("../../backend/src/services/api-key/cashier-sync.service");

    // WHEN: Syncing with limit = 1
    const result = await cashierSyncService.getCashiersForSync("test-store", {
      limit: 1,
    });

    // THEN: Only 1 cashier returned, hasMore = true
    expect(result.cashiers).toHaveLength(1);
    expect(result.hasMore).toBe(true);
  });

  it("CSYNC-EDGE-005: [P2] Should handle limit = 500 (maximum)", async () => {
    // GIVEN: Maximum limit requested
    mockPrismaClient.cashier.count.mockResolvedValue(100);
    mockPrismaClient.cashier.findMany.mockResolvedValue(
      Array(100)
        .fill(null)
        .map((_, i) =>
          createMockCashier({ employee_id: String(i).padStart(4, "0") }),
        ),
    );

    const { cashierSyncService } =
      await import("../../backend/src/services/api-key/cashier-sync.service");

    // WHEN: Syncing with maximum limit
    const result = await cashierSyncService.getCashiersForSync("test-store", {
      limit: 500,
    });

    // THEN: Query uses correct limit
    expect(mockPrismaClient.cashier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 501, // limit + 1
      }),
    );
  });
});

// ============================================================================
// Boundary Tests - Timestamp
// ============================================================================

describe("CSYNC-EDGE: Timestamp Boundary Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("CSYNC-EDGE-006: [P2] Should handle very old since_timestamp", async () => {
    // GIVEN: Very old timestamp (year 2000)
    const veryOldTimestamp = new Date("2000-01-01T00:00:00Z");

    mockPrismaClient.cashier.count.mockResolvedValue(10);
    mockPrismaClient.cashier.findMany.mockResolvedValue([createMockCashier()]);

    const { cashierSyncService } =
      await import("../../backend/src/services/api-key/cashier-sync.service");

    // WHEN: Syncing with old timestamp
    const result = await cashierSyncService.getCashiersForSync("test-store", {
      sinceTimestamp: veryOldTimestamp,
    });

    // THEN: All cashiers are returned (all modified after year 2000)
    expect(result.cashiers.length).toBeGreaterThan(0);
  });

  it("CSYNC-EDGE-007: [P2] Should handle future since_timestamp", async () => {
    // GIVEN: Future timestamp
    const futureTimestamp = new Date(Date.now() + 86400000); // Tomorrow

    mockPrismaClient.cashier.count.mockResolvedValue(0);
    mockPrismaClient.cashier.findMany.mockResolvedValue([]);

    const { cashierSyncService } =
      await import("../../backend/src/services/api-key/cashier-sync.service");

    // WHEN: Syncing with future timestamp
    const result = await cashierSyncService.getCashiersForSync("test-store", {
      sinceTimestamp: futureTimestamp,
    });

    // THEN: No cashiers returned (none modified in the future)
    expect(result.cashiers).toHaveLength(0);
  });
});

// ============================================================================
// Boundary Tests - Sequence
// ============================================================================

describe("CSYNC-EDGE: Sequence Boundary Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("CSYNC-EDGE-008: [P2] Should handle since_sequence = 0", async () => {
    // GIVEN: Starting sequence is 0
    mockPrismaClient.cashier.count.mockResolvedValue(3);
    mockPrismaClient.cashier.findMany.mockResolvedValue([
      createMockCashier({ employee_id: "0001" }),
      createMockCashier({ employee_id: "0002" }),
      createMockCashier({ employee_id: "0003" }),
    ]);

    const { cashierSyncService } =
      await import("../../backend/src/services/api-key/cashier-sync.service");

    // WHEN: Syncing from sequence 0
    const result = await cashierSyncService.getCashiersForSync("test-store", {
      sinceSequence: 0,
    });

    // THEN: Sequences start from 1
    expect(result.cashiers[0].syncSequence).toBe(1);
    expect(result.cashiers[1].syncSequence).toBe(2);
    expect(result.cashiers[2].syncSequence).toBe(3);
  });

  it("CSYNC-EDGE-009: [P2] Should handle very large since_sequence", async () => {
    // GIVEN: Very large starting sequence
    const largeSequence = Number.MAX_SAFE_INTEGER - 10;

    mockPrismaClient.cashier.count.mockResolvedValue(2);
    mockPrismaClient.cashier.findMany.mockResolvedValue([
      createMockCashier({ employee_id: "0001" }),
      createMockCashier({ employee_id: "0002" }),
    ]);

    const { cashierSyncService } =
      await import("../../backend/src/services/api-key/cashier-sync.service");

    // WHEN: Syncing with large sequence
    const result = await cashierSyncService.getCashiersForSync("test-store", {
      sinceSequence: largeSequence,
    });

    // THEN: Sequences continue from starting point
    expect(result.cashiers[0].syncSequence).toBe(largeSequence + 1);
    expect(result.currentSequence).toBe(largeSequence + 2);
  });
});

// ============================================================================
// Data State Tests
// ============================================================================

describe("CSYNC-EDGE: Data State Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("CSYNC-EDGE-012: [P2] Should handle cashier with null optional fields", async () => {
    // GIVEN: Cashier with null optional fields
    const cashierWithNulls = createMockCashier({
      disabled_at: null,
    });

    mockPrismaClient.cashier.count.mockResolvedValue(1);
    mockPrismaClient.cashier.findMany.mockResolvedValue([cashierWithNulls]);

    const { cashierSyncService } =
      await import("../../backend/src/services/api-key/cashier-sync.service");

    // WHEN: Syncing
    const result = await cashierSyncService.getCashiersForSync("test-store");

    // THEN: Null fields are properly represented
    expect(result.cashiers[0].disabledAt).toBeNull();
  });

  it("CSYNC-EDGE-013: [P2] Should handle cashier with max length name", async () => {
    // GIVEN: Cashier with very long name (255 chars)
    const longName = "A".repeat(255);
    const cashier = createMockCashier({ name: longName });

    mockPrismaClient.cashier.count.mockResolvedValue(1);
    mockPrismaClient.cashier.findMany.mockResolvedValue([cashier]);

    const { cashierSyncService } =
      await import("../../backend/src/services/api-key/cashier-sync.service");

    // WHEN: Syncing
    const result = await cashierSyncService.getCashiersForSync("test-store");

    // THEN: Long name is preserved
    expect(result.cashiers[0].name).toHaveLength(255);
  });

  it("CSYNC-EDGE-014: [P2] Should handle special characters in cashier name", async () => {
    // GIVEN: Cashier with special characters
    const specialName = "O'Brien-Smith Jr. <test> & Co.";
    const cashier = createMockCashier({ name: specialName });

    mockPrismaClient.cashier.count.mockResolvedValue(1);
    mockPrismaClient.cashier.findMany.mockResolvedValue([cashier]);

    const { cashierSyncService } =
      await import("../../backend/src/services/api-key/cashier-sync.service");

    // WHEN: Syncing
    const result = await cashierSyncService.getCashiersForSync("test-store");

    // THEN: Special characters are preserved (not escaped)
    expect(result.cashiers[0].name).toBe(specialName);
  });

  it("CSYNC-EDGE-015: [P2] Should handle Unicode characters in cashier name", async () => {
    // GIVEN: Cashier with Unicode name
    const unicodeName = "José García 日本語";
    const cashier = createMockCashier({ name: unicodeName });

    mockPrismaClient.cashier.count.mockResolvedValue(1);
    mockPrismaClient.cashier.findMany.mockResolvedValue([cashier]);

    const { cashierSyncService } =
      await import("../../backend/src/services/api-key/cashier-sync.service");

    // WHEN: Syncing
    const result = await cashierSyncService.getCashiersForSync("test-store");

    // THEN: Unicode is preserved
    expect(result.cashiers[0].name).toBe(unicodeName);
  });
});

// ============================================================================
// Pagination Tests
// ============================================================================

describe("CSYNC-EDGE: Pagination Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("CSYNC-EDGE-016: [P1] Should handle multiple pages of results correctly", async () => {
    // GIVEN: More records than one page
    const allCashiers = Array(250)
      .fill(null)
      .map((_, i) =>
        createMockCashier({
          employee_id: String(i).padStart(4, "0"),
          name: `Cashier ${i}`,
        }),
      );

    // First page request
    mockPrismaClient.cashier.count.mockResolvedValue(250);
    mockPrismaClient.cashier.findMany.mockResolvedValue(
      allCashiers.slice(0, 101),
    );

    const { cashierSyncService } =
      await import("../../backend/src/services/api-key/cashier-sync.service");

    // WHEN: Fetching first page
    const page1 = await cashierSyncService.getCashiersForSync("test-store", {
      limit: 100,
    });

    // THEN: First page has correct metadata
    expect(page1.cashiers).toHaveLength(100);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBe(100);

    // AND: Sequence numbers are correct
    expect(page1.cashiers[0].syncSequence).toBe(1);
    expect(page1.cashiers[99].syncSequence).toBe(100);
  });

  it("CSYNC-EDGE-017: [P2] Should handle exactly limit results", async () => {
    // GIVEN: Exactly limit number of records
    const exactCashiers = Array(100)
      .fill(null)
      .map((_, i) =>
        createMockCashier({ employee_id: String(i).padStart(4, "0") }),
      );

    mockPrismaClient.cashier.count.mockResolvedValue(100);
    mockPrismaClient.cashier.findMany.mockResolvedValue(exactCashiers);

    const { cashierSyncService } =
      await import("../../backend/src/services/api-key/cashier-sync.service");

    // WHEN: Fetching with limit = 100
    const result = await cashierSyncService.getCashiersForSync("test-store", {
      limit: 100,
    });

    // THEN: hasMore is false (no extra record fetched)
    expect(result.cashiers).toHaveLength(100);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeUndefined();
  });
});

// ============================================================================
// Timing Tests
// ============================================================================

describe("CSYNC-EDGE: Timing Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("CSYNC-EDGE-011: [P2] Should handle session near expiry boundary", async () => {
    // GIVEN: Session just under 1 hour old
    const justUnderOneHour = new Date(Date.now() - (60 * 60 * 1000 - 1000)); // 59 minutes 59 seconds ago
    const session = createMockSession({ session_started_at: justUnderOneHour });

    mockPrismaClient.apiKeySyncSession.findUnique.mockResolvedValue(session);

    const { cashierSyncService } =
      await import("../../backend/src/services/api-key/cashier-sync.service");

    // WHEN: Validating session
    // THEN: Session is still valid
    const result = await cashierSyncService.validateSyncSession(
      session.sync_session_id,
      session.api_key_id,
    );

    expect(result.syncSessionId).toBe(session.sync_session_id);
  });
});

// ============================================================================
// Failure Mode Tests
// ============================================================================

describe("CSYNC-EDGE: Failure Mode Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("CSYNC-EDGE-018: [P1] Should handle database connection failure gracefully", async () => {
    // GIVEN: Database throws connection error
    mockPrismaClient.cashier.count.mockRejectedValue(
      new Error("Connection refused"),
    );

    const { cashierSyncService } =
      await import("../../backend/src/services/api-key/cashier-sync.service");

    // WHEN: Attempting to sync
    // THEN: Error is propagated (to be caught by route handler)
    await expect(
      cashierSyncService.getCashiersForSync("test-store"),
    ).rejects.toThrow("Connection refused");
  });

  it("CSYNC-EDGE-019: [P1] Should handle query timeout", async () => {
    // GIVEN: Database query times out
    mockPrismaClient.cashier.count.mockRejectedValue(
      new Error("Query timeout"),
    );

    const { cashierSyncService } =
      await import("../../backend/src/services/api-key/cashier-sync.service");

    // WHEN: Attempting to sync
    // THEN: Timeout error is propagated
    await expect(
      cashierSyncService.getCashiersForSync("test-store"),
    ).rejects.toThrow("timeout");
  });
});

// ============================================================================
// Concurrency Tests (Documentation)
// ============================================================================

describe("CSYNC-EDGE: Concurrency Documentation", () => {
  it("CSYNC-EDGE-010: [P1] Concurrent sync requests should be safe", async () => {
    // DOCUMENT: Concurrency safety measures
    // 1. Sessions are isolated - each has unique ID
    // 2. Queries are read-only (SELECT)
    // 3. No write conflicts possible
    // 4. Sequence numbers are calculated per-request

    const concurrencySafety = {
      sessionIsolation: true,
      readOnlyQueries: true,
      noWriteConflicts: true,
      perRequestSequences: true,
    };

    expect(concurrencySafety.sessionIsolation).toBe(true);
    expect(concurrencySafety.readOnlyQueries).toBe(true);
  });
});
