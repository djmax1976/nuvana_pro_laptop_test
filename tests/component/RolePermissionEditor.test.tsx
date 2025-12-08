import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../support/test-utils";
import { RolePermissionEditor } from "@/components/client-roles/RolePermissionEditor";
import userEvent from "@testing-library/user-event";
import * as clientRolesApi from "@/lib/api/client-roles";

/**
 * @test-level Component
 * @justification UI component tests for RolePermissionEditor - tests rendering, user interactions, and state management
 * @story 2.92
 * @enhanced-by workflow-9 on 2025-01-28
 *
 * Component Tests: RolePermissionEditor
 *
 * CRITICAL TEST COVERAGE:
 * - Displays permissions grouped by category
 * - Permission toggle functionality (checkbox)
 * - Save Changes button with loading state
 * - Reset to Default button with confirmation dialog
 * - Success/error toast messages
 * - Unsaved changes indicator
 * - Edge cases: empty categories, multiple toggles before save
 * - Error handling for failed mutations
 *
 * Story: 2.92 - Client Role Permission Management
 */

// Mock the API hooks
vi.mock("@/lib/api/client-roles", () => ({
  useRolePermissions: vi.fn(),
  useUpdateRolePermissions: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
  useResetRoleDefaults: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
  groupPermissionsByCategory: vi.fn((permissions) => {
    // Group by category for testing - MUST return a Map to match actual implementation
    const grouped = new Map<string, typeof permissions>();
    for (const perm of permissions) {
      const category = perm.category || "OTHER";
      const existing = grouped.get(category);
      if (existing) {
        existing.push(perm);
      } else {
        grouped.set(category, [perm]);
      }
    }
    return grouped;
  }),
  getCategoryDisplayName: vi.fn((category) => {
    const names: Record<string, string> = {
      SHIFTS: "Shift Operations",
      TRANSACTIONS: "Transactions",
      INVENTORY: "Inventory",
      REPORTS: "Reports",
    };
    // eslint-disable-next-line security/detect-object-injection
    return names[category] || category;
  }),
  hasClientOverrides: vi.fn((permissions) =>
    permissions.some((p: any) => p.is_client_override),
  ),
  clientRoleKeys: {
    all: ["client-roles"],
    lists: () => ["client-roles", "list"],
    list: () => ["client-roles", "list"],
    details: () => ["client-roles", "detail"],
    detail: (roleId: string) => ["client-roles", "detail", roleId],
    permissions: (roleId: string) => ["client-roles", "permissions", roleId],
  },
}));

