/**
 * @test-level COMPONENT
 * @justification Tests React modal component for setting/resetting employee PINs with format validation
 * @story PIN Authentication for STORE_MANAGER and SHIFT_MANAGER
 * @traceability UPIN-COMP-001 through UPIN-COMP-024
 */
// tests/component/settings/SetEmployeePINModal.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../../support/test-utils";
import userEvent from "@testing-library/user-event";
import { SetEmployeePINModal } from "@/components/settings/SetEmployeePINModal";
import * as clientEmployeesApi from "@/lib/api/client-employees";

/**
 * SetEmployeePINModal Component Tests
 *
 * Tests the modal component for setting/resetting employee PINs for
 * STORE_MANAGER and SHIFT_MANAGER terminal authentication.
 *
 * Component tests are SECOND in pyramid order (20-30% of tests)
 *
 * Enterprise Testing Standards Applied:
 * - Test isolation: beforeEach cleanup
 * - Given-When-Then structure for all tests
 * - Comprehensive PIN format validation tests
 * - Edge case tests for PIN input handling
 * - Confirmation PIN matching validation
 * - Error handling scenarios
 * - Accessibility (numeric input mode)
 * - Test IDs for traceability (UPIN-COMP-xxx)
 */

vi.mock("@/lib/api/client-employees", () => ({
  useSetEmployeePIN: vi.fn(),
}));

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

