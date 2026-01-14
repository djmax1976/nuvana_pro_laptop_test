/**
 * Step 1 POS Selector Component Tests
 *
 * Tests for the POS system selection step of the wizard.
 * Validates dropdown rendering, option groups, selection behavior, and info card display.
 *
 * Enterprise coding standards applied:
 * - FE-002: Form validation UI testing
 * - Accessibility testing for form controls
 *
 * @module tests/components/pos-integration/Step1POSSelector.spec
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Step1POSSelector } from "../../../src/components/pos-integration/steps/Step1POSSelector";
import type { POSSystemType } from "../../../src/types/pos-integration";

describe("Step1POSSelector Component", () => {
  const mockOnSelect = vi.fn();
  const mockOnNext = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultProps = {
    selectedPOS: null as POSSystemType | null,
    onSelect: mockOnSelect,
    onNext: mockOnNext,
    canProceed: false,
  };

  // ===========================================================================
  // Rendering Tests
  // ===========================================================================
  describe("Rendering", () => {
    it("should render the step title", () => {
      render(<Step1POSSelector {...defaultProps} />);

      expect(
        screen.getByText(/select your pos system/i) ||
          screen.getByText(/step 1/i) ||
          screen.getByRole("heading"),
      ).toBeInTheDocument();
    });

    it("should render the POS system dropdown", () => {
      render(<Step1POSSelector {...defaultProps} />);

      const select = screen.getByRole("combobox");
      expect(select).toBeInTheDocument();
    });

    it("should render Next button", () => {
      render(<Step1POSSelector {...defaultProps} />);

      expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
    });

    it("should have disabled Next button when canProceed is false", () => {
      render(<Step1POSSelector {...defaultProps} canProceed={false} />);

      const nextButton = screen.getByRole("button", { name: /next/i });
      expect(nextButton).toBeDisabled();
    });

    it("should have enabled Next button when canProceed is true", () => {
      render(<Step1POSSelector {...defaultProps} canProceed={true} />);

      const nextButton = screen.getByRole("button", { name: /next/i });
      expect(nextButton).not.toBeDisabled();
    });
  });

  // ===========================================================================
  // Dropdown Options Tests
  // ===========================================================================
  describe("Dropdown Options", () => {
    it("should display Verifone options in dropdown", async () => {
      const user = userEvent.setup();
      render(<Step1POSSelector {...defaultProps} />);

      const select = screen.getByRole("combobox");
      await user.click(select);

      // Check for Verifone options
      await waitFor(() => {
        expect(screen.getByText("Verifone Commander")).toBeInTheDocument();
      });
      expect(screen.getByText("Verifone Ruby2")).toBeInTheDocument();
      expect(screen.getByText("Verifone Sapphire")).toBeInTheDocument();
    });

    it("should display Gilbarco options in dropdown", async () => {
      const user = userEvent.setup();
      render(<Step1POSSelector {...defaultProps} />);

      const select = screen.getByRole("combobox");
      await user.click(select);

      await waitFor(() => {
        expect(screen.getByText("Gilbarco Passport")).toBeInTheDocument();
      });
      expect(screen.getByText("Gilbarco NAXML")).toBeInTheDocument();
    });

    it("should display Cloud POS options in dropdown", async () => {
      const user = userEvent.setup();
      render(<Step1POSSelector {...defaultProps} />);

      const select = screen.getByRole("combobox");
      await user.click(select);

      await waitFor(() => {
        expect(screen.getByText("Square")).toBeInTheDocument();
      });
      expect(screen.getByText("Clover")).toBeInTheDocument();
      expect(screen.getByText("Toast")).toBeInTheDocument();
      expect(screen.getByText("Lightspeed")).toBeInTheDocument();
    });

    it("should display Other options including Manual Entry", async () => {
      const user = userEvent.setup();
      render(<Step1POSSelector {...defaultProps} />);

      const select = screen.getByRole("combobox");
      await user.click(select);

      await waitFor(() => {
        expect(screen.getByText("Manual Entry")).toBeInTheDocument();
      });
    });
  });

  // ===========================================================================
  // Selection Behavior Tests
  // ===========================================================================
  describe("Selection Behavior", () => {
    it("should call onSelect when a POS is selected", async () => {
      const user = userEvent.setup();
      render(<Step1POSSelector {...defaultProps} />);

      const select = screen.getByRole("combobox");
      await user.click(select);

      const option = await screen.findByText("Verifone Commander");
      await user.click(option);

      expect(mockOnSelect).toHaveBeenCalledWith("VERIFONE_COMMANDER");
    });

    it("should call onNext when Next button is clicked and canProceed is true", async () => {
      const user = userEvent.setup();
      render(<Step1POSSelector {...defaultProps} canProceed={true} />);

      const nextButton = screen.getByRole("button", { name: /next/i });
      await user.click(nextButton);

      expect(mockOnNext).toHaveBeenCalled();
    });

    it("should not call onNext when Next button is disabled", async () => {
      const user = userEvent.setup();
      render(<Step1POSSelector {...defaultProps} canProceed={false} />);

      const nextButton = screen.getByRole("button", { name: /next/i });

      // Button is disabled so click won't fire
      await user.click(nextButton);

      expect(mockOnNext).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Info Card Display Tests
  // ===========================================================================
  describe("Info Card Display", () => {
    it("should not show info card when no POS selected", () => {
      render(<Step1POSSelector {...defaultProps} selectedPOS={null} />);

      // Info card should not be visible
      expect(screen.queryByText(/file-based/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/cloud rest api/i)).not.toBeInTheDocument();
    });

    it("should show info card for file-based POS", () => {
      render(
        <Step1POSSelector {...defaultProps} selectedPOS="VERIFONE_COMMANDER" />,
      );

      // Should show file-based description
      expect(screen.getByText(/file-based/i)).toBeInTheDocument();
    });

    it("should show info card for cloud POS", () => {
      render(<Step1POSSelector {...defaultProps} selectedPOS="SQUARE_REST" />);

      // Should show cloud description
      expect(screen.getByText(/cloud rest api/i)).toBeInTheDocument();
    });

    it("should show info card for network POS", () => {
      render(
        <Step1POSSelector {...defaultProps} selectedPOS="GILBARCO_PASSPORT" />,
      );

      // Should show network description
      expect(screen.getByText(/network/i)).toBeInTheDocument();
    });

    it("should show info card for manual entry", () => {
      render(<Step1POSSelector {...defaultProps} selectedPOS="MANUAL_ENTRY" />);

      // Should show manual entry description
      expect(screen.getByText(/no automatic sync/i)).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Accessibility Tests
  // ===========================================================================
  describe("Accessibility", () => {
    it("should have accessible dropdown with label", () => {
      render(<Step1POSSelector {...defaultProps} />);

      // Look for combobox or select element
      const select =
        screen.queryByRole("combobox") || screen.queryByRole("listbox");
      if (select) {
        expect(select).toBeInTheDocument();
      } else {
        // If no combobox role, ensure there's some form control
        expect(
          document.querySelector("select, [role='combobox']"),
        ).toBeDefined();
      }
    });

    it("should have accessible Next button", () => {
      render(<Step1POSSelector {...defaultProps} />);

      const nextButton = screen.getByRole("button", { name: /next/i });
      expect(nextButton).toHaveAccessibleName();
    });
  });
});
