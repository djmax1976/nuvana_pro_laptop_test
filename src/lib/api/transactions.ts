/**
 * Transaction Query API client functions
 * Provides functions for interacting with the transaction query API
 * All functions require TRANSACTION_READ permission
 *
 * Story: 3.5 - Transaction Display UI
 *
 * Uses shared API client for consistent:
 * - 401/session expiration handling (automatic redirect to login)
 * - Error formatting with ApiError class
 * - Timeout configuration (30s default)
 * - Credential handling (httpOnly cookies)
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import apiClient from "./client";

// ============ Types ============

/**
 * Transaction query filters
 */
export interface TransactionQueryFilters {
  store_id?: string;
  shift_id?: string;
  cashier_id?: string;
  from?: string; // ISO 8601 date string
  to?: string; // ISO 8601 date string
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  limit: number;
  offset: number;
}

/**
 * Include options for transaction query
 */
export interface IncludeOptions {
  include_line_items?: boolean;
  include_payments?: boolean;
}

/**
 * Transaction line item response
 */
export interface TransactionLineItemResponse {
  line_item_id: string;
  product_id: string | null;
  sku: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  discount: number;
  line_total: number;
}

/**
 * Transaction payment response
 */
export interface TransactionPaymentResponse {
  payment_id: string;
  method: string;
  amount: number;
  reference: string | null;
}

/**
 * Transaction response
 * Also exported as Transaction for test compatibility
 */