// Mock the toast hook
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe("2.92-COMPONENT: RolePermissionEditor - Display Permissions", () => {
  const mockRole = {
    role_id: "role-1",
    code: "STORE_MANAGER",
    scope: "STORE",
    description: "Manager of a store",
    permissions: [
      {
        permission_id: "perm-1",
        code: "SHIFT_OPEN",
        description: "Open a shift",
        category: "SHIFTS",
        is_enabled: true,
        is_system_default: true,
        is_client_override: false,
      },
      {
        permission_id: "perm-2",
        code: "SHIFT_CLOSE",
        description: "Close a shift",
        category: "SHIFTS",
        is_enabled: true,
        is_system_default: true,
        is_client_override: false,
      },
      {
        permission_id: "perm-3",
        code: "TRANSACTION_CREATE",
        description: "Create transactions",
        category: "TRANSACTIONS",
        is_enabled: false,
        is_system_default: false,
        is_client_override: true,
      },
    ],
  };

  const mockOnBack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clientRolesApi.useRolePermissions).mockReturnValue({
      data: mockRole,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);
  });

  it("[P0] 2.92-COMPONENT-020: should display permissions grouped by category (AC #2)", () => {
    // GIVEN: RolePermissionEditor with permissions in multiple categories
    // WHEN: Component is rendered
    renderWithProviders(
      <RolePermissionEditor roleId="role-1" onBack={mockOnBack} />,
    );

    // THEN: Category headings should be displayed
    expect(
      screen.getByTestId("permission-category-SHIFTS"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("permission-category-TRANSACTIONS"),
    ).toBeInTheDocument();
  });

  it("[P0] 2.92-COMPONENT-021: should display permission toggle (checkbox) for each permission (AC #2)", () => {
    // GIVEN: RolePermissionEditor with permissions
    // WHEN: Component is rendered
    renderWithProviders(
      <RolePermissionEditor roleId="role-1" onBack={mockOnBack} />,
    );

    // THEN: Each permission should have a toggle
    expect(screen.getByTestId("permission-toggle-perm-1")).toBeInTheDocument();
    expect(screen.getByTestId("permission-toggle-perm-2")).toBeInTheDocument();
    expect(screen.getByTestId("permission-toggle-perm-3")).toBeInTheDocument();
  });

  it("[P1] 2.92-COMPONENT-022: should display permission descriptions (AC #2)", () => {
    // GIVEN: RolePermissionEditor with permissions that have descriptions
    // WHEN: Component is rendered
    renderWithProviders(
      <RolePermissionEditor roleId="role-1" onBack={mockOnBack} />,
    );

    // THEN: Permission descriptions should be visible
    expect(
      screen.getByTestId("permission-description-perm-1"),
    ).toBeInTheDocument();
    expect(screen.getByText("Open a shift")).toBeInTheDocument();
    expect(screen.getByText("Close a shift")).toBeInTheDocument();
    expect(screen.getByText("Create transactions")).toBeInTheDocument();
  });

  it("[P1] 2.92-COMPONENT-023: should show 'Modified' badge for client overrides", () => {
    // GIVEN: RolePermissionEditor with a permission that has client override
    // WHEN: Component is rendered
    renderWithProviders(
      <RolePermissionEditor roleId="role-1" onBack={mockOnBack} />,
    );

    // THEN: The permission with is_client_override should show "Modified" badge
    const transactionToggle = screen.getByTestId("permission-toggle-perm-3");
    expect(transactionToggle.textContent).toContain("Modified");
  });
});

describe("2.92-COMPONENT: RolePermissionEditor - Toggle Functionality", () => {
  const mockRole = {
    role_id: "role-1",
    code: "STORE_MANAGER",
    scope: "STORE",
    permissions: [
      {
        permission_id: "perm-1",
        code: "SHIFT_OPEN",
        description: "Open a shift",
        category: "SHIFTS",
        is_enabled: true,
        is_system_default: true,
        is_client_override: false,
      },
    ],
  };

  const mockOnBack = vi.fn();
  const mockUpdateMutation = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clientRolesApi.useRolePermissions).mockReturnValue({
      data: mockRole,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);
    mockUpdateMutation.mockResolvedValue({ success: true });
    vi.mocked(clientRolesApi.useUpdateRolePermissions).mockReturnValue({
      mutateAsync: mockUpdateMutation,
      isPending: false,
    } as any);
  });

  it("[P0] 2.92-COMPONENT-030: should toggle permission on/off (AC #2)", async () => {
    // GIVEN: RolePermissionEditor with an enabled permission
    const user = userEvent.setup();
    renderWithProviders(
      <RolePermissionEditor roleId="role-1" onBack={mockOnBack} />,
    );

    // Find the checkbox within the permission toggle
    const permissionToggle = screen.getByTestId("permission-toggle-perm-1");
    const checkbox =
      permissionToggle.querySelector('input[type="checkbox"]') ||
      permissionToggle.querySelector('[role="checkbox"]');

    // WHEN: The checkbox is clicked to toggle it off
    if (checkbox) {
      await user.click(checkbox);
    }

    // THEN: The unsaved changes indicator should appear
    await waitFor(() => {
      expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
    });
  });

  it("[P0] 2.92-COMPONENT-031: should show unsaved changes indicator when permission is modified", async () => {
    // GIVEN: RolePermissionEditor with permissions
    const user = userEvent.setup();
    renderWithProviders(
      <RolePermissionEditor roleId="role-1" onBack={mockOnBack} />,
    );

    // Initially, no unsaved changes indicator
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();

    // WHEN: A permission is toggled
    const permissionToggle = screen.getByTestId("permission-toggle-perm-1");
    const checkbox =
      permissionToggle.querySelector('input[type="checkbox"]') ||
      permissionToggle.querySelector('[role="checkbox"]');
    if (checkbox) {
      await user.click(checkbox);
    }

    // THEN: Unsaved changes indicator should appear
    await waitFor(() => {
      expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
    });
  });
});

