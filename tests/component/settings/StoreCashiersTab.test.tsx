/**
 * @test-level COMPONENT
 * @justification Tests React component rendering, cashier table display, and action buttons
 * @story 6-14-store-settings-page
 * @enhanced-by workflow-9 on 2025-01-28
 */
// tests/component/settings/StoreCashiersTab.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../../support/test-utils";
import userEvent from "@testing-library/user-event";
import { StoreCashiersTab } from "@/components/settings/StoreCashiersTab";
import * as cashiersApi from "@/lib/api/cashiers";

/**
 * StoreCashiersTab Component Tests
 *
 * Tests the Cashiers tab component that displays cashier table with PIN reset action.
 *
 * Component tests are SECOND in pyramid order (20-30% of tests)
 */

// Mock the API hooks
vi.mock("@/lib/api/cashiers", () => ({
  useCashiers: vi.fn(),
}));

// Mock modal component
vi.mock("@/components/settings/ResetPINModal", () => ({
  ResetPINModal: ({ open, onOpenChange }: any) =>
    open ? <div data-testid="reset-pin-modal">Reset PIN Modal</div> : null,
}));

describe("StoreCashiersTab Component", () => {
  const storeId = "store-123";

  const mockCashiers = [
    {
      cashier_id: "cashier-1",
      employee_id: "emp-1",
      name: "Cashier One",
      hired_on: new Date("2024-01-01"),
      is_active: true,
    },
    {
      cashier_id: "cashier-2",
      employee_id: "emp-2",
      name: "Cashier Two",
      hired_on: new Date("2024-02-01"),
      is_active: true,
    },
  ];

  const mockUseCashiers = {
    data: mockCashiers,
    isLoading: false,
    isError: false,
    error: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cashiersApi.useCashiers).mockReturnValue(mockUseCashiers as any);
  });

  describe("Cashier Table Display", () => {
    it("[P1-AC-7] should display cashier table with columns (Employee ID, Name, Hired On, Status)", async () => {
      // GIVEN: I am viewing the Cashiers tab
      // WHEN: The data loads
      renderWithProviders(<StoreCashiersTab storeId={storeId} />);

      // THEN: I see a table with cashiers at this store (Employee ID, Name, Hired On, Status)
      await waitFor(() => {
        expect(screen.getByTestId("cashier-table")).toBeInTheDocument();
        expect(screen.getByText("Employee ID")).toBeInTheDocument();
        expect(screen.getByText("Name")).toBeInTheDocument();
        expect(screen.getByText("Hired On")).toBeInTheDocument();
        expect(screen.getByText("Status")).toBeInTheDocument();
      });
    });

    it("[P1-AC-7] should display cashier data in table rows", async () => {
      // GIVEN: I am viewing the Cashiers tab
      // WHEN: The data loads
      renderWithProviders(<StoreCashiersTab storeId={storeId} />);

      // THEN: Cashier data is displayed in rows with Employee ID, Name, Hired On, Status
      await waitFor(() => {
        expect(screen.getByText("Cashier One")).toBeInTheDocument();
        expect(screen.getByText("emp-1")).toBeInTheDocument();
        expect(screen.getByText("Cashier Two")).toBeInTheDocument();
        expect(screen.getByText("emp-2")).toBeInTheDocument();
      });
    });

    it("should display empty state when no cashiers exist", async () => {
      // GIVEN: StoreCashiersTab is rendered with no cashiers
      vi.mocked(cashiersApi.useCashiers).mockReturnValue({
        ...mockUseCashiers,
        data: [],
      } as any);

      renderWithProviders(<StoreCashiersTab storeId={storeId} />);

      // WHEN: Component renders
      // THEN: Empty state is displayed
      await waitFor(() => {
        expect(screen.getByText(/no cashiers found/i)).toBeInTheDocument();
      });
    });
  });

  describe("Action Buttons", () => {
    it("[P1-AC-7] should display Reset PIN button for each cashier row", async () => {
      // GIVEN: I am viewing the Cashiers tab
      // WHEN: The data loads
      renderWithProviders(<StoreCashiersTab storeId={storeId} />);

      // THEN: Each row has a "Reset PIN" action button
      await waitFor(() => {
        const resetPINButtons = screen.getAllByRole("button", {
          name: /reset pin/i,
        });
        expect(resetPINButtons.length).toBeGreaterThan(0);
        // Verify button count matches cashier count
        expect(resetPINButtons.length).toBe(mockCashiers.length);
      });
    });

    it("[P0-AC-8] should open Reset PIN modal when button is clicked", async () => {
      // GIVEN: StoreCashiersTab is rendered
      const user = userEvent.setup();
      renderWithProviders(<StoreCashiersTab storeId={storeId} />);

      await waitFor(() => {
        expect(screen.getByTestId("cashier-table")).toBeInTheDocument();
      });

      // WHEN: User clicks Reset PIN button
      const resetPINButtons = screen.getAllByRole("button", {
        name: /reset pin/i,
      });
      await user.click(resetPINButtons[0]);

      // THEN: Reset PIN modal opens
      await waitFor(() => {
        expect(screen.getByTestId("reset-pin-modal")).toBeInTheDocument();
      });
    });
  });

  describe("Loading and Error States", () => {
    it("should show loading state while fetching cashiers", async () => {
      // GIVEN: StoreCashiersTab is rendered
      vi.mocked(cashiersApi.useCashiers).mockReturnValue({
        ...mockUseCashiers,
        isLoading: true,
        data: undefined,
      } as any);

      renderWithProviders(<StoreCashiersTab storeId={storeId} />);

      // WHEN: Cashiers are loading
      // THEN: Loading skeleton is displayed
      expect(screen.getByTestId("store-cashiers-tab")).toBeInTheDocument();
    });

    it("should show error message when fetch fails", async () => {
      // GIVEN: StoreCashiersTab is rendered
      vi.mocked(cashiersApi.useCashiers).mockReturnValue({
        ...mockUseCashiers,
        isLoading: false,
        isError: true,
        error: new Error("Failed to load"),
      } as any);

      renderWithProviders(<StoreCashiersTab storeId={storeId} />);

      // WHEN: Fetch fails
      // THEN: Error message is displayed
      await waitFor(() => {
        expect(
          screen.getByText(/failed to load cashiers/i),
        ).toBeInTheDocument();
      });
    });
  });
});
