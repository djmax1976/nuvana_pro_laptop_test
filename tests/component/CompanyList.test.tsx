import "@testing-library/jest-dom/vitest";
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

// Mock the API hook
vi.mock("@/lib/api/companies", () => ({
  useCompanies: vi.fn(),
}));

describe("CompanyList Component", () => {
  const mockCompanies: Company[] = [
    {
      company_id: "123e4567-e89b-12d3-a456-426614174000",
      name: "Test Company 1",
      status: "ACTIVE",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    },
    {
      company_id: "223e4567-e89b-12d3-a456-426614174001",
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

  it("should render loading skeleton when data is loading", () => {
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

  it("should render error message when API fails", () => {
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

  it("should render empty state when no companies exist", () => {
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
    expect(
      screen.getByText(
        "No companies found. Create your first company to get started.",
      ),
    ).toBeInTheDocument();
  });

  it("should render companies list with all required columns", async () => {
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

    // Verify table headers
    expect(screen.getByText("ID")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Created At")).toBeInTheDocument();
    expect(screen.getByText("Updated At")).toBeInTheDocument();
    expect(screen.getByText("Actions")).toBeInTheDocument();
  });

  it("should display Create Company button", () => {
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

    // THEN: Create Company button should be displayed
    expect(
      screen.getByRole("link", { name: /Create Company/i }),
    ).toBeInTheDocument();
  });

  it("should display View and Edit action buttons for each company", async () => {
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

    // THEN: View and Edit buttons should be present for each company
    // Buttons use sr-only spans for accessibility, so we query by role and accessible name
    await waitFor(() => {
      const viewButtons = screen.getAllByRole("link", {
        name: /View details/i,
      });
      const editButtons = screen.getAllByRole("link", {
        name: /Edit/i,
      });
      expect(viewButtons).toHaveLength(2);
      expect(editButtons).toHaveLength(2);
    });
  });
});
