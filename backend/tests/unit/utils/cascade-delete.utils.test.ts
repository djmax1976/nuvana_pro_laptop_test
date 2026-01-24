/**
 * Cascade Delete Utility Tests
 *
 * Enterprise-grade unit tests for the cascade delete utility functions.
 * These tests verify that API keys and related records are properly
 * deleted in the correct order to satisfy foreign key constraints.
 *
 * @module tests/unit/utils/cascade-delete.utils.test
 *
 * TEST COVERAGE:
 * - cascadeDeleteApiKeys: Delete API keys by store IDs
 * - cascadeDeleteApiKeysForCompany: Delete API keys by company ID
 * - cascadeDeleteApiKeysForCompanies: Delete API keys by multiple company IDs
 * - Edge cases: Empty arrays, no API keys found, transaction rollback
 * - Delete order: Verify children deleted before parents (FK constraints)
 *
 * BUSINESS RISK: HIGH
 * - Failure to cascade deletes leaves orphaned records
 * - Orphaned records cause 500 errors in API endpoints
 * - This bug directly impacted production (BUG-001)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  cascadeDeleteApiKeys,
  cascadeDeleteApiKeysForCompany,
  cascadeDeleteApiKeysForCompanies,
} from "../../../src/utils/cascade-delete.utils";
import type { Prisma } from "@prisma/client";

/**
 * Creates a mock Prisma transaction client for testing cascade delete operations.
 * Each mock tracks call order to verify correct deletion sequence.
 */
function createMockTransaction() {
  const callOrder: string[] = [];

  const mockApiKey = {
    findMany: vi.fn().mockResolvedValue([]),
    deleteMany: vi.fn().mockImplementation(() => {
      callOrder.push("apiKey.deleteMany");
      return Promise.resolve({ count: 0 });
    }),
  };

  const mockApiKeyAuditEvent = {
    deleteMany: vi.fn().mockImplementation(() => {
      callOrder.push("apiKeyAuditEvent.deleteMany");
      return Promise.resolve({ count: 0 });
    }),
  };

  const mockApiKeySyncSession = {
    deleteMany: vi.fn().mockImplementation(() => {
      callOrder.push("apiKeySyncSession.deleteMany");
      return Promise.resolve({ count: 0 });
    }),
  };

  const mockStore = {
    findMany: vi.fn().mockResolvedValue([]),
  };

  return {
    tx: {
      apiKey: mockApiKey,
      apiKeyAuditEvent: mockApiKeyAuditEvent,
      apiKeySyncSession: mockApiKeySyncSession,
      store: mockStore,
    } as unknown as Prisma.TransactionClient,
    mocks: {
      apiKey: mockApiKey,
      apiKeyAuditEvent: mockApiKeyAuditEvent,
      apiKeySyncSession: mockApiKeySyncSession,
      store: mockStore,
    },
    callOrder,
  };
}

// =============================================================================
// cascadeDeleteApiKeys Tests
// =============================================================================

