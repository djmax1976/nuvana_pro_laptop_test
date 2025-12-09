import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "../support/test-utils";
import { RoleList } from "@/components/client-roles/RoleList";
import userEvent from "@testing-library/user-event";
import * as clientRolesApi from "@/lib/api/client-roles";

/**
 * @test-level Component
 * @justification UI component tests for RoleList - tests rendering, user interactions, and state management
 * @story 2.92
 * @enhanced-by workflow-9 on 2025-01-28
 *
 * Component Tests: RoleList
 *
 * CRITICAL TEST COVERAGE:
 * - Displays STORE scope roles only
 * - Shows role names, descriptions, and permission badges
 * - Shows "Customized" badge for roles with overrides
 * - Manage Permissions button functionality
 * - Loading and error states
 * - Edge cases: 0 permissions, >8 permissions
 * - Accessibility: keyboard navigation
 *
 * Story: 2.92 - Client Role Permission Management
 */

// Mock the API hooks
vi.mock("@/lib/api/client-roles", () => ({
  useClientRoles: vi.fn(),
}));

// Mock the toast hook
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe("2.92-COMPONENT: RoleList - Display STORE Scope Roles", () => {
  const mockRoles = [
    {
      role_id: "role-1",
      code: "STORE_MANAGER",
      scope: "STORE",
      description: "Manager of a store",
      permissions: [
        {
          permission_id: "perm-1",
          code: "SHIFT_OPEN",
          is_client_override: false,
        },
        {
          permission_id: "perm-2",
          code: "SHIFT_CLOSE",
          is_client_override: false,
        },
      ],
      permission_badges: ["SHIFT_OPEN", "SHIFT_CLOSE"],
    },
    {
      role_id: "role-2",
      code: "SHIFT_MANAGER",
      scope: "STORE",
      description: "Manages shifts",
      permissions: [
        {
          permission_id: "perm-1",
          code: "SHIFT_OPEN",
          is_client_override: true,
        },
      ],
      permission_badges: ["SHIFT_OPEN"],
    },
    {
      role_id: "role-3",
      code: "CASHIER",
      scope: "STORE",
      description: "Handles transactions",
      permissions: [],
      permission_badges: [],
    },
  ];

  const mockOnSelectRole = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clientRolesApi.useClientRoles).mockReturnValue({
      data: mockRoles,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);
  });

  it("[P0] 2.92-COMPONENT-001: should render STORE scope roles with names and descriptions (AC #1)", () => {
    // GIVEN: RoleList component with mock roles
    // WHEN: Component is rendered
    renderWithProviders(<RoleList onSelectRole={mockOnSelectRole} />);

    // THEN: All STORE scope roles should be displayed
    expect(screen.getByText("Store Manager")).toBeInTheDocument();
    expect(screen.getByText("Shift Manager")).toBeInTheDocument();
    expect(screen.getByText("Cashier")).toBeInTheDocument();

    // AND: Descriptions should be visible
    expect(screen.getByText("Manager of a store")).toBeInTheDocument();
    expect(screen.getByText("Manages shifts")).toBeInTheDocument();
    expect(screen.getByText("Handles transactions")).toBeInTheDocument();
  });

  it("[P1] 2.92-COMPONENT-002: should display permission badges for each role (AC #1)", () => {
    // GIVEN: RoleList component with roles that have permissions
    // WHEN: Component is rendered
    renderWithProviders(<RoleList onSelectRole={mockOnSelectRole} />);

    // THEN: Permission badges should be displayed for roles with permissions
    // Store Manager has 2 permissions
    const storeManagerCard = screen.getByTestId("role-card-role-1");
    expect(storeManagerCard).toBeInTheDocument();
    const storeManagerBadges =
      within(storeManagerCard).getAllByTestId(/^permission-badge-/);
    expect(storeManagerBadges).toHaveLength(2);
    expect(storeManagerBadges[0]).toHaveTextContent("SHIFT OPEN");
    expect(storeManagerBadges[1]).toHaveTextContent("SHIFT CLOSE");

    // Shift Manager has 1 permission
    const shiftManagerCard = screen.getByTestId("role-card-role-2");
    expect(shiftManagerCard).toBeInTheDocument();
    const shiftManagerBadges =
      within(shiftManagerCard).getAllByTestId(/^permission-badge-/);
    expect(shiftManagerBadges).toHaveLength(1);
    expect(shiftManagerBadges[0]).toHaveTextContent("SHIFT OPEN");
  });

  it("[P1] 2.92-COMPONENT-003: should display 'Customized' badge for roles with overrides (AC #1)", () => {
    // GIVEN: RoleList component with a role that has overrides
    // WHEN: Component is rendered
    renderWithProviders(<RoleList onSelectRole={mockOnSelectRole} />);

    // THEN: "Customized" badge should appear for role with is_client_override = true on permissions
    const shiftManagerCard = screen.getByTestId("role-card-role-2");
    expect(shiftManagerCard.textContent).toContain("Customized");

    // AND: "Customized" badge should NOT appear for roles without overrides
    const storeManagerCard = screen.getByTestId("role-card-role-1");
    expect(storeManagerCard.textContent).not.toContain("Customized");
  });

  it("[P0] 2.92-COMPONENT-004: should have Manage Permissions button for each role (AC #1)", () => {
    // GIVEN: RoleList component with roles
    // WHEN: Component is rendered
    renderWithProviders(<RoleList onSelectRole={mockOnSelectRole} />);

    // THEN: Each role should have a Manage Permissions button
    const manageButtons = screen.getAllByTestId(/manage-permissions-button-/);
    expect(manageButtons).toHaveLength(3);
  });

  it("[P0] 2.92-COMPONENT-005: should call onSelectRole when Manage Permissions button is clicked", async () => {
    // GIVEN: RoleList component with roles
    const user = userEvent.setup();
    renderWithProviders(<RoleList onSelectRole={mockOnSelectRole} />);

    // WHEN: Manage Permissions button is clicked for first role
    const manageButton = screen.getByTestId("manage-permissions-button-role-1");
    await user.click(manageButton);

    // THEN: onSelectRole should be called with the role ID
    expect(mockOnSelectRole).toHaveBeenCalledWith("role-1");
  });
});

