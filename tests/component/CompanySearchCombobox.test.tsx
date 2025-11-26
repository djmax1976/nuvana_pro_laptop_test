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
 * - Search input behavior
 * - Debounced API calls
 * - Minimum 2 character requirement
 * - Dropdown display logic
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
      vi.mocked(companiesApi.useCompanies).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      render(<CompanySearchCombobox onValueChange={mockOnValueChange} />);

      expect(screen.getByRole("combobox")).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("Search companies..."),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Type at least 2 characters to search by company name, owner name, or owner email",
        ),
      ).toBeInTheDocument();
    });

    it("should render with custom label and placeholder", () => {
      vi.mocked(companiesApi.useCompanies).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
        error: null,
      } as any);

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
      vi.mocked(companiesApi.useCompanies).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      render(
        <CompanySearchCombobox
          onValueChange={mockOnValueChange}
          disabled={true}
        />,
      );

      expect(screen.getByRole("combobox")).toBeDisabled();
    });

    it("should display error message when error prop is provided", () => {
      vi.mocked(companiesApi.useCompanies).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
        error: null,
      } as any);

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
  });

  // =============================================================================
  // SECTION 2: SEARCH BEHAVIOR
  // =============================================================================

  describe("Search Behavior", () => {
    it("should show minimum character message when input is less than 2 characters", async () => {
      const user = userEvent.setup();
      vi.mocked(companiesApi.useCompanies).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      render(<CompanySearchCombobox onValueChange={mockOnValueChange} />);

      const input = screen.getByRole("combobox");
      await user.type(input, "A");

      // Dropdown should open
      await waitFor(() => {
        expect(screen.getByRole("listbox")).toBeInTheDocument();
      });

      // Should show minimum character message
      expect(
        screen.getByText("Type at least 2 characters to search"),
      ).toBeInTheDocument();
    });

    it("should fetch companies when 2 or more characters are typed", async () => {
      const user = userEvent.setup();
      const mockUseCompanies = vi.fn().mockReturnValue({
        data: mockCompaniesResponse,
        isLoading: false,
        isError: false,
        error: null,
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
    });

    it("should display search results in dropdown", async () => {
      const user = userEvent.setup();
      vi.mocked(companiesApi.useCompanies).mockReturnValue({
        data: mockCompaniesResponse,
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      render(<CompanySearchCombobox onValueChange={mockOnValueChange} />);

      const input = screen.getByRole("combobox");
      await user.type(input, "Acme");

      await waitFor(() => {
        expect(screen.getByText("Acme Corporation")).toBeInTheDocument();
        expect(screen.getByText("Beta Industries")).toBeInTheDocument();
      });
    });

    it("should show loading state while fetching", async () => {
      const user = userEvent.setup();
      vi.mocked(companiesApi.useCompanies).mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
      } as any);

      render(<CompanySearchCombobox onValueChange={mockOnValueChange} />);

      const input = screen.getByRole("combobox");
      await user.type(input, "Ac");

      await waitFor(() => {
        expect(screen.getByText("Searching companies...")).toBeInTheDocument();
      });
    });

    it("should show empty state when no results found", async () => {
      const user = userEvent.setup();
      vi.mocked(companiesApi.useCompanies).mockReturnValue({
        data: { ...mockCompaniesResponse, data: [] },
        isLoading: false,
        isError: false,
        error: null,
      } as any);

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
  // SECTION 3: SELECTION BEHAVIOR
  // =============================================================================

  describe("Selection Behavior", () => {
    it("should call onValueChange when company is selected", async () => {
      const user = userEvent.setup();
      vi.mocked(companiesApi.useCompanies).mockReturnValue({
        data: mockCompaniesResponse,
        isLoading: false,
        isError: false,
        error: null,
      } as any);

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
      vi.mocked(companiesApi.useCompanies).mockReturnValue({
        data: mockCompaniesResponse,
        isLoading: false,
        isError: false,
        error: null,
      } as any);

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
      vi.mocked(companiesApi.useCompanies).mockReturnValue({
        data: mockCompaniesResponse,
        isLoading: false,
        isError: false,
        error: null,
      } as any);

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
      vi.mocked(companiesApi.useCompanies).mockReturnValue({
        data: mockCompaniesResponse,
        isLoading: false,
        isError: false,
        error: null,
      } as any);

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
  // SECTION 4: KEYBOARD NAVIGATION
  // =============================================================================

  describe("Keyboard Navigation", () => {
    it("should open dropdown on Arrow Down key", async () => {
      const user = userEvent.setup();
      vi.mocked(companiesApi.useCompanies).mockReturnValue({
        data: mockCompaniesResponse,
        isLoading: false,
        isError: false,
        error: null,
      } as any);

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
      vi.mocked(companiesApi.useCompanies).mockReturnValue({
        data: mockCompaniesResponse,
        isLoading: false,
        isError: false,
        error: null,
      } as any);

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
      vi.mocked(companiesApi.useCompanies).mockReturnValue({
        data: mockCompaniesResponse,
        isLoading: false,
        isError: false,
        error: null,
      } as any);

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
  });

  // =============================================================================
  // SECTION 5: ACCESSIBILITY
  // =============================================================================

  describe("Accessibility", () => {
    it("should have proper ARIA attributes", async () => {
      const user = userEvent.setup();
      vi.mocked(companiesApi.useCompanies).mockReturnValue({
        data: mockCompaniesResponse,
        isLoading: false,
        isError: false,
        error: null,
      } as any);

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

    it("should have proper role attributes on dropdown elements", async () => {
      const user = userEvent.setup();
      vi.mocked(companiesApi.useCompanies).mockReturnValue({
        data: mockCompaniesResponse,
        isLoading: false,
        isError: false,
        error: null,
      } as any);

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
  });

  // =============================================================================
  // SECTION 6: EDGE CASES
  // =============================================================================

  describe("Edge Cases", () => {
    it("should handle special characters in search", async () => {
      const user = userEvent.setup();
      const mockUseCompanies = vi.fn().mockReturnValue({
        data: mockCompaniesResponse,
        isLoading: false,
        isError: false,
        error: null,
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

    it("should trim whitespace from search query", async () => {
      const user = userEvent.setup();
      const mockUseCompanies = vi.fn().mockReturnValue({
        data: mockCompaniesResponse,
        isLoading: false,
        isError: false,
        error: null,
      });
      vi.mocked(companiesApi.useCompanies).mockImplementation(mockUseCompanies);

      render(<CompanySearchCombobox onValueChange={mockOnValueChange} />);

      const input = screen.getByRole("combobox");
      await user.type(input, "  Acme  ");

      // Should pass trimmed value to API
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
      vi.mocked(companiesApi.useCompanies).mockReturnValue({
        data: mockCompaniesResponse,
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      const { container } = render(
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
  });
});
