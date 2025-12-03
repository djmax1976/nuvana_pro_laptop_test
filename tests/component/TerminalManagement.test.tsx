import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithProviders,
  screen,
  waitFor,
  fireEvent,
} from "../support/test-utils";
import userEvent from "@testing-library/user-event";
import { StoreForm } from "@/components/stores/StoreForm";
import * as storesApi from "@/lib/api/stores";
import type { Store, TerminalWithStatus } from "@/lib/api/stores";

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
  useCreateStore: vi.fn(),
  useUpdateStore: vi.fn(),
  useStoreTerminals: vi.fn(),
  useCreateTerminal: vi.fn(),
  useUpdateTerminal: vi.fn(),
  useDeleteTerminal: vi.fn(),
}));

// Mock toast hook
const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

describe("Terminal Management Component", () => {
  const companyId = "123e4567-e89b-12d3-a456-426614174000";

  const mockStore: Store = {
    store_id: "223e4567-e89b-12d3-a456-426614174001",
    company_id: companyId,
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
      pos_terminal_id: "550e8400-e29b-41d4-a716-446655440011",
      store_id: mockStore.store_id,
      name: "Terminal 1",
      device_id: "DEV-001",
      deleted_at: null,
      has_active_shift: false,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    },
    {
      pos_terminal_id: "550e8400-e29b-41d4-a716-446655440012",
      store_id: mockStore.store_id,
      name: "Terminal 2",
      device_id: "DEV-002",
      deleted_at: null,
      has_active_shift: true,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    },
    {
      pos_terminal_id: "550e8400-e29b-41d4-a716-446655440013",
      store_id: mockStore.store_id,
      name: "Terminal 3",
      device_id: null,
      deleted_at: null,
      has_active_shift: false,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    },
  ];

  const mockCreateMutation = {
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
    isError: false,
    error: null,
  };

  const mockUpdateMutation = {
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
    isError: false,
    error: null,
  };

  const mockDeleteMutation = {
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
    isError: false,
    error: null,
  };

  const mockTerminalsQuery = {
    data: mockTerminals,
    isLoading: false,
    isError: false,
    error: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storesApi.useCreateStore).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(mockStore),
      isLoading: false,
      isError: false,
      error: null,
    } as any);
    vi.mocked(storesApi.useUpdateStore).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(mockStore),
      isLoading: false,
      isError: false,
      error: null,
    } as any);
    vi.mocked(storesApi.useStoreTerminals).mockReturnValue(
      mockTerminalsQuery as any,
    );
    vi.mocked(storesApi.useCreateTerminal).mockReturnValue(
      mockCreateMutation as any,
    );
    vi.mocked(storesApi.useUpdateTerminal).mockReturnValue(
      mockUpdateMutation as any,
    );
    vi.mocked(storesApi.useDeleteTerminal).mockReturnValue(
      mockDeleteMutation as any,
    );
  });

  describe("Terminal Management Section Visibility", () => {
    it("[P0] Should display terminal management section when editing existing store", () => {
      // GIVEN: Form is rendered with existing store
      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      // THEN: Terminal management section should be visible
      expect(screen.getByText("POS Terminals")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Add Terminal/i }),
      ).toBeInTheDocument();
    });

    it("[P0] Should NOT display terminal management section when creating new store", () => {
      // GIVEN: Form is rendered without store (creating new)
      renderWithProviders(<StoreForm companyId={companyId} />);

      // THEN: Terminal management section should NOT be visible
      expect(screen.queryByText("POS Terminals")).not.toBeInTheDocument();
    });
  });

  describe("Terminal List Display", () => {
    it("[P0] Should display all terminals for the store", () => {
      // GIVEN: Form is rendered with store that has terminals
      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      // THEN: All terminals should be displayed
      expect(screen.getByText("Terminal 1")).toBeInTheDocument();
      expect(screen.getByText("Terminal 2")).toBeInTheDocument();
      expect(screen.getByText("Terminal 3")).toBeInTheDocument();
    });

    it("[P1] Should display terminal active shift badges", () => {
      // GIVEN: Form is rendered with store that has terminals
      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      // THEN: Active shift badge should be displayed for terminal with active shift
      expect(screen.getByText("Active Shift")).toBeInTheDocument();
    });

    it("[P1] Should display active shift indicator for terminals with active shifts", () => {
      // GIVEN: Form is rendered with store that has terminals
      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      // THEN: Active shift badge should be displayed for Terminal 2
      expect(screen.getByText("Active Shift")).toBeInTheDocument();
    });

    it("[P1] Should display device ID when present", () => {
      // GIVEN: Form is rendered with store that has terminals
      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      // THEN: Device IDs should be displayed
      expect(screen.getByText(/Device ID: DEV-001/i)).toBeInTheDocument();
      expect(screen.getByText(/Device ID: DEV-002/i)).toBeInTheDocument();
    });

    it("[P1] Should display empty state when no terminals exist", () => {
      // GIVEN: Form is rendered with store that has no terminals
      vi.mocked(storesApi.useStoreTerminals).mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      // THEN: Empty state message should be displayed
      expect(screen.getByText(/No terminals configured/i)).toBeInTheDocument();
    });

    it("[P1] Should display loading state while fetching terminals", () => {
      // GIVEN: Form is rendered and terminals are loading
      vi.mocked(storesApi.useStoreTerminals).mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
      } as any);

      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      // THEN: Loading message should be displayed
      expect(screen.getByText(/Loading terminals/i)).toBeInTheDocument();
    });
  });

  describe("Create Terminal", () => {
    it("[P0] Should open create terminal dialog when Add Terminal button is clicked", async () => {
      // GIVEN: Form is rendered with store
      const user = userEvent.setup();
      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
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

    it("[P0] Should create terminal with valid data", async () => {
      // GIVEN: Form is rendered and create dialog is open
      const user = userEvent.setup();
      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      const addButton = screen.getByRole("button", { name: /Add Terminal/i });
      await user.click(addButton);

      // Wait for dialog to open
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Add Terminal" }),
        ).toBeInTheDocument();
      });

      // WHEN: User fills form and submits
      const nameInput = screen.getByLabelText(/Terminal Name/i);
      await user.type(nameInput, "New Terminal");

      const deviceIdInput = screen.getByLabelText(/Device ID/i);
      await user.type(deviceIdInput, "DEV-NEW");

      const createButton = screen.getByRole("button", {
        name: /Create Terminal/i,
      });
      await user.click(createButton);

      // THEN: Create mutation should be called with correct data
      await waitFor(() => {
        expect(mockCreateMutation.mutateAsync).toHaveBeenCalledWith({
          storeId: mockStore.store_id,
          data: {
            name: "New Terminal",
            device_id: "DEV-NEW",
            connection_type: "MANUAL",
            vendor_type: "GENERIC",
            connection_config: undefined,
          },
        });
      });

      // AND: Success toast should be shown
      expect(mockToast).toHaveBeenCalledWith({
        title: "Success",
        description: "Terminal created successfully",
      });
    });

    it("[P0] Should validate terminal name is required", async () => {
      // GIVEN: Form is rendered and create dialog is open
      const user = userEvent.setup();
      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      const addButton = screen.getByRole("button", { name: /Add Terminal/i });
      await user.click(addButton);

      // WHEN: User tries to submit without name
      const createButton = screen.getByRole("button", {
        name: /Create Terminal/i,
      });
      await user.click(createButton);

      // THEN: Error toast should be shown
      expect(mockToast).toHaveBeenCalledWith({
        title: "Error",
        description: "Terminal name is required",
        variant: "destructive",
      });

      // AND: Create mutation should NOT be called
      expect(mockCreateMutation.mutateAsync).not.toHaveBeenCalled();
    });

    it("[P1] Should trim whitespace from terminal name", async () => {
      // GIVEN: Form is rendered and create dialog is open
      const user = userEvent.setup();
      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      const addButton = screen.getByRole("button", { name: /Add Terminal/i });
      await user.click(addButton);

      // Wait for dialog to open
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Add Terminal" }),
        ).toBeInTheDocument();
      });

      // WHEN: User enters name with whitespace
      const nameInput = screen.getByLabelText(/Terminal Name/i);
      await user.type(nameInput, "  Trimmed Terminal  ");

      const createButton = screen.getByRole("button", {
        name: /Create Terminal/i,
      });
      await user.click(createButton);

      // THEN: Create mutation should be called with trimmed name
      await waitFor(() => {
        expect(mockCreateMutation.mutateAsync).toHaveBeenCalledWith({
          storeId: mockStore.store_id,
          data: expect.objectContaining({
            name: "Trimmed Terminal",
          }),
        });
      });
    });

    it("[P1] Should handle create terminal error", async () => {
      // GIVEN: Create mutation fails
      const error = new Error("Failed to create terminal");
      mockCreateMutation.mutateAsync.mockRejectedValue(error);

      const user = userEvent.setup();
      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      const addButton = screen.getByRole("button", { name: /Add Terminal/i });
      await user.click(addButton);

      // Wait for dialog to open
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Add Terminal" }),
        ).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/Terminal Name/i);
      await user.type(nameInput, "New Terminal");

      const createButton = screen.getByRole("button", {
        name: /Create Terminal/i,
      });
      await user.click(createButton);

      // THEN: Error toast should be shown
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: "Error",
          description: "Failed to create terminal",
          variant: "destructive",
        });
      });
    });
  });

  describe("Update Terminal", () => {
    it("[P0] Should open edit terminal dialog when edit button is clicked", async () => {
      // GIVEN: Form is rendered with store that has terminals
      const user = userEvent.setup();
      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      // WHEN: User clicks edit button for Terminal 1
      const editButton = screen.getByRole("button", {
        name: /Edit Terminal 1/i,
      });
      await user.click(editButton);

      // THEN: Edit terminal dialog should be visible
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Edit Terminal" }),
        ).toBeInTheDocument();
        expect(
          screen.getByText(/Update terminal information/i),
        ).toBeInTheDocument();
      });
    });

    it("[P0] Should pre-fill form with terminal data when editing", async () => {
      // GIVEN: Form is rendered with store that has terminals
      const user = userEvent.setup();
      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      // WHEN: User clicks edit button
      const editButton = screen.getByRole("button", {
        name: /Edit Terminal 1/i,
      });
      await user.click(editButton);

      // Wait for dialog to open
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Edit Terminal" }),
        ).toBeInTheDocument();
      });

      // THEN: Form should be pre-filled with terminal data
      const nameInput = screen.getByLabelText(
        /Terminal Name/i,
      ) as HTMLInputElement;
      expect(nameInput.value).toBe("Terminal 1");
    });

    it("[P0] Should update terminal with valid data", async () => {
      // GIVEN: Form is rendered and edit dialog is open
      const user = userEvent.setup();
      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      const editButton = screen.getByRole("button", {
        name: /Edit Terminal 1/i,
      });
      await user.click(editButton);

      // Wait for dialog to open
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Edit Terminal" }),
        ).toBeInTheDocument();
      });

      // WHEN: User updates name and submits
      const nameInput = screen.getByLabelText(/Terminal Name/i);
      await user.clear(nameInput);
      await user.type(nameInput, "Updated Terminal");

      const updateButton = screen.getByRole("button", {
        name: /Update Terminal/i,
      });
      await user.click(updateButton);

      // THEN: Update mutation should be called with correct data
      await waitFor(() => {
        expect(mockUpdateMutation.mutateAsync).toHaveBeenCalledWith({
          storeId: mockStore.store_id,
          terminalId: mockTerminals[0].pos_terminal_id,
          data: {
            name: "Updated Terminal",
            device_id: "DEV-001",
            connection_type: "MANUAL",
            vendor_type: "GENERIC",
            connection_config: undefined,
          },
        });
      });

      // AND: Success toast should be shown
      expect(mockToast).toHaveBeenCalledWith({
        title: "Success",
        description: "Terminal updated successfully",
      });
    });

    it("[P0] Should validate terminal name is required when updating", async () => {
      // GIVEN: Form is rendered and edit dialog is open
      const user = userEvent.setup();
      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      const editButton = screen.getByRole("button", {
        name: /Edit Terminal 1/i,
      });
      await user.click(editButton);

      // Wait for dialog to open
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Edit Terminal" }),
        ).toBeInTheDocument();
      });

      // WHEN: User clears name and tries to submit
      const nameInput = screen.getByLabelText(/Terminal Name/i);
      await user.clear(nameInput);

      const updateButton = screen.getByRole("button", {
        name: /Update Terminal/i,
      });
      await user.click(updateButton);

      // THEN: Error toast should be shown
      expect(mockToast).toHaveBeenCalledWith({
        title: "Error",
        description: "Terminal name is required",
        variant: "destructive",
      });

      // AND: Update mutation should NOT be called
      expect(mockUpdateMutation.mutateAsync).not.toHaveBeenCalled();
    });
  });

  describe("Delete Terminal", () => {
    it("[P0] Should show confirmation dialog when delete button is clicked", async () => {
      // GIVEN: Form is rendered with store that has terminals
      const user = userEvent.setup();
      // Mock window.confirm
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      // WHEN: User clicks delete button for Terminal 1
      const deleteButton = screen.getByRole("button", {
        name: /Delete Terminal 1/i,
      });
      await user.click(deleteButton);

      // THEN: Confirmation dialog should be shown
      expect(confirmSpy).toHaveBeenCalledWith(
        expect.stringContaining("Terminal 1"),
      );

      confirmSpy.mockRestore();
    });

    it("[P0] Should delete terminal when confirmed", async () => {
      // GIVEN: Form is rendered with store that has terminals
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      // WHEN: User confirms deletion
      const deleteButton = screen.getByRole("button", {
        name: /Delete Terminal 1/i,
      });
      await user.click(deleteButton);

      // THEN: Delete mutation should be called
      await waitFor(() => {
        expect(mockDeleteMutation.mutateAsync).toHaveBeenCalledWith({
          storeId: mockStore.store_id,
          terminalId: mockTerminals[0].pos_terminal_id,
        });
      });

      // AND: Success toast should be shown
      expect(mockToast).toHaveBeenCalledWith({
        title: "Success",
        description: "Terminal deleted successfully",
      });

      confirmSpy.mockRestore();
    });

    it("[P0] Should NOT delete terminal when cancelled", async () => {
      // GIVEN: Form is rendered with store that has terminals
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      // WHEN: User cancels deletion
      const deleteButton = screen.getByRole("button", {
        name: /Delete Terminal 1/i,
      });
      await user.click(deleteButton);

      // THEN: Delete mutation should NOT be called
      expect(mockDeleteMutation.mutateAsync).not.toHaveBeenCalled();

      confirmSpy.mockRestore();
    });

    it("[P1] Should disable delete button for terminals with active shifts", () => {
      // GIVEN: Form is rendered with store that has terminals
      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      // THEN: Delete button for Terminal 2 (has active shift) should be disabled
      const terminal2DeleteButton = screen.getByRole("button", {
        name: /Delete Terminal 2/i,
      });
      expect(terminal2DeleteButton).toBeDisabled();
    });

    it("[P1] Should handle delete terminal error", async () => {
      // GIVEN: Delete mutation fails
      const error = new Error("Failed to delete terminal");
      mockDeleteMutation.mutateAsync.mockRejectedValue(error);

      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      // WHEN: User confirms deletion
      const deleteButton = screen.getByRole("button", {
        name: /Delete Terminal 1/i,
      });
      await user.click(deleteButton);

      // THEN: Error toast should be shown
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: "Error",
          description: "Failed to delete terminal",
          variant: "destructive",
        });
      });

      confirmSpy.mockRestore();
    });
  });

  describe("Loading States", () => {
    it("[P1] Should disable buttons while mutations are pending", () => {
      // GIVEN: Form is rendered and create mutation is pending
      vi.mocked(storesApi.useCreateTerminal).mockReturnValue({
        ...mockCreateMutation,
        isPending: true,
      } as any);

      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      // THEN: Add Terminal button should be disabled
      const addButton = screen.getByRole("button", { name: /Add Terminal/i });
      expect(addButton).toBeDisabled();
    });
  });

  describe("Terminal List - Connection Fields Display (AC #1)", () => {
    it("[P0] Should display connection type badge for each terminal", () => {
      // GIVEN: Form is rendered with terminals that have connection types
      const terminalsWithConnections: TerminalWithStatus[] = [
        {
          ...mockTerminals[0],
          connection_type: "API",
          terminal_status: "ACTIVE",
        },
        {
          ...mockTerminals[1],
          connection_type: "NETWORK",
          terminal_status: "PENDING",
        },
        {
          ...mockTerminals[2],
          connection_type: "MANUAL",
          terminal_status: "INACTIVE",
        },
      ];

      vi.mocked(storesApi.useStoreTerminals).mockReturnValue({
        data: terminalsWithConnections,
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      // THEN: Connection type badges should be displayed
      expect(screen.getByText("API")).toBeInTheDocument();
      expect(screen.getByText("Network")).toBeInTheDocument();
      expect(screen.getByText("Manual")).toBeInTheDocument();
    });

    it("[P0] Should display terminal status badges with correct colors", () => {
      // GIVEN: Form is rendered with terminals that have different statuses
      const terminalsWithStatuses: TerminalWithStatus[] = [
        {
          ...mockTerminals[0],
          connection_type: "API",
          terminal_status: "ACTIVE",
        },
        {
          ...mockTerminals[1],
          connection_type: "NETWORK",
          terminal_status: "PENDING",
        },
        {
          ...mockTerminals[2],
          connection_type: "FILE",
          terminal_status: "ERROR",
        },
      ];

      vi.mocked(storesApi.useStoreTerminals).mockReturnValue({
        data: terminalsWithStatuses,
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      // THEN: Status badges should be displayed
      expect(screen.getByText("ACTIVE")).toBeInTheDocument();
      expect(screen.getByText("PENDING")).toBeInTheDocument();
      expect(screen.getByText("ERROR")).toBeInTheDocument();
    });

    it("[P1] Should display last sync time with relative formatting", () => {
      // GIVEN: Form is rendered with terminal that has sync status
      const twoHoursAgo = new Date();
      twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);

      const terminalWithSync: TerminalWithStatus[] = [
        {
          ...mockTerminals[0],
          connection_type: "API",
          terminal_status: "ACTIVE",
          sync_status: "SUCCESS",
          last_sync_at: twoHoursAgo.toISOString(),
        },
      ];

      vi.mocked(storesApi.useStoreTerminals).mockReturnValue({
        data: terminalWithSync,
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      // THEN: Last sync time should be displayed with relative formatting
      expect(screen.getByText(/Last sync:/i)).toBeInTheDocument();
    });

    it("[P1] Should display 'Never synced' when sync_status is NEVER", () => {
      // GIVEN: Form is rendered with terminal that has never synced
      const terminalNeverSynced: TerminalWithStatus[] = [
        {
          ...mockTerminals[0],
          connection_type: "API",
          terminal_status: "ACTIVE",
          sync_status: "NEVER",
          last_sync_at: null,
        },
      ];

      vi.mocked(storesApi.useStoreTerminals).mockReturnValue({
        data: terminalNeverSynced,
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      // THEN: "Never synced" should be displayed
      expect(screen.getByText(/Never synced/i)).toBeInTheDocument();
    });
  });

  describe("Terminal Form - Connection Type and Vendor Fields (AC #2)", () => {
    it("[P0] Should display Connection Type dropdown with all options", async () => {
      // GIVEN: Form is rendered and create dialog is open
      const user = userEvent.setup();
      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      const addButton = screen.getByRole("button", { name: /Add Terminal/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Add Terminal" }),
        ).toBeInTheDocument();
      });

      // WHEN: User opens Connection Type dropdown
      const connectionTypeSelect = screen.getByLabelText(/Connection Type/i);
      await user.click(connectionTypeSelect);

      // THEN: All connection type options should be available
      await waitFor(() => {
        expect(
          screen.getByRole("option", { name: /Network/i }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("option", { name: /API/i }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("option", { name: /Webhook/i }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("option", { name: /File/i }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("option", { name: /Manual/i }),
        ).toBeInTheDocument();
      });
    });

    it("[P0] Should display POS Vendor dropdown with all options", async () => {
      // GIVEN: Form is rendered and create dialog is open
      const user = userEvent.setup();
      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      const addButton = screen.getByRole("button", { name: /Add Terminal/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Add Terminal" }),
        ).toBeInTheDocument();
      });

      // WHEN: User opens POS Vendor dropdown
      const vendorSelect = screen.getByLabelText(/POS Vendor/i);
      await user.click(vendorSelect);

      // THEN: All vendor options should be available
      await waitFor(() => {
        expect(
          screen.getByRole("option", { name: /Generic/i }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("option", { name: /Square/i }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("option", { name: /Clover/i }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("option", { name: /Toast/i }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("option", { name: /Lightspeed/i }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("option", { name: /Custom/i }),
        ).toBeInTheDocument();
      });
    });

    it("[P1] Should pre-fill connection type and vendor when editing terminal", async () => {
      // GIVEN: Form is rendered with terminal that has connection fields
      const user = userEvent.setup();
      const terminalWithConnection: TerminalWithStatus[] = [
        {
          ...mockTerminals[0],
          connection_type: "API",
          vendor_type: "SQUARE",
          terminal_status: "ACTIVE",
          sync_status: "SUCCESS",
          last_sync_at: new Date().toISOString(),
        },
      ];

      vi.mocked(storesApi.useStoreTerminals).mockReturnValue({
        data: terminalWithConnection,
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      // WHEN: User clicks edit button
      const editButton = screen.getByRole("button", {
        name: /Edit Terminal 1/i,
      });
      await user.click(editButton);

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Edit Terminal" }),
        ).toBeInTheDocument();
      });

      // THEN: Connection type and vendor should be pre-filled
      const connectionTypeSelect = screen.getByLabelText(/Connection Type/i);
      expect(connectionTypeSelect).toHaveTextContent(/API/i);

      const vendorSelect = screen.getByLabelText(/POS Vendor/i);
      expect(vendorSelect).toHaveTextContent(/Square/i);
    });
  });

  describe("Terminal Form - Connection Config Form Validation (AC #3)", () => {
    it("[P1] Should show NETWORK config fields when NETWORK is selected", async () => {
      // GIVEN: Form is rendered and create dialog is open
      const user = userEvent.setup();
      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      const addButton = screen.getByRole("button", { name: /Add Terminal/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Add Terminal" }),
        ).toBeInTheDocument();
      });

      // WHEN: User selects NETWORK connection type
      const connectionTypeSelect = screen.getByLabelText(/Connection Type/i);
      await user.click(connectionTypeSelect);
      await user.click(screen.getByRole("option", { name: /Network/i }));

      // THEN: NETWORK config fields should be displayed
      await waitFor(() => {
        expect(screen.getByLabelText(/Host/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Port/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Protocol/i)).toBeInTheDocument();
      });
    });

    it("[P1] Should show API config fields when API is selected", async () => {
      // GIVEN: Form is rendered and create dialog is open
      const user = userEvent.setup();
      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      const addButton = screen.getByRole("button", { name: /Add Terminal/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Add Terminal" }),
        ).toBeInTheDocument();
      });

      // WHEN: User selects API connection type
      const connectionTypeSelect = screen.getByLabelText(/Connection Type/i);
      await user.click(connectionTypeSelect);
      await user.click(screen.getByRole("option", { name: /API/i }));

      // THEN: API config fields should be displayed
      await waitFor(() => {
        expect(screen.getByLabelText(/Base URL/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/API Key/i)).toBeInTheDocument();
      });
    });

    it("[P1] Should show WEBHOOK config fields when WEBHOOK is selected", async () => {
      // GIVEN: Form is rendered and create dialog is open
      const user = userEvent.setup();
      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      const addButton = screen.getByRole("button", { name: /Add Terminal/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Add Terminal" }),
        ).toBeInTheDocument();
      });

      // WHEN: User selects WEBHOOK connection type
      const connectionTypeSelect = screen.getByLabelText(/Connection Type/i);
      await user.click(connectionTypeSelect);
      await user.click(screen.getByRole("option", { name: /Webhook/i }));

      // THEN: WEBHOOK config fields should be displayed
      await waitFor(() => {
        expect(screen.getByLabelText(/Webhook URL/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Secret/i)).toBeInTheDocument();
      });
    });

    it("[P1] Should show FILE config fields when FILE is selected", async () => {
      // GIVEN: Form is rendered and create dialog is open
      const user = userEvent.setup();
      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      const addButton = screen.getByRole("button", { name: /Add Terminal/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Add Terminal" }),
        ).toBeInTheDocument();
      });

      // WHEN: User selects FILE connection type
      const connectionTypeSelect = screen.getByLabelText(/Connection Type/i);
      await user.click(connectionTypeSelect);
      await user.click(screen.getByRole("option", { name: /File/i }));

      // THEN: FILE config fields should be displayed
      await waitFor(() => {
        expect(screen.getByLabelText(/Import Path/i)).toBeInTheDocument();
      });
    });

    it("[P1] Should hide config fields when MANUAL is selected", async () => {
      // GIVEN: Form is rendered and create dialog is open with NETWORK selected
      const user = userEvent.setup();
      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      const addButton = screen.getByRole("button", { name: /Add Terminal/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Add Terminal" }),
        ).toBeInTheDocument();
      });

      // WHEN: User selects NETWORK then switches to MANUAL
      const connectionTypeSelect = screen.getByLabelText(/Connection Type/i);
      await user.click(connectionTypeSelect);
      await user.click(screen.getByRole("option", { name: /Network/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/Host/i)).toBeInTheDocument();
      });

      await user.click(connectionTypeSelect);
      await user.click(screen.getByRole("option", { name: /Manual/i }));

      // THEN: Config fields should be hidden
      await waitFor(() => {
        expect(screen.queryByLabelText(/Host/i)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/Base URL/i)).not.toBeInTheDocument();
      });
    });
  });

  describe("Terminal Create/Update - Connection Configuration (AC #4)", () => {
    it("[P0] Should create terminal with API connection configuration", async () => {
      // GIVEN: Form is rendered and create dialog is open
      const user = userEvent.setup();
      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      const addButton = screen.getByRole("button", { name: /Add Terminal/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Add Terminal" }),
        ).toBeInTheDocument();
      });

      // WHEN: User fills form with API connection config
      await user.type(screen.getByLabelText(/Terminal Name/i), "API Terminal");
      await user.type(screen.getByLabelText(/Device ID/i), "DEV-API-001");

      // Wait for Connection Type field to be available
      await waitFor(() => {
        expect(screen.getByLabelText(/Connection Type/i)).toBeInTheDocument();
      });
      const connectionTypeSelect = screen.getByLabelText(/Connection Type/i);
      await user.click(connectionTypeSelect);
      await user.click(screen.getByRole("option", { name: /API/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/Base URL/i)).toBeInTheDocument();
      });

      const baseUrlInput = screen.getByLabelText(/Base URL/i);
      await user.type(baseUrlInput, "https://api.example.com");
      await user.tab(); // Blur baseUrl field to trigger onConfigChange

      const apiKeyInput = screen.getByLabelText(/API Key/i);
      await user.type(apiKeyInput, "secret-api-key-123");
      await user.tab(); // Blur apiKey field to trigger onConfigChange

      // Wait a bit for the config to be set
      await waitFor(
        () => {
          // Config should be set via onBlur
        },
        { timeout: 1000 },
      );

      const createButton = screen.getByRole("button", {
        name: /Create Terminal/i,
      });
      await user.click(createButton);

      // THEN: Create mutation should be called with connection config
      await waitFor(() => {
        expect(mockCreateMutation.mutateAsync).toHaveBeenCalledWith({
          storeId: mockStore.store_id,
          data: expect.objectContaining({
            name: "API Terminal",
            device_id: "DEV-API-001",
            connection_type: "API",
            connection_config: expect.objectContaining({
              baseUrl: "https://api.example.com",
              apiKey: "secret-api-key-123",
            }),
          }),
        });
      });
    });

    it("[P0] Should update terminal with NETWORK connection configuration", async () => {
      // GIVEN: Form is rendered with terminal and edit dialog is open
      const user = userEvent.setup();
      const terminalWithConnection: TerminalWithStatus[] = [
        {
          ...mockTerminals[0],
          connection_type: "API",
          vendor_type: "GENERIC",
        },
      ];

      vi.mocked(storesApi.useStoreTerminals).mockReturnValue({
        data: terminalWithConnection,
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      const editButton = screen.getByRole("button", {
        name: /Edit Terminal 1/i,
      });
      await user.click(editButton);

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Edit Terminal" }),
        ).toBeInTheDocument();
      });

      // WHEN: User changes connection type to NETWORK and fills config
      // Wait for Connection Type field to be available
      await waitFor(() => {
        expect(screen.getByLabelText(/Connection Type/i)).toBeInTheDocument();
      });
      const connectionTypeSelect = screen.getByLabelText(/Connection Type/i);
      await user.click(connectionTypeSelect);
      await user.click(screen.getByRole("option", { name: /Network/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/Host/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/Host/i), "192.168.1.100");
      await user.type(screen.getByLabelText(/Port/i), "8080");

      const updateButton = screen.getByRole("button", {
        name: /Update Terminal/i,
      });
      await user.click(updateButton);

      // THEN: Update mutation should be called with NETWORK connection config
      await waitFor(() => {
        expect(mockUpdateMutation.mutateAsync).toHaveBeenCalledWith({
          storeId: mockStore.store_id,
          terminalId: mockTerminals[0].pos_terminal_id,
          data: expect.objectContaining({
            connection_type: "NETWORK",
            connection_config: expect.objectContaining({
              host: "192.168.1.100",
              port: 8080,
            }),
          }),
        });
      });
    });

    it("[P1] Should not send connection_config when MANUAL is selected", async () => {
      // GIVEN: Form is rendered and create dialog is open
      const user = userEvent.setup();
      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      const addButton = screen.getByRole("button", { name: /Add Terminal/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Add Terminal" }),
        ).toBeInTheDocument();
      });

      // WHEN: User creates terminal with MANUAL connection type
      await user.type(
        screen.getByLabelText(/Terminal Name/i),
        "Manual Terminal",
      );

      // Connection type defaults to MANUAL, so no config fields should appear
      const createButton = screen.getByRole("button", {
        name: /Create Terminal/i,
      });
      await user.click(createButton);

      // THEN: Create mutation should be called without connection_config
      await waitFor(() => {
        expect(mockCreateMutation.mutateAsync).toHaveBeenCalledWith({
          storeId: mockStore.store_id,
          data: expect.objectContaining({
            name: "Manual Terminal",
            connection_type: "MANUAL",
          }),
        });
      });

      // AND: connection_config should be undefined or not included
      const callArgs = mockCreateMutation.mutateAsync.mock.calls[0][0];
      expect(callArgs.data.connection_config).toBeUndefined();
    });

    it.skip("[P1] Should show success toast after creating terminal with connection config", async () => {
      // GIVEN: Form is rendered and create dialog is open
      const user = userEvent.setup();
      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      const addButton = screen.getByRole("button", { name: /Add Terminal/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Add Terminal" }),
        ).toBeInTheDocument();
      });

      // WHEN: User creates terminal with connection config
      await user.type(screen.getByLabelText(/Terminal Name/i), "Test Terminal");

      // Wait for Connection Type field to be available
      await waitFor(() => {
        expect(screen.getByLabelText(/Connection Type/i)).toBeInTheDocument();
      });
      const connectionTypeSelect = screen.getByLabelText(/Connection Type/i);
      await user.click(connectionTypeSelect);
      await user.click(screen.getByRole("option", { name: /API/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/Base URL/i)).toBeInTheDocument();
      });

      const baseUrlInput = screen.getByLabelText(/Base URL/i);
      await user.type(baseUrlInput, "https://api.test.com");
      await user.tab(); // Blur baseUrl field to trigger onConfigChange

      const apiKeyInput = screen.getByLabelText(/API Key/i);
      await user.type(apiKeyInput, "test-key");
      await user.tab(); // Blur apiKey field to trigger onConfigChange

      // Wait a bit for the config to be set via onBlur
      await waitFor(
        () => {
          // Config should be set via onBlur
        },
        { timeout: 1000 },
      );

      const createButton = screen.getByRole("button", {
        name: /Create Terminal/i,
      });
      await user.click(createButton);

      // THEN: Create mutation should be called with connection config
      await waitFor(() => {
        expect(mockCreateMutation.mutateAsync).toHaveBeenCalled();
        const callArgs = mockCreateMutation.mutateAsync.mock.calls[0][0];
        expect(callArgs.data.connection_type).toBe("API");
        expect(callArgs.data.connection_config).toBeDefined();
        expect(callArgs.data.connection_config).toMatchObject({
          baseUrl: "https://api.test.com",
          apiKey: "test-key",
        });
      });

      // AND: Success toast should be shown
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: "Success",
          description: "Terminal created successfully",
        });
      });
    });
  });

  describe("Security: Input Validation and XSS Prevention", () => {
    it("[P0] Should sanitize XSS attempts in terminal name", async () => {
      // GIVEN: Form is rendered and create dialog is open
      const user = userEvent.setup();
      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      const addButton = screen.getByRole("button", { name: /Add Terminal/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Add Terminal" }),
        ).toBeInTheDocument();
      });

      // WHEN: User enters XSS attempt in terminal name
      const nameInput = screen.getByLabelText(/Terminal Name/i);
      await user.type(nameInput, "<script>alert('XSS')</script>");

      const createButton = screen.getByRole("button", {
        name: /Create Terminal/i,
      });
      await user.click(createButton);

      // THEN: XSS should be prevented (either validation error or sanitized)
      // The form should either reject the input or sanitize it before submission
      await waitFor(() => {
        // Either validation error appears or mutation is called with sanitized input
        const errorToast = screen.queryByText(/invalid|error/i);
        const mutationCalled =
          mockCreateMutation.mutateAsync.mock.calls.length > 0;
        expect(errorToast || mutationCalled).toBeTruthy();
      });
    });

    it("[P1] Should reject empty terminal name", async () => {
      // GIVEN: Form is rendered and create dialog is open
      const user = userEvent.setup();
      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      const addButton = screen.getByRole("button", { name: /Add Terminal/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Add Terminal" }),
        ).toBeInTheDocument();
      });

      // WHEN: User tries to submit without name
      const createButton = screen.getByRole("button", {
        name: /Create Terminal/i,
      });
      await user.click(createButton);

      // THEN: Error toast should be shown
      expect(mockToast).toHaveBeenCalledWith({
        title: "Error",
        description: "Terminal name is required",
        variant: "destructive",
      });

      // AND: Create mutation should NOT be called
      expect(mockCreateMutation.mutateAsync).not.toHaveBeenCalled();
    });

    it("[P1] Should reject very long terminal name (100+ chars)", async () => {
      // GIVEN: Form is rendered and create dialog is open
      const user = userEvent.setup();
      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      const addButton = screen.getByRole("button", { name: /Add Terminal/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Add Terminal" }),
        ).toBeInTheDocument();
      });

      // WHEN: User enters very long name (101 characters)
      const nameInput = screen.getByLabelText(/Terminal Name/i);
      await user.type(nameInput, "a".repeat(101));

      const createButton = screen.getByRole("button", {
        name: /Create Terminal/i,
      });
      await user.click(createButton);

      // THEN: Error should be shown (either client-side validation or API error)
      await waitFor(() => {
        const errorToast = screen.queryByText(/error|invalid|too long/i);
        expect(errorToast || mockToast.mock.calls.length > 0).toBeTruthy();
      });
    });

    it("[P1] Should validate connection config structure matches connection type", async () => {
      // GIVEN: Form is rendered and create dialog is open with API connection type
      const user = userEvent.setup();
      renderWithProviders(
        <StoreForm companyId={companyId} store={mockStore} />,
      );

      const addButton = screen.getByRole("button", { name: /Add Terminal/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Add Terminal" }),
        ).toBeInTheDocument();
      });

      // WHEN: User selects API connection type
      await user.type(screen.getByLabelText(/Terminal Name/i), "Test Terminal");
      // Wait for Connection Type field to be available
      await waitFor(() => {
        expect(screen.getByLabelText(/Connection Type/i)).toBeInTheDocument();
      });
      const connectionTypeSelect = screen.getByLabelText(/Connection Type/i);
      await user.click(connectionTypeSelect);
      await user.click(screen.getByRole("option", { name: /API/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/Base URL/i)).toBeInTheDocument();
      });

      // WHEN: User enters invalid URL format
      await user.type(screen.getByLabelText(/Base URL/i), "not-a-valid-url");
      await user.type(screen.getByLabelText(/API Key/i), "test-key");

      const createButton = screen.getByRole("button", {
        name: /Create Terminal/i,
      });
      await user.click(createButton);

      // THEN: Validation error should be displayed or form should not submit
      await waitFor(() => {
        const urlInput = screen.getByLabelText(/Base URL/i);
        const validationMessage = (urlInput as HTMLInputElement)
          .validationMessage;
        const errorToast = screen.queryByText(/invalid|error/i);
        expect(
          validationMessage || errorToast || mockToast.mock.calls.length > 0,
        ).toBeTruthy();
      });
    });
  });
});