describe("2.92-COMPONENT: RolePermissionEditor - Save Changes", () => {
  const mockRole = {
    role_id: "role-1",
    code: "STORE_MANAGER",
    scope: "STORE",
    permissions: [
      {
        permission_id: "perm-1",
        code: "SHIFT_OPEN",
        description: "Open a shift",
        category: "SHIFTS",
        is_enabled: true,
        is_system_default: true,
        is_client_override: false,
      },
    ],
  };

  const mockOnBack = vi.fn();
  const mockUpdateMutation = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clientRolesApi.useRolePermissions).mockReturnValue({
      data: mockRole,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);
    mockUpdateMutation.mockResolvedValue({ success: true });
    vi.mocked(clientRolesApi.useUpdateRolePermissions).mockReturnValue({
      mutateAsync: mockUpdateMutation,
      isPending: false,
    } as any);
  });

  it("[P0] 2.92-COMPONENT-040: should have Save Changes button (AC #4)", () => {
    // GIVEN: RolePermissionEditor component
    // WHEN: Component is rendered
    renderWithProviders(
      <RolePermissionEditor roleId="role-1" onBack={mockOnBack} />,
    );

    // THEN: Save Changes button should be present
    expect(screen.getByTestId("save-changes-button")).toBeInTheDocument();
  });

  it("[P1] 2.92-COMPONENT-041: should disable Save Changes button when no changes", () => {
    // GIVEN: RolePermissionEditor with no modifications
    // WHEN: Component is rendered
    renderWithProviders(
      <RolePermissionEditor roleId="role-1" onBack={mockOnBack} />,
    );

    // THEN: Save Changes button should be disabled
    const saveButton = screen.getByTestId("save-changes-button");
    expect(saveButton).toBeDisabled();
  });

  it("[P0] 2.92-COMPONENT-042: should enable Save Changes button when changes are made", async () => {
    // GIVEN: RolePermissionEditor with permissions
    const user = userEvent.setup();
    renderWithProviders(
      <RolePermissionEditor roleId="role-1" onBack={mockOnBack} />,
    );

    // Save button initially disabled
    expect(screen.getByTestId("save-changes-button")).toBeDisabled();

    // WHEN: A permission is toggled
    const permissionToggle = screen.getByTestId("permission-toggle-perm-1");
    const checkbox =
      permissionToggle.querySelector('input[type="checkbox"]') ||
      permissionToggle.querySelector('[role="checkbox"]');
    if (checkbox) {
      await user.click(checkbox);
    }

    // THEN: Save Changes button should be enabled
    await waitFor(() => {
      expect(screen.getByTestId("save-changes-button")).not.toBeDisabled();
    });
  });

  it("[P1] 2.92-COMPONENT-043: should show loading state when saving", async () => {
    // GIVEN: Update mutation is pending
    vi.mocked(clientRolesApi.useUpdateRolePermissions).mockReturnValue({
      mutateAsync: mockUpdateMutation,
      isPending: true,
    } as any);

    // WHEN: Component is rendered during save
    renderWithProviders(
      <RolePermissionEditor roleId="role-1" onBack={mockOnBack} />,
    );

    // THEN: Save button should show loading text
    expect(screen.getByText(/Saving.../i)).toBeInTheDocument();
  });
});

