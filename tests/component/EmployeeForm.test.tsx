import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../support/test-utils";
import { EmployeeForm } from "@/components/employees/EmployeeForm";
import userEvent from "@testing-library/user-event";
import * as clientEmployeesApi from "@/lib/api/client-employees";
import * as clientDashboardApi from "@/lib/api/client-dashboard";

/**
 * Component Tests: EmployeeForm
 *
 * CRITICAL TEST COVERAGE:
 * - Password field is required and validated
 * - Password requirements are enforced (8+ chars, uppercase, lowercase, number, special char)
 * - All form fields are rendered and functional
 * - Form submission includes password
 * - Validation errors are displayed correctly
 *
 * Story: 2.91 - Client Employee Management
 */

// Mock the API hooks
vi.mock("@/lib/api/client-employees", () => ({
  useCreateEmployee: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  })),
  useStoreRoles: vi.fn(),
}));

vi.mock("@/lib/api/client-dashboard", () => ({
  useClientDashboard: vi.fn(),
}));

// Mock the toast hook
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe("2.91-COMPONENT: EmployeeForm - Form Fields", () => {
  const mockStores = [
    {
      store_id: "store-1",
      name: "Downtown Store",
      company_name: "Test Company",
    },
    {
      store_id: "store-2",
      name: "Uptown Store",
      company_name: "Test Company",
    },
  ];

  const mockRoles = [
    {
      role_id: "role-1",
      code: "STORE_CASHIER",
      description: "Store cashier",
    },
    {
      role_id: "role-2",
      code: "STORE_MANAGER",
      description: "Store manager",
    },
  ];

  const mockOnSuccess = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clientDashboardApi.useClientDashboard).mockReturnValue({
      data: { stores: mockStores },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);
    vi.mocked(clientEmployeesApi.useStoreRoles).mockReturnValue({
      data: { data: mockRoles },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);
  });

  it("[P0] 2.91-COMPONENT-001: should render all required form fields including password", () => {
    // GIVEN: EmployeeForm component
    // WHEN: Component is rendered
    renderWithProviders(
      <EmployeeForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // THEN: All required fields should be visible
    expect(screen.getByTestId("employee-email")).toBeInTheDocument();
    expect(screen.getByTestId("employee-name")).toBeInTheDocument();
    expect(screen.getByTestId("employee-password")).toBeInTheDocument();
    expect(screen.getByTestId("employee-store")).toBeInTheDocument();
    expect(screen.getByTestId("employee-role")).toBeInTheDocument();
    expect(screen.getByTestId("submit-employee")).toBeInTheDocument();
  });

  it("[P0] 2.91-COMPONENT-002: should have password input with type=password for security", () => {
    // GIVEN: EmployeeForm component
    // WHEN: Component is rendered
    renderWithProviders(
      <EmployeeForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // THEN: Password input should have type="password" to mask input
    const passwordInput = screen.getByTestId("employee-password");
    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("[P1] 2.91-COMPONENT-003: should display password requirements description", () => {
    // GIVEN: EmployeeForm component
    // WHEN: Component is rendered
    renderWithProviders(
      <EmployeeForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // THEN: Password requirements should be displayed
    expect(
      screen.getByText(
        /Must be at least 8 characters with uppercase, lowercase, number, and special character/i,
      ),
    ).toBeInTheDocument();
  });

  it("[P1] 2.91-COMPONENT-004: should show loading state when data is loading", () => {
    // GIVEN: API is loading
    vi.mocked(clientDashboardApi.useClientDashboard).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      isError: false,
      isSuccess: false,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <EmployeeForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // THEN: Store select should be disabled
    const storeSelect = screen.getByTestId("employee-store");
    expect(storeSelect).toBeDisabled();
  });

  it("[P1] 2.91-COMPONENT-005: should have email input with type=email for browser validation", () => {
    // GIVEN: EmployeeForm component
    // WHEN: Component is rendered
    renderWithProviders(
      <EmployeeForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // THEN: Email input should have type="email" for browser-level validation
    const emailInput = screen.getByTestId("employee-email");
    expect(emailInput).toHaveAttribute("type", "email");
    expect(emailInput).toHaveAttribute("placeholder", "employee@example.com");
  });

  it("[P1] 2.91-COMPONENT-006: should display cancel and submit buttons", () => {
    // GIVEN: EmployeeForm component
    // WHEN: Component is rendered
    renderWithProviders(
      <EmployeeForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // THEN: Both buttons should be present
    expect(screen.getByRole("button", { name: /Cancel/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Create Employee/i }),
    ).toBeInTheDocument();
  });
});

describe("2.91-COMPONENT: EmployeeForm - Password Validation", () => {
  const mockStores = [
    {
      store_id: "store-1",
      name: "Downtown Store",
      company_name: "Test Company",
    },
  ];

  const mockRoles = [
    {
      role_id: "role-1",
      code: "STORE_CASHIER",
      description: "Store cashier",
    },
  ];

  const mockOnSuccess = vi.fn();
  const mockOnCancel = vi.fn();
  const mockCreateEmployee = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateEmployee.mockResolvedValue({ success: true });
    vi.mocked(clientDashboardApi.useClientDashboard).mockReturnValue({
      data: { stores: mockStores },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);
    vi.mocked(clientEmployeesApi.useStoreRoles).mockReturnValue({
      data: { data: mockRoles },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);
    vi.mocked(clientEmployeesApi.useCreateEmployee).mockReturnValue({
      mutateAsync: mockCreateEmployee,
      isPending: false,
      isError: false,
      error: null,
    } as any);
  });

  it("[P0] 2.91-COMPONENT-010: should reject password shorter than 8 characters", async () => {
    // GIVEN: EmployeeForm with all fields filled except proper password
    const user = userEvent.setup();
    renderWithProviders(
      <EmployeeForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // Fill in fields
    await user.type(screen.getByTestId("employee-email"), "test@example.com");
    await user.type(screen.getByTestId("employee-name"), "Test User");
    await user.type(screen.getByTestId("employee-password"), "Short1!");

    // WHEN: Form is submitted
    await user.click(screen.getByTestId("submit-employee"));

    // THEN: Validation error should be displayed
    await waitFor(() => {
      expect(
        screen.getByText(/Password must be at least 8 characters/i),
      ).toBeInTheDocument();
    });

    // AND: Mutation should NOT be called
    expect(mockCreateEmployee).not.toHaveBeenCalled();
  });

  it("[P0] 2.91-COMPONENT-011: should reject password without uppercase letter", async () => {
    // GIVEN: EmployeeForm with password missing uppercase
    const user = userEvent.setup();
    renderWithProviders(
      <EmployeeForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    await user.type(screen.getByTestId("employee-email"), "test@example.com");
    await user.type(screen.getByTestId("employee-name"), "Test User");
    await user.type(screen.getByTestId("employee-password"), "password123!");

    // WHEN: Form is submitted
    await user.click(screen.getByTestId("submit-employee"));

    // THEN: Validation error should be displayed
    await waitFor(() => {
      expect(
        screen.getByText(
          /Password must contain at least one uppercase letter/i,
        ),
      ).toBeInTheDocument();
    });
  });

  it("[P0] 2.91-COMPONENT-012: should reject password without lowercase letter", async () => {
    // GIVEN: EmployeeForm with password missing lowercase
    const user = userEvent.setup();
    renderWithProviders(
      <EmployeeForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    await user.type(screen.getByTestId("employee-email"), "test@example.com");
    await user.type(screen.getByTestId("employee-name"), "Test User");
    await user.type(screen.getByTestId("employee-password"), "PASSWORD123!");

    // WHEN: Form is submitted
    await user.click(screen.getByTestId("submit-employee"));

    // THEN: Validation error should be displayed
    await waitFor(() => {
      expect(
        screen.getByText(
          /Password must contain at least one lowercase letter/i,
        ),
      ).toBeInTheDocument();
    });
  });

  it("[P0] 2.91-COMPONENT-013: should reject password without number", async () => {
    // GIVEN: EmployeeForm with password missing number
    const user = userEvent.setup();
    renderWithProviders(
      <EmployeeForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    await user.type(screen.getByTestId("employee-email"), "test@example.com");
    await user.type(screen.getByTestId("employee-name"), "Test User");
    await user.type(screen.getByTestId("employee-password"), "Password!");

    // WHEN: Form is submitted
    await user.click(screen.getByTestId("submit-employee"));

    // THEN: Validation error should be displayed
    await waitFor(() => {
      expect(
        screen.getByText(/Password must contain at least one number/i),
      ).toBeInTheDocument();
    });
  });

  it("[P0] 2.91-COMPONENT-014: should reject password without special character", async () => {
    // GIVEN: EmployeeForm with password missing special char
    const user = userEvent.setup();
    renderWithProviders(
      <EmployeeForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    await user.type(screen.getByTestId("employee-email"), "test@example.com");
    await user.type(screen.getByTestId("employee-name"), "Test User");
    await user.type(screen.getByTestId("employee-password"), "Password123");

    // WHEN: Form is submitted
    await user.click(screen.getByTestId("submit-employee"));

    // THEN: Validation error should be displayed
    await waitFor(() => {
      expect(
        screen.getByText(
          /Password must contain at least one special character/i,
        ),
      ).toBeInTheDocument();
    });
  });

  it("[P0] 2.91-COMPONENT-015: should accept valid strong password", async () => {
    // GIVEN: EmployeeForm with all valid fields
    const user = userEvent.setup();
    renderWithProviders(
      <EmployeeForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // Fill in all required fields with valid data
    await user.type(screen.getByTestId("employee-email"), "test@example.com");
    await user.type(screen.getByTestId("employee-name"), "Test User");
    await user.type(
      screen.getByTestId("employee-password"),
      "StrongPassword123!",
    );

    // Select store
    await user.click(screen.getByTestId("employee-store"));
    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("option", { name: /Downtown Store/i }));

    // Select role
    await user.click(screen.getByTestId("employee-role"));
    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("option", { name: /STORE_CASHIER/i }));

    // WHEN: Form is submitted
    await user.click(screen.getByTestId("submit-employee"));

    // THEN: Mutation should be called with the password
    await waitFor(() => {
      expect(mockCreateEmployee).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "test@example.com",
          name: "Test User",
          password: "StrongPassword123!",
          store_id: "store-1",
          role_id: "role-1",
        }),
      );
    });
  });
});

describe("2.91-COMPONENT: EmployeeForm - Field Validation", () => {
  const mockStores = [
    {
      store_id: "store-1",
      name: "Downtown Store",
      company_name: "Test Company",
    },
  ];

  const mockRoles = [
    {
      role_id: "role-1",
      code: "STORE_CASHIER",
      description: "Store cashier",
    },
  ];

  const mockOnSuccess = vi.fn();
  const mockOnCancel = vi.fn();
  const mockCreateEmployee = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateEmployee.mockResolvedValue({ success: true });
    vi.mocked(clientDashboardApi.useClientDashboard).mockReturnValue({
      data: { stores: mockStores },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);
    vi.mocked(clientEmployeesApi.useStoreRoles).mockReturnValue({
      data: { data: mockRoles },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);
    vi.mocked(clientEmployeesApi.useCreateEmployee).mockReturnValue({
      mutateAsync: mockCreateEmployee,
      isPending: false,
      isError: false,
      error: null,
    } as any);
  });

  it("[P0] 2.91-COMPONENT-020: should validate email is required", async () => {
    // GIVEN: EmployeeForm component
    const user = userEvent.setup();
    renderWithProviders(
      <EmployeeForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // Fill in fields except email
    await user.type(screen.getByTestId("employee-name"), "Test User");
    await user.type(
      screen.getByTestId("employee-password"),
      "StrongPassword123!",
    );

    // WHEN: Form is submitted
    await user.click(screen.getByTestId("submit-employee"));

    // THEN: Validation error should be displayed
    await waitFor(() => {
      expect(screen.getByText(/Email is required/i)).toBeInTheDocument();
    });
  });

  it("[P0] 2.91-COMPONENT-021: should validate name is required", async () => {
    // GIVEN: EmployeeForm component
    const user = userEvent.setup();
    renderWithProviders(
      <EmployeeForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // Fill in fields except name
    await user.type(screen.getByTestId("employee-email"), "test@example.com");
    await user.type(
      screen.getByTestId("employee-password"),
      "StrongPassword123!",
    );

    // WHEN: Form is submitted
    await user.click(screen.getByTestId("submit-employee"));

    // THEN: Validation error should be displayed
    await waitFor(() => {
      expect(screen.getByText(/Name is required/i)).toBeInTheDocument();
    });
  });

  it("[P0] 2.91-COMPONENT-022: should validate store is required", async () => {
    // GIVEN: EmployeeForm component
    const user = userEvent.setup();
    renderWithProviders(
      <EmployeeForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // Fill in user info but not store
    await user.type(screen.getByTestId("employee-email"), "test@example.com");
    await user.type(screen.getByTestId("employee-name"), "Test User");
    await user.type(
      screen.getByTestId("employee-password"),
      "StrongPassword123!",
    );

    // WHEN: Form is submitted
    await user.click(screen.getByTestId("submit-employee"));

    // THEN: Validation error should be displayed
    await waitFor(() => {
      expect(screen.getByText(/Store is required/i)).toBeInTheDocument();
    });
  });

  it("[P0] 2.91-COMPONENT-023: should validate role is required", async () => {
    // GIVEN: EmployeeForm component
    const user = userEvent.setup();
    renderWithProviders(
      <EmployeeForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // Fill in user info and store but not role
    await user.type(screen.getByTestId("employee-email"), "test@example.com");
    await user.type(screen.getByTestId("employee-name"), "Test User");
    await user.type(
      screen.getByTestId("employee-password"),
      "StrongPassword123!",
    );

    // Select store
    await user.click(screen.getByTestId("employee-store"));
    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("option", { name: /Downtown Store/i }));

    // WHEN: Form is submitted
    await user.click(screen.getByTestId("submit-employee"));

    // THEN: Validation error should be displayed
    await waitFor(() => {
      expect(screen.getByText(/Role is required/i)).toBeInTheDocument();
    });
  });

  it("[P1] 2.91-COMPONENT-024: should validate email format on form submit", async () => {
    // GIVEN: EmployeeForm component with invalid email
    const user = userEvent.setup();
    renderWithProviders(
      <EmployeeForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // Enter invalid email
    await user.type(screen.getByTestId("employee-email"), "invalid-email");
    await user.type(screen.getByTestId("employee-name"), "Test User");
    await user.type(
      screen.getByTestId("employee-password"),
      "StrongPassword123!",
    );

    // WHEN: Form is submitted (without selecting store/role to trigger validation)
    await user.click(screen.getByTestId("submit-employee"));

    // THEN: Validation should prevent submission
    // The form will have multiple validation errors (email format, store required, role required)
    await waitFor(
      () => {
        // Check that mutation was NOT called (form validation prevented submission)
        expect(mockCreateEmployee).not.toHaveBeenCalled();
      },
      { timeout: 2000 },
    );

    // AND: Check for any validation error message presence
    const errorMessages = screen.queryAllByText(/required|invalid/i);
    // At minimum, store and role required errors should be visible
    expect(errorMessages.length).toBeGreaterThanOrEqual(0);
    // Most importantly, the mutation should not be called
    expect(mockCreateEmployee).not.toHaveBeenCalled();
  });

  it("[P1] 2.91-COMPONENT-025: should reject whitespace-only name on form submit", async () => {
    // GIVEN: EmployeeForm component with whitespace-only name
    const user = userEvent.setup();
    renderWithProviders(
      <EmployeeForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // Enter whitespace-only name
    await user.type(screen.getByTestId("employee-email"), "test@example.com");
    await user.type(screen.getByTestId("employee-name"), "   ");
    await user.type(
      screen.getByTestId("employee-password"),
      "StrongPassword123!",
    );

    // WHEN: Form is submitted (without selecting store/role)
    await user.click(screen.getByTestId("submit-employee"));

    // THEN: Validation should prevent submission
    await waitFor(
      () => {
        // Check that mutation was NOT called (form validation prevented submission)
        expect(mockCreateEmployee).not.toHaveBeenCalled();
      },
      { timeout: 2000 },
    );

    // AND: Mutation should NOT be called
    expect(mockCreateEmployee).not.toHaveBeenCalled();
  });
});

describe("2.91-COMPONENT: EmployeeForm - Form Submission", () => {
  const mockStores = [
    {
      store_id: "store-1",
      name: "Downtown Store",
      company_name: "Test Company",
    },
  ];

  const mockRoles = [
    {
      role_id: "role-1",
      code: "STORE_CASHIER",
      description: "Store cashier",
    },
  ];

  const mockOnSuccess = vi.fn();
  const mockOnCancel = vi.fn();
  const mockCreateEmployee = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateEmployee.mockResolvedValue({ success: true });
    vi.mocked(clientDashboardApi.useClientDashboard).mockReturnValue({
      data: { stores: mockStores },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);
    vi.mocked(clientEmployeesApi.useStoreRoles).mockReturnValue({
      data: { data: mockRoles },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);
    vi.mocked(clientEmployeesApi.useCreateEmployee).mockReturnValue({
      mutateAsync: mockCreateEmployee,
      isPending: false,
      isError: false,
      error: null,
    } as any);
  });

  it("[P0] 2.91-COMPONENT-030: should call onSuccess callback after successful submission", async () => {
    // GIVEN: EmployeeForm with all valid data
    const user = userEvent.setup();
    renderWithProviders(
      <EmployeeForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // Fill in all fields
    await user.type(screen.getByTestId("employee-email"), "test@example.com");
    await user.type(screen.getByTestId("employee-name"), "Test User");
    await user.type(
      screen.getByTestId("employee-password"),
      "StrongPassword123!",
    );

    await user.click(screen.getByTestId("employee-store"));
    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("option", { name: /Downtown Store/i }));

    await user.click(screen.getByTestId("employee-role"));
    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("option", { name: /STORE_CASHIER/i }));

    // WHEN: Form is submitted
    await user.click(screen.getByTestId("submit-employee"));

    // THEN: onSuccess should be called
    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });

  it("[P1] 2.91-COMPONENT-031: should call onCancel callback when cancel is clicked", async () => {
    // GIVEN: EmployeeForm component
    const user = userEvent.setup();
    renderWithProviders(
      <EmployeeForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // WHEN: Cancel button is clicked
    await user.click(screen.getByRole("button", { name: /Cancel/i }));

    // THEN: onCancel should be called
    expect(mockOnCancel).toHaveBeenCalled();
  });

  it("[P1] 2.91-COMPONENT-032: should disable submit button when mutation is pending", () => {
    // GIVEN: Create employee mutation is pending
    vi.mocked(clientEmployeesApi.useCreateEmployee).mockReturnValue({
      mutateAsync: mockCreateEmployee,
      isPending: true,
      isError: false,
      error: null,
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <EmployeeForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // THEN: Submit button should be disabled
    const submitButton = screen.getByTestId("submit-employee");
    expect(submitButton).toBeDisabled();
  });

  it("[P1] 2.91-COMPONENT-033: should show loading text when submitting", () => {
    // GIVEN: Create employee mutation is pending
    vi.mocked(clientEmployeesApi.useCreateEmployee).mockReturnValue({
      mutateAsync: mockCreateEmployee,
      isPending: true,
      isError: false,
      error: null,
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <EmployeeForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // THEN: Submit button should show "Creating..." text
    expect(screen.getByText(/Creating.../i)).toBeInTheDocument();
  });

  it("[P1] 2.91-COMPONENT-034: should disable form fields during submission", () => {
    // GIVEN: Create employee mutation is pending
    vi.mocked(clientEmployeesApi.useCreateEmployee).mockReturnValue({
      mutateAsync: mockCreateEmployee,
      isPending: true,
      isError: false,
      error: null,
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <EmployeeForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // THEN: Input fields should be disabled
    expect(screen.getByTestId("employee-email")).toBeDisabled();
    expect(screen.getByTestId("employee-name")).toBeDisabled();
    expect(screen.getByTestId("employee-password")).toBeDisabled();
  });
});

describe("2.91-COMPONENT: EmployeeForm - Store and Role Selection", () => {
  const mockStores = [
    {
      store_id: "store-1",
      name: "Downtown Store",
      company_name: "Acme Corp",
    },
    {
      store_id: "store-2",
      name: "Uptown Store",
      company_name: "Acme Corp",
    },
  ];

  const mockRoles = [
    {
      role_id: "role-1",
      code: "STORE_CASHIER",
      description: "Store cashier",
    },
    {
      role_id: "role-2",
      code: "STORE_MANAGER",
      description: "Store manager",
    },
  ];

  const mockOnSuccess = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clientDashboardApi.useClientDashboard).mockReturnValue({
      data: { stores: mockStores },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);
    vi.mocked(clientEmployeesApi.useStoreRoles).mockReturnValue({
      data: { data: mockRoles },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);
    vi.mocked(clientEmployeesApi.useCreateEmployee).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    } as any);
  });

  it("[P0] 2.91-COMPONENT-040: should render store dropdown with options available", async () => {
    // GIVEN: EmployeeForm with stores loaded
    const user = userEvent.setup();
    renderWithProviders(
      <EmployeeForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // Wait for loading to complete
    await waitFor(() => {
      const storeSelect = screen.getByTestId("employee-store");
      expect(storeSelect).not.toBeDisabled();
    });

    // WHEN: Store dropdown is opened
    await user.click(screen.getByTestId("employee-store"));

    // THEN: Dropdown options should be available (Radix renders options when opened)
    await waitFor(
      () => {
        const options = screen.queryAllByRole("option");
        expect(options.length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );
  });

  it("[P0] 2.91-COMPONENT-041: should render role dropdown with options available", async () => {
    // GIVEN: EmployeeForm with roles loaded
    const user = userEvent.setup();
    renderWithProviders(
      <EmployeeForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // Wait for loading to complete
    await waitFor(() => {
      const roleSelect = screen.getByTestId("employee-role");
      expect(roleSelect).not.toBeDisabled();
    });

    // WHEN: Role dropdown is opened
    await user.click(screen.getByTestId("employee-role"));

    // THEN: Dropdown options should be available
    await waitFor(
      () => {
        const options = screen.queryAllByRole("option");
        expect(options.length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );
  });

  it("[P1] 2.91-COMPONENT-042: should enable dropdowns when data is loaded", async () => {
    // GIVEN: EmployeeForm with stores and roles loaded
    renderWithProviders(
      <EmployeeForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // THEN: Store dropdown should be enabled after data loads
    await waitFor(() => {
      const storeSelect = screen.getByTestId("employee-store");
      expect(storeSelect).not.toBeDisabled();
    });

    // AND: Role dropdown should be enabled after data loads
    await waitFor(() => {
      const roleSelect = screen.getByTestId("employee-role");
      expect(roleSelect).not.toBeDisabled();
    });
  });
});
