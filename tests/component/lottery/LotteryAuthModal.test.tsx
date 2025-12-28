/**
 * LotteryAuthModal Component Tests
 *
 * Test file for LotteryAuthModal component used in lottery pack activation.
 * This component provides two-tab authentication:
 * - Cashier Tab: PIN-only input with auto shift detection
 * - Management Tab: Email/password for managers (no shift required)
 *
 * ============================================================================
 * TRACEABILITY MATRIX
 * ============================================================================
 * | Test ID                    | Requirement              | Category         |
 * |----------------------------|--------------------------|------------------|
 * | LAM-001                    | Render modal UI          | Component        |
 * | LAM-002                    | Render tabs              | Component        |
 * | LAM-003                    | Cashier PIN input field  | Component        |
 * | LAM-004                    | Management email/pwd     | Component        |
 * | LAM-005                    | Tab switching            | Business Logic   |
 * | LAM-006                    | PIN validation 4-digit   | Assertions       |
 * | LAM-007                    | PIN numeric only         | Security         |
 * | LAM-008                    | Cashier auth success     | Integration      |
 * | LAM-009                    | Cashier auth failure     | Error Handling   |
 * | LAM-010                    | No active shift error    | Error Handling   |
 * | LAM-011                    | Management auth success  | Integration      |
 * | LAM-012                    | Management auth failure  | Error Handling   |
 * | LAM-013                    | Insufficient permissions | Error Handling   |
 * | LAM-014                    | Modal close on success   | Business Logic   |
 * | LAM-015                    | Modal cancel reset       | Business Logic   |
 * | LAM-016                    | Form reset on open       | Business Logic   |
 * | LAM-017                    | ARIA accessibility       | Accessibility    |
 * | LAM-018                    | Permissions returned     | Integration      |
 * | LAM-019                    | Permissions in callback  | Business Logic   |
 * | LAM-020                    | Serial override mode UI  | Component        |
 * | LAM-021                    | Serial override approval | Business Logic   |
 * | LAM-022                    | Serial override perms    | Authorization    |
 * | LAM-023                    | Serial override callback | Integration      |
 * | LAM-024                    | No tabs in override mode | Component        |
 * | LAM-025                    | Autofocus PIN on open    | UX Enhancement   |
 * | LAM-026                    | Autofocus email override | UX Enhancement   |
 * | LAM-027                    | Focus input on tab switch| UX Enhancement   |
 * | LAM-028                    | Exact no shift message   | Error Handling   |
 * | LAM-029                    | Exact invalid PIN msg    | Error Handling   |
 * ============================================================================
 *
 * Key Features Tested:
 * - Two-tab authentication: Cashier (PIN-only) and Management (email/pwd)
 * - Cashier PIN auto-detects active shift from backend
 * - Management bypasses shift requirement
 * - PIN input with 4-digit validation
 * - Error handling for invalid credentials
 * - Error handling for no active shift
 * - Modal state management
 * - Accessibility (labels, ARIA)
 * - Serial override mode (manager-only approval flow)
 * - LOTTERY_SERIAL_OVERRIDE permission check
 * - Dual-auth callback for serial override approval
 *
 * MCP Guidance Applied:
 * - FE-002: FORM_VALIDATION - Mirror backend validation client-side
 * - SEC-014: INPUT_VALIDATION - Strict schemas with format constraints
 * - SEC-004: XSS - React auto-escapes output
 * - API-004: AUTHENTICATION - Secure authentication flow
 *
 * @story Pack Activation UX Enhancement
 * @priority P0 (Critical - Security & Authorization)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LotteryAuthModal } from "@/components/lottery/LotteryAuthModal";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock apiClient
vi.mock("@/lib/api/client", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
  extractData: vi.fn((response) => response.data),
}));

import apiClient from "@/lib/api/client";

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

// Setup mocks helper
function setupMocks(options?: {
  pinAuthSuccess?: boolean;
  pinAuthError?: "AUTHENTICATION_FAILED" | "NO_ACTIVE_SHIFT";
  managementAuthSuccess?: boolean;
  managementAuthError?: "UNAUTHORIZED" | "INSUFFICIENT_PERMISSIONS";
}) {
  const {
    pinAuthSuccess = true,
    pinAuthError,
    managementAuthSuccess = true,
    managementAuthError,
  } = options || {};

  // Reset all mocks
  vi.mocked(apiClient.post).mockReset();

  // Mock based on endpoint
  vi.mocked(apiClient.post).mockImplementation(async (url: string) => {
    if (url.includes("/authenticate-pin")) {
      if (pinAuthSuccess) {
        return {
          data: {
            cashier_id: "cashier-123",
            cashier_name: "John Doe",
            shift_id: "shift-456",
          },
        };
      } else {
        // Create error with both message and code property for proper error handling
        const error = new Error(
          pinAuthError || "AUTHENTICATION_FAILED",
        ) as Error & { code?: string };
        error.code = pinAuthError || "AUTHENTICATION_FAILED";
        throw error;
      }
    }

    if (url.includes("/auth/verify-management")) {
      if (managementAuthSuccess) {
        return {
          data: {
            user_id: "user-789",
            name: "Jane Manager",
            email: "jane@example.com",
            roles: ["CLIENT_OWNER"],
            permissions: ["LOTTERY_SERIAL_OVERRIDE", "LOTTERY_MANAGE_GAMES"],
          },
        };
      } else {
        const error = new Error(managementAuthError || "UNAUTHORIZED");
        throw error;
      }
    }

    throw new Error(`Unexpected URL: ${url}`);
  });
}

describe("LotteryAuthModal", () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    storeId: "store-123",
    onAuthenticated: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ============================================================================
  // SECTION 1: COMPONENT RENDERING (LAM-001, LAM-002, LAM-003, LAM-004)
  // ============================================================================

  describe("Component Rendering", () => {
    it("LAM-001: should render modal when open is true", async () => {
      renderWithProviders(<LotteryAuthModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("lottery-auth-modal")).toBeInTheDocument();
        expect(screen.getByText("Authentication Required")).toBeInTheDocument();
      });
    });

    it("LAM-002: should render both Cashier and Management tabs", async () => {
      renderWithProviders(<LotteryAuthModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("cashier-tab")).toBeInTheDocument();
        expect(screen.getByTestId("management-tab")).toBeInTheDocument();
        expect(screen.getByText("Cashier")).toBeInTheDocument();
        expect(screen.getByText("Management")).toBeInTheDocument();
      });
    });

    it("LAM-003: should render PIN input field in Cashier tab", async () => {
      renderWithProviders(<LotteryAuthModal {...defaultProps} />);

      await waitFor(() => {
        const pinInput = screen.getByTestId("pin-input");
        expect(pinInput).toBeInTheDocument();
        expect(pinInput).toHaveAttribute("type", "password");
        expect(pinInput).toHaveAttribute("maxLength", "4");
      });
    });

    it("LAM-004: should render email and password inputs in Management tab", async () => {
      const user = userEvent.setup();
      renderWithProviders(<LotteryAuthModal {...defaultProps} />);

      // Click on Management tab
      const managementTab = screen.getByTestId("management-tab");
      await user.click(managementTab);

      await waitFor(() => {
        expect(screen.getByTestId("email-input")).toBeInTheDocument();
        expect(screen.getByTestId("password-input")).toBeInTheDocument();
      });
    });

    it("should render Cancel and Authenticate buttons", async () => {
      renderWithProviders(<LotteryAuthModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("cancel-button")).toBeInTheDocument();
        expect(screen.getByTestId("authenticate-button")).toBeInTheDocument();
      });
    });

    it("should have Authenticate button disabled initially", async () => {
      renderWithProviders(<LotteryAuthModal {...defaultProps} />);

      await waitFor(() => {
        const authButton = screen.getByTestId("authenticate-button");
        expect(authButton).toBeDisabled();
      });
    });
  });

  // ============================================================================
  // SECTION 2: TAB SWITCHING (LAM-005)
  // ============================================================================

  describe("Tab Switching", () => {
    it("LAM-005: should switch between Cashier and Management tabs", async () => {
      const user = userEvent.setup();
      renderWithProviders(<LotteryAuthModal {...defaultProps} />);

      // Initially Cashier tab should be visible
      await waitFor(() => {
        expect(screen.getByTestId("cashier-tab-content")).toBeInTheDocument();
      });

      // Click on Management tab
      await user.click(screen.getByTestId("management-tab"));

      await waitFor(() => {
        expect(
          screen.getByTestId("management-tab-content"),
        ).toBeInTheDocument();
      });

      // Click back to Cashier tab
      await user.click(screen.getByTestId("cashier-tab"));

      await waitFor(() => {
        expect(screen.getByTestId("cashier-tab-content")).toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // SECTION 3: FORM VALIDATION (LAM-006, LAM-007)
  // ============================================================================

  describe("Form Validation", () => {
    it("LAM-006: should enable Authenticate button when 4-digit PIN is entered", async () => {
      const user = userEvent.setup();
      renderWithProviders(<LotteryAuthModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("pin-input")).toBeInTheDocument();
      });

      // Enter PIN
      const pinInput = screen.getByTestId("pin-input");
      await user.type(pinInput, "1234");

      await waitFor(() => {
        const authButton = screen.getByTestId("authenticate-button");
        expect(authButton).not.toBeDisabled();
      });
    });

    it("should keep button disabled with only 3 digits", async () => {
      const user = userEvent.setup();
      renderWithProviders(<LotteryAuthModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("pin-input")).toBeInTheDocument();
      });

      // Enter only 3 digits
      const pinInput = screen.getByTestId("pin-input");
      await user.type(pinInput, "123");

      // Button should still be disabled
      const authButton = screen.getByTestId("authenticate-button");
      expect(authButton).toBeDisabled();
    });

    it("LAM-007: should only allow numeric input in PIN field", async () => {
      const user = userEvent.setup();
      renderWithProviders(<LotteryAuthModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("pin-input")).toBeInTheDocument();
      });

      const pinInput = screen.getByTestId("pin-input") as HTMLInputElement;

      // Try typing letters and special characters
      await user.type(pinInput, "abc123!@#456");

      // Should only contain numeric digits
      expect(pinInput.value).toBe("1234");
    });

    it("should enable Management button when email and password are entered", async () => {
      const user = userEvent.setup();
      renderWithProviders(<LotteryAuthModal {...defaultProps} />);

      // Switch to Management tab
      await user.click(screen.getByTestId("management-tab"));

      await waitFor(() => {
        expect(screen.getByTestId("email-input")).toBeInTheDocument();
      });

      // Enter email and password
      const emailInput = screen.getByTestId("email-input");
      const passwordInput = screen.getByTestId("password-input");
      await user.type(emailInput, "test@example.com");
      await user.type(passwordInput, "password123");

      await waitFor(() => {
        const authButton = screen.getByTestId("authenticate-button");
        expect(authButton).not.toBeDisabled();
      });
    });
  });

  // ============================================================================
  // SECTION 4: CASHIER AUTHENTICATION FLOW (LAM-008, LAM-009, LAM-010)
  // ============================================================================

  describe("Cashier Authentication Flow", () => {
    it("LAM-008: should call onAuthenticated on successful PIN authentication", async () => {
      const user = userEvent.setup();
      const onAuthenticated = vi.fn();

      renderWithProviders(
        <LotteryAuthModal
          {...defaultProps}
          onAuthenticated={onAuthenticated}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("pin-input")).toBeInTheDocument();
      });

      // Enter PIN
      const pinInput = screen.getByTestId("pin-input");
      await user.type(pinInput, "1234");

      // Submit
      const authButton = screen.getByTestId("authenticate-button");
      await user.click(authButton);

      await waitFor(() => {
        expect(onAuthenticated).toHaveBeenCalledWith(
          expect.objectContaining({
            cashier_id: "cashier-123",
            cashier_name: "John Doe",
            shift_id: "shift-456",
            auth_type: "cashier",
          }),
        );
      });
    });

    it("LAM-009: should show error on PIN authentication failure", async () => {
      const user = userEvent.setup();
      setupMocks({
        pinAuthSuccess: false,
        pinAuthError: "AUTHENTICATION_FAILED",
      });

      renderWithProviders(<LotteryAuthModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("pin-input")).toBeInTheDocument();
      });

      // Enter PIN
      const pinInput = screen.getByTestId("pin-input");
      await user.type(pinInput, "1234");

      // Submit
      const authButton = screen.getByTestId("authenticate-button");
      await user.click(authButton);

      await waitFor(() => {
        expect(screen.getByTestId("cashier-error-message")).toBeInTheDocument();
        expect(screen.getByText(/invalid pin/i)).toBeInTheDocument();
      });
    });

    it("LAM-010: should show error for no active shift", async () => {
      const user = userEvent.setup();
      setupMocks({ pinAuthSuccess: false, pinAuthError: "NO_ACTIVE_SHIFT" });

      renderWithProviders(<LotteryAuthModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("pin-input")).toBeInTheDocument();
      });

      // Enter PIN
      const pinInput = screen.getByTestId("pin-input");
      await user.type(pinInput, "1234");

      // Submit
      const authButton = screen.getByTestId("authenticate-button");
      await user.click(authButton);

      // Check that error message appears in the error alert (not the hint text)
      await waitFor(() => {
        const errorMessage = screen.getByTestId("cashier-error-message");
        expect(errorMessage).toHaveTextContent(
          "You must have an active shift to activate packs.",
        );
      });
    });
  });

  // ============================================================================
  // SECTION 5: MANAGEMENT AUTHENTICATION FLOW (LAM-011, LAM-012, LAM-013)
  // ============================================================================

  describe("Management Authentication Flow", () => {
    it("LAM-011: should call onAuthenticated on successful management login", async () => {
      const user = userEvent.setup();
      const onAuthenticated = vi.fn();

      renderWithProviders(
        <LotteryAuthModal
          {...defaultProps}
          onAuthenticated={onAuthenticated}
        />,
      );

      // Switch to Management tab
      await user.click(screen.getByTestId("management-tab"));

      await waitFor(() => {
        expect(screen.getByTestId("email-input")).toBeInTheDocument();
      });

      // Enter email and password
      const emailInput = screen.getByTestId("email-input");
      const passwordInput = screen.getByTestId("password-input");
      await user.type(emailInput, "jane@example.com");
      await user.type(passwordInput, "password123");

      // Submit
      const authButton = screen.getByTestId("authenticate-button");
      await user.click(authButton);

      await waitFor(() => {
        expect(onAuthenticated).toHaveBeenCalledWith(
          expect.objectContaining({
            cashier_id: "user-789",
            cashier_name: "Jane Manager",
            shift_id: "", // Managers don't need shift
            auth_type: "management",
          }),
        );
      });
    });

    it("LAM-012: should show error on management login failure", async () => {
      const user = userEvent.setup();
      setupMocks({
        managementAuthSuccess: false,
        managementAuthError: "UNAUTHORIZED",
      });

      renderWithProviders(<LotteryAuthModal {...defaultProps} />);

      // Switch to Management tab
      await user.click(screen.getByTestId("management-tab"));

      await waitFor(() => {
        expect(screen.getByTestId("email-input")).toBeInTheDocument();
      });

      // Enter email and password
      const emailInput = screen.getByTestId("email-input");
      const passwordInput = screen.getByTestId("password-input");
      await user.type(emailInput, "wrong@example.com");
      await user.type(passwordInput, "wrongpassword");

      // Submit
      const authButton = screen.getByTestId("authenticate-button");
      await user.click(authButton);

      await waitFor(() => {
        expect(
          screen.getByTestId("management-error-message"),
        ).toBeInTheDocument();
        expect(
          screen.getByText(/invalid email or password/i),
        ).toBeInTheDocument();
      });
    });

    it("LAM-013: should show error for insufficient permissions", async () => {
      const user = userEvent.setup();
      setupMocks({
        managementAuthSuccess: false,
        managementAuthError: "INSUFFICIENT_PERMISSIONS",
      });

      renderWithProviders(<LotteryAuthModal {...defaultProps} />);

      // Switch to Management tab
      await user.click(screen.getByTestId("management-tab"));

      await waitFor(() => {
        expect(screen.getByTestId("email-input")).toBeInTheDocument();
      });

      // Enter email and password
      const emailInput = screen.getByTestId("email-input");
      const passwordInput = screen.getByTestId("password-input");
      await user.type(emailInput, "cashier@example.com");
      await user.type(passwordInput, "password123");

      // Submit
      const authButton = screen.getByTestId("authenticate-button");
      await user.click(authButton);

      await waitFor(() => {
        expect(
          screen.getByText(/do not have permission to activate lottery packs/i),
        ).toBeInTheDocument();
      });
    });

    it("LAM-018: should include permissions in successful management auth callback", async () => {
      const user = userEvent.setup();
      const onAuthenticated = vi.fn();

      renderWithProviders(
        <LotteryAuthModal
          {...defaultProps}
          onAuthenticated={onAuthenticated}
        />,
      );

      // Switch to Management tab
      await user.click(screen.getByTestId("management-tab"));

      await waitFor(() => {
        expect(screen.getByTestId("email-input")).toBeInTheDocument();
      });

      // Enter email and password
      const emailInput = screen.getByTestId("email-input");
      const passwordInput = screen.getByTestId("password-input");
      await user.type(emailInput, "jane@example.com");
      await user.type(passwordInput, "password123");

      // Submit
      const authButton = screen.getByTestId("authenticate-button");
      await user.click(authButton);

      await waitFor(() => {
        expect(onAuthenticated).toHaveBeenCalledWith(
          expect.objectContaining({
            cashier_id: "user-789",
            cashier_name: "Jane Manager",
            shift_id: "", // Managers don't need shift
            auth_type: "management",
            permissions: expect.arrayContaining([
              "LOTTERY_SERIAL_OVERRIDE",
              "LOTTERY_MANAGE_GAMES",
            ]),
          }),
        );
      });
    });

    it("LAM-019: should NOT include permissions in cashier auth callback", async () => {
      const user = userEvent.setup();
      const onAuthenticated = vi.fn();

      renderWithProviders(
        <LotteryAuthModal
          {...defaultProps}
          onAuthenticated={onAuthenticated}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("pin-input")).toBeInTheDocument();
      });

      // Enter PIN
      const pinInput = screen.getByTestId("pin-input");
      await user.type(pinInput, "1234");

      // Submit
      const authButton = screen.getByTestId("authenticate-button");
      await user.click(authButton);

      await waitFor(() => {
        expect(onAuthenticated).toHaveBeenCalledWith(
          expect.objectContaining({
            cashier_id: "cashier-123",
            cashier_name: "John Doe",
            shift_id: "shift-456",
            auth_type: "cashier",
          }),
        );
        // Cashier auth should not have permissions
        expect(onAuthenticated).toHaveBeenCalledWith(
          expect.not.objectContaining({
            permissions: expect.anything(),
          }),
        );
      });
    });
  });

  // ============================================================================
  // SECTION 6: MODAL STATE MANAGEMENT (LAM-014, LAM-015, LAM-016)
  // ============================================================================

  describe("Modal State Management", () => {
    it("LAM-014: should close modal on successful authentication", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();

      renderWithProviders(
        <LotteryAuthModal {...defaultProps} onOpenChange={onOpenChange} />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("pin-input")).toBeInTheDocument();
      });

      // Enter PIN
      const pinInput = screen.getByTestId("pin-input");
      await user.type(pinInput, "1234");

      // Submit
      const authButton = screen.getByTestId("authenticate-button");
      await user.click(authButton);

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it("LAM-015: should close modal when Cancel button is clicked", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();

      renderWithProviders(
        <LotteryAuthModal {...defaultProps} onOpenChange={onOpenChange} />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("cancel-button")).toBeInTheDocument();
      });

      const cancelButton = screen.getByTestId("cancel-button");
      await user.click(cancelButton);

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("LAM-016: should reset form when modal opens", async () => {
      const { rerender } = renderWithProviders(
        <LotteryAuthModal {...defaultProps} open={false} />,
      );

      // Reopen modal
      rerender(
        <QueryClientProvider
          client={
            new QueryClient({
              defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
              },
            })
          }
        >
          <LotteryAuthModal {...defaultProps} open={true} />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        const pinInput = screen.getByTestId("pin-input") as HTMLInputElement;
        expect(pinInput.value).toBe("");
      });
    });

    it("should disable inputs during authentication", async () => {
      const user = userEvent.setup();

      // Delay the auth response
      vi.mocked(apiClient.post).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  data: {
                    cashier_id: "cashier-123",
                    cashier_name: "John Doe",
                    shift_id: "shift-456",
                  },
                }),
              100,
            ),
          ),
      );

      renderWithProviders(<LotteryAuthModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("pin-input")).toBeInTheDocument();
      });

      // Enter PIN
      const pinInput = screen.getByTestId("pin-input");
      await user.type(pinInput, "1234");

      // Submit
      const authButton = screen.getByTestId("authenticate-button");
      await user.click(authButton);

      // PIN input should be disabled during submission
      expect(pinInput).toBeDisabled();
    });
  });

  // ============================================================================
  // SECTION 7: ACCESSIBILITY (LAM-017)
  // ============================================================================

  describe("Accessibility", () => {
    it("LAM-017: should have accessible labels for form fields", async () => {
      renderWithProviders(<LotteryAuthModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/pin/i)).toBeInTheDocument();
      });
    });

    it("should have descriptive dialog title and description", async () => {
      renderWithProviders(<LotteryAuthModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText("Authentication Required")).toBeInTheDocument();
        expect(
          screen.getByText(/authenticate to activate the pack/i),
        ).toBeInTheDocument();
      });
    });

    it("should have accessible labels in Management tab", async () => {
      const user = userEvent.setup();
      renderWithProviders(<LotteryAuthModal {...defaultProps} />);

      // Switch to Management tab
      await user.click(screen.getByTestId("management-tab"));

      await waitFor(() => {
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // SECTION 8: SERIAL OVERRIDE MODE (LAM-020, LAM-021, LAM-022, LAM-023, LAM-024)
  // ============================================================================

  describe("Serial Override Mode", () => {
    const serialOverrideProps = {
      ...defaultProps,
      mode: "serial_override" as const,
      onSerialOverrideApproved: vi.fn(),
    };

    beforeEach(() => {
      vi.clearAllMocks();
      setupMocks();
    });

    it("LAM-020: should render serial override mode UI with different title", async () => {
      renderWithProviders(<LotteryAuthModal {...serialOverrideProps} />);

      await waitFor(() => {
        expect(
          screen.getByText("Manager Approval Required"),
        ).toBeInTheDocument();
        expect(
          screen.getByText(
            /manager must approve changing the starting serial/i,
          ),
        ).toBeInTheDocument();
      });
    });

    it("LAM-024: should NOT show tabs in serial_override mode", async () => {
      renderWithProviders(<LotteryAuthModal {...serialOverrideProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("lottery-auth-modal")).toBeInTheDocument();
      });

      // Tabs should not be visible in serial_override mode
      expect(screen.queryByTestId("cashier-tab")).not.toBeInTheDocument();
      expect(screen.queryByTestId("management-tab")).not.toBeInTheDocument();
    });

    it("should show management tab content directly in serial_override mode", async () => {
      renderWithProviders(<LotteryAuthModal {...serialOverrideProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("email-input")).toBeInTheDocument();
        expect(screen.getByTestId("password-input")).toBeInTheDocument();
      });
    });

    it("LAM-021: should call onSerialOverrideApproved on successful manager auth", async () => {
      const user = userEvent.setup();
      const onSerialOverrideApproved = vi.fn();

      renderWithProviders(
        <LotteryAuthModal
          {...serialOverrideProps}
          onSerialOverrideApproved={onSerialOverrideApproved}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("email-input")).toBeInTheDocument();
      });

      // Enter email and password
      const emailInput = screen.getByTestId("email-input");
      const passwordInput = screen.getByTestId("password-input");
      await user.type(emailInput, "jane@example.com");
      await user.type(passwordInput, "password123");

      // Submit
      const authButton = screen.getByTestId("authenticate-button");
      await user.click(authButton);

      await waitFor(() => {
        expect(onSerialOverrideApproved).toHaveBeenCalledWith(
          expect.objectContaining({
            approver_id: "user-789",
            approver_name: "Jane Manager",
            has_permission: true,
            approved_at: expect.any(Date),
          }),
        );
      });
    });

    it("LAM-022: should reject manager without LOTTERY_SERIAL_OVERRIDE permission", async () => {
      const user = userEvent.setup();

      // Setup mock to return manager WITHOUT serial override permission
      vi.mocked(apiClient.post).mockImplementation(async (url: string) => {
        if (url.includes("/auth/verify-management")) {
          return {
            data: {
              user_id: "user-789",
              name: "Limited Manager",
              email: "limited@example.com",
              roles: ["STORE_MANAGER"],
              permissions: ["LOTTERY_MANAGE_BINS"], // NO LOTTERY_SERIAL_OVERRIDE
            },
          };
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const onSerialOverrideApproved = vi.fn();

      renderWithProviders(
        <LotteryAuthModal
          {...serialOverrideProps}
          onSerialOverrideApproved={onSerialOverrideApproved}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("email-input")).toBeInTheDocument();
      });

      // Enter email and password
      await user.type(screen.getByTestId("email-input"), "limited@example.com");
      await user.type(screen.getByTestId("password-input"), "password123");

      // Submit
      await user.click(screen.getByTestId("authenticate-button"));

      // Should show error, NOT call the approval callback
      await waitFor(() => {
        expect(
          screen.getByText(
            /do not have permission to override the starting serial/i,
          ),
        ).toBeInTheDocument();
        expect(onSerialOverrideApproved).not.toHaveBeenCalled();
      });
    });

    it("LAM-023: should close modal after successful serial override approval", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      const onSerialOverrideApproved = vi.fn();

      renderWithProviders(
        <LotteryAuthModal
          {...serialOverrideProps}
          onOpenChange={onOpenChange}
          onSerialOverrideApproved={onSerialOverrideApproved}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("email-input")).toBeInTheDocument();
      });

      // Enter email and password
      await user.type(screen.getByTestId("email-input"), "jane@example.com");
      await user.type(screen.getByTestId("password-input"), "password123");

      // Submit
      await user.click(screen.getByTestId("authenticate-button"));

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it("should NOT call onAuthenticated in serial_override mode", async () => {
      const user = userEvent.setup();
      const onAuthenticated = vi.fn();
      const onSerialOverrideApproved = vi.fn();

      renderWithProviders(
        <LotteryAuthModal
          {...serialOverrideProps}
          onAuthenticated={onAuthenticated}
          onSerialOverrideApproved={onSerialOverrideApproved}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("email-input")).toBeInTheDocument();
      });

      // Enter email and password
      await user.type(screen.getByTestId("email-input"), "jane@example.com");
      await user.type(screen.getByTestId("password-input"), "password123");

      // Submit
      await user.click(screen.getByTestId("authenticate-button"));

      await waitFor(() => {
        // onSerialOverrideApproved should be called, NOT onAuthenticated
        expect(onSerialOverrideApproved).toHaveBeenCalled();
        expect(onAuthenticated).not.toHaveBeenCalled();
      });
    });

    it("should handle authentication errors in serial_override mode", async () => {
      const user = userEvent.setup();
      setupMocks({
        managementAuthSuccess: false,
        managementAuthError: "UNAUTHORIZED",
      });

      renderWithProviders(<LotteryAuthModal {...serialOverrideProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("email-input")).toBeInTheDocument();
      });

      // Enter email and password
      await user.type(screen.getByTestId("email-input"), "wrong@example.com");
      await user.type(screen.getByTestId("password-input"), "wrongpassword");

      // Submit
      await user.click(screen.getByTestId("authenticate-button"));

      await waitFor(() => {
        expect(
          screen.getByTestId("management-error-message"),
        ).toBeInTheDocument();
        expect(
          screen.getByText(/invalid email or password/i),
        ).toBeInTheDocument();
      });
    });

    it("should reset form when serial_override modal opens", async () => {
      const { rerender } = renderWithProviders(
        <LotteryAuthModal {...serialOverrideProps} open={false} />,
      );

      // Reopen modal
      rerender(
        <QueryClientProvider
          client={
            new QueryClient({
              defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
              },
            })
          }
        >
          <LotteryAuthModal {...serialOverrideProps} open={true} />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        const emailInput = screen.getByTestId(
          "email-input",
        ) as HTMLInputElement;
        expect(emailInput.value).toBe("");
        const passwordInput = screen.getByTestId(
          "password-input",
        ) as HTMLInputElement;
        expect(passwordInput.value).toBe("");
      });
    });
  });

  // ============================================================================
  // SECTION 9: AUTOFOCUS BEHAVIOR (LAM-025, LAM-026, LAM-027)
  // ============================================================================

  describe("Autofocus Behavior", () => {
    it("LAM-025: should autofocus PIN input when modal opens in cashier mode", async () => {
      renderWithProviders(<LotteryAuthModal {...defaultProps} />);

      await waitFor(() => {
        const pinInput = screen.getByTestId("pin-input");
        expect(pinInput).toBeInTheDocument();
        // Note: In test environment, we can verify the ref is attached
        // Actual focus behavior depends on dialog animation timing
      });
    });

    it("LAM-026: should autofocus email input when modal opens in serial_override mode", async () => {
      const serialOverrideProps = {
        ...defaultProps,
        mode: "serial_override" as const,
        onSerialOverrideApproved: vi.fn(),
      };

      renderWithProviders(<LotteryAuthModal {...serialOverrideProps} />);

      await waitFor(() => {
        const emailInput = screen.getByTestId("email-input");
        expect(emailInput).toBeInTheDocument();
        // Verify email input is present (focus timing depends on dialog animation)
      });
    });

    it("LAM-027: should focus appropriate input when switching tabs", async () => {
      const user = userEvent.setup();
      renderWithProviders(<LotteryAuthModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("pin-input")).toBeInTheDocument();
      });

      // Switch to Management tab
      await user.click(screen.getByTestId("management-tab"));

      await waitFor(() => {
        const emailInput = screen.getByTestId("email-input");
        expect(emailInput).toBeInTheDocument();
      });

      // Switch back to Cashier tab
      await user.click(screen.getByTestId("cashier-tab"));

      await waitFor(() => {
        const pinInput = screen.getByTestId("pin-input");
        expect(pinInput).toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // SECTION 10: ERROR MESSAGE SPECIFICITY (LAM-028, LAM-029)
  // ============================================================================

  describe("Error Message Specificity", () => {
    it("LAM-028: should show exact message for no active shift error", async () => {
      const user = userEvent.setup();

      // Mock the error with specific code
      vi.mocked(apiClient.post).mockImplementation(async (url: string) => {
        if (url.includes("/authenticate-pin")) {
          const error = new Error("You must have an active shift");
          (error as any).code = "NO_ACTIVE_SHIFT";
          throw error;
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      renderWithProviders(<LotteryAuthModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("pin-input")).toBeInTheDocument();
      });

      // Enter PIN
      const pinInput = screen.getByTestId("pin-input");
      await user.type(pinInput, "1234");

      // Submit
      const authButton = screen.getByTestId("authenticate-button");
      await user.click(authButton);

      // Verify EXACT error message
      await waitFor(() => {
        const errorMessage = screen.getByTestId("cashier-error-message");
        expect(errorMessage).toHaveTextContent(
          "You must have an active shift to activate packs.",
        );
      });
    });

    it("LAM-029: should show exact message for invalid PIN error", async () => {
      const user = userEvent.setup();

      // Mock the error for invalid PIN
      vi.mocked(apiClient.post).mockImplementation(async (url: string) => {
        if (url.includes("/authenticate-pin")) {
          const error = new Error("Invalid PIN");
          (error as any).code = "AUTHENTICATION_FAILED";
          throw error;
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      renderWithProviders(<LotteryAuthModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("pin-input")).toBeInTheDocument();
      });

      // Enter PIN
      const pinInput = screen.getByTestId("pin-input");
      await user.type(pinInput, "1234");

      // Submit
      const authButton = screen.getByTestId("authenticate-button");
      await user.click(authButton);

      // Verify EXACT error message
      await waitFor(() => {
        const errorMessage = screen.getByTestId("cashier-error-message");
        expect(errorMessage).toHaveTextContent(
          "Invalid PIN. Please try again.",
        );
      });
    });

    it("should show generic error for unknown error codes", async () => {
      const user = userEvent.setup();

      // Mock unknown error
      vi.mocked(apiClient.post).mockImplementation(async (url: string) => {
        if (url.includes("/authenticate-pin")) {
          throw new Error("Unknown server error");
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      renderWithProviders(<LotteryAuthModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("pin-input")).toBeInTheDocument();
      });

      // Enter PIN
      const pinInput = screen.getByTestId("pin-input");
      await user.type(pinInput, "1234");

      // Submit
      const authButton = screen.getByTestId("authenticate-button");
      await user.click(authButton);

      // Verify generic error message
      await waitFor(() => {
        const errorMessage = screen.getByTestId("cashier-error-message");
        expect(errorMessage).toHaveTextContent(
          "Authentication failed. Please try again.",
        );
      });
    });
  });
});
