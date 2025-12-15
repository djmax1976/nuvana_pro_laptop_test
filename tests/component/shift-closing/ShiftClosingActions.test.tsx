/**
 * Shift Closing Actions Component Tests
 *
 * Tests for the action buttons component:
 * - Next button disabled when entries incomplete
 * - Next button enabled when all active bins have 3-digit entries
 * - All action buttons rendered
 *
 * @test-level Component
 * @justification Tests UI component behavior and button state management
 * @story 10-1 - Lottery Shift Closing Page UI
 * @priority P1 (High - Form Validation)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen } from "../../support/test-utils";
import userEvent from "@testing-library/user-event";

describe("10-1-COMPONENT: ShiftClosingActions", () => {
  const mockOnAddBin = vi.fn();
  const mockOnActivatePack = vi.fn();
  const mockOnManualEntry = vi.fn();
  const mockOnNext = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("10-1-COMPONENT-016: should disable Next button when entries incomplete", async () => {
    // GIVEN: Not all active bins have valid entries (canProceed = false)
    // WHEN: Component is rendered
    // Note: Component doesn't exist yet, test will fail (RED phase)
    const { ShiftClosingActions } =
      await import("@/components/shift-closing/ShiftClosingActions");
    renderWithProviders(
      <ShiftClosingActions
        canProceed={false}
        onAddBin={mockOnAddBin}
        onActivatePack={mockOnActivatePack}
        onManualEntry={mockOnManualEntry}
        onNext={mockOnNext}
      />,
    );

    const nextButton = screen.getByTestId("next-button");

    // THEN: Next button is disabled
    expect(nextButton).toBeDisabled();
  });

  it("10-1-COMPONENT-017: should enable Next button when all active bins have 3-digit entries", async () => {
    // GIVEN: All active bins have valid entries (canProceed = true)
    // WHEN: Component is rendered
    const { ShiftClosingActions } =
      await import("@/components/shift-closing/ShiftClosingActions");
    renderWithProviders(
      <ShiftClosingActions
        canProceed={true}
        onAddBin={mockOnAddBin}
        onActivatePack={mockOnActivatePack}
        onManualEntry={mockOnManualEntry}
        onNext={mockOnNext}
      />,
    );

    const nextButton = screen.getByTestId("next-button");

    // THEN: Next button is enabled
    expect(nextButton).toBeEnabled();
  });

  it("10-1-COMPONENT-018: should render all action buttons", async () => {
    // GIVEN: Component with all handlers
    // WHEN: Component is rendered
    const { ShiftClosingActions } =
      await import("@/components/shift-closing/ShiftClosingActions");
    renderWithProviders(
      <ShiftClosingActions
        canProceed={false}
        onAddBin={mockOnAddBin}
        onActivatePack={mockOnActivatePack}
        onManualEntry={mockOnManualEntry}
        onNext={mockOnNext}
      />,
    );

    // THEN: All action buttons are displayed
    expect(screen.getByText("+ Add Bin")).toBeInTheDocument();
    expect(screen.getByText("Activate Pack")).toBeInTheDocument();
    expect(screen.getByText("Manual Entry")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
  });

  // ============ AUTOMATIC ASSERTIONS ============

  it("10-1-COMPONENT-ASSERT-006: should have correct data-testid attributes", async () => {
    // GIVEN: Component with all handlers
    // WHEN: Component is rendered
    const { ShiftClosingActions } =
      await import("@/components/shift-closing/ShiftClosingActions");
    renderWithProviders(
      <ShiftClosingActions
        canProceed={false}
        onAddBin={mockOnAddBin}
        onActivatePack={mockOnActivatePack}
        onManualEntry={mockOnManualEntry}
        onNext={mockOnNext}
      />,
    );

    // THEN: All buttons have data-testid attributes
    expect(screen.getByTestId("shift-closing-actions")).toBeInTheDocument();
    expect(screen.getByTestId("add-bin-button")).toBeInTheDocument();
    expect(screen.getByTestId("activate-pack-button")).toBeInTheDocument();
    expect(screen.getByTestId("manual-entry-button")).toBeInTheDocument();
    expect(screen.getByTestId("next-button")).toBeInTheDocument();
  });

  it("10-1-COMPONENT-ASSERT-007: should have correct button states", async () => {
    // GIVEN: Component with canProceed = false
    // WHEN: Component is rendered
    const { ShiftClosingActions } =
      await import("@/components/shift-closing/ShiftClosingActions");
    renderWithProviders(
      <ShiftClosingActions
        canProceed={false}
        onAddBin={mockOnAddBin}
        onActivatePack={mockOnActivatePack}
        onManualEntry={mockOnManualEntry}
        onNext={mockOnNext}
      />,
    );

    // THEN: Next button is disabled
    const nextButton = screen.getByTestId("next-button");
    expect(nextButton).toBeDisabled();
    expect(nextButton).toHaveClass("cursor-not-allowed");

    // AND: Other buttons are enabled
    expect(screen.getByTestId("add-bin-button")).toBeEnabled();
    expect(screen.getByTestId("activate-pack-button")).toBeEnabled();
    expect(screen.getByTestId("manual-entry-button")).toBeEnabled();
  });

  // ============ EDGE CASES ============

  it("10-1-COMPONENT-EDGE-017: should handle rapid button clicks", async () => {
    // GIVEN: Component with handlers
    const { ShiftClosingActions } =
      await import("@/components/shift-closing/ShiftClosingActions");
    const user = userEvent.setup();
    renderWithProviders(
      <ShiftClosingActions
        canProceed={true}
        onAddBin={mockOnAddBin}
        onActivatePack={mockOnActivatePack}
        onManualEntry={mockOnManualEntry}
        onNext={mockOnNext}
      />,
    );

    // WHEN: User rapidly clicks Next button multiple times
    const nextButton = screen.getByTestId("next-button");
    await user.click(nextButton);
    await user.click(nextButton);
    await user.click(nextButton);

    // THEN: Handler is called for each click
    expect(mockOnNext).toHaveBeenCalledTimes(3);
  });

  it("10-1-COMPONENT-EDGE-018: should handle keyboard navigation", async () => {
    // GIVEN: Component with handlers
    const { ShiftClosingActions } =
      await import("@/components/shift-closing/ShiftClosingActions");
    const user = userEvent.setup();
    renderWithProviders(
      <ShiftClosingActions
        canProceed={true}
        onAddBin={mockOnAddBin}
        onActivatePack={mockOnActivatePack}
        onManualEntry={mockOnManualEntry}
        onNext={mockOnNext}
      />,
    );

    // WHEN: User navigates with Tab and activates with Enter
    const addBinButton = screen.getByTestId("add-bin-button");
    await user.tab();
    await user.keyboard("{Enter}");

    // THEN: Handler is called
    expect(mockOnAddBin).toHaveBeenCalled();
  });

  it("10-1-COMPONENT-EDGE-019: should handle disabled Next button click attempt", async () => {
    // GIVEN: Component with canProceed = false
    const { ShiftClosingActions } =
      await import("@/components/shift-closing/ShiftClosingActions");
    const user = userEvent.setup();
    renderWithProviders(
      <ShiftClosingActions
        canProceed={false}
        onAddBin={mockOnAddBin}
        onActivatePack={mockOnActivatePack}
        onManualEntry={mockOnManualEntry}
        onNext={mockOnNext}
      />,
    );

    // WHEN: User tries to click disabled Next button
    const nextButton = screen.getByTestId("next-button");
    await user.click(nextButton);

    // THEN: Handler is not called (button is disabled)
    expect(mockOnNext).not.toHaveBeenCalled();
  });

  it("10-1-COMPONENT-EDGE-020: should have responsive layout classes", async () => {
    // GIVEN: Component with handlers
    // WHEN: Component is rendered
    const { ShiftClosingActions } =
      await import("@/components/shift-closing/ShiftClosingActions");
    renderWithProviders(
      <ShiftClosingActions
        canProceed={false}
        onAddBin={mockOnAddBin}
        onActivatePack={mockOnActivatePack}
        onManualEntry={mockOnManualEntry}
        onNext={mockOnNext}
      />,
    );

    // THEN: Container has responsive flex classes
    const container = screen.getByTestId("shift-closing-actions");
    expect(container).toHaveClass("flex", "flex-col", "sm:flex-row");
  });
});
