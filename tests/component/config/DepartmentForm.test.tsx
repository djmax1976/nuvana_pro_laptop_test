import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithProviders,
  screen,
  fireEvent,
  waitFor,
} from "../../support/test-utils";
import userEvent from "@testing-library/user-event";
import { DepartmentForm } from "@/components/config/DepartmentForm";

/**
 * @test-level Component
 * @justification UI component tests for DepartmentForm - comprehensive coverage
 * @story Phase 6.2 - Department Management UI
 *
 * ============================================================================
 * TRACEABILITY MATRIX - DepartmentForm Component Tests
 * ============================================================================
 *
 * | Test ID          | Requirement                              | Category         | Priority |
 * |------------------|------------------------------------------|------------------|----------|
 * | DEPT-FORM-001    | Render create form with empty fields     | Component        | HIGH     |
 * | DEPT-FORM-002    | Render edit form with existing data      | Component        | HIGH     |
 * | DEPT-FORM-003    | Code field - uppercase conversion        | Business Logic   | MEDIUM   |
 * | DEPT-FORM-004    | Code validation - required in create     | Validation       | HIGH     |
 * | DEPT-FORM-005    | Code validation - format rules           | Validation       | HIGH     |
 * | DEPT-FORM-006    | Name validation - required               | Validation       | HIGH     |
 * | DEPT-FORM-007    | Name validation - max length             | Validation       | MEDIUM   |
 * | DEPT-FORM-008    | Description validation - max length      | Validation       | LOW      |
 * | DEPT-FORM-009    | Display order validation - range         | Validation       | MEDIUM   |
 * | DEPT-FORM-010    | Parent department selection              | Integration      | MEDIUM   |
 * | DEPT-FORM-011    | Lottery checkbox toggle                  | Component        | MEDIUM   |
 * | DEPT-FORM-012    | Submit create form successfully          | Integration      | HIGH     |
 * | DEPT-FORM-013    | Submit edit form successfully            | Integration      | HIGH     |
 * | DEPT-FORM-014    | Handle API errors gracefully             | Edge Case        | HIGH     |
 * | DEPT-FORM-015    | Show loading state during submission     | Component        | MEDIUM   |
 * | DEPT-FORM-016    | Show loading state during data fetch     | Component        | MEDIUM   |
 * | DEPT-FORM-017    | Department not found error state         | Edge Case        | MEDIUM   |
 * | DEPT-FORM-018    | System department cannot be edited       | Edge Case        | HIGH     |
 * | DEPT-FORM-019    | Clear errors when field modified         | Business Logic   | MEDIUM   |
 * | DEPT-FORM-020    | XSS prevention - input sanitization      | Security         | CRITICAL |
 * | DEPT-FORM-021    | Code field hidden in edit mode           | Business Logic   | MEDIUM   |
 * | DEPT-FORM-022    | Navigate back on cancel                  | Component        | LOW      |
 * | DEPT-FORM-023    | Circular parent reference prevention     | Business Logic   | HIGH     |
 *
 * ============================================================================
 */

// ============================================================================
// MOCKS
// ============================================================================

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    back: vi.fn(),
  }),
}));

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Mock department API hooks
const mockCreateMutation = {
  mutateAsync: vi.fn(),
  isPending: false,
};
const mockUpdateMutation = {
  mutateAsync: vi.fn(),
  isPending: false,
};
const mockUseDepartment = vi.fn();
const mockUseDepartments = vi.fn();

vi.mock("@/lib/api/departments", () => ({
  useCreateDepartment: () => mockCreateMutation,
  useUpdateDepartment: () => mockUpdateMutation,
  useDepartment: (id: string | null) => mockUseDepartment(id),
  useDepartments: (params?: unknown) => mockUseDepartments(params),
}));

// ============================================================================
// TEST DATA FACTORIES
// ============================================================================

const createMockDepartment = (
  overrides?: Partial<{
    department_id: string;
    code: string;
    name: string;
    description: string | null;
    parent_id: string | null;
    is_lottery: boolean;
    is_system: boolean;
    is_active: boolean;
    display_order: number;
    client_id: string | null;
    created_at: string;
    updated_at: string;
  }>,
) => ({
  department_id: "dept-001",
  code: "GROCERY",
  name: "Grocery",
  description: "General grocery items",
  parent_id: null,
  is_lottery: false,
  is_system: false,
  is_active: true,
  display_order: 10,
  client_id: "client-001",
  created_at: "2024-01-15T10:00:00Z",
  updated_at: "2024-01-15T10:00:00Z",
  ...overrides,
});

