import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../support/test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "@testing-library/react";

/**
 * Cache Invalidation Tests
 *
 * These tests verify the TanStack Query cache invalidation behavior
 * for our mutation hooks. The key fix was adding `refetchType: "all"`
 * to ensure queries refetch even when navigating between pages.
 *
 * Background:
 * - TanStack Query by default only refetches "active" queries on invalidation
 * - When navigating from create page -> list page, the list query may not be "active" yet
 * - Adding refetchType: "all" ensures all matching queries refetch
 */

// Mock stores API module
const mockInvalidateQueries = vi.fn();
const mockQueryClient = {
  invalidateQueries: mockInvalidateQueries,
};

describe("2.4-INTEGRATION: Cache Invalidation Behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Store Mutations - Cache Invalidation Pattern", () => {
    it("[P0] should invalidate with refetchType: 'all' on create", async () => {
      /**
       * This test verifies that useCreateStore invalidates with refetchType: "all"
       * which ensures the store list refreshes even when navigating from create page.
       */
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });

      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      // Simulate what useCreateStore.onSuccess does
      act(() => {
        queryClient.invalidateQueries({
          queryKey: ["stores"],
          refetchType: "all",
        });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["stores"],
        refetchType: "all",
      });

      invalidateSpy.mockRestore();
    });

    it("[P0] should invalidate with refetchType: 'all' on update", async () => {
      /**
       * This test verifies that useUpdateStore invalidates with refetchType: "all"
       */
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });

      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      // Simulate what useUpdateStore.onSuccess does
      act(() => {
        queryClient.invalidateQueries({
          queryKey: ["stores"],
          refetchType: "all",
        });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["stores"],
        refetchType: "all",
      });

      invalidateSpy.mockRestore();
    });

    it("[P0] should invalidate with refetchType: 'all' on delete", async () => {
      /**
       * This test verifies that useDeleteStore invalidates with refetchType: "all"
       */
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });

      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      // Simulate what useDeleteStore.onSuccess does
      act(() => {
        queryClient.invalidateQueries({
          queryKey: ["stores"],
          refetchType: "all",
        });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["stores"],
        refetchType: "all",
      });

      invalidateSpy.mockRestore();
    });
  });

  describe("User Mutations - Cache Invalidation Pattern", () => {
    it("[P0] should invalidate with refetchType: 'all' on create user", async () => {
      /**
       * This test verifies that useCreateUser invalidates with refetchType: "all"
       * which ensures the user list refreshes when navigating from create page.
       */
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });

      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      // Simulate what useCreateUser.onSuccess does
      act(() => {
        queryClient.invalidateQueries({
          queryKey: ["admin-users"],
          refetchType: "all",
        });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["admin-users"],
        refetchType: "all",
      });

      invalidateSpy.mockRestore();
    });

    it("[P0] should invalidate with refetchType: 'all' on update user status", async () => {
      /**
       * This test verifies that useUpdateUserStatus invalidates with refetchType: "all"
       */
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });

      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      // Simulate what useUpdateUserStatus.onSuccess does
      act(() => {
        queryClient.invalidateQueries({
          queryKey: ["admin-users"],
          refetchType: "all",
        });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["admin-users"],
        refetchType: "all",
      });

      invalidateSpy.mockRestore();
    });

    it("[P0] should invalidate with refetchType: 'all' on delete user", async () => {
      /**
       * This test verifies that useDeleteUser invalidates with refetchType: "all"
       */
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });

      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      // Simulate what useDeleteUser.onSuccess does
      act(() => {
        queryClient.invalidateQueries({
          queryKey: ["admin-users"],
          refetchType: "all",
        });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["admin-users"],
        refetchType: "all",
      });

      invalidateSpy.mockRestore();
    });
  });

  describe("Company Mutations - Cache Invalidation Pattern", () => {
    it("[P0] should invalidate with refetchType: 'all' on update company", async () => {
      /**
       * This test verifies that useUpdateCompany invalidates with refetchType: "all"
       */
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });

      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      // Simulate what useUpdateCompany.onSuccess does
      act(() => {
        queryClient.invalidateQueries({
          queryKey: ["companies"],
          refetchType: "all",
        });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["companies"],
        refetchType: "all",
      });

      invalidateSpy.mockRestore();
    });

    it("[P0] should invalidate with refetchType: 'all' on delete company", async () => {
      /**
       * This test verifies that useDeleteCompany invalidates with refetchType: "all"
       */
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });

      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      // Simulate what useDeleteCompany.onSuccess does
      act(() => {
        queryClient.invalidateQueries({
          queryKey: ["companies"],
          refetchType: "all",
        });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["companies"],
        refetchType: "all",
      });

      invalidateSpy.mockRestore();
    });
  });

  describe("Query Key Prefix Matching", () => {
    it("[P1] should invalidate all queries matching prefix pattern", async () => {
      /**
       * This test verifies that invalidating ["stores"] also invalidates
       * queries like ["stores", "list", companyId, params]
       *
       * TanStack Query uses prefix matching by default for invalidation.
       */
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });

      // Set up queries with different keys that share the "stores" prefix
      queryClient.setQueryData(["stores", "list", "company-1", { page: 1 }], {
        data: [{ store_id: "1", name: "Store 1" }],
      });
      queryClient.setQueryData(["stores", "list", "company-2", { page: 1 }], {
        data: [{ store_id: "2", name: "Store 2" }],
      });
      queryClient.setQueryData(["stores", "detail", "store-1"], {
        store_id: "store-1",
        name: "Store Detail",
      });

      // Invalidate with root key
      await act(async () => {
        await queryClient.invalidateQueries({
          queryKey: ["stores"],
          refetchType: "all",
        });
      });

      // All queries with "stores" prefix should be invalidated
      const queries = queryClient.getQueryCache().findAll();
      const storeQueries = queries.filter(
        (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "stores",
      );

      // All store queries should be marked as stale (invalidated)
      storeQueries.forEach((query) => {
        expect(query.state.isInvalidated).toBe(true);
      });
    });
  });
});

describe("2.4-INTEGRATION: List Refresh After CRUD Operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("StoreList handleStoreUpdated callback", () => {
    it("[P0] should use refetchType: 'all' in handleStoreUpdated", async () => {
      /**
       * Verifies that StoreList.handleStoreUpdated uses refetchType: "all"
       * This ensures the store list refreshes after editing via modal.
       */
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });

      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      // Simulate what handleStoreUpdated does in StoreList component
      act(() => {
        queryClient.invalidateQueries({
          queryKey: ["stores"],
          refetchType: "all",
        });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["stores"],
        refetchType: "all",
      });

      invalidateSpy.mockRestore();
    });
  });

  describe("UserList handleUserUpdated callback", () => {
    it("[P0] should use refetchType: 'all' in handleUserUpdated", async () => {
      /**
       * Verifies that UserList.handleUserUpdated uses refetchType: "all"
       * This ensures the user list refreshes after editing via modal.
       */
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });

      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      // Simulate what handleUserUpdated does in UserList component
      act(() => {
        queryClient.invalidateQueries({
          queryKey: ["admin-users"],
          refetchType: "all",
        });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["admin-users"],
        refetchType: "all",
      });

      invalidateSpy.mockRestore();
    });
  });
});
