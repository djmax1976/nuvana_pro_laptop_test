/**
 * Lottery API Client Unit Tests
 * Tests for src/lib/api/lottery.ts API client functions
 *
 * Story: 6.10 - Lottery Management UI
 * Task: 9 - Create API client functions for lottery operations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  receivePack,
  activatePack,
  getPacks,
  getPackDetails,
  getVariances,
  approveVariance,
  type ReceivePackInput,
  type ApproveVarianceInput,
} from "../../../src/lib/api/lottery";

// Mock fetch globally
global.fetch = vi.fn();

// Mock environment variable
const originalEnv = process.env;
beforeEach(() => {
  vi.resetModules();
  process.env = {
    ...originalEnv,
    NEXT_PUBLIC_API_URL: "http://localhost:3001",
  };
  vi.clearAllMocks();
});

afterEach(() => {
  process.env = originalEnv;
});

describe("Lottery API Client", () => {
  describe("receivePack", () => {
    it("should successfully receive a pack", async () => {
      const mockPackData: ReceivePackInput = {
        game_id: "game-123",
        pack_number: "PACK-001",
        serial_start: "1000",
        serial_end: "2000",
        store_id: "store-123",
        bin_id: "bin-123",
      };

      const mockResponse = {
        success: true,
        data: {
          pack_id: "pack-123",
          game_id: "game-123",
          pack_number: "PACK-001",
          serial_start: "1000",
          serial_end: "2000",
          status: "RECEIVED" as const,
          current_bin_id: "bin-123",
          received_at: "2025-01-28T10:00:00Z",
          game: {
            game_id: "game-123",
            name: "Test Game",
          },
          store: {
            store_id: "store-123",
            name: "Test Store",
          },
          bin: {
            bin_id: "bin-123",
            name: "Bin A",
            location: "Shelf 1",
          },
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await receivePack(mockPackData);

      expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:3001/api/lottery/packs/receive",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(mockPackData),
        },
      );

      expect(result).toEqual(mockResponse);
      expect(result.success).toBe(true);
      expect(result.data.status).toBe("RECEIVED");
    });

    it("should handle API errors correctly", async () => {
      const mockPackData: ReceivePackInput = {
        game_id: "game-123",
        pack_number: "PACK-001",
        serial_start: "1000",
        serial_end: "2000",
      };

      const mockErrorResponse = {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "serial_start must contain only numeric characters",
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => mockErrorResponse,
      });

      await expect(receivePack(mockPackData)).rejects.toThrow(
        "serial_start must contain only numeric characters",
      );
    });

    it("should handle network errors", async () => {
      const mockPackData: ReceivePackInput = {
        game_id: "game-123",
        pack_number: "PACK-001",
        serial_start: "1000",
        serial_end: "2000",
      };

      (global.fetch as any).mockRejectedValueOnce(new Error("Network error"));

      await expect(receivePack(mockPackData)).rejects.toThrow("Network error");
    });
  });

  describe("activatePack", () => {
    it("should successfully activate a pack", async () => {
      const packId = "pack-123";

      const mockResponse = {
        success: true,
        data: {
          pack_id: "pack-123",
          game_id: "game-123",
          pack_number: "PACK-001",
          serial_start: "1000",
          serial_end: "2000",
          status: "ACTIVE" as const,
          activated_at: "2025-01-28T10:00:00Z",
          game: {
            game_id: "game-123",
            name: "Test Game",
          },
          store: {
            store_id: "store-123",
            name: "Test Store",
          },
          bin: {
            bin_id: "bin-123",
            name: "Bin A",
            location: "Shelf 1",
          },
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await activatePack(packId);

      expect(global.fetch).toHaveBeenCalledWith(
        `http://localhost:3001/api/lottery/packs/${packId}/activate`,
        {
          method: "PUT",
          credentials: "include",
          headers: {},
        },
      );

      expect(result).toEqual(mockResponse);
      expect(result.success).toBe(true);
      expect(result.data.status).toBe("ACTIVE");
    });

    it("should handle pack not found error", async () => {
      const packId = "invalid-pack-id";

      const mockErrorResponse = {
        success: false,
        error: {
          code: "PACK_NOT_FOUND",
          message: "Lottery pack not found",
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => mockErrorResponse,
      });

      await expect(activatePack(packId)).rejects.toThrow(
        "Lottery pack not found",
      );
    });
  });

  describe("getPacks", () => {
    it("should successfully fetch packs with filters", async () => {
      const filters = {
        store_id: "store-123",
        status: "ACTIVE" as const,
      };

      const mockResponse = {
        success: true,
        data: [
          {
            pack_id: "pack-123",
            game_id: "game-123",
            pack_number: "PACK-001",
            serial_start: "1000",
            serial_end: "2000",
            status: "ACTIVE" as const,
            store_id: "store-123",
            current_bin_id: "bin-123",
            received_at: "2025-01-28T10:00:00Z",
            activated_at: "2025-01-28T10:05:00Z",
            game: {
              game_id: "game-123",
              name: "Test Game",
            },
            store: {
              store_id: "store-123",
              name: "Test Store",
            },
            bin: {
              bin_id: "bin-123",
              name: "Bin A",
              location: "Shelf 1",
            },
          },
        ],
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await getPacks(filters);

      expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:3001/api/lottery/packs?store_id=store-123&status=ACTIVE",
        {
          method: "GET",
          credentials: "include",
          headers: {},
        },
      );

      expect(result).toEqual(mockResponse);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it("should fetch packs without filters", async () => {
      const mockResponse = {
        success: true,
        data: [],
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await getPacks();

      expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:3001/api/lottery/packs",
        {
          method: "GET",
          credentials: "include",
          headers: {},
        },
      );

      expect(result).toEqual(mockResponse);
    });
  });

  describe("getPackDetails", () => {
    it("should successfully fetch pack details", async () => {
      const packId = "pack-123";

      const mockResponse = {
        success: true,
        data: {
          pack_id: "pack-123",
          game_id: "game-123",
          pack_number: "PACK-001",
          serial_start: "1000",
          serial_end: "2000",
          status: "ACTIVE" as const,
          store_id: "store-123",
          current_bin_id: "bin-123",
          received_at: "2025-01-28T10:00:00Z",
          activated_at: "2025-01-28T10:05:00Z",
          game: {
            game_id: "game-123",
            name: "Test Game",
          },
          store: {
            store_id: "store-123",
            name: "Test Store",
          },
          bin: {
            bin_id: "bin-123",
            name: "Bin A",
            location: "Shelf 1",
          },
          shift_openings: [
            {
              opening_id: "opening-123",
              shift_id: "shift-123",
              opening_serial: "1500",
              opened_at: "2025-01-28T11:00:00Z",
            },
          ],
          shift_closings: [],
          tickets_remaining: 500,
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await getPackDetails(packId);

      expect(global.fetch).toHaveBeenCalledWith(
        `http://localhost:3001/api/lottery/packs/${packId}`,
        {
          method: "GET",
          credentials: "include",
          headers: {},
        },
      );

      expect(result).toEqual(mockResponse);
      expect(result.success).toBe(true);
      expect(result.data.tickets_remaining).toBe(500);
    });
  });

  describe("getVariances", () => {
    it("should successfully fetch variances with filters", async () => {
      const filters = {
        store_id: "store-123",
        status: "unresolved" as const,
      };

      const mockResponse = {
        success: true,
        data: [
          {
            variance_id: "variance-123",
            shift_id: "shift-123",
            pack_id: "pack-123",
            expected_count: 100,
            actual_count: 95,
            difference: -5,
            variance_reason: null,
            approved_by: null,
            approved_at: null,
            created_at: "2025-01-28T12:00:00Z",
            pack: {
              pack_id: "pack-123",
              pack_number: "PACK-001",
              status: "ACTIVE" as const,
            },
          },
        ],
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await getVariances(filters);

      expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:3001/api/lottery/variances?store_id=store-123&status=unresolved",
        {
          method: "GET",
          credentials: "include",
          headers: {},
        },
      );

      expect(result).toEqual(mockResponse);
      expect(result.success).toBe(true);
      expect(result.data[0].difference).toBe(-5);
    });
  });

  describe("approveVariance", () => {
    it("should successfully approve a variance", async () => {
      const shiftId = "shift-123";
      const varianceData: ApproveVarianceInput = {
        variance_reason: "Count discrepancy due to damaged tickets",
      };

      const mockResponse = {
        success: true,
        data: {
          shift_id: "shift-123",
          status: "CLOSED",
          variance_reason: "Count discrepancy due to damaged tickets",
          variance_amount: -5,
          variance_percentage: -5,
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await approveVariance(shiftId, varianceData);

      expect(global.fetch).toHaveBeenCalledWith(
        `http://localhost:3001/api/shifts/${shiftId}/reconcile`,
        {
          method: "PUT",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            variance_reason: varianceData.variance_reason,
          }),
        },
      );

      expect(result).toEqual(mockResponse);
      expect(result.success).toBe(true);
      expect(result.data.variance_reason).toBe(varianceData.variance_reason);
    });

    it("should handle variance approval errors", async () => {
      const shiftId = "shift-123";
      const varianceData: ApproveVarianceInput = {
        variance_reason: "",
      };

      const mockErrorResponse = {
        success: false,
        error: {
          code: "VARIANCE_REASON_REQUIRED",
          message: "variance_reason is required when approving variance",
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => mockErrorResponse,
      });

      await expect(approveVariance(shiftId, varianceData)).rejects.toThrow(
        "variance_reason is required when approving variance",
      );
    });
  });

  describe("Error Handling", () => {
    it("should handle malformed JSON responses", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => {
          throw new Error("Invalid JSON");
        },
      });

      await expect(
        receivePack({
          game_id: "game-123",
          pack_number: "PACK-001",
          serial_start: "1000",
          serial_end: "2000",
        }),
      ).rejects.toThrow();
    });

    it("should handle HTTP error status without error body", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: async () => {
          throw new Error("Invalid JSON");
        },
      });

      await expect(
        receivePack({
          game_id: "game-123",
          pack_number: "PACK-001",
          serial_start: "1000",
          serial_end: "2000",
        }),
      ).rejects.toThrow("HTTP 500: Internal Server Error");
    });
  });
});
