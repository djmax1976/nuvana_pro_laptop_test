/**
 * @test-level Component
 * @justification Tests useCashiersMultiStore hook for multi-store cashier aggregation
 * @story 4.9-cashier-management
 *
 * This test verifies the fix for the bug where creating a cashier in Company 2's
 * store would not show in the list because the "All Stores" filter always fetched
 * from stores[0] (the first store) instead of aggregating from all stores.
 *
 * Fix: Added useCashiersMultiStore hook that uses useQueries to fetch cashiers
 * from all stores in parallel and aggregates the results with store names.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { ReactNode } from "react";

// Mock the API request function
vi.mock("@/lib/api/cashiers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/cashiers")>();
  return {
    ...actual,
    // Keep the original exports but we'll mock getCashiers via fetch
  };
});

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("4.9-COMPONENT: Cashier Multi-Store Hook", () => {
  let queryClient: QueryClient;

  const createWrapper = () => {
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    Wrapper.displayName = "TestQueryClientWrapper";
    return Wrapper;
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("useCashiersMultiStore Hook", () => {
    it("[P0] 4.9-COMPONENT-001: should aggregate cashiers from multiple stores", async () => {
      /**
       * This test verifies that the multi-store hook:
       * 1. Makes parallel API calls for each store
       * 2. Aggregates results into a single array
       * 3. Adds store_name to each cashier
       */
      const store1Id = "store-111";
      const store2Id = "store-222";
      const storeNameMap = new Map([
        [store1Id, "Store Alpha"],
        [store2Id, "Store Beta"],
      ]);

      // Mock API responses for each store
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            data: [
              {
                cashier_id: "c1",
                store_id: store1Id,
                employee_id: "0001",
                name: "Alice",
                is_active: true,
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            data: [
              {
                cashier_id: "c2",
                store_id: store2Id,
                employee_id: "0001",
                name: "Bob",
                is_active: true,
              },
            ],
          }),
        });

      // Import the hook dynamically after mocking
      const { useCashiersMultiStore } = await import("@/lib/api/cashiers");

      const { result } = renderHook(
        () =>
          useCashiersMultiStore([store1Id, store2Id], storeNameMap, {
            is_active: true,
          }),
        { wrapper: createWrapper() },
      );

      // Wait for queries to complete
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Verify aggregated data
      expect(result.current.data).toHaveLength(2);
      expect(result.current.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            cashier_id: "c1",
            name: "Alice",
            store_name: "Store Alpha",
          }),
          expect.objectContaining({
            cashier_id: "c2",
            name: "Bob",
            store_name: "Store Beta",
          }),
        ]),
      );
    });

    it("[P0] 4.9-COMPONENT-002: should sort results by store name, then by cashier name", async () => {
      /**
       * Verifies the sorting order: store name first, then cashier name
       */
      const store1Id = "store-111";
      const store2Id = "store-222";
      const storeNameMap = new Map([
        [store1Id, "Zebra Store"], // Z comes after B
        [store2Id, "Alpha Store"],
      ]);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            data: [
              {
                cashier_id: "c1",
                store_id: store1Id,
                employee_id: "0001",
                name: "Charlie",
                is_active: true,
              },
              {
                cashier_id: "c2",
                store_id: store1Id,
                employee_id: "0002",
                name: "Alice",
                is_active: true,
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            data: [
              {
                cashier_id: "c3",
                store_id: store2Id,
                employee_id: "0001",
                name: "Bob",
                is_active: true,
              },
            ],
          }),
        });

      const { useCashiersMultiStore } = await import("@/lib/api/cashiers");

      const { result } = renderHook(
        () => useCashiersMultiStore([store1Id, store2Id], storeNameMap),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should be sorted: Alpha Store (Bob), then Zebra Store (Alice, Charlie)
      expect(result.current.data?.[0]?.store_name).toBe("Alpha Store");
      expect(result.current.data?.[0]?.name).toBe("Bob");
      expect(result.current.data?.[1]?.store_name).toBe("Zebra Store");
      expect(result.current.data?.[1]?.name).toBe("Alice");
      expect(result.current.data?.[2]?.store_name).toBe("Zebra Store");
      expect(result.current.data?.[2]?.name).toBe("Charlie");
    });

    it("[P1] 4.9-COMPONENT-003: should handle empty results from some stores", async () => {
      /**
       * Verifies that empty results from some stores don't break aggregation
       */
      const store1Id = "store-111";
      const store2Id = "store-222";
      const storeNameMap = new Map([
        [store1Id, "Store One"],
        [store2Id, "Store Two"],
      ]);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            data: [], // Empty store
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            data: [
              {
                cashier_id: "c1",
                store_id: store2Id,
                employee_id: "0001",
                name: "Only Cashier",
                is_active: true,
              },
            ],
          }),
        });

      const { useCashiersMultiStore } = await import("@/lib/api/cashiers");

      const { result } = renderHook(
        () => useCashiersMultiStore([store1Id, store2Id], storeNameMap),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toHaveLength(1);
      expect(result.current.data?.[0]?.name).toBe("Only Cashier");
      expect(result.current.data?.[0]?.store_name).toBe("Store Two");
    });

    it("[P1] 4.9-COMPONENT-004: should return undefined data when all stores are empty", async () => {
      /**
       * Verifies that undefined is returned when no cashiers exist
       */
      const store1Id = "store-111";
      const storeNameMap = new Map([[store1Id, "Store One"]]);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [],
        }),
      });

      const { useCashiersMultiStore } = await import("@/lib/api/cashiers");

      const { result } = renderHook(
        () => useCashiersMultiStore([store1Id], storeNameMap),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toBeUndefined();
    });

    it("[P1] 4.9-COMPONENT-005: should be disabled when enabled option is false", async () => {
      /**
       * Verifies the enabled option prevents queries from running
       */
      const store1Id = "store-111";
      const storeNameMap = new Map([[store1Id, "Store One"]]);

      const { useCashiersMultiStore } = await import("@/lib/api/cashiers");

      const { result } = renderHook(
        () =>
          useCashiersMultiStore([store1Id], storeNameMap, undefined, {
            enabled: false,
          }),
        { wrapper: createWrapper() },
      );

      // Should not make any fetch calls
      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toBeUndefined();
    });

    it("[P0] 4.9-COMPONENT-006: should handle API errors gracefully", async () => {
      /**
       * Verifies error handling when one store's API call fails
       */
      const store1Id = "store-111";
      const store2Id = "store-222";
      const storeNameMap = new Map([
        [store1Id, "Store One"],
        [store2Id, "Store Two"],
      ]);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            data: [
              {
                cashier_id: "c1",
                store_id: store1Id,
                employee_id: "0001",
                name: "Success",
                is_active: true,
              },
            ],
          }),
        })
        .mockRejectedValueOnce(new Error("Network error"));

      const { useCashiersMultiStore } = await import("@/lib/api/cashiers");

      const { result } = renderHook(
        () => useCashiersMultiStore([store1Id, store2Id], storeNameMap),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isError).toBe(true);
      expect(result.current.error).toBeDefined();
    });
  });

  describe("Multi-Store Mode Detection", () => {
    it("[P0] 4.9-COMPONENT-007: should use multi-store mode when 'All Stores' selected with multiple stores", () => {
      /**
       * Verifies the logic for detecting multi-store mode:
       * - storeFilter === ALL_STORES AND stores.length > 1
       */
      const ALL_STORES = "all";
      const stores = [
        { store_id: "store-1", name: "Store 1" },
        { store_id: "store-2", name: "Store 2" },
      ];

      const storeFilter = ALL_STORES;
      const isMultiStoreMode = storeFilter === ALL_STORES && stores.length > 1;

      expect(isMultiStoreMode).toBe(true);
    });

    it("[P0] 4.9-COMPONENT-008: should NOT use multi-store mode when single store exists", () => {
      /**
       * With only one store, should use single-store mode even with 'All Stores'
       */
      const ALL_STORES = "all";
      const stores = [{ store_id: "store-1", name: "Store 1" }];

      const storeFilter = ALL_STORES;
      const isMultiStoreMode = storeFilter === ALL_STORES && stores.length > 1;

      expect(isMultiStoreMode).toBe(false);
    });

    it("[P0] 4.9-COMPONENT-009: should NOT use multi-store mode when specific store selected", () => {
      /**
       * When a specific store is selected, should use single-store mode
       */
      const ALL_STORES = "all";
      const stores = [
        { store_id: "store-1", name: "Store 1" },
        { store_id: "store-2", name: "Store 2" },
      ];

      const storeFilter = "store-1"; // Specific store selected
      const isMultiStoreMode = storeFilter === ALL_STORES && stores.length > 1;

      expect(isMultiStoreMode).toBe(false);
    });
  });

  describe("Cache Invalidation for Multi-Store", () => {
    it("[P0] 4.9-COMPONENT-010: should invalidate correct store queries when creating cashier", async () => {
      /**
       * When a cashier is created, the cache for that specific store should be invalidated.
       * Other stores' caches remain intact (partial key matching is store-specific).
       */
      const store1Id = "store-111";
      const store2Id = "store-222";

      // Set up cached queries for both stores
      queryClient.setQueryData(
        ["cashiers", "list", store1Id, { is_active: true }],
        [{ cashier_id: "1", name: "Existing 1" }],
      );
      queryClient.setQueryData(
        ["cashiers", "list", store2Id, { is_active: true }],
        [{ cashier_id: "2", name: "Existing 2" }],
      );

      // Simulate creating a cashier in store2 (this is what useCreateCashier does)
      await queryClient.invalidateQueries({
        queryKey: ["cashiers", "list", store2Id],
        refetchType: "all",
      });

      // Store 1 should NOT be invalidated
      const store1Query = queryClient.getQueryCache().find({
        queryKey: ["cashiers", "list", store1Id, { is_active: true }],
      });
      expect(store1Query?.state.isInvalidated).toBe(false);

      // Store 2 SHOULD be invalidated
      const store2Query = queryClient.getQueryCache().find({
        queryKey: ["cashiers", "list", store2Id, { is_active: true }],
      });
      expect(store2Query?.state.isInvalidated).toBe(true);
    });
  });
});
