/**
 * Transaction Query API client functions
 * Provides functions for interacting with the transaction query API
 * All functions require TRANSACTION_READ permission
 *
 * Story: 3.5 - Transaction Display UI
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

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

/**
 * API error response
 */
export interface ApiError {
  success: false;
  error: string;
  message: string;
}

// ============ API Request Helper ============

/**
 * Make authenticated API request
 * Uses credentials: "include" to send httpOnly cookies
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  // Only set Content-Type header if there's a body
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers,
  });

  if (!response.ok) {
    const errorData: ApiError = await response.json().catch(() => ({
      success: false,
      error: "Unknown error",
      message: `HTTP ${response.status}: ${response.statusText}`,
    }));

    throw new Error(
      errorData.message || errorData.error || "API request failed",
    );
  }

  return response.json();
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

  if (pagination?.limit) {
    params.append("limit", pagination.limit.toString());
  }
  if (pagination?.offset) {
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
  return apiRequest<ApiResponse<TransactionQueryResult>>(
    `/api/transactions${queryString}`,
    {
      method: "GET",
    },
  );
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
  return apiRequest<ApiResponse<TransactionQueryResult>>(
    `/api/stores/${storeId}/transactions${queryString}`,
    {
      method: "GET",
    },
  );
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
 * Hook to fetch a single transaction with full details
 * Note: Since there's no single-transaction endpoint, this queries the list endpoint
 * with a large limit and finds the specific transaction. This is inefficient but works
 * until a dedicated endpoint is added.
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
  return useQuery({
    queryKey: transactionKeys.detail(transactionId || "", include),
    queryFn: async () => {
      if (!transactionId) {
        throw new Error("Transaction ID is required");
      }

      // Query with a large limit to find the transaction
      // This is a workaround until a single-transaction endpoint is available
      const response = await getTransactions(
        undefined,
        { limit: 200, offset: 0 },
        { include_line_items: true, include_payments: true, ...include },
      );

      // Find the specific transaction in the results
      const transaction = response.data.transactions.find(
        (t) => t.transaction_id === transactionId,
      );

      if (!transaction) {
        throw new Error("Transaction not found");
      }

      return transaction;
    },
    enabled: !!transactionId && options?.enabled !== false,
    refetchOnMount: "always",
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
    invalidateDetail: (transactionId: string) =>
      queryClient.invalidateQueries({
        queryKey: transactionKeys.detail(transactionId),
      }),
    invalidateAll: () =>
      queryClient.invalidateQueries({ queryKey: transactionKeys.all }),
  };
}
