/**
 * Lottery Hooks Unit Tests
 * Tests for src/hooks/useLottery.ts custom hooks
 *
 * Story: 6.10 - Lottery Management UI
 * Task: 10 - Create custom hooks for lottery data management
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import {
  useLotteryPacks,
  usePackDetails,
  useLotteryVariances,
  usePackReception,
  usePackActivation,
  useVarianceApproval,
  useInvalidateLottery,
} from "../../../src/hooks/useLottery";
import * as lotteryApi from "../../../src/lib/api/lottery";

// Mock the API module
vi.mock("../../../src/lib/api/lottery", () => ({
  receivePack: vi.fn(),
  activatePack: vi.fn(),
  getPacks: vi.fn(),
  getPackDetails: vi.fn(),
  getVariances: vi.fn(),
  approveVariance: vi.fn(),
}));

// Create a test query client
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

// Wrapper component for React Query
function QueryWrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useLotteryPacks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch packs successfully", async () => {
    const mockPacks = [
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
      },
    ];

    vi.mocked(lotteryApi.getPacks).mockResolvedValueOnce({
      success: true,
      data: mockPacks,
    });

    const { result } = renderHook(
      () => useLotteryPacks("store-123", { status: "ACTIVE" }),
      {
        wrapper: QueryWrapper,
      },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockPacks);
    expect(lotteryApi.getPacks).toHaveBeenCalledWith({
      store_id: "store-123",
      status: "ACTIVE",
    });
  });

  it("should not fetch when storeId is null", () => {
    const { result } = renderHook(() => useLotteryPacks(null), {
      wrapper: QueryWrapper,
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
    expect(lotteryApi.getPacks).not.toHaveBeenCalled();
  });
});

describe("usePackDetails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch pack details successfully", async () => {
    const mockPackDetail = {
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
      tickets_remaining: 500,
    };

    vi.mocked(lotteryApi.getPackDetails).mockResolvedValueOnce({
      success: true,
      data: mockPackDetail,
    });

    const { result } = renderHook(() => usePackDetails("pack-123"), {
      wrapper: QueryWrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockPackDetail);
    expect(lotteryApi.getPackDetails).toHaveBeenCalledWith("pack-123");
  });

  it("should not fetch when packId is null", () => {
    const { result } = renderHook(() => usePackDetails(null), {
      wrapper: QueryWrapper,
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
    expect(lotteryApi.getPackDetails).not.toHaveBeenCalled();
  });
});

describe("useLotteryVariances", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch variances successfully", async () => {
    const mockVariances = [
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
      },
    ];

    vi.mocked(lotteryApi.getVariances).mockResolvedValueOnce({
      success: true,
      data: mockVariances,
    });

    const { result } = renderHook(
      () => useLotteryVariances("store-123", { status: "unresolved" }),
      {
        wrapper: QueryWrapper,
      },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockVariances);
    expect(lotteryApi.getVariances).toHaveBeenCalledWith({
      store_id: "store-123",
      status: "unresolved",
    });
  });
});

describe("usePackReception", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should successfully receive a pack", async () => {
    const mockPackData = {
      game_id: "game-123",
      pack_number: "PACK-001",
      serial_start: "1000",
      serial_end: "2000",
      store_id: "store-123",
    };

    const mockResponse = {
      success: true,
      data: {
        pack_id: "pack-123",
        ...mockPackData,
        status: "RECEIVED" as const,
        current_bin_id: null,
        received_at: "2025-01-28T10:00:00Z",
        game: { game_id: "game-123", name: "Test Game" },
        store: { store_id: "store-123", name: "Test Store" },
        bin: null,
      },
    };

    vi.mocked(lotteryApi.receivePack).mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => usePackReception(), {
      wrapper: QueryWrapper,
    });

    result.current.mutate(mockPackData);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(lotteryApi.receivePack).toHaveBeenCalledWith(mockPackData);
    expect(result.current.data).toEqual(mockResponse);
  });
});

describe("usePackActivation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should successfully activate a pack", async () => {
    const packId = "pack-123";

    const mockResponse = {
      success: true,
      data: {
        pack_id: packId,
        game_id: "game-123",
        pack_number: "PACK-001",
        serial_start: "1000",
        serial_end: "2000",
        status: "ACTIVE" as const,
        activated_at: "2025-01-28T10:05:00Z",
        game: { game_id: "game-123", name: "Test Game" },
        store: { store_id: "store-123", name: "Test Store" },
        bin: null,
      },
    };

    vi.mocked(lotteryApi.activatePack).mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => usePackActivation(), {
      wrapper: QueryWrapper,
    });

    result.current.mutate(packId);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(lotteryApi.activatePack).toHaveBeenCalledWith(packId);
    expect(result.current.data).toEqual(mockResponse);
  });
});

describe("useVarianceApproval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should successfully approve a variance", async () => {
    const shiftId = "shift-123";
    const varianceData = {
      variance_reason: "Count discrepancy due to damaged tickets",
    };

    const mockResponse = {
      success: true,
      data: {
        shift_id: shiftId,
        status: "CLOSED",
        variance_reason: varianceData.variance_reason,
        variance_amount: -5,
        variance_percentage: -5,
      },
    };

    vi.mocked(lotteryApi.approveVariance).mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => useVarianceApproval(), {
      wrapper: QueryWrapper,
    });

    result.current.mutate({ shiftId, data: varianceData });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(lotteryApi.approveVariance).toHaveBeenCalledWith(
      shiftId,
      varianceData,
    );
    expect(result.current.data).toEqual(mockResponse);
  });
});

describe("useInvalidateLottery", () => {
  it("should provide invalidation functions", () => {
    const { result } = renderHook(() => useInvalidateLottery(), {
      wrapper: QueryWrapper,
    });

    expect(result.current.invalidatePacks).toBeDefined();
    expect(result.current.invalidatePackDetail).toBeDefined();
    expect(result.current.invalidateVariances).toBeDefined();
    expect(result.current.invalidateAll).toBeDefined();
  });
});