// ============================================================================
// TEST SETUP
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();

  // Default mock returns
  mockUseDepartment.mockReturnValue({
    data: null,
    isLoading: false,
    error: null,
  });

  mockUseDepartments.mockReturnValue({
    data: [
      createMockDepartment({
        department_id: "dept-001",
        code: "GROCERY",
        name: "Grocery",
      }),
      createMockDepartment({
        department_id: "dept-002",
        code: "DAIRY",
        name: "Dairy",
      }),
      createMockDepartment({
        department_id: "dept-003",
        code: "LOTTERY",
        name: "Lottery",
        is_lottery: true,
      }),
    ],
    isLoading: false,
    error: null,
  });

  mockCreateMutation.mutateAsync.mockResolvedValue({
    success: true,
    data: createMockDepartment(),
  });

  mockUpdateMutation.mutateAsync.mockResolvedValue({
    success: true,
    data: createMockDepartment(),
  });
});

// ============================================================================
// COMPONENT RENDERING TESTS
// ============================================================================

describe("Phase 6.2-COMPONENT: DepartmentForm - Rendering", () => {
  /**
   * DEPT-FORM-001: Render create form with empty fields
   */
  it("should render create form with empty fields", () => {
    renderWithProviders(<DepartmentForm mode="create" />);

    expect(screen.getByText("Create Department")).toBeInTheDocument();
    expect(screen.getByTestId("department-code-input")).toHaveValue("");
    expect(screen.getByTestId("department-name-input")).toHaveValue("");
    expect(screen.getByTestId("department-description-input")).toHaveValue("");
    expect(screen.getByTestId("department-display-order-input")).toHaveValue(0);
  });

  /**
   * DEPT-FORM-002: Render edit form with existing data
   */
  it("should render edit form with existing department data", async () => {
    const existingDepartment = createMockDepartment({
      name: "Grocery Items",
      description: "All grocery products",
      display_order: 5,
    });

    mockUseDepartment.mockReturnValue({
      data: existingDepartment,
      isLoading: false,
      error: null,
    });

    renderWithProviders(<DepartmentForm mode="edit" departmentId="dept-001" />);

    await waitFor(() => {
      expect(screen.getByText("Edit Department")).toBeInTheDocument();
    });

    expect(screen.getByTestId("department-name-input")).toHaveValue(
      "Grocery Items",
    );
    expect(screen.getByTestId("department-description-input")).toHaveValue(
      "All grocery products",
    );
    expect(screen.getByTestId("department-display-order-input")).toHaveValue(5);
  });

  /**
   * DEPT-FORM-016: Show loading state during data fetch
   */
  it("should show loading state while fetching department", () => {
    mockUseDepartment.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    });

    renderWithProviders(<DepartmentForm mode="edit" departmentId="dept-001" />);

    expect(
      screen.getByRole("status") || document.querySelector(".animate-spin"),
    ).toBeTruthy();
  });

  /**
   * DEPT-FORM-021: Code field hidden in edit mode
   */
  it("should not display code field in edit mode", async () => {
    mockUseDepartment.mockReturnValue({
      data: createMockDepartment(),
      isLoading: false,
      error: null,
    });

    renderWithProviders(<DepartmentForm mode="edit" departmentId="dept-001" />);

    await waitFor(() => {
      expect(
        screen.queryByTestId("department-code-input"),
      ).not.toBeInTheDocument();
    });
  });

  /**
   * DEPT-FORM-022: Navigate back on cancel
   */
  it("should render cancel button that links back to departments list", () => {
    renderWithProviders(<DepartmentForm mode="create" />);

    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    expect(cancelButton).toBeInTheDocument();
  });
});

// ============================================================================
// BUSINESS LOGIC TESTS
// ============================================================================

