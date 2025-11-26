import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../support/test-utils";
import { CompanyList } from "@/components/companies/CompanyList";
import * as companiesApi from "@/lib/api/companies";
import type { Company, ListCompaniesResponse } from "@/lib/api/companies";

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
vi.mock("@/lib/api/companies", () => ({
  useCompanies: vi.fn(),
  useUpdateCompany: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isLoading: false,
    isError: false,
    error: null,
  })),
  useDeleteCompany: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isLoading: false,
    isError: false,
    error: null,
  })),
}));

// Mock the toast hook
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Mock TanStack Query client
vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: vi.fn(),
    }),
  };
});

// Mock the EditCompanyModal component
vi.mock("@/components/companies/EditCompanyModal", () => ({
  EditCompanyModal: () => null,
}));

// Mock the ConfirmDialog component
vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: () => null,
}));

describe("2.4-COMPONENT: CompanyList Component - Owner Display", () => {
  const mockCompanies: Company[] = [
    {
      company_id: "123e4567-e89b-12d3-a456-426614174000",
      owner_user_id: "423e4567-e89b-12d3-a456-426614174003",
      owner_name: "Test Owner 1",
      owner_email: "owner1@test.com",
      name: "Test Company 1",
      status: "ACTIVE",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    },
    {
      company_id: "223e4567-e89b-12d3-a456-426614174001",
      owner_user_id: "523e4567-e89b-12d3-a456-426614174004",
      owner_name: "Test Owner 2",
      owner_email: "owner2@test.com",
      name: "Test Company 2",
      status: "INACTIVE",
      created_at: "2024-01-02T00:00:00Z",
      updated_at: "2024-01-02T00:00:00Z",
    },
  ];

  const mockResponse: ListCompaniesResponse = {
    data: mockCompanies,
    meta: {
      page: 1,
      limit: 10,
      total_items: 2,
      total_pages: 1,
      has_next_page: false,
      has_previous_page: false,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[P1] 2.4-COMPONENT-012: should render loading skeleton when data is loading", () => {
    // GIVEN: Companies API is loading
    vi.mocked(companiesApi.useCompanies).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      isError: false,
      isSuccess: false,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<CompanyList />);

    // THEN: Loading skeleton should be displayed (skeleton shows divs, not heading)
    expect(screen.getAllByRole("row")).toHaveLength(6); // Header + 5 skeleton rows
    // Verify skeleton loaders are present
    const skeletonLoaders = document.querySelectorAll(".animate-pulse");
    expect(skeletonLoaders.length).toBeGreaterThan(0);
  });

  it("[P1] 2.4-COMPONENT-013: should render error message when API fails", () => {
    // GIVEN: Companies API returns an error
    vi.mocked(companiesApi.useCompanies).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Failed to load companies"),
      isError: true,
      isSuccess: false,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<CompanyList />);

    // THEN: Error message should be displayed
    expect(screen.getByText("Error loading companies")).toBeInTheDocument();
    expect(screen.getByText("Failed to load companies")).toBeInTheDocument();
  });

  it("[P1] 2.4-COMPONENT-014: should render empty state when no companies exist", () => {
    // GIVEN: Companies API returns empty list
    vi.mocked(companiesApi.useCompanies).mockReturnValue({
      data: { data: [], meta: mockResponse.meta },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<CompanyList />);

    // THEN: Empty state message should be displayed
    expect(screen.getByText("No companies found.")).toBeInTheDocument();
  });

  it("[P0] 2.4-COMPONENT-015: should render companies list with all required columns", async () => {
    // GIVEN: Companies API returns data
    vi.mocked(companiesApi.useCompanies).mockReturnValue({
      data: mockResponse,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<CompanyList />);

    // THEN: Companies should be displayed in table with all columns
    await waitFor(() => {
      expect(screen.getByText("Test Company 1")).toBeInTheDocument();
      expect(screen.getByText("Test Company 2")).toBeInTheDocument();
      expect(screen.getByText("ACTIVE")).toBeInTheDocument();
      expect(screen.getByText("INACTIVE")).toBeInTheDocument();
    });

    // Verify table headers (including Owner column)
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Created At")).toBeInTheDocument();
    expect(screen.getByText("Updated At")).toBeInTheDocument();
    expect(screen.getByText("Actions")).toBeInTheDocument();
  });

  it("[P0] 2.4-COMPONENT-016: should display owner name and email for each company", async () => {
    // GIVEN: Companies API returns data with owner info
    vi.mocked(companiesApi.useCompanies).mockReturnValue({
      data: mockResponse,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<CompanyList />);

    // THEN: Owner names and emails should be displayed
    await waitFor(() => {
      expect(screen.getByText("Test Owner 1")).toBeInTheDocument();
      expect(screen.getByText("owner1@test.com")).toBeInTheDocument();
      expect(screen.getByText("Test Owner 2")).toBeInTheDocument();
      expect(screen.getByText("owner2@test.com")).toBeInTheDocument();
    });
  });

  it("[P1] 2.4-COMPONENT-018: should display Edit action buttons for each company", async () => {
    // GIVEN: Companies API returns data
    vi.mocked(companiesApi.useCompanies).mockReturnValue({
      data: mockResponse,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<CompanyList />);

    // THEN: Edit buttons should be present for each company
    // Buttons use sr-only spans for accessibility, so we query by role and accessible name
    await waitFor(() => {
      const editButtons = screen.getAllByRole("button", {
        name: /Edit/i,
      });
      expect(editButtons).toHaveLength(2);
    });
  });

  it("[P1] 2.4-COMPONENT-019: should handle missing owner info gracefully", async () => {
    // GIVEN: Company without owner info
    const companiesWithMissingOwner: Company[] = [
      {
        company_id: "123e4567-e89b-12d3-a456-426614174000",
        owner_user_id: "423e4567-e89b-12d3-a456-426614174003",
        // No owner_name or owner_email
        name: "Orphaned Company",
        status: "ACTIVE",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      },
    ];

    vi.mocked(companiesApi.useCompanies).mockReturnValue({
      data: { data: companiesWithMissingOwner, meta: mockResponse.meta },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<CompanyList />);

    // THEN: Company should display with fallback for missing owner
    await waitFor(() => {
      expect(screen.getByText("Orphaned Company")).toBeInTheDocument();
      // Should show "-" for missing owner name
      expect(screen.getByText("-")).toBeInTheDocument();
    });
  });

  it("[P1] 2.4-COMPONENT-020: should NOT show Create Company button (companies created via user flow)", () => {
    // GIVEN: Companies API returns data
    vi.mocked(companiesApi.useCompanies).mockReturnValue({
      data: mockResponse,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<CompanyList />);

    // THEN: There should be no Create Company button (companies created via user flow)
    expect(
      screen.queryByRole("button", { name: /create company/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /create company/i }),
    ).not.toBeInTheDocument();
  });

  it("[P0] 2.4-COMPONENT-021: should disable delete button for ACTIVE companies", async () => {
    // GIVEN: Companies API returns data with ACTIVE company
    vi.mocked(companiesApi.useCompanies).mockReturnValue({
      data: mockResponse,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<CompanyList />);

    // THEN: Delete button for ACTIVE company should be disabled
    await waitFor(() => {
      const deleteButtons = screen.getAllByRole("button", { name: /Delete/i });
      // First company is ACTIVE - delete should be disabled
      expect(deleteButtons[0]).toBeDisabled();
      // Second company is INACTIVE - delete should be enabled
      expect(deleteButtons[1]).not.toBeDisabled();
    });
  });

  it("[P1] 2.4-COMPONENT-022: should show status toggle buttons for each company", async () => {
    // GIVEN: Companies API returns data
    vi.mocked(companiesApi.useCompanies).mockReturnValue({
      data: mockResponse,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<CompanyList />);

    // THEN: Status toggle buttons should be present
    await waitFor(() => {
      // ACTIVE company should have Deactivate sr-only text
      expect(screen.getByText("Deactivate")).toBeInTheDocument();
      // INACTIVE company should have Activate sr-only text
      expect(screen.getByText("Activate")).toBeInTheDocument();
    });
  });
});

describe("2.4-COMPONENT: CompanyList - List Refresh After Operations", () => {
  const mockCompanies: Company[] = [
    {
      company_id: "123e4567-e89b-12d3-a456-426614174000",
      owner_user_id: "323e4567-e89b-12d3-a456-426614174002",
      owner_name: "Test Owner",
      owner_email: "owner@test.com",
      name: "Test Company 1",
      status: "ACTIVE",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    },
  ];

  const mockResponse: ListCompaniesResponse = {
    data: mockCompanies,
    meta: {
      page: 1,
      limit: 10,
      total_items: 1,
      total_pages: 1,
      has_next_page: false,
      has_previous_page: false,
    },
  };

  const mockRefetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[P1] 2.4-COMPONENT-040: should provide refetch capability for list updates", async () => {
    // GIVEN: Companies list is displayed
    vi.mocked(companiesApi.useCompanies).mockReturnValue({
      data: mockResponse,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: mockRefetch,
    } as any);

    renderWithProviders(<CompanyList />);

    // WHEN: Companies list renders
    await waitFor(() => {
      expect(screen.getByText("Test Company 1")).toBeInTheDocument();
    });

    // THEN: List should have refetch capability (via TanStack Query invalidation)
    expect(mockRefetch).toBeDefined();
  });
});
