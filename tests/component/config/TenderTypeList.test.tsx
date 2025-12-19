import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "../../support/test-utils";
import { TenderTypeList } from "@/components/config/TenderTypeList";
import userEvent from "@testing-library/user-event";
import * as tenderTypesApi from "@/lib/api/tender-types";

/**
 * ============================================================================
 * TRACEABILITY MATRIX - TenderTypeList Component Tests
 * ============================================================================
 *
 * | Test ID                    | Requirement           | Category      | Priority |
 * |----------------------------|-----------------------|---------------|----------|
 * | TT-LIST-001               | Display tender types   | Component     | P1       |
 * | TT-LIST-002               | Display codes          | Component     | P1       |
 * | TT-LIST-003               | Loading state          | Component     | P1       |
 * | TT-LIST-004               | Error state            | Component     | P1       |
 * | TT-LIST-005               | Search filtering       | Business Logic| P1       |
 * | TT-LIST-006               | Hide inactive filter   | Business Logic| P2       |
 * | TT-LIST-007               | Edit callback          | Integration   | P1       |
 * | TT-LIST-008               | Delete confirmation    | Component     | P1       |
 * | TT-LIST-009               | Empty state            | Edge Case     | P2       |
 * | TT-LIST-010               | Toggle status          | Business Logic| P1       |
 * | TT-LIST-011               | System type protection | Security      | P1       |
 * | TT-LIST-012               | XSS prevention         | Security      | P1       |
 * | TT-LIST-013               | Cash/Non-cash icons    | Component     | P2       |
 * | TT-LIST-014               | Status badges          | Component     | P2       |
 * | TT-LIST-015               | Case-insensitive search| Business Logic| P2       |
 *
 * @test-level Component
 * @story Phase 6.1 - Tender Type Management UI
 * @author Claude Code
 * @created 2024-03-15
 */

// ============================================================================
// MOCKS
// ============================================================================

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
  }),
  usePathname: () => "/client-dashboard/config/tender-types",
}));

// Mock the API hooks
vi.mock("@/lib/api/tender-types", () => ({
  useTenderTypes: vi.fn(),
  useUpdateTenderType: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
  useDeleteTenderType: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
}));

// Mock the toast hook
const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

// Mock ConfirmDialog to capture props
vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    title,
    description,
    onConfirm,
    onOpenChange,
  }: {
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <h2>{title}</h2>
        <p>{description}</p>
        <button onClick={onConfirm} data-testid="confirm-button">
          Confirm
        </button>
        <button onClick={() => onOpenChange(false)} data-testid="cancel-button">
          Cancel
        </button>
      </div>
    ) : null,
}));

// ============================================================================
// TEST DATA
// ============================================================================