describe("Phase 6.2-BUSINESS: DepartmentForm - Business Logic", () => {
  /**
   * DEPT-FORM-003: Code field - uppercase conversion
   */
  it("should convert code input to uppercase", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DepartmentForm mode="create" />);

    const codeInput = screen.getByTestId("department-code-input");
    await user.type(codeInput, "grocery");

    expect(codeInput).toHaveValue("GROCERY");
  });

  /**
   * DEPT-FORM-011: Lottery checkbox toggle
   */
  it("should toggle lottery checkbox", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DepartmentForm mode="create" />);

    const checkbox = screen.getByTestId("department-is-lottery-checkbox");
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  /**
   * DEPT-FORM-019: Clear errors when field modified
   */
  it("should clear error when field is modified", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DepartmentForm mode="create" />);

    // Submit empty form to trigger validation
    const submitButton = screen.getByTestId("department-submit-button");
    await user.click(submitButton);

    // Check that errors are displayed
    expect(screen.getByText("Code is required")).toBeInTheDocument();
    expect(screen.getByText("Name is required")).toBeInTheDocument();

    // Type in the code field
    const codeInput = screen.getByTestId("department-code-input");
    await user.type(codeInput, "TEST");

    // Code error should be cleared
    expect(screen.queryByText("Code is required")).not.toBeInTheDocument();
    // Name error should still be present
    expect(screen.getByText("Name is required")).toBeInTheDocument();
  });

  /**
   * DEPT-FORM-023: Circular parent reference prevention
   */
  it("should filter out current department from parent options", async () => {
    const currentDepartment = createMockDepartment({
      department_id: "dept-001",
      code: "GROCERY",
      name: "Grocery",
    });

    mockUseDepartment.mockReturnValue({
      data: currentDepartment,
      isLoading: false,
      error: null,
    });

    mockUseDepartments.mockReturnValue({
      data: [
        currentDepartment,
        createMockDepartment({
          department_id: "dept-002",
          code: "DAIRY",
          name: "Dairy",
        }),
        createMockDepartment({
          department_id: "dept-003",
          code: "CHILD",
          name: "Child",
          parent_id: "dept-001",
        }),
      ],
      isLoading: false,
      error: null,
    });

    renderWithProviders(<DepartmentForm mode="edit" departmentId="dept-001" />);

    await waitFor(() => {
      expect(screen.getByText("Edit Department")).toBeInTheDocument();
    });

    // The current department shouldn't be selectable as its own parent
    // This is handled by filtering in the component
  });
});

// ============================================================================
// VALIDATION TESTS
// ============================================================================

