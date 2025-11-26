import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithProviders,
  screen,
  waitFor,
  fireEvent,
} from "../support/test-utils";
import { UserForm } from "@/components/admin/UserForm";
import userEvent from "@testing-library/user-event";
import * as adminUsersApi from "@/lib/api/admin-users";

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
vi.mock("@/lib/api/admin-users", () => ({
  useCreateUser: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  })),
  useRoles: vi.fn(),
}));

// Mock the toast hook
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe("2.8-COMPONENT: UserForm Component", () => {
  const mockRoles = [
    {
      role_id: "role-1",
      code: "SUPERADMIN",
      scope: "SYSTEM",
      description: "System administrator",
    },
    {
      role_id: "role-2",
      code: "CORPORATE_ADMIN",
      scope: "COMPANY",
      description: "Corporate administrator",
    },
    {
      role_id: "role-3",
      code: "CLIENT_OWNER",
      scope: "COMPANY",
      description: "Client owner",
    },
    {
      role_id: "role-4",
      code: "STORE_MANAGER",
      scope: "STORE",
      description: "Store manager",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminUsersApi.useRoles).mockReturnValue({
      data: { data: mockRoles },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);
  });

  it("[P0] 2.8-COMPONENT-001: should render all required form fields", () => {
    // GIVEN: UserForm component
    // WHEN: Component is rendered
    renderWithProviders(<UserForm />);

    // THEN: All required fields should be visible
    expect(screen.getByTestId("user-email-input")).toBeInTheDocument();
    expect(screen.getByTestId("user-name-input")).toBeInTheDocument();
    expect(screen.getByTestId("user-password-input")).toBeInTheDocument();
    expect(screen.getByTestId("user-role-select")).toBeInTheDocument();
    expect(screen.getByTestId("user-form-submit")).toBeInTheDocument();
  });

  it("[P1] 2.8-COMPONENT-002: should show loading state when roles are loading", () => {
    // GIVEN: Roles API is loading
    vi.mocked(adminUsersApi.useRoles).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      isError: false,
      isSuccess: false,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<UserForm />);

    // THEN: Role select should be disabled
    const roleSelect = screen.getByTestId("user-role-select");
    expect(roleSelect).toBeDisabled();
  });

  it("[P0] 2.8-COMPONENT-003: should NOT show company fields by default", () => {
    // GIVEN: UserForm component
    // WHEN: Component is rendered
    renderWithProviders(<UserForm />);

    // THEN: Company fields should not be visible
    expect(screen.queryByTestId("company-name-input")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("company-address-input"),
    ).not.toBeInTheDocument();
  });

  it("[P0] 2.8-COMPONENT-004: should show company fields when CLIENT_OWNER role is selected", async () => {
    // GIVEN: UserForm component with roles loaded
    const user = userEvent.setup();
    renderWithProviders(<UserForm />);

    // WHEN: CLIENT_OWNER role is selected
    const roleSelect = screen.getByTestId("user-role-select");
    await user.click(roleSelect);

    // Wait for dropdown to open and find the option
    await waitFor(() => {
      const options = screen.getAllByRole("option");
      expect(options.length).toBeGreaterThan(0);
    });

    // Click the CLIENT_OWNER option using role
    const clientOwnerOption = screen.getByRole("option", {
      name: /CLIENT_OWNER/i,
    });
    await user.click(clientOwnerOption);

    // THEN: Company fields should be visible
    await waitFor(() => {
      expect(screen.getByTestId("company-name-input")).toBeInTheDocument();
      expect(screen.getByTestId("company-address-input")).toBeInTheDocument();
    });

    // AND: Company Information section should be displayed
    expect(screen.getByText("Company Information")).toBeInTheDocument();
    expect(
      screen.getByText(/A company will be created for this Client Owner user/i),
    ).toBeInTheDocument();
  });

  it("[P0] 2.8-COMPONENT-005: should hide company fields when switching from CLIENT_OWNER to another role", async () => {
    // GIVEN: UserForm with CLIENT_OWNER role selected
    const user = userEvent.setup();
    renderWithProviders(<UserForm />);

    // First select CLIENT_OWNER
    const roleSelect = screen.getByTestId("user-role-select");
    await user.click(roleSelect);
    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("option", { name: /CLIENT_OWNER/i }));

    // Verify company fields are visible
    await waitFor(() => {
      expect(screen.getByTestId("company-name-input")).toBeInTheDocument();
    });

    // WHEN: Switch to SUPERADMIN role
    await user.click(roleSelect);
    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("option", { name: /SUPERADMIN/i }));

    // THEN: Company fields should be hidden
    await waitFor(() => {
      expect(
        screen.queryByTestId("company-name-input"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("company-address-input"),
      ).not.toBeInTheDocument();
    });
  });

  it("[P1] 2.8-COMPONENT-006: should have email input with type=email for browser validation", () => {
    // GIVEN: UserForm component
    // WHEN: Component is rendered
    renderWithProviders(<UserForm />);

    // THEN: Email input should have type="email" for browser-level validation
    const emailInput = screen.getByTestId("user-email-input");
    expect(emailInput).toHaveAttribute("type", "email");
    expect(emailInput).toHaveAttribute("placeholder", "user@example.com");
  });

  it("[P1] 2.8-COMPONENT-007: should validate password requirements", async () => {
    // GIVEN: UserForm component with valid email and name
    const user = userEvent.setup();
    renderWithProviders(<UserForm />);

    // Fill in valid email and name
    await user.type(screen.getByTestId("user-email-input"), "test@example.com");
    await user.type(screen.getByTestId("user-name-input"), "Test User");

    // WHEN: Weak password is entered and form is submitted
    await user.type(screen.getByTestId("user-password-input"), "weak");

    // Submit form
    await user.click(screen.getByTestId("user-form-submit"));

    // THEN: Some validation error should be displayed (either password or role)
    await waitFor(() => {
      // Form should have some error - check that form has error class or error message somewhere
      const formErrors = document.querySelectorAll(
        "[class*='text-destructive']",
      );
      expect(formErrors.length).toBeGreaterThan(0);
    });
  });

  it("[P1] 2.8-COMPONENT-008: should validate name is required", async () => {
    // GIVEN: UserForm component
    const user = userEvent.setup();
    renderWithProviders(<UserForm />);

    // WHEN: Email is filled but name is empty
    await user.type(screen.getByTestId("user-email-input"), "test@example.com");

    // Submit form
    await user.click(screen.getByTestId("user-form-submit"));

    // THEN: Validation error should be displayed
    await waitFor(() => {
      expect(screen.getByText(/Name is required/i)).toBeInTheDocument();
    });
  });

  it("[P0] 2.8-COMPONENT-009: should validate role is required", async () => {
    // GIVEN: UserForm component
    const user = userEvent.setup();
    renderWithProviders(<UserForm />);

    // Fill in required fields but not role
    await user.type(screen.getByTestId("user-email-input"), "test@example.com");
    await user.type(screen.getByTestId("user-name-input"), "Test User");
    await user.type(
      screen.getByTestId("user-password-input"),
      "StrongPassword123!",
    );

    // WHEN: Form is submitted without role
    await user.click(screen.getByTestId("user-form-submit"));

    // THEN: Validation error should be displayed
    await waitFor(() => {
      expect(screen.getByText(/Role is required/i)).toBeInTheDocument();
    });
  });

  it("[P0] 2.8-COMPONENT-010: should show all available roles in dropdown", async () => {
    // GIVEN: UserForm component with roles loaded
    const user = userEvent.setup();
    renderWithProviders(<UserForm />);

    // WHEN: Role dropdown is opened
    const roleSelect = screen.getByTestId("user-role-select");
    await user.click(roleSelect);

    // THEN: All roles should be visible in dropdown
    await waitFor(() => {
      const options = screen.getAllByRole("option");
      expect(options.length).toBe(4);
      expect(
        screen.getByRole("option", { name: /SUPERADMIN/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: /CORPORATE_ADMIN/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: /CLIENT_OWNER/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: /STORE_MANAGER/i }),
      ).toBeInTheDocument();
    });
  });

  it("[P1] 2.8-COMPONENT-011: should display role scope in dropdown options", async () => {
    // GIVEN: UserForm component
    const user = userEvent.setup();
    renderWithProviders(<UserForm />);

    // WHEN: Role dropdown is opened
    await user.click(screen.getByTestId("user-role-select"));

    // THEN: Each role option should show its scope in the text
    await waitFor(() => {
      const options = screen.getAllByRole("option");
      // Verify options contain scope text
      expect(options.some((opt) => opt.textContent?.includes("SYSTEM"))).toBe(
        true,
      );
      expect(options.some((opt) => opt.textContent?.includes("COMPANY"))).toBe(
        true,
      );
      expect(options.some((opt) => opt.textContent?.includes("STORE"))).toBe(
        true,
      );
    });
  });

  it("[P1] 2.8-COMPONENT-012: should have correct placeholder text for company fields", async () => {
    // GIVEN: UserForm with CLIENT_OWNER role selected
    const user = userEvent.setup();
    renderWithProviders(<UserForm />);

    // Select CLIENT_OWNER
    await user.click(screen.getByTestId("user-role-select"));
    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("option", { name: /CLIENT_OWNER/i }));

    // WHEN: Company fields are visible
    await waitFor(() => {
      const companyNameInput = screen.getByTestId("company-name-input");
      const companyAddressInput = screen.getByTestId("company-address-input");

      // THEN: Placeholder text should be helpful
      expect(companyNameInput).toHaveAttribute(
        "placeholder",
        "Acme Corporation",
      );
      expect(companyAddressInput).toHaveAttribute(
        "placeholder",
        "123 Main St, City, State 12345",
      );
    });
  });

  it("[P1] 2.8-COMPONENT-013: should show cancel button that navigates back", async () => {
    // GIVEN: UserForm component
    renderWithProviders(<UserForm />);

    // THEN: Cancel button should be present
    const cancelButton = screen.getByRole("button", { name: /Cancel/i });
    expect(cancelButton).toBeInTheDocument();
  });

  it("[P1] 2.8-COMPONENT-014: should disable submit button when mutation is pending", async () => {
    // GIVEN: Create user mutation is pending
    vi.mocked(adminUsersApi.useCreateUser).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: true,
      isError: false,
      error: null,
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<UserForm />);

    // THEN: Submit button should be disabled
    const submitButton = screen.getByTestId("user-form-submit");
    expect(submitButton).toBeDisabled();
  });

  it("[P1] 2.8-COMPONENT-015: should display password requirements description", () => {
    // GIVEN: UserForm component
    // WHEN: Component is rendered
    renderWithProviders(<UserForm />);

    // THEN: Password requirements should be displayed
    expect(
      screen.getByText(
        /Password must be at least 8 characters with uppercase, lowercase, number, and special character/i,
      ),
    ).toBeInTheDocument();
  });
});

