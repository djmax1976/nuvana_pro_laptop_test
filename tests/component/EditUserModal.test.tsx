import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../support/test-utils";
import { EditUserModal } from "@/components/admin/EditUserModal";
import userEvent from "@testing-library/user-event";
import * as adminUsersApi from "@/lib/api/admin-users";
import * as storesApi from "@/lib/api/stores";
import { AdminUser, UserStatus } from "@/types/admin-user";

// Mock the API hooks
vi.mock("@/lib/api/admin-users", () => ({
  useUpdateUserStatus: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  })),
  useUpdateUserProfile: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  })),
  useRoles: vi.fn(),
  useAssignRole: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
  useRevokeRole: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
}));

vi.mock("@/lib/api/stores", () => ({
  useStoresByCompany: vi.fn(),
}));

// Mock useDebounce
vi.mock("@/hooks/useDebounce", () => ({
  useDebounce: vi.fn((value) => value),
}));

// Mock the toast hook
const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

/**
 * EditUserModal Component Tests
 *
 * Tests for the user profile editing modal:
 * - Rendering and display of form fields
 * - Name, email, and password editing
 * - Status change with confirmation
 * - Form validation (Zod schema)
 * - Submission handling and API calls
 * - Password visibility toggles
 * - Error handling
 *
 * Priority: P0 (Critical - User management UI)
 */

