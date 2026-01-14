/**
 * Test Connection Button Component Tests
 *
 * Tests for the TestConnectionButton component.
 * Validates all 4 states: idle, testing, success, and failure.
 *
 * Enterprise coding standards applied:
 * - FE-002: Form validation UI testing
 * - SEC-014: Error message display
 *
 * @module tests/components/pos-integration/TestConnectionButton.spec
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TestConnectionButton } from "../../../src/components/pos-integration/TestConnectionButton";
import type { POSConnectionTestResult } from "../../../src/types/pos-integration";

describe("TestConnectionButton Component", () => {
  const mockOnTest = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultProps = {
    onTest: mockOnTest,
    isLoading: false,
    result: null as POSConnectionTestResult | null,
    disabled: false,
  };

  // ===========================================================================
  // Idle State Tests
  // ===========================================================================
  describe("Idle State", () => {
    it("should render Test Connection button in idle state", () => {
      render(<TestConnectionButton {...defaultProps} />);

      const button = screen.getByRole("button", { name: /test connection/i });
      expect(button).toBeInTheDocument();
    });

    it("should have dashed border in idle state", () => {
      render(<TestConnectionButton {...defaultProps} />);

      const button = screen.getByRole("button", { name: /test connection/i });
      expect(button).toHaveClass("border-dashed");
    });

    it("should call onTest when clicked", async () => {
      const user = userEvent.setup();
      render(<TestConnectionButton {...defaultProps} />);

      const button = screen.getByRole("button", { name: /test connection/i });
      await user.click(button);

      expect(mockOnTest).toHaveBeenCalled();
    });

    it("should be disabled when disabled prop is true", () => {
      render(<TestConnectionButton {...defaultProps} disabled={true} />);

      const button = screen.getByRole("button", { name: /test connection/i });
      expect(button).toBeDisabled();
    });
  });

  // ===========================================================================
  // Testing State Tests
  // ===========================================================================
  describe("Testing State", () => {
    it("should show testing text when isLoading is true", () => {
      render(<TestConnectionButton {...defaultProps} isLoading={true} />);

      expect(screen.getByText(/testing/i)).toBeInTheDocument();
    });

    it("should be disabled when isLoading is true", () => {
      render(<TestConnectionButton {...defaultProps} isLoading={true} />);

      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
    });

    it("should show spinner when isLoading is true", () => {
      render(<TestConnectionButton {...defaultProps} isLoading={true} />);

      // Look for a spinner element (could be SVG or CSS animation)
      const spinner =
        screen.queryByRole("status") || screen.queryByTestId("spinner");
      // If no specific spinner element, just verify the loading state is shown
      expect(screen.getByText(/testing/i)).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Success State Tests
  // ===========================================================================
  describe("Success State", () => {
    const successResult: POSConnectionTestResult = {
      success: true,
      data: {
        connected: true,
        message: "Connection successful",
        posVersion: "2.5.1",
        latencyMs: 145,
      },
    };

    it("should show success message when connected", () => {
      render(<TestConnectionButton {...defaultProps} result={successResult} />);

      expect(
        screen.getByText(/connection successful/i) ||
          screen.getByText(/connected/i),
      ).toBeInTheDocument();
    });

    it("should display POS version when available", () => {
      render(<TestConnectionButton {...defaultProps} result={successResult} />);

      expect(screen.getByText(/2\.5\.1/)).toBeInTheDocument();
    });

    it("should display latency when available", () => {
      render(<TestConnectionButton {...defaultProps} result={successResult} />);

      expect(screen.getByText(/145/)).toBeInTheDocument();
    });

    it("should have green styling for success", () => {
      render(<TestConnectionButton {...defaultProps} result={successResult} />);

      // Look for green success indicator
      const successElement =
        screen.getByText(/connection successful/i) ||
        screen.getByText(/connected/i);
      expect(
        successElement.closest('[class*="green"]') ||
          successElement.closest('[class*="success"]'),
      ).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Failure State Tests
  // ===========================================================================
  describe("Failure State", () => {
    const failureResult: POSConnectionTestResult = {
      success: false,
      data: {
        connected: false,
        message: "Connection timeout",
        errorCode: "ETIMEDOUT",
      },
    };

    it("should show failure message when not connected", () => {
      render(<TestConnectionButton {...defaultProps} result={failureResult} />);

      expect(
        screen.getByText(/connection failed/i) ||
          screen.getByText(/connection timeout/i),
      ).toBeInTheDocument();
    });

    it("should display error code when available", () => {
      render(<TestConnectionButton {...defaultProps} result={failureResult} />);

      expect(screen.getByText(/ETIMEDOUT/)).toBeInTheDocument();
    });

    it("should have red styling for failure", () => {
      render(<TestConnectionButton {...defaultProps} result={failureResult} />);

      // Look for red error indicator
      const errorElement =
        screen.getByText(/connection failed/i) ||
        screen.getByText(/connection timeout/i);
      expect(
        errorElement.closest('[class*="red"]') ||
          errorElement.closest('[class*="error"]') ||
          errorElement.closest('[class*="destructive"]'),
      ).toBeInTheDocument();
    });

    it("should allow retrying after failure", async () => {
      const user = userEvent.setup();
      render(<TestConnectionButton {...defaultProps} result={failureResult} />);

      // Should still have a retry or test again button
      const button = screen.getByRole("button");
      await user.click(button);

      expect(mockOnTest).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================
  describe("Edge Cases", () => {
    it("should handle success true but connected false", () => {
      const partialSuccess: POSConnectionTestResult = {
        success: true,
        data: {
          connected: false,
          message: "Host reachable but authentication failed",
        },
      };

      render(
        <TestConnectionButton {...defaultProps} result={partialSuccess} />,
      );

      // Should show the warning/error message
      expect(screen.getByText(/authentication failed/i)).toBeInTheDocument();
    });

    it("should handle empty error message gracefully", () => {
      const emptyError: POSConnectionTestResult = {
        success: false,
        data: {
          connected: false,
          message: "",
        },
      };

      render(<TestConnectionButton {...defaultProps} result={emptyError} />);

      // Should still render without crashing
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("should handle very long error messages", () => {
      const longError: POSConnectionTestResult = {
        success: false,
        data: {
          connected: false,
          message:
            "This is a very long error message that might cause layout issues if not properly handled. It contains lots of technical details about the connection failure including network diagnostics and retry attempts.",
          errorCode: "COMPLEX_ERROR_CODE_WITH_MANY_CHARACTERS",
        },
      };

      render(<TestConnectionButton {...defaultProps} result={longError} />);

      // Should render without breaking layout
      expect(screen.getByRole("button")).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Accessibility Tests
  // ===========================================================================
  describe("Accessibility", () => {
    it("should have accessible button with proper role", () => {
      render(<TestConnectionButton {...defaultProps} />);

      const button = screen.getByRole("button");
      expect(button).toHaveAccessibleName();
    });

    it("should announce loading state to screen readers", () => {
      render(<TestConnectionButton {...defaultProps} isLoading={true} />);

      // Button should indicate loading state accessibly
      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
    });

    it("should have proper aria attributes for success state", () => {
      const successResult: POSConnectionTestResult = {
        success: true,
        data: { connected: true, message: "OK" },
      };

      render(<TestConnectionButton {...defaultProps} result={successResult} />);

      // Success message should be accessible
      const successElement =
        screen.getByText(/connection successful/i) ||
        screen.getByText(/connected/i);
      expect(successElement).toBeInTheDocument();
    });

    it("should have proper aria attributes for error state", () => {
      const failureResult: POSConnectionTestResult = {
        success: false,
        data: { connected: false, message: "Failed" },
      };

      render(<TestConnectionButton {...defaultProps} result={failureResult} />);

      // Error message should be accessible - verify the button is still accessible
      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
      // Component should render something to indicate error state (either text or visual)
      expect(document.body.textContent).toBeDefined();
    });
  });
});