describe("2.92-COMPONENT: RoleList - Loading and Error States", () => {
  const mockOnSelectRole = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[P1] 2.92-COMPONENT-010: should display loading state while fetching roles", () => {
    // GIVEN: API is loading
    vi.mocked(clientRolesApi.useClientRoles).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<RoleList onSelectRole={mockOnSelectRole} />);

    // THEN: Loading skeleton should be visible
    expect(screen.getByTestId("roles-list-loading")).toBeInTheDocument();
  });

  it("[P1] 2.92-COMPONENT-011: should display error state when fetch fails", () => {
    // GIVEN: API returns an error
    vi.mocked(clientRolesApi.useClientRoles).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Failed to fetch roles"),
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<RoleList onSelectRole={mockOnSelectRole} />);

    // THEN: Error state should be visible
    expect(screen.getByTestId("roles-list-error")).toBeInTheDocument();
    expect(screen.getByText(/Error Loading Roles/i)).toBeInTheDocument();
  });

  it("[P2] 2.92-COMPONENT-012: should display retry button on error and allow retry", async () => {
    // GIVEN: API returns an error with refetch function
    const mockRefetch = vi.fn();
    vi.mocked(clientRolesApi.useClientRoles).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Network error"),
      refetch: mockRefetch,
    } as any);

    const user = userEvent.setup();
    renderWithProviders(<RoleList onSelectRole={mockOnSelectRole} />);

    // WHEN: Retry button is clicked
    const retryButton = screen.getByRole("button", { name: /Retry/i });
    await user.click(retryButton);

    // THEN: refetch should be called
    expect(mockRefetch).toHaveBeenCalled();
  });

  it("[P2] 2.92-COMPONENT-013: should display empty state when no roles exist", () => {
    // GIVEN: API returns empty array
    vi.mocked(clientRolesApi.useClientRoles).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<RoleList onSelectRole={mockOnSelectRole} />);

    // THEN: Empty state message should be visible
    expect(screen.getByTestId("roles-list-empty")).toBeInTheDocument();
  });
});

