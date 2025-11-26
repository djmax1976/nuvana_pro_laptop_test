import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import StoresPage from "@/app/(dashboard)/stores/page";

/**
 * Stores Page Component Tests
 *
 * TEST FILE: tests/component/StoresPage.test.tsx
 * FEATURE: System Admin Stores List UI
 * CREATED: 2025-11-25
 *
 * UI RENDERING RULES:
 * - UR-01: Loading state shows skeleton
 * - UR-02: Error state shows error message
 * - UR-03: Empty state shows "No stores found."
 * - UR-04: Store list renders with company names
 * - UR-05: Create button links to /stores/new
 *
 * FOCUS: Conditional rendering, NOT business logic
 * RATIONALE: Fast tests, no API mocking complexity
 *
 * TEST PHILOSOPHY:
 * - Test UI rendering logic only
 * - Mock API responses, not implementation
 * - Fast execution (jsdom, not real browser)
 */

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

// Mock toast hook
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Mock the stores API module
let mockUseAllStores: any;
vi.mock("@/lib/api/stores", () => ({
  useAllStores: () => mockUseAllStores(),
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

describe("StoresPage Component - UI Rendering", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  const renderWithQueryClient = (component: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {component}
      </QueryClientProvider>,
    );
  };

  /**
   * UR-01: Loading state shows skeleton
   *
   * WHY: User feedback during data fetch
   * VALIDATES: isLoading: true → StoreListSkeleton component
   */
  it("[P0-UR-01] renders loading skeleton when data is loading", () => {
    // GIVEN: API is loading
    mockUseAllStores = vi.fn(() => ({
      data: null,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
      isRefetching: false,
    }));

    // WHEN: Component renders
    renderWithQueryClient(<StoresPage />);

    // THEN: Loading skeleton is visible
    // Check for skeleton elements (animate-pulse class is used for loading)
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);

    // AND: Skeleton table is shown (not a data table)
    // The loading state renders a table skeleton, so table exists
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  /**
   * UR-02: Error state shows error message
   *
   * WHY: User feedback on failure
   * VALIDATES: error: Error → Error UI with message
   */
  it("[P0-UR-02] renders error message when API fails", () => {
    // GIVEN: API returns error
    const errorMessage = "Failed to fetch stores";
    mockUseAllStores = vi.fn(() => ({
      data: null,
      isLoading: false,
      error: new Error(errorMessage),
      refetch: vi.fn(),
      isRefetching: false,
    }));

    // WHEN: Component renders
    renderWithQueryClient(<StoresPage />);

    // THEN: Error message is displayed
    expect(screen.getByText("Error loading stores")).toBeInTheDocument();
    expect(screen.getByText(errorMessage)).toBeInTheDocument();

    // AND: No data table is shown
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  /**
   * UR-03: Empty state shows "No stores found."
   *
   * WHY: Clear communication when no data
   * VALIDATES: data: [] → Empty state UI
   */
  it("[P0-UR-03] renders empty state when no stores exist", () => {
    // GIVEN: API returns empty array
    mockUseAllStores = vi.fn(() => ({
      data: { data: [], meta: { total: 0, limit: 20, offset: 0 } },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isRefetching: false,
    }));

    // WHEN: Component renders
    renderWithQueryClient(<StoresPage />);

    // THEN: Empty state message is displayed
    expect(screen.getByText("No stores found.")).toBeInTheDocument();

    // AND: No data table is shown
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    // AND: Create Store button is still visible
    expect(screen.getByText("Create Store")).toBeInTheDocument();
  });

  /**
   * UR-04: Store list renders with company names
   *
   * WHY: Verify data mapping to UI
   * VALIDATES: Table rows match data array, company column shows names
   */
  it("[P0-UR-04] renders store list with company names", () => {
    // GIVEN: API returns stores with company data
    const mockStores = [
      {
        store_id: "store-1",
        company_id: "company-1",
        name: "Test Store 1",
        location_json: { address: "123 Main St" },
        timezone: "America/New_York",
        status: "ACTIVE",
        created_at: "2025-01-15T10:00:00Z",
        updated_at: "2025-01-15T10:00:00Z",
        company: { name: "Company Alpha" },
      },
      {
        store_id: "store-2",
        company_id: "company-2",
        name: "Test Store 2",
        location_json: null,
        timezone: "America/Los_Angeles",
        status: "INACTIVE",
        created_at: "2025-01-16T10:00:00Z",
        updated_at: "2025-01-16T10:00:00Z",
        company: { name: "Company Beta" },
      },
    ];

    mockUseAllStores = vi.fn(() => ({
      data: { data: mockStores, meta: { total: 2, limit: 20, offset: 0 } },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isRefetching: false,
    }));

    // WHEN: Component renders
    renderWithQueryClient(<StoresPage />);

    // THEN: Table is rendered
    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();

    // AND: Store names are displayed
    expect(screen.getByText("Test Store 1")).toBeInTheDocument();
    expect(screen.getByText("Test Store 2")).toBeInTheDocument();

    // AND: Company names are displayed
    expect(screen.getByText("Company Alpha")).toBeInTheDocument();
    expect(screen.getByText("Company Beta")).toBeInTheDocument();

    // AND: Store details are displayed
    expect(screen.getByText("America/New_York")).toBeInTheDocument();
    expect(screen.getByText("America/Los_Angeles")).toBeInTheDocument();
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    expect(screen.getByText("INACTIVE")).toBeInTheDocument();

    // AND: Location is displayed (address)
    expect(screen.getByText("123 Main St")).toBeInTheDocument();
  });

  /**
   * UR-05: Create button navigates to /stores/new
   *
   * WHY: Verify navigation works
   * VALIDATES: Link href="/stores/new" exists
   */
  it("[P0-UR-05] Create Store button links to /stores/new", () => {
    // GIVEN: Stores page renders (any state)
    mockUseAllStores = vi.fn(() => ({
      data: { data: [], meta: { total: 0, limit: 20, offset: 0 } },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isRefetching: false,
    }));

    // WHEN: Component renders
    renderWithQueryClient(<StoresPage />);

    // THEN: Create Store button exists
    const createButton = screen.getByText("Create Store");
    expect(createButton).toBeInTheDocument();

    // AND: Button is wrapped in Link to /stores/new
    const link = createButton.closest("a");
    expect(link).toHaveAttribute("href", "/stores/new");
  });
});
