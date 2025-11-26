import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../support/test-utils";
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

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock the API hooks
vi.mock("@/lib/api/stores", () => ({
  useStoresByCompany: vi.fn(),
  useUpdateStore: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    reset: vi.fn(),
  }),
  useDeleteStore: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    reset: vi.fn(),
  }),
}));

// Mock toast hook
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe("2.4-COMPONENT: StoreList Component", () => {
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
    {
      store_id: "323e4567-e89b-12d3-a456-426614174002",
      company_id: companyId,
      name: "Test Store 2",
      location_json: null,
      timezone: "Europe/London",
      status: "INACTIVE",
      created_at: "2024-01-02T00:00:00Z",
      updated_at: "2024-01-02T00:00:00Z",
    },
  ];

  const mockResponse: ListStoresResponse = {
    data: mockStores,
    meta: {
      total: 2,
      limit: 10,
      offset: 0,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[P1] 2.4-COMPONENT-032: should render loading skeleton when data is loading", () => {
    // GIVEN: Stores API is loading
    vi.mocked(storesApi.useStoresByCompany).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      isError: false,
      isSuccess: false,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<StoreList companyId={companyId} />);

    // THEN: Loading skeleton should be displayed (skeleton shows divs, not heading)
    expect(screen.getAllByRole("row")).toHaveLength(6); // Header + 5 skeleton rows
    // Verify skeleton loaders are present
    const skeletonLoaders = document.querySelectorAll(".animate-pulse");
    expect(skeletonLoaders.length).toBeGreaterThan(0);
  });

  it("[P1] 2.4-COMPONENT-033: should render error message when API fails", () => {
    // GIVEN: Stores API returns an error
    vi.mocked(storesApi.useStoresByCompany).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Failed to load stores"),
      isError: true,
      isSuccess: false,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<StoreList companyId={companyId} />);

    // THEN: Error message should be displayed
    expect(screen.getByText("Error loading stores")).toBeInTheDocument();
    expect(screen.getByText("Failed to load stores")).toBeInTheDocument();
  });

  it("[P1] 2.4-COMPONENT-034: should render empty state when no stores exist", () => {
    // GIVEN: Stores API returns empty list
    vi.mocked(storesApi.useStoresByCompany).mockReturnValue({
      data: { data: [], meta: mockResponse.meta },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<StoreList companyId={companyId} />);

    // THEN: Empty state message should be displayed
    expect(
      screen.getByText(
        "No stores found. Create your first store to get started.",
      ),
    ).toBeInTheDocument();
  });

  it("[P0] 2.4-COMPONENT-035: should render stores list with all required columns", async () => {
    // GIVEN: Stores API returns data
    vi.mocked(storesApi.useStoresByCompany).mockReturnValue({
      data: mockResponse,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<StoreList companyId={companyId} />);

    // THEN: Stores should be displayed in table with all columns
    await waitFor(() => {
      expect(screen.getByText("Test Store 1")).toBeInTheDocument();
      expect(screen.getByText("Test Store 2")).toBeInTheDocument();
      expect(screen.getByText("America/New_York")).toBeInTheDocument();
      expect(screen.getByText("Europe/London")).toBeInTheDocument();
      expect(screen.getByText("ACTIVE")).toBeInTheDocument();
      expect(screen.getByText("INACTIVE")).toBeInTheDocument();
    });

    // Verify table headers
    expect(screen.getByText("ID")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Address")).toBeInTheDocument();
    expect(screen.getByText("Timezone")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Created At")).toBeInTheDocument();
    expect(screen.getByText("Actions")).toBeInTheDocument();
  });

  it("[P1] 2.4-COMPONENT-036: should display location address when available", async () => {
    // GIVEN: Store has location with address
    vi.mocked(storesApi.useStoresByCompany).mockReturnValue({
      data: mockResponse,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<StoreList companyId={companyId} />);

    // THEN: Address should be displayed
    await waitFor(() => {
      expect(screen.getByText("123 Main St")).toBeInTheDocument();
    });
  });

  it("[P1] 2.4-COMPONENT-037: should display placeholder when address is not available", async () => {
    // GIVEN: Store has GPS coordinates but no address
    // NOTE: The AddressDisplay component now only shows address or "—" placeholder
    const storeWithGPS: Store = {
      store_id: "423e4567-e89b-12d3-a456-426614174003",
      company_id: companyId,
      name: "GPS Store",
      location_json: {
        gps: { lat: 40.7128, lng: -74.006 },
      },
      timezone: "America/New_York",
      status: "ACTIVE",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    };

    vi.mocked(storesApi.useStoresByCompany).mockReturnValue({
      data: { data: [storeWithGPS], meta: mockResponse.meta },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<StoreList companyId={companyId} />);

    // THEN: Placeholder should be displayed when no address
    await waitFor(() => {
      // "—" is used as placeholder for missing address
      expect(screen.getByText("—")).toBeInTheDocument();
    });
  });

  it("[P1] 2.4-COMPONENT-038: should display Create Store button", () => {
    // GIVEN: Stores API returns data
    vi.mocked(storesApi.useStoresByCompany).mockReturnValue({
      data: mockResponse,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<StoreList companyId={companyId} />);

    // THEN: Create Store button should be displayed
    expect(
      screen.getByRole("link", { name: /Create Store/i }),
    ).toBeInTheDocument();
  });

  it("[P1] 2.4-COMPONENT-039: should display Edit, Status toggle, and Delete action buttons for each store", async () => {
    // GIVEN: Stores API returns data
    vi.mocked(storesApi.useStoresByCompany).mockReturnValue({
      data: mockResponse,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<StoreList companyId={companyId} />);

    // THEN: Each store row should have 3 action buttons (Edit, Status toggle, Delete)
    await waitFor(() => {
      const editButtons = screen.getAllByRole("button", {
        name: /Edit/i,
      });
      const deleteButtons = screen.getAllByRole("button", {
        name: /Delete/i,
      });
      expect(editButtons).toHaveLength(2); // One for each store
      expect(deleteButtons).toHaveLength(2); // One for each store
    });
  });
});
