import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../../support/test-utils";
import { DepartmentList } from "@/components/config/DepartmentList";
import userEvent from "@testing-library/user-event";
import * as departmentsApi from "@/lib/api/departments";

/**
 * ============================================================================
 * TRACEABILITY MATRIX - DepartmentList Component Tests
 * ============================================================================
 *
 * | Test ID                    | Requirement              | Category      | Priority |
 * |----------------------------|--------------------------|---------------|----------|
 * | DEPT-LIST-001             | Display departments       | Component     | P1       |
 * | DEPT-LIST-002             | Display codes             | Component     | P1       |
 * | DEPT-LIST-003             | Loading state             | Component     | P1       |
 * | DEPT-LIST-004             | Error state               | Component     | P1       |
 * | DEPT-LIST-005             | Search filtering          | Business Logic| P1       |
 * | DEPT-LIST-006             | Lottery filter            | Business Logic| P2       |
 * | DEPT-LIST-007             | Edit callback             | Integration   | P1       |
 * | DEPT-LIST-008             | Delete confirmation       | Component     | P1       |
 * | DEPT-LIST-009             | Empty state               | Edge Case     | P2       |
 * | DEPT-LIST-010             | Parent relationship       | Business Logic| P1       |
 * | DEPT-LIST-011             | Lottery badge display     | Component     | P2       |
 * | DEPT-LIST-012             | XSS prevention            | Security      | P1       |
 * | DEPT-LIST-013             | Hierarchy display         | Component     | P2       |
 * | DEPT-LIST-014             | Case-insensitive search   | Business Logic| P2       |
 * | DEPT-LIST-015             | Status toggle             | Business Logic| P1       |
 *
 * @test-level Component
 * @story Phase 6.2 - Department Management UI
 * @author Claude Code
 * @created 2024-03-15
 */

// ============================================================================
// MOCKS
// ============================================================================

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => "/client-dashboard/config/departments",
}));

vi.mock("@/lib/api/departments", () => ({
  useDepartments: vi.fn(),
  useUpdateDepartment: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
  useDeleteDepartment: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
}));

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

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