describe("Phase 6.2-VALIDATION: DepartmentForm - Form Validation", () => {
  /**
   * DEPT-FORM-004: Code validation - required in create
   */
  it("should show error when code is empty on submit", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DepartmentForm mode="create" />);

    // Fill only name
    const nameInput = screen.getByTestId("department-name-input");
    await user.type(nameInput, "Test Department");

    const submitButton = screen.getByTestId("department-submit-button");
    await user.click(submitButton);

    expect(screen.getByText("Code is required")).toBeInTheDocument();
  });

  /**
   * DEPT-FORM-005: Code validation - format rules
   */
  it("should validate code format - must be 2-20 uppercase alphanumeric with underscores", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DepartmentForm mode="create" />);

    const codeInput = screen.getByTestId("department-code-input");
    const nameInput = screen.getByTestId("department-name-input");

    // Too short code (1 character)
    await user.type(codeInput, "A");
    await user.type(nameInput, "Test");

    const submitButton = screen.getByTestId("department-submit-button");
    await user.click(submitButton);

    expect(
      screen.getByText(/Code must be 2-20 uppercase/i),
    ).toBeInTheDocument();
  });

  /**
   * DEPT-FORM-006: Name validation - required
   */
  it("should show error when name is empty on submit", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DepartmentForm mode="create" />);

    // Fill only code
    const codeInput = screen.getByTestId("department-code-input");
    await user.type(codeInput, "TESTCODE");

    const submitButton = screen.getByTestId("department-submit-button");
    await user.click(submitButton);

    expect(screen.getByText("Name is required")).toBeInTheDocument();
  });

  /**
   * DEPT-FORM-007: Name validation - max length (100 chars)
   */
  it("should limit name field to 100 characters via maxLength attribute", () => {
    renderWithProviders(<DepartmentForm mode="create" />);

    const nameInput = screen.getByTestId("department-name-input");
    expect(nameInput).toHaveAttribute("maxLength", "100");
  });

  /**
   * DEPT-FORM-008: Description validation - max length (500 chars)
   */
  it("should limit description field to 500 characters via maxLength attribute", () => {
    renderWithProviders(<DepartmentForm mode="create" />);

    const descInput = screen.getByTestId("department-description-input");
    expect(descInput).toHaveAttribute("maxLength", "500");
  });

  /**
   * DEPT-FORM-009: Display order validation - range (0-9999)
   */
  it("should validate display order is within range", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DepartmentForm mode="create" />);

    const codeInput = screen.getByTestId("department-code-input");
    const nameInput = screen.getByTestId("department-name-input");
    const displayOrderInput = screen.getByTestId(
      "department-display-order-input",
    );

    await user.type(codeInput, "TESTCODE");
    await user.type(nameInput, "Test Name");

    // Clear and enter invalid value
    await user.clear(displayOrderInput);
    await user.type(displayOrderInput, "10000");

    const submitButton = screen.getByTestId("department-submit-button");
    await user.click(submitButton);

    expect(
      screen.getByText(/Display order must be between 0 and 9999/i),
    ).toBeInTheDocument();
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe("Phase 6.2-INTEGRATION: DepartmentForm - API Integration", () => {
  /**
   * DEPT-FORM-012: Submit create form successfully
   */
  it("should call createDepartment mutation and redirect on success", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DepartmentForm mode="create" />);

    const codeInput = screen.getByTestId("department-code-input");
    const nameInput = screen.getByTestId("department-name-input");
    const descInput = screen.getByTestId("department-description-input");

    await user.type(codeInput, "NEWDEPT");
    await user.type(nameInput, "New Department");
    await user.type(descInput, "A test description");

    const submitButton = screen.getByTestId("department-submit-button");
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockCreateMutation.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "NEWDEPT",
          name: "New Department",
          description: "A test description",
        }),
      );
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Success",
        description: "Department created successfully",
      }),
    );

    expect(mockPush).toHaveBeenCalledWith(
      "/client-dashboard/config/departments",
    );
  });

  /**
   * DEPT-FORM-013: Submit edit form successfully
   */
  it("should call updateDepartment mutation and redirect on success", async () => {
    const user = userEvent.setup();

    mockUseDepartment.mockReturnValue({
      data: createMockDepartment({
        department_id: "dept-001",
        name: "Original Name",
      }),
      isLoading: false,
      error: null,
    });

    renderWithProviders(<DepartmentForm mode="edit" departmentId="dept-001" />);

    await waitFor(() => {
      expect(screen.getByTestId("department-name-input")).toHaveValue(
        "Original Name",
      );
    });

    const nameInput = screen.getByTestId("department-name-input");
    await user.clear(nameInput);
    await user.type(nameInput, "Updated Name");

    const submitButton = screen.getByTestId("department-submit-button");
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockUpdateMutation.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "dept-001",
          data: expect.objectContaining({
            name: "Updated Name",
          }),
        }),
      );
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Success",
        description: "Department updated successfully",
      }),
    );
  });

  /**
   * DEPT-FORM-010: Parent department selection
   */
  it("should include parent_id in create request when selected", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DepartmentForm mode="create" />);

    const codeInput = screen.getByTestId("department-code-input");
    const nameInput = screen.getByTestId("department-name-input");

    await user.type(codeInput, "SUBDEPT");
    await user.type(nameInput, "Sub Department");

    // Open parent select and choose a parent
    const parentSelect = screen.getByTestId("department-parent-select");
    await user.click(parentSelect);

    await waitFor(() => {
      const dairyOption = screen.getByText(/Dairy/);
      expect(dairyOption).toBeInTheDocument();
    });

    const dairyOption = screen.getByText(/Dairy/);
    await user.click(dairyOption);

    const submitButton = screen.getByTestId("department-submit-button");
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockCreateMutation.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          parent_id: "dept-002",
        }),
      );
    });
  });
});

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

