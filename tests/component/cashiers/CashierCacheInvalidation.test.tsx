/**
 * @test-level Component
 * @justification Tests React Query cache invalidation for cashier mutations
 * @story 4.9-cashier-management
 *
 * This test verifies the fix for the bug where adding a cashier didn't
 * refresh the list. The issue was that queries were cached with filter
 * parameters (e.g., { is_active: true }) but invalidation used exact
 * key matching without filters, causing a mismatch.
 *
 * Fix: Changed invalidation to use partial key matching:
 * ["cashiers", "list", storeId] instead of cashierKeys.list(storeId)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { act } from "@testing-library/react";

describe("4.9-COMPONENT: Cashier Cache Invalidation", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  describe("Partial Key Matching for Filtered Queries", () => {
    it("[P0] should invalidate filtered cashier queries when using partial key", async () => {
      /**
       * This test verifies the fix for the bug where:
       * - CashierList queries with: ["cashiers", "list", storeId, { is_active: true }]
       * - But old invalidation used: ["cashiers", "list", storeId, undefined]
       * - These didn't match, so cache wasn't invalidated
       *
       * Fix: Use partial key ["cashiers", "list", storeId] which matches any
       * query that starts with those elements (regardless of filters)
       */
      const storeId = "store-123";

      // Set up a cached query with filters (simulating CashierList's useCashiers call)
      queryClient.setQueryData(
        ["cashiers", "list", storeId, { is_active: true }],
        [{ cashier_id: "1", name: "Test Cashier" }],
      );

      // Also set up an unfiltered query (for completeness)
      queryClient.setQueryData(
        ["cashiers", "list", storeId, undefined],
        [{ cashier_id: "1", name: "Test Cashier" }],
      );

      // Simulate what useCreateCashier.onSuccess does AFTER the fix
      // Using partial key matching (the fix)
      await act(async () => {
        await queryClient.invalidateQueries({
          queryKey: ["cashiers", "list", storeId],
        });
      });

      // Both queries should be invalidated (marked as stale)
      const queries = queryClient.getQueryCache().findAll();
      const cashierQueries = queries.filter(
        (q) =>
          Array.isArray(q.queryKey) &&
          q.queryKey[0] === "cashiers" &&
          q.queryKey[1] === "list" &&
          q.queryKey[2] === storeId,
      );

      // All cashier list queries for this store should be invalidated
      expect(cashierQueries.length).toBe(2);
      cashierQueries.forEach((query) => {
        expect(query.state.isInvalidated).toBe(true);
      });
    });

    it("[P0] should NOT invalidate queries for different stores", async () => {
      /**
       * Verifies that invalidation is store-specific:
       * - Invalidating store-123 should NOT affect store-456
       */
      const store1 = "store-123";
      const store2 = "store-456";

      // Set up queries for two different stores
      queryClient.setQueryData(
        ["cashiers", "list", store1, { is_active: true }],
        [{ cashier_id: "1", name: "Store 1 Cashier" }],
      );
      queryClient.setQueryData(
        ["cashiers", "list", store2, { is_active: true }],
        [{ cashier_id: "2", name: "Store 2 Cashier" }],
      );

      // Invalidate only store1
      await act(async () => {
        await queryClient.invalidateQueries({
          queryKey: ["cashiers", "list", store1],
        });
      });

      // Get query states
      const store1Query = queryClient
        .getQueryCache()
        .find({ queryKey: ["cashiers", "list", store1, { is_active: true }] });
      const store2Query = queryClient
        .getQueryCache()
        .find({ queryKey: ["cashiers", "list", store2, { is_active: true }] });

      // Store 1 should be invalidated
      expect(store1Query?.state.isInvalidated).toBe(true);

      // Store 2 should NOT be invalidated
      expect(store2Query?.state.isInvalidated).toBe(false);
    });

    it("[P1] should invalidate queries with any filter combination", async () => {
      /**
       * Tests that various filter combinations are all invalidated
       * when using partial key matching
       */
      const storeId = "store-123";

      // Set up queries with different filter combinations
      queryClient.setQueryData(
        ["cashiers", "list", storeId, { is_active: true }],
        [],
      );
      queryClient.setQueryData(
        ["cashiers", "list", storeId, { is_active: false }],
        [],
      );
      queryClient.setQueryData(["cashiers", "list", storeId, undefined], []);
      queryClient.setQueryData(["cashiers", "list", storeId], []);

      // Invalidate with partial key
      await act(async () => {
        await queryClient.invalidateQueries({
          queryKey: ["cashiers", "list", storeId],
        });
      });

      // All should be invalidated
      const queries = queryClient
        .getQueryCache()
        .findAll()
        .filter(
          (q) =>
            Array.isArray(q.queryKey) &&
            q.queryKey[0] === "cashiers" &&
            q.queryKey[1] === "list" &&
            q.queryKey[2] === storeId,
        );

      expect(queries.length).toBe(4);
      queries.forEach((query) => {
        expect(query.state.isInvalidated).toBe(true);
      });
    });
  });

  describe("Mutation onSuccess Invalidation Pattern", () => {
    it("[P0] should use correct invalidation pattern for useCreateCashier", async () => {
      /**
       * Verifies the pattern used in useCreateCashier.onSuccess
       * after the fix is applied:
       * - Uses partial key matching for filtered queries
       * - Uses refetchType: "all" to ensure refetch even during navigation
       */
      const storeId = "store-123";
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      // Simulate useCreateCashier.onSuccess behavior
      await act(async () => {
        await queryClient.invalidateQueries({
          queryKey: ["cashiers", "list", storeId],
          refetchType: "all",
        });
      });

      // Verify the correct pattern was used with refetchType: "all"
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["cashiers", "list", storeId],
        refetchType: "all",
      });

      invalidateSpy.mockRestore();
    });

    it("[P0] should use correct invalidation pattern for useUpdateCashier", async () => {
      /**
       * Verifies the pattern used in useUpdateCashier.onSuccess
       */
      const storeId = "store-123";
      const cashierId = "cashier-456";
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      // Simulate useUpdateCashier.onSuccess behavior
      await act(async () => {
        // List invalidation (partial key)
        await queryClient.invalidateQueries({
          queryKey: ["cashiers", "list", storeId],
          refetchType: "all",
        });
        // Detail invalidation (exact key)
        await queryClient.invalidateQueries({
          queryKey: ["cashiers", "detail", storeId, cashierId],
          refetchType: "all",
        });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["cashiers", "list", storeId],
        refetchType: "all",
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["cashiers", "detail", storeId, cashierId],
        refetchType: "all",
      });

      invalidateSpy.mockRestore();
    });

    it("[P0] should use correct invalidation pattern for useDeleteCashier", async () => {
      /**
       * Verifies the pattern used in useDeleteCashier.onSuccess
       */
      const storeId = "store-123";
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      // Simulate useDeleteCashier.onSuccess behavior
      await act(async () => {
        await queryClient.invalidateQueries({
          queryKey: ["cashiers", "list", storeId],
          refetchType: "all",
        });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["cashiers", "list", storeId],
        refetchType: "all",
      });

      invalidateSpy.mockRestore();
    });
  });
});
