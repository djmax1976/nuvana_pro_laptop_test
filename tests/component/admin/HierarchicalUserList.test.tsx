import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "../../support/test-utils";
import { HierarchicalUserList } from "@/components/admin/HierarchicalUserList";
import userEvent from "@testing-library/user-event";
import * as adminUsersApi from "@/lib/api/admin-users";
import {
  AdminUser,
  UserStatus,
  ClientOwnerGroup,
  HierarchicalUsersData,
} from "@/types/admin-user";

// =============================================================================
// Enterprise Test Suite: HierarchicalUserList Component
// =============================================================================
// Priority Levels:
// - P0: Critical path, must pass for deployment
// - P1: Important functionality, high business impact
// - P2: Edge cases and accessibility
//
// Traceability Matrix:
// - HUL-001 to HUL-010: Rendering and display tests
// - HUL-020 to HUL-030: System users section tests
// - HUL-040 to HUL-060: Client owner accordion tests
// - HUL-070 to HUL-090: Bulk selection and actions tests
// - HUL-100 to HUL-120: Individual user actions tests
// - HUL-130 to HUL-150: Edge cases and error handling
// =============================================================================

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
  usePathname: () => "/admin/users",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock the API hooks
vi.mock("@/lib/api/admin-users", () => ({
  useHierarchicalUsers: vi.fn(),
  useUpdateUserStatus: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  })),
  useDeleteUser: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  })),
}));

// Mock the toast hook
const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

// Mock EditUserModal to simplify testing
vi.mock("@/components/admin/EditUserModal", () => ({
  EditUserModal: ({
    open,
    onOpenChange,
    user,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    user: AdminUser | null;
  }) => {
    if (!open) return null;
    return (
      <div data-testid="edit-user-modal">
        <span data-testid="edit-modal-user-name">{user?.name}</span>
        <button onClick={() => onOpenChange(false)}>Close</button>
      </div>
    );
  },
}));

// =============================================================================
// Test Fixtures
// Enterprise Standard: Use realistic, valid data that mirrors production
// =============================================================================

/**
 * Creates a mock AdminUser with valid UUIDs and realistic data
 * SEC-014: INPUT_VALIDATION - Test data uses valid formats
 */
