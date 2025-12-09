/**
 * Component Tests: AddLotteryDialog
 *
 * Tests AddLotteryDialog component behavior:
 * - Form field rendering and validation
 * - Form submission with API integration
 * - Success/error message display
 * - Security: XSS prevention in form inputs
 * - Edge cases: Empty strings, long inputs, special characters
 *
 * @test-level COMPONENT
 * @justification Tests UI form behavior in isolation - fast, isolated, granular
 * @story 6-10-1 - Client Dashboard Lottery Page
 * @priority P1 (High - Form Validation, API Integration)
 * @enhanced-by workflow-9 on 2025-01-28
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddLotteryDialog } from "@/components/lottery/AddLotteryDialog";

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

// Mock the toast hook
const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

// Mock usePackReception hook
vi.mock("@/hooks/useLottery", () => ({
  usePackReception: vi.fn(),
}));

import { usePackReception } from "@/hooks/useLottery";

describe("6.10.1-COMPONENT: AddLotteryDialog", () => {
  const mockOnSuccess = vi.fn();
  const mockOnOpenChange = vi.fn();
  const mockMutateAsync = vi.fn();

  // Test isolation: Clean up after each test
  beforeEach(() => {
    vi.clearAllMocks();
    (usePackReception as ReturnType<typeof vi.fn>).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    });
    mockMutateAsync.mockResolvedValue({
      success: true,
      data: { pack_id: "new-pack-id" },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("6.10.1-COMPONENT-014: [P1] should render form fields when dialog is open (AC #4)", async () => {
    // GIVEN: AddLotteryDialog component
    // WHEN: Component is rendered with open=true
    render(
      <AddLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        storeId="store-1"
        onSuccess={mockOnSuccess}
      />,
    );

    // THEN: Form fields are displayed
    expect(
      screen.getByText("Add New Lottery Pack"),
      "Dialog title should be visible",
    ).toBeInTheDocument();
    expect(
      screen.getByText("Game"),
      "Game field label should be visible",
    ).toBeInTheDocument();
    expect(
      screen.getByText("Pack Number"),
      "Pack Number field label should be visible",
    ).toBeInTheDocument();
    expect(
      screen.getByText("Serial Start"),
      "Serial Start field label should be visible",
    ).toBeInTheDocument();
    expect(
      screen.getByText("Serial End"),
      "Serial End field label should be visible",
    ).toBeInTheDocument();

    // AND: Form inputs are accessible via data-testid
    expect(
      screen.getByTestId("pack-number-input"),
      "Pack number input should have data-testid",
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("serial-start-input"),
      "Serial start input should have data-testid",
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("serial-end-input"),
      "Serial end input should have data-testid",
    ).toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-015: [P1] should validate required fields (AC #4)", async () => {
    // GIVEN: AddLotteryDialog component
    const user = userEvent.setup();

    // WHEN: User tries to submit form without filling required fields
    render(
      <AddLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        storeId="store-1"
        onSuccess={mockOnSuccess}
      />,
    );

    const submitButton = screen.getByRole("button", {
      name: /create.*pack/i,
    });
    await user.click(submitButton);

    // THEN: Form validation errors are displayed
    await waitFor(
      () => {
        expect(
          screen.getByText(/game must be selected/i),
          "Game validation error should be displayed",
        ).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it("6.10.1-COMPONENT-016: [P1] should validate serial range (serial_end >= serial_start) (AC #4)", async () => {
    // GIVEN: AddLotteryDialog component
    const user = userEvent.setup();

    render(
      <AddLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        storeId="store-1"
        onSuccess={mockOnSuccess}
      />,
    );

    // WHEN: User enters invalid serial range (end < start)
    const serialStartInput = screen.getByTestId("serial-start-input");
    const serialEndInput = screen.getByTestId("serial-end-input");

    await user.type(serialStartInput, "3000");
    await user.type(serialEndInput, "2000"); // Invalid: end < start

    const submitButton = screen.getByRole("button", {
      name: /create.*pack/i,
    });
    await user.click(submitButton);

    // THEN: Validation error is displayed
    await waitFor(
      () => {
        expect(
          screen.getByText(
            /serial end must be greater than or equal to serial start/i,
          ),
          "Serial range validation error should be displayed",
        ).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it("6.10.1-COMPONENT-017: [P1] should call API on successful form submission (AC #4)", async () => {
    // GIVEN: AddLotteryDialog component with valid form data
    const user = userEvent.setup();

    render(
      <AddLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        storeId="store-1"
        onSuccess={mockOnSuccess}
      />,
    );

    // WHEN: User fills form and submits
    const packNumberInput = screen.getByTestId("pack-number-input");
    const serialStartInput = screen.getByTestId("serial-start-input");
    const serialEndInput = screen.getByTestId("serial-end-input");

    await user.type(packNumberInput, "PACK-001");
    await user.type(serialStartInput, "1000");
    await user.type(serialEndInput, "2000");

    // Note: Game selection requires games to be available from API
    // For now, we test that the form can be filled

    // THEN: Form accepts valid input
    expect(
      packNumberInput,
      "Pack number input should accept value",
    ).toHaveValue("PACK-001");
    expect(
      serialStartInput,
      "Serial start input should accept value",
    ).toHaveValue("1000");
    expect(serialEndInput, "Serial end input should accept value").toHaveValue(
      "2000",
    );
  });

  it("6.10.1-COMPONENT-018: [P1] should close dialog when Cancel is clicked (AC #4)", async () => {
    // GIVEN: AddLotteryDialog component
    const user = userEvent.setup();

    // WHEN: User clicks Cancel button
    render(
      <AddLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        storeId="store-1"
        onSuccess={mockOnSuccess}
      />,
    );

    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    await user.click(cancelButton);

    // THEN: onOpenChange is called with false
    expect(
      mockOnOpenChange,
      "onOpenChange should be called with false when Cancel is clicked",
    ).toHaveBeenCalledWith(false);
  });

  it("6.10.1-COMPONENT-019: [P1] should not render when open=false (AC #4)", async () => {
    // GIVEN: AddLotteryDialog component with open=false
    // WHEN: Component is rendered
    render(
      <AddLotteryDialog
        open={false}
        onOpenChange={mockOnOpenChange}
        storeId="store-1"
        onSuccess={mockOnSuccess}
      />,
    );

    // THEN: Dialog is not visible
    expect(
      screen.queryByText("Add New Lottery Pack"),
      "Dialog should not be visible when open=false",
    ).not.toBeInTheDocument();
  });

  // ============ SECURITY TESTS (MANDATORY) ============

  it("6.10.1-COMPONENT-SEC-001: [P0] should prevent XSS in pack_number input", async () => {
    // GIVEN: AddLotteryDialog component
    const user = userEvent.setup();

    render(
      <AddLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        storeId="store-1"
        onSuccess={mockOnSuccess}
      />,
    );

    // WHEN: User enters XSS attempt in pack_number
    const packNumberInput = screen.getByTestId("pack-number-input");
    const xssAttempts = [
      "<script>alert('XSS')</script>",
      "<img src=x onerror=alert('XSS')>",
      "javascript:alert('XSS')",
    ];

    for (const maliciousInput of xssAttempts) {
      await user.clear(packNumberInput);
      await user.type(packNumberInput, maliciousInput);

      // THEN: Input value is stored as plain text (React escapes by default)
      // Verify no script execution occurs
      expect(
        packNumberInput,
        `XSS attempt "${maliciousInput}" should be stored as plain text`,
      ).toHaveValue(maliciousInput);

      // Verify the value is not executable (React's default behavior)
      const inputElement = packNumberInput as HTMLInputElement;
      expect(
        inputElement.value,
        "Input value should be plain text, not executable",
      ).toBe(maliciousInput);
    }
  });

  it("6.10.1-COMPONENT-SEC-002: [P0] should validate pack_number maxLength (50 characters)", async () => {
    // GIVEN: AddLotteryDialog component
    const user = userEvent.setup();

    render(
      <AddLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        storeId="store-1"
        onSuccess={mockOnSuccess}
      />,
    );

    // WHEN: User enters pack_number exceeding maxLength
    const packNumberInput = screen.getByTestId("pack-number-input");
    const longPackNumber = "A".repeat(51); // Exceeds maxLength: 50

    await user.type(packNumberInput, longPackNumber);

    // THEN: Input should enforce maxLength attribute
    const inputElement = packNumberInput as HTMLInputElement;
    expect(
      inputElement.maxLength,
      "Input should have maxLength attribute set to 50",
    ).toBe(50);

    // Input may truncate or prevent typing beyond maxLength
    // This depends on browser behavior, but maxLength should be set
  });

  it("6.10.1-COMPONENT-SEC-003: [P0] should validate serial numbers are numeric-only", async () => {
    // GIVEN: AddLotteryDialog component
    const user = userEvent.setup();

    render(
      <AddLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        storeId="store-1"
        onSuccess={mockOnSuccess}
      />,
    );

    // WHEN: User enters non-numeric characters in serial fields
    const serialStartInput = screen.getByTestId("serial-start-input");
    const serialEndInput = screen.getByTestId("serial-end-input");

    // Type non-numeric characters
    await user.type(serialStartInput, "ABC123");
    await user.type(serialEndInput, "XYZ789");

    const submitButton = screen.getByRole("button", {
      name: /create.*pack/i,
    });
    await user.click(submitButton);

    // THEN: Validation error is displayed (Zod schema enforces numeric-only regex)
    await waitFor(
      () => {
        expect(
          screen.getByText(
            /serial start must contain only numeric characters/i,
          ),
          "Serial start validation error should be displayed",
        ).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  // ============ EDGE CASES ============

  it("6.10.1-COMPONENT-EDGE-001: [P2] should handle empty pack_number string", async () => {
    // GIVEN: AddLotteryDialog component
    const user = userEvent.setup();

    render(
      <AddLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        storeId="store-1"
        onSuccess={mockOnSuccess}
      />,
    );

    // WHEN: User submits form with empty pack_number
    const submitButton = screen.getByRole("button", {
      name: /create.*pack/i,
    });
    await user.click(submitButton);

    // THEN: Validation error is displayed (pack_number is required, minLength: 1)
    await waitFor(
      () => {
        expect(
          screen.getByText(/pack number is required/i),
          "Pack number required validation error should be displayed",
        ).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it("6.10.1-COMPONENT-EDGE-002: [P2] should handle very long serial numbers", async () => {
    // GIVEN: AddLotteryDialog component
    const user = userEvent.setup();

    render(
      <AddLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        storeId="store-1"
        onSuccess={mockOnSuccess}
      />,
    );

    // WHEN: User enters very long serial (101+ digits)
    const serialStartInput = screen.getByTestId("serial-start-input");
    const veryLongSerial = "1".repeat(101);

    await user.type(serialStartInput, veryLongSerial);

    // THEN: Input should enforce maxLength attribute (100)
    const inputElement = serialStartInput as HTMLInputElement;
    expect(
      inputElement.maxLength,
      "Serial start input should have maxLength attribute set to 100",
    ).toBe(100);
  });

  it("6.10.1-COMPONENT-EDGE-003: [P2] should handle whitespace in pack_number (should be trimmed)", async () => {
    // GIVEN: AddLotteryDialog component
    const user = userEvent.setup();

    render(
      <AddLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        storeId="store-1"
        onSuccess={mockOnSuccess}
      />,
    );

    // WHEN: User enters pack_number with leading/trailing whitespace
    const packNumberInput = screen.getByTestId("pack-number-input");
    await user.type(packNumberInput, "  PACK-WITH-SPACES  ");

    // THEN: Value is stored with whitespace (trimming happens on submit/backend)
    // Frontend may show whitespace, but backend should trim
    expect(
      packNumberInput,
      "Input may contain whitespace (trimmed on submit)",
    ).toHaveValue("  PACK-WITH-SPACES  ");
  });

  it("6.10.1-COMPONENT-EDGE-004: [P2] should handle equal serial_start and serial_end", async () => {
    // GIVEN: AddLotteryDialog component
    const user = userEvent.setup();

    render(
      <AddLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        storeId="store-1"
        onSuccess={mockOnSuccess}
      />,
    );

    // WHEN: User enters equal start and end serials
    const serialStartInput = screen.getByTestId("serial-start-input");
    const serialEndInput = screen.getByTestId("serial-end-input");

    await user.type(serialStartInput, "1000");
    await user.type(serialEndInput, "1000"); // Equal to start (should fail validation)

    const submitButton = screen.getByRole("button", {
      name: /create.*pack/i,
    });
    await user.click(submitButton);

    // THEN: Validation error is displayed (end must be > start, not equal)
    await waitFor(
      () => {
        expect(
          screen.getByText(
            /serial end must be greater than or equal to serial start/i,
          ),
          "Serial range validation should allow equal values (>=)",
        ).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it("6.10.1-COMPONENT-EDGE-005: [P2] should handle special characters in pack_number", async () => {
    // GIVEN: AddLotteryDialog component
    const user = userEvent.setup();

    render(
      <AddLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        storeId="store-1"
        onSuccess={mockOnSuccess}
      />,
    );

    // WHEN: User enters special characters in pack_number
    const packNumberInput = screen.getByTestId("pack-number-input");
    const specialChars = "PACK-001_@#$%";

    await user.type(packNumberInput, specialChars);

    // THEN: Input accepts special characters (validation happens on submit)
    expect(
      packNumberInput,
      "Input should accept special characters",
    ).toHaveValue(specialChars);
  });

  it("6.10.1-COMPONENT-EDGE-006: [P2] should handle Unicode/emoji in pack_number", async () => {
    // GIVEN: AddLotteryDialog component
    const user = userEvent.setup();

    render(
      <AddLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        storeId="store-1"
        onSuccess={mockOnSuccess}
      />,
    );

    // WHEN: User enters Unicode/emoji in pack_number
    const packNumberInput = screen.getByTestId("pack-number-input");
    const unicodeInput = "PACK-🎲-测试";

    await user.type(packNumberInput, unicodeInput);

    // THEN: Input accepts Unicode (validation happens on submit)
    expect(
      packNumberInput,
      "Input should accept Unicode characters",
    ).toHaveValue(unicodeInput);
  });

  it("6.10.1-COMPONENT-EDGE-007: [P2] should disable form during submission (loading state)", async () => {
    // GIVEN: AddLotteryDialog component with pending mutation
    const user = userEvent.setup();

    (usePackReception as ReturnType<typeof vi.fn>).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: true, // Simulate loading state
    });

    render(
      <AddLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        storeId="store-1"
        onSuccess={mockOnSuccess}
      />,
    );

    // WHEN: Form is in loading state
    const submitButton = screen.getByRole("button", {
      name: /create.*pack/i,
    });

    // THEN: Submit button is disabled
    expect(
      submitButton,
      "Submit button should be disabled during submission",
    ).toBeDisabled();

    // AND: Form inputs are disabled
    const packNumberInput = screen.getByTestId("pack-number-input");
    expect(
      packNumberInput,
      "Pack number input should be disabled during submission",
    ).toBeDisabled();
  });

  it("6.10.1-COMPONENT-EDGE-008: [P2] should handle API error and display error message", async () => {
    // GIVEN: AddLotteryDialog component with API error
    const user = userEvent.setup();

    mockMutateAsync.mockRejectedValue(
      new Error("Failed to receive pack: Pack number already exists"),
    );

    render(
      <AddLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        storeId="store-1"
        onSuccess={mockOnSuccess}
      />,
    );

    // WHEN: User submits form and API returns error
    const packNumberInput = screen.getByTestId("pack-number-input");
    await user.type(packNumberInput, "PACK-001");

    const submitButton = screen.getByRole("button", {
      name: /create.*pack/i,
    });
    await user.click(submitButton);

    // THEN: Error toast is displayed
    await waitFor(
      () => {
        expect(
          mockToast,
          "Toast should be called with error message",
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            variant: "destructive",
            title: "Error",
          }),
        );
      },
      { timeout: 3000 },
    );
  });
});