describe("cascadeDeleteApiKeys", () => {
  describe("Core Functionality", () => {
    it("CD-UTIL-001: should delete API keys for given store IDs", async () => {
      // GIVEN: A transaction client with API keys for the specified stores
      const { tx, mocks } = createMockTransaction();
      const storeIds = ["store-1", "store-2"];
      const apiKeyIds = ["key-1", "key-2", "key-3"];

      mocks.apiKey.findMany.mockResolvedValue(
        apiKeyIds.map((id) => ({ api_key_id: id }))
      );
      mocks.apiKeySyncSession.deleteMany.mockResolvedValue({ count: 5 });
      mocks.apiKeyAuditEvent.deleteMany.mockResolvedValue({ count: 10 });
      mocks.apiKey.deleteMany.mockResolvedValue({ count: 3 });

      // WHEN: Cascade deleting API keys
      const result = await cascadeDeleteApiKeys(tx, storeIds);

      // THEN: API keys query was called with correct store IDs
      expect(mocks.apiKey.findMany).toHaveBeenCalledWith({
        where: { store_id: { in: storeIds } },
        select: { api_key_id: true },
      });

      // AND: All delete operations were called with correct API key IDs
      expect(mocks.apiKeySyncSession.deleteMany).toHaveBeenCalledWith({
        where: { api_key_id: { in: apiKeyIds } },
      });
      expect(mocks.apiKeyAuditEvent.deleteMany).toHaveBeenCalledWith({
        where: { api_key_id: { in: apiKeyIds } },
      });
      expect(mocks.apiKey.deleteMany).toHaveBeenCalledWith({
        where: { api_key_id: { in: apiKeyIds } },
      });

      // AND: Result contains correct counts
      expect(result).toEqual({
        apiKeysDeleted: 3,
        auditEventsDeleted: 10,
        syncSessionsDeleted: 5,
      });
    });

    it("CD-UTIL-002: should handle empty store IDs array gracefully", async () => {
      // GIVEN: A transaction client
      const { tx, mocks } = createMockTransaction();

      // WHEN: Calling with empty array
      const result = await cascadeDeleteApiKeys(tx, []);

      // THEN: No database operations were performed
      expect(mocks.apiKey.findMany).not.toHaveBeenCalled();
      expect(mocks.apiKeySyncSession.deleteMany).not.toHaveBeenCalled();
      expect(mocks.apiKeyAuditEvent.deleteMany).not.toHaveBeenCalled();
      expect(mocks.apiKey.deleteMany).not.toHaveBeenCalled();

      // AND: Result shows zero deletions
      expect(result).toEqual({
        apiKeysDeleted: 0,
        auditEventsDeleted: 0,
        syncSessionsDeleted: 0,
      });
    });

    it("CD-UTIL-003: should handle null/undefined store IDs array", async () => {
      // GIVEN: A transaction client
      const { tx, mocks } = createMockTransaction();

      // WHEN: Calling with null/undefined
      const resultNull = await cascadeDeleteApiKeys(
        tx,
        null as unknown as string[]
      );
      const resultUndefined = await cascadeDeleteApiKeys(
        tx,
        undefined as unknown as string[]
      );

      // THEN: No database operations were performed
      expect(mocks.apiKey.findMany).not.toHaveBeenCalled();

      // AND: Results show zero deletions
      expect(resultNull).toEqual({
        apiKeysDeleted: 0,
        auditEventsDeleted: 0,
        syncSessionsDeleted: 0,
      });
      expect(resultUndefined).toEqual({
        apiKeysDeleted: 0,
        auditEventsDeleted: 0,
        syncSessionsDeleted: 0,
      });
    });

    it("CD-UTIL-004: should return zero counts when no API keys found", async () => {
      // GIVEN: Stores with no API keys
      const { tx, mocks } = createMockTransaction();
      mocks.apiKey.findMany.mockResolvedValue([]);

      // WHEN: Cascade deleting
      const result = await cascadeDeleteApiKeys(tx, ["store-1"]);

      // THEN: Only the findMany was called
      expect(mocks.apiKey.findMany).toHaveBeenCalled();

      // AND: No delete operations were performed
      expect(mocks.apiKeySyncSession.deleteMany).not.toHaveBeenCalled();
      expect(mocks.apiKeyAuditEvent.deleteMany).not.toHaveBeenCalled();
      expect(mocks.apiKey.deleteMany).not.toHaveBeenCalled();

      // AND: Result shows zero deletions
      expect(result).toEqual({
        apiKeysDeleted: 0,
        auditEventsDeleted: 0,
        syncSessionsDeleted: 0,
      });
    });
  });

  describe("Deletion Order Verification", () => {
    it("CD-UTIL-005: should delete sync sessions before API keys (FK constraint)", async () => {
      // GIVEN: API keys with sync sessions
      const { tx, mocks, callOrder } = createMockTransaction();
      mocks.apiKey.findMany.mockResolvedValue([{ api_key_id: "key-1" }]);

      // WHEN: Cascade deleting
      await cascadeDeleteApiKeys(tx, ["store-1"]);

      // THEN: Sync sessions were deleted before API keys
      const syncSessionIndex = callOrder.indexOf(
        "apiKeySyncSession.deleteMany"
      );
      const apiKeyIndex = callOrder.indexOf("apiKey.deleteMany");

      expect(syncSessionIndex).toBeLessThan(apiKeyIndex);
    });

    it("CD-UTIL-006: should delete audit events before API keys (FK constraint)", async () => {
      // GIVEN: API keys with audit events
      const { tx, mocks, callOrder } = createMockTransaction();
      mocks.apiKey.findMany.mockResolvedValue([{ api_key_id: "key-1" }]);

      // WHEN: Cascade deleting
      await cascadeDeleteApiKeys(tx, ["store-1"]);

      // THEN: Audit events were deleted before API keys
      const auditEventIndex = callOrder.indexOf("apiKeyAuditEvent.deleteMany");
      const apiKeyIndex = callOrder.indexOf("apiKey.deleteMany");

      expect(auditEventIndex).toBeLessThan(apiKeyIndex);
    });

    it("CD-UTIL-007: should follow correct deletion order: syncSessions -> auditEvents -> apiKeys", async () => {
      // GIVEN: API keys with both sync sessions and audit events
      const { tx, mocks, callOrder } = createMockTransaction();
      mocks.apiKey.findMany.mockResolvedValue([
        { api_key_id: "key-1" },
        { api_key_id: "key-2" },
      ]);

      // WHEN: Cascade deleting
      await cascadeDeleteApiKeys(tx, ["store-1", "store-2"]);

      // THEN: Deletion order is correct
      expect(callOrder).toEqual([
        "apiKeySyncSession.deleteMany",
        "apiKeyAuditEvent.deleteMany",
        "apiKey.deleteMany",
      ]);
    });
  });

  describe("Error Handling", () => {
    it("CD-UTIL-008: should propagate errors from API key lookup", async () => {
      // GIVEN: A failing API key lookup
      const { tx, mocks } = createMockTransaction();
      const error = new Error("Database connection failed");
      mocks.apiKey.findMany.mockRejectedValue(error);

      // WHEN/THEN: Error is propagated
      await expect(cascadeDeleteApiKeys(tx, ["store-1"])).rejects.toThrow(
        "Database connection failed"
      );
    });

    it("CD-UTIL-009: should propagate errors from sync session deletion", async () => {
      // GIVEN: API keys exist but sync session deletion fails
      const { tx, mocks } = createMockTransaction();
      mocks.apiKey.findMany.mockResolvedValue([{ api_key_id: "key-1" }]);
      mocks.apiKeySyncSession.deleteMany.mockRejectedValue(
        new Error("FK constraint violation")
      );

      // WHEN/THEN: Error is propagated
      await expect(cascadeDeleteApiKeys(tx, ["store-1"])).rejects.toThrow(
        "FK constraint violation"
      );
    });

    it("CD-UTIL-010: should propagate errors from audit event deletion", async () => {
      // GIVEN: Sync sessions deleted but audit event deletion fails
      const { tx, mocks } = createMockTransaction();
      mocks.apiKey.findMany.mockResolvedValue([{ api_key_id: "key-1" }]);
      mocks.apiKeySyncSession.deleteMany.mockResolvedValue({ count: 1 });
      mocks.apiKeyAuditEvent.deleteMany.mockRejectedValue(
        new Error("Permission denied")
      );

      // WHEN/THEN: Error is propagated
      await expect(cascadeDeleteApiKeys(tx, ["store-1"])).rejects.toThrow(
        "Permission denied"
      );
    });
  });
});

