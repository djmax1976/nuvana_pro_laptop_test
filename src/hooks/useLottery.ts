/**
 * Lottery custom hooks
 * Provides TanStack Query hooks for lottery data management
 *
 * Story: 6.10 - Lottery Management UI
 */

"use client";

import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  receivePack,
  activatePack,
  updatePack,
  deletePack,
  getPacks,
  getPackDetails,
  getVariances,
  approveVariance,
  type ReceivePackInput,
  type UpdatePackInput,
  type ApproveVarianceInput,
  type LotteryPackQueryFilters,
  type VarianceQueryFilters,
} from "../lib/api/lottery";

// ============ TanStack Query Keys ============

/**
 * Query key factory for lottery queries
 */
export const lotteryKeys = {
  all: ["lottery"] as const,
  packs: () => [...lotteryKeys.all, "packs"] as const,
  packList: (filters?: LotteryPackQueryFilters) =>
    [...lotteryKeys.packs(), "list", filters || {}] as const,
  packDetail: (packId: string | undefined) =>
    [...lotteryKeys.packs(), "detail", packId] as const,
  variances: () => [...lotteryKeys.all, "variances"] as const,
  varianceList: (filters?: VarianceQueryFilters) =>
    [...lotteryKeys.variances(), "list", filters || {}] as const,
};

// ============ Query Hooks ============

/**
 * Hook to fetch lottery packs with filters
 * @param storeId - Store UUID (required for RLS enforcement)
 * @param filters - Query filters (status, game_id)
 * @param options - Query options (enabled, etc.)
 * @returns TanStack Query result with packs data
 */
export function useLotteryPacks(
  storeId: string | null | undefined,
  filters?: Omit<LotteryPackQueryFilters, "store_id">,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: lotteryKeys.packList(
      storeId ? { ...filters, store_id: storeId } : filters,
    ),
    queryFn: () =>
      getPacks(storeId ? { ...filters, store_id: storeId } : filters),
    enabled: options?.enabled !== false && !!storeId,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 30000, // Consider data fresh for 30 seconds
    select: (response) => response.data,
  });
}

/**
 * Hook to fetch pack details by ID
 * @param packId - Pack UUID
 * @param options - Query options (enabled, etc.)
 * @returns TanStack Query result with pack detail data
 */
export function usePackDetails(
  packId: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: lotteryKeys.packDetail(packId ?? undefined),
    queryFn: () => getPackDetails(packId!),
    enabled: options?.enabled !== false && packId !== null,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    staleTime: 30000, // Consider data fresh for 30 seconds
    select: (response) => response.data,
  });
}

/**
 * Hook to fetch lottery variances with filters
 * @param storeId - Store UUID (required for RLS enforcement)
 * @param filters - Query filters (shift_id, pack_id, status)
 * @param options - Query options (enabled, etc.)
 * @returns TanStack Query result with variances data
 */
export function useLotteryVariances(
  storeId: string | null | undefined,
  filters?: Omit<VarianceQueryFilters, "store_id">,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: lotteryKeys.varianceList(
      storeId ? { ...filters, store_id: storeId } : filters,
    ),
    queryFn: () =>
      getVariances(storeId ? { ...filters, store_id: storeId } : filters),
    enabled: options?.enabled !== false && !!storeId,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 30000, // Consider data fresh for 30 seconds
    select: (response) => response.data,
  });
}

// ============ Mutation Hooks ============

/**
 * Hook to invalidate lottery queries
 * Useful after mutations that affect lottery data
 */
export function useInvalidateLottery() {
  const queryClient = useQueryClient();

  return {
    invalidatePacks: () =>
      queryClient.invalidateQueries({ queryKey: lotteryKeys.packs() }),
    invalidatePackDetail: (packId: string) => {
      return queryClient.invalidateQueries({
        queryKey: lotteryKeys.packDetail(packId),
      });
    },
    invalidateVariances: () =>
      queryClient.invalidateQueries({ queryKey: lotteryKeys.variances() }),
    invalidateAll: () =>
      queryClient.invalidateQueries({ queryKey: lotteryKeys.all }),
  };
}

/**
 * Hook to receive a new lottery pack
 * @returns Mutation hook for pack reception
 */
export function usePackReception() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ReceivePackInput) => receivePack(data),
    onSuccess: () => {
      // Invalidate pack list queries to refresh the list
      queryClient.invalidateQueries({ queryKey: lotteryKeys.packs() });
    },
  });
}

/**
 * Hook to activate a lottery pack
 * @returns Mutation hook for pack activation
 */
export function usePackActivation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (packId: string) => activatePack(packId),
    onSuccess: (_, packId) => {
      // Invalidate pack list and detail queries to refresh after activation
      queryClient.invalidateQueries({ queryKey: lotteryKeys.packs() });
      queryClient.invalidateQueries({
        queryKey: lotteryKeys.packDetail(packId),
      });
    },
  });
}

/**
 * Hook to update a lottery pack
 * @returns Mutation hook for pack update
 */
export function useUpdatePack() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ packId, data }: { packId: string; data: UpdatePackInput }) =>
      updatePack(packId, data),
    onSuccess: (_, { packId }) => {
      // Invalidate pack list and detail queries to refresh after update
      queryClient.invalidateQueries({ queryKey: lotteryKeys.packs() });
      queryClient.invalidateQueries({
        queryKey: lotteryKeys.packDetail(packId),
      });
    },
  });
}

/**
 * Hook to delete a lottery pack
 * @returns Mutation hook for pack deletion
 */
export function useDeletePack() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (packId: string) => deletePack(packId),
    onSuccess: () => {
      // Invalidate pack list queries to refresh after deletion
      queryClient.invalidateQueries({ queryKey: lotteryKeys.packs() });
    },
  });
}

/**
 * Hook to fetch active packs by store
 * Convenience hook that filters by ACTIVE status
 * @param storeId - Store UUID (required for RLS enforcement)
 * @param options - Query options (enabled, etc.)
 * @returns TanStack Query result with active packs data
 */
export function useActivePacksByStore(
  storeId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  return useLotteryPacks(storeId, { status: "ACTIVE" }, options);
}

/**
 * Hook to approve a lottery variance
 * @returns Mutation hook for variance approval
 */
export function useVarianceApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      shiftId,
      data,
    }: {
      shiftId: string;
      data: ApproveVarianceInput;
    }) => approveVariance(shiftId, data),
    onSuccess: () => {
      // Invalidate variance list queries to refresh after approval
      queryClient.invalidateQueries({ queryKey: lotteryKeys.variances() });
      // Also invalidate pack queries as variance approval may affect pack status
      queryClient.invalidateQueries({ queryKey: lotteryKeys.packs() });
    },
  });
}
