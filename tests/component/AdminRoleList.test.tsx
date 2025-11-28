import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../support/test-utils";
import { AdminRoleList } from "@/components/admin-roles/AdminRoleList";
import userEvent from "@testing-library/user-event";
import * as adminRolesApi from "@/lib/api/admin-roles";

/**
 * @test-level Component
 * @justification UI component tests for AdminRoleList - tests rendering, user interactions, and state management
 * @story 2.93
 *
 * Component Tests: AdminRoleList
 *
 * CRITICAL TEST COVERAGE:
 * - Displays all roles with scope badges
 * - Shows system role protection indicators
 * - Filter by scope functionality
 * - Search functionality
 * - Delete button for non-system roles
 * - Navigation to Company Access and Deleted Roles pages
 * - Loading and error states
 *
 * Story: 2.93 - Super Admin Role Management
 */

// Mock the API hooks
vi.mock("@/lib/api/admin-roles", () => ({
  useAdminRoles: vi.fn(),
  useDeleteRole: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useRestoreRole: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  getScopeDisplayName: vi.fn((scope: string) => scope),
  getScopeBadgeColor: vi.fn(() => "bg-blue-100 text-blue-800"),
  canDeleteRole: vi.fn(() => ({ canDelete: true })),
}));

// Mock the toast hook
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe("2.93-COMPONENT: AdminRoleList - Display All Roles", () => {
  const mockRoles = [
    {
      role_id: "role-1",
      code: "SYSTEM_ADMIN",
      scope: "SYSTEM",
      description: "System administrator",
      is_system_role: true,
      deleted_at: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      created_by: null,
      deleted_by: null,
      permissions: [],
      user_count: 5,
      company_count: 0,
    },
    {
      role_id: "role-2",
      code: "STORE_MANAGER",
      scope: "STORE",
      description: "Manager of a store",
      is_system_role: false,
      deleted_at: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      created_by: "user-1",
      deleted_by: null,
      permissions: [
        {
          permission_id: "perm-1",
          code: "SHIFT_OPEN",
          description: "Open shifts",
        },
      ],
      user_count: 10,
      company_count: 3,
    },
    {
      role_id: "role-3",
      code: "CORPORATE_ADMIN",
      scope: "COMPANY",
      description: "Company administrator",
      is_system_role: true,
      deleted_at: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      created_by: null,
      deleted_by: null,
      permissions: [],
      user_count: 2,
      company_count: 5,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminRolesApi.useAdminRoles).mockReturnValue({
      data: mockRoles,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);
  });

  it("[P0] 2.93-COMPONENT-001: should render all roles with scope badges", () => {
    // GIVEN: AdminRoleList component with mock roles and Super Admin authorization
    // WHEN: Component is rendered
    renderWithProviders(
      <AdminRoleList
        isAuthorized={true}
        userPermissions={["ADMIN_SYSTEM_CONFIG"]}
      />,
    );

    // THEN: All roles should be displayed
    expect(screen.getByText("SYSTEM_ADMIN")).toBeInTheDocument();
    expect(screen.getByText("STORE_MANAGER")).toBeInTheDocument();
    expect(screen.getByText("CORPORATE_ADMIN")).toBeInTheDocument();
  });

  it("[P1] 2.93-COMPONENT-002: should show system role indicator for system roles", () => {
    // GIVEN: AdminRoleList component with system roles and Super Admin authorization
    // WHEN: Component is rendered
    renderWithProviders(
      <AdminRoleList
        isAuthorized={true}
        userPermissions={["ADMIN_SYSTEM_CONFIG"]}
      />,
    );

    // THEN: System roles should have system badge
    const roleRow1 = screen.getByTestId("role-row-role-1");
    expect(roleRow1).toBeInTheDocument();

    // Check for system role indicator (Shield icon or "System" text)
    expect(roleRow1.textContent).toContain("System");
  });

  it("[P1] 2.93-COMPONENT-003: should display user count and company count", () => {
    // GIVEN: AdminRoleList component with roles that have user counts and Super Admin authorization
    // WHEN: Component is rendered
    renderWithProviders(
      <AdminRoleList
        isAuthorized={true}
        userPermissions={["ADMIN_SYSTEM_CONFIG"]}
      />,
    );

    // THEN: User counts and company counts should be visible in the table rows
    const roleRow1 = screen.getByTestId("role-row-role-1");
    expect(roleRow1.textContent).toContain("5"); // SYSTEM_ADMIN has 5 users

    const roleRow2 = screen.getByTestId("role-row-role-2");
    expect(roleRow2.textContent).toContain("10"); // STORE_MANAGER has 10 users
  });

  it("[P0] 2.93-COMPONENT-004: should have Create Role button when authorized", () => {
    // GIVEN: AdminRoleList component with Super Admin authorization
    // WHEN: Component is rendered with proper permissions
    renderWithProviders(
      <AdminRoleList
        isAuthorized={true}
        userPermissions={["ADMIN_SYSTEM_CONFIG"]}
      />,
    );

    // THEN: Create Role button should be present
    const createButton = screen.getByTestId("create-role-button");
    expect(createButton).toBeInTheDocument();
  });

  it("[P1] 2.93-COMPONENT-005: should have Company Access button when authorized", () => {
    // GIVEN: AdminRoleList component with Super Admin authorization
    // WHEN: Component is rendered with proper permissions
    renderWithProviders(
      <AdminRoleList
        isAuthorized={true}
        userPermissions={["ADMIN_SYSTEM_CONFIG"]}
      />,
    );

    // THEN: Company Access button should be present
    const companyButton = screen.getByTestId("company-roles-button");
    expect(companyButton).toBeInTheDocument();
  });

  it("[P1] 2.93-COMPONENT-006: should have Deleted Roles button when authorized", () => {
    // GIVEN: AdminRoleList component with Super Admin authorization
    // WHEN: Component is rendered with proper permissions
    renderWithProviders(
      <AdminRoleList
        isAuthorized={true}
        userPermissions={["ADMIN_SYSTEM_CONFIG"]}
      />,
    );

    // THEN: Deleted Roles button should be present
    const deletedButton = screen.getByTestId("view-deleted-button");
    expect(deletedButton).toBeInTheDocument();
  });
});

