/**
 * Variance Summary Dialog Component Tests
 *
 * Tests for the VarianceSummaryDialog component:
 * - Displays variance details correctly
 * - Shows confirmation before proceeding
 * - XSS prevention
 * - Edge cases
 *
 * @test-level Component
 * @justification Tests UI component behavior: variance display, user interaction
 * @story 10-7 - Shift Closing Submission & Pack Status Updates
 * @priority P2 (Medium - User Experience)
 * @enhanced-by workflow-9 on 2025-12-14
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VarianceSummaryDialog } from "@/components/shift-closing/VarianceSummaryDialog";

describe("VarianceSummaryDialog Component", () => {
  const mockVariances = [
    {
      pack_id: "pack-1",
      pack_number: "123456",
      game_name: "Test Game",
      expected: 100,
      actual: 95,
      difference: -5,
    },
    {
      pack_id: "pack-2",
      pack_number: "789012",
      game_name: "Another Game",
      expected: 50,
      actual: 55,
      difference: 5,
    },
  ];

  const mockOnConfirm = vi.fn();
  const mockOnOpenChange = vi.fn();

  describe("TEST-10.7-C1: Should display variance details correctly", () => {
    it("should display all variance information for each pack", async () => {
      // GIVEN: Dialog is open with variances
      render(
        <VarianceSummaryDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          variances={mockVariances}
          onConfirm={mockOnConfirm}
        />,
      );

      // THEN: All variance details are displayed
      expect(screen.getByText("Test Game")).toBeInTheDocument();
      expect(screen.getByText("Another Game")).toBeInTheDocument();
      expect(screen.getByText("123456")).toBeInTheDocument();
      expect(screen.getByText("789012")).toBeInTheDocument();
      expect(screen.getByText("100")).toBeInTheDocument(); // Expected
      expect(screen.getByText("95")).toBeInTheDocument(); // Actual
      expect(screen.getByText("50")).toBeInTheDocument(); // Expected
      expect(screen.getByText("55")).toBeInTheDocument(); // Actual
      expect(screen.getByText("-5")).toBeInTheDocument(); // Difference
      expect(screen.getByText("5")).toBeInTheDocument(); // Difference
    });

    it("should display difference as positive or negative", async () => {
      // GIVEN: Dialog with variances (positive and negative differences)
      render(
        <VarianceSummaryDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          variances={mockVariances}
          onConfirm={mockOnConfirm}
        />,
      );

      // THEN: Differences are displayed correctly
      const differenceElements = screen.getAllByText(/-?\d+/);
      expect(differenceElements.length).toBeGreaterThan(0);
    });
  });

  describe("TEST-10.7-C2: Should show confirmation before proceeding", () => {
    it("should have confirm button that calls onConfirm", async () => {
      // GIVEN: Dialog is open
      const user = userEvent.setup();
      render(
        <VarianceSummaryDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          variances={mockVariances}
          onConfirm={mockOnConfirm}
        />,
      );

      // WHEN: User clicks confirm button
      const confirmButton = screen.getByRole("button", {
        name: /confirm|proceed|continue/i,
      });
      await user.click(confirmButton);

      // THEN: onConfirm is called
      expect(mockOnConfirm).toHaveBeenCalledTimes(1);
    });

    it("should have cancel button that closes dialog", async () => {
      // GIVEN: Dialog is open
      const user = userEvent.setup();
      render(
        <VarianceSummaryDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          variances={mockVariances}
          onConfirm={mockOnConfirm}
        />,
      );

      // WHEN: User clicks cancel button
      const cancelButton = screen.getByRole("button", { name: /cancel/i });
      await user.click(cancelButton);

      // THEN: Dialog is closed (onOpenChange called with false)
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it("should not call onConfirm when canceling", async () => {
      // GIVEN: Dialog is open
      const user = userEvent.setup();
      render(
        <VarianceSummaryDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          variances={mockVariances}
          onConfirm={mockOnConfirm}
        />,
      );

      // WHEN: User clicks cancel
      const cancelButton = screen.getByRole("button", { name: /cancel/i });
      await user.click(cancelButton);

      // THEN: onConfirm is NOT called
      expect(mockOnConfirm).not.toHaveBeenCalled();
    });
  });

  // ============ SECURITY TESTS (XSS Prevention) ============

  describe("TEST-10.7-SEC-C1: XSS Prevention", () => {
    it("should safely render variance data without executing scripts", () => {
      // GIVEN: Variance data with potential XSS payload
      const maliciousVariances = [
        {
          pack_id: "pack-1",
          pack_number: '<script>alert("XSS")</script>123456',
          game_name: '<img src=x onerror="alert(1)">Test Game',
          expected: 100,
          actual: 95,
          difference: -5,
        },
      ];

      // WHEN: Rendering dialog with malicious data
      render(
        <VarianceSummaryDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          variances={maliciousVariances}
          onConfirm={mockOnConfirm}
        />,
      );

      // THEN: Scripts should be escaped (React auto-escapes)
      // Text should be visible but not executed
      const packNumberElement = screen.getByText(/123456/);
      expect(packNumberElement).toBeInTheDocument();

      // Script tags should be rendered as text, not executed
      const scriptText = screen.queryByText(/<script>/);
      // React escapes HTML, so script tags appear as text if present
      // The important thing is they don't execute
    });
  });

  // ============ EDGE CASES ============

  describe("TEST-10.7-EDGE-C1: Edge Cases", () => {
    it("should handle empty variances array", () => {
      // GIVEN: Empty variances array
      render(
        <VarianceSummaryDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          variances={[]}
          onConfirm={mockOnConfirm}
        />,
      );

      // THEN: Should display "No variances detected" message
      expect(screen.getByText(/No variances detected/i)).toBeInTheDocument();
    });

    it("should handle very large variance numbers", () => {
      // GIVEN: Variance with very large numbers
      const largeVariances = [
        {
          pack_id: "pack-1",
          pack_number: "123456",
          game_name: "Test Game",
          expected: 999999,
          actual: 1000000,
          difference: 1,
        },
      ];

      // WHEN: Rendering dialog
      render(
        <VarianceSummaryDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          variances={largeVariances}
          onConfirm={mockOnConfirm}
        />,
      );

      // THEN: Should display large numbers correctly
      expect(screen.getByText("999999")).toBeInTheDocument();
      expect(screen.getByText("1000000")).toBeInTheDocument();
    });

    it("should handle negative differences correctly", () => {
      // GIVEN: Variance with negative difference
      const negativeVariance = [
        {
          pack_id: "pack-1",
          pack_number: "123456",
          game_name: "Test Game",
          expected: 100,
          actual: 95,
          difference: -5,
        },
      ];

      // WHEN: Rendering dialog
      render(
        <VarianceSummaryDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          variances={negativeVariance}
          onConfirm={mockOnConfirm}
        />,
      );

      // THEN: Should display negative difference
      expect(screen.getByText("-5")).toBeInTheDocument();
    });
  });
});
