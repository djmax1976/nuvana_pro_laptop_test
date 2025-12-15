/**
 * @test-level COMPONENT
 * @justification Tests React component rendering, employee table display, and action buttons
 * @story 6-14-store-settings-page
 * @enhanced-by workflow-9 on 2025-01-28
 */
// tests/component/settings/StoreEmployeesTab.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../../support/test-utils";
import userEvent from "@testing-library/user-event";
import { StoreEmployeesTab } from "@/components/settings/StoreEmployeesTab";
import * as clientEmployeesApi from "@/lib/api/client-employees";

/**
 * StoreEmployeesTab Component Tests
 *
 * Tests the Employees tab component that displays employee table with credential management actions.
 *
 * Component tests are SECOND in pyramid order (20-30% of tests)
 */

// Mock the API hooks
vi.mock("@/lib/api/client-employees", () => ({
  useClientEmployees: vi.fn(),
}));

// Mock modal components
vi.mock("@/components/settings/ChangeEmailModal", () => ({
  ChangeEmailModal: ({ open, onOpenChange }: any) =>
    open ? (
      <div data-testid="change-email-modal">Change Email Modal</div>
    ) : null,
}));

vi.mock("@/components/settings/ResetPasswordModal", () => ({
  ResetPasswordModal: ({ open, onOpenChange }: any) =>
    open ? (
      <div data-testid="reset-password-modal">Reset Password Modal</div>
    ) : null,
}));