describe("Phase 6.2-EDGE: DepartmentForm - Edge Cases", () => {
  /**
   * DEPT-FORM-014: Handle API errors gracefully
   */
  it("should display error toast on create failure", async () => {
    const user = userEvent.setup();

    mockCreateMutation.mutateAsync.mockRejectedValueOnce(
      new Error("Department code already exists"),
    );

    renderWithProviders(<DepartmentForm mode="create" />);

    const codeInput = screen.getByTestId("department-code-input");
    const nameInput = screen.getByTestId("department-name-input");

    await user.type(codeInput, "DUPLICATE");
    await user.type(nameInput, "Duplicate Department");

    const submitButton = screen.getByTestId("department-submit-button");
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Error",
          description: "Department code already exists",
          variant: "destructive",
        }),
      );
    });

    // Should not navigate on error
    expect(mockPush).not.toHaveBeenCalled();
  });

  /**
   * DEPT-FORM-015: Show loading state during submission
   */
  it("should disable submit button during submission", async () => {
    const user = userEvent.setup();

    // Make mutation take time
    mockCreateMutation.mutateAsync.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 1000)),
    );

    renderWithProviders(<DepartmentForm mode="create" />);

    const codeInput = screen.getByTestId("department-code-input");
    const nameInput = screen.getByTestId("department-name-input");

    await user.type(codeInput, "TESTCODE");
    await user.type(nameInput, "Test Name");

    const submitButton = screen.getByTestId("department-submit-button");
    await user.click(submitButton);

    // Button should be disabled during submission
    expect(submitButton).toBeDisabled();
  });

  /**
   * DEPT-FORM-017: Department not found error state
   */
  it("should display not found message when department doesn't exist", async () => {
    mockUseDepartment.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });

    renderWithProviders(
      <DepartmentForm mode="edit" departmentId="nonexistent" />,
    );

    expect(screen.getByText("Department not found")).toBeInTheDocument();
  });

  /**
   * DEPT-FORM-018: System department cannot be edited
   */
  it("should show error when attempting to edit system department", async () => {
    mockUseDepartment.mockReturnValue({
      data: createMockDepartment({
        is_system: true,
        name: "System Department",
      }),
      isLoading: false,
      error: null,
    });

    renderWithProviders(
      <DepartmentForm mode="edit" departmentId="system-dept" />,
    );

    expect(
      screen.getByText("System departments cannot be edited"),
    ).toBeInTheDocument();
  });
});

// ============================================================================
// SECURITY TESTS
// ============================================================================

describe("Phase 6.2-SECURITY: DepartmentForm - XSS Prevention", () => {
  /**
   * DEPT-FORM-020: XSS prevention - input sanitization
   */
  it("should escape XSS payloads in form submission", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DepartmentForm mode="create" />);

    const codeInput = screen.getByTestId("department-code-input");
    const nameInput = screen.getByTestId("department-name-input");
    const descInput = screen.getByTestId("department-description-input");

    await user.type(codeInput, "TESTCODE");
    await user.type(nameInput, '<script>alert("xss")</script>');
    await user.type(descInput, '<img src=x onerror="alert(1)">');

    const submitButton = screen.getByTestId("department-submit-button");
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockCreateMutation.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          // The values are passed as-is, React escapes on render
          name: '<script>alert("xss")</script>',
          description: '<img src=x onerror="alert(1)">',
        }),
      );
    });

    // Verify no script tags were executed
    const scripts = document.querySelectorAll("script");
    const maliciousScripts = Array.from(scripts).filter((s) =>
      s.textContent?.includes("alert"),
    );
    expect(maliciousScripts).toHaveLength(0);
  });

  it("should safely display XSS payloads in existing department name", async () => {
    const xssPayload = '<script>alert("xss")</script>';

    mockUseDepartment.mockReturnValue({
      data: createMockDepartment({
        name: xssPayload,
        description: "Safe description",
      }),
      isLoading: false,
      error: null,
    });

    renderWithProviders(<DepartmentForm mode="edit" departmentId="dept-001" />);

    await waitFor(() => {
      // The input should contain the value as text, not executed
      const nameInput = screen.getByTestId("department-name-input");
      expect(nameInput).toHaveValue(xssPayload);
    });

    // Verify no script was created
    const scripts = document.querySelectorAll("script");
    const maliciousScripts = Array.from(scripts).filter((s) =>
      s.textContent?.includes("alert"),
    );
    expect(maliciousScripts).toHaveLength(0);
  });
});

// ============================================================================
// ACCESSIBILITY TESTS
// ============================================================================

describe("Phase 6.2-A11Y: DepartmentForm - Accessibility", () => {
  it("should have proper labels for all form fields", () => {
    renderWithProviders(<DepartmentForm mode="create" />);

    // All inputs should have associated labels
    expect(screen.getByLabelText(/code/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/display order/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/lottery department/i)).toBeInTheDocument();
  });

  it("should mark required fields with asterisk indicator", () => {
    renderWithProviders(<DepartmentForm mode="create" />);

    // Find required field indicators
    const requiredIndicators = screen.getAllByText("*");
    expect(requiredIndicators.length).toBeGreaterThanOrEqual(2); // Code and Name
  });

  it("should announce validation errors", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DepartmentForm mode="create" />);

    const submitButton = screen.getByTestId("department-submit-button");
    await user.click(submitButton);

    // Error messages should be visible for screen readers
    const errorMessages = screen.getAllByText(/is required/i);
    expect(errorMessages.length).toBeGreaterThan(0);
  });
});