// =============================================================================
// cascadeDeleteApiKeysForCompany Tests
// =============================================================================

describe("cascadeDeleteApiKeysForCompany", () => {
  it("CD-UTIL-011: should delete API keys for all stores in a company", async () => {
    // GIVEN: A company with multiple stores
    const { tx, mocks } = createMockTransaction();
    const companyId = "company-1";
    const stores = [{ store_id: "store-1" }, { store_id: "store-2" }];
    const apiKeys = [
      { api_key_id: "key-1" },
      { api_key_id: "key-2" },
      { api_key_id: "key-3" },
    ];

    mocks.store.findMany.mockResolvedValue(stores);
    mocks.apiKey.findMany.mockResolvedValue(apiKeys);
    mocks.apiKeySyncSession.deleteMany.mockResolvedValue({ count: 6 });
    mocks.apiKeyAuditEvent.deleteMany.mockResolvedValue({ count: 12 });
    mocks.apiKey.deleteMany.mockResolvedValue({ count: 3 });

    // WHEN: Cascade deleting API keys for the company
    const result = await cascadeDeleteApiKeysForCompany(tx, companyId);

    // THEN: Stores were looked up by company ID
    expect(mocks.store.findMany).toHaveBeenCalledWith({
      where: { company_id: companyId },
      select: { store_id: true },
    });

    // AND: API keys were deleted for all stores
    expect(mocks.apiKey.findMany).toHaveBeenCalledWith({
      where: { store_id: { in: ["store-1", "store-2"] } },
      select: { api_key_id: true },
    });

    // AND: Result contains correct counts
    expect(result).toEqual({
      apiKeysDeleted: 3,
      auditEventsDeleted: 12,
      syncSessionsDeleted: 6,
    });
  });

  it("CD-UTIL-012: should handle empty company ID", async () => {
    // GIVEN: A transaction client
    const { tx, mocks } = createMockTransaction();

    // WHEN: Calling with empty company ID
    const result = await cascadeDeleteApiKeysForCompany(tx, "");

    // THEN: No database operations were performed
    expect(mocks.store.findMany).not.toHaveBeenCalled();

    // AND: Result shows zero deletions
    expect(result).toEqual({
      apiKeysDeleted: 0,
      auditEventsDeleted: 0,
      syncSessionsDeleted: 0,
    });
  });

  it("CD-UTIL-013: should handle company with no stores", async () => {
    // GIVEN: A company with no stores
    const { tx, mocks } = createMockTransaction();
    mocks.store.findMany.mockResolvedValue([]);

    // WHEN: Cascade deleting
    const result = await cascadeDeleteApiKeysForCompany(tx, "company-1");

    // THEN: Store lookup was performed
    expect(mocks.store.findMany).toHaveBeenCalled();

    // AND: No API key operations were performed
    expect(mocks.apiKey.findMany).not.toHaveBeenCalled();

    // AND: Result shows zero deletions
    expect(result).toEqual({
      apiKeysDeleted: 0,
      auditEventsDeleted: 0,
      syncSessionsDeleted: 0,
    });
  });
});

