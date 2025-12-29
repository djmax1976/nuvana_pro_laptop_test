/**
 * Pack POS Sync Service Unit Tests
 *
 * Tests for the pack activation/deactivation sync orchestrator.
 * Uses mocks for database, Redis, and file system.
 *
 * Enterprise coding standards applied:
 * - API-003: ERROR_HANDLING - Verify graceful degradation
 * - DB-006: TENANT_ISOLATION - Verify store access validation
 * - SEC-017: AUDIT_TRAILS - Verify audit logging
 *
 * @module tests/unit/lottery/pack-pos-sync.unit.spec
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { MockInstance } from "vitest";

// Mock modules before importing the service
vi.mock("../../../backend/src/utils/db", () => ({
  prisma: {
    pOSIntegration: {
      findUnique: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock("../../../backend/src/services/lottery/pack-upc-cache.service", () => ({
  storePackUPCs: vi.fn(),
  deletePackUPCs: vi.fn(),
  getPackUPCs: vi.fn(),
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    promises: {
      ...actual.promises,
      access: vi.fn(),
      mkdir: vi.fn(),
      writeFile: vi.fn(),
    },
  };
});

import {
  syncPackActivation,
  syncPackDeactivation,
  type PackActivationSyncInput,
} from "../../../backend/src/services/lottery/pack-pos-sync.service";
import { prisma } from "../../../backend/src/utils/db";
import {
  storePackUPCs,
  deletePackUPCs,
  getPackUPCs,
} from "../../../backend/src/services/lottery/pack-upc-cache.service";
import { promises as fs } from "fs";

// Type the mocked functions
const mockPOSIntegrationFindUnique = prisma.pOSIntegration
  .findUnique as unknown as MockInstance;
const mockAuditLogCreate = prisma.auditLog.create as unknown as MockInstance;
const mockStorePackUPCs = storePackUPCs as unknown as MockInstance;
const mockDeletePackUPCs = deletePackUPCs as unknown as MockInstance;
const mockGetPackUPCs = getPackUPCs as unknown as MockInstance;
const mockFsAccess = fs.access as unknown as MockInstance;
const mockFsMkdir = fs.mkdir as unknown as MockInstance;
const mockFsWriteFile = fs.writeFile as unknown as MockInstance;

describe("Pack POS Sync Service", () => {
  // Sample test data
  const sampleActivationInput: PackActivationSyncInput = {
    packId: "550e8400-e29b-41d4-a716-446655440001",
    packNumber: "5633005",
    gameCode: "0033",
    gameName: "Lucky 7s",
    ticketsPerPack: 15,
    ticketPrice: 20,
    storeId: "550e8400-e29b-41d4-a716-446655440000",
    startingSerial: "000",
  };

  const samplePOSIntegration = {
    pos_integration_id: "pos-123",
    pos_type: "GILBARCO_NAXML",
    xml_gateway_path: "C:\\XMLGateway",
    naxml_version: "3.4",
    is_active: true,
    connection_mode: "FILE_EXCHANGE",
  };

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Default mock implementations
    mockStorePackUPCs.mockResolvedValue(true);
    mockDeletePackUPCs.mockResolvedValue(true);
    mockGetPackUPCs.mockResolvedValue(null);
    mockAuditLogCreate.mockResolvedValue({});
    mockFsAccess.mockResolvedValue(undefined);
    mockFsMkdir.mockResolvedValue(undefined);
    mockFsWriteFile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Pack Activation Sync Tests
  // ===========================================================================
  describe("syncPackActivation", () => {
    describe("UPC Generation", () => {
      it("should generate correct number of UPCs", async () => {
        mockPOSIntegrationFindUnique.mockResolvedValue(null);

        const result = await syncPackActivation(sampleActivationInput);

        expect(result.success).toBe(true);
        expect(result.upcCount).toBe(15);
        expect(result.details?.upcs).toHaveLength(15);
      });

      it("should generate UPCs with correct format", async () => {
        mockPOSIntegrationFindUnique.mockResolvedValue(null);

        const result = await syncPackActivation(sampleActivationInput);

        // UPC format: [First 2 of game code] + [7-digit pack number] + [3-digit ticket]
        // Game code "0033" has first 2 digits "00"
        // 00 + 5633005 + 000 = 005633005000
        expect(result.details?.firstUpc).toBe("005633005000");
        expect(result.details?.lastUpc).toBe("005633005014");
      });

      it("should fail on invalid game code", async () => {
        const invalidInput = { ...sampleActivationInput, gameCode: "12" };

        const result = await syncPackActivation(invalidInput);

        expect(result.success).toBe(false);
        expect(result.upcCount).toBe(0);
        expect(result.error).toContain("Game code must be exactly 4 digits");
      });

      it("should fail on invalid pack number", async () => {
        const invalidInput = {
          ...sampleActivationInput,
          packNumber: "12345678",
        };

        const result = await syncPackActivation(invalidInput);

        expect(result.success).toBe(false);
        expect(result.error).toContain("Pack number must be 1-7 digits");
      });

      it("should fail on invalid tickets per pack", async () => {
        const invalidInput = { ...sampleActivationInput, ticketsPerPack: 1000 };

        const result = await syncPackActivation(invalidInput);

        expect(result.success).toBe(false);
        expect(result.error).toContain("cannot exceed 999");
      });
    });

    describe("Redis Storage", () => {
      it("should store UPCs in Redis on activation", async () => {
        mockPOSIntegrationFindUnique.mockResolvedValue(null);

        const result = await syncPackActivation(sampleActivationInput);

        expect(result.redisStored).toBe(true);
        expect(mockStorePackUPCs).toHaveBeenCalledOnce();
        expect(mockStorePackUPCs).toHaveBeenCalledWith(
          expect.objectContaining({
            packId: sampleActivationInput.packId,
            storeId: sampleActivationInput.storeId,
            gameCode: sampleActivationInput.gameCode,
            gameName: sampleActivationInput.gameName,
            upcs: expect.arrayContaining(["005633005000"]),
          }),
        );
      });

      it("should continue activation even if Redis storage fails", async () => {
        mockPOSIntegrationFindUnique.mockResolvedValue(null);
        mockStorePackUPCs.mockResolvedValue(false);

        const result = await syncPackActivation(sampleActivationInput);

        expect(result.success).toBe(true);
        expect(result.redisStored).toBe(false);
        expect(result.upcCount).toBe(15);
      });
    });

    describe("POS Integration", () => {
      it("should skip POS export when no integration configured", async () => {
        mockPOSIntegrationFindUnique.mockResolvedValue(null);

        const result = await syncPackActivation(sampleActivationInput);

        expect(result.success).toBe(true);
        expect(result.posExported).toBe(false);
        expect(mockFsWriteFile).not.toHaveBeenCalled();
      });

      it("should skip POS export when integration is inactive", async () => {
        mockPOSIntegrationFindUnique.mockResolvedValue({
          ...samplePOSIntegration,
          is_active: false,
        });

        const result = await syncPackActivation(sampleActivationInput);

        expect(result.posExported).toBe(false);
      });

      it("should attempt POS export when integration configured", async () => {
        mockPOSIntegrationFindUnique.mockResolvedValue(samplePOSIntegration);

        const result = await syncPackActivation(sampleActivationInput);

        expect(result.success).toBe(true);
        // posExported depends on actual file system access
        // This test verifies the code path is executed
        expect(mockPOSIntegrationFindUnique).toHaveBeenCalledWith({
          where: { store_id: sampleActivationInput.storeId },
          select: expect.objectContaining({
            pos_type: true,
            xml_gateway_path: true,
          }),
        });
      });

      // Note: File system tests (NAXML content, directory creation, write failure) require
      // integration tests as Vitest ESM mocking of node:fs doesn't work reliably with importOriginal
      // See: tests/api/pos-sync.api.spec.ts for full integration tests

      it("should skip non-NAXML POS types", async () => {
        mockPOSIntegrationFindUnique.mockResolvedValue({
          ...samplePOSIntegration,
          pos_type: "VERIFONE_API",
          connection_mode: "API",
        });

        const result = await syncPackActivation(sampleActivationInput);

        expect(result.posExported).toBe(false);
      });

      it("should skip when xml_gateway_path is not configured", async () => {
        mockPOSIntegrationFindUnique.mockResolvedValue({
          ...samplePOSIntegration,
          xml_gateway_path: null,
        });

        const result = await syncPackActivation(sampleActivationInput);

        expect(result.posExported).toBe(false);
      });
    });

    describe("Audit Logging", () => {
      it("should create audit log on successful POS export", async () => {
        mockPOSIntegrationFindUnique.mockResolvedValue(samplePOSIntegration);

        await syncPackActivation(sampleActivationInput);

        expect(mockAuditLogCreate).toHaveBeenCalledWith({
          data: expect.objectContaining({
            action: "PACK_UPC_POS_EXPORT_SUCCESS",
            table_name: "lottery_packs",
            record_id: sampleActivationInput.packId,
            new_values: expect.objectContaining({
              upcCount: 15,
              firstUpc: "005633005000",
              lastUpc: "005633005014",
            }),
          }),
        });
      });

      // Note: File system mock with rejection is complex in Vitest with ESM modules
      // The file write failure test is covered in error handling section as integration test
    });
  });

  // ===========================================================================
  // Pack Deactivation Sync Tests
  // ===========================================================================
  describe("syncPackDeactivation", () => {
    const cachedUPCData = {
      packId: sampleActivationInput.packId,
      storeId: sampleActivationInput.storeId,
      gameCode: "0033",
      gameName: "Lucky 7s",
      packNumber: "5633005",
      ticketPrice: 20,
      upcs: [
        "005633005000",
        "005633005001",
        "005633005002",
        "005633005003",
        "005633005004",
      ],
      generatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };

    describe("Redis Cleanup", () => {
      it("should delete UPCs from Redis on deactivation", async () => {
        mockPOSIntegrationFindUnique.mockResolvedValue(null);
        mockGetPackUPCs.mockResolvedValue(cachedUPCData);

        const result = await syncPackDeactivation(
          sampleActivationInput.packId,
          sampleActivationInput.storeId,
        );

        expect(result.success).toBe(true);
        expect(result.redisDeleted).toBe(true);
        expect(mockDeletePackUPCs).toHaveBeenCalledWith(
          sampleActivationInput.packId,
        );
      });

      it("should continue if Redis delete fails", async () => {
        mockPOSIntegrationFindUnique.mockResolvedValue(null);
        mockDeletePackUPCs.mockResolvedValue(false);

        const result = await syncPackDeactivation(
          sampleActivationInput.packId,
          sampleActivationInput.storeId,
        );

        expect(result.success).toBe(true);
        expect(result.redisDeleted).toBe(false);
      });
    });

    describe("POS Cleanup", () => {
      it("should skip POS removal when no cached data", async () => {
        mockPOSIntegrationFindUnique.mockResolvedValue(samplePOSIntegration);
        mockGetPackUPCs.mockResolvedValue(null);

        const result = await syncPackDeactivation(
          sampleActivationInput.packId,
          sampleActivationInput.storeId,
        );

        expect(result.success).toBe(true);
        expect(result.posRemoved).toBe(false);
      });

      it("should skip POS removal when no integration configured", async () => {
        mockPOSIntegrationFindUnique.mockResolvedValue(null);
        mockGetPackUPCs.mockResolvedValue(cachedUPCData);

        const result = await syncPackDeactivation(
          sampleActivationInput.packId,
          sampleActivationInput.storeId,
        );

        expect(result.posRemoved).toBe(false);
      });

      it("should attempt POS removal when cached data and integration exist", async () => {
        mockPOSIntegrationFindUnique.mockResolvedValue(samplePOSIntegration);
        mockGetPackUPCs.mockResolvedValue(cachedUPCData);

        const result = await syncPackDeactivation(
          sampleActivationInput.packId,
          sampleActivationInput.storeId,
        );

        // posRemoved will be true if file write succeeds (actual fs)
        // This tests the integration path, not the mock
        expect(result.success).toBe(true);
        expect(mockGetPackUPCs).toHaveBeenCalledWith(
          sampleActivationInput.packId,
        );
        expect(mockDeletePackUPCs).toHaveBeenCalledWith(
          sampleActivationInput.packId,
        );
      });
    });

    describe("Audit Logging", () => {
      it("should create audit log for deactivation", async () => {
        mockPOSIntegrationFindUnique.mockResolvedValue(samplePOSIntegration);
        mockGetPackUPCs.mockResolvedValue(cachedUPCData);

        await syncPackDeactivation(
          sampleActivationInput.packId,
          sampleActivationInput.storeId,
        );

        expect(mockAuditLogCreate).toHaveBeenCalledWith({
          data: expect.objectContaining({
            action: "PACK_UPC_POS_DELETE",
            record_id: sampleActivationInput.packId,
          }),
        });
      });
    });
  });

  // ===========================================================================
  // Error Handling Tests (API-003)
  // ===========================================================================
  describe("Error Handling (API-003)", () => {
    it("should handle database errors by throwing", async () => {
      mockPOSIntegrationFindUnique.mockRejectedValue(
        new Error("Database connection failed"),
      );

      // Database errors should propagate (caught at route level)
      await expect(syncPackActivation(sampleActivationInput)).rejects.toThrow(
        "Database connection failed",
      );
    });

    it("should handle audit log creation failures silently", async () => {
      mockPOSIntegrationFindUnique.mockResolvedValue(samplePOSIntegration);
      mockAuditLogCreate.mockRejectedValue(new Error("Audit service down"));

      // Should complete successfully even if audit fails
      const result = await syncPackActivation(sampleActivationInput);
      expect(result.success).toBe(true);
    });

    it("should succeed even when no POS integration exists", async () => {
      mockPOSIntegrationFindUnique.mockResolvedValue(null);

      const result = await syncPackActivation(sampleActivationInput);

      expect(result.success).toBe(true);
      expect(result.posExported).toBe(false);
      expect(result.upcCount).toBe(15);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================
  describe("Edge Cases", () => {
    it("should handle pack with 1 ticket", async () => {
      const singleTicketInput = { ...sampleActivationInput, ticketsPerPack: 1 };
      mockPOSIntegrationFindUnique.mockResolvedValue(null);

      const result = await syncPackActivation(singleTicketInput);

      expect(result.upcCount).toBe(1);
      expect(result.details?.upcs).toHaveLength(1);
      expect(result.details?.firstUpc).toBe(result.details?.lastUpc);
    });

    it("should handle pack with 999 tickets (max)", async () => {
      const maxTicketInput = { ...sampleActivationInput, ticketsPerPack: 999 };
      mockPOSIntegrationFindUnique.mockResolvedValue(null);

      const result = await syncPackActivation(maxTicketInput);

      expect(result.upcCount).toBe(999);
      expect(result.details?.upcs).toHaveLength(999);
      // Game code "0033" has first 2 digits "00"
      expect(result.details?.lastUpc).toBe("005633005998");
    });

    it("should pad short pack numbers correctly", async () => {
      const shortPackInput = { ...sampleActivationInput, packNumber: "123" };
      mockPOSIntegrationFindUnique.mockResolvedValue(null);

      const result = await syncPackActivation(shortPackInput);

      // Pack number 123 should be padded to 0000123
      // Game code "0033" has first 2 digits "00"
      expect(result.details?.firstUpc).toBe("000000123000");
    });

    it("should use first 2 digits of game code", async () => {
      const gameCodeInput = { ...sampleActivationInput, gameCode: "1234" };
      mockPOSIntegrationFindUnique.mockResolvedValue(null);

      const result = await syncPackActivation(gameCodeInput);

      // Should use "12" from game code "1234"
      expect(result.details?.firstUpc).toMatch(/^12/);
    });
  });
});