describe("SetEmployeePINModal Component", () => {
  // Realistic employee data for STORE_MANAGER role
  const storeManagerEmployee: clientEmployeesApi.Employee = {
    user_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    email: "store.manager@teststore.nuvana.local",
    name: "Sarah Johnson",
    status: "ACTIVE",
    created_at: "2024-06-15T09:30:00Z",
    store_id: "store-001-uuid-here-1234",
    store_name: "Downtown Fuel Station",
    company_id: "company-uuid-1234-5678",
    company_name: "Regional Petroleum Corp",
    roles: [
      {
        user_role_id: "role-uuid-001",
        role_code: "STORE_MANAGER",
        role_description: "Store Manager",
      },
    ],
    has_pin: false,
  };

  // Employee who already has a PIN set (for reset scenario)
  const employeeWithPIN: clientEmployeesApi.Employee = {
    ...storeManagerEmployee,
    user_id: "b2c3d4e5-f6a7-8901-bcde-f23456789012",
    email: "shift.manager@teststore.nuvana.local",
    name: "Michael Chen",
    roles: [
      {
        user_role_id: "role-uuid-002",
        role_code: "SHIFT_MANAGER",
        role_description: "Shift Manager",
      },
    ],
    has_pin: true,
  };

  const storeId = "store-001-uuid-here-1234";

  const mockSetPINMutation = {
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
    isError: false,
    error: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clientEmployeesApi.useSetEmployeePIN).mockReturnValue(
      mockSetPINMutation as any,
    );
  });

  describe("Modal Display", () => {
    it("UPIN-COMP-001: should render modal when open", () => {
      // GIVEN: SetEmployeePINModal is rendered with open=true
      renderWithProviders(
        <SetEmployeePINModal
          employee={storeManagerEmployee}
          storeId={storeId}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: Component renders
      // THEN: Modal dialog is visible
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("UPIN-COMP-002: should not render modal when closed", () => {
      // GIVEN: SetEmployeePINModal is rendered with open=false
      renderWithProviders(
        <SetEmployeePINModal
          employee={storeManagerEmployee}
          storeId={storeId}
          open={false}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: Component renders
      // THEN: Modal dialog is not visible
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("UPIN-COMP-003: should display 'Set PIN' title for employee without PIN", () => {
      // GIVEN: Employee does not have a PIN set
      renderWithProviders(
        <SetEmployeePINModal
          employee={storeManagerEmployee}
          storeId={storeId}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: Component renders
      // THEN: Title (h2 heading) shows "Set PIN"
      const heading = screen.getByRole("heading", { level: 2 });
      expect(heading).toHaveTextContent("Set PIN");
    });

    it("UPIN-COMP-004: should display 'Reset PIN' title for employee with existing PIN", () => {
      // GIVEN: Employee already has a PIN set
      renderWithProviders(
        <SetEmployeePINModal
          employee={employeeWithPIN}
          storeId={storeId}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: Component renders
      // THEN: Title (h2 heading) shows "Reset PIN"
      const heading = screen.getByRole("heading", { level: 2 });
      expect(heading).toHaveTextContent("Reset PIN");
    });

    it("UPIN-COMP-005: should display employee name in description", () => {
      // GIVEN: SetEmployeePINModal is rendered
      renderWithProviders(
        <SetEmployeePINModal
          employee={storeManagerEmployee}
          storeId={storeId}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: Component renders
      // THEN: Employee name is shown in description
      expect(screen.getByText(/Sarah Johnson/)).toBeInTheDocument();
    });

    it("UPIN-COMP-006: should have PIN input field with test ID", () => {
      // GIVEN: SetEmployeePINModal is rendered
      renderWithProviders(
        <SetEmployeePINModal
          employee={storeManagerEmployee}
          storeId={storeId}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: Component renders
      // THEN: PIN input field is present with test ID
      expect(screen.getByTestId("pin-input")).toBeInTheDocument();
    });

    it("UPIN-COMP-007: should have confirm PIN input field with test ID", () => {
      // GIVEN: SetEmployeePINModal is rendered
      renderWithProviders(
        <SetEmployeePINModal
          employee={storeManagerEmployee}
          storeId={storeId}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: Component renders
      // THEN: Confirm PIN input field is present with test ID
      expect(screen.getByTestId("confirm-pin-input")).toBeInTheDocument();
    });

    it("UPIN-COMP-008: should have cancel and save buttons", () => {
      // GIVEN: SetEmployeePINModal is rendered
      renderWithProviders(
        <SetEmployeePINModal
          employee={storeManagerEmployee}
          storeId={storeId}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: Component renders
      // THEN: Cancel and Save buttons are present
      expect(screen.getByTestId("cancel-button")).toBeInTheDocument();
      expect(screen.getByTestId("save-pin-button")).toBeInTheDocument();
    });
  });

  describe("PIN Input Validation", () => {
    it("UPIN-COMP-009: should show validation error for PIN shorter than 4 digits on form submit", async () => {
      // GIVEN: SetEmployeePINModal is rendered
      const user = userEvent.setup();
      renderWithProviders(
        <SetEmployeePINModal
          employee={storeManagerEmployee}
          storeId={storeId}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: User enters PIN < 4 digits and submits
      const pinInput = screen.getByTestId("pin-input");
      await user.type(pinInput, "123");
      const saveButton = screen.getByTestId("save-pin-button");
      await user.click(saveButton);

      // THEN: At least one validation error is displayed (both PIN and confirm PIN are invalid)
      await waitFor(() => {
        const errorMessages = screen.getAllByText(
          /PIN must be exactly 4 numeric digits/i,
        );
        expect(errorMessages.length).toBeGreaterThanOrEqual(1);
      });
    });

    it("UPIN-COMP-010: should prevent entering more than 4 digits via maxLength", async () => {
      // GIVEN: SetEmployeePINModal is rendered
      const user = userEvent.setup();
      renderWithProviders(
        <SetEmployeePINModal
          employee={storeManagerEmployee}
          storeId={storeId}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: User attempts to enter PIN > 4 digits
      const pinInput = screen.getByTestId("pin-input");
      await user.type(pinInput, "123456");

      // THEN: Input is limited to 4 digits by maxLength attribute
      expect(pinInput).toHaveValue("1234");
    });

    it("UPIN-COMP-011: should strip non-numeric characters from PIN input", async () => {
      // GIVEN: SetEmployeePINModal is rendered
      const user = userEvent.setup();
      renderWithProviders(
        <SetEmployeePINModal
          employee={storeManagerEmployee}
          storeId={storeId}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: User enters non-numeric characters
      const pinInput = screen.getByTestId("pin-input");
      await user.type(pinInput, "ab12cd34");

      // THEN: Only numeric characters are kept
      expect(pinInput).toHaveValue("1234");
    });

    it("UPIN-COMP-012: should strip non-numeric characters from confirm PIN input", async () => {
      // GIVEN: SetEmployeePINModal is rendered
      const user = userEvent.setup();
      renderWithProviders(
        <SetEmployeePINModal
          employee={storeManagerEmployee}
          storeId={storeId}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: User enters non-numeric characters in confirm field
      const confirmPinInput = screen.getByTestId("confirm-pin-input");
      await user.type(confirmPinInput, "xyz9876!");

      // THEN: Only numeric characters are kept (limited to 4 by maxLength)
      expect(confirmPinInput).toHaveValue("9876");
    });

    it("UPIN-COMP-013: should accept valid 4-digit PIN without validation error", async () => {
      // GIVEN: SetEmployeePINModal is rendered
      const user = userEvent.setup();
      renderWithProviders(
        <SetEmployeePINModal
          employee={storeManagerEmployee}
          storeId={storeId}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: User enters valid 4-digit PIN
      const pinInput = screen.getByTestId("pin-input");
      await user.type(pinInput, "4567");
      await user.tab();

      // THEN: No validation error
      await waitFor(() => {
        expect(
          screen.queryByText(/PIN must be exactly 4 numeric digits/i),
        ).not.toBeInTheDocument();
      });
    });

    it("UPIN-COMP-014: should mask PIN input as password type", () => {
      // GIVEN: SetEmployeePINModal is rendered
      renderWithProviders(
        <SetEmployeePINModal
          employee={storeManagerEmployee}
          storeId={storeId}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: Component renders
      // THEN: PIN input is type password for security
      const pinInput = screen.getByTestId("pin-input");
      expect(pinInput).toHaveAttribute("type", "password");
    });

    it("UPIN-COMP-015: should have numeric input mode for mobile keyboards", () => {
      // GIVEN: SetEmployeePINModal is rendered
      renderWithProviders(
        <SetEmployeePINModal
          employee={storeManagerEmployee}
          storeId={storeId}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: Component renders
      // THEN: PIN inputs have numeric input mode
      const pinInput = screen.getByTestId("pin-input");
      const confirmPinInput = screen.getByTestId("confirm-pin-input");
      expect(pinInput).toHaveAttribute("inputMode", "numeric");
      expect(confirmPinInput).toHaveAttribute("inputMode", "numeric");
    });
  });

  describe("PIN Confirmation Validation", () => {
    it("UPIN-COMP-016: should show validation error when PINs do not match", async () => {
      // GIVEN: SetEmployeePINModal is rendered
      const user = userEvent.setup();
      renderWithProviders(
        <SetEmployeePINModal
          employee={storeManagerEmployee}
          storeId={storeId}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: User enters mismatched PINs and submits
      const pinInput = screen.getByTestId("pin-input");
      const confirmPinInput = screen.getByTestId("confirm-pin-input");
      await user.type(pinInput, "1234");
      await user.type(confirmPinInput, "5678");

      const saveButton = screen.getByTestId("save-pin-button");
      await user.click(saveButton);

      // THEN: Validation error for mismatch is displayed
      await waitFor(() => {
        expect(screen.getByText(/PINs do not match/i)).toBeInTheDocument();
      });
    });

    it("UPIN-COMP-017: should not show mismatch error when PINs match", async () => {
      // GIVEN: SetEmployeePINModal is rendered
      const user = userEvent.setup();
      renderWithProviders(
        <SetEmployeePINModal
          employee={storeManagerEmployee}
          storeId={storeId}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: User enters matching PINs
      const pinInput = screen.getByTestId("pin-input");
      const confirmPinInput = screen.getByTestId("confirm-pin-input");
      await user.type(pinInput, "9012");
      await user.type(confirmPinInput, "9012");
      await user.tab();

      // THEN: No mismatch validation error
      await waitFor(() => {
        expect(
          screen.queryByText(/PINs do not match/i),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("Save Functionality", () => {
    it("UPIN-COMP-018: should call setEmployeePIN mutation with correct data when save is clicked", async () => {
      // GIVEN: SetEmployeePINModal is rendered with valid data
      const user = userEvent.setup();
      const mutateAsync = vi.fn().mockResolvedValue({});
      vi.mocked(clientEmployeesApi.useSetEmployeePIN).mockReturnValue({
        ...mockSetPINMutation,
        mutateAsync,
      } as any);

      renderWithProviders(
        <SetEmployeePINModal
          employee={storeManagerEmployee}
          storeId={storeId}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: User enters matching PINs and clicks save
      const pinInput = screen.getByTestId("pin-input");
      const confirmPinInput = screen.getByTestId("confirm-pin-input");
      await user.type(pinInput, "3456");
      await user.type(confirmPinInput, "3456");

      const saveButton = screen.getByTestId("save-pin-button");
      await user.click(saveButton);

      // THEN: setEmployeePIN mutation is called with correct parameters
      await waitFor(() => {
        expect(mutateAsync).toHaveBeenCalledWith({
          userId: storeManagerEmployee.user_id,
          data: {
            pin: "3456",
            store_id: storeId,
          },
        });
      });
    });

    it("UPIN-COMP-019: should close modal on successful save", async () => {
      // GIVEN: SetEmployeePINModal is rendered
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      renderWithProviders(
        <SetEmployeePINModal
          employee={storeManagerEmployee}
          storeId={storeId}
          open={true}
          onOpenChange={onOpenChange}
        />,
      );

      // WHEN: Save mutation succeeds
      const pinInput = screen.getByTestId("pin-input");
      const confirmPinInput = screen.getByTestId("confirm-pin-input");
      await user.type(pinInput, "7890");
      await user.type(confirmPinInput, "7890");

      const saveButton = screen.getByTestId("save-pin-button");
      await user.click(saveButton);

      // THEN: Modal closes via onOpenChange(false)
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it("UPIN-COMP-020: should show success toast with 'PIN set' message for new PIN", async () => {
      // GIVEN: Employee does not have a PIN set
      const user = userEvent.setup();
      renderWithProviders(
        <SetEmployeePINModal
          employee={storeManagerEmployee}
          storeId={storeId}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: PIN is successfully set
      const pinInput = screen.getByTestId("pin-input");
      const confirmPinInput = screen.getByTestId("confirm-pin-input");
      await user.type(pinInput, "1111");
      await user.type(confirmPinInput, "1111");

      const saveButton = screen.getByTestId("save-pin-button");
      await user.click(saveButton);

      // THEN: Success toast shows "PIN set"
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "PIN set",
          }),
        );
      });
    });

    it("UPIN-COMP-021: should show success toast with 'PIN reset' message for existing PIN", async () => {
      // GIVEN: Employee already has a PIN set
      const user = userEvent.setup();
      renderWithProviders(
        <SetEmployeePINModal
          employee={employeeWithPIN}
          storeId={storeId}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: PIN is successfully reset
      const pinInput = screen.getByTestId("pin-input");
      const confirmPinInput = screen.getByTestId("confirm-pin-input");
      await user.type(pinInput, "2222");
      await user.type(confirmPinInput, "2222");

      const saveButton = screen.getByTestId("save-pin-button");
      await user.click(saveButton);

      // THEN: Success toast shows "PIN reset"
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "PIN reset",
          }),
        );
      });
    });
  });

  describe("Error Handling", () => {
    it("UPIN-COMP-022: should show error toast when mutation fails", async () => {
      // GIVEN: SetEmployeePIN mutation will fail
      const user = userEvent.setup();
      const errorMessage = "PIN already in use at this store";
      const mutateAsync = vi.fn().mockRejectedValue(new Error(errorMessage));
      vi.mocked(clientEmployeesApi.useSetEmployeePIN).mockReturnValue({
        ...mockSetPINMutation,
        mutateAsync,
      } as any);

      renderWithProviders(
        <SetEmployeePINModal
          employee={storeManagerEmployee}
          storeId={storeId}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: User attempts to save and mutation fails
      const pinInput = screen.getByTestId("pin-input");
      const confirmPinInput = screen.getByTestId("confirm-pin-input");
      await user.type(pinInput, "3333");
      await user.type(confirmPinInput, "3333");

      const saveButton = screen.getByTestId("save-pin-button");
      await user.click(saveButton);

      // THEN: Error toast is shown with error message
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Error",
            description: errorMessage,
            variant: "destructive",
          }),
        );
      });
    });

    it("UPIN-COMP-023: should show generic error message for non-Error exceptions", async () => {
      // GIVEN: SetEmployeePIN mutation will fail with non-Error
      const user = userEvent.setup();
      const mutateAsync = vi.fn().mockRejectedValue("Unknown error");
      vi.mocked(clientEmployeesApi.useSetEmployeePIN).mockReturnValue({
        ...mockSetPINMutation,
        mutateAsync,
      } as any);

      renderWithProviders(
        <SetEmployeePINModal
          employee={storeManagerEmployee}
          storeId={storeId}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: User attempts to save and mutation fails
      const pinInput = screen.getByTestId("pin-input");
      const confirmPinInput = screen.getByTestId("confirm-pin-input");
      await user.type(pinInput, "4444");
      await user.type(confirmPinInput, "4444");

      const saveButton = screen.getByTestId("save-pin-button");
      await user.click(saveButton);

      // THEN: Generic error message is shown
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Error",
            description: "Failed to set PIN",
            variant: "destructive",
          }),
        );
      });
    });
  });

  describe("Cancel and Modal Behavior", () => {
    it("UPIN-COMP-024: should close modal and reset form when cancel is clicked", async () => {
      // GIVEN: SetEmployeePINModal is rendered with data entered
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      renderWithProviders(
        <SetEmployeePINModal
          employee={storeManagerEmployee}
          storeId={storeId}
          open={true}
          onOpenChange={onOpenChange}
        />,
      );

      // WHEN: User enters data and clicks cancel
      const pinInput = screen.getByTestId("pin-input");
      await user.type(pinInput, "5555");

      const cancelButton = screen.getByTestId("cancel-button");
      await user.click(cancelButton);

      // THEN: Modal closes
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe("Loading State", () => {
    it("UPIN-COMP-025: should disable inputs and buttons when mutation is pending", () => {
      // GIVEN: Mutation is in pending state
      vi.mocked(clientEmployeesApi.useSetEmployeePIN).mockReturnValue({
        ...mockSetPINMutation,
        isPending: true,
      } as any);

      renderWithProviders(
        <SetEmployeePINModal
          employee={storeManagerEmployee}
          storeId={storeId}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: Component renders
      // THEN: Inputs and buttons are disabled
      expect(screen.getByTestId("pin-input")).toBeDisabled();
      expect(screen.getByTestId("confirm-pin-input")).toBeDisabled();
      expect(screen.getByTestId("cancel-button")).toBeDisabled();
      expect(screen.getByTestId("save-pin-button")).toBeDisabled();
    });

    it("UPIN-COMP-026: should show loading spinner when mutation is pending", () => {
      // GIVEN: Mutation is in pending state
      vi.mocked(clientEmployeesApi.useSetEmployeePIN).mockReturnValue({
        ...mockSetPINMutation,
        isPending: true,
      } as any);

      renderWithProviders(
        <SetEmployeePINModal
          employee={storeManagerEmployee}
          storeId={storeId}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: Component renders
      // THEN: Loading indicator is shown
      expect(screen.getByText(/Saving/i)).toBeInTheDocument();
    });
  });
});