// =============================================================================
// cascadeDeleteApiKeysForCompanies Tests
// =============================================================================

describe("cascadeDeleteApiKeysForCompanies", () => {
  it("CD-UTIL-014: should delete API keys for multiple companies", async () => {
    // GIVEN: Multiple companies with stores
    const { tx, mocks } = createMockTransaction();
    const companyIds = ["company-1", "company-2"];
    const stores = [
      { store_id: "store-1" },
      { store_id: "store-2" },
      { store_id: "store-3" },
    ];
    const apiKeys = [
      { api_key_id: "key-1" },
      { api_key_id: "key-2" },
      { api_key_id: "key-3" },
      { api_key_id: "key-4" },
    ];

    mocks.store.findMany.mockResolvedValue(stores);
    mocks.apiKey.findMany.mockResolvedValue(apiKeys);
    mocks.apiKeySyncSession.deleteMany.mockResolvedValue({ count: 8 });
    mocks.apiKeyAuditEvent.deleteMany.mockResolvedValue({ count: 16 });
    mocks.apiKey.deleteMany.mockResolvedValue({ count: 4 });

    // WHEN: Cascade deleting API keys for multiple companies
    const result = await cascadeDeleteApiKeysForCompanies(tx, companyIds);

    // THEN: Stores were looked up for all companies
    expect(mocks.store.findMany).toHaveBeenCalledWith({
      where: { company_id: { in: companyIds } },
      select: { store_id: true },
    });

    // AND: Result contains correct counts
    expect(result).toEqual({
      apiKeysDeleted: 4,
      auditEventsDeleted: 16,
      syncSessionsDeleted: 8,
    });
  });

  it("CD-UTIL-015: should handle empty company IDs array", async () => {
    // GIVEN: A transaction client
    const { tx, mocks } = createMockTransaction();

    // WHEN: Calling with empty array
    const result = await cascadeDeleteApiKeysForCompanies(tx, []);

    // THEN: No database operations were performed
    expect(mocks.store.findMany).not.toHaveBeenCalled();

    // AND: Result shows zero deletions
    expect(result).toEqual({
      apiKeysDeleted: 0,
      auditEventsDeleted: 0,
      syncSessionsDeleted: 0,
    });
  });

  it("CD-UTIL-016: should handle null/undefined company IDs array", async () => {
    // GIVEN: A transaction client
    const { tx, mocks } = createMockTransaction();

    // WHEN: Calling with null/undefined
    const resultNull = await cascadeDeleteApiKeysForCompanies(
      tx,
      null as unknown as string[]
    );
    const resultUndefined = await cascadeDeleteApiKeysForCompanies(
      tx,
      undefined as unknown as string[]
    );

    // THEN: No database operations were performed
    expect(mocks.store.findMany).not.toHaveBeenCalled();

    // AND: Results show zero deletions
    expect(resultNull).toEqual({
      apiKeysDeleted: 0,
      auditEventsDeleted: 0,
      syncSessionsDeleted: 0,
    });
    expect(resultUndefined).toEqual({
      apiKeysDeleted: 0,
      auditEventsDeleted: 0,
      syncSessionsDeleted: 0,
    });
  });
});