const createMockDepartments = () => [
  {
    department_id: "dept-1",
    code: "GROCERY",
    name: "Grocery",
    description: "Grocery items",
    parent_id: null,
    parent_name: null,
    is_lottery: false,
    is_active: true,
    display_order: 1,
    client_id: "client-1",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    department_id: "dept-2",
    code: "DAIRY",
    name: "Dairy",
    description: "Dairy products",
    parent_id: "dept-1",
    parent_name: "Grocery",
    is_lottery: false,
    is_active: true,
    display_order: 2,
    client_id: "client-1",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    department_id: "dept-3",
    code: "LOTTERY",
    name: "Lottery",
    description: "Lottery products",
    parent_id: null,
    parent_name: null,
    is_lottery: true,
    is_active: true,
    display_order: 3,
    client_id: "client-1",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    department_id: "dept-4",
    code: "FROZEN",
    name: "Frozen Foods",
    description: "Frozen food items",
    parent_id: null,
    parent_name: null,
    is_lottery: false,
    is_active: false,
    display_order: 4,
    client_id: "client-1",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
];

// ============================================================================
// COMPONENT TESTS
// ============================================================================

describe("Phase 6.2 - DepartmentList Component Tests", () => {
  let mockDepartments: ReturnType<typeof createMockDepartments>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDepartments = createMockDepartments();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // --------------------------------------------------------------------------
  // Component Rendering Tests
  // --------------------------------------------------------------------------
  describe("Component Rendering", () => {
    it("[DEPT-LIST-001] should display all departments in a table", async () => {
      // GIVEN: API returns list of departments
      vi.mocked(departmentsApi.useDepartments).mockReturnValue({
        data: mockDepartments,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof departmentsApi.useDepartments>);

      // WHEN: Component is rendered
      renderWithProviders(<DepartmentList onEdit={vi.fn()} />);

      // THEN: All departments should be displayed
      await waitFor(() => {
        expect(screen.getByText("Grocery")).toBeInTheDocument();
        expect(screen.getByText("Dairy")).toBeInTheDocument();
        expect(screen.getByText("Lottery")).toBeInTheDocument();
        expect(screen.getByText("Frozen Foods")).toBeInTheDocument();
      });
    });

    it("[DEPT-LIST-002] should display department codes in table", async () => {
      // GIVEN: API returns list of departments
      vi.mocked(departmentsApi.useDepartments).mockReturnValue({
        data: mockDepartments,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof departmentsApi.useDepartments>);

      // WHEN: Component is rendered
      renderWithProviders(<DepartmentList onEdit={vi.fn()} />);

      // THEN: All codes should be displayed
      await waitFor(() => {
        expect(screen.getByText("GROCERY")).toBeInTheDocument();
        expect(screen.getByText("DAIRY")).toBeInTheDocument();
        expect(screen.getByText("LOTTERY")).toBeInTheDocument();
        expect(screen.getByText("FROZEN")).toBeInTheDocument();
      });
    });

    it("[DEPT-LIST-003] should show loading skeleton while fetching", () => {
      // GIVEN: API is loading
      vi.mocked(departmentsApi.useDepartments).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof departmentsApi.useDepartments>);

      // WHEN: Component is rendered
      renderWithProviders(<DepartmentList onEdit={vi.fn()} />);

      // THEN: Skeleton loaders should be displayed
      const skeletons = document.querySelectorAll('[class*="animate-pulse"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it("[DEPT-LIST-004] should display error message when API fails", () => {
      // GIVEN: API returns an error
      const errorMessage = "Failed to load departments";
      vi.mocked(departmentsApi.useDepartments).mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error(errorMessage),
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof departmentsApi.useDepartments>);

      // WHEN: Component is rendered
      renderWithProviders(<DepartmentList onEdit={vi.fn()} />);

      // THEN: Error message should be displayed
      expect(
        screen.getByText(/error loading departments/i),
      ).toBeInTheDocument();
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });

    it("[DEPT-LIST-011] should display lottery badge for lottery departments", async () => {
      // GIVEN: API returns departments with lottery flag
      vi.mocked(departmentsApi.useDepartments).mockReturnValue({
        data: mockDepartments,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof departmentsApi.useDepartments>);

      // WHEN: Component is rendered
      renderWithProviders(<DepartmentList onEdit={vi.fn()} />);

      // THEN: Lottery badge should be displayed
      await waitFor(() => {
        const lotteryBadges = screen.getAllByText(/lottery/i);
        expect(lotteryBadges.length).toBeGreaterThanOrEqual(1);
      });
    });

    it("[DEPT-LIST-013] should display parent department for child departments", async () => {
      // GIVEN: API returns departments with parent relationships
      vi.mocked(departmentsApi.useDepartments).mockReturnValue({
        data: mockDepartments,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof departmentsApi.useDepartments>);

      // WHEN: Component is rendered
      renderWithProviders(<DepartmentList onEdit={vi.fn()} />);

      // THEN: Parent name should be displayed for Dairy department
      await waitFor(() => {
        // Dairy has Grocery as parent
        const groceryTexts = screen.getAllByText("Grocery");
        expect(groceryTexts.length).toBeGreaterThanOrEqual(2); // Once as dept name, once as parent
      });
    });
  });

  // --------------------------------------------------------------------------
  // Business Logic Tests
  // --------------------------------------------------------------------------
  describe("Business Logic", () => {
    it("[DEPT-LIST-005] should filter departments by search query", async () => {
      // GIVEN: API returns list of departments
      vi.mocked(departmentsApi.useDepartments).mockReturnValue({
        data: mockDepartments,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof departmentsApi.useDepartments>);

      const user = userEvent.setup();
      renderWithProviders(<DepartmentList onEdit={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText("Grocery")).toBeInTheDocument();
      });

      // WHEN: User types in search input
      const searchInput = screen.getByPlaceholderText(/search/i);
      await user.type(searchInput, "dairy");

      // THEN: Only matching departments should be displayed
      await waitFor(() => {
        expect(screen.getByText("Dairy")).toBeInTheDocument();
        expect(screen.queryByText("Frozen Foods")).not.toBeInTheDocument();
      });
    });

    it("[DEPT-LIST-014] should perform case-insensitive search", async () => {
      // GIVEN: API returns list of departments
      vi.mocked(departmentsApi.useDepartments).mockReturnValue({
        data: mockDepartments,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof departmentsApi.useDepartments>);

      const user = userEvent.setup();
      renderWithProviders(<DepartmentList onEdit={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText("Grocery")).toBeInTheDocument();
      });

      // WHEN: User searches with different case
      const searchInput = screen.getByPlaceholderText(/search/i);
      await user.type(searchInput, "DAIRY");

      // THEN: Matching departments should still be found
      await waitFor(() => {
        expect(screen.getByText("Dairy")).toBeInTheDocument();
      });
    });

    it("[DEPT-LIST-006] should filter to show only lottery departments", async () => {
      // GIVEN: API returns departments
      vi.mocked(departmentsApi.useDepartments).mockReturnValue({
        data: mockDepartments,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof departmentsApi.useDepartments>);

      const user = userEvent.setup();
      renderWithProviders(<DepartmentList onEdit={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText("Grocery")).toBeInTheDocument();
      });

      // WHEN: User clicks lottery only filter
      const lotteryToggle = screen.getByTestId("lottery-only-toggle");
      await user.click(lotteryToggle);

      // THEN: Only lottery departments should be displayed
      await waitFor(() => {
        expect(screen.getByText("Lottery")).toBeInTheDocument();
        expect(screen.queryByText("Grocery")).not.toBeInTheDocument();
        expect(screen.queryByText("Dairy")).not.toBeInTheDocument();
      });
    });

    it("[DEPT-LIST-010] should display parent-child relationships correctly", async () => {
      // GIVEN: API returns departments with hierarchy
      vi.mocked(departmentsApi.useDepartments).mockReturnValue({
        data: mockDepartments,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof departmentsApi.useDepartments>);

      // WHEN: Component is rendered
      renderWithProviders(<DepartmentList onEdit={vi.fn()} />);

      // THEN: Child department should show parent name
      await waitFor(() => {
        const dairyRow = screen.getByTestId("department-row-dept-2");
        expect(dairyRow).toHaveTextContent("Grocery"); // Parent name
      });
    });

    it("[DEPT-LIST-015] should toggle department status", async () => {
      // GIVEN: API returns departments
      const mockUpdate = vi.fn().mockResolvedValue({});
      vi.mocked(departmentsApi.useDepartments).mockReturnValue({
        data: mockDepartments,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof departmentsApi.useDepartments>);
      vi.mocked(departmentsApi.useUpdateDepartment).mockReturnValue({
        mutateAsync: mockUpdate,
        isPending: false,
      } as unknown as ReturnType<typeof departmentsApi.useUpdateDepartment>);

      const user = userEvent.setup();
      renderWithProviders(<DepartmentList onEdit={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText("Grocery")).toBeInTheDocument();
      });

      // WHEN: User clicks toggle status button
      const toggleButton = screen.getByTestId("toggle-department-dept-1");
      await user.click(toggleButton);

      // THEN: Update mutation should be called with toggled status
      await waitFor(() => {
        expect(mockUpdate).toHaveBeenCalledWith({
          id: "dept-1",
          data: { is_active: false },
        });
      });
    });
  });

  // --------------------------------------------------------------------------
  // Integration Tests
  // --------------------------------------------------------------------------
  describe("Integration", () => {
    it("[DEPT-LIST-007] should call onEdit when edit button is clicked", async () => {
      // GIVEN: API returns departments
      vi.mocked(departmentsApi.useDepartments).mockReturnValue({
        data: mockDepartments,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof departmentsApi.useDepartments>);

      const onEdit = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<DepartmentList onEdit={onEdit} />);

      await waitFor(() => {
        expect(screen.getByText("Grocery")).toBeInTheDocument();
      });

      // WHEN: User clicks edit button
      const editButton = screen.getByTestId("edit-department-dept-1");
      await user.click(editButton);

      // THEN: onEdit callback should be called with department
      expect(onEdit).toHaveBeenCalledWith(mockDepartments[0]);
    });

    it("[DEPT-LIST-008] should show delete confirmation dialog", async () => {
      // GIVEN: API returns departments
      vi.mocked(departmentsApi.useDepartments).mockReturnValue({
        data: mockDepartments,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof departmentsApi.useDepartments>);

      const user = userEvent.setup();
      renderWithProviders(<DepartmentList onEdit={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText("Grocery")).toBeInTheDocument();
      });

      // WHEN: User clicks delete button
      const deleteButton = screen.getByTestId("delete-department-dept-1");
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
    it("[DEPT-LIST-009] should display empty state when no departments exist", async () => {
      // GIVEN: API returns empty array
      vi.mocked(departmentsApi.useDepartments).mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof departmentsApi.useDepartments>);

      // WHEN: Component is rendered
      renderWithProviders(<DepartmentList onEdit={vi.fn()} />);

      // THEN: Empty state message should be displayed
      await waitFor(() => {
        expect(screen.getByText(/no departments found/i)).toBeInTheDocument();
      });
    });

    it("should handle departments with null parent_name", async () => {
      // GIVEN: API returns departments with null parent names
      vi.mocked(departmentsApi.useDepartments).mockReturnValue({
        data: mockDepartments,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof departmentsApi.useDepartments>);

      // WHEN: Component is rendered
      renderWithProviders(<DepartmentList onEdit={vi.fn()} />);

      // THEN: Should render without errors
      await waitFor(() => {
        expect(screen.getByText("Grocery")).toBeInTheDocument();
      });
    });

    it("should handle search with no results", async () => {
      // GIVEN: API returns departments
      vi.mocked(departmentsApi.useDepartments).mockReturnValue({
        data: mockDepartments,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof departmentsApi.useDepartments>);

      const user = userEvent.setup();
      renderWithProviders(<DepartmentList onEdit={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText("Grocery")).toBeInTheDocument();
      });

      // WHEN: User searches for non-existent term
      const searchInput = screen.getByPlaceholderText(/search/i);
      await user.type(searchInput, "nonexistent");

      // THEN: No results message should be displayed
      await waitFor(() => {
        expect(screen.getByText(/no departments match/i)).toBeInTheDocument();
      });
    });

    it("should handle deeply nested hierarchy display", async () => {
      // GIVEN: Departments with multiple levels
      const nestedDepts = [
        ...mockDepartments,
        {
          department_id: "dept-5",
          code: "MILK",
          name: "Milk Products",
          description: "Fresh milk",
          parent_id: "dept-2",
          parent_name: "Dairy",
          is_lottery: false,
          is_active: true,
          display_order: 5,
          client_id: "client-1",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      vi.mocked(departmentsApi.useDepartments).mockReturnValue({
        data: nestedDepts,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof departmentsApi.useDepartments>);

      // WHEN: Component is rendered
      renderWithProviders(<DepartmentList onEdit={vi.fn()} />);

      // THEN: All nested departments should display correctly
      await waitFor(() => {
        expect(screen.getByText("Milk Products")).toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------------------------------
  // Security Tests
  // --------------------------------------------------------------------------
  describe("Security", () => {
    it("[DEPT-LIST-012] should prevent XSS through department data", async () => {
      // GIVEN: API returns department with XSS payload
      const xssPayload = '<script>alert("xss")</script>';
      const maliciousDept = {
        ...mockDepartments[0],
        name: xssPayload,
        description: xssPayload,
      };

      vi.mocked(departmentsApi.useDepartments).mockReturnValue({
        data: [maliciousDept],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof departmentsApi.useDepartments>);

      // WHEN: Component is rendered
      const { container } = renderWithProviders(
        <DepartmentList onEdit={vi.fn()} />,
      );

      // THEN: XSS payload should be escaped and rendered as text
      await waitFor(() => {
        expect(screen.getByText(xssPayload)).toBeInTheDocument();
      });
      // Verify no script tags are injected
      expect(container.querySelectorAll("script")).toHaveLength(0);
    });

    it("should not expose client_id in DOM", async () => {
      // GIVEN: API returns departments
      vi.mocked(departmentsApi.useDepartments).mockReturnValue({
        data: mockDepartments,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof departmentsApi.useDepartments>);

      // WHEN: Component is rendered
      const { container } = renderWithProviders(
        <DepartmentList onEdit={vi.fn()} />,
      );

      await waitFor(() => {
        expect(screen.getByText("Grocery")).toBeInTheDocument();
      });

      // THEN: client_id should not be visible in DOM
      expect(container.textContent).not.toContain("client-1");
    });

    it("should handle HTML entities in department names", async () => {
      // GIVEN: Department with HTML entities
      const htmlEntityDept = {
        ...mockDepartments[0],
        name: "Food &amp; Beverage",
        description: "Items &lt;food&gt;",
      };

      vi.mocked(departmentsApi.useDepartments).mockReturnValue({
        data: [htmlEntityDept],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof departmentsApi.useDepartments>);

      // WHEN: Component is rendered
      renderWithProviders(<DepartmentList onEdit={vi.fn()} />);

      // THEN: HTML entities should be displayed as text
      await waitFor(() => {
        expect(screen.getByText("Food &amp; Beverage")).toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------------------------------
  // Assertion Tests (Data Display Accuracy)
  // --------------------------------------------------------------------------
  describe("Assertions - Data Display Accuracy", () => {
    it("should display correct number of departments", async () => {
      // GIVEN: API returns 4 departments
      vi.mocked(departmentsApi.useDepartments).mockReturnValue({
        data: mockDepartments,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof departmentsApi.useDepartments>);

      // WHEN: Component is rendered
      renderWithProviders(<DepartmentList onEdit={vi.fn()} />);

      // THEN: Should have 4 data rows (plus header)
      await waitFor(() => {
        const rows = screen.getAllByRole("row");
        expect(rows.length).toBe(5); // 1 header + 4 data rows
      });
    });

    it("should display inactive departments with reduced opacity", async () => {
      // GIVEN: API returns departments with inactive item
      vi.mocked(departmentsApi.useDepartments).mockReturnValue({
        data: mockDepartments,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof departmentsApi.useDepartments>);

      // WHEN: Component is rendered
      renderWithProviders(<DepartmentList onEdit={vi.fn()} />);

      // THEN: Inactive department row should have opacity class
      await waitFor(() => {
        const frozenRow = screen.getByTestId("department-row-dept-4");
        expect(frozenRow).toHaveClass("opacity-60");
      });
    });

    it("should display status badges correctly", async () => {
      // GIVEN: API returns departments with different statuses
      vi.mocked(departmentsApi.useDepartments).mockReturnValue({
        data: mockDepartments,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof departmentsApi.useDepartments>);

      // WHEN: Component is rendered
      renderWithProviders(<DepartmentList onEdit={vi.fn()} />);

      // THEN: Status badges should be displayed
      await waitFor(() => {
        const activeBadges = screen.getAllByText("Active");
        const inactiveBadges = screen.getAllByText("Inactive");
        expect(activeBadges.length).toBeGreaterThanOrEqual(1);
        expect(inactiveBadges.length).toBeGreaterThanOrEqual(1);
      });
    });
  });
});