describe("StoreEmployeesTab Component", () => {
  const storeId = "store-123";

  const mockEmployees = [
    {
      user_id: "user-1",
      name: "John Doe",
      email: "john@test.nuvana.local",
      role: "STORE_MANAGER",
      status: "ACTIVE",
    },
    {
      user_id: "user-2",
      name: "Jane Smith",
      email: "jane@test.nuvana.local",
      role: "EMPLOYEE",
      status: "ACTIVE",
    },
  ];

  const mockEmployeesData = {
    data: mockEmployees,
  };

  const mockUseClientEmployees = {
    data: mockEmployeesData,
    isLoading: false,
    isError: false,
    error: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clientEmployeesApi.useClientEmployees).mockReturnValue(
      mockUseClientEmployees as any,
    );
  });

  describe("Employee Table Display", () => {
    it("[P1-AC-4] should display employee table with columns (Name, Email, Role, Status)", async () => {
      // GIVEN: I am viewing the Employees tab
      // WHEN: The data loads
      renderWithProviders(<StoreEmployeesTab storeId={storeId} />);

      // THEN: I see a table with employees assigned to this store (Name, Email, Role, Status)
      await waitFor(() => {
        expect(screen.getByTestId("employee-table")).toBeInTheDocument();
        expect(screen.getByText("Name")).toBeInTheDocument();
        expect(screen.getByText("Email")).toBeInTheDocument();
        expect(screen.getByText("Role")).toBeInTheDocument();
        expect(screen.getByText("Status")).toBeInTheDocument();
      });
    });

    it("[P1-AC-4] should display employee data in table rows", async () => {
      // GIVEN: I am viewing the Employees tab
      // WHEN: The data loads
      renderWithProviders(<StoreEmployeesTab storeId={storeId} />);

      // THEN: Employee data is displayed in rows with Name, Email, Role, Status
      await waitFor(() => {
        expect(screen.getByText("John Doe")).toBeInTheDocument();
        expect(screen.getByText("john@test.nuvana.local")).toBeInTheDocument();
        expect(screen.getByText("Jane Smith")).toBeInTheDocument();
        expect(screen.getByText("jane@test.nuvana.local")).toBeInTheDocument();
      });
    });

    it("should display empty state when no employees exist", async () => {
      // GIVEN: StoreEmployeesTab is rendered with no employees
      vi.mocked(clientEmployeesApi.useClientEmployees).mockReturnValue({
        ...mockUseClientEmployees,
        data: { data: [] },
      } as any);

      renderWithProviders(<StoreEmployeesTab storeId={storeId} />);

      // WHEN: Component renders
      // THEN: Empty state is displayed
      await waitFor(() => {
        expect(screen.getByText(/no employees found/i)).toBeInTheDocument();
      });
    });
  });

  describe("Action Buttons", () => {
    it("[P1-AC-4] should display Change Email button for each employee row", async () => {
      // GIVEN: I am viewing the Employees tab
      // WHEN: The data loads
      renderWithProviders(<StoreEmployeesTab storeId={storeId} />);

      // THEN: Each row has "Change Email" action button
      await waitFor(() => {
        const changeEmailButtons = screen.getAllByRole("button", {
          name: /change email/i,
        });
        expect(changeEmailButtons.length).toBeGreaterThan(0);
        // Verify button count matches employee count
        expect(changeEmailButtons.length).toBe(mockEmployees.length);
      });
    });

    it("[P1-AC-4] should display Reset Password button for each employee row", async () => {
      // GIVEN: I am viewing the Employees tab
      // WHEN: The data loads
      renderWithProviders(<StoreEmployeesTab storeId={storeId} />);

      // THEN: Each row has "Reset Password" action button
      await waitFor(() => {
        const resetPasswordButtons = screen.getAllByRole("button", {
          name: /reset password/i,
        });
        expect(resetPasswordButtons.length).toBeGreaterThan(0);
        // Verify button count matches employee count
        expect(resetPasswordButtons.length).toBe(mockEmployees.length);
      });
    });

    it("[P0-AC-5] should open Change Email modal when button is clicked", async () => {
      // GIVEN: StoreEmployeesTab is rendered
      const user = userEvent.setup();
      renderWithProviders(<StoreEmployeesTab storeId={storeId} />);

      await waitFor(() => {
        expect(screen.getByTestId("employee-table")).toBeInTheDocument();
      });

      // WHEN: User clicks Change Email button
      const changeEmailButtons = screen.getAllByRole("button", {
        name: /change email/i,
      });
      await user.click(changeEmailButtons[0]);

      // THEN: Change Email modal opens
      await waitFor(() => {
        expect(screen.getByTestId("change-email-modal")).toBeInTheDocument();
      });
    });

    it("[P0-AC-6] should open Reset Password modal when button is clicked", async () => {
      // GIVEN: StoreEmployeesTab is rendered
      const user = userEvent.setup();
      renderWithProviders(<StoreEmployeesTab storeId={storeId} />);

      await waitFor(() => {
        expect(screen.getByTestId("employee-table")).toBeInTheDocument();
      });

      // WHEN: User clicks Reset Password button
      const resetPasswordButtons = screen.getAllByRole("button", {
        name: /reset password/i,
      });
      await user.click(resetPasswordButtons[0]);

      // THEN: Reset Password modal opens
      await waitFor(() => {
        expect(screen.getByTestId("reset-password-modal")).toBeInTheDocument();
      });
    });
  });

  describe("Loading and Error States", () => {
    it("should show loading state while fetching employees", async () => {
      // GIVEN: StoreEmployeesTab is rendered
      vi.mocked(clientEmployeesApi.useClientEmployees).mockReturnValue({
        ...mockUseClientEmployees,
        isLoading: true,
        data: undefined,
      } as any);

      renderWithProviders(<StoreEmployeesTab storeId={storeId} />);

      // WHEN: Employees are loading
      // THEN: Loading skeleton is displayed
      expect(screen.getByTestId("store-employees-tab")).toBeInTheDocument();
    });

    it("should show error message when fetch fails", async () => {
      // GIVEN: StoreEmployeesTab is rendered
      vi.mocked(clientEmployeesApi.useClientEmployees).mockReturnValue({
        ...mockUseClientEmployees,
        isLoading: false,
        isError: true,
        error: new Error("Failed to load"),
      } as any);

      renderWithProviders(<StoreEmployeesTab storeId={storeId} />);

      // WHEN: Fetch fails
      // THEN: Error message is displayed
      await waitFor(() => {
        expect(
          screen.getByText(/failed to load employees/i),
        ).toBeInTheDocument();
      });
    });
  });
});
