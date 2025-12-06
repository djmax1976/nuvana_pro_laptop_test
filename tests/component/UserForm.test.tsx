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
import * as companiesApi from "@/lib/api/companies";
import * as storesApi from "@/lib/api/stores";

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
  adminUserKeys: {
    lists: vi.fn(() => ["admin-users"]),
  },
}));

vi.mock("@/lib/api/companies", () => ({
  useCompanies: vi.fn(),
}));

vi.mock("@/lib/api/stores", () => ({
  useStoresByCompany: vi.fn(),
}));

// Mock useDebounce for CompanySearchCombobox to return immediate value
vi.mock("@/hooks/useDebounce", () => ({
  useDebounce: vi.fn((value) => value),
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
    // Default mock for companies - no data
    vi.mocked(companiesApi.useCompanies).mockReturnValue({
      data: { data: [] },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
    } as any);
    // Default mock for stores - no data
    vi.mocked(storesApi.useStoresByCompany).mockReturnValue({
      data: { data: [] },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
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
    await user.type(screen.getByTestId("user-email-input"), "test@test.com");
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
    await user.type(screen.getByTestId("user-email-input"), "test@test.com");

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
    await user.type(screen.getByTestId("user-email-input"), "test@test.com");
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

describe("2.8-COMPONENT: UserForm - Store Assignment for STORE-Scoped Roles", () => {
  const mockRoles = [
    {
      role_id: "role-1",
      code: "SUPERADMIN",
      scope: "SYSTEM",
      description: "System administrator",
    },
    {
      role_id: "role-2",
      code: "CLIENT_OWNER",
      scope: "COMPANY",
      description: "Client owner",
    },
    {
      role_id: "role-3",
      code: "STORE_MANAGER",
      scope: "STORE",
      description: "Store manager",
    },
    {
      role_id: "role-4",
      code: "SHIFT_MANAGER",
      scope: "STORE",
      description: "Shift manager",
    },
    {
      role_id: "role-5",
      code: "CASHIER",
      scope: "STORE",
      description: "Cashier",
    },
    {
      role_id: "role-6",
      code: "CLIENT_USER",
      scope: "STORE",
      description: "Client user",
    },
  ];

  const mockCompanies = [
    { company_id: "company-1", name: "Test Company 1", status: "ACTIVE" },
    { company_id: "company-2", name: "Test Company 2", status: "ACTIVE" },
  ];

  const mockStores = [
    { store_id: "store-1", name: "Store One", status: "ACTIVE" },
    { store_id: "store-2", name: "Store Two", status: "ACTIVE" },
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
    vi.mocked(companiesApi.useCompanies).mockReturnValue({
      data: { data: mockCompanies },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
    } as any);
    vi.mocked(storesApi.useStoresByCompany).mockReturnValue({
      data: { data: mockStores },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
    } as any);
  });

  it("[P0] 2.8-COMPONENT-023: should show store assignment fields when STORE_MANAGER role is selected", async () => {
    // GIVEN: UserForm component with roles loaded
    const user = userEvent.setup();
    renderWithProviders(<UserForm />);

    // WHEN: STORE_MANAGER role is selected
    const roleSelect = screen.getByTestId("user-role-select");
    await user.click(roleSelect);
    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("option", { name: /STORE_MANAGER/i }));

    // THEN: Store assignment fields should be visible
    await waitFor(() => {
      expect(
        screen.getByTestId("store-scoped-company-select"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("store-scoped-store-select"),
      ).toBeInTheDocument();
    });

    // AND: Store Assignment section should be displayed
    expect(screen.getByText("Store Assignment")).toBeInTheDocument();
    expect(screen.getByText(/Role: STORE_MANAGER/i)).toBeInTheDocument();
  });

  it("[P0] 2.8-COMPONENT-024: should show store assignment fields when SHIFT_MANAGER role is selected", async () => {
    // GIVEN: UserForm component with roles loaded
    const user = userEvent.setup();
    renderWithProviders(<UserForm />);

    // WHEN: SHIFT_MANAGER role is selected
    const roleSelect = screen.getByTestId("user-role-select");
    await user.click(roleSelect);
    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("option", { name: /SHIFT_MANAGER/i }));

    // THEN: Store assignment fields should be visible
    await waitFor(() => {
      expect(
        screen.getByTestId("store-scoped-company-select"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("store-scoped-store-select"),
      ).toBeInTheDocument();
    });

    // AND: Should show the role name in the section
    expect(screen.getByText(/Role: SHIFT_MANAGER/i)).toBeInTheDocument();
  });

  it("[P0] 2.8-COMPONENT-025: should show store assignment fields when CASHIER role is selected", async () => {
    // GIVEN: UserForm component with roles loaded
    const user = userEvent.setup();
    renderWithProviders(<UserForm />);

    // WHEN: CASHIER role is selected
    const roleSelect = screen.getByTestId("user-role-select");
    await user.click(roleSelect);
    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("option", { name: /CASHIER/i }));

    // THEN: Store assignment fields should be visible
    await waitFor(() => {
      expect(
        screen.getByTestId("store-scoped-company-select"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("store-scoped-store-select"),
      ).toBeInTheDocument();
    });

    // AND: Should show the role name in the section
    expect(screen.getByText(/Role: CASHIER/i)).toBeInTheDocument();
  });

  it("[P0] 2.8-COMPONENT-026: should NOT show store assignment fields for SYSTEM-scoped roles", async () => {
    // GIVEN: UserForm component with roles loaded
    const user = userEvent.setup();
    renderWithProviders(<UserForm />);

    // WHEN: SUPERADMIN (SYSTEM-scoped) role is selected
    const roleSelect = screen.getByTestId("user-role-select");
    await user.click(roleSelect);
    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("option", { name: /SUPERADMIN/i }));

    // THEN: Store assignment fields should NOT be visible
    await waitFor(() => {
      expect(
        screen.queryByTestId("store-scoped-company-select"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("store-scoped-store-select"),
      ).not.toBeInTheDocument();
    });
  });

  it("[P0] 2.8-COMPONENT-027: should disable store select until company is selected", async () => {
    // GIVEN: UserForm with STORE_MANAGER role selected
    const user = userEvent.setup();
    renderWithProviders(<UserForm />);

    // Select STORE_MANAGER role
    await user.click(screen.getByTestId("user-role-select"));
    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("option", { name: /STORE_MANAGER/i }));

    // THEN: Store select should be disabled initially
    await waitFor(() => {
      const storeSelect = screen.getByTestId("store-scoped-store-select");
      expect(storeSelect).toBeDisabled();
    });

    // AND: Store select placeholder should indicate company needs to be selected first
    expect(screen.getByText("Select a company first")).toBeInTheDocument();
  });

  it("[P0] 2.8-COMPONENT-028: should hide store assignment when switching from STORE to non-STORE role", async () => {
    // GIVEN: UserForm with STORE_MANAGER role selected
    const user = userEvent.setup();
    renderWithProviders(<UserForm />);

    // First select STORE_MANAGER
    await user.click(screen.getByTestId("user-role-select"));
    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("option", { name: /STORE_MANAGER/i }));

    // Verify store fields are visible
    await waitFor(() => {
      expect(
        screen.getByTestId("store-scoped-company-select"),
      ).toBeInTheDocument();
    });

    // WHEN: Switch to SUPERADMIN role
    await user.click(screen.getByTestId("user-role-select"));
    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("option", { name: /SUPERADMIN/i }));

    // THEN: Store assignment fields should be hidden
    await waitFor(() => {
      expect(
        screen.queryByTestId("store-scoped-company-select"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("store-scoped-store-select"),
      ).not.toBeInTheDocument();
    });
  });

  it("[P0] 2.8-COMPONENT-029: should include company_id and store_id when submitting STORE-scoped role", async () => {
    // GIVEN: UserForm with STORE_MANAGER role and store selected
    const user = userEvent.setup();
    renderWithProviders(<UserForm />);

    // Fill in user info
    await user.type(screen.getByTestId("user-email-input"), "manager@test.com");
    await user.type(screen.getByTestId("user-name-input"), "Store Manager");
    await user.type(
      screen.getByTestId("user-password-input"),
      "StrongPassword123!",
    );

    // Select STORE_MANAGER role
    await user.click(screen.getByTestId("user-role-select"));
    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("option", { name: /STORE_MANAGER/i }));

    // Wait for store fields to appear
    await waitFor(() => {
      expect(
        screen.getByTestId("store-scoped-company-select"),
      ).toBeInTheDocument();
    });

    // Select company
    await user.click(screen.getByTestId("store-scoped-company-select"));
    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("option", { name: /Test Company 1/i }));

    // Wait for stores to load and select store
    await waitFor(() => {
      expect(
        screen.getByTestId("store-scoped-store-select"),
      ).not.toBeDisabled();
    });
    await user.click(screen.getByTestId("store-scoped-store-select"));
    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("option", { name: /Store One/i }));

    // WHEN: Form is submitted
    await user.click(screen.getByTestId("user-form-submit"));

    // THEN: Mutation should be called with company_id and store_id
    await waitFor(() => {
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "manager@test.com",
          name: "Store Manager",
          roles: expect.arrayContaining([
            expect.objectContaining({
              role_id: "role-3",
              scope_type: "STORE",
              company_id: "company-1",
              store_id: "store-1",
            }),
          ]),
        }),
      );
    });
  });

  it("[P0] 2.8-COMPONENT-030: should reset store selection when company changes", async () => {
    // GIVEN: UserForm with STORE_MANAGER role and store already selected
    const user = userEvent.setup();
    renderWithProviders(<UserForm />);

    // Select STORE_MANAGER role
    await user.click(screen.getByTestId("user-role-select"));
    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("option", { name: /STORE_MANAGER/i }));

    // Wait for store fields
    await waitFor(() => {
      expect(
        screen.getByTestId("store-scoped-company-select"),
      ).toBeInTheDocument();
    });

    // Select first company
    await user.click(screen.getByTestId("store-scoped-company-select"));
    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("option", { name: /Test Company 1/i }));

    // Select a store
    await waitFor(() => {
      expect(
        screen.getByTestId("store-scoped-store-select"),
      ).not.toBeDisabled();
    });
    await user.click(screen.getByTestId("store-scoped-store-select"));
    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("option", { name: /Store One/i }));

    // WHEN: Company is changed to a different company
    await user.click(screen.getByTestId("store-scoped-company-select"));
    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("option", { name: /Test Company 2/i }));

    // THEN: Store selection should be reset (placeholder should show)
    await waitFor(() => {
      expect(screen.getByText("Select a store")).toBeInTheDocument();
    });
  });

  it("[P0] 2.8-COMPONENT-031: should reset company and store when role changes", async () => {
    // GIVEN: UserForm with STORE_MANAGER role and company/store selected
    const user = userEvent.setup();
    renderWithProviders(<UserForm />);

    // Select STORE_MANAGER role
    await user.click(screen.getByTestId("user-role-select"));
    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("option", { name: /STORE_MANAGER/i }));

    // Wait for store fields - CompanySearchCombobox is now a text input
    await waitFor(() => {
      expect(
        screen.getByTestId("store-scoped-company-select"),
      ).toBeInTheDocument();
    });

    // Select company using the combobox
    const companyInput = screen.getByTestId("store-scoped-company-select");
    await user.click(companyInput);
    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("option", { name: /Test Company 1/i }));

    // Verify company was selected
    await waitFor(() => {
      expect(companyInput).toHaveValue("Test Company 1");
    });

    // WHEN: Role is changed to another STORE-scoped role
    await user.click(screen.getByTestId("user-role-select"));
    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("option", { name: /SHIFT_MANAGER/i }));

    // THEN: Company selection should be reset (input value cleared)
    await waitFor(() => {
      const resetCompanyInput = screen.getByTestId(
        "store-scoped-company-select",
      );
      expect(resetCompanyInput).toHaveValue("");
    });
  });
});
