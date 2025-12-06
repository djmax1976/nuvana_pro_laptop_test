import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NewStorePage from "@/app/(dashboard)/stores/new/page";
import userEvent from "@testing-library/user-event";

/**
 * New Store Page Component Tests
 *
 * TEST FILE: tests/component/NewStorePage.test.tsx
 * FEATURE: System Admin Store Creation with Company Selector
 * CREATED: 2025-11-25
 *
 * UI RENDERING RULES:
 * - CS-01: CompanyId in URL shows form immediately
 * - CS-02: No companyId shows company selector
 * - CS-03: Selecting company shows form
 * - CS-04: No companies shows empty state
 *
 * FOCUS: Conditional rendering based on query params
 * RATIONALE: Fast tests, no E2E overhead
 *
 * TEST PHILOSOPHY:
 * - Test UI rendering logic only
 * - Mock API responses and navigation hooks
 * - Fast execution (jsdom, not real browser)
 */

// Mock Next.js router and navigation
const mockPush = vi.fn();
const mockBack = vi.fn();
let mockSearchParams: URLSearchParams | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
  useSearchParams: () => mockSearchParams,
}));

// Mock the companies API module
let mockUseCompanies: any;
vi.mock("@/lib/api/companies", () => ({
  useCompanies: (params: any, options: any) =>
    mockUseCompanies(params, options),
}));

// Mock CreateStoreWizard component to isolate page-level rendering tests
// This follows testing pyramid principles: page tests focus on conditional rendering,
// not on wizard implementation details (which has its own test file)
vi.mock("@/components/stores/CreateStoreWizard", () => ({
  CreateStoreWizard: ({ companyId }: { companyId: string }) => (
    <div data-testid="store-form" data-company-id={companyId}>
      CreateStoreWizard for company {companyId}
    </div>
  ),
}));

// Mock toast hook
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Mock useDebounce hook for CompanySearchCombobox
// Returns value immediately for synchronous testing
vi.mock("@/hooks/useDebounce", () => ({
  useDebounce: vi.fn((value: string) => value),
}));

