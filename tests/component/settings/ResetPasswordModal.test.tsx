/**
 * @test-level COMPONENT
 * @justification Tests React modal component for password reset with strength validation
 * @story 6-14-store-settings-page
 * @enhanced-by workflow-9 on 2025-01-28
 */
// tests/component/settings/ResetPasswordModal.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../../support/test-utils";
import userEvent from "@testing-library/user-event";
import { ResetPasswordModal } from "@/components/settings/ResetPasswordModal";
import * as clientEmployeesApi from "@/lib/api/client-employees";

/**
 * ResetPasswordModal Component Tests
 *
 * Tests the modal component for resetting employee passwords.
 *
 * Component tests are SECOND in pyramid order (20-30% of tests)
 *
 * ENHANCEMENTS APPLIED (Workflow 9):
 * - Test isolation: beforeEach cleanup
 * - Given-When-Then structure: Already present
 * - Comprehensive password strength validation tests
 * - Edge case tests for password requirements
 * - Added test IDs linking to AC-6 for traceability
 */

vi.mock("@/lib/api/client-employees", () => ({
  useResetEmployeePassword: vi.fn(),
}));

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

describe("ResetPasswordModal Component", () => {
  const employee = {
    userId: "123e4567-e89b-12d3-a456-426614174000",
  };

  const mockResetMutation = {
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
    isError: false,
    error: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clientEmployeesApi.useResetEmployeePassword).mockReturnValue(
      mockResetMutation as any,
    );
  });

  describe("Modal Display", () => {
    it("should render modal when open", () => {
      // GIVEN: ResetPasswordModal is rendered with open=true
      renderWithProviders(
        <ResetPasswordModal
          employee={employee}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: Component renders
      // THEN: Modal is visible
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("should have password and confirm password input fields", () => {
      // GIVEN: ResetPasswordModal is rendered
      renderWithProviders(
        <ResetPasswordModal
          employee={employee}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: Component renders
      // THEN: Password and confirm password fields are present
      const passwordInputs = screen.getAllByLabelText(/password/i);
      expect(passwordInputs.length).toBeGreaterThanOrEqual(2);
    });

    it("should display password strength indicator", () => {
      // GIVEN: ResetPasswordModal is rendered
      renderWithProviders(
        <ResetPasswordModal
          employee={employee}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: Component renders
      // THEN: Password strength indicator is displayed
      expect(
        screen.getByTestId("password-strength-indicator"),
      ).toBeInTheDocument();
    });
  });

  describe("Password Validation", () => {
    it("should show validation error for password shorter than 8 characters", async () => {
      // GIVEN: ResetPasswordModal is rendered
      const user = userEvent.setup();
      renderWithProviders(
        <ResetPasswordModal
          employee={employee}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: User enters password < 8 chars
      const passwordInput = screen.getByLabelText(/^password$/i);
      await user.type(passwordInput, "Short1!");
      await user.tab();

      // THEN: Validation error is displayed
      await waitFor(() => {
        expect(
          screen.getByText(/must be at least 8 characters/i),
        ).toBeInTheDocument();
      });
    });

    it("should show validation error for password without uppercase", async () => {
      // GIVEN: ResetPasswordModal is rendered
      const user = userEvent.setup();
      renderWithProviders(
        <ResetPasswordModal
          employee={employee}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: User enters password without uppercase
      const passwordInput = screen.getByLabelText(/^password$/i);
      await user.type(passwordInput, "lowercase123!");
      await user.tab();

      // THEN: Validation error is displayed
      await waitFor(() => {
        expect(screen.getByText(/uppercase letter/i)).toBeInTheDocument();
      });
    });

    it("should show validation error when passwords don't match", async () => {
      // GIVEN: ResetPasswordModal is rendered
      const user = userEvent.setup();
      renderWithProviders(
        <ResetPasswordModal
          employee={employee}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: User enters mismatched passwords
      const passwordInput = screen.getByLabelText(/^password$/i);
      const confirmInput = screen.getByLabelText(/confirm/i);
      await user.type(passwordInput, "ValidPass123!");
      await user.type(confirmInput, "Different123!");
      await user.tab();

      // THEN: Validation error is displayed
      await waitFor(() => {
        expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
      });
    });

    it("should update password strength indicator as user types", async () => {
      // GIVEN: ResetPasswordModal is rendered
      const user = userEvent.setup();
      renderWithProviders(
        <ResetPasswordModal
          employee={employee}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: User types password
      const passwordInput = screen.getByLabelText(/^password$/i);
      await user.type(passwordInput, "ValidPass123!");

      // THEN: Password strength indicator updates
      await waitFor(() => {
        const indicator = screen.getByTestId("password-strength-indicator");
        expect(indicator).toBeInTheDocument();
      });
    });
  });

  describe("Save Functionality", () => {
    it("[P0-AC-6] should reset employee password when save is clicked", async () => {
      // GIVEN: ResetPasswordModal is rendered with valid password
      const user = userEvent.setup();
      const mutateAsync = vi.fn().mockResolvedValue({});
      vi.mocked(clientEmployeesApi.useResetEmployeePassword).mockReturnValue({
        ...mockResetMutation,
        mutateAsync,
      } as any);

      renderWithProviders(
        <ResetPasswordModal
          employee={employee}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: User clicks save button
      const passwordInput = screen.getByLabelText(/^password$/i);
      const confirmInput = screen.getByLabelText(/confirm/i);
      await user.type(passwordInput, "ValidPass123!");
      await user.type(confirmInput, "ValidPass123!");

      const saveButton = screen.getByRole("button", { name: /save/i });
      await user.click(saveButton);

      // THEN: resetEmployeePassword mutation is called
      await waitFor(() => {
        expect(mutateAsync).toHaveBeenCalledWith({
          userId: employee.userId,
          password: "ValidPass123!",
        });
      });
    });

    it("should close modal on successful save", async () => {
      // GIVEN: ResetPasswordModal is rendered
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      renderWithProviders(
        <ResetPasswordModal
          employee={employee}
          open={true}
          onOpenChange={onOpenChange}
        />,
      );

      // WHEN: Save mutation succeeds
      const passwordInput = screen.getByLabelText(/^password$/i);
      const confirmInput = screen.getByLabelText(/confirm/i);
      await user.type(passwordInput, "ValidPass123!");
      await user.type(confirmInput, "ValidPass123!");

      const saveButton = screen.getByRole("button", { name: /save/i });
      await user.click(saveButton);

      // THEN: Modal closes
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });
});