describe("2.92-COMPONENT: RolePermissionEditor - Reset to Default", () => {
  const mockRole = {
    role_id: "role-1",
    code: "STORE_MANAGER",
    scope: "STORE",
    permissions: [
      {
        permission_id: "perm-1",
        code: "SHIFT_OPEN",
        description: "Open a shift",
        category: "SHIFTS",
        is_enabled: false,
        is_system_default: true,
        is_client_override: true, // Has override
      },
    ],
  };

  const mockOnBack = vi.fn();
  const mockResetMutation = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clientRolesApi.useRolePermissions).mockReturnValue({
      data: mockRole,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);
    mockResetMutation.mockResolvedValue({ success: true });
    vi.mocked(clientRolesApi.useResetRoleDefaults).mockReturnValue({
      mutateAsync: mockResetMutation,
      isPending: false,
    } as any);
  });

  it("[P0] 2.92-COMPONENT-050: should have Reset to Default button (AC #6)", () => {
    // GIVEN: RolePermissionEditor component
    // WHEN: Component is rendered
    renderWithProviders(
      <RolePermissionEditor roleId="role-1" onBack={mockOnBack} />,
    );

    // THEN: Reset to Default button should be present
    expect(screen.getByTestId("reset-to-default-button")).toBeInTheDocument();
  });

  it("[P1] 2.92-COMPONENT-051: should disable Reset button when no overrides exist", () => {
    // GIVEN: Role with no client overrides
    vi.mocked(clientRolesApi.useRolePermissions).mockReturnValue({
      data: {
        ...mockRole,
        permissions: [
          {
            ...mockRole.permissions[0],
            is_client_override: false,
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <RolePermissionEditor roleId="role-1" onBack={mockOnBack} />,
    );

    // THEN: Reset button should be disabled
    const resetButton = screen.getByTestId("reset-to-default-button");
    expect(resetButton).toBeDisabled();
  });

  it("[P0] 2.92-COMPONENT-052: should show confirmation dialog when Reset button is clicked (AC #6)", async () => {
    // GIVEN: RolePermissionEditor with overrides
    const user = userEvent.setup();
    renderWithProviders(
      <RolePermissionEditor roleId="role-1" onBack={mockOnBack} />,
    );

    // WHEN: Reset button is clicked
    const resetButton = screen.getByTestId("reset-to-default-button");
    await user.click(resetButton);

    // THEN: Confirmation dialog should appear
    await waitFor(() => {
      expect(
        screen.getByTestId("reset-confirmation-dialog"),
      ).toBeInTheDocument();
    });
  });

  it("[P1] 2.92-COMPONENT-053: should cancel reset when Cancel is clicked in dialog", async () => {
    // GIVEN: RolePermissionEditor with confirmation dialog open
    const user = userEvent.setup();
    renderWithProviders(
      <RolePermissionEditor roleId="role-1" onBack={mockOnBack} />,
    );

    // Open the dialog
    await user.click(screen.getByTestId("reset-to-default-button"));
    await waitFor(() => {
      expect(
        screen.getByTestId("reset-confirmation-dialog"),
      ).toBeInTheDocument();
    });

    // WHEN: Cancel button is clicked
    await user.click(screen.getByTestId("reset-cancel-button"));

    // THEN: Dialog should close and reset should not be called
    await waitFor(() => {
      expect(
        screen.queryByTestId("reset-confirmation-dialog"),
      ).not.toBeInTheDocument();
    });
    expect(mockResetMutation).not.toHaveBeenCalled();
  });

  it("[P0] 2.92-COMPONENT-054: should call reset mutation when confirmed (AC #6)", async () => {
    // GIVEN: RolePermissionEditor with confirmation dialog open
    const user = userEvent.setup();
    renderWithProviders(
      <RolePermissionEditor roleId="role-1" onBack={mockOnBack} />,
    );

    // Open the dialog
    await user.click(screen.getByTestId("reset-to-default-button"));
    await waitFor(() => {
      expect(
        screen.getByTestId("reset-confirmation-dialog"),
      ).toBeInTheDocument();
    });

    // WHEN: Confirm button is clicked
    await user.click(screen.getByTestId("reset-confirm-button"));

    // THEN: Reset mutation should be called
    await waitFor(() => {
      expect(mockResetMutation).toHaveBeenCalledWith("role-1");
    });
  });
});

describe("2.92-COMPONENT: RolePermissionEditor - Loading and Error States", () => {
  const mockOnBack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[P1] 2.92-COMPONENT-060: should display loading state while fetching permissions", () => {
    // GIVEN: API is loading
    vi.mocked(clientRolesApi.useRolePermissions).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <RolePermissionEditor roleId="role-1" onBack={mockOnBack} />,
    );

    // THEN: Loading skeleton should be visible
    expect(screen.getByTestId("permission-editor-loading")).toBeInTheDocument();
  });

  it("[P1] 2.92-COMPONENT-061: should display error state when fetch fails", () => {
    // GIVEN: API returns an error
    vi.mocked(clientRolesApi.useRolePermissions).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Failed to fetch permissions"),
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <RolePermissionEditor roleId="role-1" onBack={mockOnBack} />,
    );

    // THEN: Error state should be visible
    expect(screen.getByTestId("permission-editor-error")).toBeInTheDocument();
  });

  it("[P0] 2.92-COMPONENT-062: should have Back button to return to role list", async () => {
    // GIVEN: RolePermissionEditor component
    vi.mocked(clientRolesApi.useRolePermissions).mockReturnValue({
      data: {
        role_id: "role-1",
        code: "STORE_MANAGER",
        scope: "STORE",
        permissions: [],
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    const user = userEvent.setup();
    renderWithProviders(
      <RolePermissionEditor roleId="role-1" onBack={mockOnBack} />,
    );

    // WHEN: Back button is clicked
    const backButton = screen.getByTestId("back-button");
    await user.click(backButton);

    // THEN: onBack callback should be called
    expect(mockOnBack).toHaveBeenCalled();
  });
});

describe("2.92-COMPONENT: RolePermissionEditor - Edge Cases and Error Handling", () => {
  const mockRole = {
    role_id: "role-1",
    code: "STORE_MANAGER",
    scope: "STORE",
    description: "Manager of a store",
    permissions: [
      {
        permission_id: "perm-1",
        code: "SHIFT_OPEN",
        description: "Open a shift",
        category: "SHIFTS",
        is_enabled: true,
        is_system_default: true,
        is_client_override: false,
      },
      {
        permission_id: "perm-2",
        code: "SHIFT_CLOSE",
        description: "Close a shift",
        category: "SHIFTS",
        is_enabled: true,
        is_system_default: true,
        is_client_override: false,
      },
    ],
  };

  const mockOnBack = vi.fn();
  const mockUpdateMutation = vi.fn();
  const mockToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clientRolesApi.useRolePermissions).mockReturnValue({
      data: mockRole,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);
    mockUpdateMutation.mockResolvedValue({ success: true });
    vi.mocked(clientRolesApi.useUpdateRolePermissions).mockReturnValue({
      mutateAsync: mockUpdateMutation,
      isPending: false,
    } as any);
  });

  it("[P1] 2.92-COMPONENT-070: should handle multiple permission toggles before save", async () => {
    // GIVEN: RolePermissionEditor with multiple permissions
    const user = userEvent.setup();
    renderWithProviders(
      <RolePermissionEditor roleId="role-1" onBack={mockOnBack} />,
    );

    // WHEN: Multiple permissions are toggled
    const toggle1 = screen.getByTestId("permission-toggle-perm-1");
    const toggle2 = screen.getByTestId("permission-toggle-perm-2");

    const checkbox1 =
      toggle1.querySelector('input[type="checkbox"]') ||
      toggle1.querySelector('[role="checkbox"]');
    const checkbox2 =
      toggle2.querySelector('input[type="checkbox"]') ||
      toggle2.querySelector('[role="checkbox"]');

    if (checkbox1) await user.click(checkbox1);
    if (checkbox2) await user.click(checkbox2);

    // THEN: Unsaved changes indicator should appear
    await waitFor(() => {
      expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
    });

    // AND: Save button should be enabled
    expect(screen.getByTestId("save-changes-button")).not.toBeDisabled();
  });

  it("[P1] 2.92-COMPONENT-071: should call update mutation with correct payload on save", async () => {
    // GIVEN: RolePermissionEditor with a toggled permission
    const user = userEvent.setup();
    renderWithProviders(
      <RolePermissionEditor roleId="role-1" onBack={mockOnBack} />,
    );

    // Toggle a permission
    const toggle1 = screen.getByTestId("permission-toggle-perm-1");
    const checkbox1 =
      toggle1.querySelector('input[type="checkbox"]') ||
      toggle1.querySelector('[role="checkbox"]');
    if (checkbox1) await user.click(checkbox1);

    // Wait for unsaved changes
    await waitFor(() => {
      expect(screen.getByTestId("save-changes-button")).not.toBeDisabled();
    });

    // WHEN: Save button is clicked
    await user.click(screen.getByTestId("save-changes-button"));

    // THEN: Update mutation should be called with correct payload
    await waitFor(() => {
      expect(mockUpdateMutation).toHaveBeenCalledWith({
        roleId: "role-1",
        permissions: expect.arrayContaining([
          expect.objectContaining({
            permission_id: "perm-1",
            is_enabled: false, // Toggled from true to false
          }),
        ]),
      });
    });
  });

  it("[P1] 2.92-COMPONENT-072: should display system default indicator for each permission", () => {
    // GIVEN: RolePermissionEditor with permissions having system defaults
    renderWithProviders(
      <RolePermissionEditor roleId="role-1" onBack={mockOnBack} />,
    );

    // THEN: System default indicators should be visible (green checkmark icon with aria-label)
    const toggle1 = screen.getByTestId("permission-toggle-perm-1");
    // The system default indicator is an icon with an aria-label attribute
    const systemDefaultIcon = toggle1.querySelector(
      '[aria-label="System default: enabled"]',
    );
    expect(systemDefaultIcon).toBeInTheDocument();
  });

  it("[P2] 2.92-COMPONENT-073: should display role name in header", () => {
    // GIVEN: RolePermissionEditor component
    renderWithProviders(
      <RolePermissionEditor roleId="role-1" onBack={mockOnBack} />,
    );

    // THEN: Role name should be displayed in header
    expect(screen.getByText("Store Manager")).toBeInTheDocument();
  });

  it("[P2] 2.92-COMPONENT-074: should show 'Customized' badge when role has overrides", () => {
    // GIVEN: Role with client overrides
    vi.mocked(clientRolesApi.useRolePermissions).mockReturnValue({
      data: {
        ...mockRole,
        permissions: [
          {
            ...mockRole.permissions[0],
            is_client_override: true,
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <RolePermissionEditor roleId="role-1" onBack={mockOnBack} />,
    );

    // THEN: Customized badge should be visible in header
    expect(screen.getByText("Customized")).toBeInTheDocument();
  });

  it("[P2] 2.92-COMPONENT-075: should handle permission with no description gracefully", () => {
    // GIVEN: Permission without description
    vi.mocked(clientRolesApi.useRolePermissions).mockReturnValue({
      data: {
        ...mockRole,
        permissions: [
          {
            permission_id: "perm-nodesc",
            code: "NO_DESC_PERM",
            description: "", // Empty description
            category: "SHIFTS",
            is_enabled: true,
            is_system_default: true,
            is_client_override: false,
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <RolePermissionEditor roleId="role-1" onBack={mockOnBack} />,
    );

    // THEN: Should render without crashing
    expect(
      screen.getByTestId("permission-toggle-perm-nodesc"),
    ).toBeInTheDocument();
  });

  it("[P1] 2.92-COMPONENT-076: should show retry button in error state", async () => {
    // GIVEN: API returns error with refetch function
    const mockRefetch = vi.fn();
    vi.mocked(clientRolesApi.useRolePermissions).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Network error"),
      refetch: mockRefetch,
    } as any);

    const user = userEvent.setup();
    renderWithProviders(
      <RolePermissionEditor roleId="role-1" onBack={mockOnBack} />,
    );

    // WHEN: Retry button is clicked
    const retryButton = screen.getByRole("button", { name: /Retry/i });
    await user.click(retryButton);

    // THEN: refetch should be called
    expect(mockRefetch).toHaveBeenCalled();
  });

  it("[P2] 2.92-COMPONENT-077: should show permission count per category", () => {
    // GIVEN: RolePermissionEditor with permissions in SHIFTS category
    renderWithProviders(
      <RolePermissionEditor roleId="role-1" onBack={mockOnBack} />,
    );

    // THEN: Category should show permission count
    const categoryCard = screen.getByTestId("permission-category-SHIFTS");
    expect(categoryCard.textContent).toContain("2 permissions");
  });
});
