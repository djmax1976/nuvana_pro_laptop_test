/**
 * @test-level COMPONENT
 * @justification Tests React modal component for PIN reset with format validation
 * @story 6-14-store-settings-page
 * @enhanced-by workflow-9 on 2025-01-28
 */
// tests/component/settings/ResetPINModal.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../../support/test-utils";
import userEvent from "@testing-library/user-event";
import { ResetPINModal } from "@/components/settings/ResetPINModal";
import * as cashiersApi from "@/lib/api/cashiers";

/**
 * ResetPINModal Component Tests
 *
 * Tests the modal component for resetting cashier PINs.
 *
 * Component tests are SECOND in pyramid order (20-30% of tests)
 *
 * ENHANCEMENTS APPLIED (Workflow 9):
 * - Test isolation: beforeEach cleanup
 * - Given-When-Then structure: Already present
 * - Comprehensive PIN format validation tests
 * - Edge case tests for PIN formats
 * - Added test IDs linking to AC-8 for traceability
 */

vi.mock("@/lib/api/cashiers", () => ({
  useUpdateCashier: vi.fn(),
}));

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

describe("ResetPINModal Component", () => {
  const cashier = {
    cashier_id: "123e4567-e89b-12d3-a456-426614174000",
    store_id: "223e4567-e89b-12d3-a456-426614174001",
    employee_id: "emp-123",
    name: "Test Cashier",
    storeId: "223e4567-e89b-12d3-a456-426614174001",
  } as any;

  const mockUpdateMutation = {
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
    isError: false,
    error: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cashiersApi.useUpdateCashier).mockReturnValue(
      mockUpdateMutation as any,
    );
  });

  describe("Modal Display", () => {
    it("should render modal when open", () => {
      // GIVEN: ResetPINModal is rendered with open=true
      renderWithProviders(
        <ResetPINModal
          cashier={cashier}
          storeId={cashier.storeId || "store-123"}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: Component renders
      // THEN: Modal is visible
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("should have PIN input field", () => {
      // GIVEN: ResetPINModal is rendered
      renderWithProviders(
        <ResetPINModal
          cashier={cashier}
          storeId={cashier.storeId || "store-123"}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: Component renders
      // THEN: PIN input field is present
      expect(screen.getByTestId("pin-input")).toBeInTheDocument();
    });
  });

  describe("PIN Validation", () => {
    it("should show validation error for PIN shorter than 4 digits on form submit", async () => {
      // GIVEN: ResetPINModal is rendered
      const user = userEvent.setup();
      renderWithProviders(
        <ResetPINModal
          cashier={cashier}
          storeId={cashier.storeId}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: User enters PIN < 4 digits and submits the form
      const pinInput = screen.getByTestId("pin-input");
      await user.type(pinInput, "123");
      const saveButton = screen.getByRole("button", { name: /save/i });
      await user.click(saveButton);

      // THEN: Validation error is displayed (zod validation on submit)
      await waitFor(() => {
        expect(
          screen.getByText(/PIN must be exactly 4 numeric digits/i),
        ).toBeInTheDocument();
      });
    });

    it("should prevent entering more than 4 digits via maxLength", async () => {
      // GIVEN: ResetPINModal is rendered
      const user = userEvent.setup();
      renderWithProviders(
        <ResetPINModal
          cashier={cashier}
          storeId={cashier.storeId}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: User attempts to enter PIN > 4 digits
      const pinInput = screen.getByTestId("pin-input");
      await user.type(pinInput, "12345");

      // THEN: Input is limited to 4 digits by maxLength attribute
      expect(pinInput).toHaveValue("1234");
      // No validation error because the input is valid (4 digits)
      expect(
        screen.queryByText(/exactly 4 numeric digits/i),
      ).not.toBeInTheDocument();
    });

    it("should strip non-numeric characters from PIN input", async () => {
      // GIVEN: ResetPINModal is rendered
      const user = userEvent.setup();
      renderWithProviders(
        <ResetPINModal
          cashier={cashier}
          storeId={cashier.storeId}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: User enters non-numeric characters
      const pinInput = screen.getByTestId("pin-input");
      await user.type(pinInput, "abcd");

      // THEN: Non-numeric characters are stripped (component sanitizes input)
      // Input value is empty because all characters were non-numeric
      expect(pinInput).toHaveValue("");
    });

    it("should accept valid 4-digit PIN", async () => {
      // GIVEN: ResetPINModal is rendered
      const user = userEvent.setup();
      renderWithProviders(
        <ResetPINModal
          cashier={cashier}
          storeId={cashier.storeId}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: User enters valid 4-digit PIN
      const pinInput = screen.getByTestId("pin-input");
      await user.type(pinInput, "1234");
      await user.tab();

      // THEN: No validation error
      await waitFor(() => {
        expect(
          screen.queryByText(/exactly 4 numeric digits/i),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("Save Functionality", () => {
    it("[P0-AC-8] should reset cashier PIN when save is clicked", async () => {
      // GIVEN: ResetPINModal is rendered with valid PIN
      const user = userEvent.setup();
      const mutateAsync = vi.fn().mockResolvedValue({});
      vi.mocked(cashiersApi.useUpdateCashier).mockReturnValue({
        ...mockUpdateMutation,
        mutateAsync,
      } as any);

      renderWithProviders(
        <ResetPINModal
          cashier={cashier}
          storeId={cashier.storeId}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: User clicks save button
      const pinInput = screen.getByTestId("pin-input");
      await user.type(pinInput, "1234");

      const saveButton = screen.getByRole("button", { name: /save/i });
      await user.click(saveButton);

      // THEN: updateCashier mutation is called with PIN
      await waitFor(() => {
        expect(mutateAsync).toHaveBeenCalledWith({
          storeId: cashier.storeId,
          cashierId: cashier.cashier_id,
          data: { pin: "1234" },
        });
      });
    });

    it("should close modal on successful save", async () => {
      // GIVEN: ResetPINModal is rendered
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      renderWithProviders(
        <ResetPINModal
          cashier={cashier}
          storeId={cashier.storeId}
          open={true}
          onOpenChange={onOpenChange}
        />,
      );

      // WHEN: Save mutation succeeds
      const pinInput = screen.getByTestId("pin-input");
      await user.type(pinInput, "1234");

      const saveButton = screen.getByRole("button", { name: /save/i });
      await user.click(saveButton);

      // THEN: Modal closes
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });
});
