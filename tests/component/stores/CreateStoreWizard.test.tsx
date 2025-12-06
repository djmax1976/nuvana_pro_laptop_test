import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../../support/test-utils";
import userEvent from "@testing-library/user-event";
import { CreateStoreWizard } from "@/components/stores/CreateStoreWizard";
import * as storesApi from "@/lib/api/stores";

/**
 * CreateStoreWizard Component Tests
 *
 * Tests the two-step wizard for creating stores with login credentials and terminals.
 * Step 1: Store Information (name, timezone, address, status)
 * Step 2: Store Login credentials and POS Terminals configuration
 *
 * TEST FILE: tests/component/stores/CreateStoreWizard.test.tsx
 * FEATURE: Store Creation Wizard
 * CREATED: 2025-12-05
 */

// Mock Next.js router
const mockPush = vi.fn();
const mockBack = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
}));

// Mock the API hooks
vi.mock("@/lib/api/stores", () => ({
  useCreateStoreWithLogin: vi.fn(),
}));

// Mock toast hook
const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

describe("CreateStoreWizard Component", () => {
  const companyId = "123e4567-e89b-12d3-a456-426614174000";

  const mockCreateMutation = {
    mutateAsync: vi.fn().mockResolvedValue({
      store_id: "223e4567-e89b-12d3-a456-426614174001",
      name: "New Store",
      timezone: "America/New_York",
      status: "ACTIVE",
      store_login: {
        user_id: "333e4567-e89b-12d3-a456-426614174002",
        email: "storelogin@test.com",
        name: "New Store",
      },
      terminals: [],
    }),
    isPending: false,
    isError: false,
    error: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storesApi.useCreateStoreWithLogin).mockReturnValue(
      mockCreateMutation as any,
    );
  });

  describe("Step Indicator", () => {
    it("renders step indicator with two steps", () => {
      renderWithProviders(<CreateStoreWizard companyId={companyId} />);

      expect(screen.getByTestId("step-indicator")).toBeInTheDocument();
      expect(screen.getByText("Store Info")).toBeInTheDocument();
      expect(screen.getByText("Login & Terminals")).toBeInTheDocument();
    });

    it("shows step 1 as active initially", () => {
      renderWithProviders(<CreateStoreWizard companyId={companyId} />);

      expect(screen.getByTestId("step-1-store-info")).toBeInTheDocument();
      expect(
        screen.queryByTestId("step-2-login-terminals"),
      ).not.toBeInTheDocument();
    });
  });

  describe("Step 1: Store Information", () => {
    it("renders store info form fields", () => {
      renderWithProviders(<CreateStoreWizard companyId={companyId} />);

      expect(screen.getByTestId("store-name-input")).toBeInTheDocument();
      expect(screen.getByTestId("timezone-input")).toBeInTheDocument();
      expect(screen.getByTestId("address-input")).toBeInTheDocument();
      expect(screen.getByTestId("status-select")).toBeInTheDocument();
    });

    it("has default timezone value", () => {
      renderWithProviders(<CreateStoreWizard companyId={companyId} />);

      const timezoneInput = screen.getByTestId("timezone-input");
      expect(timezoneInput).toHaveValue("America/New_York");
    });

    it("shows validation error for empty store name", async () => {
      const user = userEvent.setup();
      renderWithProviders(<CreateStoreWizard companyId={companyId} />);

      // Try to proceed without store name
      const nextButton = screen.getByTestId("next-button");
      await user.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText(/Store name is required/i)).toBeInTheDocument();
      });
    });

    it("shows validation error for invalid timezone", async () => {
      const user = userEvent.setup();
      renderWithProviders(<CreateStoreWizard companyId={companyId} />);

      const timezoneInput = screen.getByTestId("timezone-input");
      await user.clear(timezoneInput);
      await user.type(timezoneInput, "Invalid/Timezone/Format/Extra");

      const storeNameInput = screen.getByTestId("store-name-input");
      await user.type(storeNameInput, "Test Store");

      const nextButton = screen.getByTestId("next-button");
      await user.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText(/IANA format/i)).toBeInTheDocument();
      });
    });

    it("navigates to step 2 with valid store info", async () => {
      const user = userEvent.setup();
      renderWithProviders(<CreateStoreWizard companyId={companyId} />);

      // Fill in store info
      const storeNameInput = screen.getByTestId("store-name-input");
      await user.type(storeNameInput, "Test Store");

      // Click next
      const nextButton = screen.getByTestId("next-button");
      await user.click(nextButton);

      // Should now be on step 2
      await waitFor(() => {
        expect(
          screen.getByTestId("step-2-login-terminals"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("Step 2: Login and Terminals", () => {
    // Helper to navigate to step 2 and return the user instance
    const navigateToStep2 = async () => {
      const user = userEvent.setup();
      renderWithProviders(<CreateStoreWizard companyId={companyId} />);

      const storeNameInput = screen.getByTestId("store-name-input");
      await user.type(storeNameInput, "Test Store");

      const nextButton = screen.getByTestId("next-button");
      await user.click(nextButton);

      await waitFor(() => {
        expect(
          screen.getByTestId("step-2-login-terminals"),
        ).toBeInTheDocument();
      });

      return user;
    };

    it("renders login form fields", async () => {
      await navigateToStep2();

      await waitFor(() => {
        expect(screen.getByTestId("login-email-input")).toBeInTheDocument();
        expect(screen.getByTestId("login-password-input")).toBeInTheDocument();
      });
    });

    it("renders terminal section with add button", async () => {
      await navigateToStep2();

      await waitFor(() => {
        expect(screen.getByTestId("add-terminal-button")).toBeInTheDocument();
      });
    });

    it("shows validation error for empty login email", async () => {
      const user = await navigateToStep2();

      await waitFor(() => {
        expect(screen.getByTestId("login-email-input")).toBeInTheDocument();
      });

      // Fill password but not email
      const passwordInput = screen.getByTestId("login-password-input");
      await user.type(passwordInput, "SecurePassword123!");

      // Try to submit
      const createButton = screen.getByTestId("create-store-button");
      await user.click(createButton);

      // Look for specific validation error text (email is required or Invalid email)
      await waitFor(() => {
        // The error message should contain "email" in a validation context
        expect(
          screen.getByText(/Invalid email|email is required/i),
        ).toBeInTheDocument();
      });
    });

    it("shows validation error for weak password", async () => {
      const user = await navigateToStep2();

      await waitFor(() => {
        expect(screen.getByTestId("login-email-input")).toBeInTheDocument();
      });

      const emailInput = screen.getByTestId("login-email-input");
      await user.type(emailInput, "storelogin@test.com");

      const passwordInput = screen.getByTestId("login-password-input");
      // Password is 8+ chars but missing complexity requirements
      await user.type(passwordInput, "password");

      // Try to submit
      const createButton = screen.getByTestId("create-store-button");
      await user.click(createButton);

      // Should show validation error about password complexity
      await waitFor(() => {
        expect(
          screen.getByText(
            /Password must include uppercase, lowercase, number, and special character/i,
          ),
        ).toBeInTheDocument();
      });
    });

    it("can navigate back to step 1", async () => {
      const user = await navigateToStep2();

      await waitFor(() => {
        expect(screen.getByTestId("back-button")).toBeInTheDocument();
      });

      const backButton = screen.getByTestId("back-button");
      await user.click(backButton);

      await waitFor(() => {
        expect(screen.getByTestId("step-1-store-info")).toBeInTheDocument();
      });
    });
  });

  describe("Terminal Management", () => {
    // Helper to navigate to step 2 and return the user instance
    const navigateToStep2 = async () => {
      const user = userEvent.setup();
      renderWithProviders(<CreateStoreWizard companyId={companyId} />);

      const storeNameInput = screen.getByTestId("store-name-input");
      await user.type(storeNameInput, "Test Store");

      const nextButton = screen.getByTestId("next-button");
      await user.click(nextButton);

      await waitFor(() => {
        expect(
          screen.getByTestId("step-2-login-terminals"),
        ).toBeInTheDocument();
      });

      return user;
    };

    it("opens terminal dialog when add button is clicked", async () => {
      const user = await navigateToStep2();

      const addButton = screen.getByTestId("add-terminal-button");
      await user.click(addButton);

      await waitFor(() => {
        expect(screen.getByTestId("terminal-name-input")).toBeInTheDocument();
      });
    });

    it("adds terminal to list when saved", async () => {
      const user = await navigateToStep2();

      // Open dialog
      const addButton = screen.getByTestId("add-terminal-button");
      await user.click(addButton);

      await waitFor(() => {
        expect(screen.getByTestId("terminal-name-input")).toBeInTheDocument();
      });

      // Fill in terminal info
      const terminalNameInput = screen.getByTestId("terminal-name-input");
      await user.type(terminalNameInput, "Terminal 1");

      // Save terminal
      const saveButton = screen.getByTestId("save-terminal-button");
      await user.click(saveButton);

      // Terminal should appear in list
      await waitFor(() => {
        expect(screen.getByText("Terminal 1")).toBeInTheDocument();
      });
    });

    it("shows toast error when terminal name is empty", async () => {
      const user = await navigateToStep2();

      // Open dialog
      const addButton = screen.getByTestId("add-terminal-button");
      await user.click(addButton);

      await waitFor(() => {
        expect(screen.getByTestId("terminal-name-input")).toBeInTheDocument();
      });

      // Try to save without name
      const saveButton = screen.getByTestId("save-terminal-button");
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Error",
            description: "Terminal name is required",
            variant: "destructive",
          }),
        );
      });
    });
  });

  describe("Form Submission", () => {
    it("submits form with valid data", async () => {
      const user = userEvent.setup();
      renderWithProviders(<CreateStoreWizard companyId={companyId} />);

      // Step 1: Store info
      const storeNameInput = screen.getByTestId("store-name-input");
      await user.type(storeNameInput, "Test Store");

      const nextButton = screen.getByTestId("next-button");
      await user.click(nextButton);

      await waitFor(() => {
        expect(
          screen.getByTestId("step-2-login-terminals"),
        ).toBeInTheDocument();
      });

      // Step 2: Login info
      const emailInput = screen.getByTestId("login-email-input");
      await user.type(emailInput, "storelogin@test.com");

      const passwordInput = screen.getByTestId("login-password-input");
      await user.type(passwordInput, "SecurePassword123!");

      // Submit
      const createButton = screen.getByTestId("create-store-button");
      await user.click(createButton);

      await waitFor(() => {
        expect(mockCreateMutation.mutateAsync).toHaveBeenCalledWith({
          companyId,
          data: expect.objectContaining({
            name: "Test Store",
            timezone: "America/New_York",
            status: "ACTIVE",
            manager: {
              email: "storelogin@test.com",
              password: "SecurePassword123!",
            },
          }),
        });
      });
    });

    it("shows success toast on successful submission", async () => {
      const user = userEvent.setup();
      renderWithProviders(<CreateStoreWizard companyId={companyId} />);

      // Fill form
      const storeNameInput = screen.getByTestId("store-name-input");
      await user.type(storeNameInput, "Test Store");

      const nextButton = screen.getByTestId("next-button");
      await user.click(nextButton);

      await waitFor(() => {
        expect(
          screen.getByTestId("step-2-login-terminals"),
        ).toBeInTheDocument();
      });

      const emailInput = screen.getByTestId("login-email-input");
      await user.type(emailInput, "storelogin@test.com");

      const passwordInput = screen.getByTestId("login-password-input");
      await user.type(passwordInput, "SecurePassword123!");

      const createButton = screen.getByTestId("create-store-button");
      await user.click(createButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Success",
          }),
        );
      });
    });

    it("shows error toast on submission failure", async () => {
      const failingMutation = {
        mutateAsync: vi.fn().mockRejectedValue(new Error("API Error")),
        isPending: false,
        isError: false,
        error: null,
      };
      vi.mocked(storesApi.useCreateStoreWithLogin).mockReturnValue(
        failingMutation as any,
      );

      const user = userEvent.setup();
      renderWithProviders(<CreateStoreWizard companyId={companyId} />);

      // Fill form
      const storeNameInput = screen.getByTestId("store-name-input");
      await user.type(storeNameInput, "Test Store");

      const nextButton = screen.getByTestId("next-button");
      await user.click(nextButton);

      await waitFor(() => {
        expect(
          screen.getByTestId("step-2-login-terminals"),
        ).toBeInTheDocument();
      });

      const emailInput = screen.getByTestId("login-email-input");
      await user.type(emailInput, "storelogin@test.com");

      const passwordInput = screen.getByTestId("login-password-input");
      await user.type(passwordInput, "SecurePassword123!");

      const createButton = screen.getByTestId("create-store-button");
      await user.click(createButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Error",
            variant: "destructive",
          }),
        );
      });
    });

    it("navigates to stores list on success", async () => {
      const user = userEvent.setup();
      renderWithProviders(<CreateStoreWizard companyId={companyId} />);

      // Fill form
      const storeNameInput = screen.getByTestId("store-name-input");
      await user.type(storeNameInput, "Test Store");

      const nextButton = screen.getByTestId("next-button");
      await user.click(nextButton);

      await waitFor(() => {
        expect(
          screen.getByTestId("step-2-login-terminals"),
        ).toBeInTheDocument();
      });

      const emailInput = screen.getByTestId("login-email-input");
      await user.type(emailInput, "storelogin@test.com");

      const passwordInput = screen.getByTestId("login-password-input");
      await user.type(passwordInput, "SecurePassword123!");

      const createButton = screen.getByTestId("create-store-button");
      await user.click(createButton);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(`/stores?companyId=${companyId}`);
      });
    });
  });

  describe("Cancel Behavior", () => {
    it("calls router.back() when cancel is clicked on step 1", async () => {
      const user = userEvent.setup();
      renderWithProviders(<CreateStoreWizard companyId={companyId} />);

      const cancelButton = screen.getByRole("button", { name: /cancel/i });
      await user.click(cancelButton);

      expect(mockBack).toHaveBeenCalled();
    });
  });
});
