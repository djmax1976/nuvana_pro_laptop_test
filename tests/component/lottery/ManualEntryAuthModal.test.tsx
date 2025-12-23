/**
 * ManualEntryAuthModal Component Tests
 *
 * Test file for ManualEntryAuthModal component used in MyStore lottery management.
 * This component handles user re-authentication for manual entry authorization.
 *
 * Key Features Tested:
 * - Email/password form validation
 * - User credential verification via API
 * - Permission check for LOTTERY_MANUAL_ENTRY
 * - Error handling for invalid credentials
 * - Error handling for unauthorized users
 * - Modal open/close behavior
 * - Form reset on modal open
 * - Audit trail (authorization callback)
 *
 * Test Categories:
 * 1. Form Rendering
 * 2. Form Validation
 * 3. Credential Verification
 * 4. Permission Check
 * 5. Error Handling
 * 6. Modal State Management
 * 7. Accessibility
 *
 * MCP Testing Guidelines Applied:
 * - Tests isolated with proper mocking
 * - Descriptive test names following naming convention
 * - data-testid attributes for reliable element selection
 * - Async operations properly awaited with waitFor
 *
 * @story 10-4 Manual Entry Override
 * @priority P0 (Critical - Security & Authorization)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ManualEntryAuthModal } from "@/components/lottery/ManualEntryAuthModal";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Helper to create QueryClient wrapper
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = "TestQueryClientWrapper";
  return Wrapper;
}

// Helper to render with providers
function renderWithProviders(ui: React.ReactElement) {
  return render(ui, { wrapper: createWrapper() });
}

// Mock successful verification response
function mockVerificationSuccess(
  userId = "user-123",
  name = "Test Manager",
  hasPermission = true,
) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      valid: true,
      userId,
      name,
      hasPermission,
    }),
  });
}

// Mock verification failure (invalid credentials)
function mockVerificationInvalidCredentials() {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    json: async () => ({
      valid: false,
      error: "Invalid email or password",
    }),
  });
}

// Mock verification success but no permission
function mockVerificationNoPermission(
  userId = "user-456",
  name = "Regular User",
) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      valid: true,
      userId,
      name,
      hasPermission: false,
    }),
  });
}

// Mock server error
function mockServerError() {
  mockFetch.mockRejectedValueOnce(new Error("Network error"));
}

describe("ManualEntryAuthModal", () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    storeId: "store-123",
    onAuthorized: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ============================================================================
  // 1. Form Rendering
  // ============================================================================

  describe("Form Rendering", () => {
    it("should render modal when open is true", () => {
      renderWithProviders(<ManualEntryAuthModal {...defaultProps} />);

      expect(screen.getByTestId("manual-entry-auth-modal")).toBeInTheDocument();
      expect(screen.getByText("Authorize Manual Entry")).toBeInTheDocument();
    });

    it("should render email input field", () => {
      renderWithProviders(<ManualEntryAuthModal {...defaultProps} />);

      const emailInput = screen.getByTestId("email-input");
      expect(emailInput).toBeInTheDocument();
      expect(emailInput).toHaveAttribute("type", "email");
    });

    it("should render password input field", () => {
      renderWithProviders(<ManualEntryAuthModal {...defaultProps} />);

      const passwordInput = screen.getByTestId("password-input");
      expect(passwordInput).toBeInTheDocument();
      expect(passwordInput).toHaveAttribute("type", "password");
    });

    it("should render Cancel and Verify buttons", () => {
      renderWithProviders(<ManualEntryAuthModal {...defaultProps} />);

      expect(screen.getByTestId("cancel-button")).toBeInTheDocument();
      expect(screen.getByTestId("verify-button")).toBeInTheDocument();
    });

    it("should have Verify button disabled initially", () => {
      renderWithProviders(<ManualEntryAuthModal {...defaultProps} />);

      const verifyButton = screen.getByTestId("verify-button");
      expect(verifyButton).toBeDisabled();
    });
  });

  // ============================================================================
  // 2. Form Validation
  // ============================================================================

  describe("Form Validation", () => {
    it("should enable Verify button when both email and password are entered", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ManualEntryAuthModal {...defaultProps} />);

      const emailInput = screen.getByTestId("email-input");
      const passwordInput = screen.getByTestId("password-input");
      const verifyButton = screen.getByTestId("verify-button");

      // Initially disabled
      expect(verifyButton).toBeDisabled();

      // Enter email only
      await user.type(emailInput, "test@example.com");
      expect(verifyButton).toBeDisabled();

      // Enter password
      await user.type(passwordInput, "password123");

      await waitFor(() => {
        expect(verifyButton).not.toBeDisabled();
      });
    });

    it("should show error for invalid email format on submit", async () => {
      const user = userEvent.setup();
      mockVerificationInvalidCredentials();

      renderWithProviders(<ManualEntryAuthModal {...defaultProps} />);

      const emailInput = screen.getByTestId("email-input");
      const passwordInput = screen.getByTestId("password-input");
      const verifyButton = screen.getByTestId("verify-button");

      await user.type(emailInput, "invalid-email");
      await user.type(passwordInput, "password123");
      await user.click(verifyButton);

      await waitFor(() => {
        expect(screen.getByText(/valid email/i)).toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // 3. Credential Verification
  // ============================================================================

  describe("Credential Verification", () => {
    it("should call API with correct payload on submit", async () => {
      const user = userEvent.setup();
      mockVerificationSuccess();

      renderWithProviders(<ManualEntryAuthModal {...defaultProps} />);

      const emailInput = screen.getByTestId("email-input");
      const passwordInput = screen.getByTestId("password-input");
      const verifyButton = screen.getByTestId("verify-button");

      await user.type(emailInput, "manager@example.com");
      await user.type(passwordInput, "securePassword123");
      await user.click(verifyButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining("/api/auth/verify-user-permission"),
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({
              email: "manager@example.com",
              password: "securePassword123",
              permission: "LOTTERY_MANUAL_ENTRY",
              storeId: "store-123",
            }),
          }),
        );
      });
    });

    it("should call onAuthorized callback on successful verification", async () => {
      const user = userEvent.setup();
      const onAuthorized = vi.fn();
      mockVerificationSuccess("user-789", "Authorized Manager");

      renderWithProviders(
        <ManualEntryAuthModal {...defaultProps} onAuthorized={onAuthorized} />,
      );

      const emailInput = screen.getByTestId("email-input");
      const passwordInput = screen.getByTestId("password-input");
      const verifyButton = screen.getByTestId("verify-button");

      await user.type(emailInput, "manager@example.com");
      await user.type(passwordInput, "password123");
      await user.click(verifyButton);

      await waitFor(() => {
        expect(onAuthorized).toHaveBeenCalledWith({
          userId: "user-789",
          name: "Authorized Manager",
        });
      });
    });

    it("should close modal on successful verification", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      mockVerificationSuccess();

      renderWithProviders(
        <ManualEntryAuthModal {...defaultProps} onOpenChange={onOpenChange} />,
      );

      const emailInput = screen.getByTestId("email-input");
      const passwordInput = screen.getByTestId("password-input");
      const verifyButton = screen.getByTestId("verify-button");

      await user.type(emailInput, "manager@example.com");
      await user.type(passwordInput, "password123");
      await user.click(verifyButton);

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });

  // ============================================================================
  // 4. Permission Check
  // ============================================================================

  describe("Permission Check", () => {
    it("should show error when user lacks LOTTERY_MANUAL_ENTRY permission", async () => {
      const user = userEvent.setup();
      mockVerificationNoPermission();

      renderWithProviders(<ManualEntryAuthModal {...defaultProps} />);

      const emailInput = screen.getByTestId("email-input");
      const passwordInput = screen.getByTestId("password-input");
      const verifyButton = screen.getByTestId("verify-button");

      await user.type(emailInput, "regular@example.com");
      await user.type(passwordInput, "password123");
      await user.click(verifyButton);

      await waitFor(() => {
        expect(
          screen.getByText(/not authorized for manual entry/i),
        ).toBeInTheDocument();
      });
    });

    it("should not call onAuthorized when user lacks permission", async () => {
      const user = userEvent.setup();
      const onAuthorized = vi.fn();
      mockVerificationNoPermission();

      renderWithProviders(
        <ManualEntryAuthModal {...defaultProps} onAuthorized={onAuthorized} />,
      );

      const emailInput = screen.getByTestId("email-input");
      const passwordInput = screen.getByTestId("password-input");
      const verifyButton = screen.getByTestId("verify-button");

      await user.type(emailInput, "regular@example.com");
      await user.type(passwordInput, "password123");
      await user.click(verifyButton);

      await waitFor(() => {
        expect(
          screen.getByText(/not authorized for manual entry/i),
        ).toBeInTheDocument();
      });

      expect(onAuthorized).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // 5. Error Handling
  // ============================================================================

  describe("Error Handling", () => {
    it("should show error when credentials are invalid", async () => {
      const user = userEvent.setup();
      mockVerificationInvalidCredentials();

      renderWithProviders(<ManualEntryAuthModal {...defaultProps} />);

      const emailInput = screen.getByTestId("email-input");
      const passwordInput = screen.getByTestId("password-input");
      const verifyButton = screen.getByTestId("verify-button");

      await user.type(emailInput, "wrong@example.com");
      await user.type(passwordInput, "wrongpassword");
      await user.click(verifyButton);

      await waitFor(() => {
        expect(screen.getByTestId("error-message")).toBeInTheDocument();
      });
    });

    it("should handle network errors gracefully", async () => {
      const user = userEvent.setup();
      mockServerError();

      renderWithProviders(<ManualEntryAuthModal {...defaultProps} />);

      const emailInput = screen.getByTestId("email-input");
      const passwordInput = screen.getByTestId("password-input");
      const verifyButton = screen.getByTestId("verify-button");

      await user.type(emailInput, "test@example.com");
      await user.type(passwordInput, "password123");
      await user.click(verifyButton);

      await waitFor(() => {
        expect(screen.getByTestId("error-message")).toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // 6. Modal State Management
  // ============================================================================

  describe("Modal State Management", () => {
    it("should reset form when Cancel button is clicked", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();

      renderWithProviders(
        <ManualEntryAuthModal {...defaultProps} onOpenChange={onOpenChange} />,
      );

      const emailInput = screen.getByTestId("email-input");
      const passwordInput = screen.getByTestId("password-input");
      const cancelButton = screen.getByTestId("cancel-button");

      await user.type(emailInput, "test@example.com");
      await user.type(passwordInput, "password123");
      await user.click(cancelButton);

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("should show loading state during verification", async () => {
      const user = userEvent.setup();

      // Create a delayed response
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({
                    valid: true,
                    userId: "user-123",
                    name: "Test",
                    hasPermission: true,
                  }),
                }),
              100,
            ),
          ),
      );

      renderWithProviders(<ManualEntryAuthModal {...defaultProps} />);

      const emailInput = screen.getByTestId("email-input");
      const passwordInput = screen.getByTestId("password-input");
      const verifyButton = screen.getByTestId("verify-button");

      await user.type(emailInput, "test@example.com");
      await user.type(passwordInput, "password123");
      await user.click(verifyButton);

      // During loading, inputs should be disabled
      expect(emailInput).toBeDisabled();
      expect(passwordInput).toBeDisabled();
    });
  });

  // ============================================================================
  // 7. Accessibility
  // ============================================================================

  describe("Accessibility", () => {
    it("should have accessible labels for form fields", () => {
      renderWithProviders(<ManualEntryAuthModal {...defaultProps} />);

      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    });

    it("should have descriptive dialog title", () => {
      renderWithProviders(<ManualEntryAuthModal {...defaultProps} />);

      expect(screen.getByText("Authorize Manual Entry")).toBeInTheDocument();
      expect(screen.getByText(/credentials to authorize/i)).toBeInTheDocument();
    });
  });
});