describe("2.93-COMPONENT: AdminRoleList - Filtering", () => {
  const mockRoles = [
    {
      role_id: "role-1",
      code: "SYSTEM_ADMIN",
      scope: "SYSTEM",
      description: "System administrator",
      is_system_role: true,
      deleted_at: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      created_by: null,
      deleted_by: null,
      permissions: [],
      user_count: 5,
      company_count: 0,
    },
    {
      role_id: "role-2",
      code: "STORE_MANAGER",
      scope: "STORE",
      description: "Manager of a store",
      is_system_role: false,
      deleted_at: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      created_by: "user-1",
      deleted_by: null,
      permissions: [],
      user_count: 10,
      company_count: 3,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminRolesApi.useAdminRoles).mockReturnValue({
      data: mockRoles,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);
  });

  it("[P1] 2.93-COMPONENT-010: should filter roles by search query", async () => {
    // GIVEN: AdminRoleList component with Super Admin authorization
    const user = userEvent.setup();
    renderWithProviders(
      <AdminRoleList
        isAuthorized={true}
        userPermissions={["ADMIN_SYSTEM_CONFIG"]}
      />,
    );

    // WHEN: User types in search box
    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, "STORE");

    // THEN: Only matching roles should be visible
    await waitFor(() => {
      expect(screen.getByText("STORE_MANAGER")).toBeInTheDocument();
      expect(screen.queryByText("SYSTEM_ADMIN")).not.toBeInTheDocument();
    });
  });

  it("[P1] 2.93-COMPONENT-011: should filter roles by scope", async () => {
    // GIVEN: AdminRoleList component with Super Admin authorization
    const user = userEvent.setup();
    renderWithProviders(
      <AdminRoleList
        isAuthorized={true}
        userPermissions={["ADMIN_SYSTEM_CONFIG"]}
      />,
    );

    // WHEN: User selects STORE scope filter
    const scopeFilter = screen.getByTestId("scope-filter");
    await user.click(scopeFilter);

    // Find and click STORE option
    const storeOption = screen.getByRole("option", { name: /store/i });
    await user.click(storeOption);

    // THEN: Only STORE scope roles should be visible
    await waitFor(() => {
      expect(screen.getByText("STORE_MANAGER")).toBeInTheDocument();
      expect(screen.queryByText("SYSTEM_ADMIN")).not.toBeInTheDocument();
    });
  });
});

describe("2.93-COMPONENT: AdminRoleList - Loading and Error States", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[P1] 2.93-COMPONENT-020: should display loading state while fetching roles", () => {
    // GIVEN: API is loading
    vi.mocked(adminRolesApi.useAdminRoles).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered with Super Admin authorization
    renderWithProviders(
      <AdminRoleList
        isAuthorized={true}
        userPermissions={["ADMIN_SYSTEM_CONFIG"]}
      />,
    );

    // THEN: Loading skeleton should be visible
    expect(screen.getByTestId("admin-roles-loading")).toBeInTheDocument();
  });

  it("[P1] 2.93-COMPONENT-021: should display error state when fetch fails", () => {
    // GIVEN: API returns an error
    vi.mocked(adminRolesApi.useAdminRoles).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Failed to fetch roles"),
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered with Super Admin authorization
    renderWithProviders(
      <AdminRoleList
        isAuthorized={true}
        userPermissions={["ADMIN_SYSTEM_CONFIG"]}
      />,
    );

    // THEN: Error state should be visible
    expect(screen.getByTestId("admin-roles-error")).toBeInTheDocument();
  });

  it("[P2] 2.93-COMPONENT-022: should display empty state when no roles exist", () => {
    // GIVEN: API returns empty array
    vi.mocked(adminRolesApi.useAdminRoles).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered with Super Admin authorization
    renderWithProviders(
      <AdminRoleList
        isAuthorized={true}
        userPermissions={["ADMIN_SYSTEM_CONFIG"]}
      />,
    );

    // THEN: Empty state should be visible with "No Roles Found" message
    expect(screen.getByTestId("admin-roles-empty")).toBeInTheDocument();
    expect(screen.getByText("No Roles Found")).toBeInTheDocument();
  });
});