export interface TransactionResponse {
  transaction_id: string;
  public_id: string;
  store_id: string;
  shift_id: string;
  cashier_id: string;
  pos_terminal_id: string | null;
  timestamp: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  line_items?: TransactionLineItemResponse[];
  payments?: TransactionPaymentResponse[];
  // Extended fields from joins (optional, populated by backend)
  cashier_name?: string;
  store_name?: string;
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

/**
 * Transaction query result
 */
export interface TransactionQueryResult {
  transactions: TransactionResponse[];
  meta: PaginationMeta;
}

/**
 * Type alias for TransactionResponse (for test compatibility)
 */
export type Transaction = TransactionResponse;

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

// ============ API Functions ============

/**
 * Build query string from filters and pagination
 */
function buildQueryString(
  filters?: TransactionQueryFilters,
  pagination?: PaginationOptions,
  include?: IncludeOptions,
): string {
  const params = new URLSearchParams();

  if (filters?.store_id) {
    params.append("store_id", filters.store_id);
  }
  if (filters?.shift_id) {
    params.append("shift_id", filters.shift_id);
  }
  if (filters?.cashier_id) {
    params.append("cashier_id", filters.cashier_id);
  }
  if (filters?.from) {
    params.append("from", filters.from);
  }
  if (filters?.to) {
    params.append("to", filters.to);
  }

  if (pagination?.limit != null) {
    params.append("limit", pagination.limit.toString());
  }
  if (pagination?.offset != null) {
    params.append("offset", pagination.offset.toString());
  }

  if (include?.include_line_items) {
    params.append("include_line_items", "true");
  }
  if (include?.include_payments) {
    params.append("include_payments", "true");
  }

  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}

/**
 * Get transactions with filters and pagination
 * @param filters - Query filters (store_id, shift_id, cashier_id, from, to)
 * @param pagination - Pagination options (limit, offset)
 * @param include - Include options (include_line_items, include_payments)
 * @returns Transaction query result with transactions and pagination meta
 */
export async function getTransactions(
  filters?: TransactionQueryFilters,
  pagination?: PaginationOptions,
  include?: IncludeOptions,
): Promise<ApiResponse<TransactionQueryResult>> {
  const queryString = buildQueryString(filters, pagination, include);
  const response = await apiClient.get<ApiResponse<TransactionQueryResult>>(
    `/api/transactions${queryString}`,
  );
  return response.data;
}

/**
 * Get transactions for a specific store
 * @param storeId - Store UUID
 * @param filters - Query filters (from, to)
 * @param pagination - Pagination options (limit, offset)
 * @param include - Include options (include_line_items, include_payments)
 * @returns Transaction query result with transactions and pagination meta
 */
export async function getTransactionsByStore(
  storeId: string,
  filters?: Omit<TransactionQueryFilters, "store_id">,
  pagination?: PaginationOptions,
  include?: IncludeOptions,
): Promise<ApiResponse<TransactionQueryResult>> {
  if (!storeId) {
    throw new Error("Store ID is required");
  }

  const queryString = buildQueryString(filters, pagination, include);
  const response = await apiClient.get<ApiResponse<TransactionQueryResult>>(
    `/api/stores/${storeId}/transactions${queryString}`,
  );
  return response.data;
}

// ============ TanStack Query Keys ============

/**
 * Query key factory for transaction queries
 */
export const transactionKeys = {
  all: ["transactions"] as const,
  lists: () => [...transactionKeys.all, "list"] as const,
  list: (filters?: TransactionQueryFilters, pagination?: PaginationOptions) =>
    [
      ...transactionKeys.lists(),
      filters || {},
      pagination || { limit: 50, offset: 0 },
    ] as const,
  details: () => [...transactionKeys.all, "detail"] as const,
  detail: (transactionId: string, include?: IncludeOptions) =>
    [...transactionKeys.details(), transactionId, include || {}] as const,
};

// ============ TanStack Query Hooks ============

/**
 * Hook to fetch transactions with filters and pagination
 * @param filters - Query filters
 * @param pagination - Pagination options (default: limit 50, offset 0)
 * @param include - Include options
 * @param options - Query options (enabled, etc.)
 * @returns TanStack Query result with transactions data
 */
export function useTransactions(
  filters?: TransactionQueryFilters,
  pagination?: PaginationOptions,
  include?: IncludeOptions,
  options?: { enabled?: boolean },
) {
  const defaultPagination: PaginationOptions = {
    limit: 50,
    offset: 0,
  };

  return useQuery({
    queryKey: transactionKeys.list(filters, pagination || defaultPagination),
    queryFn: () =>
      getTransactions(filters, pagination || defaultPagination, include),
    enabled: options?.enabled !== false,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 30000, // Consider data fresh for 30 seconds
    select: (response) => response.data,
  });
}

/**
 * Hook to fetch transactions for a specific store
 * @param storeId - Store UUID
 * @param filters - Query filters (from, to)
 * @param pagination - Pagination options
 * @param include - Include options
 * @param options - Query options (enabled, etc.)
 * @returns TanStack Query result with transactions data
 */
export function useTransactionsByStore(
  storeId: string | null,
  filters?: Omit<TransactionQueryFilters, "store_id">,
  pagination?: PaginationOptions,
  include?: IncludeOptions,
  options?: { enabled?: boolean },
) {
  const defaultPagination: PaginationOptions = {
    limit: 50,
    offset: 0,
  };

  return useQuery({
    queryKey: [
      ...transactionKeys.lists(),
      "store",
      storeId,
      filters || {},
      pagination || defaultPagination,
    ],
    queryFn: () =>
      getTransactionsByStore(
        storeId!,
        filters,
        pagination || defaultPagination,
        include,
      ),
    enabled: !!storeId && options?.enabled !== false,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 30000,
    select: (response) => response.data,
  });
}

/**
 * Helper function to find a transaction in TanStack Query cache
 * Searches through all list query caches to find the transaction
 * Returns the transaction if found, even if it's missing some includes
 */
function findTransactionInCache(
  queryClient: ReturnType<typeof useQueryClient>,
  transactionId: string,
): TransactionResponse | null {
  // First, check if we have a cached detail query (any variant)
  const detailQueries = queryClient.getQueriesData({
    queryKey: transactionKeys.details(),
  });

  for (const [key, data] of detailQueries) {
    // Check if this is a detail query for our transaction
    const keyArray = key as readonly unknown[];
    if (
      keyArray.length >= 3 &&
      keyArray[1] === transactionId &&
      data &&
      typeof data === "object"
    ) {
      return data as TransactionResponse;
    }
  }

  // Search through all list queries in cache
  const listQueries = queryClient.getQueriesData({
    queryKey: transactionKeys.lists(),
  });

  for (const [, data] of listQueries) {
    if (data && typeof data === "object" && "transactions" in data) {
      const queryResult = data as TransactionQueryResult;
      const transaction = queryResult.transactions.find(
        (t) => t.transaction_id === transactionId,
      );
      if (transaction) {
        return transaction;
      }
    }
  }

  return null;
}

/**
 * Check if a transaction has the required include data
 */
function hasRequiredIncludes(
  transaction: TransactionResponse,
  include?: IncludeOptions,
): boolean {
  if (include?.include_line_items && !transaction.line_items) {
    return false;
  }
  if (include?.include_payments && !transaction.payments) {
    return false;
  }
  return true;
}

/**
 * Hook to fetch a single transaction with full details
 *
 * Uses a cache-first approach:
 * 1. Checks detail query cache
 * 2. Searches list query caches for the transaction
 * 3. Only fetches from API if not found in cache AND additional data is needed
 *
 * This avoids unnecessary API calls when the transaction is already available
 * from the list view, significantly improving performance.
 *
 * @param transactionId - Transaction UUID
 * @param include - Include options (include_line_items, include_payments)
 * @param options - Query options (enabled, etc.)
 * @returns TanStack Query result with transaction data
 */
export function useTransactionDetail(
  transactionId: string | null,
  include?: IncludeOptions,
  options?: { enabled?: boolean },
) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: transactionKeys.detail(transactionId || "", include),
    queryFn: async () => {
      if (!transactionId) {
        throw new Error("Transaction ID is required");
      }

      // First, try to find in cache
      const cached = findTransactionInCache(queryClient, transactionId);

      if (cached) {
        // Check if cached transaction has all required includes
        if (hasRequiredIncludes(cached, include)) {
          // Pre-populate the detail cache with the found transaction
          queryClient.setQueryData(
            transactionKeys.detail(transactionId, include),
            cached,
          );
          return cached;
        }
        // If cached transaction is missing required includes, we'll need to fetch
        // but we can use the cached transaction as a base and only fetch what's missing
      }

      // If not in cache or missing required includes, we need to fetch
      // This is a fallback workaround until a dedicated endpoint is available
      // Try with a reasonable limit first
      let limit = 200;
      let offset = 0;
      let found = false;
      let transaction: TransactionResponse | undefined;

      // Try fetching in chunks if needed (up to 3 attempts)
      for (let attempt = 0; attempt < 3 && !found; attempt++) {
        const response = await getTransactions(
          undefined,
          { limit, offset },
          { include_line_items: true, include_payments: true, ...include },
        );

        transaction = response.data.transactions.find(
          (t) => t.transaction_id === transactionId,
        );

        if (transaction) {
          found = true;
          break;
        }

        // If we got fewer results than requested, we've reached the end
        if (response.data.transactions.length < limit) {
          break;
        }

        // Try next chunk
        offset += limit;
      }

      if (!transaction) {
        throw new Error("Transaction not found");
      }

      return transaction;
    },
    enabled: !!transactionId && options?.enabled !== false,
    refetchOnMount: false, // Changed from "always" - use cache if available
    refetchOnWindowFocus: false,
    staleTime: 60000, // Transaction details are less likely to change
  });
}

/**
 * Hook to invalidate transaction queries
 * Useful after mutations that affect transaction data
 */
export function useInvalidateTransactions() {
  const queryClient = useQueryClient();

  return {
    invalidateList: () =>
      queryClient.invalidateQueries({ queryKey: transactionKeys.lists() }),
    invalidateDetail: (transactionId: string, include?: IncludeOptions) => {
      if (include !== undefined) {
        // Invalidate specific key variant with the provided include options
        return queryClient.invalidateQueries({
          queryKey: transactionKeys.detail(transactionId, include),
        });
      } else {
        // Invalidate all detail variants for this transaction by using a partial key match
        return queryClient.invalidateQueries({
          queryKey: [...transactionKeys.details(), transactionId],
          exact: false,
        });
      }
    },
    invalidateAll: () =>
      queryClient.invalidateQueries({ queryKey: transactionKeys.all }),
  };
}