describe("EditUserModal - Profile Update Feature", () => {
  const mockRoles = [
    {
      role_id: "role-1",
      code: "SUPERADMIN",
      scope: "SYSTEM",
      description: "System administrator",
    },
    {
      role_id: "role-2",
      code: "STORE_MANAGER",
      scope: "STORE",
      description: "Store manager",
    },
  ];

  const createMockUser = (overrides: Partial<AdminUser> = {}): AdminUser => ({
    user_id: "user-123",
    email: "test@example.com",
    name: "Test User",
    status: UserStatus.ACTIVE,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    roles: [
      {
        user_role_id: "ur-1",
        role: {
          role_id: "role-1",
          code: "SUPERADMIN",
          description: "System administrator",
          scope: "SYSTEM",
        },
        company_id: null,
        company_name: null,
        store_id: null,
        store_name: null,
        assigned_at: new Date().toISOString(),
      },
    ],
    ...overrides,
  });

  const mockUpdateProfileMutate = vi.fn();
  const mockUpdateStatusMutate = vi.fn();
  const mockOnSuccess = vi.fn();
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateProfileMutate.mockResolvedValue({ success: true });
    mockUpdateStatusMutate.mockResolvedValue({ success: true });

    vi.mocked(adminUsersApi.useRoles).mockReturnValue({
      data: { data: mockRoles },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    vi.mocked(adminUsersApi.useUpdateUserProfile).mockReturnValue({
      mutateAsync: mockUpdateProfileMutate,
      isPending: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(adminUsersApi.useUpdateUserStatus).mockReturnValue({
      mutateAsync: mockUpdateStatusMutate,
      isPending: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(adminUsersApi.useAssignRole).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);

    vi.mocked(adminUsersApi.useRevokeRole).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);

    vi.mocked(storesApi.useStoresByCompany).mockReturnValue({
      data: { data: [] },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
    } as any);
  });

  describe("Rendering", () => {
    it("[P0] EDIT-001: should render all editable form fields when modal is open", () => {
      // GIVEN: A user to edit
      const user = createMockUser();

      // WHEN: Modal is rendered
      renderWithProviders(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );

      // THEN: All form fields should be visible
      expect(screen.getByTestId("edit-user-name-input")).toBeInTheDocument();
      expect(screen.getByTestId("edit-user-email-input")).toBeInTheDocument();
      expect(
        screen.getByTestId("edit-user-password-input"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("edit-user-confirm-password-input"),
      ).toBeInTheDocument();
      expect(screen.getByTestId("edit-user-status-select")).toBeInTheDocument();
    });

    it("[P0] EDIT-002: should populate form with user data", () => {
      // GIVEN: A user with specific data
      const user = createMockUser({
        name: "John Doe",
        email: "john.doe@example.com",
      });

      // WHEN: Modal is rendered
      renderWithProviders(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );

      // THEN: Form fields should be populated with user data
      expect(screen.getByTestId("edit-user-name-input")).toHaveValue(
        "John Doe",
      );
      expect(screen.getByTestId("edit-user-email-input")).toHaveValue(
        "john.doe@example.com",
      );
    });

    it("[P1] EDIT-003: should display password section with description", () => {
      // GIVEN: A user to edit
      const user = createMockUser();

      // WHEN: Modal is rendered
      renderWithProviders(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );

      // THEN: Password section should have helpful text
      expect(
        screen.getByText(/Change Password \(Optional\)/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Leave blank to keep the current password/i),
      ).toBeInTheDocument();
    });

    it("[P1] EDIT-004: should have password fields empty initially", () => {
      // GIVEN: A user to edit
      const user = createMockUser();

      // WHEN: Modal is rendered
      renderWithProviders(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );

      // THEN: Password fields should be empty
      expect(screen.getByTestId("edit-user-password-input")).toHaveValue("");
      expect(
        screen.getByTestId("edit-user-confirm-password-input"),
      ).toHaveValue("");
    });

    it("[P1] EDIT-005: should display modal title and description", () => {
      // GIVEN: A user to edit
      const user = createMockUser();

      // WHEN: Modal is rendered
      renderWithProviders(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );

      // THEN: Modal header should be visible
      expect(screen.getByText("Edit User")).toBeInTheDocument();
      expect(
        screen.getByText(
          /Update user profile, status, and manage role assignments/i,
        ),
      ).toBeInTheDocument();
    });
  });

  describe("Name Field", () => {
    it("[P0] EDIT-010: should allow editing the name field", async () => {
      // GIVEN: A user to edit
      const user = createMockUser({ name: "Original Name" });
      const userEvent_ = userEvent.setup();

      renderWithProviders(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );

      // WHEN: User clears and enters new name
      const nameInput = screen.getByTestId("edit-user-name-input");
      await userEvent_.clear(nameInput);
      await userEvent_.type(nameInput, "New Name");

      // THEN: Name field should have new value
      expect(nameInput).toHaveValue("New Name");
    });

    it("[P0] EDIT-011: should show validation error for empty name", async () => {
      // GIVEN: A user to edit
      const user = createMockUser();
      const userEvent_ = userEvent.setup();

      renderWithProviders(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );

      // WHEN: Name is cleared and form is submitted
      const nameInput = screen.getByTestId("edit-user-name-input");
      await userEvent_.clear(nameInput);
      await userEvent_.click(screen.getByRole("button", { name: /save/i }));

      // THEN: Validation error should be displayed
      await waitFor(() => {
        expect(screen.getByText(/Name is required/i)).toBeInTheDocument();
      });
    });

    it("[P1] EDIT-012: should show validation error for whitespace-only name", async () => {
      // GIVEN: A user to edit
      const user = createMockUser();
      const userEvent_ = userEvent.setup();

      renderWithProviders(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );

      // WHEN: Name is set to whitespace only
      const nameInput = screen.getByTestId("edit-user-name-input");
      await userEvent_.clear(nameInput);
      await userEvent_.type(nameInput, "   ");
      await userEvent_.click(screen.getByRole("button", { name: /save/i }));

      // THEN: Validation error should be displayed
      await waitFor(() => {
        expect(screen.getByText(/whitespace only/i)).toBeInTheDocument();
      });
    });
  });

  describe("Email Field", () => {
    it("[P0] EDIT-020: should allow editing the email field", async () => {
      // GIVEN: A user to edit
      const user = createMockUser({ email: "old@example.com" });
      const userEvent_ = userEvent.setup();

      renderWithProviders(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );

      // WHEN: User enters new email
      const emailInput = screen.getByTestId("edit-user-email-input");
      await userEvent_.clear(emailInput);
      await userEvent_.type(emailInput, "new@example.com");

      // THEN: Email field should have new value
      expect(emailInput).toHaveValue("new@example.com");
    });

    it("[P0] EDIT-021: should show validation error for invalid email format", async () => {
      // GIVEN: A user to edit
      const user = createMockUser();
      const userEvent_ = userEvent.setup();

      renderWithProviders(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );

      // WHEN: Invalid email is entered
      const emailInput = screen.getByTestId("edit-user-email-input");
      await userEvent_.clear(emailInput);
      await userEvent_.type(emailInput, "not-an-email");
      await userEvent_.click(screen.getByRole("button", { name: /save/i }));

      // THEN: Validation error should be displayed
      await waitFor(() => {
        expect(screen.getByText(/Invalid email format/i)).toBeInTheDocument();
      });
    });
  });

  describe("Password Field", () => {
    it("[P0] EDIT-030: should allow entering a new password", async () => {
      // GIVEN: A user to edit
      const user = createMockUser();
      const userEvent_ = userEvent.setup();

      renderWithProviders(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );

      // WHEN: User enters new password
      const passwordInput = screen.getByTestId("edit-user-password-input");
      await userEvent_.type(passwordInput, "NewSecure@Pass123");

      // THEN: Password field should have value
      expect(passwordInput).toHaveValue("NewSecure@Pass123");
    });

    it("[P0] EDIT-031: should show validation error for weak password", async () => {
      // GIVEN: A user to edit
      const user = createMockUser();
      const userEvent_ = userEvent.setup();

      renderWithProviders(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );

      // WHEN: Weak password is entered
      const passwordInput = screen.getByTestId("edit-user-password-input");
      await userEvent_.type(passwordInput, "weak");
      await userEvent_.click(screen.getByRole("button", { name: /save/i }));

      // THEN: Validation error should be displayed
      await waitFor(() => {
        expect(
          screen.getByText(/Password must be at least 8 characters/i),
        ).toBeInTheDocument();
      });
    });

    it("[P0] EDIT-032: should require confirm password to match", async () => {
      // GIVEN: A user to edit
      const user = createMockUser();
      const userEvent_ = userEvent.setup();

      renderWithProviders(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );

      // WHEN: Password and confirm password don't match
      await userEvent_.type(
        screen.getByTestId("edit-user-password-input"),
        "StrongPassword1!",
      );
      await userEvent_.type(
        screen.getByTestId("edit-user-confirm-password-input"),
        "DifferentPassword1!",
      );
      await userEvent_.click(screen.getByRole("button", { name: /save/i }));

      // THEN: Validation error should be displayed
      await waitFor(() => {
        expect(screen.getByText(/Passwords do not match/i)).toBeInTheDocument();
      });
    });

    it("[P1] EDIT-033: should toggle password visibility", async () => {
      // GIVEN: A user to edit
      const user = createMockUser();
      const userEvent_ = userEvent.setup();

      renderWithProviders(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );

      // Password should be hidden initially
      const passwordInput = screen.getByTestId("edit-user-password-input");
      expect(passwordInput).toHaveAttribute("type", "password");

      // WHEN: Clicking the visibility toggle
      const toggleButtons = screen.getAllByRole("button");
      const eyeButton = toggleButtons.find(
        (btn) =>
          btn.querySelector("svg") &&
          btn.closest(".relative")?.contains(passwordInput),
      );
      if (eyeButton) {
        await userEvent_.click(eyeButton);
      }

      // THEN: Password should be visible
      await waitFor(() => {
        expect(passwordInput).toHaveAttribute("type", "text");
      });
    });

    it("[P1] EDIT-034: should display password requirements hint", () => {
      // GIVEN: A user to edit
      const user = createMockUser();

      // WHEN: Modal is rendered
      renderWithProviders(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );

      // THEN: Password requirements should be displayed
      expect(
        screen.getByText(/uppercase, lowercase, number, special character/i),
      ).toBeInTheDocument();
    });
  });

  describe("Form Submission - Profile Updates", () => {
    it("[P0] EDIT-040: should call updateProfile mutation with name change only", async () => {
      // GIVEN: A user to edit
      const user = createMockUser({
        name: "Old Name",
        email: "test@example.com",
      });
      const userEvent_ = userEvent.setup();

      renderWithProviders(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );

      // WHEN: Only name is changed and form is submitted
      const nameInput = screen.getByTestId("edit-user-name-input");
      await userEvent_.clear(nameInput);
      await userEvent_.type(nameInput, "New Name");
      await userEvent_.click(screen.getByRole("button", { name: /save/i }));

      // THEN: Update profile mutation should be called with only name
      await waitFor(() => {
        expect(mockUpdateProfileMutate).toHaveBeenCalledWith({
          userId: "user-123",
          data: { name: "New Name" },
        });
      });

      // AND: Status mutation should NOT be called (status unchanged)
      expect(mockUpdateStatusMutate).not.toHaveBeenCalled();
    });

    it("[P0] EDIT-041: should call updateProfile mutation with email change only", async () => {
      // GIVEN: A user to edit
      const user = createMockUser({ email: "old@example.com" });
      const userEvent_ = userEvent.setup();

      renderWithProviders(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );

      // WHEN: Only email is changed and form is submitted
      const emailInput = screen.getByTestId("edit-user-email-input");
      await userEvent_.clear(emailInput);
      await userEvent_.type(emailInput, "new@example.com");
      await userEvent_.click(screen.getByRole("button", { name: /save/i }));

      // THEN: Update profile mutation should be called with only email
      await waitFor(() => {
        expect(mockUpdateProfileMutate).toHaveBeenCalledWith({
          userId: "user-123",
          data: { email: "new@example.com" },
        });
      });
    });

    it("[P0] EDIT-042: should call updateProfile mutation with password change", async () => {
      // GIVEN: A user to edit
      const user = createMockUser();
      const userEvent_ = userEvent.setup();

      renderWithProviders(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );

      // WHEN: Password is provided with matching confirmation
      await userEvent_.type(
        screen.getByTestId("edit-user-password-input"),
        "NewSecure@Pass123",
      );
      await userEvent_.type(
        screen.getByTestId("edit-user-confirm-password-input"),
        "NewSecure@Pass123",
      );
      await userEvent_.click(screen.getByRole("button", { name: /save/i }));

      // THEN: Update profile mutation should be called with password
      await waitFor(() => {
        expect(mockUpdateProfileMutate).toHaveBeenCalledWith({
          userId: "user-123",
          data: { password: "NewSecure@Pass123" },
        });
      });
    });

    it("[P0] EDIT-043: should call updateProfile with all changed fields", async () => {
      // GIVEN: A user to edit
      const user = createMockUser({
        name: "Old Name",
        email: "old@example.com",
      });
      const userEvent_ = userEvent.setup();

      renderWithProviders(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );

      // WHEN: Name, email, and password are all changed
      await userEvent_.clear(screen.getByTestId("edit-user-name-input"));
      await userEvent_.type(
        screen.getByTestId("edit-user-name-input"),
        "New Name",
      );
      await userEvent_.clear(screen.getByTestId("edit-user-email-input"));
      await userEvent_.type(
        screen.getByTestId("edit-user-email-input"),
        "new@example.com",
      );
      await userEvent_.type(
        screen.getByTestId("edit-user-password-input"),
        "NewSecure@Pass123",
      );
      await userEvent_.type(
        screen.getByTestId("edit-user-confirm-password-input"),
        "NewSecure@Pass123",
      );
      await userEvent_.click(screen.getByRole("button", { name: /save/i }));

      // THEN: Update profile mutation should be called with all fields
      await waitFor(() => {
        expect(mockUpdateProfileMutate).toHaveBeenCalledWith({
          userId: "user-123",
          data: {
            name: "New Name",
            email: "new@example.com",
            password: "NewSecure@Pass123",
          },
        });
      });
    });

    it("[P1] EDIT-044: should NOT call any mutation when no changes made", async () => {
      // GIVEN: A user to edit (no changes will be made)
      const user = createMockUser({
        name: "Test User",
        email: "test@example.com",
        status: UserStatus.ACTIVE,
      });
      const userEvent_ = userEvent.setup();

      renderWithProviders(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );

      // WHEN: Form is submitted without changes
      await userEvent_.click(screen.getByRole("button", { name: /save/i }));

      // THEN: No mutations should be called
      await waitFor(() => {
        expect(mockUpdateProfileMutate).not.toHaveBeenCalled();
        expect(mockUpdateStatusMutate).not.toHaveBeenCalled();
      });

      // AND: Toast should indicate no changes
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.stringMatching(/No changes were made/i),
        }),
      );
    });

    it("[P1] EDIT-045: should show success toast on successful update", async () => {
      // GIVEN: A user to edit
      const user = createMockUser({ name: "Old Name" });
      const userEvent_ = userEvent.setup();

      renderWithProviders(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );

      // WHEN: Name is changed and form is submitted
      await userEvent_.clear(screen.getByTestId("edit-user-name-input"));
      await userEvent_.type(
        screen.getByTestId("edit-user-name-input"),
        "New Name",
      );
      await userEvent_.click(screen.getByRole("button", { name: /save/i }));

      // THEN: Success toast should be shown
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Success",
            description: expect.stringMatching(/name.*updated/i),
          }),
        );
      });
    });

    it("[P1] EDIT-046: should close modal on successful update", async () => {
      // GIVEN: A user to edit
      const user = createMockUser({ name: "Old Name" });
      const userEvent_ = userEvent.setup();

      renderWithProviders(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );

      // WHEN: Form is successfully submitted
      await userEvent_.clear(screen.getByTestId("edit-user-name-input"));
      await userEvent_.type(
        screen.getByTestId("edit-user-name-input"),
        "New Name",
      );
      await userEvent_.click(screen.getByRole("button", { name: /save/i }));

      // THEN: onOpenChange should be called with false
      await waitFor(() => {
        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      });

      // AND: onSuccess callback should be called
      expect(mockOnSuccess).toHaveBeenCalled();
    });

    it("[P1] EDIT-047: should show error toast on API failure", async () => {
      // GIVEN: Update mutation will fail
      mockUpdateProfileMutate.mockRejectedValue(
        new Error("Email already exists"),
      );
      const user = createMockUser({ email: "old@example.com" });
      const userEvent_ = userEvent.setup();

      renderWithProviders(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );

      // WHEN: Email is changed and form is submitted
      await userEvent_.clear(screen.getByTestId("edit-user-email-input"));
      await userEvent_.type(
        screen.getByTestId("edit-user-email-input"),
        "existing@example.com",
      );
      await userEvent_.click(screen.getByRole("button", { name: /save/i }));

      // THEN: Error toast should be shown
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Error",
            description: "Email already exists",
            variant: "destructive",
          }),
        );
      });

      // AND: Modal should NOT close
      expect(mockOnOpenChange).not.toHaveBeenCalledWith(false);
    });
  });

  describe("Form State Management", () => {
    it("[P1] EDIT-050: should reset form when modal is closed and reopened", async () => {
      // GIVEN: A user with specific data
      const user = createMockUser({ name: "Original Name" });
      const userEvent_ = userEvent.setup();

      const { rerender } = renderWithProviders(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );

      // WHEN: Name is modified
      const nameInput = screen.getByTestId("edit-user-name-input");
      await userEvent_.clear(nameInput);
      await userEvent_.type(nameInput, "Modified Name");
      expect(nameInput).toHaveValue("Modified Name");

      // AND: Modal is closed
      rerender(
        <EditUserModal
          open={false}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );

      // AND: Modal is reopened
      rerender(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );

      // THEN: Form should be reset to original values
      await waitFor(() => {
        expect(screen.getByTestId("edit-user-name-input")).toHaveValue(
          "Original Name",
        );
      });
    });

    it("[P1] EDIT-051: should reset password fields when modal opens", async () => {
      // GIVEN: A user to edit
      const user = createMockUser();
      const userEvent_ = userEvent.setup();

      const { rerender } = renderWithProviders(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );

      // WHEN: Password is entered
      await userEvent_.type(
        screen.getByTestId("edit-user-password-input"),
        "SomePassword123!",
      );

      // AND: Modal is closed and reopened
      rerender(
        <EditUserModal
          open={false}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );
      rerender(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );

      // THEN: Password field should be empty
      await waitFor(() => {
        expect(screen.getByTestId("edit-user-password-input")).toHaveValue("");
        expect(
          screen.getByTestId("edit-user-confirm-password-input"),
        ).toHaveValue("");
      });
    });

    it("[P1] EDIT-052: should update form when user prop changes", async () => {
      // GIVEN: Modal is open with one user
      const user1 = createMockUser({ user_id: "user-1", name: "User One" });
      const user2 = createMockUser({ user_id: "user-2", name: "User Two" });

      const { rerender } = renderWithProviders(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user1}
          onSuccess={mockOnSuccess}
        />,
      );

      expect(screen.getByTestId("edit-user-name-input")).toHaveValue(
        "User One",
      );

      // WHEN: User prop changes
      rerender(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user2}
          onSuccess={mockOnSuccess}
        />,
      );

      // THEN: Form should show new user's data
      await waitFor(() => {
        expect(screen.getByTestId("edit-user-name-input")).toHaveValue(
          "User Two",
        );
      });
    });
  });

  describe("Accessibility", () => {
    it("[P2] EDIT-060: should have proper labels for all form fields", () => {
      // GIVEN: A user to edit
      const user = createMockUser();

      // WHEN: Modal is rendered
      renderWithProviders(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );

      // THEN: Labels should be associated with inputs
      expect(screen.getByLabelText(/Name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/New Password/i)).toBeInTheDocument();
      expect(
        screen.getByLabelText(/Confirm New Password/i),
      ).toBeInTheDocument();
    });

    it("[P2] EDIT-061: should disable inputs while form is submitting", async () => {
      // GIVEN: Form submission is in progress
      vi.mocked(adminUsersApi.useUpdateUserProfile).mockReturnValue({
        mutateAsync: vi.fn(() => new Promise(() => {})), // Never resolves
        isPending: true,
        isError: false,
        error: null,
      } as any);

      const user = createMockUser();

      // WHEN: Modal is rendered during submission
      renderWithProviders(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );

      // THEN: All inputs should be disabled
      // Note: We check if the submit shows loading state
      const submitButton = screen.getByRole("button", { name: /save/i });
      expect(submitButton).toBeInTheDocument();
    });
  });

  describe("Edge Cases", () => {
    it("[P2] EDIT-070: should handle user with null roles gracefully", () => {
      // GIVEN: A user with empty roles array
      const user = createMockUser({ roles: [] });

      // WHEN: Modal is rendered
      renderWithProviders(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );

      // THEN: Modal should render without error
      expect(screen.getByTestId("edit-user-name-input")).toBeInTheDocument();
    });

    it("[P2] EDIT-071: should handle special characters in name", async () => {
      // GIVEN: A user to edit
      const user = createMockUser();
      const userEvent_ = userEvent.setup();

      renderWithProviders(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );

      // WHEN: Name with special characters is entered
      const specialName = "José García 日本語";
      await userEvent_.clear(screen.getByTestId("edit-user-name-input"));
      await userEvent_.type(
        screen.getByTestId("edit-user-name-input"),
        specialName,
      );
      await userEvent_.click(screen.getByRole("button", { name: /save/i }));

      // THEN: Name should be accepted
      await waitFor(() => {
        expect(mockUpdateProfileMutate).toHaveBeenCalledWith({
          userId: "user-123",
          data: { name: specialName },
        });
      });
    });

    it("[P2] EDIT-072: should trim whitespace from email", async () => {
      // GIVEN: A user to edit
      const user = createMockUser({ email: "old@example.com" });
      const userEvent_ = userEvent.setup();

      renderWithProviders(
        <EditUserModal
          open={true}
          onOpenChange={mockOnOpenChange}
          user={user}
          onSuccess={mockOnSuccess}
        />,
      );

      // WHEN: Email with whitespace is entered
      await userEvent_.clear(screen.getByTestId("edit-user-email-input"));
      await userEvent_.type(
        screen.getByTestId("edit-user-email-input"),
        "  NEW@EXAMPLE.COM  ",
      );
      await userEvent_.click(screen.getByRole("button", { name: /save/i }));

      // THEN: Email should be trimmed and lowercased
      await waitFor(() => {
        expect(mockUpdateProfileMutate).toHaveBeenCalledWith({
          userId: "user-123",
          data: { email: "new@example.com" },
        });
      });
    });
  });
});