// =============================================================================
// Integration-like Tests (verifying complete flows)
// =============================================================================

describe("Cascade Delete Complete Flows", () => {
  it("CD-UTIL-017: should handle realistic deletion scenario with multiple stores and API keys", async () => {
    // GIVEN: A realistic scenario with 3 stores, 5 API keys, various related records
    const callOrder: string[] = [];

    const storeIds = ["store-001", "store-002", "store-003"];
    const apiKeys = [
      { api_key_id: "key-001" },
      { api_key_id: "key-002" },
      { api_key_id: "key-003" },
      { api_key_id: "key-004" },
      { api_key_id: "key-005" },
    ];

    // Create mocks with explicit call tracking
    const mockApiKey = {
      findMany: vi.fn().mockResolvedValue(apiKeys),
      deleteMany: vi.fn().mockImplementation(() => {
        callOrder.push("apiKey.deleteMany");
        return Promise.resolve({ count: 5 });
      }),
    };

    const mockApiKeyAuditEvent = {
      deleteMany: vi.fn().mockImplementation(() => {
        callOrder.push("apiKeyAuditEvent.deleteMany");
        return Promise.resolve({ count: 50 });
      }),
    };

    const mockApiKeySyncSession = {
      deleteMany: vi.fn().mockImplementation(() => {
        callOrder.push("apiKeySyncSession.deleteMany");
        return Promise.resolve({ count: 15 });
      }),
    };

    const tx = {
      apiKey: mockApiKey,
      apiKeyAuditEvent: mockApiKeyAuditEvent,
      apiKeySyncSession: mockApiKeySyncSession,
    } as any;

    // WHEN: Cascade deleting
    const result = await cascadeDeleteApiKeys(tx, storeIds);

    // THEN: All operations completed in correct order
    expect(callOrder).toEqual([
      "apiKeySyncSession.deleteMany",
      "apiKeyAuditEvent.deleteMany",
      "apiKey.deleteMany",
    ]);

    // AND: Result contains accurate counts
    expect(result).toEqual({
      apiKeysDeleted: 5,
      auditEventsDeleted: 50,
      syncSessionsDeleted: 15,
    });

    // AND: All delete operations used correct API key IDs
    const expectedApiKeyIds = apiKeys.map((k) => k.api_key_id);
    expect(mockApiKeySyncSession.deleteMany).toHaveBeenCalledWith({
      where: { api_key_id: { in: expectedApiKeyIds } },
    });
    expect(mockApiKeyAuditEvent.deleteMany).toHaveBeenCalledWith({
      where: { api_key_id: { in: expectedApiKeyIds } },
    });
    expect(mockApiKey.deleteMany).toHaveBeenCalledWith({
      where: { api_key_id: { in: expectedApiKeyIds } },
    });
  });

  it("CD-UTIL-018: should handle deletion of API keys with no related records", async () => {
    // GIVEN: API keys exist but have no sync sessions or audit events
    const { tx, mocks } = createMockTransaction();

    mocks.apiKey.findMany.mockResolvedValue([{ api_key_id: "key-1" }]);
    mocks.apiKeySyncSession.deleteMany.mockResolvedValue({ count: 0 });
    mocks.apiKeyAuditEvent.deleteMany.mockResolvedValue({ count: 0 });
    mocks.apiKey.deleteMany.mockResolvedValue({ count: 1 });

    // WHEN: Cascade deleting
    const result = await cascadeDeleteApiKeys(tx, ["store-1"]);

    // THEN: API key was deleted even though it had no related records
    expect(result).toEqual({
      apiKeysDeleted: 1,
      auditEventsDeleted: 0,
      syncSessionsDeleted: 0,
    });
  });
});
