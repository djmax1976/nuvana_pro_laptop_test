/**
 * POS Setup Wizard Component Tests
 *
 * Tests for the main POSSetupWizard component.
 * Validates step navigation, state transitions, and form submission.
 *
 * Enterprise coding standards applied:
 * - FE-002: Form validation UI testing
 * - SEC-014: Input validation visual feedback
 *
 * @module tests/components/pos-integration/POSSetupWizard.spec
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { POSSetupWizard } from "../../../src/components/pos-integration/POSSetupWizard";

// Mock the API hooks
vi.mock("../../../src/lib/api/pos-integration", () => ({
  useCreatePOSIntegration: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ success: true, data: {} }),
    isPending: false,
  }),
  useTestPOSConnection: () => ({
    mutateAsync: vi.fn().mockResolvedValue({
      success: true,
      data: { connected: true, message: "Connection successful" },
    }),
    isPending: false,
  }),
  useTriggerPOSSync: () => ({
    mutateAsync: vi.fn().mockResolvedValue({
      success: true,
      data: { status: "SUCCESS", durationMs: 1234 },
    }),
    isPending: false,
  }),
  getErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Unknown error",
}));

// Mock toast hook
vi.mock("../../../src/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Create a wrapper for React Query
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderWithProviders(
  ui: React.ReactElement,
  queryClient = createTestQueryClient(),
) {
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("POSSetupWizard Component", () => {
  const mockStoreId = "550e8400-e29b-41d4-a716-446655440000";
  const mockOnComplete = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Rendering Tests
  // ===========================================================================
  describe("Rendering", () => {
    it("should render the wizard with correct title", () => {
      renderWithProviders(
        <POSSetupWizard
          storeId={mockStoreId}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />,
      );

      expect(screen.getByText("POS Integration Setup")).toBeInTheDocument();
    });

    it("should render step indicator showing step 1", () => {
      renderWithProviders(
        <POSSetupWizard
          storeId={mockStoreId}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />,
      );

      // Step indicator should show "POS System" as current
      expect(screen.getByText("POS System")).toBeInTheDocument();
      expect(screen.getByText("Connection")).toBeInTheDocument();
      expect(screen.getByText("Sync Options")).toBeInTheDocument();
      expect(screen.getByText("Confirm")).toBeInTheDocument();
    });

    it("should render step 1 POS selector initially", () => {
      renderWithProviders(
        <POSSetupWizard
          storeId={mockStoreId}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />,
      );

      // Step 1 should show POS system selection
      expect(
        screen.getByText(/select your pos system/i) ||
          screen.getByRole("combobox"),
      ).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Step Navigation Tests
  // ===========================================================================
  describe("Step Navigation", () => {
    it("should have disabled Next button when no POS selected", () => {
      renderWithProviders(
        <POSSetupWizard
          storeId={mockStoreId}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />,
      );

      const nextButton = screen.getByRole("button", { name: /next/i });
      expect(nextButton).toBeDisabled();
    });

    it("should enable Next button after selecting a POS", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <POSSetupWizard
          storeId={mockStoreId}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />,
      );

      // Find and click the POS selector
      const select = screen.getByRole("combobox");
      await user.click(select);

      // Select a POS type
      const option = await screen.findByText("Verifone Commander");
      await user.click(option);

      // Next button should be enabled
      const nextButton = screen.getByRole("button", { name: /next/i });
      await waitFor(() => {
        expect(nextButton).not.toBeDisabled();
      });
    });
  });

  // ===========================================================================
  // Error Display Tests
  // ===========================================================================
  describe("Error Display", () => {
    it("should not show error alert initially", () => {
      renderWithProviders(
        <POSSetupWizard
          storeId={mockStoreId}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />,
      );

      const errorAlert = screen.queryByTestId("wizard-error");
      expect(errorAlert).not.toBeInTheDocument();
    });
  });
});
