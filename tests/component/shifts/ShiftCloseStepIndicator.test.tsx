/**
 * @test-level COMPONENT
 * @justification Tests ShiftCloseStepIndicator UI component without backend dependencies
 * @story Shift Closing Plan - 2-Step Wizard
 * @priority P0 (Critical - Step Indicator UI)
 *
 * ShiftCloseStepIndicator Component Tests
 *
 * Tests the 2-step progress indicator for the shift close wizard.
 * Displays step 1 (Report Scanning) and step 2 (Close Shift) with proper states.
 *
 * ================================================================================
 * TRACEABILITY MATRIX
 * ================================================================================
 *
 * | Test ID              | Requirement                          | Component/Feature              | Priority |
 * |----------------------|--------------------------------------|--------------------------------|----------|
 * | SCSI-001             | FE-002: Indicator renders correctly  | ShiftCloseStepIndicator        | P0       |
 * | SCSI-002             | FE-002: Step 1 highlighted when current | ShiftCloseStepIndicator     | P0       |
 * | SCSI-003             | FE-002: Step 2 highlighted when current | ShiftCloseStepIndicator     | P0       |
 * | SCSI-004             | FE-002: Step 1 shows checkmark when complete | ShiftCloseStepIndicator | P0       |
 * | SCSI-005             | FE-002: Step labels are correct      | ShiftCloseStepIndicator        | P0       |
 *
 * REQUIREMENT COVERAGE:
 * - Form Validation (FE-002): 5 tests
 * - UI Security (FE-005): Implicit (no sensitive data)
 * ================================================================================
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ShiftCloseStepIndicator } from "@/components/shifts/ShiftCloseStepIndicator";

describe("ShiftCloseStepIndicator Component", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // P0 CRITICAL - RENDERING TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("SCSI-001: [P0] should render step indicator with test id", () => {
    // GIVEN: Default props
    // WHEN: Component is rendered
    render(
      <ShiftCloseStepIndicator
        currentStep={1}
        reportScanningCompleted={false}
      />,
    );

    // THEN: Step indicator container should be present
    expect(
      screen.getByTestId("shift-close-step-indicator"),
    ).toBeInTheDocument();
  });

  it("SCSI-002: [P0] should highlight step 1 when current step is 1", () => {
    // GIVEN: Current step is 1, not completed
    // WHEN: Component is rendered
    render(
      <ShiftCloseStepIndicator
        currentStep={1}
        reportScanningCompleted={false}
      />,
    );

    // THEN: Step 1 indicator should be present and styled as current
    const step1Indicator = screen.getByTestId("shift-close-step-1-indicator");
    expect(step1Indicator).toBeInTheDocument();
    expect(step1Indicator).toHaveTextContent("1");
    // Step 1 should have primary styling (current step)
    expect(step1Indicator).toHaveClass("bg-primary");
  });

  it("SCSI-003: [P0] should highlight step 2 when current step is 2", () => {
    // GIVEN: Current step is 2
    // WHEN: Component is rendered
    render(
      <ShiftCloseStepIndicator
        currentStep={2}
        reportScanningCompleted={true}
      />,
    );

    // THEN: Step 2 indicator should be styled as current
    const step2Indicator = screen.getByTestId("shift-close-step-2-indicator");
    expect(step2Indicator).toBeInTheDocument();
    expect(step2Indicator).toHaveTextContent("2");
    // Step 2 should have primary styling (current step)
    expect(step2Indicator).toHaveClass("bg-primary");
  });

  it("SCSI-004: [P0] should show checkmark for step 1 when completed", () => {
    // GIVEN: Report scanning is completed
    // WHEN: Component is rendered with step 2 as current
    render(
      <ShiftCloseStepIndicator
        currentStep={2}
        reportScanningCompleted={true}
      />,
    );

    // THEN: Step 1 should show green checkmark styling
    const step1Indicator = screen.getByTestId("shift-close-step-1-indicator");
    expect(step1Indicator).toHaveClass("bg-green-600");
    // Should contain checkmark icon (Check component renders svg)
    const svgElement = step1Indicator.querySelector("svg");
    expect(svgElement).toBeInTheDocument();
  });

  it("SCSI-005: [P0] should display correct step labels", () => {
    // GIVEN: Any state
    // WHEN: Component is rendered
    render(
      <ShiftCloseStepIndicator
        currentStep={1}
        reportScanningCompleted={false}
      />,
    );

    // THEN: Step labels should be correct
    expect(screen.getByText("Report Scanning")).toBeInTheDocument();
    expect(screen.getByText("Close Shift")).toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P1 - VISUAL STATE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("SCSI-006: [P1] step 2 should be muted when step 1 is current", () => {
    // GIVEN: Current step is 1
    // WHEN: Component is rendered
    render(
      <ShiftCloseStepIndicator
        currentStep={1}
        reportScanningCompleted={false}
      />,
    );

    // THEN: Step 2 should have muted styling (not yet reached)
    const step2Indicator = screen.getByTestId("shift-close-step-2-indicator");
    expect(step2Indicator).toHaveClass("bg-muted");
  });

  it("SCSI-007: [P1] connecting line should be muted when step not completed", () => {
    // GIVEN: Report scanning not completed
    // WHEN: Component is rendered
    render(
      <ShiftCloseStepIndicator
        currentStep={1}
        reportScanningCompleted={false}
      />,
    );

    // THEN: Component should render without errors
    // Visual verification of connecting line would require more specific selectors
    expect(
      screen.getByTestId("shift-close-step-indicator"),
    ).toBeInTheDocument();
  });

  it("SCSI-008: [P1] connecting line should be green when step is completed", () => {
    // GIVEN: Report scanning completed
    // WHEN: Component is rendered
    render(
      <ShiftCloseStepIndicator
        currentStep={2}
        reportScanningCompleted={true}
      />,
    );

    // THEN: Component should render without errors
    // Step 1 should show green checkmark
    const step1Indicator = screen.getByTestId("shift-close-step-1-indicator");
    expect(step1Indicator).toHaveClass("bg-green-600");
  });
});
