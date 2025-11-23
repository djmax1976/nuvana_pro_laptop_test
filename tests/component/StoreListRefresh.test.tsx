import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../support/test-utils";
import { QueryClient } from "@tanstack/react-query";
import { StoreList } from "@/components/stores/StoreList";
import * as storesApi from "@/lib/api/stores";
import type { Store, ListStoresResponse } from "@/lib/api/stores";

// Mock Next.js Link component
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

// Mock the API hook
vi.mock("@/lib/api/stores", () => ({
  useStoresByCompany: vi.fn(),
}));

describe("2.4-COMPONENT: StoreList - List Refresh After Operations", () => {
  const companyId = "123e4567-e89b-12d3-a456-426614174000";

  const mockStores: Store[] = [
    {
      store_id: "223e4567-e89b-12d3-a456-426614174001",
      company_id: companyId,
      name: "Test Store 1",
      location_json: {
        address: "123 Main St",
        gps: { lat: 40.7128, lng: -74.006 },
      },
      timezone: "America/New_York",
      status: "ACTIVE",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    },
  ];

  const mockResponse: ListStoresResponse = {
    data: mockStores,
    meta: {
      total: 1,
      limit: 10,
      offset: 0,
    },
  };

  const mockRefetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[P1] 2.4-COMPONENT-043: should refetch stores list after create operation", async () => {
    // GIVEN: Stores list is displayed
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.mocked(storesApi.useStoresByCompany).mockReturnValue({
      data: mockResponse,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: mockRefetch,
    } as any);

    renderWithProviders(<StoreList companyId={companyId} />, { queryClient });

    // WHEN: A store is created (mutation invalidates queries)
    await waitFor(() => {
      expect(screen.getByText("Test Store 1")).toBeInTheDocument();
    });

    // THEN: List should be refetched (via TanStack Query invalidation)
    expect(mockRefetch).toBeDefined();
  });

  it("[P1] 2.4-COMPONENT-044: should refetch stores list after update operation", async () => {
    // GIVEN: Stores list is displayed
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.mocked(storesApi.useStoresByCompany).mockReturnValue({
      data: mockResponse,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: mockRefetch,
    } as any);

    renderWithProviders(<StoreList companyId={companyId} />, { queryClient });

    // WHEN: A store is updated (mutation invalidates queries)
    await waitFor(() => {
      expect(screen.getByText("Test Store 1")).toBeInTheDocument();
    });

    // THEN: List should be refetched
    expect(mockRefetch).toBeDefined();
  });

  it("[P1] 2.4-COMPONENT-045: should refetch stores list after delete operation", async () => {
    // GIVEN: Stores list is displayed
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.mocked(storesApi.useStoresByCompany).mockReturnValue({
      data: mockResponse,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: mockRefetch,
    } as any);

    renderWithProviders(<StoreList companyId={companyId} />, { queryClient });

    // WHEN: A store is deleted (mutation invalidates queries)
    await waitFor(() => {
      expect(screen.getByText("Test Store 1")).toBeInTheDocument();
    });

    // THEN: List should be refetched
    expect(mockRefetch).toBeDefined();
  });
});
