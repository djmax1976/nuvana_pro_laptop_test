/**
 * @test-level COMPONENT
 * @justification Tests React modal component for email updates with validation
 * @story 6-14-store-settings-page
 * @enhanced-by workflow-9 on 2025-01-28
 */
// tests/component/settings/ChangeEmailModal.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../../support/test-utils";
import userEvent from "@testing-library/user-event";
import { ChangeEmailModal } from "@/components/settings/ChangeEmailModal";
import * as clientEmployeesApi from "@/lib/api/client-employees";

/**
 * ChangeEmailModal Component Tests
 *
 * Tests the modal component for changing employee email addresses.
 *
 * Component tests are SECOND in pyramid order (20-30% of tests)
 *
 * ENHANCEMENTS APPLIED (Workflow 9):
 * - Test isolation: beforeEach cleanup
 * - Given-When-Then structure: Already present
 * - Comprehensive email validation tests
 * - Edge case tests for email formats
 * - Added test IDs linking to AC-5 for traceability
 * - Added error case tests for duplicate email and empty email
 */

vi.mock("@/lib/api/client-employees", () => ({
  useUpdateEmployeeEmail: vi.fn(),
}));

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

describe("ChangeEmailModal Component", () => {
  const employee = {
    user_id: "123e4567-e89b-12d3-a456-426614174000",
    email: "employee@test.nuvana.local",
    name: "Test Employee",
    status: "active",
    created_at: "2025-01-01T00:00:00Z",
    store_id: "store-123",
    store_name: "Test Store",
    company_id: "company-123",
    company_name: "Test Company",
    roles: [],
    has_pin: false,
  };

  const mockUpdateMutation = {
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
    isError: false,
    error: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clientEmployeesApi.useUpdateEmployeeEmail).mockReturnValue(
      mockUpdateMutation as any,
    );
  });

  describe("Modal Display", () => {
    it("should render modal when open", () => {
      // GIVEN: ChangeEmailModal is rendered with open=true
      renderWithProviders(
        <ChangeEmailModal
          employee={employee}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: Component renders
      // THEN: Modal is visible
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("should display current email address", () => {
      // GIVEN: ChangeEmailModal is rendered with employee data
      renderWithProviders(
        <ChangeEmailModal
          employee={employee}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: Component renders
      // THEN: Current email is displayed
      const emailInput = screen.getByRole("textbox", { name: /email/i });
      expect(emailInput).toHaveValue(employee.email);
    });

    it("should have email input field", () => {
      // GIVEN: ChangeEmailModal is rendered
      renderWithProviders(
        <ChangeEmailModal
          employee={employee}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: Component renders
      // THEN: Email input field is present
      expect(
        screen.getByRole("textbox", { name: /email/i }),
      ).toBeInTheDocument();
    });
  });

  describe("Email Validation", () => {
    it("[P1-AC-5] should show validation error for invalid email format", async () => {
      // GIVEN: I click "Change Email" for an employee and the modal opens
      const user = userEvent.setup();
      renderWithProviders(
        <ChangeEmailModal
          employee={employee}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: I enter an invalid email address
      const emailInput = screen.getByRole("textbox", { name: /email/i });
      await user.clear(emailInput);
      await user.type(emailInput, "invalid-email");
      await user.tab();

      // THEN: Validation error is displayed
      await waitFor(() => {
        expect(screen.getByText(/invalid email format/i)).toBeInTheDocument();
      });
    });

    it("[P1-AC-5] should show validation error for duplicate email", async () => {
      // GIVEN: I click "Change Email" for an employee and the modal opens
      const user = userEvent.setup();
      const mutateAsync = vi.fn().mockRejectedValue({
        response: { status: 409, data: { error: "Email already exists" } },
      });
      vi.mocked(clientEmployeesApi.useUpdateEmployeeEmail).mockReturnValue({
        ...mockUpdateMutation,
        mutateAsync,
      } as any);

      renderWithProviders(
        <ChangeEmailModal
          employee={employee}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: I enter a duplicate email and click Save
      const emailInput = screen.getByRole("textbox", { name: /email/i });
      await user.clear(emailInput);
      await user.type(emailInput, "duplicate@test.nuvana.local");

      const saveButton = screen.getByRole("button", { name: /save/i });
      await user.click(saveButton);

      // THEN: Error message is displayed
      await waitFor(() => {
        expect(
          screen.getByText(/email already exists|duplicate/i),
        ).toBeInTheDocument();
      });
    });

    it("[P1-AC-5] should show validation error for empty email", async () => {
      // GIVEN: I click "Change Email" for an employee and the modal opens
      const user = userEvent.setup();
      renderWithProviders(
        <ChangeEmailModal
          employee={employee}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: I clear the email field
      const emailInput = screen.getByRole("textbox", { name: /email/i });
      await user.clear(emailInput);
      await user.tab();

      // THEN: Validation error is displayed
      await waitFor(() => {
        expect(screen.getByText(/required|email/i)).toBeInTheDocument();
      });
    });
  });

  describe("Save Functionality", () => {
    it("[P0-AC-5] should update employee email when save is clicked", async () => {
      // GIVEN: ChangeEmailModal is rendered with valid new email
      const user = userEvent.setup();
      const mutateAsync = vi.fn().mockResolvedValue({});
      vi.mocked(clientEmployeesApi.useUpdateEmployeeEmail).mockReturnValue({
        ...mockUpdateMutation,
        mutateAsync,
      } as any);

      const onOpenChange = vi.fn();
      renderWithProviders(
        <ChangeEmailModal
          employee={employee}
          open={true}
          onOpenChange={onOpenChange}
        />,
      );

      // WHEN: User clicks save button
      const emailInput = screen.getByRole("textbox", { name: /email/i });
      await user.clear(emailInput);
      await user.type(emailInput, "newemail@test.nuvana.local");

      const saveButton = screen.getByRole("button", { name: /save/i });
      await user.click(saveButton);

      // THEN: updateEmployeeEmail mutation is called
      await waitFor(() => {
        expect(mutateAsync).toHaveBeenCalledWith({
          userId: employee.user_id,
          email: "newemail@test.nuvana.local",
        });
      });
    });

    it("should close modal on successful save", async () => {
      // GIVEN: ChangeEmailModal is rendered
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      renderWithProviders(
        <ChangeEmailModal
          employee={employee}
          open={true}
          onOpenChange={onOpenChange}
        />,
      );

      // WHEN: Save mutation succeeds
      const emailInput = screen.getByRole("textbox", { name: /email/i });
      await user.clear(emailInput);
      await user.type(emailInput, "newemail@test.nuvana.local");

      const saveButton = screen.getByRole("button", { name: /save/i });
      await user.click(saveButton);

      // THEN: Modal closes
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it("should show success notification on successful save", async () => {
      // GIVEN: ChangeEmailModal is rendered
      const user = userEvent.setup();
      renderWithProviders(
        <ChangeEmailModal
          employee={employee}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // WHEN: Save mutation succeeds
      const emailInput = screen.getByRole("textbox", { name: /email/i });
      await user.clear(emailInput);
      await user.type(emailInput, "newemail@test.nuvana.local");

      const saveButton = screen.getByRole("button", { name: /save/i });
      await user.click(saveButton);

      // THEN: Success toast is displayed
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Email updated",
          }),
        );
      });
    });
  });
});
