/**
 * Unit Tests: useLottery Hooks
 *
 * Tests custom hooks for lottery data management:
 * - useActivePacksByStore
 * - useUpdatePack
 * - useDeletePack
 * - Security: Input validation, error handling
 * - Edge cases: Empty data, network errors, timeout
 *
 * @test-level UNIT
 * @justification Tests hook behavior in isolation with mocked TanStack Query
 * @story 6-10-1 - Client Dashboard Lottery Page
 * @priority P1 (High - Data Management, API Integration)
 * @enhanced-by workflow-9 on 2025-01-28
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useLotteryPacks,
  useUpdatePack,
  useDeletePack,
} from "@/hooks/useLottery";

// Mock API functions
vi.mock("@/lib/api/lottery", () => ({
  getPacks: vi.fn(),
  updatePack: vi.fn(),
  deletePack: vi.fn(),
}));

import { getPacks, updatePack, deletePack } from "@/lib/api/lottery";

describe("6.10.1-UNIT: useLottery Hooks", () => {
  let queryClient: QueryClient;

  // Test isolation: Create fresh QueryClient for each test
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  describe("useLotteryPacks", () => {
    it("6.10.1-UNIT-HOOKS-001: [P1] should fetch active packs for a store (AC #2, #3)", async () => {
      // GIVEN: Mock API response
      const mockPacks = [
        {
          pack_id: "pack-1",
          pack_number: "PACK-001",
          status: "ACTIVE" as const,
          game: { name: "Game 1" },
          bin: { name: "Bin 1" },
        },
      ];

      (getPacks as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: mockPacks,
      });

      // WHEN: Hook is called with storeId and status filter
      const { result } = renderHook(
        () => useLotteryPacks("store-1", { status: "ACTIVE" }),
        { wrapper },
      );

      // THEN: Hook returns packs data
      await waitFor(
        () => {
          expect(result.current.isSuccess, "Query should succeed").toBe(true);
        },
        { timeout: 3000 },
      );

      expect(result.current.data, "Hook should return packs data").toEqual(
        mockPacks,
      );
      expect(
        getPacks,
        "API should be called with correct filters",
      ).toHaveBeenCalledWith({
        store_id: "store-1",
        status: "ACTIVE",
      });
    });

    it("6.10.1-UNIT-HOOKS-002: [P1] should handle loading state (AC #7)", async () => {
      // GIVEN: Mock API that takes time to resolve
      (getPacks as ReturnType<typeof vi.fn>).mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({ success: true, data: [] });
            }, 100);
          }),
      );

      // WHEN: Hook is called
      const { result } = renderHook(
        () => useLotteryPacks("store-1", { status: "ACTIVE" }),
        { wrapper },
      );

      // THEN: Loading state is true initially
      expect(
        result.current.isLoading,
        "Loading state should be true initially",
      ).toBe(true);

      await waitFor(
        () => {
          expect(
            result.current.isLoading,
            "Loading state should become false after data loads",
          ).toBe(false);
        },
        { timeout: 3000 },
      );
    });

    it("6.10.1-UNIT-HOOKS-003: [P1] should handle error state (AC #7)", async () => {
      // GIVEN: Mock API that returns error
      (getPacks as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Failed to fetch packs"),
      );

      // WHEN: Hook is called
      const { result } = renderHook(
        () => useLotteryPacks("store-1", { status: "ACTIVE" }),
        { wrapper },
      );

      // THEN: Error state is set
      await waitFor(
        () => {
          expect(result.current.isError, "Error state should be true").toBe(
            true,
          );
        },
        { timeout: 3000 },
      );

      expect(
        result.current.error,
        "Error object should be defined",
      ).toBeDefined();
    });

    it("6.10.1-UNIT-HOOKS-003b: [P1] should not fetch when storeId is null", async () => {
      // GIVEN: Hook called with null storeId
      // WHEN: Hook is called with null storeId
      const { result } = renderHook(
        () => useLotteryPacks(null, { status: "ACTIVE" }),
        { wrapper },
      );

      // THEN: Query is disabled (not executed)
      expect(
        result.current.isLoading,
        "Query should not be loading when storeId is null",
      ).toBe(false);
      expect(
        getPacks,
        "API should not be called when storeId is null",
      ).not.toHaveBeenCalled();
    });
  });

  describe("useUpdatePack", () => {
    it("6.10.1-UNIT-HOOKS-004: [P1] should update pack successfully (AC #5)", async () => {
      // GIVEN: Mock API response
      const mockUpdateData = {
        pack_number: "PACK-UPDATED",
        serial_start: "2000",
        serial_end: "3000",
      };

      (updatePack as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: { pack_id: "pack-1", ...mockUpdateData },
      });

      // WHEN: Mutation is executed
      const { result } = renderHook(() => useUpdatePack(), { wrapper });

      await result.current.mutateAsync({
        packId: "pack-1",
        data: mockUpdateData,
      });

      // THEN: API is called with correct data
      expect(
        updatePack,
        "API should be called with pack ID and update data",
      ).toHaveBeenCalledWith("pack-1", mockUpdateData);
      expect(result.current.isSuccess, "Mutation should succeed").toBe(true);
    });

    it("6.10.1-UNIT-HOOKS-005: [P1] should handle update errors (AC #5)", async () => {
      // GIVEN: Mock API that returns error
      (updatePack as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Update failed"),
      );

      // WHEN: Mutation is executed
      const { result } = renderHook(() => useUpdatePack(), { wrapper });

      // THEN: Error is thrown
      await expect(
        result.current.mutateAsync({
          packId: "pack-1",
          data: { pack_number: "PACK-UPDATED" },
        }),
        "Mutation should throw error",
      ).rejects.toThrow("Update failed");
    });

    // ============ EDGE CASES ============

    it("6.10.1-UNIT-HOOKS-EDGE-001: [P2] should handle empty update data", async () => {
      // GIVEN: Mock API response
      (updatePack as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: { pack_id: "pack-1" },
      });

      // WHEN: Mutation is executed with empty data object
      const { result } = renderHook(() => useUpdatePack(), { wrapper });

      await result.current.mutateAsync({
        packId: "pack-1",
        data: {}, // Empty update (only bin_id change, etc.)
      });

      // THEN: API is called with empty data object
      expect(
        updatePack,
        "API should be called with empty data object",
      ).toHaveBeenCalledWith("pack-1", {});
    });
  });

  describe("useDeletePack", () => {
    it("6.10.1-UNIT-HOOKS-006: [P1] should delete pack successfully (AC #6)", async () => {
      // GIVEN: Mock API response
      (deletePack as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        message: "Pack deleted successfully",
      });

      // WHEN: Mutation is executed
      const { result } = renderHook(() => useDeletePack(), { wrapper });

      await result.current.mutateAsync("pack-1");

      // THEN: API is called with pack ID
      expect(
        deletePack,
        "API should be called with pack ID",
      ).toHaveBeenCalledWith("pack-1");
      expect(result.current.isSuccess, "Mutation should succeed").toBe(true);
    });

    it("6.10.1-UNIT-HOOKS-007: [P1] should handle delete errors (AC #6)", async () => {
      // GIVEN: Mock API that returns error
      (deletePack as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Delete failed"),
      );

      // WHEN: Mutation is executed
      const { result } = renderHook(() => useDeletePack(), { wrapper });

      // THEN: Error is thrown
      await expect(
        result.current.mutateAsync("pack-1"),
        "Mutation should throw error",
      ).rejects.toThrow("Delete failed");
    });

    // ============ EDGE CASES ============

    it("6.10.1-UNIT-HOOKS-EDGE-002: [P2] should handle invalid pack ID format", async () => {
      // GIVEN: Mock API that rejects invalid UUID
      (deletePack as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Invalid pack ID format"),
      );

      // WHEN: Mutation is executed with invalid pack ID
      const { result } = renderHook(() => useDeletePack(), { wrapper });

      // THEN: Error is thrown
      await expect(
        result.current.mutateAsync("invalid-pack-id"),
        "Mutation should throw error for invalid pack ID",
      ).rejects.toThrow("Invalid pack ID format");
    });
  });
});