describe("2.93-COMPONENT: AdminRoleList - Role Actions", () => {
  const mockRoles = [
    {
      role_id: "role-1",
      code: "CUSTOM_ROLE",
      scope: "STORE",
      description: "Custom role",
      is_system_role: false,
      deleted_at: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      created_by: "user-1",
      deleted_by: null,
      permissions: [],
      user_count: 0,
      company_count: 0,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminRolesApi.useAdminRoles).mockReturnValue({
      data: mockRoles,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);
    vi.mocked(adminRolesApi.canDeleteRole).mockReturnValue({ canDelete: true });
  });

  it("[P0] 2.93-COMPONENT-030: should show delete button for non-system roles when authorized", () => {
    // GIVEN: AdminRoleList with non-system role and Super Admin authorization
    // WHEN: Component is rendered
    renderWithProviders(
      <AdminRoleList
        isAuthorized={true}
        userPermissions={["ADMIN_SYSTEM_CONFIG"]}
      />,
    );

    // THEN: Delete button should be visible
    const deleteButton = screen.getByTestId("delete-role-role-1");
    expect(deleteButton).toBeInTheDocument();
  });

  it("[P0] 2.93-COMPONENT-031: should disable delete button for system roles", () => {
    // GIVEN: AdminRoleList with system role and Super Admin authorization
    vi.mocked(adminRolesApi.useAdminRoles).mockReturnValue({
      data: [
        {
          ...mockRoles[0],
          is_system_role: true,
          code: "SYSTEM_ADMIN",
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);
    vi.mocked(adminRolesApi.canDeleteRole).mockReturnValue({
      canDelete: false,
      reason: "System roles cannot be deleted",
    });

    // WHEN: Component is rendered with Super Admin authorization
    renderWithProviders(
      <AdminRoleList
        isAuthorized={true}
        userPermissions={["ADMIN_SYSTEM_CONFIG"]}
      />,
    );

    // THEN: Delete button should be disabled for system role
    const deleteButton = screen.getByTestId("delete-role-role-1");
    expect(deleteButton).toBeDisabled();
  });

  it("[P1] 2.93-COMPONENT-032: should show edit button for all roles when authorized", () => {
    // GIVEN: AdminRoleList with roles and Super Admin authorization
    // WHEN: Component is rendered
    renderWithProviders(
      <AdminRoleList
        isAuthorized={true}
        userPermissions={["ADMIN_SYSTEM_CONFIG"]}
      />,
    );

    // THEN: Edit button should be visible
    const editButton = screen.getByTestId("edit-role-role-1");
    expect(editButton).toBeInTheDocument();
  });
});

describe("2.93-COMPONENT: AdminRoleList - Stats Display", () => {
  const mockRoles = [
    {
      role_id: "role-1",
      code: "SYSTEM_ADMIN",
      scope: "SYSTEM",
      description: "System administrator",
      is_system_role: true,
      deleted_at: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      created_by: null,
      deleted_by: null,
      permissions: [],
      user_count: 5,
      company_count: 0,
    },
    {
      role_id: "role-2",
      code: "STORE_MANAGER",
      scope: "STORE",
      description: "Manager",
      is_system_role: false,
      deleted_at: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      created_by: "user-1",
      deleted_by: null,
      permissions: [],
      user_count: 10,
      company_count: 3,
    },
    {
      role_id: "role-3",
      code: "COMPANY_ADMIN",
      scope: "COMPANY",
      description: "Company admin",
      is_system_role: false,
      deleted_at: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      created_by: "user-1",
      deleted_by: null,
      permissions: [],
      user_count: 2,
      company_count: 5,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminRolesApi.useAdminRoles).mockReturnValue({
      data: mockRoles,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);
  });

  it("[P2] 2.93-COMPONENT-040: should display role count stats by scope", () => {
    // GIVEN: AdminRoleList with roles of different scopes and Super Admin authorization
    // WHEN: Component is rendered
    renderWithProviders(
      <AdminRoleList
        isAuthorized={true}
        userPermissions={["ADMIN_SYSTEM_CONFIG"]}
      />,
    );

    // THEN: Stats should show count by scope (at the bottom of the list)
    // The component displays stats like "Total: X roles", "System: X", "Company: X", "Store: X"
    const listContainer = screen.getByTestId("admin-roles-list");
    expect(listContainer.textContent).toContain("System");
    expect(listContainer.textContent).toContain("Store");
    expect(listContainer.textContent).toContain("Company");
    expect(listContainer.textContent).toContain("Total");
  });
});