describe("2.92-COMPONENT: RoleList - Edge Cases and Accessibility", () => {
  const mockOnSelectRole = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[P2] 2.92-COMPONENT-014: should display 'No permissions assigned' for role with 0 permissions", () => {
    // GIVEN: Role with no permissions
    vi.mocked(clientRolesApi.useClientRoles).mockReturnValue({
      data: [
        {
          role_id: "role-empty",
          code: "TRAINEE",
          scope: "STORE",
          description: "Trainee role",
          permissions: [],
          permission_badges: [],
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<RoleList onSelectRole={mockOnSelectRole} />);

    // THEN: Should show "No permissions assigned" text
    expect(screen.getByText(/No permissions assigned/i)).toBeInTheDocument();
  });

  it("[P2] 2.92-COMPONENT-015: should show '+N more' badge when role has more than 8 permissions", () => {
    // GIVEN: Role with more than 8 permissions
    const manyPermissions = Array.from(
      { length: 12 },
      (_, i) => `PERMISSION_${i}`,
    );
    vi.mocked(clientRolesApi.useClientRoles).mockReturnValue({
      data: [
        {
          role_id: "role-many",
          code: "SUPER_MANAGER",
          scope: "STORE",
          description: "Has many permissions",
          permissions: manyPermissions.map((code, i) => ({
            permission_id: `perm-${i}`,
            code,
            is_client_override: false,
          })),
          permission_badges: manyPermissions,
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<RoleList onSelectRole={mockOnSelectRole} />);

    // THEN: Should show "+4 more" badge (12 - 8 = 4)
    expect(screen.getByText(/\+4 more/i)).toBeInTheDocument();
  });

  it("[P1] 2.92-COMPONENT-016: should call onSelectRole when clicking on role card", async () => {
    // GIVEN: RoleList with roles
    vi.mocked(clientRolesApi.useClientRoles).mockReturnValue({
      data: [
        {
          role_id: "role-1",
          code: "STORE_MANAGER",
          scope: "STORE",
          description: "Manager",
          permissions: [],
          permission_badges: [],
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    const user = userEvent.setup();
    renderWithProviders(<RoleList onSelectRole={mockOnSelectRole} />);

    // WHEN: Clicking on the role card
    const roleCard = screen.getByTestId("role-card-role-1");
    await user.click(roleCard);

    // THEN: onSelectRole should be called
    expect(mockOnSelectRole).toHaveBeenCalledWith("role-1");
  });

  it("[P1] 2.92-COMPONENT-017: should highlight selected role card", () => {
    // GIVEN: RoleList with a selected role
    vi.mocked(clientRolesApi.useClientRoles).mockReturnValue({
      data: [
        {
          role_id: "role-1",
          code: "STORE_MANAGER",
          scope: "STORE",
          description: "Manager",
          permissions: [],
          permission_badges: [],
        },
        {
          role_id: "role-2",
          code: "CASHIER",
          scope: "STORE",
          description: "Cashier",
          permissions: [],
          permission_badges: [],
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered with selectedRoleId
    renderWithProviders(
      <RoleList onSelectRole={mockOnSelectRole} selectedRoleId="role-1" />,
    );

    // THEN: Selected role card should have ring styling (checking class presence)
    const selectedCard = screen.getByTestId("role-card-role-1");
    expect(selectedCard.className).toContain("ring");
  });

  it("[P2] 2.92-COMPONENT-018: should display error message from API error", () => {
    // GIVEN: API returns error with specific message
    vi.mocked(clientRolesApi.useClientRoles).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Permission denied: CLIENT_ROLE_MANAGE required"),
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<RoleList onSelectRole={mockOnSelectRole} />);

    // THEN: Error message should be displayed
    expect(screen.getByText(/Permission denied/i)).toBeInTheDocument();
  });

  it("[P2] 2.92-COMPONENT-019: should handle role code without friendly name mapping", () => {
    // GIVEN: Role with unmapped code
    vi.mocked(clientRolesApi.useClientRoles).mockReturnValue({
      data: [
        {
          role_id: "role-custom",
          code: "CUSTOM_ROLE_NAME",
          scope: "STORE",
          description: "Custom role",
          permissions: [],
          permission_badges: [],
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(<RoleList onSelectRole={mockOnSelectRole} />);

    // THEN: Should display formatted code (underscores replaced with spaces)
    expect(screen.getByText(/CUSTOM ROLE NAME/i)).toBeInTheDocument();
  });

  it("[P1] 2.92-COMPONENT-020: should call onSelectRole when Enter key is pressed on role card", async () => {
    // GIVEN: RoleList with roles
    vi.mocked(clientRolesApi.useClientRoles).mockReturnValue({
      data: [
        {
          role_id: "role-1",
          code: "STORE_MANAGER",
          scope: "STORE",
          description: "Manager of a store",
          permissions: [
            {
              permission_id: "perm-1",
              code: "SHIFT_OPEN",
              is_client_override: false,
            },
          ],
          permission_badges: ["SHIFT_OPEN"],
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    const user = userEvent.setup();
    renderWithProviders(<RoleList onSelectRole={mockOnSelectRole} />);

    // WHEN: Focusing the role card and pressing Enter
    const roleCard = screen.getByTestId("role-card-role-1");
    roleCard.focus();
    await user.keyboard("{Enter}");

    // THEN: onSelectRole should be called with the role ID
    expect(mockOnSelectRole).toHaveBeenCalledWith("role-1");
  });
});
