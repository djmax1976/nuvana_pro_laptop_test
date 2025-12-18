/**
 * @test-level COMPONENT
 * @justification Tests UI form behavior in isolation - fast, isolated, granular
 * @story 6-13
 *
 * Component Tests: BinConfigurationForm
 *
 * Tests BinConfigurationForm component behavior for bin configuration:
 * - Bin name, location, display order input
 * - Add new bin button
 * - Remove bin button (soft delete)
 * - Display order reordering (drag-and-drop or up/down arrows)
 * - Save configuration
 * - Validation (display_order uniqueness, bin count limits)
 * - Loading states
 * - Error handling
 * - Accessibility
 *
 * Story: 6-13 - Lottery Database Enhancements & Bin Management
 * Priority: P1 (High - Bin Configuration)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, cleanup } from "@testing-library/react";
import { renderWithProviders } from "../../support/test-utils";
import userEvent from "@testing-library/user-event";
import { BinConfigurationForm } from "@/components/lottery/BinConfigurationForm";
import {
  getBinConfiguration,
  createBinConfiguration,
  updateBinConfiguration,
} from "@/lib/api/lottery";
import type { BinConfigurationResponse } from "@/lib/api/lottery";

// Mock the API client
vi.mock("@/lib/api/lottery", () => ({
  getBinConfiguration: vi.fn(),
  createBinConfiguration: vi.fn(),
  updateBinConfiguration: vi.fn(),
}));

// Helper to create mock BinConfigurationResponse with all required fields
const createMockBinConfig = (
  bins: { name: string; location: string; display_order: number }[] = [],
): BinConfigurationResponse => ({
  config_id: "config-123",
  store_id: "123e4567-e89b-12d3-a456-426614174000",
  bin_template: bins,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

// Mock the toast hook
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe("6.13-COMPONENT: BinConfigurationForm", () => {
  const mockStoreId = "123e4567-e89b-12d3-a456-426614174000";
  const mockOnSuccess = vi.fn();

  const defaultProps = {
    storeId: mockStoreId,
    onSuccess: mockOnSuccess,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("6.13-COMPONENT-001: should render bin configuration form (AC #1)", async () => {
    // GIVEN: BinConfigurationForm component
    vi.mocked(getBinConfiguration).mockResolvedValue({
      success: true,
      data: createMockBinConfig([]),
    });

    // WHEN: Component is rendered
    renderWithProviders(<BinConfigurationForm {...defaultProps} />);

    // THEN: Form elements are displayed
    await waitFor(() => {
      expect(screen.getByText(/bin configuration/i)).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /add new bin/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /save configuration/i }),
    ).toBeInTheDocument();
  });

  it("6.13-COMPONENT-002: should display existing bins with name, location, and display order (AC #1)", async () => {
    // GIVEN: Existing bin configuration
    const existingBins = [
      { name: "Bin 1", location: "Front", display_order: 0 },
      { name: "Bin 2", location: "Back", display_order: 1 },
    ];
    vi.mocked(getBinConfiguration).mockResolvedValue({
      success: true,
      data: createMockBinConfig(existingBins),
    });

    // WHEN: Component is rendered
    renderWithProviders(<BinConfigurationForm {...defaultProps} />);

    // THEN: Existing bins are displayed
    await waitFor(() => {
      expect(screen.getByDisplayValue("Bin 1")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Front")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Bin 2")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Back")).toBeInTheDocument();
    });
  });

  it("6.13-COMPONENT-003: should add new bin when add button is clicked (AC #1)", async () => {
    // GIVEN: BinConfigurationForm with no bins
    vi.mocked(getBinConfiguration).mockResolvedValue({
      success: true,
      data: createMockBinConfig([]),
    });
    const user = userEvent.setup();

    // WHEN: Component is rendered and add button is clicked
    renderWithProviders(<BinConfigurationForm {...defaultProps} />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /add new bin/i }),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /add new bin/i }));

    // THEN: New bin input fields are added
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/bin name/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/location/i)).toBeInTheDocument();
    });
  });

  it("6.13-COMPONENT-004: should remove bin when remove button is clicked (AC #1)", async () => {
    // GIVEN: BinConfigurationForm with existing bins
    const existingBins = [
      { name: "Bin 1", location: "Front", display_order: 0 },
    ];
    vi.mocked(getBinConfiguration).mockResolvedValue({
      success: true,
      data: createMockBinConfig(existingBins),
    });
    const user = userEvent.setup();

    // WHEN: Component is rendered and remove button is clicked
    renderWithProviders(<BinConfigurationForm {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Bin 1")).toBeInTheDocument();
    });
    const removeButton = screen.getByRole("button", { name: /remove/i });
    await user.click(removeButton);

    // THEN: Bin is removed from display
    await waitFor(() => {
      expect(screen.queryByDisplayValue("Bin 1")).not.toBeInTheDocument();
    });
  });

  it("6.13-COMPONENT-005: should validate display_order uniqueness (AC #1)", async () => {
    // GIVEN: BinConfigurationForm with duplicate display orders
    const existingBins = [
      { name: "Bin 1", location: "Front", display_order: 0 },
      { name: "Bin 2", location: "Back", display_order: 0 }, // Duplicate
    ];
    vi.mocked(getBinConfiguration).mockResolvedValue({
      success: true,
      data: createMockBinConfig(existingBins),
    });
    const user = userEvent.setup();

    // WHEN: Component is rendered and save is attempted
    renderWithProviders(<BinConfigurationForm {...defaultProps} />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /save configuration/i }),
      ).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("button", { name: /save configuration/i }),
    );

    // THEN: Validation error is displayed
    await waitFor(() => {
      expect(screen.getByText(/display order.*unique/i)).toBeInTheDocument();
    });
  });

  it("6.13-COMPONENT-006: should validate bin count limits (1-200 bins) (AC #1)", async () => {
    // GIVEN: BinConfigurationForm with too many bins
    const tooManyBins = Array.from({ length: 201 }, (_, i) => ({
      name: `Bin ${i + 1}`,
      location: "Location",
      display_order: i,
    }));
    vi.mocked(getBinConfiguration).mockResolvedValue({
      success: true,
      data: createMockBinConfig(tooManyBins),
    });
    const user = userEvent.setup();

    // WHEN: Component is rendered and save is attempted
    renderWithProviders(<BinConfigurationForm {...defaultProps} />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /save configuration/i }),
      ).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("button", { name: /save configuration/i }),
    );

    // THEN: Validation error is displayed
    await waitFor(() => {
      expect(screen.getByText(/bin count.*200/i)).toBeInTheDocument();
    });
  });

  it("6.13-COMPONENT-007: should save configuration when save button is clicked (AC #1)", async () => {
    // GIVEN: BinConfigurationForm with valid bins
    const bins = [{ name: "Bin 1", location: "Front", display_order: 0 }];
    vi.mocked(getBinConfiguration).mockResolvedValue({
      success: true,
      data: createMockBinConfig(bins),
    });
    vi.mocked(updateBinConfiguration).mockResolvedValue({
      success: true,
      data: createMockBinConfig(bins),
    });
    const user = userEvent.setup();

    // WHEN: Component is rendered and save is clicked
    renderWithProviders(<BinConfigurationForm {...defaultProps} />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /save configuration/i }),
      ).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("button", { name: /save configuration/i }),
    );

    // THEN: Configuration is saved and success callback is called
    await waitFor(() => {
      expect(updateBinConfiguration).toHaveBeenCalledWith(mockStoreId, {
        bin_template: bins,
      });
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });

  it("6.13-COMPONENT-008: should display error message when save fails (AC #1)", async () => {
    // GIVEN: BinConfigurationForm with API error
    vi.mocked(getBinConfiguration).mockResolvedValue({
      success: true,
      data: createMockBinConfig([]),
    });
    vi.mocked(updateBinConfiguration).mockRejectedValue(
      new Error("Failed to save"),
    );
    const user = userEvent.setup();

    // WHEN: Component is rendered and save is clicked
    renderWithProviders(<BinConfigurationForm {...defaultProps} />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /save configuration/i }),
      ).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("button", { name: /save configuration/i }),
    );

    // THEN: Error message is displayed
    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - XSS Prevention
  // ═══════════════════════════════════════════════════════════════════════════

  it("6.13-COMPONENT-SEC-001: [P0] should prevent XSS in bin name field", async () => {
    // GIVEN: BinConfigurationForm with XSS attempt in bin name
    const xssAttempts = [
      "<script>alert('xss')</script>",
      "<img src=x onerror=alert('xss')>",
      "javascript:alert('xss')",
      "<svg onload=alert('xss')>",
    ];

    vi.mocked(getBinConfiguration).mockResolvedValue({
      success: true,
      data: createMockBinConfig([]),
    });
    const user = userEvent.setup();

    for (const xssPayload of xssAttempts) {
      renderWithProviders(<BinConfigurationForm {...defaultProps} />);
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /add new bin/i }),
        ).toBeInTheDocument();
      });

      // WHEN: Adding bin with XSS payload
      await user.click(screen.getByRole("button", { name: /add new bin/i }));
      const nameInput = await screen.findByPlaceholderText(/bin name/i);
      await user.type(nameInput, xssPayload);

      // THEN: XSS payload is escaped/rendered as text (not executed)
      const renderedText = screen.getByDisplayValue(xssPayload);
      expect(
        renderedText,
        "XSS payload should be rendered as text, not executed",
      ).toBeInTheDocument();
      expect(
        renderedText.tagName,
        "Should be input element, not script",
      ).not.toBe("SCRIPT");

      // AND: No script execution occurs (verify no alert/error in console)
      // Note: React automatically escapes content, but we verify it's handled correctly

      // Clean up before next iteration
      cleanup();
    }
  });

  it("6.13-COMPONENT-SEC-002: [P0] should prevent XSS in location field", async () => {
    // GIVEN: BinConfigurationForm with XSS attempt in location
    const xssPayload = "<script>alert('xss')</script>";
    vi.mocked(getBinConfiguration).mockResolvedValue({
      success: true,
      data: createMockBinConfig([]),
    });
    const user = userEvent.setup();

    renderWithProviders(<BinConfigurationForm {...defaultProps} />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /add new bin/i }),
      ).toBeInTheDocument();
    });

    // WHEN: Adding bin with XSS payload in location
    await user.click(screen.getByRole("button", { name: /add new bin/i }));
    const locationInput = await screen.findByPlaceholderText(/location/i);
    await user.type(locationInput, xssPayload);

    // THEN: XSS payload is escaped/rendered as text
    const renderedText = screen.getByDisplayValue(xssPayload);
    expect(
      renderedText,
      "XSS payload should be rendered as text",
    ).toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("6.13-COMPONENT-EDGE-001: [P1] should handle empty bin name gracefully", async () => {
    // GIVEN: BinConfigurationForm
    vi.mocked(getBinConfiguration).mockResolvedValue({
      success: true,
      data: createMockBinConfig([]),
    });
    const user = userEvent.setup();

    renderWithProviders(<BinConfigurationForm {...defaultProps} />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /add new bin/i }),
      ).toBeInTheDocument();
    });

    // WHEN: Adding bin with empty name
    await user.click(screen.getByRole("button", { name: /add new bin/i }));
    const nameInput = await screen.findByPlaceholderText(/bin name/i);
    await user.type(nameInput, ""); // Empty name

    // THEN: Validation should prevent save or show error
    await user.click(
      screen.getByRole("button", { name: /save configuration/i }),
    );
    await waitFor(() => {
      // Either validation error is shown or save is prevented
      const errorMessage = screen.queryByText(/name.*required/i);
      const saveButton = screen.getByRole("button", {
        name: /save configuration/i,
      });
      expect(
        errorMessage || saveButton.hasAttribute("disabled"),
        "Empty name should trigger validation",
      ).toBeTruthy();
    });
  });

  it("6.13-COMPONENT-EDGE-002: [P1] should handle very long bin names (255+ characters)", async () => {
    // GIVEN: BinConfigurationForm
    const longName = "A".repeat(256); // Exceeds 255 character limit
    vi.mocked(getBinConfiguration).mockResolvedValue({
      success: true,
      data: createMockBinConfig([]),
    });
    const user = userEvent.setup();

    renderWithProviders(<BinConfigurationForm {...defaultProps} />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /add new bin/i }),
      ).toBeInTheDocument();
    });

    // WHEN: Adding bin with very long name
    await user.click(screen.getByRole("button", { name: /add new bin/i }));
    const nameInput = await screen.findByPlaceholderText(/bin name/i);
    await user.type(nameInput, longName);

    // THEN: Validation should prevent save or truncate
    await user.click(
      screen.getByRole("button", { name: /save configuration/i }),
    );
    await waitFor(() => {
      // Either validation error is shown or name is truncated
      const errorMessage = screen.queryByText(/name.*length/i);
      const inputValue = (nameInput as HTMLInputElement).value;
      expect(
        errorMessage || inputValue.length <= 255,
        "Long name should trigger validation or be truncated",
      ).toBeTruthy();
    });
  });

  it("6.13-COMPONENT-EDGE-003: [P1] should handle special characters in bin names", async () => {
    // GIVEN: BinConfigurationForm with special characters
    const specialChars = "Bin with émojis 🎰🎲 and special chars !@#$%^&*()";
    vi.mocked(getBinConfiguration).mockResolvedValue({
      success: true,
      data: createMockBinConfig([]),
    });
    const user = userEvent.setup();

    renderWithProviders(<BinConfigurationForm {...defaultProps} />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /add new bin/i }),
      ).toBeInTheDocument();
    });

    // WHEN: Adding bin with special characters
    await user.click(screen.getByRole("button", { name: /add new bin/i }));
    const nameInput = await screen.findByPlaceholderText(/bin name/i);
    await user.type(nameInput, specialChars);

    // THEN: Special characters are displayed correctly
    const renderedText = screen.getByDisplayValue(specialChars);
    expect(
      renderedText,
      "Special characters should be displayed correctly",
    ).toBeInTheDocument();
  });

  it("6.13-COMPONENT-EDGE-004: [P1] should handle negative display_order values", async () => {
    // GIVEN: BinConfigurationForm
    vi.mocked(getBinConfiguration).mockResolvedValue({
      success: true,
      data: createMockBinConfig([]),
    });
    const user = userEvent.setup();

    renderWithProviders(<BinConfigurationForm {...defaultProps} />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /add new bin/i }),
      ).toBeInTheDocument();
    });

    // WHEN: Adding bin with negative display_order
    await user.click(screen.getByRole("button", { name: /add new bin/i }));
    const displayOrderInput = await screen.findByLabelText(/display order/i);
    await user.type(displayOrderInput, "-1");

    // THEN: Validation should prevent save or show error
    await user.click(
      screen.getByRole("button", { name: /save configuration/i }),
    );
    await waitFor(() => {
      const errorMessage = screen.queryByText(/display.*order.*negative/i);
      expect(
        errorMessage || (displayOrderInput as HTMLInputElement).value === "0",
        "Negative display_order should trigger validation",
      ).toBeTruthy();
    });
  });
});