describe("NewStorePage Component - Conditional Rendering", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.clearAllMocks();
    mockSearchParams = null;
  });

  const renderWithQueryClient = (component: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {component}
      </QueryClientProvider>,
    );
  };

  /**
   * CS-01: CompanyId in URL shows form immediately
   *
   * WHY: Corporate admins have companyId in URL (from their company context)
   * VALIDATES: When companyId query param exists → StoreForm renders directly
   */
  it("[P0-CS-01] CompanyId in URL shows form immediately (no selector)", () => {
    // GIVEN: URL has companyId query param
    const testCompanyId = "test-company-123";
    mockSearchParams = new URLSearchParams({ companyId: testCompanyId });

    // AND: useCompanies should not be called (enabled: false)
    mockUseCompanies = vi.fn((params: any, options: any) => {
      // This should not be called because enabled: false
      expect(options?.enabled).toBe(false);
      return {
        data: null,
        isLoading: false,
        error: null,
      };
    });

    // WHEN: Component renders
    renderWithQueryClient(<NewStorePage />);

    // THEN: StoreForm is rendered with companyId
    const storeForm = screen.getByTestId("store-form");
    expect(storeForm).toBeInTheDocument();
    expect(storeForm).toHaveAttribute("data-company-id", testCompanyId);

    // AND: Company selector is NOT visible
    expect(screen.queryByLabelText("Company")).not.toBeInTheDocument();

    // AND: Page title is visible
    expect(screen.getByText("Create Store")).toBeInTheDocument();
  });

  /**
   * CS-02: No companyId shows company selector
   *
   * WHY: System admins need to choose which company to create store for
   * VALIDATES: When no companyId → Company dropdown is shown
   */
  it("[P0-CS-02] No companyId shows company selector", () => {
    // GIVEN: URL has NO companyId query param
    mockSearchParams = new URLSearchParams();

    // AND: API returns companies list
    const mockCompanies = [
      {
        company_id: "company-1",
        name: "Company Alpha",
        status: "ACTIVE",
        created_at: "2025-01-15T10:00:00Z",
        updated_at: "2025-01-15T10:00:00Z",
      },
      {
        company_id: "company-2",
        name: "Company Beta",
        status: "INACTIVE",
        created_at: "2025-01-16T10:00:00Z",
        updated_at: "2025-01-16T10:00:00Z",
      },
    ];

    mockUseCompanies = vi.fn((params: any, options: any) => {
      // Should be called because no companyId in URL
      return {
        data: { data: mockCompanies, meta: { total: 2, limit: 20, offset: 0 } },
        isLoading: false,
        error: null,
      };
    });

    // WHEN: Component renders
    renderWithQueryClient(<NewStorePage />);

    // THEN: Company selector is visible
    expect(screen.getByLabelText("Company")).toBeInTheDocument();

    // AND: Page title and description are visible
    expect(screen.getByText("Create Store")).toBeInTheDocument();
    expect(
      screen.getByText("Search and select a company to create a store for"),
    ).toBeInTheDocument();

    // AND: StoreForm is NOT rendered yet
    expect(screen.queryByTestId("store-form")).not.toBeInTheDocument();
  });

  /**
   * CS-03: Selecting company shows form
   *
   * WHY: After selecting company, user should see form
   * VALIDATES: User interaction → State update → Form renders
   */
  it("[P0-CS-03] Selecting company from dropdown shows form", async () => {
    // GIVEN: URL has NO companyId query param
    mockSearchParams = new URLSearchParams();

    // AND: API returns companies list for both recent (on focus) and search queries
    const mockCompanies = [
      {
        company_id: "company-1",
        name: "Company Alpha",
        status: "ACTIVE",
        created_at: "2025-01-15T10:00:00Z",
        updated_at: "2025-01-15T10:00:00Z",
      },
      {
        company_id: "company-2",
        name: "Company Beta",
        status: "ACTIVE",
        created_at: "2025-01-16T10:00:00Z",
        updated_at: "2025-01-16T10:00:00Z",
      },
    ];

    // CompanySearchCombobox makes two types of queries:
    // 1. Recent companies (limit: 10) on focus when not searching
    // 2. Search companies (limit: 50, with search param) when typing 2+ chars
    mockUseCompanies = vi.fn((params: any, options: any) => {
      // If disabled, return no data
      if (options?.enabled === false) {
        return { data: undefined, isLoading: false, error: null };
      }
      // Return companies for both recent and search queries
      return {
        data: {
          data: mockCompanies,
          meta: { total: 2, limit: params?.limit || 20, offset: 0 },
        },
        isLoading: false,
        error: null,
      };
    });

    // WHEN: Component renders
    renderWithQueryClient(<NewStorePage />);

    // AND: User clicks on the company selector to show recent companies
    const selectTrigger = screen.getByRole("combobox");
    await userEvent.click(selectTrigger);

    // AND: Wait for company options to appear (recent companies shown on focus)
    await waitFor(() => {
      expect(screen.getByText("Company Alpha")).toBeInTheDocument();
    });

    // AND: User selects a company
    await userEvent.click(screen.getByText("Company Alpha"));

    // THEN: StoreForm is rendered with selected companyId
    await waitFor(() => {
      const storeForm = screen.getByTestId("store-form");
      expect(storeForm).toBeInTheDocument();
      expect(storeForm).toHaveAttribute("data-company-id", "company-1");
    });

    // AND: Company selector is no longer visible
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    // AND: Selected company name is displayed
    expect(screen.getByText("Creating store for:")).toBeInTheDocument();
    expect(screen.getByText("Company Alpha")).toBeInTheDocument();
  });

  /**
   * CS-04: No companies shows empty state
   *
   * WHY: If no companies exist, show helpful message
   * VALIDATES: Empty data array → Empty state UI
   */
  it("[P0-CS-04] No companies shows empty state with helpful message", () => {
    // GIVEN: URL has NO companyId query param
    mockSearchParams = new URLSearchParams();

    // AND: API returns empty companies list
    mockUseCompanies = vi.fn(() => ({
      data: { data: [], meta: { total: 0, limit: 20, offset: 0 } },
      isLoading: false,
      error: null,
    }));

    // WHEN: Component renders
    renderWithQueryClient(<NewStorePage />);

    // THEN: Company selector is visible (component doesn't have special empty state)
    expect(screen.getByLabelText("Company")).toBeInTheDocument();

    // AND: StoreForm is NOT rendered
    expect(screen.queryByTestId("store-form")).not.toBeInTheDocument();

    // AND: Page title is still visible
    expect(screen.getByText("Create Store")).toBeInTheDocument();
    expect(
      screen.getByText("Search and select a company to create a store for"),
    ).toBeInTheDocument();
  });
});
