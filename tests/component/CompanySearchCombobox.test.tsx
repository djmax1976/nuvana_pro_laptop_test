import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  renderWithProviders,
} from "../support/test-utils";
import { CompanySearchCombobox } from "@/components/companies/CompanySearchCombobox";
import * as companiesApi from "@/lib/api/companies";
import type { Company, ListCompaniesResponse } from "@/lib/api/companies";
import userEvent from "@testing-library/user-event";

// Mock the companies API
vi.mock("@/lib/api/companies", () => ({
  useCompanies: vi.fn(),
}));

// Mock useDebounce to return immediate value for testing
vi.mock("@/hooks/useDebounce", () => ({
  useDebounce: vi.fn((value) => value),
}));

/**
 * CompanySearchCombobox Component Tests
 *
 * PURPOSE: Test the searchable company dropdown component
 *
 * SCOPE:
 * - Recent companies shown on focus (before typing)
 * - Search input behavior with debounced API calls
 * - Minimum 2 character requirement for search mode
 * - Dropdown display logic (recent vs search results)
 * - Selection handling
 * - Keyboard navigation
 * - Accessibility (ARIA attributes)
 * - Loading states
 * - Error states
 */

const mockCompanies: Company[] = [
  {
    company_id: "company-1",
    owner_user_id: "user-1",
    owner_name: "John Doe",
    owner_email: "john@acme.com",
    name: "Acme Corporation",
    address: null,
    status: "ACTIVE",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    company_id: "company-2",
    owner_user_id: "user-2",
    owner_name: "Jane Smith",
    owner_email: "jane@beta.com",
    name: "Beta Industries",
    address: null,
    status: "ACTIVE",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
];

// Additional mock for recent companies (top 10)
const mockRecentCompanies: Company[] = [
  {
    company_id: "company-3",
    owner_user_id: "user-3",
    owner_name: "Recent Owner",
    owner_email: "recent@company.com",
    name: "Recent Company One",
    address: null,
    status: "ACTIVE",
    created_at: "2024-01-15T00:00:00Z",
    updated_at: "2024-01-15T00:00:00Z",
  },
  {
    company_id: "company-4",
    owner_user_id: "user-4",
    owner_name: "Another Owner",
    owner_email: "another@company.com",
    name: "Recent Company Two",
    address: null,
    status: "ACTIVE",
    created_at: "2024-01-14T00:00:00Z",
    updated_at: "2024-01-14T00:00:00Z",
  },
];

const mockCompaniesResponse: ListCompaniesResponse = {
  data: mockCompanies,
  meta: {
    page: 1,
    limit: 50,
    total_items: 2,
    total_pages: 1,
    has_next_page: false,
    has_previous_page: false,
  },
};

const mockRecentCompaniesResponse: ListCompaniesResponse = {
  data: mockRecentCompanies,
  meta: {
    page: 1,
    limit: 10,
    total_items: 2,
    total_pages: 1,
    has_next_page: false,
    has_previous_page: false,
  },
};

/**
 * Helper to mock useCompanies for both recent and search queries
 * The component makes two separate calls:
 * 1. Recent companies: { status: "ACTIVE", limit: 10 } when dropdown is open and not searching
 * 2. Search companies: { search: "...", status: "ACTIVE", limit: 50 } when 2+ chars typed
 */
function setupCompanyMocks(options?: {
  recentData?: ListCompaniesResponse | undefined;
  recentLoading?: boolean;
  searchData?: ListCompaniesResponse | undefined;
  searchLoading?: boolean;
}) {
  const {
    recentData = mockRecentCompaniesResponse,
    recentLoading = false,
    searchData = mockCompaniesResponse,
    searchLoading = false,
  } = options || {};

  vi.mocked(companiesApi.useCompanies).mockImplementation((params, opts) => {
    // Search query (2+ chars) - limit is 50
    if (params?.search || params?.limit === 50) {
      return {
        data: searchData,
        isLoading: searchLoading,
        isError: false,
        error: null,
      } as any;
    }
    // Recent companies (no search, limit 10)
    return {
      data: opts?.enabled === false ? undefined : recentData,
      isLoading: recentLoading,
      isError: false,
      error: null,
    } as any;
  });
}

describe("CompanySearchCombobox", () => {
  const mockOnValueChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =============================================================================
  // SECTION 1: BASIC RENDERING AND INPUT
  // =============================================================================

  describe("Rendering", () => {
    it("should render with default props", () => {
      setupCompanyMocks();

      render(<CompanySearchCombobox onValueChange={mockOnValueChange} />);

      expect(screen.getByRole("combobox")).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("Search or select a company..."),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Click to see recent companies, or type to search by name, owner, or email",
        ),
      ).toBeInTheDocument();
    });

    it("should render with custom label and placeholder", () => {
      setupCompanyMocks();

      render(
        <CompanySearchCombobox
          onValueChange={mockOnValueChange}
          label="Select Company"
          placeholder="Find a company..."
        />,
      );

      expect(screen.getByText("Select Company")).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("Find a company..."),
      ).toBeInTheDocument();
    });

    it("should be disabled when disabled prop is true", () => {
      setupCompanyMocks();

      render(
        <CompanySearchCombobox
          onValueChange={mockOnValueChange}
          disabled={true}
        />,
      );

      expect(screen.getByRole("combobox")).toBeDisabled();
    });

    it("should display error message when error prop is provided", () => {
      setupCompanyMocks();

      render(
        <CompanySearchCombobox
          onValueChange={mockOnValueChange}
          error="Company selection is required"
        />,
      );

      expect(
        screen.getByText("Company selection is required"),
      ).toBeInTheDocument();
    });

    it("should render with testId prop for testing", () => {
      setupCompanyMocks();

      render(
        <CompanySearchCombobox
          onValueChange={mockOnValueChange}
          testId="my-company-select"
        />,
      );

      expect(screen.getByTestId("my-company-select")).toBeInTheDocument();
    });
  });

  // =============================================================================
  // SECTION 2: RECENT COMPANIES (on focus, before typing)
  // =============================================================================

  describe("Recent Companies", () => {
    it("should show recent companies when input is focused without typing", async () => {
      const user = userEvent.setup();
      setupCompanyMocks();

      render(<CompanySearchCombobox onValueChange={mockOnValueChange} />);

      const input = screen.getByRole("combobox");
      await user.click(input);

      // Dropdown should open with recent companies
      await waitFor(() => {
        expect(screen.getByRole("listbox")).toBeInTheDocument();
        expect(screen.getByText("Recent Companies")).toBeInTheDocument();
        expect(screen.getByText("Recent Company One")).toBeInTheDocument();
        expect(screen.getByText("Recent Company Two")).toBeInTheDocument();
      });
    });

    it("should show recent companies when typing less than 2 characters", async () => {
      const user = userEvent.setup();
      setupCompanyMocks();

      render(<CompanySearchCombobox onValueChange={mockOnValueChange} />);

      const input = screen.getByRole("combobox");
      await user.type(input, "A");

      // Dropdown should show recent companies (not "type 2 chars" message)
      await waitFor(() => {
        expect(screen.getByRole("listbox")).toBeInTheDocument();
        expect(screen.getByText("Recent Companies")).toBeInTheDocument();
        expect(screen.getByText("Recent Company One")).toBeInTheDocument();
      });
    });

    it("should show loading state while fetching recent companies", async () => {
      const user = userEvent.setup();
      setupCompanyMocks({ recentLoading: true });

      render(<CompanySearchCombobox onValueChange={mockOnValueChange} />);

      const input = screen.getByRole("combobox");
      await user.click(input);

      await waitFor(() => {
        expect(
          screen.getByText("Loading recent companies..."),
        ).toBeInTheDocument();
      });
    });

    it("should show empty state when no recent companies available", async () => {
      const user = userEvent.setup();
      setupCompanyMocks({
        recentData: { ...mockRecentCompaniesResponse, data: [] },
      });

      render(<CompanySearchCombobox onValueChange={mockOnValueChange} />);

      const input = screen.getByRole("combobox");
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText("No companies available")).toBeInTheDocument();
      });
    });

    it("should allow selecting from recent companies", async () => {
      const user = userEvent.setup();
      setupCompanyMocks();

      render(<CompanySearchCombobox onValueChange={mockOnValueChange} />);

      const input = screen.getByRole("combobox");
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText("Recent Company One")).toBeInTheDocument();
      });

      await user.click(screen.getByText("Recent Company One"));

      expect(mockOnValueChange).toHaveBeenCalledWith(
        "company-3",
        expect.objectContaining({ name: "Recent Company One" }),
      );
    });
  });

  // =============================================================================
  // SECTION 3: SEARCH BEHAVIOR
  // =============================================================================

  describe("Search Behavior", () => {
    it("should switch to search mode when 2 or more characters are typed", async () => {
      const user = userEvent.setup();
      const mockUseCompanies = vi.fn().mockImplementation((params, opts) => {
        if (params?.search || params?.limit === 50) {
          return {
            data: mockCompaniesResponse,
            isLoading: false,
            isError: false,
            error: null,
          };
        }
        return {
          data:
            opts?.enabled === false ? undefined : mockRecentCompaniesResponse,
          isLoading: false,
          isError: false,
          error: null,
        };
      });
      vi.mocked(companiesApi.useCompanies).mockImplementation(mockUseCompanies);

      render(<CompanySearchCombobox onValueChange={mockOnValueChange} />);

      const input = screen.getByRole("combobox");
      await user.type(input, "Ac");

      // Should call useCompanies with search parameter and ACTIVE status
      await waitFor(() => {
        expect(mockUseCompanies).toHaveBeenCalledWith(
          expect.objectContaining({
            search: "Ac",
            status: "ACTIVE",
            limit: 50,
          }),
          expect.objectContaining({
            enabled: true,
          }),
        );
      });

      // Should show search results, not recent companies header
      await waitFor(() => {
        expect(screen.queryByText("Recent Companies")).not.toBeInTheDocument();
        expect(screen.getByText("Acme Corporation")).toBeInTheDocument();
      });
    });

    it("should display search results in dropdown", async () => {
      const user = userEvent.setup();
      setupCompanyMocks();

      render(<CompanySearchCombobox onValueChange={mockOnValueChange} />);

      const input = screen.getByRole("combobox");
      await user.type(input, "Acme");

      await waitFor(() => {
        expect(screen.getByText("Acme Corporation")).toBeInTheDocument();
        expect(screen.getByText("Beta Industries")).toBeInTheDocument();
      });
    });

    it("should show loading state while searching", async () => {
      const user = userEvent.setup();
      setupCompanyMocks({ searchLoading: true });

      render(<CompanySearchCombobox onValueChange={mockOnValueChange} />);

      const input = screen.getByRole("combobox");
      await user.type(input, "Ac");

      await waitFor(() => {
        expect(screen.getByText("Searching companies...")).toBeInTheDocument();
      });
    });

    it("should show empty state when no search results found", async () => {
      const user = userEvent.setup();
      setupCompanyMocks({
        searchData: { ...mockCompaniesResponse, data: [] },
      });

      render(<CompanySearchCombobox onValueChange={mockOnValueChange} />);

      const input = screen.getByRole("combobox");
      await user.type(input, "NonExistent");

      await waitFor(() => {
        expect(
          screen.getByText(/No active companies found matching/),
        ).toBeInTheDocument();
      });
    });
  });

  // =============================================================================
  // SECTION 4: SELECTION BEHAVIOR
  // =============================================================================

  describe("Selection Behavior", () => {
    it("should call onValueChange when company is selected from search", async () => {
      const user = userEvent.setup();
      setupCompanyMocks();

      render(<CompanySearchCombobox onValueChange={mockOnValueChange} />);

      const input = screen.getByRole("combobox");
      await user.type(input, "Acme");

      await waitFor(() => {
        expect(screen.getByText("Acme Corporation")).toBeInTheDocument();
      });

      await user.click(screen.getByText("Acme Corporation"));

      expect(mockOnValueChange).toHaveBeenCalledWith(
        "company-1",
        expect.objectContaining({ name: "Acme Corporation" }),
      );
    });

    it("should update input value when company is selected", async () => {
      const user = userEvent.setup();
      setupCompanyMocks();

      render(<CompanySearchCombobox onValueChange={mockOnValueChange} />);

      const input = screen.getByRole("combobox") as HTMLInputElement;
      await user.type(input, "Acme");

      await waitFor(() => {
        expect(screen.getByText("Acme Corporation")).toBeInTheDocument();
      });

      await user.click(screen.getByText("Acme Corporation"));

      await waitFor(() => {
        expect(input.value).toBe("Acme Corporation");
      });
    });

    it("should close dropdown after selection", async () => {
      const user = userEvent.setup();
      setupCompanyMocks();

      render(<CompanySearchCombobox onValueChange={mockOnValueChange} />);

      const input = screen.getByRole("combobox");
      await user.type(input, "Acme");

      await waitFor(() => {
        expect(screen.getByRole("listbox")).toBeInTheDocument();
      });

      await user.click(screen.getByText("Acme Corporation"));

      await waitFor(() => {
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      });
    });

    it("should clear selection when user modifies search after selection", async () => {
      const user = userEvent.setup();
      setupCompanyMocks();

      render(<CompanySearchCombobox onValueChange={mockOnValueChange} />);

      const input = screen.getByRole("combobox");
      await user.type(input, "Acme");
      await user.click(screen.getByText("Acme Corporation"));

      // Clear the mock
      mockOnValueChange.mockClear();

      // Modify the search
      await user.clear(input);
      await user.type(input, "Beta");

      // Should call onValueChange with empty values to clear selection
      expect(mockOnValueChange).toHaveBeenCalledWith("", null);
    });
  });

  // =============================================================================
  // SECTION 5: KEYBOARD NAVIGATION
  // =============================================================================

  describe("Keyboard Navigation", () => {
    it("should open dropdown on Arrow Down key", async () => {
      const user = userEvent.setup();
      setupCompanyMocks();

      render(<CompanySearchCombobox onValueChange={mockOnValueChange} />);

      const input = screen.getByRole("combobox");
      await user.type(input, "Ac");

      // Close dropdown first
      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      });

      // Open with Arrow Down
      await user.keyboard("{ArrowDown}");

      await waitFor(() => {
        expect(screen.getByRole("listbox")).toBeInTheDocument();
      });
    });

    it("should close dropdown on Escape key", async () => {
      const user = userEvent.setup();
      setupCompanyMocks();

      render(<CompanySearchCombobox onValueChange={mockOnValueChange} />);

      const input = screen.getByRole("combobox");
      await user.type(input, "Acme");

      await waitFor(() => {
        expect(screen.getByRole("listbox")).toBeInTheDocument();
      });

      await user.keyboard("{Escape}");

      await waitFor(() => {
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      });
    });

    it("should select company on Enter key when highlighted", async () => {
      const user = userEvent.setup();
      setupCompanyMocks();

      render(<CompanySearchCombobox onValueChange={mockOnValueChange} />);

      const input = screen.getByRole("combobox");
      await user.type(input, "Ac");

      await waitFor(() => {
        expect(screen.getByRole("listbox")).toBeInTheDocument();
      });

      // Press Enter to select first highlighted option
      await user.keyboard("{Enter}");

      expect(mockOnValueChange).toHaveBeenCalledWith(
        "company-1",
        expect.objectContaining({ name: "Acme Corporation" }),
      );
    });

    it("should navigate through recent companies with Arrow keys", async () => {
      const user = userEvent.setup();
      setupCompanyMocks();

      render(<CompanySearchCombobox onValueChange={mockOnValueChange} />);

      const input = screen.getByRole("combobox");
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole("listbox")).toBeInTheDocument();
        expect(screen.getByText("Recent Company One")).toBeInTheDocument();
      });

      // Navigate down to second item
      await user.keyboard("{ArrowDown}");

      // Press Enter to select second item
      await user.keyboard("{Enter}");

      expect(mockOnValueChange).toHaveBeenCalledWith(
        "company-4",
        expect.objectContaining({ name: "Recent Company Two" }),
      );
    });
  });

  // =============================================================================
  // SECTION 6: ACCESSIBILITY
  // =============================================================================

  describe("Accessibility", () => {
    it("should have proper ARIA attributes", async () => {
      const user = userEvent.setup();
      setupCompanyMocks();

      render(<CompanySearchCombobox onValueChange={mockOnValueChange} />);

      const input = screen.getByRole("combobox");

      expect(input).toHaveAttribute("aria-expanded", "false");
      expect(input).toHaveAttribute("aria-autocomplete", "list");

      await user.type(input, "Ac");

      await waitFor(() => {
        expect(input).toHaveAttribute("aria-expanded", "true");
        expect(input).toHaveAttribute("aria-controls", "company-listbox");
      });
    });

    it("should have proper role attributes on dropdown elements with search results", async () => {
      const user = userEvent.setup();
      setupCompanyMocks();

      render(<CompanySearchCombobox onValueChange={mockOnValueChange} />);

      const input = screen.getByRole("combobox");
      await user.type(input, "Ac");

      await waitFor(() => {
        const listbox = screen.getByRole("listbox");
        expect(listbox).toBeInTheDocument();
        expect(listbox).toHaveAttribute("id", "company-listbox");

        const options = screen.getAllByRole("option");
        expect(options).toHaveLength(2);
        options.forEach((option) => {
          expect(option).toHaveAttribute("aria-selected");
        });
      });
    });

    it("should have proper role attributes on dropdown with recent companies", async () => {
      const user = userEvent.setup();
      setupCompanyMocks();

      render(<CompanySearchCombobox onValueChange={mockOnValueChange} />);

      const input = screen.getByRole("combobox");
      await user.click(input);

      await waitFor(() => {
        const listbox = screen.getByRole("listbox");
        expect(listbox).toBeInTheDocument();

        const options = screen.getAllByRole("option");
        expect(options).toHaveLength(2); // Two recent companies
        options.forEach((option) => {
          expect(option).toHaveAttribute("aria-selected");
        });
      });
    });
  });

  // =============================================================================
  // SECTION 7: EDGE CASES
  // =============================================================================

  describe("Edge Cases", () => {
    it("should handle special characters in search", async () => {
      const user = userEvent.setup();
      const mockUseCompanies = vi.fn().mockImplementation((params, opts) => {
        if (params?.search || params?.limit === 50) {
          return {
            data: mockCompaniesResponse,
            isLoading: false,
            isError: false,
            error: null,
          };
        }
        return {
          data:
            opts?.enabled === false ? undefined : mockRecentCompaniesResponse,
          isLoading: false,
          isError: false,
          error: null,
        };
      });
      vi.mocked(companiesApi.useCompanies).mockImplementation(mockUseCompanies);

      render(<CompanySearchCombobox onValueChange={mockOnValueChange} />);

      const input = screen.getByRole("combobox");
      await user.type(input, "A&B");

      await waitFor(() => {
        expect(mockUseCompanies).toHaveBeenCalledWith(
          expect.objectContaining({
            search: "A&B",
          }),
          expect.any(Object),
        );
      });
    });

    it("should trim whitespace from search query for search mode determination", async () => {
      const user = userEvent.setup();
      const mockUseCompanies = vi.fn().mockImplementation((params, opts) => {
        if (params?.search || params?.limit === 50) {
          return {
            data: mockCompaniesResponse,
            isLoading: false,
            isError: false,
            error: null,
          };
        }
        return {
          data:
            opts?.enabled === false ? undefined : mockRecentCompaniesResponse,
          isLoading: false,
          isError: false,
          error: null,
        };
      });
      vi.mocked(companiesApi.useCompanies).mockImplementation(mockUseCompanies);

      render(<CompanySearchCombobox onValueChange={mockOnValueChange} />);

      const input = screen.getByRole("combobox");
      await user.type(input, "  Acme  ");

      // Should pass raw value to API but determine search mode by trimmed value
      await waitFor(() => {
        expect(mockUseCompanies).toHaveBeenCalledWith(
          expect.objectContaining({
            search: "  Acme  ", // Component passes raw value, API trims it
          }),
          expect.any(Object),
        );
      });
    });

    it("should close dropdown when clicking outside", async () => {
      const user = userEvent.setup();
      setupCompanyMocks();

      render(
        <div>
          <CompanySearchCombobox onValueChange={mockOnValueChange} />
          <div data-testid="outside">Outside Element</div>
        </div>,
      );

      const input = screen.getByRole("combobox");
      await user.type(input, "Ac");

      await waitFor(() => {
        expect(screen.getByRole("listbox")).toBeInTheDocument();
      });

      const outside = screen.getByTestId("outside");
      fireEvent.mouseDown(outside);

      await waitFor(() => {
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      });
    });

    it("should show dropdown testId when testId prop is provided", async () => {
      const user = userEvent.setup();
      setupCompanyMocks();

      render(
        <CompanySearchCombobox
          onValueChange={mockOnValueChange}
          testId="my-company-combobox"
        />,
      );

      const input = screen.getByRole("combobox");
      await user.click(input);

      await waitFor(() => {
        expect(
          screen.getByTestId("my-company-combobox-dropdown"),
        ).toBeInTheDocument();
      });
    });
  });
});