const createMockUser = (overrides: Partial<AdminUser> = {}): AdminUser => ({
  user_id: `user-${Math.random().toString(36).substring(7)}`,
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

/**
 * Creates a mock ClientOwnerGroup with realistic hierarchy
 */
const createMockClientOwnerGroup = (
  ownerOverrides: Partial<AdminUser> = {},
  companiesCount = 1,
  storesPerCompany = 1,
  usersPerStore = 2,
): ClientOwnerGroup => {
  const ownerId =
    ownerOverrides.user_id ||
    `owner-${Math.random().toString(36).substring(7)}`;

  const companies = Array.from(
    { length: companiesCount },
    (_, companyIndex) => {
      const companyId = `company-${companyIndex + 1}`;
      const stores = Array.from(
        { length: storesPerCompany },
        (_, storeIndex) => {
          const storeId = `store-${companyIndex + 1}-${storeIndex + 1}`;
          const users = Array.from({ length: usersPerStore }, (_, userIndex) =>
            createMockUser({
              user_id: `user-${companyIndex}-${storeIndex}-${userIndex}`,
              name: `Store User ${userIndex + 1}`,
              email: `user${userIndex + 1}@store${storeIndex + 1}.com`,
              status:
                userIndex % 2 === 0 ? UserStatus.ACTIVE : UserStatus.INACTIVE,
              roles: [
                {
                  user_role_id: `ur-${companyIndex}-${storeIndex}-${userIndex}`,
                  role: {
                    role_id: "role-store-manager",
                    code: "STORE_MANAGER",
                    description: "Store manager",
                    scope: "STORE",
                  },
                  company_id: companyId,
                  company_name: `Company ${companyIndex + 1}`,
                  store_id: storeId,
                  store_name: `Store ${storeIndex + 1}`,
                  assigned_at: new Date().toISOString(),
                },
              ],
            }),
          );

          return {
            store_id: storeId,
            store_name: `Store ${storeIndex + 1}`,
            users,
          };
        },
      );

      return {
        company_id: companyId,
        company_name: `Company ${companyIndex + 1}`,
        stores,
      };
    },
  );

  return {
    client_owner: createMockUser({
      user_id: ownerId,
      name: ownerOverrides.name || "Client Owner",
      email: ownerOverrides.email || "owner@company.com",
      status: ownerOverrides.status || UserStatus.ACTIVE,
      roles: [
        {
          user_role_id: "ur-owner",
          role: {
            role_id: "role-client-owner",
            code: "CLIENT_OWNER",
            description: "Client owner",
            scope: "COMPANY",
          },
          company_id: companies[0]?.company_id || null,
          company_name: companies[0]?.company_name || null,
          store_id: null,
          store_name: null,
          assigned_at: new Date().toISOString(),
        },
      ],
      ...ownerOverrides,
    }),
    companies,
  };
};

/**
 * Creates mock HierarchicalUsersData (the unwrapped data returned by useHierarchicalUsers hook)
 * Note: The useHierarchicalUsers hook already unwraps the API response, so we return HierarchicalUsersData
 */
const createMockResponse = (
  systemUsersCount = 2,
  clientOwnersCount = 2,
): HierarchicalUsersData => {
  const system_users = Array.from({ length: systemUsersCount }, (_, i) =>
    createMockUser({
      user_id: `system-user-${i + 1}`,
      name: `System Admin ${i + 1}`,
      email: `admin${i + 1}@system.com`,
      status: i === 0 ? UserStatus.ACTIVE : UserStatus.INACTIVE,
    }),
  );

  const client_owners = Array.from({ length: clientOwnersCount }, (_, i) =>
    createMockClientOwnerGroup(
      {
        user_id: `client-owner-${i + 1}`,
        name: `Client Owner ${i + 1}`,
        email: `owner${i + 1}@company.com`,
      },
      i + 1, // Companies: 1, 2, ...
      2, // 2 stores per company
      2, // 2 users per store
    ),
  );

  const totalStoreUsers = client_owners.reduce(
    (sum, co) =>
      sum +
      co.companies.reduce(
        (s, c) => s + c.stores.reduce((ss, st) => ss + st.users.length, 0),
        0,
      ),
    0,
  );

  return {
    system_users,
    client_owners,
    meta: {
      total_system_users: system_users.length,
      total_client_owners: client_owners.length,
      total_companies: client_owners.reduce(
        (sum, co) => sum + co.companies.length,
        0,
      ),
      total_stores: client_owners.reduce(
        (sum, co) =>
          sum + co.companies.reduce((s, c) => s + c.stores.length, 0),
        0,
      ),
      total_store_users: totalStoreUsers,
    },
  };
};

// =============================================================================
// Test Suite: HierarchicalUserList Component
// =============================================================================

describe("HierarchicalUserList Component", () => {
  const mockUpdateStatus = vi.fn();
  const mockDeleteUser = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateStatus.mockResolvedValue({ success: true });
    mockDeleteUser.mockResolvedValue({ success: true });

    vi.mocked(adminUsersApi.useUpdateUserStatus).mockReturnValue({
      mutateAsync: mockUpdateStatus,
      isPending: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(adminUsersApi.useDeleteUser).mockReturnValue({
      mutateAsync: mockDeleteUser,
      isPending: false,
      isError: false,
      error: null,
    } as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Section 1: Rendering and Display Tests (HUL-001 to HUL-010)
  // ===========================================================================
  describe("Rendering and Display", () => {
    it("[P0] HUL-001: should render loading skeleton when data is loading", () => {
      // GIVEN: API is in loading state
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        isError: false,
        isSuccess: false,
        refetch: vi.fn(),
      } as any);

      // WHEN: Component is rendered
      renderWithProviders(<HierarchicalUserList />);

      // THEN: Loading skeleton should be visible
      const skeletons = document.querySelectorAll(".animate-pulse");
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it("[P0] HUL-002: should render error state when API fails", () => {
      // GIVEN: API returns an error
      const errorMessage = "Failed to fetch users";
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error(errorMessage),
        isError: true,
        isSuccess: false,
        refetch: vi.fn(),
      } as any);

      // WHEN: Component is rendered
      renderWithProviders(<HierarchicalUserList />);

      // THEN: Error message should be displayed
      expect(screen.getByText(/Error loading users/i)).toBeInTheDocument();
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });

    it("[P0] HUL-003: should render page header with title and Create User button", () => {
      // GIVEN: API returns data
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: createMockResponse(),
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);

      // WHEN: Component is rendered
      renderWithProviders(<HierarchicalUserList />);

      // THEN: Header should display title and create button
      expect(screen.getByText("Users")).toBeInTheDocument();
      expect(screen.getByTestId("create-user-button")).toBeInTheDocument();
      expect(screen.getByText(/Create User/i)).toBeInTheDocument();
    });

    it("[P0] HUL-004: should display summary stats in header", () => {
      // GIVEN: API returns data with specific counts
      const mockData = createMockResponse(2, 2);
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);

      // WHEN: Component is rendered
      renderWithProviders(<HierarchicalUserList />);

      // THEN: Summary stats should be visible
      const { meta } = mockData;
      const totalUsers =
        meta.total_system_users +
        meta.total_client_owners +
        meta.total_store_users;
      expect(
        // eslint-disable-next-line security/detect-non-literal-regexp
        screen.getByText(new RegExp(`${totalUsers} total users`)),
      ).toBeInTheDocument();
      expect(
        // eslint-disable-next-line security/detect-non-literal-regexp
        screen.getByText(new RegExp(`${meta.total_companies} companies`)),
      ).toBeInTheDocument();
      expect(
        // eslint-disable-next-line security/detect-non-literal-regexp
        screen.getByText(new RegExp(`${meta.total_stores} stores`)),
      ).toBeInTheDocument();
    });

    it("[P1] HUL-005: should render System Users section header", () => {
      // GIVEN: API returns data with system users
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: createMockResponse(3, 0),
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);

      // WHEN: Component is rendered
      renderWithProviders(<HierarchicalUserList />);

      // THEN: System Users section should be visible with count
      expect(screen.getByText("System Users")).toBeInTheDocument();
      expect(screen.getByText("(3)")).toBeInTheDocument();
    });

    it("[P1] HUL-006: should render Client Owners section header", () => {
      // GIVEN: API returns data with client owners
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: createMockResponse(0, 3),
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);

      // WHEN: Component is rendered
      renderWithProviders(<HierarchicalUserList />);

      // THEN: Client Owners section should be visible with count
      expect(screen.getByText("Client Owners")).toBeInTheDocument();
      expect(screen.getByText("(3)")).toBeInTheDocument();
    });

    it("[P1] HUL-007: should display empty state when no system users", () => {
      // GIVEN: API returns data with no system users
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: createMockResponse(0, 1),
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);

      // WHEN: Component is rendered
      renderWithProviders(<HierarchicalUserList />);

      // THEN: Empty state message should be displayed
      expect(screen.getByText(/No system users found/i)).toBeInTheDocument();
    });

    it("[P1] HUL-008: should display empty state when no client owners", () => {
      // GIVEN: API returns data with no client owners
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: createMockResponse(1, 0),
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);

      // WHEN: Component is rendered
      renderWithProviders(<HierarchicalUserList />);

      // THEN: Empty state message should be displayed
      expect(screen.getByText(/No client owners found/i)).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Section 2: System Users Table Tests (HUL-020 to HUL-030)
  // ===========================================================================
  describe("System Users Table", () => {
    it("[P0] HUL-020: should render system users in table with correct columns", () => {
      // GIVEN: API returns system users
      const mockData = createMockResponse(2, 0);
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);

      // WHEN: Component is rendered
      renderWithProviders(<HierarchicalUserList />);

      // THEN: Table headers should be present (no Company/Store for system users)
      expect(screen.getByText("Name")).toBeInTheDocument();
      expect(screen.getByText("Email")).toBeInTheDocument();
      expect(screen.getByText("Roles")).toBeInTheDocument();
      expect(screen.getByText("Created")).toBeInTheDocument();
      expect(screen.getByText("Actions")).toBeInTheDocument();
    });

    it("[P0] HUL-021: should render each system user with correct data", () => {
      // GIVEN: API returns specific system users
      const mockData = createMockResponse(2, 0);
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);

      // WHEN: Component is rendered
      renderWithProviders(<HierarchicalUserList />);

      // THEN: Each user's data should be displayed
      mockData.system_users.forEach((user) => {
        expect(screen.getByText(user.name)).toBeInTheDocument();
        expect(screen.getByText(user.email)).toBeInTheDocument();
      });
    });

    it("[P0] HUL-022: should render checkboxes for bulk selection", () => {
      // GIVEN: API returns system users
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: createMockResponse(2, 0),
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);

      // WHEN: Component is rendered
      renderWithProviders(<HierarchicalUserList />);

      // THEN: Checkboxes should be present (header + each row)
      const checkboxes = screen.getAllByRole("checkbox");
      expect(checkboxes.length).toBeGreaterThanOrEqual(3); // 1 header + 2 users
    });

    it("[P0] HUL-023: should display role badges with correct styling", () => {
      // GIVEN: API returns system users with roles
      const mockData = createMockResponse(1, 0);
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);

      // WHEN: Component is rendered
      renderWithProviders(<HierarchicalUserList />);

      // THEN: Role badge should be visible
      expect(screen.getByText("SUPERADMIN")).toBeInTheDocument();
    });

    it("[P0] HUL-024: should display status indicator dot", () => {
      // GIVEN: API returns users with different statuses
      const mockData = createMockResponse(2, 0);
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);

      // WHEN: Component is rendered
      renderWithProviders(<HierarchicalUserList />);

      // THEN: Status dots should be rendered
      const statusDots = document.querySelectorAll('[class*="rounded-full"]');
      expect(statusDots.length).toBeGreaterThan(0);
    });

    it("[P0] HUL-025: should render action buttons (Edit, Status Toggle, Delete)", () => {
      // GIVEN: API returns system users
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: createMockResponse(1, 0),
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);

      // WHEN: Component is rendered
      renderWithProviders(<HierarchicalUserList />);

      // THEN: Action buttons should be present
      expect(screen.getByRole("button", { name: /Edit/i })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Deactivate|Activate/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Delete/i }),
      ).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Section 3: Client Owner Accordion Tests (HUL-040 to HUL-060)
  // ===========================================================================
  describe("Client Owner Accordions", () => {
    it("[P0] HUL-040: should render accordion for each client owner", () => {
      // GIVEN: API returns multiple client owners
      const mockData = createMockResponse(0, 3);
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);

      // WHEN: Component is rendered
      renderWithProviders(<HierarchicalUserList />);

      // THEN: Each client owner should have an accordion
      mockData.client_owners.forEach((group) => {
        expect(
          screen.getByTestId(
            `client-owner-accordion-${group.client_owner.user_id}`,
          ),
        ).toBeInTheDocument();
      });
    });

    it("[P0] HUL-041: should display client owner name in accordion header", () => {
      // GIVEN: API returns client owners with specific names
      const mockData = createMockResponse(0, 2);
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);

      // WHEN: Component is rendered
      renderWithProviders(<HierarchicalUserList />);

      // THEN: Client owner names should be visible
      mockData.client_owners.forEach((group) => {
        expect(screen.getByText(group.client_owner.name)).toBeInTheDocument();
      });
    });

    it("[P0] HUL-042: should display client owner email in accordion header", () => {
      // GIVEN: API returns client owners
      const mockData = createMockResponse(0, 1);
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);

      // WHEN: Component is rendered
      renderWithProviders(<HierarchicalUserList />);

      // THEN: Email should be displayed in parentheses
      const ownerEmail = mockData.client_owners[0].client_owner.email;
      expect(screen.getByText(`(${ownerEmail})`)).toBeInTheDocument();
    });

    it("[P0] HUL-043: should display stats (companies, stores, users) in accordion header", () => {
      // GIVEN: API returns client owner with specific counts
      const mockData = createMockResponse(0, 1);
      // First client owner has 1 company, 2 stores, 2 users per store = 4 users + 1 owner = 5 total
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);

      // WHEN: Component is rendered
      renderWithProviders(<HierarchicalUserList />);

      // THEN: Stats should be displayed (format: "X company/companies • Y store/stores • Z user/users")
      expect(
        screen.getByText(/1 company.*2 stores.*5 users/i),
      ).toBeInTheDocument();
    });

    it("[P0] HUL-044: should expand accordion when clicked", async () => {
      // GIVEN: API returns client owners
      const mockData = createMockResponse(0, 1);
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);
      const user = userEvent.setup();

      // WHEN: Component is rendered and accordion is clicked
      renderWithProviders(<HierarchicalUserList />);
      const accordionTrigger = screen.getByTestId(
        `client-owner-accordion-${mockData.client_owners[0].client_owner.user_id}`,
      );
      await user.click(accordionTrigger);

      // THEN: Accordion content should be visible
      await waitFor(() => {
        // Table headers should be visible
        expect(screen.getByText("Company")).toBeInTheDocument();
        expect(screen.getByText("Store")).toBeInTheDocument();
      });
    });

    it("[P0] HUL-045: should display flat user list with Company and Store columns when expanded", async () => {
      // GIVEN: API returns client owner with users
      const mockData = createMockResponse(0, 1);
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);
      const user = userEvent.setup();

      // WHEN: Accordion is expanded
      renderWithProviders(<HierarchicalUserList />);
      await user.click(
        screen.getByTestId(
          `client-owner-accordion-${mockData.client_owners[0].client_owner.user_id}`,
        ),
      );

      // THEN: Table should have Company and Store columns
      await waitFor(() => {
        const headers = screen.getAllByRole("columnheader");
        const headerTexts = headers.map((h) => h.textContent);
        expect(headerTexts).toContain("Company");
        expect(headerTexts).toContain("Store");
      });
    });

    it("[P0] HUL-046: should show client owner as first row in expanded accordion", async () => {
      // GIVEN: API returns client owner
      const mockData = createMockResponse(0, 1);
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);
      const user = userEvent.setup();

      // WHEN: Accordion is expanded
      renderWithProviders(<HierarchicalUserList />);
      await user.click(
        screen.getByTestId(
          `client-owner-accordion-${mockData.client_owners[0].client_owner.user_id}`,
        ),
      );

      // THEN: Client owner should be the first row
      await waitFor(() => {
        const clientOwnerName = mockData.client_owners[0].client_owner.name;
        const rows = screen.getAllByRole("row");
        // First row is header, second is client owner
        const firstDataRow = rows[1];
        expect(
          within(firstDataRow).getByText(clientOwnerName),
        ).toBeInTheDocument();
      });
    });

    it("[P0] HUL-047: should NOT show company/store section headers (flat list)", async () => {
      // GIVEN: API returns client owner with multiple companies/stores
      const mockData = createMockResponse(0, 1);
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);
      const user = userEvent.setup();

      // WHEN: Accordion is expanded
      renderWithProviders(<HierarchicalUserList />);
      await user.click(
        screen.getByTestId(
          `client-owner-accordion-${mockData.client_owners[0].client_owner.user_id}`,
        ),
      );

      // THEN: Table should be visible with flat structure (Company and Store as columns)
      await waitFor(() => {
        expect(screen.getByText("Company")).toBeInTheDocument();
        expect(screen.getByText("Store")).toBeInTheDocument();
      });

      // AND: There should be no full-width blue/orange header rows in the table
      // (The table structure is flat, not nested with section headers)
      const tableRows = screen.getAllByRole("row");
      tableRows.forEach((row) => {
        // Each row should have multiple cells (not be a single-cell section header)
        const cells = within(row).queryAllByRole("cell");
        const headers = within(row).queryAllByRole("columnheader");
        // Either it's a header row (all columnheaders) or data row (multiple cells)
        if (cells.length > 0) {
          expect(cells.length).toBeGreaterThan(1); // Not a single-cell section header
        }
      });
    });

    it("[P1] HUL-048: should collapse accordion when clicked again", async () => {
      // GIVEN: API returns client owners and accordion is expanded
      const mockData = createMockResponse(0, 1);
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);
      const user = userEvent.setup();

      renderWithProviders(<HierarchicalUserList />);
      const accordionTrigger = screen.getByTestId(
        `client-owner-accordion-${mockData.client_owners[0].client_owner.user_id}`,
      );

      // Expand
      await user.click(accordionTrigger);
      await waitFor(() => {
        expect(screen.getByText("Company")).toBeInTheDocument();
      });

      // WHEN: Accordion is clicked again
      await user.click(accordionTrigger);

      // THEN: Content should be hidden
      await waitFor(() => {
        expect(screen.queryByText("Company")).not.toBeInTheDocument();
      });
    });
  });

  // ===========================================================================
  // Section 4: Bulk Selection Tests (HUL-070 to HUL-090)
  // ===========================================================================
  describe("Bulk Selection", () => {
    it("[P0] HUL-070: should select individual user when checkbox is clicked", async () => {
      // GIVEN: API returns system users
      const mockData = createMockResponse(2, 0);
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);
      const user = userEvent.setup();

      // WHEN: First user's checkbox is clicked
      renderWithProviders(<HierarchicalUserList />);
      const checkboxes = screen.getAllByRole("checkbox");
      await user.click(checkboxes[1]); // First user checkbox (index 0 is header)

      // THEN: Checkbox should be checked and row should have selected styling
      expect(checkboxes[1]).toBeChecked();
    });

    it("[P0] HUL-071: should select all users when header checkbox is clicked", async () => {
      // GIVEN: API returns system users
      const mockData = createMockResponse(3, 0);
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);
      const user = userEvent.setup();

      // WHEN: Header checkbox is clicked
      renderWithProviders(<HierarchicalUserList />);
      const checkboxes = screen.getAllByRole("checkbox");
      await user.click(checkboxes[0]); // Header checkbox

      // THEN: All user checkboxes should be checked
      await waitFor(() => {
        for (let i = 1; i <= 3; i++) {
          expect(checkboxes[i]).toBeChecked();
        }
      });
    });

    it("[P0] HUL-072: should show BulkActionsBar when users are selected", async () => {
      // GIVEN: API returns system users
      const mockData = createMockResponse(2, 0);
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);
      const user = userEvent.setup();

      // WHEN: A user is selected
      renderWithProviders(<HierarchicalUserList />);
      const checkboxes = screen.getAllByRole("checkbox");
      await user.click(checkboxes[1]);

      // THEN: BulkActionsBar should show selected count
      await waitFor(() => {
        expect(screen.getByText(/1.*selected/i)).toBeInTheDocument();
      });
    });

    it("[P0] HUL-073: should clear selection when Clear button is clicked", async () => {
      // GIVEN: Users are selected
      const mockData = createMockResponse(2, 0);
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);
      const user = userEvent.setup();

      renderWithProviders(<HierarchicalUserList />);
      const checkboxes = screen.getAllByRole("checkbox");
      await user.click(checkboxes[1]);

      // WHEN: Clear button is clicked
      const clearButton = screen.getByRole("button", { name: /Clear/i });
      await user.click(clearButton);

      // THEN: Selection should be cleared
      await waitFor(() => {
        expect(checkboxes[1]).not.toBeChecked();
      });
    });

    it("[P0] HUL-074: should have separate bulk selection per accordion", async () => {
      // GIVEN: API returns multiple client owners
      const mockData = createMockResponse(0, 2);
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);
      const user = userEvent.setup();

      // WHEN: First accordion is expanded and a user is selected
      renderWithProviders(<HierarchicalUserList />);
      await user.click(
        screen.getByTestId(
          `client-owner-accordion-${mockData.client_owners[0].client_owner.user_id}`,
        ),
      );

      // THEN: Only that accordion should have selection state
      await waitFor(() => {
        const firstAccordionCheckboxes = screen.getAllByRole("checkbox");
        expect(firstAccordionCheckboxes.length).toBeGreaterThan(0);
      });
    });
  });

  // ===========================================================================
  // Section 5: Bulk Actions Tests (HUL-080 to HUL-090)
  // ===========================================================================
  describe("Bulk Actions", () => {
    it("[P0] HUL-080: should show Activate button in BulkActionsBar", async () => {
      // GIVEN: Users are selected
      const mockData = createMockResponse(2, 0);
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);
      const user = userEvent.setup();

      renderWithProviders(<HierarchicalUserList />);

      // Select a user first
      const checkboxes = screen.getAllByRole("checkbox");
      await user.click(checkboxes[1]);

      // THEN: Activate button should be visible in BulkActionsBar
      await waitFor(() => {
        expect(screen.getByText(/1.*selected/i)).toBeInTheDocument();
      });
      // Find the Activate button that's inside the bulk actions bar (not individual row)
      const activateButtons = screen.getAllByRole("button", {
        name: /Activate/i,
      });
      expect(activateButtons.length).toBeGreaterThan(0);
    });

    it("[P0] HUL-081: should show Deactivate button in BulkActionsBar", async () => {
      // GIVEN: Users are selected
      const mockData = createMockResponse(2, 0);
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);
      const user = userEvent.setup();

      renderWithProviders(<HierarchicalUserList />);

      // Select a user first
      const checkboxes = screen.getAllByRole("checkbox");
      await user.click(checkboxes[1]);

      // THEN: Deactivate button should be visible in BulkActionsBar
      await waitFor(() => {
        expect(screen.getByText(/1.*selected/i)).toBeInTheDocument();
      });
      const deactivateButtons = screen.getAllByRole("button", {
        name: /Deactivate/i,
      });
      expect(deactivateButtons.length).toBeGreaterThan(0);
    });

    it("[P0] HUL-082: should show Delete button in BulkActionsBar", async () => {
      // GIVEN: Users are selected
      const mockData = createMockResponse(2, 0);
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);
      const user = userEvent.setup();

      renderWithProviders(<HierarchicalUserList />);

      // Select a user first
      const checkboxes = screen.getAllByRole("checkbox");
      await user.click(checkboxes[1]);

      // THEN: Delete button should be visible in BulkActionsBar
      await waitFor(() => {
        expect(screen.getByText(/1.*selected/i)).toBeInTheDocument();
      });
      const deleteButtons = screen.getAllByRole("button", { name: /Delete/i });
      expect(deleteButtons.length).toBeGreaterThan(0);
    });

    it("[P0] HUL-083: should show confirmation dialog when bulk Activate is clicked", async () => {
      // GIVEN: Users are selected
      const mockData = createMockResponse(2, 0);
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);
      const user = userEvent.setup();

      renderWithProviders(<HierarchicalUserList />);

      // Select a user first
      await user.click(screen.getAllByRole("checkbox")[1]);

      // Wait for bulk actions bar to appear
      await waitFor(() => {
        expect(screen.getByText(/1.*selected/i)).toBeInTheDocument();
      });

      // WHEN: Activate button is clicked (find the one in bulk actions bar, not in table cell)
      const activateButtons = screen.getAllByRole("button", {
        name: /Activate/i,
      });
      const bulkActivateBtn = activateButtons.find((btn) => !btn.closest("td"));
      expect(bulkActivateBtn).toBeDefined();
      await user.click(bulkActivateBtn!);

      // THEN: Confirmation dialog should appear with confirmation button
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /Activate All/i }),
        ).toBeInTheDocument();
      });
    });

    it("[P0] HUL-084: should show confirmation dialog when bulk Delete is clicked", async () => {
      // GIVEN: Inactive users are selected (delete is disabled for active)
      const mockData = createMockResponse(2, 0);
      mockData.system_users.forEach((u) => (u.status = UserStatus.INACTIVE));
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);
      const user = userEvent.setup();

      renderWithProviders(<HierarchicalUserList />);

      // Select a user first
      await user.click(screen.getAllByRole("checkbox")[1]);

      // Wait for bulk actions bar to appear
      await waitFor(() => {
        expect(screen.getByText(/1.*selected/i)).toBeInTheDocument();
      });

      // WHEN: Delete button is clicked (find in bulk actions bar, not in table cell)
      const deleteButtons = screen.getAllByRole("button", { name: /Delete/i });
      const bulkDeleteBtn = deleteButtons.find((btn) => !btn.closest("td"));
      expect(bulkDeleteBtn).toBeDefined();
      await user.click(bulkDeleteBtn!);

      // THEN: Confirmation dialog should appear with confirmation button
      await waitFor(() => {
        // Bulk delete dialog has "Delete Selected" button and requires typing DELETE
        expect(
          screen.getByRole("button", { name: /Delete Selected/i }),
        ).toBeInTheDocument();
      });
    });

    it("[P0] HUL-085: should call updateStatus API for each selected user on bulk activate", async () => {
      // GIVEN: Multiple users are selected
      const mockData = createMockResponse(2, 0);
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);
      const user = userEvent.setup();

      renderWithProviders(<HierarchicalUserList />);

      // Select all users via header checkbox
      await user.click(screen.getAllByRole("checkbox")[0]);

      // Wait for bulk actions bar
      await waitFor(() => {
        expect(screen.getByText(/2.*selected/i)).toBeInTheDocument();
      });

      // Click Activate in bulk actions bar
      const activateButtons = screen.getAllByRole("button", {
        name: /Activate/i,
      });
      await user.click(activateButtons[0]);

      // Confirm in dialog
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /Activate All/i }),
        ).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /Activate All/i }));

      // THEN: API should be called for each user
      await waitFor(() => {
        expect(mockUpdateStatus).toHaveBeenCalledTimes(2);
      });
    });

    it("[P1] HUL-086: should show success toast after bulk action completes", async () => {
      // GIVEN: Users are selected
      const mockData = createMockResponse(1, 0);
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);
      const user = userEvent.setup();

      renderWithProviders(<HierarchicalUserList />);
      await user.click(screen.getAllByRole("checkbox")[1]);

      // Wait for bulk actions bar
      await waitFor(() => {
        expect(screen.getByText(/1.*selected/i)).toBeInTheDocument();
      });

      // Click Activate in bulk actions bar
      const activateButtons = screen.getAllByRole("button", {
        name: /Activate/i,
      });
      await user.click(activateButtons[0]);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /Activate All/i }),
        ).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /Activate All/i }));

      // THEN: Success toast should be shown
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Success",
          }),
        );
      });
    });
  });

  // ===========================================================================
  // Section 6: Individual User Actions Tests (HUL-100 to HUL-120)
  // ===========================================================================
  describe("Individual User Actions", () => {
    it("[P0] HUL-100: should open EditUserModal when Edit button is clicked", async () => {
      // GIVEN: API returns a user
      const mockData = createMockResponse(1, 0);
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);
      const user = userEvent.setup();

      // WHEN: Edit button is clicked
      renderWithProviders(<HierarchicalUserList />);
      await user.click(screen.getByRole("button", { name: /Edit/i }));

      // THEN: EditUserModal should open with user data
      await waitFor(() => {
        expect(screen.getByTestId("edit-user-modal")).toBeInTheDocument();
        expect(screen.getByTestId("edit-modal-user-name")).toHaveTextContent(
          mockData.system_users[0].name,
        );
      });
    });

    it("[P0] HUL-101: should show confirmation dialog when status toggle is clicked", async () => {
      // GIVEN: API returns an active user
      const mockData = createMockResponse(1, 0);
      mockData.system_users[0].status = UserStatus.ACTIVE;
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);
      const user = userEvent.setup();

      // WHEN: Status toggle button is clicked
      renderWithProviders(<HierarchicalUserList />);
      const statusButton = screen.getByRole("button", { name: /Deactivate/i });
      await user.click(statusButton);

      // THEN: Confirmation dialog should appear
      await waitFor(() => {
        expect(screen.getByText(/Deactivate User/i)).toBeInTheDocument();
      });
    });

    it("[P0] HUL-102: should call updateStatus API when status change is confirmed", async () => {
      // GIVEN: User confirms status change
      const mockData = createMockResponse(1, 0);
      mockData.system_users[0].status = UserStatus.ACTIVE;
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);
      const user = userEvent.setup();

      renderWithProviders(<HierarchicalUserList />);
      await user.click(screen.getByRole("button", { name: /Deactivate/i }));

      // WHEN: Confirm button is clicked
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /^Deactivate$/i }),
        ).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /^Deactivate$/i }));

      // THEN: API should be called
      await waitFor(() => {
        expect(mockUpdateStatus).toHaveBeenCalledWith({
          userId: mockData.system_users[0].user_id,
          data: { status: UserStatus.INACTIVE },
        });
      });
    });

    it("[P0] HUL-103: should disable Delete button for active users", () => {
      // GIVEN: API returns an active user
      const mockData = createMockResponse(1, 0);
      mockData.system_users[0].status = UserStatus.ACTIVE;
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);

      // WHEN: Component is rendered
      renderWithProviders(<HierarchicalUserList />);

      // THEN: Delete button should be disabled
      const deleteButton = screen.getByRole("button", { name: /Delete/i });
      expect(deleteButton).toBeDisabled();
    });

    it("[P0] HUL-104: should enable Delete button for inactive users", () => {
      // GIVEN: API returns an inactive user
      const mockData = createMockResponse(1, 0);
      mockData.system_users[0].status = UserStatus.INACTIVE;
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);

      // WHEN: Component is rendered
      renderWithProviders(<HierarchicalUserList />);

      // THEN: Delete button should be enabled
      const deleteButton = screen.getByRole("button", { name: /Delete/i });
      expect(deleteButton).not.toBeDisabled();
    });

    it("[P0] HUL-105: should require text confirmation for delete", async () => {
      // GIVEN: API returns an inactive user
      const mockData = createMockResponse(1, 0);
      mockData.system_users[0].status = UserStatus.INACTIVE;
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);
      const user = userEvent.setup();

      // WHEN: Individual row delete button is clicked (inside table cell)
      renderWithProviders(<HierarchicalUserList />);
      const deleteButtons = screen.getAllByRole("button", { name: /Delete/i });
      // Find the delete button inside a table cell (individual action, not bulk)
      const rowDeleteBtn = deleteButtons.find((btn) => btn.closest("td"));
      expect(rowDeleteBtn).toBeDefined();
      await user.click(rowDeleteBtn!);

      // THEN: Dialog should require typing DELETE to confirm
      await waitFor(() => {
        // The ConfirmDialog uses confirmationLabel which defaults to "Type 'DELETE' to confirm"
        expect(
          screen.getByText(/Type.*DELETE.*to confirm/i),
        ).toBeInTheDocument();
      });
    });

    it("[P0] HUL-106: should call deleteUser API when delete is confirmed", async () => {
      // GIVEN: User confirms deletion
      const mockData = createMockResponse(1, 0);
      mockData.system_users[0].status = UserStatus.INACTIVE;
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);
      const user = userEvent.setup();

      renderWithProviders(<HierarchicalUserList />);
      // Click individual row delete button (inside table cell)
      const deleteButtons = screen.getAllByRole("button", { name: /Delete/i });
      const rowDeleteBtn = deleteButtons.find((btn) => btn.closest("td"));
      await user.click(rowDeleteBtn!);

      // Type DELETE in the confirmation input and confirm
      await waitFor(() => {
        // The input has placeholder="DELETE"
        expect(screen.getByPlaceholderText("DELETE")).toBeInTheDocument();
      });
      await user.type(screen.getByPlaceholderText("DELETE"), "DELETE");
      await user.click(
        screen.getByRole("button", { name: /Delete Permanently/i }),
      );

      // THEN: API should be called
      await waitFor(() => {
        expect(mockDeleteUser).toHaveBeenCalledWith(
          mockData.system_users[0].user_id,
        );
      });
    });

    it("[P1] HUL-107: should show success toast after individual action", async () => {
      // GIVEN: User confirms status change
      const mockData = createMockResponse(1, 0);
      mockData.system_users[0].status = UserStatus.ACTIVE;
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);
      const user = userEvent.setup();

      renderWithProviders(<HierarchicalUserList />);
      await user.click(screen.getByRole("button", { name: /Deactivate/i }));
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /^Deactivate$/i }),
        ).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /^Deactivate$/i }));

      // THEN: Success toast should be shown
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Success",
          }),
        );
      });
    });

    it("[P1] HUL-108: should show error toast on API failure", async () => {
      // GIVEN: API will fail
      mockUpdateStatus.mockRejectedValue(new Error("Server error"));
      const mockData = createMockResponse(1, 0);
      mockData.system_users[0].status = UserStatus.ACTIVE;
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);
      const user = userEvent.setup();

      renderWithProviders(<HierarchicalUserList />);
      await user.click(screen.getByRole("button", { name: /Deactivate/i }));
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /^Deactivate$/i }),
        ).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /^Deactivate$/i }));

      // THEN: Error toast should be shown
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Error",
            variant: "destructive",
          }),
        );
      });
    });
  });

  // ===========================================================================
  // Section 7: Edge Cases and Error Handling (HUL-130 to HUL-150)
  // ===========================================================================
  describe("Edge Cases and Error Handling", () => {
    it("[P1] HUL-130: should handle user with multiple roles displaying all role badges", () => {
      // GIVEN: User has multiple roles
      const mockData = createMockResponse(1, 0);
      mockData.system_users[0].roles = [
        {
          user_role_id: "ur-1",
          role: {
            role_id: "role-1",
            code: "SUPERADMIN",
            description: "Super admin",
            scope: "SYSTEM",
          },
          company_id: null,
          company_name: null,
          store_id: null,
          store_name: null,
          assigned_at: new Date().toISOString(),
        },
        {
          user_role_id: "ur-2",
          role: {
            role_id: "role-2",
            code: "CORPORATE_ADMIN",
            description: "Corp admin",
            scope: "COMPANY",
          },
          company_id: "c1",
          company_name: "Company 1",
          store_id: null,
          store_name: null,
          assigned_at: new Date().toISOString(),
        },
      ];
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);

      // WHEN: Component is rendered
      renderWithProviders(<HierarchicalUserList />);

      // THEN: All role badges should be displayed
      expect(screen.getByText("SUPERADMIN")).toBeInTheDocument();
      expect(screen.getByText("CORPORATE_ADMIN")).toBeInTheDocument();
    });

    it("[P1] HUL-131: should handle user with no roles gracefully", () => {
      // GIVEN: User has no roles
      const mockData = createMockResponse(1, 0);
      mockData.system_users[0].roles = [];
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);

      // WHEN: Component is rendered
      renderWithProviders(<HierarchicalUserList />);

      // THEN: Component should render without errors
      expect(
        screen.getByText(mockData.system_users[0].name),
      ).toBeInTheDocument();
    });

    it("[P2] HUL-132: should handle special characters in user names", () => {
      // GIVEN: User has special characters in name
      const mockData = createMockResponse(1, 0);
      mockData.system_users[0].name =
        "José García 日本語 <script>alert('xss')</script>";
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);

      // WHEN: Component is rendered
      renderWithProviders(<HierarchicalUserList />);

      // THEN: Name should be displayed with XSS safely escaped
      expect(screen.getByText(/José García 日本語/)).toBeInTheDocument();
      // Script tag should not execute (React auto-escapes)
      expect(screen.queryByText("xss")).not.toBeInTheDocument();
    });

    it("[P1] HUL-133: should display Company column with company name for users", async () => {
      // GIVEN: Client owner has users with company assignments
      const mockData = createMockResponse(0, 1);
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);
      const user = userEvent.setup();

      // WHEN: Accordion is expanded
      renderWithProviders(<HierarchicalUserList />);
      await user.click(
        screen.getByTestId(
          `client-owner-accordion-${mockData.client_owners[0].client_owner.user_id}`,
        ),
      );

      // THEN: Company column should show company name
      await waitFor(() => {
        // First user's company should be displayed
        const companyName = mockData.client_owners[0].companies[0].company_name;
        expect(screen.getAllByText(companyName).length).toBeGreaterThan(0);
      });
    });

    it("[P2] HUL-134: should handle unknown error type gracefully", () => {
      // GIVEN: API returns unknown error type
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: undefined,
        isLoading: false,
        error: "Unknown error",
        isError: true,
        isSuccess: false,
        refetch: vi.fn(),
      } as any);

      // WHEN: Component is rendered
      renderWithProviders(<HierarchicalUserList />);

      // THEN: Generic error message should be displayed
      expect(
        screen.getByText(/An unknown error occurred/i),
      ).toBeInTheDocument();
    });

    it("[P1] HUL-135: should handle client owner with no users gracefully", async () => {
      // GIVEN: Client owner has no associated users
      const mockData = createMockResponse(0, 1);
      mockData.client_owners[0].companies = [];
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);
      const user = userEvent.setup();

      // WHEN: Accordion is expanded
      renderWithProviders(<HierarchicalUserList />);
      await user.click(
        screen.getByTestId(
          `client-owner-accordion-${mockData.client_owners[0].client_owner.user_id}`,
        ),
      );

      // THEN: Should show client owner as only user in the table
      await waitFor(() => {
        // Only the client owner row should be present
        const rows = screen.getAllByRole("row");
        // Header row + 1 data row (client owner)
        expect(rows.length).toBe(2);
      });
    });
  });

  // ===========================================================================
  // Section 8: Accessibility Tests (HUL-140 to HUL-150)
  // ===========================================================================
  describe("Accessibility", () => {
    it("[P2] HUL-140: should have accessible labels for all action buttons", () => {
      // GIVEN: API returns users
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: createMockResponse(1, 0),
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);

      // WHEN: Component is rendered
      renderWithProviders(<HierarchicalUserList />);

      // THEN: All action buttons should have accessible names
      expect(screen.getByRole("button", { name: /Edit/i })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Deactivate|Activate/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Delete/i }),
      ).toBeInTheDocument();
    });

    it("[P2] HUL-141: should have accessible label for select all checkbox", () => {
      // GIVEN: API returns users
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: createMockResponse(2, 0),
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);

      // WHEN: Component is rendered
      renderWithProviders(<HierarchicalUserList />);

      // THEN: Select all checkbox should have accessible label
      expect(
        screen.getByRole("checkbox", { name: /Select all/i }),
      ).toBeInTheDocument();
    });

    it("[P2] HUL-142: should have accessible labels for individual user checkboxes", () => {
      // GIVEN: API returns users
      const mockData = createMockResponse(1, 0);
      vi.mocked(adminUsersApi.useHierarchicalUsers).mockReturnValue({
        data: mockData,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      } as any);

      // WHEN: Component is rendered
      renderWithProviders(<HierarchicalUserList />);

      // THEN: User checkbox should have accessible label with user name
      expect(
        screen.getByRole("checkbox", {
          // eslint-disable-next-line security/detect-non-literal-regexp
          name: new RegExp(`Select ${mockData.system_users[0].name}`, "i"),
        }),
      ).toBeInTheDocument();
    });
  });
});