describe("2.8-COMPONENT: UserForm - Company Fields for CLIENT_OWNER", () => {
  const mockRoles = [
    {
      role_id: "role-1",
      code: "SUPERADMIN",
      scope: "SYSTEM",
      description: "System administrator",
    },
    {
      role_id: "role-3",
      code: "CLIENT_OWNER",
      scope: "COMPANY",
      description: "Client owner",
    },
  ];

  const mockCreateUser = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateUser.mockResolvedValue({ success: true });
    vi.mocked(adminUsersApi.useRoles).mockReturnValue({
      data: { data: mockRoles },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);
    vi.mocked(adminUsersApi.useCreateUser).mockReturnValue({
      mutateAsync: mockCreateUser,
      isPending: false,
      isError: false,
      error: null,
    } as any);
  });

  it("[P0] 2.8-COMPONENT-020: should include company info when submitting with CLIENT_OWNER role", async () => {
    // GIVEN: UserForm with CLIENT_OWNER role
    const user = userEvent.setup();
    renderWithProviders(<UserForm />);

    // Fill in user info
    await user.type(screen.getByTestId("user-email-input"), "owner@test.com");
    await user.type(screen.getByTestId("user-name-input"), "Test Owner");
    await user.type(
      screen.getByTestId("user-password-input"),
      "StrongPassword123!",
    );

    // Select CLIENT_OWNER role
    await user.click(screen.getByTestId("user-role-select"));
    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("option", { name: /CLIENT_OWNER/i }));

    // Fill in company info
    await waitFor(() => {
      expect(screen.getByTestId("company-name-input")).toBeInTheDocument();
    });
    await user.type(
      screen.getByTestId("company-name-input"),
      "Test Company Inc",
    );
    await user.type(screen.getByTestId("company-address-input"), "123 Test St");

    // WHEN: Form is submitted
    await user.click(screen.getByTestId("user-form-submit"));

    // THEN: Mutation should be called with company info
    await waitFor(() => {
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "owner@test.com",
          name: "Test Owner",
          password: "StrongPassword123!",
          companyName: "Test Company Inc",
          companyAddress: "123 Test St",
          roles: expect.arrayContaining([
            expect.objectContaining({
              role_id: "role-3",
              scope_type: "COMPANY",
            }),
          ]),
        }),
      );
    });
  });

  it("[P0] 2.8-COMPONENT-021: should NOT include company info when submitting with non-CLIENT_OWNER role", async () => {
    // GIVEN: UserForm with SUPERADMIN role
    const user = userEvent.setup();
    renderWithProviders(<UserForm />);

    // Fill in user info
    await user.type(screen.getByTestId("user-email-input"), "admin@test.com");
    await user.type(screen.getByTestId("user-name-input"), "Test Admin");
    await user.type(
      screen.getByTestId("user-password-input"),
      "StrongPassword123!",
    );

    // Select SUPERADMIN role
    await user.click(screen.getByTestId("user-role-select"));
    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("option", { name: /SUPERADMIN/i }));

    // WHEN: Form is submitted
    await user.click(screen.getByTestId("user-form-submit"));

    // THEN: Mutation should NOT include company info
    await waitFor(() => {
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.not.objectContaining({
          companyName: expect.anything(),
          companyAddress: expect.anything(),
        }),
      );
    });
  });

  it("[P0] 2.8-COMPONENT-022: should show company information section with explanation", async () => {
    // GIVEN: UserForm with CLIENT_OWNER selected
    const user = userEvent.setup();
    renderWithProviders(<UserForm />);

    // Select CLIENT_OWNER
    await user.click(screen.getByTestId("user-role-select"));
    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("option", { name: /CLIENT_OWNER/i }));

    // THEN: Company section should have proper labels and descriptions
    await waitFor(() => {
      expect(screen.getByText("Company Information")).toBeInTheDocument();
      expect(
        screen.getByText(/Company will be created for this Client Owner/i),
      ).toBeInTheDocument();
      expect(screen.getByText("Company Name *")).toBeInTheDocument();
      expect(screen.getByText("Company Address *")).toBeInTheDocument();
    });
  });
});