const createMockTenderTypes = () => [
  {
    tender_type_id: "tt-1",
    code: "CASH",
    name: "Cash",
    description: "Cash payments",
    is_cash: true,
    requires_reference: false,
    is_system: false,
    is_active: true,
    display_order: 1,
    client_id: "client-1",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    tender_type_id: "tt-2",
    code: "CREDIT",
    name: "Credit Card",
    description: "Credit card payments",
    is_cash: false,
    requires_reference: true,
    is_system: false,
    is_active: true,
    display_order: 2,
    client_id: "client-1",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    tender_type_id: "tt-3",
    code: "CHECK",
    name: "Check",
    description: "Check payments",
    is_cash: false,
    requires_reference: true,
    is_system: false,
    is_active: false,
    display_order: 3,
    client_id: "client-1",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    tender_type_id: "tt-4",
    code: "SYSTEM_CASH",
    name: "System Cash",
    description: "System-defined cash tender",
    is_cash: true,
    requires_reference: false,
    is_system: true,
    is_active: true,
    display_order: 0,
    client_id: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
];

// ============================================================================
// COMPONENT TESTS
// ============================================================================

describe("Phase 6.1 - TenderTypeList Component Tests", () => {
  let mockTenderTypes: ReturnType<typeof createMockTenderTypes>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTenderTypes = createMockTenderTypes();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // --------------------------------------------------------------------------
  // Component Rendering Tests
  // --------------------------------------------------------------------------
  describe("Component Rendering", () => {
    it("[TT-LIST-001] should display all tender types in a table", async () => {
      // GIVEN: API returns list of tender types
      vi.mocked(tenderTypesApi.useTenderTypes).mockReturnValue({
        data: mockTenderTypes,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as ReturnType<typeof tenderTypesApi.useTenderTypes>);

      // WHEN: Component is rendered
      renderWithProviders(<TenderTypeList onEdit={vi.fn()} />);

      // THEN: All tender types should be displayed
      await waitFor(() => {
        expect(screen.getByText("Cash")).toBeInTheDocument();
        expect(screen.getByText("Credit Card")).toBeInTheDocument();
        expect(screen.getByText("Check")).toBeInTheDocument();
        expect(screen.getByText("System Cash")).toBeInTheDocument();
      });
    });

    it("[TT-LIST-002] should display tender type codes in table", async () => {
      // GIVEN: API returns list of tender types
      vi.mocked(tenderTypesApi.useTenderTypes).mockReturnValue({
        data: mockTenderTypes,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as ReturnType<typeof tenderTypesApi.useTenderTypes>);

      // WHEN: Component is rendered
      renderWithProviders(<TenderTypeList onEdit={vi.fn()} />);

      // THEN: All codes should be displayed
      await waitFor(() => {
        expect(screen.getByText("CASH")).toBeInTheDocument();
        expect(screen.getByText("CREDIT")).toBeInTheDocument();
        expect(screen.getByText("CHECK")).toBeInTheDocument();
        expect(screen.getByText("SYSTEM_CASH")).toBeInTheDocument();
      });
    });

    it("[TT-LIST-003] should show loading skeleton while fetching", () => {
      // GIVEN: API is loading
      vi.mocked(tenderTypesApi.useTenderTypes).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      } as ReturnType<typeof tenderTypesApi.useTenderTypes>);

      // WHEN: Component is rendered
      renderWithProviders(<TenderTypeList onEdit={vi.fn()} />);

      // THEN: Skeleton loaders should be displayed
      const skeletons = document.querySelectorAll('[class*="animate-pulse"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it("[TT-LIST-004] should display error message when API fails", () => {
      // GIVEN: API returns an error
      const errorMessage = "Failed to load tender types";
      vi.mocked(tenderTypesApi.useTenderTypes).mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error(errorMessage),
        refetch: vi.fn(),
      } as ReturnType<typeof tenderTypesApi.useTenderTypes>);

      // WHEN: Component is rendered
      renderWithProviders(<TenderTypeList onEdit={vi.fn()} />);

      // THEN: Error message should be displayed
      expect(
        screen.getByText(/error loading tender types/i),
      ).toBeInTheDocument();
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });

    it("[TT-LIST-013] should display cash icon for cash tender types", async () => {
      // GIVEN: API returns tender types with cash flag
      vi.mocked(tenderTypesApi.useTenderTypes).mockReturnValue({
        data: mockTenderTypes,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as ReturnType<typeof tenderTypesApi.useTenderTypes>);

      // WHEN: Component is rendered
      renderWithProviders(<TenderTypeList onEdit={vi.fn()} />);

      // THEN: Cash/Non-cash badges should be displayed
      await waitFor(() => {
        const cashBadges = screen.getAllByText("Cash");
        const nonCashBadges = screen.getAllByText("Non-Cash");
        expect(cashBadges.length).toBeGreaterThanOrEqual(1);
        expect(nonCashBadges.length).toBeGreaterThanOrEqual(1);
      });
    });

    it("[TT-LIST-014] should display status badges correctly", async () => {
      // GIVEN: API returns tender types with different statuses
      vi.mocked(tenderTypesApi.useTenderTypes).mockReturnValue({
        data: mockTenderTypes,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as ReturnType<typeof tenderTypesApi.useTenderTypes>);

      // WHEN: Component is rendered
      renderWithProviders(<TenderTypeList onEdit={vi.fn()} />);

      // THEN: Status badges should be displayed
      await waitFor(() => {
        const activeBadges = screen.getAllByText("Active");
        const inactiveBadges = screen.getAllByText("Inactive");
        expect(activeBadges.length).toBeGreaterThanOrEqual(1);
        expect(inactiveBadges.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  // --------------------------------------------------------------------------
  // Business Logic Tests
  // --------------------------------------------------------------------------
  describe("Business Logic", () => {
    it("[TT-LIST-005] should filter tender types by search query", async () => {
      // GIVEN: API returns list of tender types
      vi.mocked(tenderTypesApi.useTenderTypes).mockReturnValue({
        data: mockTenderTypes,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as ReturnType<typeof tenderTypesApi.useTenderTypes>);

      const user = userEvent.setup();
      renderWithProviders(<TenderTypeList onEdit={vi.fn()} />);

      // WHEN: User types in search input
      await waitFor(() => {
        expect(screen.getByText("Cash")).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search/i);
      await user.type(searchInput, "credit");

      // THEN: Only matching tender types should be displayed
      await waitFor(() => {
        expect(screen.getByText("Credit Card")).toBeInTheDocument();
        expect(screen.queryByText("Check")).not.toBeInTheDocument();
      });
    });

    it("[TT-LIST-015] should perform case-insensitive search", async () => {
      // GIVEN: API returns list of tender types
      vi.mocked(tenderTypesApi.useTenderTypes).mockReturnValue({
        data: mockTenderTypes,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as ReturnType<typeof tenderTypesApi.useTenderTypes>);

      const user = userEvent.setup();
      renderWithProviders(<TenderTypeList onEdit={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText("Cash")).toBeInTheDocument();
      });

      // WHEN: User searches with different case
      const searchInput = screen.getByPlaceholderText(/search/i);
      await user.type(searchInput, "CREDIT");

      // THEN: Matching tender types should still be found
      await waitFor(() => {
        expect(screen.getByText("Credit Card")).toBeInTheDocument();
      });
    });

    it("[TT-LIST-006] should filter inactive tender types when toggle is clicked", async () => {
      // GIVEN: API returns tender types with inactive items
      vi.mocked(tenderTypesApi.useTenderTypes).mockReturnValue({
        data: mockTenderTypes.filter((t) => t.is_active),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as ReturnType<typeof tenderTypesApi.useTenderTypes>);

      const user = userEvent.setup();
      renderWithProviders(<TenderTypeList onEdit={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText("Cash")).toBeInTheDocument();
      });

      // WHEN: User clicks show inactive toggle
      const toggleButton = screen.getByTestId("show-inactive-toggle");
      await user.click(toggleButton);

      // THEN: API should be called with include_inactive
      expect(tenderTypesApi.useTenderTypes).toHaveBeenCalledWith(
        expect.objectContaining({
          include_inactive: true,
        }),
      );
    });

    it("[TT-LIST-010] should toggle tender type status", async () => {
      // GIVEN: API returns tender types
      const mockUpdate = vi.fn().mockResolvedValue({});
      vi.mocked(tenderTypesApi.useTenderTypes).mockReturnValue({
        data: mockTenderTypes,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as ReturnType<typeof tenderTypesApi.useTenderTypes>);
      vi.mocked(tenderTypesApi.useUpdateTenderType).mockReturnValue({
        mutateAsync: mockUpdate,
        isPending: false,
      } as ReturnType<typeof tenderTypesApi.useUpdateTenderType>);

      const user = userEvent.setup();
      renderWithProviders(<TenderTypeList onEdit={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText("Cash")).toBeInTheDocument();
      });

      // WHEN: User clicks toggle status button
      const toggleButton = screen.getByTestId("toggle-tender-type-tt-1");
      await user.click(toggleButton);

      // THEN: Update mutation should be called with toggled status
      await waitFor(() => {
        expect(mockUpdate).toHaveBeenCalledWith({
          id: "tt-1",
          data: { is_active: false },
        });
      });
    });
  });

  // --------------------------------------------------------------------------
  // Integration Tests
  // --------------------------------------------------------------------------
  describe("Integration", () => {
    it("[TT-LIST-007] should call onEdit when edit button is clicked", async () => {
      // GIVEN: API returns tender types
      vi.mocked(tenderTypesApi.useTenderTypes).mockReturnValue({
        data: mockTenderTypes,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as ReturnType<typeof tenderTypesApi.useTenderTypes>);

      const onEdit = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<TenderTypeList onEdit={onEdit} />);

      await waitFor(() => {
        expect(screen.getByText("Cash")).toBeInTheDocument();
      });

      // WHEN: User clicks edit button
      const editButton = screen.getByTestId("edit-tender-type-tt-1");
      await user.click(editButton);

      // THEN: onEdit callback should be called with tender type
      expect(onEdit).toHaveBeenCalledWith(mockTenderTypes[0]);
    });

    it("[TT-LIST-008] should show delete confirmation dialog", async () => {
      // GIVEN: API returns tender types
      vi.mocked(tenderTypesApi.useTenderTypes).mockReturnValue({
        data: mockTenderTypes,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as ReturnType<typeof tenderTypesApi.useTenderTypes>);

      const user = userEvent.setup();
      renderWithProviders(<TenderTypeList onEdit={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText("Cash")).toBeInTheDocument();
      });

      // WHEN: User clicks delete button
      const deleteButton = screen.getByTestId("delete-tender-type-tt-1");
      await user.click(deleteButton);

      // THEN: Confirmation dialog should appear
      await waitFor(() => {
        expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------------------------------
  // Edge Case Tests
  // --------------------------------------------------------------------------
  describe("Edge Cases", () => {
    it("[TT-LIST-009] should display empty state when no tender types exist", async () => {
      // GIVEN: API returns empty array
      vi.mocked(tenderTypesApi.useTenderTypes).mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as ReturnType<typeof tenderTypesApi.useTenderTypes>);

      // WHEN: Component is rendered
      renderWithProviders(<TenderTypeList onEdit={vi.fn()} />);

      // THEN: Empty state message should be displayed
      await waitFor(() => {
        expect(screen.getByText(/no tender types found/i)).toBeInTheDocument();
      });
    });

    it("should handle search with no results", async () => {
      // GIVEN: API returns tender types
      vi.mocked(tenderTypesApi.useTenderTypes).mockReturnValue({
        data: mockTenderTypes,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as ReturnType<typeof tenderTypesApi.useTenderTypes>);

      const user = userEvent.setup();
      renderWithProviders(<TenderTypeList onEdit={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText("Cash")).toBeInTheDocument();
      });

      // WHEN: User searches for non-existent term
      const searchInput = screen.getByPlaceholderText(/search/i);
      await user.type(searchInput, "nonexistent");

      // THEN: No results message should be displayed
      await waitFor(() => {
        expect(screen.getByText(/no tender types match/i)).toBeInTheDocument();
      });
    });

    it("should handle special characters in search", async () => {
      // GIVEN: API returns tender types
      vi.mocked(tenderTypesApi.useTenderTypes).mockReturnValue({
        data: mockTenderTypes,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as ReturnType<typeof tenderTypesApi.useTenderTypes>);

      const user = userEvent.setup();
      renderWithProviders(<TenderTypeList onEdit={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText("Cash")).toBeInTheDocument();
      });

      // WHEN: User searches with special characters
      const searchInput = screen.getByPlaceholderText(/search/i);
      await user.type(searchInput, "<script>alert(1)</script>");

      // THEN: Should not cause errors, just show no results
      await waitFor(() => {
        expect(screen.getByText(/no tender types match/i)).toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------------------------------
  // Security Tests
  // --------------------------------------------------------------------------
  describe("Security", () => {
    it("[TT-LIST-011] should not allow actions on system tender types", async () => {
      // GIVEN: API returns tender types including system types
      vi.mocked(tenderTypesApi.useTenderTypes).mockReturnValue({
        data: mockTenderTypes,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as ReturnType<typeof tenderTypesApi.useTenderTypes>);

      // WHEN: Component is rendered
      renderWithProviders(<TenderTypeList onEdit={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText("System Cash")).toBeInTheDocument();
      });

      // THEN: System tender type should not have action buttons
      expect(
        screen.queryByTestId("edit-tender-type-tt-4"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("delete-tender-type-tt-4"),
      ).not.toBeInTheDocument();
    });

    it("[TT-LIST-012] should prevent XSS through tender type data", async () => {
      // GIVEN: API returns tender type with XSS payload
      const xssPayload = '<script>alert("xss")</script>';
      const maliciousTenderType = {
        ...mockTenderTypes[0],
        name: xssPayload,
        description: xssPayload,
      };

      vi.mocked(tenderTypesApi.useTenderTypes).mockReturnValue({
        data: [maliciousTenderType],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as ReturnType<typeof tenderTypesApi.useTenderTypes>);

      // WHEN: Component is rendered
      const { container } = renderWithProviders(
        <TenderTypeList onEdit={vi.fn()} />,
      );

      // THEN: XSS payload should be escaped and rendered as text
      await waitFor(() => {
        expect(screen.getByText(xssPayload)).toBeInTheDocument();
      });
      // Verify no script tags are injected
      expect(container.querySelectorAll("script")).toHaveLength(0);
    });

    it("should not expose sensitive data in DOM", async () => {
      // GIVEN: API returns tender types
      vi.mocked(tenderTypesApi.useTenderTypes).mockReturnValue({
        data: mockTenderTypes,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as ReturnType<typeof tenderTypesApi.useTenderTypes>);

      // WHEN: Component is rendered
      const { container } = renderWithProviders(
        <TenderTypeList onEdit={vi.fn()} />,
      );

      await waitFor(() => {
        expect(screen.getByText("Cash")).toBeInTheDocument();
      });

      // THEN: client_id should not be visible in DOM
      expect(container.textContent).not.toContain("client-1");
    });
  });

  // --------------------------------------------------------------------------
  // Assertion Tests (Data Display Accuracy)
  // --------------------------------------------------------------------------
  describe("Assertions - Data Display Accuracy", () => {
    it("should display correct number of tender types", async () => {
      // GIVEN: API returns 4 tender types
      vi.mocked(tenderTypesApi.useTenderTypes).mockReturnValue({
        data: mockTenderTypes,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as ReturnType<typeof tenderTypesApi.useTenderTypes>);

      // WHEN: Component is rendered
      renderWithProviders(<TenderTypeList onEdit={vi.fn()} />);

      // THEN: Should have 4 data rows (plus header)
      await waitFor(() => {
        const rows = screen.getAllByRole("row");
        // 1 header row + 4 data rows
        expect(rows.length).toBe(5);
      });
    });

    it("should display inactive tender types with reduced opacity", async () => {
      // GIVEN: API returns tender types with inactive item
      vi.mocked(tenderTypesApi.useTenderTypes).mockReturnValue({
        data: mockTenderTypes,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as ReturnType<typeof tenderTypesApi.useTenderTypes>);

      // WHEN: Component is rendered
      renderWithProviders(<TenderTypeList onEdit={vi.fn()} />);

      // THEN: Inactive tender type row should have opacity class
      await waitFor(() => {
        const checkRow = screen.getByTestId("tender-type-row-tt-3");
        expect(checkRow).toHaveClass("opacity-60");
      });
    });

    it("should display requires reference badge for applicable tender types", async () => {
      // GIVEN: API returns tender types with requires_reference
      vi.mocked(tenderTypesApi.useTenderTypes).mockReturnValue({
        data: mockTenderTypes,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as ReturnType<typeof tenderTypesApi.useTenderTypes>);

      // WHEN: Component is rendered
      renderWithProviders(<TenderTypeList onEdit={vi.fn()} />);

      // THEN: Ref Required badge should be displayed
      await waitFor(() => {
        const refBadges = screen.getAllByText("Ref Required");
        expect(refBadges.length).toBeGreaterThanOrEqual(1);
      });
    });
  });
});
