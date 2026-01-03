/**
 * @test-level Component
 * @justification Component tests for EditStoreModal - validates form validation, status change confirmation, terminal management integration, submission, and error handling
 * @story 2-5-store-configuration-management
 * @enhanced-by workflow-9 on 2025-01-30
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../../support/test-utils";
import userEvent from "@testing-library/user-event";
import { EditStoreModal } from "@/components/stores/EditStoreModal";
import * as storesApi from "@/lib/api/stores";
import type { Store, TerminalWithStatus } from "@/lib/api/stores";

// Mock the API hooks
vi.mock("@/lib/api/stores", () => ({
  useUpdateStore: vi.fn(),
  useStoreTerminals: vi.fn(),
  useCreateTerminal: vi.fn(),
  useUpdateTerminal: vi.fn(),
  useDeleteTerminal: vi.fn(),
  useStoreLogin: vi.fn(),
  useCreateStoreLogin: vi.fn(),
  useUpdateStoreLogin: vi.fn(),
}));

// Mock toast hook
const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

describe("2.5-COMPONENT: EditStoreModal Component", () => {
  const mockStore: Store = {
    store_id: "223e4567-e89b-12d3-a456-426614174001",
    company_id: "123e4567-e89b-12d3-a456-426614174000",
    name: "Test Store",
    location_json: {
      address: "123 Main St",
    },
    timezone: "America/New_York",
    status: "ACTIVE",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };

  const mockTerminals: TerminalWithStatus[] = [
    {
      pos_terminal_id: "terminal-1",
      store_id: mockStore.store_id,
      name: "Terminal 1",
      device_id: "DEV-001",
      deleted_at: null,
      has_active_shift: false,
      active_shift_cashier_name: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    },
    {
      pos_terminal_id: "terminal-2",
      store_id: mockStore.store_id,
      name: "Terminal 2",
      device_id: null,
      deleted_at: null,
      has_active_shift: true,
      active_shift_cashier_name: "John Doe",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    },
  ];

  const mockUpdateMutation = {
    mutateAsync: vi.fn().mockResolvedValue(mockStore),
    isPending: false,
    isError: false,
    error: null,
  };

  const mockStoreTerminals = {
    data: mockTerminals,
    isLoading: false,
    isError: false,
    error: null,
  };

  const mockCreateTerminalMutation = {
    mutateAsync: vi.fn().mockResolvedValue(mockTerminals[0]),
    isPending: false,
  };

  const mockUpdateTerminalMutation = {
    mutateAsync: vi.fn().mockResolvedValue(mockTerminals[0]),
    isPending: false,
  };

  const mockDeleteTerminalMutation = {
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  };

  // Store Login mocks
  const mockStoreLogin = {
    user_id: "login-user-id",
    email: "storelogin@test.com",
    name: "Test Store",
    status: "ACTIVE",
  };

  const mockStoreLoginQuery = {
    data: mockStoreLogin,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  };

  const mockCreateStoreLoginMutation = {
    mutateAsync: vi.fn().mockResolvedValue(mockStoreLogin),
    isPending: false,
  };

  const mockUpdateStoreLoginMutation = {
    mutateAsync: vi.fn().mockResolvedValue(mockStoreLogin),
    isPending: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storesApi.useUpdateStore).mockReturnValue(
      mockUpdateMutation as any,
    );
    vi.mocked(storesApi.useStoreTerminals).mockReturnValue(
      mockStoreTerminals as any,
    );
    vi.mocked(storesApi.useCreateTerminal).mockReturnValue(
      mockCreateTerminalMutation as any,
    );
    vi.mocked(storesApi.useUpdateTerminal).mockReturnValue(
      mockUpdateTerminalMutation as any,
    );
    vi.mocked(storesApi.useDeleteTerminal).mockReturnValue(
      mockDeleteTerminalMutation as any,
    );
    vi.mocked(storesApi.useStoreLogin).mockReturnValue(
      mockStoreLoginQuery as any,
    );
    vi.mocked(storesApi.useCreateStoreLogin).mockReturnValue(
      mockCreateStoreLoginMutation as any,
    );
    vi.mocked(storesApi.useUpdateStoreLogin).mockReturnValue(
      mockUpdateStoreLoginMutation as any,
    );
  });

  describe("Modal Rendering", () => {
    it("[P0] 2.5-COMPONENT-001: should render modal when open is true", () => {
      // GIVEN: Modal is open
      const onOpenChange = vi.fn();
      renderWithProviders(
        <EditStoreModal
          open={true}
          onOpenChange={onOpenChange}
          store={mockStore}
        />,
      );

      // THEN: Modal should be visible
      expect(screen.getByText("Edit Store")).toBeInTheDocument();
      expect(
        screen.getByText(
          /Update store information including name, timezone, address, and status/i,
        ),
      ).toBeInTheDocument();
    });

    it("[P1] 2.5-COMPONENT-002: should not render modal when open is false", () => {
      // GIVEN: Modal is closed
      const onOpenChange = vi.fn();
      renderWithProviders(
        <EditStoreModal
          open={false}
          onOpenChange={onOpenChange}
          store={mockStore}
        />,
      );

      // THEN: Modal should not be visible
      expect(screen.queryByText("Edit Store")).not.toBeInTheDocument();
    });

    it("[P0] 2.5-COMPONENT-003: should populate form fields with store data", () => {
      // GIVEN: Modal is open with store data
      const onOpenChange = vi.fn();
      renderWithProviders(
        <EditStoreModal
          open={true}
          onOpenChange={onOpenChange}
          store={mockStore}
        />,
      );

      // THEN: Form fields should be populated
      const nameInput = screen.getByLabelText(
        /Store Name/i,
      ) as HTMLInputElement;
      expect(nameInput.value).toBe(mockStore.name);

      const timezoneInput = screen.getByLabelText(
        /Timezone/i,
      ) as HTMLInputElement;
      expect(timezoneInput.value).toBe(mockStore.timezone);

      const addressInput = screen.getByLabelText(
        /Address/i,
      ) as HTMLTextAreaElement;
      expect(addressInput.value).toBe(mockStore.location_json?.address || "");

      const statusSelect = screen.getByLabelText(/Status/i);
      expect(statusSelect).toBeInTheDocument();
    });
  });

  describe("Form Validation", () => {
    it("[P0] 2.5-COMPONENT-004: should display validation error when name is empty", async () => {
      // GIVEN: Modal is open
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      renderWithProviders(
        <EditStoreModal
          open={true}
          onOpenChange={onOpenChange}
          store={mockStore}
        />,
      );

      // WHEN: User clears name and submits
      const nameInput = screen.getByLabelText(/Store Name/i);
      await user.clear(nameInput);
      const submitButton = screen.getByRole("button", {
        name: /Update Store/i,
      });
      await user.click(submitButton);

      // THEN: Validation error should be displayed
      await waitFor(() => {
        expect(screen.getByText(/Store name is required/i)).toBeInTheDocument();
      });
    });

    it("[P1] 2.5-COMPONENT-005: should display validation error when timezone is invalid", async () => {
      // GIVEN: Modal is open
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      renderWithProviders(
        <EditStoreModal
          open={true}
          onOpenChange={onOpenChange}
          store={mockStore}
        />,
      );

      // WHEN: User enters invalid timezone and submits
      const timezoneInput = screen.getByLabelText(/Timezone/i);
      await user.clear(timezoneInput);
      await user.type(timezoneInput, "Invalid/Timezone");
      const submitButton = screen.getByRole("button", {
        name: /Update Store/i,
      });
      await user.click(submitButton);

      // THEN: Validation error should be displayed
      await waitFor(() => {
        expect(
          screen.getByText(/Timezone must be in IANA format/i),
        ).toBeInTheDocument();
      });
    });

    it("[P1] 2.5-COMPONENT-006: should accept valid IANA timezone formats", async () => {
      // GIVEN: Modal is open
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      renderWithProviders(
        <EditStoreModal
          open={true}
          onOpenChange={onOpenChange}
          store={mockStore}
        />,
      );

      // WHEN: User enters valid timezone
      const timezoneInput = screen.getByLabelText(/Timezone/i);
      await user.clear(timezoneInput);
      await user.type(timezoneInput, "Europe/London");
      const submitButton = screen.getByRole("button", {
        name: /Update Store/i,
      });
      await user.click(submitButton);

      // THEN: Form should submit successfully (no validation error)
      await waitFor(() => {
        expect(mockUpdateMutation.mutateAsync).toHaveBeenCalled();
      });
    });
  });

  describe("Status Change Confirmation", () => {
    it("[P0] 2.5-COMPONENT-007: should show confirmation dialog when status changes to INACTIVE", async () => {
      // GIVEN: Modal is open with ACTIVE store
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      renderWithProviders(
        <EditStoreModal
          open={true}
          onOpenChange={onOpenChange}
          store={mockStore}
        />,
      );

      // WHEN: User changes status to INACTIVE
      const statusSelect = screen.getByLabelText(/Status/i);
      await user.click(statusSelect);
      // Use getByRole to find the option in the dropdown
      const inactiveOption = screen.getByRole("option", { name: "Inactive" });
      await user.click(inactiveOption);

      // THEN: Confirmation dialog should appear
      await waitFor(() => {
        expect(
          screen.getByText(/Change status to INACTIVE/i),
        ).toBeInTheDocument();
        expect(
          screen.getByText(
            /Are you sure you want to change this store's status to INACTIVE/i,
          ),
        ).toBeInTheDocument();
      });
    });

    it("[P0] 2.5-COMPONENT-008: should show confirmation dialog when status changes to CLOSED", async () => {
      // GIVEN: Modal is open with ACTIVE store
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      renderWithProviders(
        <EditStoreModal
          open={true}
          onOpenChange={onOpenChange}
          store={mockStore}
        />,
      );

      // WHEN: User changes status to CLOSED
      const statusSelect = screen.getByLabelText(/Status/i);
      await user.click(statusSelect);
      // Use getByRole to find the option in the dropdown
      const closedOption = screen.getByRole("option", { name: "Closed" });
      await user.click(closedOption);

      // THEN: Confirmation dialog should appear
      await waitFor(() => {
        expect(
          screen.getByText(/Change status to CLOSED/i),
        ).toBeInTheDocument();
      });
    });

    it("[P1] 2.5-COMPONENT-009: should not show confirmation dialog when status changes to ACTIVE", async () => {
      // GIVEN: Modal is open with INACTIVE store
      const inactiveStore = { ...mockStore, status: "INACTIVE" as const };
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      renderWithProviders(
        <EditStoreModal
          open={true}
          onOpenChange={onOpenChange}
          store={inactiveStore}
        />,
      );

      // WHEN: User changes status to ACTIVE
      const statusSelect = screen.getByLabelText(/Status/i);
      await user.click(statusSelect);
      // Use getByRole to find the option in the dropdown
      const activeOption = screen.getByRole("option", { name: "Active" });
      await user.click(activeOption);

      // THEN: Confirmation dialog should NOT appear
      await waitFor(() => {
        expect(
          screen.queryByText(/Change status to ACTIVE/i),
        ).not.toBeInTheDocument();
      });
    });

    it("[P0] 2.5-COMPONENT-010: should update status when confirmation is confirmed", async () => {
      // GIVEN: Modal is open and status change confirmation dialog is shown
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      renderWithProviders(
        <EditStoreModal
          open={true}
          onOpenChange={onOpenChange}
          store={mockStore}
        />,
      );

      // WHEN: User changes status to INACTIVE and confirms
      const statusSelect = screen.getByLabelText(/Status/i);
      await user.click(statusSelect);
      // Use getByRole to find the option in the dropdown
      const inactiveOption = screen.getByRole("option", { name: "Inactive" });
      await user.click(inactiveOption);

      await waitFor(() => {
        expect(
          screen.getByText(/Change status to INACTIVE/i),
        ).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole("button", {
        name: /Change to INACTIVE/i,
      });
      await user.click(confirmButton);

      // THEN: Status should be updated in form
      await waitFor(() => {
        expect(
          screen.queryByText(/Change status to INACTIVE/i),
        ).not.toBeInTheDocument();
      });
    });

    it("[P1] 2.5-COMPONENT-011: should cancel status change when confirmation is cancelled", async () => {
      // GIVEN: Modal is open and status change confirmation dialog is shown
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      renderWithProviders(
        <EditStoreModal
          open={true}
          onOpenChange={onOpenChange}
          store={mockStore}
        />,
      );

      // WHEN: User changes status to INACTIVE and cancels
      const statusSelect = screen.getByLabelText(/Status/i);
      await user.click(statusSelect);
      // Use getByRole to find the option in the dropdown
      const inactiveOption = screen.getByRole("option", { name: "Inactive" });
      await user.click(inactiveOption);

      await waitFor(() => {
        expect(
          screen.getByText(/Change status to INACTIVE/i),
        ).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole("button", { name: /Cancel/i });
      await user.click(cancelButton);

      // THEN: Status should remain unchanged
      await waitFor(() => {
        expect(
          screen.queryByText(/Change status to INACTIVE/i),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("Form Submission", () => {
    it("[P0] 2.5-COMPONENT-012: should submit form with updated data", async () => {
      // GIVEN: Modal is open
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      renderWithProviders(
        <EditStoreModal
          open={true}
          onOpenChange={onOpenChange}
          store={mockStore}
        />,
      );

      // WHEN: User updates name and submits
      const nameInput = screen.getByLabelText(/Store Name/i);
      await user.clear(nameInput);
      await user.type(nameInput, "Updated Store Name");
      const submitButton = screen.getByRole("button", {
        name: /Update Store/i,
      });
      await user.click(submitButton);

      // THEN: Update mutation should be called with correct data
      await waitFor(() => {
        expect(mockUpdateMutation.mutateAsync).toHaveBeenCalledWith({
          storeId: mockStore.store_id,
          data: {
            name: "Updated Store Name",
            timezone: mockStore.timezone,
            status: mockStore.status,
            location_json: { address: mockStore.location_json?.address },
          },
        });
      });
    });

    it("[P0] 2.5-COMPONENT-013: should show success toast on successful submission", async () => {
      // GIVEN: Modal is open
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      renderWithProviders(
        <EditStoreModal
          open={true}
          onOpenChange={onOpenChange}
          store={mockStore}
        />,
      );

      // WHEN: User submits form
      const submitButton = screen.getByRole("button", {
        name: /Update Store/i,
      });
      await user.click(submitButton);

      // THEN: Success toast should be shown
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: "Success",
          description: "Store updated successfully",
        });
      });
    });

    it("[P0] 2.5-COMPONENT-014: should close modal on successful submission", async () => {
      // GIVEN: Modal is open
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      renderWithProviders(
        <EditStoreModal
          open={true}
          onOpenChange={onOpenChange}
          store={mockStore}
        />,
      );

      // WHEN: User submits form
      const submitButton = screen.getByRole("button", {
        name: /Update Store/i,
      });
      await user.click(submitButton);

      // THEN: Modal should be closed
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it("[P0] 2.5-COMPONENT-015: should call onSuccess callback on successful submission", async () => {
      // GIVEN: Modal is open with onSuccess callback
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      const onSuccess = vi.fn();
      renderWithProviders(
        <EditStoreModal
          open={true}
          onOpenChange={onOpenChange}
          store={mockStore}
          onSuccess={onSuccess}
        />,
      );

      // WHEN: User submits form
      const submitButton = screen.getByRole("button", {
        name: /Update Store/i,
      });
      await user.click(submitButton);

      // THEN: onSuccess callback should be called
      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
      });
    });

    it("[P0] 2.5-COMPONENT-016: should show error toast on submission failure", async () => {
      // GIVEN: Modal is open and update mutation fails
      const errorMessage = "Failed to update store";
      mockUpdateMutation.mutateAsync.mockRejectedValue(new Error(errorMessage));
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      renderWithProviders(
        <EditStoreModal
          open={true}
          onOpenChange={onOpenChange}
          store={mockStore}
        />,
      );

      // WHEN: User submits form
      const submitButton = screen.getByRole("button", {
        name: /Update Store/i,
      });
      await user.click(submitButton);

      // THEN: Error toast should be shown
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      });
    });
  });

  describe("Terminal Management Integration", () => {
    it("[P0] 2.5-COMPONENT-017: should display terminal management section", () => {
      // GIVEN: Modal is open with store
      const onOpenChange = vi.fn();
      renderWithProviders(
        <EditStoreModal
          open={true}
          onOpenChange={onOpenChange}
          store={mockStore}
        />,
      );

      // THEN: Terminal management section should be visible
      expect(screen.getByText("POS Terminals")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Add Terminal/i }),
      ).toBeInTheDocument();
    });

    it("[P0] 2.5-COMPONENT-018: should display existing terminals", () => {
      // GIVEN: Modal is open with store that has terminals
      const onOpenChange = vi.fn();
      renderWithProviders(
        <EditStoreModal
          open={true}
          onOpenChange={onOpenChange}
          store={mockStore}
        />,
      );

      // THEN: Terminals should be displayed
      expect(screen.getByText("Terminal 1")).toBeInTheDocument();
      expect(screen.getByText("Terminal 2")).toBeInTheDocument();
      expect(screen.getByText(/Device ID: DEV-001/i)).toBeInTheDocument();
    });

    it("[P0] 2.5-COMPONENT-019: should show active shift badge for terminal with active shift", () => {
      // GIVEN: Modal is open with store that has terminal with active shift
      const onOpenChange = vi.fn();
      renderWithProviders(
        <EditStoreModal
          open={true}
          onOpenChange={onOpenChange}
          store={mockStore}
        />,
      );

      // THEN: Active shift badge should be displayed
      expect(screen.getByText("Active Shift")).toBeInTheDocument();
    });

    it("[P0] 2.5-COMPONENT-020: should open create terminal dialog when Add Terminal is clicked", async () => {
      // GIVEN: Modal is open
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      renderWithProviders(
        <EditStoreModal
          open={true}
          onOpenChange={onOpenChange}
          store={mockStore}
        />,
      );

      // WHEN: User clicks Add Terminal button
      const addButton = screen.getByRole("button", { name: /Add Terminal/i });
      await user.click(addButton);

      // THEN: Create terminal dialog should be visible
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Add Terminal" }),
        ).toBeInTheDocument();
        expect(
          screen.getByText(/Create a new POS terminal for this store/i),
        ).toBeInTheDocument();
      });
    });
  });

  describe("Modal Close and Cancel", () => {
    it("[P1] 2.5-COMPONENT-021: should close modal when Cancel button is clicked", async () => {
      // GIVEN: Modal is open
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      renderWithProviders(
        <EditStoreModal
          open={true}
          onOpenChange={onOpenChange}
          store={mockStore}
        />,
      );

      // WHEN: User clicks Cancel button
      const cancelButton = screen.getByRole("button", { name: /Cancel/i });
      await user.click(cancelButton);

      // THEN: Modal should be closed
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("[P1] 2.5-COMPONENT-022: should reset form when modal closes", async () => {
      // GIVEN: Modal is open and form has been modified
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      const { rerender } = renderWithProviders(
        <EditStoreModal
          open={true}
          onOpenChange={onOpenChange}
          store={mockStore}
        />,
      );

      // WHEN: User modifies form and closes modal
      const nameInput = screen.getByLabelText(/Store Name/i);
      await user.clear(nameInput);
      await user.type(nameInput, "Modified Name");

      const cancelButton = screen.getByRole("button", { name: /Cancel/i });
      await user.click(cancelButton);

      // Close the modal
      rerender(
        <EditStoreModal
          open={false}
          onOpenChange={onOpenChange}
          store={mockStore}
        />,
      );

      // Reopen the modal
      rerender(
        <EditStoreModal
          open={true}
          onOpenChange={onOpenChange}
          store={mockStore}
        />,
      );

      // THEN: Form should be reset to original store values
      await waitFor(() => {
        const resetNameInput = screen.getByLabelText(
          /Store Name/i,
        ) as HTMLInputElement;
        expect(resetNameInput.value).toBe(mockStore.name);
      });
    });
  });

  describe("Store Login Section", () => {
    it("[P0] 2.5-COMPONENT-023: should display store login section", () => {
      // GIVEN: Modal is open with store
      const onOpenChange = vi.fn();
      renderWithProviders(
        <EditStoreModal
          open={true}
          onOpenChange={onOpenChange}
          store={mockStore}
        />,
      );

      // THEN: Store login section should be visible
      expect(screen.getByText("Store Login")).toBeInTheDocument();
    });

    it("[P0] 2.5-COMPONENT-024: should display existing login info when login exists", () => {
      // GIVEN: Modal is open with store that has a login
      const onOpenChange = vi.fn();
      renderWithProviders(
        <EditStoreModal
          open={true}
          onOpenChange={onOpenChange}
          store={mockStore}
        />,
      );

      // THEN: Login info should be displayed
      expect(screen.getByText("storelogin@test.com")).toBeInTheDocument();
      expect(screen.getByText(mockStore.name)).toBeInTheDocument(); // Login name is store name
    });

    it("[P1] 2.5-COMPONENT-025: should show Add Login button when no login exists", () => {
      // GIVEN: Store has no login
      vi.mocked(storesApi.useStoreLogin).mockReturnValue({
        data: null,
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      const onOpenChange = vi.fn();
      renderWithProviders(
        <EditStoreModal
          open={true}
          onOpenChange={onOpenChange}
          store={mockStore}
        />,
      );

      // THEN: Add Login button should be visible
      expect(screen.getByTestId("add-login-button")).toBeInTheDocument();
    });

    it("[P1] 2.5-COMPONENT-026: should show Edit button when login exists", () => {
      // GIVEN: Modal is open with store that has a login
      const onOpenChange = vi.fn();
      renderWithProviders(
        <EditStoreModal
          open={true}
          onOpenChange={onOpenChange}
          store={mockStore}
        />,
      );

      // THEN: Edit button should be visible in login section
      expect(screen.getByTestId("edit-login-button")).toBeInTheDocument();
    });

    it("[P1] 2.5-COMPONENT-027: should show loading state while fetching login", () => {
      // GIVEN: Login is loading
      vi.mocked(storesApi.useStoreLogin).mockReturnValue({
        data: null,
        isLoading: true,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      const onOpenChange = vi.fn();
      renderWithProviders(
        <EditStoreModal
          open={true}
          onOpenChange={onOpenChange}
          store={mockStore}
        />,
      );

      // THEN: Loading state should be visible
      expect(screen.getByText(/Loading login info/i)).toBeInTheDocument();
    });

    it("[P1] 2.5-COMPONENT-028: should show no login message when no login exists", () => {
      // GIVEN: Store has no login
      vi.mocked(storesApi.useStoreLogin).mockReturnValue({
        data: null,
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      const onOpenChange = vi.fn();
      renderWithProviders(
        <EditStoreModal
          open={true}
          onOpenChange={onOpenChange}
          store={mockStore}
        />,
      );

      // THEN: No login message should be visible
      expect(
        screen.getByText(/No store login configured/i),
      ).toBeInTheDocument();
    });

    it("[P0] 2.5-COMPONENT-029: should open edit form when Edit button is clicked", async () => {
      // GIVEN: Modal is open with login
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      renderWithProviders(
        <EditStoreModal
          open={true}
          onOpenChange={onOpenChange}
          store={mockStore}
        />,
      );

      // WHEN: User clicks Edit button in login section
      const editButton = screen.getByTestId("edit-login-button");
      await user.click(editButton);

      // THEN: Edit form should be visible
      await waitFor(() => {
        expect(screen.getByTestId("login-email-input")).toBeInTheDocument();
        expect(screen.getByTestId("login-password-input")).toBeInTheDocument();
      });
    });

    it("[P0] 2.5-COMPONENT-030: should show login name as store name in edit form", async () => {
      // GIVEN: Modal is open with login
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      renderWithProviders(
        <EditStoreModal
          open={true}
          onOpenChange={onOpenChange}
          store={mockStore}
        />,
      );

      // WHEN: User clicks Edit button
      const editButton = screen.getByTestId("edit-login-button");
      await user.click(editButton);

      // THEN: Login name should show as store name (not editable)
      await waitFor(() => {
        expect(
          screen.getByText(/The login name is the store name/i),
        ).toBeInTheDocument();
      });
    });
  });
});
